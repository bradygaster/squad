---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix shellcheck SC2086 in workflow templates: quote `$GITHUB_OUTPUT` redirects

All `>> $GITHUB_OUTPUT` (and `>> $GITHUB_STEP_SUMMARY`) redirects in `run:` blocks were unquoted, causing `actionlint` + shellcheck to report SC2086 (double quote to prevent globbing and word splitting) in downstream repos that run `actionlint` in their CI. The fix is purely additive quotes around the variable; behaviour is unchanged.

**Files fixed:**
- `.squad-templates/workflows/squad-heartbeat.yml` (canonical source — synced to all mirrors)
- `templates/workflows/squad-heartbeat.yml`
- `packages/squad-cli/templates/workflows/squad-heartbeat.yml`
- `packages/squad-sdk/templates/workflows/squad-heartbeat.yml`

**Squad's own workflows also fixed:**
- `.github/workflows/squad-heartbeat.yml`
- `.github/workflows/squad-repo-health.yml`
- `.github/workflows/squad-ci.yml`

A new `.github/workflows/squad-workflow-lint.yml` CI job is added to lint both Squad's own workflows and the bundled templates on every PR and push to `dev`/`main`, so this class of regression is caught before it ships.
