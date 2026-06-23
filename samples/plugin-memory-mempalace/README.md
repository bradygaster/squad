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

Install and configure MemPalace separately:

```bash
pip install mempalace
mempalace init ~/projects/myapp
mempalace mine ~/projects/myapp
mempalace search "important design decision"
mempalace wake-up
```
