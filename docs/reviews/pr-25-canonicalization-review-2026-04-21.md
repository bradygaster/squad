# PR #25 Review — resolve-token.mjs Canonicalization

**Reviewer:** Flight (Lead)  
**Date:** 2026-04-21  
**PR:** https://github.com/sabbour/squad/pull/25  
**Branch:** `squad/canonicalize-resolve-token` → `dev`  
**Verdict:** ✅ **APPROVE**

---

## Summary

Collapses 4 hand-synced copies of `resolve-token.mjs` (283 lines each) into 1 canonical source + a generator script + CI guard. 13 files changed, +622/−5. Clean internal refactor — no runtime behavior change.

## Hard Checks

| # | Check | Result |
|---|-------|--------|
| 1 | **Byte-identical guarantee** | ✅ All 4 generated copies match canonical source byte-for-byte after header swap. Verified with string comparison (lengths match, content identical). |
| 2 | **Zero-dependencies preserved** | ✅ All 5 files (source + 4 copies) import only `node:crypto`, `node:fs`, `node:path`, `node:url` built-ins. No npm requires, no SDK imports. `-- zero dependencies --` marker present in all. |
| 3 | **Header correctness** | ✅ Canonical source: lines 1–2 = `// CANONICAL SOURCE. Do not edit the generated copies under templates/. // Run \`npm run sync:resolve-token\` to propagate.` Generated copies: lines 1–2 = `// GENERATED FILE — DO NOT EDIT. Source: packages/squad-cli/scripts/resolve-token.source.mjs // Run \`npm run sync:resolve-token\` at the repo root to regenerate.` |
| 4 | **Check mode** | ✅ `npm run sync:resolve-token:check` exits 0 on clean tree. After appending `// DRIFT` to one copy, exits 1 with: `❌ resolve-token.mjs copies are out of sync with canonical source. drifted: templates/scripts/resolve-token.mjs Run: npm run sync:resolve-token` — useful, actionable error. |
| 5 | **Prebuild wiring** | ✅ `prebuild` chains `node packages/squad-cli/scripts/sync-resolve-token.mjs` (write mode, no `--check`). Builds always ship in-sync. |
| 6 | **sync-templates.mjs skip** | ✅ `SKIP_FILES` set added with `'scripts/resolve-token.mjs'`. Uses `replaceAll('\\', '/')` for Windows path normalization. No fight between generators. |
| 7 | **Test coverage** | ✅ 5 tests in `test/scripts/resolve-token-sync.test.ts`: canonical source exists, all copies exist, generator `--check` exits 0, every copy has GENERATED header, every copy has zero-deps marker. Real `spawnSync` call — not a dummy. |
| 8 | **Changeset** | ✅ `.changeset/canonicalize-resolve-token.md` — `'@bradygaster/squad-cli': patch`. Correct: internal refactor, CLI-only, no SDK change. |
| 9 | **No behavior change** | ✅ 177 tests pass (15 test files) including all identity tests + new sync guard. 12 pre-existing failures in `architectural-review.test.ts` and `check-bootstrap-deps.test.ts` confirmed on `dev` — not caused by this PR. |
| 10 | **Location sanity** | ✅ Canonical source at `packages/squad-cli/scripts/resolve-token.source.mjs` — same directory as sibling generators (`patch-esm-imports.mjs`, `patch-ink-rendering.mjs`). Not in `src/` (not compiled by tsc). Not in `.squad-templates/` (that's a generated-output dir). Good choice. |

## Blockers

None.

## Nits

1. **N-1: Decision inbox file.** `.squad/decisions/inbox/fido-resolve-token-canonical.md` is included. It should be merged to `decisions.md` by Scribe — not a blocker, just a workflow note.
2. **N-2: `Contains sync:resolve-token` script wording.** The `prebuild` line ends with `&& node packages/squad-cli/scripts/sync-resolve-token.mjs` — direct node invocation rather than `npm run sync:resolve-token`. This is fine for performance (avoids npm overhead) but means the script path is duplicated. Extremely minor — no action required.

## Call-outs (good patterns)

- **Generator is zero-dependency itself** — uses only Node.js built-ins. No circular dependency risk.
- **`buildExpectedOutput()` strips exactly 2 banner lines** — deterministic, no regex fragility.
- **`SKIP_FILES` with Windows path normalization** — proactive cross-platform handling.
- **Decision doc + developer guide** — `docs/identity/maintaining-resolve-token.md` is thorough and links to the right references.
- **FIDO's decision doc** explains rationale clearly — good team documentation practice.

## Merge Action

**Approve and merge.** All 10 hard checks pass. No blockers. Clean refactor with solid CI enforcement.
