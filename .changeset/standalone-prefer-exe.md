---
"@bradygaster/squad-cli": patch
---

Prefer `squad.exe` over `squad.cmd` when writing the `squad_state` MCP spec from a standalone bundle on Windows. Since the fix for CVE-2024-27980 Node refuses to spawn a `.cmd` without `shell: true`, so an MCP client that spawns the command directly would fail to start the server. Windows bundles now ship a real `squad.exe`, and the resolver picks it first.
