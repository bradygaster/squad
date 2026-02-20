# GitHub Issues Mode — Lifecycle Reference

> **This file is loaded on-demand when working with GitHub issues.**

## Connecting to a Repo

1. Store in `.ai-team/team.md` under `## Issue Source`:

```markdown
## Issue Source

| Field | Value |
|-------|-------|
| **Repository** | {owner/repo} |
| **Connected** | {date} |
| **Filters** | {labels, milestone, or "all open"} |
```

2. List open issues: `gh issue list --repo {owner/repo} --state open --limit 25`

3. Present backlog:
```
📋 Open issues from {owner/repo}:

| # | Title | Labels | Assignee |
|---|-------|--------|----------|
| 12 | Add user authentication | backend, auth | — |

Pick one (#12), several (#12, #15), or say "work on all".
```

4. Route selected issues via `routing.md`. For multi-issue batches, check `ceremonies.md` for auto-triggered ceremonies.

## Issue → PR → Merge Lifecycle

**When an agent picks up an issue:**

1. **Branch:** `git checkout -b squad/{issue-number}-{slug}` (kebab-case, max 40 chars)
2. **Work:** Agent works normally — charter, history, decisions, then implements.
3. **PR:** Commit (`feat: {summary} (#{issue-number})`), push, open PR:
   `gh pr create --repo {owner/repo} --title "{summary}" --body "Closes #{issue-number}\n\n{description}" --base main`
4. **Report:** `"📬 PR #{pr-number} opened for issue #{issue-number} — {title}"`

**Spawn prompt addition** (inject into standard template):
```
ISSUE CONTEXT:
- Issue: #{number} — {title}
- Repository: {owner/repo}
- Body: {issue body text}
- Labels: {labels}

WORKFLOW:
1. Create branch: git checkout -b squad/{number}-{slug}
2. Do the work
3. Commit: feat: {summary} (#{number})
4. Push: git push -u origin squad/{number}-{slug}
5. Open PR: gh pr create --repo {owner/repo} --title "{summary}" --body "Closes #{number}\n\n{what you did}" --base main
```

## PR Review Handling

1. Fetch comments: `gh pr view {number} --repo {owner/repo} --comments`
2. Identify author agent (orchestration log or branch name)
3. Spawn agent with review feedback:
   ```
   PR REVIEW FEEDBACK for PR #{number}:
   {review comments}
   Address each comment. Push fixes to existing branch.
   After pushing: gh pr ready {number} --repo {owner/repo}
   ```
4. Report: `"🔧 {Agent} is addressing review feedback on PR #{number}."`

## PR Merge

1. `gh pr merge {number} --repo {owner/repo} --squash --delete-branch`
2. Verify issue closed: `gh issue view {issue-number} --repo {owner/repo} --json state`
3. If not auto-closed: `gh issue close {issue-number} --repo {owner/repo}`
4. Log and report: `"✅ PR #{number} merged. Issue #{issue-number} closed."`

**Backlog refresh:** Re-fetch open issues when user asks "what's left?"
