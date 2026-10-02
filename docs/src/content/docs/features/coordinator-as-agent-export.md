---
title: Coordinator-as-Agent Export
description: Compile your squad's coordinator into a repo-native Copilot custom agent file with squad export agent.
---

# Coordinator-as-Agent Export

**Try this to generate a coordinator agent:**
```bash
squad export agent
```

**Try this for CI drift detection:**
```bash
squad export agent --check
```

**Try this for live development:**
```bash
squad export agent --watch
```

`squad export agent` compiles your `.squad/` state — team roster, routing rules, ceremony triggers, agent charters — into a single repository-native Copilot custom agent at `.github/agents/squad.md`. The generated file works across **every** Copilot surface (CLI, VS Code, GitHub Desktop, github.com) without requiring the Squad runtime installed.

This is the "ship Squad as a portable agent" path. Use it when you want collaborators or downstream repos to get the benefit of your squad's setup with **zero install** — they just check out the repo and the agent is available.

---

## When to use it

| Scenario | Use `squad export agent`? |
|----------|-----------------------|
| You want collaborators to use your team's coordinator without installing the CLI | ✅ Yes |
| You want a portable, version-controlled snapshot of your coordinator behavior | ✅ Yes |
| You want CI to enforce that `.github/agents/squad.md` stays in sync with `.squad/` | ✅ Yes — use `--check` |
| You need full Squad runtime features (Scribe, Ralph, MCP state tools, ceremonies) | ❌ No — install the CLI |
| You want to share state (decisions, history) not just coordinator behavior | ❌ No — use [`squad export`](/squad/docs/features/export-import/) (snapshot mode) |

The exported coordinator agent has access to the team's roster and routing logic but does NOT include the live Squad runtime. Sub-agents in the exported coordinator will be dispatched via Copilot's native `task` tool, not via Squad's full spawn machinery.

---

## Commands

### `squad export agent`

Generate or update `.github/agents/squad.md` from your current `.squad/` state:

```bash
$ squad export agent

🔧 Compiling coordinator agent...
   - Read team.md (8 members)
   - Read routing.md (24 work-type entries)
   - Read ceremonies.md (3 ceremonies)
   - Loaded 8 agent charters
   - Compiled prompt: 12,847 tokens (under 14k soft budget — full mode)
   - Wrote .github/agents/squad.md (38,294 bytes)

✓ Coordinator exported to .github/agents/squad.md
```

The output is a self-contained Copilot custom-agent file with proper YAML frontmatter and a compiled coordinator prompt. Anyone in the repo can now run `copilot --agent squad` and get the coordinator's behavior.

### `squad export agent --watch`

Re-export on every change to `.squad/`. Useful during active team development when you want the exported agent file to track your edits:

```bash
$ squad export agent --watch
👀 Watching .squad/ for changes...
✓ .github/agents/squad.md up to date

[edit .squad/routing.md]
🔄 .squad/routing.md changed — re-exporting...
✓ .github/agents/squad.md updated (38,401 bytes)
```

Press `Ctrl+C` to stop.

### `squad export agent --check`

Verify that `.github/agents/squad.md` is in sync with the current `.squad/` state. Exits with non-zero if drift is detected. Use this in CI to enforce "if you change `.squad/`, you must re-run `squad export agent`":

```bash
$ squad export agent --check

✓ .github/agents/squad.md is up to date

# Or, on drift:

✗ Drift detected:
   .squad/routing.md changed but .github/agents/squad.md not regenerated.
   Run 'squad export agent' to update.
exit 1
```

### `squad export agent --dry-run`

Preview what would be written without actually writing the file:

```bash
$ squad export agent --dry-run

🔍 DRY RUN — would write to .github/agents/squad.md:
   Size: 38,294 bytes
   Prompt tokens: ~12,847
   Mode: full
   Frontmatter:
     name: squad
     description: ...
   No changes made.
```

### `squad export agent --compact`

Force compact mode even if the prompt fits within the soft budget. Useful for keeping the generated file lean intentionally:

```bash
squad export agent --compact
```

Compact mode omits some optional sections (extended examples, on-demand reference pointers) and is the default when the prompt would otherwise exceed the soft token budget.

---

## Token budget modes

The exporter adapts automatically to your team size:

| Mode | Trigger | What's in the prompt |
|------|---------|---------------------|
| **Full** | ≤8 members AND prompt < 14k tokens | Full charters inlined, all routing tables, complete ceremony definitions |
| **Compact** | Prompt 14k–20k tokens OR `--compact` flag | Condensed charters, abbreviated examples, on-demand references |
| **Lazy-load** | >8 members OR roster > 3k tokens | Coordinator instructed to load charters on demand at dispatch time |
| **(fails)** | Prompt > 20k hard budget | Fails with diagnostics — suggests removing rarely-used members or splitting the squad |

These thresholds protect against generating a coordinator file that's too large for the LLM's context budget. If you hit the hard limit, the exporter prints actionable diagnostics:

```
✗ Coordinator prompt exceeds hard budget (22,841 / 20,000 tokens).
  Top contributors:
    - 8 large agent charters (avg 1,800 tokens each)
    - Routing table: 24 entries
  
  Suggestions:
    - Remove rarely-spawned members from .squad/team.md
    - Trim agent charter narrative sections (target: 1,500 tokens/charter)
    - Split into multiple squads (see Multiple Squads docs)
    - Use --compact to drop ~2k tokens
```

---

## Safety guarantees

The exporter is conservative about what it writes:

- **Won't overwrite user-owned agent files.** If `.github/agents/squad.md` exists and lacks the generated-file marker comment header, the export fails unless you pass `--force`.
- **Detects legacy `squad.agent.md` collisions.** The classic Squad CLI installation puts the coordinator at `.github/agents/squad.agent.md`. The export warns if both files would exist, and `squad init`/`squad upgrade` skip writing `squad.agent.md` when an exported `squad.md` is present.
- **Generated files are marked.** The output starts with `<!-- generated by squad export agent — do not edit -->` so the file is unambiguous.
- **`--check` mode never mutates.** Safe to run on every CI build.

---

## CI integration

The pattern most teams use:

```yaml
# .github/workflows/squad-drift-check.yml
name: Squad drift check
on:
  pull_request:
    paths: ['.squad/**', '.github/agents/squad.md']
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm install -g @bradygaster/squad-cli
      - run: squad export agent --check
```

If anyone changes `.squad/` without re-exporting, the PR fails CI with a clear message.

---

## What gets compiled into the exported agent

The exporter loads these sources from your `.squad/`:

| File | Used for |
|------|----------|
| `.squad/team.md` | Roster — agent names, roles, charter paths |
| `.squad/routing.md` | Work-type → agent and module-ownership mappings |
| `.squad/ceremonies.md` | Auto-trigger definitions for design review, retro, etc. |
| `.squad/config.json` | State backend selection, model preferences |
| `.squad/agents/{name}/charter.md` | Per-agent role definitions (inlined or referenced based on budget mode) |

These get rendered into the output as:

- **YAML frontmatter** — `name`, `description`, `model`, `tools` declarations
- **Coordinator prompt body** — dispatch rules, routing table, ceremony triggers, agent identities, response mode selection
- **On-demand reference markers** — pointers to charters in lazy-load mode

What's NOT compiled in:
- Decisions ledger (use snapshot export to share state)
- Agent histories (personal learnings, owner-only)
- Skills (live as separate files in `.copilot/skills/`)
- Casting state (registry, history)

---

## Architecture (for the curious)

The export pipeline lives at `packages/squad-sdk/src/repo-native/`:

1. **Context loader** — parses `.squad/` files into a typed IR
2. **Prompt compiler** — renders the coordinator prompt with budget enforcement
3. **Frontmatter renderer** — emits valid custom-agent YAML
4. **File writer** — handles safety checks and atomic write

You can use the SDK module directly if you want to embed coordinator export into your own tooling — see `@bradygaster/squad-sdk/repo-native`.

---

## See also

- [Export & Import](/squad/docs/features/export-import/) — full state snapshots (different from this)
- [Self Upgrade](/squad/docs/features/self-upgrade/) — keeping the CLI itself updated
- [Multiple Squads](/squad/docs/scenarios/multiple-squads/) — when one team gets too large
- [Team Setup](/squad/docs/features/team-setup/) — composing the team that gets exported
