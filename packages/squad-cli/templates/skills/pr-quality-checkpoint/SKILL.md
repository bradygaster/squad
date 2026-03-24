---
name: "pr-quality-checkpoint"
description: "Pre-flight PR readiness scan that summarizes review state, CI health, change risk, and the next action"
domain: "quality-gates, pull-request-triage, orchestration"
confidence: "low"
source: "manual (Procedures designed the first-pass PR checkpoint workflow for Ralph and reviewer handoff)"
tools:
  - name: "github-mcp-server-list_pull_requests"
    description: "List candidate PRs awaiting review"
    when: "Use during Ralph's overnight sweep to enumerate open PRs that need a checkpoint summary"
  - name: "github-mcp-server-pull_request_read"
    description: "Read PR metadata, files, reviews, review comments, status, and check runs"
    when: "Use for the primary checkpoint pass on a specific PR number"
  - name: "powershell"
    description: "Run gh fallback commands when GitHub MCP data is incomplete"
    when: "Use `gh pr view --json ...` and `gh pr checks` as the fallback path when MCP fields are missing or ambiguous"
---

## Context

`pr-quality-checkpoint` is a pre-review quality gate, not a replacement for code review.

Use it when Ralph is sweeping open PRs before Brady starts the day, or when someone asks for an on-demand readiness summary like:

```text
squad pr review #123 --summarize
```

The skill answers one question fast: **is this PR worth human review time right now, and if not, what should happen next?**

It should surface review state, CI health, change shape, staleness, conflicts, and doc/test risk in one compact summary. Owner routing is split by failure mode:

- **FIDO** owns quality signals: failing tests, missing tests, weak coverage indicators, stale review state
- **EECOM** owns runtime and mergeability signals: branch health, PR wiring, conflict state, broken automation surfaces

## Patterns

### Invocation Modes

Run the same checkpoint routine in two modes:

1. **Ralph overnight sweep**
   - list open PRs awaiting Brady's review
   - run one checkpoint per PR
   - feed the result into the morning dashboard or digest
2. **On-demand PR summary**
   - accept a concrete PR number
   - return the checkpoint only for that PR

The routine is deterministic. Same inputs, same summary shape.

### PR Checkpoint Routine

Run these checks for every PR, in this order.

#### 1. Load the PR envelope

Use `github-mcp-server-pull_request_read` with `method: "get"` to capture:

- title, author, draft state
- created/update timestamps
- mergeability / merge-state fields
- additions, deletions, changed files count
- base branch vs head branch
- requested reviewers / review decision fields when available
- latest commit metadata, including commit age
- branch divergence from base when available (behind/ahead)

If any critical field is missing, fall back to:

```text
gh pr view <N> --json number,title,author,isDraft,createdAt,updatedAt,mergeStateStatus,reviewDecision,additions,deletions,changedFiles,files,commits,latestReviews,statusCheckRollup
```

#### 2. Review state summary

Use:

- `method: "get_reviews"` for approval / change-request / comment history
- `method: "get_review_comments"` for unresolved review-thread pressure

Normalize review state into:

- **approvals** — count latest effective approvals
- **requested changes** — count latest effective change requests
- **pending reviewers** — requested reviewers and still-required reviewers not yet satisfied

Rules:

- collapse each reviewer's latest effective state instead of double-counting history
- treat active change requests as blocking unless clearly superseded
- if required-review metadata is unavailable, use requested reviewers plus review decision as the best approximation
- unresolved blocking threads should downgrade readiness even when formal approvals exist

#### 3. CI and automation state

Use both:

- `method: "get_check_runs"`
- `method: "get_status"`

Summarize counts for:

- passing
- failing
- pending / in progress
- cancelled or neutral when they affect readiness

Rules:

- any failure is a blocking signal
- any pending required check means **wait for CI**
- distinguish flaky or optional noise from required failures when the payload makes that obvious
- if check metadata is incomplete, fall back to `gh pr checks <N>`

#### 4. Change summary and semantic classification

Use `method: "get_files"` to compute:

- file count
- total lines added / removed
- dominant path clusters (`src/`, `test/`, `docs/`, `.squad/`, `templates/`, config files)
- semantic classification

Classify the PR as one primary type, with secondary tags when needed:

- **bugfix** — targeted behavior correction, tests often near production files
- **feature** — new capability, command, workflow, or user-visible path
- **refactor** — structural rework with little user-facing change
- **docs** — documentation-only or docs-dominant edits
- **config** — workflow, CI, templates, package, or environment contract changes

Prefer semantic classification over raw path counting. A small `src/` change plus a new command should still classify as a feature.

#### 5. Staleness and branch health

Compute and report:

- PR age
- last commit age
- whether the branch is behind base
- whether the PR is draft

Flag as stale when any of these hold:

- PR has been open long enough to suggest review context drift
- last commit is old and CI/review state is still unresolved
- branch is materially behind base

The exact age threshold can be repo-tuned later. For the first pass, treat multi-day inactivity as a warning, not an automatic block, unless it combines with conflicts or failing CI.

#### 6. Conflict check

Use the PR mergeability fields from `get`.

- merge conflicts or blocked merge state => **resolve conflicts**
- unknown mergeability should be called out explicitly, not silently treated as mergeable
- if behind-base state requires rebase before merge, include that in the action recommendation

#### 7. Test coverage signal

Inspect `get_files` output for test-path changes (`test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`).

Flag **missing tests** when:

- behavior changed in runtime, CLI, workflow, or prompt contracts
- but no new or updated tests appear

Do not flag missing tests for:

- docs-only changes
- comment-only changes
- clearly mechanical config edits with no behavior impact

This is a heuristic signal, not proof of missing coverage.

#### 8. Docs impact signal

Flag **missing docs** when the PR appears to change user-facing or operator-facing behavior but does not touch likely doc surfaces:

- `README.md`
- `docs/`
- `.squad/`
- `templates/`

Use the repo's existing rule: every PR should be evaluated for doc impact. A missing-docs flag is especially important for feature, config, workflow, or prompt-contract changes.

### Badge and Recommendation Mapping

Emit exactly one badge and one recommended action.

#### Badge mapping

- **✅ Ready to merge**
  - no active change requests
  - required checks passing
  - mergeable
  - no blocking flags
- **⚠️ Needs attention**
  - non-blocking warnings exist (stale, missing tests, missing docs, pending reviewers with otherwise healthy CI)
- **🔴 Blocked**
  - failing checks, active change requests, draft state, merge conflicts, or clearly blocked automation

#### Recommended action mapping

- `merge` — approvals satisfied, checks pass, no blockers remain
- `review` — healthy enough for human review, but not yet in a merge-ready state
- `wait for CI` — pending required checks
- `address feedback` — active change requests or unresolved blocking review pressure
- `resolve conflicts` — merge conflicts or behind-base state that blocks merge

### Output Shape

Return one compact checkpoint block per PR:

```markdown
## PR #<N> — <title>
Status: ✅ Ready to merge | ⚠️ Needs attention | 🔴 Blocked
Recommended action: merge | review | wait for CI | address feedback | resolve conflicts

- Review summary: <approvals>, <requested changes>, <pending reviewers>
- CI summary: <pass>/<fail>/<pending>
- Change summary: <files> files, +<additions> / -<deletions>, <type>
- Flags: <stale?>, <conflicts?>, <missing tests?>, <missing docs?>
- Notes: <one-sentence explanation of the main driver>
```

Keep the explanation short, decisive, and reviewer-oriented.

### Ralph Integration and Routing

For Ralph's overnight sweep:

- run this skill for every PR awaiting Brady's review
- store the summary in the overnight dashboard input
- surface blocked PRs first, then attention items, then ready items

Route follow-up ownership by dominant issue:

- **FIDO** when the checkpoint is blocked by tests, CI quality, or missing coverage signal
- **EECOM** when the checkpoint is blocked by runtime plumbing, mergeability, or branch health
- mixed signals can name both, but still produce one action recommendation

## Examples

### Example 1: Healthy PR ready for review or merge

A PR has two approvals, no change requests, all checks pass, and no merge conflicts.

**Result:**
- Badge: `✅ Ready to merge`
- Recommended action: `merge`
- Flags: none

### Example 2: CI still running

A PR is mergeable and already approved, but two required checks are still pending.

**Result:**
- Badge: `⚠️ Needs attention`
- Recommended action: `wait for CI`
- Notes call out that reviewer time can wait until checks settle

### Example 3: Behavior changed without tests or docs

A PR adds a new CLI behavior under `src/` but does not touch `test/`, `README.md`, `docs/`, `.squad/`, or `templates/`.

**Result:**
- Badge: `⚠️ Needs attention`
- Recommended action: `review`
- Flags: `missing tests`, `missing docs`

### Example 4: Review blocked by feedback and conflicts

A PR has an active change request and GitHub reports merge conflicts.

**Result:**
- Badge: `🔴 Blocked`
- Recommended action: `resolve conflicts`
- Notes mention that conflict resolution comes before another human pass

## Anti-Patterns

- ❌ Treating this checkpoint as a substitute for code review
- ❌ Reporting raw GitHub data without collapsing it into one action recommendation
- ❌ Counting every historical review event instead of each reviewer's latest effective state
- ❌ Calling a PR ready when required checks are still pending
- ❌ Ignoring unresolved review pressure because formal approvals exist
- ❌ Flagging missing tests for docs-only or comment-only changes
- ❌ Flagging missing docs for pure refactors with no user-facing effect
- ❌ Hiding unknown mergeability; if it is unknown, say it is unknown
