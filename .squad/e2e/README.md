# `.squad/e2e/` — End-to-End Test Procedures

**Owner:** Sims (E2E Test Engineer)
**Purpose:** Written, committed, re-runnable procedures for verifying the gh-aw / Squad integration against **existing** repositories. Fixture-side and new-repo/activation procedures are Booster's beat, not here.

## Files in this folder

| File | Kind | Status |
|---|---|---|
| `E1-merge-continuation-relay.md` | E-scenario procedure + evidence | ✅ Executed 2026-08-21 — 7 of 8 gates PASS, Rule D formalized post-run |
| `E4-agent-binding-verification.md` | E-scenario procedure + evidence | ✅ Executed 2026-08-21 — n=1 PASS; amended post-run for #1811 and #1812 (Phase 2 extended, Phase 3e added); re-run required for n=2 |
| `windows-test-baseline.md` | **Not an E-scenario** — Windows human-interpretation runbook | Reference document; interprets `npm test` output, does not run against gh-aw |
| `README.md` (this file) | Folder guide | — |

## Where E2 and E3 are — and why they aren't here

The E-series numbering is **chronological in the operator's head, not a coverage plan**. That produced a folder that reads as though E2 and E3 were promised and never delivered. They were not promised. What actually happened:

- **E2 (Rule D / epic closure).** E1's evidence table left Rule D as `NOT VERIFIED` because the `detection` job hung on `Install ripgrep` before closure could be observed. A note in E1 called this *"a future E2 experiment"*, which some readers reasonably interpreted as a scenario slot. In practice, Rule D shares E1's trigger — the same merge-continuation relay closing the same last leaf — so a separate E2 would either duplicate E1's setup or fabricate the closure state. **E2 was folded back into E1 as a formal gate (see the `Rule D — the gate and its escape hatch` section of `E1-merge-continuation-relay.md`).** There is no E2 procedure and there will not be one unless Rule D develops a trigger of its own.

- **E3 (long-path rehearsal).** E3 was a live rehearsal of the full 8-run `research → triage → plan program → plan implementation → plan validate → plan accept scope → plan accept implementation → plan activate` walk against the `aspiregregator-squad-e2e` fixture on 2026-08-21. It surfaced #1784 (the token-leak defect that became E4). **The rehearsal's evidence never landed in this folder** — it lived on the operator's disk and became the input for E4 rather than a committed procedure of its own. E3 references you see in `E4-agent-binding-verification.md` (e.g., *"E3 produced `lead, lead, devrel`"*) are citations to that rehearsal record, not to a file that exists here.

- **E5 and beyond.** No procedures are currently under authorship. The `#1787` sibling-epic refill scenario is documented as a `Follow-on` inside `E4-agent-binding-verification.md` rather than as a standalone `E5-…` file, because it is not unattended-safe and cannot share E4's execution budget. If it graduates to a first-class E-scenario in the future, it should get its own numbered file at that time.

## Rules of thumb for future E-scenarios

- **A procedure without a committed file has no procedure.** Rehearsal notes on someone's disk are not evidence. If it matters enough to run, it matters enough to commit.
- **Number by chronological authorship, not by pretending the numbering is a plan.** Gaps in the number sequence are honest information, not a claim of missing work — this file exists so future readers stop asking "where's E2?"
- **The status column in this file is the source of truth for what has been executed and when.** Do not let a scenario document drift from its own `Status:` header.
- **`windows-test-baseline.md` is intentionally here** despite not being an E-scenario. It sits with the E-scenarios because operators running E-scenarios need it. Its own header calls out that it is a human-interpretation runbook, not a procedure — do not let its file location seed the "so where are E2/E3/E5+?" question.

## Fixture

All E-scenarios currently target `bradygaster/aspiregregator-squad-e2e`. Fixture-refresh procedure is embedded in E4's Phase 0. Do not point an E-scenario at a different fixture without first documenting why the existing fixture cannot express the scenario — a bent fixture proves less than an honest gap.

## Related

- `.squad/decisions.md` — team decisions, including the fixture-fate decision (2026-08-20)
- `.squad/agents/sims/charter.md` — E2E ownership boundary (I don't own unit tests; that is FIDO's beat)
- Live issues that shape what runs next: #1784 (CLOSED), #1811, #1812, #1817
