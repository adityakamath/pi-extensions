// Enforce a max bytes/length limit per incoming request to daemon/peer
export const MAX_MSG_BYTES = 8192; // 8 KB per logical message

export function checkMaxMsgSize(chunk: string | Buffer): boolean {
  if (typeof chunk === "string") {
    return Buffer.byteLength(chunk, "utf8") <= MAX_MSG_BYTES;
  }
  return chunk.length <= MAX_MSG_BYTES;
}
