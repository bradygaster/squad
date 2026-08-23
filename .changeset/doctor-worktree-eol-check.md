---
'@bradygaster/squad-cli': patch
---

`squad doctor` now checks that every file pinned to `eol=lf` by `.gitattributes` is actually LF **on disk**, not just in the index. `.gitattributes` governs checkout, so adding an `eol=lf` rule never repairs a working tree that already exists — the affected files stay CRLF indefinitely, and a CRLF shebang makes a vitest suite load zero tests while still looking green. The check names the stale files and points at `npm run fix:crlf`, a new repair script that rewrites them from the index and refuses to overwrite any file with uncommitted changes. Closes #1793.
