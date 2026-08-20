# Pao history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/pao/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- Preserved 315 original line(s) in the archive.
- Detected 41 heading(s) and 17 dated reference line(s).
- This file now keeps a compact index plus the most recent tail so active context remains visible.

## Notable retained signals

- Rewrote PUBLISH-README.md from v0.8.22 stub (58 lines) to living 232-line version-agnostic playbook with 11 sections: Overview, Pre-Flight Checklist, Publish via CI (recommended), workflow_dispatch fallback, Insider Channel, Workspace Publish Policy, Manual Local Publish, 422 Race Condition & npm Errors, Post-Publish Verification, Version Bump, Legacy Scripts. Pattern: living playbook absorbs multiple issues (#558, #559, #560) into unified decision tree. Microsoft Style Guide enforced; `<VERSION>` placeholder; all commands copy-pasteable.
- 📌 **Team update (2026-03-24T06-release-hardening):** Release playbook rewrite (#564) completed. Absorbed issues #558, #559, #560 into unified decision tree.
- Full PRD at `docs/research/jsdoc-api-reference-prd.md`. Key decisions: TypeDoc + typedoc-plugin-markdown (not Starlight, not api-extractor) — zero migration, Markdown-first, Pagefind-compatible. Astro integration hook auto-runs TypeDoc on build. Output → `docs/src/content/docs/reference/api/`. JSDoc improvement priority: config/schema.ts (8%→100%), state/io/ @param/@return tags. Total effort: 13–18 hours. PRD structure: chosen path + tactical roadmap (not advisory — directive).
- 6 discussions closed as resolved (features shipped in v0.9.1: per-agent models #463/#402, local-only #324, CLI vs agent #299, human members #143, skills system #169). 8 discussions kept open with substantive replies. Pattern: feature-release timing + follow-up responses critical for community trust. **Teams MCP critical:** Office 365 Connectors retired Dec 2024 → Power Automate Workflows is successor. Purge all old connector references.
- **Boundary review:** "Squad Ships It" litmus test — if Squad doesn't ship the code, it's IRL content. Platform features: clarify whose feature it is. Delete external infrastructure docs; reframe platform integration docs; keep Squad behavior/config docs. Pattern from PR #331.
- **npx purge:** `npm install -g @bradygaster/squad-cli` is only supported install path. Remove all user-facing `npx` references. Keep `npx` only for dev tools (changeset, vitest, astro, pagefind). Agency copilot example → `gh copilot`.
- **PR #11 TypeDoc review (2026-03-24):** Generated docs require crosslinks from curated guides. When adding new docs section, ensure old curated page has a visible pointer to the new section. Blocking issues: missing sdk.md crosslink banner, navigation URL inconsistency (`reference/api/index` → `reference/api`).
- ### Discussion Triage Patterns (2026-03-23 Release Incident)
- **Triage workflow:**
- **Critical finding:** Teams MCP docs need urgent update — Office 365 Connectors deprecated Dec 2024. Docs must purge old connector references and document Power Automate Workflows path (new successor).
- ### Chinese README Workflow (2026-03-23 Release Incident)
- Community contributor (PR #572) provided Chinese README translation. Approved and merged as part of v0.9.1 release. Pattern: accept community translations; list contributors in CONTRIBUTORS.md; acknowledge in release notes.
- External tool integrations deprecate. Office 365 Connectors retired Dec 2024. Docs mentioning deprecated tools create support burden and user confusion. Action: audit all external tool integration docs for deprecation; update with successor guidance (Power Automate Workflows for Teams).
- Explicitly state what a skill produces and does NOT produce. Deterministic skills prevent agents from generating unnecessary code when templates exist.
- External tool integrations require explicit "where to get it" guidance. Placeholder paths need clarification that users must provide actual MCP server implementations.
- When rebasing doc PRs with conflicts from other merged doc PRs, the main branch version (already merged) should generally take priority. For Node.js version references, maintain LTS terminology when present (e.g., `nvm install --lts` over specific version numbers like `nvm install 20`). Conflict resolution pattern: preserve new content from PR branch only where it doesn't duplicate or contradict already-merged changes. Use `git -c core.editor=true rebase --continue` to bypass interactive editor issues on Windows.
- Two-way communication layer between Squad and work environment. Outbound: Teams webhook notifications (breaking, briefings, recaps, flashes) sent via Adaptive Cards — only when newsworthy. Inbound: WorkIQ/Playwright scanning of Teams channels and email → auto-create GitHub issues with teams-bridge label, anti-duplicate logic enforced. Loop: inbound creates issues → Ralph dispatches → agents work → outbound notifies results. Human stays informed on mobile. Prerequisites are enhancements, not requirements.
- 📌 **Team update (2026-03-11T01:27:57Z):** Proactive communication patterns and PR trust levels (full/selective/self-managing spectrum) documented in decisions.md. Pattern rationale reinforced: Ralph 24/7 autonomous deployment requires awareness loop (Teams webhooks for outbound) and external work integration (WorkIQ scanning for inbound). Trust levels enable context-appropriate oversight without bottlenecking teams.
- ### PR #487 Review & Merge — CLI Docs Expansion (2026-03-22)
- Reviewed and merged PR #487 (CLI documentation expansion + broken docs link fix). Improved CLI command reference coverage and fixed internal link validation.
- **Pattern identified:** Broken internal links hurt user navigation and SEO. Recommendations: (1) add link validation to docs build pipeline (crawl all internal references, report 404s), (2) make validation a CI gate (fail build on broken links), (3) maintain link checklist when refactoring docs structure.
- **Key learning:** Documentation maintenance requires systematic link validation. A single broken link creates friction for users following guides. Automated validation should be non-negotiable in CI/CD.
- ### PR #482 Review & Merge — Pagefind Search Integration (2026-03-22)
- Reviewed and merged PR #482. Search functionality integrated into docs site for improved discoverability.

## Recent preserved tail

- #143 (Human team members now first-class feature)
- #169 (Skills system shipped as core infrastructure)

**8 discussions kept open with substantive replies:**
- #534 (enterprise features) — asked clarifying questions on scope
- #499 (Brady's v1.0 announcement) — explained `.squad/` regenerability plan
- #440 (branch naming change) — acknowledged disruption, offered migration guidance
- #401 (mobile/async control) — acknowledged use case, roadmap signal
- #376 (best practices) — provided triage and routing patterns
- #306 (multi-root support) — acknowledged limitation, kept open for feedback
- #95 (casting system) — explained mature re-casting flow
- #140 (Teams MCP) — critical guidance on Office 365 Connectors retirement → Power Automate Workflows

**Pattern observed:** Feature-release timing + follow-up responses critical for community trust. v0.9.1 directly addressed 5+ discussions (models, skills, human members) that were open 2-4 weeks. Community triage now operational: 14 discussions reviewed, 6 closed, 8 kept active = 43% closure rate on resolved items.

**Key insight:** Retirement of Microsoft Office 365 Connectors (Dec 2024) caught users mid-setup. Proactive notification of Teams Workflows alternative + Power Automate guidance essential for Teams MCP users.

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
