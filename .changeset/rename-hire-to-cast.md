---
"squad-cli": minor
---

Rename `hire` command to `cast` in CLI help and documentation. The `hire` command continues to work as a silent alias (like `cls`/`clear` in PowerShell) — no deprecation, no warnings, it just does the same thing. All user-facing text now presents `cast` as the canonical verb because we're casting agents, not hiring humans.
