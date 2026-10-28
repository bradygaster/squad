# MemPalace Memory Plugin Example

This is a local Squad plugin example for a memory-palace-style provider.

It demonstrates:

- declaring the Squad `memory` component
- installing memory provider guidance under `.squad/memory/`
- recording upstream package metadata for PyPI package `mempalace`
- documenting the optional `mempalace-mcp` server without starting it
- keeping the Squad/Copilot boundary intact

## Try it

```bash
squad plugin validate .
squad plugin dry-run .
squad plugin install .
squad plugin enable mempalace-memory
squad plugin switch memory mempalace-memory
squad plugin list --json
```

## Important

This example is declarative only. Squad does not install `mempalace`, run `mempalace`, start `mempalace-mcp`, install assistant hooks, or execute memory provider code during plugin install.

Installing this sample does not give agents a memory. It copies one guidance file to `.squad/memory/providers/mempalace-provider.md` and records metadata under `.squad/plugins/`. Agents spawned by the Squad coordinator in GitHub Copilot, or by the Squad interactive shell (`squad` with no arguments), do not see that file unless you point them at it. Only SDK code that spawns agents through `AgentLifecycleManager` adds it to the agent prompt automatically.

Install and configure MemPalace separately:

```bash
pip install mempalace
mempalace init ~/projects/myapp
mempalace mine ~/projects/myapp
mempalace search "important design decision"
mempalace wake-up
```
