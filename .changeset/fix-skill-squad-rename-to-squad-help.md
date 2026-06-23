---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Fix `skill(Squad)` discovery — rename disambiguation skill to `squad-help` (supersedes #1297)

PR #1297 added a disambiguation skill named `squad` so models calling `skill(Squad)` would get a redirect instead of "Skill not found". After local end-to-end testing on 2026-06-13: **the skill ships to disk correctly but never shows up in Copilot CLI's `/skills` list**.

## Root cause (verified against Copilot CLI source 1.0.62-2)

Decompiling `~/.copilot/pkg/win32-x64/1.0.62-2/app.js`:

1. **Copilot CLI's skill schema is `{name, description, source, baseDir, allowedTools, pluginName, pluginVersion}`** (line 989). Frontmatter fields like `triggers:`, `domain:`, `confidence:`, `license:` are silently ignored.
2. **Skill loader returns `{skills, warnings, errors}`** (line 4427). Skills that fail to load are reported as errors.
3. **A skill named `squad` collides with the Copilot agent named `Squad`** (registered at `.github/agents/squad.agent.md`). The agent wins; the skill is hidden from `/skills`.

The original `triggers:` frontmatter from #1297 was based on a wrong assumption — Copilot CLI doesn't read that field. Triggering happens via natural-language match against `description:`, and the skill name is what `skill(X)` looks up.

## Fix

1. **Rename** the disambiguation skill `squad` → `squad-help`. Avoids the agent-name collision, descriptive enough that the model can find it via description match when a user says *"how do I use squad"* or *"squad help"*.
2. **Update SKILL.md content:**
   - `name: "squad-help"` (was `"squad"`)
   - Removed `triggers:`, `domain:`, `confidence:`, `source:`, `license:` (all ignored by Copilot CLI)
   - Added `allowedTools: []` (matches Copilot CLI's schema)
   - `description:` rewritten to be self-explanatory so natural-language match works
   - Body still explains the agent-vs-skill distinction and routes to `task(agent_type="Squad", …)` for misdirected `skill(Squad)` attempts
   - Added explicit note about `/squad` slash command: it does not exist (slash commands are built-in CLI keywords, not auto-mapped from skills) and there's no way to create one without a Copilot CLI feature change
3. **Update** `MANIFEST_SKILL_NAMES` in `packages/squad-sdk/src/config/init.ts`: `'squad'` → `'squad-help'`.
4. **Add** `TEMPLATE_MANIFEST` entry in `packages/squad-cli/src/cli/core/templates.ts` for `squad-help` so `squad upgrade` also propagates the skill (independent of #1297 which only updated MANIFEST_SKILL_NAMES — `squad upgrade` uses a different code path that reads TEMPLATE_MANIFEST).

## Test coverage

New `test/init.test.ts > should install the squad-help disambiguation skill`:
- Asserts `.copilot/skills/squad-help/SKILL.md` exists after `initSquad()`
- Asserts the frontmatter says `name: "squad-help"` (not `"squad"`) — regression guard against re-introducing the collision
- Asserts content references `agent_type="Squad"` (the correct invocation path)
- Asserts content references `squad-commands` (the right next-step skill)

26/26 init tests pass; `npm run lint` clean.

## Supersedes #1297

PR #1297 added a colliding-name skill. This PR is the correct version. Close #1297 in favor of this one; the consolidated changeset will be picked up here.

## Out of scope (separate issue worth filing)

`squad upgrade` synced only 10 of 16 installed skills in local testing — `TEMPLATE_MANIFEST` (used by upgrade) is out of sync with `MANIFEST_SKILL_NAMES` (used by init). Specifically, `tiered-memory`, `iterative-retrieval`, `reflect`, `cross-squad`, `cross-squad-communication` (added in PRs #1292 + #1295) have entries in `MANIFEST_SKILL_NAMES` but not in `TEMPLATE_MANIFEST`. Will file a follow-up to add those to `TEMPLATE_MANIFEST` so both code paths agree.
