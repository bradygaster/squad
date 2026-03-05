---
title: "Workstreams — Scaling Squad Across Multiple Codespaces"
date: 2026-03-05
author: "Tamir Dresher (Community Contributor)"
wave: null
tags: [squad, workstreams, scaling, codespaces, horizontal-scaling, multi-instance, community]
status: draft
hero: "Squad Workstreams lets you partition a repo's work across multiple Codespaces — each running its own scoped Squad instance. One repo, multiple AI teams, zero conflicts."
---

# Workstreams — Scaling Squad Across Multiple Codespaces

> Blog post #23 — A community contribution: horizontal scaling for Squad.

## The Problem We Hit

We were building a multiplayer Tetris game with Squad. One team, 30 issues — UI, backend, cloud infra. Squad handled it fine at first, but as the issue count grew, a single Squad instance became a bottleneck. Agents stepped on each other in shared packages, there was no workflow enforcement, and we had no way to scope each Codespace to its slice of work.

So we built Workstreams.

## What Are Workstreams?

Workstreams partition your repo's issues into labeled subsets. Each Codespace (or machine) runs one workstream, scoped to matching issues only.

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
│  the active workstream's label.                 │
└─────────────────────────────────────────────────┘
```

## How It Works

**1. Define workstreams** in `.squad/workstreams.json`:

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

**2. Activate a workstream:**

```bash
# Via environment variable (ideal for Codespaces)
export SQUAD_TEAM=bridge

# Or via CLI (local machines)
squad workstreams activate bridge
```

**3. Run Squad normally.** Ralph will only pick up issues labeled `team:bridge`. Agents enforce branch+PR workflow. `folderScope` guides where agents focus (advisory, not enforced — shared code is still accessible).

## The Tetris Experiment

We validated this with [tamirdresher/squad-tetris](https://github.com/tamirdresher/squad-tetris) — 3 Codespaces, 30 issues, Star Trek TNG crew names:

| Codespace | Workstream | Squad Members | Focus |
|-----------|-----------|---------------|-------|
| CS-1 | `ui` | Riker, Troi | React game board, animations |
| CS-2 | `backend` | Geordi, Worf | WebSocket server, game state |
| CS-3 | `cloud` | Picard, Crusher | Azure, CI/CD, deployment |

**Results:** 9 issues closed, 16 branches created, 6+ PRs merged, real code shipped across all three teams. We discovered that `folderScope` needs to be advisory (shared packages require cross-team access) and that workflow enforcement (`branch-per-issue`) is critical to prevent direct commits to main.

## CLI Commands

```bash
squad workstreams list       # Show all configured workstreams
squad workstreams status     # Activity per workstream (branches, PRs)
squad workstreams activate X # Activate a workstream for this machine
```

## Resolution Chain

Squad resolves the active workstream in priority order:

1. `SQUAD_TEAM` environment variable
2. `.squad-workstream` file (written by `activate`, gitignored)
3. Auto-select if exactly one workstream is defined
4. No workstream → single-squad mode (backward compatible)

## Key Design Decisions

- **folderScope is advisory** — agents prefer these directories but can modify shared code when needed
- **Workflow enforcement** — `branch-per-issue` means every issue gets a branch and PR, never direct commits to main
- **Backward compatible** — repos without `workstreams.json` work exactly as before
- **Single-machine testing** — use `squad workstreams activate` to switch workstreams sequentially without needing multiple Codespaces

## What's Next

We're looking at cross-workstream coordination — a central dashboard showing all workstreams' activity, conflict detection for shared files, and auto-merge coordination. See the [PRD](https://github.com/bradygaster/squad/issues/200) for the full roadmap.

Also: we haven't settled on the name yet! "Workstreams" is the working title, but we're considering alternatives like "Lanes", "Teams", or "Streams". If you have an opinion, let us know in the [discussion](https://github.com/bradygaster/squad/issues/200).

## Try It

```bash
# Install Squad
npm install -g @bradygaster/squad-cli

# Init in your repo
squad init

# Create workstreams.json and label your issues
# Then activate and go
squad workstreams activate frontend
squad start
```

Full docs: [Scaling with Workstreams](../scenarios/scaling-workstreams.md) | [Multi-Codespace Setup](../scenarios/multi-codespace.md) | [Workstreams PRD](../specs/streams-prd.md)
