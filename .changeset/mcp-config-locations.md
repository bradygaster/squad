---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Point users at MCP config files their host actually reads. The coordinator's MCP guide (`.squad/templates/mcp-config.md`) listed a project-level `.copilot/mcp-config.json` as the team-shared location and the coordinator told users to "Add it to `.copilot/mcp-config.json`", but Copilot CLI doesn't read that file. The guide now names the repo-root `.mcp.json` (next to `squad_state`), `.github/mcp.json`, `.vscode/mcp.json` (with its `servers` key), `~/.copilot/mcp-config.json`, and the files used by `--client` hosts. The `squad state-mcp --help` text and the MCP docs pages are corrected the same way.
