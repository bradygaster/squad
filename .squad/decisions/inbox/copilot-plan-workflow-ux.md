# Decision: `/squad plan` Workflow Design

**Date:** 2026-08-08
**Raised by:** bradygaster (via Copilot session)
**Status:** Open
**Related:** `.squad/decisions/inbox/copilot-sdlc-workflows.md`

## Context

After casting (#8 → PR #9 on Aspiregregator), the natural next step is decomposing the issue into actionable sub-issues. Today this requires manual work. A `/squad plan` command would let the squad generate a plan from an issue, get approval, then create sub-issues.

## UX Flow (Proposed)

```
User writes issue #8 (big feature/epic)
  ↓
/squad cast → PR with team (already works ✅)
  ↓
/squad plan → Squad reads issue, posts structured plan as comment
  ↓
User reviews plan comment
  ↓
/squad plan accept → Squad creates sub-issues from the plan
```

## UX Options for the Accept Step

### Option A: `/squad plan accept` (recommended)

```
/squad plan              → generates plan comment
/squad plan accept       → creates sub-issues from last plan comment
/squad plan revise ...   → revises plan based on feedback, posts new comment
```

- **Pro:** Explicit, discoverable, follows the existing `/squad <mode>` pattern
- **Pro:** Feedback loop — user can `/squad plan revise "split the React work into 3 phases"` before accepting
- **Con:** User must type another comment to accept

### Option B: Checkbox-based acceptance

The plan comment includes GitHub task-list checkboxes:
```markdown
## Proposed Plan
- [x] Issue: Platform modernization (auto-checked = will be created)
- [x] Issue: Orleans architecture completion
- [ ] Issue: Security hardening (unchecked = skip)

Reply `/squad plan accept` to create the checked items.
```

- **Pro:** User can selectively approve individual items before accepting
- **Con:** More complex — agent must re-read the edited comment and parse checkbox state
- **Con:** Editing someone else's comment (bot's) feels weird; user would need to quote/copy

### Option C: Reaction-based acceptance (👍 on plan comment)

- **Pro:** Zero typing — just react to accept
- **Con:** gh-aw likely can't trigger on reactions (not in the events list)
- **Con:** Too easy to accidentally accept

### Option D: Draft PR as plan artifact

`/squad plan` creates a draft PR containing a `PLAN.md` with the proposed issues in markdown. Merge = accept.

- **Pro:** Native review workflow (comments, suggestions, approvals)
- **Con:** Plans aren't code — feels wrong to use a PR
- **Con:** Adds merge noise to the repo

## Workflow Architecture Options

### Option 1: Extend existing `squad.md` workflow (minimal)

Add `plan`, `plan accept`, `plan revise` to the existing modes table. No new workflow needed.

```yaml
# Just add to the Modes table:
| `/squad plan`          | Plan         | Decompose issue into sub-issues (proposes, doesn't create) |
| `/squad plan accept`   | Plan Accept  | Create sub-issues from last plan comment |
| `/squad plan revise`   | Plan Revise  | Revise plan based on feedback |
```

- **Pro:** Zero additional install — anyone with `/squad` already has planning
- **Pro:** Shares the same team context (squad state restored from activation)
- **Con:** `safe-outputs.create-issue.max: 5` is too low for planning decomposition
- **Con:** Workflow grows in complexity; permissions are shared across modes
- **Mitigation:** Bump `create-issue.max` to 20

### Option 2: Separate `workflows/plan.md` (composable)

New top-level workflow: `/plan` slash command, imports `shared/squad.md` for team state.

```yaml
name: Plan
on:
  slash_command:
    name: plan
    events: [issues, issue_comment]
permissions:
  contents: read
  copilot-requests: write
  issues: write          # needs write to create sub-issues
safe-outputs:
  create-issue:
    labels: [squad, planned]
    max: 20
  add-comment:
    max: 10
imports:
  - shared/squad.md
```

- **Pro:** Dedicated permissions (issues: write only when planning)
- **Pro:** Clean separation — cast and plan are independent workflows
- **Pro:** Users opt-in to planning separately: `gh aw add bradygaster/squad/workflows/plan.md@dev`
- **Con:** Extra install step for users
- **Con:** `/plan` is a separate namespace from `/squad` (less discoverable)

### Option 3: Hybrid — `shared/plan.md` component imported by `squad.md`

```yaml
# In workflows/squad.md:
imports:
  - shared/squad.md
  - shared/plan.md
```

- **Pro:** Single install, single `/squad` namespace, but planning logic lives in its own shared component
- **Pro:** Others can also import `shared/plan.md` into their own workflows
- **Con:** Permissions must cover both casting and planning in one workflow

## Recommendation

**Option A (UX) + Option 3 (architecture)** — Keep `/squad plan` under the existing `/squad` namespace (discoverability), implement planning logic in `shared/plan.md` (composability), and bump `create-issue.max` to 20.

The flow becomes:
1. `/squad plan` → reads issue body + repo context, generates structured plan comment with sub-issues, effort estimates, dependencies, and agent assignments
2. User reviews, optionally replies `/squad plan revise "merge items 3 and 4, add a migration step"`
3. `/squad plan accept` → creates sub-issues with labels, assignments, and dependency references

Plan comments should be structured with:
- Numbered work items with titles and scope descriptions
- Dependency order (which items block which)
- Agent assignments (which squad member owns each item)
- Effort signals (S/M/L)
- A summary of what `/squad plan accept` will create

## State Between Runs

gh-aw runs are stateless. The plan comment IS the state:
- `/squad plan` → posts a comment with a specific marker (e.g., `<!-- squad-plan-v1 -->`)
- `/squad plan accept` → searches issue comments for the latest plan marker, parses it, creates issues
- `/squad plan revise` → finds the latest plan, revises it, posts a new plan comment (supersedes the old one)

## Open Questions

1. Should `/squad plan accept` also assign the created issues to squad members (via labels like `squad:lead`)?
2. Should plan comments include task-list checkboxes for selective acceptance?
3. Should the plan reference the team from PR #9's `.squad/team.md`, or work without a cast team?
4. Max issues to create in one plan — 20? 30?

## Decision

*(Pending — to be resolved by the team)*
