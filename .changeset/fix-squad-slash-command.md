---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Make `/squad` a real slash command — rename `squad-commands` skill to `squad` with `user-invocable: true`

## What this enables

Users can type `/squad` in any Copilot CLI session in a squad-initialized project and get the categorized command catalog (Install & Upgrade, Team Management, Issues & PRs, Plugins & Skills, Model & Cost, Sessions & State). This is what users naturally expect — Squad ships an in-chat command surface, and the slash key is the muscle memory.

## Verified mechanism (Copilot CLI 1.0.62-2)

Decompiling `~/.copilot/pkg/win32-x64/1.0.62-2/sdk/index.js` line 2618:

```js
getLoadedSkills().filter(e => e.userInvocable)
  .map(e => ({name: `/${eF(e)}`, isSkill: true, skill: e}))
```

Any skill with frontmatter `user-invocable: true` is auto-registered by Copilot CLI as a slash command at `/<skill-name>`. The built-in `customize-cloud-agent` skill shipped with Copilot CLI uses this exact pattern with `user-invocable: false`; setting it to `true` makes the skill appear in `/skills` AND as a slash keystroke.

The previous skill `squad-commands` had no `user-invocable` field (Copilot CLI defaults to false), so `/squad-commands` did not exist. Users either typed natural language ("squad commands", "what can squad do") or never discovered the menu.

## Changes

1. **Renamed** the `squad-commands` skill to `squad` (canonical source in `.squad/skills/squad/`).
2. **Frontmatter rewritten** to match Copilot CLI's actual schema (verified against decompiled source):
   - `name: squad` (was `squad-commands` — `/squad` is shorter, intuitive, and matches the agent name without colliding because slash commands and skill lookups are separate namespaces)
   - `user-invocable: true` ← **the load-bearing change**
   - `description:` rewritten to be self-explanatory so natural-language match also still works
   - `allowedTools: []` (matches Copilot CLI's schema)
   - Removed unused fields: `domain:`, `confidence:`, `source:`, `triggers:` (all silently ignored by Copilot CLI)
3. **Body text** updated to reference `/squad` as the primary invocation path.
4. **`MANIFEST_SKILL_NAMES`** in `packages/squad-sdk/src/config/init.ts`: `'squad-commands'` → `'squad'`.
5. **`TEMPLATE_MANIFEST`** in `packages/squad-cli/src/cli/core/templates.ts`: updated `source` + `destination` + `description` to reflect the rename.
6. **Removed** stale `packages/{squad-cli,squad-sdk}/templates/skills/squad-commands/` directories.

## Test coverage

New `test/init.test.ts > should install the squad slash-command skill with user-invocable: true`:
- Asserts `.copilot/skills/squad/SKILL.md` exists after `initSquad()`
- Asserts frontmatter contains `user-invocable: true` (load-bearing — without this, no slash command)
- Asserts frontmatter `name: squad` (load-bearing — slash command is `/<name>`)
- Asserts the menu presentation rules are still in the body

26/26 init tests pass; `npm run lint` clean.

## How users will experience this

After `squad init` + opening Copilot CLI in the project:

```
> /squad
📋 Squad Commands — pick a category:
  1. Install & Upgrade
  2. Team Management
  3. Issues & PRs
  4. Plugins & Skills
  5. Model & Cost
  6. Sessions & State
```

## Composability with other open PRs

- **Disjoint from #1292** (skills bundling, 4 new entries). Both modify `MANIFEST_SKILL_NAMES` but `squad-commands → squad` is a rename, not an add. Merge order doesn't matter — the renamer wins.
- **Disjoint from #1302** (`squad-help` disambiguation skill). `squad-help` covers the `skill(Squad)` misdirect case; this PR covers the `/squad` slash command UX. They're complementary.

## Out of scope (future, mentioned in user request)

The user wants to eventually install the `squad` skill **machine-wide** (e.g., `~/.copilot/skills/squad/`) so `/squad init` works in any folder even before `squad` is initialized in that project. That's a separate piece of work because:
1. It requires a `squad install --global-skill` command or similar (none exists today)
2. The `/squad` menu currently calls into `squad` CLI subcommands that assume `.squad/` exists in cwd — the menu would need a "Init Mode" branch for the "no `.squad/` yet" case
3. Copilot CLI's `~/.copilot/skills/` is a personal scope, so it'd need to be opt-in per-user

Will file a follow-up issue tracking that work after this lands.
