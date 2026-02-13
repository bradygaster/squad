# Session: 2026-02-10 — Marketing Site Planning

**Requested by:** bradygaster

## Who Worked

- **Keaton** — Proposal 029: marketing site architecture (Jekyll on GitHub Pages, docs/ is Jekyll source, no content reproduction)
- **McManus** — Proposal 029a: marketing site content plan (content audit, landing page copy, blog integration, navigation design)
- **Brady** — directives captured

## Decisions Made

1. Jekyll on GitHub Pages. Markdown in docs/ is single source of truth. No content reproduction.
2. Blog content included on site via Jekyll collection from team-docs/blog/.
3. GitHub Issues/PR integration must not break CLI conversations — CLI is primary.

## Key Outcomes

- Proposal 029 defines architecture: Jekyll renders docs/*.md in place, GitHub Pages serves from docs/ on main branch.
- Proposal 029a defines content rules: docs render directly, blog uses status frontmatter, landing page is separate from README, team-docs and .ai-team excluded from site.
- Brady's facts-only directive applies to all public-facing material.
