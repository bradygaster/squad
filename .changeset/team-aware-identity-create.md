---
'@bradygaster/squad-cli': minor
---

`squad identity create` is now team-aware: when run with no flags and `.squad/team.md` exists, it auto-detects roles from the team roster, deduplicates them, and creates GitHub Apps only for the team's actual roles.
