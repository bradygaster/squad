---
name: "jekyll-github-pages"
description: "How to set up Jekyll on GitHub Pages using an existing docs/ directory as the source root without content reproduction"
domain: "documentation, infrastructure"
confidence: "medium"
source: "earned — Proposal 029 marketing site architecture decision"
---

## Context

When a project has existing markdown documentation in a `docs/` directory and needs an HTML marketing/docs site, Jekyll on GitHub Pages renders those files in-place without copying them to a separate build directory.

## Patterns

1. **`docs/` IS the Jekyll source root.** Configure GitHub Pages to serve from `docs/` on main. No separate `site/` or `build/` directory.
2. **Add YAML front matter to existing `.md` files** — `layout`, `title`, `nav_order`. Content below the front matter is untouched. GitHub's markdown renderer hides front matter blocks, so no visual impact on GitHub.
3. **`_config.yml` lives in `docs/`** alongside the content it configures.
4. **`_layouts/` and `_includes/` live in `docs/`** — Jekyll infrastructure colocated with content.
5. **Use `defaults` in `_config.yml`** to set front matter defaults per directory (e.g., all files in `features/` get `layout: page` and `category: features`).
6. **Landing page (`index.md`) is separate from `README.md`.** README serves GitHub directory browsing; index.md serves the website homepage. Different audiences, not reproduction.
7. **Classic GitHub Pages deployment (not Actions)** for Jekyll sites — zero CI config, push and deploy.

## Examples

```yaml
# docs/_config.yml — minimal
title: Project Name
baseurl: /repo-name
markdown: kramdown
kramdown:
  input: GFM
defaults:
  - scope:
      path: ""
    values:
      layout: page
```

```yaml
# Front matter added to existing docs/guide.md
---
layout: page
title: "Product Guide"
nav_order: 1
---
# Existing content unchanged below this line
```

## Anti-Patterns

- **Separate `site/` directory that imports or copies from `docs/`** — content reproduction, guaranteed drift.
- **Using a JS-based SSG (Docusaurus, VitePress, Astro)** when the only goal is rendering existing markdown — over-engineered, requires build pipeline, produces output directory.
- **GitHub Actions workflow for Jekyll** when only using allowlisted plugins — unnecessary complexity.
- **Using `README.md` as both GitHub directory index and site homepage** — constrains homepage to documentation structure when it should be marketing-oriented.
