# GSD (Get Shit Done) Extension for Pi

A complete spec-driven development system for Pi based on the [Get Shit Done](https://github.com/gsd-build/get-shit-done) framework. Brings context engineering, incremental delivery, and state management to Pi workflows.

## Installation

The extension is located at `~/.pi/agent/extensions/gsd.ts`. It auto-loads when Pi starts.

**To reload after updates:**
```bash
/reload
```

**Verify it loaded:**
```bash
/gsd:help
```

## Quick Start

### New Project (From Scratch)
```bash
/gsd:new-project
```

Answers comprehensive questions about your project, then creates:
- `.planning/PROJECT.md` — Project overview
- `.planning/REQUIREMENTS.md` — V1/V2/scope
- `.planning/ROADMAP.md` — Phases with requirements
- `.planning/STATE.md` — Progress tracking
- `.planning/config.json` — Workflow preferences

### Existing Project
```bash
/gsd:map-codebase
```

Analyzes your existing code before planning new work.

### Start Building
```bash
/gsd:plan-phase 1
/gsd:execute-phase 1
```

## Command Reference

### 22 Total Commands

#### Project Initialization (2)
- **`/gsd:new-project [--auto]`** — Initialize new project with full planning
- **`/gsd:map-codebase`** — Analyze existing codebase before planning

#### Progress & Awareness (3)
- **`/gsd:progress`** — Check progress and get routed to next action
- **`/gsd:health`** — Check overall project health
- **`/gsd:check-todos`** — Review current TODOs and milestones

#### Phase Management (6)
- **`/gsd:plan-phase [N]`** — Plan Phase N with milestones
- **`/gsd:execute-phase [N]`** — Execute Phase N incrementally
- **`/gsd:complete-phase [N]`** — Mark phase complete with audit
- **`/gsd:discuss-phase [N]`** — Deep dive on phase approach/decisions
- **`/gsd:research-phase [N]`** — Spawn parallel research agents for phase
- **`/gsd:add-phase`** — Add new phase to roadmap

#### Roadmap Management (2)
- **`/gsd:insert-phase [pos]`** — Insert phase at specific position
- **`/gsd:remove-phase [N]`** — Remove phase from roadmap

#### Milestone Management (3)
- **`/gsd:complete-milestone`** — Mark milestone complete
- **`/gsd:audit-milestone`** — Audit milestone vs acceptance criteria
- **`/gsd:plan-milestone-gaps`** — Identify gaps between milestones

#### Risk & Planning (1)
- **`/gsd:list-phase-assumptions`** — Extract and validate assumptions

#### Work State (3)
- **`/gsd:pause-work`** — Pause execution and save state
- **`/gsd:resume-work`** — Resume from paused state
- **`/gsd:reapply-patches`** — Reapply work from one branch to another

#### Troubleshooting (1)
- **`/gsd:debug`** — Debug current issues and blockers

#### Help (1)
- **`/gsd:help`** — Show all commands

## Recommended Workflow

### Initial Setup (One-time)

```
1. /gsd:new-project
   ↓
   Creates: PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, config.json
```

Or if you have existing code:

```
1. /gsd:map-codebase
   ↓
   Creates: CODEBASE.md with analysis
   
2. /gsd:new-project
   ↓
   Uses codebase insights for planning
```

### Phase Execution (Repeats for Each Phase)

```
1. /gsd:research-phase 1        (optional, but recommended)
   ↓
   Creates: research/phase-1-research.md
   
2. /gsd:plan-phase 1
   ↓
   Creates: phases/phase-1.md with milestones
   
3. /gsd:discuss-phase 1         (optional, if approach is complex)
   ↓
   Validates approach with user
   
4. /gsd:list-phase-assumptions  (recommended before big phases)
   ↓
   Creates: phases/phase-1-assumptions.md
   
5. /gsd:plan-milestone-gaps 1   (optional, but helps)
   ↓
   Identifies integration points, setup work, etc.
   
6. /gsd:execute-phase 1
   ↓
   Builds milestones incrementally
   
   During execution:
   - /gsd:check-todos            (frequently, see what's next)
   - /gsd:complete-milestone     (as you finish each one)
   
7. /gsd:complete-phase 1
   ↓
   Audits work, creates summary, creates v1.1.0 tag
```

### Between Sessions

```
- Before leaving: /gsd:pause-work
  ↓
  Saves state, stashes work, documents context
  
- Returning: /gsd:resume-work
  ↓
  Restores context, resumes execution
```

### Anytime You're Lost

```
/gsd:progress       Get situational awareness
/gsd:health         Check if project is healthy
/gsd:debug          Stuck? Debug the issue
/gsd:check-todos    What's next?
```

## Project Files Structure

The extension creates this structure:

```
.planning/
├── PROJECT.md                          # Project overview, goals, context
├── REQUIREMENTS.md                     # V1/V2/out-of-scope requirements
├── ROADMAP.md                          # Phase structure & requirements mapping
├── STATE.md                            # Current progress, milestones, todos
├── CODEBASE.md                         # (if using existing codebase)
├── config.json                         # Workflow preferences
├── research/
│   ├── phase-1-research.md            # Research findings for phase
│   ├── phase-2-research.md
│   └── ...
└── phases/
    ├── phase-1.md                     # Detailed plan: milestones, tasks
    ├── phase-1-assumptions.md         # Assumptions for phase 1
    ├── phase-1-summary.md             # Completed phase summary
    ├── phase-2.md
    ├── phase-2-assumptions.md
    ├── phase-2-summary.md
    └── ...
```

## Key Features

### Spec-Driven Development
- **Question → Research → Requirements → Roadmap** — Understand fully before building
- Capture requirements as V1 (MVP), V2 (future), Out of Scope
- Prevent scope creep with explicit scoping

### Incremental Delivery
- **Phases** — Major chunks of work
- **Milestones** — Measurable goals within each phase
- **Acceptance criteria** — Clear, testable completion conditions

### State Management
- **STATE.md** — Tracks current position in roadmap, progress, blockers
- **Pause/Resume** — Save work and context, pick up later
- **Git integration** — Commits, tags, patch reapplication

### Risk Mitigation
- **Research phases** — Investigate unknowns before committing
- **Assumptions list** — Surface risky assumptions early
- **Milestone gaps** — Identify integration points and setup work
- **Audit workflows** — Verify acceptance criteria before moving on

### Context Engineering
- Creates `.planning/` files with project context
- Use `@.planning/PROJECT.md` in messages to include full context
- Reduces context rot as project grows

## Usage Tips

### Use @references to Include Context
```
In your messages, reference planning files:
@.planning/PROJECT.md              Include project overview
@.planning/REQUIREMENTS.md         Include requirements
@.planning/ROADMAP.md              Include roadmap
@.planning/phases/phase-1.md       Include current phase plan
@.planning/STATE.md                Include current state
```

This keeps the AI aligned with your project context.

### /gsd:progress is Your Friend
When you're uncertain what to do next:
```bash
/gsd:progress
```

It will:
1. Check what's been done
2. Show what's coming
3. Route you to the right next command

### Frequent /gsd:check-todos During Execution
Don't let the work get ahead of tracking:
```bash
/gsd:check-todos
```

Shows current tasks, blockers, and next steps. Keeps everything synced.

### Research Before Big Phases
Risk reduction pays off:
```bash
/gsd:research-phase 2
/gsd:list-phase-assumptions 2
```

These uncover unknowns and prevent surprises.

### Pause Strategically
Don't leave work hanging mid-milestone:
```bash
/gsd:pause-work
```

This:
- Documents what's been done
- Saves work state
- Records next steps
- Stashes uncommitted changes
- Makes resuming smooth

### Audit Before Completing
Before marking a phase done:
```bash
/gsd:audit-milestone
```

Ensures acceptance criteria are truly met and tests pass.

## Philosophy

GSD brings to Pi the same philosophy that makes it powerful for Claude Code:

1. **Clarity first** — Answer all questions before building
2. **Written spec** — Everything documented in `.planning/`
3. **Incremental** — Deliver value in phases, not all-at-once
4. **Trackable** — STATE.md shows exactly where you are
5. **Pausable** — Save state, take a break, resume later
6. **Auditable** — Verify each phase against requirements
7. **Testable** — Acceptance criteria guide testing

The system is in the background; what you see is simple commands that just work.

## Troubleshooting

### "What phase are we on?"
```bash
/gsd:progress
```

### "What's left to do?"
```bash
/gsd:check-todos
```

### "Is the project healthy?"
```bash
/gsd:health
```

### "Something is broken"
```bash
/gsd:debug
```

### "I need to take a break"
```bash
/gsd:pause-work
```

### "I'm back, what was I doing?"
```bash
/gsd:resume-work
```

### "I want to discuss the approach"
```bash
/gsd:discuss-phase 1
```

### "I want to research options"
```bash
/gsd:research-phase 2
```

## Integration with Pi

The extension uses Pi's built-in capabilities:

- **Commands** — `/gsd:*` commands register with Pi's command system
- **Session persistence** — Work lives in Pi sessions, not the extension
- **Tool access** — Uses Pi's read, write, bash, edit tools
- **UI notifications** — Uses ctx.ui.notify() for feedback
- **Prompt queuing** — Uses ctx.session.prompt() to send workflows to Claude

You can use all Pi features alongside GSD:
- `/reload` to reload extensions after edits
- `/tree` to navigate session history
- `/model` to switch between models
- `/settings` for Pi configuration
- All normal Pi commands work as before

## License

This Pi extension adapts the [Get Shit Done](https://github.com/gsd-build/get-shit-done) framework (MIT License) for use in Pi.
