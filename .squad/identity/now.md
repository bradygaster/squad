---
updated_at: 2026-03-16T00:00:00Z
focus_area: A2A protocol + SDK work
version: v0.8.25-build.7
branch: dev
tests_passing: 4199
tests_todo: 46
tests_skipped: 5
test_files: 155
team_size: 19 active agents + Scribe + Ralph + @copilot
team_identity: Apollo 13 / NASA Mission Control
process: All work through PRs. Branch naming squad/{issue-number}-{slug}. Never commit to main directly.
---

# What We're Focused On

**Status:** Sprint bugs DONE. SDK feature parity tests shipped. Reskill running. Next: A2A protocol suite.

## Current State

**Version:** v0.8.25-build.7 (on dev, not yet released)
- **Packages:** @bradygaster/squad-sdk, @bradygaster/squad-cli
- **Branch:** dev
- **Build:** ✅ clean (0 errors, CI green)
- **Tests:** 4,199 passed, 46 todo, 5 skipped, 155 test files
  - Only failure: aspire-integration.test.ts (needs Docker, pre-existing)

**Stack:**
- TypeScript (strict mode, ESM-only)
- Node.js ≥20
- @github/copilot-sdk
- Vitest (test runner)
- esbuild (bundler)

**Team:** Apollo 13 / NASA Mission Control
- 19 active agents + Scribe + Ralph + @copilot

## Recently Shipped

- **PR #417** — CastingEngine wiring (#342) — casting now routes through the engine
- **PR #422** — SDK feature parity tests (#340) — 22 real integration tests for worktree awareness, reviewer lockout, deadlock handling, skill confidence
- **Issues #418-421** — Manual verification sub-issues created for prompt-only features (assigned to Brady)

## Next Up — A2A Protocol Suite 🔥

Brady said this "sounds butter." Five issues filed by Tamir, all `go:needs-research`:

1. **#332** — Core A2A/ACP Protocol (JSON-RPC 2.0 server, Agent Card, 3 RPCs) → start here
2. **#333** — Discovery Mechanism (local file registry + optional mDNS) → after #332
3. **#335** — Security & Authentication (localhost-only MVP, TLS for network) → after #332
4. **#334** — CLI Integration (`squad serve`, `squad discover`, `squad ask`, etc.) → after #332 + #333
5. **#336** — Multi-Repo Coordination Patterns (docs/playbook) → can start anytime

### Other Open

- **#378** — Base roles `--sdk` switch (P1, EECOM + DSKY)
- **#413** — Knowledge library (persistent team-wide storage)
- **#354** — Migrate skills to .copilot/skills/
- **#236** — Persistent Ralph (watch + heartbeat)

## Process

All work through PRs. Branch naming: `squad/{issue-number}-{slug}`. Never commit to main directly. Squad member review before merge. Always use bradygaster (personal) GitHub account for this repo.
