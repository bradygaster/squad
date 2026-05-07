# Flight History Archive

> Knowledge accumulated through leading Squad development — Archived entries prior to 2026-04-01

## Major Work Sessions

### Release Crisis Recovery (2026-03-23)

v0.9.0→v0.9.1 incident: 8-hour debugging marathon (should have been 10 min). Root causes: dependency validation gap (file: refs in packages), GitHub workflow cache race, npm workspace publish automation broken. Comprehensive retrospective with 5 root causes, 6 action items. 9 GitHub issues filed (#556–#564) for improvements. Pre-flight job added to publish pipeline. 10 community PRs merged. Discussion triage completed (4 closed, 1 consolidated, 2 converted to issue, 8 kept). Dark mode fix deployed.

### Ambient Personal Squad Design (2026-03-22)

Validated design. 19-task implementation plan across 4 PRs (Phase 1 SDK, Phase 2 CLI, Phase 3 governance, Phase 4 tests). MVP = PR #1 + PR #3. EECOM executing Phase 1–2, Procedures executing Phase 3 concurrently. Dependency graph established. Bug #502 (node:sqlite, P1) deferred post-Wave 1.

### Crash Recovery Execution (2026-03-26)

3 rounds: Round 1 audited PR/issue state, verified baseline 5,038 tests ✅; Round 2 closed 3 duplicate PRs, merged #619 (model catalog), FIDO reviewed 9 community PRs (approved 3, change-requested 6); Round 3 Coordinator merged 3 approved. **10 PRs merged total** (6 merge-plan, 3 community, 1 legacy). **3 PRs closed** as duplicates. **6 PRs awaiting revisions**. Dev branch green.

### Issue Triage (2026-03-26)

Triaged 30 open issues. Identified 10 unlabeled issues needing squad assignment. EMU permissions blocked GitHub API updates via `gh issue edit`. Manual label application needed. SDK issues → eecom/capcom, Personal squad → flight, A2A protocol → flight + domain experts, Tooling → eecom/procedures.

### Triage & PR Review (2026-03-25)

14 untriaged GitHub issues analyzed. Identified high-value quick wins (P1): #610 (docs broken link), #590 (getPersonalSquadRoot bug), #591 (hiring wiring docs). Deferred community features pending PR review. FIDO reviewed 10 PRs, identified 3 duplicate pairs (6 PRs → 4 recommendations). Work session priority established. Tamir PRs require proposal-first before review.

## Patterns & Learnings

### Issue Filing Patterns (2026-03-23)
When major incident occurs, file 9+ GitHub issues documenting root causes and improvements. One issue per root cause + one per action item.

### Release Governance Directives (2026-03-23)
Brady: (1) Surgeon owns publishing; (2) strict playbook adherence; (3) document problems; (4) CI/CD priority; (5) written playbooks; (6) no improvisation.

### Adoption Tracking Architecture
Three-tier opt-in system: Tier 1 (aggregate-only, `.github/adoption/`), Tier 2 (opt-in registry), Tier 3 (public showcase ≥5 projects). `.squad/` for team state only.

### Remote Squad Access
Three-phase rollout: Phase 1 GitHub Discussions bot (1 day), Phase 2 GitHub Copilot Extension (1 week), Phase 3 Slack/Teams (2 weeks). All must solve `.squad/` context access.

### Content Triage Skill
"Squad Ships It" litmus test: if Squad doesn't ship code, it's IRL content. Triggered by `content-triage` label.

### Distributed Mesh Integration
Zero code changes. 125:1 ratio (30 lines script vs 3,756 lines deleted federation code).

### Sprint Prioritization
Rank by: (1) user-impact bugs, (2) quality/test gaps, (3) high-ROI features unblocking downstream work.

### Three-Branch Model & Team Structure
Apollo 13 team (17 agents). Boundary review heuristic: "Squad Ships It". Proposal-first for meaningful changes. Two-error lockout policy (agent locked after 2 errors/session).

### Test Name-Agnosticism
Framework tests must never depend on team's agent names. Prevents regressions during team rebirths.

---

*Archive created 2026-04-19 by Scribe during history size management (23.4KB → baseline reduction)*
