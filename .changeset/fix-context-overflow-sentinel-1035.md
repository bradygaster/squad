---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

fix: context overflow sentinel and coordinator size reduction (retroactive for #1035)

`squad.agent.md` was ~95.8KB and could be silently dropped from context in long sessions, degrading the coordinator to vanilla Copilot with no safety rails.

Changes shipped in PR #1035 (merged without changeset):

- **Canary sentinel** — `SQUAD_COORDINATOR_CANARY_a8f3` token appended to `squad.agent.md`; `copilot-instructions.md` checks for it and warns if the coordinator was dropped from context
- **Coordinator slimming** — `squad.agent.md` reduced ~42% (95.8KB → ~55KB) by extracting to on-demand reference files: `spawn-reference.md`, `after-agent-reference.md`, `model-selection-reference.md`, `ralph-reference.md`, `worktree-reference.md`, `client-compatibility-reference.md`
- **Scribe charter extraction** — Scribe's inline section moved from `squad.agent.md` to a standalone `scribe-charter.md`
- **E2E skill overhaul** — Fast-fail rules, PII protection, anti-skip enforcement, live progress tracking comment (updated per step), duration tracking, Windows encoding fix, `--allow-all-tools` documentation, progressive verdicting, agent run time budget
- **Build fix** — CLI dep changed from `@bradygaster/squad-sdk: >=0.9.0` to `>=0.9.0-0` so npm workspace resolution uses the local prerelease package instead of a stale published version

All 4 template locations synced: `.squad-templates/`, `templates/`, `packages/squad-cli/templates/`, `packages/squad-sdk/templates/`.

Closes #1017
