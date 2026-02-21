// Simple in-memory rate limiter for remote-control daemon per-remote-peer.
const WINDOW_MS = 60_000; // 1 minute windows
const LIMIT = 30;         // 30 relay actions per peer per minute (can adjust)

const state = new Map<string, {count: number, window: number}>();

export function checkRateLimit(peerKey: string): boolean {
  const now = Date.now();
  const currentWindow = Math.floor(now / WINDOW_MS);
  let entry = state.get(peerKey);
  if (!entry || entry.window !== currentWindow) {
    state.set(peerKey, { count: 1, window: currentWindow });
    return true;
  }
  if (entry.count < LIMIT) {
    entry.count++;
    return true;
  }
  return false;
}
