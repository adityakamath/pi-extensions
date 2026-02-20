# Pi Remote Control Extension

## Overview

The Remote Control extension enables cross-machine communication and orchestration of Pi agent sessions, including:
- Per-session Unix control sockets (at `~/.pi/remote-control/<sessionId>.sock`)
- A background daemon (`~/.pi/remote-control/daemon.sock`) that monitors sessions, manages peer connections, and relays commands.
- RPC commands, event subscriptions, and peer management.
- Tools for interacting with any session (local or remote) and relaying messages across machines.

## Features
- Automatic creation of control sockets for each session
- Daemon service for peer discovery and command relay
- `/remote` command for peer management and session listing
- Tools:
  - `list_remotes`: Discover all live sessions (local/remote)
  - `send_to_remote`: Send messages, summaries, and commands to any session
- Alias symlinks for session discovery/use
- Peer discovery via TCP, supporting multi-machine and subnetwork coordination

## Usage

### Daemon
- The daemon is auto-started when `/remote` commands or tools are used.
- Spawn manually:
  ```bash
  node daemon.js
  # or
  npx tsx daemon.ts
  ```
- Daemon listens at `~/.pi/remote-control/daemon.sock` and on TCP (default port 7433).

### Commands
- `/remote add <host:port>`: Connect to a peer
- `/remote list`: List all sessions (local/remote)
- `/remote remove <host>`: Remove peer
- `/remote kill-daemon`: Stop daemon

### Tools (via Pi)
- `list_remotes`: Lists all live sessions
- `send_to_remote`: Send messages/commands to a session by ID or alias

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

## License
MIT
