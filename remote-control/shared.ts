import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

// ─── Constants ────────────────────────────────────────────────────────────────

export const CONTROL_DIR = path.join(os.homedir(), ".pi", "remote-control");
export const DAEMON_SOCK = path.join(CONTROL_DIR, "daemon.sock");
export const DAEMON_PID_FILE = path.join(CONTROL_DIR, "daemon.pid");
export const CONFIG_FILE = path.join(CONTROL_DIR, "config.json");
export const NAMES_DIR = path.join(CONTROL_DIR, "names");
export const SOCKET_SUFFIX = ".sock";
export const DEFAULT_PORT = 7433;
export const DEFAULT_AUTO_SHUTDOWN_TIMEOUT = 300;
export const DEFAULT_HEARTBEAT_INTERVAL = 15;

// ─── RemoteConfig ─────────────────────────────────────────────────────────────

export interface RemoteConfig {
  port: number;
  peers: string[];
  autoShutdownTimeout: number;
  heartbeatInterval: number;
}

const DEFAULT_CONFIG: RemoteConfig = {
  port: DEFAULT_PORT,
  peers: [],
  autoShutdownTimeout: DEFAULT_AUTO_SHUTDOWN_TIMEOUT,
  heartbeatInterval: DEFAULT_HEARTBEAT_INTERVAL,
};

export function loadConfig(): { config: RemoteConfig; error?: string } {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { config: { ...DEFAULT_CONFIG } };
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      config: {
        port: typeof parsed.port === "number" && parsed.port > 0 ? parsed.port : DEFAULT_CONFIG.port,
        peers: Array.isArray(parsed.peers) ? parsed.peers.filter((p: unknown) => typeof p === "string") : DEFAULT_CONFIG.peers,
        autoShutdownTimeout: typeof parsed.autoShutdownTimeout === "number" ? parsed.autoShutdownTimeout : DEFAULT_CONFIG.autoShutdownTimeout,
        heartbeatInterval: typeof parsed.heartbeatInterval === "number" ? parsed.heartbeatInterval : DEFAULT_CONFIG.heartbeatInterval,
      },
    };
  } catch (err) {
    return { config: { ...DEFAULT_CONFIG }, error: `Config parse error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function saveConfig(config: RemoteConfig): { success: boolean; error?: string } {
  try {
    ensureControlDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function parsePeerAddress(peer: string): { host: string; port: number } {
  const lastColon = peer.lastIndexOf(":");
  if (lastColon !== -1) {
    const potentialPort = peer.slice(lastColon + 1);
    const portNum = parseInt(potentialPort, 10);
    if (!isNaN(portNum) && String(portNum) === potentialPort) {
      return { host: peer.slice(0, lastColon), port: portNum };
    }
  }
  return { host: peer, port: DEFAULT_PORT };
}

// ─── Daemon Control Protocol ──────────────────────────────────────────────────
// Messages sent over daemon.sock (Unix socket)

export interface DaemonStatusRequest {
  type: "status";
}

export interface DaemonAddPeerRequest {
  type: "add_peer";
  host: string;
  port?: number;
}

export interface DaemonRemovePeerRequest {
  type: "remove_peer";
  host: string;
  port?: number;
}

export interface DaemonListSessionsRequest {
  type: "list_sessions";
}

export interface DaemonListTailscaleRequest {
  type: "list_tailscale";
}

export interface DaemonRelayRequest {
  type: "relay";
  targetSessionId: string;
  rpcCommand: RpcCommand;
  requestId: string;
  fireAndForget?: boolean;
}

export interface DaemonSubscribeRequest {
  type: "subscribe";
}

export interface DaemonKillRequest {
  type: "kill";
}

export type DaemonRequest =
  | DaemonStatusRequest
  | DaemonAddPeerRequest
  | DaemonRemovePeerRequest
  | DaemonListSessionsRequest
  | DaemonListTailscaleRequest
  | DaemonRelayRequest
  | DaemonSubscribeRequest
  | DaemonKillRequest;

export interface DaemonResponse {
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface DaemonEvent {
  type: "event";
  event:
    | "session_added"
    | "session_removed"
    | "peer_connected"
    | "peer_disconnected"
    | "error";
  data?: unknown;
}

// ─── Peer TCP Protocol ────────────────────────────────────────────────────────
// Messages exchanged between daemons over TCP

export interface SessionInfo {
  sessionId: string;
  name: string;
  aliases: string[];
}

export interface PeerHello {
  type: "hello";
  host: string;
  port: number;
  sessions: SessionInfo[];
}

export interface PeerHeartbeat {
  type: "heartbeat";
}

export interface PeerSessionAdded {
  type: "session_added";
  session: SessionInfo;
}

export interface PeerSessionRemoved {
  type: "session_removed";
  sessionId: string;
}

export interface PeerRpc {
  type: "rpc";
  targetSessionId: string;
  requestId: string;
  command: RpcCommand;
}

export interface PeerRpcResponse {
  type: "rpc_response";
  requestId: string;
  response: RpcResponse;
}

export type PeerMessage =
  | PeerHello
  | PeerHeartbeat
  | PeerSessionAdded
  | PeerSessionRemoved
  | PeerRpc
  | PeerRpcResponse;

// ─── RPC Command Types ────────────────────────────────────────────────────────
// Commands relayed to session Unix sockets

export interface RpcSendCommand {
  type: "send";
  message: string;
  mode?: "steer" | "follow_up";
}

export interface RpcGetMessageCommand {
  type: "get_message";
}

export interface RpcGetSummaryCommand {
  type: "get_summary";
}

export interface RpcClearCommand {
  type: "clear";
  summarize?: boolean;
}

export interface RpcAbortCommand {
  type: "abort";
}

export type RpcCommand =
  | RpcSendCommand
  | RpcGetMessageCommand
  | RpcGetSummaryCommand
  | RpcClearCommand
  | RpcAbortCommand;

export interface RpcResponse {
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Whimsical Name Generation ────────────────────────────────────────────────

const ADJECTIVES: string[] = [
  "amber", "arctic", "azure", "blazing", "bold", "bright", "calm", "cedar",
  "cloud", "cobalt", "coral", "cosmic", "crimson", "crystal", "dawn", "deep",
  "desert", "dusk", "echo", "ember", "fern", "fire", "fleet", "foggy",
  "forest", "frost", "gentle", "glacier", "golden", "granite", "harbor",
  "haze", "hollow", "icy", "iron", "ivory", "jade", "keen", "lake", "lava",
  "leaf", "light", "lunar", "maple", "meadow", "misty", "mossy", "neon",
  "nimble", "noble", "oak", "ocean", "olive", "opal", "pale", "peak", "pine",
  "plain", "polar", "prism", "quiet", "rain", "rapid", "reef", "river",
  "rocky", "rose", "rustic", "sage", "sand", "shadow", "silent", "silver",
  "slate", "solar", "spark", "steel", "stone", "storm", "stream", "sun",
  "swift", "thorn", "thunder", "tidal", "timber", "topaz", "trail",
  "twilight", "vast", "velvet", "vivid", "warm", "wave", "wild", "willow",
  "wind", "winter", "zen",
];

const NOUNS: string[] = [
  "badger", "bear", "bird", "bison", "breeze", "brook", "canyon", "cave",
  "cliff", "cloud", "comet", "condor", "crane", "creek", "crow", "dawn",
  "deer", "dolphin", "dove", "dragon", "drift", "eagle", "elk", "ember",
  "falcon", "finch", "flame", "flare", "fox", "frost", "gale", "grove",
  "harbor", "hare", "hawk", "heron", "hill", "horizon", "isle", "jaguar",
  "jay", "lake", "lark", "leopard", "lion", "lynx", "marsh", "mesa", "moon",
  "moth", "nebula", "newt", "oak", "orbit", "osprey", "otter", "owl", "ox",
  "panther", "path", "peak", "pebble", "penguin", "phoenix", "pine", "plover",
  "pond", "puma", "quail", "rain", "raven", "reef", "ridge", "robin", "sage",
  "seal", "shade", "shore", "sparrow", "spirit", "star", "stone", "stork",
  "summit", "swan", "swift", "tiger", "trail", "vale", "viper", "wave",
  "whale", "wolf", "wren",
];

export function generateWhimsicalName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

// ─── Session Name Storage ─────────────────────────────────────────────────────

export function getSessionName(sessionId: string): string | null {
  if (!isSafeSessionId(sessionId)) return null;
  try {
    const filePath = path.join(NAMES_DIR, sessionId);
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}

export function setSessionName(sessionId: string, name: string): void {
  if (!isSafeSessionId(sessionId)) return;
  ensureControlDir();
  fs.mkdirSync(NAMES_DIR, { recursive: true });
  const filePath = path.join(NAMES_DIR, sessionId);
  fs.writeFileSync(filePath, name, "utf8");
}

export function removeSessionName(sessionId: string): void {
  if (!isSafeSessionId(sessionId)) return;
  try {
    const filePath = path.join(NAMES_DIR, sessionId);
    fs.unlinkSync(filePath);
  } catch {
    // ignore if not found
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function ensureControlDir(): void {
  fs.mkdirSync(CONTROL_DIR, { recursive: true });
}

export function isDaemonRunning(): boolean {
  const pid = getDaemonPid();
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getDaemonPid(): number | null {
  try {
    const raw = fs.readFileSync(DAEMON_PID_FILE, "utf8").trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function isSafeSessionId(sessionId: string): boolean {
  if (!sessionId || sessionId.length === 0) return false;
  if (sessionId.includes("/")) return false;
  if (sessionId.includes("\\")) return false;
  if (sessionId.includes("..")) return false;
  return true;
}
