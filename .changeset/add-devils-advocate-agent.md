---
"@bradygaster/squad-sdk": minor
"@bradygaster/squad-cli": minor
---

Add **Devil's Advocate** as a built-in always-on agent (companion to Fact Checker)

`squad init`, `squad cast`, and `squad upgrade` already auto-scaffold Scribe, Ralph, RAI, and Fact Checker as always-on built-ins (#1223). This adds a fifth: **Devil's Advocate** (😈) — a design challenger that owns counter-arguments, pre-mortems, assumption-surfacing, and alternative-approach exploration.

**Why a separate agent (not part of Fact Checker)?**

The pre-existing `fact-checker` role declared dual operating mode ("Devil's Advocate & Verification Agent") and its routingPatterns included `"devil's advocate"`. In practice these are two distinct skills:

| Question | Owner |
|---|---|
| "Is this claim true? Does this URL / version / API exist?" | **Fact Checker** (empirical verification) |
| "Is this plan wise? What is the strongest argument against it? What would we do if X was forbidden?" | **Devil's Advocate** (design challenge) |

Mixing them blurs the role and makes it unclear which mode the agent is operating in. Splitting them gives each agent a sharp scope and a distinct charter.

**What this change does**

- New role `devils-advocate` in `packages/squad-sdk/src/roles/catalog-engineering.ts` (category: `quality`, emoji: 😈) with design-challenge routing patterns.
- New charter template `packages/squad-cli/templates/devils-advocate-charter.md` (used by `squad upgrade` to scaffold the agent on existing squads).
- `init.ts` — adds `devils-advocate` to the default `agents:` array so fresh `squad init` produces `.squad/agents/devils-advocate/`.
- `upgrade.ts` — adds `devils-advocate` to `ensureBuiltinAgents` so existing squads get the agent on `squad upgrade`. Idempotent (will not clobber an existing customized charter).
- `cast.ts` — `devilsAdvocateMember()`, `devilsAdvocateCharter()`, `hasDevilsAdvocate` check in `createTeam`, charter-dispatch branch, and roster banner line. Interactive `squad cast` now offers Devil's Advocate as an always-on advisory agent.
- `AGENT_TEMPLATES` map entry for the new role, plus clarification of the `fact-checker` entry's description (now focused on verification only).
- `TEMPLATE_MANIFEST` entry for the new charter template so `squad upgrade` propagates it.
- **Fact Checker cleanup**: removed `"devil's advocate"` from `fact-checker`'s `routingPatterns` so the new Devil's Advocate role owns that routing exclusively. Fact Checker's expertise / voice remain unchanged.

**Test coverage**

- New `test/devils-advocate-role.test.ts` — 7 assertions: catalog presence, routing patterns, distinct expertise (does not claim "claim verification"), boundary delegation to Fact Checker, template file existence, template differs-from-Fact-Checker section, template methodology section.
- Updated `test/fact-checker-role.test.ts` — asserts `"devil's advocate"` is no longer in fact-checker's routing (companion role now owns it).
- Updated `test/template-routing.test.ts` — TEMPLATE_MANIFEST pin includes `devils-advocate-charter.md` → `templates/devils-advocate-charter.md`.

All 310 tests across init/cli/init/sdk/cast pass. `npm run lint` is clean.

**Out of scope**

- `packages/squad-sdk/templates/` does not currently mirror `fact-checker-charter.md` either (only Rai is in both); the SDK runtime path reads from CLI templates via `getTemplatesDir()`. Mirroring all charter templates to SDK templates is a separate cleanup.
