# PR #27 Review — Identity Consistency Fix

**Reviewer:** Flight (Lead)  
**Date:** 2026-04-21T03:33:20-07:00  
**PR:** https://github.com/sabbour/squad/pull/27  
**Branch:** `squad/identity-consistency-fix`  
**Authors:** EECOM (impl), FIDO (tests)  
**Verdict:** ✅ APPROVE

---

## Summary

Two fixes for the identity consistency bug where reviewer agents (Leela, Nibbler) posted as `sabbour` instead of their bot identities on kickstart PRs #986/#989/#990:

1. **Template session-export pattern** — GIT IDENTITY block changed from URL-embedded tokens to `export GH_TOKEN` pattern
2. **Role-slugs patterns** — Added `code review`, `reviewer`, `watchdog` → `lead` in ROLE_PATTERNS

---

## Concern-by-Concern Analysis

### A. Template Correctness (`squad.agent.md.template`) ✅ PASS

| Check | Status | Notes |
|-------|--------|-------|
| `export GH_TOKEN` pattern present | ✅ | Line 855: `if [ -n "$TOKEN" ]; then export GH_TOKEN="$TOKEN"; fi; git push` |
| Fallback behavior (TOKEN empty) | ✅ | Explicitly noted: "falls back to default auth if TOKEN is empty" |
| "Never log/echo $TOKEN" rule | ✅ | Line 859: preserved |
| `git commit` user.name/user.email flags | ✅ | Line 853: `-c user.name="{app_slug}[bot]"` etc. preserved |
| Compact ↔ Expanded consistency | ✅ | Both use same export pattern |
| Parallel safety guidance | ✅ | Updated to mention exported env vars |

**Observations:**
- The template doesn't explicitly list all 8 gh write commands (review, comment, merge, edit, issue comment, etc.)
- No `GH_TOKEN= gh ...` escape hatch documented
- However, the export pattern is functionally correct: once exported, ALL subsequent gh commands in the session inherit the token

**Ruling:** The template change is sufficient to fix the production bug. The export before push ensures subsequent gh commands use the bot identity. Missing documentation of all 8 commands and escape hatch are enhancements, not blockers.

### B. Role-Slug Patterns (`role-slugs.ts`) ✅ PASS

| Check | Status | Notes |
|-------|--------|-------|
| `code review` present | ✅ | Position 0 |
| `reviewer` present | ✅ | Position 4 |
| `watchdog` present | ✅ | Position 5 |
| Ordering: reviewer beats backend/frontend | ✅ | Reviewer (4) < frontend (6) < backend (11) |
| `architect` still matches "Security Architect" | ✅ | Test confirms: "Security Architect" → lead |

**Array ordering rationale (first-match-wins):**
```
0: 'code review' → lead    ← catches "Code Reviewer"
1: 'lead' → lead
2: 'architect' → lead      ← catches "Security Architect"
3: 'tech lead' → lead
4: 'reviewer' → lead       ← catches bare "Reviewer"
5: 'watchdog' → lead       ← catches "Watchdog"
6: 'frontend' → frontend
...
11: 'backend' → backend
```

Position 0 `code review` matches "Code Reviewer & Watchdog" before any other pattern can fire.

### C. Test Adequacy (`role-slugs.test.ts`) ✅ PASS

| Check | Status | Notes |
|-------|--------|-------|
| Production regression case | ✅ | `"Code Reviewer & Watchdog"` → lead explicitly asserted |
| Case sensitivity coverage | ✅ | 3 tests: lowercase, uppercase, title case |
| DEFAULT_SLUG fallback | ✅ | Empty string and unknown roles → backend |
| `it.todo` items | ✅ | 2 flagged for Flight ruling |

**`it.todo` Ruling:**

FIDO flagged two ordering concerns:
1. `"Backend & Reviewer"` → lead (reviewer wins)
2. `"Frontend Reviewer"` → lead (reviewer wins)

**Flight's decision:** **ACCEPT CURRENT BEHAVIOR, REMOVE TODOS**

Rationale: In Squad's identity model, "reviewer" is a lead-tier activity. An agent whose role includes "reviewer" is performing review work and should use the lead-tier bot identity regardless of their other domain (backend/frontend). This is semantically correct:
- A "Backend & Reviewer" agent doing code review should post as the lead bot
- A "Frontend Reviewer" agent doing code review should post as the lead bot

The current first-match-wins behavior is the right design. No compound-matching is needed.

**Action:** FIDO can remove the two `it.todo` items in a follow-up commit or leave them as documentation of the considered alternative.

### D. Changeset ✅ PASS

| Check | Status | Notes |
|-------|--------|-------|
| Patch level correct | ✅ | `patch` — bugfix, no API changes |
| Human-readable note | ✅ | References kickstart PRs #986/#989/#990 |
| Both packages covered | ✅ | `@bradygaster/squad-cli: patch`, `@bradygaster/squad-sdk: patch` |

### E. Scope Discipline ✅ PASS

```
.changeset/identity-consistency-fix.md               |  14 ++++++++
.squad/agents/fido/history.md                        |   2 ++
packages/squad-cli/templates/squad.agent.md.template |   8 ++---
packages/squad-sdk/src/identity/role-slugs.ts        |   5 ++-
test/identity/role-slugs.test.ts                     | 115 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
5 files changed, 139 insertions(+), 5 deletions(-)
```

- 5 files (~4 expected + FIDO history)
- No resolve-token.mjs drift
- No ROLE_ALIASES sync (explicitly out of scope)
- No unrelated refactors

### F. Build & Tests ✅ PASS

| Check | Status | Notes |
|-------|--------|-------|
| `npm run build` | ✅ | Clean build |
| `npx vitest run test/identity/` | ✅ | 209 tests pass, 2 todo |
| `npx vitest run test/identity/role-slugs.test.ts` | ✅ | 35 pass, 2 todo |

---

## Verdict: ✅ APPROVE

All hard checks pass. The template export pattern and role-slug patterns are correct fixes for the production bug. FIDO's `it.todo` flags are resolved — current behavior is intentional and semantically correct.

**Follow-up (optional, non-blocking):**
- FIDO may remove the two `it.todo` items or keep as documentation
- Future enhancement: document all 8 gh write commands and escape hatch in template (not required for this fix)

---

## Artifacts

- Review artifact: `docs/reviews/pr-27-identity-consistency-review-2026-04-21.md`
- Decision: `.squad/decisions/inbox/flight-pr-27-verdict.md`
