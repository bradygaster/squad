# Canary identity matrix

This note is evidence for the coordinator canary discriminator only. It does not assert template-sync, build, packaging, or size-budget status.

## Problem statement

The dual canary proves only whether the coordinator instruction payload that contains the markers is visible to the model. Marker presence is not an independent identity signal.

Therefore marker-only logic cannot discriminate these two cases:

- **Case 3:** a genuine Squad coordinator session whose `squad.agent.md` / `agent_instructions` payload failed to inject entirely.
- **Case 4:** a proven non-Squad agent that was never supposed to receive the Squad coordinator payload.

Both present the same in-prompt observation: HEAD canary absent and EOF canary absent. Treating `head absent` as `not coordinator; safe skip` converts Case 3 from a loud governance failure into a silent bypass.

## Candidate independent identity signals

| Signal | Observable from inside the agent? | Orthogonal to truncatable coordinator payload? | Reliability / risks | Resolves wholly-absent payload ambiguity? |
|---|---:|---:|---|---:|
| `squad_state` MCP reachability (`squad_state_*` / `memory.*`) | Sometimes. Copilot CLI exposes MCP tools through the session tool list/search when `.mcp.json` is loaded, but tool advertisement may be lazy. | Mostly for “Squad runtime is wired”, because `.mcp.json` and MCP tool schemas are outside `squad.agent.md`. | Not coordinator-specific. The codebase intentionally injects `--additional-mcp-config @.mcp.json` for non-interactive spawned sessions so spawned agents can also receive `squad_state_*` tools. Third-party agents may lack it, but presence alone is a false positive for “root coordinator”. Absence can be a false negative because MCP may be lazily loaded or misconfigured. | **No.** It can support “Squad project/runtime context”, but it does not prove root coordinator identity. |
| Runtime root-session vs spawned-sub-agent flag | Only if the client/runtime exposes a non-prompt value such as `session_role=root_coordinator`, `agent_id=squad`, or an untruncatable environment/tool property. No such stable in-agent predicate is documented in the current prompt contract. | Yes, if supplied outside `agent_instructions` and not derived from the canary-bearing payload. | Best candidate. Low false positives/negatives if emitted by the runtime that selected the agent. Needs explicit support and test hooks for root coordinator, spawned Squad sub-agent, coding agent, and third-party agent sessions. | **Yes, with runtime support.** This is the correct beacon. |
| Coordinator instruction file on disk (`.github/agents/squad.agent.md`) | Yes, when filesystem tools are available. | Yes for file existence/content; the file can exist even when prompt injection fails. | Proves the repository is squadified, not that the current session is the coordinator. A coding agent, spawned sub-agent, or third-party agent in the repo can observe the same file. Missing file can be a false negative in remote/satellite or generated-agent scenarios. | **No.** It distinguishes “repo has a coordinator file” from “repo lacks one”, not “this session is the coordinator”. |
| `.github/copilot-instructions.md` presence | Yes, when filesystem tools are available. | Yes for file existence/content. | Even weaker than the coordinator file: it identifies repo-level coding-agent guidance, not coordinator identity. Non-Squad agents in the repo can observe it. | **No.** |
| Prompt self-description (“You are Squad coordinator”) | Yes when injected. | No. It is part of the same truncatable/injectable prompt surface as the canary. | Circular. If the payload is wholly absent, the identity text is absent too. | **No.** |

## Recommendation

No currently documented in-agent signal fully resolves the ambiguity. The safe predicate is: **only classify `head absent` as safe-skip when an independent runtime-provided coordinator-identity signal proves this session is not the Squad coordinator; otherwise `head absent` is UNKNOWN, and closing the gate requires runtime support for an untruncatable root-coordinator identity flag.**

The most credible future predicate is a runtime-supplied session identity tuple, for example:

```text
squad_session_identity = {
  is_squad_session: true,
  role: "root-coordinator" | "spawned-sub-agent" | "coding-agent" | "third-party",
  coordinator_agent_file: ".github/agents/squad.agent.md"
}
```

That value must be observable to the model outside the canary-bearing coordinator payload and must be covered by client/model behavioral tests.

## Four-case behavioral matrix

| Case | Observation | Current shipped three-state logic | Recommended predicate-scoped logic | Testability now |
|---|---|---|---|---|
| 1. Squad coordinator, both markers present | HEAD present; EOF present | `full-load`; proceed | `full-load`; proceed | Empirically testable now with the current coordinator artifact. |
| 2. Squad coordinator, head-only / EOF truncated | HEAD present; EOF absent | `HALT-truncation` | `HALT-truncation` | Empirically testable now by truncating after the HEAD canary under the pinned client/model. |
| 3. Squad coordinator, agent-instructions payload wholly absent | HEAD absent; EOF absent | `safe-skip` / no halt, which is the silent governance bypass | `UNKNOWN` unless an independent runtime signal still proves this is not a coordinator; for a proven coordinator injection failure this must halt/escalate | Crux case. Needs runtime/client support to force or simulate coordinator-agent selection while suppressing the payload and to expose identity evidence separately from template/build results. |
| 4. Proven non-Squad agent, no markers | HEAD absent; EOF absent | `safe-skip` / no halt | `safe-skip` only when independent identity proves non-Squad; otherwise `UNKNOWN` | Crux case. A true non-Squad control is empirically testable only if the runtime exposes enough identity evidence to prove it is non-Squad rather than a missing-payload coordinator. |

Cases 3 and 4 are the crux because the marker observations are identical. Static goldens can prove that files contain canaries; they cannot prove how the client classified a zero-marker session. The required behavioral evidence is a four-case run under the pinned client/model that records canary outcome (`full-load`, `HALT-truncation`, `UNKNOWN`, `safe-skip`) separately from template-sync/build status.
