---
"@bradygaster/squad-cli": patch
"@bradygaster/squad-sdk": patch
---

Standardize the Rai built-in agent on the canonical lowercase directory/template ID `rai` (matching `scribe`, `ralph`, and `fact-checker`) instead of the mixed-case `Rai`, which broke on case-sensitive filesystems (Linux CI) and silently duplicated the agent on case-insensitive ones (macOS/Windows).

`squad upgrade` now detects a legacy case-sensitive `.squad/agents/Rai/` directory and migrates it in place to `.squad/agents/rai/`, preserving the existing charter/history content. If both `Rai/` and `rai/` already exist (a partial upgrade on a case-sensitive filesystem), the canonical `rai/` is kept untouched and only the stale `Rai/` copy is removed — no user customization is ever clobbered, and repeat upgrade runs are idempotent.

The shipped Rai charter template's manifest source/destination were also renamed from `Rai-charter.md` to lowercase `rai-charter.md`, matching the file already shipped under `templates/`.

The `workflows/squad.md` gh-aw coordinator prompt and its paired `squad-cast-validator.mjs` validator now let the generated coordinator name the four permanent built-in support agents (Scribe, Ralph, Rai, Fact Checker) and state their fixed lifecycle duties in a dedicated `## Built-in Support Agents` section, while still forbidding any reference to unrelated standalone lifecycle/log/decision state or paths.
