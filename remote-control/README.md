# Pi Remote Control Extension

## Overview

The Remote Control extension enables cross-machine communication and orchestration of Pi agent sessions, including:
- Per-session Unix control sockets (at `~/.pi/remote-control/<sessionId>.sock`)
- A background daemon (`~/.pi/remote-control/daemon.sock`) that monitors sessions, manages peer connections, and relays commands.
- Tools for interacting with any session (local or remote) and relaying messages across machines.

## Features
- Automatic creation of control sockets for each session
- Daemon service for peer discovery and command relay
- Tools:
  - `list_remotes`: Discover all live sessions (local/remote)
  - `send_to_remote`: Send messages, summaries, and commands to any session
  - `/start-daemon`: Start the daemon
  - `/kill-daemon`: Stop the daemon
- Alias symlinks for session discovery/use
- Peer discovery via TCP, supporting multi-machine and subnetwork coordination

## Usage

### Daemon
- The daemon is auto-started when tools or `/start-daemon` are used.
- Spawn manually:
  ```bash
  node daemon.js
  # or
  npx tsx daemon.ts
  ```
- Daemon listens at `~/.pi/remote-control/daemon.sock` and on TCP (default port 7433).

### Commands
- `/start-daemon`: Start the remote control daemon (background process)
- `/kill-daemon`: Stop the daemon

### Tools (via Pi)
- `list_remotes`: Lists all live sessions
- `send_to_remote`: Send messages/commands to a session by ID or alias
- `add_peer`: Connect to another machine/peer
- `remove_peer`: Disconnect a peer
- `list_peers`: Enumerate known peers
- `list_tailscale`: Tailscale network peer discovery

### Session Sockets
- Each session exposes a UNIX socket: `~/.pi/remote-control/<sessionId>.sock`
- Aliases symlink to sockets, enabling easy lookup

## Building

- TypeScript sources: `daemon.ts`, `shared.ts`, `index.ts`
- Compile:
  ```bash
  npx esbuild shared.ts --outfile=shared.js --platform=node --format=esm --target=node18
  npx esbuild daemon.ts --outfile=daemon.js --platform=node --format=esm --target=node18
  ```

## Integration
- Extension is auto-discovered via pi-extensions CLI.
- Manifest (`pi-extension.json`) for metadata is included.

## Testing/Demo

See included `demo/test-remote-control.ts` for sample test/demo script.
- Tests daemon spawn, session listing, peer add/remove, relay commands.

## Directory Structure

```
remote-control/
├── daemon.ts
├── daemon.js
├── shared.ts
├── shared.js
├── index.ts
├── package.json
├── README.md
├── pi-extension.json
└── demo/
    └── test-remote-control.ts
```

## Security

**Important: this extension is NOT safe to run on open networks (public Wi-Fi, hotel LANs, shared LANs, or cloud VMs exposed to the Internet) unless you secure it with a VPN (such as Tailscale).

- Anyone who can reach your machine’s TCP port (default 7433) can relay commands/messages to your agent sessions, including abort/clear/send and listing sessions, unless you use a private network like Tailscale.
- The extension protocol is unencrypted and unauthenticated unless run over a private VPN — do NOT expose it to untrusted networks.
- Using Tailscale (or equivalent VPN):
  - Traffic is end-to-end encrypted.
  - Only trusted devices in your tailnet can interact with your daemon.
  - You must ensure EVERY device authorized in your tailnet is under your control/trusted.
  - Malicious or compromised tailnet devices can still access/control your extension.
- For further details, best practices, and hardening, see [SECURITY.md](./SECURITY.md).

## Features

### Core Protocol & Daemon
- Per-session Unix control sockets for each Pi agent session (`~/.pi/remote-control/<sessionId>.sock`)
- Background daemon for session/peer discovery, event relay, and command routing (local & remote)
- Alias symlinks for session discovery/use
- Peer discovery via TCP (multi-machine and subnet coordination)

### Security & Safety
- Audit logging for all relay actions
- Relay rate limiting (30 actions/minute per peer)
- Incoming message size limit (8kb, prevents flooding/abuse)
- UNIX socket permissions lockdown (owner-only access)

### Pi Tools & Commands (API Reference)

Below is a complete list of available tools and commands, callable from Pi or other scripts/agents:

- **showSessionHistory({ sessionId, count })**: List recent relay actions for a given session (with timestamp, peer, action, result, error).
- **listRemotePeers()**: List all remote peers (host, port, session count, last seen).
- **tailAuditLog({ count })**: Show the last N actions from the audit log (peer, action, result, error).
- **broadcastAction({ rpcType, payload })**: Broadcast a command to all discovered sessions (e.g., abort/send/debug). Returns affected session IDs.
- **checkVersion()**: Returns the current package version for the extension.
- **getRelayStats()**: Return statistics from the audit log: number of relays, number of unique peers, number of sessions.

- **send_to_remote({ sessionId, message, ... })**: Send messages/commands to any session by ID or alias.
- **list_remotes()**: Discover all live sessions (local/remote).
- **add_peer({ host, port })**: Connect to another machine/peer by hostname/tailnet/IP.
- **remove_peer({ host })**: Disconnect a remote peer.
- **list_peers()**: Enumerate known peers currently connected.
- **list_tailscale()**: List all visible Tailscale tailnet devices/peers.

- **/start-daemon**: Start the remote-control daemon in the background (socket/TCP listen).
- **/kill-daemon**: Stop (kill) the background daemon process.

> For tool usage, see examples in this README and/or call with the required parameters. Tools return structured results that can be used in Pi scripts, automation, agent flows, or command-line invocations.

### Integration & Testing
- Extension auto-discovered via pi-extensions CLI, with manifest (`pi-extension.json`)
- Basic integration/unit tests for logs, peers, rate limit, relay, and history

### Build Instructions
- Compile TypeScript sources:
  ```bash
  npx esbuild shared.ts --outfile=shared.js --platform=node --format=esm --target=node18
  npx esbuild daemon.ts --outfile=daemon.js --platform=node --format=esm --target=node18
  ```

## Installation

1. Copy or clone the `remote-control` extension directory into your `pi-extensions` folder.
2. Run build commands to compile TypeScript modules.
3. Pi will auto-discover the extension and expose its tools.

## Usage

- Start the daemon automatically (via tools) or manually:
  ```bash
  node daemon.js
  # or
  npx tsx daemon.ts
  ```
- Use Pi agent tools (listed above) for session/peer discovery, action relay, history, stats, and more.
- Integrate with your Pi agent workflows/scripts as needed.

## Security

**This extension is NOT safe to run on open networks unless protected by a VPN like Tailscale.**

- On open/unsafe networks, anyone can issue remote-control commands unless you lock down access.
- Using Tailscale (or equivalent VPN): Only trusted devices can access/control your daemon; traffic is encrypted.
- See [SECURITY.md](./SECURITY.md) for more details, best practices, and open security features.

## Future Scope
Advanced features planned or possible:
- Live session dashboard / web UI
- Real-time notification system
- Remote agent health checks
- Webhooks or script hooks
- Authentication provider integration (Tailscale ACLs, OAuth, TOTP, etc.)
- Automatic backup and session archiving
- Permissions “dry run”/audit mode
- One-time relay tokens (secure ephemeral commands)

These features require broader architectural changes and are best suited for production or collaborative multi-user environments.

## License
MIT
