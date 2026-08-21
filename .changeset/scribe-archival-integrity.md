---
'@bradygaster/squad-sdk': minor
'@bradygaster/squad-cli': patch
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
