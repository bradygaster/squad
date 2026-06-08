# Demo Prompt: State Backends and Memory

## Prompt

```text
Explain how Squad memory placement changes across local, orphan, two-layer, and external state. Include what a presenter should show as proof for each backend.
```

## Expected tool calls

- Read `docs/src/content/docs/features/state-backends.md`.
- Inspect `packages/squad-sdk/src/state-backend.ts` for supported backend names.
- Inspect `packages/squad-cli/src/cli/commands/externalize.ts` for external state behavior.
- Inspect `packages/squad-cli/src/cli/commands/notes.ts` for two-layer note promotion.

## Expected output

- `local`: regular `.squad/` files in the working tree.
- `orphan`: mutable state on the `squad-state` orphan branch.
- `two-layer`: git notes for commit-scoped why plus orphan branch for durable state.
- `external`: state moved to a global project directory with a thin `.squad/config.json` marker.
- Include the inspection command or file path for each backend.

## Fallback

Show `../outputs/08-state-backends-evidence.txt` and `memory-tools-guide.md`.
