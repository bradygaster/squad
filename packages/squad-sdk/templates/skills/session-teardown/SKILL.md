---
name: "session-teardown"
description: "End-of-session: commit all work across discovered repos, record progress, optionally create PRs, and save state for next session"
domain: "workflow"
confidence: "high"
source: "manual"
---

## Context

Every session ends with a structured teardown that commits work, records progress, and saves state so the next session can pick up exactly where we left off.

## Repository Discovery

Use the same discovery process as `session-setup`:

1. **Identify the squad repo** — The repo containing `.squad/`.
2. **Find the project directory** — One level up from the squad repo (`..`).
3. **Scan for sibling repos** — All directories in the project root that are git repos (contain `.git/`).
4. **Classify repos:**
   - **Squad repo** (`[squad]`) — Gets squad-only commits.
   - **Content repos** (`[content]`) — Get code/content commits.

> **Key rule:** Squad state (`.squad/`) lives ONLY in the squad repo. Never write `.squad/` files to content repos.

## Procedure

### Step 1 — Commit uncommitted work

For **each** discovered repo, check `git status`. If there are changes:

**Squad repo** — commit squad-only changes (decisions, agent history, skills, sessions):
```bash
cd ../<squad-repo-dir>
git add -A
git commit -m "session: <summary of squad changes>"
git push origin <branch>
```

**Each content repo** — commit code/content changes:
```bash
cd ../<content-repo-dir>
git add -A
git commit -m "session: <summary of code/content changes>"
git push origin <branch>
```

If a repo has no changes, skip it and note "no changes."

### Step 2 — Record session summary

Write a session summary to `<squad-repo>/.squad/sessions/latest.md` with this format:

```markdown
# Session Summary — <date>

## Branches
<!-- List ALL discovered repos and their current branch -->
- <squad-repo>: `<branch-name>`
- <content-repo-1>: `<branch-name>`
- <content-repo-2>: `<branch-name>`

## What we worked on
- <bullet summary of tasks completed>
- <bullet summary of tasks in progress>

## Where we stopped
- <specific description of the exact stopping point>
- <any pending decisions or questions>

## Open items for next session
- <what needs to happen next>
- <any blocked items and why>

## PRs
<!-- List ALL discovered repos and their PR status -->
- <squad-repo>: <PR URL or "no PR">
- <content-repo-1>: <PR URL or "no PR">
- <content-repo-2>: <PR URL or "no PR">
```

The session summary always lives in the squad repo. Create the `.squad/sessions/` directory if it does not exist.

### Step 3 — Ask about PR merge

For **each** repo that has a pushed branch, ask the user:

> "Is the work on `<branch>` in `<repo>` ready to merge to main?"

Options:
- **Yes — merge now**: Create PR (if not exists), merge, delete branch
- **No — keep the branch open**: Leave for next session
- **Create PR but don't merge**: Push and create PR for review

### Step 4 — Verify final state

Report the ending state:
```
📋 Session closed
  [squad]   <squad-repo>/      — <branch>@<sha> — <clean/pushed/merged>
  [content] <content-repo-1>/  — <branch>@<sha> — <clean/pushed/merged>
  [content] <content-repo-2>/  — <branch>@<sha> — <clean/pushed/merged>
  ...
  Summary saved to <squad-repo>/.squad/sessions/latest.md
```

## Session File Location

- Current session: `<squad-repo>/.squad/sessions/latest.md` (overwritten each session)
- The `session-setup` skill reads `latest.md` to remind the user where they left off
- Session files live ONLY in the squad repo — never in content repos

## Rules

- **Always commit before closing** — never leave uncommitted work
- **Always push** — local-only commits can be lost
- **Always write the session summary** — the next session depends on it
- **Ask before merging** — never auto-merge without user confirmation
- **Include PR URLs** — makes it easy to find open work
- **Session summary goes in the squad repo only** — never write `.squad/` files to content repos

## Anti-Patterns

- Closing a session with uncommitted changes
- Forgetting to push (commits stuck locally)
- No session summary (next session starts blind)
- Auto-merging without asking
- Vague summaries like "worked on stuff" — be specific about stopping point
- Writing session files to content repos instead of the squad repo
- Hardcoding repo paths instead of using relative discovery
