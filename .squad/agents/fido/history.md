# FIDO

## Core Context

Test baseline: 3,931 tests passing, 46 todo, 5 skipped, 149 test files (~89s). Only failure: aspire-integration.test.ts (Docker daemon needed). Speed gates enforce UX budgets (help output <100 lines, init <10s).

## Patterns

**Test assertion sync:** When test files contain expected counts (EXPECTED_FEATURES, EXPECTED_SCENARIOS), they must match disk reality. Adding/removing content files requires updating test arrays in same commit. See test-discipline skill for details.

**Name-agnostic testing:** Tests reading live .squad/ files (team.md, routing.md) must assert structure/behavior, not specific agent names. Names change during team rebirths. Use property checks, not hardcoded names.

**Dynamic content discovery:** Blog tests use filesystem discovery (readdirSync) instead of hardcoded arrays. Adding/removing blog posts no longer requires updating the test.

**Command wiring regression test:** cli-command-wiring.test.ts prevents "unwired command" bugs by verifying every .ts file in cli/commands/ is imported in cli-entry.ts. Bidirectional validation.

**CLI packaging smoke test:** cli-packaging-smoke.test.ts validates the PACKAGED artifact (npm pack → install → execute). Tests 27 commands + 3 aliases by invoking them through the installed tarball. Catches: missing imports, broken package.json exports, bin script misconfiguration, ESM resolution failures.
