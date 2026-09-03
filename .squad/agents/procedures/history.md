# Procedures history

Summarized by Scribe on 2026-08-20T11:59:44-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/procedures/history-archive-2026-08-20T11-59-44-0700.md`.
Prior archives: `history-archive-2026-08-19T13-11-34.130-07-00.md`, `history-archive-2026-09-03T07-43-14.596-07-00.md` (2026-09-03 reskill).

## Core Context

- Model catalogs drift whenever the platform adds/removes models — search every model-referencing section (catalog, defaults, fallback chains), not just the list, before calling a refresh complete.
- Enforcement language must name ALL dispatch mechanisms (CLI `task`, VS Code `runSubagent`, etc.), not just one platform's tool — and should be reinforced at both the top and bottom of a long prompt, since LLM attention favors prompt boundaries over the middle.
- When a PR branch has accumulated dev merge commits, use `git rebase --onto dev <parent-of-first-PR-commit>` to replay only the PR's own commits and skip conflict noise.
- When trimming agent instructions, extract domain-specific reference content to skills (lazy-loaded on demand) and keep the main file as a routing/workflow document.
- Personal squad governance: `CONSULT_MODE: true` is the spawn signal; governance changes go to `decisions/inbox/` for Flight review.
- Spawn template pattern: every `task` tool spawn MUST include `name` set to the agent's lowercase cast name.
- Governance policies (error lockout, product isolation, peer quality check) and the "Squad Ships It" boundary heuristic: see `.squad/skills/governance-policies/SKILL.md`.
- Full narrative for the above (model catalog refresh #588, VS Code routing investigation + Fix1/Fix2 #613, PR #619 rebase, copilot-instructions.md trim #999): `.squad/agents/procedures/history-archive-2026-09-03T07-43-14.596-07-00.md`.

## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.

## 📌 Team update — 2026-08-20T13:20:20-07:00

Batch 2 complete. Shipped #1759 (cast name binding), structural contract for #1756, all 3 #1758 defects, and empty-dispatch guard in PR #1778. Key pattern: before deferring a fix as unverifiable, look for a spec the code should already conform to — `squad-planning-ontology.md:48-87` was that spec for #1758.3. Empty-probe failure uses `::warning::` annotation (not a comment) because there is no triggering issue to post to. PR #1778 green, awaiting Flight gate.

### 2026-08-20: Long-path lifecycle repairs (#1758, #1759, #1756)

Fixed three defects in `workflows/squad.md`, all gating the 2026-08-21 e2e series. Every touched stage was in Sims' "NEVER EXERCISED" bucket, so I anchored each fix in a readable source of truth rather than inference.

- **#1758.1 (dead-code routing):** `squad-plan-accept` Step 1 unconditionally hard-failed "No plan found" on a missing `plan` artifact, so the Behavior note's `program`/`implementation` routing could never run. Rewrote Step 1 as "Find Plan and Route": check `program`/`implementation` first → run Accept Scope → Accept Impl → Activate; only reply "No plan found" when none of `program`/`implementation`/`plan` exist.
- **#1758.2 (epics dispatched as tasks):** Implement mode found immediate children of root — Epics in a 3-level hierarchy — and dispatched implementation workers on them. Changed Step 1 + Epic Dispatch to descend the sub-issue hierarchy recursively and dispatch only **leaf tasks** (open issues with no open sub-issues). Kept the 3-slot cap and worker contract intact (I do NOT own `squad-implement-worker.md`).
- **#1758.3 (validate ordering):** PROVABLE, not speculative. The planning ontology (`shared/squad-planning-ontology.md:48-87`) is the authoritative state machine and sequences `program → implementation → validate → accept scope → accept implementation → activate`. `squad.md`'s `next=` hints had drifted (program→accept-scope, validate→accept-impl, accept-scope→implementation). Corrected all hints to match the ontology, so validate precedes BOTH accept steps.
- **#1759 (Role strings in Owner/Agent):** Added an explicit Owner/Agent binding rule (resolve to the `Name` column of `.squad/team.md`, never a Role string) at every emission site (squad-plan Step 1/Step 3, squad-plan-implementation Step 2/3/4) and made `squad:{owner}` label minting use the lowercased cast Name, forbidding `squad:lead`.
- **#1756 (char floor → structural contract):** Replaced the research artifact's `≥200-char` floor with a structural contract (required sections: Evidence table, Goals, Non-goals, Load-bearing assumptions, Open decisions, Acceptance framing; `Rn` traceability IDs; one citation token per evidence row) enforced via the MANDATORY verify step. Shipped ONLY the structural half — the "well-formatted bad plan should FAIL" taste-judgment (#1757) stays deferred.

Tests: `test/gh-aw-plan-lifecycle.test.ts` (23 assertions), incl. a role-leak detector that parses a plan's Owner column against team.md and flags Role strings (`lead`) while passing cast Names (`Procedures`). Build green; gh-aw-quality suite unaffected. No changeset (no `packages/*/src/` touched).

**Proposal filed:** `.squad/decisions/inbox/procedures-long-path-lifecycle-fix.md`

## 2026-08-22 — gh-aw triage team update

📌 Team update (2026-08-22T17:10:52-07:00): Procedures completed Tier 3 #1729 prompt-architecture triage: sequence #1730+#1731 → #1733 → #1734 → #1736, with #1735 optional. Tier 1 false-green work blocks #1734 and enforcement-facing #1736. Prompt budget remains under the 100 KB ceiling.

## 📌 Team update — 2026-08-22T19:42:25-07:00

Issue #1824 closed. Authored /squad parser hardening (PR #1832) with explicit NO_COMMAND → fail contract. Mutation tests proved load-bearing cases (indented command, mid-sentence). Mutation 2 proved status-only gates miss bad diagnostics.

FIDO's Pass 2 found BLOCKING dispatch regression (bare command:"implement" → NO_COMMAND → fail; pre-fix worked). Reviewer Rejection Protocol applied: Procedures locked out, EECOM revised. Commit 6e7628c5 added PC-0 normalization layer before PC-1. FIDO Pass 3 verified all mutations green.

> **Historical — process superseded.** The lockout was correct (the rejection was substantive), but
> review is now capped at **2 passes**: today the Pass-3 step would be a single Flight arbitration.
> See `.copilot/skills/reviewer-protocol/SKILL.md`.

**Lesson:** Mutation testing in isolation can miss callers. FIDO's first pass shared the same frame; the blind spot was enumeration of all parser call paths (command-dispatch path was unexercised in new suite).

PR #1832 merged; issue #1824 closed. Decision records merged to .squad/decisions.md.

## 📌 Team update — 2026-08-22T21:20:17-07:00

**#1812 — Roster provenance fix shipped.** Implemented Team Guard Step TG-2 in `workflows/squad.md`: reads git-committed HEAD `.squad/team.md`, finds `Name` column by header, emits `ROSTER_MEMBER: {name}` per row (lowercased) or `ROSTER_UNREADABLE: {reason}`. All five minting/binding sites rewired to TG-2's certified stdout — provenance true by construction, not prose. 7 mutations (M1–M7) proven RED and naming input. 172 tests passed / 13 skipped. PR #1837 +531/−61 across 3 files, squash-merged as `4b32f7be`.

FIDO adversarial review: APPROVE WITH NITS. Found L1117 nit (Step 3 validator still named `.squad/team.md`). Fixed in follow-up commit `ab8649e3` — validator now TG-2-bound, consistent with L1111 and Check 10. Issue #1812 auto-closed.

Decision record merged to `.squad/decisions.md`.