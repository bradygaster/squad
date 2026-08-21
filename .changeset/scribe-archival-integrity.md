---
'@bradygaster/squad-sdk': minor
'@bradygaster/squad-cli': minor
---

Make archival incapable of destroying state (#1774, #1783, #1760)

Archival is a two-half operation — append to a destination, trim from a source.
Three production defects came from those halves coming apart, each one silently
deleting team history while reporting success.

New `state/io/archival` module in the SDK enforces the five rules in code rather
than only in prompt text:

- `resolveTrackedDestination()` / `isTrackedInGit()` — refuse to archive into a
  destination that is not git-tracked, or redirect to a tracked fallback. Under a
  git-excluded `.squad/`, already-tracked files still commit while brand-new files
  silently never do, which turns archival into deletion (#1783).
- `archiveEntries()` — append, verify by literal heading containment **and** entry
  count, and only then trim. A failed append leaves the source completely intact
  (#1774).
- `formatArchivalReport()` — reports entry counts and refuses to render an
  unbalanced result. File size is not a valid integrity signal, since a merge and
  an archive in the same pass move size in opposite directions.
- `prepareInboxBodyForMerge()` / `demoteHeadings()` — fence-aware heading demotion
  so inbox `##` sections land at `####` beneath an `###` entry instead of breaking
  document hierarchy (#1760). `#` lines inside fenced code blocks are never
  rewritten.

Scribe's charter, spawn template, and the `decision-hygiene` watch capability
prompt now carry the same rules.

**`squad nap` no longer destroys decision history.** `archiveDecisions()` in the
CLI is a second, *shipped and user-invocable* archival path (`squad nap`, REPL
`/nap`) that had all three defects independently of the agent path, and it is now
wired to the SDK module:

- It appended to `.squad/decisions-archive.md` with no tracked-destination check.
  With `.squad/` git-excluded and no archive file yet, every archived record was
  written somewhere that could never be committed while the trim of the tracked
  `decisions.md` committed normally — a total loss of the archived records.
- It trimmed the source unconditionally, even on the branch where the append was
  skipped, and never verified that the append landed.
- It split records on `/^###\s/` with no fence tracking, so a `###` line inside a
  fenced code sample was treated as a record boundary and severed the record.

Archival now refuses to run when the destination is untracked *and* git-ignored,
verifies the appended entry count before removing anything from the source, and
reuses the SDK's fence-aware scanner for record boundaries. Because this changes
the behavior of a user-invocable command rather than only prompt text, the CLI
takes a minor bump.
