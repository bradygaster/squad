# Eecom history

Summarized by Scribe on 2026-08-20T11:59:44-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/eecom/history-archive-2026-08-20T11-59-44-0700.md`.
Prior archive at `.squad/agents/eecom/history-archive-2026-08-19T13-11-34.130-07-00.md`.
## 2026-08-20 — #1772 dispatch probe gate fix

- Root cause confirmed: dispatch-workflow: max: 1 causes first-wins semantics; LLM empty probe consumes slot; real dispatch silently dropped.
- Prior fix #1766 (prompt wording) confirmed insufficient via live run evidence.
- Fix: raised max to 2 (squad-implement-worker.md) + extended check-workflow-input-interpolation.mjs with checkDispatchWorkflowSchemas() static gate.
- Static gate validates JSON dispatch examples adjacent to dispatch_workflow references: requires non-empty workflow_name, non-empty inputs, inputs.issue_number.
- Added 6 new tests in test/gh-aw-quality.test.ts; key structural test fails against max:1 state, passes after fix.
- Build passes. Decision recorded at .squad/decisions/inbox/eecom-1772-dispatch-probe-gate.md.
- Coordination needed: Procedures to add squad.md empty-command guard (separate PR).

Summarized by Scribe on 2026-08-19T13:11:34.130-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/eecom/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- Replaced all hardcoded "Brady" in template examples with generic `{user}`/`{name}` placeholders. Canonical sources: `.squad-templates/squad.agent.md` and `.copilot/skills/init-mode/SKILL.md`.
- PR #942 rebase: cherry-pick from insider-based fork branch; expect modify/delete conflicts for insider-only files. Opened #963 as clean replacement.
- `archiveDecisions()` count-based fallback (#626): when `old.length === 0` and file > 20KB, sort dated entries by age, keep entries under threshold, archive the rest. Undated entries always preserved.
- Cross-platform filename & config fixes (#348, #356): `safeTimestamp()` everywhere; removed machine-specific `teamRoot` from config.json.
- PR #480 history race condition: three-layer defense — async mutex, atomic file operations (write-then-rename), 14 tests.
- PR #486 SIGINT handling: parent handler + child process cleanup (kill children, close handles, flush buffers). 22 tests.
- Economy mode (#500): `ECONOMY_MODEL_MAP` + `resolveModel()` with economy flag. Layer 3/4 modifier only; Layers 0-2 (explicit user preferences) never downgraded. 34 tests.
- node:sqlite hard-fail fix (#502): synchronous version check + `process.exit(1)`; `engines.node` corrected to `>=22.5.0`. 5 tests.
- Rate limit recovery UX (#464): `rateLimitGuidance()` with 3 recovery options; `.squad/rate-limit-status.json`; `checkRateLimitStatus()` in doctor. 36 tests.
- Personal squad init (#576): `ensurePersonalSquadDir()` idempotent helper. `init --global` calls it; `personal.ts` reuses it.

## Recent preserved tail — P0 Triage (2026-08-20)

Performed read-only triage of 10 open gh-aw issues for Brady's pre-E2E pass.

- **#1772 (P0) — STILL REAL.** Commit b6804305 added prompt wording; structural defect at `squad-implement-worker.md:204` (`dispatch-workflow max: 1`) untouched. Fix must be structural — extend `scripts/check-workflow-input-interpolation.mjs` or add runtime rejection for empty dispatch payloads.
- **#1758 (P0) — STILL REAL, all 3 defects.** (1) squad-plan-accept Step 1 at L654 hardcodes plan artifact lookup (L648 behavior note is prose only). (2) Epic Dispatch at L529-554 dispatches Epics in 3-level tree. (3) Validate at L867 is after accept-scope. Wave:3 (depends on #1759); code work now, live E2E proof after #1772 fixed.
- **#1730, #1731** — well-specified. Ship for review-gate path (contested with Flight's wave:1 cap).
- **#1604, #1609** — CLOSE. Scope sprawl relative to core E2E correctness goal.
- **#1733, #1735, #1605, #1606, #1731** — DEFER.

Decision record: `decisions/inbox/eecom-p0-triage-2026-08-20.md` → merged.

## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.

## 📌 Team update — 2026-08-20T13:20:20-07:00

Batch 2 complete. Fixed #1772 (P0): `max: 1` → `max: 2` in squad-implement-worker.md + `checkDispatchWorkflowSchemas()` static gate + 6 tests. All tests verified to fail against pre-fix state. CI run 32410579973 confirms gate active. PR #1777 green, awaiting Flight gate. `max: 2` is the worker's outbound budget; Procedures' guard is squad.md's inbound validation — complementary layers.

