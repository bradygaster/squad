---
"@bradygaster/squad-sdk": major
"@bradygaster/squad-cli": major
---

Squad 2.0: decoupled backend and multi-host client adapters. Add `squad init --client` and `squad upgrade --client` (copilot, claude, kiro, opencode, cursor, codex, antigravity) with additive, non-clobbering config merges, persisted in `.squad/config.json` `clients[]`; add the `HostProjection` / spec `ClientAdapter` SDK surface with canonical capability tokens under `@bradygaster/squad-sdk/client` (and the deprecated `/clients` alias), and a host-agnostic coordinator prompt with per-host dispatch.

Projection details: the Codex coordinator is emitted as a TOML custom agent (`.codex/agents/squad.toml` with `name`, `description`, `developer_instructions`); `.gitignore` entries are plain lines under a `# squad:<id>` comment (uninstall removes only those); merged files keep their existing line endings, JSON indentation and trailing-newline convention and are written atomically; OpenCode targets `opencode.jsonc` when it is the only config and refuses to clobber a JSONC file that contains comments; symlinked/junctioned ancestors of the repo root are accepted while symlinks escaping the root are still refused; a newly requested client whose host config could not be merged is reported but not persisted; `squad upgrade --dry-run --client <list>` previews the clients it would project.
