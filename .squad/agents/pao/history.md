# Pao history

Summarized by Scribe on 2026-08-20T11:59:44-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/pao/history-archive-2026-08-20T11-59-44-0700.md`.
Prior archive at `.squad/agents/pao/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- **PUBLISH-README.md rewrite (#564):** 58-line stub → 232-line living playbook (11 sections). Microsoft Style Guide enforced; version-agnostic (`<VERSION>` placeholder); all commands copy-pasteable. Living playbook absorbs #558, #559, #560.
- **JSDoc API Reference PRD (2026-03-24):** TypeDoc + typedoc-plugin-markdown chosen (not Starlight, not api-extractor). Output → `docs/src/content/docs/reference/api/`. Astro hook auto-runs on build. JSDoc priority: config/schema.ts (8%→100%), state/io/ @param/@return tags. Effort: 13-18 hrs.
- **Discussion triage patterns:** 6 discussions closed after v0.9.1 shipped features. Teams MCP critical: Office 365 Connectors retired Dec 2024 → Power Automate Workflows is successor.
- **Boundary review:** "Squad Ships It" litmus test — if Squad doesn't ship the code, it's IRL content. Delete external infra docs; reframe platform integration docs; keep Squad behavior/config docs.
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

### Release Playbook Rewrite (#564, 2026-07-22)

**Task:** Rewrite PUBLISH-README.md from a v0.8.22 version-specific stub (58 lines) into a living, version-agnostic release playbook.

**Outcome:** 232-line playbook replacing entirely with 11 sections per Flight's spec:
1. Overview — two publish channels, package order (SDK → CLI)
2. Pre-Flight Checklist — runnable checklist with `grep`/`npm` commands
3. Publish via CI (Recommended Path) — GitHub Release workflow
4. Publish via workflow_dispatch — manual trigger fallback
5. Insider Channel — insider branch + `@insider` tag for testing
6. Workspace Publish Policy — reference to CI lint rule #557 (enforces `-w` flag)
7. Manual Local Publish — emergency fallback with step-by-step commands
8. 422 Race Condition & npm Errors — v0.9.1 incident + troubleshooting
9. Post-Publish Verification — `npm view` + npx cold-install test
10. Version Bump After Publish — preview version increment pattern
11. Legacy Publish Scripts — deprecation notice for PowerShell scripts

**Key decisions:**
- Microsoft Style Guide enforced: sentence-case headings, active voice, "you" not "we", present tense
- Version-agnostic: `<VERSION>` placeholder, no hardcoded version numbers
- Scannability: checklist format, code blocks (bash not PowerShell for portability), tables for error reference
- Accuracy: pulled from actual workflows (`squad-npm-publish.yml`, `squad-insider-publish.yml`) — preflight job, smoke test, publish stages, registry propagation retry logic (5× 15-second intervals)
- Runnable: all commands copy-pasteable (e.g., `npm -w packages/squad-sdk pack --dry-run`)

**Pattern:** Living playbook absorbs three related issues (#558 race conditions, #559 manual publish, #560 pre-flight checklist) into unified reference. No separate documents; all under one decision tree: try CI first, use manual only if CI broken. Workspace publish policy section references CI lint rule #557 (being added in parallel by FIDO); both docs + lint create enforcement + education.

**Commit:** `docs: rewrite PUBLISH-README.md as release playbook (#564)` on squad/release-hardening branch.

📌 **Team update (2026-03-24T06-release-hardening):** Release playbook rewrite (#564) completed. PUBLISH-README.md transformed from v0.8.22 stub to living 232-line playbook with 11 sections: Overview, Pre-Flight Checklist, Publish via CI (recommended), Publish via workflow_dispatch, Insider Channel, Workspace Publish Policy, Manual Local Publish (emergency fallback), 422 Race Condition & npm Errors, Post-Publish Verification, Version Bump After Publish, Legacy Publish Scripts. Absorbed issues #558, #559, #560 into unified decision tree. Microsoft Style Guide enforced; version-agnostic; all commands runnable. Scannability: checklist format, bash code blocks, error reference table. Committed to squad/release-hardening.
### JSDoc API Reference PRD (2026-03-24)

Completed full PRD based on research findings. **Document:** `docs/research/jsdoc-api-reference-prd.md`.

**Structure (8 major sections):**
1. Problem Statement — 5 concrete gaps (no dedicated API ref, uneven JSDoc coverage, discoverability, StorageProvider docs lag, Pagefind misses API symbols)
2. Goals & Success Metrics — 4 primary goals, 8 measurable targets (100% JSDoc coverage, 50+ auto-documented symbols, searchable API)
3. Key User Scenarios — 4 personas (SDK consumer, contributor, agent author, evaluator) with today vs future workflows
4. Scope — clear in/out boundaries (TypeDoc + JSDoc improvements in; CLI ref gen, Starlight migration, multi-version docs out)
5. Approach — architecture (TypeDoc in Astro hook), config template (typedoc.json), output/URL structure, build integration code, JSDoc improvement plan with effort table
6. Implementation Phases — 4 phases: Phase 0 (setup/PoC, 1–2 days), Phase 1 (JSDoc audit, 5–6 hrs), Phase 2 (integration/nav, 3–4 hrs), Phase 3 (CI/CD optional, 2–4 hrs)
7. Risks & Mitigations — 7 risks (TypeDoc breaks on changes, stale markdown, link validation strictness, Pagefind misses, config maintenance, build perf, breaking changes) with specific mitigations
8. Architecture Review section — 4 items for CONTROL to review (TypeScript export strategy, TypeDoc config, JSDoc standards, stability commitments)

**Key decisions baked into PRD:**
- TypeDoc + typedoc-plugin-markdown (not Starlight, not api-extractor) — zero migration, Markdown-first, Pagefind-compatible
- Astro integration hook auto-runs TypeDoc on build (single step: `npm run build`)
- Generated output goes to docs/src/content/docs/reference/api/ (one file per symbol)
- JSDoc improvement priority: config/schema.ts (8% → 100%), state/io/ functions (@param/@return tags), StorageProvider interface audit
- Total effort: 13–18 hours (8–12 JSDoc + 5–6 setup)

**Style & Tone:**
- Written for Flight-level review/approval (actionable, opinionated, specific)
- Includes code examples (typedoc.json, Astro hook, JSDoc template)
- References research doc for detailed findings
- PRD as decision/commitment document — not advisory, but directive

**Learnings:**
- PRD structure differs from research (research = exploratory findings/options; PRD = chosen path + tactical roadmap)
- Recommendation section in PRD serves as binding decision (TypeDoc chosen, rationale locked in)
- Architecture Review section ensures TypeScript team reviews export strategy and JSDoc standards early — prevents rework later
- Four-phase approach breaks large effort into digestible increments (Phase 0 validation before JSDoc audit helps mitigate risk of TypeDoc setup failing)

**Decision:** PRD approved for handoff to implementation team. Ready for execution on next sprint.

### gh-aw Guide Fix — Issue #1761 (2026-08-20)

**Task:** Fix three verified errors in `docs/src/content/docs/guide/gh-aw.md` before Brady's end-to-end test series on 2026-08-21.

**Verification:** Created scratch git repo in `$env:TEMP`, ran `gh aw add` against the two Squad workflow sources (`@dev`), inspected all created paths, cleaned up. **Finding: `.github/aw/` is NOT created by `gh aw add`.** All files land under `.github/workflows/` and `.github/skills/`.

**Changes made:**
1. **`git add` path corrected** (Quick Start step 4, Setup "Commit the workflow files"): `.github/aw/` → `.github/workflows/ .github/skills/`. This was the critical error that could cause false E2E failures.
2. **`gh aw compile` demoted** from required step to troubleshooting note. Quick Start reduced from 6 to 5 steps. Lock files are generated automatically by `gh aw add`. Upgrading section left unchanged (correct there).
3. **Restricted secrets callout added** in Setup immediately after the `gh aw add` block, with `--approve` flag workaround.

**Decision record:** `.squad/decisions.md` — “2026-08-21: gitignore placement — colocation over root rules.”

**PR:** Closes #1761
