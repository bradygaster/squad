# Ceremonies

> Team meetings that happen before or after work. Each squad configures their own.
>
> **Ceremonies are interrupts.** Every one of them pauses delivery, so each must have an
> objective trigger, a capped participant list, and an explicit stop condition. If a
> ceremony cannot state what would end it, it does not run.

## Design Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | See "Fires only when" below — all conditions are objective and checkable. |
| **Facilitator** | lead |
| **Participants** | Flight + the primary owner of each affected module, **max 3 total** |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Fires only when *any* of the following is true:**

- The change spans **3 or more modules with different primary owners** (per `routing.md`).
- The change modifies the public API surface: `packages/squad-sdk/src/index.ts`, or an
  exported signature in `builders/`, `roles/`, or `presets/`.
- The change introduces a breaking change or requires a migration guide.
- Flight or Brady explicitly asks for one.

**Does NOT fire for:** single-module changes, bug fixes with a known reproduction, test-only
changes, docs-only changes, dependency bumps, or two agents touching *different* modules in
the same wave.

**Agenda:**
1. Review the task and requirements
2. Agree on interfaces and contracts between components
3. Identify risks and edge cases
4. Assign action items — one named owner each

**Stop conditions — end the review and proceed:**
- Interfaces are agreed and action items have named owners.
- Two consecutive rounds produce no change to the proposed design.
- The scope narrows to a single module (the ceremony no longer applies — proceed directly).
- Disagreement persists after one round → Flight decides and the decision is recorded.
  No design review runs more than one round without a Flight ruling.

---

## Retrospective

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | after |
| **Condition** | See "Fires only when" below. Single failures do not trigger a retro. |
| **Facilitator** | lead |
| **Participants** | Flight + the agent whose change failed, **max 2 total** |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Fires only when *any* of the following is true:**

- The **same** check fails **twice consecutively** on the same PR after a fix attempt.
- A **substantive** reviewer rejection triggers the author lockout (per Flight's charter and
  `.copilot/skills/reviewer-protocol/SKILL.md` §Scope of Lockout). A nit fixed in the same PR
  is not a rejection and does not trigger this.
- A merged change is reverted.
- Brady asks for one.

**Does NOT fire for:** a first build or test failure, a lint failure, a flaky test that passes
on retry, or a failure the author has already diagnosed and is fixing.

**Agenda:**
1. What happened? (facts only)
2. Root cause analysis
3. What should change?
4. Action items for next iteration — one named owner each

**Stop conditions — end the retro:**
- A root cause is identified and one action item has a named owner.
- The cause is external (upstream outage, flaky infrastructure) — record and close.
- Two rounds produce no new facts → Flight records the open question and closes.
- No retro produces more than 3 action items; extra findings become issues, not follow-on
  ceremonies. Retros never spawn additional ceremonies.

---

## Adjusting These

Both ceremonies are reversible: widening a trigger is a one-line edit to its
"Fires only when" list. Disable either by setting **Enabled** to `❌ no` — no other file
needs to change.
