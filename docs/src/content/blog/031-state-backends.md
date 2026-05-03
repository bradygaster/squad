---
title: "State Backends — Keep Your PRs Clean"
date: 2026-04-20
author: "Tamir"
tags: [squad, state-backends, git-notes, orphan-branch, two-layer, architecture]
status: draft
hero: "Squad now supports 4 state backends that keep .squad/ files out of your PRs. Choose local, orphan branch, or the two-layer architecture from the blog."
---

# State Backends — Keep Your PRs Clean

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _Squad now supports 4 state backends. Your PRs stay clean — just code._

## The Problem

Every time an agent makes a decision, writes to history, or logs a session, those changes end up as `.squad/` file modifications in your working branch. Open a PR and your reviewer sees 57 code changes buried under 40 decision logs, agent history entries, and session files.

Two completely different workflows sharing one branch:
- **Code** → slow, human-gated, needs review approval
- **Squad state** → fast, autonomous, no human ever needs to review it

## The Fix

PR #1004 adds state backend support. One line in your config, and all mutable state goes somewhere else.

```bash
# The fastest path to clean PRs:
squad init --state-backend two-layer
```

## Four Options

| Backend | Where state goes | PRs clean? | Setup |
|---------|-----------------|------------|-------|
| `local` | Working branch (default) | ❌ | Zero config |
| `orphan` | `squad-state` branch | ✅ | Config + branch |
| `two-layer` | Notes + orphan combined | ✅ | `--state-backend two-layer` |

## The Two-Layer Architecture

The `two-layer` option implements the architecture from [Tamir's blog post](https://www.tamirdresher.com/blog/2026/03/23/scaling-ai-part7b-git-notes):

- **Layer 1 (git notes):** Thin commit-scoped "why" annotations. Invisible in PR diffs. Attached to specific commits.
- **Layer 2 (orphan branch):** Permanent state store. Decisions, histories, logs. The team's full diary.
- **Ralph bridges the layers:** After a PR merges, Ralph promotes notes with `promote_to_permanent: true` to the orphan branch. Notes on rejected PRs are silently ignored.

This handles the three scenarios from the blog correctly:
1. **Rejected feature** — decision on a rejected PR is NOT promoted ✅
2. **Universal truth** — routing change flagged with `promote_to_permanent` survives ✅
3. **Valuable failure** — research flagged with `archive_on_close` is preserved ✅

## How It Works (Under the Hood)

The Squad coordinator (`squad.agent.md`) detects `stateBackend` from `.squad/config.json` at session start and adapts every agent spawn prompt:

- **Agents** receive backend-specific instructions for reading and writing state
- **Scribe** receives backend-specific commit targets (orphan branch, note refs, or working branch)
- **State Leak Guard** catches if an agent accidentally stages state files on the working branch

Static config (charters, team.md, routing.md) always stays on disk. Only mutable state (decisions, history, logs) moves to the configured backend.

## Quick Start

```bash
# New project — set backend at init time
squad init --state-backend two-layer

# Existing project — migrate with one config change
# Edit .squad/config.json → add "stateBackend": "git-notes"
git add .squad/config.json && git commit -m "config: use git-notes"
```

For the full migration guide and troubleshooting, see the [State Backends feature docs](/docs/features/state-backends/).

## Tested With Real Squads

We ran 12 E2E tests with real squad sessions — real team casting (Usual Suspects, Firefly universes), real agent spawns, real decisions recorded. All evidence is in [PR #1004](https://github.com/bradygaster/squad/pull/1004).

Key proof:
- Git notes with `promote_to_permanent: true` written by agents ✅
- Orphan branch receives state commits from Scribe ✅  
- Feature branch PRs show ONLY code changes, zero `.squad/` state ✅
- State persists across branch switches ✅

## Try It

Build from the PR branch:

```bash
git clone https://github.com/bradygaster/squad.git
cd squad && git checkout feat/state-backend-global-996
npm install && npm run build
```

Then init any repo with your preferred backend:

```bash
node <path>/packages/squad-cli/dist/cli-entry.js init --state-backend two-layer
```

We'd love feedback — especially on whether the init flow feels right and whether state actually persists across branch switches in your environment.
