# Decision: Pre-publish Preflight Gate in CI

**Author:** Booster (CI/CD Engineer)
**Date:** 2026-03-23
**Status:** Implemented

## Context

The v0.9.1 release shipped with `file:` references in package.json, breaking global installs. The existing smoke-test job caught packaging issues but only AFTER build — it didn't scan source package.json files for dependency hygiene before any work began.

## Decision

Added a `preflight` job to `squad-npm-publish.yml` that runs BEFORE smoke-test and all publish jobs. It:
1. Scans all `packages/*/package.json` for `file:` references in any dependency section
2. Validates all versions are valid semver
3. Blocks the entire publish pipeline if any violation is found

## Rationale

- Zero-cost gate (no npm ci, no build — just reads JSON files)
- Catches the exact class of bug that caused v0.9.1
- Fails fast with clear error messages including remediation instructions
- Defense in depth: preflight catches source-level issues, smoke-test catches packaging issues

## Impact

- All squad members: Publish pipeline will now reject any PR that accidentally leaves `file:` references
- No changes needed from team — this is a passive safety gate
