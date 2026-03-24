---
name: "docs-catalog-audit"
description: "Systematic methodology for auditing Astro-based docs sites: catalog, navigation, quality, gaps"
domain: "documentation"
confidence: "low"
source: "earned — PAO docs audit session 2026-03-22"
---

## Context

Use this skill when reviewing the docs site for quality, completeness, and navigation integrity — especially after periods of high PR churn where pages get added, moved, or partially updated. The audit is read-only and produces an actionable report.

The docs site uses Astro with content collections at `docs/src/content/docs/` and `docs/src/content/blog/`. Navigation is defined in `docs/src/navigation.ts`.

## Patterns

### 1. Catalog every page first

Read all `.md` files under `docs/src/content/docs/` and `docs/src/content/blog/`. For each, record:
- File path
- Frontmatter title and sidebar label
- Section grouping (from directory structure)
- Approximate length (stub / partial / complete)
- Whether it appears in `navigation.ts`

### 2. Navigation cross-reference

Parse `docs/src/navigation.ts` to extract the full sidebar tree (slugs and labels). Then:
- **Dead links:** Nav entries whose slug has no matching content file
- **Orphaned pages:** Content files not referenced in any nav entry
- **Title mismatches:** Nav label differs from the page's H1 or frontmatter title

### 3. Per-page quality checklist

For each page, evaluate:

| Dimension | What to check |
|-----------|--------------|
| **Completeness** | Stub (placeholder only), partial (missing sections), or complete |
| **Freshness** | Version references current? Install commands current? API names current? |
| **Tone** | Microsoft Style Guide: sentence-case headings, active voice, "you", present tense |
| **Scannability** | Paragraphs for narrative, bullets for scannable lists, tables for comparisons |
| **Cross-linking** | Links to related pages? Links valid (no broken anchors)? |
| **Duplicate headings** | Merge artifacts often leave duplicate `##` headings — check for these |

### 4. Duplicate and overlap detection

Flag any concept explained in multiple places. Common patterns:
- Root-level legacy files that were superseded by reorganized section pages
- "Choosing X" pages that cover the same ground with different titles
- FAQ answers that duplicate content from feature pages

### 5. Gap analysis

Ask: "What would a new user expect to find that isn't here?" Common gaps:
- FAQ or "I'm stuck" page not in sidebar
- Role/feature reference pages written but not linked
- Troubleshooting for major platforms (VS Code, CLI) not discoverable
- Changelog or "what's new" that's stale

### 6. Report format

Produce a structured report with:
- **Page catalog table:** Path, status (✅/🟡/🔴), notes
- **Navigation findings:** Dead links, orphans, ordering concerns
- **Duplicate conflicts:** Which pages overlap and which to keep
- **Gap analysis:** Missing content a new user would expect
- **Top 5 urgent issues:** Ranked by user impact
- **Action table:** Numbered, specific, with file paths and priority

### 7. Automated guard (recommended follow-up)

After an audit, recommend adding a nav-gap test to `test/docs-build.test.ts`:
- Every `.md` file in the content tree should either appear in `navigation.ts` OR be explicitly listed in an allowlist of standalone pages
- This prevents future orphans from accumulating silently

## Examples

Audit trigger scenarios:
- "Review the docs catalog" — full audit
- "Check for orphaned pages" — nav cross-reference only (steps 1-2)
- "Are the docs stale?" — freshness check only (step 3, freshness dimension)
- After a batch of doc PRs — quick re-audit focusing on changed files

Status ratings:
- ✅ Good — complete, current, well-formatted, in nav
- 🟡 Needs work — minor issues (formatting, missing cross-links, not in nav but not critical)
- 🔴 Problem — stale version refs, broken install commands, high-value page invisible from nav

## Anti-Patterns

- **Don't make changes during an audit.** This is a read-only assessment. Fixes come after the report is reviewed.
- **Don't audit blog posts for nav presence.** Blog posts live in their own collection and aren't expected in the sidebar.
- **Don't flag every missing cross-link.** Focus on pages that are conceptually related and would benefit a user navigating between them.
- **Don't treat all orphans equally.** A legacy duplicate at root is a 🔴 (confusing); a niche guide not yet linked is a 🟡 (low urgency).
- **Don't skip the root-level legacy check.** Root-level `.md` files outside section folders are the most common source of stale content after reorganizations.
