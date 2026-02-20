/**
 * patch-bash-tool.ts — Auto-patch pi-coding-agent's bash.js after npm updates.
 *
 * Fixes two known bugs in the distributed bash.js:
 *   1. onUpdate called without a type guard → "TypeError: onUpdate is not a function"
 *   2. signal.removeEventListener used on Node EventEmitter-style signals
 *      → "signal.removeEventListener is not a function"
 *
 * On session_start this extension reads the installed bash.js, checks whether
 * the unpatched patterns are present, applies surgical replacements, writes
 * the file back, and notifies the user to restart pi.
 *
 * The patches are idempotent — if the file is already patched, nothing happens.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

// Resolve the installed bash.js location relative to the pi-coding-agent package
function getBashJsPath(): string {
  try {
    const pkgRoot = dirname(
      require.resolve("@mariozechner/pi-coding-agent/package.json")
    );
    return join(pkgRoot, "dist", "core", "tools", "bash.js");
  } catch {
    return "/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/dist/core/tools/bash.js";
  }
}

// ---------------------------------------------------------------------------
// Each patch: a detect function (returns true if unpatched) and an apply
// function (returns the patched source).
// ---------------------------------------------------------------------------

interface Patch {
  name: string;
  needsPatch: (source: string) => boolean;
  apply: (source: string) => string;
}

const patches: Patch[] = [
  // --- Patch 1: Guard onUpdate call ---
  // Matches "if (onUpdate) {" or "if (onUpdate ) {" but NOT the patched version
  // which includes 'typeof onUpdate === "function"'
  {
    name: "onUpdate guard",
    needsPatch: (s) =>
      /if\s*\(\s*onUpdate\s*\)\s*\{/.test(s) &&
      !s.includes('typeof onUpdate === "function"'),
    apply: (s) =>
      s.replace(
        /if\s*\(\s*onUpdate\s*\)\s*\{/g,
        'if (onUpdate && typeof onUpdate === "function") {'
      ),
  },

  // --- Patch 2a: Signal cleanup in error handler ---
  {
    name: "signal cleanup in error handler",
    needsPatch: (s) =>
      s.includes(
        `child.on("error", (err) => {\n` +
        `                if (timeoutHandle)\n` +
        `                    clearTimeout(timeoutHandle);\n` +
        `                if (signal)\n` +
        `                    signal.removeEventListener("abort", onAbort);`
      ),
    apply: (s) =>
      s.replace(
        `child.on("error", (err) => {\n` +
        `                if (timeoutHandle)\n` +
        `                    clearTimeout(timeoutHandle);\n` +
        `                if (signal)\n` +
        `                    signal.removeEventListener("abort", onAbort);`,

        `child.on("error", (err) => {\n` +
        `                if (timeoutHandle)\n` +
        `                    clearTimeout(timeoutHandle);\n` +
        `                if (signalCleanup)\n` +
        `                    signalCleanup();`
      ),
  },

  // --- Patch 2b: Signal handling — add signalCleanup and DOM/EventEmitter detection ---
  {
    name: "signal handling (DOM vs EventEmitter)",
    needsPatch: (s) =>
      s.includes(
        `if (signal) {\n` +
        `                if (signal.aborted) {\n` +
        `                    onAbort();\n` +
        `                }\n` +
        `                else {\n` +
        `                    signal.addEventListener("abort", onAbort, { once: true });\n` +
        `                }\n` +
        `            }`
      ),
    apply: (s) =>
      s.replace(
        `if (signal) {\n` +
        `                if (signal.aborted) {\n` +
        `                    onAbort();\n` +
        `                }\n` +
        `                else {\n` +
        `                    signal.addEventListener("abort", onAbort, { once: true });\n` +
        `                }\n` +
        `            }`,

        `let signalCleanup;\n` +
        `            if (signal) {\n` +
        `                if (signal.aborted) {\n` +
        `                    onAbort();\n` +
        `                }\n` +
        `                else if (typeof signal.addEventListener === "function") {\n` +
        `                    // DOM-style AbortSignal\n` +
        `                    signal.addEventListener("abort", onAbort, { once: true });\n` +
        `                    signalCleanup = () => signal.removeEventListener("abort", onAbort);\n` +
        `                }\n` +
        `                else if (typeof signal.once === "function") {\n` +
        `                    // Node.js EventEmitter-style signal\n` +
        `                    signal.once("abort", onAbort);\n` +
        `                    signalCleanup = () => signal.off?.("abort", onAbort);\n` +
        `                }\n` +
        `            }`
      ),
  },

  // --- Patch 2c: Signal cleanup in close handler ---
  {
    name: "signal cleanup in close handler",
    needsPatch: (s) =>
      s.includes(
        `child.on("close", (code) => {\n` +
        `                if (timeoutHandle)\n` +
        `                    clearTimeout(timeoutHandle);\n` +
        `                if (signal)\n` +
        `                    signal.removeEventListener("abort", onAbort);`
      ),
    apply: (s) =>
      s.replace(
        `child.on("close", (code) => {\n` +
        `                if (timeoutHandle)\n` +
        `                    clearTimeout(timeoutHandle);\n` +
        `                if (signal)\n` +
        `                    signal.removeEventListener("abort", onAbort);`,

        `child.on("close", (code) => {\n` +
        `                if (timeoutHandle)\n` +
        `                    clearTimeout(timeoutHandle);\n` +
        `                if (signalCleanup)\n` +
        `                    signalCleanup();`
      ),
  },
];

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const bashJsPath = getBashJsPath();

    let source: string;
    try {
      source = readFileSync(bashJsPath, "utf-8");
    } catch {
      // Can't read — maybe permissions or path changed. Silently skip.
      return;
    }

    const applied: string[] = [];

    for (const patch of patches) {
      if (!patch.needsPatch(source)) {
        continue;
      }

      const updated = patch.apply(source);
      if (updated === source) {
        // Replace didn't change anything (shouldn't happen if detect matched)
        continue;
      }

      source = updated;
      applied.push(patch.name);
    }

    if (applied.length === 0) {
      return;
    }

    // Write patched file
    try {
      writeFileSync(bashJsPath, source, "utf-8");
    } catch (err: any) {
      ctx.ui.notify(
        `⚠️  patch-bash-tool: Could not write ${bashJsPath}: ${err.message}. Check file permissions.`,
        "error"
      );
      return;
    }

    ctx.ui.notify(
      `🔧 patch-bash-tool: Applied ${applied.length} fix(es) to bash.js [${applied.join(", ")}]. Restart pi for changes to take effect.`,
      "warning"
    );
  });
}
