# MemPalace Memory Provider

MemPalace is an example memory provider profile for teams that want to arrange Squad memory as rooms, shelves, trails, and landmarks.

## What this plugin contributes

- A `memory` role declaration for a spatial memory provider.
- Static guidance describing how MemPalace-style memory can be organized.
- Upstream metadata for the real `MemPalace/mempalace` project and PyPI package.
- Optional MCP metadata for the `mempalace-mcp` server.

## Intended memory shape

| Memory item | Palace representation |
| --- | --- |
| Project context | Room |
| Agent learnings | Shelf |
| Decisions | Landmark |
| Open work | Trail |
| Repeated patterns | Anchor |

## Boundary

This sample does not execute MemPalace code. It is a declarative Squad plugin that installs static memory guidance under `.squad/memory/` and records external metadata only.

Install and run MemPalace separately:

```bash
pip install mempalace
mempalace init ~/projects/myapp
mempalace mine ~/projects/myapp
mempalace mine ~/.claude/projects/ --mode convos
mempalace search "query"
mempalace wake-up
```

MemPalace also exposes `mempalace-mcp` for assistant environments that support MCP. Squad records that metadata but does not start the server, configure MCP clients, or install assistant hooks.
