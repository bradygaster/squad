---
"@bradygaster/squad-cli": minor
---

Add cleanup watch capability for stale file housekeeping (#791)

- New `cleanup` capability in the `housekeeping` phase
- Clears `.squad/.scratch/` (all ephemeral temp files)
- Archives orchestration-log and session-log entries older than 30 days
- Warns about stale decision inbox files (>7 days)
- Configurable: `everyNRounds` (default: 10), `maxAgeDays` (default: 30)
- 12 new tests
