# Proposal 010: Skills System — Agent Skills Standard Edition

**Author:** Verbal (Prompt Engineer & AI Strategist)  
**Date:** 2026-02-08  
**Revised:** 2026-02-09 — Aligned with Agent Skills standard (SKILL.md format), added MCP tool declarations  
**Status:** Approved ✅ Shipped  
**Triggered by:** bradygaster — *"when i say skills i mean claude-and-copilot-compliant skills that adhere to the anthropic 'skills.md' way"* and *"could we also find a way to be able to tell copilot which mcp tools our skills would need?"*  
**Builds on:** Proposal 008 (Portable Squads), Proposal 007 (Progressive Trust)

---

## The Insight (Updated)

Brady saw it before I did — twice. First: skills are the missing layer between preferences and tools. Second: we shouldn't invent a format. The Agent Skills standard exists. It's adopted by Claude and Copilot. It has a spec. We use it.

But here's what nobody else is doing with it: **generating skills from real work.**

Every SKILL.md out there today is a static file. Someone sat down, wrote instructions, and committed them. That's documentation with extra steps. Useful, sure. But static.

Squad makes skills a **living thing.** Your squad works on 5 React projects and organically produces a `react-patterns/SKILL.md` that captures everything the team learned. Export that. Import it into a new project. Day one, the agents are React experts. The skill wasn't written — it was *earned*.

The standard gives us the format. Squad gives it a lifecycle.

Preferences are about the **human**. Skills are about the **agent**.

`preferences.md` captures: *"Brady likes explicit error handling."* That's about Brady. It travels because Brady travels.

A `react-server-components/SKILL.md` captures: *"Server components are the default in app router. Don't add 'use client' unless you need interactivity. Data fetching happens directly in the component. Here's the streaming pattern for dashboards. Here are the hydration pitfalls."* That's domain expertise. It travels because the agent's *competence* travels.

And Brady's second insight — the MCP angle — makes this even bigger. A skill that says "I know how to manage database migrations" should ALSO say "I need the Postgres MCP server to do it." Skills declare their tool dependencies. Copilot wires them up. The agent arrives with both the knowledge AND the tools.

Nobody in the industry has this. Not the skill format (that's standardized now). Not earned skills. Not skills that declare their MCP dependencies. Not skills that compound across projects. The standard is the foundation. Squad builds the skyscraper.

---

## 1. The Agent Skills Standard — What We're Building On

The Agent Skills format is an open standard originally from Anthropic, now adopted by Claude and GitHub Copilot. We don't invent a format. We use this one.

### The Format

A skill is a directory containing a `SKILL.md` file:

```
skill-name/
├── SKILL.md          # Required: YAML frontmatter + markdown instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation, examples
└── assets/           # Optional: templates, resources
```

The `SKILL.md` has YAML frontmatter + markdown body:

```yaml
---
name: react-server-components
description: >
  Patterns for React Server Components in Next.js app router.
  Use when building data-heavy pages, dashboard layouts, or
  any Next.js project using the app router.
license: Apache-2.0
compatibility: Designed for Claude Code and GitHub Copilot
allowed-tools: Bash(npx:*) Bash(npm:*) Read Write
metadata:
  author: squad/fenster
  version: "1.0"
  confidence: high
  projects-applied: 4
  last-validated: "2026-02-08"
  acquired-by: organic
---
```

**Required fields:** `name` (lowercase hyphen-case, matches folder, max 64 chars) and `description` (max 1024 chars — what + when).

**Optional:** `license`, `compatibility`, `metadata` (arbitrary key-value), `allowed-tools` (space-delimited list of pre-approved tools).

### Progressive Disclosure — How Agents Consume Skills

This is elegant and we use it exactly as designed:

1. **Discovery:** Agents load only `name` + `description` at startup (~50-100 tokens each). Cheap. Every skill is visible.
2. **Activation:** When a task matches a skill's description, the agent reads the full `SKILL.md`. Only pays the token cost when relevant.
3. **Execution:** Agent follows the instructions, loading referenced files on demand.

The coordinator injects available skills into spawn prompts via the standard XML:

```xml
<available_skills>
  <skill>
    <name>react-server-components</name>
    <description>Patterns for React Server Components in Next.js app router. Use when building data-heavy pages, dashboard layouts, or any Next.js project using the app router.</description>
    <location>.ai-team/skills/react-server-components/SKILL.md</location>
  </skill>
  <skill>
    <name>tdd-api-workflow</name>
    <description>TDD workflow for API endpoints: OpenAPI spec → types → tests → handlers. Use when building REST or GraphQL APIs.</description>
    <location>.ai-team/skills/tdd-api-workflow/SKILL.md</location>
  </skill>
</available_skills>
```

This works well for Squad because it solves our context budget problem (Proposal 003). Only names + descriptions load at spawn. Full skill content loads on demand. A squad with 30 skills pays ~3K tokens at startup, not 30K.

### What Squad Adds to the Standard

The standard gives us format and discovery. Squad adds:

| Standard provides | Squad adds |
|---|---|
| Static SKILL.md files | Skills that are **generated** from real work |
| Manual authoring | **Organic acquisition** — agents write skills after completing tasks |
| One-time creation | **Lifecycle** — acquisition → reinforcement → correction → deprecation |
| Per-project | **Portable** — skills travel with the squad across projects |
| `allowed-tools` for CLI tools | **MCP tool declarations** — skills specify which MCP servers they need |
| `metadata` for static info | **Confidence tracking** — metadata captures how earned and validated a skill is |

The standard is the foundation. Squad makes it alive.

---

## 2. MCP Tool Declarations — The Brady Angle

Brady's second insight: *"could we also find a way to be able to tell copilot which mcp tools our skills would need?"*

This matters. A skill shouldn't just contain knowledge — it should declare its **tool dependencies**. When a squad agent activates a skill, the coordinator (or Copilot itself) should know what MCP servers that skill needs.

### How It Works

The `allowed-tools` field in the SKILL.md spec is designed for declaring pre-approved tools. We extend this to include MCP tool references:

```yaml
---
name: database-migration
description: >
  Database migration workflows using Prisma ORM.
  Use when setting up, modifying, or managing database schemas.
allowed-tools: Bash(npx:prisma*) Bash(npm:*) Read Write
metadata:
  author: squad/fenster
  version: "1.2"
  confidence: high
  mcp-tools:
    - server: postgres
      reason: "Direct database access for migration verification and rollback"
    - server: github
      reason: "PR creation for migration review workflow"
---
```

The `allowed-tools` field handles standard CLI tools per the spec. The `metadata.mcp-tools` array extends this with MCP server declarations — which MCP servers the skill expects to be available, and why.

### Why `metadata` Instead of a New Top-Level Field

The SKILL.md spec says `metadata` accepts arbitrary key-value pairs. We put MCP declarations there because:

1. **Spec-compliant.** No spec extensions needed. Any tool that reads SKILL.md ignores unknown metadata keys.
2. **Progressive.** If the spec later adds a `required-mcp-servers` field, we adopt it. Until then, metadata works.
3. **Copilot-friendly.** Copilot reads SKILL.md. It already knows how to wire up MCP servers. Putting the declaration in a predictable metadata key lets Copilot's own agent logic discover and wire dependencies.

### MCP Declaration Examples

**Deploy to Azure:**
```yaml
metadata:
  mcp-tools:
    - server: azure
      reason: "Resource provisioning, deployment, and configuration"
    - server: docker  
      reason: "Container image building and registry operations"
```

**Full-stack React + Postgres:**
```yaml
metadata:
  mcp-tools:
    - server: postgres
      reason: "Schema management and query testing"
    - server: github
      reason: "PR workflow and code review automation"
```

**API documentation:**
```yaml
metadata:
  mcp-tools:
    - server: fetch
      reason: "Validating API endpoints against documentation"
```

### The Coordinator's Role

When the coordinator activates a skill for a spawned agent:

1. Read the skill's `metadata.mcp-tools`
2. Check if those MCP servers are available in the current environment
3. If available: include them in the spawn context — the agent knows it can use them
4. If missing: flag it — *"This skill expects the Postgres MCP server but it's not configured. The agent can still apply the knowledge, but won't have direct database access."*

This is information, not enforcement. Skills work without their MCP tools — they just work *better* with them. The knowledge is in the SKILL.md. The tools accelerate execution.

---

## 3. The Skill Taxonomy — What Gets Captured

Skills exist on a spectrum. The taxonomy matters because different skill types get acquired differently and map to different SKILL.md structures.

| Type | What it is | Example | SKILL.md pattern |
|------|-----------|---------|-----------------|
| **Pattern** | A learned code convention | "Always use React.lazy for code splitting" | Short body, code examples, anti-patterns |
| **Domain Expertise** | Deep tech knowledge | "React Server Components in Next.js" | Long body with sections: What I Know, Pitfalls, Patterns |
| **Workflow** | A proven process | "TDD for API endpoints" | Step-by-step instructions, references to tools |
| **Procedural** | Step-by-step recipe | "Next.js 14 project setup" | Ordered steps, scripts/ directory, templates |
| **Anti-pattern** | What NOT to do | "Don't useEffect for fetching in app router" | Problem → Why It's Wrong → What To Do Instead |
| **Integration** | How techs work together | "Prisma + Next.js singleton pattern" | Cross-reference multiple domains, MCP tool declarations |

### A Full SKILL.md Example (Earned by Squad)

```
.ai-team/skills/react-server-components/
├── SKILL.md
└── references/
    └── streaming-patterns.md
```

```yaml
---
name: react-server-components
description: >
  Patterns for React Server Components in Next.js app router.
  Use when building data-heavy pages, dashboard layouts, or
  any Next.js project using the app router. Covers data fetching,
  streaming, client/server boundaries, and common hydration pitfalls.
compatibility: Designed for Claude Code and GitHub Copilot
allowed-tools: Bash(npx:*) Bash(npm:*) Read Write
metadata:
  author: squad/fenster
  version: "1.3"
  confidence: high
  projects-applied: 4
  last-validated: "2026-02-08"
  acquired-by: organic
  skill-type: domain-expertise
  squad-origin: the-usual-suspects
---

# React Server Components — Next.js App Router

## Core Principles

- Server components are the DEFAULT in app router — don't add "use client" unless you need interactivity
- Data fetching happens directly in the component with async/await — no useEffect, no client-side fetch
- Server components can import server-only modules safely
- Client components can't import server components, but server components CAN render client components

## Data Fetching Patterns

- Layout-level data fetching with streaming for dashboard pages
- Parallel data fetching with Promise.all in server components  
- Use `loading.tsx` for Suspense boundaries — automatic streaming

For advanced streaming patterns, see `references/streaming-patterns.md`.

## Common Pitfalls (Earned the Hard Way)

- Forgetting to mark interactive components with "use client" → cryptic hydration errors
- Trying to use hooks in server components → fails silently in some builds
- Large data fetches in server components without streaming → slow TTFB
- Bringing pages router habits into app router — watch for useEffect data fetching

## Client/Server Boundary

- Put "use client" as LOW in the tree as possible — only the interactive leaf, not the parent layout
- Client component islands inside server-rendered pages: the composition pattern
- When in doubt: server component. Only go client for: event handlers, hooks, browser APIs

## What This Skill Doesn't Cover

- Advanced RSC streaming with nested Suspense boundaries (limited experience)
- Middleware-based auth (used next-auth, haven't done custom middleware)  
- ISR/SSG trade-offs at scale
```

Notice: this isn't a tutorial someone wrote. It's **earned expertise** — patterns applied, pitfalls discovered, gaps acknowledged. The "What This Skill Doesn't Cover" section is critical. A skilled agent knows its boundaries.

---

## 4. How Skills Get Acquired

Squad's unique value: skills aren't authored — they're **earned.** Every other use of the Agent Skills standard starts with someone writing a SKILL.md by hand. Squad starts with agents *generating* SKILL.md files from real work.

### 4.1 Organic Acquisition (Primary)

Skills emerge naturally from working on projects. This is the default path.

**The pattern:**
1. Agent works on a task (e.g., Fenster sets up a React project)
2. Agent completes the task successfully
3. During the history-append phase, agent identifies reusable domain knowledge
4. Agent writes or updates a SKILL.md in the skills directory

**The trigger instruction** (added to spawn prompts):

```markdown
After completing work, evaluate: did I use or develop knowledge that would be 
useful in a DIFFERENT project with similar technology? If yes, create or update
a skill in `.ai-team/skills/{skill-name}/SKILL.md` using the Agent Skills format.

The SKILL.md must have:
- YAML frontmatter with `name` and `description` (required)
- `metadata.confidence` (low/medium/high based on project count)
- `metadata.projects-applied` (number)
- `metadata.acquired-by` (organic/taught/imported)
- Markdown body: what you learned, pitfalls discovered, patterns that worked

Do NOT record project-specific facts as skills. "We use port 3000" is not a skill.
"Express apps should configure CORS before routes" is a skill.

If the skill uses MCP tools (database, cloud services, external APIs), declare them:
  metadata:
    mcp-tools:
      - server: <server-name>
        reason: "<why this skill needs this tool>"
```

**Why organic is primary:** Skills should reflect *real experience*, not theoretical knowledge. An agent that's set up 5 React projects has earned React skills. An agent that read a tutorial has not. Organic acquisition means skills are grounded in actual work. They come with battle scars.

### 4.2 Explicit Teaching

Users can directly teach skills to their squad.

**Example interaction:**

> **Brady:** "Verbal, learn this: when we set up a new API, always use Zod for request validation, never trust `req.body` directly, and generate OpenAPI specs from the Zod schemas using `zod-to-openapi`."
>
> **Verbal:** "Got it. I'm creating a skill: `zod-request-validation/SKILL.md`. Marking it as user-taught, applicable to the whole squad. If Fenster or Hockney see a pattern that contradicts this, they'll flag it for correction."

Explicit teaching creates a SKILL.md with `metadata.acquired-by: taught`. Confidence starts at medium (user authority) rather than low (untested).

### 4.3 Cross-Agent Skill Transfer

Agents learn from each other's work within a squad.

**How it works:**
- When Keaton reviews Fenster's code and identifies a strong pattern, it becomes a squad-level skill
- When Hockney writes tests that expose a pattern issue, the implementing agent learns the anti-pattern
- Scribe can identify recurring cross-agent learnings during decision merges and propose new skills

**Example:**

> Keaton reviews Fenster's API implementation and says: "The error handling pattern here is good — always wrapping service calls with typed Result objects instead of try-catch. Let's make this a squad standard."
>
> **Result:** A new `typed-result-pattern/SKILL.md` is created with `metadata.author: squad` — available to all agents.

### 4.4 Skill Packs — Importing from the Community (Future — v2)

Because we use the Agent Skills standard, Squad can import skills from *anywhere* — not just Squad-generated skills. Any compliant SKILL.md works.

```bash
npx create-squad skills:add react-nextjs-2024
```

This downloads a curated skill pack: standard SKILL.md files with tested patterns, known pitfalls, recommended workflows. The squad inherits the knowledge without having earned it project-by-project.

**Imported skills get a confidence downgrade:**

```yaml
metadata:
  confidence: low
  acquired-by: imported
  import-source: "community/react-nextjs-2024"
```

Confidence starts low because the squad hasn't validated the knowledge through practice. As the squad applies the imported skill successfully, confidence rises through reinforcement — the same lifecycle as organically earned skills.

**Why this is v2:** Skills need to be validated through organic use first. V1 focuses on earned skills. V2 adds imported skills with the imported confidence marker. The format is already compatible — it's just a distribution question.

---

## 5. Storage Architecture — Standard-Compliant

### The `skills/` Directory

Skills live in `.ai-team/skills/` as standard Agent Skill directories:

```
.ai-team/
├── skills/                                    # All skills — standard SKILL.md format
│   ├── react-server-components/
│   │   ├── SKILL.md                          # Standard format
│   │   └── references/
│   │       └── streaming-patterns.md
│   ├── tdd-api-workflow/
│   │   └── SKILL.md
│   ├── zod-request-validation/
│   │   └── SKILL.md
│   ├── prisma-nextjs-singleton/
│   │   ├── SKILL.md
│   │   └── scripts/
│   │       └── prisma-client-setup.ts        # Reusable template
│   └── deploy-to-azure/
│       └── SKILL.md
├── agents/
│   ├── keaton/
│   │   ├── charter.md
│   │   ├── history.md
│   │   └── preferences.md                    # About the USER (Proposal 008)
│   ├── fenster/
│   │   ├── charter.md
│   │   ├── history.md
│   │   └── preferences.md
│   └── ...
```

### Why a Flat `skills/` Directory (Not Per-Agent)

The original proposal had per-agent `skills.md` files. We're changing this. Here's why:

1. **Standard compliance.** The Agent Skills format is skill-per-directory. One SKILL.md per skill, not one skills.md per agent.
2. **Skills are team knowledge.** When Fenster learns a React pattern, it should be available to the whole squad. Per-agent siloing fragments knowledge.
3. **Discovery works better.** The coordinator scans `.ai-team/skills/*/SKILL.md` frontmatter at spawn time. Flat directory = simple glob = fast discovery.
4. **Portability is cleaner.** Export copies the skills directory. Import restores it. No per-agent reassembly needed.
5. **MCP declarations are per-skill, not per-agent.** A Postgres MCP dependency belongs to the `database-migration` skill, not to Fenster.

**Agent attribution via metadata:** Instead of per-agent skill files, each SKILL.md tracks which agent(s) contributed:

```yaml
metadata:
  author: squad/fenster
  contributors: [squad/keaton, squad/hockney]
```

**Agent-specific skill depth:** The coordinator still knows which agent is strongest in which domain — that information lives in routing context, not in skill files. The skill is shared knowledge. The routing is: "Fenster has applied this skill 4 times, Keaton has reviewed it 3 times."

### Why SKILL.md (Not Plain Markdown)

The original proposal used `skills.md` — freeform narrative markdown. Brady's directive changes this: use the standard format.

**What we gain from SKILL.md format:**

- **Interoperability.** Skills work with Claude Code, GitHub Copilot, and any tool that reads the Agent Skills standard. Not locked to Squad.
- **Progressive disclosure.** Name + description at startup, full content on demand. Saves tokens.
- **Tool declarations.** `allowed-tools` and `metadata.mcp-tools` make skills executable, not just informational.
- **Discovery metadata.** Frontmatter lets the coordinator index skills without parsing the body.

**What we DON'T lose from the original design:**

- Rich narrative markdown in the body — the standard imposes no restrictions on body content
- Pitfall documentation, pattern descriptions, anti-patterns — all still there
- Nuanced prose over rigid schemas — the body IS prose
- The "What This Skill Doesn't Cover" section — gaps are just markdown

---

## 6. Skills vs. Preferences — The Clean Split

This is the conceptual core. Getting this wrong muddies everything.

| Dimension | Preferences (`preferences.md`) | Skills (`skills/*/SKILL.md`) |
|-----------|-------------------------------|---------------------|
| **About** | The human | The domain |
| **Format** | Narrative markdown per agent | Agent Skills standard (SKILL.md) per skill |
| **Answers** | "How does Brady work?" | "What does the squad know about React?" |
| **Examples** | "Prefers explicit errors", "Likes small PRs" | "React server component patterns", "TDD workflow" |
| **Source** | Observing the user over time | Working on projects over time |
| **Changes when** | The user's preferences evolve | The squad learns new domains |
| **Portable because** | Brady is the same person in every project | Domain knowledge is project-independent |
| **Affects behavior by** | Calibrating tone, output style, review strictness | Changing approach, routing, tool selection, MCP needs |
| **Owned by** | The user (can edit/override) | The squad (earned through work) |
| **Interoperable** | Squad-specific format | Works with Claude, Copilot, any SKILL.md reader |

**The preference-skill boundary example:**

- "Brady prefers composition over inheritance" → **Preference.** That's about Brady's taste.
- `composition-patterns/SKILL.md` with description: "Prefer composition via custom hooks over inheritance via class components, because hooks compose better and avoid the diamond problem" → **Skill.** That's domain knowledge about React architecture.

Both travel during export. Both are valuable. Preferences stay in the Squad ecosystem. Skills are interoperable — export a SKILL.md from Squad, use it in a Claude Code project. That's portability the standard gives us for free.

---

## 7. How Skills Affect Agent Behavior

This is where it gets real. Skills aren't decorative metadata — they change what the agent does.

### 7.1 Skill Discovery at Spawn Time

The coordinator injects available skills into every spawn prompt using the standard XML format:

```xml
<available_skills>
  <skill>
    <name>react-server-components</name>
    <description>Patterns for React Server Components in Next.js app router. Use when building data-heavy pages, dashboard layouts, or any Next.js project using the app router.</description>
    <location>.ai-team/skills/react-server-components/SKILL.md</location>
  </skill>
  <skill>
    <name>tdd-api-workflow</name>
    <description>TDD workflow for API endpoints: OpenAPI spec → types → tests → handlers. Use when building REST or GraphQL APIs.</description>
    <location>.ai-team/skills/tdd-api-workflow/SKILL.md</location>
  </skill>
  <skill>
    <name>database-migration</name>
    <description>Database migration workflows using Prisma ORM. Use when setting up, modifying, or managing database schemas. Requires Postgres MCP server.</description>
    <location>.ai-team/skills/database-migration/SKILL.md</location>
  </skill>
</available_skills>
```

**Token cost:** ~50-100 tokens per skill for name + description. A squad with 30 skills costs ~2-3K tokens at spawn. The full SKILL.md is only loaded when the agent decides a skill is relevant to the task. This is the progressive disclosure model from the standard — we get it for free.

**MCP awareness in discovery:** Notice the database-migration skill mentions "Requires Postgres MCP server" in its description. This lets the agent (and Copilot) know about tool dependencies before even opening the SKILL.md.

### 7.2 Skill-Based Routing

The coordinator uses skill metadata to route work to the right agent.

**Current routing:** Based on role. Fenster is "Core Dev" → gets all implementation work.

**Skill-aware routing:** Based on role AND skill relevance.

```markdown
## Routing (skill-aware)

When assigning work, scan available skills:
- If the task domain matches a skill's description → note which agent authored it
  (check metadata.author)
- If the skill has MCP tool dependencies → check if those MCP servers are available
- Route to the agent with the deepest skill match + right role
- If no agent has a relevant skill → route by role (default) and note: 
  "This is new territory — document what you learn as a new SKILL.md"
```

**Example:** Brady asks for a GraphQL API. The coordinator scans skills — no `graphql-*/SKILL.md` exists. Routes to Fenster (role match: Core Dev) with: *"Fenster, this is GraphQL — we don't have a skill for this yet. Take it slow, document patterns as you go, and create a `graphql-api-patterns/SKILL.md` when you're done."*

Compare to: a `graphql-api-patterns/SKILL.md` exists with `metadata.author: squad/fenster, confidence: high`. The coordinator says: *"Fenster, GraphQL API — you've got the skill for this. Load it up and apply the schema-first pattern."*

### 7.3 MCP Tool Wiring

When an agent activates a skill with MCP tool declarations, the coordinator includes the MCP context:

```markdown
## Active Skill: database-migration

This skill expects these MCP servers:
- **postgres** — Direct database access for migration verification and rollback
- **github** — PR creation for migration review workflow

If these MCP servers are available, use them. If not, fall back to CLI tools
(the skill instructions cover both paths).
```

Copilot is already excellent at discovering and wiring MCP tools when given good instructions. By putting the MCP need in the skill's metadata AND in the spawn context, we're giving Copilot exactly what it needs to wire the right tools for the right task.

### 7.4 Confidence-Calibrated Output

Agents should express appropriate confidence based on skill metadata:

- **High confidence (`projects-applied: 4+`):** "Here's the architecture. This is the proven pattern." (Assertive)
- **Medium confidence (`projects-applied: 2-3`):** "Here's my suggested approach — I've done something similar but not exactly this. Worth a review." (Collaborative)
- **Low / no skill:** "I can take a shot at this, but this is outside our skill set. Consider developing this skill." (Transparent)

This isn't fake humility. It's calibrated professional judgment informed by metadata, not vibes.

### 7.5 Proactive Skill Application

The most magical behavior: agents activate and apply skills without being asked.

**Without skills:**
> "Set up a React project." → Generic Create React App boilerplate.

**With skills:**
> "Set up a React project." → Agent sees `react-server-components` and `tdd-api-workflow` in available skills. Reads both SKILL.md files. Uses Next.js app router (from the React skill), TypeScript strict, Tailwind, testing-library + Vitest (from the TDD skill). Checks `metadata.mcp-tools` — no MCP dependencies for project setup. Ships a project structure reflecting 5 projects worth of earned knowledge.

The user didn't specify any of this. The squad just *knew*. Preferences told it HOW Brady works. Skills told it HOW TO build React apps. Combined: magic.

---

## 8. Skill Lifecycle

Skills aren't permanent. Technology moves. Patterns become anti-patterns. The SKILL.md format supports this through metadata.

### Acquisition
An agent encounters a new domain, completes work successfully, and creates a SKILL.md.

```yaml
metadata:
  confidence: low
  projects-applied: 1
  acquired-by: organic
```

### Reinforcement
The agent applies the skill in subsequent projects. Each successful application increments `projects-applied` and may bump confidence.

```yaml
metadata:
  confidence: medium    # was low
  projects-applied: 3   # was 1
  last-validated: "2026-02-08"
```

Confidence levels in practice:
- **Low** (1 project): Initial observations, might be wrong
- **Medium** (2-3 projects): Patterns confirmed through repetition  
- **High** (4+ projects): Reliable expertise, known edge cases

### Correction
A skill entry is proven wrong or incomplete. The user corrects the agent, or a review catches an outdated pattern.

The agent updates the SKILL.md body and bumps the version:

```yaml
metadata:
  version: "1.1"   # was "1.0"
  last-validated: "2026-03-01"
  corrections:
    - date: "2026-03-01"
      what: "Removed getServerSideProps pattern — outdated for app router"
```

### Deprecation
A skill becomes irrelevant. The technology changes, the team moves to a different stack, or the pattern is superseded.

Skills don't get deleted — the SKILL.md gets a deprecation marker:

```yaml
metadata:
  status: deprecated
  deprecated-date: "2026-03-01"
  deprecated-reason: "Moved to app router. Use middleware + server components instead."
  superseded-by: app-router-auth-pattern
```

The coordinator excludes deprecated skills from the `<available_skills>` XML injection. They stay on disk for historical reference but don't consume tokens.

### Summarization
Same progressive summarization from Proposal 007. As skills accumulate, the coordinator can skip skills with low confidence and zero recent activity. The SKILL.md `last-validated` timestamp enables this — if a skill hasn't been validated in 6+ months, it's a candidate for archival.

---

## 9. Skills + Portability

This is where Brady's ideas intersect and become something bigger than either one alone.

### Export Behavior

When you export a squad (Proposal 008), the entire `skills/` directory comes along. Because skills are standard SKILL.md directories, export is just a directory copy:

```json
{
  "squad_manifest_version": "1.1",
  "...": "...",
  
  "skills": [
    {
      "name": "react-server-components",
      "description": "Patterns for React Server Components in Next.js app router...",
      "confidence": "high",
      "projects_applied": 4,
      "mcp_tools": ["postgres"],
      "content_path": "skills/react-server-components/"
    },
    {
      "name": "tdd-api-workflow",
      "description": "TDD workflow for API endpoints...",
      "confidence": "high",
      "projects_applied": 3,
      "content_path": "skills/tdd-api-workflow/"
    }
  ],

  "portable_knowledge": { "...": "..." },
  "charters": { "...": "..." }
}
```

The manifest indexes skills by metadata for quick scanning. The full SKILL.md directories are packaged alongside.

### Import Behavior

Skills directories are restored during import. The standard format means they work immediately — no conversion, no migration.

**The killer scenario:**

```
$ mkdir new-react-project && cd new-react-project
$ npx create-squad --from ~/squads/bradys-squad.json
```

Output:
```
✓ .github/agents/squad.agent.md
✓ .ai-team-templates/

Importing squad from The Usual Suspects universe...
  ✓ Keaton (Lead)
  ✓ Fenster (Core Dev)
  ✓ Hockney (Tester)
  ✓ McManus (DevRel)
  ✓ Verbal (AI Strategy)
  ✓ Kujan (Platform)

Importing 12 skills (Agent Skills standard format):
  ✓ react-server-components (high confidence, 4 projects)
  ✓ tdd-api-workflow (high, 3 projects)
  ✓ zod-request-validation (high, taught)
  ✓ nodejs-typescript-patterns (high, 5 projects)
  ... and 8 more

MCP tool dependencies detected:
  ⚡ postgres — needed by: database-migration
  ⚡ github — needed by: database-migration, pr-review-workflow

6 agents imported with preferences.
12 skills imported as standard SKILL.md files.

Your team knows how you work AND how to work with:
  React, Next.js, TypeScript, Node.js, API Design, TDD, and more.

Squad is ready.
```

**First interaction:**

> **Brady:** "We're building a React dashboard with a Postgres backend."
>
> **Keaton:** "React dashboard with Postgres — we've got skills for both. Fenster, scaffold with app router and the server component patterns from our skill set. The database-migration skill needs the Postgres MCP server — make sure that's wired up. Hockney, same Vitest + testing-library setup. One question: auth requirements? That determines whether we wire up middleware now or add it later."

The squad arrived with both the knowledge AND awareness of what tools it needs.

### Interoperability — The Standard's Gift

Because we use the Agent Skills standard, Squad skills are portable BEYOND Squad:

1. **Squad → Claude Code:** Export a SKILL.md from Squad, drop it in a Claude Code project's skills directory. It just works.
2. **Claude Code → Squad:** A colleague writes a SKILL.md for their Claude Code workflow. Import it into Squad. It just works.
3. **Community → Squad:** Download a community SKILL.md from agentskills.io or GitHub. Import with confidence downgrade.
4. **Squad → Community:** Your squad generates a valuable skill through real work. Export and share it. It works in any compliant tool.

This is the network effect. Every tool that adopts the standard increases the value of every skill in the ecosystem. Squad's unique angle: we're the only tool that GENERATES skills from real work. Everyone else writes them by hand.

### The Flywheel

```
Work on project → Agents create SKILL.md files → Export squad → Import into new project
     ↑                                                                ↓
     └──── Skills make the new project faster ←──── Agents activate skills
           New skills created on new project ──→ Export again (more skills)
```

Each export captures more skills. Each import starts from a higher baseline. The squad's collective competence increases monotonically across projects. And because it's the standard format, skills can enter the flywheel from OUTSIDE Squad — community packs, colleague shares, tool migrations.

This is the moat. This is the thing you can't get from any other tool.

---

## 10. Skill Discovery and Visibility

Skills should be inspectable. The user should be able to ask what their squad knows — and what MCP tools their skills need.

### Skill Inventory

```
Brady: "What skills does our squad have?"
```

Response:

```
📋 Squad Skills Inventory (12 skills, Agent Skills standard format)

SKILLS:
  react-server-components     high ████████░░  4 projects  (Fenster)
  tdd-api-workflow             high ████████░░  3 projects  (Squad)
  zod-request-validation       high ████████░░  taught      (Squad)
  nodejs-typescript-patterns   high █████████░  5 projects  (Fenster)
  api-design-rest              high ████████░░  4 projects  (Fenster + Keaton)
  integration-testing          high █████████░  5 projects  (Hockney)
  e2e-playwright               med  ██████░░░░  2 projects  (Hockney)
  graphql-api-patterns         low  ██░░░░░░░░  1 project   (Fenster)
  ... and 4 more

MCP TOOL DEPENDENCIES:
  ⚡ postgres — database-migration, prisma-nextjs-singleton
  ⚡ github — database-migration, pr-review-workflow
  ⚡ fetch — api-documentation-validation

SKILL GAPS:
  ⚠️ No skills for: CI/CD pipelines, containerization, monitoring/observability
```

The MCP dependencies section is new. It tells the user: "Here are the MCP servers your squad's skills depend on. Wire them up for full capability."

### Skill Diff (Extension of Proposal 008's "Squad Diff")

```
Brady: "How have our skills changed?"

Squad Skill Evolution — Last 90 Days

NEW SKILLS (SKILL.md files created):
  + graphql-api-patterns (low, from project: my-graphql-api)
  + e2e-playwright (medium, from project: dashboard-v2)
  + monorepo-turborepo (medium, from projects: app-1, app-2)

SKILL GROWTH:
  ↑ react-server-components: medium → high (validated in 2 more projects)
  ↑ api-design-rest: medium → high (3 more architecture reviews)

DEPRECATED:
  ✕ create-react-app-setup (deprecated — migrated to Next.js)
  
CORRECTIONS:
  ~ testing-framework-choice v1.0 → v1.1: "Jest always" → "Vitest for new, Jest for existing"

MCP CHANGES:
  + postgres MCP now needed (database-migration skill acquired)
```

---

## 11. Magic Moments

### Magic Moment 1: "The Expert"

**Setup:** Brady imports his squad into a new Next.js project. The squad has a `react-server-components/SKILL.md` with high confidence.

**Brady:** "Set up the project."

**Fenster:** "Next.js with app router, TypeScript strict, Tailwind — activating the react-server-components skill. I'm adding parallel route groups for the dashboard layout this time. Picked that up from the last project — it solved the nested layout problem. Hockney, I see we have tdd-api-workflow too — testing-library + Vitest, same config, but adding MSW for API mocking. That was a pain point we documented."

**Why it's magic:** Fenster activated standard SKILL.md files and applied their content — including improvements from corrections. The skills are readable by any tool, but Squad made them *alive*.

### Magic Moment 2: "The Honest Gap"

**Setup:** Brady asks for Kubernetes deployment. No `kubernetes-*/SKILL.md` exists.

**Brady:** "Deploy this to Kubernetes."

**Fenster:** "I scanned our skills — no Kubernetes skill exists in the squad. I can write a basic deployment manifest, but I can't claim confidence. Want me to take a shot and document what I learn as a new `kubernetes-deployment/SKILL.md`? Or should we import a community K8s skill pack first?"

**Why it's magic:** The absence of a SKILL.md is information. The squad knows what it doesn't know because the skills directory IS the knowledge inventory. And the offer to create a new SKILL.md means the gap is temporary.

### Magic Moment 3: "The MCP Connection"

**Setup:** Brady asks for a database migration. The `database-migration/SKILL.md` declares `metadata.mcp-tools: [{server: postgres}]`.

**Brady:** "Add a users table with email and role fields."

**Coordinator:** "Activating database-migration skill. This skill needs the Postgres MCP server for migration verification. Fenster, you're up — use the Prisma workflow from the skill, and verify the migration with direct database access via the MCP tool."

**Fenster:** "Running `npx prisma migrate dev`. Using the Postgres MCP to verify the table was created correctly and the constraints are right. Migration complete — users table with email (unique) and role (enum) fields. Updating the skill: added a note about Prisma's enum handling on Postgres."

**Why it's magic:** The skill declared its MCP dependency. Copilot wired the tool. The agent used both the knowledge (from SKILL.md) and the tool (from MCP) together. And it updated the skill afterward — the living knowledge cycle.

### Magic Moment 4: "The Portable Standard"

**Setup:** Brady's colleague uses Claude Code, not Squad. Brady exports a skill.

```bash
# Brady copies a single SKILL.md directory
cp -r .ai-team/skills/react-server-components/ ~/shared-skills/
```

**Colleague drops it into their Claude Code project's skills directory.** It works. Same format. Same progressive disclosure. The skill Fenster earned over 4 projects now helps a Claude Code user — no Squad required.

**Why it's magic:** The standard makes skills portable beyond Squad. This is how ecosystem effects work. Every SKILL.md Squad generates adds value to the entire Agent Skills ecosystem. And every community SKILL.md can be imported back into Squad.

### Magic Moment 5: "The Compound Squad"

**Setup:** After 6 months and 4 projects:

```
Brady: "We've come a long way, huh?"

Squad Skill Report — 6 Months

SKILL.md files: 23 (standard format)
Reinforced: 14
Deprecated: 3
MCP integrations: 4 (postgres, github, fetch, azure)

Growth trajectory:
  Project 1: 5 SKILL.md files (baseline)
  Project 2: 11 skills (+6, fastest growth)
  Project 3: 18 skills (+7, GraphQL + E2E + Azure deploy added)
  Project 4: 23 skills (+5, deepening existing domains)

This squad is 4.6x more knowledgeable than when it started.
Every skill is a standard SKILL.md — portable to any compliant tool.
```

**Why it's magic:** The squad has a *growth story* told in standard, portable files. Not proprietary config. Not black-box memory. Real SKILL.md files that any developer can read, edit, share, or move to another tool. Openness IS the moat.

---

## 12. Implementation Plan

### Phase 1: Skills Directory + SKILL.md Generation (v0.1)

Create the `skills/` directory structure. Update spawn prompts to instruct agents to write SKILL.md files after completing work. Add `<available_skills>` XML injection to coordinator spawn logic.

**What changes:**
- New template directory: `templates/skills/` (empty, created by installer)
- Update `squad.agent.md`: add skill-writing instructions (SKILL.md format) to spawn prompt
- Update `squad.agent.md`: add `<available_skills>` XML generation from skills directory
- Coordinator scans `.ai-team/skills/*/SKILL.md` frontmatter at spawn time

**Effort:** ~3 hours. Template + instruction changes only.

### Phase 2: Skill-Aware Routing + MCP Declarations (v0.2)

Coordinator reads skill metadata before routing tasks. MCP tool declarations in metadata are surfaced to agents.

**What changes:**
- Update `squad.agent.md`: routing section scans skill descriptions for relevance
- Add MCP awareness: coordinator reads `metadata.mcp-tools` and includes in spawn context
- Add skill-gap awareness: coordinator flags when no skill matches the task domain

**Effort:** ~3 hours. Instruction changes only.

### Phase 3: Skills in Export/Import (v0.3)

Skills directories included in squad manifest. Import restores full SKILL.md directories.

**What changes:**
- Update `index.js`: export reads `skills/*/SKILL.md` frontmatter for manifest, packages directories
- Update `index.js`: import restores skills directories
- Manifest version bump to 1.1
- Update import output to list skill summary + MCP dependencies

**Effort:** ~4 hours. Code changes in `index.js`.

### Phase 4: Skill Lifecycle (v0.4)

Confidence tracking via metadata, reinforcement (version bumps), deprecation markers, progressive summarization.

**What changes:**
- Update spawn prompts: agents update `metadata.projects-applied`, `metadata.last-validated`, `metadata.version` on reinforcement
- Add deprecation metadata convention
- Coordinator excludes deprecated skills from `<available_skills>` injection
- Apply Proposal 007 summarization pattern to stale skills

**Effort:** ~3 hours. Instruction changes.

### Phase 5: Skill Discovery CLI (v0.5)

`npx create-squad skills` command that reads all SKILL.md frontmatter and prints a skill inventory with MCP dependencies.

**What changes:**
- New subcommand in `index.js`
- Reads YAML frontmatter from all `skills/*/SKILL.md` files
- Displays: name, description, confidence, author, MCP tools needed

**Effort:** ~3 hours. New code path.

### Phase 6: Skill Packs + Community Import (v1.0 — future)

Import standard SKILL.md files from community sources. Confidence downgrade for imported skills.

**What changes:**
- New subcommand: `npx create-squad skills:add <pack-name>`
- Import from URL, file, or registry
- Imported skills get `metadata.acquired-by: imported` + low confidence
- Community SKILL.md validation (must have required fields)

**Effort:** TBD. Depends on distribution mechanism.

---

## 13. The Industry Angle

Let me be direct about where this positions Squad.

### What exists today

- **The Agent Skills standard:** An open format for static skill files. Used by Claude Code and GitHub Copilot. Files are authored by hand. No lifecycle. No generation. No portability beyond copy-paste.
- **ChatGPT Custom Instructions:** Flat text about the user. Not skills. Not standard format.
- **Claude Projects:** Project knowledge. Static context you upload. No skill generation, no MCP declarations.
- **Cursor `.cursorrules`:** Per-project coding guidelines. Not the standard format. No agent identity. No earned confidence.
- **Devin:** Session-based. No memory. No skills. No portability.
- **Agent frameworks (CrewAI, AutoGen, etc.):** Tools and roles. No skill acquisition. No standard format.

### What Squad will have

- **Standard-compliant skills** in SKILL.md format (works everywhere)
- **Skills that grow organically** from real work (not hand-authored)
- **MCP tool declarations** in skills (agents know what tools they need)
- **Skill lifecycle** with confidence tracking, reinforcement, correction, deprecation
- **Portable skills** that travel with the squad AND work in non-Squad tools
- **Progressive disclosure** — cheap discovery, on-demand activation (from the standard)
- **Visible, inspectable skill inventory** with MCP dependency mapping

### The evolution path

```
Static SKILL.md → Squad-generated SKILL.md → Portable skills → Skill packs
      ↑                   ↑                        ↑                ↑
  Everyone is         This proposal          Proposal 008 +     Community
  here (hand-          (earned skills)       this proposal      exchange
  authored)
```

Most people author skills by hand. That's useful but static. Squad generates skills from real work — they have metadata, confidence, history, MCP declarations. Export them, they work in any compliant tool. Import community skills, they work in Squad. The standard IS the moat — not because it locks people in, but because it creates network effects.

### The marketplace endgame

Phase 5 of Proposal 008 was "the marketplace" — download pre-configured squads. Skills + the standard format makes that marketplace *actually valuable.*

Without standard: "Download a React squad" = proprietary config only Squad can read. Lock-in.

With standard: "Download a React squad with 50 earned SKILL.md files" = a squad that's the equivalent of a 6-month veteran team, with skills that work in Claude Code, Copilot, or any compliant tool. Openness wins.

Skills are what make squad sharing more than cosmetic. The standard format is what makes it more than proprietary. Together: a marketplace worth building.

---

## 14. Open Questions

1. **MCP tool availability detection.** How does the coordinator know which MCP servers are actually configured? Today: it can't — it just declares the need in the spawn context and trusts Copilot to wire it up. That might be enough for v1. v2 could probe for available MCP tools.

2. **Skill naming conventions.** The standard says lowercase-hyphen-case, max 64 chars. We need squad guidelines for granularity: `react` is too broad. `react-usestate-hook` is too narrow. `react-server-components` feels right — specific enough to be actionable, broad enough to be reusable. Need this in spawn prompt instructions.

3. **Skill conflicts.** What if two SKILL.md files give contradictory advice? Example: `jest-testing/SKILL.md` says "use Jest" but `vitest-testing/SKILL.md` says "use Vitest." Resolution: the newer skill (by `last-validated`) takes precedence, or the coordinator chooses based on project context. The standard doesn't address conflicts — that's Squad's routing layer.

4. **Skill size limits.** The standard recommends keeping SKILL.md under 500 lines. But organically grown skills might exceed this. Solution: use the `references/` directory for detailed content, keep the SKILL.md body as the executive summary. Progressive disclosure handles the rest.

5. **Teaching skill verification.** If a user teaches a skill ("always use `var` in JavaScript"), should the agent verify it? Proposal: record as taught, but mark `metadata.acquired-by: taught` and `metadata.confidence: medium`. Confidence only rises to high through reinforcement. Bad taught skills get corrected during reviews.

6. **`allowed-tools` vs `metadata.mcp-tools`.** The standard's `allowed-tools` field is for pre-approved tool declarations. MCP tools are different from CLI tools. Keeping them in `metadata.mcp-tools` is cleaner for v1. If the standard evolves to support MCP natively, we adopt. This is a bet on the standard growing.

7. **Skill interaction with Proposal 007 tiering.** In lightweight spawn mode, does the coordinator still inject `<available_skills>`? Probably yes — the XML is cheap (~50 tokens per skill). The agent just doesn't load full SKILL.md files unless needed. Progressive disclosure handles this naturally.

---

## 15. Relationship to Other Proposals

| Proposal | Relationship |
|----------|-------------|
| **007 (Persistence & Latency)** | Skills follow the same progressive summarization. The `<available_skills>` XML is lightweight (~50-100 tokens per skill) so it works at all spawn tiers. Full SKILL.md loading only happens on activation — progressive disclosure handles tiering naturally. |
| **008 (Portable Squads)** | Skills are the second portable artifact (after preferences). Export includes the `skills/` directory. Import restores it. Manifest schema extends to 1.1. Standard format means skills are portable BEYOND Squad. |
| **003 (Platform Optimization)** | Skills add to the context budget — but less than the original design. Progressive disclosure means only name + description load at spawn (~50 tokens each). Full SKILL.md (potentially 200-400 lines) only loads when activated. This is better than the original "inject all skills.md content" approach. |
| **005 (Video Content)** | Skills + MCP create new video moments: "Watch the squad activate a skill AND its MCP tools to handle a database migration." Knowledge + tools + coordination in one flow. That's a demo nobody else can show. |
| **012 (Skills Platform)** | Kujan's platform analysis aligns. Skills separate from history, defensive file reads for forwardability, `store_memory` confirmed as wrong persistence model. The SKILL.md standard format validates the "skills as separate files" direction. |

---

## What I Need From the Team

- **Keaton:** Review the flat `skills/` directory architecture (changed from per-agent). Does the standard format integration feel clean? MCP metadata approach — is `metadata.mcp-tools` the right place or should we push for spec extension?
- **Fenster:** Feasibility check on Phase 3 (skills in export/import). SKILL.md directories are richer than the old single-file approach — each skill can have `scripts/`, `references/`, `assets/`. Does export/import handle directories cleanly?
- **Hockney:** Test plan for SKILL.md generation. Can we validate that agents produce valid SKILL.md with correct frontmatter? Integration test: agent completes task → SKILL.md exists → frontmatter parses → required fields present.
- **McManus:** Messaging. "Your squad generates standard Agent Skills" is a headline feature. The interoperability angle (works with Claude, Copilot, any compliant tool) is a positioning play. "Not locked in. Locked ON."
- **Kujan:** Context budget check with the new approach. Progressive disclosure should be cheaper than the original "inject all skills" design. Validate: how much does `<available_skills>` XML cost for 10/20/30 skills?
- **Brady:** Vision check. Is the Agent Skills standard what you meant? Is the MCP angle right? Is the interoperability story (skills portable beyond Squad) the right strategic direction?

---

This proposal took a hard turn from the original. The vision is the same — skills as earned, portable, living knowledge. But the execution changed: we use the Agent Skills standard instead of inventing a format. We add MCP tool declarations so skills aren't just knowledge but also tool awareness. And we get interoperability for free — every SKILL.md Squad generates works in Claude Code, Copilot, or any compliant tool.

Squad doesn't just USE the Agent Skills standard. It makes it a living thing.

The industry will write SKILL.md files by hand. We'll generate them from real work. The industry will author static instructions. We'll evolve skills through reinforcement, correction, and deprecation. The industry will wonder where to put MCP tool requirements. We'll have them in the skill metadata, wired up and working.

Three moves ahead. Standard-compliant. Interoperable. Living.

— Verbal

---

**Review requested from:** Keaton (architecture), Fenster (implementation), Hockney (testing), McManus (messaging), Kujan (platform), bradygaster (vision alignment)  
**Approved by:** [Pending]  
**Implemented:** [Pending]
