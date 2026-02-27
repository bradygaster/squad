# PRD 14: Clean-Slate Architecture

**Owner:** Keaton (Lead)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 3
**Dependencies:** PRD 1 (SDK Orchestration Runtime)

---

## Problem Statement

Squad has grown organically from a prototype to a working multi-agent framework, accumulating structural debt along the way. The `.ai-team/` (migrating to `.squad/`) directory mixes runtime state with configuration with templates. The CLI is a single `index.js` file. Configuration is scattered across markdown files parsed by LLMs. State management relies on agents writing to the filesystem and hoping Scribe merges correctly. Brady's directive: "everything on the table, take all learnings, start from ground zero, super-duper clean."

## Goals

1. **Redesign the `.squad/` directory structure** with clear separation between configuration (checked in), state (runtime), and output (generated).
2. **Define the bundling strategy** — how Squad ships as a single installable package with embedded SDK, templates, and runtime.
3. **Minimize file I/O** — identify what can live in memory (SDK sessions, event streams) vs. what must persist to disk (decisions, history, config).
4. **Standardize configuration** — one format, one location, one way to read it.
5. **Rethink state management** in a world where SDK sessions handle persistence, compaction, and recovery.
6. **Design the day-1 experience** — what a new user sees when they run `npx create-squad` in the clean-slate world.

## Non-Goals

- **Implementing this PRD in Phase 1.** This is a design document. Implementation begins in Phase 3 after SDK foundation is proven.
- **Breaking existing Squad installations.** Migration path is required for every structural change.
- **Redesigning the agent prompt format.** Charter content is Verbal's domain (PRD 4, PRD 11). This PRD covers the container, not the content.
- **Changing Squad's core value proposition.** AI teams that grow with your code — that doesn't change. How it's structured underneath does.

## Background

### What We've Learned

**From 6 months of building Squad:**

1. **The `.ai-team/` directory is overloaded.** It contains agent charters (config), decisions (state), orchestration logs (ephemeral), casting registry (config), skills (code), and team identity (config). These have different lifecycles, different access patterns, and different sensitivity levels.

2. **Markdown-as-config is fragile.** `team.md`, `routing.md`, and charter files are parsed by LLMs, not code. When an agent slightly reformats a section, parsing breaks silently. Structured data needs structured formats.

3. **File I/O is a bottleneck.** Every agent spawn reads `decisions.md` (~40KB target, was 322KB), `team.md`, `routing.md`, and the agent's charter and history. That's 5+ file reads before work begins. With SDK sessions and hooks, most of this can be injected once at session creation.

4. **State management is convention-based.** Agents write to `decisions/inbox/` by convention. They update `history.md` by convention. They check `orchestration-log/` by convention. There's no enforcement — an agent that skips a convention produces silent data loss.

5. **The template system copies too much.** `squad init` copies ~30 files including workflows, agent templates, docs, and configs. Users get overwhelmed. Many files are never customized.

**From the SDK analysis phase:**

6. **SDK sessions replace much of our file-based state.** `session.workspacePath` provides per-agent persistent storage with checkpoints. `infiniteSessions` handles compaction. `resumeSession()` handles recovery. We no longer need to build these ourselves.

7. **The coordinator moving to TypeScript (PRD 5) changes everything.** Configuration is now loaded by code, not parsed by LLMs. This means we can use typed configuration formats, validate at load time, and fail fast on misconfiguration.

8. **SDK's `customAgents` config unifies agent definitions.** Charters compile to `CustomAgentConfig` objects. The SDK handles agent registration, discovery, and routing. Our filesystem layout should reflect this.

### Reference: Current Directory Structure

```
.ai-team/                    (or .squad/ in v0.5.0+)
├── team.md                  # Team roster — markdown, LLM-parsed
├── routing.md               # Routing rules — markdown, LLM-parsed
├── decisions.md             # Active decisions — markdown, append-heavy
├── decisions/
│   ├── inbox/               # Drop-box for concurrent writes
│   └── archive/             # Quarterly archives
├── agents/
│   └── {name}/
│       ├── charter.md       # Agent identity & instructions
│       └── history.md       # Agent memory / learnings
├── casting/
│   ├── policy.json          # Casting rules
│   ├── registry.json        # Name assignments
│   └── history.json         # Casting history
├── skills/
│   └── {name}/
│       └── SKILL.md         # Skill definition
├── orchestration-log/       # Spawn tracking (ephemeral)
├── docs/                    # Internal docs
└── templates/               # Reference templates
```

**Problems with this layout:**
- Config (team.md, routing.md, casting/) and state (decisions.md, history.md, orchestration-log/) are siblings
- No `.gitignore` guidance — users don't know what to commit vs. ignore
- Agent directories mix config (charter.md) with state (history.md)
- Skills are flat markdown — no code, no tests, no versioning
- Orchestration log is ephemeral but lives next to permanent files

---

## Proposed Solution

### New `.squad/` Directory Structure

```
.squad/
├── squad.config.ts          # ← NEW: typed configuration (single source of truth)
├── team.md                  # Team roster (human-readable, optional if config.ts defines it)
│
├── agents/                  # Agent CONFIGURATION (committed to git)
│   └── {name}/
│       ├── charter.md       # Agent identity, expertise, style
│       └── tools.json       # Agent-specific tool allowlist (optional)
│
├── routing/                 # Routing CONFIGURATION (committed to git)
│   ├── rules.ts             # Typed routing rules (code, not markdown)
│   └── patterns.json        # Pattern-matching config (fallback for non-TS users)
│
├── skills/                  # Skill PACKS (committed to git)
│   └── {name}/
│       ├── SKILL.md         # Skill prompt content
│       ├── tools/           # MCP tool definitions (optional)
│       └── skill.json       # Skill metadata (name, version, dependencies)
│
├── casting/                 # Casting CONFIGURATION (committed to git)
│   ├── policy.json
│   └── registry.json
│
├── decisions/               # Decision STATE (committed to git, union merge)
│   ├── active.md            # Current active decisions (replaces decisions.md)
│   ├── inbox/               # Drop-box (transient, .gitignore'd)
│   └── archive/             # Quarterly archives
│
├── .state/                  # ← NEW: runtime state (git-ignored)
│   ├── sessions.json        # Active SDK session IDs
│   ├── metrics.json         # Token usage, performance data
│   ├── orchestration.log    # Structured JSON log (replaces orchestration-log/)
│   └── agents/
│       └── {name}/
│           └── memory.md    # Agent runtime memory (SDK workspace mirror)
│
└── .cache/                  # ← NEW: derived/computed (git-ignored)
    ├── compiled-team.json   # Compiled team config (from squad.config.ts + charters)
    ├── compiled-routing.json # Compiled routing rules
    └── agent-configs/       # Compiled CustomAgentConfig objects
        └── {name}.json
```

**Key changes:**

| Change | Why |
|--------|-----|
| `squad.config.ts` as single config entry point | Typed, validated, IDE-supported. Replaces scattered markdown-as-config. |
| `routing/rules.ts` replaces `routing.md` | Routing is deterministic logic — code, not prose. Non-TS users get `patterns.json`. |
| `.state/` directory (git-ignored) | Clean separation of runtime state from committed config. |
| `.cache/` directory (git-ignored) | Compiled artifacts that can be regenerated. Fast startup. |
| `decisions/active.md` replaces `decisions.md` | Clearer naming. `inbox/` moves inside `decisions/`. |
| `agents/{name}/tools.json` | Explicit per-agent tool allowlists (SDK `availableTools`). |
| `skills/{name}/skill.json` | Skills gain metadata — versioning, dependencies. |

### Configuration Format: TypeScript Config

The new configuration format is `squad.config.ts` — a TypeScript file that exports a typed configuration object:

```typescript
// .squad/squad.config.ts
import { defineSquadConfig } from "@bradygaster/squad";

export default defineSquadConfig({
  name: "my-project-squad",
  defaultModel: "claude-sonnet-4.5",

  coordinator: {
    model: "gpt-5",
    maxParallel: 4,
    responseTimeout: 120_000,
  },

  agents: {
    // Agents are defined by their charter.md files in .squad/agents/
    // This section provides overrides and SDK-specific config
    lead: { model: "gpt-5", tools: ["*"] },
    backend: { model: "claude-sonnet-4.5" },
    tester: { model: "claude-haiku-4.5", tools: ["view", "grep", "powershell"] },
    scribe: { model: "claude-haiku-4.5", tools: ["view", "edit", "create"] },
  },

  routing: {
    // Import from routing/rules.ts or define inline
    patterns: [
      { match: /security|vulnerability|CVE/i, agent: "security" },
      { match: /test|spec|coverage/i, agent: "tester" },
      { match: /doc|readme|changelog/i, agent: "scribe" },
    ],
  },

  hooks: {
    // PRD 3 hook configuration
    reviewerLockouts: true,
    decisionCapture: true,
    piiScrubbing: true,
  },

  sessions: {
    infinite: true,
    compactionThreshold: 0.80,
    persistMemory: true,
  },

  // Optional: BYOK (PRD 9)
  provider: {
    type: "openai",
    baseUrl: "https://my-enterprise-api.com/v1",
    apiKey: "${OPENAI_API_KEY}",  // env var substitution
  },
});
```

**Why TypeScript config?**
- **Type safety:** `defineSquadConfig()` provides IDE autocomplete and compile-time validation
- **Expressiveness:** Regex patterns, conditional logic, imports — impossible in JSON/YAML
- **Ecosystem alignment:** Vite, Astro, Tailwind all use `.config.ts` — familiar pattern
- **Fallback:** JSON config supported for users who don't want TypeScript (`squad.config.json`)

**Why not YAML?**
- No type safety
- Indentation-sensitive — error-prone
- No imports, no logic
- Not aligned with the Node.js ecosystem

### Bundling Strategy

Squad ships as a single npm package with embedded resources:

```
@bradygaster/squad (npm package)
├── bin/
│   └── squad.js            # CLI entry point
├── dist/
│   ├── coordinator/         # Compiled TypeScript coordinator (PRD 5)
│   ├── sdk-adapter/         # SDK adapter layer (PRD 1)
│   └── cli/                 # init, upgrade, watch commands
├── templates/               # Scaffolding templates (embedded, not fetched)
│   ├── agents/              # Default agent charters
│   ├── workflows/           # GitHub Actions workflows
│   ├── config/              # Default squad.config.ts
│   └── skills/              # Starter skills
└── package.json
```

**Build tool: esbuild.**
- Single-file bundles for each entry point
- Tree-shaking removes unused SDK code
- Source maps for debugging
- Build time: < 2 seconds

**Embedded resources pattern:**
```typescript
// Templates are embedded at build time, not read from disk at runtime
import agentTemplates from "./templates/agents.json" assert { type: "json" };
import workflowTemplates from "./templates/workflows.json" assert { type: "json" };

// At init time, extract to .squad/
function scaffoldProject(targetDir: string) {
  for (const [path, content] of Object.entries(agentTemplates)) {
    writeFileSync(join(targetDir, ".squad", path), content);
  }
}
```

This eliminates the "fetch templates from GitHub tarball" pattern. Everything ships in the package.

### File I/O Reduction

**What moves from disk to memory:**

| Data | Current | Clean-Slate | Rationale |
|------|---------|-------------|-----------|
| Agent context (charter, history) | Read from disk every spawn | Loaded once at startup, held in memory | SDK `systemMessage` injected once per session |
| Routing rules | Read from disk every routing decision | Compiled once, cached in `.cache/` | Code-based routing is deterministic |
| Team roster | `team.md` parsed every time | `compiled-team.json` in `.cache/` | Recompiled only when `team.md` changes |
| Orchestration events | Written to files in `orchestration-log/` | Held in memory, streamed via SDK events | PRD 6 consumes events, not files |
| Agent memory | `history.md` read/written per spawn | SDK `session.workspacePath` + `memory.md` | SDK manages persistence |
| Token metrics | Not tracked | In-memory, periodic flush to `.state/metrics.json` | Event-driven aggregation |

**What stays on disk:**

| Data | Why |
|------|-----|
| `decisions/active.md` | Source of truth for team governance. Must survive process restarts. |
| `agents/{name}/charter.md` | Human-edited configuration. Must be version-controlled. |
| `squad.config.ts` | User configuration. Must be version-controlled. |
| `casting/` | Persistent agent identity. Must be version-controlled. |
| `.state/sessions.json` | Session IDs for crash recovery via `resumeSession()`. |

**Net effect:** Cold start reads ~5 files (config, team, routing, casting, decisions). Warm operation reads 0 files — everything is in memory or SDK session state.

### State Management Rethink

**Decisions:**
- `decisions/active.md` remains the canonical store — it's human-readable and version-controlled
- `decisions/inbox/` is git-ignored (transient drop-box)
- SDK's `onPostToolUse` hook captures decisions automatically (PRD 3) — less reliance on agent convention
- Scribe's merge role remains but triggers less frequently (event-driven, not spawn-driven)

**Agent History/Memory:**
- Current `history.md` per agent is append-only and grows unbounded
- Clean-slate: agent memory splits into two tiers:
  - **Session memory** — SDK's `infiniteSessions` workspace. Automatic compaction. Per-session.
  - **Persistent memory** — `.state/agents/{name}/memory.md`. Written by `onSessionEnd` hook. Curated summary, not raw append.
- Charter files stay read-only config. History/memory is runtime state.

**Casting:**
- `casting/` stays as committed config (policy, registry)
- `casting/history.json` moves to `.state/` (runtime data, not config)
- At startup, casting registry compiles to `customAgents` array (PRD 11)

**Orchestration Log:**
- Current: directory of markdown files per spawn
- Clean-slate: structured JSON in `.state/orchestration.log`
- Format: one JSON line per event (agent spawn, tool call, completion, error)
- Rotation: daily or size-based, configurable
- PRD 6 (Streaming Observability) reads this log for dashboards

### Template System Evolution

**Current:** `squad init` copies ~30 files from `templates/` to the consumer repo.

**Clean-slate:** Tiered initialization with progressive disclosure.

```
$ npx create-squad

Welcome to Squad! Let's set up your AI team.

? Project type: (auto-detected: Node.js)
? Team size: Starter (3 agents) / Standard (5 agents) / Custom
? Include GitHub workflows? Yes / No / Pick individually

Creating .squad/ ...
  ✓ squad.config.ts (your configuration)
  ✓ agents/lead/charter.md
  ✓ agents/developer/charter.md
  ✓ agents/reviewer/charter.md
  ✓ decisions/active.md
  ✓ .gitignore (updated)
  ✓ .github/agents/squad.agent.md (Copilot agent entry point)

Squad is ready! 5 files created.
Run `squad start` to begin working with your team.
```

**Key changes:**
1. **Fewer files by default.** Starter team = 5 files, not 30.
2. **Progressive disclosure.** Start simple, add complexity via `squad add agent`, `squad add skill`, `squad add workflow`.
3. **Auto-detection.** Project type, existing config, CI setup detected automatically.
4. **Interactive init.** Questions only when choices matter. Defaults are sensible.

### The Day-1 User Experience

**What a new user sees:**

1. **Install:** `npx create-squad` (or `npm install -g @bradygaster/squad && squad init`)
2. **Answer 2-3 questions:** Project type, team size, workflows
3. **Get a minimal `.squad/` directory:** config + agents + decisions
4. **Start working:** `squad start` → coordinator launches → user chats with their team
5. **Agents stream their work:** Real-time progress, not silent black boxes
6. **Decisions auto-captured:** Hook-driven, not convention-dependent
7. **Upgrade later:** `squad add agent security` / `squad add skill code-review` / `squad add workflow ci`

**What changes from today:**
- No wall of 30 files on first run
- No "hope the agent reads the right file" — SDK sessions inject context programmatically
- No silent success — `sendAndWait()` with timeouts and event monitoring
- Real-time streaming from agents — the team feels alive from minute one

---

## Key Decisions

### Made

| Decision | Rationale |
|----------|-----------|
| TypeScript config (`squad.config.ts`) over YAML/JSON | Type safety, IDE support, ecosystem alignment. JSON fallback for non-TS users. |
| `.state/` and `.cache/` are git-ignored | Runtime data and derived artifacts don't belong in version control. |
| esbuild for bundling | Fast, reliable, tree-shaking. Industry standard for Node.js CLI tools. |
| Tiered init (Starter/Standard/Custom) | Progressive disclosure. Don't overwhelm new users. |
| `decisions/active.md` replaces `decisions.md` | Clearer naming. Inbox moves inside `decisions/`. |
| Agent memory splits into session + persistent tiers | SDK handles session memory. Persistent memory is curated. |

### Pending

| Decision | Options | Who Decides |
|----------|---------|-------------|
| Do we keep `team.md` as human-readable roster? | (a) Yes, `team.md` is source of truth, `squad.config.ts` overrides. (b) No, `squad.config.ts` is sole source of truth. (c) Generate `team.md` from config for display. | Verbal + Brady |
| Routing: TypeScript-only or dual TS/JSON? | (a) TS-only — simpler, more powerful. (b) Dual — lower barrier, more maintenance. | Keaton |
| Should `squad.agent.md` still exist in clean-slate? | (a) Yes — VS Code integration requires it. (b) No — SDK handles agent registration. (c) Thin stub that bootstraps SDK. | Fenster + Keaton |
| MCP config location? | (a) In `squad.config.ts`. (b) Separate `.squad/mcp.json`. (c) Per-agent in `agents/{name}/mcp.json`. | Kujan |
| Backward compatibility: migration command or auto-detect? | (a) `squad migrate` explicit command. (b) `squad start` auto-detects old layout and migrates. | Brady |

---

## Implementation Notes

### Migration from Current Layout

```typescript
// migrate.ts — one-time migration from .ai-team/ or old .squad/ to clean-slate

export async function migrateToCleanSlate(projectRoot: string) {
  const oldDir = detectOldLayout(projectRoot);  // .ai-team/ or .squad/ (old format)
  const newDir = join(projectRoot, ".squad");

  // 1. Create new directory structure
  ensureDir(join(newDir, ".state"));
  ensureDir(join(newDir, ".cache"));
  ensureDir(join(newDir, "decisions"));
  ensureDir(join(newDir, "routing"));

  // 2. Move agent charters (config stays, history moves to .state/)
  for (const agent of listAgents(oldDir)) {
    copyFile(agent.charterPath, join(newDir, "agents", agent.name, "charter.md"));
    moveFile(agent.historyPath, join(newDir, ".state", "agents", agent.name, "memory.md"));
  }

  // 3. Move decisions
  copyFile(join(oldDir, "decisions.md"), join(newDir, "decisions", "active.md"));
  moveDir(join(oldDir, "decisions", "inbox"), join(newDir, "decisions", "inbox"));
  moveDir(join(oldDir, "decisions", "archive"), join(newDir, "decisions", "archive"));

  // 4. Generate squad.config.ts from existing team.md + routing.md
  const config = generateConfigFromMarkdown(oldDir);
  writeFile(join(newDir, "squad.config.ts"), renderConfig(config));

  // 5. Move casting config
  copyDir(join(oldDir, "casting"), join(newDir, "casting"));

  // 6. Update .gitignore
  appendGitignore(projectRoot, [
    ".squad/.state/",
    ".squad/.cache/",
    ".squad/decisions/inbox/",
  ]);

  // 7. Clean up old layout (after confirmation)
  log("Migration complete. Old layout preserved. Run `squad cleanup` to remove.");
}
```

### Compilation Pipeline

On `squad start`, the coordinator compiles configuration into runtime objects:

```
squad.config.ts  ──┐
agents/*/charter.md ──┤ compile ──→ .cache/compiled-team.json
casting/registry.json ─┘            .cache/agent-configs/*.json
                                    .cache/compiled-routing.json
```

Compilation is cached and invalidated by file modification time. First run: ~200ms. Subsequent runs: < 10ms (cache hit).

### `.gitignore` Template

```gitignore
# Squad runtime state (not version controlled)
.squad/.state/
.squad/.cache/
.squad/decisions/inbox/

# SDK session data
.copilot/
```

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **TypeScript config excludes non-TS users** | Medium | JSON fallback (`squad.config.json`). Init generates the right format based on project type. |
| **Migration breaks existing installations** | High | Explicit `squad migrate` command with dry-run mode. Old layout preserved until `squad cleanup`. |
| **Clean-slate design doesn't account for unknown future needs** | Medium | Extensibility built in: `squad.config.ts` supports custom fields, `.squad/` allows arbitrary subdirectories. |
| **esbuild bundling increases package size** | Low | Tree-shaking keeps bundles small. SDK is ~2MB — acceptable for an agent framework. |
| **Two config formats (TS + JSON) doubles maintenance** | Medium | JSON format is a strict subset of TS format. One schema, two serializations. |
| **Users resist the structural change** | Low | Clean-slate is opt-in until proven. Upgrade path is smooth. Benefits (fewer files, faster startup, streaming) sell themselves. |

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| **Files created on `squad init`** | ≤ 8 (down from ~30) | Count files in new project |
| **Cold start time** | ≤ 500ms from `squad start` to coordinator ready | Instrumented timing |
| **File reads per agent spawn** | 0 (down from 5+) | Instrumented I/O in session pool |
| **Config validation errors caught at load** | 100% of type errors | TypeScript compilation + runtime schema validation |
| **Migration success rate** | ≥ 99% of existing installs migrate without data loss | Automated migration tests against sample layouts |
| **User satisfaction (init experience)** | "Less overwhelming" in user feedback | Qualitative feedback from beta testers |

---

## Open Questions

1. **Should the clean-slate design support monorepo multi-squad?** Multiple `.squad/` directories in subdirectories, with inheritance? Or one `.squad/` at the repo root?

2. **What happens to skills in the SDK world?** Skills currently are flat markdown. With SDK `skillDirectories`, they could become structured modules with prompt + tools + tests. Is that PRD 7's scope or PRD 14's?

3. **How do we handle the `squad.agent.md` ↔ `squad.config.ts` relationship?** VS Code discovers agents via `.github/agents/*.agent.md`. If the coordinator is an SDK process, does `squad.agent.md` become a thin bootstrap stub that starts the SDK coordinator? Or does it coexist as a fallback?

4. **Should `.squad/.state/` be per-worktree or per-repo?** Current decision: `.squad/` is worktree-local. But `.state/` is ephemeral — should it be in `/tmp/` or `~/.squad/` instead?

5. **What's the config schema versioning strategy?** `defineSquadConfig()` needs to handle schema evolution as Squad adds features. SemVer the config schema? Auto-migrate old configs?

6. **Does the embedded resources pattern work with `npx github:bradygaster/squad`?** Current distribution is GitHub-tarball-only. esbuild bundles work with npm. Do they work with the GitHub-direct install path?

---

*This PRD was written by Keaton (Lead). It's the architecture vision for Squad's ground-zero rebuild. Design work can begin parallel to Phase 1 (PRD 1). Implementation requires PRD 1 foundation to be proven. Brady's input is critical on every pending decision.*
