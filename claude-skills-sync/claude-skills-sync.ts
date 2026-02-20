import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readdirSync, lstatSync, readlinkSync, symlinkSync, unlinkSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const SOURCE_DIR = "/Users/adityakamath/Documents/Pi/pi-skills";
const TARGET_DIR = "/Users/adityakamath/.claude/skills";
const EXCLUDE = ["LICENSE", "README.md", ".git", ".DS_Store"];

function syncSkills(pi: ExtensionAPI): string[] {
    if (!existsSync(SOURCE_DIR) || !existsSync(TARGET_DIR)) {
        return [];
    }

    const sourceItems = readdirSync(SOURCE_DIR)
        .filter(item => !EXCLUDE.includes(item) && !item.startsWith("."));
    
    const targetItems = readdirSync(TARGET_DIR);
    const changes: string[] = [];

    // 1. Remove stale symlinks
    for (const item of targetItems) {
        if (!sourceItems.includes(item)) {
            const targetPath = join(TARGET_DIR, item);
            try {
                const stats = lstatSync(targetPath);
                if (stats.isSymbolicLink()) {
                    unlinkSync(targetPath);
                    changes.push(`Removed stale link: ${item}`);
                }
            } catch (e) {}
        }
    }

    // 2. Create missing symlinks
    for (const item of sourceItems) {
        const sourcePath = join(SOURCE_DIR, item);
        const targetPath = join(TARGET_DIR, item);

        if (!existsSync(targetPath)) {
            try {
                symlinkSync(sourcePath, targetPath);
                changes.push(`Created new link: ${item}`);
            } catch (e: any) {
                changes.push(`Error creating link for ${item}: ${e.message}`);
            }
        }
    }

    return changes;
}

export default function (pi: ExtensionAPI) {
    // Run on session start
    pi.on("session_start", async (_event, ctx) => {
        const changes = syncSkills(pi);
        if (changes.length > 0) {
            ctx.ui.notify(`Claude skills synced: ${changes.length} changes applied.`, "info");
        }
    });

    // Run after bash commands that look like git updates in the skills dir
    pi.on("tool_result", async (event, ctx) => {
        if (event.toolName === "bash" && !event.isError) {
            const cmd = (event.input as any).command || "";
            if (cmd.includes("git pull") || cmd.includes("git checkout") || cmd.includes("git reset")) {
                const changes = syncSkills(pi);
                if (changes.length > 0) {
                    ctx.ui.notify(`Git update detected. Claude skills synced: ${changes.length} changes.`, "info");
                }
            }
        }
    });

    // Manual sync command
    pi.registerCommand("sync-claude-skills", {
        description: "Synchronize symlinks from ~/Documents/Pi/pi-skills to ~/.claude/skills",
        handler: async (_args, ctx) => {
            const changes = syncSkills(pi);
            if (changes.length > 0) {
                ctx.ui.notify(`Claude skills synced:\n${changes.join("\n")}`, "success");
            } else {
                ctx.ui.notify("Claude skills are already up to date.", "info");
            }
        },
    });
}
