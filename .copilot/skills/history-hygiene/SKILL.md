---
name: history-hygiene
description: Record reconciled final outcomes to history.md, not intermediate requests or obsolete claims
domain: documentation, team-collaboration
confidence: high
source: earned (stale history reversal incident, team intervention)
---

## Context

History files are cold-start context, not the source of truth for live behavior. Stale or incorrect
entries poison decision-making downstream. A stale-history incident proved that an old history claim
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
- "Migration target: v0.8.17 (initial target was later corrected before execution)"
- "Node runtime: follow the current `package.json` `engines.node` requirement"

✗ **Incorrect:**
- "Migration target: v0.6.0" (when that request was later reversed)
- Recording what was *requested* instead of what *actually happened*
- Logging entries before outcome is confirmed

## Anti-Patterns

- Writing intermediate or "for now" states to disk
- Attributing decisions without confirming final direction
- Treating history as authoritative over live source or workflow behavior
- Copying dated assignments, status reports, or retired workarounds into a reusable skill
