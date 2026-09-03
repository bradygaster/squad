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

1. **Minimum sufficient dispatch** — spawn the fewest agents that can complete the task. Default is **one agent**: the primary owner of the work type. Do not spawn speculative or "could usefully start" agents.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks. Scribe does not count against any cap.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern. The other is an advisory reviewer, never a co-implementer.
5. **Dispatch caps.** At most **2** domain agents per request, at most **3** in flight at once, at most **1** in-flight task per agent. Exceeding the fan-out cap requires an explicit `"Team, ..."` from the user or a task that provably spans 3+ modules with different primaries — name the modules.
6. **No anticipatory downstream work.** Tests, docs, and scaffolding are dispatched after the upstream result exists and shows they are needed — not launched alongside "because they'll obviously be needed."
7. **Sync vs background is a dependency question,** not a default. Use `sync` when someone is waiting on the result; use `background` only for proven-independent work launched in the same turn.
8. **Stop conditions** — report instead of spawning more when: acceptance criteria are met, two consecutive agent turns produce no file changes, two agents have edited the same file in one wave, the change set exceeds 20 files or shows unrequested deletions, an agent reports blocked, or a cap in rule 5 is reached.
9. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
