import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Superpowers Extension for Pi
 *
 * Brings the Superpowers workflow to Pi - a complete software development
 * workflow built on composable "skills" that guide coding agents through:
 * - Brainstorming and design
 * - Test-driven development
 * - Subagent-driven development
 * - Code review
 * - Systematic debugging
 *
 * Based on: https://github.com/obra/superpowers
 *
 * The system works by:
 * 1. Automatically loading Superpowers skills from .pi/skills/superpowers/
 * 2. Making them available via /skill:skill-name commands
 * 3. Providing guidance through the complete development workflow
 */

export default function (pi: ExtensionAPI) {
  // Register commands to show help and workflow guidance

  pi.registerCommand("superpowers:help", {
    description: "Show Superpowers workflow guide and available skills",
    handler: async (args, ctx) => {
      const help = `
🦸 **SUPERPOWERS - Complete Development Workflow for Pi**

Superpowers is a set of composable skills that guide you through a complete
software development workflow: from brainstorming and design through planning,
implementation, testing, code review, and debugging.

**Core Workflow:**

1. 🧠 BRAINSTORMING (/skill:brainstorming)
   → Explore ideas, ask clarifying questions, propose approaches
   → Output: Design document (docs/plans/YYYY-MM-DD-<topic>-design.md)

2. 📝 WRITING PLANS (/skill:writing-plans)
   → Create detailed implementation plan from approved design
   → Output: Implementation plan (docs/plans/YYYY-MM-DD-<topic>-plan.md)
   → Tasks: 2-5 minutes each, exact file paths, complete code

3. 🏗️ EXECUTING PLANS (/skill:executing-plans)
   → Execute plan tasks one by one with review
   → Uses TDD: RED → GREEN → REFACTOR
   → Verifies against plan before continuing

4. ✅ TEST-DRIVEN DEVELOPMENT (/skill:test-driven-development)
   → Write failing test → make it pass → refactor
   → Ensures every feature has test coverage
   → Deletes code written before tests

5. 👀 CODE REVIEW (/skill:requesting-code-review)
   → Review work against plan and code quality standards
   → Critical issues block progress
   → Generates review reports

6. 🐛 SYSTEMATIC DEBUGGING (/skill:systematic-debugging)
   → Structured approach to debugging issues
   → Gathers context, forms hypothesis, tests systematically

7. 🔧 GIT WORKFLOWS (/skill:using-git-worktrees)
   → Uses git worktrees for isolated work
   → Clean branching, test verification before merges
   → Automatic cleanup after completion

8. 🧪 VERIFICATION (/skill:verification-before-completion)
   → Final checks before marking work complete
   → Test suite passes, code quality checks, docs updated

**Available Skills:**

Core Development:
  /skill:brainstorming                  Explore and design ideas
  /skill:writing-plans                  Create implementation plan
  /skill:executing-plans                Execute plan tasks
  /skill:test-driven-development        TDD workflow
  /skill:using-git-worktrees            Isolated git workflow

Code Quality:
  /skill:requesting-code-review         Review against plan
  /skill:systematic-debugging           Debug issues systematically
  /skill:verification-before-completion Final verification

Advanced:
  /skill:subagent-driven-development    Dispatch subagents per task
  /skill:dispatching-parallel-agents    Run multiple agents in parallel
  /skill:finishing-a-development-branch Merge and cleanup

Supporting:
  /skill:using-superpowers              Overview and help
  /skill:writing-skills                 Create new custom skills
  /skill:receiving-code-review          Receive feedback on code

**Key Principles:**

✓ DESIGN FIRST — Brainstorm and get approval before any code
✓ PLAN SMALL — Tasks should be 2-5 minutes each
✓ TEST DRIVEN — Write tests before implementation
✓ REVIEW ALWAYS — Every task reviewed for plan compliance and quality
✓ RED/GREEN/REFACTOR — Minimize, make pass, improve
✓ INCREMENTAL — One task at a time, verify before moving on
✓ AUTONOMY — Subagents can work independently on tasks

**Typical Session:**

1. Describe what you want to build
2. /skill:brainstorming
   → Questions → Approaches → Design document → Approval
3. /skill:writing-plans
   → Creates bite-sized tasks with exact requirements
4. /skill:executing-plans
   → Executes each task: test → code → verify
5. /skill:requesting-code-review
   → Reviews against plan and quality standards
6. /skill:verification-before-completion
   → Final checks before merging

If you get stuck:
   /skill:systematic-debugging → Structured debugging

**The Magic:**

The system enforces a workflow. You don't have to think about "should I
write tests first?" or "is this chunk too big?" — the skills guide you
through the best practices automatically.

**Get Started:**

1. Describe what you want to build
2. /skill:brainstorming
   (The system will guide you from there!)

Or for specific tasks:
   /skill:brainstorming             Design phase
   /skill:writing-plans             Planning phase
   /skill:executing-plans           Implementation
   /skill:systematic-debugging      When stuck
   /skill:verification-before-completion    Before shipping

**More Info:**

   /superpowers:workflow            Show workflow diagram
   /superpowers:principles          Show core principles
   /superpowers:faq                 Frequently asked questions
`;

      ctx.ui.notify(help, "info");
    },
  });

  pi.registerCommand("superpowers:workflow", {
    description: "Show Superpowers workflow diagram",
    handler: async (args, ctx) => {
      const workflow = `
🦸 **SUPERPOWERS WORKFLOW**

┌─────────────────────────────────────────────────────────────────────────────┐
│                        BRAINSTORMING & DESIGN                              │
│                                                                             │
│  User describes idea                                                        │
│         ↓                                                                   │
│  Skill: brainstorming                                                      │
│    • Explore project context                                              │
│    • Ask clarifying questions (one at a time)                            │
│    • Propose 2-3 approaches with trade-offs                              │
│    • Present design in sections                                          │
│    • Get user approval                                                    │
│         ↓                                                                   │
│  Output: Design document (docs/plans/YYYY-MM-DD-<topic>-design.md)      │
│         ↓                                                                   │
│  Commit to git                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PLANNING & GIT SETUP                                  │
│                                                                             │
│  Skill: using-git-worktrees                                                │
│    • Create git worktree for isolated work                                │
│    • Set up development environment                                       │
│    • Verify clean test baseline                                          │
│         ↓                                                                   │
│  Skill: writing-plans                                                     │
│    • Break design into bite-sized tasks (2-5 min each)                   │
│    • Each task has: exact file paths, complete code, verification steps  │
│    • Emphasize TDD, YAGNI, DRY                                           │
│         ↓                                                                   │
│  Output: Implementation plan (docs/plans/YYYY-MM-DD-<topic>-plan.md)     │
│         ↓                                                                   │
│  Commit to git                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXECUTION WITH CODE REVIEW                              │
│                                                                             │
│  For each task in the plan:                                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Skill: executing-plans (or test-driven-development)               │  │
│  │    • Write failing test (RED)                                      │  │
│  │    • Implement minimal code (GREEN)                                │  │
│  │    • Refactor (REFACTOR)                                           │  │
│  │    • Run full test suite                                           │  │
│  │    • Commit                                                        │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│         ↓                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Skill: requesting-code-review                                     │  │
│  │    • Review task against plan spec                                 │  │
│  │    • Check code quality (style, patterns, no tech debt)            │  │
│  │    • Report by severity (critical blocks, others suggest)          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│         ↓                                                                   │
│  If critical issues: fix and re-review                                     │
│  Else: continue to next task                                               │
│         ↓                                                                   │
│  All tasks complete?  → Continue below                                    │
│                    No → Loop to next task                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FINAL VERIFICATION                                    │
│                                                                             │
│  Skill: verification-before-completion                                     │
│    • Run full test suite                                                   │
│    • Verify all acceptance criteria met                                    │
│    • Check documentation is updated                                        │
│    • Verify code quality standards met                                     │
│         ↓                                                                   │
│  Skill: finishing-a-development-branch                                     │
│    • Merge to main branch or create PR                                     │
│    • Clean up git worktree                                                 │
│    • Create release notes/tags if needed                                   │
│         ↓                                                                   │
│  ✅ COMPLETE                                                                │
└─────────────────────────────────────────────────────────────────────────────┘

**If You Get Stuck:**

At any point, invoke:
  /skill:systematic-debugging
    • Gather context
    • Form hypothesis
    • Test systematically
    • Document findings
    • Continue execution

**Advanced Features:**

Subagent-driven development (optional):
  /skill:subagent-driven-development
    • Dispatch fresh subagent per task
    • Each subagent: review against spec, then code quality
    • Parallel execution possible
    • Automatic integration

Parallel agents (for exploration):
  /skill:dispatching-parallel-agents
    • Run multiple agents on different approaches
    • Compare results
    • Merge best solution
`;

      ctx.ui.notify(workflow, "info");
    },
  });

  pi.registerCommand("superpowers:principles", {
    description: "Show Superpowers core principles",
    handler: async (args, ctx) => {
      const principles = `
🦸 **SUPERPOWERS CORE PRINCIPLES**

**1. DESIGN FIRST**
   Before any code, brainstorm and design.
   Even "simple" projects need a design.
   Prevents wasted work from unexamined assumptions.
   → /skill:brainstorming

**2. PLAN SMALL**
   Break into tasks that are 2-5 minutes each.
   Each task has exact file paths and complete code.
   Small tasks = less context switching, easier review.
   → /skill:writing-plans

**3. TEST DRIVEN (RED/GREEN/REFACTOR)**
   Write failing test FIRST (RED)
   Implement minimal code to make it pass (GREEN)
   Improve the implementation (REFACTOR)
   Verify full test suite passes
   Commit the working code
   
   Benefits: Clear requirements, less debugging, better design

**4. YAGNI (You Aren't Gonna Need It)**
   Only implement what's in the plan
   Don't add "nice to haves" unless explicitly approved
   Keep scope tight
   This is verified in code review

**5. DRY (Don't Repeat Yourself)**
   Extract common patterns into reusable functions
   Share logic across the codebase
   This is checked during code review

**6. REVIEW ALWAYS**
   Every task reviewed against:
     • Plan compliance (does it do what was planned?)
     • Code quality (style, patterns, no tech debt)
   Critical issues block progress
   This prevents bugs from accumulating
   → /skill:requesting-code-review

**7. INCREMENTAL VALIDATION**
   Validate design after each section
   Validate plan before execution
   Validate code after each task
   Validate everything before shipping
   This catches issues early

**8. AUTONOMY**
   Subagents can work independently on tasks
   Each subagent gets: task spec + context + code review
   Parallel execution possible
   → /skill:subagent-driven-development

**9. GIT WORKTREES**
   Isolated workspace per piece of work
   Clean branching, no merge conflicts
   Automatic cleanup after completion
   → /skill:using-git-worktrees

**10. CLEAR HANDOFF**
   Each skill's output becomes the next skill's input
   Design doc → Plan → Execution → Review → Verification
   No ambiguity or context loss
   Chain of skills guides the work

**Anti-Patterns to Avoid:**

❌ "This is too simple to need design"
   → No. Everything needs a quick design.

❌ Writing code before tests
   → The system deletes it. Test first.

❌ Skipping code review
   → Reviews catch bugs. Required.

❌ Tasks that are too big
   → Should be 2-5 minutes. Smaller is safer.

❌ Not committing between tasks
   → Commit after every task. Makes rollback easy.

❌ Mixing implementation and cleanup
   → Do implementation, then verification/cleanup separately.

❌ Changing the plan mid-execution
   → Design phase is for exploration. Execute what was approved.

**Why This Works:**

The system enforces best practices at every step:
  • Design catches misunderstandings early
  • Small tasks prevent overwhelm
  • Tests catch bugs before code review
  • Code review catches style/quality issues
  • Git worktrees prevent conflicts
  • Clear handoffs prevent context loss

You're not relying on discipline or memory.
The workflow itself prevents mistakes.

**For More Info:**

  /superpowers:help              Full skill reference
  /superpowers:workflow          Workflow diagram
  /superpowers:faq               Common questions
`;

      ctx.ui.notify(principles, "info");
    },
  });

  pi.registerCommand("superpowers:faq", {
    description: "Frequently asked questions about Superpowers",
    handler: async (args, ctx) => {
      const faq = `
🦸 **SUPERPOWERS - FREQUENTLY ASKED QUESTIONS**

**Q: Do I really need to brainstorm for a simple feature?**
A: Yes. Even a simple feature needs quick design. Takes 5 minutes, prevents
   wasted work. Unexamined assumptions cause the most issues on "simple" work.

**Q: What if I already know what to build?**
A: Great! /skill:brainstorming will be quick. It still goes through the
   process (validate approaches, present design, get approval) but moves fast.

**Q: Why write tests first?**
A: Writing tests first:
   • Forces you to think through requirements
   • Gives you a clear success criterion
   • Prevents you from gold-plating
   • Means you catch bugs immediately
   • Red/green/refactor focuses your work

**Q: Can I skip code review?**
A: No. Reviews catch bugs and quality issues. Required between every task.
   Critical issues block progress; others are suggestions.

**Q: What if a task is too big?**
A: /skill:writing-plans creates 2-5 minute tasks. If a task feels big,
   go back to the plan and break it smaller.

**Q: Can subagents work in parallel?**
A: Yes! /skill:subagent-driven-development and
   /skill:dispatching-parallel-agents enable parallel work.
   Useful for independent pieces.

**Q: What if I find a bug during implementation?**
A: Fix it immediately, write a test for it, then continue.
   Or if it's unrelated to current task, create an issue and note it.

**Q: Should I refactor as I go?**
A: Yes. The RED/GREEN/REFACTOR cycle encourages refactoring.
   After green (test passes), improve the code before moving on.

**Q: What if I disagree with a code review comment?**
A: Discuss it! The review is a suggestion (unless critical).
   Defend your approach if you think it's right.

**Q: Can I change the plan mid-execution?**
A: Design phase is for exploration. Once plan is approved,
   execute what was approved. New ideas = new brainstorming session.

**Q: How long should each task take?**
A: 2-5 minutes. This is core to the system. Keeps you focused,
   makes review easier, enables frequent validation.

**Q: What if a task is actually just 1 minute?**
A: Great! Combine it with similar tasks in the plan.

**Q: Do I really need git worktrees?**
A: /skill:using-git-worktrees sets up isolated workspace.
   Prevents merge conflicts, keeps history clean. Recommended.

**Q: Can I use this without git?**
A: The skills assume git (branching, worktrees, commits).
   Possible without it, but the workflow assumes version control.

**Q: What if tests fail?**
A: That's the whole point of test-driven development!
   • Red test means you understand the failure
   • You implement minimal code to fix it
   • Green test means it works
   • Then refactor with confidence

**Q: Should I commit after every test or after every implementation?**
A: Commit after every task (test + implementation + refactoring).
   This makes rollback easy and keeps history clear.

**Q: What if I need to pair program or get help?**
A: The system works with multiple people! Use git worktrees
   to coordinate. Or spawn a subagent to pair on tricky parts.

**Q: How do I know I'm done?**
A: /skill:verification-before-completion checks:
   • Tests pass
   • Acceptance criteria met
   • Documentation updated
   • Code quality standards met
   Then ready to merge.

**Q: Can I use Superpowers for refactoring?**
A: Yes! Treat refactoring as feature work:
   1. Brainstorm the approach
   2. Write plan (small tasks)
   3. Execute with tests (verify no behavior change)
   4. Review and verify

**Q: What about documentation?**
A: Part of each task! Tests are documentation.
   Write docs as you go, not after.

**Q: If I'm stuck, what do I do?**
A: /skill:systematic-debugging
   • Gather context
   • Form hypothesis
   • Test systematically
   • Document findings
   • Continue execution

**Q: Can I work on multiple features?**
A: Use separate git worktrees per feature.
   Each gets its own design → plan → execute cycle.

**Q: How much context does a subagent need?**
A: /skill:subagent-driven-development gives each subagent:
   • The specific task
   • The full codebase context
   • The code review criteria
   They can work independently.

**Q: Is this overkill for small projects?**
A: No. The process is short for small projects:
   • Brainstorm: 5 minutes
   • Plan: 5 minutes
   • Execute: 30 minutes (3-4 tasks × 5 min)
   • Verify: 5 minutes
   
   Total: ~1 hour for a small feature, but it's solid.

**Q: What if I just want to hack something quick?**
A: You could skip the process, but you'll spend more time debugging.
   The "quick" way is actually slower for anything non-trivial.

**Q: Where do design docs and plans go?**
A: docs/plans/ directory:
   • YYYY-MM-DD-<topic>-design.md
   • YYYY-MM-DD-<topic>-plan.md
   This builds your project history.

**Q: Can I reuse this workflow for different projects?**
A: Absolutely! The skills are designed to work on any project.
   Language, framework, type of work - doesn't matter.

**For help with specific skills:**

  /skill:brainstorming              Start here for new features
  /skill:writing-plans              If you need clearer tasks
  /skill:systematic-debugging       If you're stuck
  /skill:test-driven-development    For testing questions
  /skill:requesting-code-review     For code review

`;

      ctx.ui.notify(faq, "info");
    },
  });


}
