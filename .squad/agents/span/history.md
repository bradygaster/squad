# SPAN — History

## Project Context
- **Project:** Squad — the programmable multi-agent runtime for GitHub Copilot
- **Stack:** TypeScript (strict, ESM), Node.js ≥20, Vitest, esbuild
- **Owner:** Brady
- **Universe:** Apollo 13 / NASA Mission Control

## Learnings

### Skill Landscape (2026-04-03)
- 34 skills across 3 canonical locations: `.squad/skills/` (14), `.copilot/skills/` (17), `templates/skills/` (3)
- Skills synced to packages via `scripts/sync-skill-templates.mjs` (source: `.squad/skills/`)
- SDK scans `.copilot/skills/` first (primary), falls back to `.squad/skills/` (legacy)
- SDK matching: `triggers` array (case-insensitive substring, +0.5/hit capped at 0.7) + `roles` affinity (+0.3)

### Schema Standard
- agentskills.io spec: `name`, `description`, `license` as top-level; `domain`, `confidence`, `source`, `triggers`, `roles`, `compatibility` in `metadata`
- Spec reference: https://agentskills.io/specification

### Eval Baseline (2026-04-03)
- Phase 1 (keyword): 88.9% pass rate (304/342 test cases, 31 fixtures)
- Phase 2 (LLM): pending initial baseline run
