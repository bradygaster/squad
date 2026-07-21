# Host-level pre-ingestion identity beacon for Squad coordinator sessions

Date: 2026-07-21
Related: PR #1517, `docs/canary-identity-matrix.md`, issue #1461

## Problem

The current dual canary can only report on the coordinator prompt when that prompt is visible to the model. If both canaries are absent, the in-prompt observation is identical for two different situations:

1. the Squad coordinator custom agent was selected, but its `squad.agent.md` payload failed to inject entirely; and
2. the running agent is a proven non-Squad agent that should not receive the Squad coordinator payload.

A prompt-contained check cannot classify the first situation because the instructions that would perform the check are absent too.

## Reclassification

The dual canary should be treated as a two-state payload-integrity detector within an independently-known Squad coordinator session:

- HEAD present + EOF present: coordinator payload loaded fully.
- HEAD present + EOF absent: coordinator payload loaded but was truncated; halt.

`HEAD absent + EOF absent` is externally unobservable from inside the missing payload. It is not a success state and cannot prove safe non-Squad discrimination.

## Owning runtime surface

Repository inspection shows Squad installs `.github/agents/squad.agent.md` and points users or wrapper processes at `copilot --agent squad`, but this repo does not own the custom-agent resolver or the file-read / prompt-assembly path. The reliable identity beacon must be captured by the GitHub Copilot CLI host at the **agent-selection step** (when `--agent squad` or an equivalent custom-agent selection is resolved), persisted in host/session metadata, and only then augmented by file-read / payload-assembly status.

An identity value derived only after successfully reading `.github/agents/squad.agent.md` is not sufficient: it disappears in exactly the empty/missing-payload case that must become `UNKNOWN`/halt. Squad-provided MCP state tools cannot close this gap either; if the coordinator payload is wholly absent, no instruction inside that absent payload can tell the model to call any `squad_state_*` identity tool.

## Required capability

Add a host-guaranteed, untruncatable, pre-ingestion identity beacon visible to the running agent and not overrideable by `.agent.md` content. Required fields must be captured with timestamp/order at selection time and payload-load time:

```text
custom_agent.selected_at = "<host timestamp or monotonic order>"
custom_agent.selection_order = <monotonic host event index>
custom_agent.selected_id = "squad"
custom_agent.selected_name = "squad"
custom_agent.selected_file = ".github/agents/squad.agent.md"
custom_agent.selected_role = "root-coordinator"
custom_agent.payload_status = "loaded" | "truncated" | "empty" | "absent"
custom_agent.payload_status_at = "<host timestamp or monotonic order>"
```

The exact schema can differ, but it must expose both raw host selection identity and payload-load status, and it must distinguish selected-custom-agent identity from prompt content visibility.

## Design constraint: selection before message assembly

The host must persist the selected custom-agent identity before reading `.github/agents/{name}.agent.md` and before assembling model messages. File-read success may update `payload_status`, but it must not be the source of selected-agent identity. This ordering is required because post-read identity disappears in the empty/missing-payload case.

## Acceptance criteria

### Four-fixture runtime matrix

| Fixture | Setup | Expected outcome |
|---|---|---|
| A. Full Squad payload | Select `--agent squad`; inject full `squad.agent.md` with HEAD and EOF canaries | `loaded`; normal Squad behavior may proceed |
| B. Head-only Squad payload | Select `--agent squad`; inject content containing HEAD canary but not EOF canary | `HALT`; visible truncation warning |
| C. Empty/missing Squad payload | Select `--agent squad`; suppress, empty, or fail reading the coordinator payload entirely | `UNKNOWN`/halt; no silent continuation |
| D. Proven non-Squad | Select a host-proven non-Squad/default agent with no Squad coordinator payload | `skip`; safe non-Squad classification is based on host beacon, not canary absence |

- The beacon is emitted at selection time before custom-agent instruction ingestion and cannot be modified or suppressed by `.github/agents/*.agent.md` content.
- The beacon includes raw host identity (`selected_id`, `selected_name`, `selected_file`, `selected_role`) and payload-load status (`loaded`, `truncated`, `empty`, `absent`) with timestamp/order fields.
- A runtime test can select `--agent squad`, suppress the coordinator payload entirely, and assert a visible `UNKNOWN`/halt rather than silent continuation.
- A non-Squad control can be proven non-Squad by the same host-level beacon, not by absence of canary text.
- Squad documentation references the beacon as the owner for Cases 3 and 4 in `docs/canary-identity-matrix.md`.
