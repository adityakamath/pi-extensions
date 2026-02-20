import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * Get Shit Done (GSD) Extension for Pi
 * 
 * Brings spec-driven development to Pi with project planning, requirements gathering,
 * roadmap creation, and milestone execution workflows.
 * 
 * Commands:
 *   /gsd:new-project    - Initialize a new project with deep context gathering
 *   /gsd:progress       - Check project progress and route to next action
 *   /gsd:plan-phase     - Plan a specific phase of work
 *   /gsd:execute-phase  - Execute a planned phase
 *   /gsd:check-todos    - Review current todos and milestones
 *   /gsd:help           - Show all available GSD commands
 */

export default function (pi: ExtensionAPI) {
  // Command: /gsd:map-codebase
  pi.registerCommand("gsd:map-codebase", {
    description: "Analyze existing codebase before planning",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD map-codebase workflow.

This analyzes an EXISTING codebase to understand its structure, patterns, and conventions before planning new work.

**Your tasks:**

1. **Explore the codebase structure**
   \`\`\`bash
   find . -type f -name "*.ts" -o -name "*.js" -o -name "*.jsx" -o -name "*.tsx" | head -50
   ls -la
   cat package.json | grep -E '"name"|"version"|"dependencies"'
   \`\`\`

2. **Analyze stack and architecture**
   Look for:
   - What languages/frameworks? (React, Vue, Node, etc.)
   - Build system? (webpack, vite, esbuild, etc.)
   - Testing framework? (jest, vitest, etc.)
   - Version control setup
   - CI/CD? (GitHub Actions, etc.)
   - Database/data layer?

3. **Understand patterns and conventions**
   Review:
   - File organization (by feature, by type, etc.)
   - Component/module patterns
   - State management approach
   - Naming conventions
   - Code style (tabs/spaces, quotes, etc.)
   - API integration patterns

4. **Identify concerns and constraints**
   - Known tech debt or issues?
   - Performance considerations?
   - Security architecture?
   - Scalability approach?
   - Browser/platform support?
   - Deployment model?

5. **Document findings**
   Create \`.planning/CODEBASE.md\`:
   - Stack and tech choices
   - Architecture overview
   - Key patterns and conventions
   - Important constraints
   - Known issues/tech debt
   - Testing approach

6. **Extract reusable components**
   - What utilities/helpers exist?
   - Shared components?
   - APIs or data structures to leverage?
   - Patterns to follow for new work?

7. **Create developer reference**
   - How to run locally
   - How tests work
   - How to build/deploy
   - Common commands
   - Code review guidelines

8. **Present to user**
   - Show codebase analysis
   - Key findings and patterns
   - Recommendations for new work
   - Ready to plan? → \`/gsd:new-project\``;

      ctx.ui.notify("Analyzing codebase...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:new-project
  pi.registerCommand("gsd:new-project", {
    description:
      "Initialize a new project with deep context gathering, requirements, and roadmap",
    handler: async (args, ctx) => {
      const autoMode = args?.includes("--auto") ? true : false;

      const prompt = autoMode
        ? `You are running the GSD (Get Shit Done) new-project workflow in automatic mode.

Follow this workflow exactly:

1. **Questioning** - Ask clarifying questions about:
   - What problem does this solve?
   - Who is the user?
   - What are the non-negotiables?
   - What tech stack?
   - What constraints?
   - What success looks like?

2. **Research** (optional) - Spawn parallel research on domain if needed

3. **Requirements** - Extract and categorize:
   - V1 (MVP, non-negotiable)
   - V2 (nice-to-haves)
   - Out of scope

4. **Roadmap** - Create phases:
   - Phase 1: Core
   - Phase 2: Polish
   - Phase 3: Scale/Advanced
   - Map requirements to phases

5. **Create files:**
   - \`.planning/PROJECT.md\` - Project overview
   - \`.planning/REQUIREMENTS.md\` - Scoped requirements
   - \`.planning/ROADMAP.md\` - Phase structure
   - \`.planning/STATE.md\` - Project state tracking
   - \`.planning/config.json\` - Workflow preferences

After completing all steps, output a summary of what was created.`
        : `You are running the GSD (Get Shit Done) new-project workflow in interactive mode.

**Step 1: Ask clarifying questions**
Ask comprehensive questions to understand the project fully:
- What problem are you solving?
- Who are the end users?
- What are your non-negotiables?
- What's your tech stack preference?
- What constraints exist (time, resources, scope)?
- How do you measure success?

**Step 2: Propose research phase**
Ask if the user wants parallel domain research. If yes, spawn research agents for:
- Technology options
- Architecture patterns
- Best practices
- Common pitfalls

**Step 3: Extract requirements**
Based on answers, extract and categorize:
- V1 Requirements (MVP, absolutely essential)
- V2 Requirements (nice-to-haves, future)
- Out of Scope (explicitly exclude)

Get user approval on categorization.

**Step 4: Create roadmap**
Design phases that deliver value incrementally:
- Phase 1: Core functionality
- Phase 2: Polish/UX
- Phase 3: Scale/Advanced features

Map each requirement to a phase.

**Step 5: Create project files**
Write these files:
- \`.planning/PROJECT.md\` - Project overview and context
- \`.planning/REQUIREMENTS.md\` - All requirements, categorized
- \`.planning/ROADMAP.md\` - Phases with mapped requirements
- \`.planning/STATE.md\` - Project state tracking (milestones, todos)
- \`.planning/config.json\` - Workflow preferences

After completing all steps:
1. Show the user the complete roadmap
2. Ask for approval or changes
3. Recommend next action: /gsd:plan-phase 1`;

      ctx.ui.notify("Initializing new GSD project...", "info");
      await new Promise((resolve) => setTimeout(resolve, 500)); // Brief pause for UX

      // Queue the prompt as a user message
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:progress
  pi.registerCommand("gsd:progress", {
    description: "Check project progress and route to next action",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD progress check workflow.

**Your tasks:**

1. **Check project state**
   - Read \`.planning/STATE.md\` if it exists
   - Review \`.planning/ROADMAP.md\` for phase structure
   - Check git log for recent commits
   - List any current TODOs or blockers

2. **Summarize progress**
   - What was completed recently?
   - What's in progress?
   - What's blocked or pending?
   - Overall project health

3. **Route to next action** - Recommend one of these:
   - **Execute Phase** — If a phase is planned, run \`/gsd:execute-phase N\`
   - **Plan Phase** — If ready for next phase, run \`/gsd:plan-phase N\`
   - **Check Todos** — If phase in progress, review todos with \`/gsd:check-todos\`
   - **Resolve Blockers** — If stuck, run debug workflow
   - **Complete Milestone** — If phase is done, run \`/gsd:complete-milestone\`

Provide situational awareness and clear next step recommendation.`;

      ctx.ui.notify("Checking project progress...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:plan-phase
  pi.registerCommand("gsd:plan-phase", {
    description: "Plan a specific phase of work with tasks and milestones",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "1";

      const prompt = `You are running the GSD plan-phase workflow for Phase ${phaseNum}.

**Your tasks:**

1. **Load context**
   - Read \`.planning/REQUIREMENTS.md\`
   - Read \`.planning/ROADMAP.md\`
   - Identify which requirements map to Phase ${phaseNum}

2. **Break down the phase**
   - List milestones for this phase (2-5 major chunks)
   - For each milestone:
     - What requirements does it satisfy?
     - What's the acceptance criteria?
     - What edge cases matter?
     - What could go wrong?

3. **Create implementation plan**
   - Technical approach for each milestone
   - Dependencies and sequencing
   - Estimated scope per milestone
   - Technical decisions and rationale

4. **Get approval**
   - Show user the complete plan
   - Ask for changes, concerns, or approval

5. **Create phase plan file**
   - Write \`.planning/phases/phase-${phaseNum}.md\`
   - Include: milestones, tasks, acceptance criteria, technical approach
   - Update \`.planning/STATE.md\` to track phase status

After completion, ask if user wants to start executing: \`/gsd:execute-phase ${phaseNum}\``;

      ctx.ui.notify(`Planning Phase ${phaseNum}...`, "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:execute-phase
  pi.registerCommand("gsd:execute-phase", {
    description: "Execute a planned phase with milestone tracking",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "1";

      const prompt = `You are running the GSD execute-phase workflow for Phase ${phaseNum}.

**Your tasks:**

1. **Load phase plan**
   - Read \`.planning/phases/phase-${phaseNum}.md\`
   - Load current \`.planning/STATE.md\`
   - Identify milestones and tasks

2. **Set up execution environment**
   - Create milestone checklist in STATE.md
   - Initialize git branch for phase if needed
   - Prepare dev environment

3. **Execute milestones incrementally**
   For each milestone in sequence:
   - Explain what this milestone delivers
   - Code/build the required functionality
   - Write tests
   - Verify against acceptance criteria
   - Commit work
   - Update STATE.md progress

4. **Between milestones**
   - Show progress
   - Ask if user wants to:
     - Continue to next milestone
     - Take a break (/gsd:pause-work)
     - Change approach
     - Debug an issue

5. **After each milestone**
   - Run tests
   - Show what was built
   - Update STATE.md

Continue executing until all milestones are complete, then suggest: \`/gsd:complete-milestone\`

Use /gsd:check-todos frequently to stay aligned.`;

      ctx.ui.notify(`Executing Phase ${phaseNum}...`, "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:check-todos
  pi.registerCommand("gsd:check-todos", {
    description: "Review current TODOs and milestone progress",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD check-todos workflow.

**Your tasks:**

1. **Load current state**
   - Read \`.planning/STATE.md\`
   - Check any \`.planning/phases/phase-*.md\` for current phase
   - Review git log for recent work

2. **Extract TODOs**
   - Find all TODO/FIXME comments in code
   - List milestone tasks from phase plan
   - Note any blockers or waiting items

3. **Categorize and display**
   - **Active** — Currently in progress
   - **Blocked** — Waiting on something
   - **Next** — Ready to start
   - **Done** — Completed this session

4. **Summarize progress**
   - Percentage of current milestone complete
   - What's on the critical path
   - Any risks or concerns

5. **Route to action**
   - If things are moving: "Keep going, next up is..."
   - If blocked: Run /gsd:debug workflow
   - If milestone done: Run /gsd:complete-milestone

Be concise and action-oriented.`;

      ctx.ui.notify("Checking TODOs...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:add-phase
  pi.registerCommand("gsd:add-phase", {
    description: "Add a new phase to the roadmap",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD add-phase workflow.

**Your tasks:**

1. **Load current roadmap**
   - Read \`.planning/ROADMAP.md\`
   - Identify current phases and what's complete

2. **Gather phase details**
   Ask the user:
   - What does this new phase deliver?
   - What requirements does it satisfy?
   - Should it be inserted before the end, or after all current phases?
   - What's the priority?
   - Any dependencies on other phases?

3. **Validate and plan**
   - Check that phase fits logically in the roadmap
   - Identify any new requirements it adds
   - Assess impact on timeline

4. **Update roadmap**
   - Insert phase into \`.planning/ROADMAP.md\` (with requirements mapping)
   - Update \`.planning/STATE.md\` to reflect new phase structure
   - Git commit the changes

5. **Confirm and route**
   - Show user the updated roadmap
   - Ask if ready to plan this phase now: \`/gsd:plan-phase N\``;

      ctx.ui.notify("Adding new phase to roadmap...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:insert-phase
  pi.registerCommand("gsd:insert-phase", {
    description: "Insert a new phase at a specific position in the roadmap",
    handler: async (posArg, ctx) => {
      const position = posArg?.trim() || "after current";

      const prompt = `You are running the GSD insert-phase workflow (position: ${position}).

**Your tasks:**

1. **Load current roadmap**
   - Read \`.planning/ROADMAP.md\`
   - List all current phases with their content
   - Show user the current structure

2. **Gather new phase details**
   Ask the user:
   - What is the name/goal of this new phase?
   - What requirements does it satisfy?
   - What's the scope and timeline estimate?
   - Any dependencies?

3. **Determine insertion point**
   - Discuss where this phase logically fits
   - Consider: dependencies, priority, scope progression
   - Confirm the position with user

4. **Renumber and update**
   - Renumber all affected phases
   - Update \`.planning/ROADMAP.md\` with new structure
   - Move/update any existing phase plan files (phase-1.md → phase-2.md, etc.)
   - Update \`.planning/STATE.md\`

5. **Handle ongoing work**
   - If a phase is currently in progress, handle carefully
   - Update STATE.md to reflect current phase number
   - Git commit with clear message about renumbering

6. **Confirm**
   - Show updated roadmap with all phases
   - Verify no work was lost`;

      ctx.ui.notify(`Inserting phase at ${position}...`, "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:remove-phase
  pi.registerCommand("gsd:remove-phase", {
    description: "Remove a phase from the roadmap",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "ask";

      const prompt = `You are running the GSD remove-phase workflow${phaseNum === "ask" ? "" : ` for Phase ${phaseNum}`}.

**Your tasks:**

1. **Load current roadmap**
   - Read \`.planning/ROADMAP.md\`
   - Show all current phases

2. **Identify phase to remove**
   ${phaseNum === "ask" ? `- Ask user which phase to remove
   - Show what requirements it satisfies
   - Ask for confirmation` : `- Phase ${phaseNum} is the target
   - Show what requirements it covers`}

3. **Assess impact**
   - Which requirements will be removed/delayed?
   - Is this phase already in progress?
   - Any git work that needs to be handled?

4. **Get approval**
   - Explain impact to user
   - Get explicit confirmation before removing

5. **Update roadmap**
   - Remove phase from \`.planning/ROADMAP.md\`
   - Renumber remaining phases
   - Update \`.planning/STATE.md\`
   - Remove/archive the phase plan file

6. **Clean up**
   - Git commit with explanation
   - Show updated roadmap`;

      ctx.ui.notify("Removing phase from roadmap...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:pause-work
  pi.registerCommand("gsd:pause-work", {
    description: "Pause execution and save state for later resumption",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD pause-work workflow.

**Your tasks:**

1. **Capture current state**
   - Identify current phase and milestone
   - Note what was just completed
   - List any in-progress work

2. **Update STATE.md**
   - Record pause timestamp
   - Document: current phase, current milestone, progress percentage
   - List any blockers or next steps
   - Note what the person should do when resuming

3. **Create a checkpoint**
   - Run: \`git status\` to show current state
   - Ask if user wants to stash uncommitted changes
   - If yes: \`git stash\` with descriptive message
   - If no: commit current work with clear message about incomplete state

4. **Document context**
   - Write a quick summary of:
     - What's been done this session
     - What's waiting for next session
     - Any gotchas or gotchas to watch for
   - Add to STATE.md or a PAUSE.md file

5. **Confirm pause**
   - Show the pause summary
   - Remind user how to resume: \`/gsd:resume-work\`
   - Say goodbye!`;

      ctx.ui.notify("Pausing work and saving state...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:resume-work
  pi.registerCommand("gsd:resume-work", {
    description: "Resume from a paused state with full context",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD resume-work workflow.

**Your tasks:**

1. **Load pause context**
   - Read \`.planning/STATE.md\` for pause info
   - Read \`.planning/PAUSE.md\` if it exists
   - Check git log for recent commits
   - Check for stashed changes: \`git stash list\`

2. **Restore work environment**
   - If there's a stash, apply it: \`git stash pop\`
   - Verify working directory matches expected state
   - Check out correct branch if needed

3. **Get context**
   - Read relevant phase plan: \`.planning/phases/phase-N.md\`
   - Review current milestone
   - Check test status

4. **Situational briefing**
   Show user:
   - What phase/milestone are we on?
   - What was completed last session?
   - What's the next task?
   - Any blockers or gotchas?

5. **Get ready**
   - Ask: Ready to continue with X or want to check progress first?
   - Options:
     - \`/gsd:execute-phase N\` — Continue execution
     - \`/gsd:check-todos\` — Review current todos
     - \`/gsd:progress\` — Full progress check

Welcome back! Let's finish this.`;

      ctx.ui.notify("Resuming work...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:complete-milestone
  pi.registerCommand("gsd:complete-milestone", {
    description: "Mark a milestone as complete and route to next action",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD complete-milestone workflow.

**Your tasks:**

1. **Load current state**
   - Read \`.planning/STATE.md\`
   - Identify current milestone
   - Read phase plan for context

2. **Verify completion**
   Ask about acceptance criteria:
   - Does it meet all acceptance criteria?
   - Are tests passing?
   - Is code reviewed/clean?
   - Any known issues or tech debt?
   - Is documentation complete?

3. **Create checkpoint**
   - Git commit with message: "Complete: [milestone name]"
   - Create git tag if desired
   - Update STATE.md to mark milestone done

4. **Audit completion**
   - Run tests one more time
   - Quick code review: any obvious issues?
   - Check against requirements
   - Verify no blockers for next milestone

5. **Route to next**
   Show user options:
   - More milestones in this phase? → \`/gsd:execute-phase N\` (continue)
   - Phase complete? → \`/gsd:complete-phase\`
   - Need a break? → \`/gsd:pause-work\`
   - Check progress? → \`/gsd:progress\`

Celebrate! You completed something.`;

      ctx.ui.notify("Completing milestone...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:complete-phase
  pi.registerCommand("gsd:complete-phase", {
    description: "Mark a phase as complete with audit and summary",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "current";

      const prompt = `You are running the GSD complete-phase workflow for Phase ${phaseNum}.

**Your tasks:**

1. **Load phase context**
   - Read \`.planning/phases/phase-${phaseNum}.md\`
   - Read \`.planning/STATE.md\`
   - Get full picture of what was built

2. **Audit the phase**
   - Run full test suite
   - Review all code committed this phase
   - Check against phase milestones: all complete?
   - Verify all requirements from REQUIREMENTS.md are met

3. **List what was delivered**
   - Features built
   - Tests written
   - Documentation updated
   - Any tech debt incurred?

4. **Update STATE.md**
   - Mark phase complete with timestamp
   - Record what was built
   - Note any deviations from plan
   - Lessons learned?

5. **Create phase summary**
   - Commits made this phase
   - Files changed
   - Test coverage
   - Performance impact if any
   - Write summary to .planning/phases/phase-${phaseNum}-summary.md

6. **Git operations**
   - Ensure all work is committed
   - Create phase tag: v1.${phaseNum}.0
   - Show commit history for phase

7. **Route to next**
   Show user options:
   - More phases to build? → \`/gsd:plan-phase N\` (next phase)
   - Review progress? → \`/gsd:progress\`
   - Demo/showcase? → Show what was built
   - Take a break? → \`/gsd:pause-work\`

Show complete phase summary and next recommended action.`;

      ctx.ui.notify(`Completing Phase ${phaseNum}...`, "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:audit-milestone
  pi.registerCommand("gsd:audit-milestone", {
    description: "Audit a milestone against acceptance criteria",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD audit-milestone workflow.

**Your tasks:**

1. **Load context**
   - Read \`.planning/STATE.md\` for current milestone
   - Read \`.planning/phases/phase-N.md\` for acceptance criteria

2. **Review acceptance criteria**
   For each criterion:
   - Is it met? YES/NO
   - Evidence: what tests pass, what code shows this?
   - Any edge cases covered?
   - Performance acceptable?

3. **Run tests**
   - Unit tests for this milestone
   - Integration tests
   - Manual testing of key flows
   - Error handling verified?

4. **Code review**
   - Check code quality
   - Any obvious bugs or issues?
   - Follows project patterns?
   - Documentation clear?

5. **Create audit report**
   - Acceptance criteria checklist with status
   - Test results
   - Issues found (if any)
   - Recommendations for fix/polish

6. **Route to action**
   - All criteria met? → \`/gsd:complete-milestone\`
   - Issues found? → Show issues and ask how to proceed
   - Need polish? → Ask if user wants to fix now or defer`;

      ctx.ui.notify("Auditing milestone...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:discuss-phase
  pi.registerCommand("gsd:discuss-phase", {
    description: "Deep dive discussion about phase approach and decisions",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "1";

      const prompt = `You are running the GSD discuss-phase workflow for Phase ${phaseNum}.

**Your tasks:**

1. **Load phase plan**
   - Read \`.planning/phases/phase-${phaseNum}.md\`
   - Load REQUIREMENTS.md for context

2. **Present the approach**
   - Show milestones for this phase
   - Explain the technical approach
   - Why this approach vs alternatives?
   - What are the key decisions?

3. **Facilitate discussion**
   Ask the user:
   - Do you want to discuss any aspect deeper?
   - Any concerns about the approach?
   - Are there alternative approaches to consider?
   - Any constraints or preferences we should adjust for?

4. **Explore alternatives** (if requested)
   - Present pros/cons
   - Effort estimates for each approach
   - Long-term implications
   - Recommendation with reasoning

5. **Refine the plan**
   - Based on discussion, should we adjust:
     - Milestones?
     - Sequencing?
     - Technical approach?
   - Update phase plan if needed
   - Git commit changes

6. **Confirm**
   - Show final plan
   - Ask: Ready to start execution or need more discussion?
   - Next step: \`/gsd:execute-phase ${phaseNum}\``;

      ctx.ui.notify(`Discussing Phase ${phaseNum}...`, "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:research-phase
  pi.registerCommand("gsd:research-phase", {
    description: "Spawn parallel research agents for a phase",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "1";

      const prompt = `You are running the GSD research-phase workflow for Phase ${phaseNum}.

This spawns PARALLEL research agents to investigate the domain/tech for this phase.

**Your tasks:**

1. **Load phase context**
   - Read \`.planning/phases/phase-${phaseNum}.md\`
   - Identify key decisions and unknowns
   - What needs research?

2. **Spawn research agents** (run these in parallel mentally/structurally)
   
   **Agent 1: Technology Research**
   - What libraries/frameworks should we use?
   - Are there gotchas or common pitfalls?
   - Performance implications of choices?
   - Security considerations?
   
   **Agent 2: Architecture Research**
   - What design patterns fit this milestone?
   - How should components interact?
   - Scalability considerations?
   - What about error handling?
   
   **Agent 3: Best Practices Research**
   - Industry best practices for this domain?
   - What do successful projects do?
   - Common mistakes to avoid?
   
   **Agent 4: Edge Case Research**
   - What could go wrong?
   - Boundary conditions to handle?
   - Performance limits?
   - Security vectors?

3. **Synthesize findings**
   - Create \`.planning/research/phase-${phaseNum}-research.md\`
   - Document findings from each agent
   - Highlight key decisions/recommendations
   - Flag any risks or unknowns

4. **Update phase plan**
   - Review phase-${phaseNum}.md
   - Update technical approach based on research
   - Add discovered gotchas to acceptance criteria
   - Estimate any adjustments needed

5. **Present to user**
   - Show research summary
   - Key findings and recommendations
   - Any new concerns or unknowns?
   - Ready to proceed or do more research?`;

      ctx.ui.notify(`Researching Phase ${phaseNum}...`, "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:plan-milestone-gaps
  pi.registerCommand("gsd:plan-milestone-gaps", {
    description: "Identify and plan for gaps between milestones",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "current";

      const prompt = `You are running the GSD plan-milestone-gaps workflow for Phase ${phaseNum}.

**Your tasks:**

1. **Load phase plan**
   - Read \`.planning/phases/phase-${phaseNum}.md\`
   - List all milestones in order

2. **Identify gaps**
   Between each milestone pair, look for:
   - Setup/teardown work needed?
   - Integration points between milestones?
   - Shared infrastructure to build first?
   - Testing harness needed?
   - Documentation or examples needed?
   - Technical debt from previous work?

3. **Assess each gap**
   - Is it critical? (blocks next milestone)
   - How much effort?
   - Should it be a separate milestone?
   - Who needs to do it?

4. **Create gap plan**
   - Update phase-${phaseNum}.md with gap tasks
   - Decide: include in milestones or separate gap milestone?
   - Sequence: gaps before, between, or after milestones?

5. **Update roadmap if needed**
   - If gaps are significant, might affect overall timeline
   - Adjust phase plan effort estimates
   - Update STATE.md

6. **Present plan**
   - Show milestone sequence with gaps highlighted
   - Estimated total effort
   - Any concerns?
   - Ready to proceed?`;

      ctx.ui.notify("Planning milestone gaps...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:list-phase-assumptions
  pi.registerCommand("gsd:list-phase-assumptions", {
    description: "List all assumptions made in phase plan",
    handler: async (phaseArg, ctx) => {
      const phaseNum = phaseArg?.trim() || "current";

      const prompt = `You are running the GSD list-phase-assumptions workflow for Phase ${phaseNum}.

**Your tasks:**

1. **Load phase plan**
   - Read \`.planning/phases/phase-${phaseNum}.md\`
   - Read related .planning/ files

2. **Extract assumptions**
   Look for implicit assumptions about:
   - User behavior and needs
   - Technical constraints
   - External service availability
   - Performance requirements
   - Scalability
   - Browser/platform support
   - Data availability
   - Dependencies and versions
   - Team capabilities
   - Timeline and resources

3. **Categorize assumptions**
   - **Critical** — If wrong, plan breaks
   - **Important** — Affects approach
   - **Minor** — Nice to verify

4. **Validate assumptions**
   For each critical/important assumption:
   - Is there evidence for it?
   - What if it's wrong?
   - How would we detect it early?
   - Mitigation strategy?

5. **Create assumptions document**
   - Write \`.planning/phases/phase-${phaseNum}-assumptions.md\`
   - List each assumption with:
     - Statement
     - Why we assume this
     - Risk if wrong
     - How to verify
     - Mitigation if needed

6. **Present to user**
   - Highlight critical assumptions
   - Ask: Any of these feel risky or uncertain?
   - Should we do early validation?`;

      ctx.ui.notify("Listing phase assumptions...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:debug
  pi.registerCommand("gsd:debug", {
    description: "Debug current issues, blockers, or problems",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD debug workflow.

**Your tasks:**

1. **Understand the problem**
   Ask user to describe:
   - What is broken or not working?
   - When did it start?
   - What have you tried?
   - What error messages or symptoms?

2. **Gather context**
   - Read recent commits/diffs
   - Check git log for recent changes
   - Review current STATE.md
   - Look at relevant test output
   - Check for TODOs or FIXMEs in code

3. **Diagnose**
   - Reproduce the issue if possible
   - Isolate the problem area
   - Check for common causes:
     - Missing dependency
     - Type error
     - Logic error
     - Environmental issue
     - Integration issue
   
4. **Create debug plan**
   - Show what we know
   - Propose debug steps
   - Estimate effort to fix
   - Risk assessment

5. **Execute fixes**
   - Apply fixes one at a time
   - Test after each fix
   - Verify issue is resolved

6. **Update artifacts**
   - Update STATE.md with blocker resolution
   - Git commit fix with explanation
   - Note how to prevent in future

7. **Route forward**
   - Continue execution: \`/gsd:execute-phase N\`
   - Check todos: \`/gsd:check-todos\``;

      ctx.ui.notify("Debugging issue...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:reapply-patches
  pi.registerCommand("gsd:reapply-patches", {
    description: "Reapply work from one branch/commit to another",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD reapply-patches workflow.

This helps you port work from one branch to another (e.g., after a rebase, merge conflict, or refactor).

**Your tasks:**

1. **Understand the situation**
   Ask user:
   - What work needs to be reapplied?
   - From which commit/branch/stash?
   - To which target branch?
   - Why the reapply? (merge conflict, rebase, refactor)

2. **Prepare for reapply**
   - Check out target branch
   - Ensure clean working directory
   - Identify specific commits/changes to reapply
   - Review diffs to understand changes

3. **Reapply options**
   Depending on situation, use:
   - \`git cherry-pick\` for individual commits
   - \`git merge\` if merging branches
   - \`git apply\` / \`git patch\` for patches
   - Manual reapplication if complex

4. **Handle conflicts**
   If conflicts arise:
   - Show conflicted files
   - Help user understand conflicts
   - Suggest conflict resolution strategies
   - Test after resolution

5. **Verify reapply**
   - Ensure all intended changes are present
   - Tests still pass?
   - No accidental changes?
   - Code still makes sense in new context?

6. **Commit and document**
   - Create clear commit message
   - Update STATE.md if needed
   - Document why reapply was needed
   - Git tag or mark the successful reapply

7. **Continue**
   - Ready to continue execution?
   - Any new issues from reapply?`;

      ctx.ui.notify("Reapplying patches...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:health
  pi.registerCommand("gsd:health", {
    description: "Check project health and state",
    handler: async (args, ctx) => {
      const prompt = `You are running the GSD health check workflow.

**Your tasks:**

1. **Check core files exist**
   - .planning/PROJECT.md? ✓
   - .planning/REQUIREMENTS.md? ✓
   - .planning/ROADMAP.md? ✓
   - .planning/STATE.md? ✓
   - .planning/config.json? ✓

2. **Review project state**
   - Current phase and milestone?
   - Progress percentage?
   - Is work on track?
   - Any paused work?

3. **Git health**
   - Uncommitted changes (good/bad)?
   - Branch status
   - Recent commit frequency
   - Any stashes lying around?

4. **Test health**
   - Do tests run?
   - Test pass rate
   - Coverage metrics if available

5. **Code quality**
   - Any obvious issues or TODOs?
   - Recent code review status
   - Tech debt building?

6. **Blockers**
   - Any known blockers?
   - What's waiting?
   - What's at risk?

7. **Timeline**
   - How many phases complete?
   - How many phases remaining?
   - On pace to finish?
   - Any schedule concerns?

8. **Overall health report**
   Show user:
   - 🟢 Green: Everything looks good
   - 🟡 Yellow: Some concerns but moving forward
   - 🔴 Red: Significant issues need attention
   
   Specific recommendations for improvement.`;

      ctx.ui.notify("Checking project health...", "info");
      return await ctx.session.prompt(prompt);
    },
  });

  // Command: /gsd:help
  pi.registerCommand("gsd:help", {
    description: "Show all GSD commands and workflows",
    handler: async (args, ctx) => {
      const help = `
🚀 **GSD (Get Shit Done) Commands for Pi**

**Project Initialization:**
  /gsd:new-project [--auto]       Start a new project with full planning
  /gsd:map-codebase               Analyze existing codebase before planning

**Project Progress & Health:**
  /gsd:progress                   Check progress & get routed to next action
  /gsd:health                     Check overall project health
  /gsd:check-todos                Review current TODOs and milestones

**Phase Workflows:**
  /gsd:plan-phase [N]             Plan Phase N (default: 1)
  /gsd:execute-phase [N]          Execute Phase N (default: 1)
  /gsd:complete-phase [N]         Mark Phase N complete with audit
  /gsd:discuss-phase [N]          Deep dive on phase approach
  /gsd:research-phase [N]         Spawn parallel research agents for phase

**Milestone Management:**
  /gsd:complete-milestone         Mark current milestone complete
  /gsd:audit-milestone            Audit milestone vs acceptance criteria
  /gsd:plan-milestone-gaps        Identify & plan gaps between milestones
  /gsd:list-phase-assumptions     Extract and validate assumptions

**Phase Roadmap Management:**
  /gsd:add-phase                  Add a new phase to the roadmap
  /gsd:insert-phase [pos]         Insert phase at specific position
  /gsd:remove-phase [N]           Remove a phase from roadmap

**Work State Management:**
  /gsd:pause-work                 Pause execution and save state
  /gsd:resume-work                Resume from paused state
  /gsd:reapply-patches            Reapply work from one branch to another

**Troubleshooting:**
  /gsd:debug                      Debug current issues and blockers

**Help:**
  /gsd:help                       Show this help message

**Project Files Created:**
  .planning/PROJECT.md               Project overview and context
  .planning/REQUIREMENTS.md           Requirements (V1, V2, out of scope)
  .planning/ROADMAP.md               Phase structure and requirements mapping
  .planning/STATE.md                 Project state and progress tracking
  .planning/config.json              Workflow preferences
  .planning/phases/phase-N.md        Detailed plan for each phase
  .planning/phases/phase-N-assumptions.md    Phase assumptions
  .planning/research/phase-N-research.md     Phase research findings

**Recommended Workflow:**
  1. /gsd:new-project                Initialize project
  2. /gsd:research-phase 1           (optional) Research domain
  3. /gsd:plan-phase 1               Plan Phase 1 with milestones
  4. /gsd:discuss-phase 1            (optional) Discuss approach
  5. /gsd:execute-phase 1            Build Phase 1
  6. /gsd:check-todos                Monitor progress during execution
  7. /gsd:complete-milestone         Mark milestones done as you go
  8. /gsd:complete-phase 1           Wrap up phase with audit
  9. Repeat steps 2-8 for remaining phases

**Quick Commands During Execution:**
  /gsd:progress                      Situational awareness anytime
  /gsd:check-todos                   See what's next
  /gsd:pause-work                    Take a break
  /gsd:resume-work                   Get back to work
  /gsd:debug                         Stuck? Debug blockers
  /gsd:health                        Is project healthy?

**Tips:**
  - Use @references to include .planning/ files in conversations
  - /gsd:progress gives you situational awareness
  - /gsd:check-todos keeps you aligned during execution
  - /gsd:research-phase before big phases to reduce risk
  - /gsd:pause-work when taking breaks
  - /gsd:list-phase-assumptions before execution to surface risks
`;

      ctx.ui.notify(help, "info");
    },
  });


}
