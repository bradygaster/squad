# Memory System


**Try this to query team decisions:**
```
What decisions has the team made about testing strategy?
```

**Try this to establish a new rule:**
```
Always use single quotes in TypeScript
```

**Try this to check agent knowledge:**
```
What does Kane remember about the authentication system?
```

Squad remembers the durable things that help future work — decisions, conventions,
architecture patterns, and individual agent learnings. It should not retain secrets, raw
logs, transient CI/PR status, or other data that is unsafe or too short-lived to become
memory.

---

## Memory Layers

Squad's memory is layered. Each layer serves a different purpose, and knowledge grows with every session.

By default, Squad memory is local worktree memory stored in `.squad/` files. Future
provider work keeps that local model as the default while adding a governance layer for
classification, safety, and optional semantic durable memory such as Copilot Memory.
External semantic memory is opt-in; it is not required for `squad init` or Copilot custom
agents using the prompt-only `.squad/` fallback.

`squad init` and `squad upgrade` scaffold a local-only governance policy at
`.squad/memory/config.json`. The default provider is `local`, Copilot Memory is disabled,
and audit records are written to `.squad/memory/audit.jsonl` without storing memory content.

Tool-backed runtimes can use governed operations:

```text
memory.classify
memory.write
memory.search
memory.promote
memory.delete
memory.audit
```

Governed memory records include load-guidance metadata so prompts and providers can choose
what to load without weakening safety gates:

| Tag | Meaning |
| --- | --- |
| `[ALWAYS]` | Durable policies and decisions that should be loaded eagerly. |
| `[ON-DEMAND]` | Stable local or semantic facts retrieved when relevant to a query. |
| `[ARCHIVE]` | Superseded/deleted entries and tombstones kept for audit/history, not active prompt loading. |
| `[NEVER]` | Forbidden or transient content that must not be persisted or loaded. |

When an entry is promoted or superseded, the previous index entry is marked `[ARCHIVE]`
and records `supersededBy` so tooling can follow the forward link to the active successor.

The CLI exposes the same local bridge:

```bash
squad memory classify "Always run tests before merge"
squad memory write --content "Use Vitest for SDK regression tests" --class DECISION --author scribe
squad memory search --query "Vitest"
squad memory audit
squad memory provider
```

Use `--log-level none|error|info|debug` (or `--verbose`) when troubleshooting memory
command activity. For persistent project-level diagnostics, set the same level in
`.squad/config.json`:

```json
{
  "memory": {
    "logLevel": "info"
  }
}
```

Precedence is: explicit CLI switch, then `SQUAD_MEMORY_LOG_LEVEL`, then
`.squad/config.json` `memory.logLevel`, then the default `none`. Diagnostics are written
to stderr and include safe metadata such as the command, provider, load-guidance, path,
result counts, and timing. They do not print raw memory content or search text.

Prompt-only Copilot custom agents still fall back to direct `.squad/` file edits. That
fallback is intentionally local: it does not claim provider-backed semantic memory,
external indexing, policy enforcement, or remote deletion unless a CLI/MCP/tool bridge is
installed and used.

Real `provider=copilot` support is unavailable unless a concrete callable Copilot Memory API
exists in the installed SDK/tooling. Squad does not invent endpoints or fake a remote memory
service. The only current bridge is explicitly named `hostInjectedCopilotAdapter`; it is
opt-in and only works when a host supplies a client. Otherwise provider-backed writes fail
closed after auditing the rejected attempt. Forbidden content is classified and rejected
before any provider call.

The installed Copilot SDK/CLI currently exposes memory as an agent capability/permission
concept, not as a documented SDK storage client for write/search/delete. Config files may
contain `defaultProvider: "copilot"` for forward compatibility, but status reports it as
configured and unavailable, and governed reads/writes fail closed until a real callable API
exists.

---

## Personal Memory: `history.md`

Each agent has its own history file at `.squad/agents/{name}/history.md`. After every session, agents append what they learned — architecture decisions, conventions, file paths, user preferences.

**Only that agent reads its own history.** This means each team member builds specialized knowledge about their domain.

After a few sessions, agents stop asking questions they've already answered.

### Progressive summarization

Histories grow over time. When an agent's `history.md` exceeds ~12KB, older entries are archived into a summary section. Recent entries stay detailed; older entries are condensed. This keeps the file within a useful context budget without losing accumulated knowledge.

---

## Shared Memory: `decisions.md`

Team-wide decisions live in `.squad/decisions.md`. **Every agent reads this before working.** This is the team's shared brain.

Decisions are captured three ways:

### 1. From agent work

When an agent makes a decision during a task, it writes to the inbox:

```
.squad/decisions/inbox/{agent-name}-{slug}.md
```

### 2. From user directives

When you say "always..." or "never...", it's captured as a directive:

```
> Always use single quotes in TypeScript
> Never use inline styles
> Prefer named exports over default exports
```

These go directly into `decisions.md`.

### 3. Scribe merges

The Scribe agent (a silent team member) periodically:

1. Reads all entries from `.squad/decisions/inbox/`
2. Merges them into the canonical `decisions.md`
3. Deduplicates overlapping decisions
4. Propagates updates to affected agents

### Decision archiving

As your project grows, `decisions.md` accumulates hundreds of blocks. Stale sprint artifacts, completed analysis docs, and one-time planning fragments consume context window space without adding value. When this happens, old decisions are archived to `.squad/decisions-archive.md` — preserved for reference but no longer loaded into agent context.

Active decisions (ongoing policies, user preferences, current architecture) stay in `decisions.md`. Agents always read the lean, current shared brain.

---

## Skills

Reusable knowledge files at `.copilot/skills/{skill-name}/SKILL.md`. See [Skills System](skills.md) for details.

Skills differ from decisions — decisions are project policies ("use PostgreSQL"), while skills are transferable techniques ("how to set up CI with GitHub Actions").

---

## How Memory Compounds

| Stage | What agents know |
|-------|-----------------|
| 🌱 First session | Project description, tech stack, your name |
| 🌿 After a few sessions | Conventions, component patterns, API design, test strategies |
| 🌳 Mature project | Full architecture, tech debt map, regression patterns, performance conventions |

---

## Memory Architecture

```
.squad/
├── decisions.md                          # Shared — all agents read this
├── decisions/inbox/                      # Drop-box for parallel writes
│   ├── kane-api-versioning.md
│   └── dallas-component-structure.md
├── agents/
│   ├── kane/
│   │   └── history.md                    # Kane's personal memory
│   ├── dallas/
│   │   └── history.md                    # Dallas's personal memory
│   └── lambert/
│       └── history.md                    # Lambert's personal memory
└── skills/
    ├── squad-conventions/SKILL.md        # Starter skill
    └── ci-github-actions/SKILL.md        # Earned skill
```

---

## Tips

- **Commit intentional `.squad/` state** — anyone who clones the repo gets the team with
  its accumulated decisions and skills. Never store secrets, credentials, raw logs, or
  private customer data in Squad memory.
- Directives ("always...", "never...") are the fastest way to shape team behavior. Use them liberally.
- If an agent keeps making the same mistake, check `decisions.md` — the relevant convention might be missing.
- You can edit `decisions.md` and `history.md` files directly. They're plain Markdown.
- The first session is always the least capable. Give the team a few sessions to build up context.

## Sample Prompts

```
what does Kane remember about the authentication system?
```

Queries a specific agent's personal history for relevant context.

```
show me the team decisions about API design
```

Searches the shared decisions.md file for a particular topic.

```
what happened in the last session?
```

Reviews session history and recent agent learnings.

```
always use single quotes in TypeScript
```

Adds a directive to the shared decisions that all agents will follow.

```
search past decisions for database choices
```

Finds historical decisions related to a specific topic or keyword.
