# CONTROL

> Control System Engineer

## Learnings

### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

CONTROL assigned:
- **#481 (StorageProvider PRD)** → squad:control + squad:eecom (type system abstraction for runtime integration)

Pattern: State abstraction gap identified. StorageProvider defines canonical interface for data persistence across team.

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. CONTROL owns StorageProvider PRD specification (#481). Type system design critical for EECOM runtime integration. Ready to begin specification work on next sprint.
# Control — History

## Learnings

### Model Registry Architecture
- `MODELS` constant in `packages/squad-sdk/src/runtime/constants.ts` is the single source of truth for default model names and fallback chains. `DEFAULT_CONFIG` in `runtime/config.ts` derives `defaultModel` from `MODELS.DEFAULT`.
- `MODEL_CATALOG` in `packages/squad-sdk/src/config/models.ts` is the authoritative model list used by `ModelRegistry`. `DEFAULT_FALLBACK_CHAINS` in the same file mirrors `MODELS.FALLBACK_CHAINS` — both must stay in sync.
- `model-selector.ts` hardcodes task-to-model mappings for `code`, `prompt`, `visual`, `docs`, `planning`, `mechanical` task types. These must be updated alongside `MODELS.FALLBACK_CHAINS` when defaults change.

### Skill Templates Are Auto-Synced
- `npm run build` calls `scripts/sync-skill-templates.mjs` which copies `.squad/skills/*/SKILL.md` files into both `packages/squad-sdk/templates/skills/` and `packages/squad-cli/templates/skills/`. Editing `.squad/skills/model-selection/SKILL.md` is sufficient — the sync propagates it.

### Model Default Update Pattern
When updating default models, touch these files in order:
1. `.squad/skills/model-selection/SKILL.md` — tables, fallback chains, valid models list, examples
2. `.github/agents/squad.agent.md` — core rules section (~line 295), spawn example (~line 297)
3. `packages/squad-sdk/src/runtime/constants.ts` — `MODELS.DEFAULT`, `MODELS.FALLBACK_CHAINS`
4. `packages/squad-sdk/src/agents/model-selector.ts` — `selectModelForTask` switch cases
5. `packages/squad-sdk/src/config/models.ts` — `MODEL_CATALOG` entries, `DEFAULT_FALLBACK_CHAINS`
6. `packages/squad-sdk/src/runtime/benchmarks.ts` — fixture data
7. Tests: `test/agents.test.ts`, `test/config.test.ts`, `test/models.test.ts`, `test/compat-v041.test.ts`, `test/init.test.ts`

### Claude Haiku Stays at 4.5
There is no `claude-haiku-4.6`. The latest haiku is `claude-haiku-4.5`. Never bump haiku beyond 4.5 until the platform explicitly lists a newer haiku variant.

### Standard Tier Fallback Chain (current)
`claude-sonnet-4.6 → gpt-5.4 → claude-sonnet-4.5 → gpt-5.3-codex → claude-sonnet-4 → gpt-5.2`

### ModelId Type
`ModelId = string` in `runtime/config.ts` — not a discriminated union. New model IDs can be added to the catalog without TypeScript changes beyond the catalog and chain arrays.

### Template Copy Rename Pattern (#613/#614)
- Template copies of `squad.agent.md` in `templates/`, `packages/squad-cli/templates/`, and `packages/squad-sdk/templates/` are now named `squad.agent.md.template` to prevent Copilot CLI 1.0.11 from discovering and merging them as `*.agent.md` files.
- The canonical source (`.squad-templates/squad.agent.md`) and the active copy (`.github/agents/squad.agent.md`) remain unchanged.
- `scripts/sync-templates.mjs` handles the rename: mirror targets get `.template` suffix, `.github/agents/` target keeps `.md`.
- All code reading templates for init/upgrade/consult (SDK `init.ts`, CLI `upgrade.ts`, CLI `templates.ts`, SDK `consult.ts`) references `squad.agent.md.template` as the source filename.
- The `TEMPLATE_MANIFEST` in `templates.ts` uses `source: 'squad.agent.md.template'` but `destination: '../.github/agents/squad.agent.md'` — source and target names differ.
