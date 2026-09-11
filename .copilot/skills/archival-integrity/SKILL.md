---
name: archival-integrity
description: Preserve content when moving entries between tracked Squad state files
domain: state-management, documentation
confidence: high
source: implemented archival helpers and regression tests
---

## Context

Use this skill for decision archival, history summarization, or any operation that moves entries
between repository state files. A move has two halves: append to the destination, then trim the
source. Treat it as data loss prevention, not text cleanup.

## Scope

- Activate when moving entries between tracked Squad state files such as decision logs, histories, or inbox merges.
- Allowed targets: tracked repository state files and their designated tracked archives.
- Exclusions: untracked destinations, byte-delta-only validation, and trimming source content before the destination is verified.

## Patterns

1. Resolve a destination that is already tracked before writing. If the requested destination is
   untracked, redirect to a tracked archive or stop.
2. Append first, re-read the destination, and prove every moved heading is present.
3. Compare entry counts before and after the append. Trim only when the count increased by exactly
   the selected number of entries.
4. Report measured `removed from source / added to destination` counts. Do not use byte deltas as
   an integrity signal.
5. When inserting an inbox body beneath a `###` entry, demote its shallowest heading to `####`
   while preserving relative levels and fenced-code content.
6. Prefer `archiveEntries()`, `prepareInboxBodyForMerge()`, and `formatArchivalReport()` from
   `packages/squad-sdk/src/state/io/archival.ts` over hand-rolled archival logic.

## Stop conditions

- Stop if the destination is not already tracked.
- Stop if the appended headings cannot be re-read from the destination.
- Stop if the entry-count increase does not exactly match the selected move set.

## Examples

The archival tests in `test/state/archival.test.ts` cover append failures, swallowed writes,
untracked destinations, CRLF inputs, count verification, and fence-aware heading demotion.

## Anti-Patterns

- Creating a timestamped archive under a git-excluded directory and assuming it will persist
- Deleting source content before the destination has been verified
- Reporting “no archival required” without measuring eligible entries
- Treating a matching file-size delta as proof that the content survived
