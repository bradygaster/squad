# Squad Docs

The documentation site for Squad, built with [Astro](https://astro.build/), [Tailwind CSS](https://tailwindcss.com/), and [Pagefind](https://pagefind.app/) for search.

## Prerequisites

- Node.js 20+ (LTS)
- Run `npm install` from the `docs/` directory

## Commands

All commands are run from the `docs/` directory, or from the repo root using the `docs:` prefix.

| From `docs/` | From repo root | Description |
|---|---|---|
| `npm run dev` | `npm run docs:dev` | Start dev server with hot reload |
| `npm run build` | `npm run docs:build` | Production build (Astro + Pagefind) |
| `npm run preview` | `npm run docs:preview` | Preview the production build |

## Development

```bash
npm run dev
```

Starts a local dev server at `http://localhost:4321/squad/` with hot module reloading. Changes to markdown content, layouts, and components are reflected immediately.

> **Note:** Search does not work in dev mode. Pagefind indexes are only generated during `build`, so the search modal will not return results. Use `build` + `preview` to test search.

## Build

```bash
npm run build
```

Runs two steps:

1. **`astro build`** — Compiles all pages to static HTML in `dist/`
2. **`pagefind --site dist`** — Indexes the HTML output to generate the search index at `dist/pagefind/`

The output in `dist/` is what gets deployed to GitHub Pages.

## Preview

```bash
npm run preview
```

Serves the `dist/` directory locally so you can verify the production build, including working search.

## Search

Search is powered by [Pagefind](https://pagefind.app/), a static search library that indexes the built HTML.

- **Dev mode:** Search UI appears but returns no results (no index exists).
- **Build + Preview:** Search works fully. The build step generates the Pagefind index, and preview serves it.
- **Only pages with `data-pagefind-body`** are indexed. This attribute is set on the `<article>` element in `DocsLayout.astro` and the blog post template.

## Project Structure

```
docs/
├── astro.config.mjs        # Astro configuration (site, base path, plugins)
├── package.json             # Docs-specific dependencies
├── src/
│   ├── components/          # Astro components (Header, Sidebar, Search, etc.)
│   ├── content/
│   │   ├── blog/            # Blog posts (markdown)
│   │   └── docs/            # Documentation articles (markdown)
│   │       ├── concepts/
│   │       ├── cookbook/
│   │       ├── features/
│   │       ├── get-started/
│   │       ├── guide/
│   │       ├── reference/
│   │       └── scenarios/
│   ├── layouts/             # Page layouts (BaseLayout, DocsLayout)
│   ├── navigation.ts        # Sidebar navigation structure
│   ├── pages/               # Astro page routes
│   ├── plugins/             # Remark plugins (link rewriting)
│   └── styles/              # Global CSS (Tailwind)
├── public/                  # Static assets (images)
└── dist/                    # Build output (gitignored)
```

## Adding a Doc Page

1. Create a markdown file under `src/content/docs/{section}/your-page.md`
2. Add a sidebar entry in `src/navigation.ts` under the appropriate `NAV_SECTIONS` section
3. Run the docs build test to verify: `vitest run test/docs-build.test.ts` (from repo root)

## Adding a Blog Post

Create a markdown file under `src/content/blog/` with frontmatter:

```markdown
---
title: "Your Post Title"
date: 2026-03-08
---

Post content here.
```

Blog posts are automatically discovered and listed on the blog index page.
