import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";

import {
  CONTROL_DIR,
  DAEMON_SOCK,
  DAEMON_PID_FILE,
  NAMES_DIR,
  SOCKET_SUFFIX,
  type RemoteConfig,
  type SessionInfo,
  type DaemonRequest,
  type DaemonResponse,
  type DaemonEvent,
  type PeerMessage,
  type PeerHello,
  type RpcCommand,
  type RpcResponse,
  loadConfig,
  saveConfig,
  parsePeerAddress,
  generateWhimsicalName,
  setSessionName,
  removeSessionName,
  getSessionName,
  ensureControlDir,
  isSafeSessionId,
} from "./shared.js";

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(`[daemon] ${new Date().toISOString()} ${msg}`);
}

function logError(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : err != null ? String(err) : "";
  console.error(`[daemon] ${new Date().toISOString()} ERROR ${msg}${detail ? ": " + detail : ""}`);
}

// ─── State ────────────────────────────────────────────────────────────────────

interface LocalSessionEntry {
  sessionId: string;
  name: string;
  aliases: string[];
  socketPath: string;
}

interface PeerEntry {
  host: string;
  port: number;
  socket: net.Socket | null;
  sessions: Map<string, SessionInfo>;
  lastSeen: number;
  connected: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempts: number;
  removed: boolean; // true = do not reconnect
}

interface PendingRelay {
  resolve: (response: RpcResponse) => void;
  timer: ReturnType<typeof setTimeout>;
}

const localSessions = new Map<string, LocalSessionEntry>();
const remotePeers = new Map<string, PeerEntry>();
const subscribers = new Set<net.Socket>();
const pendingRelays = new Map<string, PendingRelay>();

let config: RemoteConfig;
let startTime = Date.now();
let autoShutdownTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let tcpServer: net.Server | null = null;
let daemonServer: net.Server | null = null;
let fsWatcher: fs.FSWatcher | null = null;

// ─── Activity / Auto-shutdown ─────────────────────────────────────────────────

function resetAutoShutdown(): void {
  if (autoShutdownTimer) clearTimeout(autoShutdownTimer);
  const timeoutMs = config.autoShutdownTimeout * 1000;
  if (timeoutMs <= 0) return; // disabled
  autoShutdownTimer = setTimeout(() => {
    const noLocal = localSessions.size === 0;
    const noPeers = remotePeers.size === 0 || [...remotePeers.values()].every((p) => !p.connected);
    if (noLocal && noPeers) {
      log("Auto-shutdown: no local sessions and no connected peers. Exiting.");
      cleanup();
      process.exit(0);
    } else {
      log("Auto-shutdown timer fired but still active. Resetting.");
      resetAutoShutdown();
    }
  }, timeoutMs);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

function cleanup(): void {
  log("Cleaning up...");
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (autoShutdownTimer) clearTimeout(autoShutdownTimer);
  if (fsWatcher) {
    try { fsWatcher.close(); } catch { /* ignore */ }
  }
  for (const peer of remotePeers.values()) {
    if (peer.reconnectTimer) clearTimeout(peer.reconnectTimer);
    if (peer.socket) {
      try { peer.socket.destroy(); } catch { /* ignore */ }
    }
  }
  for (const sub of subscribers) {
    try { sub.destroy(); } catch { /* ignore */ }
  }
  if (daemonServer) {
    try { daemonServer.close(); } catch { /* ignore */ }
  }
  if (tcpServer) {
    try { tcpServer.close(); } catch { /* ignore */ }
  }
  try { fs.unlinkSync(DAEMON_SOCK); } catch { /* ignore */ }
  try { fs.unlinkSync(DAEMON_PID_FILE); } catch { /* ignore */ }
  log("Cleanup complete.");
}

// ─── Push events to subscribers ───────────────────────────────────────────────

function pushEvent(event: DaemonEvent): void {
  const line = JSON.stringify(event) + "\n";
  for (const sub of subscribers) {
    try {
      sub.write(line);
    } catch {
      subscribers.delete(sub);
    }
  }
}

// ─── Session Info helpers ─────────────────────────────────────────────────────

function getSessionAliases(sessionId: string): string[] {
  const aliases: string[] = [];
  try {
    const entries = fs.readdirSync(CONTROL_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink() && entry.name.endsWith(".alias")) {
        try {
          const target = fs.readlinkSync(path.join(CONTROL_DIR, entry.name));
          const targetBase = path.basename(target, SOCKET_SUFFIX);
          if (targetBase === sessionId) {
            aliases.push(entry.name.replace(/\.alias$/, ""));
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return aliases;
}

function localSessionToInfo(entry: LocalSessionEntry): SessionInfo {
  return {
    sessionId: entry.sessionId,
    name: entry.name,
    aliases: entry.aliases,
  };
}

// ─── Local session discovery ──────────────────────────────────────────────────

async function verifySocketAlive(socketPath: string, timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeoutMs);
    const sock = net.createConnection({ path: socketPath });
    sock.once("connect", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function addLocalSession(sockFile: string): Promise<void> {
  const base = path.basename(sockFile, SOCKET_SUFFIX);
  const sessionId = base;
  if (!isSafeSessionId(sessionId)) return;
  if (localSessions.has(sessionId)) return;

  const socketPath = path.join(CONTROL_DIR, sockFile);
  const alive = await verifySocketAlive(socketPath);
  if (!alive) {
    log(`Session ${sessionId} socket not alive, skipping.`);
    return;
  }

  // Check for existing name or generate one
  let name = getSessionName(sessionId);
  if (!name) {
    name = generateWhimsicalName();
    setSessionName(sessionId, name);
  }

  const aliases = getSessionAliases(sessionId);
  const entry: LocalSessionEntry = { sessionId, name, aliases, socketPath };
  localSessions.set(sessionId, entry);
  log(`Local session added: ${sessionId} (${name})`);

  const info = localSessionToInfo(entry);
  // Broadcast to peers
  broadcastToPeers({ type: "session_added", session: info });
  // Push event to subscribers
  pushEvent({ type: "event", event: "session_added", data: { ...info, host: os.hostname(), isRemote: false } });
  resetAutoShutdown();
}

function removeLocalSession(sessionId: string): void {
  const entry = localSessions.get(sessionId);
  if (!entry) return;
  localSessions.delete(sessionId);
  removeSessionName(sessionId);
  log(`Local session removed: ${sessionId}`);

  broadcastToPeers({ type: "session_removed", sessionId });
  pushEvent({ type: "event", event: "session_removed", data: { sessionId, host: os.hostname(), isRemote: false } });
  resetAutoShutdown();
}

async function scanLocalSessions(): Promise<void> {
  try {
    const entries = fs.readdirSync(CONTROL_DIR);
    for (const entry of entries) {
      if (entry.endsWith(SOCKET_SUFFIX) && entry !== path.basename(DAEMON_SOCK)) {
        await addLocalSession(entry);
      }
    }
  } catch (err) {
    logError("Error scanning local sessions", err);
  }
}

function startFsWatch(): void {
  try {
    fsWatcher = fs.watch(CONTROL_DIR, async (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(SOCKET_SUFFIX)) return;
      if (filename === path.basename(DAEMON_SOCK)) return;

      const sockFile = filename;
      const socketPath = path.join(CONTROL_DIR, sockFile);
      const sessionId = path.basename(sockFile, SOCKET_SUFFIX);

      // Small debounce — let filesystem settle
      await new Promise((r) => setTimeout(r, 50));

      const exists = fs.existsSync(socketPath);
      if (exists) {
        await addLocalSession(sockFile);
      } else {
        removeLocalSession(sessionId);
      }
    });
    fsWatcher.on("error", (err) => logError("fs.watch error", err));
    log(`Watching ${CONTROL_DIR} for session sockets.`);
  } catch (err) {
    logError("Failed to start fs.watch", err);
  }
}

// ─── Peer TCP communication ───────────────────────────────────────────────────

function broadcastToPeers(msg: PeerMessage): void {
  const line = JSON.stringify(msg) + "\n";
  for (const peer of remotePeers.values()) {
    if (peer.connected && peer.socket) {
      try {
        peer.socket.write(line);
      } catch (err) {
        logError(`Failed to write to peer ${peer.host}`, err);
      }
    }
  }
}

function buildOurHello(): PeerHello {
  const sessions: SessionInfo[] = [...localSessions.values()].map(localSessionToInfo);
  return {
    type: "hello",
    host: os.hostname(),
    port: config.port,
    sessions,
  };
}

function handlePeerMessage(peer: PeerEntry, msg: PeerMessage): void {
  peer.lastSeen = Date.now();
  resetAutoShutdown();

  switch (msg.type) {
    case "hello": {
      // Register their sessions
      peer.sessions.clear();
      for (const session of msg.sessions) {
        peer.sessions.set(session.sessionId, session);
      }
      log(`Peer ${peer.host} hello with ${msg.sessions.length} sessions.`);
      pushEvent({
        type: "event",
        event: "peer_connected",
        data: { host: peer.host, sessionCount: msg.sessions.length },
      });
      break;
    }

    case "heartbeat": {
      // lastSeen already updated above
      break;
    }

    case "session_added": {
      peer.sessions.set(msg.session.sessionId, msg.session);
      log(`Remote session added: ${msg.session.sessionId} from ${peer.host}`);
      pushEvent({
        type: "event",
        event: "session_added",
        data: { ...msg.session, host: peer.host, isRemote: true },
      });
      break;
    }

    case "session_removed": {
      peer.sessions.delete(msg.sessionId);
      log(`Remote session removed: ${msg.sessionId} from ${peer.host}`);
      pushEvent({
        type: "event",
        event: "session_removed",
        data: { sessionId: msg.sessionId, host: peer.host, isRemote: true },
      });
      break;
    }

    case "rpc": {
      // Relay to local socket
      const localEntry = localSessions.get(msg.targetSessionId);
      if (!localEntry) {
        const resp: PeerRpcResponse = {
          type: "rpc_response",
          requestId: msg.requestId,
          response: {
            type: "response",
            command: msg.command.type,
            success: false,
            error: `Session ${msg.targetSessionId} not found locally`,
          },
        };
        if (peer.socket) {
          try { peer.socket.write(JSON.stringify(resp) + "\n"); } catch { /* ignore */ }
        }
        return;
      }
      const timeout = getRelayTimeout(msg.command);
      relayToLocalSocket(localEntry.socketPath, msg.command, timeout)
        .then((response) => {
          const resp: PeerRpcResponse = {
            type: "rpc_response",
            requestId: msg.requestId,
            response,
          };
          if (peer.socket) {
            try { peer.socket.write(JSON.stringify(resp) + "\n"); } catch { /* ignore */ }
          }
        })
        .catch((err) => {
          const resp: PeerRpcResponse = {
            type: "rpc_response",
            requestId: msg.requestId,
            response: {
              type: "response",
              command: msg.command.type,
              success: false,
              error: String(err),
            },
          };
          if (peer.socket) {
            try { peer.socket.write(JSON.stringify(resp) + "\n"); } catch { /* ignore */ }
          }
        });
      break;
    }

    case "rpc_response": {
      const pending = pendingRelays.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingRelays.delete(msg.requestId);
        pending.resolve(msg.response);
      }
      break;
    }
  }
}

// Define PeerRpcResponse locally since it's not exported from shared.ts
interface PeerRpcResponse {
  type: "rpc_response";
  requestId: string;
  response: RpcResponse;
}

function setupPeerSocket(peer: PeerEntry, socket: net.Socket): void {
  peer.socket = socket;
  peer.connected = false; // will be true after hello exchange
  let buffer = "";

  socket.setKeepAlive(true, 10000);
  socket.setEncoding("utf8");

  socket.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as PeerMessage;
        if (msg.type === "hello" && !peer.connected) {
          peer.connected = true;
          peer.reconnectAttempts = 0;
        }
        handlePeerMessage(peer, msg);
      } catch (err) {
        logError(`Malformed message from peer ${peer.host}`, err);
      }
    }
  });

  socket.on("error", (err) => {
    logError(`Peer ${peer.host} socket error`, err);
  });

  socket.on("close", () => {
    log(`Peer ${peer.host} disconnected.`);
    const wasConnected = peer.connected;
    peer.connected = false;
    peer.socket = null;

    // Notify subscribers of lost sessions
    for (const session of peer.sessions.values()) {
      pushEvent({
        type: "event",
        event: "session_removed",
        data: { sessionId: session.sessionId, host: peer.host, isRemote: true },
      });
    }

    if (wasConnected) {
      pushEvent({ type: "event", event: "peer_disconnected", data: { host: peer.host } });
    }

    // Reconnect unless explicitly removed
    if (!peer.removed) {
      scheduleReconnect(peer);
    } else {
      remotePeers.delete(peer.host);
    }
    resetAutoShutdown();
  });
}

function scheduleReconnect(peer: PeerEntry): void {
  if (peer.removed) return;
  const delay = Math.min(1000 * Math.pow(2, peer.reconnectAttempts), 60000);
  peer.reconnectAttempts++;
  log(`Reconnecting to ${peer.host}:${peer.port} in ${delay}ms (attempt ${peer.reconnectAttempts}).`);
  peer.reconnectTimer = setTimeout(() => {
    peer.reconnectTimer = null;
    if (!peer.removed) {
      connectToPeer(peer.host, peer.port, peer);
    }
  }, delay);
}

function connectToPeer(host: string, port: number, existingPeer?: PeerEntry): PeerEntry {
  let peer = existingPeer ?? remotePeers.get(host);
  if (!peer) {
    peer = {
      host,
      port,
      socket: null,
      sessions: new Map(),
      lastSeen: Date.now(),
      connected: false,
      reconnectTimer: null,
      reconnectAttempts: 0,
      removed: false,
    };
    remotePeers.set(host, peer);
  }

  log(`Connecting to peer ${host}:${port}...`);
  const socket = net.createConnection({ host, port });

  socket.once("connect", () => {
    log(`Connected to peer ${host}:${port}. Sending hello.`);
    socket.write(JSON.stringify(buildOurHello()) + "\n");
  });

  socket.once("error", (err) => {
    logError(`Failed to connect to peer ${host}:${port}`, err);
    // close handler will schedule reconnect
  });

  setupPeerSocket(peer, socket);
  return peer;
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

function startHeartbeat(): void {
  const intervalMs = config.heartbeatInterval * 1000;
  const deadThreshold = intervalMs * 3;

  heartbeatTimer = setInterval(() => {
    const heartbeatMsg = JSON.stringify({ type: "heartbeat" } satisfies PeerMessage) + "\n";
    const now = Date.now();

    for (const peer of remotePeers.values()) {
      if (!peer.connected || !peer.socket) continue;

      // Check if peer is dead
      if (now - peer.lastSeen > deadThreshold) {
        log(`Peer ${peer.host} timed out (no message for ${deadThreshold}ms). Closing.`);
        peer.socket.destroy();
        continue;
      }

      try {
        peer.socket.write(heartbeatMsg);
      } catch (err) {
        logError(`Failed to send heartbeat to ${peer.host}`, err);
      }
    }
  }, intervalMs);
}

// ─── RPC relay helpers ────────────────────────────────────────────────────────

function getRelayTimeout(command: RpcCommand): number {
  switch (command.type) {
    case "get_message":
    case "clear":
      return 5000;
    case "get_summary":
      return 60000;
    case "send":
      return 300000;
    default:
      return 10000;
  }
}

async function relayToLocalSocket(socketPath: string, rpcCommand: RpcCommand, timeoutMs: number): Promise<RpcResponse> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let done = false;

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        sock.destroy();
        reject(new Error(`Relay timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const sock = net.createConnection({ path: socketPath });

    sock.setEncoding("utf8");

    sock.once("connect", () => {
      sock.write(JSON.stringify(rpcCommand) + "\n");
    });

    sock.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!done) {
          done = true;
          clearTimeout(timer);
          sock.destroy();
          try {
            resolve(JSON.parse(trimmed) as RpcResponse);
          } catch (err) {
            reject(new Error(`Bad JSON from local socket: ${err}`));
          }
        }
      }
    });

    sock.once("error", (err) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    sock.once("close", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error("Socket closed before response"));
      }
    });
  });
}

// ─── Daemon command server ────────────────────────────────────────────────────

function sendDaemonResponse(socket: net.Socket, cmd: string, success: boolean, data?: unknown, error?: string): void {
  const resp: DaemonResponse = { type: "response", command: cmd, success, data, error };
  try {
    socket.write(JSON.stringify(resp) + "\n");
  } catch { /* ignore */ }
}

async function handleDaemonCommand(socket: net.Socket, req: DaemonRequest): Promise<void> {
  resetAutoShutdown();

  switch (req.type) {
    case "status": {
      const peers = [...remotePeers.values()].map((p) => ({
        host: p.host,
        port: p.port,
        connected: p.connected,
        sessionCount: p.sessions.size,
      }));
      sendDaemonResponse(socket, "status", true, {
        pid: process.pid,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        port: config.port,
        localSessionCount: localSessions.size,
        remotePeerCount: [...remotePeers.values()].filter((p) => p.connected).length,
        peers,
      });
      break;
    }

    case "add_peer": {
      const { host, port: reqPort } = req;
      const resolved = parsePeerAddress(host);
      const finalHost = resolved.host;
      const finalPort = reqPort ?? resolved.port;

      // Already connected?
      const existing = remotePeers.get(finalHost);
      if (existing?.connected) {
        sendDaemonResponse(socket, "add_peer", false, undefined, `Already connected to ${finalHost}`);
        return;
      }

      // Try to connect
      try {
        await new Promise<void>((resolve, reject) => {
          const peer = connectToPeer(finalHost, finalPort, existing ?? undefined);
          const timeout = setTimeout(() => {
            clearInterval(poll);
            reject(new Error("Connection timeout"));
          }, 10000);

          // Poll every 200ms for connection success
          const poll = setInterval(() => {
            if (peer.connected) {
              clearInterval(poll);
              clearTimeout(timeout);
              resolve();
            }
          }, 200);

          // Also handle immediate socket error
          peer.socket?.once("error", (err) => {
            clearInterval(poll);
            clearTimeout(timeout);
            reject(err);
          });
        });

        // Success — save to config
        const peerStr = finalPort === config.port ? finalHost : `${finalHost}:${finalPort}`;
        if (!config.peers.includes(peerStr)) {
          config.peers.push(peerStr);
          saveConfig(config);
        }
        sendDaemonResponse(socket, "add_peer", true, { host: finalHost, port: finalPort });
      } catch (err) {
        sendDaemonResponse(socket, "add_peer", false, undefined,
          err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "remove_peer": {
      const { host } = req;
      const resolved = parsePeerAddress(host);
      const peer = remotePeers.get(resolved.host);

      if (!peer) {
        sendDaemonResponse(socket, "remove_peer", false, undefined, `Peer ${resolved.host} not found`);
        return;
      }

      peer.removed = true;
      if (peer.reconnectTimer) {
        clearTimeout(peer.reconnectTimer);
        peer.reconnectTimer = null;
      }
      if (peer.socket) {
        peer.socket.destroy();
      }

      // Remove peer's sessions
      for (const session of peer.sessions.values()) {
        pushEvent({
          type: "event",
          event: "session_removed",
          data: { sessionId: session.sessionId, host: peer.host, isRemote: true },
        });
      }

      remotePeers.delete(resolved.host);

      // Remove from config
      config.peers = config.peers.filter((p) => {
        const parsed = parsePeerAddress(p);
        return parsed.host !== resolved.host;
      });
      saveConfig(config);

      sendDaemonResponse(socket, "remove_peer", true, { host: resolved.host });
      break;
    }

    case "list_sessions": {
      const sessions: Array<SessionInfo & { host: string; isRemote: boolean }> = [];

      for (const entry of localSessions.values()) {
        sessions.push({
          ...localSessionToInfo(entry),
          host: os.hostname(),
          isRemote: false,
        });
      }

      for (const peer of remotePeers.values()) {
        for (const session of peer.sessions.values()) {
          sessions.push({
            ...session,
            host: peer.host,
            isRemote: true,
          });
        }
      }

      sendDaemonResponse(socket, "list_sessions", true, { sessions });
      break;
    }

    case "list_tailscale": {
      exec("tailscale status --json", (error, stdout, stderr) => {
        if (error) {
          const msg = error.message.includes("not found") || error.message.includes("ENOENT")
            ? "tailscale not found"
            : `tailscale error: ${stderr || error.message}`;
          sendDaemonResponse(socket, "list_tailscale", false, undefined, msg);
          return;
        }
        try {
          const data = JSON.parse(stdout) as { Peer?: Record<string, { HostName?: string; DNSName?: string; TailscaleIPs?: string[] }> };
          const peers = Object.values(data.Peer ?? {})
            .filter((p) => p.HostName && p.HostName !== "funnel-ingress-node")
            .map((p) => ({
              hostname: (p.DNSName ?? "").replace(/\.$/, "").split(".")[0],
              ip: p.TailscaleIPs?.[0] ?? "",
            }));
          sendDaemonResponse(socket, "list_tailscale", true, { peers });
        } catch (err) {
          sendDaemonResponse(socket, "list_tailscale", false, undefined, `Failed to parse tailscale output: ${err}`);
        }
      });
      break;
    }

    case "relay": {
      const { targetSessionId, rpcCommand, requestId } = req;

      // Check local sessions first
      const localEntry = localSessions.get(targetSessionId);
      if (localEntry) {
        const timeout = getRelayTimeout(rpcCommand);
        try {
          const response = await relayToLocalSocket(localEntry.socketPath, rpcCommand, timeout);
          sendDaemonResponse(socket, "relay", true, { requestId, response });
        } catch (err) {
          sendDaemonResponse(socket, "relay", false, undefined, String(err));
        }
        return;
      }

      // Check remote peers
      let targetPeer: PeerEntry | null = null;
      for (const peer of remotePeers.values()) {
        if (peer.sessions.has(targetSessionId) && peer.connected) {
          targetPeer = peer;
          break;
        }
      }

      if (!targetPeer || !targetPeer.socket) {
        sendDaemonResponse(socket, "relay", false, undefined, `Session ${targetSessionId} not found`);
        return;
      }

      const timeout = getRelayTimeout(rpcCommand);

      const responsePromise = new Promise<RpcResponse>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRelays.delete(requestId);
          reject(new Error(`Relay timeout after ${timeout}ms`));
        }, timeout);
        pendingRelays.set(requestId, { resolve, timer });
      });

      const peerRpc: PeerMessage = {
        type: "rpc",
        targetSessionId,
        requestId,
        command: rpcCommand,
      };

      try {
        targetPeer.socket.write(JSON.stringify(peerRpc) + "\n");
        const response = await responsePromise;
        sendDaemonResponse(socket, "relay", true, { requestId, response });
      } catch (err) {
        sendDaemonResponse(socket, "relay", false, undefined, String(err));
      }
      break;
    }

    case "subscribe": {
      subscribers.add(socket);
      log(`Subscriber added. Total: ${subscribers.size}`);
      socket.once("close", () => {
        subscribers.delete(socket);
        log(`Subscriber removed. Total: ${subscribers.size}`);
      });
      socket.once("error", () => {
        subscribers.delete(socket);
      });
      // Send a confirmation response, then keep connection open for events
      sendDaemonResponse(socket, "subscribe", true, { subscribed: true });
      break;
    }

    case "kill": {
      sendDaemonResponse(socket, "kill", true, { message: "Shutting down" });
      log("Kill command received. Shutting down.");
      setImmediate(() => {
        cleanup();
        process.exit(0);
      });
      break;
    }

    default: {
      sendDaemonResponse(socket, (req as { type: string }).type, false, undefined, "Unknown command");
    }
  }
}

function startDaemonServer(): void {
  // Remove stale socket
  try { fs.unlinkSync(DAEMON_SOCK); } catch { /* ignore */ }

  daemonServer = net.createServer((socket) => {
    log("Local client connected to daemon.sock");
    let buffer = "";
    socket.setEncoding("utf8");

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const req = JSON.parse(trimmed) as DaemonRequest;
          handleDaemonCommand(socket, req).catch((err) => {
            logError("Error handling daemon command", err);
            sendDaemonResponse(socket, (req as { type?: string }).type ?? "unknown", false, undefined, String(err));
          });
        } catch (err) {
          logError("Failed to parse daemon command", err);
          sendDaemonResponse(socket, "unknown", false, undefined, "Invalid JSON");
        }
      }
    });

    socket.on("error", (err) => {
      logError("Local client socket error", err);
      subscribers.delete(socket);
    });

    socket.on("close", () => {
      subscribers.delete(socket);
    });
  });

  daemonServer.on("error", (err) => {
    logError("Daemon server error", err);
  });

  daemonServer.listen(DAEMON_SOCK, () => {
    log(`Daemon control socket listening at ${DAEMON_SOCK}`);
  });
}

// ─── TCP peer server ──────────────────────────────────────────────────────────

function startTcpServer(): void {
  tcpServer = net.createServer((socket) => {
    let remoteHost = socket.remoteAddress ?? "unknown";
    log(`Incoming TCP connection from ${remoteHost}`);

    let buffer = "";
    let helloDone = false;
    let peer: PeerEntry | null = null;

    socket.setEncoding("utf8");
    socket.setKeepAlive(true, 10000);

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as PeerMessage;

          if (!helloDone) {
            if (msg.type !== "hello") {
              log(`Expected hello from ${remoteHost}, got ${msg.type}. Closing.`);
              socket.destroy();
              return;
            }

            // Register peer
            remoteHost = msg.host;
            helloDone = true;

            // Handle duplicate connection: close old one
            const existingPeer = remotePeers.get(remoteHost);
            if (existingPeer?.socket && existingPeer.socket !== socket) {
              log(`Duplicate connection from ${remoteHost}. Replacing old.`);
              existingPeer.removed = true; // prevent reconnect from old entry
              existingPeer.socket.destroy();
            }

            peer = {
              host: remoteHost,
              port: msg.port,
              socket,
              sessions: new Map(),
              lastSeen: Date.now(),
              connected: true,
              reconnectTimer: null,
              reconnectAttempts: 0,
              removed: false,
            };
            remotePeers.set(remoteHost, peer);

            // Process the hello message
            handlePeerMessage(peer, msg);

            // Send our hello back
            socket.write(JSON.stringify(buildOurHello()) + "\n");
            resetAutoShutdown();
            continue;
          }

          if (peer) {
            handlePeerMessage(peer, msg);
          }
        } catch (err) {
          logError(`Malformed TCP message from ${remoteHost}`, err);
        }
      }
    });

    socket.on("error", (err) => {
      logError(`TCP socket error from ${remoteHost}`, err);
    });

    socket.on("close", () => {
      log(`TCP connection from ${remoteHost} closed.`);
      if (peer) {
        peer.connected = false;
        peer.socket = null;

        for (const session of peer.sessions.values()) {
          pushEvent({
            type: "event",
            event: "session_removed",
            data: { sessionId: session.sessionId, host: peer.host, isRemote: true },
          });
        }

        pushEvent({ type: "event", event: "peer_disconnected", data: { host: peer.host } });

        // For inbound connections, we don't reconnect — the remote side will reconnect
        // But keep the peer entry alive in case they do reconnect
      }
      resetAutoShutdown();
    });
  });

  tcpServer.on("error", (err) => {
    logError("TCP server error", err);
  });

  tcpServer.listen(config.port, () => {
    log(`TCP peer server listening on port ${config.port}`);
  });
}

// ─── Main startup ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Starting daemon (PID ${process.pid})...`);

  // Load config
  const { config: loadedConfig, error: configError } = loadConfig();
  config = loadedConfig;
  if (configError) {
    logError("Config warning", configError);
  }

  // Ensure control dir
  ensureControlDir();
  fs.mkdirSync(NAMES_DIR, { recursive: true });

  // Write PID file
  fs.writeFileSync(DAEMON_PID_FILE, String(process.pid), "utf8");
  log(`PID file written: ${DAEMON_PID_FILE}`);

  // Start daemon control socket
  startDaemonServer();

  // Start TCP peer server
  startTcpServer();

  // Watch for local sessions
  startFsWatch();

  // Initial scan for existing sessions
  await scanLocalSessions();

  // Connect to configured peers
  for (const peerStr of config.peers) {
    const { host, port } = parsePeerAddress(peerStr);
    connectToPeer(host, port);
  }

  // Start heartbeat
  startHeartbeat();

  // Start auto-shutdown timer
  resetAutoShutdown();

  // Signal handlers
  process.on("SIGTERM", () => {
    log("SIGTERM received. Shutting down.");
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    log("SIGINT received. Shutting down.");
    cleanup();
    process.exit(0);
  });

  process.on("uncaughtException", (err) => {
    logError("Uncaught exception", err);
  });

  process.on("unhandledRejection", (reason) => {
    logError("Unhandled rejection", reason instanceof Error ? reason : String(reason));
  });

  log(`Daemon ready. Port: ${config.port}, AutoShutdown: ${config.autoShutdownTimeout}s, Heartbeat: ${config.heartbeatInterval}s`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

// Check if this is the main module (ESM-compatible via import.meta.url)
const isMain = process.argv[1] != null &&
  (process.argv[1].endsWith("daemon.ts") ||
   process.argv[1].endsWith("daemon.js") ||
   import.meta.url.endsWith(process.argv[1].replace(/^.*[/\\]/, "")));

if (isMain) {
  main().catch((err) => {
    logError("Fatal startup error", err);
    process.exit(1);
  });
}
