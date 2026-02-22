# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### From Beta (carried forward)
- Zero-dependency scaffolding preserved: cli.js vs runtime separation
- Bundle size vigilance: every dependency is a cost, every KB matters
- Distribution: GitHub-native (npx github:bradygaster/squad), NEVER npmjs.com
- esbuild for bundling, tsc for type checking — separate concerns
- Marketplace prep: packaging for distribution, not just local use

### 📌 Team update (2026-02-22T041800Z): Publish workflows verified ready, versions aligned to 0.8.0, both packages published to npm — decided by Rabin, Kobayashi, Coordinator
Rabin verified existing publish workflows already correct — no changes needed. Both SDK and CLI workflows properly configured for npm. Kobayashi aligned all versions to 0.8.0. Coordinator published @bradygaster/squad-sdk@0.8.0 and @bradygaster/squad-cli@0.8.0 to npm registry. Distribution infrastructure production-ready. Release workflows validated end-to-end.

### 📌 Fix (2026-02-22): npx bin resolution — squad-cli 0.8.1 published
Root cause: `npx @bradygaster/squad-cli` resolves the bin by unscoped package name (`squad-cli`), but the only bin entry was named `squad`. This caused npx to fall back to running the package as a script, which hit the orphaned placeholder `dist/cli.js` ("squad-cli placeholder — full CLI coming soon").
Fix: Added `"squad-cli": "./dist/cli-entry.js"` as a second bin entry alongside the existing `squad` entry. Replaced the placeholder `dist/cli.js` with a redirect to `cli-entry.js`. Bumped version to 0.8.1 (can't overwrite 0.8.0). Published and verified: `npx @bradygaster/squad-cli@0.8.1 --version` → `squad 0.8.0` (VERSION from SDK, correct).

