---
name: history-hygiene
description: Record reconciled final outcomes to history.md, not intermediate requests or obsolete claims
domain: documentation, team-collaboration
confidence: high
source: earned (Kobayashi v0.6.0 incident, team intervention)
---

## Context

History files are cold-start context, not the source of truth for live behavior. Stale or incorrect
entries poison decision-making downstream. The Kobayashi incident proved that an old history claim
can cause future spawns to repeat a reversed decision. Reconcile an operational claim with current
implementation, workflows, tests, documentation, skills, and applicable decisions before acting on it.

## Patterns

- **Record the final outcome**, not the initial request.
- **Wait for confirmation** before writing to history — don't log intermediate states.
- **If a decision reverses**, update the entry immediately — don't leave stale data.
- **Link authority for operational facts.** Name the current source or workflow when a lesson
  depends on live behavior.
- **Promote reusable rules.** Move procedures and incident lessons that future roles need into a
  focused skill; history should retain only the evidence and outcome.

## Examples

✓ **Correct:**
- "Migration target: v0.8.17 (initially discussed as v0.6.0, corrected by Brady)"
- "Node runtime: follow the current `package.json` engine requirement (currently `>=22.5.0`)"

✗ **Incorrect:**
- "Brady directed v0.6.0" (when later reversed)
- Recording what was *requested* instead of what *actually happened*
- Logging entries before outcome is confirmed

## Anti-Patterns

- Writing intermediate or "for now" states to disk
- Attributing decisions without confirming final direction
- Treating history as authoritative over live source or workflow behavior
- Copying dated assignments, status reports, or retired workarounds into a reusable skill
