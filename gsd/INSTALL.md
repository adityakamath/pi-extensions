# GSD Extension - Complete Installation Summary

## ✅ Installation Complete

Your Get Shit Done (GSD) extension for Pi is fully installed and ready to use.

**Location:** `~/.pi/agent/extensions/`

## 📦 Files

| File | Size | Purpose |
|------|------|---------|
| **gsd.ts** | 37 KB | Main extension (22 commands, 1,223 lines) |
| **GSD-QUICKSTART.md** | 3.8 KB | 30-second quick start guide |
| **GSD-GUIDE.md** | 9.6 KB | Comprehensive user guide with tips |
| **README.md** | 3.1 KB | Quick reference and command list |
| **INSTALL.md** | This file | Installation summary |

## 🚀 Quick Start (3 Steps)

### 1. Reload Extension
```
/reload
```

### 2. Verify Installation
```
/gsd:help
```

### 3. Start First Project
```
/gsd:new-project
```

## 📋 22 Commands Available

**New Projects**
- `/gsd:new-project [--auto]` — Full project planning
- `/gsd:map-codebase` — Analyze existing code

**Progress & Status**
- `/gsd:progress` — Where am I? (routes to next action)
- `/gsd:health` — Project health check
- `/gsd:check-todos` — Current tasks & blockers

**Phase Workflows** (repeat for each phase)
- `/gsd:research-phase [N]` — Parallel research on domain
- `/gsd:plan-phase [N]` — Plan phase with milestones
- `/gsd:discuss-phase [N]` — Validate approach
- `/gsd:execute-phase [N]` — Build the phase
- `/gsd:complete-phase [N]` — Wrap up with audit

**Milestone Management**
- `/gsd:complete-milestone` — Mark milestone done
- `/gsd:audit-milestone` — Verify acceptance criteria
- `/gsd:plan-milestone-gaps` — Find integration points

**Roadmap Management**
- `/gsd:add-phase` — Add phase to roadmap
- `/gsd:insert-phase [pos]` — Insert at position
- `/gsd:remove-phase [N]` — Remove phase

**Planning & Risk**
- `/gsd:list-phase-assumptions` — Extract & validate assumptions

**Work State**
- `/gsd:pause-work` — Save state, take a break
- `/gsd:resume-work` — Resume from pause
- `/gsd:reapply-patches` — Port work between branches

**Troubleshooting**
- `/gsd:debug` — Debug issues & blockers

## 💡 Core Workflow

```
/gsd:new-project
     ↓
/gsd:research-phase 1      (optional)
     ↓
/gsd:plan-phase 1
     ↓
/gsd:execute-phase 1
     ↓ (frequently)
/gsd:check-todos
     ↓ (as you finish)
/gsd:complete-milestone
     ↓
/gsd:complete-phase 1
     ↓
Repeat for phases 2+
```

**Anytime:**
- `/gsd:progress` — Get situational awareness
- `/gsd:pause-work` — Taking a break?
- `/gsd:debug` — Something's wrong?

## 📁 What Gets Created

After `/gsd:new-project`, you'll have:

```
.planning/
├── PROJECT.md                  Project overview
├── REQUIREMENTS.md             V1/V2/out-of-scope
├── ROADMAP.md                  Phases & requirements
├── STATE.md                    Progress tracking
├── config.json                 Preferences
├── research/
│   └── phase-N-research.md
└── phases/
    ├── phase-N.md              Phase plan
    ├── phase-N-assumptions.md   Assumptions
    └── phase-N-summary.md       Completion summary
```

## 🎯 Pro Tips

1. **Use @references to include context**
   ```
   @.planning/PROJECT.md "What's the goal?"
   @.planning/phases/phase-1.md "What's next?"
   ```

2. **Check progress frequently**
   ```
   /gsd:progress      Anytime you're unsure
   /gsd:check-todos   During execution
   /gsd:health        Is project healthy?
   ```

3. **Research before big phases**
   ```
   /gsd:research-phase 2
   /gsd:list-phase-assumptions 2
   ```

4. **Pause strategically**
   ```
   /gsd:pause-work    Before breaks
   /gsd:resume-work   When returning
   ```

## 📖 Documentation

**Quick Reference:**
- Type `/gsd:help` in Pi for command list
- `cat ~/.pi/agent/extensions/README.md`

**Quick Start:**
- `cat ~/.pi/agent/extensions/GSD-QUICKSTART.md`

**Full Guide:**
- `cat ~/.pi/agent/extensions/GSD-GUIDE.md`
- Include in messages: `@GSD-GUIDE.md "How do I...?"`

## ✨ Key Features

✅ **Spec-driven development** — Question → Research → Requirements → Roadmap

✅ **Incremental delivery** — Phases → Milestones → Done (value at each step)

✅ **State tracking** — STATE.md always shows where you are

✅ **Pausable workflows** — Save state, take breaks, resume seamlessly

✅ **Risk mitigation** — Research, assumptions, gap planning before execution

✅ **Context engineering** — Full project state in `.planning/` files

✅ **Pi-native** — Uses Pi's API, tools, and session system

## 🎮 Try It Now

In Pi:

```
/gsd:help              See all commands
/gsd:new-project       Start a new project
```

Or analyze existing code first:

```
/gsd:map-codebase
/gsd:new-project
```

## ✅ Status

**READY TO USE**

The extension auto-loads with Pi. No additional setup needed.

Just start using `/gsd:new-project` to begin!

---

For questions, check the guides:

```bash
cat ~/.pi/agent/extensions/GSD-GUIDE.md
```

Happy building! 🚀
