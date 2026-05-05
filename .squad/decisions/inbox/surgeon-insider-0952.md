# Decision: Windows Insider Release Validation Environment

**By:** Surgeon  
**Date:** 2026-05-04

## Context

Insider release `0.9.5-insider.2` was validated from Windows PowerShell. Default local environment introduced false negatives in release verification:
- `process.execPath` contained spaces (`C:\Program Files\nodejs\node.exe`), which broke `scheduler.test.ts`
- temp paths under the repo or user home caused `team-root`, `init`, and `upgrade` tests to discover a real `.squad/` unexpectedly
- one or two full-suite failures remained flaky timeout cases, but they passed on targeted rerun

## Decision

For Windows insider release validation:
1. Pin `packages/squad-cli` to the exact insider SDK version before building/publishing so npm uses the workspace SDK instead of the latest published registry copy
2. Put a no-space Node path first on `PATH` (junction `C:\src\squad\.nodebin -> C:\Program Files\nodejs`)
3. Set `TEMP` and `TMP` to `C:\src\squad-release-tmp` (outside the repo and home `.squad` tree)
4. Keep `SKIP_BUILD_BUMP=1`
5. If the full vitest run fails only on timeout/EBUSY flakes, rerun the failing file(s) to confirm there is no deterministic regression before blocking the release

## Rationale

The version pin fixes a real publish blocker: CI was compiling the CLI against `@bradygaster/squad-sdk@0.9.4` from npm, which does not export the newer resolution helpers used by the current CLI. The environment isolation preserves the checklist while removing machine-specific false failures during Windows validation.
