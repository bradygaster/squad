# Version Stamping Phase 1

**Decided by:** Fenster (Core Dev)
**Date:** 2026-02-09
**Sprint Task:** 1.4
**Status:** Completed

## Decision

Added `"engines": { "node": ">=22.0.0" }` to `package.json` to declare the Node 22+ runtime requirement. No changes to `index.js` — the existing `--version` flag already reads from `package.json` correctly.

## Rationale

- Squad's test suite uses `node:test`, which requires Node 22+. Without an explicit engine constraint, users on older Node versions get cryptic `ERR_MODULE_NOT_FOUND` errors instead of a clear "unsupported engine" warning from npm/npx.
- The `--version` flag (index.js lines 17-19) reads `pkg.version` at runtime from `package.json`. This is the correct pattern — single source of truth, zero duplication. No index.js changes needed.
- `package.json` remains the sole version authority: version number, engine constraint, and CLI `--version` all derive from it.

## Changes

- `package.json`: Added `engines.node: ">=22.0.0"` field.
- `index.js`: No changes (already correct).

## Verification

- All 12 tests pass (`npm test`).
- `--version` flag confirmed working (reads `0.1.0` from package.json).
