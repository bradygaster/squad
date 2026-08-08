# Aspiregregator Fixture — Assertions

Machine-checkable assertions for validating the planning lifecycle fixture.
A test harness should verify ALL assertions pass against the fixture files.

## Marker Presence

- [ ] `research-output.md` contains exactly one `<!-- squad-research-v1 -->` marker
- [ ] `triage-output.md` contains exactly one `<!-- squad-triage-v1 -->` marker
- [ ] `program-plan-output.md` contains exactly one `<!-- squad-program-v1 -->` marker
- [ ] `implementation-plan-output.md` contains exactly one `<!-- squad-implementation-v1 -->` marker
- [ ] `validation-output.md` contains exactly one `<!-- squad-validation-v1 -->` marker
- [ ] `acceptance-outputs.md` contains exactly one `<!-- squad-scope-accepted-v1 -->` marker
- [ ] `acceptance-outputs.md` contains exactly one `<!-- squad-impl-accepted-v1 -->` marker
- [ ] `acceptance-outputs.md` contains exactly one `<!-- squad-activated-v1 -->` marker
- [ ] `lifecycle-state.md` contains exactly one `<!-- squad-lifecycle-state -->` marker

## Marker Ordering (Lifecycle Sequence)

- [ ] Research marker precedes Triage marker (by file creation order or embedded timestamps)
- [ ] Triage marker precedes Program Plan marker
- [ ] Program Plan marker precedes Implementation Plan marker
- [ ] Implementation Plan marker precedes Validation marker
- [ ] Validation marker precedes Scope Accepted marker
- [ ] Scope Accepted marker precedes Impl Accepted marker
- [ ] Impl Accepted marker precedes Activated marker
- [ ] Lifecycle state shows all phases as `✅ Done` with monotonically increasing timestamps

## Traceability — No Orphaned Triage Items

- [ ] Every work item in `triage-output.md` "Work Items" table maps to at least one epic in `program-plan-output.md`
- [ ] No triage work item is absent from the program plan (zero orphans)
- [ ] Excluded items from triage do NOT appear in program plan scope

## Traceability — All Tasks Trace to Program Items

- [ ] Every task in `implementation-plan-output.md` has a valid "Epic" reference
- [ ] Every referenced epic exists in `program-plan-output.md`
- [ ] Every epic in the program plan has at least one task in the implementation plan

## Dependency Graph is Acyclic

- [ ] Parse "Depends On" column from implementation plan tasks table
- [ ] Construct directed graph: edge from dependency → dependent
- [ ] Topological sort succeeds (no cycles detected)
- [ ] No task depends on itself (no self-loops)
- [ ] All referenced task numbers exist in the tasks table

## Sizing Validity

- [ ] All task sizes are one of: XS, S, M, L, XL
- [ ] No task size exceeds L (max allowed by default policy: `max_task_size: "L"`)
- [ ] Size distribution is reasonable (not all same size)

## Issue Count Within Policy Limits

- [ ] Total task count ≤ 20 (`max_issues` in default policy)
- [ ] Total milestone count ≤ 5 (`max_milestones` in default policy)
- [ ] Total epic count ≤ 10 (`max_epics` in default policy)
- [ ] Tasks per epic ≤ 8 (`max_tasks_per_epic` in default policy)

## Milestones Referenced Correctly

- [ ] Every milestone in `implementation-plan-output.md` "GitHub Mapping" exists in `program-plan-output.md` "Milestone Map"
- [ ] Every epic is assigned to exactly one milestone
- [ ] Every milestone has at least one epic assigned
- [ ] Milestone ordering is consistent (M1 tasks have no cross-milestone dependencies from M2/M3)

## Validation Result Integrity

- [ ] Validation result is `✅ PASS`
- [ ] All check rows in the validation table show `✅` status
- [ ] No `❌` status appears in any check row
- [ ] Policy compliance table shows all limits satisfied

## Acceptance Record Completeness

- [ ] Scope acceptance includes: plan version reference, accepted-by user, ISO date
- [ ] Impl acceptance includes: plan version reference, validation result reference, accepted-by user, ISO date
- [ ] Activation record includes: issue count, milestone list, agent list, issues table
- [ ] Activation issues table has one row per implementation plan task
- [ ] Activation issue count matches implementation plan task count (14)

## Lifecycle State Consistency

- [ ] All nine phases present in lifecycle state table
- [ ] All phases show `✅ Done` status (no pending/failed/skipped)
- [ ] Current state is `Activated`
- [ ] Last command references `/squad plan activate`
- [ ] All timestamps are valid ISO 8601 format
- [ ] Timestamps are monotonically non-decreasing across phases

## Schema Compliance

- [ ] Research output contains: Summary, Sources table, Findings sections, Open Questions, Recommendations
- [ ] Triage output contains: Work Items table, Decisions Needed table, Excluded table, Triage Summary
- [ ] Program plan contains: Initiatives with Epics, Milestone Map, User Stories, Dependencies, Scope Boundary
- [ ] Implementation plan contains: Tasks table, Sizing key, Rollout Order, Risk Register, GitHub Mapping
- [ ] Validation output contains: Result line, Checks table, Policy Compliance section
