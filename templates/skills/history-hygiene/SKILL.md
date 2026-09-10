---
name: history-hygiene
description: Record final outcomes to history.md, not intermediate requests or reversed decisions
domain: documentation, team-collaboration
confidence: high
source: earned (release-history correction incident)
---

## Context

History files (.md files tracking decisions, spawns, outcomes) are read cold by future agents. Stale or incorrect entries poison decision-making downstream. A release incident proved this: history retained an obsolete v0.6.0 target after the user had changed it to v0.8.17. Future spawns read the wrong truth and repeated the mistake.

## Patterns

- **Record the final outcome**, not the initial request.
- **Wait for confirmation** before writing to history — don't log intermediate states.
- **If a decision reverses**, update the entry immediately — don't leave stale data.
- **One read = one truth.** A future agent should never need to cross-reference other files to understand what actually happened.

## Examples

✓ **Correct:**
- "Migration target: v0.8.17 (initially discussed as v0.6.0, corrected by the user)"
- "Reverted to Node 18 per the user's explicit request on 2024-01-15"

✗ **Incorrect:**
- "The user directed v0.6.0" (when later reversed)
- Recording what was *requested* instead of what *actually happened*
- Logging entries before outcome is confirmed

## Anti-Patterns

- Writing intermediate or "for now" states to disk
- Attributing decisions without confirming final direction
- Treating history like a draft — history is the source of truth
- Assuming readers will cross-reference or verify; they won't
