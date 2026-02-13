# Proposal 033a: GitHub Projects V2 API — Feasibility Assessment

**Author:** Kujan (Copilot SDK Expert)  
**Date:** 2026-02-10  
**Status:** Assessment (Research Complete)  
**Context:** Issue #6 (londospark) requests GitHub Projects V2 board integration for Squad agents  
**Builds on:** 028a (GitHub API Capabilities), 032a (Provider Abstraction Architecture)

---

## Executive Summary

Projects V2 integration is **feasible with zero npm dependencies** using `gh project *` CLI commands. The `gh` CLI wraps every Projects V2 GraphQL mutation/query behind ergonomic subcommands — agents never need to write raw GraphQL. The only blocker is the missing `project` token scope (same finding as 028a). The GitHub MCP server has **zero** Projects V2 tools, so `gh` CLI is the sole channel. Provider abstraction maps cleanly: GitHub Projects V2, Azure DevOps Boards, and GitLab Issue Boards all reduce to the same "board with columns and items" model at the prompt level.

**Recommendation:** Implement as an opt-in skill, not a core feature. Use `gh project *` CLI commands exclusively. No GraphQL client dependency needed.

---

## 1. API Surface

### 1.1 Required Operations & `gh` CLI Equivalents

The issue proposes raw GraphQL mutations. Every one maps to a `gh project` subcommand:

| Operation | GraphQL Mutation | `gh` CLI Command | Notes |
|-----------|-----------------|-------------------|-------|
| Create board | `createProjectV2` | `gh project create --owner {owner} --title "{title}" --format json` | Returns project number |
| List projects | `projectsV2` query | `gh project list --owner {owner} --format json` | Paginated |
| Add issue to board | `addProjectV2ItemById` | `gh project item-add {number} --owner {owner} --url {issue_url} --format json` | Returns item ID |
| Create draft item | N/A (not a single mutation) | `gh project item-create {number} --owner {owner} --title "{title}" --body "{body}" --format json` | Draft issues live only on the board |
| Update field value | `updateProjectV2ItemFieldValue` | `gh project item-edit --id {item_id} --project-id {project_id} --field-id {field_id} --single-select-option-id {option_id}` | Status changes |
| Delete item | `deleteProjectV2Item` | `gh project item-delete {number} --owner {owner} --id {item_id}` | |
| Archive item | `archiveProjectV2Item` | `gh project item-archive {number} --owner {owner} --id {item_id}` | Preferred over delete |
| List items | `projectV2.items` query | `gh project item-list {number} --owner {owner} --format json --limit 100` | |
| List fields | `projectV2.fields` query | `gh project field-list {number} --owner {owner} --format json` | Returns field IDs + option IDs |
| Create field | `createProjectV2Field` | `gh project field-create {number} --owner {owner} --name "{name}" --data-type "SINGLE_SELECT"` | |
| Link to repo | `linkProjectV2ToRepository` | `gh project link {number} --owner {owner} --repo {owner}/{repo}` | |

### 1.2 Querying Items by Status

The `gh` CLI does **not** support server-side filtering by field value. Two approaches:

**Approach A: `gh project item-list` + `jq` (Recommended)**
```bash
# Get all items with their status
gh project item-list 1 --owner bradygaster --format json --limit 100 \
  | jq '[.items[] | select(.status == "Todo")]'
```

**Approach B: Raw GraphQL via `gh api graphql` (Fallback)**
```bash
gh api graphql -f query='
  query($org: String!, $num: Int!) {
    user(login: $org) {
      projectV2(number: $num) {
        items(first: 100) {
          nodes {
            id
            content {
              ... on Issue { number title state }
              ... on PullRequest { number title state }
              ... on DraftIssue { title }
            }
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }
' -f org=bradygaster -F num=1
```

**Key limitation:** GraphQL has no server-side filter for field values. All queries fetch all items and filter client-side. For Squad-scale boards (< 200 items), this is negligible.

### 1.3 Required Token Scopes

| Scope | Operations | Current State |
|-------|-----------|---------------|
| `project` | All read + write operations | ❌ **Missing** |
| `read:project` | Read-only (list, view, item-list) | ❌ Missing (subsumed by `project`) |
| `repo` | Required alongside `project` for linking issues | ✅ Present |

**Current scopes:** `gist`, `read:org`, `repo`, `workflow`

**Fix:** `gh auth refresh -s project` — one-time, interactive, ~10 seconds.

### 1.4 Full GraphQL Examples (Reference Only)

These are provided for completeness. **Agents should use `gh project *` commands, not raw GraphQL.**

#### Create a Project
```graphql
mutation($ownerId: ID!, $title: String!) {
  createProjectV2(input: { ownerId: $ownerId, title: $title }) {
    projectV2 { id number title }
  }
}
```

#### Add Issue to Project
```graphql
mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item { id }
  }
}
```

#### Update Status Field
```graphql
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId,
    itemId: $itemId,
    fieldId: $fieldId,
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item { id }
  }
}
```

#### Query Items with Status
```graphql
query($login: String!, $number: Int!) {
  user(login: $login) {
    projectV2(number: $number) {
      id
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id name
            options { id name }
          }
        }
      }
      items(first: 100) {
        nodes {
          id
          content {
            ... on Issue { number title state }
            ... on DraftIssue { title }
          }
          fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name optionId }
          }
        }
      }
    }
  }
}
```

---

## 2. Copilot CLI Context

### 2.1 Can Agents Call the GraphQL API?

| Method | Works? | Dependency | Agent Types |
|--------|--------|-----------|-------------|
| `gh project *` commands | ✅ | None (gh CLI pre-installed) | Coordinator, `task`, `general-purpose` |
| `gh api graphql -f query='...'` | ✅ | None | Coordinator, `task`, `general-purpose` |
| `fetch()` to api.github.com/graphql | ✅ | None (Node.js native) | Only via powershell/node |
| GitHub MCP Server tools | ❌ | N/A | **Zero Projects V2 MCP tools exist** |

**Recommendation:** Use `gh project *` commands exclusively.

- `gh project` wraps GraphQL internally — agents get ergonomic flags instead of mutation strings
- JSON output with `--format json` is machine-parseable
- `--jq` flag enables inline filtering without piping to external `jq`
- All ID resolution (field IDs, option IDs, project IDs) handled by `gh`

### 2.2 Agent Type Access Matrix

| Agent Type | Can manage boards? | How? |
|-----------|-------------------|------|
| **Coordinator** | ✅ | `powershell` tool → `gh project *` |
| **`task`** sub-agent | ✅ | Direct CLI access |
| **`general-purpose`** sub-agent | ✅ | Direct CLI access |
| **`explore`** sub-agent | ❌ | No shell access, no MCP tools for projects |
| **`code-review`** sub-agent | ✅ | CLI tools for investigation |

### 2.3 MCP Server Gap Analysis

Verified against the current GitHub MCP server tool inventory:

| MCP Tool | Projects V2 Support |
|----------|-------------------|
| `github-mcp-server-list_issues` | ❌ No project field data |
| `github-mcp-server-issue_read` | ❌ No project membership info |
| `github-mcp-server-search_issues` | ❌ Cannot filter by project |
| `github-mcp-server-list_pull_requests` | ❌ No project field data |
| `github-mcp-server-search_pull_requests` | ❌ Cannot filter by project |
| `github-mcp-server-actions_list` | N/A |
| `github-mcp-server-actions_get` | N/A |
| `github-mcp-server-get_job_logs` | N/A |
| `github-mcp-server-get_file_contents` | N/A |
| `github-mcp-server-get_commit` | N/A |
| `github-mcp-server-list_commits` | N/A |
| `github-mcp-server-list_branches` | N/A |
| `github-mcp-server-search_code` | N/A |
| `github-mcp-server-search_repositories` | N/A |
| `github-mcp-server-search_users` | N/A |
| `github-mcp-server-get_copilot_space` | N/A |

**Result: Zero MCP tools for Projects V2 — read or write.** This is consistent with the 028a finding. The `gh` CLI is the only integration path.

---

## 3. Zero-Dependency Constraint

### 3.1 Issue #6 Proposes "a GraphQL Client" — Reject This

The issue proposes integrating a GraphQL client library. This would:
- Add Squad's first npm dependency (currently zero)
- Be unnecessary — `gh project *` commands do everything
- Add maintenance burden (version pinning, security updates)

### 3.2 Three Zero-Dependency Alternatives

| Approach | Complexity | Reliability | Recommended? |
|----------|-----------|-------------|--------------|
| **`gh project *` CLI commands** | Low | High — `gh` handles auth, pagination, retries | ✅ **Yes** |
| `gh api graphql -f query='...'` | Medium | High — same auth, but agents must write GraphQL strings | Fallback only |
| `fetch()` against api.github.com/graphql | High | Medium — must handle auth headers, tokens, errors manually | ❌ No |

### 3.3 Recommended Pattern: `gh` CLI Only

```bash
# 1. Create a project
gh project create --owner bradygaster --title "Squad Backlog" --format json

# 2. List fields to get Status field ID and option IDs
gh project field-list 1 --owner bradygaster --format json

# 3. Add an issue to the project
gh project item-add 1 --owner bradygaster --url "https://github.com/bradygaster/squad/issues/6" --format json

# 4. Update item status (requires field-id and option-id from step 2)
gh project item-edit --id "PVTI_..." --project-id "PVT_..." --field-id "PVTSSF_..." --single-select-option-id "..."

# 5. List items with status
gh project item-list 1 --owner bradygaster --format json --limit 100

# 6. Archive completed items
gh project item-archive 1 --owner bradygaster --id "PVTI_..."
```

### 3.4 ID Resolution Workflow

The main complexity is **ID resolution** — `gh project item-edit` requires opaque IDs for project, field, and option. The workflow:

```
Step 1: gh project list → get project NUMBER
Step 2: gh project field-list NUMBER → get field IDs + option IDs
Step 3: gh project item-list NUMBER → get item IDs
Step 4: gh project item-edit --id ITEM --project-id PROJECT --field-id FIELD --single-select-option-id OPTION
```

This is a 4-step pipeline. An agent skill can encapsulate it.

---

## 4. Permission Model

### 4.1 Token Scope Detection

```bash
# Check if project scope is present
gh auth status 2>&1 | grep -q "project" && echo "OK" || echo "MISSING"
```

Or parse scopes programmatically:
```bash
SCOPES=$(gh auth status 2>&1 | grep "Token scopes" | sed "s/.*: '//;s/'//g")
echo "$SCOPES" | grep -q "project" && echo "HAS_PROJECT_SCOPE" || echo "NO_PROJECT_SCOPE"
```

### 4.2 Graceful Degradation Strategy

Projects V2 integration MUST be opt-in, not required:

| Condition | Behavior |
|-----------|----------|
| No `project` scope on token | Board operations silently skip; issues/labels still work |
| No project exists | Agent offers to create one (if scope present) |
| Project exists, no Status field | Agent creates default Status field with Todo/In Progress/Done |
| `gh` CLI not installed | Fall back to issues-only mode (028a pattern) |

### 4.3 Runtime Detection Pattern

```bash
# Detect at session start (add to coordinator prerequisite check)
if gh project list --owner bradygaster --limit 1 --format json 2>/dev/null; then
  echo "Projects V2: AVAILABLE"
else
  echo "Projects V2: UNAVAILABLE (missing scope or auth issue)"
fi
```

### 4.4 Token Upgrade Path

When scope is missing, the agent should output:
```
⚠ GitHub Projects integration requires the 'project' scope.
  Run: gh auth refresh -s project
  This is a one-time interactive step (~10 seconds).
```

The agent MUST NOT attempt `gh auth refresh` — it requires interactive browser auth.

---

## 5. Provider Abstraction

### 5.1 Cross-Provider Board Model

All three providers have a "board with columns and items" concept:

| Concept | GitHub Projects V2 | Azure DevOps Boards | GitLab Issue Boards |
|---------|-------------------|--------------------|--------------------|
| **Board** | Project (GraphQL-only) | Board (built-in per project) | Board (per project/group) |
| **Column** | Single-select field option (Status) | Column mapped to Work Item State | List mapped to Label |
| **Item** | Issue/PR/DraftIssue linked to project | Work Item (Bug, Story, Task) | Issue with label |
| **Move item** | `updateProjectV2ItemFieldValue` | Update `System.State` field | Swap labels |
| **Create board** | `createProjectV2` | Built-in (no API needed) | `POST /projects/:id/boards` |
| **API type** | GraphQL only | REST (JSON Patch) | REST |
| **CLI** | `gh project *` | `az boards *` | `glab board *` (limited) |
| **Auth scope** | `project` | Built-in (PAT with boards access) | `api` scope |

### 5.2 Abstraction Layer

Following the existing provider abstraction decision (032a), board operations are **prompt-level command templates**, not JS interfaces:

```markdown
## Board Commands (in team.md Platform section)

### GitHub
- Create board: `gh project create --owner {owner} --title "{title}" --format json`
- Add item: `gh project item-add {number} --owner {owner} --url {url} --format json`
- Move item: `gh project item-edit --id {item} --project-id {proj} --field-id {field} --single-select-option-id {opt}`
- List items: `gh project item-list {number} --owner {owner} --format json`

### Azure DevOps
- Create board: (built-in — no command needed)
- Add item: `az boards work-item create --type "User Story" --title "{title}" --org {org} --project {project}`
- Move item: `az boards work-item update --id {id} --state "{state}" --org {org}`
- List items: `az boards query --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.State] = '{state}'" --org {org}`

### GitLab
- Create board: `glab api POST /projects/{id}/boards -f name="{title}"`
- Add item: (issues auto-appear on board when labeled)
- Move item: `glab issue update {number} --unlabel "{old}" --label "{new}"`
- List items: `glab issue list --label "{status_label}"`
```

### 5.3 Key Divergences

| Divergence | Impact | Mitigation |
|-----------|--------|------------|
| GitHub boards are GraphQL-only; ADO/GitLab are REST | None — `gh`/`az`/`glab` CLI abstracts this | Use CLI commands, not raw API |
| ADO boards are built-in (no create step) | Minor — skip board creation for ADO | Provider-aware init sequence |
| GitLab boards are label-driven | Aligns with Squad's existing label-driven workflow skill | Labels serve double duty (status + board column) |
| ADO has first-class work item states; GitLab doesn't | ADO is actually simpler — `System.State` field vs label swaps | Abstract to "move item to status" |
| GitHub requires opaque IDs; ADO uses work item numbers | Adds complexity to GitHub path | Agent caches IDs after first lookup |

### 5.4 GitLab Actually Already Works

The existing `label-driven-workflow` skill (`.ai-team/skills/label-driven-workflow/SKILL.md`) already documents:
> **Provider Abstraction:** GitLab: `status:` → scoped labels (`status::value` with `::` for mutual exclusion)

GitLab Issue Boards display issues by label. If Squad already uses `status:todo`, `status:in-progress`, `status:done` labels, a GitLab board configured with those labels **is the board**. No additional API calls needed beyond label management.

---

## 6. Integration with Existing Squad Tools

### 6.1 Available MCP Server Tools — Coverage Matrix

| Tool | Category | Projects V2 Coverage |
|------|----------|---------------------|
| `github-mcp-server-list_issues` | Issues | ❌ No project fields |
| `github-mcp-server-issue_read` | Issues | ❌ No project membership |
| `github-mcp-server-search_issues` | Search | ❌ No `project:` filter |
| `github-mcp-server-list_pull_requests` | PRs | ❌ No project fields |
| `github-mcp-server-pull_request_read` | PRs | ❌ No project membership |
| `github-mcp-server-search_pull_requests` | Search | ❌ No `project:` filter |
| `github-mcp-server-search_code` | Code | N/A |
| `github-mcp-server-search_repositories` | Repos | N/A |
| `github-mcp-server-search_users` | Users | N/A |
| `github-mcp-server-get_file_contents` | Files | N/A |
| `github-mcp-server-get_commit` | Commits | N/A |
| `github-mcp-server-list_commits` | Commits | N/A |
| `github-mcp-server-list_branches` | Branches | N/A |
| `github-mcp-server-actions_list` | CI/CD | N/A |
| `github-mcp-server-actions_get` | CI/CD | N/A |
| `github-mcp-server-get_job_logs` | CI/CD | N/A |
| `github-mcp-server-get_copilot_space` | Copilot | N/A |

**Result: 0/17 MCP tools cover any Projects V2 operation.**

### 6.2 What's Missing vs. What's Available

| Operation | MCP Tool | `gh` CLI | Status |
|-----------|----------|----------|--------|
| Create project | ❌ | `gh project create` | CLI only |
| List projects | ❌ | `gh project list` | CLI only |
| View project | ❌ | `gh project view` | CLI only |
| Add item to project | ❌ | `gh project item-add` | CLI only |
| Create draft item | ❌ | `gh project item-create` | CLI only |
| Edit item field | ❌ | `gh project item-edit` | CLI only |
| List items | ❌ | `gh project item-list` | CLI only |
| List fields | ❌ | `gh project field-list` | CLI only |
| Create field | ❌ | `gh project field-create` | CLI only |
| Delete item | ❌ | `gh project item-delete` | CLI only |
| Archive item | ❌ | `gh project item-archive` | CLI only |
| Link to repo | ❌ | `gh project link` | CLI only |
| Close project | ❌ | `gh project close` | CLI only |

### 6.3 Existing Squad Skills That Interact

| Skill | Interaction with Projects V2 |
|-------|----------------------------|
| `github-issue-creation` | Issues created with this skill can be added to boards via `gh project item-add` |
| `label-driven-workflow` | Labels and board status are complementary — labels drive automation (Actions), board provides visualization |
| `github-actions-automation` | Actions workflows can update board items on status label changes |
| `cca-squad-integration` | CCA-created issues can be auto-added to boards |

---

## 7. Implementation Recommendation

### 7.1 Deliver as a Skill, Not Core Code

```
.ai-team/skills/github-project-boards/SKILL.md
```

This keeps it:
- **Opt-in** — agents only use it if the skill is present
- **Zero-dependency** — instructions reference `gh` CLI commands
- **Provider-abstractable** — skill content can vary per provider

### 7.2 Skill Content (Draft)

```markdown
---
name: "github-project-boards"
description: "Managing GitHub Projects V2 boards for visual task tracking"
domain: "platform-integration"
confidence: "low"
source: "Proposal 033a, Issue #6"
author: "Kujan"
---

## Prerequisites
- Token must have `project` scope: check with `gh auth status`
- If missing: tell user to run `gh auth refresh -s project`
- If scope unavailable: skip all board operations silently

## Board Initialization
1. Check if project exists: `gh project list --owner {owner} --format json | jq '.projects[] | select(.title == "{title}")'`
2. If not: `gh project create --owner {owner} --title "{title}" --format json`
3. Link to repo: `gh project link {number} --owner {owner} --repo {owner}/{repo}`
4. Cache field IDs: `gh project field-list {number} --owner {owner} --format json`
5. Store project number + field IDs in team.md Platform section

## Adding Items
- From existing issue: `gh project item-add {number} --owner {owner} --url {issue_url} --format json`
- Draft item: `gh project item-create {number} --owner {owner} --title "{title}" --format json`

## Status Updates
1. Get field ID + option IDs (cached from init): Status field → "Todo"/"In Progress"/"Done"
2. `gh project item-edit --id {item_id} --project-id {project_id} --field-id {status_field_id} --single-select-option-id {option_id}`

## Querying
- All items: `gh project item-list {number} --owner {owner} --format json --limit 100`
- Filter by status: pipe through `jq` — no server-side filter available
```

### 7.3 What NOT to Build

| Don't | Why |
|-------|-----|
| GraphQL client library | Zero-dependency constraint; `gh` CLI does everything |
| Projects V2 wrapper module in `index.js` | `index.js` is an installer, not a runtime |
| Automatic board creation on `squad init` | Requires `project` scope which most users won't have |
| Board-as-state-machine | Labels are the state machine (per `label-driven-workflow` skill); boards are visualization |

### 7.4 Interaction Model

```
Labels = state machine (drives automation, agent routing)
Board = visualization layer (read-only view of label state, plus manual drag-and-drop)
```

The board should **mirror** label state, not replace it. When an agent changes `status:todo` → `status:in-progress`, it should also update the board item. But the label is the source of truth.

---

## 8. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Token missing `project` scope | High (blocker) | Runtime detection + graceful skip + user guidance |
| MCP server never adds Projects V2 tools | Low | `gh` CLI is sufficient and stable |
| GraphQL API breaking changes | Low | `gh project *` commands abstract the API |
| ID resolution complexity | Medium | Cache IDs after first lookup; skill documents the pipeline |
| Rate limits on GraphQL | Low | 5,000/hr; board ops are low-volume |
| Cross-provider divergence | Medium | Prompt-level templates per 032a decision |

---

## 9. Action Items

1. **Brady:** Run `gh auth refresh -s project` to unblock all Projects V2 operations
2. **Verbal:** Add board commands to Platform section templates in `squad.agent.md` (conditional on provider)
3. **Kujan:** Write `github-project-boards` SKILL.md once scope is granted and pattern is validated
4. **Fenster:** Add board operations to provider abstraction interface (032a §2.x)
5. **Team:** Decide whether boards are Phase 1 (v0.3.0) or deferred — given v0.3.0 is "ONE feature" (proposals as Issues), boards should be v0.4.0

---

## Appendix A: Anti-Pattern — Board as State Machine

The `label-driven-workflow` skill explicitly calls this out:

> **Anti-Pattern: Using Projects board columns as the state machine** — no API events on column change, can't trigger Actions

This is critical. GitHub Actions cannot trigger on board column changes. Labels trigger `issues.labeled` / `issues.unlabeled` events, which Actions can respond to. Boards are a **view**, not a **controller**.

## Appendix B: `gh project` Command Quick Reference

```bash
# Lifecycle
gh project create --owner {o} --title "{t}" --format json
gh project list --owner {o} --format json
gh project view {n} --owner {o} --format json
gh project edit {n} --owner {o} --title "{t}"
gh project close {n} --owner {o}
gh project delete {n} --owner {o}
gh project link {n} --owner {o} --repo {o}/{r}

# Fields
gh project field-list {n} --owner {o} --format json
gh project field-create {n} --owner {o} --name "{name}" --data-type SINGLE_SELECT

# Items
gh project item-add {n} --owner {o} --url {url} --format json
gh project item-create {n} --owner {o} --title "{t}" --format json
gh project item-list {n} --owner {o} --format json --limit 100
gh project item-edit --id {i} --project-id {p} --field-id {f} --single-select-option-id {opt}
gh project item-archive {n} --owner {o} --id {i}
gh project item-delete {n} --owner {o} --id {i}
```
