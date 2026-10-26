---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

`squad cost` now finds the current session from the usage ledger instead of Scribe's session logs. The interactive shell stamps every usage record with its session id (the one `/resume` restores), as a new optional `squadSessionId` field, and plain `squad cost` reports the records that share the newest one. Before, the boundary was the newest `.squad/log/*.md` file, which the shell never writes: with no session log, plain `squad cost` reported every session, and a log written by another host during a shell run hid that run's earlier turns. The summary also counts Squad sessions instead of SDK sessions, so one shell run with three agents no longer shows as four sessions. Ledgers written before this change fall back to the old cutoff, and older CLIs still read the new records.
