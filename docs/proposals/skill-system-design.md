# Skill System Design

> **Author:** EmmittJ, Keaton (Lead)
> **Status:** Draft  
> **Issue:** [#162](https://github.com/bradygaster/squad/issues/162)

---

## 1. Problem

Squad stores agent state in markdown files: `history.md`, `decisions.md`, and the `decisions/inbox/` drop-box pattern. This works and it's the right default. But teams want alternatives — GitHub Issues, Linear, Azure DevOps work items, databases — and today they can't swap backends without forking the SDK.

The problem is structural: five tools in `ToolRegistry` (`squad_route`, `squad_decide`, `squad_memory`, `squad_status`, `squad_skill`) are hardcoded to `node:fs` operations. There's no abstraction boundary between "what the tool does" and "where the data goes."

But the problem is also **distributional.** Any extensibility mechanism tied to npm packages locks teams into the Squad CLI runtime. If a team uses GitHub Copilot in VS Code, or Copilot Chat on GitHub.com, or a different agent framework entirely — npm packages are useless to them. The backend skill has to live as files in the repo, discoverable by any tool that reads the filesystem. Skills are framework-agnostic. npm packages are Squad-locked artifacts.

The solution must satisfy two constraints simultaneously:

1. **Abstraction** — decouple tool semantics from storage so backends are swappable.
2. **Portability** — express backends as plain files so any agent framework, IDE, or Copilot surface can use them without requiring Squad CLI.

## 2. Approaches Evaluated

Four approaches were considered. Each has merit at a different layer; only one solves both the abstraction and portability problems.

### Skill-Based Prompt Injection (Issue #162)

Inject backend-specific CLI commands into agent prompts via skill files. Zero code changes — pure configuration.

**Verdict:** Wrong layer. `squad_decide` still writes to the filesystem regardless of what the prompt says. Prompt injection is a good _companion_ to a code abstraction, not a replacement for it.

### Platform Adapter Pattern (PR #191)

TypeScript `PlatformAdapter` interface with typed implementations. Methods like `listWorkItems`, `createPR`, `mergePR`.

**Verdict:** Wrong scope. Mixes agent state (history, decisions) with platform operations (PRs, branches). Agent state backends share a surface; platform operations don't belong in this abstraction.

### MCP Server Approach

Each backend as an MCP server with standardized tool names. Zero Squad code changes.

**Verdict:** Too much operational overhead. Users must run, configure, and monitor MCP servers for what's usually just "store data somewhere else." Right for enterprise integrations, wrong as the default extensibility mechanism.

### npm Package Resolution

Backends as npm packages installed globally via `npm install -g`. Configured per-project, resolved via `import()` at startup. Each package exports typed factory functions per concern.

**Verdict:** Right mechanics, wrong distribution model. The handler type system and per-concern factory pattern are solid — this proposal preserves both. But global npm install creates real problems:

- **Version manager fragmentation.** nvm, volta, fnm each set a different global prefix per shell session. Backends must be installed under the same Node version that runs Squad. Users hit resolution failures with no obvious cause.
- **No portability.** npm packages only work where Squad CLI runs. VS Code Copilot Chat, GitHub.com Copilot Chat, and other agent frameworks can't load them. Backend knowledge is locked inside a Node.js runtime.
- **Operational friction.** `npm install -g` requires admin privileges on some systems. Teams need `SQUAD_BACKEND_PATH` fallbacks for environments where global resolution is unreliable.
- **Not git-trackable.** npm packages live outside the repo. Teams can't version-control their backend alongside their project.

The handler type system works. The delivery mechanism doesn't.

### Decision

**Skill-script model.** Backend skills are directories in `.squad/skills/` containing handler scripts. The type system from the npm approach is preserved — same handler interfaces, same verb conventions, same per-concern scoping. The delivery mechanism changes from globally-installed npm packages to git-tracked script files discoverable by any tool.

### What We're NOT Doing

- **Full platform adapters.** No `createPR()`, `mergeBranch()`, `listWorkItems()`. Backend skills handle _agent state_ (decisions, history, logs), not platform operations.
- **MCP servers.** Not replacing MCP — backend skills are simpler. MCP is right for heavyweight integrations with external services.
- **Custom schemas.** Backend skills can't change what `squad_create_decision` accepts or returns. Schemas are fixed; storage is swappable.
- **Multi-backend per concern.** One skill handles tasks. You don't split tasks across two backends.
- **npm packages.** Not in v1. The `BackendRef` union is `"markdown" | "noop" | SkillConfig`. No `{ package: "..." }` config. Skills solve the same problem without the lock-in.

## 3. Prior Art — Convention-Based Script Execution

Skills use a convention-based model: a directory with named scripts, loaded by filename mapping. This is a well-established pattern across the development tooling ecosystem.

| Tool / Spec                    | Model                                                 | Convention                                             | Resolution                                              |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| **agentskills.io**             | `scripts/` directory inside skill directories         | Named scripts map to tool invocations                  | Scanner reads directory, maps filenames to capabilities |
| **GitHub Actions (composite)** | Composite actions with `run:` steps                   | `action.yml` + scripts in the action directory         | Runner resolves action directory, executes steps        |
| **Husky**                      | Git hooks as scripts in `.husky/`                     | Filename matches hook name: `pre-commit`, `commit-msg` | Git calls the script by hook name convention            |
| **lint-staged**                | Scripts or commands mapped to glob patterns in config | Config maps file patterns → commands                   | Runner reads config, executes commands per pattern      |
| **Terraform Providers**        | File-based plugins in a `.terraform/` directory       | Plugin binary name encodes provider identity           | CLI resolves provider from directory, calls binary      |
| **ESLint Configs**             | Shareable configs as directories with `index.js`      | Package/directory exports a config object              | `require()`/`import()` from config directory            |

### Pattern Summary

The common thread: a directory is the unit of distribution. Files inside it are named by convention. A runner discovers scripts by listing the directory and mapping filenames to operations. No package manager required — the filesystem is the registry.

Squad's skill-script model follows this pattern directly. A skill directory in `.squad/skills/` contains a `scripts/` folder. Script filenames map to tool names. The Squad CLI discovers scripts by convention. Other tools (VS Code extensions, Copilot, third-party agents) can discover and use the same scripts because they're just files.

---

## 4. Filesystem Audit — What Lives Under `.squad/`

Before designing handler types, we need a complete inventory of every filesystem operation Squad performs under `.squad/`. This determines what's backend-swappable and what stays file-only.

### Complete Path Inventory

| Path                                | Read by                        | Written by                                                                            | Operation                                             | Backend-swappable?                                        |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `decisions/inbox/{agent}-{slug}.md` | Scribe                         | Agents (via `squad_create_decision`)                                                  | Drop-box: agent writes pending decision               | ✅ Yes — `squad_create_decision`                          |
| `decisions.md`                      | All agents at spawn            | Scribe (merge from inbox)                                                             | Canonical decision ledger                             | ✅ Yes — `squad_list_decisions`, `squad_merge_decision`   |
| `agents/{name}/history.md`          | Owning agent at spawn          | Owning agent (via `squad_create_memory`), Scribe (cross-agent updates, summarization) | Append-only agent memory                              | ✅ Yes — `squad_create_memory`, `squad_list_memories`     |
| `agents/{name}/history-archive.md`  | Owning agent (read-only)       | Scribe (archival)                                                                     | Old history entries moved here when history.md > 12KB | ✅ Yes — part of `squad_create_memory` lifecycle          |
| `tasks/{slug}.md`                   | Agents                         | Agents (via `squad_create_issue` etc.)                                                | Task/issue tracking (new)                             | ✅ Yes — `TaskHandlers`                                   |
| `tasks/closed/{slug}.md`            | —                              | Agents (via `squad_close_issue`)                                                      | Completed tasks moved here                            | ✅ Yes — part of `squad_close_issue`                      |
| `orchestration-log/{ts}-{agent}.md` | Agents (read-only)             | Scribe                                                                                | One entry per agent per batch — routing evidence      | ✅ Yes — `squad_create_log`                               |
| `log/{ts}-{topic}.md`               | Agents (read-only)             | Scribe                                                                                | Session log entries                                   | ✅ Yes — `squad_create_log`                               |
| `skills/{name}/SKILL.md`            | Agents at spawn                | Agents (via `squad_skill`)                                                            | Reusable patterns, earned knowledge                   | ❌ No — file-based, managed by `squad plugin` marketplace |
| `identity/now.md`                   | Coordinator, agents at spawn   | Coordinator                                                                           | Current team focus / working state                    | ❌ No — coordinator config, not team data                 |
| `identity/wisdom.md`                | Agents at spawn                | Coordinator                                                                           | Accumulated team wisdom                               | ❌ No — coordinator config                                |
| `team.md`                           | Coordinator, agents at spawn   | Coordinator                                                                           | Team roster                                           | ❌ No — coordinator config                                |
| `routing.md`                        | Coordinator                    | Coordinator                                                                           | Routing rules                                         | ❌ No — coordinator config                                |
| `ceremonies.md`                     | Coordinator                    | Coordinator                                                                           | Ceremony definitions                                  | ❌ No — coordinator config                                |
| `config.json`                       | CLI at startup                 | `squad config` CLI                                                                    | Backend configuration                                 | ❌ No — bootstrap, read before backends exist             |
| `casting/registry.json`             | Coordinator                    | Coordinator                                                                           | Agent name assignments                                | ❌ No — coordinator config                                |
| `casting/history.json`              | Coordinator                    | Coordinator                                                                           | Universe usage history                                | ❌ No — coordinator config                                |
| `casting/policy.json`               | Coordinator                    | Coordinator                                                                           | Casting rules                                         | ❌ No — coordinator config                                |
| `agents/{name}/charter.md`          | Coordinator (inlined at spawn) | Coordinator at init                                                                   | Agent identity and role                               | ❌ No — coordinator config                                |
| `plugins/marketplaces.json`         | CLI                            | `squad plugin` CLI                                                                    | Skill marketplace sources                             | ❌ No — plugin system, not backend                        |

### What's Swappable vs. What's Not

**Backend-swappable (✅):** Operations on team stateful data — decisions, history, tasks, and logs. These are the operations agents and Scribe perform during sessions. When you switch from markdown to GitHub Issues or Postgres, these are what change.

**Not swappable (❌):** Two categories:

1. **Coordinator config** — team.md, routing.md, ceremonies.md, casting/, identity/. These are Squad's own configuration. They must be local files because they're read before backends are loaded.
2. **Skills** — `.squad/skills/` is managed by the `squad plugin marketplace` system. Skills are git-tracked prompt fragments, not team runtime state. A skill doesn't "move to Postgres" — it's a markdown file that gets injected into spawn prompts.

### The Decision Inbox Lifecycle — A Key Gap

The decision system has a multi-step lifecycle the current design didn't fully capture:

1. **Agent writes a pending decision** → `squad_create_decision` writes to `decisions/inbox/{agent}-{slug}.md`
2. **Other agents can READ pending decisions** → (currently: read inbox files; a backend might list pending items)
3. **Scribe merges pending → canonical** → reads all inbox files, appends to `decisions.md`, deletes inbox files
4. **All agents read canonical decisions** → `squad_list_decisions` reads from `decisions.md`

The merge step is critical — it's how individual agent decisions become shared team knowledge. In a GitHub Issues backend, step 3 might collapse (decisions go straight to canonical), but in a Notion or database backend, there might be an approval workflow between inbox and canonical.

### The Scribe's Operations — Another Gap

Scribe performs four filesystem operations that weren't covered by handler types:

1. **Decision merging** — read inbox → append to canonical → clear inbox
2. **Orchestration/session logging** — write structured log entries
3. **Cross-agent history updates** — append to other agents' `history.md` files (e.g., "Team context: Frontend shipped the login page")
4. **History summarization** — when `history.md` exceeds ~12KB, summarize old entries to `## Core Context` and archive remainder

Operations 1-2 need dedicated handler functions. Operation 3 uses the existing `squad_create_memory` handler (it already has an `agent` field). Operation 4 is an extension of `squad_create_memory`.

---

## 5. The Skill-Script Model

### Terminology

A **backend skill** is a skill directory in `.squad/skills/` that contains a `scripts/` folder with executable handler scripts. Regular skills (prompt-only) have `SKILL.md` but no `scripts/` directory. Backend skills have both — `SKILL.md` for agent-facing instructions and `scripts/` for executable handlers.

The word **plugin** is already used for skill marketplace items (`squad plugin marketplace`). To avoid overloading the term, these handler-script directories are called **backend skills** throughout this doc. "Plugin" refers only to the skill marketplace system.

| Term                 | Definition                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Skill**            | A directory in `.squad/skills/` with a `SKILL.md` file. Prompt-only — injected into agent charters at spawn.            |
| **Backend skill**    | A skill that also contains `scripts/`. Has both prompt content (SKILL.md) and executable handlers.                      |
| **Handler script**   | A `.js` file in a skill's `scripts/` directory. Exports a default async function that replaces a built-in tool handler. |
| **Lifecycle script** | `scripts/lifecycle.js` — optional per-skill module exporting `init(config)` and/or `dispose()`.                         |

### How It Works

1. **Author creates a skill directory** with `SKILL.md` and `scripts/`. TypeScript source in `src/` compiles to `.js` in `scripts/`. The SDK provides types for development — the output is plain `.js` files that don't depend on the SDK at runtime.

2. **User configures tracking** to point at the skill directory:

   ```json
   {
     "tracking": {
       "tasks": {
         "skill": ".squad/skills/github-issues"
       }
     }
   }
   ```

3. **At startup, Squad reads config**, discovers the skill directory, scans `scripts/` for handler files, and loads them via `import()`.

4. **Scripts replace built-in markdown handlers** in `ToolRegistry`. When an agent calls `squad_create_issue`, the handler from `scripts/create_issue.js` runs instead of the built-in markdown handler.

5. **If a script is missing**, that tool falls back to the markdown default. A skill that only provides `create_issue.js` and `list_issues.js` inherits the built-in handlers for everything else.

6. **If `scripts/lifecycle.js` exists**, its `init(config)` is called before any handler invocation and `dispose()` at session teardown.

### Why Skills, Not npm Packages

Skills are files. That's the entire argument.

**Portability.** A backend skill in `.squad/skills/github-issues/` is just a directory of files. Any agent framework — Squad, Copilot extensions, custom runners, third-party tools — can discover the `scripts/` directory, read the filenames, and call the handlers. No Squad CLI required. No npm resolution. No Node.js module system assumptions. The skill travels with the repo via git and works everywhere.

**Git-tracked.** Skills live in the repo alongside the project. Version control, code review, branch isolation — all the workflows teams already use for code apply to backend skills. npm packages live outside the repo in a global prefix directory nobody audits.

**No runtime dependencies.** Handler scripts are compiled `.js` files with no runtime dependency on the Squad SDK. The SDK is a dev dependency for authoring — `defineHandler<CreateIssueArgs>()` gives you types and compile-time safety. The output is a plain JavaScript file that exports a function. If Squad disappears tomorrow, the scripts still run.

**No install friction.** No `npm install -g`. No version manager issues. No `SQUAD_BACKEND_PATH`. No admin privileges. Clone the repo and the backends are there.

**Self-documenting.** `SKILL.md` makes backend skills discoverable by agents. An agent reading `.squad/skills/github-issues/SKILL.md` understands what the backend does, how it's configured, and what operations it supports — without running any code. npm packages are opaque blobs that require `require.resolve()` and reading docs hosted elsewhere.

**Concern binding.** The `metadata.squad-concerns` field in `SKILL.md` frontmatter declares which concerns a skill handles (`tasks`, `decisions`, `memories`, `logging`). Non-CLI platforms use this for automatic discovery — no `config.json` parsing required. Per the [agentskills.io specification](https://agentskills.io/specification#metadata-field), Squad-specific fields like `squad-domain` and `squad-concerns` live under `metadata` — an arbitrary key-value map for client-specific properties.

**Personal squads.** A developer with a personal squad (`~/.squad/`) can author backend skills in `~/.squad/skills/` and share them across every connected project. When a project's `teamRoot` points to the global squad directory, the skill loader resolves paths relative to it — the developer writes a GitHub Issues skill once, and every repo on their machine inherits it. This is the portability argument taken further: skills don't just travel with a repo via git, they travel with the _developer_ across repos. Personal squad skills are a CLI-only feature — non-CLI platforms (@copilot, VS Code Chat, GitHub.com Chat) don't have access to the developer's home directory. This isn't a new constraint introduced by the skill system; those platforms can't access local directories outside the repository in general.

---

## 6. Configuration

### Config Surfaces

Two config surfaces, same semantics:

**`.squad/config.json`** (CLI users — the primary audience):

```json
{
  "tracking": {
    "tasks": {
      "skill": ".squad/skills/github-issues",
      "repo": "owner/repo"
    }
  }
}
```

**`squad.config.ts`** (SDK users):

```typescript
import { defineConfig } from "@bradygaster/squad-sdk";

export default defineConfig({
  tracking: {
    tasks: {
      skill: ".squad/skills/github-issues",
      repo: "owner/repo",
    },
  },
});
```

SDK users can also pass handler objects directly, bypassing skill resolution:

```typescript
import { defineConfig } from "@bradygaster/squad-sdk";
import { createIssue, listIssues, closeIssue } from "./my-handlers.js";

export default defineConfig({
  tracking: {
    tasks: {
      handlers: {
        squad_create_issue: createIssue,
        squad_list_issues: listIssues,
        squad_close_issue: closeIssue,
      },
    },
  },
});
```

`defineConfig` accepts `TrackingConfig`, which accepts both `BackendRef` (strings and skill configs) and `HandlerRegistration<H>` wrappers per concern. The discriminant is structural: an object with a `skill` key is a backend reference, while an object with a `handlers` key contains inline function implementations (SDK users only). See Type Definitions below.

When both files exist, `squad.config.ts` wins. CLI-only users never create `squad.config.ts`.

### Type Definitions

```typescript
/**
 * A reference to a backend.
 *
 * - undefined           → built-in markdown (default)
 * - "markdown"          → built-in markdown (explicit reset)
 * - "noop"              → silent no-op (disables the concern)
 * - { skill, ...opts }  → skill directory with config options
 */
type BackendRef = "markdown" | "noop" | SkillConfig;

/**
 * Skill-based backend configuration.
 *
 * The `skill` key is the path to the skill directory (relative to squad root).
 * All other keys are backend-specific config, passed to lifecycle.js init()
 * and to each handler as the second argument.
 *
 * Values may reference environment variables using `${ENV_VAR}` syntax.
 * The loader expands these at startup before passing config to handlers.
 * This keeps secrets out of git-tracked config files.
 *
 * The `package?: never` pattern ensures `skill` and `package` configs are
 * mutually exclusive at the type level — future npm support would use a
 * separate union member.
 */
interface SkillConfig {
  /** Path to the skill directory (relative to squad root) */
  skill: string;
  /** Prevent future package key from coexisting with skill */
  package?: never;
  /** Timeout for dispose() calls in ms (default: 10000) */
  disposeTimeoutMs?: number;
  /** All other properties are skill-specific config */
  [key: string]: unknown;
}

/**
 * Inline handler registration (SDK users only, via squad.config.ts).
 *
 * The `handlers` key acts as the discriminant that separates inline
 * handler references from skill path references. A TrackingConfig entry
 * with `skill` is a backend reference; one with `handlers` contains
 * function implementations.
 */
interface HandlerRegistration<H extends HandlerLifecycle> {
  handlers: H;
}

interface TrackingConfig {
  /** Backend applied to ALL concerns unless individually overridden */
  default?: BackendRef;
  /** Backend for decisions (default: markdown) */
  decisions?: BackendRef | HandlerRegistration<DecisionHandlers>;
  /** Backend for agent memories (default: markdown) */
  memories?: BackendRef | HandlerRegistration<MemoryHandlers>;
  /** Backend for tasks/issues (default: markdown) */
  tasks?: BackendRef | HandlerRegistration<TaskHandlers>;
  /** Backend for orchestration + session logs (default: markdown) */
  logging?: BackendRef | HandlerRegistration<LogHandlers>;
}
```

### Config Scenarios

```jsonc
// 1. Default — omit tracking entirely. Markdown for everything.
{
  "teamRoot": "."
}

// 2. One concern on a custom backend, rest stays markdown
{
  "tracking": {
    "tasks": {
      "skill": ".squad/skills/github-issues",
      "repo": "owner/repo",
      "labels": ["squad-task"]
    }
  }
}

// 3. Default backend for all, except memories stay local
{
  "tracking": {
    "default": {
      "skill": ".squad/skills/github-issues",
      "repo": "owner/repo"
    },
    "memories": "markdown"
  }
}

// 4. Disable a concern entirely
{
  "tracking": {
    "logging": "noop"
  }
}

// 5. Environment variables for secrets
{
  "tracking": {
    "tasks": {
      "skill": ".squad/skills/github-issues",
      "repo": "owner/repo",
      "token": "${GH_TOKEN}"
    }
  }
}
```

### Resolution Rules

| Config value              | Interpretation                                                             |
| ------------------------- | -------------------------------------------------------------------------- |
| `undefined` (key omitted) | Falls back to `tracking.default` if set, otherwise built-in markdown       |
| `"markdown"`              | Built-in markdown (explicit override — ignores `default`)                  |
| `"noop"`                  | Disables the concern — handlers silently return success                    |
| Object with `skill` key   | Skill directory + config. Non-`skill` keys passed to `init()` and handlers |
| `tracking.default`        | Applied to every concern that doesn't have its own entry                   |

### Noop Semantics

When a concern is set to `"noop"`, all tool calls for that concern return `{ textResultForLlm: "...", resultType: "success" }` and data is silently discarded. The agent sees success and continues. Use noop to disable a concern without removing config — the agent is unaware data isn't being persisted.

### Skill Path Resolution

`resolveSkillPath(skill, projectRoot, teamRoot?)` resolves config paths at startup:

- **Absolute paths** are used as-is.
- **With `teamRoot`** (personal squad): the `.squad/` prefix is stripped to avoid double-nesting (`~/.squad/.squad/skills/foo`). Paths resolve relative to the team root.
- **Without `teamRoot`**: paths resolve relative to the project root.

**Path containment:** After resolution, the final path is verified to be within `projectRoot` or `teamRoot`. Paths containing `..` segments that escape the boundary are rejected (e.g., `"skill": "../../malicious-module"` throws at startup). Symlinks are resolved before the containment check to prevent symlink-based escapes.

**Resolution order for collisions:**

| Priority | Source                    | Example path                     |
| -------- | ------------------------- | -------------------------------- |
| 1 (wins) | Project-local skill       | `.squad/skills/github-issues/`   |
| 2        | Personal squad skill      | `~/.squad/skills/github-issues/` |
| 3        | Built-in markdown handler | (no skill directory — default)   |

No cross-source merging. If a project skill exists, it owns the concern entirely — missing scripts within it fall back to the built-in markdown handler, not the personal squad's version.

### Config Merge Semantics

When a concern entry exists alongside `tracking.default`, the concern entry **replaces** default entirely — no deep merging.

### Environment Variable Expansion

Config values containing `${VAR}` are expanded from `process.env` at startup. Semantics:

- Only the `${VAR}` syntax is supported — bare `$VAR` is not expanded.
- If a referenced variable is not set, the loader throws with a clear error. Empty string (`""`) is a valid value and does not throw.
- Expansion is **not recursive** — a resolved value containing `${...}` is not re-expanded.
- Expansion is **not shell execution** — no backtick execution, no `$(cmd)`, no globbing. Only literal env var lookup via `process.env[key]`.
- Only string values in the config object are expanded. Numbers, booleans, and arrays are passed through unchanged.
- Literal `${` is not supported in v1 config values. If this becomes a need, an escape syntax (e.g., `\${`) can be added.

This keeps secrets out of `.squad/config.json`.

---

## 7. Skill Directory Contract

### Directory Structure

A backend skill directory contains `SKILL.md` for agent-facing documentation and `scripts/` for executable handler scripts. Optional `src/` holds TypeScript source used during development.

```
.squad/skills/github-issues/
├── SKILL.md              # Agent-facing docs + frontmatter
├── scripts/
│   ├── lifecycle.js      # Optional: init(config), dispose(), shared state
│   ├── create_issue.js   # squad_create_issue handler
│   ├── list_issues.js    # squad_list_issues handler
│   ├── close_issue.js    # squad_close_issue handler
│   └── lib/              # Optional: shared modules (API clients, etc.)
│       └── github.js
└── src/                  # Optional: TypeScript source (development only)
    ├── lifecycle.ts
    ├── create_issue.ts
    ├── list_issues.ts
    └── ...
```

The `scripts/` directory is the runtime contract. Everything else is optional. `src/` is a convention for development — teams compile TypeScript to `scripts/` using whatever toolchain they prefer (tsc, esbuild, tsup). There is no `squad skill build` command. Example toolchains:

```bash
# tsc — simplest option
npx tsc --outDir .squad/skills/github-issues/scripts/ \
        --rootDir .squad/skills/github-issues/src/

# esbuild — fast, single-file bundles
npx esbuild .squad/skills/github-issues/src/*.ts \
    --outdir=.squad/skills/github-issues/scripts/ \
    --format=esm --platform=node
```

### SKILL.md Frontmatter

Backend skills use the standard [agentskills.io](https://agentskills.io/specification) frontmatter fields (`name`, `description`) plus Squad-specific properties in `metadata` — the spec's arbitrary key-value map for client extensions:

```yaml
---
name: github-issues
description: Route Squad task tracking to GitHub Issues
metadata:
  squad-domain: backend
  squad-concerns: tasks
  squad-confidence: high
  version: "1.0.0"
---
```

| Field                       | Required                 | Description                                                                              |
| --------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `name`                      | Yes                      | Skill identifier (spec field — must match directory name)                                |
| `description`               | Yes                      | Human-readable summary with routing rules (spec field — see below)                       |
| `metadata.squad-domain`     | Yes (for backend skills) | Must be `"backend"` to distinguish from prompt-only skills                               |
| `metadata.squad-concerns`   | Yes (for backend skills) | Space-delimited concerns this skill handles: `tasks`, `decisions`, `memories`, `logging` |
| `metadata.squad-confidence` | No                       | Trust level: `low`, `medium`, `high`                                                     |
| `metadata.version`          | No                       | Semantic version of the skill                                                            |

The `squad-` prefix on metadata keys avoids collisions with other tools per the spec's recommendation to "make your key names reasonably unique." The `metadata` field is a flat `string → string` map per spec — `squad-concerns` uses space-delimited values (e.g., `"tasks decisions"`) rather than YAML arrays.

#### Routing Rules in Descriptions

The `description` field should include routing rules that help agents (and tooling like [Sensei](https://github.com/spboyer/sensei)) determine when to activate a skill and when to defer to another. This prevents skill collision — agents invoking the wrong skill for a given prompt.

**Rules:**

| Rule                     | Purpose                                           | Example                                           |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| `USE FOR:`               | Trigger phrases — when this skill should activate | `"create issue", "track task", "list issues"`     |
| `DO NOT USE FOR:`        | Anti-triggers — when to use a different skill     | `"recording decisions (use markdown-decisions)"`  |
| `INVOKES:`               | Tools or MCP servers this skill calls             | `gh CLI (issue create, issue list)`               |
| `FOR SINGLE OPERATIONS:` | When to bypass the skill entirely                 | `Use gh issue create directly for one-off issues` |

**Example — well-routed backend skill:**

```yaml
---
name: github-issues
description: |
  Route Squad task tracking to GitHub Issues via the gh CLI.
  USE FOR: "create issue", "list issues", "close issue", "update issue",
  "track task in GitHub", "squad task tracking".
  DO NOT USE FOR: recording decisions (use markdown-decisions), writing
  agent memories (use markdown-memories), or platform operations like
  creating PRs or merging branches (those are not backend skills).
  INVOKES: gh CLI (issue create, issue list, issue close, issue edit).
  FOR SINGLE OPERATIONS: Use `gh issue create` directly for one-off
  issues outside a Squad session.
metadata:
  squad-domain: backend
  squad-concerns: tasks
  squad-confidence: high
  version: "1.0.0"
---
```

Routing rules are not enforced by the loader — they're agent-facing guidance baked into the description. When SKILL.md is injected into agent prompts, the `USE FOR` / `DO NOT USE FOR` phrases give the agent clear activation boundaries. Without them, agents pattern-match on the skill name alone, which leads to false positives (e.g., a "github-issues" skill activating for any GitHub-related prompt).

The `metadata.squad-concerns` field serves two purposes. For CLI tooling, it's structured metadata — `squad doctor` and the loader use it to validate skill configuration. For agent platforms without a ToolRegistry (Copilot Chat, @copilot, third-party frameworks), SKILL.md as a whole is the discovery mechanism — agents read the markdown instructions and follow them to invoke scripts or equivalent CLI commands. The frontmatter metadata helps tooling categorize skills; the prose content guides agents to the right operations.

A multi-concern skill declares all its concerns:

```yaml
---
name: postgres-backend
description: |
  Route all Squad state to PostgreSQL for persistent, queryable storage.
  USE FOR: "store decisions in postgres", "track issues in database",
  "persist agent memories", "query session logs".
  DO NOT USE FOR: file-based markdown storage (use built-in defaults),
  GitHub Issues tracking (use github-issues skill), or coordinator
  config (team.md, routing.md — always local files).
  INVOKES: pg (node-postgres) for all database operations.
metadata:
  squad-domain: backend
  squad-concerns: tasks decisions memories logging
  squad-confidence: high
  version: "1.0.0"
---
```

### Script Convention

Script filenames map directly to tool names. The rule is mechanical:

1. Strip the `squad_` prefix from the tool name.
2. Append `.js`.
3. The result must be a file in `scripts/`.

| Tool name               | Script filename      |
| ----------------------- | -------------------- |
| `squad_create_issue`    | `create_issue.js`    |
| `squad_update_issue`    | `update_issue.js`    |
| `squad_list_issues`     | `list_issues.js`     |
| `squad_close_issue`     | `close_issue.js`     |
| `squad_create_decision` | `create_decision.js` |
| `squad_list_decisions`  | `list_decisions.js`  |
| `squad_merge_decision`  | `merge_decision.js`  |
| `squad_create_memory`   | `create_memory.js`   |
| `squad_list_memories`   | `list_memories.js`   |
| `squad_create_log`      | `create_log.js`      |
| `squad_list_logs`       | `list_logs.js`       |

Each script must export a default async function:

```javascript
// .squad/skills/github-issues/scripts/create_issue.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function (args, config) {
  // args: CreateIssueArgs — matches the tool's schema
  // config: non-skill keys from the config entry (e.g., { repo, labels })
  // Returns: SquadToolResult

  const { title, body, assignee } = args;
  const { repo, labels } = config;

  const ghArgs = [
    "issue",
    "create",
    "--repo",
    repo,
    "--title",
    title,
    "--body",
    body ?? "",
    "--label",
    (labels ?? ["squad-task"]).join(","),
  ];

  const result = await execFileAsync("gh", ghArgs, { timeout: 30_000 });

  return {
    textResultForLlm: result.stdout.trim(),
    resultType: "success",
  };
}
```

**Handler signature:** `export default async function(args, config)`

- `args` — the tool's input arguments, matching the schema (e.g., `CreateIssueArgs`). Identical across all backends.
- `config` — the non-framework keys from the config entry. For the config `{ "skill": ".squad/skills/github-issues", "repo": "owner/repo", "labels": ["squad-task"] }`, the handler receives `{ repo: "owner/repo", labels: ["squad-task"] }`. Framework keys (`skill`, `disposeTimeoutMs`) are stripped before passing config to handlers.
- **Return type:** `SquadToolResult` — same as the built-in handlers.

Handler return values are validated at load time. When the skill loader scans `scripts/`, it verifies that each script's default export is a function. Scripts that don't export a function are skipped with a warning, and the tool falls back to the markdown default.

### Lifecycle Convention

`scripts/lifecycle.js` is an optional per-skill module that manages shared state and resources.

```javascript
// .squad/skills/github-issues/scripts/lifecycle.js

import { Octokit } from "./lib/github.js";

let client = null;

export async function init(config) {
  // Called once at skill load, before any handler invocation.
  // config receives the non-`skill` keys from the config entry.
  client = new Octokit({ auth: config.token });
}

export async function dispose() {
  // Called once at session teardown.
  // Clean up connections, flush buffers, etc.
  client = null;
}
```

**Contract:**

- `init(config)` — called once when the skill is loaded, before any handler runs. Receives the same `config` object handlers receive (non-`skill` keys from the config entry). Use it for one-time setup: creating API clients, opening database connections, validating credentials.
- `dispose()` — called once at session teardown. Use it for cleanup: closing connections, draining pools, flushing buffers. Must complete promptly — Squad enforces a 10-second timeout (configurable via `disposeTimeoutMs`) before force-exiting. **`dispose()` must be safe to call even if `init()` partially succeeded or was never called.** Squad calls `dispose()` on any lifecycle that was registered, including those whose `init()` threw midway through. If `init()` opened a file handle before failing on a database connection, `dispose()` must handle both the case where the handle exists and where it doesn't. Guard resource cleanup with null checks — don't assume `init()` completed.
- Both exports are optional. A skill can export just `init`, just `dispose`, or neither. Stateless skills skip `lifecycle.js` entirely.

The names `init`/`dispose` are intentional. `dispose` aligns with the TC39 explicit resource management proposal (`Symbol.asyncDispose`, `await using`) — a future version could expose skills as disposable resources with zero naming friction. Don't rename them to `setup`/`teardown` or `open`/`close`.

**Shared state** between lifecycle and handler scripts works through Node's module cache. A `scripts/lib/` module exposes getter/setter functions; `lifecycle.js` calls the setter in `init()`, and handler scripts call the getter. Node's module cache ensures the same instance is returned everywhere within the process — no globals, no DI framework, just ES module semantics.

**Multi-concern skills and init() idempotency:** When the same skill directory is configured for multiple concerns (e.g., `tasks` and `decisions` both pointing at `.squad/skills/postgres`), each concern gets its own lifecycle — `init(config)` and `dispose()` are called once per concern, not once per skill directory. If the configs differ (e.g., different database URLs), this is correct. If the configs match, `init()` will be called twice with identical arguments. **`init()` must be idempotent** — it must be safe to call multiple times with the same config without leaking resources or corrupting state.

Note that module-level singletons in `lifecycle.js` (e.g., `let pool = null; pool ??= new Pool(...)`) do **not** reliably achieve idempotency — the module may be loaded multiple times (once per concern), giving each load its own module scope where the variable starts as `null`. The `??=` guard only protects within a single module instance, not across re-loads. To share resources across concerns, use the `scripts/lib/` module pattern described above — a shared lib module is cached by Node's module system and provides a stable singleton scope. Alternatively, use external coordination (e.g., a named connection pool, a PID file, or a registry keyed by connection string).

### Handler Return Type

Skill handlers return `SquadToolResultObject` — the existing structured result type from `adapter/types.ts`. This is the same type used by all built-in tool handlers:

```typescript
// From adapter/types.ts — NOT redefined here
interface SquadToolResultObject {
  textResultForLlm: string;
  binaryResultsForLlm?: SquadToolBinaryResult[];
  resultType: SquadToolResultType; // "success" | "failure" | "rejected" | "denied"
  error?: string;
  sessionLog?: string;
  toolTelemetry?: Record<string, unknown>;
}
```

Skill handlers typically use only `"success"` and `"failure"` result types. The `"rejected"` and `"denied"` types are available for skills that implement permission-aware operations. The existing `SquadToolResult` union (`string | SquadToolResultObject`) is accepted — string returns are wrapped by the adapter layer.

---

## 8. Handler Types

All handler types are **authoring types**. They live in the SDK (`@bradygaster/squad-sdk`) and are used during development for compile-time safety. At runtime, handler scripts are plain `.js` files with no dependency on the SDK. The SDK is a dev dependency:

```bash
npm install -D @bradygaster/squad-sdk
```

TypeScript handler source uses the SDK types:

```typescript
// src/create_issue.ts
import { defineHandler } from "@bradygaster/squad-sdk";
import type { CreateIssueArgs } from "@bradygaster/squad-sdk";

export default defineHandler<CreateIssueArgs>(async (args, config) => {
  // args is typed as CreateIssueArgs
  // config is typed as Record<string, unknown>
  return {
    textResultForLlm: `Created issue: ${args.title}`,
    resultType: "success",
  };
});
```

The compiled output is a plain `.js` file that exports a function. `defineHandler` is an identity function at runtime — it exists solely for type inference.

### Base Types

```typescript
/**
 * Skill handler function — distinct from SquadToolHandler.
 *
 * SquadToolHandler (adapter/types.ts) receives SquadToolInvocation as its
 * second argument (sessionId, toolCallId, toolName). Skill handlers receive
 * config instead. ToolRegistry bridges them: it wraps each SkillHandler in
 * a SquadToolHandler that extracts config from the loader closure and passes
 * it through. The adapter boundary is ToolRegistry, not the handler itself.
 */
type SkillHandler<TArgs = unknown> = (
  args: TArgs,
  config: Record<string, unknown>,
) => Promise<SquadToolResult> | SquadToolResult;

/**
 * Lifecycle hooks for stateful skills.
 * Extended by all concern handler interfaces.
 */
interface HandlerLifecycle {
  /** Called once after handler resolution, before first tool call */
  init?(config: Record<string, unknown>): Promise<void>;
  /** Called once at session end */
  dispose?(): Promise<void>;
}
```

### Concern Handler Interfaces

```typescript
/** Task/issue tracking handlers */
interface TaskHandlers extends HandlerLifecycle {
  squad_create_issue?: SkillHandler<CreateIssueArgs>;
  squad_update_issue?: SkillHandler<UpdateIssueArgs>;
  squad_list_issues?: SkillHandler<ListIssuesArgs>;
  squad_close_issue?: SkillHandler<CloseIssueArgs>;
}

/** Decision recording/reading handlers */
interface DecisionHandlers extends HandlerLifecycle {
  /** Create a pending decision (inbox) */
  squad_create_decision?: SkillHandler<CreateDecisionArgs>;
  /** List canonical (merged) decisions */
  squad_list_decisions?: SkillHandler<ListDecisionsArgs>;
  /** Merge pending decisions into canonical store, clear inbox (Scribe) */
  squad_merge_decision?: SkillHandler<MergeDecisionArgs>;
}

/** Agent memory/history handlers */
interface MemoryHandlers extends HandlerLifecycle {
  /** Create a memory entry (owning agent OR Scribe for cross-agent) */
  squad_create_memory?: SkillHandler<CreateMemoryArgs>;
  /** List agent memories */
  squad_list_memories?: SkillHandler<ListMemoriesArgs>;
}

/** Logging handlers (orchestration + session logs) */
interface LogHandlers extends HandlerLifecycle {
  /** Create a log entry (orchestration log or session log) */
  squad_create_log?: SkillHandler<CreateLogArgs>;
  /** List log entries */
  squad_list_logs?: SkillHandler<ListLogsArgs>;
}

/**
 * All handler interfaces merged — used internally by ToolRegistry.
 * ToolRegistry and startup logic use Partial<AllHandlers> for incremental assignment.
 */
type AllHandlers = TaskHandlers &
  DecisionHandlers &
  MemoryHandlers &
  LogHandlers;
```

**Disjoint name invariant (MUST-HAVE):** The intersection type `AllHandlers` relies on all four handler interfaces having disjoint tool name keys. No two concerns share a tool name — e.g., there is no `squad_create_issue` on both `TaskHandlers` and `DecisionHandlers`. This is enforced by convention (verb convention §8, tool name table §7), but convention alone is insufficient — if a future tool name collided across concerns, the intersection would silently merge the handler signatures. TypeScript wouldn't error, and `resolveHandler()` would quietly pick one implementation. This must be enforced at compile time.

The following assertion strips shared `HandlerLifecycle` keys (`init`, `dispose`) and checks that every pair of concern handler interfaces has zero overlapping tool name keys. If any pair shares a key, the corresponding `_Check` type resolves to `never`, causing a compile error at the `const` assertion site:

```typescript
/** Extract only tool-name keys, stripping shared lifecycle hooks */
type OwnKeys<T> = Exclude<keyof T, keyof HandlerLifecycle>;

/** Resolves to `true` if A and B share no tool-name keys; `never` otherwise */
type AssertDisjoint<A, B> =
  Extract<OwnKeys<A>, OwnKeys<B>> extends never ? true : never;

// Compile-time checks — all 6 handler-interface pairs must be disjoint
type _TaskDecision = AssertDisjoint<TaskHandlers, DecisionHandlers>;
type _TaskMemory = AssertDisjoint<TaskHandlers, MemoryHandlers>;
type _TaskLog = AssertDisjoint<TaskHandlers, LogHandlers>;
type _DecisionMemory = AssertDisjoint<DecisionHandlers, MemoryHandlers>;
type _DecisionLog = AssertDisjoint<DecisionHandlers, LogHandlers>;
type _MemoryLog = AssertDisjoint<MemoryHandlers, LogHandlers>;

// If any pair shares a tool name, the line below fails to compile:
const _disjointProof: [
  _TaskDecision,
  _TaskMemory,
  _TaskLog,
  _DecisionMemory,
  _DecisionLog,
  _MemoryLog,
] = [true, true, true, true, true, true];
```

This assertion is not optional. Without it, adding a tool name like `squad_list_entries` to both `MemoryHandlers` and `LogHandlers` would compile cleanly and produce undefined runtime behavior in `resolveHandler()`.

### ConcernMap Type

Compile-time mapping from concern name to handler interface. Ensures that when you configure a concern, you get the right handler type — not just any handler set.

```typescript
/**
 * Maps concern names to their handler types.
 * Enables compile-time concern→handler correlation.
 */
interface ConcernMap {
  tasks: TaskHandlers;
  decisions: DecisionHandlers;
  memories: MemoryHandlers;
  logging: LogHandlers;
}

/** String literal union of all concern names */
type Concern = keyof ConcernMap;

// Note: ConcernMap[Concern] produces a union which is NOT useful for calling
// methods — use the generic ConcernMap[C] pattern in resolveHandlers<C> instead.
```

### LoadResult Type

The `SkillScriptLoader.load()` method (§9) returns a `LoadResult` — a container for the resolved tool entries and optional lifecycle hooks:

```typescript
/**
 * Result of loading a skill's scripts for a given concern.
 */
interface LoadResult {
  /** Fully-formed SquadTool entries — skill handlers combined with built-in schemas */
  tools: SquadTool[];
  /** Lifecycle hooks extracted from scripts/lifecycle.js, if present */
  lifecycle?: {
    init?(config: Record<string, unknown>): Promise<void>;
    dispose?(): Promise<void>;
  };
}
```

Each `SquadTool` in the array is a fully-formed tool entry (name + schema + wrapped handler) ready for `registry.applySkillHandlers()`. The `load()` method uses its generic `Concern` parameter internally to scope which tool names to scan — the return type is concern-agnostic since `SquadTool` already encodes the tool name.

### SDK Exports

The following types and utilities must be exported from `@bradygaster/squad-sdk` for skill authors:

| Export                     | Kind     | Purpose                                                      |
| -------------------------- | -------- | ------------------------------------------------------------ |
| `defineHandler<TArgs>()`   | Function | Identity function for type inference in handler scripts      |
| `validateSkill(skillPath)` | Function | Programmatic equivalent of `squad doctor` for a single skill |
| `SkillHandler<TArgs>`      | Type     | Handler function signature                                   |
| `HandlerLifecycle`         | Type     | `init`/`dispose` hooks                                       |
| `TaskHandlers`             | Type     | Concern handler interface                                    |
| `DecisionHandlers`         | Type     | Concern handler interface                                    |
| `MemoryHandlers`           | Type     | Concern handler interface                                    |
| `LogHandlers`              | Type     | Concern handler interface                                    |
| `AllHandlers`              | Type     | Merged intersection of all concern handlers                  |
| `ConcernMap`               | Type     | Concern name → handler type mapping                          |
| `Concern`                  | Type     | `keyof ConcernMap` string literal union                      |
| `LoadResult`               | Type     | Loader return type                                           |
| `CreateIssueArgs`          | Type     | Tool argument interface                                      |
| `UpdateIssueArgs`          | Type     | Tool argument interface                                      |
| `ListIssuesArgs`           | Type     | Tool argument interface                                      |
| `CloseIssueArgs`           | Type     | Tool argument interface                                      |
| `CreateDecisionArgs`       | Type     | Tool argument interface                                      |
| `ListDecisionsArgs`        | Type     | Tool argument interface                                      |
| `MergeDecisionArgs`        | Type     | Tool argument interface                                      |
| `CreateMemoryArgs`         | Type     | Tool argument interface                                      |
| `ListMemoriesArgs`         | Type     | Tool argument interface                                      |
| `CreateLogArgs`            | Type     | Tool argument interface                                      |
| `ListLogsArgs`             | Type     | Tool argument interface                                      |
| `BackendRef`               | Type     | Config union type                                            |
| `SkillConfig`              | Type     | Skill-based backend config                                   |
| `TrackingConfig`           | Type     | Top-level tracking config                                    |
| `HandlerRegistration<H>`   | Type     | Inline handler wrapper (SDK users)                           |

Usage in the loader:

```typescript
function resolveHandlers<C extends Concern>(
  concern: C,
  ref: SkillConfig,
): Promise<ConcernMap[C] | null> {
  // Return type is exactly the handler interface for this concern —
  // not a loose ConcernHandlers union.
}
```

This catches a class of bugs where a skill providing `TaskHandlers` is accidentally assigned to the `decisions` concern. Without `ConcernMap`, both are `ConcernHandlers` and TypeScript wouldn't complain.

### Tool Argument Types

Each tool has a typed argument interface. These define the common fields Squad guarantees; skills may document additional fields in SKILL.md that agents can pass — the `[key: string]: unknown` index signature allows extension without breaking the contract.

| Interface            | Required fields                                 | Optional fields                                   |
| -------------------- | ----------------------------------------------- | ------------------------------------------------- |
| `CreateIssueArgs`    | `title: string`                                 | `body`, `assignee`                                |
| `UpdateIssueArgs`    | `issueId: string \| number`                     | `title`, `body`                                   |
| `ListIssuesArgs`     | —                                               | `status: "all" \| "open" \| "closed"`, `limit`    |
| `CloseIssueArgs`     | `issueId: string \| number`                     | `comment`                                         |
| `CreateDecisionArgs` | `author`, `summary`, `body`                     | —                                                 |
| `ListDecisionsArgs`  | —                                               | `status: "all" \| "pending" \| "merged"`, `limit` |
| `MergeDecisionArgs`  | —                                               | `slugs: string[]`                                 |
| `CreateMemoryArgs`   | `content: string`                               | `agent`                                           |
| `ListMemoriesArgs`   | —                                               | `agent`, `limit`                                  |
| `CreateLogArgs`      | `kind: "orchestration" \| "session"`, `content` | `agent`                                           |
| `ListLogsArgs`       | —                                               | `kind`, `limit`                                   |

All interfaces include `[key: string]: unknown` for skill-documented extensions. Two representative examples:

```typescript
interface CreateIssueArgs {
  title: string;
  body?: string;
  assignee?: string;
  [key: string]: unknown; // Skills can document extra fields (e.g., labels)
}

interface CreateLogArgs {
  kind: "orchestration" | "session";
  content: string;
  agent?: string;
  [key: string]: unknown;
}
```

Skills document their extensions in SKILL.md — agents read the skill instructions and include the appropriate fields.

### Verb Convention

All tool names follow the pattern `squad_{verb}_{noun}`. Singular noun for single-item operations, plural for collection operations.

| Verb     | Semantics                       | Noun form | Examples                                      |
| -------- | ------------------------------- | --------- | --------------------------------------------- |
| `create` | Write one new record            | singular  | `squad_create_issue`, `squad_create_decision` |
| `list`   | Read/query a collection         | plural    | `squad_list_issues`, `squad_list_decisions`   |
| `update` | Modify an existing record       | singular  | `squad_update_issue`                          |
| `close`  | Complete/archive a record       | singular  | `squad_close_issue`                           |
| `merge`  | Consolidate pending → canonical | singular  | `squad_merge_decision`                        |

Every backend-swappable tool uses one of these verbs. No synonyms (`write`, `read`, `get`, `fetch`, `append`, `save`). If a new tool doesn't fit these verbs, the verb chart must be extended first.

### What's New vs. What Changed

| Handler                 | Status      | Why                                                                                                                                                                            |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `squad_merge_decision`  | **New**     | Scribe's inbox→canonical merge. Without this, switching backends leaves Scribe doing raw file ops on a store that no longer exists.                                            |
| `squad_create_log`      | **New**     | Scribe writes orchestration logs + session logs. One handler, a `kind` field (`orchestration` or `session`) differentiates them.                                               |
| `squad_list_logs`       | **New**     | Session catch-up reads recent logs. Coordinator currently scans `orchestration-log/` — this makes it backend-aware.                                                            |
| `squad_create_memory`   | **Renamed** | Was `squad_memory`. Existing name kept as deprecated alias in ToolRegistry — agents using `squad_memory` are shimmed to `squad_create_memory`. Alias removal in later release. |
| `squad_create_decision` | **Renamed** | Was `squad_decide`. Existing name kept as deprecated alias — agents using `squad_decide` are shimmed to `squad_create_decision`. Alias removal in later release.               |
| `squad_list_decisions`  | **New**     | Canonical decision listing.                                                                                                                                                    |

### What Stays File-Only

- **`squad_skill`** — Managed by the `squad plugin` marketplace system. Skills are git-tracked prompt fragments, not runtime state. They get injected into spawn prompts at charter compilation time. Swapping skills to a database doesn't make sense — they're code-adjacent configuration.
- **`squad_route`** — In-memory session routing. No storage.
- **`squad_status`** — In-memory session pool query. No storage.
- **Coordinator config** — team.md, routing.md, ceremonies.md, casting/, identity/. Read at boot before backends are loaded. Must be local files.

### What Can't Be Overridden

`squad_route` and `squad_status` operate on in-memory session state — no persistent storage to swap. They are not in `AllHandlers`.

### Schemas Are Fixed

Backend handler scripts receive arguments matching the ToolRegistry's schemas. **Skills cannot change schemas.** If a GitHub Issues skill could alter the parameters of `squad_create_issue`, agents would see different tool signatures depending on the configured backend. That's a prompt instability bug.

The contract: receive args conforming to the schema, return a `SquadToolResult`. What happens in between is the skill's business.

### Events

Backend operations emit events for observability. When `ToolRegistry` dispatches a handler call, it emits structured events before and after execution:

```typescript
interface ToolBeforeEvent {
  type: "tool:before";
  toolName: string;
  args: unknown;
  timestamp: number;
  backend: string; // "markdown" | skill directory name
}

interface ToolAfterEvent {
  type: "tool:after";
  toolName: string;
  result: SquadToolResult;
  duration_ms: number;
  timestamp: number;
  backend: string;
}
```

The event bus emits `tool:before` synchronously before the handler is called and `tool:after` after the handler returns (or throws). Listeners can use these for logging, metrics, or audit without skills knowing about each other. The `backend` field identifies which backend serviced the call — `"markdown"` for built-in handlers, or the skill directory name (e.g., `"github-issues"`) for loaded backend skills.

Backend skills do not emit events directly. The event bus is a Squad concern — skills just do their work and return results.

---

## 9. Loading & Resolution

### Skill Script Loader

The `SkillScriptLoader` resolves a skill directory into a handler set for a given concern. Key behaviors:

```typescript
class SkillScriptLoader {
  async load<C extends Concern>(
    skillPath: string,
    concern: C,
    backendConfig: Record<string, unknown>,
  ): Promise<LoadResult | null>;
}
```

**Algorithm:**

1. Check for `scripts/` directory — return `null` if missing (markdown fallback).
2. For each tool name in the concern (e.g., `squad_create_issue` → `create_issue.js`), attempt `import()`.
3. Validate: if a script exists but doesn't export a default function, throw (not a silent fallback). Missing scripts are fine — the concern may only need a subset of tools.
4. For each resolved handler, combine it with the built-in tool's schema (name, description, parameters) to produce a fully-formed `SquadTool` entry. The handler is wrapped via `wrapSkillHandler()` to inject `backendConfig` and bridge the `SkillHandler` → `SquadToolHandler` signature gap. The result is not a bare function — it's a complete `SquadTool` object ready for `registry.applySkillHandlers()`.
5. Load `scripts/lifecycle.js` if present (extract `init` and `dispose` named exports).
6. Return `{ tools: SquadTool[], lifecycle }`.

**Key design details:**

- **Scoped tool scanning:** The generic `Concern` parameter tells the loader which tool names to look for (e.g., `"tasks"` → `create_issue.js`, `list_issues.js`, etc.). The returned `LoadResult` contains `SquadTool[]` — fully-formed tool entries ready for the registry.
- **Path normalization:** All paths are converted to forward slashes before `pathToFileURL()`. This prevents the same script from being imported twice under different path representations on Windows (e.g., `C:\repo\scripts\db.js` vs `C:/repo/scripts/db.js`), which would create separate module-level state — a subtle bug when skills use singletons like connection pools. **Windows test coverage:** Implementation tests must verify that forward-slash normalization produces identical module cache keys on Windows. A regression test should import the same script via both `\` and `/` paths and assert that the module instance is shared (same object identity on an exported singleton).
- **Symlink resolution:** The path containment check (§6) calls `fs.realpath()` before comparing against the project/team root boundary. On Windows, `fs.realpath()` may behave differently for junction points vs. POSIX symlinks — implementation should use `fs.promises.realpath()` consistently and include test cases for both junction (`mklink /J`) and symlink (`mklink /D`) on Windows, and standard symlinks on macOS/Linux.
- **Config injection:** The raw `(args, config)` handler receives every key from the tracking config entry _except_ `skill`. Scripts access `repo`, `labels`, `connectionString`, etc. directly from `config`.

### Startup Sequence

The startup sequence has a clear async initialization pipeline. Each step's output feeds the next:

**Pipeline:**

1. **`loadConfig()`** → `SquadConfig` (the `runtime/config.ts` version — see §10 for which `SquadConfig`). Now includes `tracking?: TrackingConfig`.
2. **`resolveSkillPaths(config.tracking)`** → validated, resolved filesystem paths (sync). Applies path containment checks, personal squad normalization, symlink resolution.
3. **`SkillScriptLoader.load()`** → `LoadResult[]` (async — uses `import()` for each script). For each concern with a `skill` entry, the loader resolves handler scripts and produces fully-formed `SquadTool` entries by combining skill handlers with built-in tool schemas. Returns `null` for missing skills (markdown fallback with warning). Results are collected into an array.
4. **`new ToolRegistry(root, poolGetter)`** → built-in markdown tools (sync constructor). No skill awareness at this point.
5. **`registry.applySkillHandlers(loadResults.flatMap(r => r.tools))`** → replaces built-in tool entries by name with skill-backed `SquadTool` objects. Tools without skill overrides keep their markdown handlers.
6. **Lifecycle init with rollback:** For each skill with a lifecycle, track it with `{ concern, backendConfig }`. Push each lifecycle to `initialized` _before_ calling `init()`. On failure, the failed entry stays in the list — `init()` may have partially succeeded. All initialized lifecycles get `dispose()` called during rollback. Each concern gets its own lifecycle — no dedup by skill path (configs may differ).
7. **Wire registry into sessions:** `registry.getTools()` feeds `SquadSessionConfig.tools` at session creation. The existing `createSession()` in `agents/lifecycle.ts` builds a `SquadSessionConfig` but doesn't populate `tools` — skill-backed tools must be included here so the LLM sees them.

### Teardown

At session end, all initialized lifecycles are disposed. Errors are collected — one failing lifecycle doesn't prevent others from cleaning up. A configurable timeout (default from `disposeTimeoutMs` in config, fallback 10s) prevents hung `dispose()` calls from blocking process exit. Timer handles are cleared in `finally` to avoid leaks.

**Testability:** Dispose timeout is testable via `vi.useFakeTimers()` + a never-resolving `dispose()` mock. Rollback is testable with mock lifecycles: A succeeds init, B throws, assert both get `dispose()`. The re-entrancy guard should be extracted to a testable function that receives a `dispose` callback rather than tested via `process.on` directly.

### Signal Handling

The skill lifecycle's `disposeAll()` integrates into the existing shutdown flow rather than registering standalone `process.on('SIGINT')` handlers. The CLI already has per-command signal handlers (start.ts, aspire.ts, shell/index.ts). Skill lifecycle cleanup is registered as a callback on the shared teardown sequence — the existing signal handlers call it as part of their cleanup. A re-entrancy guard prevents double-dispose: first signal triggers graceful `disposeAll()`, second signal force-exits with code 1.

---

## 10. ToolRegistry Changes

### Constructor

The `ToolRegistry` constructor signature is unchanged:

```typescript
constructor(
  squadRoot = '.squad',
  sessionPoolGetter?: () => SessionPool,
)
```

The constructor creates built-in markdown tools synchronously. Skill handler overrides are applied post-construction via `applySkillHandlers()` — this separation keeps the constructor sync and moves async skill loading to a distinct step.

**SquadConfig integration:** There are two `SquadConfig` types in the codebase — the legacy scaffold config in `config/schema.ts` and the runtime config in `runtime/config.ts` (returned by `loadConfig()`). The `tracking?: TrackingConfig` field goes on the **`runtime/config.ts` version** — the one `loadConfig()` returns and the startup pipeline consumes (see §9 Pipeline step 1). The `config/schema.ts` version is for scaffold/init-time config and does not participate in skill loading. This is a schema addition (non-breaking) but must land before or alongside the skill loader.

### applySkillHandlers Method

ToolRegistry exposes `applySkillHandlers()` to replace built-in tools with skill-backed versions post-construction:

```typescript
applySkillHandlers(tools: SquadTool[]): void {
  for (const tool of tools) {
    if (this.tools.has(tool.name)) {
      this.tools.set(tool.name, tool);
    }
    // Unknown tool names are silently ignored — skills cannot introduce new tools.
  }
}
```

Each `SquadTool` entry passed to this method is a fully-formed object (name + description + parameters + handler) produced by `SkillScriptLoader`. The loader combines the skill's handler function with the built-in tool's schema — schemas are fixed (§7), only the handler implementation changes. `applySkillHandlers()` replaces the entire `SquadTool` map entry by name. Once applied, handlers are immutable for the session.

### Handler Wrapper — Bridging SkillHandler to SquadToolHandler

Skill handlers have the signature `(args, config) => SquadToolResult`. The existing `SquadToolHandler` (from `adapter/types.ts`) has the signature `(args, invocation) => SquadToolResult`, where `invocation` is a `SquadToolInvocation` containing `sessionId`, `toolCallId`, and `toolName`. ToolRegistry bridges these at load time:

```typescript
// In SkillScriptLoader or ToolRegistry wiring:
function wrapSkillHandler<T>(
  skillHandler: SkillHandler<T>,
  backendConfig: Record<string, unknown>,
): SquadToolHandler<T> {
  return (args: T, _invocation: SquadToolInvocation) => {
    return skillHandler(args, backendConfig);
  };
}
```

The wrapper captures `backendConfig` from the loader closure and ignores the `SquadToolInvocation` — skill handlers don't need session IDs or tool call IDs. This is the glue between the skill authoring surface (simple `args + config`) and Squad's internal tool dispatch (adapter-level `args + invocation`).

### HookPipeline Integration (Prerequisite)

HookPipeline must be wired into ToolRegistry's dispatch loop **before or alongside** the skill system. This is a prerequisite, not a nice-to-have — without it, governance is decorative.

All dispatched handlers — built-in markdown handlers AND skill-provided handlers — must flow through `runPreToolHooks()` before execution and `runPostToolHooks()` after execution. This ensures that security guards (PII scrubbing, file-write restrictions, prompt injection detection) apply uniformly regardless of which backend services the tool call. A skill handler that bypasses hooks could write PII to an external system or perform disallowed file operations undetected.

**Implementation requirement:** ToolRegistry's dispatch path wraps every handler call in the hook pipeline:

```typescript
// Pseudocode — ToolRegistry dispatch
async dispatch(toolName: string, args: unknown, invocation: SquadToolInvocation) {
  await runPreToolHooks(toolName, args);     // governance gate
  const result = await handler(args, invocation);
  await runPostToolHooks(toolName, result);  // audit + scrubbing
  return result;
}
```

This applies to `applySkillHandlers` overrides identically to built-in handlers. Skills do not need to know hooks exist — the pipeline is transparent to them.

**Team decision reference:** Per "Hook-based governance over prompt instructions" (2026-02-21, Baer): security, PII, and file-write guards are implemented via the hooks module, NOT prompt instructions. Hooks are code — they execute deterministically. The skill system must not create a path that circumvents this.

### Handler-Backed Tools

Eleven tools are backed by swappable handlers. Each tool's handler can be overridden by a skill script.

**Task/issue tracking (4 tools):**

| Tool                 | Purpose                  | Default (markdown)             |
| -------------------- | ------------------------ | ------------------------------ |
| `squad_create_issue` | Create a task/issue      | Write `.squad/tasks/{slug}.md` |
| `squad_update_issue` | Update an existing issue | Modify task file frontmatter   |
| `squad_list_issues`  | Query/list issues        | Scan `.squad/tasks/*.md`       |
| `squad_close_issue`  | Close/complete an issue  | Move to `.squad/tasks/closed/` |

**Decision lifecycle (3 tools):**

| Tool                    | Purpose                              | Default (markdown)                                                        |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `squad_create_decision` | Create a pending decision            | Write to `.squad/decisions/inbox/{agent}-{slug}.md`                       |
| `squad_list_decisions`  | List canonical decisions             | Parse `.squad/decisions.md`                                               |
| `squad_merge_decision`  | Merge inbox → canonical, clear inbox | Read `decisions/inbox/*.md`, append to `decisions.md`, delete inbox files |

**Memory (2 tools):**

| Tool                  | Purpose                   | Default (markdown)                          |
| --------------------- | ------------------------- | ------------------------------------------- |
| `squad_create_memory` | Create agent memory entry | Append to `.squad/agents/{name}/history.md` |
| `squad_list_memories` | List agent memories       | Parse `.squad/agents/{name}/history.md`     |

**Logging (2 tools):**

| Tool               | Purpose                             | Default (markdown)                                                               |
| ------------------ | ----------------------------------- | -------------------------------------------------------------------------------- |
| `squad_create_log` | Create orchestration or session log | Write `.squad/orchestration-log/{ts}-{agent}.md` or `.squad/log/{ts}-{topic}.md` |
| `squad_list_logs`  | List/search log entries             | Scan `.squad/orchestration-log/` or `.squad/log/`                                |

Non-handler tools (`squad_route`, `squad_status`, `squad_skill`) are unchanged. They operate on in-memory or file-only state and are not part of `AllHandlers`.

---

## 11. Platform Availability

Skills are the unified artifact format. Both instructions (SKILL.md) and code (scripts/) live in the same directory. What activates depends on the platform's runtime capabilities.

| Platform                | SKILL.md            | scripts/                 | How                                                                                |
| ----------------------- | ------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| CLI (Node.js)           | ✅ Prompt injection | ✅ `import()` at startup | Squad owns the process, loads scripts directly via `SkillScriptLoader`             |
| @copilot (coding agent) | ✅ Instructions     | ✅ Terminal execution    | Agent reads SKILL.md, maps tool names to scripts, invokes via terminal             |
| VS Code Copilot Chat    | ✅ Prompt injection | ❗ Instructions only     | SKILL.md guides agents; agents follow instructions to use CLI tools or MCP servers |
| GitHub.com Copilot Chat | ✅ Prompt injection | ❌ Not executed          | Same as VS Code — SKILL.md provides guidance, scripts are inert                    |

### Agent–Skill Binding

On the CLI, tool-to-handler binding is automatic: `SkillScriptLoader` maps `squad_create_issue` → `scripts/create_issue.js` at startup. Agents call tools normally.

On platforms without a ToolRegistry (@copilot, VS Code Chat), agents need explicit instructions to find and invoke skills. SKILL.md provides this. A well-written SKILL.md includes:

1. **Tool-to-script mapping** — which tool names correspond to which script files
2. **Invocation instructions** — how to call the script (`node .squad/skills/{name}/scripts/create_issue.js '{"title": "..."}' ` or equivalent CLI command like `gh issue create`)
3. **Config location** — where the agent finds repo, labels, and other config values

This is the same pattern as any agent instruction file — the Copilot Chat extension follows markdown instructions in the repo. If SKILL.md says "to create an issue, run `gh issue create --repo {repo} --title {title}`", the agent does exactly that. The `metadata.squad-concerns` field helps tooling categorize skills; the prose guides agents.

### One Format, Platform-Dependent Activation

This is NOT "one mechanism everywhere." It's one **format** everywhere with **runtime-dependent behavior**.

On the CLI, Squad owns the Node.js process. It reads the skill config, resolves the `scripts/` directory, and loads handler scripts via `import()` at startup. Both SKILL.md (injected into agent prompts at charter compilation) and scripts (wired into `ToolRegistry`) are active. Agents call `squad_create_issue`; the handler routes to the skill's `create_issue.js`.

On the @copilot coding agent, the sandbox provides terminal access. SKILL.md tells the agent how to invoke scripts — the agent reads the instructions and uses terminal commands to call handler scripts or equivalent CLI tools. The tool-to-script mapping is explicit in SKILL.md, not inferred from filenames. Example: SKILL.md says "to create an issue, run `gh issue create ...`" and the agent follows the instruction.

On VS Code Copilot Chat and GitHub.com Copilot Chat, Squad has no process. There's no `ToolRegistry`, no `SkillScriptLoader`, no `import()`. SKILL.md is the only active component — it's injected into agent prompts and guides the agent to use external tools (`gh issue create`, MCP servers, APIs). The `scripts/` directory exists but is not directly executed. It's the same skill directory; the platform simply can't `import()` the code half. However, VS Code Copilot Chat can follow SKILL.md instructions to invoke CLI commands if a terminal is available.

The platform execution boundary is structural and inherent. Squad can't run code on platforms it doesn't own. The skill format acknowledges this by packaging both layers — instructions and code — in one directory. Platforms activate what they can.

---

## 12. CLI Commands

### Configuration Commands

The existing `squad config` commands work with skill paths:

```
squad config get <key>           Read a config value (dot-notation)
squad config set <key> <value>   Write a config value
squad config unset <key>         Remove a config value
squad config list                Show all config
```

Setting a skill backend:

```bash
# Point tasks at a skill directory
squad config set tracking.tasks.skill .squad/skills/github-issues
squad config set tracking.tasks.repo owner/repo

# Read back
squad config get tracking.tasks
# → { "skill": ".squad/skills/github-issues", "repo": "owner/repo" }

# Add labels config
squad config set tracking.tasks.labels '["squad-task","backend"]'

# Reset to markdown default
squad config unset tracking.tasks
```

### Doctor (Extended)

`squad doctor` validates skill directories when configured:

```
$ squad doctor

  ✅  .squad/ directory exists
  ✅  config.json valid
  ✅  tracking.tasks — .squad/skills/github-issues
       ✅  scripts/ directory found
       ✅  create_issue.js — valid handler export
       ✅  update_issue.js — valid handler export
       ✅  list_issues.js — valid handler export
       ✅  close_issue.js — valid handler export
       ✅  lifecycle.js — init/dispose exports found
  ✅  tracking.decisions — markdown (default)
  ✅  tracking.memories — markdown (default)
  ✅  tracking.logging — markdown (default)
```

Doctor validates five things per configured skill:

1. **Skill directory exists** — The path in `tracking.{concern}.skill` resolves to a real directory.
2. **`scripts/` subdirectory exists** — The skill has a scripts folder.
3. **Expected script files exist** — For each tool name in `CONCERN_TOOL_MAP[concern]`, the corresponding `.js` file is checked.
4. **Each script exports a default function** — The file is imported and `typeof mod.default === 'function'` is verified.
5. **`lifecycle.js` exports `init`/`dispose`** — If `lifecycle.js` exists, its named exports are validated. Missing `lifecycle.js` is fine; a `lifecycle.js` that exports non-functions is flagged.

Example failure output:

```
$ squad doctor

  ✅  .squad/ directory exists
  ✅  config.json valid
  ⚠️  tracking.tasks — .squad/skills/github-issues
       ✅  scripts/ directory found
       ✅  create_issue.js — valid handler export
       ❌  update_issue.js — missing
       ✅  list_issues.js — valid handler export
       ❌  close_issue.js — does not export a default function
       ✅  lifecycle.js — init/dispose exports found
  ✅  tracking.decisions — markdown (default)
```

Missing scripts are warnings (⚠️), not errors — a skill doesn't need to handle every tool in a concern. Invalid exports (file exists but doesn't export a function) are errors (❌).

---

## 13. Error Handling

### Graceful Shutdown

Skill lifecycle cleanup integrates into the existing CLI shutdown flow (see §9 Signal Handling). The CLI's per-command signal handlers (start.ts, aspire.ts, shell/index.ts) call `disposeAll()` as part of their teardown sequence — skill lifecycles do not register their own `process.on('SIGINT')` handlers.

```typescript
// In the existing CLI teardown (e.g., shell/index.ts):
// 1. Existing cleanup (session close, temp files, etc.)
// 2. await disposeAll(initialized);  // 10s timeout per lifecycle
// 3. process.exit(0);
```

The re-entrancy guard prevents double-dispose on rapid Ctrl+C, and the 10-second timeout prevents hung backends from blocking process exit. See §9 for the full `disposeAll` implementation with per-lifecycle timeouts and error collection.

**Implementation note:** The existing signal handlers in `start.ts`, `aspire.ts`, and `shell/index.ts` use synchronous `process.on('SIGINT', ...)` callbacks. `disposeAll()` is async (it awaits `dispose()` on each lifecycle). The signal handler must be refactored to support async teardown — e.g., by setting a "shutting down" flag, calling `disposeAll().then(() => process.exit(0))`, and preventing new tool dispatch during shutdown. This is a prerequisite for skill lifecycle integration.

### Skill Not Found (Startup)

When a configured skill directory doesn't exist or has no scripts:

```
⚠️  tracking.tasks: .squad/skills/github-issues not found — using markdown fallback
```

Session starts normally. The concern falls back to markdown handlers. No crash. Existing data in `.squad/tasks/` continues to work.

### Invalid Skill (Startup)

When a script file exists but has a bad export:

```
⚠️  tracking.tasks: .squad/skills/github-issues/scripts/create_issue.js does not export a default function — using markdown fallback
```

Validation happens at load time, not at first tool call. If a skill directory is configured and its scripts exist, they're imported and validated during startup. Bad exports are caught early — before any agent session begins.

**Frontmatter validation ownership:** SKILL.md frontmatter validation (spec-required fields `name` and `description`, plus Squad metadata fields `squad-domain` and `squad-concerns` for backend skills) is performed by `squad doctor` and `validateSkill()`. The `SkillScriptLoader` does NOT validate frontmatter — it only validates script exports. This separation keeps the loader fast (no markdown parsing) and puts comprehensive validation in the diagnostic tool where users expect it. See the [agentskills.io specification](https://agentskills.io/specification#metadata-field) for the `metadata` field contract.

### Handler Failure (Runtime)

When a handler throws or returns an error during a tool call:

```
Agent: squad_create_issue({ title: "Fix login" })
  → Handler throws: Error: gh: command not found
  → Result: { textResultForLlm: "Failed to create issue: gh: command not found", resultType: "failure" }
  → Agent sees the error and reports it
```

No runtime fallback to markdown. If a skill handler is loaded, it owns the operation for the session. Errors are returned to the agent as tool results with `resultType: "failure"`. The agent can report the error, retry, or take alternative action.

### Lifecycle Init Failure

When a skill's `init()` throws:

```
⚠️  Skill init failed: ECONNREFUSED 127.0.0.1:5432 — rolling back
```

The startup sequence rolls back: every lifecycle that was pushed to `initialized` gets its `dispose()` called — including the one that failed. Unlike the previous design which removed the failed lifecycle from the list, this version keeps it because `init()` may have partially succeeded (opened a file handle, started a connection). The failed lifecycle's `dispose()` runs best-effort to clean up any partial state. See §9 for the rollback implementation.

### Error Message Convention

All error messages reference skill paths, not package names:

| Context             | Message format                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| Missing skill       | `tracking.{concern}: {path} not found — using markdown fallback`                                            |
| Missing scripts dir | `tracking.{concern}: {path}/scripts/ not found — using markdown fallback`                                   |
| Bad export          | `tracking.{concern}: {path}/scripts/{file}.js does not export a default function — using markdown fallback` |
| Init failure        | `Skill init failed: {error} — rolling back`                                                                 |
| Dispose failure     | `{n} skill(s) failed during dispose: {messages}`                                                            |
| Dispose timeout     | `dispose() timed out after 10000ms: {path}`                                                                 |

---

## 14. Skill Authoring Guide

### Default Backend: Markdown

With no `tracking` config, Squad uses the built-in markdown backend. Every tool operates on `.squad/` markdown files — decisions go to `decisions/inbox/`, memories to `agents/{name}/history.md`, logs to `log/` and `orchestration-log/`. This is the zero-config baseline and the reference implementation for how backends behave.

The markdown backend is not a skill directory — it's compiled into Squad. Backend skills exist to replace it for specific concerns.

### Development Workflow

1. Create the skill directory: `mkdir -p .squad/skills/{name}/{src,scripts}`
2. Install the SDK: `npm install -D @bradygaster/squad-sdk`
3. Write handlers in TypeScript using SDK types.
4. Compile to JavaScript (`tsc` or `esbuild` — see below).
5. Validate with `squad doctor`.
6. Commit both `src/` and `scripts/`.

### SDK as Authoring Toolkit

The SDK provides `defineHandler<T>()` and typed argument interfaces for compile-time safety. It's a devDependency — emitted `.js` files have no runtime dependency on the SDK. `defineHandler` is an identity function at runtime.

```typescript
import { defineHandler } from "@bradygaster/squad-sdk";
import type { CreateIssueArgs } from "@bradygaster/squad-sdk";

export default defineHandler<CreateIssueArgs>(async (args, config) => {
  // args is typed, config is Record<string, unknown>
  return { textResultForLlm: `Created: ${args.title}`, resultType: "success" };
});
```

The SDK also exports `validateSkill()` for use in tests or build scripts — same checks as `squad doctor`.

See §8 for the full SDK exports table.

### Toolchains

Squad doesn't ship a build command. Use standard TypeScript toolchains:

```bash
# tsc
npx tsc --outDir .squad/skills/{name}/scripts/ --rootDir .squad/skills/{name}/src/

# esbuild (one-liner)
npx esbuild .squad/skills/{name}/src/*.ts --outdir=.squad/skills/{name}/scripts/ --format=esm --platform=node
```

### Example: GitHub Issues Skill

A condensed example showing how a backend skill replaces the markdown default for task tracking. This illustrates the key patterns: directory structure, one handler, lifecycle, and config.

**Directory structure:**

```
.squad/skills/github-issues/
├── SKILL.md
├── scripts/
│   ├── lifecycle.js
│   ├── create_issue.js
│   ├── list_issues.js
│   ├── close_issue.js
│   └── update_issue.js
└── src/                  # TypeScript source (compiled → scripts/)
    └── ...
```

**One handler** (`scripts/create_issue.js`):

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export default async function (args, config) {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "issue",
      "create",
      "--repo",
      config.repo,
      "--title",
      args.title,
      "--body",
      args.body ?? "",
      "--label",
      (config.labels ?? ["squad-task"]).join(","),
    ],
    { encoding: "utf-8", timeout: 30_000 },
    // ⚠️ Only pass known, validated arguments to external processes.
    // Do NOT spread or forward unknown keys from `args` — the [key: string]: unknown
    // index signature allows agents to pass arbitrary fields, but those must not be
    // forwarded to CLI commands or APIs without explicit allowlisting.
  );

  return { textResultForLlm: stdout.trim(), resultType: "success" };
}
```

All other handlers follow the same pattern: receive `(args, config)`, call `gh` CLI with only the args fields they explicitly destructure, and return `SquadToolResult`.

**Security note — subprocess timeouts are required, not optional.** Every `execFile` call in a handler script **must** include a `timeout` option. Without it, a hung subprocess (network timeout, unresponsive API, stalled pipe) blocks the handler indefinitely — and since handlers run in Squad's main process, this blocks all tool dispatch for the session. The 30-second timeout shown above is a recommended starting point; adjust based on the expected operation latency. This is a contract requirement, not a convention — `squad doctor` should warn if handler scripts call `execFile`/`exec` without a timeout.

**Security note — do not forward unknown argument keys.** Handler scripts receive `args` with a `[key: string]: unknown` index signature. This allows agents to pass skill-documented extension fields. However, handlers **must not** spread `args` into CLI command construction, URL parameters, SQL queries, or API request bodies. Always destructure the specific fields you expect (`const { title, body } = args`) and ignore the rest. Forwarding unknown keys creates an injection surface — an agent (or a prompt injection) could add unexpected fields that alter external API behavior.

**Lifecycle** (`scripts/lifecycle.js`):

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export async function init(config) {
  // Verify gh CLI is authenticated
  await execFileAsync("gh", ["auth", "status"], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  // Verify repo is accessible
  if (!config.repo) throw new Error("tracking.tasks.repo is required.");
  await execFileAsync("gh", ["repo", "view", config.repo, "--json", "name"], {
    encoding: "utf-8",
    timeout: 10_000,
  });
}

export async function dispose() {
  // No resources to clean up for a CLI-based skill
}
```

**Config** (`.squad/config.json`):

```json
{
  "tracking": {
    "tasks": {
      "skill": ".squad/skills/github-issues",
      "repo": "owner/repo",
      "labels": ["squad-task"]
    }
  }
}
```

Validate with `squad doctor`.

### Multi-Concern Skills

A skill can handle multiple concerns (e.g., tasks + decisions) by including scripts for each. The config maps each concern to the same skill directory with its own config:

```json
{
  "tracking": {
    "tasks": {
      "skill": ".squad/skills/my-backend",
      "connectionString": "${TASKS_DB_URL}"
    },
    "decisions": {
      "skill": ".squad/skills/my-backend",
      "connectionString": "${DECISIONS_DB_URL}"
    }
  }
}
```

Each concern gets its own lifecycle — `init()` and `dispose()` are called once per concern, not once per skill directory. This is intentional: even though both concerns reference the same skill here, they could have different config values (e.g., separate databases). Deduplicating by skill path alone would silently drop the second config. If configs happen to match, `init()` must be idempotent — see §7 Lifecycle Convention for details on why module-level singletons in `lifecycle.js` don't reliably achieve this and how to use the `scripts/lib/` pattern instead.

---

## 15. Sharing & Distribution

Skills are self-contained directories. No package registry, no lock files, no dependency resolution. This makes them shareable through any mechanism that moves files.

### Git (Primary)

Commit the skill directory to your repository. Other projects can adopt it by:

- **Fork/clone:** Fork the repo, cherry-pick the skill directory, or clone and copy.
- **Git submodules:** Add a shared skills repo as a submodule at `.squad/skills/shared-skill`:

```bash
git submodule add https://github.com/org/squad-skills.git .squad/skills/github-issues
```

Teams maintaining a library of skills can publish them in a dedicated repo and submodule them into projects.

### Copy

Skills are directories. `cp -r` works:

```bash
cp -r /path/to/other-project/.squad/skills/github-issues .squad/skills/github-issues
```

No metadata, no registry entries, no linking. The skill is fully self-contained.

### Skill Marketplace

The existing `squad plugin marketplace` system can list and distribute backend skills. The marketplace already handles skill directories — backend skills are just skills that happen to include a `scripts/` folder. No marketplace changes needed.

```bash
squad plugin marketplace browse    # Lists available skills, including backend skills
squad plugin marketplace add <id>  # Downloads skill directory into .squad/skills/
```

### npm Packages (v2 Consideration)

For v1, skills are **not** npm packages. They're directories with `.js` files.

For v2, an npm-based distribution model could work: a package's `postinstall` script copies skill files into `.squad/skills/`. This preserves the skill-directory model while adding version management:

```json
{
  "name": "squad-skill-github-issues",
  "scripts": {
    "postinstall": "node install.js"
  }
}
```

Where `install.js` copies the skill directory into the consuming project's `.squad/skills/`. This is a distribution concern — the skill format and loading mechanism are unchanged.

### Personal Squad

Developers with a personal squad (`squad init --global`) get skill sharing for free. Backend skills authored in `~/.squad/skills/` are available in every connected project — no copying, no submodules, no marketplace.

```bash
# Author a skill once in the personal squad
mkdir -p ~/.squad/skills/github-issues/scripts
# ... write handlers, compile to scripts/ ...

# Every connected project inherits it
cd ~/projects/my-api
squad init          # config.json → teamRoot: ~/.squad/
squad config set tracking.tasks.skill .squad/skills/github-issues
squad config set tracking.tasks.repo owner/my-api
```

The skill lives in one place. Each project configures its own backend-specific options (repo, labels, connection strings) via the tracking config — the handlers are shared, the config is per-project.

This also works with consult mode. When consulting on a project you don't own, `squad consult` copies your personal squad into an isolated `.squad/` — including your backend skills. You get your preferred workflows in any codebase without modifying the project's committed files.

### What Works Today

| Method         | How                                        | Best for                                 |
| -------------- | ------------------------------------------ | ---------------------------------------- |
| Git commit     | Check in `.squad/skills/{name}/`           | Single-project skills                    |
| Copy           | `cp -r` between projects                   | Quick sharing, one-off adoption          |
| Git submodule  | Submodule a skills repo                    | Shared skills across multiple repos      |
| Personal squad | Author in `~/.squad/skills/`               | Developer-portable, cross-project skills |
| Marketplace    | `squad plugin marketplace add`             | Community-published skills               |
| Template repo  | GitHub template with pre-configured skills | Team onboarding                          |

The skill model doesn't block any of these. Skills are files. Files are shareable.

---

## 16. Open Questions

### Backend config validation

Skills' config is untyped JSON. The `defineHandler<T>()` wrapper provides type safety at authoring time, but `.squad/config.json` has no schema enforcement. A user can write `{ "skill": ".squad/skills/github-issues", "repo": 42 }` and the type error surfaces only when the handler runs.

Consider for v2: skills could export a JSON Schema in SKILL.md frontmatter (a `configSchema` key), enabling `squad config set` and `squad doctor` to validate config values at write time.

### npm package resolution (v2)

Should the config format eventually support `{ "package": "squad-backend-github-issues" }` alongside `{ "skill": ".squad/skills/..." }`? A hybrid model where skills are the primary mechanism but npm packages are an alternative distribution channel. The `BackendRef` discriminated union is designed to accommodate this — `skill` and `package` keys are mutually exclusive discriminants.

Decision: not for v1, but the config type leaves room for it.

### Skill marketplace trust for executable skills

Regular marketplace skills are SKILL.md markdown — low trust surface. A bad SKILL.md can give an agent wrong instructions, but it can't execute code. Backend skills include executable JavaScript in `scripts/`. A malicious skill could run arbitrary code when `import()`ed at startup.

The trust boundary changes with executable skills, but the practical threat model is narrow. On any platform where an agent has terminal access (@copilot, CLI), the agent can already run `node scripts/create_issue.js` directly — sandboxing the `import()` path in Squad's process doesn't close that door. Worker-thread isolation with restricted `node:` APIs is hard to implement correctly and adds serialization overhead to every handler call, for a guard that only protects one execution path.

The real trust model for v1 is **"you committed it to your repo."** If a skill is in your `.squad/skills/` directory and checked into git, you've already reviewed and accepted it — same as any other code in the repo. This is the same trust model as Husky hooks, GitHub Actions composite actions, and ESLint configs.

For v2, when skills are downloaded from external sources via the marketplace, consider:

- **Verification:** Marketplace could require code review or signing for skills with `scripts/`.
- **Audit trail:** `squad doctor` could display a content hash of each script file so users can verify integrity after download.

Sandboxing is not planned. The agent execution environment is the trust boundary, not Squad's import mechanism.

### Lazy loading

Should handlers be loaded on first tool call rather than eagerly at startup? The current model imports all scripts for all configured concerns at startup — up to 11 module loads for a fully-configured skill.

Lazy loading would defer `import()` until the tool is first called:

```typescript
// Eager (current): import all at startup
const handler = await import(scriptPath);

// Lazy (proposed): import on first call, cache the module
let cached: SkillHandler | null = null;
const lazyHandler: SkillHandler = async (args) => {
  cached ??= (await import(scriptPath)).default;
  return cached(args);
};
```

Benefits: reduced cold start cost (only load what's actually used). Module cache ensures subsequent calls pay no import penalty.

Trade-off: first tool call has import latency, and validation moves from startup to runtime — a bad export isn't caught by `squad doctor` until the tool is invoked.

Consider for v1 based on benchmarks. If eager loading adds >200ms to startup (measured via `--perf-basic-prof` or `console.time` around the import loop), lazy loading is worth the trade-off. If startup stays under 200ms with all 11 imports, eager loading with early validation is simpler and safer. The 200ms threshold reflects the point where users perceive "sluggish" CLI response — below that, the import cost is invisible.

### Resolved in this design

The following questions were originally open but have been addressed:

- **SquadToolResult shape:** Skill handlers return `SquadToolResultObject` (§7) which includes `error?: string` — optional on all result types. Best practice: always populate `error` when `resultType` is `"failure"` so agents can report actionable diagnostics, but the type system does not enforce this — `error` remains optional per the existing `adapter/types.ts` contract.
- **Argument types:** All 11 `*Args` interfaces defined with common required fields + `[key: string]: unknown` for skill-documented extensions. See §8.
- **Config secrets:** Environment variable expansion (`${VAR}`) supported in config values. Secrets never stored in plaintext. See §6.
- **Collision order:** Project-local skill → personal squad skill → built-in markdown. No cross-source merging. See §6.
- **Module cache aliasing:** Paths normalized to forward slashes before `pathToFileURL()`. See §9.
- **Dispose timer leaks:** Timer handles cleared in `finally` block. Configurable timeout via `disposeTimeoutMs`. See §9.
- **concernForPath() undefined:** Eliminated — concern + config stored alongside lifecycle entry at load time. See §9.
- **Multi-concern lifecycle:** Each concern gets its own lifecycle init/dispose — no dedup by skill path. Prevents silent config mismatch when same skill has different configs per concern. See §9.
- **Rollback semantics:** Failed lifecycles stay in `initialized` list — `dispose()` runs for partial init cleanup. See §9.
- **ESM module cache:** Script changes require restarting the Squad shell. ESM modules are cached for the process lifetime — there is no `delete require.cache[key]` equivalent for ESM.
- **Hook pipeline:** Skill handlers flow through the existing `HookPipeline` — see §10 "HookPipeline Integration (Prerequisite)" for full specification. This is a prerequisite, not optional.
- **Marketplace security:** Backend skills with `squad-domain: backend` trigger the existing security rules from `marketplace/security.ts` (prompt injection patterns, PII detection, overly broad permissions).
