# Ceremonies

> Team meetings that happen before or after work. Each squad configures their own.

## Design Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | multi-agent task involving 2+ agents modifying shared systems |
| **Facilitator** | lead |
| **Participants** | all-relevant |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Review the task and requirements
2. Agree on interfaces and contracts between components
3. Identify risks and edge cases
4. Assign action items

---

## Retrospective

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | after |
| **Condition** | build failure, test failure, or reviewer rejection |
| **Facilitator** | lead |
| **Participants** | all-involved |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. What happened? (facts only)
2. Root cause analysis
3. What should change?
4. Action items for next iteration

---

## Pre-Ship Fact Check

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | finalizing a user-facing artifact (release notes, blog post, README change, public-facing decision, PR description with external claims) |
| **Facilitator** | fact-checker |
| **Participants** | fact-checker (sole reviewer); originating agent provides claims under review |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Enumerate every factual claim in the artifact (numbered list)
2. For each: restate, cite source, run counter-hypothesis, verdict
3. Block ship on any 🧪 Needs-test or ❌ Refuted verdict — fix or retract
4. Persist verdict trail in the artifact's PR/decision thread
