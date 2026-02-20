# Superpowers Extension for Pi

A complete software development workflow system for Pi, bringing the full power of Superpowers to your coding agent work.

**Based on:** https://github.com/obra/superpowers (by Jesse Vincent)

## What is Superpowers?

Superpowers is a complete software development workflow that guides coding agents through:

1. **Brainstorming & Design** — Explore ideas, ask clarifying questions, propose approaches, get approval
2. **Planning** — Break design into bite-sized 2-5 minute tasks with exact requirements
3. **Execution** — Test-driven development (RED → GREEN → REFACTOR)
4. **Code Review** — Verify plan compliance and code quality
5. **Verification** — Final checks before shipping
6. **Debugging** — Systematic approach when stuck

## Installation

Files installed to `~/.pi/agent/`:

- **`extensions/superpowers.ts`** — Extension with workflow guidance commands
- **`skills/superpowers/`** — 14 Superpowers skills (brainstorming, planning, testing, etc.)

All skills auto-load and are available as `/skill:skill-name`.

## Quick Start

### 1. See the Workflow

```bash
/superpowers:help       Main workflow guide
/superpowers:workflow   Workflow diagram
/superpowers:principles Core principles
/superpowers:faq        Frequently asked questions
```

### 2. Start Building

Describe what you want to build:

```
I want to add a dark mode toggle to my app
```

Then Pi will guide you through:

```bash
/skill:brainstorming
  → Questions about design
  → Explores alternatives
  → Presents design
  → Gets approval
  → Creates design document

/skill:writing-plans
  → Breaks design into tasks (2-5 min each)
  → Each task has exact requirements
  → Creates implementation plan

/skill:executing-plans
  → For each task: test → code → verify
  → Uses RED/GREEN/REFACTOR cycle
  → Reviews against plan

/skill:verification-before-completion
  → Final checks
  → Tests pass, docs updated
  → Ready to ship
```

## 14 Available Skills

### Core Development

**Brainstorming** (`/skill:brainstorming`)
- Explore and design ideas
- Ask clarifying questions (one at a time)
- Propose 2-3 approaches
- Present design, get approval
- Output: Design document

**Writing Plans** (`/skill:writing-plans`)
- Break design into 2-5 minute tasks
- Each task: exact file paths, complete code, verification steps
- Emphasize TDD, YAGNI, DRY
- Output: Implementation plan

**Executing Plans** (`/skill:executing-plans`)
- Execute plan tasks one by one
- Test-driven development cycle
- Code review after each task
- Continue to next task if approved

**Test-Driven Development** (`/skill:test-driven-development`)
- Write failing test (RED)
- Implement minimal code (GREEN)
- Refactor (REFACTOR)
- Verify full test suite passes
- Commit

### Code Quality & Review

**Requesting Code Review** (`/skill:requesting-code-review`)
- Review against plan specification
- Check code quality (style, patterns, no tech debt)
- Report by severity (critical blocks, others suggest)
- Provide feedback

**Receiving Code Review** (`/skill:receiving-code-review`)
- Respond to review feedback
- Fix critical issues
- Address suggestions
- Re-submit for review

**Systematic Debugging** (`/skill:systematic-debugging`)
- Gather context about the issue
- Form hypothesis
- Test systematically
- Document findings
- Continue execution

### Advanced Features

**Subagent-Driven Development** (`/skill:subagent-driven-development`)
- Dispatch fresh subagent per task
- Each subagent: review against spec, then code quality
- Two-stage review process
- Automatic integration

**Dispatching Parallel Agents** (`/skill:dispatching-parallel-agents`)
- Run multiple agents on different approaches
- Compare results
- Merge best solutions

### Git & Verification

**Using Git Worktrees** (`/skill:using-git-worktrees`)
- Create isolated workspace for work
- Set up development environment
- Verify clean test baseline
- Automatic cleanup after completion

**Finishing a Development Branch** (`/skill:finishing-a-development-branch`)
- Verify all tests pass
- Present options (merge/PR/keep/discard)
- Clean up git worktree
- Create tags if needed

**Verification Before Completion** (`/skill:verification-before-completion`)
- Run full test suite
- Verify acceptance criteria met
- Check documentation updated
- Verify code quality standards

### Creating Custom Skills

**Writing Skills** (`/skill:writing-skills`)
- Create new custom skills for your workflow
- Extend Superpowers with domain-specific skills
- Follow Superpowers patterns

### Overview

**Using Superpowers** (`/skill:using-superpowers`)
- Overview of the workflow
- How skills work together
- When to use each skill

## The Workflow at a Glance

```
You describe idea
    ↓
/skill:brainstorming
  Question → Design → Approval
    ↓
/skill:writing-plans
  Break into 2-5 minute tasks
    ↓
/skill:using-git-worktrees
  Create isolated branch
    ↓
/skill:executing-plans (for each task)
  Test → Code → Verify
    ↓
/skill:requesting-code-review
  Review against plan and quality
    ↓
All tasks done?
  Yes → /skill:verification-before-completion
          Final checks → Ship
  No → Next task
    ↓
/skill:finishing-a-development-branch
  Merge, clean up, done!

If stuck → /skill:systematic-debugging
```

## Key Principles

✅ **DESIGN FIRST**
- Brainstorm before any code
- Even simple projects need design
- Prevents wasted work from assumptions

✅ **PLAN SMALL**
- Tasks should be 2-5 minutes each
- Each has exact requirements and verification steps
- Small tasks = easier to review and less context switching

✅ **TEST DRIVEN (RED/GREEN/REFACTOR)**
- Write failing test first
- Implement minimal code to make it pass
- Refactor with test coverage
- Benefits: Clear requirements, less debugging, better design

✅ **YAGNI (You Aren't Gonna Need It)**
- Only implement what's in the plan
- No extra features unless approved
- Verified in code review

✅ **REVIEW ALWAYS**
- Every task reviewed for plan compliance
- Reviewed for code quality
- Critical issues block progress
- Prevents bugs from accumulating

✅ **GIT WORKTREES**
- Isolated workspace per piece of work
- Clean branching, no merge conflicts
- Automatic cleanup

✅ **CLEAR HANDOFF**
- Each skill's output becomes the next skill's input
- Design doc → Plan → Execution → Review → Verification
- No context loss or ambiguity

## Pro Tips

1. **Use `/superpowers:help` when unsure** — Get the workflow guide anytime

2. **Start with brainstorming** — Even if you think you know what to build, this 5-minute step catches assumptions

3. **Keep tasks small** — If a task doesn't feel like 2-5 minutes, go back to the plan and split it

4. **Tests first, always** — This is core. Write the failing test, then implement. The system deletes code written before tests.

5. **Review every task** — Reviews catch bugs and style issues. Never skip.

6. **Commit frequently** — After every task. Makes rollback easy.

7. **Use git worktrees** — Keeps your workspace isolated and prevents conflicts.

8. **When stuck, debug systematically** — `/skill:systematic-debugging` structures the approach.

## Example Session

```
User: "I want to add a dark mode toggle"

/skill:brainstorming
  → "What should dark mode affect?"
  → "How should user preference persist?"
  → "Are there animations during transition?"
  → Proposes 2 approaches
  → Presents design
  → User approves

/skill:writing-plans
  → Task 1: Add dark mode CSS variables (2 min)
  → Task 2: Create toggle component (3 min)
  → Task 3: Store preference in localStorage (2 min)
  → Task 4: Apply preference on page load (2 min)

/skill:using-git-worktrees
  → Creates dark-mode branch

/skill:test-driven-development (Task 1)
  → Write failing test for CSS variables
  → Add CSS variables
  → Test passes

/skill:requesting-code-review (Task 1)
  → "Task matches spec? Yes"
  → "Code quality good? Yes"
  → "Approved, continue"

(Repeat for tasks 2-4)

/skill:verification-before-completion
  → Run full test suite: ✓
  → Check acceptance criteria: ✓
  → Update documentation: ✓
  → Ready to ship

/skill:finishing-a-development-branch
  → Merge to main
  → Clean up branch
  → Tag as v1.1.0
  → Done!
```

## File Structure

After using the workflow, you'll have:

```
docs/plans/
├── YYYY-MM-DD-<topic>-design.md      Design document
├── YYYY-MM-DD-<topic>-plan.md        Implementation plan
└── YYYY-MM-DD-<topic>-summary.md     Execution summary (optional)

.git/
├── branch: <topic>                   Working branch
└── commits: clean task-by-task history

Code:
├── Test files (tests added during development)
├── Implementation (minimal, tested code)
└── Documentation (updated as you go)
```

## Comparing with GSD Extension

GSD and Superpowers have different philosophies:

| Aspect | GSD | Superpowers |
|--------|-----|-------------|
| **Scope** | Project planning (phases) | Task-level workflow |
| **Design** | Requirements, roadmap | Single feature design |
| **Planning** | Phases, milestones | 2-5 minute tasks |
| **Testing** | Part of execution | TDD (red/green/refactor) |
| **Review** | Phase-level | Every task |
| **Duration** | Multi-phase projects | Single features |

**Use GSD for:** Large projects with multiple phases
**Use Superpowers for:** Individual features with test-driven development

You can use both together! GSD for project structure, Superpowers for implementation.

## Requirements

- Pi (version with extension support)
- Git (for worktrees and versioning)
- A testing framework (Jest, pytest, etc.)

## More Information

- **Superpowers GitHub:** https://github.com/obra/superpowers
- **Original README:** https://github.com/obra/superpowers#readme

## Commands

```bash
/superpowers:help              Main workflow guide and skill list
/superpowers:workflow          ASCII workflow diagram
/superpowers:principles        Core principles explained
/superpowers:faq               Frequently asked questions
```

## License

This Pi extension adapts Superpowers (MIT License). See https://github.com/obra/superpowers for the original.

---

**Ready to get building with Superpowers?**

```bash
/superpowers:help
```

Then describe what you want to build and the system will guide you through the complete workflow!
