# Flight history

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/flight/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Core Context

- **2026-03-23 Release Crisis:** v0.9.0→v0.9.1 incident resolved after an 8-hour debugging marathon. Root causes: dependency validation gap (`file:` refs in packages), GitHub workflow cache race, npm workspace publish automation broken, no pre-publish verification, coordinator decision-making under pressure. Filed 9 issues (#556–#564), 6 action items (A1–A6). Pre-flight job (dependency scan + semver validation) added to publish pipeline; Surgeon charter hardened; `.squad/skills/release-process/SKILL.md` created (now also holds the enforced hard rules — see 2026-09-03 reskill). Full incident detail: `history-archive-2026-08-19T13-11-34.130-07-00.md`.
- **2026-03-25 Triage Session:** Flight triaged 14 issues + 10 PRs into P0/P1/P2/deferred buckets, established "Tamir PRs need proposal-first discipline" pattern. Full breakdown archived.
- **2026-03-26 Crash Recovery:** Post-CLI-crash recovery in 3 rounds — 10 PRs merged, 3 closed as duplicates, dev green at 5,038 tests. Full breakdown archived.
- **2026-03-22 Wave 1:** Ambient personal squad design validated, 19-task plan across 4 PRs. MVP = PR #1 + PR #3.
- Three-branch model (main/dev/insiders). Proposal-first: meaningful changes need `docs/proposals/` before code. Governance policies (error lockout, product isolation, peer quality check) and the "Squad Ships It" boundary heuristic now live in `.squad/skills/governance-policies/SKILL.md`.
- **Issue filing pattern:** after a major incident, file one issue per root cause + one per action item — creates accountability and accelerates fixes.
- **Release governance:** Surgeon owns all publishing; strict playbook adherence; pre-flight gates mandatory before any release tagging.
- **Sprint prioritization:** rank by (1) active user-impact bugs, (2) quality/test gaps blocking GA, (3) high-ROI features unblocking follow-on work.

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


- 📌 **Team update (2026-08-21 — Agentic-Workflows Audit):** Reviewed PR #1815. Independently re-verified all five of Booster's claims. Resolved git-negation-semantics question (* + !.gitignore correct for flat-file dirs). Judged .github/aw/logs/.gitignore correct placement over root .gitignore rule (colocation beats surviving directory deletion). Squash-merged at 2026-08-21T16:23:46Z. Decision captured in decisions.md: gitignore-colocation. PR #1815 APPROVED + MERGED ✅.

## 2026-08-22 — gh-aw triage team update

📌 Team update (2026-08-22T17:10:52-07:00): Flight completed Tier 1 gh-aw false-green triage: #1824 #1812 #1801 #1822 #1827 #1825 labeled. Architectural ruling: keep #1801/#1812 independent; do not absorb #1801 into #1757; re-scope #1757 after #1801 lands.
