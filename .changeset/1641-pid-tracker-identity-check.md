---
"@bradygaster/squad-cli": patch
---

Watch's PID tracker now cross-checks a live process's actual OS start time against the tracked spawnedAt before killing it, instead of trusting a bare PID match. Prevents killing an unrelated process that happens to have been assigned a previously-tracked PID (e.g. after a crash + reboot).
