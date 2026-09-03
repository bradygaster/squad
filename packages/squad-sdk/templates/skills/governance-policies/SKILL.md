---
name: "governance-policies"
description: "Team-wide governance rules recurring across agent histories: error lockout, product isolation, peer quality check, and the Squad Ships It boundary heuristic"
domain: "team-governance"
confidence: "high"
source: "mature learnings promoted from Flight, Procedures, and PAO histories during team reskill"
---

## Context

These policies were established 2026-03-15 and referenced repeatedly across
multiple agents' histories since. They apply to every agent, not just the
one who happened to record them — promoted here so they stop being
re-derived per-agent.

## Patterns

### Agent error lockout

An agent locked out after 2 errors in a session is reassigned rather than
retried a third time. Prevents repeat-failure loops from burning a session.

### Product isolation rule

Tests and CI must never depend on the dev team's agent/cast names. The
product (Squad-as-shipped) and the team building it (this repo's cast) are
separate concerns — framework tests must remain name-agnostic.

### Peer quality check

Run tests before declaring work finished. This is a peer-review gate, not
optional cleanup — it catches regressions before a PR reaches a human.

### "Squad Ships It" boundary heuristic

Litmus test for what belongs in this repo's docs/scope: if Squad doesn't
ship the code, it's IRL (out-of-repo) content. Use it to decide what to keep
vs. cut:

- Delete external infrastructure docs
- Reframe platform integration docs to describe Squad's side of the
  integration only
- Keep Squad behavior/config docs

## Anti-Patterns

- Re-deriving these rules independently per agent instead of citing this skill
- Writing a test or CI check that special-cases a specific agent's name
- Marking work "done" without a peer-review test pass
- Keeping third-party infrastructure documentation "for completeness" when
  Squad doesn't ship or own that code
