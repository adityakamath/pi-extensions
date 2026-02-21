// async-reply-test.ts
// Integration test: async reply for local and remote Pi sessions

import * as net from "node:net";
import * as path from "node:path";

const CONTROL_DIR = path.join(process.env.HOME || "", ".pi/remote-control");
const DAEMON_SOCK = path.join(CONTROL_DIR, "daemon.sock");

function sendToSession(sessionId: string, message: string, waitForTurnEnd = false): Promise<any> {
  return new Promise((resolve, reject) => {
    const socketPath = path.join(CONTROL_DIR, `${sessionId}.sock`);
    const socket = net.createConnection(socketPath);
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(JSON.stringify({ type: "send", message }) + "\n");
      if (waitForTurnEnd) {
        socket.write(JSON.stringify({ type: "subscribe", event: "turn_end" }) + "\n");
      }
    });
    socket.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split("\n");
      for (const line of lines) {
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "event" && evt.event === "turn_end") {
            resolve(evt.data);
            socket.end();
            return;
          }
        } catch { /* ignore */ }
      }
    });
    socket.on("error", reject);
  });
}

function sendRemoteViaDaemon(targetSessionId: string, message: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(DAEMON_SOCK);
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(
        JSON.stringify({
          type: "relay",
          targetSessionId,
          rpcCommand: { type: "send", message },
          requestId: "async-test",
        }) + "\n"
      );
      // Optionally: subscribe to event back from remote
    });
    socket.on("data", (chunk) => {
      buf += chunk;
      // Daemon may relay events here
      const lines = buf.split("\n");
      for (const line of lines) {
        if (!line) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "event" && evt.event === "turn_end") {
            resolve(evt.data);
            socket.end();
            return;
          }
        } catch { /* ignore */ }
      }
    });
    socket.on("error", reject);
  });
}

async function main() {
  // Replace with actual session IDs for your test setup
  const localSessionId = "your-local-session-id";
  const remoteSessionId = "your-remote-session-id";

  console.log("Testing local async reply...");
  try {
    const reply = await sendToSession(localSessionId, "Test local async reply!", true);
    console.log("Local reply:", reply);
  } catch (err) {
    console.log("Local session failed:", err);
  }

  console.log("Testing remote async reply via daemon relay...");
  try {
    const reply = await sendRemoteViaDaemon(remoteSessionId, "Test remote async reply!");
    console.log("Remote reply:", reply);
  } catch (err) {
    console.log("Remote session failed:", err);
  }
}

main();
