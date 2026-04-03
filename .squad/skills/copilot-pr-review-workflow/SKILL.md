---
name: "copilot-pr-review-workflow"
description: "Complete pipeline for handling Copilot PR reviewer bot comments ΓÇö from reading reviews to resolving threads"
domain: "pr-review"
confidence: "medium"
source: "earned"
tools:
  - name: "pull_request_read"
    description: "GitHub MCP tool to read PR review comments"
    when: "Reading Copilot review threads with get_review_comments method"
  - name: "gh api graphql"
    description: "GitHub CLI GraphQL API for thread resolution"
    when: "Querying and resolving review threads after fixes are pushed"
---

## Context

When Copilot reviewer bot leaves comments on a PR, agents need a structured workflow to triage, fix, and resolve those comments. This skill covers the full pipeline ΓÇö reading reviews, evaluating comments critically, routing fixes to the correct agent (lockout rules), resolving threads via GraphQL, and verifying CI. Confirmed across PRs #756, #760, #762 in a single session.

## Scope

Γ£à THIS SKILL PRODUCES:
- A decision on which comments to fix vs push back on
- Correctly routed fix assignments (respecting lockout)
- Resolved review threads after verified fixes
- Green CI confirmation

Γ¥î THIS SKILL DOES NOT PRODUCE:
- New tests (unless a comment specifically requests one)
- Refactors beyond what the comment identifies
- Changes to `.squad/` files (keep PR hygiene separate)

## Patterns

### 1. Reading Copilot Reviews

Use GitHub MCP `pull_request_read` with `get_review_comments` method to fetch all review threads:

```
pull_request_read(method: "get_review_comments", owner: "{owner}", repo: "{repo}", pullNumber: {N})
```

Or use `gh api graphql` for richer data (includes resolution state):

```
gh api graphql -f query='query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {N}) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 10) {
            nodes { body path line }
          }
        }
      }
    }
  }
}'
```

### 2. Evaluating Comments Critically

Do NOT rubber-stamp every suggestion. Assess each comment on its merit:

| Category | Action | Example |
|---|---|---|
| **Factual error** | Always fix | Wrong filename referenced, incorrect API endpoint |
| **Missing edge case** | Usually fix | Null/undefined guard, empty-string check |
| **Style / opinion** | Evaluate context | Naming preference, code organization suggestion |
| **Over-engineering** | Push back | Adding abstraction layers for single-use code |

**Session evidence:** All 3 comments on #756 were valid (subpath regex gap, wrong filename, misleading text). All 6 on #760/#762 were valid (path safety, breaking type change, misleading warning messages).

### 3. Lockout Enforcement on Fixes

**The original PR author CANNOT fix Copilot review comments on their own PR.** Per the reviewer rejection lockout rules in squad.agent.md, route to a DIFFERENT agent.

Session examples:
- PR #760: **Network** authored ΓåÆ **FIDO** fixed Copilot comments
- PR #762: **EECOM** authored ΓåÆ **CONTROL** fixed Copilot comments

The coordinator must track who authored the PR and assign the fix to someone else.

### 4. Resolving Threads After Fix

After the fix is pushed and CI is green, resolve each thread via GraphQL.

**Step 1 ΓÇö Query unresolved threads:**

```bash
gh api graphql -f query='query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {N}) {
      reviewThreads(first: 50) {
        nodes { id isResolved }
      }
    }
  }
}'
```

**Step 2 ΓÇö Resolve each unresolved thread:**

```bash
gh api graphql -f query='mutation {
  resolveReviewThread(input: {threadId: "{id}"}) {
    thread { isResolved }
  }
}'
```

### 5. Verifying CI After Fixes

Always confirm CI stays green after pushing review fixes:

```bash
gh pr checks {N} --repo {owner}/{repo}
```

Do not resolve threads until CI passes. A fix that breaks the build is worse than the original comment.

### 6. Common Copilot Reviewer Patterns

What Copilot reviewer catches well ΓÇö expect these categories:

- **Missing edge cases** in input validation (null/undefined guards)
- **Breaking type changes** in public APIs (required ΓåÆ optional field)
- **Misleading error messages** that suggest wrong remediation steps
- **Regex patterns** too narrow for their stated intent
- **Encoding issues** (mojibake in generated content)
- **Pagination limits** in API calls (hardcoded page sizes)

### 7. PR Hygiene Checks (Before Copilot Reviews)

Run these checks BEFORE submitting for review to reduce noise:

- No `.squad/` files in the diff
- No branch stacking (PR only contains its own commits)
- Changeset present if CLI/SDK source changed
- File count matches intent (Γëñ10 for most fixes)

## Agent Workflow

1. **READ** ΓÇö Fetch review threads using `pull_request_read` or GraphQL
2. **TRIAGE** ΓÇö Categorize each comment (factual error / edge case / style / over-engineering)
3. **DECIDE** ΓÇö Accept valid comments, push back on over-engineering with rationale
4. **ROUTE** ΓÇö Identify PR author; assign fix to a DIFFERENT agent (lockout rule)
5. **FIX** ΓÇö Fixing agent addresses accepted comments in a single commit
6. **VERIFY** ΓÇö Run `gh pr checks` to confirm CI is green
7. **RESOLVE** ΓÇö Use GraphQL mutations to resolve each addressed thread
8. **STOP** ΓÇö Do not add scope beyond what the comments requested

## Anti-Patterns

- Γ¥î **Don't auto-accept all suggestions** ΓÇö evaluate each comment on merit. Copilot can over-engineer or suggest unnecessary abstractions.
- Γ¥î **Don't let the original author fix their own PR's review comments** ΓÇö this violates reviewer rejection lockout rules. Always route to a different agent.
- Γ¥î **Don't resolve threads before the fix is pushed** ΓÇö resolve only after the fix commit lands AND CI passes.
- Γ¥î **Don't batch .squad cleanup with other PR work** ΓÇö this causes data loss. Learned the hard way this session. Keep `.squad/` changes in separate commits or PRs.
- Γ¥î **Don't resolve threads without verifying CI** ΓÇö a fix that breaks the build is worse than the original review comment.
- Γ¥î **Don't skip the triage step** ΓÇö blindly fixing everything wastes time and can introduce unnecessary complexity.
