# Session: Next-Wave Triage & Planning

**Date:** 2026-03-07  
**Requested by:** Brady  
**Status:** Complete  

---

## Fan-Out Work

Three agents conducted parallel assessments in preparation for v0.8.22 planning:

### 1. **Keaton (Lead) — Issue Triage**
- **Scope:** All 22 open issues on bradygaster/squad
- **Outcome:** P0/P1/P2/P3 prioritization with 4 action categories (fix-now, next-wave, needs-discussion, defer)
- **Key insight:** Identified duplicate patterns (CLI wiring regression, model config conflict) and migration wave grouping opportunity
- **Decision:** v0.8.22 target = 11 issues (5 fix-now + 6 next-wave); 11 issues deferred to v0.8.23+
- **Output:** `.squad/decisions/inbox/keaton-next-wave-triage.md`

### 2. **Fenster (Core Dev) — PR Review**
- **Scope:** 4 open PRs (#243, #238, #191, #189)
- **Outcome:** All 4 PRs target `main` instead of `dev`; regression test pattern identified for CLI wiring
- **Key insight:** Process improvement needed (communicate `dev` targeting); pattern win in PR #238 (wiring regression test)
- **Decision:** Retarget #243 and #238 to dev, defer #191 and #189 to v0.8.22 after rebase/CI
- **Output:** `.squad/decisions/inbox/fenster-pr-review-wave2.md`

### 3. **Hockney (Tester) — Test Health**
- **Scope:** Full test suite assessment (140 files, 3,655 tests)
- **Outcome:** ✅ Safe to ship; critical blind spots in 8 CLI commands and error handling
- **Key insight:** Test-to-code ratio healthy (3.1:1 overall) but uneven (CLI 0.5:1, SDK 4.0:1)
- **Decision:** Fix speed gate before feature work; add 8 CLI command test stubs (12-14 hrs QA work reduces bugs ~40%)
- **Output:** `.squad/decisions/inbox/hockney-quality-assessment.md`

---

## Consolidated Recommendations

| Priority | Action | Owner | Timeline |
|----------|--------|-------|----------|
| P0 | Fix speed gate flakiness | Hockney/Edie | Before feature work |
| P1 | Add 8 CLI command test stubs | Hockney | Before feature work |
| P1 | Add error-handling tests (30+) | Hockney + team | This week |
| P2 | Retarget PRs #243, #238 to dev | Fenster | This week |
| P2 | Batch CLI wiring audit (#237, #236) | Fenster | Fix-now queue |
| P2 | Approve issue assignments | Brady | This week |

---

## Next Steps

1. Brady reviews consolidated assessment
2. Keaton routes fix-now queue (5 issues) to owners
3. Hockney creates test stubs for 8 CLI commands
4. PRs #243/#238 retargeted and rebased
5. v0.8.22 planning begins after test baseline established

---

## Decisions Written to Inbox

- `keaton-next-wave-triage.md` (151 lines, comprehensive triage with timeline)
- `fenster-pr-review-wave2.md` (109 lines, PR findings + process improvement)
- `hockney-quality-assessment.md` (223 lines, test health + gap analysis)

**Total inbox decisions:** 3 files, 483 lines, ready for merge into `decisions.md`
