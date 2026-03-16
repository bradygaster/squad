# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

## Core Context

Three-branch model (main/dev/insiders). Apollo 13 team, 3931 tests. Boundary review heuristic: "Squad Ships It" — if Squad doesn't ship the code, it's IRL content. Proposal-first: meaningful changes need docs/proposals/ before code. Two-error lockout policy: agent locked out after 2 errors in a session. Test name-agnosticism: framework tests must never depend on dev team's agent names.

## Learnings

### Adoption Tracking Architecture
Three-tier opt-in system: Tier 1 (aggregate-only, `.github/adoption/`) ships first; Tier 2 (opt-in registry) designed next; Tier 3 (public showcase) launches when ≥5 projects opt in. `.squad/` is for team state only, not adoption data. Never list individual repos without owner consent.

### Remote Squad Access
Three-phase rollout: Phase 1 — GitHub Discussions bot with `/squad` command (1 day, zero hosting). Phase 2 — GitHub Copilot Extension via Contents API (1 week). Phase 3 — Slack/Teams bot (2 weeks). Constraint: any remote solution must solve `.squad/` context access.

### Content Triage Skill
"Squad Ships It" litmus test codified into reusable workflow. Triggered by `content-triage` label. Output: boundary analysis, sub-issues for PAO (doc extraction), IRL reference for Scribe. Content labels: `content:blog`, `content:sample`, `content:video`, `content:talk`.

### Distributed Mesh Integration
Zero code changes. Skill files in templates/skills/, scripts in scripts/mesh/, docs in features/. mesh.json stays separate from squad.config.ts. Convention-first additive layer — invisible if unused. 125:1 ratio (30 lines of script vs 3,756 lines of deleted federation code).

### Sprint Prioritization Pattern
Rank by: (1) bugs with active user impact, (2) quality/test gaps blocking GA, (3) high-ROI features unblocking downstream work. Interleave stability (bugs/quality) with velocity (features) across sprint capacity.
**Adoption tracking architecture — three-tier opt-in system:** `.squad/` is for team state only, not adoption data (boundary pattern). Move tracking to `.github/adoption/`. Never list individual repos without owner consent — aggregate metrics only until opt-in exists. Tier 1 (ship now) = aggregate monitoring. Tier 2 (design next) = opt-in registry in `.github/adoption/registry.json`. Tier 3 (launch later) = public showcase once ≥5 projects opt in. Monitoring infra (GitHub Action + script) is solid — keep it. Privacy-first architecture: code search results are public data, but individual listings require consent.

**Remote Squad access — three-phase rollout:** Phase 1 (ship first): GitHub Discussions bot with `/squad` command. Workflow checks out repo → has full `.squad/` context → answers questions → posts reply. 1 day build, zero hosting, respects repo privacy automatically. Phase 2 (high value): GitHub Copilot Extension — fetches `.squad/` files via GitHub API, answers inline in any Copilot client (VS Code, CLI, mobile). Works truly remote, instant, no cold start. 1 week build. Phase 3 (enterprise): Slack/Teams bot for companies. Webhook + GitHub API fetch. 2 weeks build. Constraint: Squad needs `.squad/` state (team.md, decisions.md, histories, routing) to answer intelligently. Any remote solution must solve context access. GitHub Actions workflows solve this for free (checkout gives full state). Copilot Extension uses Contents API. Discussions wins for MVP because it's async (perfect for knowledge queries), persistent (answers are searchable), and zero infra. Proposal-first: write `docs/proposals/remote-squad-access.md` before building.

### Content Triage Skill Codified (2026-03-10)
Created `.squad/skills/content-triage/SKILL.md` to codify the boundary heuristic from PR #331. Defines repeatable workflow for triaging external content (blog posts, sample repos, videos, talks) to determine what belongs in Squad's public docs vs IRL tracking. Key components: (1) "Squad Ships It" litmus test — if Squad doesn't ship the code/config, it's IRL content; (2) triage workflow triggered by `content-triage` label or external content reference in issue body; (3) output format with boundary analysis, sub-issues for PAO (doc extraction), and IRL reference entry for Scribe; (4) label convention (`content:blog`, `content:sample`, `content:video`, `content:talk`); (5) Ralph integration for routing to Flight, creating sub-issues, and notifying Scribe. Examples include Tamir blog analysis (PR #331), sample repo with ops patterns, and conference talk. Pattern prevents infrastructure docs from polluting Squad's public docs while ensuring community content accelerates adoption through proper extraction and referencing.

📌 **Team update (2026-03-11T01:27:57Z):** Content triage skill finalized; "Squad Ships It" boundary heuristic codified into shared team decision (decisions.md). Remote Squad access phased rollout approved (Discussions bot → Copilot Extension → Chat bot). PR #331 boundary review pattern established as standard for all doc PRs. Triage workflow enables Flight to scale as community content accelerates.
**Distributed Mesh integration architecture guidance:** Analyzed Andi's distributed-mesh extension (git-as-transport, 3-zone model, sync scripts, SKILL.md). Mapped integration into Squad: skill files in templates/skills/, scripts in scripts/mesh/, docs in features/distributed-mesh.md. Clarified relationships — sharing/export-import is snapshot-based (complementary), multi-squad.ts is local resolution (orthogonal), streams are label partitioning within repos (composable), remote/bridge is human-to-agent PWA control (mesh replaces agent-to-agent use cases). Decision: Zero code changes to existing modules, zero CLI commands, mesh.json stays separate from squad.config.ts. Mesh integrates as convention-first additive layer — invisible if unused, composes cleanly when needed. The 125:1 ratio (30 lines of script vs. 3,756 lines of deleted federation code) holds. Architecture validated by 3-model consensus remains intact.

📌 Team update (2026-03-14T22-01-14Z): Distributed mesh integrated with deterministic skill pattern — decided by Procedures, PAO, Flight, Network

**Two-Error Lockout Policy designed:** Lockout triggers after 2 errors (build/test/reviewer/runtime/CI failures) within a session. Counters are session-scoped and per-agent. Interacts with existing Reviewer Rejection Protocol: reviewer rejection = 1 error toward 2-error limit + artifact-scoped lockout. Once locked out, agent cannot take new work for rest of session. Escalates to user if all agents locked out. Written to `.squad/decisions/inbox/flight-lockout-policy.md` for team adoption.

**Test Name-Agnosticism Principle codified:** "Our squad ≠ the squad" — framework tests must never depend on dev team's agent names. Tests assert structure/behavior, not specific names. Use dynamic discovery over hardcoded lists. Sample data uses generic placeholders. Prevents breakage on team rebirths and ensures Squad users with different rosters don't see dev team identity leaking through. Pattern from Tamir's earlier fix, now formalized. Written to `.squad/decisions/inbox/flight-no-name-deps.md`.

**Board triage (40 open issues):** 13 P1 (hot), 4 research/RFC (warm), 23 cold. Hot list: SDK quality gates (#340, #341, #347), WSL transient error (#363), CastingEngine bypass (#342), skills migration (#354), three-layer tooling enforcement (#330), session ask-tracking (#366), SDK base roles (#378), model defaults (#322), docs version pin (#320), client-delivery workflow RFC (#328), personal squad updates (#329). Warm: knowledge library (#413), ADRs (#370), external API docs (#355), bidirectional upstream sync (#357). Cold: A2A protocol suite, long-term design exploration.

**Lockout policy file paths:** `.squad/decisions/inbox/flight-lockout-policy.md`, `.squad/decisions/inbox/flight-no-name-deps.md` — both ready for Scribe merge into main decisions.md.

### A2A Core Protocol Architecture (#332) — 2026-03-16

**Architecture proposal written:** `.squad/proposals/a2a-core-protocol.md`. Module split: SDK owns types + Agent Card + RPC logic + outbound client (`squad-sdk/src/a2a/`); CLI owns HTTP server + middleware + `squad serve` command (`squad-cli/src/cli/a2a/`). This follows the established SDK=logic, CLI=runtime boundary pattern.

**Key architecture decisions for A2A:**
- HTTP server: `node:http` (not Express) — matches RemoteBridge pattern in `remote/bridge.ts`, zero new dependencies.
- JSON-RPC 2.0 framing uses `vscode-jsonrpc` message types (already a dependency in both packages).
- Agent Card auto-generated from `.squad/` state (team.md, agents, skills, decisions). Served at `/a2a/card`.
- Three RPC methods: `squad.queryDecisions`, `squad.delegateTask` (shells out to `gh`), `squad.shareResearch`.
- Charter content explicitly excluded from A2A sharing — charters contain internal prompts.
- Localhost-only binding (`127.0.0.1`) for MVP. Real auth deferred to #335.
- Phase boundaries hard: #332 = protocol core, #333 = discovery, #334 = CLI integration, #335 = security.

**Existing networking code reference:** RemoteBridge (`squad-sdk/src/remote/bridge.ts`) uses `node:http` + `ws`, inline middleware (rate limiting at 30 req/min, bearer token auth, one-time WS tickets, 4-hour session TTL, security headers). Same patterns reusable for A2A server. RemoteBridge already has JSON-RPC passthrough mode with method allowlisting.

**Decision file:** `.squad/decisions/inbox/flight-a2a-architecture.md` — awaiting sign-off from EECOM, CONTROL, Network, Brady.

---

## Sprint Prioritization Pattern

**Backlog triage methodology (47-issue analysis):**  
Rank by: (1) bugs with active user impact, (2) quality/test gaps blocking GA release, (3) high-ROI features unblocking downstream work. Current sprint Top 10 identifies 3 bugs (WSL crash, SDK init regression, VS Code crash), 3 quality gates (SDK feature parity testing), and 4 governance/architecture decisions (opt-in roles, ADR archive, docs gaps, upstream sync). This pattern scales: categorize all open issues by type → sort each category by impact/urgency → interleave across sprint capacity to balance stability (bugs/quality) with velocity (features). Squad GA is gated by quality #340, #341, #347 and user-facing regressions #363, #337 — these must ship in parallel next sprint.

