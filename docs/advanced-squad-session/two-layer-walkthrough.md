# Two-Layer State — Concrete Walkthrough

A real trace of a single task: **"Update README.md with product description + welcome quote"** running through the full two-layer machinery. Captured 2026-06-08 from the squad-advanced-squad-session-slides repo.

This document is the reference for slides 26-28 (Pattern 2 / state section) in
the Advanced Squad Patterns deck.

---

## The branch topology

```
               ┌── git history (real branches) ───────────────────┐
               │                                                  │
               │                                                  │
      main:    ●─────●─────●─────●                                │
               e406  24bf  361d  22f8 ← main HEAD                 │
               (4 commits — static identity)                      │
                                 ╲                                │
                                  ╲ checkout -b                   │
                                   ╲                              │
                                    ●  ← feature/readme-…  HEAD   │
                                    08da75c                       │
                                    README.md (28 lines)          │
                                    ← this is your PR diff        │
                                                                  │
               └──────────────────────────────────────────────────┘

                      ┊ (no git relationship between these histories) ┊

               ┌── parallel state world (orphan + notes) ─────────┐
               │                                                  │
               │                                                  │
      squad-   ━━━━━━━━━━━━━━━━━━●─●─●─●─●─●─●  ← squad-state     │
      state:   (older sessions)   ╰─── 7 commits from THIS task   │
               (22 total commits)      (1 leela-2 + 6 Scribe)     │
                                                                  │
                                                                  │
      refs/    ━━━━━━━━━━━━━━━━━━●─●─●─●─●─●─●  ← refs/notes/squad│
      notes/   (older snapshots)  ╰─── 7 snapshot refreshes       │
      squad:                          (one after each ●)          │
                                     pinned to: main commit e406cf7│
                                                                  │
               └──────────────────────────────────────────────────┘
```

---

## Timeline (real timestamps)

| TIME | LAYER | EVENT |
|---|---|---|
| 15:32:49 | ⌨ user | "let's do README on a new branch" |
| 15:32:49 | 💭 coordinator | `git checkout -b feature/readme-product-description` |
| 15:33:?? | 🚀 spawn | `task(name=leela, model=haiku)` → leela-2 |
| 15:35:02 | 🌱 feature branch | ● `08da75c` + README.md (28 lines) — **this is your PR diff** |
| 15:35:18 | 💾 squad-state | ● `51b1966` + decisions/inbox/leela-readme-…md (22 lines: quote rationale) |
| 15:35:19 | 📎 notes ref | ● `4c546e7` refs/notes/squad refreshed |
| 15:36:45 | 💾 squad-state | ● `ed5d5c0` M decisions.md (merged 2 inbox entries) |
| 15:36:46 | 📎 notes ref | ● `bd13503` |
| 15:36:47 | 💾 squad-state | ● `58b61bd` D decisions/inbox/…copilot-directive… |
| 15:36:48 | 📎 notes ref | ● `4770522` |
| 15:36:50 | 💾 squad-state | ● `fe7cce0` D decisions/inbox/…leela-readme… |
| 15:36:50 | 📎 notes ref | ● `dd431bd` |
| 15:37:06 | 💾 squad-state | ● `2f8f05a` + orchestration-log/…-leela-2.md (37 lines) |
| 15:37:06 | 📎 notes ref | ● `facf9fb` |
| 15:37:08 | 💾 squad-state | ● `ba586a4` + log/…-readme-update.md |
| 15:37:08 | 📎 notes ref | ● `d8925a1` |
| 15:37:10 | 💾 squad-state | ● `8661e3a` M agents/leela/history.md |
| 15:37:11 | 📎 notes ref | ● `2f21e96` ← final snapshot of this work item |

---

## What landed where

### 🌱 The PR diff (feature branch — commit `08da75c`)

This is the **only thing a code reviewer sees**. Clean, single-file, reviewable:

```
$ git show 08da75c --stat
commit 08da75c
Author: Copilot
Date:   Mon Jun 8 15:35:02 2026

    Add product description and welcome quote to README

 README.md | 28 lines added
```

```markdown
# Sudoku

> "It is impossible to be a mathematician without being a poet." — Sofia Kovalevskaya

A Sudoku puzzle game that works on your phone and computer, so you can play a quick
round during your commute or settle in for a longer session at home. […]

## Platforms
- **PC** (Windows / macOS / Linux)
- **Android**

## Status
Early development — team just cast. […]

## Features (Planned)
- Three difficulty levels: Easy, Medium, Hard
- Undo / Redo support
- […]

---
*Created by the Futurama-themed dev team. […]*
```

### 💾 The team memory (squad-state — 7 commits)

What the reviewer never has to read, but the team can always recall:

**`51b1966`** — Leela-2's rationale (the why behind her choices):

```
+ decisions/inbox/leela-readme-2026-06-08T15-32-49.md
  - Quote rationale: Kovalevskaya combines logic with creative satisfaction,
    well-documented attribution, fits Sudoku's beauty-of-solving tone
  - Structure: 7 sections balancing welcome + scope grounding
```

**`ed5d5c0`** — Scribe merges 2 inbox entries into the team ledger:

```
M decisions.md  (now 5 active decisions, 3.2KB)
  + 2026-06-08T13:54:58: User directive (quote convention)
  + 2026-06-08T15:32:49: README structure + quote choice (Leela)
```

**`2f8f05a`** — Scribe's orchestration log entry (forensic record):

```
+ orchestration-log/2026-06-08T15-32-49Z-leela-2.md
  Agent: leela-2 (general-purpose, claude-haiku-4.5)
  Duration: 1m36s | Status: SUCCESS
  Commit produced: 08da75c
  Quote rationale: [...]
  Artifacts: README.md
```

**`8661e3a`** — Leela's personal history gets a new entry:

```
M agents/leela/history.md
  + ## 2026-06-08T15:35Z: README on feature branch
    Commit 08da75c | Quote: Kovalevskaya | Decision archived
```

### 📎 The note (overlay — 7 refreshes, all of `refs/notes/squad`)

One note object, attached to main's first commit `e406cf7`. Its content is regenerated after every squad-state mutation. After this work item finishes:

```
$ git notes --ref=squad list
2f21e96d…  e406cf7…   ← note SHA refreshed, still pinned to first main commit
```

The note's JSON snapshot now includes (relative paths inside the note):

```json
{
  "decisions.md": "…5 active decisions including README rationale…",
  "orchestration-log/…-leela-2.md": "…full forensic record…",
  "log/…-readme-update.md": "…session log…",
  "agents/leela/history.md": "…3 sessions of Leela's work including README…",
  "log/…-scribe-health.md": "…latest Scribe health report…"
}
```

**So someone cloning fresh, checking out `e406cf7`, and running `git notes --ref=squad show e406cf7` instantly reconstructs everything the team knew as of right now — without walking 7 squad-state commits.**

---

## Summary scorecard

| Layer | Commits this task | Who reads it | When |
|---|---|---|---|
| `feature/readme-product-description` | 1 (`08da75c`) | Code reviewer | At PR time |
| `main` | 0 | Everyone | After merge |
| `squad-state` | 7 | Squad team, future sessions | Whenever team needs context |
| `refs/notes/squad` | 7 | Future sessions, fast lookup | When fetching state at a commit |

**The realism:** the PR for this task is **one commit, one file, 28 lines** — exactly what a human reviewer wants. The other 14 commits (7 state + 7 notes) are invisible to the PR but recoverable forever. The team didn't lose any context to keep the PR clean.
