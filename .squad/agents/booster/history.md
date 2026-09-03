# Booster history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/booster/history-archive-2026-08-19T13-11-34.130-07-00.md` (includes the 2026-09-03 reskill append: gh-aw issue triage detail moved out of this file).

## Core Context

- **CI/CD audit (2026-03-23, post v0.9.0 incident):** 15 workflow files audited — 7 load-bearing, 7 administrative, 1 ghost (`publish-npm.yml`, cached in GitHub's index after deletion — wait 15+ min or refresh manually). Preflight gate (dependency scan + semver validation) now prevents the class of defect that caused the incident. NPM_TOKEN must be Automation type (not a 2FA user token) to avoid EOTP errors — see `.squad/skills/release-process/SKILL.md` for the full enforced hard rules.
- **`edited` PR trigger gap (2026-03-20):** `pull_request` didn't include the `edited` event type, so retargeting a PR's base branch (e.g. main→dev) silently skipped CI. Fixed by adding `edited` to the trigger types. Also added a lockfile-lint step to catch stale `packages/*/node_modules/@bradygaster/squad-*` registry-URL entries shadowing workspace symlinks.
- **Workflow lint hardening (2026-07-29, #1556/#1557):** Quoted all unquoted `>> $GITHUB_OUTPUT`/`>> $GITHUB_STEP_SUMMARY` redirects (SC2086) across the canonical template source (`.squad-templates/workflows/`), its 3 mirrors, and 2 active workflows. Added `squad-workflow-lint.yml` (actionlint 1.7.12 pinned to a tag URL, not a moving ref + shellcheck 0.10.0, since ubuntu-latest ships 0.9.0) that lints both `.github/workflows/*.yml` and the template directories directly — no sync-then-lint, since mirror drift is already a separate gate (`template-sync.test.ts`). Installer hardened per PR review: `curl -fsSL ... > file && bash file` instead of process substitution (fails hard on non-200, leaves an inspectable artifact), plus `set -euo pipefail` so a failed `curl | tar` pipeline isn't masked.
- **Canonical template source:** always fix workflow templates in `.squad-templates/workflows/` — mirrors auto-sync via `node scripts/sync-templates.mjs` during `prebuild`. `.github/workflows/squad-heartbeat.yml` is the one active workflow maintained separately (SYNC comment) and needs manual patching too.
- **Smoke tests:** a dedicated `smoke-test` job in `publish.yml` runs `test/cli-packaging-smoke.test.ts` (pack+install validation, ~30-60s) before either publish job — prevents shipping a broken CLI package. Tier 1 smoke commands: `--version`, `--help`, `doctor`, `status`, `export`.
- **Workflow migration candidates:** 9 workflows (215 min/month) must stay as GitHub Actions (load-bearing); 5 (12 min/month) could move to CLI (sync-labels, triage, assign, heartbeat, validate-labels).

## 📌 Team update — 2026-08-19T13:11:34.130-07:00

Post-e2e follow-up triage recorded Booster findings D and F. Finding F confirmed `protected-files: request_review` is incompatible with signed create-pull-request writes that touch protected files; `fallback-to-issue` is the safe fail-closed path. Finding D confirmed the `slash_command` + `bots:` concurrency warning is real but narrow and does not block the continuation e2e because the continuation hop uses `workflow_dispatch`.


## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.


- 📌 **Team update (2026-08-21 — Agentic-Workflows Audit):** Authored PR #1815 chore(gh-aw): ignore downloaded workflow logs under .github/aw/logs. Created .github/aw/logs/.gitignore (* + !.gitignore). LF-only blob verified via hex inspection. Correctly requested reviewer pass; Flight approved and squash-merged at 2026-08-21T16:23:46Z. PR #1815 MERGED ✅.

## 2026-08-22 — gh-aw triage team update

📌 Team update (2026-08-22T17:10:52-07:00): Booster completed Tier 2 gh-aw CI/release-surface triage: #1556 and #1493 are p1/wave:1-next/spec-ready, #1502 is p2/wave:2-soon/needs-research. PR #1709 only partially addresses #1493; #1827 and #1556 are separate generated-YAML code paths.
