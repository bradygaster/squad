---
name: "external-comms"
description: "PAO workflow for scanning, drafting, and presenting community responses with human review gate"
domain: "community, communication, workflow"
confidence: "low"
source: "manual (RFC #426 — PAO External Communications)"
tools:
  - name: "github-mcp-server-list_issues"
    description: "List open issues for scan candidates and lightweight triage"
    when: "Use for recent open issue scans before thread-level review"
  - name: "github-mcp-server-issue_read"
    description: "Read the full issue, comments, and labels before drafting"
    when: "Use after selecting a candidate so PAO has complete thread context"
  - name: "github-mcp-server-search_issues"
    description: "Search for candidate issues or prior squad responses"
    when: "Use when filtering by keywords, labels, or duplicate response checks"
  - name: "gh CLI"
    description: "Fallback for GitHub issue comments and discussions workflows"
    when: "Use gh issue list/comment and gh api or gh api graphql when MCP coverage is incomplete"
---

## Context

Phase 1 is **draft-only mode**.

- PAO scans issues and discussions, drafts responses with the humanizer skill, and presents a review table for human approval.
- **Human review gate is mandatory** — PAO never posts autonomously.
- Every action is logged to `.squad/comms/audit/`.
- This workflow is triggered manually ("PAO, check community") or when Ralph detects the `squad:needs-response` label.

## Patterns

### 1. Scan

Find unanswered community items with GitHub MCP tools first, or `gh issue list` / `gh api` as fallback for issues and discussions.

- Include **open** issues and discussions only.
- Filter for items with **no squad team response**.
- Limit to items created in the last 7 days.
- Exclude items labeled `squad:internal` or `wontfix`.
- Include discussions **and** issues in the same sweep.

### 2. Classify

Determine the response type before drafting.

- Welcome (new contributor)
- Troubleshooting (bug/help)
- Feature guidance (feature request/how-to)
- Redirect (wrong repo/scope)
- Acknowledgment (confirmed, no fix)
- Closing (resolved)
- Technical uncertainty (unknown cause)

### 3. Draft

Use the humanizer skill for every draft.

- Read the **full thread**, including all comments, before writing.
- Classify the response type.
- Draft with the humanizer patterns and the matching template.
- Validate the draft against the humanizer anti-patterns.
- Flag long threads (`>10` comments) with `⚠️`.

### 4. Present

Show drafts for review in this exact format:

```text
📝 PAO — Community Response Drafts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| # | Item | Author | Type | Confidence | Preview |
|---|------|--------|------|------------|---------|
| 1 | Issue #N | @user | Type | 🟢/🟡/🔴 | "First words..." |

Confidence: 🟢 High | 🟡 Medium | 🔴 Needs review

Full drafts below ▼
```

### 5. Human Action

Wait for explicit human direction before anything is posted.

- `pao approve 1 3` — approve drafts 1 and 3
- `pao edit 2` — edit draft 2
- `pao skip` — skip all
- `pao halt` — freeze all pending (safe word)

### 6. Post

After approval:

- Human posts via `gh issue comment` or `gh api`.
- PAO helps by preparing the CLI command.
- Write the audit entry after the posting action.

### 7. Audit

Log every action.

- Location: `.squad/comms/audit/{timestamp}.md`
- Required fields: action, item, draft content, reviewer, outcome, timestamp

## Examples

### Example scan command

```bash
gh issue list --state open --json number,title,author,labels,comments --limit 20
```

### Example review table

```text
📝 PAO — Community Response Drafts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| # | Item | Author | Type | Confidence | Preview |
|---|------|--------|------|------------|---------|
| 1 | Issue #426 | @newdev | Welcome | 🟢 | "Hey @newdev! Welcome to Squad..." |
| 2 | Discussion #18 | @builder | Feature guidance | 🟡 | "Great question! Today the CLI..." |
| 3 | Issue #431 ⚠️ | @debugger | Technical uncertainty | 🔴 | "Interesting find, @debugger..." |

Confidence: 🟢 High | 🟡 Medium | 🔴 Needs review

Full drafts below ▼
```

### Example audit entry

```markdown
# PAO External Comms Audit

- action: posted
- item: Issue #426
- draft content: |
    Hey @newdev! Welcome to Squad 👋 Thanks for opening this.
    We reproduced the issue in preview builds and we're checking the regression point now.
    Let us know if you can share the command you ran right before the failure.
- reviewer: @bradygaster
- outcome: approved and posted via gh issue comment
- timestamp: 2026-03-16T21:30:00Z
```

## Anti-Patterns

- ❌ Posting without human review (NEVER — this is the cardinal rule)
- ❌ Drafting without reading full thread (context is everything)
- ❌ Ignoring confidence flags (🔴 items need Flight/human review)
- ❌ Scanning closed issues (only open items)
- ❌ Responding to issues labeled `squad:internal` or `wontfix`
- ❌ Skipping audit logging (every action must be recorded)
- ❌ Drafting for issues where a squad member already responded (avoid duplicates)
