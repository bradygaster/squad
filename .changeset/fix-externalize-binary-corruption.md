---
"@bradygaster/squad-cli": patch
---

Fix `squad externalize`/`internalize` corrupting non-UTF-8 files under `.squad/`. Both commands copied files through a UTF-8 string round-trip (`readSync`/`writeSync`), which replaced every byte >= 0x80 with U+FFFD and, because the source was deleted right after, destroyed the only intact copy. They now copy bytes via `storage.copySync`, so binary state (diagrams, archives, a future SQLite state db) survives the round trip intact.
