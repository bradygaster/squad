# Proposal 029a: Marketing Site Content Plan

**Author:** McManus (DevRel)
**Date:** 2026-02-10
**Status:** Proposed

---

## Summary

Content plan for the Squad marketing site. Built on Jekyll / GitHub Pages. Two priorities in order: (1) no content reproduction — docs live in one place and render on the site, (2) content lives in HTML format via Jekyll's markdown-to-HTML pipeline.

---

## 1. Site Structure / Information Architecture

```
squad.dev (or GitHub Pages)
├── /                          → Landing page (hero, install, what Squad is)
├── /docs/                     → Docs hub (maps to docs/README.md)
│   ├── /docs/guide/           → Product Guide (docs/guide.md)
│   ├── /docs/sample-prompts/  → Sample Prompts (docs/sample-prompts.md)
│   ├── /docs/features/        → Feature reference
│   │   ├── ceremonies/        → docs/features/ceremonies.md
│   │   ├── export-import/     → docs/features/export-import.md
│   │   ├── github-issues/     → docs/features/github-issues.md
│   │   ├── human-team-members/→ docs/features/human-team-members.md
│   │   ├── memory/            → docs/features/memory.md
│   │   ├── prd-mode/          → docs/features/prd-mode.md
│   │   ├── response-modes/    → docs/features/response-modes.md
│   │   └── skills/            → docs/features/skills.md
│   ├── /docs/walkthroughs/    → Guided tours
│   │   ├── first-session/     → docs/tour-first-session.md
│   │   └── github-issues/     → docs/tour-github-issues.md
│   └── /docs/scenarios/       → Use-case scenarios
│       ├── new-project/       → docs/scenarios/new-project.md
│       ├── existing-repo/     → docs/scenarios/existing-repo.md
│       ├── upgrading/         → docs/scenarios/upgrading.md
│       ├── team-portability/  → docs/scenarios/team-portability.md
│       └── issue-driven-dev/  → docs/scenarios/issue-driven-dev.md
├── /blog/                     → Blog (published posts from team-docs/blog/)
└── /getting-started/          → Redirect or alias to /docs/walkthroughs/first-session/
```

### Why this structure

- **`/docs/` mirrors the `docs/` directory exactly.** No reproduction. Jekyll reads the markdown files in place. Front matter is the only addition needed — and it's added to the source files, not duplicated elsewhere.
- **`/blog/` pulls from `team-docs/blog/`** but only posts with `status: published`. Draft posts stay invisible.
- **`/getting-started/` is an alias**, not a separate page. It points to the first-session walkthrough because that's the content a new developer needs.
- **No `/about/` page.** The landing page covers what Squad is. A separate about page would reproduce README content.

---

## 2. Content Audit

Every file in `docs/` reviewed and categorized.

### Ready for the site as-is (just needs Jekyll front matter)

| File | Site path | Notes |
|------|-----------|-------|
| `docs/README.md` | `/docs/` | Doc hub / index. Clean, well-structured. Add `layout: docs`, `title`, `permalink`. |
| `docs/guide.md` | `/docs/guide/` | Complete product guide. 440+ lines, covers every feature. Production-ready. |
| `docs/tour-first-session.md` | `/docs/walkthroughs/first-session/` | Step-by-step walkthrough. Clean terminal examples. Ready. |
| `docs/tour-github-issues.md` | `/docs/walkthroughs/github-issues/` | Full issue workflow tour. Ready. |
| `docs/features/ceremonies.md` | `/docs/features/ceremonies/` | Ready. |
| `docs/features/export-import.md` | `/docs/features/export-import/` | Ready. |
| `docs/features/github-issues.md` | `/docs/features/github-issues/` | Ready. |
| `docs/features/human-team-members.md` | `/docs/features/human-team-members/` | Ready. |
| `docs/features/memory.md` | `/docs/features/memory/` | Ready. |
| `docs/features/prd-mode.md` | `/docs/features/prd-mode/` | Ready. |
| `docs/features/response-modes.md` | `/docs/features/response-modes/` | Ready. |
| `docs/features/skills.md` | `/docs/features/skills/` | Ready. |
| `docs/scenarios/new-project.md` | `/docs/scenarios/new-project/` | Ready. |
| `docs/scenarios/existing-repo.md` | `/docs/scenarios/existing-repo/` | Ready. |
| `docs/scenarios/upgrading.md` | `/docs/scenarios/upgrading/` | Ready. |
| `docs/scenarios/team-portability.md` | `/docs/scenarios/team-portability/` | Ready. |
| `docs/scenarios/issue-driven-dev.md` | `/docs/scenarios/issue-driven-dev/` | Ready. |

### Needs editing before going public

| File | Issue | Action needed |
|------|-------|---------------|
| `docs/sample-prompts.md` | File is 40KB+. Large for a single page. | Consider splitting into categories (Quick Builds, Full Projects, Feature Showcases) with a hub page linking to each. Or keep as one long page with a sticky table of contents. Either works — splitting is lower priority. |

### Not site content (internal only)

| File | Reason |
|------|--------|
| `docs/assets/` | Empty directory. Not content. |

**Summary: 17 of 18 docs files are ready for the site as-is. One needs a formatting decision (sample-prompts.md). Zero files need substantive rewrites.**

The docs are in good shape. Brady and the team wrote public-facing content from the start. The three-tier separation (docs = public, team-docs = internal, .ai-team = runtime) paid off — everything in `docs/` was always intended for users.

---

## 3. Landing Page Copy

### Hero Section

```
Squad

AI agent teams for any project.

Describe what you're building. Get a team of specialists that live in
your repo, persist across sessions, and get better the more you use them.

npx github:bradygaster/squad
```

### Below the fold — three columns

```
┌─────────────────────┬──────────────────────┬──────────────────────┐
│  Parallel agents    │  Persistent memory   │  Git-native          │
│                     │                      │                      │
│  Say "team, build   │  Agents write what   │  .ai-team/ commits   │
│  the login page."   │  they learn to       │  with your code.     │
│  Frontend, backend, │  history.md. After   │  Clone the repo,     │
│  tester — all       │  a few sessions,     │  get the team.       │
│  launched at once,  │  they know your      │  Anyone who joins     │
│  each in its own    │  conventions and     │  inherits the        │
│  context window.    │  stop asking.        │  team's knowledge.   │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

### Quick start block (visible without scrolling on desktop)

```
1. Install
   npx github:bradygaster/squad

2. Open Copilot and tell it what you're building
   "I'm starting a recipe app with React and Node. Set up the team."

3. Your team forms and gets to work
```

### What it is — one paragraph

```
Squad gives you an AI development team through GitHub Copilot.
Each team member runs in its own context window with its own memory.
They share decisions, learn your codebase, and work in parallel.
The team persists as files in your repo — committable, cloneable,
portable.
```

### Requirements footer

```
Requires Node.js 22+ and GitHub Copilot CLI. Experimental.
```

**No taglines, no adjectives, no promises.** Every sentence states a fact about what the software does. This matches the "straight facts" directive.

---

## 4. Navigation Design

### Top nav (persistent across all pages)

```
[Squad]  Docs  Features  Blog  GitHub
```

- **Squad** — home link (logo/wordmark)
- **Docs** — links to `/docs/` hub
- **Features** — links to `/docs/features/` (or a dedicated features index)
- **Blog** — links to `/blog/`
- **GitHub** — external link to `github.com/bradygaster/squad`

### Docs sidebar (visible on all `/docs/*` pages)

```
Getting Started
  First Session
  New Project
  Existing Repo

Guide
  Product Guide
  Sample Prompts

Features
  Ceremonies
  Export & Import
  GitHub Issues
  Human Team Members
  Memory System
  PRD Mode
  Response Modes
  Skills System

Scenarios
  New Project
  Existing Repo
  Upgrading
  Team Portability
  Issue-Driven Dev

Walkthroughs
  First Session
  GitHub Issues
```

### How a developer navigates

1. **Lands on `/`** → sees what Squad is, the install command, and the three value pillars (parallel agents, persistent memory, git-native).
2. **Clicks "Docs"** → sees the doc hub with categorized links. Picks what they need.
3. **Clicks "Getting Started"** (or `/getting-started/`) → first-session walkthrough. This is the golden path.
4. **Clicks a feature** → standalone feature page with usage, examples, and CLI commands.
5. **Clicks "Blog"** → chronological list of published posts.
6. **From any docs page**, the sidebar provides full navigation without going back to the hub.

### Mobile nav

Hamburger menu. Same hierarchy, collapsed. Sidebar becomes a slide-out drawer on docs pages.

---

## 5. Blog Integration

### Source

Blog posts live in `team-docs/blog/`. Each post has YAML front matter with a `status` field.

### Filtering

Only posts with `status: published` appear on the site. Posts with `status: draft` are excluded.

### Current blog inventory

| File | Title | Status | Site? |
|------|-------|--------|-------|
| `001-wave-0-the-team-that-built-itself.md` | Wave 0: The Team That Built Itself | published | ✅ |
| `001a-the-squad-squad-problem.md` | The Squad Squad Problem | published | ✅ |
| `001b-meet-the-squad.md` | Meet the Squad | published | ✅ |
| `001c-first-pr-amolchanov.md` | PR #1: Worktree Awareness... | published | ✅ |
| `002-first-community-pr.md` | First Community PR | published | ✅ |
| `003-super-bowl-weekend.md` | Super Bowl Weekend Sprint | **draft** | ❌ |
| `004-v020-release.md` | v0.2.0: Your Squad Comes With You | published | ✅ |
| `005-v030-give-it-a-brain.md` | v0.3.0 Preview: Give It a Brain | **draft** | ❌ |
| `template.md` | (template) | N/A | ❌ |

**6 published posts ready for the site. 2 drafts excluded. Template excluded.**

### Jekyll implementation

Blog posts need to be in a `_posts/` directory (Jekyll convention) or a custom collection. Two approaches:

**Option A: Symlink / copy at build time.** A Jekyll plugin or build script reads `team-docs/blog/`, filters by `status: published`, and copies qualifying posts to `_posts/`. This keeps the source of truth in `team-docs/blog/` and avoids reproduction.

**Option B: Jekyll collection pointing at `team-docs/blog/`.** Define a custom collection in `_config.yml`:

```yaml
collections:
  blog:
    output: true
    permalink: /blog/:title/
collections_dir: team-docs
```

This tells Jekyll to read from `team-docs/blog/` directly. The `status` field is used in the template to filter drafts:

```liquid
{% for post in site.blog %}
  {% if post.status == "published" %}
    <!-- render post -->
  {% endif %}
{% endfor %}
```

**Recommendation: Option B.** No reproduction. No build scripts. Jekyll reads the files where they already live. The `status` field already exists in every post's front matter.

### Blog page layout

- `/blog/` — reverse-chronological list with title, date, hero sentence, and author
- `/blog/{slug}/` — full post

---

## 6. What's NOT on the Site

Explicitly excluded from the marketing site:

| What | Where it lives | Why it's excluded |
|------|---------------|-------------------|
| `team-docs/proposals/` | Internal proposals | Internal planning documents. Not user-facing. |
| `team-docs/demo-script.md` | Internal | Production script, not a published artifact. |
| `team-docs/human-evals/` | Internal | Evaluation criteria for internal use. |
| `team-docs/release-process.md` | Internal | Team workflow documentation. |
| `team-docs/README.md` | Internal | Internal directory index. |
| `team-docs/blog/template.md` | Internal | Blog post template for authors. |
| `team-docs/blog/*` with `status: draft` | Internal | Unpublished drafts. |
| `.ai-team/` | Runtime state | Agent charters, histories, decisions, logs. Never public, never in git on main. |
| `test/` | Source code | Test suite. Not documentation. |
| Sprint plans, roadmaps | Internal proposals | Planning artifacts, not user content. |

**Rule: if it's in `team-docs/` or `.ai-team/`, it's not on the site — with the sole exception of published blog posts.**

---

## 7. Implementation Notes

### Jekyll setup

```
_config.yml           → Site config, collections, nav
_layouts/
  default.html        → Base layout (nav, footer)
  docs.html           → Docs layout (sidebar + content)
  post.html           → Blog post layout
  home.html           → Landing page layout
_includes/
  nav.html            → Top navigation
  sidebar.html        → Docs sidebar
  hero.html           → Landing page hero section
```

### Front matter additions

Each `docs/*.md` file needs front matter added. Example for `docs/guide.md`:

```yaml
---
layout: docs
title: Product Guide
description: Complete reference for all Squad features.
permalink: /docs/guide/
nav_order: 1
---
```

This is a one-time, non-destructive change. The markdown content stays identical. The front matter tells Jekyll how to render it.

### No content reproduction checklist

- [ ] Docs render from `docs/` directory — not copied elsewhere
- [ ] Blog renders from `team-docs/blog/` via Jekyll collection — not copied
- [ ] Landing page is a standalone layout, not a copy of README.md
- [ ] README.md is NOT rendered on the site (it serves GitHub; the landing page serves the web)
- [ ] Feature pages are the `docs/features/*.md` files, not rewrites

### What the landing page is NOT

The landing page is not a copy of README.md. The README serves GitHub visitors (badge-aware, assumes they're already on the repo). The landing page serves web visitors (no GitHub context, needs to explain the product from zero). They share the same facts but not the same structure or audience.

---

## 8. Priority Order for Implementation

1. **Jekyll scaffolding** — `_config.yml`, layouts, includes. The skeleton.
2. **Front matter on docs files** — Add YAML front matter to all 18 docs files. Non-destructive.
3. **Landing page** — `index.html` or `index.md` with the hero section from §3.
4. **Blog collection** — Wire up `team-docs/blog/` as a Jekyll collection.
5. **Navigation** — Top nav + docs sidebar.
6. **Styling** — CSS. Minimal. Readable. Dark option preferred (matches terminal aesthetic).
7. **Deploy** — GitHub Pages from the `main` branch (or a `gh-pages` branch if main is filtered).

---

## Open Questions

1. **Domain:** `squad.dev`? GitHub Pages default (`bradygaster.github.io/squad`)? Custom domain later?
2. **Theme:** Start with a minimal Jekyll theme (e.g., `just-the-docs`) or build custom? `just-the-docs` handles the sidebar, search, and mobile nav out of the box.
3. **Mermaid diagrams:** The README and guide use Mermaid. Jekyll needs a Mermaid JS include to render them. Add `<script src="mermaid.min.js">` to the default layout.
4. **sample-prompts.md:** Split into multiple pages or keep as one long page with TOC?
5. **Deploy branch:** Does the marketing site live on `main`, `gh-pages`, or a separate repo?
