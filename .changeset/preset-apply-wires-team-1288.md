---
"@bradygaster/squad-sdk": patch
"@bradygaster/squad-cli": patch
---

Fix #1288: `squad preset apply` now wires team.md, routing.md, and casting state

`squad preset apply <name>` used to copy only the preset's agent charters into `.squad/agents/`. It left:

- `.squad/team.md` `## Members` table empty
- `.squad/routing.md` with no Work Type rows for the preset agents
- `.squad/casting/registry.json`, `history.json`, and `policy.json` not created

Net result: the coordinator's mode-switch check saw an empty `## Members` table and treated every session as **Init Mode**, proposing to re-scaffold a team the user already applied — defeating the entire purpose of presets.

This change adds a new merge-friendly scaffold module (`packages/squad-sdk/src/presets/scaffold.ts`) that, after `applyPreset` copies the charters, wires the preset agents into:

- **team.md** `## Members` — creates the file from scratch if missing, or merges new rows into an existing `## Members` table while preserving the surrounding content (Coordinator section, Project Context, etc.). Idempotent: a second apply does not duplicate rows.
- **routing.md** `## Work Type → Agent` — creates from scratch or appends new rows after the existing routing table. Each preset agent becomes `| <role> | <name> | — |`.
- **casting/registry.json** — merges new agents into an existing registry without clobbering pre-existing entries. Universe = `preset:<name>` so future casts can distinguish preset-provided agents.
- **casting/history.json** — appends a preset-application snapshot and a universe_usage_history entry.
- **casting/policy.json** — created with sensible defaults only if missing; never overwrites an existing policy.

Failure modes:

- Agents with `status: 'error'` in the per-agent results (e.g., source dir missing) are excluded from the wiring step.
- Agents with `status: 'skipped'` (already exist in target) ARE wired into team.md/registry so the team reflects user intent.
- If the scaffolding itself throws (e.g., disk error), a synthetic error result is appended to the return value so the CLI can surface it; per-agent install results are preserved.

Out of scope (tracked separately): deduplicating these writers with the equivalent fresh-write versions in `packages/squad-cli/src/cli/core/cast.ts`. A future refactor can move both call sites to the shared SDK module.

Test coverage in `test/presets.test.ts`:
- `wires preset agents into team.md ## Members (#1288)`
- `merges preset agents into an existing team.md without duplicating rows (#1288)` — includes idempotency assertion
- `writes casting registry.json, history.json, and policy.json (#1288)`
- `appends routing rows for preset agents to routing.md (#1288)`

Closes #1288
