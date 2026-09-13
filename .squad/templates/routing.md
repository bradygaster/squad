# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|

Preset installation adds concrete routes for the configured team. Add or edit rows
here only when their agent names also exist in the casting registry.

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Lead |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **One accountable owner** — select exactly one primary specialist for each work item.
2. **Bounded collaboration** — request input only from specialists whose domain is materially needed.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary deliverable.
5. **Split only independent deliverables.** Do not fan out multiple owners over the same artifact.
6. **Scribe is decision-only.** Spawn Scribe only when accepted durable decisions require merging.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
8. **Review and escalation** — follow `.squad/governance.md`.
