# Flight — Project History

> Knowledge accumulated through leading Squad development.

---

## Current Responsibilities

- Release governance and incident recovery coordination
- Issue/PR triage and work session planning
- Adoption tracking and remote Squad access architecture
- Three-branch model oversight (main/dev/insiders)
- Team structure (17 agents, Apollo 13)

📌 **See `history-archive.md` for detailed learnings prior to 2026-04-01**

## Latest Session

- **2026-04-19:** Decision inbox merged (4 decisions); CONTROL CLI fix integrated; no new strategic issues
- **Previous:** Release crisis recovery, personal squad design validation, crash recovery execution, issue triage

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

### Release Hardening Plan — Finalized (2026-07-22)

Brady approved scope for remaining v0.9.1 incident hardening. Three issues to execute, three deferred into umbrella:

**DO:** #564 (rewrite PUBLISH-README.md as living playbook — absorbs #558, #559, #560), #557 (CI lint rule rejecting non-workspace `npm publish` in workflow YAML), #562 (delete ghost workflow `publish-npm.yml` ID 250121956).

**DEFERRED into #564:** #560 (pre-flight checklist → playbook section), #559 (fallback protocol → playbook section), #558 (422 race docs → playbook section).

**Key findings:**
- GitHub REST API has NO "Delete a workflow" endpoint. Ghost workflows only disappear when all their runs are deleted (GitHub GC). Procedure: `gh api` to list+delete all runs for workflow ID 250121956, then wait for GC.
- The lint rule goes in `squad-ci.yml` as a `publish-policy` job: scans `.github/workflows/*.yml` for `npm publish` without `-w` flag. Blocks PR merge if violated.
- PUBLISH-README.md playbook has 11 sections covering pre-flight, CI publish, manual fallback, 422 race conditions, insider channel, workspace policy, post-publish verification, and version bumping. Replaces the stale v0.8.22 stub entirely.

**Execution order:** #562 (Brady, manual API call) and #557 (FIDO/Procedures, CI change) run in parallel. #564 (Procedures+Surgeon, playbook) goes last so it can reference the lint rule.

Decision written to `.squad/decisions/inbox/flight-release-hardening-plan.md`.

### Issue Triage Session — 14 Untriaged Issues (2026-03-24)

**Triaged 14 issues + 10 PRs:** 3 docs issues, 6 community feature proposals, 3 bugs, 2 questions. Key findings:

**P0 Bug (immediate):**
- #590 (getPersonalSquadRoot) → squad:eecom — personal squad broken since v0.9.1, affects all `squad consult` on new repos

**P1 Quick Wins:**
- #610 (broken docs link) → squad:pao — 5-minute fix, unblocks diberry PR #611 CI
- #591 (hiring wiring docs) → squad:procedures — matches PR #592 (joniba), high-quality wiring guide ready to merge

**Community PRs (proposal-first enforcement):**
- Tamir PRs #602-607 (6 PRs) — high technical quality but missing proposal-first compliance. Need `docs/proposals/` entries before review.
- Joniba PR #592 — merge-ready, validates enforcement wiring gap
- Diberry PR #611 — blocked on #610 fix, then merge

**P2 Maintenance:**
- #597 (upgrade CLI docs) → squad:pao + squad:network
- #588 (model list update) → squad:procedures
- #554 (broken external links) → squad:pao

**Deferred/Questions:**
- #581 (ADO PRD) → P2, blocked until #341 SDK-first parity ships
- #589, #494 → community replies clarifying skill paths and model selection

**Pattern:** Tamir is a high-output contributor (6 PRs in 2 weeks) but needs proposal-first discipline. Joniba and diberry deliver MSFT-level quality.

Decision written to `.squad/decisions/inbox/flight-triage-session-plan.md`.
