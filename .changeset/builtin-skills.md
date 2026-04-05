---
"@bradygaster/squad-cli": minor
---

Ship 8 built-in skills with squad init/upgrade (#788)

New skills distributed automatically on `squad init` and `squad upgrade`:
- **error-recovery** — graceful failure handling patterns
- **secret-handling** — credential safety and secrets management
- **git-workflow** — branch management and commit conventions
- **session-recovery** — checkpoint and recovery patterns
- **reviewer-protocol** — code review gate patterns
- **test-discipline** — test-first discipline and coverage
- **agent-collaboration** — multi-agent handoff patterns
- **squad-conventions** — (already shipped, now part of curated set)

All skills are squad-owned (`overwriteOnUpgrade: true`) and update on upgrade.
