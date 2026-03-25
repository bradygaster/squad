# Runtime Providers

Squad supports two first-class runtime providers:

- **GitHub Copilot** (`copilot --agent squad`)
- **Claude Code** (`claude --agent squad`)

Both providers are supported for day-to-day conversational Squad sessions.

## Quick start

```bash
# Copilot
copilot --agent squad

# Claude Code
claude --agent squad
```

## Operational notes

- Use provider-specific permission flags for your environment and trust model.
- `squad` CLI commands (`init`, `doctor`, `watch`, `aspire`, etc.) are provider-agnostic.
- For full compatibility details, retry semantics, template tokens, and troubleshooting, see:
  - [`docs/runtime-providers.md`](../../../../runtime-providers.md)

## Related docs

- [Choose your interface](../get-started/choose-your-interface.md)
- [CLI reference](./cli.md)
- [SDK reference](./sdk.md)
