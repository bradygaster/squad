# Demo Prompt: Team Orchestration

## Prompt

```text
Team, prepare a release-readiness pass for this PR.

PAO: identify doc impact.
FIDO: identify missing tests.
Booster: check CI risk.
Surgeon: check changelog and release notes.

Return one concise merge-readiness summary with owners.
```

## Expected tool calls

- `task` for PAO in background mode.
- `task` for FIDO in background mode.
- `task` for Booster in background mode.
- `task` for Surgeon in background mode.
- `read_agent` calls after completion to collect results.

## Expected output

A short merge-readiness summary with owner-specific findings, not a single blended answer that hides who did what.

## Fallback

If live fan-out is slow, show `../outputs/orchestration-transcript.txt` and explain that each agent ran in a separate context.

