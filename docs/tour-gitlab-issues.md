# GitLab Issues Walkthrough

> **🧪 Experimental.** GitLab Issues Mode is new. Commands, behavior, and integration details may change. [Feedback welcome.](https://github.com/bradygaster/squad/issues)

A step-by-step tour of Squad's GitLab Issues workflow. This connects your team to a GitLab repository's issue tracker so agents can pick up issues, create branches, open Merge Requests, and handle review feedback.

**Prerequisite:** The [`glab` CLI](https://docs.gitlab.com/cli/issue/) (official GitLab CLI) must be installed and authenticated (`glab auth login`).

---

## 1. Connect to a Repository

Tell Squad which GitLab repo to track:

```
> Connect to GitLab at https://gitlab.example.com/acme/recipe-app
```

Squad stores the issue source in team state:

```
✅ Issue source stored: https://gitlab.example.com/acme/recipe-app (GitLab)
   Using glab CLI for issue tracking.
```

From now on, Squad can read issues from that repo and create branches and MRs against it.

---

## 2. View the Backlog

Ask to see open issues:

```
> Show the backlog
```

Squad pulls open issues via `glab issue list` (open by default) and displays them:

```
┌─────┬──────────────────────────────────────────┬───────────┬────────────┐
│  #  │ Title                                    │ Labels    │ Assignee   │
├─────┼──────────────────────────────────────────┼───────────┼────────────┤
│  12 │ Add ingredient search                    │ feature   │ —          │
│  15 │ Fix pagination on recipe list            │ bug       │ —          │
│  18 │ Add user profile page                    │ feature   │ —          │
│  21 │ Rate limiting on API endpoints           │ security  │ —          │
│  23 │ Mobile responsive layout                 │ ui        │ —          │
└─────┴──────────────────────────────────────────┴───────────┴────────────┘
5 open issues
```

---

## 3. Work on an Issue

Pick an issue for an agent to work on:

```
> Work on #12
```

Squad reads the issue details, routes it to the right agent, and kicks off the workflow:

```
🔧 Dallas — picking up #12 (Add ingredient search)

Dallas is reading the issue and starting work.
```

Behind the scenes, the agent:

1. **Creates a branch** — named descriptively based on the issue (e.g., `12-add-ingredient-search`)
2. **Does the implementation work** — writes code, tests, whatever the issue requires
3. **Opens a Merge Request** — linked back to issue #12, with a description of what was done

When the agent finishes:

```
🔧 Dallas — Completed #12 (Add ingredient search)
   Branch: 12-add-ingredient-search
   MR: !24 opened — "Add ingredient search (#12)"
   Files changed:
   - src/routes/recipes.ts (added search endpoint)
   - src/models/recipe.ts (added text index)
   - test/search.test.ts (6 test cases)
```

---

## 4. Multiple Issues in Parallel

You can assign multiple issues at once:

```
> Work on #15 and #23
```

```
🔧 Dallas  — picking up #15 (Fix pagination on recipe list)
⚛️ Ripley  — picking up #23 (Mobile responsive layout)
📋 Scribe  — logging session
```

Each agent creates its own branch and works independently. If your repo supports worktrees, Squad can work on multiple branches simultaneously.

---

## 5. Handle Review Feedback

After an MR is open, reviewers may leave comments. When you see feedback:

```
> There's review feedback on MR !24
```

Squad routes the review to the agent who opened the MR:

```
🔧 Dallas — reading review comments on MR !24

Dallas is addressing the feedback now.
```

The agent reads the review comments, makes the requested changes, and pushes new commits to the same branch:

```
🔧 Dallas — Addressed review feedback on MR !24
   - Added input sanitization for search query (reviewer concern)
   - Added test case for SQL injection attempt
   - Pushed 2 new commits to 12-add-ingredient-search
```

---

## 6. Merge Completed Work

When the MR is approved and ready:

```
> Merge MR !24
```

```
✅ MR !24 merged — "Add ingredient search (#12)"
   Issue #12 closed.
   Branch 12-add-ingredient-search deleted.
```

The issue is closed automatically when the MR merges (if the MR body includes `Closes #12`).

---

## 7. Check Remaining Work

After merging, see what's left:

```
> What's left?
```

Squad refreshes the backlog:

```
┌─────┬──────────────────────────────────────────┬───────────┬────────────┐
│  #  │ Title                                    │ Labels    │ Assignee   │
├─────┼──────────────────────────────────────────┼───────────┼────────────┤
│  15 │ Fix pagination on recipe list            │ bug       │ Dallas     │
│  18 │ Add user profile page                    │ feature   │ —          │
│  21 │ Rate limiting on API endpoints           │ security  │ —          │
│  23 │ Mobile responsive layout                 │ ui        │ Ripley     │
└─────┴──────────────────────────────────────────┴───────────┴────────────┘
4 open issues (2 in progress)
```

---

## Full Workflow at a Glance

```
Connect      →  "connect to GitLab at https://gitlab.example.com/acme/recipe-app"
Browse       →  "show the backlog"
Assign       →  "work on #12"
  └─ Agent creates branch, implements, opens MR
Review       →  "there's review feedback on MR !24"
  └─ Agent reads comments, pushes fixes
Merge        →  "merge MR !24"
  └─ MR merged, issue closed
Status       →  "what's left?"
  └─ Updated backlog
```

---

## Installing the GitLab CLI

The `glab` CLI is the official GitLab command-line tool. It's required for all GitLab Issues Mode operations.

### Install

| Platform | Command |
|----------|---------|
| macOS (Homebrew) | `brew install glab` |
| Windows (WinGet) | `winget install GLab.GLab` |
| Windows (Scoop) | `scoop install glab` |
| Linux (apt) | See [GitLab CLI docs](https://docs.gitlab.com/cli/issue/) |
| From source | `go install gitlab.com/gitlab-org/cli/cmd/glab@main` |

### Authenticate

```bash
glab auth login
```

Choose your GitLab instance (gitlab.com or self-managed), select HTTPS, and authenticate via browser or a Personal Access Token.

### Verify

```bash
glab auth status
```

You should see your username and the instance you're connected to.

For more details, see the [official GitLab CLI documentation](https://docs.gitlab.com/cli/issue/).

---

## Tips

- **You don't pick the agent.** Squad routes the issue to the agent whose expertise matches the issue's domain. A bug in the API goes to the backend agent. A UI issue goes to the frontend agent.
- **Agents name branches sensibly.** Branch names include the issue number and a slugified title, so they're easy to find in `git branch`.
- **MRs link to issues.** The MR description includes a `Closes #N` reference so merging automatically closes the issue.
- **Review feedback is incremental.** When you tell Squad about review feedback, the agent pushes new commits to the existing branch — no force-pushes, no new MRs.
- **Check `decisions.md` after issue work.** Agents often record decisions while working on issues (e.g., "chose cursor pagination" or "added text index for search"). These decisions carry forward to future issues.
- **Self-managed GitLab works too.** The `glab` CLI supports self-managed GitLab instances. Run `glab auth login` and select your instance URL during setup.
