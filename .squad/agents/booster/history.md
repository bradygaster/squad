# BOOSTER

> Booster Systems Engineer

## Learnings

### CI Pipeline Status
149 test files, 3,931 tests passing, ~89s runtime. Only failure: aspire-integration.test.ts (needs Docker daemon — pre-existing, expected). publish.yml triggers on `release: published` event with retry logic for npm registry propagation (5 attempts, 15s sleep).

### Known CI Patterns
SKIP_BUILD_BUMP=1 environment variable intended to prevent version mutation during CI builds. Currently unreliable — bump-build.mjs ignores it in some code paths. NPM_TOKEN must be Automation type (not user token with 2FA) to avoid EOTP errors in publish workflow.

### Workflow Inventory
9 load-bearing workflows (215 min/month) must stay as GitHub Actions. 5 migration candidates (12 min/month) could move to CLI: sync-labels, triage, assign, heartbeat, validate-labels.

### Container Smoke Test Patterns
`npm pack` generates tarballs installable in clean containers for pre-publish validation. GitHub Actions containers (node:20-slim, node:22) suitable for smoke tests. No devcontainer config exists yet. Current CI budget: ~227 min/month. Container smoke test adds ~2-5 min per run. Tier 1 smoke test commands: `--version`, `--help`, `doctor`, `status`, `export`. CLI has 31 commands; 15 are user-facing smoke test candidates. cli-command-wiring.test.ts catches unwired commands at build time (issues #224, #236, #237).

### Smoke Test Gating in Publish Pipeline
Smoke tests now run as a dedicated `smoke-test` job in publish.yml before any npm publish operations. Both publish-sdk and publish-cli jobs depend on smoke-test passing. Prevents publishing broken CLI packages to npm. Smoke test runs `npx vitest run test/cli-packaging-smoke.test.ts` after a full build. Test takes ~30-60s for pack+install validation.

### Adoption Monitoring Automation (Tier 1)
Implemented daily GitHub Actions workflow (`adoption-report.yml`) that runs `scripts/adoption-monitor.ts` to track Squad adoption metrics. Script collects: repo metrics (stars/forks/watchers), code search results (package.json imports, squad.agent.md files), npm weekly downloads (SDK/CLI), recent forks (7d window). Generates markdown reports in `.squad/adoption/reports/{YYYY-MM-DD}.md` with week-over-week deltas. Uses Node.js 22 built-in fetch (zero added dependencies). Handles GitHub API rate limits gracefully (warns at <10 remaining). Workflow commits via github-actions bot. First run successful: 714 stars, 96 forks, 44 repos using Squad, 135 with squad.agent.md, 2352 SDK downloads/week. Added tsx as dev dependency for TypeScript execution.
