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

## Retrospective (Weekly)

| Field | Value |
|-------|-------|
| **Trigger** | scheduled |
| **Schedule** | Every Friday at 14:00 UTC |
| **Fallback** | First Ralph round after missed Friday (if >7 days since last retro) |
| **Facilitator** | lead |
| **Participants** | all active agents |
| **Output** | `.squad/log/{timestamp}-retrospective.md` |
| **Decisions** | `.squad/decisions/inbox/{lead-name}-retro-decisions.md` |
| **Enabled** | ✅ yes (Ralph-enforced — retro runs before any other work when overdue) |

**Agenda:**
1. Scan orchestration logs since last retro
2. Review closed issues and PRs from the week
3. Review decisions made and their outcomes
4. Identify patterns: what worked, what slowed the team
5. Produce concrete action items with owners
6. Create GitHub Issues for each action item (not markdown — proven tracking method)

**Why GitHub Issues, not markdown checkboxes:**
Markdown checkboxes have ~0% completion rate without enforcement. GitHub Issues have labels, assignees, and close-on-merge hooks. Label action items with `retro-action` for tracking.

**Ralph enforcement:**
Ralph checks at every work-check cycle whether a weekly retrospective is overdue. If `Test-RetroOverdue` returns true, the retro ceremony runs before any other work is dispatched. See `ralph-reference.md` for the enforcement implementation.

**Deep retro template** (for thorough reviews):
- Scan `.squad/orchestration-log/` and `.squad/log/` since last retro
- List closed issues and merged PRs from the week
- Review `.squad/decisions/` for new entries and their outcomes
- Produce: velocity analysis, agent effectiveness, decision quality assessment
- Identify process improvements and schedule them as GitHub Issues

---

## Model Review

| Field | Value |
|-------|-------|
| **Trigger** | scheduled or event-driven |
| **When** | quarterly, or when major model releases are announced |
| **Facilitator** | lead |
| **Participants** | lead, affected agents |
| **Time budget** | focused |
| **Enabled** | ✅ yes |

**Agenda:**
1. Review new model announcements
2. Benchmark new models against current agent assignments
3. Evaluate cost vs quality tradeoffs per agent
4. Recommend model changes where better options exist
5. Document decisions in `.squad/decisions/inbox/`

**Frequency:**
- **Quarterly:** Scheduled review of the model landscape
- **Ad-hoc:** When a major model release occurs (e.g., a new frontier model drops)

**Process:**
1. Use `.squad/templates/model-evaluation.md` (if present) for structured analysis
2. Record baseline: current agent/model assignments, costs, quality observations
3. Test candidate models on representative agent tasks
4. Compare: quality, speed, cost, capability fit
5. Document decisions and update agent charters where model changes are approved