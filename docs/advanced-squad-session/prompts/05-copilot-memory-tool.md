# Demo Prompt: Copilot Memory Tool

## Prompt

```text
Going forward, remember that in this repository, every advanced demo snippet should include:
1. the exact prompt,
2. expected tool calls,
3. expected output,
4. a fallback if the live demo fails.
```

## Expected tool calls

- `store_memory` with `scope: "repository"` if this durable fact is not already present.
- `vote_memory` if an equivalent memory is already present and surfaced in context.

## Expected output

The tool payload should include:

- concise fact
- citations using the exact user input
- a reason explaining future usefulness
- repository scope

## Fallback

Use the deterministic local CLI demo in `04-memory-cli-proof.md`, and label the Copilot tool payload as the live-chat path rather than the deterministic path.

