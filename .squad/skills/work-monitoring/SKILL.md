---
name: work-monitoring
description: Triage Squad work queues without making unintended bulk changes
domain: work-monitoring, github
confidence: high
source: retained pre-recast procedure, reviewed for the descriptive cast
---

# Work Monitoring

Use this skill when monitoring Squad issues, pull requests, CI, review feedback, or a labeled work
queue.

## Scope

- Start with a named repository, explicit workstream, label set, and state filter.
- Produce monitoring reports, triage summaries, and narrowly scoped coordination actions.
- Do not turn monitoring into product implementation or broad cleanup.

## Procedure

1. List candidates using the narrowest available filters.
2. Hydrate every candidate before mutating it; list results alone are not sufficient evidence.
3. Prioritize untriaged work, assigned work, CI failures, review feedback, and approved pull
   requests according to the active request.
4. Route domain work to the accountable specialist in `.squad/routing.md`.
5. After every mutation, refetch the exact item and verify the requested transition and fields.
6. Stop immediately on a verification mismatch; do not continue with later mutations.
7. Use the focused two-pass scan for broad retrieval, then inspect only actionable candidates.

## Stop Conditions

- Stop before mutation when the workstream, labels, repository, or state filter is ambiguous.
- Stop when candidates cannot be hydrated or post-mutation state cannot be verified.
- Stop when an action would exceed the explicitly scoped queue or become product work.

## Anti-Patterns

- Applying bulk changes from a generic label alone.
- Closing, relabeling, assigning, or deleting based only on list output.
- Treating Ralph's monitoring role as authorization to modify product artifacts.
