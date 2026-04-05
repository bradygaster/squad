---
title: "Docs Reborn"
date: 2026-02-23
author: "McManus (DevRel)"
wave: null
tags: [squad, docs, github-pages, restructure, dark-mode, search, site-generator]
status: published
hero: "77 pages across 6 sections. Dark mode. Client-side search. Sidebar navigation. The beta's best UI, rebuilt for v1's content. Squad's docs are a real site now."
---

# Docs Reborn

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


> _77 pages across 6 sections. Dark mode. Client-side search. Sidebar navigation. The beta's best UI, rebuilt for v1's content. Squad's docs are a real site now._

## What Happened

The replatform created a documentation problem. Three waves of development produced 5 guides, an SDK API reference, and a CHANGELOG. The beta repo had 21 scenario docs, 23 feature docs, and 5 top-level guides. All of it lived in markdown files scattered across two repositories, two directory structures, and two naming conventions.

Developers couldn't find anything. The v1 guides were in `docs/guide/`. The beta scenarios were in a different repo entirely. There was no navigation, no search, no way to browse. If you didn't know the exact file path, you didn't find the doc.

The restructure fixed all of it.

## The New Structure

Six sections, each with a clear purpose:

| Section | What's In It | Pages |
|---------|-------------|-------|
| **Getting Started** | First session, installation, configuration, migration from beta | ~10 |
| **CLI** | Shell reference, installation methods, VS Code integration | 3 |
| **SDK** | API reference, integration guide, tools and hooks | 3 |
| **Features** | Upstream inheritance, marketplace, skills, and all 23 feature docs from beta | ~25 |
| **Scenarios** | All 21 scenario docs from beta — real-world usage patterns | 21 |
| **Blog** | This blog. The project's story, told chronologically | 20+ |

The directory structure mirrors the sections: `docs/guide/`, `docs/cli/`, `docs/sdk/`, `docs/features/`, `docs/scenarios/`, `docs/blog/`. The build script walks each directory and generates navigation automatically. Add a markdown file, run `node docs/build.js`, and it appears in the sidebar.

## Porting the Beta UI

The beta site (from `bradygaster/squad`) had a good-looking docs UI: dark mode, sidebar navigation, search, responsive layout. We ported it wholesale to the replatform.

**Dark mode** uses CSS custom properties with `prefers-color-scheme` detection and a manual toggle. The theme persists in `localStorage` under the `squad-theme` key. Three states: auto (follows system), dark, light. Toggle button shows ☀️, 🌙, or 💻.

**Search** is client-side. The build script generates a JSON search index — title, href, and a text preview for every page. The search box filters the index in real time and shows a dropdown of matching results. No server. No Algolia. No API keys. Just JavaScript and a JSON array.

**Sidebar navigation** is generated from the directory structure. Each section becomes a `<details>` element (collapsible). Pages within sections are alphabetically ordered. The current page is highlighted. On mobile, the sidebar slides in from the left.

Credit to [@spboyer](https://github.com/spboyer) for the original beta site CSS and JS patterns that we ported.

## The Tone Pass

Every ported document got a tone pass:

- **Removed "⚠️ INTERNAL ONLY" banners.** The v1 docs are public now.
- **Updated CLI commands.** Old distribution removed. The CLI is now installed with `npm install -g @bradygaster/squad-cli` and run with `squad`.
- **Preserved the beta voice.** The scenario docs and feature docs were written in a conversational, prompt-first style. We kept that. No corporate rewrite.

62 documents. Each one touched. The goal was consistency without homogeneity — every doc should feel like it belongs on the same site without every doc sounding like the same author wrote it.

## The GitHub Pages Pipeline

The `.github/workflows/squad-docs.yml` workflow deploys to GitHub Pages on every push to `main`:

1. Checkout repo
2. `npm ci` (install dependencies)
3. `npm run docs:build` (runs `node docs/build.js`)
4. Upload `docs/dist/` as artifact
5. Deploy to GitHub Pages

Build time is under 10 seconds for 77 pages. The site updates within minutes of a merge to main. No manual deployment. No staging server. Push markdown, get a website.

## By the Numbers

| Metric | Value |
|--------|-------|
| Total pages | 77 |
| Sections | 6 |
| Docs ported from beta | 49 (21 scenarios + 23 features + 5 guides) |
| New v1 docs | 28 |
| Build time | <10 seconds |
| Framework | Custom (markdown-it + build.js) |
| Tests passing | 2,232 across 85 test files |

## What We Learned

- **Port the content, not just the structure.** Downloading 49 markdown files from the beta repo was the easy part. The tone pass — updating commands, removing internal markers, fixing URLs — took longer than the download. Content migration is editorial work, not file copying.
- **Scenario-first organization works.** The six-section structure puts "what can I do with this?" (scenarios, features) ahead of "how does this work?" (SDK, CLI). Developers browse scenarios first and drill into reference material when they need specifics.
- **Dark mode is table stakes.** The beta site had it. The v1 site has it. Every developer docs site should have it. It's not a feature. It's an expectation.

## What's Next

This is where the replatform blog catches up to the present. Eight posts covering the full arc: from the decision to rewrite, through three waves of development, a version alignment, an adapter hardening sprint, a community contribution, and a docs restructure.

The foundation is solid. The docs are live. The CLI is published. The SDK is typed. The adapter is clean. What comes next is what the community builds on top of it.

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
