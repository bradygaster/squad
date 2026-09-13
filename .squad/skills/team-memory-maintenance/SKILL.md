---
name: team-memory-maintenance
description: Merge accepted Squad decisions through the active state backend with exact verification
domain: squad-internals, decision-management
confidence: high
source: retained pre-recast procedure, narrowed to the current Scribe contract
---

# Team Memory Maintenance

Use this skill only for accepted durable decisions. The current Scribe role does not maintain
session logs, orchestration logs, specialist histories, onboarding records, or general team memory.

## Scope

- Allowed targets: `.squad/decisions/inbox/` and `.squad/decisions.md`.
- Use the active state backend for mutable Squad state.
- Preserve decision authorship, rationale, and accepted scope.
- Use archival-integrity procedures whenever accepted records are moved or compacted.

## Procedure

1. Resolve the supplied team root and configured state backend.
2. List and read every candidate inbox entry before acting.
3. Merge only decisions that have explicit acceptance evidence.
4. Deduplicate exact decision headings without rewriting unrelated decisions.
5. Normalize nested headings while preserving relative hierarchy and fenced code blocks.
6. Re-read `.squad/decisions.md` and verify the merged content before deleting an inbox entry.
7. Refetch after deletion and verify the exact inbox entry is absent.
8. Stop on any mismatch and report the incomplete operation.

## Stop Conditions

- Stop if the team root, active backend, acceptance evidence, or required read-back capability is
  unavailable.
- Stop if merged content or deletion cannot be verified exactly.
- Do not manufacture a durable record for a tentative request, onboarding observation, or
  unaccepted recommendation.

## Anti-Patterns

- Writing session logs or specialist histories.
- Bypassing the state backend with branch switching, note-ref pushes, resets, or manual persistence.
- Deleting inbox content before verifying the canonical merge.
- Expanding a decision-only maintenance request into product or repository cleanup.
