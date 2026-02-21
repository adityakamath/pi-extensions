import { remotePeers } from './daemon.js';
import fs from 'node:fs';
import path from 'node:path';
import { CONTROL_DIR } from './shared.js';

export function listPeers() {
  // Returns connected remote peers for UI/debug info (host, connected, lastSeen, sessionCount)
  return Array.from(remotePeers.values()).map(peer => ({
    host: peer.host,
    port: peer.port,
    connected: peer.connected,
    lastSeen: new Date(peer.lastSeen).toISOString(),
    sessionCount: peer.sessions.size
  }));
}

export function showRecentAuditEntries(count = 10) {
  const fp = path.join(CONTROL_DIR, 'audit.log');
  if (!fs.existsSync(fp)) return [];
  const lines = fs.readFileSync(fp, 'utf-8').trim().split('\n');
  return lines.slice(-count).map(line => {
    try { return JSON.parse(line); } catch { return { error: 'corrupt', line }; }
  });
}
