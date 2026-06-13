---
"@bradygaster/squad-cli": minor
"@bradygaster/squad-sdk": minor
---

Fix #1299 (deep): Fact Checker gets the same plumbing as Rai — rich charter at init + state directory + policy template

PR #1300 (also #1299) fixed the documentation gap so the coordinator knows to roster Fact Checker. This PR fixes the **structural** gap behind it. Per user testing on 2026-06-13, even after #1300 the actual agent on disk is still a "name on disk with a 21-line placeholder" — three concrete problems:

| Piece | Rai before this PR | Fact Checker before this PR |
|-------|--------------------|------------------------------|
| `charter.md` at init | Generic 478-byte stub from `generateCharter()` | Generic 523-byte stub from `generateCharter()` |
| Rich charter template usage | Only used by `squad upgrade` (never by `squad init`) | Same — never used by `squad init` |
| `.squad/{name}/policy.md` | ✅ Seeded from `rai-policy.md` (4160 bytes) | ❌ Directory does not exist |
| `.squad/{name}/audit-trail.md` | ✅ Seeded with append-only header | ❌ Directory does not exist |
| `merge=union` in `.gitattributes` | ✅ `.squad/rai/audit-trail.md` | ❌ No entry for fact-checker |
| `fact-checker-charter.md` distribution | n/a | Only in `packages/squad-cli/templates/` — missing from `.squad-templates/` (canonical source) AND `packages/squad-sdk/templates/`, so the SDK init path could never find it |

## Fix (4 parts)

### Part 1 — Rich charter at init (benefits BOTH Rai and Fact Checker)

`packages/squad-sdk/src/config/init.ts` agent loop now looks up `{templatesDir}/{role}-charter.md` for each agent and uses that as `charter.md` content if it exists. Falls back to `generateCharter()` for user-defined agents that have no rich template (everyone except the built-ins).

Result: a fresh `squad init` produces `.squad/agents/Rai/charter.md` with the full Rai charter (4525 bytes) and `.squad/agents/fact-checker/charter.md` with the full Fact Checker charter (3024 bytes). Previously both were 478-byte stubs.

### Part 2 — `.squad/fact-checker/` state dir, mirroring `.squad/rai/`

Added a new block in `init.ts` (right after the Rai seeding at lines 879–941) that creates:

- `.squad/fact-checker/policy.md` — seeded from `templates/fact-checker-policy.md` (or a minimal inline fallback if the template is stripped)
- `.squad/fact-checker/audit-trail.md` — seeded with an append-only header

The policy template (`.squad-templates/fact-checker-policy.md`, ~6 KB) is the canonical authority for the dual-mode operating rules per #789 + #1254:

- **Mode 1 Verification:** confidence rating taxonomy (✅/⚠️/❌/🔍), what gets checked (URLs, packages, APIs, file paths, signatures, quotes, statistics, cross-references)
- **Mode 2 Devil's Advocate:** required brief structure (steelman → assumptions → pre-mortem → alternatives → risk acceptance)
- **Hard rules:** anti-fabrication guarantees — never cite unverified URL/package/API, never invent measurement data, never fabricate counter-hypotheses, never block on opinion
- **Advisory by default** with two narrow blocking exceptions (❌ at Pre-Ship; coordinator-escalated DA risk)
- **Opt-out model** mirroring Rai's
- **Audit trail rules** — succinct (verdict + citation, never raw source material)
- **Reviewer Rejection Protocol integration** for ❌ Contradicted verdicts

### Part 3 — Fix the `.squad-templates/` distribution gap

The existing `fact-checker-charter.md` had been added directly to `packages/squad-cli/templates/` only, bypassing the canonical `.squad-templates/` source. That meant `sync-templates.mjs` couldn't propagate it to `packages/squad-sdk/templates/` (which `getSDKTemplatesDir()` resolves at runtime), so the SDK init code path could never find the rich charter even if it tried.

Fix: copied `fact-checker-charter.md` to `.squad-templates/` and re-synced. Now all 4 mirror targets have it. This unblocks Part 1.

### Part 4 — Plumbing updates

- `.gitattributes` block: added `.squad/fact-checker/audit-trail.md merge=union` alongside Rai's existing entry
- `packages/squad-cli/src/cli/core/templates.ts`: new `TEMPLATE_MANIFEST` entry for `fact-checker-policy.md → templates/fact-checker-policy.md` so `squad upgrade` propagates it
- `.squad-templates/squad.agent.md` Files Catalog table: 2 new rows for `.squad/fact-checker/policy.md` (authoritative) and `.squad/fact-checker/audit-trail.md` (derived/append-only)

## Tests

`test/init.test.ts` gains 3 regression tests (28/28 pass total):

1. `should seed .squad/fact-checker/{policy,audit-trail}.md (regression: bradygaster/squad#1299)` — asserts policy declares both modes + anti-fabrication rules + confidence ratings; audit trail is append-only.
2. `should use the rich fact-checker-charter.md template for built-in agents at init (#1299)` — asserts the rendered charter is > 1 KB (not the 478-byte stub) and contains Verification Methodology + Confidence Ratings.
3. `should use the rich Rai-charter.md template at init (companion to fact-checker fix, #1299)` — asserts Rai gets the same treatment; charter references `.squad/rai/policy.md` and `.squad/rai/audit-trail.md`.

`npm run lint` clean.

## Composability

This PR builds on #1300 (which adds the `## Fact Checker` section to `squad.agent.md` and the "team size" line fix). Both modify `.squad-templates/squad.agent.md` but in **disjoint regions**:

- #1300 touches the team-size line at L56 and inserts a new `## Fact Checker` section before `## PRD Mode`
- #1301 touches the Files Catalog table at L710-711

They will merge cleanly in either order. The user-facing experience requires BOTH to land for full plumbing.

## Closes / refs

Closes #1299 (deep fix; #1300 was the surface fix).
