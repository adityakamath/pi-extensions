import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";
import { logAudit } from "./audit-log.js";
import { checkRateLimit } from "./rate-limit.js";
import { checkMaxMsgSize, MAX_MSG_BYTES } from "./max-size.js";
import {
  CONTROL_DIR,
  DAEMON_SOCK,
  DAEMON_PID_FILE,
  NAMES_DIR,
  SOCKET_SUFFIX,
  loadConfig,
  saveConfig,
  parsePeerAddress,
  generateWhimsicalName,
  setSessionName,
  removeSessionName,
  getSessionName,
  ensureControlDir,
  isSafeSessionId
} from "./shared.js";
function log(msg) {
  console.log(`[daemon] ${(/* @__PURE__ */ new Date()).toISOString()} ${msg}`);
}
function logError(msg, err) {
  const detail = err instanceof Error ? err.message : err != null ? String(err) : "";
  console.error(`[daemon] ${(/* @__PURE__ */ new Date()).toISOString()} ERROR ${msg}${detail ? ": " + detail : ""}`);
}
const localSessions = /* @__PURE__ */ new Map();
const remotePeers = /* @__PURE__ */ new Map();
const subscribers = /* @__PURE__ */ new Set();
const pendingRelays = /* @__PURE__ */ new Map();
let config;
let startTime = Date.now();
let autoShutdownTimer = null;
let heartbeatTimer = null;
let tcpServer = null;
let daemonServer = null;
let fsWatcher = null;
function resetAutoShutdown() {
  if (autoShutdownTimer)
    clearTimeout(autoShutdownTimer);
  const timeoutMs = config.autoShutdownTimeout * 1e3;
  if (timeoutMs <= 0)
    return;
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
function cleanup() {
  log("Cleaning up...");
  if (heartbeatTimer)
    clearInterval(heartbeatTimer);
  if (autoShutdownTimer)
    clearTimeout(autoShutdownTimer);
  if (fsWatcher) {
    try {
      fsWatcher.close();
    } catch {
    }
  }
  for (const peer of remotePeers.values()) {
    if (peer.reconnectTimer)
      clearTimeout(peer.reconnectTimer);
    if (peer.socket) {
      try {
        peer.socket.destroy();
      } catch {
      }
    }
  }
  for (const sub of subscribers) {
    try {
      sub.destroy();
    } catch {
    }
  }
  if (daemonServer) {
    try {
      daemonServer.close();
    } catch {
    }
  }
  if (tcpServer) {
    try {
      tcpServer.close();
    } catch {
    }
  }
  try {
    fs.unlinkSync(DAEMON_SOCK);
  } catch {
  }
  try {
    fs.unlinkSync(DAEMON_PID_FILE);
  } catch {
  }
  log("Cleanup complete.");
}
function pushEvent(event) {
  const line = JSON.stringify(event) + "\n";
  for (const sub of subscribers) {
    try {
      sub.write(line);
    } catch {
      subscribers.delete(sub);
    }
  }
}
function getSessionAliases(sessionId) {
  const aliases = [];
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
        } catch {
        }
      }
    }
  } catch {
  }
  return aliases;
}
function localSessionToInfo(entry) {
  return {
    sessionId: entry.sessionId,
    name: entry.name,
    aliases: entry.aliases
  };
}
async function verifySocketAlive(socketPath, timeoutMs = 300) {
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
async function addLocalSession(sockFile) {
  const base = path.basename(sockFile, SOCKET_SUFFIX);
  const sessionId = base;
  if (!isSafeSessionId(sessionId))
    return;
  if (localSessions.has(sessionId))
    return;
  const socketPath = path.join(CONTROL_DIR, sockFile);
  const alive = await verifySocketAlive(socketPath);
  if (!alive) {
    log(`Session ${sessionId} socket not alive, skipping.`);
    return;
  }
  let name = getSessionName(sessionId);
  if (!name) {
    name = generateWhimsicalName();
    setSessionName(sessionId, name);
  }
  const aliases = getSessionAliases(sessionId);
  const entry = { sessionId, name, aliases, socketPath };
  localSessions.set(sessionId, entry);
  log(`Local session added: ${sessionId} (${name})`);
  const info = localSessionToInfo(entry);
  broadcastToPeers({ type: "session_added", session: info });
  pushEvent({ type: "event", event: "session_added", data: { ...info, host: os.hostname(), isRemote: false } });
  resetAutoShutdown();
}
function removeLocalSession(sessionId) {
  const entry = localSessions.get(sessionId);
  if (!entry)
    return;
  localSessions.delete(sessionId);
  removeSessionName(sessionId);
  log(`Local session removed: ${sessionId}`);
  broadcastToPeers({ type: "session_removed", sessionId });
  pushEvent({ type: "event", event: "session_removed", data: { sessionId, host: os.hostname(), isRemote: false } });
  resetAutoShutdown();
}
async function scanLocalSessions() {
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
function startFsWatch() {
  try {
    fsWatcher = fs.watch(CONTROL_DIR, async (eventType, filename) => {
      if (!filename)
        return;
      if (!filename.endsWith(SOCKET_SUFFIX))
        return;
      if (filename === path.basename(DAEMON_SOCK))
        return;
      const sockFile = filename;
      const socketPath = path.join(CONTROL_DIR, sockFile);
      const sessionId = path.basename(sockFile, SOCKET_SUFFIX);
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
function broadcastToPeers(msg) {
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
function buildOurHello() {
  const sessions = [...localSessions.values()].map(localSessionToInfo);
  return {
    type: "hello",
    host: os.hostname(),
    port: config.port,
    sessions
  };
}
function handlePeerMessage(peer, msg) {
  peer.lastSeen = Date.now();
  resetAutoShutdown();
  switch (msg.type) {
    case "hello": {
      peer.sessions.clear();
      for (const session of msg.sessions) {
        peer.sessions.set(session.sessionId, session);
      }
      log(`Peer ${peer.host} hello with ${msg.sessions.length} sessions.`);
      if (peer._lastStatus !== "connected" && peer.gaveUp !== true) {
        pushEvent({
          type: "event",
          event: "peer_connected",
          data: { host: peer.host, sessionCount: msg.sessions.length }
        });
        peer._lastStatus = "connected";
      }
      break;
    }
    case "heartbeat": {
      break;
    }
    case "session_added": {
      peer.sessions.set(msg.session.sessionId, msg.session);
      log(`Remote session added: ${msg.session.sessionId} from ${peer.host}`);
      pushEvent({
        type: "event",
        event: "session_added",
        data: { ...msg.session, host: peer.host, isRemote: true }
      });
      break;
    }
    case "session_removed": {
      peer.sessions.delete(msg.sessionId);
      log(`Remote session removed: ${msg.sessionId} from ${peer.host}`);
      pushEvent({
        type: "event",
        event: "session_removed",
        data: { sessionId: msg.sessionId, host: peer.host, isRemote: true }
      });
      break;
    }
    case "rpc": {
      const localEntry = localSessions.get(msg.targetSessionId);
      if (!localEntry) {
        const resp = {
          type: "rpc_response",
          requestId: msg.requestId,
          response: {
            type: "response",
            command: msg.command.type,
            success: false,
            error: `Session ${msg.targetSessionId} not found locally`
          }
        };
        if (peer.socket) {
          try {
            peer.socket.write(JSON.stringify(resp) + "\n");
          } catch {
          }
        }
        return;
      }
      const timeout = getRelayTimeout(msg.command);
      relayToLocalSocket(localEntry.socketPath, msg.command, timeout).then((response) => {
        const resp = {
          type: "rpc_response",
          requestId: msg.requestId,
          response
        };
        if (peer.socket) {
          try {
            peer.socket.write(JSON.stringify(resp) + "\n");
          } catch {
          }
        }
      }).catch((err) => {
        const resp = {
          type: "rpc_response",
          requestId: msg.requestId,
          response: {
            type: "response",
            command: msg.command.type,
            success: false,
            error: String(err)
          }
        };
        if (peer.socket) {
          try {
            peer.socket.write(JSON.stringify(resp) + "\n");
          } catch {
          }
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
function setupPeerSocket(peer, socket) {
  peer.socket = socket;
  peer.connected = false;
  let buffer = "";
  socket.setKeepAlive(true, 1e4);
  socket.setEncoding("utf8");
  let lastStatus = null;
  socket.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed)
        continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === "hello" && !peer.connected) {
          peer.connected = true;
          peer.reconnectAttempts = 0;
          if (lastStatus !== "connected") {
            handlePeerMessage(peer, msg);
            lastStatus = "connected";
          }
          continue;
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
    for (const session of peer.sessions.values()) {
      pushEvent({
        type: "event",
        event: "session_removed",
        data: { sessionId: session.sessionId, host: peer.host, isRemote: true }
      });
    }
    if (wasConnected && peer.gaveUp !== true && (!peer._lastStatus || peer._lastStatus !== "disconnected")) {
      pushEvent({ type: "event", event: "peer_disconnected", data: { host: peer.host } });
      peer._lastStatus = "disconnected";
    }
    peer.gaveUp = true;
    log(`Peer ${peer.host} disconnected. No automatic reconnect. Ask user to reconnect manually if needed.`);
    pushEvent({ type: "event", event: "peer_gave_up", data: { host: peer.host } });
    if (peer.removed) {
      remotePeers.delete(peer.host);
    }
    resetAutoShutdown();
  });
}
function scheduleReconnect(peer) {
  if (peer.removed || peer.gaveUp)
    return;
  if (peer.reconnectAttempts >= 1) {
    peer.gaveUp = true;
    log(`Peer ${peer.host} reconnect failed. Giving up.`);
    peer._lastStatus = "gaveUp";
    pushEvent({ type: "event", event: "peer_gave_up", data: { host: peer.host } });
    return;
  }
  peer.reconnectAttempts++;
  log(`Reconnecting to ${peer.host}:${peer.port} (attempt ${peer.reconnectAttempts}).`);
  peer.reconnectTimer = setTimeout(() => {
    peer.reconnectTimer = null;
    if (!peer.removed && !peer.gaveUp) {
      connectToPeer(peer.host, peer.port, peer);
    }
  }, 3e3);
}
function connectToPeer(host, port, existingPeer) {
  let peer = existingPeer ?? remotePeers.get(host);
  if (!peer) {
    peer = {
      host,
      port,
      socket: null,
      sessions: /* @__PURE__ */ new Map(),
      lastSeen: Date.now(),
      connected: false,
      reconnectTimer: null,
      reconnectAttempts: 0,
      removed: false,
      gaveUp: false
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
  });
  setupPeerSocket(peer, socket);
  return peer;
}
function startHeartbeat() {
  const intervalMs = config.heartbeatInterval * 1e3;
  const deadThreshold = intervalMs * 3;
  heartbeatTimer = setInterval(() => {
    const heartbeatMsg = JSON.stringify({ type: "heartbeat" }) + "\n";
    const now = Date.now();
    for (const peer of remotePeers.values()) {
      if (!peer.connected || !peer.socket)
        continue;
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
function getRelayTimeout(command) {
  switch (command.type) {
    case "get_message":
    case "clear":
      return 15e3;
    case "get_summary":
      return 6e4;
    case "send":
      return 3e5;
    default:
      return 1e4;
  }
}
async function relayToLocalSocket(socketPath, rpcCommand, timeoutMs) {
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
    sock.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
          continue;
        if (!done) {
          done = true;
          clearTimeout(timer);
          sock.destroy();
          try {
            resolve(JSON.parse(trimmed));
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
function sendDaemonResponse(socket, cmd, success, data, error) {
  const resp = { type: "response", command: cmd, success, data, error };
  try {
    socket.write(JSON.stringify(resp) + "\n");
  } catch {
  }
}
async function handleDaemonCommand(socket, req) {
  resetAutoShutdown();
  switch (req.type) {
    case "status": {
      const peers = [...remotePeers.values()].map((p) => ({
        host: p.host,
        port: p.port,
        connected: p.connected,
        sessionCount: p.sessions.size
      }));
      sendDaemonResponse(socket, "status", true, {
        pid: process.pid,
        uptime: Math.floor((Date.now() - startTime) / 1e3),
        port: config.port,
        localSessionCount: localSessions.size,
        remotePeerCount: [...remotePeers.values()].filter((p) => p.connected).length,
        peers
      });
      break;
    }
    case "add_peer": {
      const { host, port: reqPort } = req;
      const resolved = parsePeerAddress(host);
      const finalHost = resolved.host;
      const finalPort = reqPort ?? resolved.port;
      const existing = remotePeers.get(finalHost);
      if (existing?.connected) {
        sendDaemonResponse(socket, "add_peer", false, void 0, `Already connected to ${finalHost}`);
        return;
      }
      try {
        await new Promise((resolve, reject) => {
          const peer = connectToPeer(finalHost, finalPort, existing ?? void 0);
          const timeout = setTimeout(() => {
            clearInterval(poll);
            reject(new Error("Connection timeout"));
          }, 1e4);
          const poll = setInterval(() => {
            if (peer.connected) {
              clearInterval(poll);
              clearTimeout(timeout);
              resolve();
            }
          }, 200);
          peer.socket?.once("error", (err) => {
            clearInterval(poll);
            clearTimeout(timeout);
            reject(err);
          });
        });
        const peerStr = finalPort === config.port ? finalHost : `${finalHost}:${finalPort}`;
        if (!config.peers.includes(peerStr)) {
          config.peers.push(peerStr);
          saveConfig(config);
        }
        sendDaemonResponse(socket, "add_peer", true, { host: finalHost, port: finalPort });
      } catch (err) {
        sendDaemonResponse(
          socket,
          "add_peer",
          false,
          void 0,
          err instanceof Error ? err.message : String(err)
        );
      }
      break;
    }
    case "remove_peer": {
      const { host } = req;
      const resolved = parsePeerAddress(host);
      const peer = remotePeers.get(resolved.host);
      if (!peer) {
        sendDaemonResponse(socket, "remove_peer", false, void 0, `Peer ${resolved.host} not found`);
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
      for (const session of peer.sessions.values()) {
        pushEvent({
          type: "event",
          event: "session_removed",
          data: { sessionId: session.sessionId, host: peer.host, isRemote: true }
        });
      }
      remotePeers.delete(resolved.host);
      config.peers = config.peers.filter((p) => {
        const parsed = parsePeerAddress(p);
        return parsed.host !== resolved.host;
      });
      saveConfig(config);
      sendDaemonResponse(socket, "remove_peer", true, { host: resolved.host });
      break;
    }
    case "list_sessions": {
      const sessions = [];
      for (const entry of localSessions.values()) {
        sessions.push({
          ...localSessionToInfo(entry),
          host: os.hostname(),
          isRemote: false
        });
      }
      for (const peer of remotePeers.values()) {
        if (!peer.connected)
          continue;
        for (const session of peer.sessions.values()) {
          sessions.push({
            ...session,
            host: peer.host,
            isRemote: true
          });
        }
      }
      sendDaemonResponse(socket, "list_sessions", true, { sessions });
      break;
    }
    case "list_tailscale": {
      exec("tailscale status --json", (error, stdout, stderr) => {
        if (error) {
          const msg = error.message.includes("not found") || error.message.includes("ENOENT") ? "tailscale not found" : `tailscale error: ${stderr || error.message}`;
          sendDaemonResponse(socket, "list_tailscale", false, void 0, msg);
          return;
        }
        try {
          const data = JSON.parse(stdout);
          const peers = Object.values(data.Peer ?? {}).filter((p) => p.HostName && p.HostName !== "funnel-ingress-node").map((p) => ({
            hostname: (p.DNSName ?? "").replace(/\.$/, "").split(".")[0],
            ip: p.TailscaleIPs?.[0] ?? ""
          }));
          sendDaemonResponse(socket, "list_tailscale", true, { peers });
        } catch (err) {
          sendDaemonResponse(socket, "list_tailscale", false, void 0, `Failed to parse tailscale output: ${err}`);
        }
      });
      break;
    }
    case "relay": {
      const ratePeer = socket.remoteAddress || "local";
      if (!checkRateLimit(ratePeer)) {
        sendDaemonResponse(socket, "relay", false, void 0, "Rate limit exceeded");
        logAudit({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          peer: ratePeer,
          action: "relay",
          result: "fail",
          error: "Rate limit exceeded"
        });
        return;
      }
      const { targetSessionId, rpcCommand, requestId } = req;
      const fireAndForget = req.fireAndForget === true;
      const localEntry = localSessions.get(targetSessionId);
      if (localEntry) {
        if (fireAndForget) {
          sendDaemonResponse(socket, "relay", true, { requestId, queued: true });
          const timeout2 = getRelayTimeout(rpcCommand);
          relayToLocalSocket(localEntry.socketPath, rpcCommand, timeout2).catch((err) => {
            log(`Fire-and-forget local relay failed for ${targetSessionId}: ${err}`);
          });
        } else {
          const timeout2 = getRelayTimeout(rpcCommand);
          try {
            const response = await relayToLocalSocket(localEntry.socketPath, rpcCommand, timeout2);
            sendDaemonResponse(socket, "relay", true, { requestId, response });
          } catch (err) {
            sendDaemonResponse(socket, "relay", false, void 0, String(err));
          }
        }
        return;
      }
      let targetPeer = null;
      let sessionFoundButDisconnected = false;
      for (const peer of remotePeers.values()) {
        if (peer.sessions.has(targetSessionId)) {
          if (peer.connected) {
            targetPeer = peer;
          } else {
            sessionFoundButDisconnected = true;
          }
          break;
        }
      }
      if (!targetPeer || !targetPeer.socket) {
        const error = sessionFoundButDisconnected ? `Session ${targetSessionId} is on a disconnected peer` : `Session ${targetSessionId} not found`;
        sendDaemonResponse(socket, "relay", false, void 0, error);
        return;
      }
      const peerRpc = {
        type: "rpc",
        targetSessionId,
        requestId,
        command: rpcCommand
      };
      if (fireAndForget) {
        try {
          targetPeer.socket.write(JSON.stringify(peerRpc) + "\n");
          sendDaemonResponse(socket, "relay", true, { requestId, queued: true });
        } catch (err) {
          sendDaemonResponse(socket, "relay", false, void 0, String(err));
          logAudit({
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            peer: socket.remoteAddress || "local",
            action: `${rpcCommand?.type || "relay"}`,
            data: JSON.stringify({ targetSessionId }),
            result: "fail",
            error: String(err)
          });
        }
        return;
      }
      const timeout = getRelayTimeout(rpcCommand);
      const responsePromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRelays.delete(requestId);
          reject(new Error(`Relay timeout after ${timeout}ms`));
        }, timeout);
        pendingRelays.set(requestId, { resolve, timer });
      });
      try {
        targetPeer.socket.write(JSON.stringify(peerRpc) + "\n");
        const response = await responsePromise;
        sendDaemonResponse(socket, "relay", true, { requestId, response });
        logAudit({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          peer: socket.remoteAddress || "local",
          action: `${rpcCommand?.type || "relay"}`,
          data: JSON.stringify({ targetSessionId }),
          result: response?.success ? "ok" : "fail",
          error: response?.success ? void 0 : response?.error || void 0
        });
      } catch (err) {
        sendDaemonResponse(socket, "relay", false, void 0, String(err));
        logAudit({
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          peer: socket.remoteAddress || "local",
          action: `${rpcCommand?.type || "relay"}`,
          data: JSON.stringify({ targetSessionId }),
          result: "fail",
          error: String(err)
        });
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
      sendDaemonResponse(socket, "subscribe", true, { subscribed: true });
      break;
    }
    case "/start-daemon": {
      sendDaemonResponse(socket, "/start-daemon", true, { message: "Daemon already running" });
      break;
    }
    case "/kill-daemon": {
      sendDaemonResponse(socket, "/kill-daemon", true, { message: "Shutting down" });
      log("Kill command received. Shutting down.");
      setImmediate(() => {
        cleanup();
        process.exit(0);
      });
      break;
    }
    default: {
      sendDaemonResponse(socket, req.type, false, void 0, "Unknown command");
    }
  }
}
function startDaemonServer() {
  try {
    fs.unlinkSync(DAEMON_SOCK);
  } catch {
  }
  daemonServer = net.createServer((socket) => {
    log("Local client connected to daemon.sock");
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      if (!checkMaxMsgSize(chunk)) {
        try {
          socket.write(JSON.stringify({ type: "error", error: `Message size exceeds ${MAX_MSG_BYTES} bytes` }) + "\n");
        } catch {
        }
        socket.destroy();
        return;
      }
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
          continue;
        if (!checkMaxMsgSize(trimmed)) {
          try {
            socket.write(JSON.stringify({ type: "error", error: `Message size exceeds ${MAX_MSG_BYTES} bytes` }) + "\n");
          } catch {
          }
          socket.destroy();
          return;
        }
        try {
          const req = JSON.parse(trimmed);
          handleDaemonCommand(socket, req).catch((err) => {
            logError("Error handling daemon command", err);
            sendDaemonResponse(socket, req.type ?? "unknown", false, void 0, String(err));
          });
        } catch (err) {
          logError("Failed to parse daemon command", err);
          sendDaemonResponse(socket, "unknown", false, void 0, "Invalid JSON");
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
    try {
      fs.chmodSync(DAEMON_SOCK, 384);
    } catch (e) {
      logError("Failed to chmod daemon.sock", e);
    }
  });
}
function startTcpServer() {
  tcpServer = net.createServer((socket) => {
    let remoteHost = socket.remoteAddress ?? "unknown";
    log(`Incoming TCP connection from ${remoteHost}`);
    let buffer = "";
    let helloDone = false;
    let peer = null;
    socket.setEncoding("utf8");
    socket.setKeepAlive(true, 1e4);
    socket.on("data", (chunk) => {
      if (!checkMaxMsgSize(chunk)) {
        try {
          socket.write(JSON.stringify({ type: "error", error: `Message size exceeds ${MAX_MSG_BYTES} bytes` }) + "\n");
        } catch {
        }
        socket.destroy();
        return;
      }
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
          continue;
        if (!checkMaxMsgSize(trimmed)) {
          try {
            socket.write(JSON.stringify({ type: "error", error: `Message size exceeds ${MAX_MSG_BYTES} bytes` }) + "\n");
          } catch {
          }
          socket.destroy();
          return;
        }
        try {
          const msg = JSON.parse(trimmed);
          if (!helloDone) {
            if (msg.type !== "hello") {
              log(`Expected hello from ${remoteHost}, got ${msg.type}. Closing.`);
              socket.destroy();
              return;
            }
            remoteHost = msg.host;
            helloDone = true;
            const existingPeer = remotePeers.get(remoteHost);
            if (existingPeer?.socket && existingPeer.socket !== socket) {
              log(`Duplicate connection from ${remoteHost}. Replacing old.`);
              existingPeer.removed = true;
              existingPeer.socket.destroy();
            }
            peer = {
              host: remoteHost,
              port: msg.port,
              socket,
              sessions: /* @__PURE__ */ new Map(),
              lastSeen: Date.now(),
              connected: true,
              reconnectTimer: null,
              reconnectAttempts: 0,
              removed: false,
              gaveUp: false
            };
            remotePeers.set(remoteHost, peer);
            handlePeerMessage(peer, msg);
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
            data: { sessionId: session.sessionId, host: peer.host, isRemote: true }
          });
        }
        pushEvent({ type: "event", event: "peer_disconnected", data: { host: peer.host } });
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
async function main() {
  log(`Starting daemon (PID ${process.pid})...`);
  const { config: loadedConfig, error: configError } = loadConfig();
  config = loadedConfig;
  if (configError) {
    logError("Config warning", configError);
  }
  ensureControlDir();
  fs.mkdirSync(NAMES_DIR, { recursive: true });
  fs.writeFileSync(DAEMON_PID_FILE, String(process.pid), "utf8");
  log(`PID file written: ${DAEMON_PID_FILE}`);
  startDaemonServer();
  startTcpServer();
  startFsWatch();
  await scanLocalSessions();
  for (const peerStr of config.peers) {
    const { host, port } = parsePeerAddress(peerStr);
    connectToPeer(host, port);
  }
  startHeartbeat();
  resetAutoShutdown();
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
const isMain = process.argv[1] != null && (process.argv[1].endsWith("daemon.ts") || process.argv[1].endsWith("daemon.js") || import.meta.url.endsWith(process.argv[1].replace(/^.*[/\\]/, "")));
if (isMain) {
  main().catch((err) => {
    logError("Fatal startup error", err);
    process.exit(1);
  });
}
export {
  remotePeers
};
