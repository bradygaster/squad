# Decision: Runtime ExperimentalWarning suppression via process.emit hook

**Date:** 2026-03-07
**Author:** Fenster (Core Dev)
**Context:** PR #233 CI failure — 4 tests failed

## Problem

PR #233 (CLI wiring fixes for #226, #229, #201, #202) passed all 74 tests locally but failed 4 tests in CI:

- `test/cli-p0-regressions.test.ts` — bare semver test (expected 1 line, got 3)
- `test/speed-gates.test.ts` — version outputs one line (expected 1, got 3)
- `test/ux-gates.test.ts` — no overflow beyond 80 chars (ExperimentalWarning line >80)
- `test/ux-gates.test.ts` — version bare semver (expected 1 line, got 3)

Root cause: `node:sqlite` import triggers Node.js `ExperimentalWarning` that leaks to stderr. The existing `process.env.NODE_NO_WARNINGS = '1'` in cli-entry.ts was ineffective because Node only reads that env var at process startup, not when set at runtime.

The warning likely didn't appear locally because the local Node.js version may have already suppressed it or the env var was set in the shell.

## Decision

Added a `process.emit` override in cli-entry.ts that intercepts `warning` events with `name === 'ExperimentalWarning'` and swallows them. This is placed:
- After `process.env.NODE_NO_WARNINGS = '1'` (which still helps child processes)
- Before the `await import('node:sqlite')` pre-flight check

This is the standard Node.js pattern for runtime warning suppression when you can't control the process launch flags.

## Impact

- **cli-entry.ts**: 12 lines added (comment + override function)
- **Tests**: All 4 previously failing tests now pass; no regressions in structural tests (#624)
- **Behavior**: ExperimentalWarning messages no longer appear in CLI output; other warnings (DeprecationWarning, etc.) are unaffected
