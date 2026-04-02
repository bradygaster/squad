# Decision: Extract workflow inline scripts into testable modules

**By:** EECOM
**Date:** 2025-07-25
**PR:** #753
**Issue:** #751

## What

When a GitHub Actions workflow has non-trivial inline JavaScript (>30 lines), extract the pure logic into ES module files under `scripts/` and keep the workflow as a thin orchestrator.

## Pattern

1. Pure functions (scoring, validation, formatting) → `scripts/<feature>.mjs`
2. Workflow uses `actions/checkout@v4` with `sparse-checkout` to fetch only the needed module
3. `actions/github-script` block imports the module via `await import()` and calls the exported functions
4. API calls (GitHub REST/GraphQL) stay in the workflow — they need the `github` and `context` objects
5. Tests import the `.mjs` module directly with vitest

## Why

- Inline scripts are untestable — vitest can't import a YAML file
- Separating pure logic from API calls enables fast, deterministic unit tests
- Reviewing pure functions is easier than reviewing 100-line YAML script blocks
- The sparse-checkout pattern avoids a full repo clone in the workflow
