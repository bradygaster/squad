---
updated_at: 2026-03-15T11:41:00Z
focus_area: Irritating Bugs Sprint — Cross-Platform & Skill Path Migration
version: v0.8.24+dev
branch: dev
tests_passing: 4113
tests_todo: 46
tests_skipped: 5
test_files: 152
team_size: 19 active agents + Scribe + Ralph + @copilot
team_identity: Apollo 13 / NASA Mission Control
process: All work through PRs. Branch naming squad/{issue-number}-{slug}. Never commit to main directly.
github_account: Always use bradygaster (personal) in this repo. Use ghp/gh-personal aliases.
---

# What We're Focused On

**Status:** Dev branch stabilized after merge marathon. 4 PRs merged (#404, #403, #405, #389 pending rebase). Terminal flicker fix cherry-picked from main. Next sprint: irritating cross-platform bugs (#197, #353, #354).

## Current State

**Version:** v0.8.24+dev (pre-release, on dev branch)
- **Packages:** @bradygaster/squad-sdk, @bradygaster/squad-cli
- **Branch:** dev
- **Build:** ✅ clean (0 errors)
- **Tests:** 4,113 passed, 46 todo, 5 skipped, 152 test files (~88s)
  - Only failure: aspire-integration.test.ts (needs Docker, pre-existing)

**Stack:**
- TypeScript (strict mode, ESM-only)
- Node.js ≥20
- @github/copilot-sdk
- Vitest (test runner)
- esbuild (bundler)

**Team:** Apollo 13 / NASA Mission Control
- 19 active agents (Flight, FIDO, GNC, RETRO, CONTROL, PAO, Network, Booster, SURGEON, TELMU, EECOM, GUIDO, CAPCOM, FAO, INCO, Procedures, FLIGHT_DYNAMICS, Experiments, Trajectory)
- Scribe (orchestration historian)
- Ralph (autonomous triage watchdog)
- @copilot (coding agent)

## Recent Major Features (v0.8.24)

- **Azure DevOps platform adapter** — Full enterprise support for ADO alongside GitHub
- **CommunicationAdapter** — Platform-agnostic agent-human communication abstraction
- **SubSquads** — Renamed from workstreams, clearer mental model for nested teams
- **Secret guardrails** — Hook-based enforcement (zero-worry guarantee)
- **ESM runtime patch** — Node 24+ compatibility fix
- **Contributors Guide page** — Recognition and onboarding for external contributors
- **Team rebirth** — The Usual Suspects → Apollo 13 / NASA Mission Control

## Active Work in Progress (Tamir's Branches)

- **`remote-control`** — PTY mirror + devtunnel for phone access (36 commits, security-hardened)
- **`hierarchical-squad-inheritance`** — Upstream inheritance for inherited squads (6 commits)
- **`ralph-watch`** — Persistent local watchdog polling (5 commits)
- **`project-type-detection`** — Non-npm project support (2 commits)
- **`prevent-git-checkout-data-loss`** — Safety guard for branch switches (2 commits)

## Key Recent Fixes (Post v0.8.24)

- **PR #404** — Cross-platform filename fix (colons in timestamps) + config.json absolute path fix
- **PR #403** — FAQ page + CLI guidance docs
- **PR #405** — Terminal flicker fix cherry-picked from main (ANSI escapes, animation FPS 15→5)
- Wired `upstream` + `watch`/`triage` commands in cli-entry.ts (recurring unwired command bug)
- Made tests name-agnostic (resilient to team rebirths)
- Dynamic blog discovery in docs-build tests (no longer hardcoded)
- Cleared KNOWN_UNWIRED set (all commands now wired)

## Next Sprint — Irritating Bugs

Pick up in next session ("Team, pick up the irritating bugs sprint — #197, #353, #354"):

| Issue | What | Who | Effort |
|-------|------|-----|--------|
| #197 | Migration experience overhaul | EECOM + PAO | Medium |
| #353 | Create skills in `.copilot/skills/` | EECOM | Medium |
| #354 | Full skill path migration `.squad/` → `.copilot/` | EECOM + FIDO | Large |

## Pending PRs

- **PR #389** (diberry) — Consolidated docs quality. Squad review ✅. Needs rebase against dev. Merge when rebased.
- **PR #381** (tamirdresher) — Targets main (should be dev), has conflicts, uses CommonJS. Needs retarget + TypeScript conversion.

## Skills Installed

- `github-multi-account` — from tamirdresher/squad-skills. Configures ghp/ghw aliases for multi-account GitHub CLI.

## Process

All work through PRs. Branch naming: `squad/{issue-number}-{slug}`. Never commit to main directly. Squad member review before merge. Always use `bradygaster` (personal) GitHub account in this repo — use `ghp` alias.
