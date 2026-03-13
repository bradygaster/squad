# PAO

> Public Affairs Officer

## Learnings

### Docs Build Architecture
docs/ directory contains blog/, concepts/, cookbook/, getting-started/, guide/ sections. Build script produces HTML output for all sections. Blog posts follow numbered naming convention (001-xxx.md through 026-xxx.md).

### Dynamic Blog Test Pattern
docs-build.test.ts discovers blog posts from filesystem instead of hardcoded list. Adding/removing blog posts no longer requires test updates. Other sections (getting-started, guides) still use hardcoded expected lists since they change rarely.

### Contributor Recognition
CONTRIBUTING.md and CONTRIBUTORS.md exist at repo root. Contributors Guide page added in v0.8.24. Each release should include contributor recognition updates.

### Blog Post Format (v0.8.25)
Release blog posts use YAML frontmatter with: title, date, author, wave, tags, status, hero. Hero is one-sentence summary. Body includes experimental warning, What Shipped section with tables/code blocks, Why This Matters section, Quick Stats, What's Next. Keep practical and developer-focused, 200-400 words for infrastructure releases. Tone ceiling enforced: no hype, explain value.

### Roster & Contributor Recognition (v0.8.25)
Squad moved to Apollo 13/NASA Mission Control naming scheme (Flight, Procedures, EECOM, FIDO, PAO, CAPCOM, CONTROL, Surgeon, Booster, GNC, Network, RETRO, INCO, GUIDO, Telemetry, VOX, DSKY, Sims, Handbook). CONTRIBUTORS.md tracks both team roster and community contributors; contributor table entries grow with PRs (append PR counts rather than replace, maintaining attribution history).

### Distributed Mesh Documentation (v0.8.25)
Added distributed-mesh.md to features/ — covers the three zones (local, remote-trusted, remote-opaque), mesh.json config, sync scripts, getting started, and relation to SubSquads/export-import. Feature page follows standard format: experimental warning, sample prompts, practical structure, Microsoft Style Guide (sentence-case headings, active voice, second person). Test assertions updated in same commit — EXPECTED_FEATURES array expanded to include 'distributed-mesh', features directory test added, getAllMarkdownFiles() now includes features/ section. Cross-reference added to multiple-squads.md pointing readers from snapshot-based export/import to continuous distributed mesh.
