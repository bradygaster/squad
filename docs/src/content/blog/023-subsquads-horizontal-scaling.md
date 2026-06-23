---
title: "SubSquads — Scaling Squad Across Multiple Codespaces"
date: 2026-03-05
author: "Tamir Dresher (Community Contributor)"
wave: null
tags: [squad, subsquads, scaling, codespaces, horizontal-scaling, multi-instance, community]
status: draft
hero: "Squad SubSquads lets you partition a repo's work across multiple Codespaces — each running its own scoped Squad instance. One repo, multiple augmented teams, zero conflicts."
---

# SubSquads — Scaling Squad Across Multiple Codespaces

> Blog post #23 — A community contribution: horizontal scaling for Squad.

## The Problem We Hit

We were building a multiplayer Tetris game with Squad. One team, 30 issues — UI, backend, cloud infra. Squad handled it fine at first, but as the issue count grew, a single Squad instance became a bottleneck. Agents stepped on each other in shared packages, there was no workflow enforcement, and we had no way to scope each Codespace to its slice of work.

So we built SubSquads.

## What Are SubSquads?

SubSquads partition your repo's issues into labeled subsets. Each Codespace (or machine) runs one SubSquad, scoped to matching issues only.

```
┌─────────────────────────────────────────────────┐
│  Repository: acme/starship                      │
│                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Codespace 1 │ │ Codespace 2 │ │ Codespace 3│ │
│  │ team:bridge │ │ team:engine │ │ team:ops   │ │
│  │ UI + API    │ │ Core engine │ │ Infra + CI │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
│                                                 │
│  Ralph only picks up issues matching            │
│  the active SubSquad's label.                   │
└─────────────────────────────────────────────────┘
```

## How It Works

**1. Define SubSquads** in `.squad/streams.json`:

```json
{
  "defaultWorkflow": "branch-per-issue",
  "workstreams": [
    {
      "name": "bridge",
      "labelFilter": "team:bridge",
      "folderScope": ["src/api", "src/ui"],
      "description": "Bridge crew — API and UI"
    },
    {
      "name": "engine",
      "labelFilter": "team:engine",
      "folderScope": ["src/core"],
      "description": "Engineering — core systems"
    }
  ]
}
```

**2. Activate a SubSquad:**

```bash
# Via environment variable (ideal for Codespaces)
export SQUAD_TEAM=bridge

# Or via CLI (local machines)
squad subsquads activate bridge
```

**3. Run Squad normally.** Ralph will only pick up issues labeled `team:bridge`. Agents enforce branch+PR workflow. `folderScope` guides where agents focus (advisory, not enforced — shared code is still accessible).

## The Tetris Experiment

We validated this with [tamirdresher/squad-tetris](https://github.com/tamirdresher/squad-tetris) — 3 Codespaces, 30 issues, Star Trek TNG crew names:

| Codespace | SubSquad | Squad Members | Focus |
|-----------|-----------|---------------|-------|
| CS-1 | `ui` | Riker, Troi | React game board, animations |
| CS-2 | `backend` | Geordi, Worf | WebSocket server, game state |
| CS-3 | `cloud` | Picard, Crusher | Azure, CI/CD, deployment |

**Results:** 9 issues closed, 16 branches created, 6+ PRs merged, real code shipped across all three teams. We discovered that `folderScope` needs to be advisory (shared packages require cross-team access) and that workflow enforcement (`branch-per-issue`) is critical to prevent direct commits to main.

## CLI Commands

```bash
squad subsquads list       # Show all configured SubSquads
squad subsquads status     # Activity per SubSquad (branches, PRs)
squad subsquads activate X # Activate a SubSquad for this machine
```

## Resolution Chain

Squad resolves the active SubSquad in priority order:

1. `SQUAD_TEAM` environment variable
2. `.squad-workstream` file (written by `activate`, gitignored)
3. Auto-select if exactly one SubSquad is defined
4. No SubSquad → single-squad mode (backward compatible)

## Key Design Decisions

- **folderScope is advisory** — agents prefer these directories but can modify shared code when needed
- **Workflow enforcement** — `branch-per-issue` means every issue gets a branch and PR, never direct commits to main
- **Backward compatible** — repos without `streams.json` work exactly as before
- **Single-machine testing** — use `squad subsquads activate` to switch SubSquads sequentially without needing multiple Codespaces

## What's Next

We're looking at cross-SubSquad coordination — a central dashboard showing all SubSquads' activity, conflict detection for shared files, and auto-merge coordination. See the [PRD](https://github.com/bradygaster/squad/issues/200) for the full roadmap.

The community decided on the name "SubSquads" — each partition is a SubSquad of the main Squad.

## Try It

```bash
# Install Squad
npm install -g @bradygaster/squad-cli

# Init in your repo
squad init

# Create streams.json and label your issues
# Then activate and go
squad subsquads activate frontend
squad start
```

Full docs: [Scaling with SubSquads](../scenarios/scaling-workstreams.md) | [Multi-Codespace Setup](../scenarios/multi-codespace.md) | [SubSquads PRD](https://github.com/bradygaster/squad/blob/main/docs/_internal/specs/streams-prd.md)
