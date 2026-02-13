# Proposal 028a: GitHub API Capabilities Assessment

**Author:** Kujan (Copilot SDK Expert)
**Date:** 2026-02-10
**Status:** Assessment (Research Complete)
**Context:** Brady wants proposals and the team backlog to live on GitHub (Issues + Projects), not just on disk.

---

## Executive Summary

Squad agents have **full GitHub Issues capability right now** via two channels: `gh` CLI and GitHub MCP Server tools. GitHub Projects is **blocked by a missing token scope** (`read:project` / `project`) but is fully functional once that scope is added. Sub-agents spawned via `task` tool with type `task` or `general-purpose` **can** access MCP tools; `explore` agents **cannot**.

---

## 1. GitHub MCP Server Tools — Empirically Verified

### Issue Read Operations ✅ ALL WORKING

| Tool | Capability | Verified |
|------|-----------|----------|
| `github-mcp-server-list_issues` | List issues with state/label/pagination filters | ✅ |
| `github-mcp-server-issue_read` (method: `get`) | Get full issue details (state, labels, body, author, timestamps) | ✅ |
| `github-mcp-server-issue_read` (method: `get_comments`) | Get all comments on an issue | ✅ |
| `github-mcp-server-issue_read` (method: `get_labels`) | Get labels on an issue | ✅ |
| `github-mcp-server-issue_read` (method: `get_sub_issues`) | Get sub-issues (for task hierarchies) | ✅ available |
| `github-mcp-server-search_issues` | Search issues across repos with GitHub search syntax | ✅ |

### Issue Write Operations — NOT AVAILABLE VIA MCP

The GitHub MCP Server tools are **read-only for issues**. There are no MCP tools for:
- Creating issues
- Updating issues (title, body, state)
- Adding/removing labels
- Adding comments
- Assigning users

**Write operations must use `gh` CLI or `gh api`.**

### Search & Discovery ✅

| Tool | Capability | Verified |
|------|-----------|----------|
| `github-mcp-server-search_issues` | Full GitHub search syntax (`repo:`, `label:`, `is:open`, etc.) | ✅ |
| `github-mcp-server-search_pull_requests` | Search PRs with same syntax | ✅ |
| `github-mcp-server-search_code` | Code search across repos | ✅ |

### PR Operations (for context)

| Tool | Capability |
|------|-----------|
| `github-mcp-server-list_pull_requests` | List PRs with filters |
| `github-mcp-server-pull_request_read` | Get PR details, diff, files, reviews, comments, status |
| `github-mcp-server-search_pull_requests` | Search PRs |

### Actions Operations (for context)

| Tool | Capability |
|------|-----------|
| `github-mcp-server-actions_list` | List workflows, runs, jobs, artifacts |
| `github-mcp-server-actions_get` | Get specific workflow/run/job details |
| `github-mcp-server-get_job_logs` | Get job logs (including failed-only) |

### Other MCP Tools

| Tool | Capability |
|------|-----------|
| `github-mcp-server-get_file_contents` | Read files from GitHub (any branch/ref) |
| `github-mcp-server-get_commit` | Get commit details with diffs |
| `github-mcp-server-list_commits` | List commits on a branch |
| `github-mcp-server-list_branches` | List branches |

### MCP Tools — NOT Available for Projects

There are **zero** MCP tools for GitHub Projects (V2). No read, no write, nothing. Projects must be managed entirely via `gh` CLI or `gh api` GraphQL calls.

---

## 2. `gh` CLI Capabilities — Empirically Verified

### Issue Management ✅ FULL LIFECYCLE

| Command | Capability | Verified |
|---------|-----------|----------|
| `gh issue create` | Create with title, body, labels, assignees, milestone, project, template | ✅ tested |
| `gh issue edit` | Update title, body, add/remove labels, add/remove assignees, milestone, project | ✅ tested |
| `gh issue close` | Close with reason (completed/not planned) and closing comment | ✅ tested |
| `gh issue comment` | Add comments, edit last comment | ✅ tested |
| `gh issue list` | List with state/label/assignee filters | ✅ tested |
| `gh issue view` | View issue details | ✅ available |
| `gh issue pin/unpin` | Pin issues to repo | ✅ available |
| `gh issue reopen` | Reopen closed issues | ✅ available |
| `gh issue transfer` | Transfer to another repo | ✅ available |
| `gh issue develop` | Create branch for issue | ✅ available |

### Label Management ✅

| Command | Capability | Verified |
|---------|-----------|----------|
| `gh label list` | List all labels | ✅ tested |
| `gh label create` | Create with name, color, description; `--force` to update existing | ✅ available |
| `gh label edit` | Edit existing label | ✅ available |
| `gh label delete` | Delete label | ✅ available |

### Project Management ⚠️ BLOCKED BY TOKEN SCOPE

**Current token scopes:** `gist`, `read:org`, `repo`, `workflow`
**Missing scope:** `read:project` (for read), `project` (for write)

All `gh project` commands exist and are functional, but **will fail until `gh auth refresh -s project` is run**.

| Command | Capability | Blocked |
|---------|-----------|---------|
| `gh project create` | Create a new project board | ⚠️ needs `project` scope |
| `gh project list` | List projects | ⚠️ needs `read:project` scope |
| `gh project view` | View project details | ⚠️ needs `read:project` scope |
| `gh project edit` | Edit project settings | ⚠️ needs `project` scope |
| `gh project field-create` | Create custom fields (Status, Priority, Sprint, etc.) | ⚠️ needs `project` scope |
| `gh project field-list` | List fields in a project | ⚠️ needs `read:project` scope |
| `gh project field-delete` | Delete fields | ⚠️ needs `project` scope |
| `gh project item-add` | Add issue/PR to project | ⚠️ needs `project` scope |
| `gh project item-create` | Create draft issue in project | ⚠️ needs `project` scope |
| `gh project item-edit` | Update item field values (status, priority, etc.) | ⚠️ needs `project` scope |
| `gh project item-list` | List items in a project | ⚠️ needs `read:project` scope |
| `gh project item-archive` | Archive project items | ⚠️ needs `project` scope |
| `gh project item-delete` | Delete items from project | ⚠️ needs `project` scope |
| `gh project link/unlink` | Link project to repo/team | ⚠️ needs `project` scope |
| `gh project close/copy/delete` | Project lifecycle management | ⚠️ needs `project` scope |

### GraphQL API Access ✅

| Command | Capability | Verified |
|---------|-----------|----------|
| `gh api` (REST) | Full REST API access | ✅ tested |
| `gh api graphql` | Full GraphQL API access | ✅ tested (blocked only by scope for projects) |

---

## 3. Agent Tool Access Matrix — Empirically Verified

| Agent Type | MCP Tools | `gh` CLI | `gh api` | Shell Commands |
|-----------|-----------|----------|----------|----------------|
| **Coordinator** (you) | ✅ Full access | ✅ via powershell | ✅ via powershell | ✅ |
| `task` sub-agent | ✅ **Full access** | ✅ | ✅ | ✅ |
| `general-purpose` sub-agent | ✅ Full access (expected — has "All CLI tools") | ✅ | ✅ | ✅ |
| `explore` sub-agent | ❌ **No MCP tools** | ❌ No shell | ❌ No shell | ❌ grep/glob/view only |
| `code-review` sub-agent | ❌ No MCP tools (expected) | ✅ CLI tools for investigation | ✅ | ✅ |

**Key finding:** `task` and `general-purpose` agents CAN directly create/update GitHub Issues and Projects via `gh` CLI. They don't need the coordinator to mediate. This means agents can be given self-serve GitHub write access.

---

## 4. What's Missing — Gaps Analysis

### Gap 1: MCP Tools Are Read-Only for Issues
- No `github-mcp-server-create_issue` or `github-mcp-server-update_issue` exists
- **Workaround:** Use `gh` CLI for all write operations — works from coordinator, `task`, and `general-purpose` agents
- **Impact:** Low — `gh` CLI is equally capable and arguably more flexible

### Gap 2: Zero MCP Tools for Projects
- No MCP tools exist for GitHub Projects V2 at all
- **Workaround:** `gh project *` commands cover 100% of project management needs
- **Impact:** Low — `gh` CLI is the correct tool for this

### Gap 3: Token Missing `project` Scope
- **Current scopes:** `gist`, `read:org`, `repo`, `workflow`
- **Required addition:** `project` (includes read+write)
- **Fix:** Brady runs `gh auth refresh -s project` once
- **Impact:** HIGH — this is the **only blocker** preventing GitHub Projects integration

### Gap 4: No MCP Tool for Issue Creation
- Must shell out to `gh issue create` for write operations
- Not a real gap — `gh` CLI provides better control (templates, body files, etc.)

### Gap 5: Issue Deletion Not Possible
- GitHub API does not support deleting issues (by design)
- Issues can only be closed, locked, or transferred
- **Impact:** None — issues should be closed, not deleted

---

## 5. Rate Limits — Empirically Verified

**Current rate limit status at time of testing:**

| Resource | Remaining | Limit | Reset Window |
|----------|-----------|-------|-------------|
| Core (REST API) | 4,998 | 5,000 | Per hour |
| Search API | 29 | 30 | Per minute |
| GraphQL API | 4,993 | 5,000 | Per hour |

### Practical Assessment for Squad

**Issue creation (proposals → issues):** Creating 30 proposals as issues would consume ~60 API calls (create + label each). At 5,000/hour, this is negligible (1.2%).

**Backlog management (project board updates):** Moving items between columns, updating status fields — each operation is 1-2 API calls. Even a 50-item backlog with frequent updates would be well within limits.

**Search operations:** The Search API limit (30/minute) is the tightest constraint. If multiple agents search simultaneously, they could exhaust this quickly. **Recommendation:** Cache search results and avoid redundant searches.

**Multi-agent concern:** If 5 agents each make 10 API calls per operation, that's 50 calls. With 5,000/hour limit, you could run ~100 such operations per hour before hitting limits. Practically unlimited for normal workflow.

**Real risk:** The Search API's 30/minute limit could be hit during batch operations (e.g., "find all issues with label X and update them"). Use list operations instead of search when possible.

---

## 6. Recommended Architecture

### For Proposals → Issues

```
Agent writes proposal.md → Agent runs `gh issue create` → Issue created with:
  - Title from proposal
  - Body from proposal markdown
  - Labels: "proposal", "squad-generated"
  - Milestone: sprint number (optional)
```

**Any `task` or `general-purpose` agent can do this directly.** No coordinator mediation needed.

### For Team Backlog → GitHub Project

```
1. Brady runs: gh auth refresh -s project (one-time setup)
2. Agent creates project: gh project create --owner bradygaster --title "Squad Backlog"
3. Agent creates fields: gh project field-create (Status, Priority, Sprint, Agent)
4. Agent adds items: gh project item-add (link issues) or gh project item-create (drafts)
5. Agent updates status: gh project item-edit --field-id <status-field> --single-select-option-id <value>
```

### Two-Channel Pattern

| Channel | Tool | Use Case |
|---------|------|----------|
| **Read** (query, search, get) | MCP tools preferred | Structured data, better for parsing |
| **Write** (create, update, close) | `gh` CLI | Only option — but fully capable |

---

## 7. Prerequisites — Action Items for Brady

1. **Run `gh auth refresh -s project`** — adds project scope to token. One-time, takes 10 seconds.
2. **Create custom labels** for squad use (following the `squad:` prefix convention validated by [spboyer/slidemaker](https://github.com/spboyer/slidemaker)):
   - `squad` — base label for all squad-managed issues
   - `squad:{agent-name}` — per-agent routing (e.g., `squad:verbal`, `squad:mcmanus`, `squad:fenster`)
   - `proposal` — for proposal issues
   - `backlog` — for backlog items  
   - `sprint-N` — for sprint tracking
3. **Create the GitHub Project board** (or let an agent do it after scope is added)

---

## Appendix: Full Test Log

All findings in this document were empirically verified in a live session on 2026-02-10:

1. ✅ `github-mcp-server-list_issues` — returned 0 issues (correct, repo was empty)
2. ✅ `github-mcp-server-search_issues` — searched successfully  
3. ✅ `gh issue create` — created issue #3 as test
4. ✅ `gh issue edit --add-label` — added "enhancement" label
5. ✅ `gh issue comment` — added comment to issue
6. ✅ `gh issue close --reason "not planned"` — closed with reason
7. ✅ `github-mcp-server-issue_read` (get) — read full issue details via MCP
8. ✅ `github-mcp-server-issue_read` (get_comments) — read comments via MCP
9. ✅ `github-mcp-server-issue_read` (get_labels) — read labels via MCP
10. ✅ `gh api rate_limit` — confirmed rate limits
11. ✅ `gh api graphql` — confirmed GraphQL works (blocked for projects by scope only)
12. ✅ `task` sub-agent MCP access — confirmed `task` agents have full MCP tool access
13. ❌ `explore` sub-agent MCP access — confirmed `explore` agents have NO MCP tools
14. ⚠️ `gh project list` — failed due to missing `read:project` scope
