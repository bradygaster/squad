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

Repository inspection shows Squad installs `.github/agents/squad.agent.md`, and the GitHub Copilot CLI custom-agent runtime loads it when invoked with `--agent squad`. Therefore the owner of a reliable identity beacon is the host runtime that selects and injects the custom-agent file before parsing its contents.

Squad-provided MCP state tools cannot close this gap: if the coordinator payload is wholly absent, no instruction inside that absent payload can tell the model to call any `squad_state_*` identity tool.

## Required capability

Add a host-guaranteed, untruncatable, pre-ingestion identity beacon visible to the running agent and not overrideable by `.agent.md` content. Candidate metadata:

```text
custom_agent.name = "squad"
custom_agent.file = ".github/agents/squad.agent.md"
custom_agent.role = "root-coordinator"
custom_agent.payload_status = "loaded" | "missing" | "truncated"
```

The exact schema can differ, but it must distinguish selected-custom-agent identity from prompt content visibility.

## Acceptance criteria

- A runtime test can select `--agent squad`, suppress the coordinator payload entirely, and assert a visible `UNKNOWN`/halt rather than silent continuation.
- A non-Squad control can be proven non-Squad by the same host-level beacon, not by absence of canary text.
- The beacon is emitted before custom-agent instruction ingestion and cannot be modified or suppressed by `.github/agents/*.agent.md` content.
- Squad documentation references the beacon as the owner for Cases 3 and 4 in `docs/canary-identity-matrix.md`.
