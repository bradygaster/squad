# Decision: CLI Command Wiring Regression Test Pattern

**By:** Hockney (Tester)
**Date:** 2026-03-07
**Status:** Adopted

## What
Every `.ts` file in `packages/squad-cli/src/cli/commands/` must have a corresponding dynamic import in `cli-entry.ts`. A regression test (`test/cli-command-wiring.test.ts`) enforces this automatically. Known-unwired commands are tracked in a `KNOWN_UNWIRED` set with justification comments.

## Why
Issues #224, #236, #237 were all variants of the same bug: a command file exists but isn't wired in cli-entry.ts, so users can't reach it. The regression test catches this at CI time. The KNOWN_UNWIRED set documents intentional gaps (watch.ts is pending full implementation, upstream.ts is wired differently).

## Impact
- New command files must be wired in cli-entry.ts or added to KNOWN_UNWIRED with justification.
- All 8 previously untested commands now have subpath exports in package.json.
- Test pattern: module export verification → pure function testing → error path validation.
