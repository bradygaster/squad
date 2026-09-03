# Pao history

Summarized by Scribe on 2026-08-20T11:59:44-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/pao/history-archive-2026-08-20T11-59-44-0700.md`.
Prior archive at `.squad/agents/pao/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- **PUBLISH-README.md rewrite (#564):** 58-line stub → 232-line living playbook (11 sections). Microsoft Style Guide enforced; version-agnostic (`<VERSION>` placeholder); all commands copy-pasteable. Living playbook absorbs #558, #559, #560. Full detail: `history-archive-2026-08-19T13-11-34.130-07-00.md`.
- **JSDoc API Reference PRD (2026-03-24):** TypeDoc + typedoc-plugin-markdown chosen (not Starlight, not api-extractor). Output → `docs/src/content/docs/reference/api/`. Astro hook auto-runs on build. JSDoc priority: config/schema.ts (8%→100%), state/io/ @param/@return tags. Effort: 13-18 hrs. Full detail archived (same file as above).
- **Discussion triage patterns:** 6 discussions closed after v0.9.1 shipped features. Teams MCP critical: Office 365 Connectors retired Dec 2024 → Power Automate Workflows is successor.
- **npx purge:** `npm install -g @bradygaster/squad-cli` is the only supported install path. Remove all user-facing `npx` references. Keep `npx` only for dev tools.
- **PR #11 TypeDoc review (2026-03-24):** Generated docs require crosslinks from curated guides. Missing sdk.md crosslink banner and navigation URL inconsistency (`reference/api/index` → `reference/api`) are blocking issues.
- **Link validation pattern:** Automated link validation should be a CI gate. Broken internal links = friction and SEO harm.
- **Broken internal links:** When PRs add new content files, verify corresponding test arrays in docs-build.test.ts are updated (EXPECTED_GUIDES, EXPECTED_FEATURES, EXPECTED_SCENARIOS arrays must match filesystem).

## Recent preserved tail — gh-aw Issue Audit (2026-08-20)

Audited #1761 and #1736 against `docs/src/content/docs/guide/gh-aw.md`.

- **#1761 — SHIP-NOW.** All 3 errors confirmed:
  1. Stale `.github/aw/` in `git add` at lines 38 and 113 — could cause a **false E2E failure** for literal followers.
  2. Redundant `gh aw compile` step at lines 34-35 and 100-108 — `gh aw add` compiles automatically.
  3. Missing restricted-secrets prompt callout — absent entirely from the guide.
- **#1736 — DEFER (wave:3).** Depends on #1733 (still open); current text is accurate. Do not touch until #1733 ships.
- E2E safety verdict: Guide is safe for Brady (expert level). Stale `git add` path is the only instruction that could produce a wrong result for fresh setup consumers following literally.

## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.

## 📌 Team update — 2026-08-20T13:20:20-07:00

Batch 2 complete. PR #1776: corrected 3 errors in `docs/src/content/docs/guide/gh-aw.md` — removed stale `.github/aw/` from git add (L38, L113), removed redundant compile step (L34-35, L100-108), added restricted-secrets callout. PR #1776 green, awaiting Flight gate. Stale git add path was the highest-risk correction.

## Additional Core Context (older, condensed)

- **gh-aw Guide Fix (#1761, 2026-08-20):** Verified via scratch repo that `gh aw add` creates `.github/workflows/` + `.github/skills/`, not `.github/aw/` — fixed the stale path plus a redundant compile step and a missing restricted-secrets callout in the guide. Full detail: `history-archive-2026-08-20T11-59-44-0700.md`.
- **Boundary/governance heuristics** ("Squad Ships It", error lockout, product isolation): see `.squad/skills/governance-policies/SKILL.md`.

