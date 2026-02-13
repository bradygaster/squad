# Proposal 029: Marketing Site — Jekyll on GitHub Pages

**Status:** Draft  
**Author:** Keaton (Lead)  
**Requested by:** bradygaster  
**Date:** 2026-02-10  
**Domain:** Infrastructure, Marketing, Documentation  

---

## Problem

Squad has extensive, well-structured documentation in `docs/` — guide, features, scenarios, tours, sample prompts. It's all markdown. It's all public. It ships to users via `package.json` `files`. But it renders as raw markdown on GitHub. There's no HTML site. No marketing presence. No landing page a developer can send to their manager.

Brady wants a marketing site. His priorities, in order:

1. **No content reproduction.** One source of truth.
2. **HTML output.** Docs rendered as a real website.

The worst outcome is two copies of the same content — a `docs/` directory AND a `site/` directory with the same words in different formats.

---

## Decision: Jekyll on GitHub Pages

**This is the only correct answer** for this project. Here's why:

### Why Jekyll

- **GitHub Pages runs Jekyll natively.** Zero build config, zero CI setup, zero Docker containers. Push markdown, get HTML. The simplest possible deployment.
- **Jekyll renders markdown files in-place.** You don't copy files to a build directory. You add YAML front matter to existing `.md` files and Jekyll renders them as HTML where they sit. The `docs/` directory IS the site source.
- **The docs already exist.** We have 20+ markdown files across `docs/`, `docs/features/`, `docs/scenarios/`. Jekyll consumes them directly. No migration, no transformation, no second copy.
- **GitHub Pages is free.** No hosting costs, no CDN configuration, no SSL certificates to manage.
- **It's what Brady asked for.** "GitHub Pages or Jekyll" — they're the same thing in this context.

### Why not other options

| Alternative | Why not |
|------------|---------|
| **Next.js / Docusaurus / VitePress** | Requires a build step, a `package.json` for the site, a separate `src/` or `pages/` directory. Content reproduction is inevitable. Over-engineered for a docs site. |
| **Hugo** | Not natively supported by GitHub Pages. Requires a CI action to build. Adds a dependency we don't need. |
| **Raw HTML** | Manual maintenance nightmare. Defeats the purpose of having markdown docs. |
| **GitHub Wiki** | Can't be themed. Can't be a marketing landing page. Separate from the repo. |
| **Separate repo for the site** | Content reproduction by definition. Two places to update. Guaranteed drift. |

---

## No-Reproduction Strategy

This is the core architectural constraint. Every decision flows from it.

### The `docs/` directory IS the Jekyll source

Jekyll doesn't need a separate project structure. It needs:

1. A `_config.yml` at the source root
2. YAML front matter (`---` blocks) on files it should render
3. Optionally, `_layouts/` and `_includes/` for theming

**The `docs/` folder becomes the Jekyll source root.** GitHub Pages is configured to serve from `docs/` on main. Jekyll processes every `.md` file in `docs/` that has front matter and renders it as HTML. Files without front matter are served as-is.

### What this means concretely

```
docs/
├── _config.yml              ← NEW: Jekyll configuration
├── _layouts/
│   └── default.html         ← NEW: Base HTML layout
│   └── page.html            ← NEW: Content page layout
├── _includes/
│   └── nav.html             ← NEW: Navigation partial
├── assets/
│   └── css/
│       └── style.css        ← NEW: Minimal styling
├── index.md                 ← NEW: Landing page (replaces README.md as site root)
├── README.md                ← MODIFIED: Add front matter (permalink: /about/)
├── guide.md                 ← MODIFIED: Add front matter only
├── sample-prompts.md        ← MODIFIED: Add front matter only
├── tour-first-session.md    ← MODIFIED: Add front matter only
├── tour-github-issues.md    ← MODIFIED: Add front matter only
├── features/
│   ├── *.md                 ← MODIFIED: Add front matter only
├── scenarios/
│   ├── *.md                 ← MODIFIED: Add front matter only
```

### What "add front matter" means

Every existing `.md` file gets a 3-5 line YAML block prepended. Example for `guide.md`:

```yaml
---
layout: page
title: "Product Guide"
description: "Complete reference for all Squad features"
nav_order: 1
---
# Squad — Product Guide
...existing content unchanged...
```

That's it. The content below the front matter is untouched. Jekyll reads the YAML, applies the layout, and renders the markdown as HTML inside the layout template. **Zero content duplication.**

### The index.md question

`docs/README.md` currently serves as the documentation index on GitHub (GitHub renders `README.md` automatically in directory views). For Jekyll, we need an `index.md` (or the README needs `permalink: /`). Two options:

**Option A (recommended): Create `docs/index.md` as a landing page.** This is new content — a marketing-oriented landing page with hero section, value props, and links to docs. `README.md` keeps its current role as the GitHub directory index. `index.md` becomes the site homepage. Minimal reproduction because the landing page content is marketing copy, not documentation.

**Option B: Add front matter to README.md with `permalink: /`.** README serves double duty as GitHub index and site homepage. Simpler but constrains the homepage to be documentation-structured rather than marketing-structured.

**I'm going with Option A.** The landing page and the docs index serve different audiences. A developer browsing the GitHub repo needs a file listing. A developer hitting the website needs "what is this and why should I care?" in 10 seconds. These are different content with different structures.

---

## Changes to Existing Files

### Files that need front matter added

Every `.md` file in `docs/` gets front matter prepended. This is a mechanical change — no content modifications.

| File | `title` | `nav_order` |
|------|---------|-------------|
| `docs/README.md` | Documentation | 0 |
| `docs/guide.md` | Product Guide | 1 |
| `docs/sample-prompts.md` | Sample Prompts | 2 |
| `docs/tour-first-session.md` | First Session | 10 |
| `docs/tour-github-issues.md` | GitHub Issues Tour | 11 |
| `docs/features/*.md` (8 files) | Per-feature titles | 20-28 |
| `docs/scenarios/*.md` (5 files) | Per-scenario titles | 30-35 |

### New files

| File | Purpose |
|------|---------|
| `docs/_config.yml` | Jekyll configuration |
| `docs/index.md` | Marketing landing page |
| `docs/_layouts/default.html` | Base HTML shell |
| `docs/_layouts/page.html` | Content page template |
| `docs/_includes/nav.html` | Navigation sidebar/menu |
| `docs/assets/css/style.css` | Minimal styling |

### Files NOT changed

- `team-docs/` — internal, never on the site
- `.ai-team/` — runtime state, never on the site
- `README.md` (root) — repo README, separate from docs site
- `index.js`, `package.json`, `templates/` — product code, untouched

---

## GitHub Pages Configuration

### Repository settings

- **Source:** Deploy from branch
- **Branch:** `main`
- **Folder:** `/docs`

This is configured in the GitHub UI under Settings → Pages. No GitHub Actions workflow needed for Phase 1 — GitHub Pages builds Jekyll natively when configured this way.

### `docs/_config.yml`

```yaml
title: Squad
description: AI agent teams that grow with your code
url: https://bradygaster.github.io
baseurl: /squad

# Theme — use a minimal theme or no theme (custom layouts)
# Option 1: GitHub's built-in minimal theme
# remote_theme: pages-themes/minimal@v0.2.0
# Option 2: Custom layouts only (recommended for control)
plugins:
  - jekyll-seo-tag

# Markdown rendering
markdown: kramdown
kramdown:
  input: GFM

# Exclude internal files that happen to be in docs/
exclude:
  - README.md   # GitHub directory index, not a site page

# Collections or defaults for front matter
defaults:
  - scope:
      path: "features"
    values:
      layout: page
      category: features
  - scope:
      path: "scenarios"
    values:
      layout: page
      category: scenarios
  - scope:
      path: ""
    values:
      layout: page
```

### Why no GitHub Actions deploy workflow

GitHub Pages has two modes:

1. **Classic:** Jekyll build from a branch/folder. Zero config. Push and it deploys.
2. **Actions:** Custom build pipeline. Needed for non-Jekyll SSGs.

We're using Jekyll. Classic mode is correct. Adding an Actions workflow is unnecessary complexity. If we later need custom build steps (e.g., for a non-Jekyll plugin), we can add it then.

---

## Content Strategy

### What goes on the site

Everything in `docs/` — this is the public-facing documentation that already ships to users:

- **Landing page** (`index.md`) — marketing-oriented: what is Squad, why it matters, install command, link to guide
- **Product guide** (`guide.md`) — the complete reference
- **Feature pages** (`features/*.md`) — individual feature deep-dives
- **Scenario walkthroughs** (`scenarios/*.md`) — task-oriented guides
- **Tours** (`tour-*.md`) — step-by-step first experiences
- **Sample prompts** (`sample-prompts.md`) — copy-paste ready demos

### What stays internal (never on the site)

- `team-docs/` — proposals, sprint plans, blog drafts, release process
- `.ai-team/` — agent state, charters, histories, decisions, skills
- Root `README.md` — repo-level README (distinct from docs site homepage)

### What about the blog?

`team-docs/blog/` has draft blog posts. These are internal drafts today. If Brady wants a blog on the site, that's a Phase 2 decision. The architecture supports it — add a `docs/_posts/` directory and Jekyll renders a blog automatically. But Phase 1 doesn't touch blogs.

---

## Phase 1 Scope: Minimal Viable Site

**Goal:** Get `docs/` rendering as an HTML site on GitHub Pages with navigation and minimal styling. No new content except the landing page.

### Phase 1 deliverables

1. **`docs/_config.yml`** — Jekyll configuration pointing at custom layouts
2. **`docs/index.md`** — Landing page with hero, install command, value props, links to guide
3. **`docs/_layouts/default.html`** — Base HTML: head, nav, content area, footer
4. **`docs/_layouts/page.html`** — Content page inheriting from default
5. **`docs/_includes/nav.html`** — Navigation listing all docs pages
6. **`docs/assets/css/style.css`** — Clean, minimal CSS. No framework. Mobile-friendly.
7. **Front matter on all 16 existing `.md` files** — layout, title, nav_order
8. **GitHub Pages enabled** in repo settings (manual step by Brady)

### Phase 1 does NOT include

- Custom domain (e.g., `squad.dev`) — Phase 2
- Blog / changelog page — Phase 2
- Search — Phase 2
- Analytics — Phase 2
- Custom Jekyll theme — Phase 2 (start with custom layouts, theme later if needed)
- `team-docs/` content on the site — never

### Estimated effort

- **Front matter additions:** 30 minutes (mechanical, could be scripted)
- **`_config.yml` + layouts + includes:** 2-3 hours
- **Landing page (`index.md`):** 1-2 hours (McManus territory — marketing copy)
- **CSS:** 1-2 hours
- **Testing locally with `jekyll serve`:** 30 minutes
- **GitHub Pages enable:** 5 minutes (Brady in repo settings)

**Total: 5-8 hours.** This is a McManus + Fenster job. McManus writes the landing page and CSS direction. Fenster handles the Jekyll infrastructure. I review.

---

## Trade-offs

| Decision | Upside | Downside |
|----------|--------|----------|
| `docs/` as Jekyll source (no separate site dir) | Zero content reproduction | Jekyll files (`_config.yml`, `_layouts/`) live in `docs/`, which ships to npm users |
| Front matter on existing files | Jekyll renders them as HTML | Slight visual noise in raw markdown on GitHub (front matter is hidden by GitHub's renderer, so actually no downside) |
| Custom layouts over a theme | Full control over design | More upfront work than `remote_theme` |
| No Actions workflow | Simpler, fewer moving parts | Can't use Jekyll plugins not on GitHub's allowlist |
| Landing page separate from README | Marketing-optimized homepage | One more file to maintain |

### The npm shipping question

`docs/` is in `package.json` `files` — it ships to users. Jekyll infrastructure files (`_config.yml`, `_layouts/`, `_includes/`) will also ship. This is harmless — they're small files that don't affect functionality — but it's worth noting. If it bothers anyone, we can add them to `.npmignore`. But I'd rather not add exclusion rules for files that cause no harm.

---

## Success Criteria

1. `https://bradygaster.github.io/squad/` renders a styled landing page
2. All 16 existing docs pages render as HTML with navigation
3. Zero content is duplicated — every word lives in exactly one `.md` file
4. Adding a new doc page requires: create `.md` file, add front matter, commit. Nothing else.
5. `docs/README.md` still renders correctly when browsing `docs/` on GitHub

---

## Alternatives Considered

1. **Docusaurus** — React-based, great docs sites, but requires `npm run build`, a `docusaurus.config.js`, and a `docs/` → `build/` pipeline. Content reproduction by design.
2. **VitePress** — Vue-based, fast, beautiful. Same problem: separate build output, `.vitepress/` directory, content transformation pipeline.
3. **Astro** — Modern, flexible. Massive overkill for a docs site. Build step required.
4. **GitHub's built-in markdown rendering** — What we have today. No navigation, no theming, no landing page, no SEO.
5. **Separate `site/` directory** — Jekyll source in `site/`, importing from `docs/` via symlinks or includes. Adds complexity, fragile on Windows, and violates the "no reproduction" constraint even if technically it's linking rather than copying.

All rejected. Jekyll-in-`docs/` is the only architecture that satisfies both constraints simultaneously.

---

## Recommendation

**Approve and assign to McManus (content/design direction) + Fenster (Jekyll infrastructure).** Phase 1 is 5-8 hours of work with zero risk to the product codebase. No `index.js` changes. No new dependencies. The only code-adjacent change is adding YAML front matter to existing markdown files, which GitHub's renderer hides anyway.

Brady enables GitHub Pages in repo settings after the PR merges. That's it.
