---
'@bradygaster/squad-cli': patch
---

Replace obsolete `--message` flag with `-p` in all `gh copilot` invocations. Centralizes prompt-flag construction in `buildCopilotArgs()` so future CLI surface changes only need a one-line fix.
