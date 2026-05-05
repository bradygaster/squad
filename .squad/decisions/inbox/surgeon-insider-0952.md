# Decision: Windows Insider Release Validation Environment

**By:** Surgeon  
**Date:** 2026-05-04

## Context

Insider release `0.9.5-insider.2` was validated from Windows PowerShell. Default local environment introduced false negatives in release verification:
- `process.execPath` contained spaces (`C:\Program Files\nodejs\node.exe`), which broke `scheduler.test.ts`
- temp paths under the repo or user home caused `team-root`, `init`, and `upgrade` tests to discover a real `.squad/` unexpectedly
- one or two full-suite failures remained flaky timeout cases, but they passed on targeted rerun

## Decision

For Windows release validation, isolate the test environment before running the standard vitest command:
1. Put a no-space Node path first on `PATH` (junction `C:\src\squad\.nodebin -> C:\Program Files\nodejs`)
2. Set `TEMP` and `TMP` to `C:\src\squad-release-tmp` (outside the repo and home `.squad` tree)
3. Keep `SKIP_BUILD_BUMP=1`
4. If the full vitest run fails only on timeout-based flakes, rerun the failing file(s) to confirm there is no deterministic regression before blocking the release

## Rationale

This preserves the release checklist while removing machine-specific false failures. The decision is validation-only; it does not change published package contents or release semantics.
