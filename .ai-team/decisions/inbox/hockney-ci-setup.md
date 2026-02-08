# Decision: CI Pipeline Configuration

**By:** Hockney (Tester)
**Date:** 2026-02-09
**Sprint Task:** 1.3

## What

Created `.github/workflows/ci.yml` — a minimal GitHub Actions CI pipeline that runs `npm test` on every push to `main`/`dev` and every PR to `main`. Added CI status badge to README.md.

## Key Decisions

1. **Node 22.x only** — no multi-version matrix. We use `node:test` and `node:assert` which require Node 22+. Testing older versions would just fail.
2. **No `npm install` step** — zero runtime dependencies, zero dev dependencies. The test framework is built into Node.
3. **No caching** — nothing to cache (no `node_modules`). Can add later if dependencies are introduced.
4. **No artifacts/coverage** — ship the floor first. Coverage uploads and test result artifacts are Sprint 3 territory.
5. **Badge goes above existing shields** — CI status is the most operationally important badge; it belongs at the top.

## Why This Matters

CI is the quality gate. My own rule from Proposal 013: "No pre-commit hook — CI is the quality gate." This workflow makes that real. Every PR to `main` must pass 12 tests before merging. The badge makes pass/fail visible to anyone who visits the repo.

## Impact

- All agents: PRs now have an automated gate. If tests fail, the badge goes red.
- Kobayashi: Release workflow should depend on CI passing (or at minimum, tests are a subset of release gates).
- Fenster: Any changes to `index.js` will be validated automatically on push.
