# Extensibility guide

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

When you have an idea to improve Squad, where does it belong? Should it live in Squad core, become a marketplace plugin, or just be team configuration in your `.squad/` directory?

This guide helps you self-sort. Most ideas don't need core changes — they can be expressed as **skills**, **ceremonies**, or **directives** in your team's configuration or shared as plugins for others to use.

---

## The three-layer extensibility model

Squad is designed with a small core and large configuration surface. Here's how change ideas map to each layer:

| Layer | What lives here | Who changes it | Distribution |
|-------|----------------|----------------|--------------|
| **Squad Core** | Coordinator behavior, routing logic, reviewer protocol, eager execution, core orchestration | Squad maintainers only | npm releases |
| **Squad Extension** | Reusable patterns any team could adopt — skills, ceremonies, workflows | Plugin authors | Marketplace plugins |
| **Team Configuration** | Decisions unique to THIS team's process | The team itself | Per-repo `.squad/` files |

**Key principle:** Squad core stays small. Most ideas are skills, ceremonies, or directives.

---

## Decision tree: Where does your idea belong?

Start here when you have a change idea:

```
┌─ Does your idea change HOW the coordinator routes work,
│  spawns agents, or enforces core protocols?
│
├─ YES → Likely Squad Core
│  └─ Examples:
│     • New coordinator modes (triage, assign, execute)
│     • Changes to reviewer approval rules
│     • New agent spawning strategies
│     • Core orchestration protocol changes
│     └─ Action: Open an RFC issue to discuss with maintainers
│
└─ NO → Continue...
   │
   ┌─ Could OTHER teams benefit from this pattern?
   │
   ├─ YES → Squad Extension (plugin)
   │  └─ Examples:
   │     • Reusable workflows (client-delivery, research sprints)
   │     • Domain-specific skills (cloud platforms, testing strategies)
   │     • Ceremony templates (design reviews, post-mortems)
   │     └─ Action: Build a plugin, share in marketplace
   │
   └─ NO → Team Configuration
      └─ Examples:
         • YOUR team's git workflow
         • YOUR team's approval rules
         • YOUR project's build process
         • Agent charters specific to YOUR domain
         └─ Action: Update `.squad/` files in your repo
```

**Quick heuristic:** If your idea starts with "Squad should...", check if it's really "My team should..." or "Teams using pattern X should...". That distinction determines the layer.

---

## Layer 1: Squad Core

**What lives here:**
- Coordinator modes (`triage`, `assign`, `execute`)
- Work routing logic (how issues are matched to agents)
- Reviewer protocol (how approvals work, blocking conditions)
- Eager execution behavior
- Agent spawning and lifecycle management
- Core orchestration protocol

**Who changes it:**
Squad maintainers only.

**When to propose a core change:**
- You need a NEW coordinator mode or routing strategy
- You need to change HOW reviewers approve work
- You need to add enforcement rules that all squads must follow
- Your idea changes the fundamental orchestration model

**Examples of core changes:**
- ✅ Adding a `validate` coordinator mode that runs checks before `assign`
- ✅ Changing reviewer protocol to support conditional approvals
- ✅ Adding agent capability declarations to enable better routing
- ❌ Adding a specific workflow for your team (this is Layer 3)
- ❌ Creating a reusable research sprint pattern (this is Layer 2)

**How to propose a core change:**
1. Open an RFC issue in the Squad repository
2. Explain the problem you're solving
3. Show why it can't be expressed as a skill, ceremony, or directive
4. Describe the proposed coordinator or protocol change
5. Wait for maintainer feedback before implementing

---

## Layer 2: Squad Extensions (plugins)

**What lives here:**
- Reusable skills any team could adopt
- Ceremony templates for common workflows
- Workflow patterns (planning loops, review cycles, research sprints)
- Domain-specific expertise (cloud platforms, testing, security)

**Who creates them:**
Plugin authors — anyone in the community.

**How they're distributed:**
Marketplace plugins via GitHub repositories (like `github/awesome-copilot`).

**When to build a plugin:**
- Your idea solves a problem MANY teams face
- It's a pattern, not a one-off configuration
- You want to share it with the community
- It doesn't require coordinator changes

**Examples of plugins:**
- ✅ `client-delivery-workflow` — discovery interviews, research sprints, multi-round review
- ✅ `azure-cloud-platform` — skills for Azure deployment, monitoring, cost optimization
- ✅ `tdd-workflow` — ceremony templates for test-driven development cycles
- ✅ `security-review-ceremony` — OWASP checklist, threat modeling, pen-test protocols
- ❌ YOUR team's specific git branch naming rules (this is Layer 3)
- ❌ Changes to how the coordinator spawns agents (this is Layer 1)

**Plugin structure:**
```
your-plugin/
├── README.md               # What it does, how to use it
├── skills/
│   ├── skill-name/
│   │   └── SKILL.md        # Skill definition
├── ceremonies/
│   └── ceremony-name.md    # Ceremony template
└── directives/
    └── directive-name.md   # Team directive template
```

**How to build and share a plugin:**
1. Create a GitHub repository for your plugin
2. Structure it with skills, ceremonies, or directives
3. Write clear documentation (what problem it solves, how to install, how to use)
4. Submit to a marketplace (e.g., `github/awesome-copilot`)
5. Teams install with: `squad plugin install {owner/repo/plugin-name}`

**Installing a plugin:**
```bash
squad plugin marketplace add github/awesome-copilot
squad plugin install github/awesome-copilot/client-delivery-workflow
```

---

## Layer 3: Team Configuration

**What lives here:**
- Skills specific to YOUR project
- Ceremonies unique to YOUR team's process
- Directives expressing YOUR team's decisions
- Agent charters for YOUR domain
- Routing rules for YOUR issue labels

**Who changes it:**
The team itself — these are per-repo configuration files.

**When to use team configuration:**
- This decision is unique to YOUR team
- Other teams wouldn't benefit from this pattern
- You're configuring existing Squad primitives, not adding new ones
- You're expressing team process, not changing core behavior

**Examples of team configuration:**
- ✅ A skill for YOUR project's build system (`SKILL.md` in `.squad/skills/our-build-process/`)
- ✅ A ceremony for YOUR team's weekly planning meeting (`.squad/ceremonies.md`)
- ✅ Routing rules for YOUR issue labels (`.squad/routing.md`)
- ✅ Agent charters for YOUR domain experts (`.squad/agents/{name}/charter.md`)
- ❌ A reusable workflow pattern (this is Layer 2)
- ❌ Changes to coordinator routing logic (this is Layer 1)

**How to add team configuration:**

**Add a skill:**
```bash
mkdir -p .squad/skills/my-skill
cat > .squad/skills/my-skill/SKILL.md << 'EOF'
---
name: "my-skill"
description: "What this skill does"
domain: "category"
confidence: "high"
source: "team-decision"
---

## Context
[Explain when to use this skill]

## Steps
1. Do this
2. Then this
3. Finally this
EOF
```

**Add a ceremony:**
Edit `.squad/ceremonies.md` to add a new ceremony block:
```markdown
## My Team Meeting

| Field | Value |
|-------|-------|
| **Trigger** | manual |
| **When** | before |
| **Condition** | weekly sprint planning |
| **Facilitator** | lead |
| **Participants** | all |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Review last week's work
2. Assign this week's issues
3. Identify blockers
```

**Add a directive:**
Write to `.squad/decisions/inbox/{agent}-{slug}.md`:
```markdown
# Decision: Always use TypeScript strict mode

**Context:** We've had runtime type errors slip through.

**Decision:** All new code must use `"strict": true` in tsconfig.json.

**Rationale:** Catches type errors at compile time, reduces production bugs.

**Applies to:** All agents writing TypeScript.
```

The Scribe will merge it into `.squad/decisions.md`.

---

## The Claire test: A worked example

[Claire Novotny's RFC #328](https://github.com/bradygaster/squad/issues/328) proposed a sophisticated client-delivery workflow with discovery interviews, research sprints, multi-round review, and evidence-backed implementation gates. It felt like a big feature request.

**The realization:** It maps ENTIRELY to existing Squad primitives. No core changes needed.

### What Claire wanted

- Discovery interviews before implementation
- Research sprints when the direction is unclear
- Multi-round plan review with `SHIP`/`NEEDS_WORK`/`BLOCKED` verdicts
- Evidence bundles proving implementation quality
- Local workflow artifacts (research briefs, scoring matrices, task graphs)

### Where it actually belongs

**Layer 2: Squad Extension (plugin)**

Claire's workflow is a REUSABLE PATTERN any team could adopt. It's perfect as a marketplace plugin.

**Plugin structure:**
```
client-delivery-workflow/
├── README.md
├── skills/
│   ├── discovery-interview/SKILL.md
│   ├── research-sprint/SKILL.md
│   └── evidence-bundler/SKILL.md
├── ceremonies/
│   ├── plan-review.md
│   └── implementation-review.md
└── directives/
    └── multi-round-review-policy.md
```

**Skills define the work:**
- `discovery-interview` — Clarify rough requests, extract requirements, produce a context pack
- `research-sprint` — Propose multiple directions, score them, recommend the best option
- `evidence-bundler` — Collect test results, logs, screenshots proving implementation quality

**Ceremonies define the gates:**
- `plan-review` — Before implementation starts, reviewers approve or request changes
- `implementation-review` — After implementation, reviewers verify evidence and approve

**Directives define the rules:**
- Multi-round review policy: up to 2 `NEEDS_WORK` rounds with the same author, forced reassignment on the 3rd rejection

**How teams use it:**
```bash
# Install the plugin
squad plugin install github/awesome-copilot/client-delivery-workflow

# The plugin adds skills, ceremonies, and directives to your team
# Agents automatically use them when appropriate
```

**What DOESN'T need core changes:**
- ❌ New coordinator modes (existing `assign` and `execute` modes work fine)
- ❌ New orchestration protocols (skills and ceremonies handle the workflow)
- ❌ Changes to reviewer approval rules (directives express the policy)

**Lesson learned:** Most sophisticated workflows are COMPOSITIONS of primitives, not core features.

---

## When to escalate to core

Sometimes a change idea DOES need core work. Here are the signals:

### You likely need a core change if:

**1. You need a new coordinator mode**
- Example: A `validate` mode that runs checks before `assign`
- Why core: Coordinator modes are part of Squad's orchestration protocol

**2. You need to change routing logic**
- Example: Route based on agent workload, not just labels
- Why core: Routing is a coordinator responsibility

**3. You need to change reviewer protocol**
- Example: Support conditional approvals ("approved if tests pass")
- Why core: Reviewer approval is a core enforcement mechanism

**4. You need to add global enforcement rules**
- Example: Block merges if required evidence is missing
- Why core: Enforcement rules are part of the orchestration protocol

**5. Your skill needs data the coordinator doesn't expose**
- Example: Access to agent spawn history or routing decisions
- Why core: Skills run in agent context; they can't see coordinator state

### You DON'T need a core change if:

**1. You're defining a workflow pattern**
- ❌ Not core: "Discovery interview → research sprint → plan review → implementation"
- ✅ Solution: Express as a plugin with skills and ceremonies

**2. You're adding domain expertise**
- ❌ Not core: "Azure deployment best practices"
- ✅ Solution: Write a skill or share a plugin

**3. You're expressing team process**
- ❌ Not core: "Our team requires design reviews before multi-agent tasks"
- ✅ Solution: Add a ceremony to `.squad/ceremonies.md`

**4. You're creating reusable templates**
- ❌ Not core: "A ceremony template for security reviews"
- ✅ Solution: Build a plugin with ceremony templates

**5. You're configuring existing behavior**
- ❌ Not core: "Route issues labeled `bug` to our QA agent"
- ✅ Solution: Update `.squad/routing.md`

---

## How to build a plugin

Building a Squad plugin is straightforward. Plugins are just collections of skills, ceremonies, and directives packaged for reuse.

### 1. Create a GitHub repository

```bash
mkdir squad-plugin-my-workflow
cd squad-plugin-my-workflow
git init
```

### 2. Add a README

Explain what problem your plugin solves, how to install it, and how to use it.

```markdown
# My Workflow Plugin

Adds discovery interviews, research sprints, and multi-round review to Squad teams.

## Installation

squad plugin marketplace add github/awesome-copilot
squad plugin install github/awesome-copilot/my-workflow

## Usage

When you assign work to your squad, agents will automatically:
1. Conduct discovery interviews to clarify requirements
2. Run research sprints when the direction is unclear
3. Gate implementation on plan approval
4. Collect evidence bundles proving quality
```

### 3. Add skills

Create a `skills/` directory with one subdirectory per skill:

```
skills/
├── discovery-interview/
│   └── SKILL.md
├── research-sprint/
│   └── SKILL.md
└── evidence-bundler/
    └── SKILL.md
```

Each `SKILL.md` follows the Squad skill format:
```markdown
---
name: "discovery-interview"
description: "Clarify rough requests before implementation"
domain: "planning"
confidence: "high"
source: "plugin"
---

## Context
When a user's request is vague or incomplete, run a discovery interview.

## Steps
1. Ask clarifying questions
2. Extract requirements
3. Produce a context pack
```

### 4. Add ceremonies

Create a `ceremonies/` directory with one file per ceremony:

```
ceremonies/
├── plan-review.md
└── implementation-review.md
```

Each ceremony follows the Squad ceremony format:
```markdown
## Plan Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | implementation starts |
| **Facilitator** | lead |
| **Participants** | all-relevant |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Review solution plan
2. Review work plan
3. Approve or request changes
4. Verdict: SHIP, NEEDS_WORK, or BLOCKED
```

### 5. Add directives (optional)

If your plugin includes team policy recommendations, add them to `directives/`:

```
directives/
└── multi-round-review-policy.md
```

### 6. Share in a marketplace

Submit your plugin to a marketplace repository (like `github/awesome-copilot`) via pull request. Maintainers will review and merge.

**For detailed plugin authoring guidance, see the [Plugin Marketplace documentation](./../concepts/plugin-marketplace.md).**

---

## Examples for each layer

### Layer 1: Squad Core

**Example 1: Add a `validate` coordinator mode**
- **Problem:** Before assigning work, teams want to run automated checks (lint, build, tests)
- **Why core:** This adds a new coordinator mode that runs BEFORE `assign`
- **Solution:** Core change required — new mode in coordinator

**Example 2: Support conditional reviewer approvals**
- **Problem:** Reviewers want to say "approved IF tests pass"
- **Why core:** This changes the reviewer approval protocol
- **Solution:** Core change required — extend reviewer logic

**Example 3: Route based on agent workload**
- **Problem:** Avoid overloading one agent by routing to the least-busy agent
- **Why core:** This changes routing logic in the coordinator
- **Solution:** Core change required — update routing algorithm

### Layer 2: Squad Extensions (plugins)

**Example 1: `client-delivery-workflow` plugin**
- **Problem:** Teams want discovery interviews, research sprints, multi-round review
- **Why plugin:** This is a reusable workflow pattern any team could adopt
- **Contents:** Skills (discovery, research, evidence), ceremonies (plan review, implementation review), directives (review policy)

**Example 2: `azure-platform` plugin**
- **Problem:** Teams deploying to Azure need skills for infrastructure, monitoring, cost optimization
- **Why plugin:** This is domain-specific expertise many teams need
- **Contents:** Skills (deploy to AKS, set up Application Insights, optimize costs)

**Example 3: `tdd-workflow` plugin**
- **Problem:** Teams practicing TDD want structured red-green-refactor cycles
- **Why plugin:** This is a reusable testing workflow
- **Contents:** Ceremony templates (test review, refactor review), skills (generate failing tests, refactor safely)

### Layer 3: Team Configuration

**Example 1: Add a skill for YOUR build system**
- **Problem:** Your project uses a custom build pipeline
- **Why team config:** This is specific to YOUR project, not reusable
- **Location:** `.squad/skills/our-build-process/SKILL.md`

**Example 2: Add a ceremony for YOUR weekly planning**
- **Problem:** Your team has a weekly sprint planning meeting
- **Why team config:** This is YOUR team's process, not a generic pattern
- **Location:** `.squad/ceremonies.md` (add a new ceremony block)

**Example 3: Route issues to YOUR QA agent**
- **Problem:** Issues labeled `bug` should go to your QA specialist
- **Why team config:** This is YOUR team's routing rule
- **Location:** `.squad/routing.md` (add a routing rule)

**Example 4: Agent charter for YOUR domain**
- **Problem:** You have a domain expert (e.g., database specialist)
- **Why team config:** This charter is specific to YOUR project
- **Location:** `.squad/agents/{name}/charter.md`

---

## Summary: Self-sorting your change idea

1. **Start with the decision tree** — Most ideas are Layer 2 or Layer 3.
2. **Default to team configuration** — If it's unique to your team, put it in `.squad/`.
3. **Build a plugin if it's reusable** — If other teams would benefit, package it and share it.
4. **Escalate to core only when primitives aren't enough** — If you need new coordinator modes, routing logic, or enforcement rules, open an RFC.

**Key insight:** Squad core is intentionally small. The power is in composition — skills, ceremonies, and directives can express sophisticated workflows without core changes.

**When in doubt:** Start with team configuration. If you find yourself copy-pasting it to other teams, promote it to a plugin. If you find plugins repeatedly hitting the same limitation, that's a signal for a core change.

---

## Related documentation

- [Plugin Marketplace](./../concepts/plugin-marketplace.md) — How to browse, install, and share plugins
- [Skills](./../concepts/skills.md) — How to write skills for your team or plugins
- [Ceremonies](./../concepts/ceremonies.md) — How to define team meetings and gates
- [Routing](./../concepts/routing.md) — How to configure work assignment rules
- [Contributing](./contributing.md) — How to propose changes to Squad core

---

**Questions?** [Open an issue](https://github.com/bradygaster/squad/issues/new) or join the discussion in the Squad community.
