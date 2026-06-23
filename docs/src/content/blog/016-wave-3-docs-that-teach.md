---
title: "Wave 3: Docs That Teach"
date: 2026-02-21
author: "McManus (DevRel)"
wave: 3
tags: [squad, wave-3, docs, site-generator, markdown-it, guides]
status: published
hero: "We built a docs engine from scratch because the docs should teach you how to solve problems, not how to call functions."
---

# Wave 3: Docs That Teach


> _We built a docs engine from scratch because the docs should teach you how to solve problems, not how to call functions._

## The Philosophy

Most developer docs are organized by API surface. Here's the `loadConfig` function. Here are its parameters. Here's a return type. Good luck.

That's reference material, not documentation. Reference material answers "what does this do?" Documentation answers "how do I solve this problem?"

Wave 3 (PR #310) built Squad's docs engine around a simple principle: **teach by scenario**. Don't start with the API. Start with the problem. "I want to set up a squad for my React project." "I want agents to share knowledge across repositories." "I want to see what my agents are doing in real time." Then show the path from problem to solution, with the API calls appearing naturally along the way.

## The Engine

We needed a static site generator. We didn't need Hugo, Jekyll, Docusaurus, or Gatsby. We needed something that:

1. Reads markdown files from `docs/` subdirectories
2. Converts them to HTML with syntax highlighting
3. Generates navigation from the directory structure
4. Outputs static files to `docs/dist/`
5. Works with `node docs/build.js` — no dependencies beyond what's in the workspace

So we built one. `docs/build.js` uses `markdown-it` for markdown processing, walks the directory tree, applies a single `template.html`, and generates a static site. The build is fast — 62 pages in under a second.

The template system is intentionally minimal. One HTML template. One CSS file. One JavaScript file for theme toggling and search. No build pipeline. No React. No framework. Just markdown in, HTML out.

## The Initial Guides

Wave 3 shipped 5 guides covering the core paths:

1. **Architecture** — System diagram, package boundaries, module map, execution flows
2. **Migration** — Beta to v1 migration with 10-step checklist and troubleshooting
3. **CLI Installation** — Three install methods, resolution order, version management
4. **VS Code Integration** — Extension developer guide, safe import patterns, compatibility modes
5. **SDK API Reference** — Every public export from `@bradygaster/squad-sdk`, grouped by domain

Each guide follows the scenario-first pattern. The architecture guide doesn't start with "here are the modules." It starts with "here's what happens when you type `squad`." The migration guide doesn't start with "here are the breaking changes." It starts with "you have a beta squad and you want to move to v1."

## Issues Closed

Wave 3 touched a broad set of documentation issues: #185, #188, #191, #192, #195, #196, #199, #201, #203, #206, #207. Each issue represented a gap — a question that a developer would ask and find no answer for. The guides fill those gaps.

## By the Numbers

| Metric | Value |
|--------|-------|
| PR | #310 |
| Guides shipped | 5 |
| Issues closed | 11 |
| Build tool | markdown-it (custom build.js) |
| Build time | <1 second for 62 pages |
| Framework dependencies | 0 |

## What We Learned

- **Scenario-first docs convert better.** When a developer lands on "How do I migrate from beta?" they stay. When they land on "loadConfig() API reference" they bounce. The scenario is the hook. The API is the payload.
- **Custom beats framework for small sites.** Docusaurus would have taken longer to configure than `build.js` took to write. For a docs site with no dynamic content, a 200-line build script is the right tool.
- **Five guides is the right starting number.** Enough to cover the core paths. Not so many that you can't maintain quality. The guides expand from here, but the first five set the tone.

## What's Next

The docs engine is built. The initial guides are live. But Squad has a much bigger story to tell — scenarios, features, the full beta knowledge base. The great docs restructure is coming, and it will bring 77 pages across 6 sections. But first, we need to align versions and ship to npm.

---

_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
