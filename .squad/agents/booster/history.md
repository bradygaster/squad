# BOOSTER

## Core Context

CI/CD pipeline runs 149 test files with 3,931 tests passing (~89s runtime). Only expected failure: aspire-integration.test.ts (needs Docker daemon). publish.yml triggers on `release: published` event with retry logic for npm registry propagation (5 attempts, 15s sleep).

## Patterns

**SKIP_BUILD_BUMP environment variable:** Intended to prevent version mutation during CI builds. Currently unreliable — bump-build.mjs ignores it in some code paths. NPM_TOKEN must be Automation type (not user token with 2FA) to avoid EOTP errors.

**Workflow inventory:** 9 load-bearing workflows (215 min/month) must stay as GitHub Actions. 5 migration candidates (12 min/month) could move to CLI: sync-labels, triage, assign, heartbeat, validate-labels.

**Container smoke testing:** `npm pack` generates tarballs installable in clean containers for pre-publish validation. GitHub Actions containers (node:20-slim, node:22) suitable for smoke tests. Smoke tests run as dedicated job in publish.yml before any npm publish operations. Both publish-sdk and publish-cli jobs depend on smoke-test passing. Test takes ~30-60s for pack+install validation.

