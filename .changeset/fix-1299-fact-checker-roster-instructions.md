---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix #1299: tell the coordinator to roster Fact Checker (and Ralph + Rai explicitly) in the casting flow

When a user runs `squad init` followed by `copilot --agent squad`, the coordinator's first-time casting flow correctly creates `.squad/agents/fact-checker/` on disk (per merged PR #1223) but **omits Fact Checker from the `## Members` table** in `.squad/team.md`. Rai is included, Ralph is included, Scribe is included — Fact Checker is silently dropped.

## Root cause

`.squad-templates/squad.agent.md` (the canonical coordinator instructions, mirrored to all package templates) had two gaps:

1. **Line 56** said *"Determine team size (typically 4–5 + Scribe)"* — naming only Scribe among the always-on built-ins.
2. The Rai section (line 884) explicitly told the coordinator *"Rai always appears in team.md: `| Rai | RAI Reviewer | ...`"*, but **no equivalent section existed for Fact Checker**.

So the model added Rai correctly (saw the roster-entry instruction) but had no instruction to add Fact Checker, even though the agent directory was scaffolded.

## Fix

1. Updated the team-size line to *"typically 4–5 + Scribe + Ralph + Rai + Fact Checker — the 4 always-on built-ins, see their dedicated sections below"*.
2. Added a full `## Fact Checker — Verification & Devil's Advocate` section that mirrors the Rai structure:
   - Declares the single-agent dual-mode design (per #789 + #1254) — *"single agent, two modes"*
   - Explicit **Roster Entry** line: *"Fact Checker always appears in `team.md`: `| Fact Checker | Fact Checker | .squad/agents/fact-checker/charter.md | 🔍 Verifier |`"*
   - Trigger phrase table for both Verification mode and Devil's Advocate mode
   - Confidence rating taxonomy (✅/⚠️/❌/🔍)
   - DA brief structure (steelman, assumptions, pre-mortem, alternatives, risk acceptance)
   - Boundaries, background-mode default, state location

## Changes

- `.squad-templates/squad.agent.md` (canonical source) updated.
- `sync-templates.mjs --sync` propagates to all 4 mirror targets:
  - `templates/squad.agent.md.template`
  - `packages/squad-cli/templates/squad.agent.md.template`
  - `packages/squad-sdk/templates/squad.agent.md.template`
  - `.github/agents/squad.agent.md` (this repo's own coordinator file)

## Test coverage

New `test/squad-agent-roster.test.ts` runs against **all 4 template targets** and asserts:

- The "Determine team size" line mentions Scribe, Ralph, Rai, **and** Fact Checker
- A `## Fact Checker` section exists with an explicit "always appears in team.md" roster-entry line
- The Fact Checker section declares dual operating mode (Verification + Devil's Advocate) — anchors the design from #789 + #1254 so a future PR can't accidentally split them again (cf. closed PR #1294)
- The Ralph + Rai sections are still present and unmodified

All 40 existing init/cli/init tests still pass; `npm run lint` clean.

## Verification

After this PR ships, a fresh `squad init` + `copilot --agent squad` produces a `team.md ## Members` table that includes Fact Checker alongside Scribe, Ralph, and Rai.

Closes #1299
