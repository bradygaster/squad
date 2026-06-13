---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Fix: add `squad` disambiguation skill so `skill(Squad)` lookups succeed and redirect to the right tool

**Symptom (observed in a fresh `squad init` session, 2026-06-13):**

```
◐ The Squad skill is perfect for assembling a specialized team to build C# console applications, so I'll use that to get the right specialists set up in the repo.
✗ skill(Squad)   Skill not found: Squad
◐ I see the issue—Squad is actually a custom agent type in the task tool, not a standalone skill, so I need to adjust my approach and call the task tool with agent_type set to "Squad" instead.
```

The model burns a turn on a failed skill lookup before self-correcting. The pattern is reproducible across coding models because the Squad agent's description (`"Your AI team. Describe what you're building, get a team of specialists that live in your repo."`) reads exactly like a skill description.

**Root cause:**

- `.github/agents/squad.agent.md` declares `name: Squad` — that's the **custom agent**.
- All bundled skills are hyphenated lowercase: `squad-commands`, `squad-conventions`, `squad-version-check`, etc.
- Nothing matches the literal name `Squad` for skill lookup.
- The model's first guess (`skill(Squad)`) fails before it figures out the correct path (`task` tool with `agent_type="Squad"`).

**Fix:**

Add a small `squad` skill that exists purely to **catch the bad lookup and redirect**. It does no work; it explicitly tells the model:

- Squad is a **custom agent**, not a skill.
- To invoke the coordinator: `task(name=…, agent_type="Squad", prompt=…)`.
- To list commands: trigger the `squad-commands` skill ("squad commands" / "what can squad do" / etc.).
- To init in a new project: `squad init` in the shell (not from inside a session).

Triggers (`squad`, `use squad`, `use the squad skill`, `squad skill`, `assemble a squad`, `set up squad`, `squad agent`, `squad team`) cover the natural-language phrasings that would have led the model to mis-call `skill(Squad)`.

**Changes:**

- New `.squad/skills/squad/SKILL.md` (canonical source). `sync-skill-templates.mjs` (prebuild) propagates to both `packages/squad-cli/templates/skills/` and `packages/squad-sdk/templates/skills/`.
- `MANIFEST_SKILL_NAMES` in `packages/squad-sdk/src/config/init.ts` adds one entry: `'squad'`. Now 11 entries.

**Test coverage:**

New `test/init.test.ts > should install the squad disambiguation skill` asserts:
- File exists at `.copilot/skills/squad/SKILL.md` after `initSquad()`
- Content includes the literal string `"CUSTOM AGENT"` (warns the model)
- Content includes the correct invocation pattern `agent_type="Squad"`
- Content references `squad-commands` (the right skill for the menu use case)

**Out of scope:**

A separate, deeper UX improvement would be to make Copilot CLI's skill loader treat the agent name as a soft alias to the `squad` skill so the lookup succeeds even if a user removes this skill. That's a Copilot CLI change, not a Squad change, and is too large for this fix.

**Composability:**

Adds a single entry to `MANIFEST_SKILL_NAMES`. Disjoint from #1292 (which adds tiered-memory/iterative-retrieval/reflect/cross-squad) and #1295 (which adds cross-squad-communication). All three can land in any order.
