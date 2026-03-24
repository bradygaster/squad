# Skill: Docs Nav Audit

**Domain:** Documentation  
**Trigger phrases:** docs audit, nav audit, orphaned pages, navigation gap, docs catalog  
**Agent roles:** pao, scribe  
**Confidence:** High (pattern validated across full docs catalog audit)

---

## What This Skill Does

Performs a systematic cross-reference between a navigation config file and actual content files to identify:

1. **Dead nav links** — nav entries with no backing content file
2. **Orphaned pages** — content files with no nav entry
3. **Stale content** — pages with outdated version numbers, deprecated commands, or old directory names
4. **Duplicate/overlap** — concepts explained in multiple places (violates "one canonical page per concept")
5. **Format violations** — pages that don't follow the established format standard

## What This Skill Does NOT Produce

- Does not make file changes (read-only audit pattern)
- Does not rewrite content (separate task)
- Does not update navigation.ts (separate task requiring docs-test-sync)

---

## How to Run This Audit

### Step 1: Map nav slugs

Read the navigation config (e.g., `docs/src/navigation.ts`). Extract all slugs from `NAV_SECTIONS` and `STANDALONE_PAGES` into a flat list.

### Step 2: Map content files

List all `.md` files under `docs/src/content/docs/` recursively. Normalize each to a slug by removing the `.md` extension and the base path prefix.

### Step 3: Cross-reference

```
orphaned   = content_files - nav_slugs      # files with no nav entry
dead_links = nav_slugs - content_files      # nav entries with no file
```

### Step 4: Spot-check stale content

For each page, check for:
- Version numbers in H2 headings vs. current release (read `CHANGELOG.md` or `whatsnew.md`)
- Deprecated install commands: `npx github:bradygaster/squad`, `@bradygaster/create-squad`
- Old directory names: `.ai-team/`, `.ai-team-templates/`
- Deprecated distribution paths: `npx github:...`

### Step 5: Check format standards

Each page should have:
- H1 title (no frontmatter in Squad docs)
- Experimental warning callout immediately after H1
- "Try this" code block early on
- Horizontal rule (`---`) before content sections
- H2 headings (sentence case)

### Step 6: Identify duplicates

Flag pairs where:
- Two pages cover the same concept (check H1, intro paragraph, and first H2 section)
- A root-level file duplicates a file in a subdirectory
- A legacy "tour" page duplicates a current "get-started" page

---

## Report Format

Produce a report with:

1. **Page catalog table** — title, path, nav status, word count (~), status badge
2. **Orphaned pages list** — grouped by directory
3. **Dead nav links list** — with suggested fix
4. **Top issues** — ordered by user impact
5. **Recommended actions** — specific, actionable, ordered

### Status badge legend

| Badge | Meaning |
|-------|---------|
| ✅ Good | Complete, current, in nav, format-correct |
| 🟡 Needs work | Minor issues: orphaned, format gap, minor staleness |
| 🔴 Problem | Urgent: stale commands, dead link, high-value orphan |

---

## Known Patterns in This Codebase

- Root-level files in `docs/src/content/docs/` that predate the Astro rewrite are legacy artifacts; treat as 🔴 unless recently added
- `insider-program.md` historically drifts stale (uses deprecated install paths)
- `whatsnew.md` drifts after each release — check H2 version against `CHANGELOG.md`
- "Tour" pages (`tour-*.md`) are legacy walkthroughs superseded by the `get-started/` section
- The `features/` directory accumulates pages faster than nav gets updated — check for unlisted features on every audit
