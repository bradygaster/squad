---
"@bradygaster/squad-sdk": patch
---

Guard registered memory providers in `LocalMemoryStore`. Every provider `write`, `search` and `status` call now has a timeout (`providerTimeoutMs`, default 5000 ms), so a hung engine can no longer stall `memory.write` or `memory.search`. One provider whose `status()` throws or hangs is reported as unavailable instead of failing `providerStatus()`. Recalled results go through governance on the way back: results with a class the provider could not have been sent, or whose title or snippet classifies as FORBIDDEN, are dropped and audited, and an invalid `loadGuidance` falls back to the class default. Successful replication audits now record the provider id.
