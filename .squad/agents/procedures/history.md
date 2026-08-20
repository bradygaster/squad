# Procedures history

Summarized by Scribe on 2026-08-20T11:59:44-07:00 because this history exceeded 15KB.
Full pre-summary history archived at `.squad/agents/procedures/history-archive-2026-08-20T11-59-44-0700.md`.
Prior archive at `.squad/agents/procedures/history-archive-2026-08-19T13-11-34.130-07-00.md`.

## Condensed index

- **Deterministic skill pattern:** Skills must have explicit SCOPE and AGENT WORKFLOW (deterministic steps + STOP condition). Same input → same output, every time. No ambiguity.
- **Three governance policies (2026-03-15):** Agent Error Lockout (2 errors → reassign), Product Isolation Rule (tests/CI never depend on squad names), Peer Quality Check (run tests before finishing). Applied to all charters.
- **Team-wide reskill (2026-03-16):** 17.4% size reduction — NEVER/ALWAYS compress to single-paragraph summaries.
- **Personal squad governance:** `CONSULT_MODE: true` as spawn signal. Governance changes go to `decisions/inbox/` for Flight review.
- **VS Code routing fix (2026-07):** Fix 1 + Fix 2 shipped. CRITICAL RULE rewritten to dispatcher-identity framing. Routing Enforcement Reminder added as final section.
- **PR #619 rebase pattern:** When PR has accumulated dev merge commits, use `git rebase --onto dev <parent-of-first-PR-commit>` to cherry-pick only relevant commits.
- **Trim copilot-instructions.md (#999):** 1300w/9KB → 397w/3KB. Extract domain-specific reference to skills (lazy-loaded); main instructions = routing/workflow only.
- **Model catalog refresh (#588, 2026-03-25):** default model → `claude-sonnet-4.6`; specialist → `gpt-5.3-codex`; added `gpt-5.4`, `gpt-5.4-mini`, `claude-opus-4.6-1m`; removed stale models. All 5 squad.agent.md copies synchronized.
- **Spawn template pattern:** Every `task` tool spawn MUST include `name` set to the agent's lowercase cast name. `description` is human-readable summary; `name` is the agent ID.

## Recent preserved tail — gh-aw pre-E2E triage (2026-08-20)

Audited 4 gh-aw issues (#1759, #1756, #1757, #1608) against `workflows/squad.md`.

- **#1759 — SHIP-NOW.** Live bug confirmed. `squad-plan` Step 3 (L637) and `squad-plan-implementation` (L851/L863) emit Owner/Agent columns with no rule binding them to cast names. Fix = explicit "Owner/Agent MUST be a cast name from `.squad/team.md`" in both skills. Breaks `squad:{owner}` label at L670.
- **#1756 — SHARPEN, ship structural contract.** Ship emitted-artifact required-sections contract (evidence table, goals/non-goals, load-bearing assumptions, open decisions, traceability IDs R1..Rn). Defer insight-quality tuning to E2E-informed.
- **#1757 — DEFER (wave:4).** "Catches a bad plan" is taste-based; needs golden corpus; E2E should inform.
- **#1608 — DEFER (wave:3).** p2 outer-coordinator integration, off critical path.
- **Lesson:** For quality-of-output issues, split the verifiable structural contract (ship) from subjective judgment (E2E-informed). Never write success criteria as "works correctly."

## 📌 Team update — 2026-08-20T11:59:44-07:00

gh-aw workstream triage complete (7-agent read-only pass). Reconciled outcome: CLOSE 7 issues (#1738,#1762,#1764,#1768,#1763,#1604,#1609); SHIP-NOW 5 (#1772,#1758,#1759,#1732-compile,#1761); 2 contested (#1730,#1756); 12 deferred. Both P0s (#1772,#1758) still real — structural defects unresolved. Wave:1 cap=6. Tomorrow is a full-day E2E series against aspiregregator-squad-e2e. E2E will break at S3 if #1772 is not fixed first.

## 📌 Team update — 2026-08-20T13:20:20-07:00

Batch 2 complete. Shipped #1759 (cast name binding), structural contract for #1756, all 3 #1758 defects, and empty-dispatch guard in PR #1778. Key pattern: before deferring a fix as unverifiable, look for a spec the code should already conform to — `squad-planning-ontology.md:48-87` was that spec for #1758.3. Empty-probe failure uses `::warning::` annotation (not a comment) because there is no triggering issue to post to. PR #1778 green, awaiting Flight gate.

