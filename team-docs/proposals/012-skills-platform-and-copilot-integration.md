# Proposal 012: Skills, Platform Feasibility, and the v1 Copilot Integration Story

**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-08  
**Revised:** 2026-02-09  
**Status:** Approved ✅ Shipped  
**Triggered by:** bradygaster — clarified that "skills" means Claude-and-Copilot-compliant skills adhering to the Anthropic SKILL.md standard (agentskills.io). Also requested: MCP tool declaration in skills so Copilot can wire up the right MCP servers.

---

## Executive Summary

**What changed since v1 of this proposal:** Brady clarified the skills story. Skills are not a Squad-specific invention — they follow the **Agent Skills Open Standard** (agentskills.io). This means SKILL.md frontmatter, progressive disclosure (discovery → activation → execution), and the standard directory layout. Brady also asked whether skills can declare MCP tool dependencies so Copilot knows which MCP servers to wire up.

This revision preserves all v1 analysis (store_memory rejection, forwardability, tiered modes, portability) and adds:
1. How Squad adopts the Agent Skills Open Standard
2. How skills declare MCP tool requirements
3. How the coordinator discovers and injects skills into spawn prompts
4. The coordinator prompt size problem and where skills discovery should live
5. Built-in vs. learned skills and the upgrade story
6. What we can actually ship

**My assessment:**

| Aspect | Verdict |
|--------|---------|
| Agent Skills Open Standard adoption | **Feasible for v1.** SKILL.md format is filesystem-native — aligns perfectly with Squad's architecture. |
| Skills in spawn prompts | **Feasible for v1.** Progressive disclosure keeps coordinator context lean (~50-100 tokens per skill at discovery). |
| MCP tool declaration in skills | **Feasible for v1 (declarative).** Skills declare MCP needs in `metadata.mcp-servers`. Coordinator passes requirements to agents in spawn prompts. Actual MCP availability depends on user's Copilot configuration. |
| MCP auto-configuration | **Not feasible for v1.** Skills can document MCP requirements but can't auto-install MCP servers. That's a platform limitation. |
| Skill acquisition | **Feasible for v1 (manual + agent self-write).** Standard-compliant from day one. |
| `store_memory` integration | **Not useful for v1.** Wrong persistence model — session-scoped, not Squad-scoped. (Unchanged from v1.) |
| Forwardability | **Real risk, manageable.** Defensive file reads, not version fields. (Unchanged from v1.) |
| Built-in vs. learned skills | **Feasible for v1.** `skills/` directory for built-in (shipped with Squad, upgradable), agent-local SKILL.md for learned (never overwritten). |
| v1 experience synthesis | **The path is clear.** Standard-compliant skills + MCP declarations + tiered modes + portability = a product that gets better AND plays well with the ecosystem. |

---

## 1. The Agent Skills Open Standard and Squad

### What is a skill (revised)?

Brady clarified: skills mean **Claude-and-Copilot-compliant skills** following the **Agent Skills Open Standard** (agentskills.io). This is not a Squad-specific format — it's an open standard designed for portability across agent platforms.

A skill is a self-contained unit of agent capability with a standardized directory layout:

```
skill-name/
├── SKILL.md          # Required — frontmatter + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation, examples
└── assets/           # Optional: templates, resources
```

SKILL.md uses YAML frontmatter for machine-readable metadata, followed by markdown instructions for the agent:

```yaml
---
name: react-component-patterns
description: >
  React component architecture patterns including composition over inheritance,
  state management strategy selection, and performance optimization techniques.
  Use when building or refactoring React components.
license: Apache-2.0
compatibility: Designed for Claude Code, GitHub Copilot
allowed-tools: Read Bash(npx:*) Bash(npm:*)
metadata:
  author: squad-team
  version: "1.0"
  mcp-servers:
    - name: filesystem
      reason: "Needs to read/write component files"
    - name: postgres
      reason: "May need to query schema for data-connected components"
      optional: true
---

# React Component Patterns

## When to activate
Use this skill when the task involves building, refactoring, or reviewing React components.

## Patterns
- **Composition over inheritance:** Use children pattern for layout wrappers...
- **State management:** Local state for UI, context for cross-cutting concerns...
[rest of instructions]
```

### How this maps to Squad's existing architecture

The standard was designed for exactly the kind of filesystem-backed agent systems we already have. Here's the mapping:

| Standard concept | Squad implementation |
|-----------------|---------------------|
| Skills directory | `.ai-team/skills/` (team-wide) + `.ai-team/agents/{name}/skills/` (per-agent) |
| SKILL.md | Standard format, no changes needed |
| Progressive disclosure | Coordinator loads only `name` + `description` at discovery; full SKILL.md on activation |
| `allowed-tools` | Passed through in spawn prompt — agents already have full tool access via `general-purpose` |
| `metadata.mcp-servers` | **New:** Coordinator includes MCP requirements in spawn prompt (see Section 2) |
| `scripts/` | Agent can execute scripts during task execution |
| `references/` | Agent loads on demand — "load references on demand" per the standard |
| `assets/` | Templates, configs, etc. — agent uses as needed |

### How the coordinator discovers and injects skills

**Discovery (at spawn time, not session start):**

The coordinator does NOT read all skills at session start. That would be wasteful — skills are agent-scoped context. Instead, discovery happens when spawning an agent:

1. Check if `.ai-team/skills/` exists (team-wide skills)
2. Check if `.ai-team/agents/{name}/skills/` exists (agent-specific skills)
3. For each skill directory found, read only the SKILL.md frontmatter (`name` + `description`) — ~50-100 tokens each
4. Build the `<available_skills>` XML block per the standard
5. Include in spawn prompt

**Injection into spawn prompts (RECOMMENDED for v1):**

```
prompt: |
  You are Fenster, the Core Dev on this project.
  
  YOUR CHARTER:
  {contents of charter.md}
  
  <available_skills>
    <skill>
      <name>react-component-patterns</name>
      <description>React component architecture patterns including composition over inheritance...</description>
      <location>.ai-team/skills/react-component-patterns/SKILL.md</location>
    </skill>
    <skill>
      <name>api-design</name>
      <description>REST API design conventions, error handling, pagination strategies.</description>
      <location>.ai-team/agents/fenster/skills/api-design/SKILL.md</location>
    </skill>
  </available_skills>
  
  MCP TOOL REQUIREMENTS:
  The following skills declare MCP server dependencies. If an MCP tool is listed,
  use it when the skill calls for it. If a server is marked optional and unavailable,
  proceed without it and note the limitation.
  - react-component-patterns: filesystem (required)
  - react-component-patterns: postgres (optional — for data-connected components)
  
  Read .ai-team/agents/fenster/history.md — this is what you know about the project.
  Read .ai-team/decisions.md — these are team decisions you must respect.
  
  {task}
```

**Why the XML block instead of inlining full SKILL.md content:** Progressive disclosure. The agent sees skill names and descriptions (~100 tokens total for 5 skills). When the task matches a skill, the agent reads the full SKILL.md on demand (~200-400 tokens). This is the standard's intended pattern and it keeps spawn prompts lean.

**Why NOT inline full skill content:** A single SKILL.md can be up to 500 lines. With 5 skills, that's potentially 2,500 lines of skill content in every spawn prompt — a budget disaster. Progressive disclosure solves this.

### Context budget analysis (revised)

| Component | Tokens | % of 128K |
|-----------|--------|-----------|
| Coordinator prompt (`squad.agent.md`) | ~8,000 | 6.3% |
| Charter (inlined) | ~500 | 0.4% |
| Skills discovery XML (5 skills × ~100 tokens) | ~500 | 0.4% |
| Skills activation (agent reads 1-2 SKILL.md on demand) | ~400-800 | 0.3-0.6% |
| MCP requirements block | ~100-200 | 0.1-0.2% |
| History (agent reads) | ~500-5,600 | 0.4-4.4% |
| Decisions (agent reads) | ~200-4,000 | 0.2-3.1% |
| **Total per spawn** | **~10,200-19,600** | **8.0-15.3%** |

Progressive disclosure means skills cost ~0.4% at discovery (always paid) plus ~0.3-0.6% at activation (paid only when relevant). This is actually cheaper than my v1 proposal of inlining all skills.

**How many skills can we afford?** At ~100 tokens per skill for discovery, we can carry 20-30 skills in the XML block before it becomes noticeable (~2-3% of context). In practice, 5-10 skills per agent is a reasonable v1 ceiling. Beyond that, the coordinator should filter to the most relevant skills based on task domain (v2).

### Skill directory layout

```
.ai-team/
├── skills/                              # Team-wide skills (apply to all agents)
│   ├── typescript-conventions/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── tsconfig-guide.md
│   └── git-workflow/
│       └── SKILL.md
├── agents/
│   ├── fenster/
│   │   ├── charter.md
│   │   ├── history.md
│   │   └── skills/                      # Agent-specific learned skills
│   │       ├── react-component-patterns/
│   │       │   ├── SKILL.md
│   │       │   └── references/
│   │       │       └── hook-patterns.md
│   │       └── api-design/
│   │           └── SKILL.md
```

**Team-wide skills** (`.ai-team/skills/`) are injected into every agent's spawn prompt. These represent shared conventions — "we always use TypeScript strict mode," "our git workflow follows trunk-based development." This answers the open question from v1 about per-agent vs per-squad skills.

**Agent-specific skills** (`.ai-team/agents/{name}/skills/`) are learned skills that the agent accumulated through work. These travel with the agent on export.

Both follow the identical SKILL.md standard format.

---

## 2. MCP Tool Declaration in Skills

### The problem Brady raised

Brady asked: *"could we also find a way to be able to tell copilot which mcp tools our skills would need?"*

This is a real need. A skill that knows how to work with Postgres schemas is useless if the Postgres MCP server isn't available. A skill that manages Azure DevOps work items needs the Azure DevOps MCP server. How does the agent know what's available, and how does the coordinator communicate requirements?

### How Copilot handles MCP today

On the Copilot platform:
- Users configure MCP servers in their Copilot settings (VS Code settings, `.github/copilot-mcp.json`, etc.)
- Once configured, MCP tools appear as available tools in the agent's tool list
- Copilot is already good at discovering and using MCP tools when given instructions
- **Agents cannot programmatically check which MCP servers are configured.** They can only try to use a tool and see if it works.

### How skills declare MCP requirements

The Agent Skills Open Standard's `metadata` field is explicitly designed for arbitrary key-value pairs. We extend it with `mcp-servers`:

```yaml
---
name: database-schema-management
description: >
  Manages database schema migrations, generates models from existing schemas,
  and validates schema changes against conventions.
allowed-tools: Bash(npx:*) Read
metadata:
  author: squad-team
  version: "1.0"
  mcp-servers:
    - name: postgres
      reason: "Query existing schema, validate migrations"
      optional: false
    - name: filesystem
      reason: "Read/write migration files"
      optional: false
---
```

For skills that use MCP tools as an enhancement but can work without them:

```yaml
metadata:
  mcp-servers:
    - name: azure-devops
      reason: "Link code changes to work items"
      optional: true
      fallback: "Skip work item linking; agent should note the limitation in output"
```

### How the coordinator communicates MCP requirements to agents

**At spawn time**, the coordinator aggregates MCP requirements from all skills being injected and includes a dedicated section in the spawn prompt:

```markdown
MCP TOOL REQUIREMENTS:
Skills you may activate declare the following MCP server dependencies.
Use the listed MCP tools when the skill's instructions call for them.
If a required server is unavailable, STOP and tell the coordinator.
If an optional server is unavailable, proceed without it and note the limitation.

| Skill | MCP Server | Required? | Purpose |
|-------|-----------|-----------|---------|
| database-schema-management | postgres | Yes | Query schema, validate migrations |
| database-schema-management | filesystem | Yes | Read/write migration files |
| code-review-conventions | azure-devops | No | Link to work items (skip if unavailable) |
```

**Why a table in the spawn prompt:** Copilot already handles MCP tool instructions well when they're explicit. Agents don't need to parse SKILL.md frontmatter to know about MCP requirements — the coordinator extracts this at spawn time and presents it clearly. The agent just follows instructions.

### What happens when MCP servers are unavailable?

This is the hard question. There are three cases:

**Case 1: Required MCP server, configured by user → Works.**
The agent uses the MCP tool normally. No special handling needed.

**Case 2: Optional MCP server, not configured → Graceful degradation.**
The agent proceeds without the MCP tool, using the `fallback` instruction from the skill metadata. The spawn prompt says "proceed without it and note the limitation." This works today — no platform changes needed.

**Case 3: Required MCP server, not configured → Fail fast.**
The agent can't do the task properly. Two options:

- **v1 approach (RECOMMENDED):** The agent tries to use the MCP tool, gets an error, and reports back: "This task requires the Postgres MCP server. Please configure it in your Copilot settings." This is imperfect (wastes a tool call attempt) but works today with zero platform changes.
- **v2 approach:** The coordinator checks MCP availability before spawning. This requires either (a) a platform API to query available MCP servers, or (b) a convention where users declare available MCP servers in a config file (`.ai-team/mcp-config.json`). Neither exists today.

### Could skills auto-configure MCP servers?

**No, and they shouldn't.** MCP servers involve credentials, connection strings, and security scoping. Auto-configuring them would be a security antipattern. What skills CAN do:

1. **Document requirements.** The SKILL.md references/ directory can include setup instructions:
   ```
   database-schema-management/
   ├── SKILL.md
   └── references/
       └── mcp-setup.md    ← "To use this skill, configure the Postgres MCP server: ..."
   ```

2. **Detect and guide.** When the agent activates the skill and finds the MCP server unavailable, it can tell the user exactly what to configure and link to the setup docs.

3. **Declare in `.github/copilot-mcp.json` (aspirational).** If Copilot's MCP config format supports conditional/suggested servers, skills could contribute entries. This doesn't exist today but aligns with the platform direction.

### Platform reality check on MCP

| MCP Capability | Works Today? | Notes |
|---------------|-------------|-------|
| Using MCP tools that users have configured | ✅ Yes | Copilot handles this well |
| Declaring MCP requirements in SKILL.md metadata | ✅ Yes | Standard metadata field, our convention |
| Communicating MCP requirements in spawn prompts | ✅ Yes | Just text instructions, agents follow them |
| Detecting if an MCP server is available before use | ❌ No | Agent must try and fail |
| Auto-configuring MCP servers | ❌ No | Security concern, shouldn't do this anyway |
| Querying available MCP servers programmatically | ❌ No | No platform API for this |
| Contributing to `.github/copilot-mcp.json` | ❌ No | Config format doesn't support conditional entries |

**The v1 story:** Skills declare MCP requirements. The coordinator communicates them. Agents try to use MCP tools and degrade gracefully if unavailable. Users configure MCP servers themselves. This is honest, works today, and standard-compliant.

---

## 3. Skill Acquisition (Standard-Compliant)

### Who writes SKILL.md files?

Three paths, in order of implementation priority:

#### Path 1: Agents create skills from work (v1)

After completing work, if an agent discovers a transferable pattern, it creates a new skill directory following the standard:

**Spawn prompt addition:**

```markdown
AFTER your work, you MUST update these files:

1. APPEND to .ai-team/agents/{name}/history.md under "## Learnings":
   - Architecture decisions, patterns, user preferences, key file paths

2. If you learned something TRANSFERABLE (useful in ANY project, not just this one),
   create a skill following the Agent Skills Open Standard:
   
   a. Create directory: .ai-team/agents/{name}/skills/{skill-name}/
   b. Create SKILL.md with frontmatter:
      ---
      name: {skill-name}    (lowercase-hyphen-case, must match folder)
      description: {what it does and when to use it, max 1024 chars}
      metadata:
        author: {your-name}
        version: "1.0"
        mcp-servers: []      (list any MCP servers this skill needs)
      ---
      {instructions — concrete, actionable patterns}
   
   c. If the skill references detailed docs, put them in references/
   d. Keep SKILL.md under 500 lines — move details to references/
   
   NOT project-specific paths. NOT this project's architecture decisions.
   If unsure whether it's transferable, put it in history.md instead.

3. If you made a decision others should know, write it to:
   .ai-team/decisions/inbox/{name}-{brief-slug}.md
```

**Risk:** Agents will create too many small skills. Mitigation: the "if unsure, put it in history.md" instruction biases toward under-creation. Scribe can consolidate in v2.

#### Path 2: Users teach skills explicitly (v1)

The user says: "Fenster should know that we always use Tailwind CSS."

The coordinator creates a standard-compliant skill:

```
.ai-team/agents/fenster/skills/tailwind-css/SKILL.md
```

```yaml
---
name: tailwind-css
description: CSS framework convention — always use Tailwind CSS for styling.
metadata:
  author: user-taught
  version: "1.0"
---

# Tailwind CSS Convention

- **Framework:** Always use Tailwind CSS. No custom CSS unless Tailwind can't express it.
- **Config:** Use `tailwind.config.js` for custom theme values.
- **Utilities:** Prefer utility classes over @apply in most cases.
```

Implementation: the coordinator detects "teach" or "should know" patterns and creates the skill directory + SKILL.md directly. This aligns with Proposal 007's "coordinator handles direct tasks" pattern.

#### Path 3: Scribe curates and consolidates skills (v2)

Scribe already merges decisions. Natural extension: Scribe periodically reviews agent histories, identifies recurring patterns, and promotes them to standard-compliant skills.

```
Scribe logic:
- Agent X referenced "prefer composition over inheritance" in 3 different history entries
- This is a pattern, not a one-off
- Create .ai-team/agents/x/skills/react-composition/SKILL.md
- Consolidate the 3 history entries into a proper skill with references
```

This requires Scribe to read multiple agent histories (access control change — small but explicit).

#### Path 4: Coordinator detects skill formation (REJECTED — unchanged from v1)

The coordinator doesn't persist between sessions. Reading all agent histories to detect patterns is expensive and slow. Let agents and Scribe handle skill writing.

---

## 4. Skills and the Coordinator Prompt Size Problem

### The problem

`squad.agent.md` is already 32KB. Adding skills discovery logic, MCP requirement extraction, and skill-aware routing to the coordinator increases it further. At some point, instruction-following degrades.

### Should skills discovery live in the coordinator?

**Analysis of three options:**

#### Option A: Coordinator discovers and injects all skills (RECOMMENDED for v1)

The coordinator scans skill directories, builds the XML block, extracts MCP requirements, and includes everything in the spawn prompt.

**Pros:** Single point of control. Coordinator already reads charters — reading skill frontmatter is the same pattern. Progressive disclosure keeps the cost low (~50-100 tokens per skill at discovery).

**Cons:** Adds ~10-15 lines of instruction to `squad.agent.md`. With the coordinator already at 32KB, every line matters.

**Cost to `squad.agent.md`:** ~500-800 tokens of new instructions. This is ~0.4-0.6% of the context window. Manageable, but we're accumulating debt.

#### Option B: Agents discover their own skills (NOT RECOMMENDED for v1)

Each agent reads its own skills directory. No coordinator involvement.

**Pros:** Zero addition to `squad.agent.md`. Agents are self-contained.

**Cons:** Each agent pays a tool call to scan directories (~1-2s). Agents can't report MCP requirements back to the coordinator for pre-validation. Breaks the inline pattern — the coordinator's whole job is to prepare the spawn prompt so the agent can hit the ground running.

#### Option C: Skills discovery delegated to a lightweight pre-spawn step (v2)

The coordinator spawns a lightweight `explore` agent to scan skills and build the injection payload. The coordinator then uses the payload in the actual spawn prompt.

**Pros:** Coordinator doesn't need to know how to parse skill directories. Offloads complexity.

**Cons:** Adds a round-trip before every spawn. This is the opposite of what Proposal 007 recommends (reduce ceremony, not add it).

**Decision: Option A for v1.** The coordinator adds ~500-800 tokens of skills-discovery instructions. This is less than 1% of context and keeps spawn prompts lean through progressive disclosure. If `squad.agent.md` grows past 40KB, we revisit.

### The 32KB coordinator prompt — is it a crisis?

No, but it's a trend to watch.

| Version | squad.agent.md size | % of 128K context |
|---------|--------------------|--------------------|
| Current | ~32KB (~8,000 tokens) | 6.3% |
| + Skills discovery | ~33KB (~8,600 tokens) | 6.7% |
| + MCP extraction | ~33.5KB (~8,800 tokens) | 6.9% |
| + Skill-aware routing | ~34KB (~9,000 tokens) | 7.0% |

Even with all skills features, the coordinator prompt stays under 7% of context. The real danger isn't absolute size — it's instruction density. A 34KB prompt with clear structure and headers is fine. A 34KB prompt with contradictory or redundant instructions degrades performance.

**Recommendation:** When adding skills instructions to `squad.agent.md`, audit existing instructions for redundancy. Every new feature is an opportunity to tighten old instructions.

---

## 5. Skills and the Tiered Response Modes (Proposal 007)

### Does a skilled agent need lighter spawns?

Yes — and this is one of the clearest wins.

Proposal 007 defined four modes: Direct → Lightweight → Standard → Full. Skills add a new routing signal:

| Signal | Without skills | With skills |
|--------|---------------|-------------|
| "Fix the React component" | Standard (full spawn, agent reads everything) | Lightweight (agent has React skills, skip re-reading for basic React patterns) |
| "Build a new API endpoint" | Standard | Standard (but agent arrives with API design skills already loaded) |
| "Set up the project" | Full | Standard (skilled agent can scaffold without full-team ceremony) |

**The key insight:** A skilled agent's spawn prompt already contains domain knowledge. It needs less project-context loading to be useful. This naturally maps to the lightweight spawn template from Proposal 007:

```markdown
### Skilled Lightweight Spawn

agent_type: "general-purpose"
mode: "background"
description: "{Name}: {brief task}"
prompt: |
  You are {Name}, the {Role}. You have these relevant skills:
  
  {selected skills from skills.md — only the relevant domain}
  
  Make this change:
  {specific task}
  
  Skip reading history.md and decisions.md — this is a focused task in your skilled domain.
  AFTER: append a one-line note to history.md. If you learned something transferable, append to skills.md.
```

**Savings over standard spawn:** 2 fewer file reads by the agent (~3s) + shorter prompt (~1s) = **~4 seconds faster** for skilled-domain tasks.

### Faster routing via skill matching

The coordinator can route faster when it knows agent skills:

```
User: "Fix the React rendering issue in the dashboard"

Coordinator routing (without skills):
- Read routing.md → Fenster handles "Core Dev" → spawn Fenster
- Standard spawn (Fenster reads history, decisions, does work)

Coordinator routing (with skills):
- Read routing.md → Fenster handles "Core Dev"
- Fenster has React skills → this is a skilled-domain task → lightweight spawn
- Skip full context load, inject React skills directly
```

The routing table in `squad.agent.md` gets a new column:

```markdown
### Skill-Aware Routing

| Signal | Agent | Skills Match? | Mode |
|--------|-------|---------------|------|
| React/frontend task | Fenster | Has React skills | Lightweight |
| API task | Fenster | Has API skills | Lightweight |
| New domain (unfamiliar) | Fenster | No matching skills | Standard |
| Architecture decision | Keaton | Has architecture skills | Standard (still needs full context for decisions) |
```

**Constraint:** Skill-matched routing should NEVER downgrade architecture decisions or multi-agent work to lightweight. Skills reduce startup cost; they don't replace judgment about task complexity.

---

## 6. The Forwardability Angle (Revised)

### The problem (unchanged)

When `squad.agent.md` gets updated (new features, changed instructions, bug fixes), the coordinator's behavior changes. But the team state (charters, histories, decisions, skills) was created under the old coordinator.

### Reality check (unchanged)

**The LLM handles this better than you'd expect, but not perfectly.**

The coordinator prompt is *instructions*, not *schema*. Existing team files are just markdown — they don't have version-dependent structure.

**Where it breaks with skills:**

| Scenario | Risk | Example |
|----------|------|---------|
| New `skills/` directory expected, doesn't exist | **Medium** | v0.2 expects `.ai-team/skills/`, old squad has no skills directory |
| Old `skills.md` flat file vs new `skills/` directory layout | **Medium** | If we ship flat `skills.md` now and switch to directory layout later, old skills files break |
| SKILL.md frontmatter parsing | **Low** | Agent reads SKILL.md but doesn't understand frontmatter — just treats it as markdown |
| MCP server declared but not configured | **Low** | Agent tries to use MCP tool, gets error, handles gracefully |

**Critical forwardability decision:** We should adopt the Agent Skills Open Standard directory layout from day one, even in v1. Switching from a flat `skills.md` file to the standard directory layout later would be a migration headache. Starting with the standard means the format is stable forever.

### Recommended approach: defensive directory checks, not version fields (revised)

```markdown
**Skills loading (if available):**
- Before spawning, check if `.ai-team/skills/` exists (team-wide skills).
- Check if `.ai-team/agents/{name}/skills/` exists (agent-specific skills).
- For each skills directory, list subdirectories. Each is a skill.
- For each skill, read only the SKILL.md file's name + description from frontmatter.
- Build the <available_skills> XML block.
- If no skills directories exist, skip — the squad has no skills yet. This is normal.
```

**The one thing we MUST NOT do (unchanged):** Change file paths that charters reference. File paths in charters are a de facto API contract.

**New contract:** The skills directory layout (`.ai-team/skills/{name}/SKILL.md` and `.ai-team/agents/{name}/skills/{name}/SKILL.md`) is now also a de facto API contract. Freeze this structure.

---

## 7. Built-in Skills vs. Learned Skills

### The two categories

Brady asked about `create-squad upgrade` and whether it should update skills. This introduces two distinct skill categories:

**Built-in skills** — shipped with Squad, maintained by the project, upgradable.
- Live in a known location that `create-squad` manages
- Examples: `git-workflow`, `testing-conventions`, `code-review-best-practices`
- Updated when the user runs `create-squad upgrade`
- Never contain project-specific knowledge

**Learned skills** — created by agents or users during work, never overwritten by upgrades.
- Live in `.ai-team/agents/{name}/skills/` (agent-specific) or `.ai-team/skills/` (team-wide, user-created)
- Examples: `react-component-patterns` (learned by Fenster), `tailwind-css` (taught by user)
- Survive `create-squad upgrade` — upgrades never touch these directories
- May be stale, redundant, or contradictory — curation is manual in v1

### How `create-squad upgrade` handles skills

```
create-squad upgrade flow:
1. Update squad.agent.md (coordinator prompt)
2. Update templates/ (charter, history, routing templates)
3. Update built-in skills:
   a. Check templates/skills/ for built-in skill definitions
   b. For each built-in skill:
      - If skill directory doesn't exist in .ai-team/skills/, create it
      - If skill directory exists, compare SKILL.md metadata.version
      - If template version is newer, update SKILL.md (overwrite)
      - Never touch references/, scripts/, or assets/ if user has modified them
4. NEVER touch .ai-team/agents/{name}/skills/ — these are learned skills
```

### The templates/skills/ directory

Built-in skills ship as templates:

```
templates/
├── charter.md
├── history.md
├── skills/                          # Built-in skill templates
│   ├── git-workflow/
│   │   └── SKILL.md
│   └── code-review-conventions/
│       └── SKILL.md
```

On `create-squad init`, these are copied to `.ai-team/skills/`. On `create-squad upgrade`, they're updated if the template version is newer.

### Naming convention to avoid conflicts

- Built-in skills use a `squad-` prefix: `squad-git-workflow`, `squad-code-review`
- Learned skills use descriptive names without prefix: `react-patterns`, `tailwind-css`
- This makes it visually clear which skills are upgradable and which are user-owned

---

## 8. Skills and Portable Squads (Proposal 008 Interaction)

### What travels with the squad?

When exporting a squad via `create-squad export`:

| Content | Exported? | Notes |
|---------|-----------|-------|
| `.ai-team/agents/{name}/skills/` | ✅ Yes | Learned skills travel unconditionally — they're transferable by definition |
| `.ai-team/skills/` (team-wide) | ✅ Yes | Team conventions are part of squad identity |
| Built-in skills from `templates/skills/` | ❌ No | The target project will have its own version of built-ins via `create-squad init` |
| SKILL.md frontmatter | ✅ Yes | Preserved exactly, including MCP server declarations |
| `scripts/` and `references/` | ✅ Yes | Full skill directories are portable |

### Path relocatability

Skills reference paths internally — `references/hook-patterns.md`, `scripts/generate-model.sh`. These are relative paths within the skill directory. The export format preserves the directory structure, so relative paths remain valid after import.

**The `.squad` export format update:**

```json
{
  "squad_format_version": "1.1",
  "agents": {
    "fenster": {
      "charter": "...",
      "history": { "portable": "...", "project": "..." },
      "skills": {
        "react-component-patterns": {
          "skill_md": "---\nname: react-component-patterns\n...",
          "references": {
            "hook-patterns.md": "..."
          },
          "scripts": {},
          "assets": {}
        }
      }
    }
  },
  "team_skills": {
    "typescript-conventions": {
      "skill_md": "---\nname: typescript-conventions\n...",
      "references": {}
    }
  }
}
```

Skills are embedded as structured objects with all their files, not just the SKILL.md content. This ensures the full skill directory structure is recreated on import.

### Import behavior

```
create-squad import <file> flow:
1. Reconstruct .ai-team/agents/{name}/skills/ from agent skills in export
2. Reconstruct .ai-team/skills/ from team_skills in export
3. Do NOT import built-in skills — the target project's create-squad init handles those
4. If a learned skill conflicts with a built-in skill (same name), rename the learned skill with a -imported suffix
```

---

## 9. The `store_memory` Angle (Unchanged)

### Why it's NOT useful for Squad v1

| `store_memory` property | Squad's need | Match? |
|------------------------|-------------|--------|
| Session-scoped persistence | Cross-project, cross-session memory | ❌ No |
| <200 character facts | Rich SKILL.md files (paragraphs, references) | ❌ No |
| Flat key-value storage | Structured agent-specific skill directories | ❌ No |
| Platform-managed retrieval | Git-cloneable, human-readable files | ❌ No |
| No agent identity | Per-agent skill directories | ❌ No |

**The Agent Skills Open Standard makes this even clearer.** Skills are directories with multiple files (SKILL.md, references, scripts, assets). `store_memory` stores 200-char strings. These are fundamentally different things. The standard chose the filesystem. So did we.

**Don't build on `store_memory`. Build on the filesystem.** If the platform catches up, we can bridge later.

---

## 10. What the v1 Copilot Experience Should Feel Like (Revised)

### The synthesis

Four concerns converge into one product story:

- **Proposal 007 (Latency):** The coordinator gets smarter about when to spawn.
- **Proposal 008 (Portability):** Squads move between projects, carrying identity and skills.
- **Proposal 012 (Skills):** Agents accumulate standard-compliant transferable expertise.
- **MCP integration:** Skills declare tool dependencies, agents use them when available.

Together, they describe a product that **gets better the more you use it** AND **plays well with the broader agent ecosystem**.

### The ideal v1 session with standard-compliant skills

**First project, first session (minute 0):**

```
User: "I'm building a React dashboard with a Node.js API. We use Postgres."

Squad: Hey Brady, what are you building?
[Casts team from The Usual Suspects]
🏗️ Keaton — Lead
⚛️ Fenster — Core Dev
🧪 Hockney — Tester
📋 Scribe — (silent)

✅ Team hired. Built-in skills loaded: squad-git-workflow, squad-code-review.
Try: "Keaton, set up the project structure"
```

**Same project, week 3 (skills accumulating):**

```
User: "Add OAuth support"

[Coordinator routes to Fenster, standard spawn]
[Fenster has learned skills: react-component-patterns, api-design]
[api-design skill declares MCP: postgres (optional — for schema-aware endpoints)]
[Postgres MCP server is configured → Fenster can query schema directly]
[Fenster implements OAuth with schema-aware token storage]
```

**New project, day 1 (imported squad):**

```
npx create-squad import ~/projects/dashboard/squad-export.squad

✓ Imported squad: 3 agents from The Usual Suspects
✓ Imported 4 learned skills (react-component-patterns, api-design, testing-patterns, tailwind-css)
✓ Built-in skills applied: squad-git-workflow, squad-code-review
✓ Squad is ready. Your team remembers you.
```

Skills travel with the squad. MCP declarations travel too — if the new project has the same MCP servers configured, skills that depend on them work immediately. If not, the agent reports what's needed.

### Where we're leveraging the platform well (revised)

| Platform capability | How Squad uses it |
|--------------------|-------------------|
| `task` tool with background mode | Parallel agent execution — the core Squad pattern |
| Filesystem access | Standard-compliant skill directories — all git-cloneable |
| MCP tool support | Skills declare MCP requirements, agents use configured servers |
| Coordinator conversation persistence | Context caching — skip re-reading after first message (Proposal 007) |
| `explore` agent type | Lightweight spawns for read-only tasks |
| Agent-type flexibility | `general-purpose` for work agents, `explore` for research |

### Where we're still fighting the platform (revised)

| Platform limitation | Impact | Workaround |
|--------------------|--------|------------|
| No agent persistence between messages | Every spawn is cold | Tiered modes (007), progressive skill disclosure (012) |
| No MCP availability detection API | Can't pre-check MCP servers before spawn | Agents try and degrade gracefully |
| Coordinator prompt size (32KB+) | Every message processes 32KB+ | Progressive disclosure keeps skills cheap (~100 tokens each at discovery) |
| No agent-to-agent communication | Agents can't share MCP results | Drop-box pattern, coordinator-mediated handoffs |
| `store_memory` is session-scoped | Can't use for persistent skills | Standard-compliant filesystem skills (our differentiator) |
| No spawn quota visibility | Can't know if we're being throttled | Defensive: limit parallel spawns to 4-5 |

### What we should NOT attempt in v1

| Feature | Why not |
|---------|---------|
| Automatic skill detection from code analysis | Over-engineering. Let agents and users write skills manually. |
| MCP auto-configuration from skills | Security concern. Users configure MCP servers themselves. |
| MCP availability pre-checking | No platform API. Just try and degrade. |
| LLM-based skill scoring/ranking | Adds latency, marginal value. |
| Cross-agent skill sharing | Interesting but no clear use case. |
| `store_memory` integration | Wrong persistence model. |
| Coordinator prompt splitting | Makes things worse, not better. |

---

## 11. Implementation Plan (Revised)

### Phase 1: Standard-compliant skills foundation (v1, ~4 hours)

| Item | Change | Effort |
|------|--------|--------|
| Built-in skill templates | Create `templates/skills/squad-git-workflow/SKILL.md` and `templates/skills/squad-code-review/SKILL.md` | 30 min |
| `create-squad init` update | Copy `templates/skills/` to `.ai-team/skills/` during init | 30 min |
| Coordinator: skills discovery | Add progressive disclosure logic — scan skill directories, build `<available_skills>` XML | 45 min |
| Coordinator: MCP extraction | Extract `metadata.mcp-servers` from SKILL.md frontmatter, include in spawn prompt | 30 min |
| Spawn prompt update | Add `<available_skills>` XML block and MCP requirements section | 30 min |
| Agent self-writing | Add "create standard-compliant skill directories" to spawn prompt instructions | 30 min |
| User-teaches-skills | Coordinator detects "should know" / "always use" patterns, creates skill directory + SKILL.md | 30 min |

### Phase 2: Portability + upgrade integration (v1, ~2 hours)

| Item | Change | Effort |
|------|--------|--------|
| Export update | Add skills directories to Proposal 008 export payload | 30 min |
| Import update | Reconstruct skill directories from export; skip built-in skills | 30 min |
| `create-squad upgrade` | Update built-in skills from templates; never touch learned skills | 30 min |
| Defensive reads | Directory existence checks, graceful skip when no skills exist | 30 min |

### Phase 3: Skill-aware routing (v1.1, ~2 hours)

| Item | Change | Effort |
|------|--------|--------|
| Routing table update | Add skill-match column to coordinator routing logic | 30 min |
| Lightweight skilled spawn | Implement the skilled lightweight spawn template (load relevant skills fully) | 30 min |
| Skill-domain detection | Coordinator inspects task + skill descriptions, activates matching skills | 1 hour |

### Phase 4: Skill curation + MCP evolution (v2, ~4 hours)

| Item | Change | Effort |
|------|--------|--------|
| Scribe skill curation | Scribe reviews histories, creates standard-compliant skills from patterns | 2 hours |
| Skill consolidation | Scribe merges redundant small skills into larger coherent ones | 1 hour |
| MCP config documentation | Skills with MCP requirements include setup docs in references/ | 30 min |
| MCP pre-check (if platform supports) | Coordinator checks MCP availability before spawn, adjusts skill injection | 30 min |

---

## 12. How Skills Interact with Existing Proposals (Revised)

| Proposal | Interaction with skills |
|----------|----------------------|
| **007 (Latency)** | Progressive disclosure keeps skills cheap (~100 tokens at discovery vs full load). Skill-aware routing extends tiered modes. |
| **008 (Portability)** | Skills directories travel with squad in `.squad` export. Standard-compliant format means skills work on any platform that supports agentskills.io. MCP declarations preserved but availability depends on target project config. |
| **003 (Optimization)** | Inline charter pattern stays. Skills use progressive disclosure instead of inlining — better for context budget. |
| **Casting** | Skills are agent-scoped, not universe-scoped. Casting doesn't change. |
| **Scribe** | Scribe gains skill curation responsibility in v2. No v1 changes. |

---

## 13. Open Questions (Revised)

1. **Per-agent vs per-squad skills? → RESOLVED.** Both. `.ai-team/skills/` for team-wide conventions (injected into every spawn). `.ai-team/agents/{name}/skills/` for agent-specific learned skills. Both use the same SKILL.md standard.

2. **How do skills decay?** Unchanged from v1. Don't solve in v1. Standard's `metadata.version` field allows manual version tracking. In v2, Scribe could flag skills where the version is old.

3. **Can an agent's skills contradict the user's preferences?** Yes — preferences win. The spawn prompt order matters: charter → available_skills XML → history → decisions. History (user-specific, recent) overrides skills (general, older).

4. **Should the coordinator read all agents' skills at session start?** No. Scan skill directories only when spawning. Progressive disclosure means the coordinator only reads frontmatter (name + description) — the agent reads the full SKILL.md on activation. This is ~2-3 tool calls per spawn, not ~10+ at session start.

5. **What's the quality bar for a SKILL.md?** Standard-defined: `name` (required, lowercase-hyphen-case, max 64 chars, must match folder), `description` (required, max 1024 chars). Content must be actionable and transferable. Keep under 500 lines. Move details to references/.

6. **How do MCP-dependent skills work when the MCP server isn't available?** Required servers: agent reports the need and stops. Optional servers: agent proceeds without and notes the limitation. Both cases are handled via spawn prompt instructions, not platform APIs.

7. **Can skills from the Agent Skills Open Standard ecosystem be used directly?** Yes — that's the point of adopting the standard. A skill published on agentskills.io can be dropped into `.ai-team/skills/` and it just works. No Squad-specific format conversion needed.

---

## 14. Risk Assessment (Revised)

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Agents create too many small skills (noise) | Medium | High | "If unsure, put it in history.md" + v2 Scribe consolidation |
| Skills inflate spawn prompts | Low | Low | Progressive disclosure: ~100 tokens per skill at discovery, full load only on activation |
| MCP server unavailable for required skill | Medium | Medium | Spawn prompt instructions for graceful degradation; references/ can include setup docs |
| Skills contradict user preferences | Medium | Medium | Prompt ordering: history (preferences) overrides skills |
| Old squads missing skills directories | Low | High | Defensive directory checks — missing = skip gracefully |
| Skills become stale | Medium | Medium | v2 Scribe-driven review; manual pruning in v1 |
| Standard evolves incompatibly | Low | Low | We own our `metadata.mcp-servers` extension. Core standard fields are simple and stable. |
| Built-in skill upgrade overwrites user customization | Medium | Low | Upgrades only touch SKILL.md, never references/scripts/assets modified by users. Learned skills never touched. |

---

## 15. The Reality Check (Revised)

**What can we actually ship in v1?**

- ✅ Standard-compliant SKILL.md format with frontmatter
- ✅ Progressive disclosure (XML summary → full load on activation)
- ✅ MCP tool declaration in `metadata.mcp-servers`
- ✅ MCP requirements in spawn prompts
- ✅ Agent self-writing skills (standard-compliant directories)
- ✅ User-teaches-skills via coordinator
- ✅ Built-in skills shipped with Squad (templates/skills/)
- ✅ `create-squad upgrade` updates built-ins, preserves learned skills
- ✅ Skills in `.squad` export/import
- ✅ Defensive forwardability (directory existence checks)

**What's hard but doable (v1.1)?**

- Skill-aware routing (coordinator matches task to skill descriptions)
- Lightweight skilled spawns (skip full context for skilled-domain tasks)

**What's v2?**

- Scribe-driven skill curation and consolidation
- MCP pre-check before spawn (needs platform support or local config)
- Selective skill loading for agents with 10+ skills

**What's impossible on the current platform?**

- `store_memory`-backed skills (wrong model entirely)
- MCP auto-configuration from skills (security concern)
- MCP availability detection API (doesn't exist)
- Automatic skill detection across sessions (coordinator doesn't persist)

**The v1 story is clear:** Skills follow the Agent Skills Open Standard. They declare MCP requirements. The coordinator discovers them progressively and injects them into spawn prompts. Agents create them from work. Users teach them directly. They travel with the squad. Built-ins get upgraded; learned skills are sacred. Everything else is v2.

---

**Review requested from:** Keaton (architecture — skill directory layout, upgrade flow), Verbal (prompt engineering — spawn prompt XML injection, MCP instructions), McManus (DevRel — is the standard adoption story compelling?), bradygaster (product direction — is this the skills + MCP story you want?)  
**Approved by:** [Pending]  
**Implemented:** [Pending]  
**Retrospective:** [Pending]
