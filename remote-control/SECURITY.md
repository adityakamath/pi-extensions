# Security: Pi Remote Control Extension

## Summary
The remote-control extension enables command and message relay between multiple Pi agent sessions (across machines) over TCP and local UNIX sockets. **Without additional network protection, this exposes a powerful surface for remote manipulation and is not authentication- or encryption-hardened by default.**

## Security Risks
**If you run on an open LAN, shared Wi-Fi, or any network reachable by others:**
- Any device that can reach the TCP port (default 7433) may:
  - List your sessions
  - Relay arbitrary commands/messages to your Pi sessions (message injection, summary access, clear, abort, etc.)
  - Subscribe for session and peer events
-  The connection is in plain JSON (unencrypted); traffic can be intercepted or spoofed on unsecured networks.
- The UNIX daemon control socket may be created with world- or group-writable permissions in rare cases, allowing local privilege escalation.

## Strongly Recommended: Use a Private VPN (like Tailscale)
**Best Practice:**
- Always run the remote-control extension on machines that are ONLY accessible by you, or place all peers within a private, strongly authenticated VPN (such as Tailscale).
- **Tailscale mitigates remote attacks**: Only your authenticated devices in your private tailnet can reach the daemon's TCP port or sockets.
- Traffic is end-to-end encrypted between tailnet members, eliminating LAN snooping/packet injection risks.
- You are safe from most external attacks, provided EVERY device in your tailnet is trusted and uncompromised.

## Known Open Issues / Incomplete Security Features
There are a few advanced features not yet implemented in this extension for fine-grained production/multi-user/public use, such as:
- Per-peer or per-session access control/permissions
- Consent/approval for session actions
- Temporary or read-only sharing
- Advanced Tailscale peer configuration

**These are NOT a practical concern if:**
- You *only* use Pi remote-control on a private and fully trusted Tailscale/LAN, and
- You trust all devices and users in your network/tailnet
- You regularly check that no untrusted device is present in your Tailscale network

> **If your Tailscale tailnet is private, device-managed and uncompromised, these are theoretical issues and do not pose practical risk.**

If your network ever broadens outside your direct control/ownership (e.g., contractors, open LAN, or untrusted machines), you **must** reconsider these risks and possibly implement missing features.

## Remaining Risks Even With VPN/Tailscale
- Any device/user in your tailnet can connect to your daemon port, relay commands, and interact with your sessions as if local.
- If any device in your tailnet is compromised (malware, or user turns malicious), it can control your Pi agents across all your Tailscale devices.
- Local untrusted processes/users may interact with the UNIX daemon.sock if file permissions are not set strictly (see hardening tips below).

## Hardening and Usage Recommendations
- **Do NOT use this extension on open or shared networks without network-layer protection!**
- Restrict tailnet membership to devices you own and trust.
- Monitor for new/unexpected devices joining your tailnet. Remove them if unsure.
- By default, the extension does not provide authentication for new remote peers. Use the network to enforce access.
- Prefer to run only ONE daemon per device (default config).
- For maximum security, combine Tailscale with host firewalls (block port 7433 from LAN).
- If you require multi-user collaboration with less than full trust, you should implement additional controls or consider another flow.

## UNIX Socket Hardening (Local)
- The daemon creates ~/.pi/remote-control/daemon.sock, which should only be accessible to your user.
- The extension attempts to chmod daemon.sock with 0600 (owner only). If your umask or environment interferes, check and fix permissions:
  ```bash
  chmod 600 ~/.pi/remote-control/daemon.sock
  ```

## Open Risks If Not Using VPN/Tailscale
- Any user on the network can discover or manipulate your Pi agent sessions—**do NOT use without network security**.

## License
MIT

---
For any questions or to contribute security improvements (e.g., mTLS or per-peer secrets), see the project repository or contact the author.
