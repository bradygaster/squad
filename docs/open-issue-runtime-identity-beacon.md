# Runtime identity beacon for coordinator canary cases 3 & 4

Date: 2026-07-21
Related: PR #1517, `docs/canary-identity-matrix.md`, issue #1461

## Problem

The current dual canary can only report on the coordinator prompt when that prompt is visible to the model. If both canaries are absent, the in-prompt observation is identical for two different situations:

1. the Squad coordinator custom agent was selected, but its `squad.agent.md` payload failed to inject entirely; and
2. the running agent is a proven non-Squad agent that should not receive the Squad coordinator payload.

A prompt-contained check cannot classify the first situation because the instructions that would perform the check are absent too.

## Two-state reclassification recap

The dual canary should be treated as a two-state payload-integrity detector within an independently-known Squad coordinator session:

- HEAD present + EOF present: coordinator payload loaded fully.
- HEAD present + EOF absent: coordinator payload loaded but was truncated; halt.

`HEAD absent + EOF absent` is externally unobservable from inside the missing payload. It is not a success state and cannot prove safe non-Squad discrimination.

## Owning runtime surface

Repository inspection shows Squad installs `.github/agents/squad.agent.md` and points users or wrapper processes at `copilot --agent squad`, but this repo does not own the custom-agent resolver or the file-read / prompt-assembly path.

Observed boundary:

- `squad init` installs/advises the custom-agent path and invocation (`packages/squad-cli/src/cli/core/templates.ts:31-36`, `packages/squad-cli/src/cli/core/init.ts:142-155`, `packages/squad-cli/src/cli/core/init.ts:515-518`).
- `squad upgrade` refreshes `.github/agents/squad.agent.md` from the template (`packages/squad-cli/src/cli/core/upgrade.ts:1048`, `packages/squad-cli/src/cli/core/upgrade.ts:1102-1108`, `packages/squad-cli/src/cli/core/upgrade.ts:1124-1137`).
- `packages/squad-cli` passes through `copilotFlags`, `agentCmd`, or `--agent <config.agent>` to the `copilot` process, but does not read/assemble `.github/agents/*.agent.md` into model messages (`packages/squad-cli/src/cli/commands/watch/agent-spawn.ts:95-140`, `packages/squad-cli/src/cli/commands/loop.ts:136-148`, `packages/squad-cli/src/cli/commands/watch/index.ts:608-615`, `packages/squad-cli/src/cli/commands/copilot-bridge.ts:72-84`).
- The SDK wrapper also confirms that the Copilot CLI `--agent` flag is the path that reads on-disk agent definitions (`src/Squad.Agents.AI/SquadAgent.cs:249-282`, `src/Squad.Agents.AI/SquadAgentOptions.cs:87-112`, `src/Squad.Agents.AI/README.md:155-165`).

Therefore the reliable identity beacon must be a GitHub Copilot CLI host capability captured at the **agent-selection step** and persisted in host/session metadata before any `.agent.md` file access. An identity value derived only after successfully reading `.github/agents/squad.agent.md` is not sufficient: it disappears in exactly the empty/missing-payload case that must become `UNKNOWN`/halt.

Squad-provided MCP state tools cannot close this gap either; if the coordinator payload is wholly absent, no instruction inside that absent payload can tell the model to call any `squad_state_*` identity tool.

## Host-owned pre-ingestion state machine

The host must evaluate this state machine outside the prompt. A single pre-read field is insufficient; the state machine needs three distinct fields with ordering guarantees.

### Fields

1. `selected_agent_id`
   - Immutable selection record created at agent-selection time **before any file access**.
   - Carries raw host identity, for example:
     - `custom_agent.name = "squad"`
     - `custom_agent.file = ".github/agents/squad.agent.md"`
     - `custom_agent.role = "root-coordinator"`
   - Must include host timestamp or monotonic order (for example, `selected_at` / `selection_order`).

2. `payload_read_status`
   - Separate transition recorded by the host **after** the `.agent.md` read attempt.
   - Enum committed here: `LOADED`, `TRUNCATED`, `EMPTY`, `ABSENT`.
   - Must include host timestamp or monotonic order.

3. `prompt_attach_status`
   - Records what actually reached the assembled prompt.
   - Enum: `ATTACHED_FULL`, `ATTACHED_PARTIAL`, `NOT_ATTACHED`.
   - Must include host timestamp or monotonic order.

### Ordering guarantee

The `selected_agent_id` record must exist before the host attempts to read `.github/agents/{name}.agent.md` and before prompt/message assembly. This is the critical invariant: `selected + missing` must never collapse into `not selected`.

### Decision function

Evaluated outside the prompt:

| Host state | Outcome |
|---|---|
| `selected_agent_id` set + `payload_read_status=LOADED` + `prompt_attach_status=ATTACHED_FULL` | `LOADED`; normal Squad behavior may proceed |
| `selected_agent_id` set + `payload_read_status=TRUNCATED` or `prompt_attach_status=ATTACHED_PARTIAL` | `HALT`; visible truncation warning |
| `selected_agent_id` set + `payload_read_status=EMPTY` or `payload_read_status=ABSENT` or `prompt_attach_status=NOT_ATTACHED` | `UNKNOWN`/halt; no silent continuation |
| `selected_agent_id` absent because a Squad coordinator was not selected | `SKIP`; safe non-Squad classification is based on host selection state, not canary absence |

## Four-fixture acceptance test

Each fixture must emit the raw selection record and the status transitions (`selected_agent_id`, `payload_read_status`, `prompt_attach_status`) for assertion.

| Fixture | Setup | Required emitted state | Expected outcome |
|---|---|---|---|
| A. Full Squad payload | Select `--agent squad`; inject full `squad.agent.md` with HEAD and EOF canaries | `selected_agent_id` set; `payload_read_status=LOADED`; `prompt_attach_status=ATTACHED_FULL` | `LOADED`; normal Squad behavior may proceed |
| B. Head-only Squad payload | Select `--agent squad`; inject content containing HEAD canary but not EOF canary | `selected_agent_id` set; `payload_read_status=TRUNCATED`; `prompt_attach_status=ATTACHED_PARTIAL` | `HALT`; visible truncation warning |
| C. Missing/empty Squad payload | Select `--agent squad`; suppress, empty, or fail reading the coordinator payload entirely | `selected_agent_id` set; `payload_read_status=EMPTY` or `payload_read_status=ABSENT`; `prompt_attach_status=NOT_ATTACHED` | `UNKNOWN`/halt; no silent continuation |
| D. Proven non-Squad | Select a host-proven non-Squad/default agent with no Squad coordinator payload | `selected_agent_id` absent for Squad; non-Squad/default selection evidence emitted by host; no Squad coordinator payload attached | `SKIP`; safe non-Squad classification is based on host beacon, not canary absence |

## In-Squad vs upstream split

**In Squad's control:** install and upgrade the custom-agent file, pass/advise `--agent squad`, keep canary payload-integrity wording accurate, write/load `.mcp.json`, document Cases 1-4, and consume the future host state machine when exposed.

**Upstream Copilot CLI capability required:** the host-owned state machine above, evaluated before and outside prompt ingestion. The `.agent.md` file must not be able to overwrite, suppress, or fabricate `selected_agent_id`, `payload_read_status`, or `prompt_attach_status`.
