---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Move bundled skills from `.copilot/skills/` to `.github/skills/` so they're visible to all Copilot surfaces (closes #1126)

## Symptom (per #1126)

Squad-bundled skills installed at `.copilot/skills/` are **invisible to every Copilot surface except Squad itself**:
- ❌ GitHub Copilot cloud agent
- ❌ Copilot CLI (outside Squad sessions)
- ❌ VS Code Copilot extension (agent mode)
- ❌ `@copilot` coding agent on issues
- ❌ Any future Copilot surface

Per the [official Agent Skills docs](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), [add-skills docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/add-skills), and [VS Code docs](https://code.visualstudio.com/docs/copilot/customization/agent-skills), the canonical **project-level** custom-skills location is `.github/skills/`. `.copilot/skills/` at repo root is not recognized by any Copilot surface — the home-directory equivalent `~/.copilot/skills/` IS recognized for **personal** skills, which is the source of the original mistake.

## Fix

1. **`squad init`** writes bundled skills to `.github/skills/{name}/SKILL.md` (was `.copilot/skills/`).
2. **`squad upgrade`** does the same AND auto-migrates legacy `.copilot/skills/{manifest-skill}/` into `.github/skills/{manifest-skill}/` (best-effort, preserves user-added non-manifest skills at `.copilot/skills/`, tombstones the legacy dir when empty).
3. **`TEMPLATE_MANIFEST`** destinations rewritten: all 10 skill entries now target `../.github/skills/` instead of `../.copilot/skills/`.
4. **`ENSURE_DIRECTORIES`** (upgrade.ts) updated so existing squads get `.github/skills/` created on upgrade.
5. **squad.agent.md** narrative updated: 5-path scan order now lists `.github/skills/` as path #2 (Copilot CLI's canonical custom-skills location) and `.copilot/skills/` as path #3 (Legacy install path; `squad upgrade` migrates). Personal scope (`~/.copilot/skills/`) preserved as-is.
6. **All other docs** (`spawn-reference.md`, `README.md`, `squad-commands` skill, `release-process` skill, `build.ts`, SDK type comments) updated to reference `.github/skills/` as the install destination.

## Migration semantics (`squad upgrade`)

`migrateLegacyCopilotSkills()` runs **before** `syncAllSkills`:

| Scenario | Migration action | User-added skills at `.copilot/skills/` |
|---|---|---|
| `.copilot/skills/{manifest-skill}/` exists, `.github/skills/{manifest-skill}/` does NOT | Move legacy → new; remove legacy | Untouched |
| `.copilot/skills/{manifest-skill}/` exists AND `.github/skills/{manifest-skill}/` exists | Tombstone legacy (new wins) | Untouched |
| `.copilot/skills/my-custom-skill/` (NOT in TEMPLATE_MANIFEST) | Left alone | Preserved |
| `.copilot/skills/` becomes empty after migration | Directory removed | n/a |

All migration steps are best-effort with try/catch — disk-write failures don't block upgrade.

## Tests

New regression tests:
- `test/init.test.ts > should install Squad-bundled skills at .github/skills/...` — asserts canonical path, asserts legacy path is NOT created
- `test/cli/upgrade.test.ts > should migrate manifest skills from .copilot/skills/ to .github/skills/` — asserts manifest skill moves, user-added skill preserved
- `test/cli/upgrade.test.ts > should NOT clobber a customized .github/skills/{name} if the legacy copy exists` — asserts both-locations case tombstones legacy without losing the new

Updated existing tests:
- `test/builtin-skills.test.ts` regex now matches `.github/skills/`
- `test/cli/init.test.ts`, `test/init.test.ts`, `test/init-sdk.test.ts`, `test/cli/upgrade.test.ts`, `test/human-journeys.test.ts`, `test/repl-ux-fixes.test.ts`, `test/cli/init-upgrade-parity.test.ts` — install-path assertions updated to `.github/skills/`

**188/188 init/upgrade/builtin tests pass; `npm run lint` clean.**

## What's NOT changed (intentional)

- **`.copilot/skills/` scan path stays in `squad.agent.md`'s 5-path skill discovery** — the coordinator still discovers user-added skills at the legacy location for backward compat; only Squad-installed (manifest) skills migrate.
- **`~/.copilot/skills/` (personal scope) is unchanged** — that's Copilot CLI's official personal-skills location and remains valid.
- **`test/skill-source.test.ts`, `test/skills-export-import.test.cjs`, `test/tools.test.ts`, `test/skill-script-loader.test.ts`** are NOT touched — they test the runtime skill loader and tool behavior, which still supports `.copilot/skills/` as a valid scan path.

## Composability

- **Disjoint from #1292, #1293, #1295, #1297, #1298, #1300, #1301, #1302, #1303** — touches the same `TEMPLATE_MANIFEST` array as #1292/#1295/#1303 but only modifies the destination path, not the source or entry list. Conflicts on `MANIFEST_SKILL_NAMES` are trivial: take the union of skill names with the `../.github/skills/` destination from this PR.
- This is the **canonical fix** for #1126; closes that issue.

## Out of scope (separate follow-ups)

- Backward-compat shim that adds a `.copilot/skills -> .github/skills` symlink. Not needed because users won't be looking at `.copilot/skills/` anymore once their tools find skills at `.github/skills/`. Filed as a follow-up if anyone reports broken muscle memory.
- A `squad doctor --skills` check that warns when `.copilot/skills/` still has manifest skills after upgrade (suggesting the migration silently failed). Worth adding to the next maintenance pass.
