---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

fix: respect SQUAD_HOME in capabilities.ts and comms-teams.ts, implement SQUAD_PERSONAL_DIR env var, fix Windows shell flag in loop preflight, link personal squad during init

- capabilities.ts: use `resolveSquadHome()` instead of hardcoded `~/.squad/` for machine-capabilities.json (#1280)
- comms-teams.ts: use `resolveSquadHome()` instead of hardcoded `~/.squad/` for Teams OAuth token storage (#1279)
- resolution.ts: implement `SQUAD_PERSONAL_DIR` env var override in `resolvePersonalSquadDir()` (#1278)
- loop.ts: add `shell: process.platform === 'win32'` to `checkCopilotCli()` execFile call (#1372)
- init.ts: set `teamRoot` in config.json to personal squad directory when one exists (#1010, #984)
