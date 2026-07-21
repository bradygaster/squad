# Canary identity matrix

This note is evidence for the coordinator canary discriminator only. It does not assert template-sync, build, packaging, or size-budget status.

## Problem statement

The dual canary proves only whether the coordinator instruction payload that contains the markers is visible to the model. Marker presence is not an independent identity signal.

Therefore marker-only logic cannot discriminate these two cases:

- **Case 3:** a genuine Squad coordinator session whose `squad.agent.md` / `agent_instructions` payload failed to inject entirely.
- **Case 4:** a proven non-Squad agent that was never supposed to receive the Squad coordinator payload.

Both present the same in-prompt observation: HEAD canary absent and EOF canary absent. Treating `head absent` as `not coordinator; safe skip` converts Case 3 from a loud governance failure into a silent bypass.

## Reclassification

The dual canary is a **two-state payload-integrity detector** that only operates inside an independently-known Squad coordinator session:

- HEAD present + EOF present = the coordinator payload is visible and loaded fully.
- HEAD present + EOF absent = the coordinator payload is visible but truncated; halt.

`HEAD absent + EOF absent` is externally unobservable from inside the missing payload. It is **not** a third success state and does not prove a safe non-Squad skip. Cases 3 and 4 remain open until an instruction-independent runtime identity signal can distinguish “the selected Squad coordinator payload failed to inject” from “this is not a Squad coordinator session.”

## Owning runtime surface (cases 3 & 4 — OPEN)

Repository inspection points to the custom-agent host runtime as the only layer that can close the zero-marker ambiguity:

- `squad init` installs the coordinator prompt at the git-root custom-agent path. The manifest maps `squad.agent.md.template` to `../.github/agents/squad.agent.md`, and monorepo init explicitly places `squad.agent.md` under the git root because Copilot resolves `.github/agents/` there (`packages/squad-cli/src/cli/core/templates.ts:31-36`, `packages/squad-cli/src/cli/core/init.ts:142-155`). Init then stamps `.github/agents/squad.agent.md` after creation (`packages/squad-cli/src/cli/core/init.ts:308-313`).
- `squad upgrade` refreshes the same `.github/agents/squad.agent.md` target from `squad.agent.md.template` (`packages/squad-cli/src/cli/core/upgrade.ts:1048`, `packages/squad-cli/src/cli/core/upgrade.ts:1102-1108`, `packages/squad-cli/src/cli/core/upgrade.ts:1124-1137`).
- The repository identifies GitHub Copilot CLI's `--agent` custom-agent path as the host that loads `.github/agents/*.agent.md`: `SquadAgent` adds `--agent squad` when `.github/agents/squad.agent.md` exists, and comments state that this CLI flag is the path that reads on-disk agent definitions (`src/Squad.Agents.AI/SquadAgent.cs:249-282`, `src/Squad.Agents.AI/SquadAgentOptions.cs:87-112`, `src/Squad.Agents.AI/README.md:155-165`).
- Squad also writes a repo-root `.mcp.json` `squad_state` entry for Copilot CLI to load (`packages/squad-cli/src/cli/core/mcp-root.ts:9-14`, `packages/squad-cli/src/cli/core/mcp-root.ts:59-73`) and explicitly injects `--additional-mcp-config @<abs-path>` for non-interactive spawned sessions so `squad_state_*` tools register (`packages/squad-cli/src/cli/core/copilot-invocation.ts:1-16`, `packages/squad-cli/src/cli/core/copilot-invocation.ts:53-66`). The MCP server exposes `squad_state_*`, `squad_decide`, and `memory.*` tools (`packages/squad-cli/src/cli/commands/state-mcp.ts:24-35`). **Fatal flaw:** if the coordinator payload is wholly absent, no instruction inside that absent payload can tell the model to call an MCP identity tool, so a Squad-provided MCP beacon cannot close Case 3.
- The only Copilot-related environment signal found in the inspected CLI code is `COPILOT_CLI`, used as a coarse environment heuristic (`packages/squad-cli/src/cli/copilot-install.ts:69-85`). It is not a custom-agent identity, role, selected agent file, or payload-load attestation.

**IN Squad's control:** install and upgrade the custom-agent file, keep canary payload-integrity wording accurate, write/load `.mcp.json`, and document/test Cases 1 and 2. Squad can also request and consume a future host signal.

**UPSTREAM Copilot CLI capability required:** a host-guaranteed, untruncatable, pre-ingestion identity beacon emitted by the runtime that selected the custom agent file. Candidate fields include a system-level preamble or metadata/tool property such as `custom_agent.name=squad`, `custom_agent.file=.github/agents/squad.agent.md`, `custom_agent.role=root-coordinator`, and `custom_agent.payload_status=loaded|missing|truncated`. The agent file must not be able to overwrite or suppress this value.

## Required runtime test

Add a host-level behavioral test that selects the Squad coordinator custom agent, removes or suppresses the coordinator payload entirely, and asserts a visible `UNKNOWN`/halt instead of silent continuation. This test cannot pass today because the only instructions that could classify the failure live inside the payload being removed; that is the proof that Cases 3 and 4 remain open.

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
