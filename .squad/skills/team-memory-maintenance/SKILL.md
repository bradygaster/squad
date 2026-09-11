---
name: team-memory-maintenance
description: Maintain Squad session logs, decision inboxes, and agent history through the active state backend
domain: squad-internals, state-management
confidence: high
source: current collaboration rules, source-of-truth guidance, and Scribe operating contract
---

## Context

Use this skill when maintaining shared Squad memory after a substantive work session. It covers
session logs, the decision inbox, canonical decisions, and concise cross-agent updates. Use
`archival-integrity` whenever an operation moves or trims stored entries.

## Scope

- Activate after substantive work that changes shared Squad memory or when processing decision inbox or history updates.
- Allowed targets: `.squad/` session logs, decision inbox entries, canonical decision records, and concise cross-agent history updates through the active backend.
- Exclusions: product source changes, arbitrary repository cleanup, and direct writes that bypass the active backend.

## Patterns

1. Resolve every `.squad/` path from the provided team root; use `git rev-parse --show-toplevel`
   only when no team root is available.
2. Honor the active state backend. Use its state operations for mutable Squad state; do not bypass
   that backend with branch switching, note-ref pushes, resets, or hand-managed persistence.
3. Record a concise factual session log after substantial work: participants, completed work,
   decisions, and final outcomes. Do not log requests or tentative plans as facts.
4. Process decision-inbox entries only after reading them. Before merging, deduplicate exact
   entries and normalize nested headings with the archival-integrity helper.
5. Confirm the merged content is present in the canonical decision record before deleting an inbox
   entry. Preserve a decision’s author and final rationale.
6. Add a short history update only when a finalized decision materially changes another role’s
   work. Put reusable procedure in a skill instead of duplicating it across histories.
7. Re-read state through the active backend after consequential writes. If the required backend
   capability is unavailable, stop and report the unavailable operation rather than reporting
   successful persistence.

## Stop conditions

- Stop if the team root or active backend cannot be resolved.
- Stop if the required backend write or read-back verification capability is unavailable.
- Stop if merged content cannot be verified after the write.

## Examples

`agent-collaboration` defines the inbox format used by contributors. The archival helpers in
`packages/squad-sdk/src/state/io/archival.ts` enforce verified archive moves and fence-aware
heading normalization.

## Anti-Patterns

- Writing mutable backend state directly to an assumed local checkout
- Deleting an inbox entry before its merged content is verified
- Recording a transient request as a durable decision
- Filling every agent history with a copy of the same operational procedure
