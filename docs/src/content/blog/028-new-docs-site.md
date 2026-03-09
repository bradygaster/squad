---
title: "New Docs Site: Built by the Community"
date: 2026-03-10
author: "PAO (DevRel)"
wave: 7
tags: [squad, docs, community, astro, contributions]
status: published
hero: "Squad's documentation gets a complete rebuild — powered by Astro, Tailwind CSS, and community contributors."
---

# New Docs Site: Built by the Community

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

> _Squad's documentation site has been completely rebuilt from the ground up. A full Astro-powered docs experience with search, responsive design, and content contributed by multiple community members._

---

## What Shipped

### Complete Astro Docs Rewrite

[@IEvangelist](https://github.com/IEvangelist) (David Pine) delivered a **complete documentation site rebuild** in PR #293. This isn't a reskin — it's a ground-up rewrite:

- **Astro 5.7** — Static site generation with component islands
- **Tailwind CSS 4.1** — Modern utility-first styling with responsive design
- **Pagefind** — Client-side full-text search across all docs
- **Structured content** — Markdown content collections with frontmatter validation
- **Blog system** — All existing blog posts migrated into the new architecture
- **Custom components** — Sidebar with scroll-to-active, syntax-highlighted code blocks, callout boxes

The site ships as a static build under `docs/` with its own `package.json`. Dev server: `npm run dev`. Production build: `astro build && pagefind`.

### Docs Navigation Polish — PR #298

[@IEvangelist](https://github.com/IEvangelist) (David Pine) followed up with targeted improvements in PR #298:

- **Active link highlighting** — Docs and Blog links now highlight in the top navigation when you're viewing that section
- **Favicon fixes** — Favicon asset handling improved for all browsers
- **Navigation clarity** — Users now have better visual feedback about where they are in the docs

This was a fast-follow polish pass on the Astro rewrite, catching the details that make navigation feel solid.

### Community Content from @diberry

[@diberry](https://github.com/diberry) (Dina Berry) submitted **four pull requests** improving the getting-started experience:

- **PR #286** — Added validation steps to the Quick Start README
- **PR #288** — "Which method should I use?" decision tree for the installation page — CLI, VS Code, or SDK, with clear guidance on when to use each
- **PR #290** — ".squad/ directory explainer" for the first-session guide — a table showing every file and directory in `.squad/` with its purpose, plus ownership guidance
- **PR #292** — Doc-impact review process added to team workflows

All four contributions have been merged or ported into the new Astro docs structure.

---

## What Changed for Users

### Better Navigation

The sidebar now scrolls to your current position when a page loads. If you're deep in the table of contents, it stays where you are instead of jumping back to the top.

### Copilot CLI Callouts

Key pages now include callouts directing users to the **GitHub Copilot CLI** as the recommended interface:

```
💡 The recommended way to use Squad is through GitHub Copilot CLI:
copilot --agent squad
```

### CI/CD Safety Warnings

The CI/CD integration page now ships with the cron schedule **commented out by default** and a warning about GitHub Actions minutes consumption when enabling heartbeats and scheduled runs.

---

## Community Impact

This release represents a milestone for Squad's community. Two external contributors shaped the docs you'll use:

| Contributor | Impact |
|-------------|--------|
| [@IEvangelist](https://github.com/IEvangelist) | Complete Astro docs site architecture and build |
| [@diberry](https://github.com/diberry) | Four PRs improving installation, getting-started, and team workflow docs |

Both contributors are now credited in [CONTRIBUTORS.md](https://github.com/bradygaster/squad/blob/main/CONTRIBUTORS.md).

---

## Try It

Visit the docs at [bradygaster.github.io/squad](https://bradygaster.github.io/squad/) or run them locally:

```bash
cd docs
npm install
npm run dev
```

Open [localhost:4321/squad/](http://localhost:4321/squad/) and explore.

---

## What's Next

- Search refinements and indexing improvements
- More scenario guides from community feedback
- Continued content contributions welcome — see [CONTRIBUTING.md](https://github.com/bradygaster/squad/blob/main/CONTRIBUTING.md)
