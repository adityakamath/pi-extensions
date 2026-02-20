/**
 * Remote Control Extension
 *
 * Enables cross-machine agent communication via:
 * 1. Per-session Unix control sockets at ~/.pi/remote-control/<sessionId>.sock
 * 2. A background daemon at ~/.pi/remote-control/daemon.sock that handles
 *    session discovery, peer connections (TCP), and command relay.
 *
 * Every session automatically creates a control socket — no flag required.
 * The daemon is started on-demand when /remote commands or send_to_remote tool are used.
 *
 * RPC Protocol (session socket):
 *   Commands are newline-delimited JSON with a `type` field:
 *   - { type: "send", message: "...", mode?: "steer"|"follow_up" }
 *   - { type: "get_message" }
 *   - { type: "get_summary" }
 *   - { type: "clear", summarize?: boolean }
 *   - { type: "abort" }
 *   - { type: "subscribe", event: "turn_end" }
 *
 *   Responses: { type: "response", command, success, data?, error?, id? }
 *   Events:    { type: "event", event, data?, subscriptionId? }
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  TurnEndEvent,
  MessageRenderer,
} from "@mariozechner/pi-coding-agent";
import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import {
  complete,
  type Model,
  type Api,
  type UserMessage,
  type TextContent,
} from "@mariozechner/pi-ai";
import { StringEnum } from "@mariozechner/pi-ai";
import { Box, Container, Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as net from "node:net";
import * as fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  CONTROL_DIR,
  DAEMON_SOCK,
  SOCKET_SUFFIX,
  type DaemonRequest,
  type DaemonResponse,
  type DaemonEvent,
  type RpcCommand,
  type RpcResponse,
  type SessionInfo,
  ensureControlDir,
  isSafeSessionId,
  isDaemonRunning,
  loadConfig,
} from "./shared.js";

// ============================================================================
// Constants
// ============================================================================

const SESSION_MESSAGE_TYPE = "session-message";
const STATUS_KEY = "remote-control";
const SENDER_INFO_PATTERN = /<sender_info>[\s\S]*?<\/sender_info>/g;

// Summarization
const CODEX_MODEL_ID = "gpt-5.1-codex-mini";
const HAIKU_MODEL_ID = "claude-haiku-4-5";
const SUMMARIZATION_SYSTEM_PROMPT =
  "You are a conversation summarizer. Create concise, accurate summaries that preserve key information, decisions, and outcomes.";
const TURN_SUMMARY_PROMPT = `Summarize what happened in this conversation since the last user prompt. Focus on:
- What was accomplished
- Any decisions made
- Files that were read, modified, or created
- Any errors or issues encountered
- Current state/next steps

Be concise but comprehensive. Preserve exact file paths, function names, and error messages.`;

// ============================================================================
// Types
// ============================================================================

interface RpcLocalResponse {
  type: "response";
  command: string;
  success: boolean;
  error?: string;
  data?: unknown;
  id?: string;
}

interface RpcEvent {
  type: "event";
  event: string;
  data?: unknown;
  subscriptionId?: string;
}

interface RpcSendCommand {
  type: "send";
  message: string;
  mode?: "steer" | "follow_up";
  id?: string;
}

interface RpcGetMessageCommand {
  type: "get_message";
  id?: string;
}

interface RpcGetSummaryCommand {
  type: "get_summary";
  id?: string;
}

interface RpcClearCommand {
  type: "clear";
  summarize?: boolean;
  id?: string;
}

interface RpcAbortCommand {
  type: "abort";
  id?: string;
}

interface RpcSubscribeCommand {
  type: "subscribe";
  event: "turn_end";
  id?: string;
}

type LocalRpcCommand =
  | RpcSendCommand
  | RpcGetMessageCommand
  | RpcGetSummaryCommand
  | RpcClearCommand
  | RpcAbortCommand
  | RpcSubscribeCommand;

interface TurnEndSubscription {
  socket: net.Socket;
  subscriptionId: string;
}

interface SocketState {
  server: net.Server | null;
  socketPath: string | null;
  context: ExtensionContext | null;
  alias: string | null;
  aliasTimer: ReturnType<typeof setInterval> | null;
  turnEndSubscriptions: TurnEndSubscription[];
  daemonSubscription: net.Socket | null;
}

interface ExtractedMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface SenderInfo {
  sessionId?: string;
  sessionName?: string;
}

// ============================================================================
// Utilities
// ============================================================================

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

function getSocketPath(sessionId: string): string {
  return path.join(CONTROL_DIR, `${sessionId}${SOCKET_SUFFIX}`);
}

function isSafeAlias(alias: string): boolean {
  return (
    alias.length > 0 &&
    !alias.includes("/") &&
    !alias.includes("\\") &&
    !alias.includes("..")
  );
}

function getAliasPath(alias: string): string {
  return path.join(CONTROL_DIR, `${alias}.alias`);
}

function getSessionAlias(ctx: ExtensionContext): string | null {
  const sessionName = ctx.sessionManager.getSessionName();
  const alias = sessionName ? sessionName.trim() : "";
  if (!alias || !isSafeAlias(alias)) return null;
  return alias;
}

async function removeSocket(socketPath: string | null): Promise<void> {
  if (!socketPath) return;
  try {
    await fsPromises.unlink(socketPath);
  } catch (error) {
    if (isErrnoException(error) && error.code !== "ENOENT") throw error;
  }
}

async function removeAliasesForSocket(socketPath: string | null): Promise<void> {
  if (!socketPath) return;
  try {
    const entries = await fsPromises.readdir(CONTROL_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue;
      const aliasPath = path.join(CONTROL_DIR, entry.name);
      let target: string;
      try {
        target = await fsPromises.readlink(aliasPath);
      } catch {
        continue;
      }
      const resolvedTarget = path.resolve(CONTROL_DIR, target);
      if (resolvedTarget === socketPath) {
        await fsPromises.unlink(aliasPath);
      }
    }
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return;
    throw error;
  }
}

async function createAliasSymlink(sessionId: string, alias: string): Promise<void> {
  if (!alias || !isSafeAlias(alias)) return;
  const aliasPath = getAliasPath(alias);
  const target = `${sessionId}${SOCKET_SUFFIX}`;
  try {
    await fsPromises.unlink(aliasPath);
  } catch (error) {
    if (isErrnoException(error) && error.code !== "ENOENT") throw error;
  }
  try {
    await fsPromises.symlink(target, aliasPath);
  } catch (error) {
    if (isErrnoException(error) && error.code !== "EEXIST") throw error;
  }
}

async function syncAlias(state: SocketState, ctx: ExtensionContext): Promise<void> {
  if (!state.server || !state.socketPath) return;
  const alias = getSessionAlias(ctx);
  if (alias && alias !== state.alias) {
    await removeAliasesForSocket(state.socketPath);
    await createAliasSymlink(ctx.sessionManager.getSessionId(), alias);
    state.alias = alias;
    return;
  }
  if (!alias && state.alias) {
    await removeAliasesForSocket(state.socketPath);
    state.alias = null;
  }
}

function writeResponse(socket: net.Socket, response: RpcLocalResponse): void {
  try {
    socket.write(`${JSON.stringify(response)}\n`);
  } catch {
    // Socket may be closed
  }
}

function writeEvent(socket: net.Socket, event: RpcEvent): void {
  try {
    socket.write(`${JSON.stringify(event)}\n`);
  } catch {
    // Socket may be closed
  }
}

function parseLocalCommand(line: string): { command?: LocalRpcCommand; error?: string } {
  try {
    const parsed = JSON.parse(line) as LocalRpcCommand;
    if (!parsed || typeof parsed !== "object") return { error: "Invalid command" };
    if (typeof parsed.type !== "string") return { error: "Missing command type" };
    return { command: parsed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to parse command" };
  }
}

async function isSocketAlive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 300);
    const cleanup = (alive: boolean) => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      resolve(alive);
    };
    socket.once("connect", () => {
      socket.end();
      cleanup(true);
    });
    socket.once("error", () => cleanup(false));
  });
}

// ============================================================================
// Message Extraction
// ============================================================================

function getLastAssistantMessage(ctx: ExtensionContext): ExtractedMessage | undefined {
  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === "message") {
      const msg = entry.message;
      if ("role" in msg && msg.role === "assistant") {
        const textParts = msg.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text);
        if (textParts.length > 0) {
          return { role: "assistant", content: textParts.join("\n"), timestamp: msg.timestamp };
        }
      }
    }
  }
  return undefined;
}

function getMessagesSinceLastPrompt(ctx: ExtensionContext): ExtractedMessage[] {
  const branch = ctx.sessionManager.getBranch();
  const messages: ExtractedMessage[] = [];
  let lastUserIndex = -1;
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type === "message" && "role" in entry.message && entry.message.role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex === -1) return [];
  for (let i = lastUserIndex; i < branch.length; i++) {
    const entry = branch[i];
    if (entry.type === "message") {
      const msg = entry.message;
      if ("role" in msg && (msg.role === "user" || msg.role === "assistant")) {
        const textParts = msg.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text);
        if (textParts.length > 0) {
          messages.push({ role: msg.role, content: textParts.join("\n"), timestamp: msg.timestamp });
        }
      }
    }
  }
  return messages;
}

function getFirstEntryId(ctx: ExtensionContext): string | undefined {
  const entries = ctx.sessionManager.getEntries();
  if (entries.length === 0) return undefined;
  const root = entries.find((e) => e.parentId === null);
  return root?.id ?? entries[0]?.id;
}

function extractTextContent(content: string | Array<TextContent | { type: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

function stripSenderInfo(text: string): string {
  return text.replace(SENDER_INFO_PATTERN, "").trim();
}

function parseSenderInfo(text: string): SenderInfo | null {
  const match = text.match(/<sender_info>([\s\S]*?)<\/sender_info>/);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { sessionId?: unknown; sessionName?: unknown };
      const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId.trim() : "";
      const sessionName = typeof parsed.sessionName === "string" ? parsed.sessionName.trim() : "";
      if (sessionId || sessionName) {
        return { sessionId: sessionId || undefined, sessionName: sessionName || undefined };
      }
    } catch {
      // fall through to legacy
    }
  }
  const legacyIdMatch = raw.match(/session\s+([a-f0-9-]{6,})/i);
  if (legacyIdMatch) return { sessionId: legacyIdMatch[1] };
  return null;
}

function formatSenderInfo(info: SenderInfo | null): string | null {
  if (!info) return null;
  const { sessionName, sessionId } = info;
  if (sessionName && sessionId) return `${sessionName} (${sessionId})`;
  if (sessionName) return sessionName;
  if (sessionId) return sessionId;
  return null;
}

// ============================================================================
// Message Renderer
// ============================================================================

const renderSessionMessage: MessageRenderer = (message, { expanded }, theme) => {
  const rawContent = extractTextContent(message.content);
  const senderInfo = parseSenderInfo(rawContent);
  let text = stripSenderInfo(rawContent);
  if (!text) text = "(no content)";

  if (!expanded) {
    const lines = text.split("\n");
    if (lines.length > 5) text = `${lines.slice(0, 5).join("\n")}\n...`;
  }

  const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
  const labelBase = theme.fg("customMessageLabel", `\x1b[1m[${message.customType}]\x1b[22m`);
  const senderText = formatSenderInfo(senderInfo);
  const label = senderText
    ? `${labelBase} ${theme.fg("dim", `from ${senderText}`)}`
    : labelBase;
  box.addChild(new Text(label, 0, 0));
  box.addChild(new Spacer(1));
  box.addChild(
    new Markdown(text, 0, 0, getMarkdownTheme(), {
      color: (value: string) => theme.fg("customMessageText", value),
    }),
  );
  return box;
};

// ============================================================================
// Summarization
// ============================================================================

async function selectSummarizationModel(
  currentModel: Model<Api> | undefined,
  modelRegistry: {
    find: (provider: string, modelId: string) => Model<Api> | undefined;
    getApiKey: (model: Model<Api>) => Promise<string | undefined>;
  },
): Promise<Model<Api> | undefined> {
  const codexModel = modelRegistry.find("openai-codex", CODEX_MODEL_ID);
  if (codexModel) {
    const apiKey = await modelRegistry.getApiKey(codexModel);
    if (apiKey) return codexModel;
  }
  const haikuModel = modelRegistry.find("anthropic", HAIKU_MODEL_ID);
  if (haikuModel) {
    const apiKey = await modelRegistry.getApiKey(haikuModel);
    if (apiKey) return haikuModel;
  }
  return currentModel;
}

// ============================================================================
// RPC Command Handler (session control socket)
// ============================================================================

async function handleCommand(
  pi: ExtensionAPI,
  state: SocketState,
  command: LocalRpcCommand,
  socket: net.Socket,
): Promise<void> {
  const id = "id" in command && typeof command.id === "string" ? command.id : undefined;
  const respond = (success: boolean, commandName: string, data?: unknown, error?: string) => {
    if (state.context) void syncAlias(state, state.context);
    writeResponse(socket, { type: "response", command: commandName, success, data, error, id });
  };

  const ctx = state.context;
  if (!ctx) {
    respond(false, command.type, undefined, "Session not ready");
    return;
  }
  void syncAlias(state, ctx);

  if (command.type === "abort") {
    ctx.abort();
    respond(true, "abort");
    return;
  }

  if (command.type === "subscribe") {
    if (command.event === "turn_end") {
      const subscriptionId =
        id ?? `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      state.turnEndSubscriptions.push({ socket, subscriptionId });
      const cleanup = () => {
        const idx = state.turnEndSubscriptions.findIndex(
          (s) => s.subscriptionId === subscriptionId,
        );
        if (idx !== -1) state.turnEndSubscriptions.splice(idx, 1);
      };
      socket.once("close", cleanup);
      socket.once("error", cleanup);
      respond(true, "subscribe", { subscriptionId, event: "turn_end" });
      return;
    }
    respond(false, "subscribe", undefined, `Unknown event type: ${command.event}`);
    return;
  }

  if (command.type === "get_message") {
    const message = getLastAssistantMessage(ctx);
    respond(true, "get_message", { message: message ?? null });
    return;
  }

  if (command.type === "get_summary") {
    const messages = getMessagesSinceLastPrompt(ctx);
    if (messages.length === 0) {
      respond(false, "get_summary", undefined, "No messages to summarize");
      return;
    }
    const model = await selectSummarizationModel(ctx.model, ctx.modelRegistry);
    if (!model) {
      respond(false, "get_summary", undefined, "No model available for summarization");
      return;
    }
    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) {
      respond(false, "get_summary", undefined, "No API key available for summarization model");
      return;
    }
    try {
      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      const userMessage: UserMessage = {
        role: "user",
        content: [
          {
            type: "text",
            text: `<conversation>\n${conversationText}\n</conversation>\n\n${TURN_SUMMARY_PROMPT}`,
          },
        ],
        timestamp: Date.now(),
      };
      const response = await complete(
        model,
        { systemPrompt: SUMMARIZATION_SYSTEM_PROMPT, messages: [userMessage] },
        { apiKey },
      );
      if (response.stopReason === "aborted" || response.stopReason === "error") {
        respond(false, "get_summary", undefined, "Summarization failed");
        return;
      }
      const summary = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      respond(true, "get_summary", { summary, model: model.id });
    } catch (error) {
      respond(
        false,
        "get_summary",
        undefined,
        error instanceof Error ? error.message : "Summarization failed",
      );
    }
    return;
  }

  if (command.type === "clear") {
    if (!ctx.isIdle()) {
      respond(false, "clear", undefined, "Session is busy - wait for turn to complete");
      return;
    }
    const firstEntryId = getFirstEntryId(ctx);
    if (!firstEntryId) {
      respond(false, "clear", undefined, "No entries in session");
      return;
    }
    const currentLeafId = ctx.sessionManager.getLeafId();
    if (currentLeafId === firstEntryId) {
      respond(true, "clear", { cleared: true, alreadyAtRoot: true });
      return;
    }
    try {
      const sessionManager = ctx.sessionManager as unknown as { rewindTo(id: string): void };
      sessionManager.rewindTo(firstEntryId);
      respond(true, "clear", { cleared: true, targetId: firstEntryId });
    } catch (error) {
      respond(false, "clear", undefined, error instanceof Error ? error.message : "Clear failed");
    }
    return;
  }

  if (command.type === "send") {
    const message = command.message;
    if (typeof message !== "string" || message.trim().length === 0) {
      respond(false, "send", undefined, "Missing message");
      return;
    }
    const mode = command.mode ?? "steer";
    const isIdle = ctx.isIdle();
    const customMessage = {
      customType: SESSION_MESSAGE_TYPE,
      content: message,
      display: true,
    };
    if (isIdle) {
      pi.sendMessage(customMessage, { triggerTurn: true });
    } else {
      pi.sendMessage(customMessage, {
        triggerTurn: true,
        deliverAs: mode === "follow_up" ? "followUp" : "steer",
      });
    }
    respond(true, "send", { delivered: true, mode: isIdle ? "direct" : mode });
    return;
  }

  respond(false, command.type, undefined, `Unsupported command: ${command.type}`);
}

// ============================================================================
// Session Control Socket Server
// ============================================================================

async function createServer(
  pi: ExtensionAPI,
  state: SocketState,
  socketPath: string,
): Promise<net.Server> {
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        if (!line) continue;
        const parsed = parseLocalCommand(line);
        if (parsed.error) {
          if (state.context) void syncAlias(state, state.context);
          writeResponse(socket, {
            type: "response",
            command: "parse",
            success: false,
            error: `Failed to parse command: ${parsed.error}`,
          });
          continue;
        }
        void handleCommand(pi, state, parsed.command!, socket);
      }
    });
    socket.on("error", () => {
      // ignore per-connection errors
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  return server;
}

async function startControlServer(
  pi: ExtensionAPI,
  state: SocketState,
  ctx: ExtensionContext,
): Promise<void> {
  await fsPromises.mkdir(CONTROL_DIR, { recursive: true });
  const sessionId = ctx.sessionManager.getSessionId();
  const socketPath = getSocketPath(sessionId);

  if (state.socketPath === socketPath && state.server) {
    state.context = ctx;
    await syncAlias(state, ctx);
    return;
  }

  await stopControlServer(state);
  await removeSocket(socketPath);

  state.context = ctx;
  state.socketPath = socketPath;
  state.server = await createServer(pi, state, socketPath);
  state.alias = null;
  await syncAlias(state, ctx);
}

async function stopControlServer(state: SocketState): Promise<void> {
  if (!state.server) {
    await removeAliasesForSocket(state.socketPath);
    await removeSocket(state.socketPath);
    state.socketPath = null;
    state.alias = null;
    return;
  }
  const socketPath = state.socketPath;
  state.socketPath = null;
  state.turnEndSubscriptions = [];
  await new Promise<void>((resolve) => state.server?.close(() => resolve()));
  state.server = null;
  await removeAliasesForSocket(socketPath);
  await removeSocket(socketPath);
  state.alias = null;
}

// ============================================================================
// Daemon Client
// ============================================================================

async function sendDaemonCommand(
  request: DaemonRequest,
  timeoutMs = 10000,
): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(DAEMON_SOCK);
    socket.setEncoding("utf8");

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Daemon command timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    let buffer = "";

    socket.once("connect", () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as DaemonResponse;
          if (msg.type === "response") {
            clearTimeout(timer);
            socket.destroy();
            resolve(msg);
            return;
          }
        } catch {
          // keep buffering
        }
      }
    });

    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function spawnDaemon(): Promise<boolean> {
  try {
    const daemonScript = path.join(path.dirname(new URL(import.meta.url).pathname), "daemon.ts");

    // Try tsx first, then ts-node, then node (for compiled js)
    let cmd = "tsx";
    let args = [daemonScript];
    if (!fs.existsSync(daemonScript)) {
      // Try compiled version
      const daemonJs = daemonScript.replace(/\.ts$/, ".js");
      cmd = "node";
      args = [daemonJs];
    }

    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });
    child.unref();

    // Wait for daemon.sock to appear (poll every 100ms, 5s timeout)
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      if (fs.existsSync(DAEMON_SOCK)) {
        // Give it a tiny bit more to finish binding
        await new Promise((r) => setTimeout(r, 100));
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function ensureDaemon(ctx: ExtensionContext): Promise<boolean> {
  // Quick check: can we connect to daemon.sock?
  if (fs.existsSync(DAEMON_SOCK)) {
    try {
      await sendDaemonCommand({ type: "status" }, 2000);
      return true;
    } catch {
      // Stale socket — fall through to spawn
    }
  }

  if (ctx.hasUI) {
    ctx.ui.notify("⚠️ Daemon not running — starting daemon...", "warning");
  }

  const started = await spawnDaemon();
  if (!started) {
    if (ctx.hasUI) {
      ctx.ui.notify("❌ Daemon failed to start", "error");
    }
    return false;
  }

  return true;
}

function subscribeToDaemonEvents(ctx: ExtensionContext, state: SocketState): void {
  if (!fs.existsSync(DAEMON_SOCK)) return;

  // Don't double-subscribe
  if (state.daemonSubscription && !state.daemonSubscription.destroyed) return;

  try {
    const socket = net.createConnection(DAEMON_SOCK);
    socket.setEncoding("utf8");
    state.daemonSubscription = socket;

    let buffer = "";

    socket.once("connect", () => {
      socket.write(`${JSON.stringify({ type: "subscribe" })}\n`);
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as DaemonEvent | DaemonResponse;
          if (msg.type === "event") {
            handleDaemonEvent(msg as DaemonEvent, ctx);
          }
          // response to subscribe — ignore
        } catch {
          // malformed line — ignore
        }
      }
    });

    socket.on("error", () => {
      state.daemonSubscription = null;
    });

    socket.on("close", () => {
      state.daemonSubscription = null;
    });
  } catch {
    state.daemonSubscription = null;
  }
}

function handleDaemonEvent(event: DaemonEvent, ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const data = event.data as Record<string, unknown> | undefined;

  switch (event.event) {
    case "session_added": {
      if (!data?.isRemote) break; // only notify for remote sessions
      const name = (data.name as string | undefined) || (data.sessionId as string | undefined) || "unknown";
      const host = (data.host as string | undefined) || "unknown";
      ctx.ui.notify(`🔗 New remote session: ${name} on ${host}`, "info");
      break;
    }
    case "session_removed": {
      if (!data?.isRemote) break;
      const name = (data.name as string | undefined) || (data.sessionId as string | undefined) || "unknown";
      const host = (data.host as string | undefined) || "unknown";
      ctx.ui.notify(`🔌 Remote session disconnected: ${name} on ${host}`, "info");
      break;
    }
    case "peer_connected": {
      const host = (data?.host as string | undefined) || "unknown";
      const sessionCount = (data?.sessionCount as number | undefined) ?? 0;
      ctx.ui.notify(`🌐 Connected to peer: ${host} (${sessionCount} sessions)`, "info");
      break;
    }
    case "peer_disconnected": {
      const host = (data?.host as string | undefined) || "unknown";
      ctx.ui.notify(`⚠️ Lost connection to ${host} — reconnecting...`, "warning");
      break;
    }
    case "error": {
      const message = (data?.message as string | undefined) || "Unknown daemon error";
      ctx.ui.notify(`❌ ${message}`, "error");
      break;
    }
  }
}

// ============================================================================
// Status helpers
// ============================================================================

function updateStatus(ctx: ExtensionContext | null, enabled: boolean): void {
  if (!ctx?.hasUI) return;
  if (!enabled) {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    return;
  }
  const sessionId = ctx.sessionManager.getSessionId();
  ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", `session ${sessionId}`));
}

function updateSessionEnv(ctx: ExtensionContext | null, enabled: boolean): void {
  if (!enabled) {
    delete process.env.PI_SESSION_ID;
    return;
  }
  if (!ctx) return;
  process.env.PI_SESSION_ID = ctx.sessionManager.getSessionId();
}

// ============================================================================
// RPC Client (for send_to_remote tool)
// ============================================================================

interface RpcClientOptions {
  timeout?: number;
  waitForEvent?: "turn_end";
}

async function sendRpcCommand(
  socketPath: string,
  command: LocalRpcCommand,
  options: RpcClientOptions = {},
): Promise<{ response: RpcLocalResponse; event?: { message?: ExtractedMessage; turnIndex?: number } }> {
  const { timeout = 5000, waitForEvent } = options;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    socket.setEncoding("utf8");

    const timeoutHandle = setTimeout(() => {
      socket.destroy(new Error("timeout"));
    }, timeout);

    let buffer = "";
    let response: RpcLocalResponse | null = null;

    const cleanup = () => {
      clearTimeout(timeoutHandle);
      socket.removeAllListeners();
    };

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(command)}\n`);
      if (waitForEvent === "turn_end") {
        const subscribeCmd: RpcSubscribeCommand = { type: "subscribe", event: "turn_end" };
        socket.write(`${JSON.stringify(subscribeCmd)}\n`);
      }
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as RpcLocalResponse | RpcEvent;
          if (msg.type === "response") {
            const resp = msg as RpcLocalResponse;
            if (resp.command === command.type) {
              response = resp;
              if (!waitForEvent) {
                cleanup();
                socket.end();
                resolve({ response });
                return;
              }
            }
            continue;
          }
          if (msg.type === "event") {
            const evt = msg as RpcEvent;
            if (evt.event === "turn_end" && waitForEvent === "turn_end") {
              cleanup();
              socket.end();
              if (!response) {
                reject(new Error("Received event before response"));
                return;
              }
              resolve({ response, event: (evt.data as { message?: ExtractedMessage; turnIndex?: number }) || {} });
              return;
            }
          }
        } catch {
          // keep buffering
        }
      }
    });

    socket.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

// Send via daemon relay (for both local and remote sessions)
async function sendViaRelay(
  targetSessionId: string,
  rpcCommand: RpcCommand,
  waitForTurnEnd = false,
): Promise<{ response: RpcLocalResponse; event?: { message?: ExtractedMessage; turnIndex?: number } }> {
  if (waitForTurnEnd) {
    // For turn_end, we need to talk to the session socket directly (relay doesn't support turn_end subscription)
    // First figure out if the session is local
    const localSocketPath = getSocketPath(targetSessionId);
    const alive = await isSocketAlive(localSocketPath);
    if (alive) {
      const cmd = rpcCommand as LocalRpcCommand;
      return sendRpcCommand(localSocketPath, cmd, { timeout: 300000, waitForEvent: "turn_end" });
    }
    // Remote session — relay without turn_end (best effort)
    const requestId = randomUUID();
    const daemonResp = await sendDaemonCommand(
      { type: "relay", targetSessionId, rpcCommand, requestId },
      300000,
    );
    if (!daemonResp.success) {
      return {
        response: {
          type: "response",
          command: rpcCommand.type,
          success: false,
          error: daemonResp.error ?? "Relay failed",
        },
      };
    }
    const relayData = daemonResp.data as { response?: RpcLocalResponse } | undefined;
    return { response: relayData?.response ?? { type: "response", command: rpcCommand.type, success: true } };
  }

  // Try local first
  const localSocketPath = getSocketPath(targetSessionId);
  const alive = await isSocketAlive(localSocketPath);
  if (alive) {
    const cmd = rpcCommand as LocalRpcCommand;
    const timeout = rpcCommand.type === "get_summary" ? 60000 : rpcCommand.type === "send" ? 30000 : 5000;
    return sendRpcCommand(localSocketPath, cmd, { timeout });
  }

  // Use daemon relay
  const requestId = randomUUID();
  const timeout = rpcCommand.type === "get_summary" ? 60000 : rpcCommand.type === "send" ? 30000 : 10000;
  const daemonResp = await sendDaemonCommand(
    { type: "relay", targetSessionId, rpcCommand, requestId },
    timeout,
  );
  if (!daemonResp.success) {
    return {
      response: {
        type: "response",
        command: rpcCommand.type,
        success: false,
        error: daemonResp.error ?? "Relay failed",
      },
    };
  }
  const relayData = daemonResp.data as { response?: RpcLocalResponse } | undefined;
  return { response: relayData?.response ?? { type: "response", command: rpcCommand.type, success: true } };
}

// ============================================================================
// /remote command
// ============================================================================

function registerRemoteCommand(pi: ExtensionAPI, state: SocketState): void {
  pi.registerCommand("remote", {
    description: "Manage remote peer connections and sessions",
    getArgumentCompletions: (_partial: string) => ["add", "remove", "list", "list-tailscale", "kill-daemon"],
    handler: async (args: string[], ctx: ExtensionContext) => {
  try {
    const subcommandRaw = args[0];
    const subcommand = typeof subcommandRaw === "string" ? subcommandRaw.trim() : "";

    // Defensive: empty or undefined
    if (!subcommand) {
      // Show status/help as before
      const ok = await ensureDaemon(ctx);
      if (!ok) {
        ctx.hasUI && ctx.ui.notify("❌ Daemon could not be started. Check logs and build daemon.js.", "error");
        return;
      }
      try {
        const resp = await sendDaemonCommand({ type: "status" }, 5000);
        if (!resp.success) {
          ctx.hasUI && ctx.ui.notify(`❌ Daemon error: ${resp.error ?? "unknown"}`, "error");
          return;
        }
        // Defensive: never pass undefined to rendering
        const data = resp.data || {};
        const lines: string[] = [
          `**Daemon Status**`,
          `- PID: ${data.pid ?? "?"}`,
          `- Uptime: ${data.uptime ?? 0}s`,
          `- Port: ${data.port ?? "?"}`,
          `- Local sessions: ${data.localSessionCount ?? 0}`,
          `- Connected peers: ${data.remotePeerCount ?? 0}`,
        ];
        if (Array.isArray(data.peers) && data.peers.length > 0) {
          lines.push(`\n**Peers:**`);
          for (const peer of data.peers) {
            const status = peer.connected ? "🟢 connected" : "🔴 disconnected";
            lines.push(`- ${peer.host ?? "unknown"}:${peer.port ?? "?"} — ${status} (${peer.sessionCount ?? 0} sessions)`);
          }
        }
        pi.sendMessage(
          { customType: "remote-status", content: lines.join("\n"), display: true },
          { triggerTurn: false },
        );
      } catch (err) {
        ctx.hasUI && ctx.ui.notify(`❌ Failed to get daemon status: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
      return;
    }

    const validSubcommands = ["add", "remove", "list", "list-tailscale", "kill-daemon"];
    if (!validSubcommands.includes(subcommand)) {
      ctx.hasUI && ctx.ui.notify(
        `❌ Unknown subcommand: ${subcommand}. Use: add, remove, list, list-tailscale, kill-daemon`,
        "error"
      );
      return;
    }

    if (["add", "remove"].includes(subcommand)) {
      const hostRaw = args[1];
      const host = typeof hostRaw === "string" ? hostRaw.trim() : "";
      if (!host) {
        ctx.hasUI && ctx.ui.notify(`❌ Usage: /remote ${subcommand} <host>`, "error");
        return;
      }
    }

    // ADD
    if (subcommand === "add") {
      const host = typeof args[1] === "string" ? args[1].trim() : "";
      try {
        const ok = await ensureDaemon(ctx);
        if (!ok) return;
        const resp = await sendDaemonCommand({ type: "add_peer", host }, 15000);
        if (resp.success) {
          ctx.hasUI && ctx.ui.notify(`🌐 Connected to peer: ${host}`, "info");
        } else {
          ctx.hasUI && ctx.ui.notify(`❌ Failed to connect to ${host}: ${resp.error ?? "unknown"}`, "error");
        }
      } catch (err) {
        ctx.hasUI && ctx.ui.notify(
          `❌ Connection refused to ${host} — is the daemon running on that machine?`,
          "error"
        );
      }
      return;
    }

    // REMOVE
    if (subcommand === "remove") {
      const host = typeof args[1] === "string" ? args[1].trim() : "";
      try {
        const resp = await sendDaemonCommand({ type: "remove_peer", host }, 5000);
        if (resp.success) {
          ctx.hasUI && ctx.ui.notify(`Removed peer: ${host}`, "info");
        } else {
          ctx.hasUI && ctx.ui.notify(`❌ ${resp.error ?? "Failed to remove peer"}`, "error");
        }
      } catch (err) {
        ctx.hasUI && ctx.ui.notify(
          `❌ Failed to remove peer: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
      return;
    }

    // LIST
    if (subcommand === "list") {
      try {
        const resp = await sendDaemonCommand({ type: "list_sessions" }, 5000);
        if (!resp.success) {
          ctx.hasUI && ctx.ui.notify(`❌ ${resp.error ?? "Failed to list sessions"}`, "error");
          return;
        }
        const data = resp.data as { sessions?: Array<SessionInfo & { host?: string; isRemote?: boolean }> };
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        const lines = sessions.length === 0
          ? ["No sessions found."]
          : sessions.map((s) => {
              const sessionId = typeof s.sessionId === "string" ? s.sessionId : "(unknown)";
              const nameStr = s.name && typeof s.name === "string" ? ` (${s.name})` : "";
              const hostStr =
                s.isRemote && typeof s.host === "string"
                  ? ` [remote: ${s.host}]`
                  : (s.isRemote ? " [remote]" : " [local]");
              return `- ${sessionId}${nameStr}${hostStr}`;
            });
        pi.sendMessage(
          { customType: "remote-list", content: `**Sessions:**\n${lines.join("\n")}`, display: true },
          { triggerTurn: false },
        );
      } catch (err) {
        ctx.hasUI && ctx.ui.notify(
          `❌ Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
      return;
    }

    // LIST-TAILSCALE
    if (subcommand === "list-tailscale") {
      try {
        const ok = await ensureDaemon(ctx);
        if (!ok) return;
        const resp = await sendDaemonCommand({ type: "list_tailscale" }, 10000);
        if (!resp.success) {
          ctx.hasUI && ctx.ui.notify(`⚠️ Tailscale unavailable: ${resp.error ?? "unknown"}`, "warning");
          return;
        }
        const data = resp.data as { peers?: string[] };
        const peers = Array.isArray(data.peers) ? data.peers : [];
        const content = peers.length === 0
          ? "No Tailscale peers found."
          : `**Tailscale peers:**\n${peers.map((p) => `- ${p}`).join("\n")}`;
        pi.sendMessage(
          { customType: "remote-tailscale", content, display: true },
          { triggerTurn: false },
        );
      } catch (err) {
        ctx.hasUI && ctx.ui.notify(
          `❌ Failed to list Tailscale peers: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
      return;
    }

    // KILL-DAEMON
    if (subcommand === "kill-daemon") {
      if (!fs.existsSync(DAEMON_SOCK)) {
        ctx.hasUI && ctx.ui.notify("Daemon is not running", "info");
        return;
      }
      try {
        await sendDaemonCommand({ type: "kill" }, 5000);
        ctx.hasUI && ctx.ui.notify("Daemon stopped", "info");
      } catch {
        ctx.hasUI && ctx.ui.notify("Daemon stopped", "info");
      }
      return;
    }
  } catch (err) {
    // Catch-all: defensive fallback
    ctx.hasUI && ctx.ui.notify(
      `❌ An unexpected error occurred: ${err instanceof Error ? err.message : String(err)}`,
      "error"
    );
  }
}

  });
}

// ============================================================================
// Tool: list_remotes
// ============================================================================

function registerListRemotesTool(pi: ExtensionAPI, state: SocketState): void {
  pi.registerTool({
    name: "list_remotes",
    label: "List Sessions",
    description:
      "List live sessions that expose a control socket (optionally with session names). Use this for discovery only; for the current session id in shell/bash use $PI_SESSION_ID.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      // Try daemon first for unified local+remote view
      if (fs.existsSync(DAEMON_SOCK)) {
        try {
          const resp = await sendDaemonCommand({ type: "list_sessions" }, 5000);
          if (resp.success) {
            const data = resp.data as { sessions?: Array<SessionInfo & { host: string; isRemote: boolean }> };
            const sessions = data.sessions ?? [];
            if (sessions.length === 0) {
              return {
                content: [{ type: "text", text: "No live sessions found." }],
                details: { sessions: [] },
              };
            }
            const lines = sessions.map((s) => {
              const nameStr = s.name ? ` (${s.name})` : "";
              const hostStr = s.isRemote ? ` [remote: ${s.host}]` : " [local]";
              return `- ${s.sessionId}${nameStr}${hostStr}`;
            });
            return {
              content: [{ type: "text", text: `Live sessions:\n${lines.join("\n")}` }],
              details: { sessions },
            };
          }
        } catch {
          // Fall through to local scan
        }
      }

      // Local-only fallback: scan CONTROL_DIR for .sock files
      try {
        await fsPromises.mkdir(CONTROL_DIR, { recursive: true });
        const entries = await fsPromises.readdir(CONTROL_DIR, { withFileTypes: true });
        const sessions: Array<{ sessionId: string; name?: string; aliases: string[]; socketPath: string; isRemote: boolean }> = [];
        const aliasMap = new Map<string, string[]>();

        // Build alias map
        for (const entry of entries) {
          if (!entry.isSymbolicLink() || !entry.name.endsWith(".alias")) continue;
          const aliasPath = path.join(CONTROL_DIR, entry.name);
          try {
            const target = await fsPromises.readlink(aliasPath);
            const resolvedTarget = path.resolve(CONTROL_DIR, target);
            const aliasName = entry.name.slice(0, -".alias".length);
            const existing = aliasMap.get(resolvedTarget);
            if (existing) existing.push(aliasName);
            else aliasMap.set(resolvedTarget, [aliasName]);
          } catch {
            // ignore
          }
        }

        for (const entry of entries) {
          if (!entry.name.endsWith(SOCKET_SUFFIX)) continue;
          if (entry.name === path.basename(DAEMON_SOCK)) continue;
          const socketPath = path.join(CONTROL_DIR, entry.name);
          const alive = await isSocketAlive(socketPath);
          if (!alive) continue;
          const sessionId = entry.name.slice(0, -SOCKET_SUFFIX.length);
          if (!isSafeSessionId(sessionId)) continue;
          const aliases = aliasMap.get(socketPath) ?? [];
          const name = aliases[0];
          sessions.push({ sessionId, name, aliases, socketPath, isRemote: false });
        }

        if (sessions.length === 0) {
          return {
            content: [{ type: "text", text: "No live sessions found." }],
            details: { sessions: [] },
          };
        }
        const lines = sessions.map((s) => {
          const nameStr = s.name ? ` (${s.name})` : "";
          return `- ${s.sessionId}${nameStr} [local]`;
        });
        return {
          content: [{ type: "text", text: `Live sessions:\n${lines.join("\n")}` }],
          details: { sessions },
        };
      } catch (err) {
        if (ctx?.hasUI) {
          ctx.ui.notify(
            `❌ Failed to list sessions: ${err instanceof Error ? err.message : String(err)}`,
            "error",
          );
        }
        return {
          content: [{ type: "text", text: "Failed to list sessions" }],
          isError: true,
          details: { error: err instanceof Error ? err.message : String(err) },
        };
      }
    },
  });
}

// ============================================================================
// Tool: send_to_remote
// ============================================================================

async function resolveSessionIdFromDaemon(sessionName: string): Promise<string | null> {
  if (!fs.existsSync(DAEMON_SOCK)) return null;
  try {
    const resp = await sendDaemonCommand({ type: "list_sessions" }, 5000);
    if (!resp.success) return null;
    const data = resp.data as { sessions?: Array<SessionInfo & { host: string; isRemote: boolean }> };
    const sessions = data.sessions ?? [];
    const match = sessions.find(
      (s) =>
        s.name === sessionName ||
        s.sessionId === sessionName ||
        (s.aliases && s.aliases.includes(sessionName)),
    );
    return match?.sessionId ?? null;
  } catch {
    return null;
  }
}

async function resolveSessionIdFromAliasLocal(alias: string): Promise<string | null> {
  if (!alias || !isSafeAlias(alias)) return null;
  const aliasPath = path.join(CONTROL_DIR, `${alias}.alias`);
  try {
    const target = await fsPromises.readlink(aliasPath);
    const resolvedTarget = path.resolve(CONTROL_DIR, target);
    const base = path.basename(resolvedTarget);
    if (!base.endsWith(SOCKET_SUFFIX)) return null;
    const sessionId = base.slice(0, -SOCKET_SUFFIX.length);
    return isSafeSessionId(sessionId) ? sessionId : null;
  } catch {
    return null;
  }
}

function registerSendToRemoteTool(pi: ExtensionAPI, state: SocketState): void {
  pi.registerTool({
    name: "send_to_remote",
    label: "Send To Session",
    description: `Interact with another running pi session via its control socket.

Actions:
- send: Send a message (default). Requires 'message' parameter.
- get_message: Get the most recent assistant message.
- get_summary: Get a summary of activity since the last user prompt.
- clear: Rewind session to initial state.

Target selection:
- sessionId: UUID of the session.
- sessionName: session name (alias from /name).

Wait behavior (only for action=send):
- wait_until=turn_end: Wait for the turn to complete, returns last assistant message.
- wait_until=message_processed: Returns immediately after message is queued.

Note: If you ask the target session to reply back via sender_info, do not use wait_until; waiting is redundant and can duplicate responses.

Messages automatically include sender session info for replies. When you want a response, instruct the target session to reply directly to the sender by calling send_to_remote with the sender_info reference (do not poll get_message).`,
    parameters: Type.Object({
      sessionId: Type.Optional(Type.String({ description: "Target session id (UUID)" })),
      sessionName: Type.Optional(Type.String({ description: "Target session name (alias)" })),
      action: Type.Optional(
        StringEnum(["send", "get_message", "get_summary", "clear"] as const, {
          description: "Action to perform (default: send)",
          default: "send",
        }),
      ),
      message: Type.Optional(Type.String({ description: "Message to send (required for action=send)" })),
      mode: Type.Optional(
        StringEnum(["steer", "follow_up"] as const, {
          description: "Delivery mode for send: steer (immediate) or follow_up (after task)",
          default: "steer",
        }),
      ),
      wait_until: Type.Optional(
        StringEnum(["turn_end", "message_processed"] as const, {
          description: "Wait behavior for send action",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = params.action ?? "send";
      const sessionName = params.sessionName?.trim();
      const sessionId = params.sessionId?.trim();
      let targetSessionId: string | null = null;
      const displayTarget = sessionName || sessionId || "";

      // Resolve session ID
      if (sessionName) {
        // Try daemon first (covers remote sessions)
        targetSessionId = await resolveSessionIdFromDaemon(sessionName);
        // Fall back to local alias symlinks
        if (!targetSessionId) {
          targetSessionId = await resolveSessionIdFromAliasLocal(sessionName);
        }
        if (!targetSessionId) {
          if (ctx?.hasUI) {
            ctx.ui.notify(
              `❌ Session not found: no session matching '${sessionName}' on any host`,
              "error",
            );
          }
          return {
            content: [{ type: "text", text: `Session not found: '${sessionName}'` }],
            isError: true,
            details: { error: `Session not found: '${sessionName}'` },
          };
        }
      }

      if (sessionId) {
        if (!isSafeSessionId(sessionId)) {
          return {
            content: [{ type: "text", text: "Invalid session id" }],
            isError: true,
            details: { error: "Invalid session id" },
          };
        }
        if (targetSessionId && targetSessionId !== sessionId) {
          return {
            content: [{ type: "text", text: "Session name does not match session id" }],
            isError: true,
            details: { error: "Session name does not match session id" },
          };
        }
        targetSessionId = sessionId;
      }

      if (!targetSessionId) {
        return {
          content: [{ type: "text", text: "Missing session id or session name" }],
          isError: true,
          details: { error: "Missing session id or session name" },
        };
      }

      const senderSessionId = state.context?.sessionManager.getSessionId();
      const senderSessionName = state.context?.sessionManager.getSessionName()?.trim();

      try {
        if (action === "get_message") {
          const result = await sendViaRelay(targetSessionId, { type: "get_message" });
          if (!result.response.success) {
            return {
              content: [{ type: "text", text: `Failed: ${result.response.error ?? "unknown error"}` }],
              isError: true,
              details: result,
            };
          }
          const data = result.response.data as { message?: ExtractedMessage };
          if (!data?.message) {
            return {
              content: [{ type: "text", text: "No assistant message found in session" }],
              details: result,
            };
          }
          return {
            content: [{ type: "text", text: data.message.content }],
            details: { message: data.message },
          };
        }

        if (action === "get_summary") {
          const result = await sendViaRelay(targetSessionId, { type: "get_summary" });
          if (!result.response.success) {
            return {
              content: [{ type: "text", text: `Failed: ${result.response.error ?? "unknown error"}` }],
              isError: true,
              details: result,
            };
          }
          const data = result.response.data as { summary?: string; model?: string };
          if (!data?.summary) {
            return {
              content: [{ type: "text", text: "No summary generated" }],
              details: result,
            };
          }
          return {
            content: [{ type: "text", text: `Summary (via ${data.model}):\n\n${data.summary}` }],
            details: { summary: data.summary, model: data.model },
          };
        }

        if (action === "clear") {
          const result = await sendViaRelay(targetSessionId, { type: "clear", summarize: false });
          if (!result.response.success) {
            return {
              content: [{ type: "text", text: `Failed to clear: ${result.response.error ?? "unknown error"}` }],
              isError: true,
              details: result,
            };
          }
          const data = result.response.data as { cleared?: boolean; alreadyAtRoot?: boolean };
          const msg = data?.alreadyAtRoot ? "Session already at root" : "Session cleared";
          return {
            content: [{ type: "text", text: msg }],
            details: data,
          };
        }

        // action === "send"
        if (!params.message || params.message.trim().length === 0) {
          return {
            content: [{ type: "text", text: "Missing message for send action" }],
            isError: true,
            details: { error: "Missing message" },
          };
        }

        const senderInfo = senderSessionId
          ? `\n\n<sender_info>${JSON.stringify({
              sessionId: senderSessionId,
              sessionName: senderSessionName || undefined,
            })}</sender_info>`
          : "";

        const sendCommand: RpcCommand = {
          type: "send",
          message: params.message + senderInfo,
          mode: params.mode ?? "steer",
        };

        if (params.wait_until === "turn_end") {
          const result = await sendViaRelay(targetSessionId, sendCommand, true);
          if (!result.response.success) {
            return {
              content: [{ type: "text", text: `Failed: ${result.response.error ?? "unknown error"}` }],
              isError: true,
              details: result,
            };
          }
          const lastMessage = result.event?.message;
          if (!lastMessage) {
            return {
              content: [{ type: "text", text: "Turn completed but no assistant message found" }],
              details: { turnIndex: result.event?.turnIndex },
            };
          }
          return {
            content: [{ type: "text", text: lastMessage.content }],
            details: { message: lastMessage, turnIndex: result.event?.turnIndex },
          };
        }

        const result = await sendViaRelay(targetSessionId, sendCommand);
        if (!result.response.success) {
          return {
            content: [{ type: "text", text: `Failed: ${result.response.error ?? "unknown error"}` }],
            isError: true,
            details: result,
          };
        }

        if (params.wait_until === "message_processed") {
          return {
            content: [{ type: "text", text: "Message delivered to session" }],
            details: result.response.data,
          };
        }

        return {
          content: [{ type: "text", text: `Message sent to session ${displayTarget || targetSessionId}` }],
          details: result.response.data,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (ctx?.hasUI) {
          ctx.ui.notify(`❌ ${message}`, "error");
        }
        return {
          content: [{ type: "text", text: `Failed: ${message}` }],
          isError: true,
          details: { error: message },
        };
      }
    },

    renderCall(args, theme) {
      const action = args.action ?? "send";
      const sessionRef = args.sessionName ?? args.sessionId ?? "...";
      const shortSessionRef = sessionRef.length > 12 ? `${sessionRef.slice(0, 8)}...` : sessionRef;

      let header = theme.fg("toolTitle", theme.bold("→ session "));
      header += theme.fg("accent", shortSessionRef);

      if (action === "send") {
        const mode = args.mode ?? "steer";
        const wait = args.wait_until;
        let info = theme.fg("muted", ` (${mode}`);
        if (wait) info += theme.fg("dim", `, wait: ${wait}`);
        info += theme.fg("muted", ")");
        header += info;
      } else {
        header += theme.fg("muted", ` (${action})`);
      }

      if (action === "send" && args.message) {
        const msg = args.message;
        const preview = msg.length > 80 ? `${msg.slice(0, 80)}...` : msg;
        const firstLine = preview.split("\n")[0];
        const hasMore = preview.includes("\n") || msg.length > 80;
        return new Text(
          `${header}\n  ${theme.fg("dim", `"${firstLine}${hasMore ? "..." : ""}"`)}\n`,
          0,
          0,
        );
      }

      return new Text(header, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as Record<string, unknown> | undefined;
      const isError = result.isError === true;

      if (isError || details?.error) {
        const text0 = result.content[0];
        const errorMsg =
          (details?.error as string) ||
          (text0?.type === "text" ? (text0 as { type: "text"; text: string }).text : "Unknown error");
        return new Text(theme.fg("error", `✗ ${errorMsg}`), 0, 0);
      }

      const hasMessage = details && "message" in details && details.message;
      const hasSummary = details && "summary" in details;
      const hasCleared = details && "cleared" in details;
      const hasTurnIndex = details && "turnIndex" in details;

      if (hasMessage) {
        const message = details.message as ExtractedMessage;
        const icon = theme.fg("success", "✓");

        if (expanded) {
          const container = new Container();
          container.addChild(new Text(`${icon}${theme.fg("muted", " Message received")}`, 0, 0));
          container.addChild(new Spacer(1));
          container.addChild(new Markdown(message.content, 0, 0, getMarkdownTheme()));
          if (hasTurnIndex) {
            container.addChild(new Spacer(1));
            container.addChild(new Text(theme.fg("dim", `Turn #${details.turnIndex}`), 0, 0));
          }
          return container;
        }

        const preview =
          message.content.length > 200 ? `${message.content.slice(0, 200)}...` : message.content;
        const lines = preview.split("\n").slice(0, 5);
        let text = `${icon}${theme.fg("muted", " Message received")}`;
        if (hasTurnIndex) text += theme.fg("dim", ` (turn #${details.turnIndex})`);
        text += `\n${theme.fg("toolOutput", lines.join("\n"))}`;
        if (message.content.split("\n").length > 5 || message.content.length > 200) {
          text += `\n${theme.fg("dim", "(Ctrl+O to expand)")}`;
        }
        return new Text(text, 0, 0);
      }

      if (hasSummary) {
        const summary = details.summary as string;
        const model = details.model as string | undefined;
        const icon = theme.fg("success", "✓");

        if (expanded) {
          const container = new Container();
          let header = `${icon}${theme.fg("muted", " Summary")}`;
          if (model) header += theme.fg("dim", ` via ${model}`);
          container.addChild(new Text(header, 0, 0));
          container.addChild(new Spacer(1));
          container.addChild(new Markdown(summary, 0, 0, getMarkdownTheme()));
          return container;
        }

        const preview = summary.length > 200 ? `${summary.slice(0, 200)}...` : summary;
        const lines = preview.split("\n").slice(0, 5);
        let text = `${icon}${theme.fg("muted", " Summary")}`;
        if (model) text += theme.fg("dim", ` via ${model}`);
        text += `\n${theme.fg("toolOutput", lines.join("\n"))}`;
        if (summary.split("\n").length > 5 || summary.length > 200) {
          text += `\n${theme.fg("dim", "(Ctrl+O to expand)")}`;
        }
        return new Text(text, 0, 0);
      }

      if (hasCleared) {
        const alreadyAtRoot = details.alreadyAtRoot as boolean | undefined;
        const icon = theme.fg("success", "✓");
        const msg = alreadyAtRoot ? "Session already at root" : "Session cleared";
        return new Text(`${icon} ${theme.fg("muted", msg)}`, 0, 0);
      }

      if (details && "delivered" in details) {
        const mode = details.mode as string | undefined;
        const icon = theme.fg("success", "✓");
        let text = `${icon}${theme.fg("muted", " Message delivered")}`;
        if (mode) text += theme.fg("dim", ` (${mode})`);
        return new Text(text, 0, 0);
      }

      const text = result.content[0];
      const content = text?.type === "text" ? (text as { type: "text"; text: string }).text : "(no output)";
      return new Text(`${theme.fg("success", "✓ ")}${theme.fg("muted", content)}`, 0, 0);
    },
  });
}

// ============================================================================
// Extension Export
// ============================================================================

export default function (pi: ExtensionAPI) {
  const state: SocketState = {
    server: null,
    socketPath: null,
    context: null,
    alias: null,
    aliasTimer: null,
    turnEndSubscriptions: [],
    daemonSubscription: null,
  };

  pi.registerMessageRenderer(SESSION_MESSAGE_TYPE, renderSessionMessage);

  registerRemoteCommand(pi, state);
  registerListRemotesTool(pi, state);
  registerSendToRemoteTool(pi, state);

  const refreshServer = async (ctx: ExtensionContext) => {
    try {
      await startControlServer(pi, state, ctx);
      if (!state.aliasTimer) {
        state.aliasTimer = setInterval(() => {
          if (!state.context) return;
          void syncAlias(state, state.context);
        }, 1000);
      }
      updateStatus(ctx, true);
      updateSessionEnv(ctx, true);

      // Subscribe to daemon events if daemon is already running
      subscribeToDaemonEvents(ctx, state);
    } catch (err) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `❌ Failed to start control socket: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    await refreshServer(ctx);
  });

  pi.on("session_switch", async (_event, ctx) => {
    await refreshServer(ctx);
  });

  pi.on("session_shutdown", async () => {
    if (state.aliasTimer) {
      clearInterval(state.aliasTimer);
      state.aliasTimer = null;
    }
    if (state.daemonSubscription) {
      try {
        state.daemonSubscription.destroy();
      } catch {
        // ignore
      }
      state.daemonSubscription = null;
    }
    updateStatus(state.context, false);
    updateSessionEnv(state.context, false);
    try {
      await stopControlServer(state);
    } catch {
      // ignore cleanup errors
    }
  });

  pi.on("turn_end", (event: TurnEndEvent, ctx: ExtensionContext) => {
    if (state.turnEndSubscriptions.length === 0) return;
    void syncAlias(state, ctx);

    const lastMessage = getLastAssistantMessage(ctx);
    const eventData = { message: lastMessage, turnIndex: event.turnIndex };
    const subscriptions = [...state.turnEndSubscriptions];
    state.turnEndSubscriptions = [];

    for (const sub of subscriptions) {
      writeEvent(sub.socket, {
        type: "event",
        event: "turn_end",
        data: eventData,
        subscriptionId: sub.subscriptionId,
      });
    }
  });
}
