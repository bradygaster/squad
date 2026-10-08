---
"@bradygaster/squad-sdk": patch
---

Fix `squad init` and team casting failing on Windows with `EPERM: operation not permitted, fsync`. The durable casting registry fsynced directory handles after each rename, which Windows rejects; directory flushes are now skipped on `win32`, where the file-level fsync is the only flush available. Also fixed the casting writer lock crashing with `EPERM ... rename` instead of waiting when another process already holds it on Windows, which reports a rename onto an existing directory as `EPERM` rather than POSIX `ENOTEMPTY`/`EEXIST`. Lock timeouts now name the last publish error, and releasing the lock retries briefly when Windows transiently rejects the directory rename (e.g. antivirus holding a freshly written file), instead of leaving a recovery guard that blocks later casting writers. If Windows still blocks deleting the released lock copy, release succeeds and a later release sweeps the leftover out of `.squad/casting/`.
