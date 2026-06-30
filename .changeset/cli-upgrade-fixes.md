---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix CLI and upgrade bugs:
- `squad externalize` and `squad internalize` now appear in `squad --help` output (#1050)
- `squad build` writes files to the externalized state directory when applicable (#1048)
- `squad new agent` correctly adds agent definitions to `squad.config.ts` (#1047)
- `squad upgrade` backs up customized `squad.agent.md` before overwriting; supports `--dry-run` (#1052)
- Explicit `@agent` mentions bypass direct-response handler and route to named agent (#1029)
- `state-mcp` server uses lazy initialization to avoid blocking multi-MCP startup (#1353)
