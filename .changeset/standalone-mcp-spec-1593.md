---
"@bradygaster/squad-cli": patch
---

Write an npx-free `squad_state` MCP spec when Squad runs from a standalone bundle. Previously `squad init` and `squad upgrade` always emitted `npx -y @bradygaster/squad-cli@<version> state-mcp` into `.mcp.json`, and probed registry.npmjs.org to pick the version — so a machine installed without npm access still ended up with an MCP entry it could not launch. The resolver now detects a bundle via `SQUAD_STANDALONE_HOME` and points at that bundle's launcher by absolute path, short-circuiting before the registry probe.
