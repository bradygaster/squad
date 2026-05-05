# EECOM W3 shipped — ADO reliability fixes

**Date:** 2026-05-04  
**PR:** #1082 — https://github.com/bradygaster/squad/pull/1082  
**Scope:** Wi-Fi Aware shared squad readiness Phase 2, W3 only.

## Shipped scope

- `watch/index.ts:142`: hot-path work-item assignment no longer runs ADO/GitHub CLI commands unconditionally; GitHub assignment remains adapter-type guarded pending W8.
- `packages/squad-sdk/src/platform/detect.ts`: `detectPlatform()` fails loudly with remediation on origin URL read failure and honors `SQUAD_PLATFORM`.
- `execute.ts:193`: execute preflight routes through `context.adapter.ensureAuth?.()`.
- `health.ts:83`: health auth drift probe uses platform adapter detection and only runs the current GitHub probe on GitHub.
- `board.ts`: board capability registration/preflight is gated by the existing adapter type to avoid ADO GitHub Projects crashes.
- `two-pass.ts:52`: issue hydration routes through `context.adapter.getWorkItem()`.
- Existing tests updated in `test/cli/watch-capabilities.test.ts` and `test/sdk-feature-parity-batch3.test.ts`; no new test files added.

## Deferred to W8

- `PlatformAdapter.assignWorkItem(id, assignee)` for real cross-platform assignment.
- `PlatformAdapter.getCurrentUser()` for cross-platform auth drift checks.
- Platform capability registration for project-board support.

## Validation

- `npm run lint`: passed.
- Affected tests: 4 files / 228 tests passed.
- Full `npm test`: run on 2026-05-04; still fails in unrelated existing areas (observed 6,029 passed / 22 failed / 60 pending / 47 todo out of 6,158 tests after W3 changes).
