import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
const CONTROL_DIR = path.join(os.homedir(), ".pi", "remote-control");
const DAEMON_SOCK = path.join(CONTROL_DIR, "daemon.sock");
const DAEMON_PID_FILE = path.join(CONTROL_DIR, "daemon.pid");
const CONFIG_FILE = path.join(CONTROL_DIR, "config.json");
const NAMES_DIR = path.join(CONTROL_DIR, "names");
const SOCKET_SUFFIX = ".sock";
const DEFAULT_PORT = 7433;
const DEFAULT_AUTO_SHUTDOWN_TIMEOUT = 300;
const DEFAULT_HEARTBEAT_INTERVAL = 15;
const DEFAULT_CONFIG = {
  port: DEFAULT_PORT,
  peers: [],
  autoShutdownTimeout: DEFAULT_AUTO_SHUTDOWN_TIMEOUT,
  heartbeatInterval: DEFAULT_HEARTBEAT_INTERVAL
};
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE))
      return { config: { ...DEFAULT_CONFIG } };
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      config: {
        port: typeof parsed.port === "number" && parsed.port > 0 ? parsed.port : DEFAULT_CONFIG.port,
        peers: Array.isArray(parsed.peers) ? parsed.peers.filter((p) => typeof p === "string") : DEFAULT_CONFIG.peers,
        autoShutdownTimeout: typeof parsed.autoShutdownTimeout === "number" ? parsed.autoShutdownTimeout : DEFAULT_CONFIG.autoShutdownTimeout,
        heartbeatInterval: typeof parsed.heartbeatInterval === "number" ? parsed.heartbeatInterval : DEFAULT_CONFIG.heartbeatInterval
      }
    };
  } catch (err) {
    return { config: { ...DEFAULT_CONFIG }, error: `Config parse error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
function saveConfig(config) {
  try {
    ensureControlDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
function parsePeerAddress(peer) {
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
const ADJECTIVES = [
  "amber",
  "arctic",
  "azure",
  "blazing",
  "bold",
  "bright",
  "calm",
  "cedar",
  "cloud",
  "cobalt",
  "coral",
  "cosmic",
  "crimson",
  "crystal",
  "dawn",
  "deep",
  "desert",
  "dusk",
  "echo",
  "ember",
  "fern",
  "fire",
  "fleet",
  "foggy",
  "forest",
  "frost",
  "gentle",
  "glacier",
  "golden",
  "granite",
  "harbor",
  "haze",
  "hollow",
  "icy",
  "iron",
  "ivory",
  "jade",
  "keen",
  "lake",
  "lava",
  "leaf",
  "light",
  "lunar",
  "maple",
  "meadow",
  "misty",
  "mossy",
  "neon",
  "nimble",
  "noble",
  "oak",
  "ocean",
  "olive",
  "opal",
  "pale",
  "peak",
  "pine",
  "plain",
  "polar",
  "prism",
  "quiet",
  "rain",
  "rapid",
  "reef",
  "river",
  "rocky",
  "rose",
  "rustic",
  "sage",
  "sand",
  "shadow",
  "silent",
  "silver",
  "slate",
  "solar",
  "spark",
  "steel",
  "stone",
  "storm",
  "stream",
  "sun",
  "swift",
  "thorn",
  "thunder",
  "tidal",
  "timber",
  "topaz",
  "trail",
  "twilight",
  "vast",
  "velvet",
  "vivid",
  "warm",
  "wave",
  "wild",
  "willow",
  "wind",
  "winter",
  "zen"
];
const NOUNS = [
  "badger",
  "bear",
  "bird",
  "bison",
  "breeze",
  "brook",
  "canyon",
  "cave",
  "cliff",
  "cloud",
  "comet",
  "condor",
  "crane",
  "creek",
  "crow",
  "dawn",
  "deer",
  "dolphin",
  "dove",
  "dragon",
  "drift",
  "eagle",
  "elk",
  "ember",
  "falcon",
  "finch",
  "flame",
  "flare",
  "fox",
  "frost",
  "gale",
  "grove",
  "harbor",
  "hare",
  "hawk",
  "heron",
  "hill",
  "horizon",
  "isle",
  "jaguar",
  "jay",
  "lake",
  "lark",
  "leopard",
  "lion",
  "lynx",
  "marsh",
  "mesa",
  "moon",
  "moth",
  "nebula",
  "newt",
  "oak",
  "orbit",
  "osprey",
  "otter",
  "owl",
  "ox",
  "panther",
  "path",
  "peak",
  "pebble",
  "penguin",
  "phoenix",
  "pine",
  "plover",
  "pond",
  "puma",
  "quail",
  "rain",
  "raven",
  "reef",
  "ridge",
  "robin",
  "sage",
  "seal",
  "shade",
  "shore",
  "sparrow",
  "spirit",
  "star",
  "stone",
  "stork",
  "summit",
  "swan",
  "swift",
  "tiger",
  "trail",
  "vale",
  "viper",
  "wave",
  "whale",
  "wolf",
  "wren"
];
function generateWhimsicalName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}
function getSessionName(sessionId) {
  if (!isSafeSessionId(sessionId))
    return null;
  try {
    const filePath = path.join(NAMES_DIR, sessionId);
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}
function setSessionName(sessionId, name) {
  if (!isSafeSessionId(sessionId))
    return;
  ensureControlDir();
  fs.mkdirSync(NAMES_DIR, { recursive: true });
  const filePath = path.join(NAMES_DIR, sessionId);
  fs.writeFileSync(filePath, name, "utf8");
}
function removeSessionName(sessionId) {
  if (!isSafeSessionId(sessionId))
    return;
  try {
    const filePath = path.join(NAMES_DIR, sessionId);
    fs.unlinkSync(filePath);
  } catch {
  }
}
function ensureControlDir() {
  fs.mkdirSync(CONTROL_DIR, { recursive: true });
}
function isDaemonRunning() {
  const pid = getDaemonPid();
  if (pid === null)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function getDaemonPid() {
  try {
    const raw = fs.readFileSync(DAEMON_PID_FILE, "utf8").trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}
function isSafeSessionId(sessionId) {
  if (!sessionId || sessionId.length === 0)
    return false;
  if (sessionId.includes("/"))
    return false;
  if (sessionId.includes("\\"))
    return false;
  if (sessionId.includes(".."))
    return false;
  return true;
}
export {
  CONFIG_FILE,
  CONTROL_DIR,
  DAEMON_PID_FILE,
  DAEMON_SOCK,
  DEFAULT_AUTO_SHUTDOWN_TIMEOUT,
  DEFAULT_HEARTBEAT_INTERVAL,
  DEFAULT_PORT,
  NAMES_DIR,
  SOCKET_SUFFIX,
  ensureControlDir,
  generateWhimsicalName,
  getDaemonPid,
  getSessionName,
  isDaemonRunning,
  isSafeSessionId,
  loadConfig,
  parsePeerAddress,
  removeSessionName,
  saveConfig,
  setSessionName
};
