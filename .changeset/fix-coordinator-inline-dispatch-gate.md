---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Fix coordinator inline-dispatch regression: restore always-on dispatch gate in the Squad coordinator template

**Problem**

In v0.10.0 the Squad coordinator started doing domain work itself instead of dispatching to roster agents (it worked in v0.9.4). Root cause: commit `afe78188` (#1035, "context overflow sentinel + coordinator size reduction") relocated the concrete inline-dispatch gate and the dispatch mechanics out of the always-on coordinator prompt (`.squad-templates/squad.agent.md`) into lazy-loaded reference files (`client-compatibility-reference.md`, `spawn-reference.md`). The remaining inline one-liner ("inline work is last-resort fallback only") was too soft, and the concrete "when may I work inline?" rule + the VS Code `runSubagent` how-to were no longer in-context, so the coordinator defaulted to executing work itself.

**Fix**

Three minimal edits to the canonical coordinator template (`.squad-templates/squad.agent.md`), synced to all mirrors via `npm run sync-templates`:

1. **Client Compatibility** — replaced the soft one-liner with an explicit **Inline-dispatch gate**: doing domain work inline is permitted ONLY in Direct Mode, or when NEITHER `task` NOR `runSubagent` is available; otherwise the coordinator MUST dispatch.
2. **How to Spawn an Agent** — added a one-line **STOP gate**: about to produce a domain artifact with no `task` / `runSubagent` call this turn → STOP and dispatch (exceptions: Direct Mode, or no spawn tool exists).
3. Re-inlined a ~5-line **VS Code `runSubagent` micro-playbook** so the how-to-dispatch mechanics are always-on instead of lazy-loaded.

The legitimate Direct/Lightweight response modes are preserved (Lightweight still spawns one agent; Direct still answers from context without spawning).

**Validation**

New deterministic, subprocess-free regression test `test/coordinator-inline-dispatch-gate.test.ts` asserts the gate/STOP-gate/micro-playbook exist in canonical and that the gate is present in all 5 synced copies (parity). Red before the fix (8/8 failing), green after. Existing requires a `squad upgrade` for existing installs to pick up the new template.
