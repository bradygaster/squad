---
name: "session-setup"
description: "Discovers all project repos, ensures they are clean, synced to main, and on fresh session branches before starting work"
domain: "workflow"
confidence: "high"
source: "manual"
---

## Context

Every new squad session must start with all repositories in a clean, synced state on fresh branches. This prevents cross-session contamination and ensures PRs are clean.

## Repository Discovery

At the start of every session, discover the project's repos dynamically:

1. **Identify the squad repo** — The repo you are currently in, which contains the `.squad/` directory.
2. **Find the project directory** — Go one level up from the squad repo (`..`). This is the project root that groups all related repos together.
3. **Scan for sibling repos** — List all directories in the project root that are git repos (contain a `.git/` directory or folder). Each one is a project repo managed by this session.
4. **Classify repos:**
   - **Squad repo** (`[squad]`) — The repo containing `.squad/`. Gets squad-only changes (`.squad/` files, decisions, charters, skills, session summaries).
   - **Content repos** (`[content]`) — All other sibling git repos. Get code and content changes (source code, docs, prompts, scripts, templates, infra).

> **Key rule:** Squad state (`.squad/`) lives ONLY in the squad repo. Never create `.squad/` in content repos.

Present the discovered repos to the user:

```
📁 Project directory: ../
  [squad]   <squad-repo-dir>/    — squad config
  [content] <content-repo-1>/    — code/content
  [content] <content-repo-2>/    — code/content
  ...
```

If only the squad repo is found (no sibling content repos), that is valid — some projects are squad-only.

## Procedure

Run these steps at the start of every new session, BEFORE any work begins.

### Step 0 — Resume context from last session

Check if `<squad-repo>/.squad/sessions/latest.md` exists. If it does:
- Read it and present the summary to the user
- Highlight "Where we stopped" and "Open items for next session"
- Note any open PRs that may need attention
- Ask: "Want to continue this work, or start something new?"

If it doesn't exist, skip this step.

### Step 1 — Check for uncommitted work

For **each** discovered repo, run `git status`. If there are uncommitted changes:
- Show the user which repo has uncommitted work and what changed
- Ask the user what to do: commit, stash, or discard
- Do NOT proceed until every working tree is clean

### Step 2 — Sync main to remote

For **each** discovered repo:
```bash
cd ../<repo-dir>
git checkout main
git fetch origin
git reset --hard origin/main
```

### Step 3 — Create session branches

Branch naming: `squad/<session-description>` (e.g., `squad/fix-branding-quality`)

For **each** discovered repo:
```bash
cd ../<repo-dir>
git checkout -b squad/<branch-name>
```

Use the SAME branch name in all repos so they are easy to correlate.

### Step 4 — Verify

Confirm **every** discovered repo shows:
- Clean working tree (`git status` shows nothing to commit)
- On the new session branch
- Main is at the same commit as remote

Report the starting state to the user:
```
✅ Session ready
  [squad]   <squad-repo>/      — on squad/<branch> from main@<short-sha>
  [content] <content-repo-1>/  — on squad/<branch> from main@<short-sha>
  [content] <content-repo-2>/  — on squad/<branch> from main@<short-sha>
  ...
```

## Rules

- **Never skip this procedure** — even for "quick fixes"
- **Never commit directly to main** — always use session branches
- **Same branch name in all repos** — keeps correlation obvious
- **Ask before discarding uncommitted work** — the user may want to stash or commit first
- **Squad repo gets squad-only changes** — `.squad/` files, decisions, agent history, skills
- **Content repos get code/content changes** — source code, docs, prompts, scripts, templates, infra
- **Never create `.squad/` in content repos** — squad state lives only in the squad repo

## Anti-Patterns

- Starting work on a stale main (forgot to fetch/reset)
- Using different branch names across repos
- Committing code changes to the squad repo
- Committing squad config to a content repo
- Working directly on main without a session branch
- Creating `.squad/` directories in content repos
- Hardcoding repo paths instead of using relative discovery
