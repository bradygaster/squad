---
name: work-monitoring
description: Triage Squad work queues without making unintended bulk changes
domain: work-monitoring, github
confidence: high
source: watch implementation and retained board-triage lesson
---

## Context

Use this skill when monitoring Squad issues, pull requests, CI, review feedback, or a labeled
work queue.

## Scope

- Activate when monitoring a specific Squad workstream in a named repository with explicit labels and state filters.
- Allowed targets: monitoring reports, triage summaries, and narrowly scoped coordination actions on hydrated candidate items.
- Exclusions: product implementation, broad cleanup from generic labels alone, or mutations against unverified candidates.

## Patterns

- Start with an explicit workstream, repository, label set, and state filter. A shared priority or
  wave label is not sufficient scope for a bulk operation.
- Hydrate and verify candidate items before changing labels, closing issues, deleting branches, or
  dispatching work.
- After every mutation, refetch the exact item and verify the requested state transition and
  affected fields. Stop immediately and report a mismatch; do not continue with later mutations.
- Prioritize untriaged work, assigned work, CI failures, review feedback, and approved pull
  requests according to the active task’s stated priority.
- Route domain work to the responsible role; monitoring reports and coordination must not silently
  become product implementation.
- Use the focused two-pass scan when broad list retrieval is needed, then inspect only candidates
  that require action.

## Stop conditions

- Stop before any mutation if the workstream, label set, or state filter is ambiguous.
- Stop if candidate items cannot be hydrated and verified before action.
- Stop if post-mutation refetch or exact verification fails, is unavailable, or returns a
  different item state than requested.
- Stop if the requested action would exceed the explicitly scoped queue or become product work.

## Examples

`packages/squad-cli/src/cli/commands/watch/` recognizes `squad` and `squad:*` labels. The
`ralph-two-pass-scan` skill describes the list-then-hydrate optimization.

## Anti-Patterns

- Enforcing “exactly these issues” across every issue sharing a general label
- Closing, relabeling, or deleting based solely on a list response
- Treating a monitor’s role as authorization to modify product artifacts
