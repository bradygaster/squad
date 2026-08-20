# Flight history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/flight/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed signals

- 📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution Complete):** Post-CLI crash recovery executed in 3 rounds. Round 1: Flight audited PR/issue state (found #617 merged, #619 conflicting, 3 dupes #605/#604/#602 open); FIDO verified baseline (5,038 tests ✅ green); Scribe merged stale inbox. Round 2: Flight closed 3 duplicate PRs with rationale; Procedures rebased PR #619 (model catalog) onto dev, resolved 3 merge conflicts, merged; FIDO reviewed 9 community PRs—approved 3 (#625/#603/#608), requested changes on 6 (package naming, file paths). Round 3: Coordinator merged 3 approved PRs. **10 PRs merged total** (6 merge-plan, 3 community, 1 legacy #592). **3 PRs closed** as duplicates. **6 PRs awaiting author revisions**. **Dev branch green** (5,038 tests). All merge-plan sequence complete.
- 📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review):** Flight triaged 14 untriaged GitHub issues, created prioritized work session plan. Identified high-value quick wins (P1): #610 (docs broken link), #590 (getPersonalSquadRoot bug, P0), #591 (hiring wiring docs). Deferred community feature contributions (#601–#595) pending PR review. FIDO reviewed 10 open PRs, identified 3 duplicate/overlap pairs. Work session priority: #610→PAO, #590→EECOM, #592/#611→Flight review, #588→Procedures. Tamir PRs require proposal-first discipline. Merge-ready: #611 (blocked on #610), #592.
- 📌 **Team update (2026-03-23T22:00Z — Release Crisis Recovery):** v0.9.0→v0.9.1 incident resolved. Released v0.9.1 stable on npm after 8-hour debugging marathon. Root causes: dependency validation gap (file: refs in packages), GitHub workflow cache race, npm workspace publish automation broken, no pre-publish verification. Created comprehensive retrospective with 5 root causes and 6 action items (A1–A6). Filed 9 GitHub issues (#556–#564). Pre-flight job added to publish pipeline. Surgeon charter hardened. 10 community PRs merged. Release process skill created at `.squad/skills/release-process/SKILL.md`.
- 📌 **Team update (2026-03-26T06:41:00Z — Crash Recovery Execution Complete):** Post-CLI crash recovery executed in 3 rounds. Round 1: Flight audited PR/issue state (found #617 merged, #619 conflicting, 3 dupes #605/#604/#602 open); FIDO verified baseline (5,038 tests ✅ green); Scribe merged stale inbox. Round 2: Flight closed 3 duplicate PRs with rationale; Procedures rebased PR #619 (model catalog) onto dev, resolved 3 merge conflicts, merged; FIDO reviewed 9 community PRs—approved 3 (#625/#603/#608), requested changes on 6 (package naming, file paths). Round 3: Coordinator merged 3 approved PRs. **10 PRs merged total** (6 merge-plan, 3 community, 1 legacy #592). **3 PRs closed** as duplicates. **6 PRs awaiting author revisions**. **Dev branch green** (5,038 tests). All merge-plan sequence complete. Draft #567 parked pending requirements. Decision inbox merged to decisions.md and deleted. Next: Monitor change-request PRs for author responses.
- 📌 **Team update (2026-03-25T15:23Z — Triage Session & PR Review):** Flight triaged 14 untriaged GitHub issues, created prioritized work session plan. Identified high-value quick wins (P1): #610 (docs broken link, 5-min fix), #590 (getPersonalSquadRoot bug, P0), #591 (hiring wiring docs). Deferred community feature contributions (#601–#595) pending PR review. Categorized maintenance (P2) and questions for community. FIDO reviewed 10 open PRs, identified 3 duplicate/overlap pairs (6 PRs consolidate to 4: merge #607/#603/#606, close #605/#604/#602). Work session priority: #610→PAO, #590→EECOM, #592/#611→Flight review, #588→Procedures. Established PR review strategy: Tamir PRs require proposal-first discipline before review. Merge-ready identified: #611 (blocked on #610), #592 (joniba wiring guide, high-quality). A2A protocol PRs remain shelved. All 14 issues fully categorized with squad assignments. Decision inbox merged to decisions.md. Session complete; team ready for execution.
- 📌 **Team update (2026-03-23T22:00Z — Release Crisis Recovery):** v0.9.0→v0.9.1 incident resolved. Released v0.9.1 stable on npm after 8-hour debugging marathon (should have been 10 min). Root causes: dependency validation gap (file: refs in packages), GitHub workflow cache race, npm workspace publish automation broken, coordinator decision-making under pressure, no pre-publish verification. Created comprehensive retrospective with 5 root causes and 6 action items (A1–A6). Filed 9 GitHub issues (#556–#564) documenting release process improvements. Pre-flight job added to publish pipeline (dependency scanning + semver validation). Surgeon charter hardened with release governance rules. 10 community PRs merged (#569, #570, #571, #555, #552, #568, #572, #513, #573, #574). Discussion board fully triaged (15 discussions: 4 closed, 1 consolidated, 2 converted to issue, 8 kept). Dark mode fix deployed to production. Release process skill created at `.squad/skills/release-process/SKILL.md`. 9 GitHub issues filed for release improvements. Team ready for next cycle.
- 📌 **Team update (2026-03-22T09-35Z — Wave 1):** Ambient personal squad design validated and 19-task implementation plan authored across 4 PRs (Phase 1 SDK, Phase 2 CLI, Phase 3 governance, Phase 4 tests). MVP = PR #1 + PR #3. EECOM executing Phase 1–2 (SDK + CLI), Procedures executing Phase 3 (governance) concurrently. All design gaps resolved; dependency graph established. Procedures wrote governance proposals for personal squad + economy mode — awaiting your review. Sims to execute Phase 4 after Phase 1+2 merge. Directive captured: bug #502 (node:sqlite, P1) to be picked up after Wave 1. No blocking issues — ready for execution.
- Three-branch model (main/dev/insiders). Apollo 13 team, 3931 tests. Boundary review heuristic: "Squad Ships It" — if Squad doesn't ship the code, it's IRL content. Proposal-first: meaningful changes need docs/proposals/ before code. Two-error lockout policy: agent locked out after 2 errors in a session. Test name-agnosticism: framework tests must never depend on dev team's agent names.
- **Issue filing pattern:** When a major incident occurs, file 9+ GitHub issues documenting root causes and improvements. One issue per root cause + one per action item. Creates accountability and accelerates fixes.
- **Release governance:** Brady established strict governance — Surgeon owns all publishing; strict playbook adherence; CI/CD is top priority; pre-flight gates mandatory before any release tagging.
- **Sprint prioritization:** Rank by: (1) bugs with active user impact, (2) quality/test gaps blocking GA, (3) high-ROI features unblocking follow-on work. Interleave stability + velocity.
- **PR #331 boundary review:** "Squad Ships It" pattern — remove external infrastructure docs, reframe platform integration docs, keep Squad behavior/config docs.

## Recent preserved tail

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

## 📌 Team update — 2026-08-19T13:11:34.130-07:00

Flight's protected-files policy decision is now canonical: Squad's worker default should use `protected-files` object form with `policy: fallback-to-issue` and `exclude: [README.md]`. The guard protects reviewers from high-leverage changes becoming routine agent output; `CHANGELOG.md` remains protected by default. Adoption-time repo configuration should later expose this choice alongside the Actions preflight.


## 2026-08-20 — gh-aw pre-E2E scope cut (READ-ONLY triage)

- Audited my 5 gh-aw issues (#1729, #1734, #1738, #1762, #1764). Verdicts: DEFER #1729 (epic tracker, phases wave:2/3), DEFER #1734 (Phase 2 enforcement, blocked on #1733 soak, post-E2E), CLOSE #1738 (speculative RFC, second invocation surface, premature), CLOSE #1762 (decision made: docs suffice, preflight deferred to #1605), CLOSE #1764 (decision made: delete all 3 branches).
- Verified #1764 branches: all 5 substantive files from copilot/1592-review-fixes already on origin/dev; other two branches are symmetric CRLF/reformatting churn. Delete all three.
- Scope call: E2E-readiness gate = #1772/#1758/#1759/#1730/#1732/#1768 (correctness + honest fixtures + CI gate). Recommend wave:1 hard cap of 6; demote #1731 to wave:2, treat #1761 as non-gating.
- Core finding: workstream has two axes bleeding together — (a) making the existing SDLC path correct/reliable (tomorrow's real goal) and (b) NEW capabilities on top (#1729 review gate, #1738 app-chat). Tomorrow tests (a); everything in (b) must stay out of wave:1.
- Wrote decision to .squad/decisions/inbox/flight-gh-aw-e2e-scope-cut.md.

## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.


## 📌 Team update — 2026-08-20T13:20:20-07:00

Batch 2: pre-merge gate review of PRs #1775/#1776/#1777/#1778 in progress. All four are green and mergeable. Key validation points: (1) #1777 and #1778 tests verified to fail against pre-fix state; (2) #1778 scope covers #1759+#1756+#1758 all three; (3) `max: 2` and activation guard are complementary not redundant. Board is clean: M1-M5 created, wave labels corrected, #1779 filed to M3.

