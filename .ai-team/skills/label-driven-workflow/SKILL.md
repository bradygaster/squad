---
name: "label-driven-workflow"
description: "Patterns for using GitHub labels as a state machine, routing table, and automation API"
domain: "platform-integration"
confidence: "medium"
source: "Proposal 032c design, slidemaker reference implementation, Brady's directive"
author: "Verbal"
---

## Context
When Squad manages work through GitHub Issues, labels serve three roles simultaneously: state machine (status lifecycle), routing table (agent assignment), and automation trigger (Actions workflows). This skill documents the patterns for any agent or coordinator participating in label-driven workflows.

## Patterns

### Labels Are Label Swaps, Not Accumulations
Status transitions remove the old label and apply the new one. An issue never has two status labels. Implementation: `gh issue edit {n} --remove-label "status:draft" --add-label "status:reviewing"`. This prevents ambiguous states.

### Namespace Convention
All Squad labels use `namespace:value` format with colon separator. Namespaces: `status:`, `type:`, `priority:`, `squad:`, `era:`. Machine-parseable via `split(':')`. Prevents collision with existing project labels.

### Mutual Exclusion Groups
Within each namespace group, at most one label applies:
- Exactly one `status:` label (required)
- Exactly one `type:` label (required)
- At most one `priority:` label (optional)
- One or more `squad:` labels (routing — may have `squad` base + `squad:{agent}`)

### Terminal States Close Issues
`status:done` and `status:superseded` are terminal — the issue is closed. `status:shelved` keeps the issue open (deferred, not dead). When an issue is closed without a terminal status label, apply `status:done` automatically.

### Provider Abstraction
The coordinator works with Squad labels internally. A provider adapter translates:
- GitHub: labels as-is
- Azure DevOps: `status:` → State field, others → Tags
- GitLab: `status:` → scoped labels (`status::value` with `::` for mutual exclusion)

### Idempotent Setup
`gh label create --force` creates or updates. Running setup twice produces the same result. Agent-specific labels (`squad:{name}`) are created dynamically from the team roster.

## Anti-Patterns
- **Multiple status labels on one issue** — ambiguous state; always swap, never accumulate
- **Using Projects board columns as the state machine** — no API events on column change, can't trigger Actions
- **Sprint labels instead of milestones** — milestones have due dates and progress; labels don't
- **Flat labels without namespaces** — collide with existing project labels, unparseable
- **Closing shelved issues** — hides them from default views; shelved means "maybe later," not "dead"
