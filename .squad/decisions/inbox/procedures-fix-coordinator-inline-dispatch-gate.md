# Decision: Restore always-on coordinator inline-dispatch gate (v0.10.0 regression)

- **Author:** Procedures (Prompt Engineer)
- **Date:** 2026-06-24
- **Requested by:** Tamir Dresher
- **Branch:** squad/fix-coordinator-inline-dispatch-gate (worktree)
- **Status:** Proposed — applied in working tree, awaiting Lead (Flight) review; NOT committed.

## Context

Matthew Wan reported the main Squad coordinator "does a lot of work on its own instead of using his roster of agents." Worked in v0.9.4, broke in v0.10.0. Dina Berry worked around it by hand-editing the coordinator charter.

## Root cause

Commit `afe78188` (#1035, "context overflow sentinel + coordinator size reduction") cut the coordinator template and moved the concrete inline-dispatch gate and dispatch mechanics out of the always-on prompt into lazy-loaded reference files (`client-compatibility-reference.md`, `spawn-reference.md`). The leftover inline guidance ("inline work is last-resort fallback only") was too soft to hold the line, so the coordinator began executing domain work itself.

## Decision

Re-establish a strong, **always-on** dispatch gate without breaking the legitimate Direct/Lightweight response modes or the size-reduction spirit. Three minimal edits (~14 lines) to the canonical template `.squad-templates/squad.agent.md`, propagated to all 5 synced copies via `npm run sync-templates`:

1. **Inline-dispatch gate** (Client Compatibility): inline permitted ONLY in Direct Mode, or when NEITHER `task` NOR `runSubagent` exists; otherwise MUST dispatch.
2. **STOP gate** (How to Spawn an Agent): about to emit a domain artifact with no spawn call this turn → STOP and dispatch (exceptions: Direct Mode / no spawn tool).
3. **VS Code `runSubagent` micro-playbook** re-inlined (~5 lines) so how-to-dispatch is always-on.

## The 5 synced copies (canonical first)

1. `.squad-templates/squad.agent.md` (canonical — edited here)
2. `templates/squad.agent.md.template`
3. `.github/agents/squad.agent.md`
4. `packages/squad-cli/templates/squad.agent.md.template`
5. `packages/squad-sdk/templates/squad.agent.md.template`

## Validation

- New regression/parity test `test/coordinator-inline-dispatch-gate.test.ts` (deterministic, subprocess-free): RED before (8/8 fail), GREEN after (8/8 pass).
- Full `npm run test`: 18 failed files vs 31 baseline (fewer); all failures are pre-existing flaky subprocess/timeout e2e tests (3 of 4 "new vs baseline" pass in isolation; the 4th is `squad doctor` at 40x10 exiting null = timeout, unrelated to template content). No new deterministic failures.
- `npm run lint` (tsc noEmit both packages): clean.

## Changeset

Required. The `changelog-gate` regex governs `.squad-templates/`, `templates/`, and `packages/squad-(sdk|cli)/templates/` — not just `src/`. Added `.changeset/fix-coordinator-inline-dispatch-gate.md` (patch, squad-cli + squad-sdk).

## Rollout

Existing installs require `squad upgrade` to pick up the regenerated coordinator agent.
