# Proposal 032b: GitHub Actions Automation Layer for Squad

**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-10  
**Status:** Draft  
**Requested by:** bradygaster — *"factor in actions — you could use ci/cd and actions for automation too. sky's the limit."*  
**Builds on:** Proposal 032 (GitHub-Native Proposals), 031 (CCA E2E Test Design), 030 (Async Comms), 028a (API Capabilities)  
**Companion to:** Proposal 032 (Keaton's design). 032 defines the proposal lifecycle. 032b automates it.

---

## 1. The Actions Opportunity

Proposal 032 designs a proposal lifecycle: user requests → issue created → agents comment → human approves → work items spawn → PRs merge → proposal closes. That lifecycle depends on someone being at a terminal running Copilot CLI. When Brady closes his laptop, the lifecycle stops.

**Actions changes that.** Actions is event-driven automation that runs when no human is present. It watches for GitHub events (issues opened, comments posted, labels applied) and executes workflows in response. This is Brady's async dream made concrete:

### What Actions Can Do That Agents Alone Can't

1. **Persistent automation.** A Copilot CLI session dies when the terminal closes. An Action runs on GitHub's infrastructure indefinitely. Brady assigns an issue from his phone at 11pm → Actions processes it at 11:00:01pm → CCA picks it up at 11:01pm → Brady reviews the PR at 7am.

2. **Event-driven workflows.** Agents are pull-based (they check state when spawned). Actions are push-based (GitHub fires a webhook, the workflow runs). No polling. No "did anything change since last time?" — Actions knows.

3. **Scheduled workflows.** Daily standup summaries, stale proposal cleanup, weekly health checks. Things that should happen on a cadence, not when someone remembers to ask.

4. **CCA orchestration.** Actions can assign `@copilot` to issues programmatically. When a proposal gets approved, an Action creates work items and assigns them to CCA — no human in the loop. CCA picks them up, works under Squad governance (per `squad.agent.md`), opens PRs. Brady reviews when ready.

5. **Cross-session continuity.** A CLI session can't follow a proposal from creation through multiple comment rounds to approval across days. Actions can — each event trigger picks up where the last left off, using issue labels as state.

### The Async Loop — No Telegram Needed

Brady's Proposal 017 (Squad DM) explored Telegram and Discord bridges for async communication. Actions + CCA makes most of that unnecessary:

```
Brady (phone) → assigns issue → Actions labels it → CCA picks it up
                                                    → CCA works under squad.agent.md governance
                                                    → CCA opens PR
Brady (phone) → reviews PR on GitHub Mobile → approves
                                              → Actions auto-merges (if configured)
                                              → Actions updates parent proposal status
```

**GitHub IS the async surface.** Issues are the inbox. PRs are the output. Actions is the automation backbone. No bridge infrastructure. No Telegram bot. No tunnels.

---

## 2. Workflow Catalog

### 2.1 Proposal Lifecycle Automation

**File:** `.github/workflows/squad-proposal-lifecycle.yml`

Automates the proposal lifecycle defined in 032: template validation, initial labeling, state transitions.

```yaml
name: Squad Proposal Lifecycle

on:
  issues:
    types: [opened, labeled, unlabeled]

permissions:
  issues: write
  contents: read

jobs:
  # ── New proposal intake ──
  proposal-intake:
    if: >
      github.event.action == 'opened' &&
      contains(github.event.issue.labels.*.name, 'proposal')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate proposal template
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.issue.body || '';
            const required = ['## Problem', '## Solution'];
            const missing = required.filter(s => !body.includes(s));

            if (missing.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: [
                  '⚠️ **Proposal template incomplete**',
                  '',
                  'Missing sections:',
                  ...missing.map(s => `- \`${s}\``),
                  '',
                  'Please update the issue body with the standard proposal template.',
                  '',
                  '*— Squad Automation*'
                ].join('\n')
              });
            }

      - name: Ensure status:draft label
        uses: actions/github-script@v7
        with:
          script: |
            const labels = context.payload.issue.labels.map(l => l.name);
            if (!labels.some(l => l.startsWith('status:'))) {
              await github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                labels: ['status:draft']
              });
            }

      - name: Post welcome comment
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: [
                '📋 **Proposal registered.**',
                '',
                '**Status:** Draft',
                '**Next:** Squad agents will analyze this proposal and post their assessments as comments.',
                '',
                'To approve: apply the `status:approved` label or comment "approved".',
                'To reject: apply the `status:rejected` label or comment "rejected".',
                '',
                '*— Squad Automation*'
              ].join('\n')
            });

  # ── Status transition: approved ──
  proposal-approved:
    if: >
      github.event.action == 'labeled' &&
      github.event.label.name == 'status:approved' &&
      contains(github.event.issue.labels.*.name, 'proposal')
    runs-on: ubuntu-latest
    steps:
      - name: Clean up draft label and post approval notice
        uses: actions/github-script@v7
        with:
          script: |
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;

            // Remove draft/reviewing labels
            for (const label of ['status:draft', 'status:reviewing']) {
              try {
                await github.rest.issues.removeLabel({
                  owner, repo, issue_number, name: label
                });
              } catch (e) { /* label might not exist */ }
            }

            await github.rest.issues.createComment({
              owner, repo, issue_number,
              body: [
                '✅ **Proposal approved.**',
                '',
                'Ready for work decomposition. Assign sub-issues or tag with `cca-eligible` for Copilot Coding Agent pickup.',
                '',
                '*— Squad Automation*'
              ].join('\n')
            });
```

### 2.2 Consensus Engine

**File:** `.github/workflows/squad-consensus.yml`

Tracks approval comments and reaction thresholds on proposal issues. Detects consensus and auto-transitions labels.

```yaml
name: Squad Consensus Tracker

on:
  issue_comment:
    types: [created]

permissions:
  issues: write

jobs:
  track-consensus:
    if: >
      contains(github.event.issue.labels.*.name, 'proposal') &&
      contains(github.event.issue.labels.*.name, 'status:draft')
    runs-on: ubuntu-latest
    steps:
      - name: Check for approval signal
        uses: actions/github-script@v7
        with:
          script: |
            const comment = context.payload.comment.body.toLowerCase().trim();
            const author = context.payload.comment.user.login;
            const repoOwner = context.repo.owner;

            // Only the repo owner's approval triggers transition
            if (author !== repoOwner) {
              console.log(`Comment by ${author} — not the repo owner, skipping`);
              return;
            }

            const approvalPatterns = [
              'approved', 'approve', 'lgtm', 'ship it',
              'go', 'go ahead', 'looks good', '👍'
            ];
            const rejectionPatterns = [
              'rejected', 'reject', 'no', 'not now',
              'shelved', 'defer', 'deferred'
            ];

            const isApproval = approvalPatterns.some(p => comment.includes(p));
            const isRejection = rejectionPatterns.some(p => comment.includes(p));

            if (isApproval) {
              // Transition: draft → approved
              await github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                labels: ['status:approved']
              });
              // draft label removed by the lifecycle workflow above

              console.log('Consensus reached: APPROVED');
            } else if (isRejection) {
              // Transition: draft → rejected, close issue
              for (const label of ['status:draft', 'status:reviewing']) {
                try {
                  await github.rest.issues.removeLabel({
                    owner: context.repo.owner,
                    repo: context.repo.repo,
                    issue_number: context.issue.number,
                    name: label
                  });
                } catch (e) { /* label might not exist */ }
              }
              await github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                labels: ['status:rejected']
              });
              await github.rest.issues.update({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                state: 'closed',
                state_reason: 'not_planned'
              });
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: '❌ **Proposal rejected.** Issue closed.\n\n*— Squad Automation*'
              });
            }
```

### 2.3 Sprint Automation

**File:** `.github/workflows/squad-sprint-planner.yml`

When a proposal is approved, this workflow can create sub-issues from a structured work decomposition comment.

```yaml
name: Squad Sprint Planner

on:
  issues:
    types: [labeled]

permissions:
  issues: write
  contents: read

jobs:
  create-work-items:
    if: >
      github.event.label.name == 'status:approved' &&
      contains(github.event.issue.labels.*.name, 'proposal')
    runs-on: ubuntu-latest
    steps:
      - name: Extract work items and create sub-issues
        uses: actions/github-script@v7
        with:
          script: |
            const { owner, repo } = context.repo;
            const issue = context.payload.issue;

            // Look for a work decomposition comment from the Squad team
            // Format: lines starting with "- [ ] " under a "## Work Items" heading
            const comments = await github.paginate(
              github.rest.issues.listComments,
              { owner, repo, issue_number: issue.number }
            );

            const workComment = comments.find(c =>
              c.body.includes('## Work Items') || c.body.includes('## Work Decomposition')
            );

            if (!workComment) {
              await github.rest.issues.createComment({
                owner, repo,
                issue_number: issue.number,
                body: [
                  '📝 **Proposal approved — awaiting work decomposition.**',
                  '',
                  'Post a comment with `## Work Items` and task list entries to auto-create sub-issues:',
                  '```',
                  '## Work Items',
                  '- [ ] Implement the core feature (@agent-name)',
                  '- [ ] Add test coverage (@agent-name)',
                  '- [ ] Update documentation (@agent-name)',
                  '```',
                  '',
                  '*— Squad Automation*'
                ].join('\n')
              });
              return;
            }

            // Parse work items from the comment
            const lines = workComment.body.split('\n');
            const items = lines
              .filter(l => l.match(/^- \[[ x]\] /))
              .map(l => l.replace(/^- \[[ x]\] /, '').trim());

            const created = [];
            for (const item of items) {
              // Extract agent hint if present: "Task title (@agent-name)"
              const agentMatch = item.match(/\(@?(\w+)\)$/);
              const title = item.replace(/\s*\(@?\w+\)$/, '').trim();
              const labels = ['squad'];
              if (agentMatch) {
                labels.push(`squad:${agentMatch[1]}`);
              }

              const newIssue = await github.rest.issues.create({
                owner, repo,
                title: title,
                body: [
                  `Part of proposal #${issue.number}`,
                  '',
                  `> ${issue.title}`,
                  '',
                  '## Acceptance Criteria',
                  '- [ ] Implementation complete',
                  '- [ ] Tests pass',
                  '- [ ] PR opened and reviewed',
                ].join('\n'),
                labels: labels
              });
              created.push(`- [ ] #${newIssue.data.number} — ${title}`);
            }

            if (created.length > 0) {
              await github.rest.issues.createComment({
                owner, repo,
                issue_number: issue.number,
                body: [
                  '🏗️ **Work items created:**',
                  '',
                  ...created,
                  '',
                  '*— Squad Automation*'
                ].join('\n')
              });
            }
```

### 2.4 Agent Comment Poster

**Design pattern — not a standalone workflow.**

The problem: agents in Copilot CLI sessions produce analysis, but posting to GitHub requires `gh` CLI access. Two approaches:

#### Approach A: Direct Posting (Recommended for v0.3.0)

Agents post directly during their CLI session using `gh issue comment`. This is what 032 already designs. The coordinator mediates — agent returns output, coordinator calls `gh issue comment`.

```bash
# Coordinator posts agent analysis as a comment
gh issue comment {number} --repo {owner/repo} --body "### 🏗️ Keaton (Lead)

{agent analysis}

---
*Posted by Squad — Keaton (Lead)*"
```

**Pros:** Simple, immediate, no intermediate state.  
**Cons:** Requires an active CLI session. If the session dies mid-post, the comment is lost.

#### Approach B: Drop-Box + Action Poster (Deferred)

Agent writes output to a known file path (e.g., `.ai-team/outbox/{issue-number}-{agent}.md`). An Action watches for commits to the outbox directory and posts the content as issue comments.

```yaml
# Hypothetical — NOT shipping in 0.3.0
name: Squad Comment Poster
on:
  push:
    paths: ['.ai-team/outbox/**']
jobs:
  post-comments:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Post outbox contents as comments
        run: |
          for file in .ai-team/outbox/*.md; do
            ISSUE=$(echo "$file" | grep -oP '\d+')
            BODY=$(cat "$file")
            gh issue comment "$ISSUE" --body "$BODY"
            rm "$file"
          done
          git add -A && git commit -m "chore: flush outbox" && git push
```

**Pros:** Decouples agent execution from GitHub API. Works even if the CLI session dies.  
**Cons:** Adds latency (commit → push → Action trigger → post). Requires `.ai-team/outbox/` to be tracked in git (conflicts with the `.ai-team/` gitignore decision). More moving parts.

**Decision:** Approach A for v0.3.0. Approach B only if we hit reliability problems with direct posting.

### 2.5 Daily Digest / Standup Bot

**File:** `.github/workflows/squad-standup.yml`

Posts a daily summary of proposal and issue activity.

```yaml
name: Squad Daily Standup

on:
  schedule:
    - cron: '0 14 * * 1-5'  # 9am ET, weekdays

permissions:
  issues: write
  contents: read

jobs:
  daily-digest:
    runs-on: ubuntu-latest
    steps:
      - name: Generate standup summary
        uses: actions/github-script@v7
        env:
          STANDUP_ISSUE: ''  # Set to a pinned "standup" issue number, or leave empty to create
        with:
          script: |
            const { owner, repo } = context.repo;
            const since = new Date();
            since.setDate(since.getDate() - 1);
            const sinceISO = since.toISOString();

            // Gather recent proposal activity
            const issues = await github.rest.issues.listForRepo({
              owner, repo,
              labels: 'proposal',
              since: sinceISO,
              state: 'all',
              per_page: 50
            });

            // Gather recent PRs
            const prs = await github.rest.pulls.list({
              owner, repo,
              state: 'all',
              sort: 'updated',
              direction: 'desc',
              per_page: 20
            });
            const recentPRs = prs.data.filter(
              pr => new Date(pr.updated_at) > since
            );

            // Build the digest
            const sections = ['## 📋 Squad Daily Standup', ''];

            // New proposals
            const newProposals = issues.data.filter(
              i => new Date(i.created_at) > since
            );
            if (newProposals.length > 0) {
              sections.push('### New Proposals');
              newProposals.forEach(i =>
                sections.push(`- #${i.number} — ${i.title}`)
              );
              sections.push('');
            }

            // Status changes (recently labeled)
            const approved = issues.data.filter(i =>
              i.labels.some(l => l.name === 'status:approved')
            );
            if (approved.length > 0) {
              sections.push('### Approved');
              approved.forEach(i =>
                sections.push(`- #${i.number} — ${i.title}`)
              );
              sections.push('');
            }

            // Active PRs
            if (recentPRs.length > 0) {
              sections.push('### Active PRs');
              recentPRs.forEach(pr => {
                const status = pr.merged_at ? '✅ merged' :
                               pr.state === 'closed' ? '❌ closed' :
                               '🔄 open';
                sections.push(`- #${pr.number} — ${pr.title} (${status})`);
              });
              sections.push('');
            }

            if (newProposals.length === 0 && approved.length === 0 && recentPRs.length === 0) {
              sections.push('*No activity in the last 24 hours.*');
              sections.push('');
            }

            sections.push(`*Generated ${new Date().toISOString().split('T')[0]}*`);
            sections.push('*— Squad Automation*');

            const body = sections.join('\n');

            // Post to a pinned standup issue, or create one
            const standupLabel = 'squad:standup';
            const existing = await github.rest.issues.listForRepo({
              owner, repo,
              labels: standupLabel,
              state: 'open',
              per_page: 1
            });

            if (existing.data.length > 0) {
              await github.rest.issues.createComment({
                owner, repo,
                issue_number: existing.data[0].number,
                body
              });
            } else {
              await github.rest.issues.create({
                owner, repo,
                title: '📋 Squad Daily Standup',
                body: 'Daily standup summaries will be posted as comments on this issue.\n\n*— Squad Automation*',
                labels: [standupLabel, 'squad']
              });
            }
```

### 2.6 Stale Proposal Cleanup

**File:** `.github/workflows/squad-stale-proposals.yml`

```yaml
name: Squad Stale Proposal Cleanup

on:
  schedule:
    - cron: '0 12 * * 1'  # Mondays at noon UTC

permissions:
  issues: write

jobs:
  stale-check:
    runs-on: ubuntu-latest
    steps:
      - name: Find and nudge stale proposals
        uses: actions/github-script@v7
        env:
          STALE_DAYS: '14'
          SHELVE_DAYS: '28'
        with:
          script: |
            const { owner, repo } = context.repo;
            const staleDays = parseInt(process.env.STALE_DAYS);
            const shelveDays = parseInt(process.env.SHELVE_DAYS);
            const now = new Date();

            const proposals = await github.rest.issues.listForRepo({
              owner, repo,
              labels: 'proposal',
              state: 'open',
              per_page: 100
            });

            for (const issue of proposals.data) {
              const labels = issue.labels.map(l => l.name);
              // Skip approved/implementing proposals
              if (labels.includes('status:approved') || labels.includes('status:implementing')) {
                continue;
              }

              const lastUpdate = new Date(issue.updated_at);
              const daysSinceUpdate = Math.floor((now - lastUpdate) / (1000 * 60 * 60 * 24));

              if (daysSinceUpdate >= shelveDays && labels.includes('stale')) {
                // Auto-shelve: close with shelved label
                await github.rest.issues.addLabels({
                  owner, repo,
                  issue_number: issue.number,
                  labels: ['status:shelved']
                });
                await github.rest.issues.update({
                  owner, repo,
                  issue_number: issue.number,
                  state: 'closed',
                  state_reason: 'not_planned'
                });
                await github.rest.issues.createComment({
                  owner, repo,
                  issue_number: issue.number,
                  body: [
                    `📦 **Proposal shelved** — no activity for ${daysSinceUpdate} days.`,
                    '',
                    'Reopen this issue to resume discussion.',
                    '',
                    '*— Squad Automation*'
                  ].join('\n')
                });
              } else if (daysSinceUpdate >= staleDays && !labels.includes('stale')) {
                // Mark stale
                await github.rest.issues.addLabels({
                  owner, repo,
                  issue_number: issue.number,
                  labels: ['stale']
                });
                await github.rest.issues.createComment({
                  owner, repo,
                  issue_number: issue.number,
                  body: [
                    `⏰ **Stale proposal** — no activity for ${daysSinceUpdate} days.`,
                    '',
                    `Comment or update to keep this proposal alive. If no activity within ${shelveDays - staleDays} more days, this will be auto-shelved.`,
                    '',
                    '*— Squad Automation*'
                  ].join('\n')
                });
              }
            }
```

### 2.7 CCA Dispatch

**File:** `.github/workflows/squad-cca-dispatch.yml`

When work items are tagged `cca-eligible`, auto-assign to `@copilot`. CCA picks them up, works under Squad governance, and opens PRs. The Action monitors the PR and reports status back to the parent proposal.

```yaml
name: Squad CCA Dispatch

on:
  issues:
    types: [labeled]
  pull_request:
    types: [opened, closed]

permissions:
  issues: write
  pull-requests: read

jobs:
  # ── Assign @copilot when issue is tagged cca-eligible ──
  assign-cca:
    if: >
      github.event_name == 'issues' &&
      github.event.action == 'labeled' &&
      github.event.label.name == 'cca-eligible'
    runs-on: ubuntu-latest
    steps:
      - name: Assign @copilot
        uses: actions/github-script@v7
        with:
          script: |
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;

            await github.rest.issues.addAssignees({
              owner, repo, issue_number,
              assignees: ['copilot']
            });

            await github.rest.issues.createComment({
              owner, repo, issue_number,
              body: [
                '🤖 **Assigned to Copilot Coding Agent.**',
                '',
                'CCA will work under Squad governance (`squad.agent.md`) and open a PR when complete.',
                '',
                '*— Squad Automation*'
              ].join('\n')
            });

  # ── When CCA opens a PR, link it to the parent proposal ──
  cca-pr-status:
    if: >
      github.event_name == 'pull_request' &&
      startsWith(github.event.pull_request.head.ref, 'copilot/')
    runs-on: ubuntu-latest
    steps:
      - name: Report PR status to parent proposal
        uses: actions/github-script@v7
        with:
          script: |
            const { owner, repo } = context.repo;
            const pr = context.payload.pull_request;
            const prBody = pr.body || '';

            // Extract linked issue numbers from PR body
            // CCA typically includes "Closes #N" or "Fixes #N"
            const issueRefs = prBody.match(/(closes|fixes|resolves)\s+#(\d+)/gi) || [];
            const issueNumbers = issueRefs.map(ref => {
              const match = ref.match(/#(\d+)/);
              return match ? parseInt(match[1]) : null;
            }).filter(Boolean);

            for (const issueNum of issueNumbers) {
              // Check if this issue references a parent proposal
              const issue = await github.rest.issues.get({
                owner, repo, issue_number: issueNum
              });
              const body = issue.data.body || '';
              const parentMatch = body.match(/Part of proposal #(\d+)/);

              if (parentMatch) {
                const parentNum = parseInt(parentMatch[1]);
                const status = pr.merged
                  ? '✅ Merged'
                  : pr.state === 'closed'
                    ? '❌ Closed'
                    : '🔄 PR Opened';

                await github.rest.issues.createComment({
                  owner, repo,
                  issue_number: parentNum,
                  body: [
                    `**CCA Work Item Update — #${issueNum}**`,
                    '',
                    `${status}: ${pr.title} (#${pr.number})`,
                    '',
                    '*— Squad Automation*'
                  ].join('\n')
                });
              }
            }
```

---

## 3. Workflow Architecture

### How Workflows Ship

Workflows do NOT ship inside the Squad npm package. Here's why:

1. **`.github/workflows/` is repo-specific.** npm packages install to `node_modules/`, not `.github/workflows/`. There's no npm convention for installing GitHub Actions workflows.
2. **Workflows need repo-specific permissions.** Each repo's Actions settings, secrets, and environment differ. A workflow that works in `bradygaster/squad` may not work in `someuser/myproject` without configuration.
3. **Users need to audit workflows.** GitHub Actions have write access to repositories. Users must review and understand any workflow before enabling it — just copying files silently is an anti-pattern.

### Distribution Strategy

**Workflows ship as templates.** Squad provides workflow files in a `templates/workflows/` directory. The `squad init` command offers to install them:

```
Squad GitHub Actions workflows available:
  ✓ squad-proposal-lifecycle.yml  — Automates proposal intake and status transitions
  ✓ squad-consensus.yml           — Tracks approval comments, auto-transitions labels
  ✓ squad-stale-proposals.yml     — Weekly cleanup of inactive proposals
  ○ squad-standup.yml             — Daily activity digest (optional)
  ○ squad-cca-dispatch.yml        — Auto-assign @copilot to eligible work items (optional)
  ○ squad-sprint-planner.yml      — Create sub-issues from approved proposals (optional)

Install workflows? (y/n)
```

On confirmation, Squad copies the templates to `.github/workflows/` — the same pattern as copying `squad.agent.md` to `.github/agents/`. Users can then customize them.

### How `squad init` Sets Up Workflows

Addition to the init flow in `index.js`:

```javascript
// After copying squad.agent.md to .github/agents/
const workflowsDir = path.join('.github', 'workflows');
const templateWorkflowsDir = path.join(__dirname, 'templates', 'workflows');

if (fs.existsSync(templateWorkflowsDir)) {
  fs.mkdirSync(workflowsDir, { recursive: true });
  const workflows = fs.readdirSync(templateWorkflowsDir);
  for (const wf of workflows) {
    const dest = path.join(workflowsDir, wf);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(templateWorkflowsDir, wf), dest);
    }
  }
}
```

### Reusable Workflows vs. Composite Actions vs. Standalone

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| **Standalone workflows** | Simple, self-contained, easy to customize | Duplication if shared logic exists | ✅ **Use for v0.3.0** |
| **Reusable workflows** | DRY, versioned, can be called across repos | Requires hosting in a public repo; adds complexity | Defer to v0.4.0+ |
| **Composite actions** | Reusable steps, packaged as actions | Requires publishing to marketplace or referencing repo | Defer to v0.4.0+ |

**v0.3.0 decision:** Standalone workflows. Each file is self-contained. Users can read, understand, and modify each workflow independently. When patterns stabilize, extract shared logic into a reusable workflow or composite action.

### How Workflows Access Squad State

Workflows read `.ai-team/` files via `actions/checkout@v4`. Since `.ai-team/` is gitignored on main (team decision, 2026-02-08), workflows on main **cannot read Squad state**.

**This is fine.** The workflows in this proposal don't need `.ai-team/` state — they operate on GitHub Issues, labels, and comments, which are GitHub API state, not filesystem state. The Squad governance that CCA needs lives in `.github/agents/squad.agent.md`, which IS tracked in git.

| State Source | Accessible to Actions? | Used By |
|---|---|---|
| GitHub Issues (labels, comments, state) | ✅ Yes — via GitHub API | All workflows |
| `.github/agents/squad.agent.md` | ✅ Yes — tracked in git | CCA (indirectly) |
| `.ai-team/decisions.md` | ❌ No — gitignored | Not needed by workflows |
| `.ai-team/team.md` | ❌ No — gitignored | Not needed by workflows |

---

## 4. Event Model

Map GitHub webhook events to Squad lifecycle events:

| GitHub Event | Conditions | Squad Action | Workflow |
|---|---|---|---|
| `issues.opened` | label: `proposal` | New proposal intake, template validation, welcome comment | `squad-proposal-lifecycle.yml` |
| `issue_comment.created` | label: `proposal` + `status:draft`, author is repo owner | Consensus tracking — detect approval/rejection keywords | `squad-consensus.yml` |
| `issues.labeled` | label: `status:approved` + `proposal` | Sprint planning trigger — create work items from decomposition | `squad-sprint-planner.yml` |
| `issues.labeled` | label: `cca-eligible` | Auto-assign `@copilot` to work item | `squad-cca-dispatch.yml` |
| `pull_request.opened` | branch: `copilot/*` | CCA work in progress — link to parent proposal | `squad-cca-dispatch.yml` |
| `pull_request.closed` (merged) | branch: `copilot/*` or `squad/*` | Work complete — update parent proposal status | `squad-cca-dispatch.yml` |
| `schedule` (cron: daily) | — | Daily standup digest | `squad-standup.yml` |
| `schedule` (cron: weekly) | — | Stale proposal cleanup | `squad-stale-proposals.yml` |

### Event Flow Diagram

```
User: "I'd like a proposal for X"
         │
         ▼
┌─────────────────────────┐
│ Coordinator (CLI)       │
│ gh issue create         │
│ --label proposal        │
└────────┬────────────────┘
         │ issues.opened
         ▼
┌─────────────────────────┐
│ squad-proposal-lifecycle│
│ • validate template     │
│ • ensure status:draft   │
│ • post welcome comment  │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Coordinator (CLI)       │
│ Agent analysis posted   │
│ as issue comments       │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Brady comments          │
│ "approved"              │
└────────┬────────────────┘
         │ issue_comment.created
         ▼
┌─────────────────────────┐
│ squad-consensus         │
│ • detect approval       │
│ • add status:approved   │
└────────┬────────────────┘
         │ issues.labeled (status:approved)
         ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│ squad-proposal-lifecycle│      │ squad-sprint-planner    │
│ • remove status:draft   │      │ • parse work items      │
│ • post approval notice  │      │ • create sub-issues     │
└─────────────────────────┘      └────────┬────────────────┘
                                          │ issues.labeled (cca-eligible)
                                          ▼
                                 ┌─────────────────────────┐
                                 │ squad-cca-dispatch      │
                                 │ • assign @copilot       │
                                 └────────┬────────────────┘
                                          │ CCA works...
                                          │ pull_request.opened
                                          ▼
                                 ┌─────────────────────────┐
                                 │ squad-cca-dispatch      │
                                 │ • link PR to proposal   │
                                 │ • post status update    │
                                 └─────────────────────────┘
                                          │ pull_request.closed (merged)
                                          ▼
                                 ┌─────────────────────────┐
                                 │ Parent proposal updated │
                                 │ All items done? → close │
                                 └─────────────────────────┘
```

---

## 5. CCA + Actions Integration

This is the bridge between Brady's "async comms" desire and the GitHub-native proposal system.

### The Async Loop

```
Brady (phone, 11pm)
  └→ Opens GitHub Mobile
  └→ Creates issue: "Add dark mode support"
  └→ Labels: proposal, squad
  └→ Assigns: @copilot (if it's a small, CCA-eligible task)

Actions (11:00:01pm)
  └→ squad-proposal-lifecycle triggers
  └→ Validates template, posts welcome comment
  └→ Ensures status:draft label

CCA (11:01pm — if assigned)
  └→ Reads squad.agent.md for governance
  └→ Creates copilot/dark-mode branch
  └→ Implements under Squad conventions (JSDoc, node:test — per 031 verification)
  └→ Opens draft PR: "Closes #42"

Actions (11:05pm)
  └→ squad-cca-dispatch triggers on PR open
  └→ Posts status update on proposal #42
  └→ CI runs on the PR

Brady (7am, next morning)
  └→ Opens GitHub Mobile
  └→ Sees PR notification
  └→ Reviews diff, approves, merges
  └→ Issue #42 auto-closes via "Closes #42"
```

**That's the async loop.** No Telegram. No Discord. No tunnels. No bridges. GitHub IS the async surface. Actions is the automation backbone. CCA is the worker. Mobile is the human interface.

### Validating the Loop — Integration with Proposal 031

Proposal 031 designs CCA E2E tests. The smoke test should be extended to validate the Actions integration:

**Extended smoke test steps:**

1. Create a test issue with `proposal` + `cca-eligible` labels
2. Verify `squad-proposal-lifecycle` fires (welcome comment posted)
3. Verify `squad-cca-dispatch` fires (CCA assigned)
4. Wait for CCA to open a PR
5. Verify `squad-cca-dispatch` fires again (status posted to parent issue)
6. Verify CI passes on CCA's PR
7. Verify CCA followed `squad.agent.md` governance (JSDoc + `node:test` — the two-signal verification from 031)

This extends the existing `cca-e2e-verify.yml` workflow from 031 to also verify Actions automation, not just CCA output.

### CCA Governance Constraint (from 031)

Critical constraint discovered in 031: **`.ai-team/` is gitignored on main.** CCA cannot read `.ai-team/decisions.md`. All CCA governance must be self-contained in `.github/agents/squad.agent.md`. Actions workflows have the same constraint — they can't read `.ai-team/` state either. Both CCA and Actions operate on GitHub API state (issues, labels, comments) and the tracked file `.github/agents/squad.agent.md`.

This is actually cleaner. It means Actions workflows don't need to parse Squad's filesystem format. They work entirely with GitHub's native primitives: issues, labels, comments, PRs. Squad's filesystem state and GitHub API state are independent layers that don't need to sync.

---

## 6. What Ships in v0.3.0 vs. Later

### Phase 1 — v0.3.0 (Ships with 032)

| Workflow | File | Priority | Effort |
|----------|------|----------|--------|
| **Proposal Lifecycle** | `squad-proposal-lifecycle.yml` | P0 — Core | 2-3h |
| **Consensus Engine** | `squad-consensus.yml` | P0 — Core | 2-3h |
| **Stale Cleanup** | `squad-stale-proposals.yml` | P1 — Important | 1-2h |

**Total: 5-8 hours.** These three workflows automate the core proposal lifecycle from 032. They're simple, low-risk, and immediately valuable.

**Why these three:**
- **Proposal Lifecycle** eliminates manual label management. Every new proposal gets correct labels and a welcome message. Every approval gets correct label transitions.
- **Consensus Engine** automates the approval signal. Brady comments "approved" → labels transition automatically. No manual label clicking.
- **Stale Cleanup** prevents the proposal graveyard. Proposals that die get cleaned up without human intervention.

**What v0.3.0 does NOT include:**
- Sprint planner (requires structured work decomposition — depends on agents posting in a specific format)
- CCA dispatch (CCA integration should be validated via 031 first)
- Daily standup (nice-to-have, not essential)
- Agent comment poster Action (Approach A, direct posting via CLI, is sufficient)

### Phase 2 — v0.4.0

| Workflow | File | Priority | Effort |
|----------|------|----------|--------|
| **CCA Dispatch** | `squad-cca-dispatch.yml` | P1 | 3-4h |
| **Sprint Planner** | `squad-sprint-planner.yml` | P1 | 3-4h |
| **Daily Standup** | `squad-standup.yml` | P2 | 2-3h |

**Prerequisite:** CCA E2E smoke test (031) must pass ≥ 4/5 times. We don't automate CCA dispatch until we know CCA follows governance.

### Phase 3 — v0.5.0+

| Capability | Notes |
|---|---|
| **Reusable workflows** | Extract shared patterns into `bradygaster/squad-actions` repo |
| **Composite actions** | Package common steps (label management, comment posting) |
| **Cross-repo workflows** | Squad workflows that operate across multiple repos |
| **Agent comment poster (Approach B)** | Drop-box to comment pipeline via Actions |
| **Metrics dashboard** | Track proposal velocity, CCA success rate, cycle time |

---

## 7. Labels Required

These workflows depend on a consistent label set. Squad should create these during `squad init` or provide a setup script:

```bash
# Core labels for proposal lifecycle
gh label create "proposal" --color "0075ca" --description "Squad proposal" --force
gh label create "squad" --color "e4e669" --description "Managed by Squad" --force
gh label create "status:draft" --color "fbca04" --description "Proposal in draft" --force
gh label create "status:reviewing" --color "c5def5" --description "Proposal under review" --force
gh label create "status:approved" --color "0e8a16" --description "Proposal approved" --force
gh label create "status:rejected" --color "d93f0b" --description "Proposal rejected" --force
gh label create "status:implementing" --color "1d76db" --description "Work in progress" --force
gh label create "status:shelved" --color "d4c5f9" --description "Proposal shelved (inactive)" --force
gh label create "stale" --color "ededed" --description "No recent activity" --force
gh label create "cca-eligible" --color "bfd4f2" --description "Can be assigned to Copilot Coding Agent" --force
gh label create "squad:standup" --color "c2e0c6" --description "Squad standup thread" --force
```

This could be a `squad setup-labels` command or part of the init flow.

---

## 8. Security Considerations

### Workflow Permissions

All workflows use the minimum required permissions:

| Workflow | Permissions | Why |
|---|---|---|
| Proposal Lifecycle | `issues: write`, `contents: read` | Create/update labels and comments; read repo for checkout |
| Consensus | `issues: write` | Update labels and state |
| Stale Cleanup | `issues: write` | Label, comment, close issues |
| CCA Dispatch | `issues: write`, `pull-requests: read` | Assign users, read PR details |
| Standup | `issues: write`, `contents: read` | Create/comment on standup issue |

### Comment Injection Risk

Workflows that post comments using issue body content could be vulnerable to injection if a malicious issue body contains GitHub Actions expressions or markdown that renders misleadingly. Mitigations:
- All comment content is constructed in JavaScript (`actions/github-script`), not interpolated in shell
- Issue body content is never evaluated as code
- The `actions/github-script` approach is safer than shell-based `gh issue comment` with variable interpolation

### Rate Limits

Per 028a: 5,000 REST API calls/hour. A single proposal lifecycle (create → label → comment → approve → work items) consumes ~10-15 API calls. Even with 50 proposals/day (unrealistic), we'd use <750 calls/hour. Rate limits are not a concern.

---

## 9. Integration with Existing Workflows

Squad already has two workflows:

| Existing | What It Does | Interaction with New Workflows |
|---|---|---|
| `ci.yml` | Runs `npm test` on push/PR to main/dev | CCA PRs trigger CI automatically — no changes needed |
| `release.yml` | Two-phase release (preview → ship) | No interaction — release is orthogonal to proposals |

New workflows are additive. They don't modify or conflict with existing CI or release workflows.

---

## 10. Open Questions

1. **Should the consensus engine require multiple approvers?** Current design: repo owner's approval is sufficient. For larger teams, consider configurable approval threshold (N approvers from a reviewers list).

2. **Should the standup post to a Discussion instead of an Issue?** Discussions have threading. Issues are flat. But Issues are already the proposal surface — adding Discussions introduces a second communication channel. Recommendation: stay with Issues for now.

3. **How do we handle workflow failures?** If `squad-consensus.yml` fails to detect an approval, the proposal stalls. Mitigation: manual label management always works as fallback. Actions automate the happy path.

4. **Should `squad init` install workflows automatically or require explicit opt-in?** Recommendation: opt-in. Users should know what workflows they're enabling. Print the list, ask for confirmation.

---

## Trade-offs

### What We Gain
- **Persistent automation.** Proposal lifecycle runs without a CLI session. Brady closes his laptop, the system keeps working.
- **Event-driven precision.** No polling, no "check if anything changed." GitHub fires events, Actions responds.
- **CCA orchestration.** Work items flow to CCA automatically. The async loop closes without human intervention.
- **Consistency.** Every proposal gets the same labels, the same welcome message, the same stale cleanup. No human variability.

### What We Lose
- **Complexity.** Six workflow files vs. zero today. More YAML to maintain, more Actions to debug.
- **Coupling to GitHub.** These workflows are GitHub-specific. ADO and GitLab equivalents would need separate implementations. Mitigated by 032's provider abstraction design — when we add providers, we add equivalent automation.
- **Actions minutes.** Every event trigger consumes Actions compute. For `bradygaster/squad` (public repo), Actions are free. For private repos, this burns against the monthly allotment. The workflows are lightweight (JavaScript in `actions/github-script`, no heavy builds), so per-run cost is minimal.

### What We Explicitly Defer
- Reusable workflows / composite actions (stabilize patterns first)
- Cross-repo workflow orchestration
- Agent comment poster via Actions (Approach B) — direct posting is sufficient
- Metrics / analytics dashboard
- Configurable approval thresholds

---

## Recommendation

**Ship the Phase 1 trio (Proposal Lifecycle, Consensus, Stale Cleanup) alongside Keaton's 032 implementation.** These three workflows are the automation backbone that makes 032's proposal lifecycle work asynchronously. Without them, 032's lifecycle depends on someone running Copilot CLI. With them, the lifecycle runs itself.

Phase 2 (CCA Dispatch, Sprint Planner, Standup) waits for 031's CCA validation to pass. We don't automate CCA assignment until we know CCA follows governance.

The key insight: **Actions doesn't replace agents — it connects them.** Agents do the thinking (analysis, code, reviews). Actions does the plumbing (label transitions, notifications, CCA assignment, cleanup). Together, they close the async loop that Brady has been asking for since Proposal 017.

---

*This proposal was written by Kujan (Copilot SDK Expert). It is the companion to Keaton's Proposal 032 and covers the automation layer that makes 032's lifecycle persistent and event-driven.*
