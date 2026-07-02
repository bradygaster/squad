---
"@bradygaster/squad-cli": patch
---

Consolidate the duplicated `buildAgentCommand()`/spawn-with-timeout logic in the `execute` and `wave-dispatch` watch capabilities into the shared `agent-spawn.ts` module (#994). As a side effect, `execute`'s Copilot session spawn now goes through the same Windows `cmd.exe` argument-escaping path (DEP0190) as the rest of the watch capabilities.
