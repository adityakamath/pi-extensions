// test-remote-control.ts
// Demo script for Pi Remote Control Extension
// Simple test flows: daemon start, list_sessions, relay, add_peer

import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";

const DAEMON_SOCK = path.join(process.env.HOME || "", ".pi/remote-control/daemon.sock");

function connectDaemon(cmd: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(DAEMON_SOCK);
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(JSON.stringify(cmd) + "\n");
    });
    socket.on("data", (chunk) => {
      buf += chunk;
      if (buf.includes("\n")) {
        try {
          resolve(JSON.parse(buf.split("\n")[0]));
        } catch (e) {
          reject(e);
        }
        socket.end();
      }
    });
    socket.on("error", reject);
  });
}

async function main() {
  console.log("--- Pi Remote Control Extension Demo ---");
  try {
    // Status
    const status = await connectDaemon({ type: "status" });
    console.log("Daemon status:", status);

    // List sessions
    const sessions = await connectDaemon({ type: "list_sessions" });
    console.log("Sessions:", sessions);

    // Send relay to first session
    if (sessions.data && sessions.data.sessions && sessions.data.sessions.length > 0) {
      const sessionId = sessions.data.sessions[0].sessionId;
      const relay = await connectDaemon({ type: "relay", targetSessionId: sessionId, rpcCommand: { type: "get_message" }, requestId: "demo1" });
      console.log("Relay response:", relay);
    }

    // Add peer (localhost:7434, must be running)
    try {
      const addPeer = await connectDaemon({ type: "add_peer", host: "localhost:7434" });
      console.log("Add peer:", addPeer);
    } catch (e) {
      console.log("Add peer failed (make sure peer daemon runs on port 7434)", e);
    }

  } catch (e) {
    console.error("Demo failed:", e);
  }
}

main();
