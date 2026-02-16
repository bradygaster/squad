# GitHub Issues Mode

**Try this to connect to your backlog:**
```
Show me the open issues for this repo
```

**Try this to start work on a specific issue:**
```
Work on issue #42
```

**Try this to handle PR review feedback:**
```
There's review feedback on PR #24
```

Squad connects to your GitHub repository, fetches issues from the backlog, routes work to the right agents, creates branches, implements changes, and opens PRs — all from natural language requests.

---

## Requirements

- **`gh` CLI** installed and authenticated (`gh auth status` to check)
- A GitHub repository with issues

---

## Connect to a Repository

```
> Connect to myorg/myrepo
```

Squad stores the issue source in `team.md`. You only need to do this once per project.

---

## View the Backlog

```
> Show the backlog
```

Squad fetches open issues and displays them in a table:

```
#   Title                        Labels        Assignee
12  Add user authentication      backend       —
15  Fix responsive nav           frontend      —
18  Write API integration tests  testing       —
```

---

## Work on Issues

### Single issue

```
> Work on #12
```

The coordinator routes the issue to the best-fit agent. That agent:

1. Creates a branch (e.g., `feature/12-add-user-authentication`)
2. Implements the work
3. Opens a PR linked to the issue

### Multiple issues

```
> Work on #12 and #15
```

Agents work in parallel — each issue gets its own branch and PR.

---

## Handle PR Review Feedback

```
> There's review feedback on PR #24
```

The agent who opened the PR reads the review comments and addresses them. Commits are pushed to the existing branch.

---

## Merge Completed Work

```
> Merge PR #24
```

Squad squash-merges the PR, deletes the branch, and closes the linked issue.

---

## Check Remaining Work

```
> What's left?
```

Squad refreshes the backlog and shows remaining open issues.

---

## Workflow Summary

| You say | What happens |
|---------|-------------|
| `"Connect to myorg/myrepo"` | Stores issue source |
| `"Show the backlog"` | Lists open issues |
| `"Work on #12"` | Agent branches, implements, opens PR |
| `"Work on #12 and #15"` | Parallel agent work on both issues |
| `"There's review feedback on PR #24"` | Agent addresses review comments |
| `"Merge PR #24"` | Squash merge, delete branch, close issue |
| `"What's left?"` | Refreshes and shows remaining issues |

---

## Tips

- You don't need to assign issues to specific agents — Squad routes based on domain expertise.
- If `gh` isn't authenticated, Squad will tell you. Run `gh auth login` first.
- See [GitHub Issues Walkthrough](../tour-github-issues.md) for a step-by-step tour.

## Sample Prompts

```
connect to bradygaster/squad
```

Links Squad to a GitHub repository for issue-driven development.

```
show the backlog
```

Fetches and displays all open issues from the connected repository.

```
work on issue #23
```

Routes the issue to the appropriate agent who creates a branch, implements, and opens a PR.

```
work on all issues labeled "bug"
```

Processes multiple issues in parallel based on label filtering.

```
what's left in the backlog?
```

Refreshes the issue list and shows remaining open work items.
