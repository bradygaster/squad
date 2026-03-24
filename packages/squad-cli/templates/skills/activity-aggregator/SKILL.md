---
name: "activity-aggregator"
description: "Unified personal activity digest across configured GitHub repositories"
domain: "workload-management, personal-activity, github-orchestration"
confidence: "low"
source: "manual (Flight workload-management proposal synthesized by Procedures)"
tools:
  - name: "github-mcp-server-search_issues"
    description: "Search issues across each configured repository for authored, assigned, or mentioned work"
    when: "Use as the primary retrieval path for user-centric issue slices inside the configured lookback window"
  - name: "github-mcp-server-search_pull_requests"
    description: "Search pull requests across each configured repository for authored, review-requested, or mentioned work"
    when: "Use as the primary retrieval path for user-centric pull-request slices inside the configured lookback window"
  - name: "github-mcp-server-issue_read"
    description: "Read issue details, labels, comments, and related metadata"
    when: "Use after search results when you need labels, assignment state, or comment evidence for blocked flags and mention validation"
  - name: "github-mcp-server-pull_request_read"
    description: "Read pull request details, reviews, comments, files, and checks"
    when: "Use after search results when you need review state, mergeability clues, labels, or blocker evidence"
  - name: "github-mcp-server-list_issues"
    description: "List recent issues in a configured repository"
    when: "Use as a fallback inventory pass when search results need repo-local verification or broad recent coverage"
  - name: "github-mcp-server-list_pull_requests"
    description: "List recent pull requests in a configured repository"
    when: "Use as a fallback inventory pass when search results need repo-local verification or broad recent coverage"
---

## Context

`activity-aggregator` is the personal workload complement to `doc-intelligence`.

Use it when Ralph or an interactive command needs a single answer to: **what across my configured repos needs my attention right now?** The skill should scan multiple GitHub repositories, deduplicate overlapping signals, and return a compact digest organized around the user's next action instead of raw issue lists.

This skill should **reuse the local config contract** already established by `doc-intelligence`:

```text
.squad/doc-intelligence.local.json
```

Read the configured `sources.github[]` list from that file instead of hardcoding owners, repo names, or maintaining a second repo registry. The skill may accept an explicit repo subset, but the default scope comes from local config.

The default lookback window is the same as `doc-intelligence`: **24 hours** unless the caller overrides it.

## Patterns

### Config Reuse Pattern

1. Load `.squad/doc-intelligence.local.json`
2. Read `defaults.lookbackHours` unless the caller supplies a narrower or wider window
3. Enumerate enabled `sources.github[]`
4. Treat that repo list as the canonical monitoring surface for cross-repo activity

**Rule:** never copy local config values into `SKILL.md`, checked-in templates, decision logs, or dashboard snapshots.

### Personal Signal Retrieval Pattern

For each configured repository, retrieve six slices for the target user:

1. **Issues authored by the user**
2. **Issues assigned to the user**
3. **Issues mentioning the user**
4. **PRs authored by the user**
5. **PRs requesting the user's review**
6. **PRs mentioning the user**

Prefer search-first retrieval because the query is user-centric, not repo-centric.

#### Issue query shape

For each repo, search for open issues that match combinations like:

- `author:{user}`
- `assignee:{user}`
- `mentions:{user}`
- constrained to the configured lookback window when the question is about recent activity

Then read details only for candidate items that need labels, comments, assignment verification, or blocker extraction.

#### Pull request query shape

For each repo, search for open PRs that match combinations like:

- `author:{user}`
- `review-requested:{user}`
- `mentions:{user}`
- constrained to the configured lookback window when the question is about recent activity

Then read PR details, reviews, and comments to classify review state and blockers.

### Classification Pattern

Normalize every result into one primary bucket so the digest reads like a queue, not a data dump.

#### 1. Needs your review

Use when the PR is open and the user is a requested reviewer, explicit approver, or de facto reviewer based on direct mention plus pending review discussion.

Include:
- repo + PR number
- age
- author
- labels
- latest review state summary
- blocked flags (failing checks, merge conflict, stale branch, requested changes)

#### 2. Your PRs awaiting merge

Use when the PR author is the target user and the PR is still open.

Distinguish between:
- **ready to merge**
- **awaiting reviewer approval**
- **awaiting CI**
- **blocked / needs attention**

Include review state, latest check conclusion, and whether the branch appears mergeable.

#### 3. Your open issues

Use for issues authored by the user or assigned to the user that are still open and actionable.

Include:
- repo + issue number
- age
- labels
- assignee state
- blocked flag if comments indicate dependency, waiting state, or external blocker

#### 4. Mentions

Use for issue or PR threads where the user is mentioned but the item does not belong in a higher-priority bucket.

Examples:
- FYI mention with no explicit action
- routing question that does not request review
- cross-repo reference to related work

### Deduplication Pattern

The same PR can appear in multiple slices: authored by user, review-requested to user, and mentioning user. Collapse duplicates into a single normalized record with:

- stable identity: `{owner}/{repo}#{number}` + item type
- accumulated reasons: `authored`, `assigned`, `mentioned`, `review-requested`
- one primary bucket chosen by action priority

Use this priority order when collisions happen:

1. `needs your review`
2. `your PRs awaiting merge`
3. `your open issues`
4. `mentions`

Keep secondary reasons in metadata so the dashboard or CLI can explain why the item surfaced.

### Blocker Extraction Pattern

Add a `blocked` or `needs-attention` flag when evidence shows one of these conditions:

- requested changes still open
- failing or missing check runs
- merge conflict / non-mergeable state
- stale branch against base
- explicit dependency noted in comments or labels (`blocked`, `needs-info`, `waiting`, similar conventions)

Do not invent blockers from silence. Only elevate when the issue, PR, review state, checks, or labels support it.

### Output Pattern

Emit a structured digest that can drive both Ralph's overnight briefing and an on-demand `squad activity` view.

```markdown
# Personal Activity Digest — {user}

**Lookback:** last {N} hours  
**Config:** `.squad/doc-intelligence.local.json`

## Coverage
- Repos scanned: {count}
- Repos: {owner/repo list}

## Needs Your Review
- {repo}#{pr} — {age}
  - Author: {author}
  - Labels: {labels}
  - Review state: {requested | approved by X | changes requested by Y}
  - Flags: {blocked | stale | ci-failing | clean}

## Your PRs Awaiting Merge
- {repo}#{pr} — {age}
  - Status: {ready to merge | waiting for review | waiting for CI | blocked}
  - Review state: {summary}
  - Flags: {flags}

## Your Open Issues
- {repo}#{issue} — {age}
  - Labels: {labels}
  - Assignees: {assignees}
  - Flags: {blocked | waiting | active}

## Mentions
- {repo}#{item} — {age}
  - Why surfaced: {mention reason}
  - Action: {none | reply | inspect | route}
```

### Ralph Integration Pattern

Ralph should treat this as a **daily personal workload heartbeat**.

1. Load the configured repos from local config
2. Scan the last 24 hours by default
3. Produce the digest before the morning briefing is rendered
4. Feed the output into the dashboard concept as the **Personal Activity** section
5. Stay compact: if there is no actionable personal signal, emit a quiet `nothing urgent` result instead of noise

### Owner Routing Pattern

- **EECOM** owns runtime wiring, data fetching, and digest generation
- **INCO** owns dashboard/CLI phrasing, grouping, and scan-friendly presentation

Route implementation questions accordingly.

## Examples

### Example 1: Overnight briefing slice

Ralph scans the configured repos and finds:
- two PRs requesting the user's review
- one user-authored PR with all approvals in but CI still pending
- one assigned issue waiting on another team

**Result:**
- two items in `Needs Your Review`
- one item in `Your PRs Awaiting Merge` with `waiting for CI`
- one item in `Your Open Issues` with a `blocked` flag

### Example 2: Mention should not outrank requested review

A PR both mentions the user and explicitly requests their review.

**Result:**
- emit one record
- primary bucket = `Needs Your Review`
- secondary reasons include `mentioned`

### Example 3: On-demand personal filter

The user runs `squad activity --my-mentions --last-24h`.

**Result:**
- reuse the same repo scope from `.squad/doc-intelligence.local.json`
- return only the `Mentions` bucket
- keep dedupe logic so the same thread does not surface twice

## Anti-Patterns

- ❌ Hardcoding the repo list instead of reading `.squad/doc-intelligence.local.json`
- ❌ Maintaining a second config file for the same GitHub monitoring surface
- ❌ Treating every mention as equal priority to a requested review
- ❌ Emitting duplicate records because the same item matched multiple filters
- ❌ Mixing closed items into an active-work digest unless the caller explicitly asks for history
- ❌ Inventing blocked state without evidence from labels, comments, reviews, or checks
- ❌ Dumping raw search output when the caller needs an action-oriented queue
- ❌ Copying local repo notes or sensitive operational context into checked-in artifacts
