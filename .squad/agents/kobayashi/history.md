# Project Context

- **Owner:** Brady
- **Project:** squad-sdk — the programmable multi-agent runtime for GitHub Copilot (v1 replatform)
- **Stack:** TypeScript (strict mode, ESM-only), Node.js ≥20, @github/copilot-sdk, Vitest, esbuild
- **Created:** 2026-02-21

## Learnings

### From Beta (carried forward)
- Preview branch workflow: two-phase (preview → ship) for safe releases
- State integrity via merge drivers: union strategy for .squad/ append-only files
- .gitattributes merge=union: decisions.md, agents/*/history.md, log/**, orchestration-log/**
- Distribution: GitHub-native (npx github:bradygaster/squad), never npmjs.com
- Zero tolerance for state corruption — .squad/ state is the team's memory

### 2026-02-21: Issue #208 — @changesets/cli setup complete
**Status:** PR #276 merged.
- Installed @changesets/cli v2 (101 new packages)
- Config: `"access": "public"`, `"baseBranch": "main"`
- Fixed/linked arrays left empty → independent versioning (squad-sdk, squad-cli evolve at different cadences)
- Added npm script `changeset:check: "changeset status"` for CI validation
- Build passes, npm workspace resolution confirmed
- **Decision:** Independent versioning is correct. Squad packages have separate release cycles (SDK is runtime; CLI is tooling).

### 📌 Team update (2026-02-21T22:05Z): M3+ decisions merged — decided by Kobayashi, Fenster
- Changesets setup (#208): independent versioning for squad-sdk + squad-cli, PR #276 merged
- --global flag (#212) + squad status (#213): routing in src/index.ts, composable resolution pattern, PR #277 merged
- Decision consolidation: changesets config and --global pattern appended to decisions.md

### 📌 Team update (2026-02-21T22:25Z): M5 round complete — decided by Scribe
- Decision inbox merged: ensureSquadPath() guard (#273), CLI routing testability pattern
- Status: Two PRs merged (#280, #279); one issue blocked (#209 needs GitHub Pro)
