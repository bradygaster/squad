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

## Patterns

- Start with an explicit workstream, repository, label set, and state filter. A shared priority or
  wave label is not sufficient scope for a bulk operation.
- Hydrate and verify candidate items before changing labels, closing issues, deleting branches, or
  dispatching work.
- Prioritize untriaged work, assigned work, CI failures, review feedback, and approved pull
  requests according to the active task’s stated priority.
- Route domain work to the responsible role; monitoring reports and coordination must not silently
  become product implementation.
- Use the focused two-pass scan when broad list retrieval is needed, then inspect only candidates
  that require action.

## Examples

`packages/squad-cli/src/cli/commands/watch/` recognizes `squad` and `squad:*` labels. The
`ralph-two-pass-scan` skill describes the list-then-hydrate optimization.

## Anti-Patterns

- Enforcing “exactly these issues” across every issue sharing a general label
- Closing, relabeling, or deleting based solely on a list response
- Treating a monitor’s role as authorization to modify product artifacts
