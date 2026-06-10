---
updated_at: 2026-06-10T13:50:00+03:00
focus_area: Framework R&D — empirical validation, governance integrity, MCP architecture
version: v0.10.0 (shipped); developing toward v0.10.1+
branch: main / squad/1244-memory-mcp-bridge
team_size: 19 active engineers + Fact Checker + Scribe + Ralph + @copilot
team_identity: Apollo 13 / NASA Mission Control
cto: Tamir Dresher (Microsoft EMU — tamirdresher_microsoft)
maintainer: Brady Gaster (bradygaster) — upstream owner
operating_mode: Tamir's principal engineers — investigative + framework R&D
---

# What We're Focused On

**Status:** v0.10.0 shipped (March 2026). Active work: framework R&D under Tamir Dresher (Squad CTO). Recent focus has been empirical validation of the governed memory subsystem — exposing real architectural drift and silent-failure modes that the docs and tests did not catch.

## Operating Context (June 2026)

The team is now operating in two parallel modes simultaneously:

1. **Brady's upstream maintenance** — releases, community PRs, customer-facing stability work. Driven by Surgeon 🚢 + Booster ⚙️ + PAO 📣.
2. **Tamir's framework R&D** — empirical hardening of the architecture: governance integrity, MCP correctness, memory governance, claim-verification discipline. Driven by Procedures 🧠 + EECOM 🔧 + Fact Checker 🔍 + Flight 🏗️.

Both modes share the same roster and the same `.squad/decisions.md`. Coordination happens through this team's standard drop-box pattern — no parallel state.

## Recent Sessions — Memory MCP Gap Investigation (2026-06-09 → 2026-06-10)

**Coordinator + manual A/B testing.** Discovered architectural defects in the governed memory pipeline that, in combination, allow agents to silently fabricate audit-log entries:

| # | Finding | Issue/PR |
|---|---------|----------|
| 1 | `.copilot/skills/` vs `.squad/skills/` docs drift | [#1241](https://github.com/bradygaster/squad/issues/1241) / [PR #1242 ✅](https://github.com/bradygaster/squad/pull/1242) |
| 2 | `history.md` vs governed-memory direction unclear | [#1243](https://github.com/bradygaster/squad/issues/1243) |
| 3 | `memory_*` tools not exposed via squad_state MCP | [#1244](https://github.com/bradygaster/squad/issues/1244) / [PR #1245](https://github.com/bradygaster/squad/pull/1245) |
| 4 | `squad.agent.md` spawn template bypasses classifier | [#1246](https://github.com/bradygaster/squad/issues/1246) |
| 5 | Workspace-only `.mcp.json` doesn't load in `copilot -p` → agents forge audit entries | [#1247](https://github.com/bradygaster/squad/issues/1247) |
| 6 | Two-layer upgrade docs miss pre-commit hook | [#1226](https://github.com/bradygaster/squad/issues/1226) / [PR #1227](https://github.com/bradygaster/squad/pull/1227) |
| 7 | Conditional `.gitignore` for two-layer/orphan | [#1228](https://github.com/bradygaster/squad/issues/1228) / [PR #1229](https://github.com/bradygaster/squad/pull/1229) |

**Pending — to be filed 2026-06-10:**
- `.squad/identity/*` not in mutable-state allowlist of `squad_state_write` (this very session hit it)
- `squad_decide` author-name regex (`[A-Za-z0-9_-]+` only) prevents naming actors with role context

**Empirical methodology established:** every architectural claim is now verified via reproducible A/B test before being filed. Pattern is captured in the new Fact Checker charter (`.squad/agents/fact-checker/charter.md`).

## Team Structure Update (2026-06-10)

**Fact Checker promoted to roster.** Previously existed as a stub charter (256 bytes), never on team.md. Now:

- Full charter with FAO-inspired role definition, verification methodology, hard rules
- On routing.md as the verification specialist
- Owns the new **Pre-Ship Fact Check** ceremony in `ceremonies.md`
- Tier policy: Lightweight (manual) / Standard (Pre-Ship) / Full (multi-claim batch)

**Known gap (not fixed here):** Rai 🛡️ (RAI Reviewer) is required by `squad.agent.md` governance but missing from this team's roster. The `.squad/agents/Rai/` directory exists. This is migration drift from the team predating Rai's introduction. Should be addressed in a separate PR with Brady's review.

## Current State

- **Version:** v0.10.0 shipped (npm). Local working branch: `squad/1244-memory-mcp-bridge` with PR #1245's `memory_*` MCP bridge.
- **Tests:** 4,655+ passing (last verified March 2026 release).
- **Open upstream work:** 7 issues filed, 3 merged or in flight as PRs.
- **Workaround skill published:** [`tamirdresher/squad-skills`](https://github.com/tamirdresher/squad-skills) → `plugins/governed-memory-cli-bridge/SKILL.md` (commit `a9a13c9`) — now carries an honest-limitations section explaining when the skill alone won't help.

## Next Steps

### Immediate
- Drive PR #1245 to merge (memory_* MCP bridge)
- Push #1247 with empirical evidence; coordinate the bootstrap fix with Brady
- File the two new state-tool gaps discovered today
- Expand Fact Checker's history with the verification patterns we used in the 2026-06-09 session
- Build subsystem-expertise documents (per engineer) covering: state-mcp wiring, classifier internals, spawn-template invariants, casting algorithm, Ralph dynamics

### Short-term
- Audit `.squad/` mutable-state writes across coordinator + sub-agent paths to find more silent-fallback modes
- Verify orphan and two-layer state backends behave correctly under the new memory pipeline
- Help Brady's release work where requested

## Operating Principles

- Every factual claim → cite a source or mark unverifiable
- Every architectural assertion → reproducible empirical test before filing
- Never forge audit entries. Never paper over missing evidence with confident prose.
- Coordinator never writes domain artifacts; specialists own their code; Fact Checker owns claim validation.
