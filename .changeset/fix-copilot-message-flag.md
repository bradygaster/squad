---
'@bradygaster/squad-cli': patch
'@bradygaster/squad-sdk': patch
---

Fix obsolete --message flag in watch and loop commands

Replace `--message` with `-p` across all watch capabilities and loop command.
Use `copilot` directly on Windows to avoid .cmd console window issues,
fall back to `gh copilot` on other platforms. Fix TOKEN_PATH typo in
comms-teams.ts (pre-existing bug from #906).
