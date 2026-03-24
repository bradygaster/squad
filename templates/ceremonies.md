# Ceremonies

> Team meetings that happen before or after work. Each squad configures their own.

## Pre-Decision Challenge

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | architecture decision, infrastructure change, or research output with numeric claims |
| **Facilitator** | challenger |
| **Participants** | proposing-agent, challenger |
| **Time budget** | focused |
| **Enabled** | yes |

**Agenda:**
1. Challenger reviews all factual claims in the proposal
2. Produces per-claim verdict table (Verified / Unverified / Contradicted)
3. Contradicted claims must be corrected before the decision proceeds
4. Unverified claims are flagged and accepted at the team's risk tolerance

See templates/challenger.md for the full Challenger agent template.

---

## Design Review

| Field | Value |
|-------|-------|
| **Trigger** | auto |
| **When** | before |
| **Condition** | multi-agent task involving 2+ agents modifying shared systems |
| **Facilitator** | lead |
| **Participants** | all-relevant |
| **Time budget** | focused |
| **Enabled** | yes |

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
| **Enabled** | yes |

**Agenda:**
1. What happened? (facts only)
2. Root cause analysis
3. What should change?
4. Action items for next iteration