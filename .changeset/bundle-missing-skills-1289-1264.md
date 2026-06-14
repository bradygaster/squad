---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix #1289, #1264: Bundle missing skills on `squad init` and strip fabricated provenance from tiered-memory SKILL.md

**Problem**

Two regressions shipped in v0.10.0 caused several skills to silently never reach users:

1. **#1289** — `squad-commands` and `squad-version-check` were in `MANIFEST_SKILL_NAMES` (sdk-init.ts) but missing from `packages/squad-sdk/templates/skills/`. The install loop silently skipped them with `if (storage.existsSync(srcSkill))`, so every `squad init` produced an install with these two skills absent. The trigger phrase `squad commands` was a dead no-op for every v0.10.0 user.

2. **#1264** — `tiered-memory`, `iterative-retrieval`, and `reflect` skill files existed in both templates dirs but were never added to `MANIFEST_SKILL_NAMES`, so they never installed either. Additionally, `tiered-memory/SKILL.md` claimed `confidence: high` and `source: earned (production measurements in tamirdresher/tamresearch1, 34-74KB baseline payloads)` — the referenced repository does not exist and the measurement table at the bottom of the SKILL contained fabricated numbers. The SKILL also referenced `docs/tiered-memory-guide.md`, which does not exist.

3. The previously-merged cross-squad fix (#1291) updated `cross-squad/SKILL.md` content but never added it to `MANIFEST_SKILL_NAMES`, so it also never installed.

**Fix**

- **Source of truth.** Added the 5 missing skill directories to `.squad/skills/` (`squad-commands`, `squad-version-check`, `tiered-memory`, `iterative-retrieval`, `reflect`). The pre-existing `sync-skill-templates.mjs` runs in `prebuild` and propagates them to both `packages/squad-cli/templates/skills/` and `packages/squad-sdk/templates/skills/`.

- **`MANIFEST_SKILL_NAMES`** grew from 10 → 14 entries: added `tiered-memory`, `iterative-retrieval`, `reflect`, `cross-squad`.

- **Anti-regression guard.** The install loop in `sdk-init.ts` now collects missing skill source dirs and `throw`s with a clear remediation message (`Run \`node scripts/sync-skill-templates.mjs\``) instead of silently skipping. This is what would have surfaced #1289 at build time instead of in user installs.

- **Provenance honesty.** `tiered-memory/SKILL.md` rewritten to:
  - Frontmatter: `confidence: design (runtime not yet implemented)` + `source: design proposal`
  - Added prominent "Status (v0.10.0)" callout linking to #1264 for the runtime gap
  - Removed the fabricated `tamirdresher/tamresearch1` measurement table
  - Removed reference to non-existent `docs/tiered-memory-guide.md`
  - References section now points to real issues (#1264, #686, #600)

- **Test guard.** New regression test in `test/init.test.ts` (`should install every manifest-curated skill`) asserts every entry in the expected manifest list ends up at `.copilot/skills/{name}/SKILL.md` after `initSquad()`.

**Out of scope (tracked separately)**

The tiered-memory runtime (storage scaffolding under `.squad/memory/hot|cold|wiki/`, Scribe promotion logic, spawn-template tier-aware reads) remains tracked in #1264. This change lands the install-time fixes; runtime work follows in a separate PR.

The comprehensive `cross-squad-communication` plugin from `tamirdresher/squad-skills` is also separate; this change just adds the existing upstream `cross-squad` skill to the manifest so users get the registry-aware version that landed with #1291.
