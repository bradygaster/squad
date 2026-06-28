---
"@bradygaster/squad-sdk": patch
---

fix: update adapter/client.ts for @github/copilot-sdk 1.0.4 API changes

Fixes 5 TypeScript errors caused by breaking changes in `@github/copilot-sdk@1.0.4`:

- Replace removed `cliPath`/`cliArgs`/`useStdio`/`port`/`cliUrl` options with the new `RuntimeConnection` pattern
- Update `ping()` return type from `timestamp: number` to `timestamp: string`
- Make `SquadModelBilling.multiplier` optional to match upstream `ModelBilling`
- Replace `client.on()` with `client.onLifecycle()` for session lifecycle events
