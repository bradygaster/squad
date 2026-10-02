---
'@bradygaster/squad-cli': patch
---

Preserve user-supplied `env` on the `squad_state` entry in `.mcp.json`

`squad init` and `squad upgrade` rebuilt the `squad_state` entry from scratch on every run, hardcoding `env: {}`. Users behind a corporate npm proxy — who must set `npm_config_registry` there for the MCP server to launch at all — lost that setting every time they ran either command, and the idempotency check could never short-circuit for them, so the file was rewritten on every invocation.

`env` is now carried forward verbatim. `command` and `args` remain Squad-managed so the version pin still refreshes.
