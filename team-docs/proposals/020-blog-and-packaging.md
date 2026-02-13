# Proposal 020: Blog Format, Blog Engine Prompt, and Package Naming UX

**Status:** Approved ✅ Shipped. Note: npm publishing recommendations in §3 are superseded — distribution is GitHub-only via `npx github:bradygaster/squad` per Proposal 019a.  
**Author:** McManus (DevRel)  
**Date:** 2026-02-09  
**Requested by:** bradygaster  
**Depends on:** Proposal 019 (Master Sprint Plan), Proposal 014 (V1 Messaging)

---

## Executive Summary

Three things from Brady, all connected by the same thread: **make Squad's progress visible and its install experience frictionless.**

1. A blog markdown format for progress updates — each wave = a blog post.
2. A sample prompt for a blog engine that renders those posts — Squad builds the tool that tells Squad's story.
3. A DevRel evaluation of the npx package naming for clarity and discoverability.

---

## 1. Blog Markdown Format

### Design Principles

- **Human-readable raw.** Someone reading the markdown on GitHub should get the full story without rendering.
- **Machine-renderable.** YAML frontmatter follows static site generator conventions (Jekyll, Hugo, Eleventy, any custom engine).
- **One post per wave.** Wave completion = blog post. The cadence is the content strategy.
- **Story, not changelog.** Each post has a narrative arc — what happened, what surprised us, what we learned. Changelogs are for CHANGELOG.md.

### Frontmatter Schema

```yaml
---
title: "Wave X: [Title]"        # Human title — the hook
date: YYYY-MM-DD                 # Publication date
author: "[Agent Name] ([Role])"  # Who wrote it — always an agent
wave: X                          # Wave number (0, 1, 2, 3...)
tags: [squad, wave-X, ...]       # For filtering and taxonomy
status: published                # published | draft
hero: "[One-line hook]"          # Scroll-stopper sentence
---
```

### Post Structure

Every post follows the same skeleton:

1. **Hero sentence** — repeated from frontmatter, sets the tone
2. **What Shipped** — bullet list of concrete deliverables with agent attribution
3. **The Story** — narrative (2-4 paragraphs), written like you're telling a friend
4. **By the Numbers** — metrics table (proposals, tests, agents, human messages, custom)
5. **What We Learned** — 2-3 lasting insights
6. **What's Next** — 1-2 sentences teasing the next wave
7. **Footer** — agent attribution + link to Squad repo

### Files

- **Template:** `docs/blog/template.md`
- **First post:** `docs/blog/001-wave-0-the-team-that-built-itself.md`

### Why This Format Works

- Frontmatter is compatible with every static site generator on earth
- `wave` field enables filtering, navigation ("← Wave 0 | Wave 1 →"), and programmatic rendering
- `hero` field gives the blog engine a subtitle/deck without parsing the body
- `author` field with agent name + role reinforces the "team that writes about itself" narrative
- `status` field supports drafts in the repo without publishing them
- `tags` enable cross-cutting views (all posts about testing, all posts mentioning a specific agent)

---

## 2. Blog Engine Sample Prompt

### The Meta Angle

Squad builds a blog engine. The blog engine renders Squad's own progress posts. Squad built the tool that tells Squad's story. That's the demo.

### The Prompt

Added to `docs/sample-prompts.md` as a new entry in Quick Builds:

```
Build a static blog engine that renders markdown blog posts into beautiful HTML pages.
No frameworks — just HTML, CSS, and vanilla JavaScript.

Input: markdown files from a docs/blog/ directory. Each file has YAML frontmatter
(title, date, author, wave, tags, status, hero).

Output:
- An index page listing all posts, sorted by date, with title, hero text, author, and tags
- Individual post pages with clean typography, syntax-highlighted code blocks, and responsive tables
- A tag index page that groups posts by tag
- Wave navigation: "← Previous Wave | Next Wave →" links on each post
- Dark mode toggle (CSS custom properties, saved to localStorage)
- RSS feed (feed.xml)

Design direction:
- Clean, modern, developer-focused. Think GitHub's blog meets a personal dev blog.
- Monospace headings, proportional body text
- Code blocks with a dark theme and copy-to-clipboard button
- Mobile responsive — single column on small screens
- Fast. No JavaScript required for reading — JS only for dark mode toggle and copy button.
- Hero section on the index page with the blog title and a one-liner about the project.

The markdown parser should handle: headings, paragraphs, lists, code blocks (fenced),
inline code, bold, italic, links, images, blockquotes, horizontal rules, and tables.

Build the parser, the template engine, the RSS generator, and the static file output.
Put the output in a dist/ folder. Include a build script that can be run with
`node build.js` to regenerate the site.

Set up the team and build it. I want to see this running in one session.
```

**What it demonstrates:** Squad builds the tool that publishes its own story. Input is markdown files that Squad already writes. The blog engine is a self-contained, single-session project — parser, templating, RSS, responsive CSS — with clear parallel work splits. The meta angle makes the demo land twice: once for the technical execution, once for the narrative ("Squad built this to tell you about itself").

### Why It Belongs in Sample Prompts

- It's a legitimate Quick Build — single session, well-scoped, clear output
- It demonstrates parallel fan-out: parser agent, template agent, CSS agent, RSS agent, tester
- It produces a visual artifact (a rendered blog) that screenshots beautifully
- It uses Squad's own content as input — zero setup, instant payoff
- It's the ultimate "eating our own cooking" demo

---

## 3. Package Naming UX Evaluation

### Current State

The package is published as `@bradygaster/create-squad` on npm. Users run:

```bash
npx @bradygaster/create-squad           # init
npx @bradygaster/create-squad upgrade   # upgrade
npx @bradygaster/create-squad help      # help
npx @bradygaster/create-squad --version # version
```

### Evaluation of Naming Options

#### Option A: `@bradygaster/create-squad` (current)

| Dimension | Assessment |
|-----------|-----------|
| **Clarity** | ⚠️ Mixed. `create-squad` is clear — it creates a squad. The `@bradygaster/` scope adds 13 characters and makes every command longer. |
| **Discoverability** | ⚠️ Scoped packages don't appear in `npx <name>` auto-suggestions. Users must know the exact scope. |
| **Trust signal** | ✅ The scope signals personal ownership — "this is Brady's project." For early-stage OSS, this is actually a positive trust signal. |
| **Typing burden** | ❌ `npx @bradygaster/create-squad` is 33 characters. That's a lot to type correctly from a README. |
| **npm convention** | ✅ Follows `create-*` convention that `npm init` understands: `npm init @bradygaster/squad` works. |

#### Option B: `create-squad` (unscoped)

| Dimension | Assessment |
|-----------|-----------|
| **Clarity** | ✅ Crystal clear. `npx create-squad` — no ambiguity. |
| **Discoverability** | ✅ Unscoped names are globally discoverable. `npx create-squad` just works. |
| **Trust signal** | ⚠️ Loses the personal attribution. But the README and repo URL provide that. |
| **Typing burden** | ✅ `npx create-squad` is 16 characters. Half the current command. |
| **npm convention** | ✅ Perfect `create-*` convention. `npm init squad` would also work. |
| **Risk** | ⚠️ Name squatting. Someone else could register `create-squad` first. Need to check availability. |

#### Option C: `squad-cli`

| Dimension | Assessment |
|-----------|-----------|
| **Clarity** | ⚠️ "CLI" is a developer term — clear to the target audience but doesn't describe what it does. |
| **Discoverability** | ✅ Unscoped, short, memorable. |
| **Trust signal** | ⚠️ Same as Option B — no personal attribution. |
| **Typing burden** | ✅ `npx squad-cli` is 13 characters. Short. |
| **npm convention** | ❌ Breaks `create-*` convention. `npm init squad-cli` doesn't make sense. Loses `npm init` integration. |
| **Semantic problem** | ❌ It's not really a CLI tool with ongoing commands. It's a project initializer. `create-*` is honest. `squad-cli` implies a tool you keep running. |

### Command-by-Command UX Evaluation

Here's what users actually type, and how each name feels:

| Action | Current | With `create-squad` | With `squad-cli` |
|--------|---------|-------------------|-----------------|
| **First install** | `npx @bradygaster/create-squad` | `npx create-squad` | `npx squad-cli` |
| **Upgrade** | `npx @bradygaster/create-squad upgrade` | `npx create-squad upgrade` | `npx squad-cli upgrade` |
| **Check version** | `npx @bradygaster/create-squad --version` | `npx create-squad --version` | `npx squad-cli --version` |
| **Get help** | `npx @bradygaster/create-squad help` | `npx create-squad help` | `npx squad-cli help` |
| **npm init style** | `npm init @bradygaster/squad` | `npm init squad` | ❌ doesn't work |

**The upgrade command is the critical test.** Users will run this command repeatedly over months. Every character matters. `npx create-squad upgrade` reads naturally — "create-squad, but actually, upgrade." `npx squad-cli upgrade` also works but loses the `create-*` lineage.

### README Quick Start Comparison

How it looks in the first 30 seconds:

**Current:**
```bash
npx @bradygaster/create-squad
```
> 33 characters. The `@bradygaster/` scope makes a new dev pause: "Is that a username? Do I need an account?" It's a speed bump in the Quick Start.

**Recommended:**
```bash
npx create-squad
```
> 16 characters. Zero ambiguity. Zero hesitation. Paste and go.

**Alternative:**
```bash
npx squad-cli
```
> 13 characters. Shorter, but "CLI" adds no value and loses `create-*` semantics.

### Recommendation: Publish `create-squad` (unscoped) alongside `@bradygaster/create-squad`

**Do both.** npm supports this.

1. **Register `create-squad`** as an unscoped package that points to the same code.
2. **Keep `@bradygaster/create-squad`** as the scoped package — existing users aren't broken.
3. **README and all docs use `create-squad`** — the short, clean version.
4. **`npm init squad`** works automatically with unscoped `create-squad`.

This gives us:
- ✅ Clean Quick Start: `npx create-squad`
- ✅ Clean upgrade: `npx create-squad upgrade`
- ✅ `npm init squad` for free
- ✅ No breaking change for existing users
- ✅ Personal attribution in repo, README, and scoped package

### Implementation

1. Add `"name": "create-squad"` to a new `package.json` (or rename the current one and keep `@bradygaster/create-squad` as an alias).
2. Alternatively: publish the scoped version and register `create-squad` as a redirect package (1 line: `#!/usr/bin/env node\nrequire('@bradygaster/create-squad')`).
3. Update README Quick Start to use `npx create-squad`.
4. Update help text in `index.js` to reference `create-squad` (line 24).

**Effort:** ~30 minutes. This is a naming change, not an architecture change.

### What NOT to Do

- ❌ Don't rename to `squad-cli` — it breaks `create-*` convention and misrepresents the tool.
- ❌ Don't drop the scoped package — existing users have it in their shell history.
- ❌ Don't overthink this — the package name is a 10-second interaction. Make it short, make it obvious, move on.

---

## Summary

| Deliverable | Location | Status |
|-------------|----------|--------|
| Blog post template | `docs/blog/template.md` | ✅ Created |
| First blog post (Wave 0) | `docs/blog/001-wave-0-the-team-that-built-itself.md` | ✅ Created |
| Blog engine sample prompt | `docs/sample-prompts.md` (new entry) | ✅ Added |
| Package naming evaluation | This document, §3 | ✅ Complete |
| Package naming recommendation | Publish `create-squad` unscoped | Proposed |

---

## Endorsement

**McManus:** Three deliverables, one thread: make Squad visible and frictionless. The blog format gives us a content cadence tied to execution (wave = post). The blog engine prompt is the ultimate meta-demo — Squad builds the tool that tells its own story. And the package name? `npx create-squad` is half the characters, zero the confusion, and follows the exact convention that `create-react-app`, `create-next-app`, and `create-vite` established. Ship the unscoped name, keep the scoped one alive, update the README. Thirty minutes of work for a permanent UX win.

**Review requested from:**
- Brady — naming decision is yours. Both names can coexist on npm.
- Keaton — any concerns about maintaining two package names?
- Fenster — implementation detail: redirect package vs rename?
