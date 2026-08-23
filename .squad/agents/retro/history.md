# RETRO

> Retrofire Officer

## Learnings

### Issue Triage (2026-03-22T06:44:01Z)

**Flight triaged 6 unlabeled issues and filed 1 new issue.**

RETRO assigned:
- **#479 (history-shadow race condition)** → squad:eecom + squad:retro (production bug; mitigation through StorageProvider atomicity)

Pattern: Critical production bug identified. Race condition in history-shadow requires atomicity guarantees from StorageProvider abstraction (CONTROL/EECOM).

📌 **Team update (2026-03-22T06:44:01Z):** Flight issued comprehensive triage. RETRO owns #479 mitigation strategy. Production bug severity high; blocks stable history-shadow operation. Depends on StorageProvider PRD completion (#481). Coordinated rollout required.

---

### Security scanner false-positive fix (2026-07-29T17:11:56+10:00)

Diagnosed and fixed a false positive in `scripts/security-review.mjs` that was blocking PR #1558 (squad state-sync — Scribe memory consolidation).

**Root cause:** The `unsafe-git` check (check #4) scanned ALL changed files in the PR diff with no file-type filter. When Scribe merged `.squad/decisions/inbox/` entries into `.squad/decisions.md`, a historical entry documenting the broad repo-root staging prohibition surfaced as new `+` lines. The scanner pattern-matched the literal string inside backtick prose and fired an error. The inbox was gitignored — that's why the same content never tripped the scanner before.

**Fix:** Added `UNSAFE_GIT_EXCLUDED_PATHS` list to skip append-only log files: `.squad/decisions.md`, `.squad/agents/*/history.md`, `.squad/log/**`, `.squad/orchestration-log/**`. Instruction surfaces (copilot-instructions.md, charter files, team.md, routing.md) are deliberately kept in scope.

**Verified locally:** (a) scanner returns zero findings on the state-sync PR diff; (b) a probe file `scripts/__scan-probe.sh` with bare repo-root staging and force-push commands was caught by two errors. Probe deleted after test.

**Latent false positives found:**
- `.github/copilot-instructions.md` line 21 contains broad staging / commit-all command examples in a prohibition list — would be flagged if that file changes. Kept in scope intentionally (instruction surface). Acceptable noise on future edits.
- `.squad/agents/scribe/charter.md` has a scoped dot-prefixed add command — the regex `/git\s+add\s+\./` also matches scoped paths starting with `.`. Not fixed here; that's a pattern-precision issue separate from this scoping bug.
- `.squad/templates/issue-lifecycle.md` has a repo-root staging example in a code fence. Kept in scope (template = instruction surface).
- `.squad/log/` and `.squad/orchestration-log/` files have the patterns but are gitignored — will never appear in PR diffs. No action needed.

Decision filed in inbox: `retro-scanner-log-exclusion.md`.

---

### PR #1559 — unsafe-git scanner: fix nested agent history exclusion (2026-07-29T19:25:08+10:00)

Fixed a false-positive regression in PR #1559 (`squad/fix-security-scanner-prose-fp`). The original exclusion regex `/^\.squad\/agents\/[^\/]+\/history\.md$/` used `[^/]+` (exactly one path segment), which failed to exclude alumni paths such as `.squad/agents/_alumni/kobayashi/history.md`.

**Fix:** Changed to `.+` — matches one or more characters including `/`, covering any nesting depth while still anchoring on the literal filename `history.md`. Charters and other instruction surfaces are unchanged (still scanned).

**Verified:**
- `.squad/agents/retro/history.md` → excluded ✅
- `.squad/agents/_alumni/kobayashi/history.md` → excluded ✅ (was broken)
- `.squad/agents/retro/charter.md` → still scanned ✅
- Probe `scripts/__scan-probe.sh` (containing repo-root staging + force-push forms) → 2 errors detected ✅; probe deleted, no trace in commit.
- PR #1558 diff (`squad/state-sync-2026-07-29`) — scanner returned no findings after fix.

**Known follow-up (not fixed here):** `/git\s+add\s+\./` also matches safe scoped dot-prefixed add commands. Separate issue documented in PR body.

## 📌 Team update — 2026-08-22T19:42:25-07:00

Authored normative security contract for PR #1832 (/squad shell input channel). Threat model: GitHub event text fully attacker-controlled. Mandatory channel: env variables + quoted parameter expansion.

Measured 8 hostile payloads through environment channel (result: injection-safe). Demonstrated direct-interpolation anti-pattern (RCE). Documented forbidden patterns: untrusted command strings, printf format-slot usage, awk program interpolation, awk -v mutation.

Hop-1 (GitHub Actions template → shell) implementation is LLM discretion; no compiled gh-aw output exists in this repo to verify. Gate verification deferred to #1834.

Decision record merged to .squad/decisions.md.