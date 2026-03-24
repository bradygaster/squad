---
name: "pr-merge-workflow"
description: "Structured merge-readiness gate for pull requests before running gh pr merge"
domain: "merge-gates, pull-request-quality, workflow-orchestration"
confidence: "low"
source: "manual (Flight workload-management proposal synthesized by Procedures)"
tools:
  - name: "github-mcp-server-pull_request_read"
    description: "Read pull request metadata, status, files, reviews, and check runs"
    when: "Use as the primary merge-readiness evidence source for one PR"
---

## Context

`pr-merge-workflow` is the structured gate that sits **before** `gh pr merge`.

Use it when a human or Ralph needs a clear answer to: **is this PR actually merge-ready, and if not, what exactly is blocking it?** The skill should turn scattered PR metadata into a single verdict with explicit blockers, a concise change summary, and a recommended next action.

This skill is primarily **single-PR and repo-aware**. When invoked from a cross-repo digest, the repo coordinates may come from `.squad/doc-intelligence.local.json` or the activity digest that referenced the PR. When invoked directly (`squad merge #N` or `squad merge #N --dry-run`), use the current repo context or explicit owner/repo input.

The skill is a **gate, not an auto-merge policy**. It evaluates readiness, reports blockers, and only hands off to merge execution after a clear green verdict and explicit user intent.

## Patterns

### Invocation Pattern

Support two modes:

1. **Dry-run status mode**
   - Example: `squad merge #N --dry-run`
   - Purpose: show merge readiness without changing GitHub state
2. **Execution-prep mode**
   - Example: `squad merge #N`
   - Purpose: run the same checks first, then allow merge execution only if the verdict is green

Both modes use the same evaluation logic. Execution mode simply adds the final human-triggered merge step.

### Evidence Collection Pattern

For the target PR, gather five views from `github-mcp-server-pull_request_read`:

1. `get` — baseline metadata, base/head branches, mergeability clues, author, labels, draft state
2. `get_status` — combined commit status for quick pass/fail signal
3. `get_files` — file count and change footprint
4. `get_reviews` — approvals, change requests, review churn
5. `get_check_runs` — granular CI state across jobs

If MCP access is unavailable, fall back to CLI inspection:

- `gh pr view {N}`
- `gh pr checks {N}`

Treat the fallback as evidence gathering, not a separate policy path. The same verdict structure still applies.

### Required Gate Pattern

A PR is only `ready to merge` when all required gates are green.

#### Gate 1: Review completeness

Check:
- required reviewers approved
- no unresolved `changes requested` state from required reviewers
- no obvious missing approval when the repo policy or PR metadata signals review is still pending

Output should identify:
- who approved
- who is still requested / pending
- who requested changes

#### Gate 2: CI health

Check:
- all required check runs are passing
- no in-progress required jobs remain
- no failed or cancelled required jobs remain

If checks are mixed, say so explicitly:
- `waiting for CI`
- `failing CI`
- `partial / unknown CI state`

#### Gate 3: Mergeability

Check:
- no merge conflicts
- PR is not draft
- GitHub reports mergeable or does not indicate a conflict block

If mergeability is unknown, do not silently pass the gate. Mark it `needs attention` and explain what is missing.

#### Gate 4: Freshness against base

Check whether the branch is stale relative to the base branch.

Use evidence such as:
- base/head divergence in PR metadata
- stale branch indicators in checks or status
- repo policy clues that the branch must be updated before merge

If stale:
- verdict is not `ready to merge`
- suggested action should be `update branch and rerun checks`

### Change Summary Pattern

Summarize the PR in a form that supports a fast merge decision.

Always include:
- file count
- additions/deletions when available
- notable file paths or hotspots if the diff is large
- semantic intent: one short sentence describing what changed in user or system terms

The semantic intent should describe the change category, for example:
- CLI behavior change
- prompt/skill contract update
- runtime bug fix
- docs-only clarification
- config surface change

Do not reproduce the whole diff. Compress it into a decision-ready snapshot.

### Verdict Pattern

Return one of three top-level actions:

#### `ready to merge`
Use when reviews, CI, mergeability, and freshness are all green.

#### `waiting for X`
Use when the PR appears healthy but is still pending a specific dependency such as:
- one reviewer approval
- CI completion
- branch update

#### `needs attention`
Use when there is an actual blocker or risk, such as:
- requested changes
- failing checks
- merge conflicts
- unknown mergeability
- stale branch with required update

### Output Pattern

Emit a structured pre-merge report.

```markdown
# PR Merge Check — {owner}/{repo}#{number}

## Verdict
- **Action:** ready to merge | waiting for X | needs attention
- **Why:** {one-line reason}

## Review Gate
- Approvals: {names}
- Pending reviewers: {names or none}
- Changes requested: {names or none}

## CI Gate
- Combined status: {success | pending | failure | mixed}
- Blocking jobs:
  - {job name} — {state}

## Mergeability Gate
- Draft: yes | no
- Conflicts: yes | no | unknown
- Branch freshness: current | stale | unknown

## Change Summary
- Files changed: {count}
- Lines changed: +{adds} / -{dels}
- Intent: {semantic summary}

## Suggested Next Step
- {merge now | wait for reviewer X | rerun failing job | update branch | resolve conflicts}
```

### Dry-Run Pattern

`--dry-run` must produce the full report without triggering merge execution. That output should be stable enough for dashboards, REPL previews, and overnight summaries.

### Owner Routing Pattern

- **FIDO** owns gate semantics, blocker language, and review policy interpretation
- **Booster** owns CI/check integration and any workflow-specific status nuances

If the merge gate needs deeper runtime or CLI wiring, hand implementation to EECOM after the gate contract is stable.

## Examples

### Example 1: Green merge

The PR has two approvals, all check runs are green, the branch is current, and GitHub reports no conflicts.

**Result:**
- verdict = `ready to merge`
- suggested next step = `merge now`

### Example 2: One missing approval

CI is green and the branch is current, but one requested reviewer has not approved yet.

**Result:**
- verdict = `waiting for Alice's review`
- do not mark as blocked unless there is an actual negative signal

### Example 3: Stale branch with red CI

The PR is behind base and one required check run is failing.

**Result:**
- verdict = `needs attention`
- blockers = `update branch` and `fix failing CI`
- do not suggest merge until both are cleared

## Anti-Patterns

- ❌ Running `gh pr merge` without first producing a structured gate verdict
- ❌ Treating one green combined status as enough when individual required checks are failing
- ❌ Ignoring `changes requested` because approvals also exist
- ❌ Hiding merge conflicts behind a generic `not ready` message
- ❌ Calling a stale branch merge-ready when the base branch has moved materially
- ❌ Using dry-run mode as a shallow summary that omits blockers
- ❌ Auto-merging without explicit user intent after the gate passes
- ❌ Reducing the change summary to file count only without semantic intent
