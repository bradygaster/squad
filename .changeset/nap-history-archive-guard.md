---
"@bradygaster/squad-cli": patch
---

`squad nap` no longer loses agent history when `.squad/` is excluded from git. History compression appended the older sections of a tracked `history.md` to a new `history-archive.md` and then trimmed `history.md`. When `.squad/` is in `.git/info/exclude`, the new archive is ignored, so the trim got committed and the archived sections never did. History compression now follows the same rules as decision archival: it refuses when `history.md` would be committed but its archive could not, and it rewrites `history.md` only after checking that the archive gained every archived section. A `.squad/` that is ignored as a whole still compresses as before.
