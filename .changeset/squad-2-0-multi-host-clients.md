---
"@bradygaster/squad-sdk": major
"@bradygaster/squad-cli": major
---

Squad 2.0: decoupled backend and multi-host client adapters. Add `squad init --client` and `squad upgrade --client` (copilot, claude, kiro, opencode, cursor, codex, antigravity) with additive, non-clobbering config merges, persisted in `.squad/config.json` `clients[]`; add the `HostProjection` / spec `ClientAdapter` SDK surface with canonical capability tokens under `@bradygaster/squad-sdk/client` (and the deprecated `/clients` alias), and a host-agnostic coordinator prompt with per-host dispatch.
