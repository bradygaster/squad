---
'@bradygaster/squad-sdk': minor
---

fix(sdk): wire `squad_route` tool handler to actually create target sessions

The `squad_route` tool is documented in `packages/squad-sdk/README.md`,
`docs/src/content/docs/reference/sdk.md`,
`docs/src/content/docs/reference/api-reference.md`, and the
`build-autonomous-agent` guide as routing tasks and creating new sessions
for the target agent. The previous implementation returned
`resultType: 'success'` with the hard-coded text "Session creation will be
implemented when session lifecycle is in place" without ever spawning a
session. SDK embedders following the documented usage
(`toolRegistry.getTool('squad_route').handler({ ... })`) received a
confident "Task routed to X" success payload while no agent ever started —
a silent no-op masquerading as success.

This change:

- Adds an optional 5th positional `fanOutDepsGetter` constructor parameter
  to `ToolRegistry`. Existing 4-arg constructions are unaffected.
- When `fanOutDepsGetter` returns dependencies, `squad_route` calls
  `spawnParallel` with a single config (charter compile → model resolve →
  `createSession` → initial message), matching the SDK `Coordinator`
  fan-out path.
- When `fanOutDepsGetter` is absent or returns `undefined`, the handler
  returns `resultType: 'failure'` with `error: 'fan-out-deps-unavailable'`
  and remediation guidance, replacing the previous false-success.
- Normalizes `targetAgent` to lowercase (matching charter-loading convention).
- Distinguishes roster "not found" errors from infrastructure I/O failures.
- Updates `docs/src/content/docs/guide/build-autonomous-agent.md` with a
  note about the `fanOutDepsGetter` requirement and `fan-out-deps-unavailable`
  failure mode.

Behavior change for embedders that relied on the stub's unconditional
success: those calls now return an honest failure. Remediation is to
either (a) construct `ToolRegistry` with a `fanOutDepsGetter`, or
(b) intercept `squad_route` via `SquadSessionHooks.onPreToolUse`.

Related: #1029 (named-agent delegation answering inline) — different code
path (Copilot CLI `task` tool / coordinator prompt), not closed by this PR,
but shares the same root-cause family of silent-no-op delegation primitives.
