---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Coordinator now recognises "spawn a squad" / "another squad" / "two squads" as Squad-PRODUCT vocabulary

## Symptom

A coordinator initialised by `squad init` saw prompts like *"spawn two squads of designers and devs"* and fanned out raw `task` agents inside its own context, treating "squad" as generic English for "team / group". It never invoked the bundled `cross-squad` or `cross-squad-communication` skills, so the peer-squad delegation protocol (registry / manifest / sync CLI / git-async / GitHub-issue patterns) was bypassed entirely.

Two structural holes in `squad.agent.md` allowed this:

1. The Routing table had no row that mapped "spawn a squad" phrasing to the Squad-PRODUCT concept.
2. The Skill-aware-routing block was process discipline ("check skill directories by domain relevance") with no hard "if the user's word matches a skill name, MUST load the skill" trigger.

## Fix

Two surgical edits to the canonical `.squad-templates/squad.agent.md` (synced to all 4 mirror copies via `scripts/sync-templates.mjs --sync`):

1. **New routing-table row** — matches "spawn a squad", "another squad", "two squads", "second squad", "fan out to squads", "delegate to a squad", or any phrasing that treats "squad" as a unit to spawn or address. Action: invoke the `skill` tool on `cross-squad` AND `cross-squad-communication` BEFORE any `task` spawn, then delegate via Pattern 0/1/2/3 — never fan out raw `task` agents in the coordinator's own context.

2. **New "Hard trigger — keyword-to-skill match" paragraph** at the top of the Skill-aware-routing block — if any word in the request matches an installed skill name (e.g., "squad" → `cross-squad`, "reflect" → `reflect`, "ceremony" → matching ceremony skill, "fact-check" → `fact-checking`, "release" → `release-process`), the coordinator MUST invoke the `skill` tool to fully load that skill BEFORE designing its approach. Includes a one-line "failure mode this closes" pointer so the rule survives future paraphrasing.

3. **Companion `cross-squad/SKILL.md` opener strengthened** — added a one-line "Read this FIRST any time the user says 'squad' as a thing to spawn / delegate to / address" callout above the existing `## Context` paragraph, so even a coordinator that skips the routing-table row still hits the trigger when it does eventually load the skill.

## Regression test

`test/template-sync.test.ts` now asserts, for every mirrored copy of `squad.agent.md` (5 locations — canonical + 3 template mirrors + `.github/agents/`), that:

* The routing-table row exists and contains all three trigger phrases ("spawn a squad", "another squad", "two squads").
* The row's action cell references the `cross-squad` skill AND the `skill` tool.
* The "Hard trigger" + "keyword-to-skill match" markers are both present in the Skill-aware-routing block.
* The hard-trigger paragraph names the worked example `"squad" → cross-squad` so future edits can't drop the concrete mapping.

223/223 template-sync tests pass.

## Composability

Disjoint from all other open PRs in the v0.10 stabilisation set (#1292, #1293, #1295, #1298, #1300, #1301, #1302, #1303, #1304, #1306). Only modifies `.squad-templates/squad.agent.md` + its 4 mirrors + `cross-squad/SKILL.md` + the template-sync test. Existing squads can pick up the fix two ways: (a) `squad upgrade` once this lands, or (b) hand-patch `.squad/squad.agent.md` against the upstream diff and restart the Copilot CLI session.
