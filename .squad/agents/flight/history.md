# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

📌 **Team update (2026-03-22T09-35Z — Wave 1):** Ambient personal squad design validated and 19-task implementation plan authored across 4 PRs (Phase 1 SDK, Phase 2 CLI, Phase 3 governance, Phase 4 tests). MVP = PR #1 + PR #3. EECOM executing Phase 1–2 (SDK + CLI), Procedures executing Phase 3 (governance) concurrently. All design gaps resolved; dependency graph established. Procedures wrote governance proposals for personal squad + economy mode — awaiting your review. Sims to execute Phase 4 after Phase 1+2 merge. Directive captured: bug #502 (node:sqlite, P1) to be picked up after Wave 1. No blocking issues — ready for execution.

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

**Updated wisdom.md with 4 patterns + 2 anti-patterns from recent work:** Test name-agnosticism for team rebirths, dynamic filesystem discovery for evolving content, cli-entry.ts unwired command bug pattern, bump-build.mjs version mutation timing, invalid semver formats, git reset data loss.

**Issue triage attempted for 30 open issues:** Identified 10 unlabeled issues requiring squad assignment. Enterprise Managed User permissions blocked GitHub API label updates via `gh issue edit`. Triage analysis complete:
- SDK issues (#337, #342) → squad:eecom + squad:capcom (init flow + casting engine)
- Personal squad (#343, #344) → squad:flight (architecture territory)
- A2A protocol (#332-336) → squad:flight + domain experts (network, vox, retro, eecom)
- Tooling layers (#330) → squad:eecom + squad:procedures
Manual label application needed by repo owner.

**SDK Init Shore-Up PRD created:** Consolidated 6 SDK-related issues (#337-342, #340-341) into unified 3-phase initiative at `.squad/identity/prd-sdk-init-shoreup.md`. Root causes: config sync gap, built-in member exclusion (Ralph, @copilot), CastingEngine bypass. Solution: Phase 1 fixes gaps (P1), Phase 2 wires CastingEngine (P1), Phase 3 exercises full test matrix (P2). Estimated 4 sprints to 100% SDK feature parity. Owners: EECOM + CAPCOM (phases 1-2), FIDO + CAPCOM (phase 3).

📌 **Team update (2026-03-11T01:25:00Z):** Flight completed 30-issue triage + unified SDK Init Shore-Up PRD. CAPCOM + EECOM completed deep technical analysis + implementation roadmap. 5 decisions merged to decisions.md: Phase-based quality improvement program, CastingEngine canonical casting, squad.config.ts as source of truth, Ralph always-included, implementation priority order.

### Issue Triage & PR Pipeline (2026-03-22)

**Triaged 6 unlabeled issues:** Assigned to appropriate squad members per domain expertise and team capacity. Applied `next-up` label to 10 priority items (bugs, easy wins, docs improvements). All triaged issues now have clear ownership and next steps.

**PR Pipeline:** Reviewed and rebased 8 PRs across EECOM, GNC, and PAO. All merged successfully. Key patterns documented for team reuse:
- **az CLI timeouts** (PR #483): External CLI calls need explicit timeouts + fallback handling
- **History race conditions** (PR #480): File operations require mutex + atomic writes + exhaustive tests
- **Signal handling** (PR #486): SIGINT cleanup needs two-layer approach (parent + child cleanup)
- **ESM exports** (PR #474): Node 22 compatibility requires exports map + file existence validation
- **Broken docs links** (PR #487): Automated link validation should be CI gate

Test coverage expanded: 36 new tests (EECOM) + 4655+ total passing (GNC report).

**Coordinator actions:** Filed #488 (GitHub auth documentation), created `next-up` label, labeled 10 priority issues for next sprint focus.
📌 **Team update (2026-03-10T12-55-49Z):** Adoption tracking architecture finalized. Three-tier system approved: Tier 1 (aggregate-only, `.github/adoption/`) shipping with PR #326; Tier 2 (opt-in registry) designed for next PR; Tier 3 (public showcase) launches when ≥5 projects opt in. Append-only file governance rule enforced to prevent data loss. Microsoft ampersand style guide adopted for all user-facing documentation.

### PR #331 Review — Boundary Review Pattern Reinforced (2026-03-10)
Approved PR #331 ("docs: scenario and feature guides from blog analysis") for merge. PAO's boundary review (remove external infrastructure docs, reframe platform features to clarify scope, keep Squad behavior/config docs) was executed correctly. Key decisions: (1) ralph-operations.md and proactive-communication.md deleted — both document infrastructure around Squad, not Squad itself; (2) issue-templates.md reframed to clarify "GitHub feature configured for Squad" not "Squad feature"; (3) reviewer-protocol.md Trust Levels section kept — documents user choice spectrum within Squad's existing review system. Litmus test pattern: if Squad doesn't ship the code/config, it's IRL content. Docs-test sync maintained. Pattern reinforced as reusable boundary review heuristic for future doc PRs.

**Adoption tracking architecture — three-tier opt-in system:** `.squad/` is for team state only, not adoption data (boundary pattern). Move tracking to `.github/adoption/`. Never list individual repos without owner consent — aggregate metrics only until opt-in exists. Tier 1 (ship now) = aggregate monitoring. Tier 2 (design next) = opt-in registry in `.github/adoption/registry.json`. Tier 3 (launch later) = public showcase once ≥5 projects opt in. Monitoring infra (GitHub Action + script) is solid — keep it. Privacy-first architecture: code search results are public data, but individual listings require consent.

**Remote Squad access — three-phase rollout:** Phase 1 (ship first): GitHub Discussions bot with `/squad` command. Workflow checks out repo → has full `.squad/` context → answers questions → posts reply. 1 day build, zero hosting, respects repo privacy automatically. Phase 2 (high value): GitHub Copilot Extension — fetches `.squad/` files via GitHub API, answers inline in any Copilot client (VS Code, CLI, mobile). Works truly remote, instant, no cold start. 1 week build. Phase 3 (enterprise): Slack/Teams bot for companies. Webhook + GitHub API fetch. 2 weeks build. Constraint: Squad needs `.squad/` state (team.md, decisions.md, histories, routing) to answer intelligently. Any remote solution must solve context access. GitHub Actions workflows solve this for free (checkout gives full state). Copilot Extension uses Contents API. Discussions wins for MVP because it's async (perfect for knowledge queries), persistent (answers are searchable), and zero infra. Proposal-first: write `docs/proposals/remote-squad-access.md` before building.

### Content Triage Skill Codified (2026-03-10)
Created `.squad/skills/content-triage/SKILL.md` to codify the boundary heuristic from PR #331. Defines repeatable workflow for triaging external content (blog posts, sample repos, videos, talks) to determine what belongs in Squad's public docs vs IRL tracking. Key components: (1) "Squad Ships It" litmus test — if Squad doesn't ship the code/config, it's IRL content; (2) triage workflow triggered by `content-triage` label or external content reference in issue body; (3) output format with boundary analysis, sub-issues for PAO (doc extraction), and IRL reference entry for Scribe; (4) label convention (`content:blog`, `content:sample`, `content:video`, `content:talk`); (5) Ralph integration for routing to Flight, creating sub-issues, and notifying Scribe. Examples include Tamir blog analysis (PR #331), sample repo with ops patterns, and conference talk. Pattern prevents infrastructure docs from polluting Squad's public docs while ensuring community content accelerates adoption through proper extraction and referencing.

📌 **Team update (2026-03-11T01:27:57Z):** Content triage skill finalized; "Squad Ships It" boundary heuristic codified into shared team decision (decisions.md). Remote Squad access phased rollout approved (Discussions bot → Copilot Extension → Chat bot). PR #331 boundary review pattern established as standard for all doc PRs. Triage workflow enables Flight to scale as community content accelerates.

---

### Issue Triage — 6 Unlabeled Issues Routed (2026-03-20)

Triaged and labeled 6 unlabeled issues using routing table:

- **#485 (Agent Specification PRD)** → squad:flight + squad:procedures — Architecture decision (Flight) + formal spec structure (Procedures)
- **#481 (StorageProvider PRD)** → squad:control + squad:eecom — Type system abstraction (CONTROL) + runtime integration (EECOM)
- **#479 (history-shadow race condition)** → squad:eecom + squad:retro — Production data loss bug; mitigation through StorageProvider atomicity
- **#478 (Polish REPL)** → squad:vox + squad:pao — Shell UX readiness (VOX) + README documentation gate (PAO)
- **#477 (Code Quality Linting PRD)** → squad:fido — Monorepo async/promise quality, ESLint 9 PoC ready
- **#476 (Guide v0.4.1 update)** → squad:handbook + squad:pao — SDK patterns + documentation

Key pattern: PRDs cluster around three architectural gaps (agent spec, state abstraction, quality tooling) + one production bug (#479). Guide update high community value.
### Ambient Personal Squad Architecture Review (#329 + #344)

**Design validated:** The `flight-ambient-personal-squad.md` proposal is structurally sound. Key finding: `multi-squad.ts` already stores personal squad paths as direct dirs (`squads/{name}/`) with no nested `.squad/` subfolder — the "each team IS the squad root" convention is already the implementation, not a change needed.

**Five gaps found in the design doc:**
1. No `resolvePersonalAgents()` function signature — added in implementation plan (T2).
2. Scenario 9 contradiction: personal agents wrote to project orchestration log, violating ghost protocol. Resolution: coordinator writes audit trail (project state), not the personal agent.
3. `--team-root` scope was undefined. Decision: additive CLI flag on `squad init`, backward compat with existing `config.json` teamRoot.
4. `squad personal init` was missing — bootstrapping path for first-time users. Added as T6 subcommand.
5. `SQUAD_NO_PERSONAL` env var was in Open Questions but absent from phases. Added to T1.

**Architecture decision:** Need `ensureSquadPathTriple` in `resolution.ts` (T4) — personal agents write to a third root (personal squad dir). Without it, ghost protocol is advisory-only and not enforced by path guards in SDK.

**Phasing:** Four PRs. MVP = PR #1 (SDK Foundation) + PR #3 (Governance). Users see ambient cast immediately; `squad personal` commands are quality-of-life on top.

**Implementation plan written to:** `.squad/decisions/inbox/flight-329-344-implementation-plan.md`

📌 **Team update (2026-03-24):** Ambient personal squad design reviewed and approved with 5 gaps identified and resolved. Implementation plan broken into 4 PRs across EECOM (SDK + CLI), Procedures (governance), and Sims (tests). MVP path = SDK foundation + governance updates. Phased to avoid one giant PR.

### Session 2 Summary (2026-03-22)

Wave 1 architecture work on #329/#344: validated 20KB personal squad design doc, identified and patched 5 gaps, authored 19-task implementation plan spanning 4 future PRs. Implementation not yet started — deferred to future session. EECOM assigned Phase 1–2 (SDK + CLI), Procedures assigned Phase 3 (governance), Sims assigned Phase 4 (tests).

### Community PR Batch Review — July 2026

Five open community PRs reviewed:

- **#524 (diberry)** — Astro docs improvements (sitemap, RSS, schema fields, ToC component, robots.txt). ✅ Merge-ready. Flag: `robots.txt` Sitemap URL points to `squad.dev` while `astro.config.mjs` still uses `bradygaster.github.io` — minor URL inconsistency to address.
- **#523 (diberry)** — Worktree-aware `detectSquadDir` + `resolveWorktreeMainCheckout` + init guard. ✅ Merge-ready. Directly addresses the worktree gap flagged in #525. Clean implementation; interactive TTY prompt with sensible default.
- **#522 (tamirdresher)** — Rate limiting/circuit breaker watch integration. 🔄 Still a full rewrite of watch.ts. Brady's CHANGES_REQUESTED (additive patch, not full file replacement) has NOT been addressed. Same structural concern remains.
- **#513 (tamirdresher)** — Cross-machine-coordination SKILL.md. 🔄 Wrong directory (`.squad/skills/` is team-state; generic library content belongs in `templates/skills/`). Personal use case examples (voice cloning, DevBox) should be generalized. Needs `docs/proposals/` entry per proposal-first policy.
- **#507 (JasonYeYuhe)** — Chinese README translation. 🔄 Needs a community-maintained freshness disclaimer before merging. Translation quality looks solid; the maintenance burden concern is the only gate.

**Patterns noted:**
- Diberry (MSFT) is delivering consistent, architecturally-sound contributions — both PRs are merge-ready.
- Tamir's contributions are technically strong but need delivery discipline (full-rewrite vs. surgical patch, proposal-first for new primitives).
- Community translations are welcome but need a sustainability framing before merge.

### Worktree Gap Triage — #525 (2025-07-18)

Community contributor joniba filed #525 identifying that Squad has full worktree *detection* but zero worktree *creation* in the coordinator/spawn flow. Validated all 10 claims — analysis is accurate. The reading infrastructure (resolveSquad() worktree detection, .gitattributes merge=union, boundary tests) is ~95% complete. The gap: ralph-commands.ts hardcodes `git checkout -b` in all 3 platform adapters (lines 50/71/92), coordinator never creates worktrees before spawn, no WORKTREE_PATH in prompts, and issue-lifecycle.md is referenced in squad.agent.md but doesn't exist.

**Decision:** P2 — important but not v1-blocking. Broke into 5 sub-issues: (1) doc fix for missing issue-lifecycle.md (quick win → Procedures), (2) worktree variant in ralph-commands.ts (EECOM), (3) coordinator pre-spawn logic (Procedures + EECOM), (4) post-merge cleanup (EECOM), (5) architecture decision on heuristic (Flight). Sub-issue #1 ships immediately; #2–5 queue post-Wave-1 alongside SubSquads work where parallel execution becomes a hard requirement.

**Backlog priority recommendation:** Top 5 for v1 = #508 (Ambient Personal Squad), #498 (remove .squad/ from VCS), #485 (Agent Spec & Validation), #481 (Typed StorageProvider), #347 (shore up init --sdk). Quick wins: #525 doc fix, #347. Deprioritize: manual verification debt (#418–421), long-term exploratory. A2A (#332–336) stays shelved per existing decision.
