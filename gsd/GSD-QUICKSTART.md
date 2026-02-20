# GSD Extension for Pi - Installation & Quick Start

## ✅ Installation Complete

Your GSD extension is installed and ready to use:
- **Extension:** `~/.pi/agent/extensions/gsd.ts` (37KB, 22 commands)
- **Guide:** `~/.pi/agent/extensions/GSD-GUIDE.md` (detailed documentation)

## 🚀 Get Started in 30 Seconds

1. **Reload the extension** (after Pi restarts or use `/reload`):
   ```bash
   /reload
   ```

2. **See all commands:**
   ```bash
   /gsd:help
   ```

3. **Start a new project:**
   ```bash
   /gsd:new-project
   ```

## 📋 The 22 Commands

**Project Setup:**
- `/gsd:new-project [--auto]` — New project with full planning
- `/gsd:map-codebase` — Analyze existing code first

**Progress & Status:**
- `/gsd:progress` — What's next?
- `/gsd:health` — Is project healthy?
- `/gsd:check-todos` — Current tasks & blockers

**Phase Work (Repeats for Each Phase):**
1. `/gsd:research-phase N` — Research domain (optional)
2. `/gsd:plan-phase N` — Plan phase with milestones
3. `/gsd:discuss-phase N` — Validate approach (optional)
4. `/gsd:list-phase-assumptions N` — Surface risks
5. `/gsd:plan-milestone-gaps N` — Find integration points
6. `/gsd:execute-phase N` — Build the phase
7. `/gsd:complete-milestone` — Mark milestones done as you go
8. `/gsd:audit-milestone` — Verify acceptance criteria
9. `/gsd:complete-phase N` — Wrap up phase with summary

**Roadmap Management:**
- `/gsd:add-phase` — New phase to roadmap
- `/gsd:insert-phase [pos]` — Insert at position
- `/gsd:remove-phase [N]` — Remove phase

**Breaks & State:**
- `/gsd:pause-work` — Save state, take a break
- `/gsd:resume-work` — Get back to work
- `/gsd:reapply-patches` — Port work between branches

**Troubleshooting:**
- `/gsd:debug` — Stuck? Debug it

## 📁 Project Files Created

After `/gsd:new-project`:
```
.planning/
├── PROJECT.md              # Project overview
├── REQUIREMENTS.md         # V1/V2/out-of-scope
├── ROADMAP.md              # Phases & requirements
├── STATE.md                # Current progress
├── config.json             # Workflow preferences
├── research/
│   └── phase-1-research.md # Research findings
└── phases/
    ├── phase-1.md          # Detailed phase plan
    ├── phase-1-assumptions.md
    └── phase-1-summary.md  # After phase completes
```

## 💡 Key Tip: Use @references

Include planning files in your messages:
```
@.planning/PROJECT.md          Include project context
@.planning/phases/phase-1.md   Include current phase
```

This keeps the AI aligned with your full project state.

## 🎯 Workflow at a Glance

```
/gsd:new-project
    ↓
/gsd:research-phase 1       (optional)
    ↓
/gsd:plan-phase 1
    ↓
/gsd:execute-phase 1
    ↓
/gsd:check-todos            (frequently)
    ↓
/gsd:complete-milestone     (as milestones finish)
    ↓
/gsd:complete-phase 1
    ↓
Repeat for remaining phases
```

When unsure: `/gsd:progress`
When stuck: `/gsd:debug`
When breaking: `/gsd:pause-work`

## 📖 Full Documentation

Read the detailed guide for more:
```bash
cat ~/.pi/agent/extensions/GSD-GUIDE.md
```

Or access it in Pi:
```bash
@~/.pi/agent/extensions/GSD-GUIDE.md  "Explain X"
```

## ✨ What You Get

✅ **Spec-driven development** — Plan before building  
✅ **Incremental delivery** — Phases → Milestones → Done  
✅ **State tracking** — Always know where you are  
✅ **Risk mitigation** — Research, assumptions, gaps  
✅ **Context engineering** — Full project state in files  
✅ **Pausable workflows** — Save, break, resume seamlessly  
✅ **Built for Pi** — Uses Pi's tools, sessions, and architecture  

## 🎮 Try It Now

```bash
/gsd:help
```

Then pick a workflow:
```bash
/gsd:new-project                # Start something new
/gsd:map-codebase && /gsd:new-project  # Analyzing existing code
```

Enjoy building great things! 🚀
