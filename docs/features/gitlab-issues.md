# GitLab Issues Mode

> **🧪 Experimental.** GitLab Issues Mode is new. Commands, behavior, and integration details may change. [Feedback welcome.](https://github.com/bradygaster/squad/issues)

**Try this to connect to your backlog:**
```
Show me the open issues for this GitLab repo
```

**Try this to start work on a specific issue:**
```
Work on issue #42
```

**Try this to handle MR review feedback:**
```
There's review feedback on MR !24
```

Squad connects to your GitLab repository, fetches issues from the backlog, routes work to the right agents, creates branches, implements changes, and opens Merge Requests — all from natural language requests.

---

## Requirements

- **`glab` CLI** installed and authenticated — the [official GitLab CLI](https://docs.gitlab.com/cli/issue/) (`glab auth login` to authenticate, `glab auth status` to check)
- A GitLab repository with issues

---

## Connect to a Repository

```
> Connect to GitLab at https://gitlab.example.com/acme/recipe-app
```

Squad stores the issue source in `team.md`. You only need to do this once per project.

---

## View the Backlog

```
> Show the backlog
```

Squad fetches open issues via `glab issue list` and displays them in a table:

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

1. Creates a branch (e.g., `12-add-user-authentication`)
2. Implements the work
3. Opens a Merge Request linked to the issue

### Multiple issues

```
> Work on #12 and #15
```

Agents work in parallel — each issue gets its own branch and MR.

---

## Handle MR Review Feedback

```
> There's review feedback on MR !24
```

The agent who opened the MR reads the review comments and addresses them. Commits are pushed to the existing branch.

---

## Merge Completed Work

```
> Merge MR !24
```

Squad merges the MR, deletes the source branch, and closes the linked issue.

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
| `"Connect to GitLab at https://gitlab.example.com/acme/recipe-app"` | Stores issue source |
| `"Show the backlog"` | Lists open issues |
| `"Work on #12"` | Agent branches, implements, opens MR |
| `"Work on #12 and #15"` | Parallel agent work on both issues |
| `"There's review feedback on MR !24"` | Agent addresses review comments |
| `"Merge MR !24"` | Merges MR, deletes branch, closes issue |
| `"What's left?"` | Refreshes and shows remaining issues |

---

## GitLab CLI Quick Reference

These are the `glab` commands Squad uses behind the scenes:

| Operation | Command |
|-----------|---------|
| Authenticate | `glab auth login` |
| Check auth | `glab auth status` |
| List open issues | `glab issue list` |
| List all issues | `glab issue list --all` |
| View issue | `glab issue view 12` |
| Create MR | `glab mr create -t "Fix pagination" -d "Closes #15"` |
| Create MR (auto-fill from commits) | `glab mr create --fill` |
| List open MRs | `glab mr list` |
| List all MRs | `glab mr list --all` |
| Merge MR | `glab mr merge 24` |

For the full command reference, see the [official GitLab CLI documentation](https://docs.gitlab.com/cli/).

---

## Differences from GitHub Issues Mode

| Aspect | GitHub | GitLab |
|--------|--------|--------|
| CLI tool | `gh` | `glab` |
| Pull/Merge Requests | PR (`#24`) | MR (`!24`) |
| Auth command | `gh auth login` | `glab auth login` |
| Default branch convention | `main` | `main` (configurable) |
| Issue linking in MR body | `Closes #N` | `Closes #N` |
| Labels & milestones | Supported | Supported |

---

## Tips

- You don't need to assign issues to specific agents — Squad routes based on domain expertise.
- If `glab` isn't authenticated, Squad will tell you. Run `glab auth login` first.
- MR descriptions include `Closes #N` so merging automatically closes the linked issue, just like on GitHub.
- See [GitLab Issues Walkthrough](../tour-gitlab-issues.md) for a step-by-step tour.

## Sample Prompts

```
connect to GitLab at https://gitlab.example.com/acme/recipe-app
```

Links Squad to a GitLab repository for issue-driven development.

```
show the backlog
```

Fetches and displays all open issues from the connected GitLab repository.

```
work on issue #23
```

Routes the issue to the appropriate agent who creates a branch, implements, and opens an MR.

```
work on all issues labeled "bug"
```

Processes multiple issues in parallel based on label filtering.

```
what's left in the backlog?
```

Refreshes the issue list and shows remaining open work items.
