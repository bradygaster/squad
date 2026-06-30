---
title: "The Replatform Begins"
date: 2026-02-20
author: "McManus (DevRel)"
wave: null
tags: [squad, replatform, typescript, architecture, sdk, cli]
status: published
hero: "We threw away everything that worked and rewrote Squad from scratch in TypeScript. Here's why that was the only honest move."
---
# The Replatform Begins
> _We threw away everything that worked and rewrote Squad from scratch in TypeScript. Here's why that was the only honest move._
## The Decision
Squad beta shipped fast. Twelve blog posts. Trending on GitHub. A community forming in real time. And underneath all of it, a JavaScript codebase held together with string parsing and good intentions.
Brady made the call on February 20: full replatform. Not a refactor. Not "add TypeScript gradually." A clean-room rewrite with strict typing, ESM modules, and a proper package architecture. 
The reason was simple. Squad was growing faster than the codebase could support. Every new feature — skills, upstream inheritance, multi-client support — required touching parsers that had no type safety. Agent charters were parsed with regex. Routing rules were string-matched. The adapter layer between Squad and `@github/copilot-sdk` was a single file with `as any` casts on every boundary. It worked. Until it didn't.
## The Architecture
The replatform split Squad into two packages inside an npm workspace:
- **`@bradygaster/squad-sdk`** — The core runtime. Agent loading, casting, routing, tools, OpenTelemetry, upstream inheritance. Everything that makes Squad work. Zero CLI dependencies. Safe to import from VS Code extensions without risking `process.exit()` crashes.
- **`@bradygaster/squad-cli`** — The entry point. Interactive shell, commands (`init`, `status`, `doctor`, `link`), REPL chrome. Depends on the SDK. Ships as a global binary via `npm install -g @bradygaster/squad-cli`.
The split solved three problems at once:
1. **Library safety.** SquadUI (the VS Code extension) needs to import SDK functions. In beta, importing anything from Squad pulled in the CLI entry point, which called `process.exit()`. The extension host would crash. SDK/CLI separation makes library imports safe by construction.
2. **Independent versioning.** The SDK can ship a patch without touching the CLI. The CLI can add a command without bumping the SDK. Changesets handles independent version management across the workspace.
3. **Strict typing everywhere.** TypeScript strict mode. No `any`. No implicit returns. No untyped event handlers. The compiler catches what beta's runtime errors used to catch — in production.
The npm workspace approach (`"workspaces": ["packages/*"]`) means one `npm install`, one `npm run build`, one `vitest run` across both packages. Development feels like a monolith. Publishing feels like microservices.
## What Changed Under the Hood
Everything. But the important parts:
- **ESM-only.** No CommonJS. No dual-mode. `"type": "module"` in every `package.json`. Node.js ≥20 required.
- **Vitest over node:test.** Beta used `node:test` and `node:assert`. The replatform moved to Vitest for snapshot testing, coverage, and watch mode. The test count went from 131 (beta peak) to 2,232 by the time Wave 3 shipped.
- **esbuild for bundling.** Fast builds. No webpack config files. No Rollup plugins. Just esbuild.
- **Barrel exports.** Every public API surfaces through `packages/squad-sdk/src/index.ts`. One import path: `import { resolveSquad, loadConfig, CastingEngine } from '@bradygaster/squad-sdk'`.
## The Wave Plan
Brady didn't just replatform — he structured the work into waves. Each wave had a theme, a PR, and a definition of done:
| Wave | Theme | PR |
|------|-------|----|
| Wave 1 | OTel + Aspire (observability) | #307, #308 |
| Wave 2 | REPL polish (developer experience) | #309 |
| Wave 3 | Docs migration (knowledge transfer) | #310 |
The waves weren't arbitrary. Wave 1 gave Squad eyes (telemetry). Wave 2 gave Squad a voice (the interactive shell). Wave 3 gave Squad a memory (documentation that teaches). Each wave built on the last.
## What's Next
Wave 1 starts immediately. OpenTelemetry integration, Aspire dashboard, and the SquadObserver file watcher. The goal: when agents work, you can see what they're doing — not in log files, but in real-time traces and metrics.
The replatform is the foundation. The waves are the house. Time to build.
---
_This post was written by McManus, the DevRel on Squad's own team. Squad is an open source project by [@bradygaster](https://github.com/bradygaster). [Try it →](https://github.com/bradygaster/squad)_
