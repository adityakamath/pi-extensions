# Superpowers Extension - Quick Start

## ✅ Installation Complete

Your Superpowers extension is fully installed and ready to use.

**Files:**
- `~/.pi/agent/extensions/superpowers.ts` — Extension with workflow commands
- `~/.pi/agent/skills/superpowers/` — 14 Superpowers skills

## 🚀 Get Started in 30 Seconds

### 1. Reload Pi
```bash
/reload
```

### 2. See the Workflow
```bash
/superpowers:help
```

### 3. Describe What You Want to Build

```
I want to add a dark mode toggle to my app
```

### 4. Let Superpowers Guide You

The system will automatically invoke the right skills in order:

```
1. /skill:brainstorming           Design the feature
2. /skill:writing-plans           Create bite-sized tasks
3. /skill:using-git-worktrees     Create isolated workspace
4. /skill:test-driven-development Execute each task (test first!)
5. /skill:requesting-code-review  Review each task
6. /skill:verification-before-completion Final checks
7. /skill:finishing-a-development-branch Ship it!
```

## 📚 Command Reference

| Command | Purpose |
|---------|---------|
| `/superpowers:help` | Main workflow guide (start here) |
| `/superpowers:workflow` | Workflow diagram with ASCII art |
| `/superpowers:principles` | Core principles explained |
| `/superpowers:faq` | Frequently asked questions |

## 🎯 Available Skills

```bash
/skill:brainstorming                 Design ideas
/skill:writing-plans                 Create task plan
/skill:executing-plans               Execute plan tasks
/skill:test-driven-development       TDD workflow
/skill:requesting-code-review        Review code
/skill:receiving-code-review         Respond to feedback
/skill:systematic-debugging          Debug issues
/skill:subagent-driven-development   Parallel task execution
/skill:dispatching-parallel-agents   Run multiple agents
/skill:using-git-worktrees           Isolated workspace
/skill:finishing-a-development-branch Merge and cleanup
/skill:verification-before-completion Final verification
/skill:writing-skills                Create custom skills
/skill:using-superpowers             Workflow overview
```

## 💡 Typical Session

```
You: "I want to add a newsletter signup form"

/skill:brainstorming
  Agent: "Is this a modal or inline?"
  You: "Inline, in the footer"
  
  Agent: "How to validate email?"
  You: "Just basic email format"
  
  Agent: Design section 1: HTML structure
  You: "Looks good"
  
  Agent: Design section 2: Styling
  You: "Looks good"
  
  Agent: Design section 3: Validation & submission
  You: "Looks good"
  
  → Creates: docs/plans/YYYY-MM-DD-newsletter-form-design.md

/skill:writing-plans
  → Task 1: Create form HTML (2 min)
  → Task 2: Add CSS styling (3 min)
  → Task 3: Email validation (2 min)
  → Task 4: Handle submission (3 min)
  
  → Creates: docs/plans/YYYY-MM-DD-newsletter-form-plan.md

/skill:test-driven-development (Task 1)
  Write failing test → Add form HTML → Test passes ✓

/skill:requesting-code-review
  ✓ Matches plan
  ✓ Code quality good
  → Continue to task 2

(Repeat for tasks 2-4)

/skill:verification-before-completion
  ✓ Tests pass
  ✓ Acceptance criteria met
  ✓ Docs updated
  → Ready to ship!

/skill:finishing-a-development-branch
  → Merge to main
  → Done!
```

## 🔑 Key Ideas

1. **DESIGN FIRST** — Always brainstorm before coding
2. **PLAN SMALL** — Tasks should be 2-5 minutes each
3. **TEST FIRST** — Write failing test, then implement
4. **REVIEW ALWAYS** — Every task reviewed
5. **GIT CLEAN** — Use worktrees for isolated work

## ⚡ Pro Tips

✅ Start with `/superpowers:help` to understand the workflow

✅ Keep tasks small — if it feels big, go back to the plan and split it

✅ Write tests first — the system deletes code written before tests

✅ Review every task — reviews catch bugs and style issues

✅ When stuck, use `/skill:systematic-debugging` for structured debugging

✅ Commit after every task — makes rollback easy

## 📖 Learn More

Full guide: `cat ~/.pi/agent/extensions/SUPERPOWERS.md`

Or in Pi: `/superpowers:help`

## 🎮 Try It Now

```bash
# See the workflow
/superpowers:help

# Or describe what you want to build and let Superpowers guide you
```

The system will invoke the right skills automatically.

---

**Ready to build with a complete development workflow?**

Describe what you want to build and type `/skill:brainstorming` to start!
