# Squad in CI/CD Pipelines

**Try this to automate deployment pipelines:**
```
Set up GitHub Actions to run tests on every PR and deploy to staging on merge to main
```

**Try this to enable periodic housekeeping:**
```
Enable Ralph's heartbeat workflow to triage issues automatically
```

Ralph runs periodically via GitHub Actions to handle housekeeping between Copilot sessions — triage new issues, apply squad labels, check stale branches, archive old decisions.

---

## 1. The Heartbeat Workflow — Ralph Between Sessions

Using Squad with GitHub Actions. Label-driven automation, heartbeat workflows, and autonomous issue processing.

Ralph (the manager agent) runs periodically via GitHub Actions to handle housekeeping between Copilot sessions:

- Triage new issues
- Apply squad labels based on routing rules
- Check for stale branches
- Archive old decisions

The workflow is in `.github/workflows/squad-heartbeat.yml` and runs every 6 hours.

**You don't have to do anything** — it's installed automatically (along with 9 other workflows) when you run `npx github:bradygaster/squad`.

```yaml
name: Ralph Heartbeat
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  heartbeat:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Ralph
        run: npx github:bradygaster/squad heartbeat
```

Ralph reads `.squad/routing.md`, looks at open issues, and applies labels:

```
Issue #42: "Add Stripe payment integration"
  → squad:morpheus (backend work, routed to Morpheus)
  → type:feature
  → priority:high
```

Now when you open Copilot, you see issues pre-triaged.

---

## 2. Label-Driven Automation

Squad uses GitHub labels to drive workflows:

**Routing labels** (auto-applied by Ralph):
- `squad:neo` — routed to Neo (Lead)
- `squad:trinity` — routed to Trinity (Frontend Dev)
- `squad:morpheus` — routed to Morpheus (Backend Dev)
- `squad:tank` — routed to Tank (Tester)

**Control labels**:
- `go:neo` — tells Copilot to auto-assign this issue to Neo
- `go:trinity` — auto-assign to Trinity
- `go:morpheus` — auto-assign to Morpheus
- `go:tank` — auto-assign to Tank

**Type labels** (for filtering):
- `type:feature`
- `type:bug`
- `type:refactor`
- `type:docs`

**Priority labels**:
- `priority:critical`
- `priority:high`
- `priority:medium`
- `priority:low`

**Release labels**:
- `release:next` — include in the next release
- `release:backlog` — not scheduled yet

Ralph applies `squad:*` and `type:*` labels automatically. You apply `go:*` labels manually when you want autonomous processing.

---

## 3. @copilot Auto-Assign for Autonomous Issue Processing

When you add a `go:*` label to an issue, the `@copilot` automation picks it up:

1. Ralph labels issue #42 with `squad:morpheus` (backend work)
2. You review the issue and add `go:morpheus` (approval to proceed)
3. GitHub Actions triggers the `@copilot` workflow
4. Copilot session spawns Morpheus to handle the issue
5. Morpheus reads the issue, implements the feature, opens a PR
6. PR is tagged for human review

**This is autonomous issue processing.** You don't open Copilot manually — the workflow does.

Workflow file: `.github/workflows/copilot-auto-assign.yml`:

```yaml
name: Copilot Auto-Assign
on:
  issues:
    types: [labeled]

jobs:
  auto-assign:
    if: startsWith(github.event.label.name, 'go:')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Extract agent name
        id: agent
        run: echo "agent=${LABEL#go:}" >> $GITHUB_OUTPUT
        env:
          LABEL: ${{ github.event.label.name }}
      - name: Spawn Copilot session
        run: |
          copilot --agent squad --message "${{ steps.agent.outputs.agent }}, handle issue #${{ github.event.issue.number }}"
```

**Note:** This workflow requires GitHub Actions to have access to your Copilot session. See GitHub's docs for `gh copilot` in Actions.

---

## 4. What You CAN'T Do: Agents Can't Run in Actions (Yet)

**Squad agents require a live Copilot session.** They can't run in a GitHub Actions runner without Copilot CLI access.

This means:

❌ You **can't** run `Squad, build the feature` inside a GitHub Actions workflow  
✅ You **can** use Ralph to triage and label issues  
✅ You **can** trigger Copilot sessions via Actions (if you have `gh copilot` access)  
❌ You **can't** have agents autonomously merge PRs without human approval (by design)

---

## 5. Sample Workflow: Issue Filed → Triage → Assign → Build → Review

1. **User files issue** #42: "Add Stripe payment integration"
2. **Ralph (heartbeat)** runs, reads routing rules, applies `squad:morpheus` and `type:feature`
3. **You review** the issue, decide it's good, add `go:morpheus` label
4. **GitHub Actions** triggers Copilot auto-assign workflow
5. **Copilot spawns Morpheus** to handle issue #42
6. **Morpheus builds** the Stripe integration, writes tests, opens PR #43
7. **Neo (Lead) reviews** PR #43, approves or requests changes
8. **You merge** PR #43 after human review

Steps 2, 4, 5, 6, 7 are **automated**. You only do steps 3 and 8.

---

## 6. Workflow Templates Ship with Squad

When you run `npx github:bradygaster/squad`, these workflow templates are installed:

- `.squad-templates/squad-heartbeat.yml` → Ralph runs every 6 hours
- `.squad-templates/copilot-auto-assign.yml` → Triggers Copilot on `go:*` labels
- `.squad-templates/pr-review-reminder.yml` → Reminds you of open PRs needing review

To activate them:

```bash
cp .squad-templates/*.yml .github/workflows/
git add .github/workflows/
git commit -m "Enable Squad workflows"
git push
```

Now they're live.

---

## 7. Sample Prompts for CI-Adjacent Workflows

**Trigger Ralph manually:**

```bash
npx github:bradygaster/squad heartbeat
```

**Check what Ralph would do (dry run):**

```bash
npx github:bradygaster/squad heartbeat --dry-run
```

**Have agents work on labeled issues:**

```
> Team, review all open issues labeled squad:morpheus and tell me
> which ones are ready to work on.
```

**Autonomous issue pickup:**

```
> Ralph, triage the 10 newest issues and apply squad labels.
> If any are ready to start, let me know.
```

---

## Tips

- **Ralph is your assistant between sessions.** It triages issues, applies labels, and keeps things organized while you're not in Copilot.
- **`go:*` labels mean "approved to proceed."** Don't add them to every issue — only the ones you've reviewed and want agents to handle autonomously.
- **Agents still need human review.** PRs created by agents should be reviewed by a human before merging.
- **Workflows are templates.** Customize `.squad-templates/` to match your CI/CD setup, then copy to `.github/workflows/`.
- **Heartbeat frequency is configurable.** Edit `squad-heartbeat.yml` to change from every 6 hours to daily, hourly, etc.
