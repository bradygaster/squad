---
"@bradygaster/squad-cli": patch
---

Fix #1222: Auto-scaffold Fact Checker agent during `squad init`, `squad cast`, and `squad upgrade`

The Fact Checker role was added in v0.10.0 (#789) with its catalog entry, charter template, skill, AGENT_TEMPLATES map entry, and template manifest entry — but it was never wired into the user-facing onboarding flow. Users running `squad init` got Scribe/Ralph/Rai but never saw Fact Checker. Users running `squad upgrade` from older versions never got Rai or Fact Checker scaffolded either (upgrade was intentionally silent on agents).

This change wires Fact Checker (and Rai, as a defensive backfill) into three code paths:

- **`init.ts`** — adds `fact-checker` to the default `agents:` array passed to `sdkInitSquad()`. Fresh `squad init` now produces `.squad/agents/fact-checker/`.
- **`cast.ts`** — adds `factCheckerMember()`, `factCheckerCharter()`, `hasFactChecker` branches in `castTeam()`, and the roster banner line. Interactive `squad cast` now offers Fact Checker as an always-on background agent.
- **`upgrade.ts`** — new `ensureBuiltinAgents()` runs in `runEnsureChecks()`. Idempotently scaffolds `.squad/agents/Rai/` and `.squad/agents/fact-checker/` from shipped charter templates if missing. Never overwrites existing charters or history files. Scribe and Ralph are intentionally NOT scaffolded by upgrade (they predate this fix in all squads, and their charters are inlined in cast.ts).

Result: any squad — fresh init, interactive cast, or upgrade from any prior version — now ends up with Fact Checker available.

