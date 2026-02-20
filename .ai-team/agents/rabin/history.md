# Rabin — Distribution Engineer

## Core Context
- **Project:** Squad — AI agent teams for GitHub Copilot
- **Owner:** Brady (bradygaster)
- **Stack:** TypeScript, Node.js ≥20, ESM, @github/copilot-sdk
- **Focus:** Distribution, packaging, global install, zero-config, marketplace presence
- **New repo:** C:\src\squad-sdk (bradygaster/squad-pr on GitHub)
- **Key PRDs:** 12 (Distribution & In-Copilot Install), 14 (Clean-Slate Architecture)
- **Key directives:** Global install, zero-config, agent repositories (pluggable sources), single .squad/ dir

## Learnings
- Joined 2026-02-20 as part of the replatform recruitment wave
- Current distribution: `npx github:bradygaster/squad` — copies templates to consumer repos
- Brady wants global install support: `npm install -g @bradygaster/squad`
- Agent repositories concept: agents pullable from disk, cloud, API, other repos — first impl is local
- Zero-config: user shouldn't need to change anything about setup
- Insider release workflow already exists: v{version}-insider+{short-sha} format
- Current package: @bradygaster/squad on npm

### Onboarding Deep Dive (2026-02-20)
- Current CLI is 1,662-line CommonJS `index.js` — zero runtime dependencies. This zero-dep model is Squad's strongest distribution asset.
- Templates: 33 files, ~94 KB. Embedded via esbuild text loader in future builds.
- SDK dependency chain: `@github/copilot-sdk` → `@github/copilot` + `vscode-jsonrpc` + `zod`. The `@github/copilot` package is the big unknown — not installed locally, unclear if it's public npm or host-provided.
- squad-sdk `node_modules` = 59.82 MB total but ~90% is devDeps (TypeScript, Vite, esbuild, Rollup). Production deps need `npm pack --dry-run` to measure accurately.
- Global install is feasible with minimal changes (add `"squad"` bin entry, publish to npm). Main risk: Node.js version coupling on enterprise machines.
- Critical open question: Can SDK runtime work outside VS Code? If `@github/copilot` is host-provided, global `squad orchestrate` won't work from bare CLI. This must be resolved before distribution strategy is finalized.
- PRD 12's two-entry-point approach (cli.js + runtime.js) is essential. Scaffolding must stay SDK-free.
- Auto-update check (npm registry ping, 24h cache, 3s timeout) is high priority for global installs.
- Agent repositories are content distribution, not code distribution. Pull-on-demand, cache locally, pin versions. Don't bundle.
- In-Copilot install is realistic via self-installer agent pattern. Chicken-and-egg problem mitigated by template repos.
- Full assessment written to `.ai-team/decisions/inbox/rabin-onboarding-assessment.md`
