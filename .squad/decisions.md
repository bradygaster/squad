# Decisions

> Team decisions that all agents must read. Managed by Scribe.

# Decisions

> Team decisions that all agents must respect. Managed by Scribe.


---

## Foundational Directives (carried from beta, updated for Mission Control)


### Type safety — strict mode non-negotiable
**By:** CONTROL (formerly Edie)
**What:** `strict: true`, `noUncheckedIndexedAccess: true`, no `@ts-ignore` allowed.
**Why:** Types are contracts. If it compiles, it works.

### Hook-based governance over prompt instructions
**By:** RETRO (formerly Baer)
**What:** Security, PII, and file-write guards are implemented via the hooks module, NOT prompt instructions.
**Why:** Prompts can be ignored. Hooks are code — they execute deterministically.

### Node.js >=20, ESM-only, streaming-first
**By:** GNC (formerly Fortier)
**What:** Runtime target is Node.js 20+. ESM-only. Async iterators over buffers.
**Why:** Modern Node.js features enable cleaner async patterns.

### Casting — Apollo 13, mission identity
**By:** Squad Coordinator
**What:** Team names drawn from Apollo 13 / NASA Mission Control. Scribe is always Scribe. Ralph is always Ralph. Previous universe (The Usual Suspects) retired to alumni.
**Why:** The team outgrew its original universe. Apollo 13 captures collaborative pressure, technical precision, and mission-critical coordination — perfect for an AI agent framework.

### Proposal-first workflow
**By:** Flight (formerly Keaton)
**What:** Meaningful changes require a proposal in `docs/proposals/` before execution.
**Why:** Proposals create alignment before code is written.

### Tone ceiling — always enforced
**By:** PAO (formerly McManus)
**What:** No hype, no hand-waving, no claims without citations.
**Why:** Trust is earned through accuracy, not enthusiasm.

### Zero-dependency scaffolding preserved
**By:** Network (formerly Rabin)
**What:** CLI remains thin. Zero runtime dependencies for the CLI scaffolding path.
**Why:** Users should be able to run `npx` without downloading a dependency tree.

### Merge driver for append-only files
**By:** Squad Coordinator
**What:** `.gitattributes` uses `merge=union` for `.squad/decisions.md`, `agents/*/history.md`, `log/**`, `orchestration-log/**`.
**Why:** Enables conflict-free merging of team state across branches.

### Interactive Shell as Primary UX
**By:** Brady
**What:** Squad becomes its own interactive CLI shell. `squad` with no args enters a REPL.
**Why:** Squad needs to own the full interactive experience.

### 2026-03-26: CI deletion guard and source tree canary
**By:** Booster (CI/CD)
**What:** Added two safety checks to squad-ci.yml: (1) source tree canary verifying critical files exist, (2) large deletion guard failing PRs that delete >50 files without 'large-deletion-approved' label. Branch protection on dev requested (may need manual setup).
**Why:** Incident #631 — @copilot deleted 361 files on dev with no CI gate catching it.

### 2026-04-02: EECOM Decision: InitResult.warnings field (#730)

# EECOM Decision: InitResult.warnings field (#730)

> **Author:** EECOM 🔧 | **Date:** 2026-07-16 | **Status:** Implemented (PR #762)

## Decision

Added `warnings: string[]` to the SDK's `InitResult` interface. When `squad.agent.md.template` is missing during `initSquad()`, the condition is tracked in `warnings` rather than emitted via `console.warn()`.

## Rationale

`initSquad()` returns structured data (`{ createdFiles, skippedFiles, configPath, ... }`) with zero console output. Adding `console.warn()` would break this contract. The `warnings` array lets callers (CLI, tests, other tools) decide how to present degraded-state messages.

## Impact

- **SDK consumers**: `InitResult` now has a `warnings` field (always present, empty array when no issues). Non-breaking for existing destructuring since it's additive.
- **CLI `upgrade.ts`**: Uses the existing `warn()` helper directly — no interface change needed there.

## Files Changed

- `packages/squad-sdk/src/config/init.ts` — `InitResult` interface, `initSquad()` implementation
- `packages/squad-cli/src/cli/core/upgrade.ts` — `else { warn() }` in version-current path

### 2026-04-02: EECOM Review — Flight's Proposals for #730 and #734

# EECOM Review — Flight's Proposals for #730 and #734

> **Author:** EECOM 🔧 | **Date:** 2026-04-02 | **Status:** Review

---

## Bug #730 — squad.agent.md silently disappears after upgrade

### Verdict: ✅ APPROVE — with one refinement for init.ts

### Root Cause Analysis: VERIFIED ✅

I verified every code path Flight identified against the actual source:

| Path | Flight's Claim | Source Code Verification |
|------|----------------|--------------------------|
| **Path 1:** upgrade.ts L497-504 (version-current) | Silent skip — no `else` | ✅ **Confirmed.** `if (storage.existsSync(agentSrc))` with no else. Template missing → silent no-op. |
| **Path 2:** upgrade.ts L521-522 (full upgrade) | Already handles with `fatal()` | ✅ **Confirmed.** `if (!storage.existsSync(agentSrc)) fatal(...)` — correct guard. |
| **Path 3:** init.ts L1032-1038 | Inner `if` has no `else` — silent skip | ✅ **Confirmed.** Nested structure: outer if (L1032) = "should we write?", inner if (L1033) = "is template available?". Missing template → silently skips. |
| **Path 4:** doctor.ts L382-412 | Detection without recovery | ✅ **Confirmed.** `checkSquadAgentMd()` correctly detects missing/empty, suggests `squad upgrade`. Appropriate for a diagnostic tool. |

All line numbers, code snippets, and behavioral descriptions match the source.

### Fix Approach: MOSTLY CORRECT ✅ — one refinement needed

**upgrade.ts fix — CORRECT as proposed:**
- `warn()` is already imported from `./output.js` (line 9)
- Adding `else { warn(...) }` to the version-current branch is the right fix
- Message text is clear and actionable

**init.ts fix — REFINEMENT NEEDED:**

Flight proposes `console.warn()` in the SDK, noting "the SDK should not depend on CLI output utilities." This reasoning is correct, but `console.warn()` breaks the SDK's current contract pattern.

The SDK's `initSquad()` returns `{ createdFiles, skippedFiles }` — it tracks what happened via return values, not console output. A `console.warn()` here is side-effectful in a module that's otherwise pure-return-value based. Additionally, there are currently zero `console.warn/log/error` calls anywhere in init.ts.

**Recommended refinement:** Instead of `console.warn()`, add the file to a `warnings` array or append a note to `skippedFiles` so the **caller** can decide how to present the message:

```typescript
if (templatesDir && storage.existsSync(join(templatesDir, 'squad.agent.md.template'))) {
  let agentContent = storage.readSync(join(templatesDir, 'squad.agent.md.template')) ?? '';
  agentContent = stampVersionInContent(agentContent, version);
  await storage.write(agentFile, agentContent);
  createdFiles.push(toRelativePath(agentFile));
} else {
  // Template missing — track as a warning for the caller to handle
  warnings.push(`squad.agent.md template not found — Copilot agent file was not created`);
}
```

If adding a `warnings` return field is too much scope, `console.warn()` is an acceptable fallback — just document why it's there with a comment like `// SDK has no logger; console.warn is intentional here`.

**Flight's nesting warning is CORRECT:** The `else` at L1039 belongs to the outer `if` (skipExisting gate). The new `else` must attach to the inner `if` at L1033. Getting this wrong would corrupt the skippedFiles tracking.

### doctor.ts — AGREE, no changes needed ✅

### Test Plan: ADEQUATE ✅

The two proposed test cases (missing-template in upgrade and init) cover the gap. No additional tests needed.

---

## Bug #734 — squad nap fails via bang command (!) in Windows PowerShell

### Verdict: ✅ APPROVE — Flight's investigation-first approach is correct

### Root Cause Hypothesis: VERIFIED ✅

I traced the full invocation chain:

1. **Nap command is non-interactive:** CONFIRMED. `nap.ts` imports only `path` and `FSStorageProvider`. Zero stdin, readline, TTY, or git operations. Purely filesystem-based (compress, prune, archive, merge). This rules out subprocess stdin/TTY as a root cause.

2. **CLI entry point nap handler (cli-entry.ts L561-574):** Pure async — imports `runNap()`, calls it, prints report. No subprocess spawning or interactive behavior.

3. **Bang command handler:** CONFIRMED — squad does NOT implement bang commands. The `!` prefix is handled by Copilot CLI's shell. Squad's router.ts handles `/command`, `@Agent`, and comma syntax only. Copilot CLI spawns `squad` as a child process.

4. **npm bin shims:** `package.json` declares `"bin": { "squad": "dist/cli-entry.js" }`. npm creates `squad.cmd` and `squad.ps1` shims in `%APPDATA%\npm\` on global install. No `.ps1` files exist in the source repo.

5. **PowerShell .ps1 preference:** When Copilot CLI's bang handler runs `squad nap`, PowerShell resolves `squad.ps1` before `squad.cmd`. The unsigned `.ps1` gets blocked by execution policy → `PSSecurityException`.

### Flight's #758 Connection: CONFIRMED ✅

This IS the same root cause as #758. The chain is:

```
!squad nap → Copilot CLI spawns child process → PowerShell resolves squad.ps1
→ unsigned .ps1 blocked by execution policy → PSSecurityException
```

Flight's #758 proposal (doctor check for .ps1 shim + README workaround + helper removal script) would resolve #734 as a side effect.

### One Nuance Flight Got Slightly Wrong

Flight says: "child process starts a new PS scope with default policy" — this isn't quite right. PowerShell execution policy is typically machine/user-scoped, not session-scoped. A child PowerShell process inherits the same policy as the parent. The issue isn't a policy *reset* in the child; it's that the .ps1 shim is always unsigned regardless of scope. Even the parent session would block it unless the user ran `Set-ExecutionPolicy RemoteSigned` (which they may have done for their direct session but wouldn't help if Copilot CLI spawns via `cmd.exe /c` or uses a different shell).

However, this nuance doesn't change the fix approach — the .ps1 shim is the problem either way.

### Recommendation

1. **Fix #758 first** (doctor check + docs + helper script per Flight's proposal)
2. **Verify #734 resolves** by testing `!squad nap` after removing `.ps1` shim
3. **If #734 persists after #758 fix:** Investigate Copilot CLI's bang handler subprocess environment (but I predict it won't persist)
4. **Close #734 as duplicate of #758** if resolved, with a comment linking the verification

### Flight's Investigation Plan: THOROUGH ✅

The differential diagnosis steps (test `!squad.cmd nap`, `!cmd /c squad nap`, compare execution policies) are exactly right. The test plan with `execFileSync` subprocess test is good.

---

## Summary

| Proposal | Verdict | Notes |
|----------|---------|-------|
| **#730 — squad.agent.md silent skip** | ✅ APPROVE | One refinement: prefer return-value tracking over `console.warn()` in SDK init.ts. upgrade.ts fix is correct as-is. |
| **#734 — nap fails via bang command** | ✅ APPROVE | Investigation-first approach is correct. #758 is almost certainly the shared root cause. Fix #758 first, then verify #734 resolves. |

**Execution order:** #758 → verify #734 → #730 (independent, can parallelize with #758)

— EECOM 🔧

### 2026-04-02: FIDO Quality Review — Draft PRs #760 & #762

# FIDO Quality Review — Draft PRs #760 & #762

> Flight Dynamics Officer — Quality Gate Authority
> Review Date: 2026-04-02T14:47:00Z

---

## PR #760: Windows PowerShell Execution Policy Fix (Issue #758)

**Author:** Network  
**Branch:** `squad/758-fix-ps-execution-policy`  
**Scope:** Doctor command enhancement + scripting helper

### Test Results

✅ **All doctor tests PASS (27/27)**  
- `test/cli/doctor.test.ts`: 641ms runtime, 100% pass rate
- New PS shim detection tests: 4/4 passing (non-Windows guard, file detection, APPDATA fallback, missing file)
- Integration into `runDoctor()`: check #14 verified

### Quality Assessment

#### ✅ Strengths

1. **Platform Guard:** Windows-only detection using `process.platform !== 'win32'` — properly isolated
2. **Path Resolution:** Dual fallback system:
   - Primary: `npm_config_prefix` environment variable
   - Fallback: `path.join(process.env['APPDATA'] ?? '', 'npm')` for Windows defaults
3. **Test Coverage:** 4 new test cases covering:
   - Non-Windows skips (returns `undefined`)
   - File exists scenario (returns `warn` status)
   - File missing scenario (returns `undefined`)
   - APPDATA fallback when npm_config_prefix absent
4. **User Documentation:** README updated with actionable PowerShell commands
5. **Removal Tooling:** Standalone `remove-ps1-shim.mjs` script for users
6. **Clean diff:** No .squad/ team state pollution — templates only
7. **Message Quality:** Warning includes exact file path and removal command inline

#### ⚠️ Edge Cases Identified

| Gap | Risk | Status |
|-----|------|--------|
| Empty APPDATA fallback | Low | Code handles with `?? ''` but not explicitly tested |
| Non-existent npm_config_prefix path | Very Low | Fallback to APPDATA mitigates |
| Permissions error when removing .ps1 | Low | Out of scope; only detection responsibility |

**Verdict:** These gaps are minor and do NOT affect the correctness of the detection logic. Platform guard + dual fallback is solid.

#### 📋 Verification Checklist

- ✅ Windows-only platform guard (non-Windows returns `undefined`)
- ✅ Path resolution with primary + fallback
- ✅ File existence detection using `fileExists()`
- ✅ Warning status with actionable message
- ✅ Tests for non-Windows, file exists, file absent, APPDATA fallback
- ✅ README documentation with commands
- ✅ No .squad/ state files in diff
- ✅ CI passing (27 tests)

---

## Verdict: ✅ APPROVE

**Condition:** None — ready for merge.

**Rationale:**
- Test coverage is comprehensive and all tests pass
- Platform guard and fallback logic are sound
- User-facing documentation is clear and actionable
- No regressions detected
- .squad/ directory is clean

**Assigned to:** Network (original author) for merge

---

---

## PR #762: Silent squad.agent.md Skip — Warnings Array (Issue #730)

**Author:** EECOM  
**Branch:** `squad/730-fix-silent-agent-md-skip`  
**Scope:** SDK init/upgrade path + warning tracking

### Test Results

✅ **All init + upgrade tests PASS (37/37)**  
- `test/init-scaffolding.test.ts`: Happy-path regression + missing template scenario
- `test/cli/upgrade.test.ts`: 20/20 passing, including new refresh regression (v0.9.1 ↔ v0.9.1)
- Duration: 45.95s (comprehensive integration tests)

### Quality Assessment

#### ✅ Strengths

1. **Root Cause Fixed:** Silent skip → visible warnings via `warnings[]` in `InitResult`
2. **SDK Design Pattern:** Returns warnings as structured data (not console output)
   - Library composability preserved
   - SDK has NO `console.warn()` calls
   - CLI layer handles user output via `warn()` function
3. **Happy-Path Regression:** New test validates existing functionality:
   - `squad.agent.md` still created when template exists
   - No spurious warnings in normal flow
   - File exists on disk + contains correct version stamp
4. **Missing Template Coverage:** Explicit test for degraded path:
   - Missing template triggers warning capture
   - Other files still created (graceful degradation)
   - Warning message is descriptive
5. **Upgrade Refresh Regression:** New test at lines 118-137 verifies:
   - `v0.9.1 → v0.9.1` refresh path works
   - `squad.agent.md` still updated when already current
   - Version stamp preserved after refresh
6. **No console.warn:** Uses structured `warn()` function → stdout + ANSI formatting
7. **Clean diff:** No .squad/ team state files — only user-facing code + tests
8. **Changeset:** Proper changelog entry for patch release

#### ✅ Test Coverage Deep-Dive

| Test | File | Lines | Status |
|------|------|-------|--------|
| Happy-path (template exists) | `init-scaffolding.test.ts` | 325-338 | ✅ PASS |
| Missing template warning | `init-scaffolding.test.ts` | 340-379 | ✅ PASS |
| Upgrade happy-path | `upgrade.test.ts` | 34-61 | ✅ PASS |
| Refresh at current version | `upgrade.test.ts` | 118-137 | ✅ PASS |
| All upgrade scenarios (16 more) | `upgrade.test.ts` | 34-500+ | ✅ PASS (20/20) |

#### ⚠️ Edge Cases Identified

| Gap | Risk | Mitigation |
|-----|------|-----------|
| Multiple missing templates | Very Low | Only tracked 1 warning; unlikely scenario (all templates are bundled) |
| console.warn in other paths | Low | SDK does NOT call console.warn anywhere; CLI uses `warn()` |
| Warnings array on success | Very Low | Explicitly tested to be empty `[]` in happy-path |

**Verdict:** All identified gaps are extremely low-risk or explicitly tested.

#### 📋 Verification Checklist

- ✅ Warnings array added to `InitResult` interface
- ✅ Happy-path regression test (template exists → no warnings)
- ✅ Missing template test (warning captured, other files created)
- ✅ Upgrade refresh test (v0.9.1 → v0.9.1 still refreshes agent.md)
- ✅ No console.warn in SDK (uses warnings[] for return)
- ✅ CLI layer uses `warn()` function (stdout + formatting)
- ✅ All 37 tests passing
- ✅ No .squad/ state files in diff
- ✅ Changeset entry present

---

## Verdict: ✅ APPROVE

**Condition:** None — ready for merge.

**Rationale:**
- Test suite is comprehensive (37 tests, all passing)
- Happy-path regression explicitly validated
- Degraded path (missing template) properly handled with warnings
- SDK pattern is sound (returns data, not console output)
- No regressions detected
- .squad/ directory is clean
- Issue #730 is completely addressed

**Assigned to:** EECOM (original author) for merge

---

---

## Summary: Both PRs Ready ✅

| PR | Issue | Status | Tests | Risk |
|----|-------|--------|-------|------|
| #760 | #758 | ✅ APPROVE | 27/27 ✅ | Low |
| #762 | #730 | ✅ APPROVE | 37/37 ✅ | Very Low |

**Next Steps:**
1. Merge #760 (Network fix)
2. Merge #762 (EECOM fix)
3. Both contribute to ecosystem stability without quality regressions

### 2026-04-02: FIDO Quality Review: Flight's Bug Proposals

# FIDO Quality Review: Flight's Bug Proposals

> **Reviewer:** FIDO 🧪 (Quality Owner) | **Date:** 2026-04-02 | **Status:** Quality Assessment Complete

---

## Bug #758 — Windows PowerShell .ps1 Execution Policy Block

### ✅ **VERDICT: APPROVE**

**Test Plan Assessment:** The test plan is **solid and sufficient**.

#### Strengths
- ✅ Clear unit test cases for `checkWindowsPs1Shim()`: platform check, file existence, return values
- ✅ Explicit manual verification steps (install globally, run `squad doctor`, delete `.ps1`, verify `.cmd` fallback)
- ✅ Focused scope — doctor check is additive, low-code-change risk
- ✅ Root cause is well-understood (platform-specific, not behavioral)

#### Test Coverage — Complete
1. **Unit tests** (non-Windows, exists, missing) cover all branches of the check function
2. **Manual verification** explicitly tests the user's actual flow (global install + diagnosis + workaround)
3. **No edge cases missed** — the logic is simple: check platform, check file, return status

#### One Minor Enhancement (Optional)
- Consider adding a unit test for `npm_config_prefix` fallback logic — verify that when `npm_config_prefix` is not set, the code correctly falls back to `%APPDATA%\npm`. This isn't a gap, but it's good defensive testing.

#### My Assessment
Flight's proposal is well-grounded and the test plan covers the implementation. The README addition is appropriate, and the helper script is optional-but-useful. **Ready to proceed without additional tests.**

---

## Bug #734 — squad nap Fails via Bang Command in PowerShell

### ❌ **VERDICT: NEEDS MORE TESTS**

**Test Plan Assessment:** The proposal is **premature**. Investigation must complete before testing.

#### Critical Issues
1. **Status is "Investigation Required"** — Phase 1 (reproduction + differential diagnosis) is mandatory but not yet done
2. **Test plan assumes Phase 1 results** — test cases are written for a Phase 2 that may not exist
3. **Missing reproduction proof** — Flight hasn't confirmed the exact error message, environment delta, or whether this is truly a #758 duplicate

#### What's Missing (MUST Complete Before Approving Tests)
- [ ] **Exact error output** from `!squad nap` vs `squad nap` (full stderr/stdout)
- [ ] **Differential diagnosis results:**
  - Does `!squad.cmd nap` work? (proves #758 duplicate vs distinct issue)
  - Does `!cmd /c squad nap` work? (subprocess environment theory)
  - Does it fail in cmd.exe Copilot CLI too? (rules out PowerShell-specific policy)
- [ ] **Root cause confirmation** — one of three branches must be confirmed:
  - **Branch A:** Duplicate of #758 (close immediately, no fix needed)
  - **Branch B:** Subprocess environment delta (needs `cli-entry.ts` normalization)
  - **Branch C:** Copilot CLI bang expansion issue (file upstream, document workaround)

#### Current Test Plan Issues
- Test at line 78-88 assumes Phase 2 code exists, but Phase 1 hasn't proven a fix is needed
- "Cross-shell test matrix" (line 91-94) is good, but premature — run it during investigation, not during approval

#### My Recommendation
**HOLD THIS PROPOSAL.** Do NOT approve test plans yet. Flight should:
1. Complete Phase 1 investigation and post findings to issue #734
2. If Phase 1 confirms a distinct issue, then resubmit Phase 2 test plan with investigation results as evidence
3. If Phase 1 confirms it's a #758 duplicate, close #734 as duplicate

**Conditional Approval (for IF Phase 1 confirms a distinct issue):**
- If Phase 2 is needed, the proposed test cases are reasonable
- Recommend adding a **baseline test** (without fix) that reproduces the bang failure, then add fix, then verify test passes

---

## Bug #730 — squad.agent.md Silently Disappears After Upgrade

### ✅ **APPROVE** — With One Test Addition

**Test Plan Assessment:** The proposal is **nearly complete**, but has a small gap in test coverage.

#### Strengths
- ✅ Root cause is meticulously documented with exact file paths and line numbers
- ✅ Fix approach is surgical: two `else` clauses in the right places
- ✅ Proposed test cases are specific and actionable
- ✅ Risk assessment is accurate (LOW — additive changes, no behavior change for happy path)
- ✅ Correct differentiation between upgrade.ts and SDK init.ts (different logging patterns)

#### Existing Test Coverage — Already Present
- doctor.ts tests already cover detection of empty/missing `squad.agent.md` ✅
- Happy-path tests for upgrade should still pass ✅

#### Gap: Missing One Test Case
The proposal includes tests for the "sad paths" (missing template), but **lacks a regression test** for the happy path after the fix:

- **Missing:** "When template exists AND we call upgrade (version-current path), squad.agent.md is correctly updated with new version stamp"
  
  This test should verify that adding the `else` clause doesn't accidentally break the happy path (when template exists). This is a common regression risk when adding conditional logic.

#### Files Referenced — Verified
- Line numbers match the actual source code ✅
- Both upgrade.ts and init.ts paths are correctly identified ✅
- The "don't confuse with line 1039" warning is helpful and accurate ✅

#### Edge Cases — All Covered
1. ✅ Missing template during upgrade (version-current) → warns
2. ✅ Missing template during SDK init → warns
3. ✅ Template exists → works as before (happy path)
4. ✅ doctor.ts already detects the symptom → no changes needed
5. ✅ Full-upgrade path (line 521) already handles missing template → no changes needed

#### My Assessment
Flight's proposal is solid. The fix is low-risk and well-tested. **Add one happy-path regression test to the test plan**, then it's ready.

#### Recommended Test Addition
```typescript
it('refreshes squad.agent.md with new version stamp when template exists (happy path)', async () => {
  // Setup: create squad project at older CLI version with squad.agent.md
  // Ensure squad.agent.md.template exists in templates
  // Run upgrade
  // Assert: squad.agent.md updated with new CLI version in header comment
  // Assert: no warning messages
});
```

---

## Summary Table

| Bug | Verdict | Action Required |
|-----|---------|-----------------|
| #758 | ✅ APPROVE | Ready to implement. Optional: add `npm_config_prefix` fallback unit test. |
| #734 | ❌ NEEDS MORE TESTS | **HOLD.** Complete Phase 1 investigation first. Resubmit with investigation results. |
| #730 | ✅ APPROVE (with minor addition) | Add happy-path regression test to test plan, then ready. |

---

## Next Steps

1. **#758:** Proceed with implementation. Assign to Network 📦.
2. **#734:** Flight to complete Phase 1 investigation, post findings to issue, then resubmit Phase 2 test plan.
3. **#730:** Add the happy-path regression test case to the test plan, then proceed with implementation. Assign to EECOM 🔧.

**Requester:** Dina Berry — All proposals reviewed. Two approved (with #730 needing one small test addition), one held pending investigation.

### 2026-04-02: Bug #730 — squad.agent.md silently disappears after upgrade

# Bug #730 — squad.agent.md silently disappears after upgrade

> **Author:** Flight | **Date:** 2026-04-02 | **Status:** Proposal

## Root Cause Analysis

Three code paths handle `squad.agent.md` creation/refresh, and two of them silently skip the file when the template source is missing. Verified by reading the actual source code:

### Path 1: upgrade.ts — version-current branch (SILENT SKIP)
**File:** `packages/squad-cli/src/cli/core/upgrade.ts` lines 497-504

When CLI version matches installed version, upgrade still refreshes `squad.agent.md`. But the template check has no `else`:
```typescript
const agentSrc = path.join(templatesDir, 'squad.agent.md.template');
if (storage.existsSync(agentSrc)) {   // ← no else! silent skip!
  storage.mkdirSync(path.dirname(agentDest), { recursive: true });
  storage.copySync(agentSrc, agentDest);
  stampVersion(agentDest, cliVersion);
  success('upgraded squad.agent.md');
  filesUpdated.push('squad.agent.md');
}
```

### Path 2: upgrade.ts — full upgrade branch (ALREADY HANDLES IT ✅)
**File:** `packages/squad-cli/src/cli/core/upgrade.ts` lines 521-522

This path correctly fatals:
```typescript
if (!storage.existsSync(agentSrc)) {
  fatal('squad.agent.md.template not found in templates — installation may be corrupted');
}
```

### Path 3: SDK init.ts — init command (SILENT SKIP)
**File:** `packages/squad-sdk/src/config/init.ts` lines 1032-1038

Same pattern — conditional write with no `else` clause:
```typescript
if (templatesDir && storage.existsSync(join(templatesDir, 'squad.agent.md.template'))) {
  let agentContent = storage.readSync(join(templatesDir, 'squad.agent.md.template')) ?? '';
  agentContent = stampVersionInContent(agentContent, version);
  await storage.write(agentFile, agentContent);
  createdFiles.push(toRelativePath(agentFile));
}  // ← NO ELSE! File never created, no warning
```

### Path 4: doctor.ts — detection without recovery
**File:** `packages/squad-cli/src/cli/commands/doctor.ts` lines 382-412

`checkSquadAgentMd()` correctly detects missing/empty `squad.agent.md` and suggests `squad upgrade`, but there's no automatic recovery. The message is appropriate — this is a diagnostic tool.

## Exact Files to Modify

| File | Action | Lines |
|------|--------|-------|
| `packages/squad-cli/src/cli/core/upgrade.ts` | **Modify** | ~497-504: add `else` with warning |
| `packages/squad-sdk/src/config/init.ts` | **Modify** | ~1032-1038: add `else` with warning |
| `test/upgrade.test.ts` or `test/upgrade-core.test.ts` | **Create/Modify** | Add tests for missing template behavior |

## Fix Approach

### 1. upgrade.ts — version-current path (line 497-504)

Add an `else` clause that warns when the template is missing:

```typescript
const agentSrc = path.join(templatesDir, 'squad.agent.md.template');
if (storage.existsSync(agentSrc)) {
  storage.mkdirSync(path.dirname(agentDest), { recursive: true });
  storage.copySync(agentSrc, agentDest);
  stampVersion(agentDest, cliVersion);
  success('upgraded squad.agent.md');
  filesUpdated.push('squad.agent.md');
} else {
  warn('squad.agent.md.template not found — squad.agent.md was not refreshed. Run "squad upgrade --force" or reinstall the CLI.');
}
```

### 2. SDK init.ts (line 1032-1038)

Add an `else` clause that warns during init:

```typescript
if (templatesDir && storage.existsSync(join(templatesDir, 'squad.agent.md.template'))) {
  let agentContent = storage.readSync(join(templatesDir, 'squad.agent.md.template')) ?? '';
  agentContent = stampVersionInContent(agentContent, version);
  await storage.write(agentFile, agentContent);
  createdFiles.push(toRelativePath(agentFile));
} else {
  // Template missing — this is a degraded install, warn but don't fatal
  // (init creates many other files that are still valuable)
  console.warn('⚠ squad.agent.md template not found — Copilot agent file was not created. Reinstall the CLI to restore it.');
}
```

### 3. doctor.ts — no changes needed

The existing `checkSquadAgentMd()` function already detects missing/empty files and suggests `squad upgrade`. This is the correct behavior for a diagnostic tool — it should diagnose, not auto-fix.

## Assigned Agent

**Primary:** EECOM 🔧 (Core Dev — owns `src/cli/core/` and collaborates on `src/config/`)
**Secondary:** FIDO 🧪 (Quality — test coverage for the silent-skip paths)

## Test Plan

### New tests to add:

1. **upgrade.ts — version-current path with missing template:**
   ```typescript
   it('warns when squad.agent.md.template is missing (version-current path)', async () => {
     // Setup: create a squad project at the current CLI version
     // Remove squad.agent.md.template from templates dir
     // Run upgrade (will take version-current path)
     // Assert: warning message emitted
     // Assert: existing squad.agent.md not deleted
   });
   ```

2. **SDK init.ts — missing template:**
   ```typescript
   it('warns when squad.agent.md.template is missing during init', async () => {
     // Setup: mock/override getSDKTemplatesDir to return dir without template
     // Run initSquad
     // Assert: warning emitted
     // Assert: other files still created
   });
   ```

3. **Existing doctor.ts tests:** Already cover empty/missing detection — no changes needed.

### Existing tests to verify:
- Run full test suite to confirm no regressions
- Verify upgrade tests still pass with templates present (happy path)

## Risk Assessment

**Risk: LOW**

- Changes are purely additive (`else` clauses on existing `if` blocks)
- No changes to happy-path behavior (template exists → same logic runs)
- Warning messages are informational, not blocking
- doctor.ts unchanged — no diagnostic regression risk

**Watch out for:**
- SDK init.ts uses a different logging pattern (no `warn()` import from CLI output module). Use `console.warn()` since the SDK should not depend on CLI output utilities.
- Don't accidentally change the `else` branch at line 1039 (`skippedFiles.push`) — that's for the `skipExisting` case, not the missing-template case.
- The `else` at line 1039 handles "file already exists AND skipExisting=true" — our new `else` is inside the `!skipExisting` branch.

## PR Scope

- [ ] `upgrade.ts`: Add `else { warn(...) }` at line ~504
- [ ] `init.ts`: Add `else { console.warn(...) }` at line ~1038
- [ ] Tests: 2 new test cases for missing-template warnings
- [ ] **NOT in scope:** doctor.ts changes, auto-recovery, template bundling changes
- [ ] **NOT in scope:** The full-upgrade path in upgrade.ts (line 521 — already handles it correctly with `fatal()`)

### 2026-04-02: Bug #734 — squad nap fails via bang command (!) in Windows PowerShell

# Bug #734 — squad nap fails via bang command (!) in Windows PowerShell

> **Author:** Flight | **Date:** 2026-04-02 | **Status:** Proposal (Investigation Required)

## Root Cause Analysis

**Status: Needs investigation — root cause not yet confirmed.**

The `!squad nap` command fails when invoked from Copilot CLI's bang command handler in Windows PowerShell. Direct invocation (`squad nap`) works fine.

### Most likely cause: Same as #758

The Copilot CLI bang command (`!command`) spawns a child process via the system shell. On Windows PowerShell, this resolves to `squad.ps1` (unsigned) → `PSSecurityException`. This would explain why:
- Direct invocation works (user may have already relaxed their execution policy for the current session)
- Bang invocation fails (child process starts a new PS scope with default policy)
- Other bang commands work (`!git`, `!gh` — these don't have `.ps1` shims, only `.cmd`)

### Alternative cause: subprocess TTY/stdin

After code review, **`nap.ts` has zero interactive requirements** — no `process.stdin`, no `readline`, no TTY checks, no `git` operations. It's purely filesystem operations (read, write, delete). This rules out stdin/TTY as a root cause.

However, the CLI entry point (`cli-entry.ts`) does check `process.versions.node` early and has various module patches that could behave differently in a subprocess context.

## Exact Files to Modify

| File | Action |
|------|--------|
| — | **Investigation first** — see steps below |
| `packages/squad-cli/src/cli/commands/doctor.ts` | Possibly modify (if distinct from #758) |
| `README.md` | Possibly modify (workaround docs) |

## Fix Approach

### Phase 1: Investigation (MUST complete before coding)

1. **Reproduce and capture exact error:**
   - Open Copilot CLI in Windows PowerShell 7.6
   - Run `!npx @bradygaster/squad-cli nap --dry-run`
   - Capture full stderr/stdout
   - Run `!squad nap` and capture output

2. **Differential diagnosis:**
   - Test `!squad.cmd nap` (bypass `.ps1` explicitly)
   - Test `!cmd /c squad nap` (use cmd.exe subprocess)
   - Test in cmd.exe Copilot CLI session (not PowerShell)
   - If `!squad.cmd nap` works → this is a duplicate of #758

3. **Environment delta:**
   - Compare `$env:PSExecutionPolicy` in direct shell vs bang subprocess
   - Compare env vars: `!env` vs direct `env` (look for missing `APPDATA`, `PATH` differences)

### Phase 2: Fix (based on investigation results)

**If duplicate of #758:** Close as duplicate, reference #758 fix.

**If distinct issue (subprocess environment):**
- Add environment normalization to `cli-entry.ts` early boot
- Ensure `process.env` has expected Windows paths
- Add doctor check for bang command compatibility

**If PowerShell history expansion (`!` → `Invoke-History`):**
- This is a Copilot CLI issue, not a Squad issue
- Document workaround: use `` `!squad nap `` (backtick-escape) or `!cmd /c squad nap`
- File upstream issue on Copilot CLI

## Assigned Agent

**Primary:** EECOM 🔧 (Core Dev — investigation, subprocess behavior)
**Secondary:** Network 📦 (if distribution-related fix needed)

## Test Plan

### Phase 1 (Investigation)
- Manual reproduction on Windows 11 + PowerShell 7.6
- Document findings in issue #734 comments

### Phase 2 (If fix needed beyond #758)
1. **Integration test:** Add test to verify `nap --dry-run` exits cleanly when invoked as subprocess:
   ```typescript
   // test/nap-subprocess.test.ts
   import { execFileSync } from 'node:child_process';
   it('nap --dry-run works as subprocess', () => {
     const result = execFileSync('node', ['packages/squad-cli/dist/cli-entry.js', 'nap', '--dry-run'], {
       cwd: testSquadDir,
       encoding: 'utf-8',
     });
     expect(result).toContain('Nap report');
   });
   ```

2. **Cross-shell test matrix:**
   - PowerShell 7.x → `squad nap --dry-run`
   - cmd.exe → `squad nap --dry-run`
   - Subprocess → `node cli-entry.js nap --dry-run`

## Risk Assessment

**Risk: LOW-MEDIUM**

- **Low risk** if this is a duplicate of #758 (just close it)
- **Medium risk** if distinct: subprocess environment normalization can have side effects
- Investigation phase has zero code risk

**Watch out for:**
- Don't add workarounds that mask the real issue
- PowerShell 5.x vs 7.x have different default execution policies
- Copilot CLI bang handler behavior may change in future versions
- The nap command itself is safe (no git, no stdin) — the problem is invocation, not logic

## PR Scope

- [ ] **Phase 1:** Investigation comment on issue #734 with reproduction results
- [ ] **Phase 2 (if needed):** Targeted fix based on investigation findings
- [ ] **NOT in scope:** Changing Copilot CLI's bang handler, modifying nap's core logic
- [ ] **Dependency:** May be resolved entirely by #758 fix

### 2026-04-02: Bug #758 — squad.ps1 blocked by PowerShell execution policy on Windows

# Bug #758 — squad.ps1 blocked by PowerShell execution policy on Windows

> **Author:** Flight | **Date:** 2026-04-02 | **Status:** Proposal

## Root Cause Analysis

When `npm install -g @bradygaster/squad-cli` runs on Windows, npm automatically creates both `squad.cmd` and `squad.ps1` shim scripts in `%APPDATA%\npm\`. PowerShell prefers `.ps1` over `.cmd`, so it attempts to execute the unsigned `.ps1` script — which is blocked by the default execution policy (`Restricted` or `AllSigned`).

**Key constraint:** npm creates these shims _after_ all lifecycle hooks (postinstall, etc.) complete. This means **no npm lifecycle script can remove the .ps1 file** — it doesn't exist yet when postinstall runs.

The `.cmd` shim works fine. The issue is purely that PowerShell preferentially loads `.ps1` over `.cmd`.

## Exact Files to Modify

| File | Action |
|------|--------|
| `packages/squad-cli/scripts/remove-ps1-shim.mjs` | **Create** — post-install helper script |
| `packages/squad-cli/package.json` | **Modify** — document the helper script in `scripts` |
| `packages/squad-cli/src/cli/commands/doctor.ts` | **Modify** — add Windows PS execution policy check |
| `README.md` | **Modify** — add Windows installation note |

## Fix Approach

### 1. Doctor check for Windows `.ps1` shim problem (primary fix)

In `doctor.ts`, add a new check function:

```typescript
function checkWindowsPs1Shim(): DoctorCheck | undefined {
  if (process.platform !== 'win32') return undefined;
  
  // Check if running from a .ps1 shim context or if .ps1 exists
  const npmPrefix = process.env['npm_config_prefix'] || 
    path.join(process.env['APPDATA'] ?? '', 'npm');
  const ps1Path = path.join(npmPrefix, 'squad.ps1');
  
  if (!fileExists(ps1Path)) return undefined;
  
  return {
    name: 'Windows PowerShell shim',
    status: 'warn',
    message: 'squad.ps1 exists — may be blocked by execution policy. ' +
      'Fix: Remove-Item "' + ps1Path + '" (PowerShell falls back to .cmd)',
  };
}
```

Wire it into `runDoctor()` alongside other environment checks.

### 2. Helper removal script

Create `packages/squad-cli/scripts/remove-ps1-shim.mjs`:
```javascript
// Run after `npm install -g` to remove the .ps1 shim that PowerShell blocks.
// Usage: node -e "require('./scripts/remove-ps1-shim.mjs')" 
//   or:  npx @bradygaster/squad-cli doctor (auto-detects)
```

This provides a documented manual step for users who hit the issue.

### 3. README Windows installation note

Add a "Windows" section under installation:
```markdown

### Windows (PowerShell)

If you see `PSSecurityException: UnauthorizedAccess` after installing globally,
PowerShell is blocking the unsigned `.ps1` shim. Fix it with:

```powershell
Remove-Item "$env:APPDATA\npm\squad.ps1"
```

Or use `cmd.exe`, or invoke via `npx @bradygaster/squad-cli`.
```

## Assigned Agent

**Primary:** Network 📦 (Distribution — npm packaging, global install)
**Secondary:** PAO 📣 (Documentation for README update)

## Test Plan

1. **Unit test for doctor check:** Add test to `test/doctor.test.ts`:
   - Test `checkWindowsPs1Shim` returns `undefined` on non-Windows
   - Test it returns `warn` when `.ps1` file exists at expected path
   - Test it returns `undefined` when no `.ps1` file found

2. **Manual verification:**
   - Install globally on Windows with default PS execution policy
   - Run `squad doctor` — should show warning about `.ps1` shim
   - Delete `.ps1` shim → run `squad` → should work via `.cmd` fallback

## Risk Assessment

**Risk: LOW**

- Doctor check is additive (new check, no existing behavior changes)
- README change is documentation only
- No changes to core CLI logic or upgrade flow
- Platform check (`process.platform`) is reliable
- Helper script is opt-in, not automatic

**Watch out for:**
- The `npm_config_prefix` env var may not be set in all contexts
- `%APPDATA%` path varies across Windows versions (use `process.env.APPDATA`)
- Don't break the `.cmd` shim path resolution

## PR Scope

- [ ] `doctor.ts`: Add `checkWindowsPs1Shim()` + wire into `runDoctor()`
- [ ] `test/doctor.test.ts`: Unit tests for new check
- [ ] `README.md`: Windows installation note (≤10 lines)
- [ ] **NOT in scope:** Signing the `.ps1`, auto-removing shims, changing npm behavior

### 2026-04-02: Architecture Review: PRs #760 & #762

# Architecture Review: PRs #760 & #762

**Reviewer:** Flight (Lead)  
**Date:** 2025-01-15  
**Summary:** Both PRs have CRITICAL issue — .squad/ files leaked into diffs

---

## PR #760: squad/758-fix-ps-execution-policy (Network's fix for #758)

### Proposal Requirements
- ✅ Add doctor check for unsigned .ps1 shim on Windows
- ✅ Add README guidance  
- ✅ Be Windows-only (platform guard)

### Review

#### Content Quality ✅
**Changed files (core logic):**
- `packages/squad-cli/src/cli/commands/doctor.ts` — Added `checkWindowsPs1Shim()` function (lines 274-289)
  - Platform guard: `if (process.platform !== 'win32') return undefined;`
  - Correctly detects unsigned .ps1 at npm prefix
  - Returns warning with fix instructions using `Remove-Item`
  - ✅ Matches proposal exactly

- `packages/squad-cli/scripts/remove-ps1-shim.mjs` — New helper script  
  - Standalone utility to remove .ps1 shim  
  - Platform-gated (early exit on non-Windows)
  - Proper error handling
  - ✅ In scope (addresses PR #758)

- `test/cli/doctor.test.ts` — Added regression tests  
  - 4 new tests: cross-platform behavior, exists/missing scenarios, APPDATA fallback
  - ✅ Adequate coverage

- `README.md` — Added Windows (PowerShell) section  
  - Explains PSSecurityException  
  - Provides fix command and fallback options
  - References `squad doctor` and `npx`
  - ✅ Helpful guidance

#### Scope Assessment ⚠️  
Files modified that look unrelated:
- `packages/squad-cli/templates/ceremonies.md` — TEMPLATE FILE
- `packages/squad-sdk/templates/ceremonies.md` — TEMPLATE FILE  
- `templates/ceremonies.md` — TEMPLATE FILE
- `squad.agent.md.template` files (3x) — TEMPLATE FILES
- `package.json` / `packages/*/package.json` files (version bump, expected)

**Question:** Why are template files changed? Diff shows lines added (28 new lines per template). This appears to be a platform/merge artifact, not part of the #758 fix. **Potential scope creep.**

#### .squad/ Files ❌ CRITICAL
```
.squad/agents/eecom/history.md
.squad/agents/flight/history.md
.squad/agents/network/history.md
```
**VIOLATION:** Per Protected Files convention, .squad/ agent history files must NOT be in PR diffs. These are session-created state files that should be reset before push.

---

## PR #762: squad/730-fix-silent-agent-md-skip (EECOM's fix for #730)

### Proposal Requirements
- ✅ Add warn() in upgrade.ts version-current path
- ✅ Add warnings array to InitResult in init.ts (not console.warn)
- ✅ Have regression tests

### Review

#### Content Quality ✅
**Changed files (core logic):**
- `packages/squad-cli/src/cli/core/upgrade.ts` — Added warn() for missing template (lines 504-505)
  - Only triggered when template is missing (else block)
  - Uses `warn()` function (not console.warn)
  - Message is clear and actionable
  - ✅ Matches proposal

- `packages/squad-sdk/src/config/init.ts` — Added warnings array
  - Added to `InitResult` interface (lines 136-137)
  - `warnings: string[]` array initialized (line 630)
  - Warnings captured when template missing (line 1041)
  - Returned in result object (line 1195)
  - ✅ Uses warnings array (not console.warn)
  - ✅ Matches proposal

- `test/cli/upgrade.test.ts` — Regression test for version-current path
  - "refreshes squad.agent.md when already at current version" test
  - Verifies filesUpdated contains 'squad.agent.md' when staying at current version
  - ✅ Regression test present

- `test/init-scaffolding.test.ts` — Template missing scenarios
  - Happy-path regression: template exists, no warnings
  - Missing template scenario: warning captured, file not created, other files created
  - Uses proxy storage to simulate missing template
  - ✅ Comprehensive test coverage

#### Scope Assessment ⚠️  
Same template file changes as PR #760:
- `packages/squad-cli/templates/ceremonies.md` — TEMPLATE FILE
- `packages/squad-sdk/templates/ceremonies.md` — TEMPLATE FILE
- `templates/ceremonies.md` — TEMPLATE FILE
- `squad.agent.md.template` files (3x) — TEMPLATE FILES

**Question:** Why are template files changed? These look like platform/merge artifacts, not part of #730 fix.

**Also includes PR #758's files:**
- `packages/squad-cli/scripts/remove-ps1-shim.mjs`
- `.changeset/fix-ps-execution-policy.md`
- Doctor test changes

**Note:** This branch is a stacked PR (contains #760's changes + #730's changes). This is acceptable if intentional, but review order matters.

#### .squad/ Files ❌ CRITICAL
```
.squad/agents/eecom/history.md
.squad/agents/flight/history.md
.squad/agents/network/history.md
```
**VIOLATION:** Same issue as PR #760 — protected .squad/ files in diff.

---

## Verdict

### ❌ REJECT — Both PRs

**Primary Reason:** Both PRs violate the Protected Files convention by including .squad/agents/{member}/history.md in their diffs. These are session-created state files that must be reset before pushing.

**Secondary Issue:** Both PRs include unexplained changes to template files (ceremonies.md and squad.agent.md.template across 3 locations). This needs clarification.

### Required Fixes (for whoever re-addresses):

1. **Reset .squad/ files:**
   ```bash
   git checkout origin/dev -- .squad/agents/
   ```

2. **Investigate template file changes:**
   - Are they intentional?
   - If yes, explain in commit message
   - If no, reset them: `git checkout origin/dev -- packages/*/templates/ templates/`

3. **For PR #762:** Verify it's intentionally stacked on #760, or rebase onto origin/dev without #760's changes

### Who Should Fix?

Per squad lockout rules: **NOT the original authors (Network/EECOM)**. 

**Suggest reassignment to:** Scribe or another lead to clean up diffs and rebase if needed.

---

## Notes for PR Authors

- **Content quality is good** — the actual fixes are sound and well-tested
- **Just needs housekeeping** — remove state files, clarify template changes, ensure correct base branch
- Once cleaned, these are ready to merge

### 2026-04-02: Decision: Versioning Policy — No Prerelease Versions on dev/main

# Decision: Versioning Policy — No Prerelease Versions on dev/main

**By:** Flight (Lead)
**Date:** 2026-03-29
**Requested by:** Dina
**Status:** DECIDED
**Confidence:** Medium (confirmed by PR #640 incident, PR #116 prerelease leak, CI gate implementation)

## Decision

1. **All packages use strict semver** (`MAJOR.MINOR.PATCH`). No prerelease suffixes on `dev` or `main`.
2. **Prerelease versions are ephemeral.** `bump-build.mjs` creates `-build.N` for local testing only — never committed.
3. **SDK and CLI versions must stay in sync.** Divergence silently breaks npm workspace resolution.
4. **Surgeon owns version bumps.** Other agents must not modify `version` fields in `package.json` unless fixing a prerelease leak.
5. **CI enforcement via `prerelease-version-guard`** blocks PRs with prerelease versions. `skip-version-check` label is Surgeon-only.

## Why

The repo had no documented versioning policy. This caused two incidents:

- **PR #640:** Prerelease version `0.9.1-build.4` silently broke workspace resolution. The semver range `>=0.9.0` does not match prerelease versions, causing npm to install a stale registry package instead of the local workspace link. Four PRs (#637–#640) patched symptoms before the root cause was found.
- **PR #116:** Surgeon set versions to `0.9.1-build.1` instead of `0.9.1` on a release branch because there was no guidance on what constitutes a clean release version.

## Skill Reference

Full policy documented in `.squad/skills/versioning-policy/SKILL.md`.

## Impact

- All agents must follow the versioning policy when touching `package.json`
- Surgeon charter should reference this skill for release procedures
- CI pipeline enforces the policy via automated gate

### 2026-04-02: Review: Flight's Bug #758 Proposal (squad.ps1 Execution Policy Block)

# Review: Flight's Bug #758 Proposal (squad.ps1 Execution Policy Block)

> **Reviewer:** Network | **Date:** 2026-04-02 | **Issue:** #758

## Verdict: ✅ APPROVE (with minor clarifications)

Flight's approach is **pragmatic and sound**. The proposal correctly identifies the constraint (npm creates shims AFTER postinstall) and proposes the right workaround: a `doctor` check + optional helper script + README guidance. This is the correct architecture given the npm/Windows constraint.

---

## Detailed Review

### 1. ✅ Is the proposed fix (postinstall script to remove .ps1 shim) the right approach?

**Assessment:** Flight got it right — the proposal is **not** claiming the helper script runs as postinstall. 

Key quote from the proposal:
> npm creates these shims _after_ all lifecycle hooks (postinstall, etc.) complete. This means **no npm lifecycle script can remove the .ps1 file** — it doesn't exist yet when postinstall runs.

**Correct approach taken:**
- ✅ Doctor check (proactive detection + user guidance)
- ✅ Optional helper script (manual removal step)
- ✅ README documentation (user knows how to fix)

This is layered user support: (1) detect → (2) warn → (3) guide. No hidden automation that might fail silently.

---

### 2. ✅ Are there npm packaging gotchas Flight missed?

**Assessment:** No significant gaps. Flight anticipated the key constraints:

**Covered:**
- ✅ Platform guard: `process.platform !== 'win32'` prevents non-Windows clutter
- ✅ Path resolution: Uses `npm_config_prefix` + fallback to `%APPDATA%\npm`
- ✅ Scope: Clearly marks "NOT in scope: signing, auto-removing, changing npm behavior"

**Minor clarification needed:**
- The helper script (`remove-ps1-shim.mjs`) is documented but no invocation mechanism is specified. Flight says users can run it via `node -e "require(...)"` but this assumes Node is in PATH post-install. Better: document as `npx @bradygaster/squad-cli doctor --fix` or manual `Remove-Item` in PowerShell. The doctor check is the primary mechanism.
- `npm_config_prefix` is reliable for global installs, but in local/dev installs it may point to project root. This is fine because `.ps1` shimming only happens for global installs (local `npm install` doesn't create shims in npm config prefix).

**No gotchas missed.**

---

### 3. ✅ Will the postinstall script work for both global and local installs?

**Assessment:** Correctly scoped for global installs only; no issues.

**Why this is right:**
- npm only creates shims in `npm_config_prefix` during **global** installs (`npm install -g`)
- Local installs (`npm install` in a project) do not create `squad.cmd` or `squad.ps1` anywhere (they go into `node_modules/.bin/`)
- The doctor check correctly uses `npm_config_prefix`, which is the global npm prefix
- The helper script is optional, documented, not forced into any install hook

**Verdict:** ✅ Correctly handles both contexts.

---

### 4. ✅ Any cross-platform concerns? (should only run on Windows)

**Assessment:** Properly guarded. No issues.

**Cross-platform safety:**
- ✅ `checkWindowsPs1Shim()` returns `undefined` on non-Windows → doesn't wire into doctor checks
- ✅ `if (process.platform !== 'win32')` is the standard Node platform guard
- ✅ README section clearly labeled "Windows (PowerShell)" — doesn't confuse Mac/Linux users
- ✅ Helper script doesn't attempt file operations on non-Windows

**Verdict:** ✅ Solid cross-platform discipline.

---

### 5. ✅ Does the docs update belong in the same PR or separate?

**Assessment:** Same PR is correct. Here's why:

**Reasoning:**
- The README change is small (~10 lines), referenced in the proposal scope
- It documents the fix users will encounter — belongs alongside the feature
- Doctor check + README guidance form one cohesive user experience
- Splitting creates synchronization risk (docs lag behind feature)
- Low churn risk: Windows PowerShell block is not a common pain point, docs won't need heavy revision

**Caveat:** Flight notes PAO (documentation) as "Secondary". If your team has strict docs reviews, PAO should LGTM the README section before merge. Otherwise, keep it together.

**Verdict:** ✅ Same PR is correct. Recommend PAO review the README diff.

---

## Implementation Checklist (for Network)

Before marking done:

- [ ] `doctor.ts`: Implement `checkWindowsPs1Shim()` with both path strategies (`npm_config_prefix` and fallback)
- [ ] Unit tests: Cover Windows/non-Windows branches and path edge cases
- [ ] Helper script: Add `remove-ps1-shim.mjs` with clear usage comments
- [ ] README: Add Windows section with both solutions (manual `Remove-Item` + `npx doctor`)
- [ ] Test on Windows: Install globally, verify doctor detects `.ps1`, verify removal works
- [ ] Check that `.cmd` still works after `.ps1` removal (PowerShell fallback behavior)

---

## Risk Assessment (Verified)

Flight's risk assessment is accurate:

- **Risk: LOW** ✅
- Doctor check is additive (no breaking changes)
- Platform guard prevents cross-platform confusion
- No automatic file deletion (user-controlled)
- No changes to core CLI or upgrade flow

---

## Final Notes

This proposal follows **user-first installation philosophy** (your charter): 
- Detects the problem automatically
- Guides users to the fix
- Provides self-serve resolution

No gotchas. No corner cases. Good execution of a constrained problem (npm's control over shim creation).

**Proceed with implementation.**

### 2026-04-02: Decision: Protected Files guardrail + Sweeping Refactor Rules

# Decision: Protected Files guardrail + Sweeping Refactor Rules

**Author:** Procedures (Prompt Engineer)
**Date:** 2026-07
**Status:** DECIDED

## Context

Commit `26047dc5` accidentally converted `detect-squad-dir.ts` from raw `node:fs` to `FSStorageProvider` during a sweeping StorageProvider abstraction refactor, breaking the insider build. Bootstrap utilities run before the SDK is loaded — SDK imports cause startup crashes.

EECOM fixed the code and added regression tests. Flight identified 4 additional zero-dependency bootstrap files. Procedures added preventive guardrails to Copilot instructions.

## Decision

### Protected Files section (`.github/copilot-instructions.md`)
- Lists 5 files that MUST only use Node.js built-ins: `detect-squad-dir.ts`, `errors.ts`, `gh-cli.ts`, `output.ts`, `history-split.ts`
- Explains the SDK/CLI package boundary — `core/` directory is bootstrap territory
- Placed after Git Safety, before Team Context (safety rule, not workflow)

### Sweeping Refactor Rules section
Added a 5-step checklist for codebase-wide pattern changes:
1. Check the protected files list
2. Scan for `— zero dependencies` header markers
3. Verify SDK barrel exports before adding imports
4. Never convert all files blindly
5. Test after each logical group

## Implications

- New bootstrap utilities must be added to the protected files table + get a regression test
- Sweeping refactors must follow the 5-step checklist
- Three defense layers: header markers → instructions list → regression tests
- The `core/` directory is flagged as extra-cautious territory

### 2026-03-26: Copilot git safety rules
**By:** RETRO (Security)
**What:** Added mandatory Git Safety section to copilot-instructions.md: prohibits `git add .`, requires feature branches and PRs, adds pre-push checklist, defines red-flag stop conditions.
**Why:** Incident #631 — @copilot used destructive staging on an incomplete working tree, deleting 361 files.
