---
---

test: add Copilot CLI subprocess integration tests for SQUAD_TEAM_ROOT

8 tests covering SQUAD_TEAM_ROOT env-var resolution, fallback to cwd,
and resolveSquad() integration. Guards against subprocess working directory
bugs in Copilot CLI bang commands.
