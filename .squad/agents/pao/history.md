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

### Getting Started Guide Structure
docs/src/content/docs/get-started/first-session.md explains Squad's first-run experience. Line 89 introduces .squad/ directory creation, followed by "What's inside .squad/?" section (line 91) with table documenting team.md, routing.md, decisions.md, agents/, ceremonies.md, casting/, skills/, templates/. Includes ownership statement ("You own these files") and commit guidance ("Commit .squad/ to version control").
