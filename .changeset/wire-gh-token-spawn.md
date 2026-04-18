---
'@bradygaster/squad-cli': minor
---

Wire GH_TOKEN injection into agent spawn logic. When an agent is spawned, its role is mapped to a canonical identity slug via `resolveRoleSlug()`, and `resolveToken()` is called to obtain an installation token. If a token is found, `process.env.GH_TOKEN` is set before creating the session so that `gh` CLI calls automatically use the bot identity. The token is always restored/cleaned up in a `finally` block. Identity failures are gracefully ignored — spawn works exactly as before when no identity is configured.
