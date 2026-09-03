# SURGEON

> Flight Surgeon

Condensed during the 2026-09-03 team reskill. Full pre-condense history (incident retrospective, CHANGELOG detail, release playbook draft) archived at `.squad/agents/surgeon/history-archive-2026-09-03T07-43-14.596-07-00.md`.

## Core Context

- **v0.9.0→v0.9.1 incident (2026-03-23):** CLI package published with a `file:` monorepo reference instead of a registry version; a 10-minute fix took 8 hours because of a GitHub Actions cache race, broken npm workspace publish, and a 2FA hang. Root causes and 6 action items (A1–A6) drove the governance rules and pre-flight gates now enforced as the "Hard rules" in `.squad/skills/release-process/SKILL.md` (Surgeon owns all publishing, strict playbook adherence, mandatory pre-flight + post-publish smoke test, 2nd-failure escalation to local publish). Full narrative: see archive above.
- **CHANGELOG conventions:** organize by feature cluster (not chronological) for major/minor bumps; match existing header format, `### Added` pattern, PR refs; no npx refs, no "agency" terminology.
- **Version mutation bug (P0):** `bump-build.mjs` can mutate versions during local builds even with `SKIP_BUILD_BUMP=1`/`CI=true` set. Workaround: set versions via a `node -e` script and commit immediately before building (also covers the 4-part-version mangling and build-revert incidents from v0.8.22/v0.8.23).
- **squad-workflow-lint (2026-07-29, #1556/#1557):** `.github/workflows/squad-workflow-lint.yml` runs actionlint + shellcheck on workflow templates — independent of `changelog-gate`. Triggers on changes under `.github/workflows/`, `.squad-templates/workflows/`, `templates/workflows/`, or either package's `templates/workflows/`. Not yet confirmed as a required branch-protection gate.

## 2026-08-22 — gh-aw triage team update

📌 Team update (2026-08-22T17:10:52-07:00): Heads-up for Surgeon: Flight assigned #1825 in the Tier 1 false-green cluster. Treat it as release/user-facing safety work connected to silent CLI pin drift; coordinate with Booster on workflow/CI release surfaces.
