import * as fs from "node:fs";
import * as path from "node:path";
import { CONTROL_DIR } from "./shared.js";

const AUDIT_LOG = path.join(CONTROL_DIR, "audit.log");

export interface AuditLogEntry {
  timestamp: string;
  peer: string;
  action: string;
  data?: string;
  result: "ok" | "fail";
  error?: string;
}

export function logAudit(entry: AuditLogEntry) {
  const line = JSON.stringify(entry) + "\n";
  try {
    fs.appendFileSync(AUDIT_LOG, line, { encoding: "utf8" });
  } catch {}
}
