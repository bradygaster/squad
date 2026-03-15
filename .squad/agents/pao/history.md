# PAO

## Core Context

Docs use plain markdown without Astro frontmatter. Structure: H1 title, experimental warning callout, "Try this" code blocks at top, overview, HR, then H2 sections. Microsoft Style Guide enforced (see docs-standards skill).

## Patterns

**Dynamic blog test pattern:** docs-build.test.ts discovers blog posts from filesystem instead of hardcoded list. Adding/removing blog posts no longer requires test updates.

**Contributor recognition:** CONTRIBUTING.md and CONTRIBUTORS.md exist at repo root. Each release includes contributor recognition updates.

**Blog post format:** Release posts use YAML frontmatter with: title, date, author, wave, tags, status, hero. Body includes experimental warning, What Shipped section, Why This Matters, Quick Stats, What's Next. 200-400 words for infrastructure releases. No hype, explain value.

**Roster:** Apollo 13/NASA Mission Control naming scheme. CONTRIBUTORS.md tracks both team roster and community contributors.

**Scannability framework:** Paragraphs for narrative (3-4 sentences max). Bullets for scannable items. Tables for comparisons/structured data. Quotes for callouts/warnings. Decision test: if reader hunts for one item in a paragraph, convert to bullets/table.

**Boundary review:** Squad docs = "how the feature works + universal best practices". IRL = "how one person built an amazing setup". If Squad doesn't ship the code, it's IRL content.

**Distributed mesh docs:** Added distributed-mesh.md to features/ covering three zones, mesh.json config, sync scripts, getting started. Test assertions updated in same commit.

**Skill scope documentation pattern:** Add "Skill scope" section to zero-code skills documenting what the skill produces (config files, decision entries, template pointers) and what it does NOT produce (code, tests, custom scripts). Helps agents understand when to copy templates vs generate code.
