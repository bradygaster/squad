# PAO

> Public Affairs Officer

## Core Context

Docs live in docs/ with blog/, concepts/, cookbook/, getting-started/, guide/, features/, scenarios/ sections. Blog tests use filesystem discovery (dynamic); other sections use hardcoded expected arrays. Microsoft Style Guide enforced: sentence-case headings, active voice, second person, present tense. Docs format: plain markdown, H1 title, experimental warning, "Try this" code blocks, overview, HR, H2 content sections. Scannability framework: paragraphs for narrative, bullets for scannable items, tables for comparisons.

## Recent Learnings

### Release Playbook Rewrite (#564, 2026-07-22)
Rewrote PUBLISH-README.md from v0.8.22 stub (58 lines) to living 232-line version-agnostic playbook with 11 sections: Overview, Pre-Flight Checklist, Publish via CI (recommended), workflow_dispatch fallback, Insider Channel, Workspace Publish Policy, Manual Local Publish, 422 Race Condition & npm Errors, Post-Publish Verification, Version Bump, Legacy Scripts. Pattern: living playbook absorbs multiple issues (#558, #559, #560) into unified decision tree. Microsoft Style Guide enforced; `<VERSION>` placeholder; all commands copy-pasteable.

📌 **Team update (2026-03-24T06-release-hardening):** Release playbook rewrite (#564) completed. Absorbed issues #558, #559, #560 into unified decision tree.

### JSDoc API Reference PRD (2026-03-24)
Full PRD at `docs/research/jsdoc-api-reference-prd.md`. Key decisions: TypeDoc + typedoc-plugin-markdown (not Starlight, not api-extractor) — zero migration, Markdown-first, Pagefind-compatible. Astro integration hook auto-runs TypeDoc on build. Output → `docs/src/content/docs/reference/api/`. JSDoc improvement priority: config/schema.ts (8%→100%), state/io/ @param/@return tags. Total effort: 13–18 hours. PRD structure: chosen path + tactical roadmap (not advisory — directive).

### Community Engagement Wave (2026-03-24)
6 discussions closed as resolved (features shipped in v0.9.1: per-agent models #463/#402, local-only #324, CLI vs agent #299, human members #143, skills system #169). 8 discussions kept open with substantive replies. Pattern: feature-release timing + follow-up responses critical for community trust. **Teams MCP critical:** Office 365 Connectors retired Dec 2024 → Power Automate Workflows is successor. Purge all old connector references.

## Historical Learnings Summary (condensed)

- **Discussion triage pattern:** When you ship features, search discussions for matching feature-requests → respond + close proactively. Map new features to open discussions; respond with version + docs link; close as resolved; consolidate duplicates; convert bugs/roadmap items to issues. 43% closure rate on resolved items.
- **Docs-test sync:** When adding docs pages, update test assertions in docs-build.test.ts in the SAME commit. When rebasing doc PRs, main branch (already merged) takes priority.
- **Boundary review:** "Squad Ships It" litmus test — if Squad doesn't ship the code, it's IRL content. Platform features: clarify whose feature it is. Delete external infrastructure docs; reframe platform integration docs; keep Squad behavior/config docs. Pattern from PR #331.
- **Astro docs format:** Plain markdown, H1 title, experimental warning callout, "Try this" code blocks at top, overview paragraph, HR, then H2 sections. No Astro frontmatter. DOCS-TEST SYNC mandatory.
- **Scannability framework:** Paragraphs for narrative (3-4 sentences max). Bullets for scannable items. Tables for comparisons. If reader hunts for one item in a paragraph → convert to bullets/table.
- **npx purge:** `npm install -g @bradygaster/squad-cli` is only supported install path. Remove all user-facing `npx` references. Keep `npx` only for dev tools (changeset, vitest, astro, pagefind). Agency copilot example → `gh copilot`.
- **README slimming:** README cut from 512 to 331 lines. SDK deep-dive → compact pointer to docs site. README = discovery/orientation; docs site = full reference.
- **Docs catalog audit:** 15 orphaned pages (exist but not in navigation.ts). Stale content: whatsnew.md, insider-program.md. Duplicate/overlap pairs. Booster added automated version sync for whatsnew.md. Nav structure: zero dead links, all orphans reachable internally.
- **PR Trust Model:** Three levels: Full review (default), Selective review (personal projects), Self-managing (solo personal repos only). Self-managing ≠ unmonitored — use Ralph + Teams notifications.
- **JSDoc API Reference Research:** TypeDoc + typedoc-plugin-markdown. Squad SDK 60-80% JSDoc coverage. Research at `docs/research/jsdoc-api-reference-research.md`. Configuration templates, 4-phase roadmap, tool comparison matrix.
- **v0.9.0 blog post format:** YAML frontmatter (title/date/author/wave/tags/status/hero) → experimental warning → "What Shipped" (H2 sections + callout boxes) → "Quick Stats" → "Breaking Changes" → "Upgrading" → "What's Next". 200-400 words for infrastructure releases. EXPECTED_BLOG uses filesystem scan — no test changes needed.
- **PR #11 TypeDoc review (2026-03-24):** Generated docs require crosslinks from curated guides. When adding new docs section, ensure old curated page has a visible pointer to the new section. Blocking issues: missing sdk.md crosslink banner, navigation URL inconsistency (`reference/api/index` → `reference/api`).
- **Contributor recognition:** CONTRIBUTORS.md tracks team roster + community contributors. Each release includes recognition updates. Append PR counts, don't replace.