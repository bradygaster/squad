---
name: "github-projects-v2-commands"
description: "Complete command reference for GitHub Projects V2 board operations using gh CLI"
domain: "platform-integration"
confidence: "high"
source: "WI-1 validation (Phase 1, Proposal 033), live-tested against bradygaster/squad"
author: "Fenster"
validated: "2026-02-15"
---

# GitHub Projects V2 — Command Reference

All operations use `gh project *` CLI subcommands. **No GraphQL client, no npm dependency, no MCP tools.** The `gh` CLI wraps every Projects V2 GraphQL mutation behind ergonomic flags.

## Prerequisites

### Token Scope

The `project` scope is required for ALL board operations (read + write).

**Check:** `gh auth status` — look for `project` in the scopes list.

**Fix (one-time, interactive):**
```bash
gh auth refresh -s project
```

⚠ **Do NOT run `gh auth refresh` from an agent** — it requires interactive browser auth. If scope is missing, inform the user:
```
⚠ GitHub Projects integration requires the 'project' scope.
  Run: gh auth refresh -s project
  This is a one-time interactive step (~10 seconds).
```

### Runtime Detection

```bash
# Quick check: can we access projects at all?
gh project list --owner {owner} --limit 1 --format json 2>/dev/null
# Exit code 0 = scope present. Non-zero = missing scope or auth issue.
```

---

## Board Lifecycle

### Create a Board

```bash
gh project create --owner {owner} --title "{title}" --format json
```

**Returns:** `{ "number": 12, "id": "PVT_...", "url": "https://..." }`

The `number` is used in all subsequent commands. The `id` is the GraphQL node ID (needed for `item-edit`).

### List Boards

```bash
gh project list --owner {owner} --format json
```

**Returns:** `{ "projects": [...], "totalCount": N }`

To find a specific board by title:
```bash
gh project list --owner {owner} --format json | jq '.projects[] | select(.title == "{title}")'
```

### View Board Details

```bash
gh project view {number} --owner {owner} --format json
```

### Link Board to Repository

```bash
gh project link {number} --owner {owner} --repo {owner}/{repo}
```

Links the project to a specific repo. This makes issues from that repo available for adding to the board.

### Edit Board

```bash
gh project edit {number} --owner {owner} --title "{new_title}"
```

### Close Board

```bash
gh project close {number} --owner {owner}
```

### Delete Board

```bash
gh project delete {number} --owner {owner}
```

---

## Field Discovery Pipeline

This is the critical 4-step pipeline. Projects V2 uses opaque IDs for fields and status options. You MUST discover these at runtime — they are project-specific and not stable across projects.

### Step 1: List Fields

```bash
gh project field-list {number} --owner {owner} --format json
```

**Returns:**
```json
{
  "fields": [
    { "id": "PVTF_...", "name": "Title", "type": "ProjectV2Field" },
    { "id": "PVTSSF_...", "name": "Status", "type": "ProjectV2SingleSelectField",
      "options": [
        { "id": "f75ad846", "name": "Todo" },
        { "id": "47fc9ee4", "name": "In Progress" },
        { "id": "98236657", "name": "Done" }
      ]
    }
  ]
}
```

### Step 2: Extract Status Field ID

The Status field has `type: "ProjectV2SingleSelectField"`. Its `id` is the **field ID** needed for `item-edit`.

```bash
# Extract Status field ID
gh project field-list {number} --owner {owner} --format json \
  | jq '.fields[] | select(.name == "Status") | .id'
```

### Step 3: Extract Option IDs

Each status option (Todo, In Progress, Done) has an opaque `id`. These are the **single-select-option-id** values for `item-edit`.

```bash
# Extract all status options
gh project field-list {number} --owner {owner} --format json \
  | jq '.fields[] | select(.name == "Status") | .options'
```

### Step 4: Cache IDs

Store the project ID, field ID, and option IDs. These don't change unless the board is reconfigured:

| Value | Where to Find | Example |
|-------|--------------|---------|
| Project number | `gh project list` or `gh project create` response | `12` |
| Project ID (GraphQL) | `gh project list` → `.projects[].id` | `PVT_kwHOAn_JWs4BPGiq` |
| Status field ID | `gh project field-list` → field with `name: "Status"` | `PVTSSF_lAHOAn_JWs4BPGiqzg9nDRY` |
| "Todo" option ID | Status field → `options` array | `f75ad846` |
| "In Progress" option ID | Status field → `options` array | `47fc9ee4` |
| "Done" option ID | Status field → `options` array | `98236657` |

**Recommendation:** Store in `.ai-team/team.md` under a `## Project Board` section.

---

## Item Operations

### Add Issue/PR to Board

```bash
gh project item-add {number} --owner {owner} --url {issue_or_pr_url} --format json
```

**Returns:** `{ "id": "PVTI_...", "title": "...", "type": "Issue" }`

The `id` is the **item ID** needed for `item-edit`.

### Create Draft Item

```bash
gh project item-create {number} --owner {owner} --title "{title}" --body "{body}" --format json
```

Draft items live only on the board — they are not GitHub Issues.

### List All Items

```bash
gh project item-list {number} --owner {owner} --format json --limit 100
```

**Returns:** Array of items with `id`, `title`, `status`, `labels`, `content.number`, etc.

**Note:** `--limit` caps at what `gh` allows. For large boards, check pagination.

### Filter Items by Status (Client-Side)

The `gh` CLI has no server-side status filter. Filter with `jq`:

```bash
# Items in "Todo"
gh project item-list {number} --owner {owner} --format json --limit 100 \
  | jq '[.items[] | select(.status == "Todo")]'

# Items in "In Progress"
gh project item-list {number} --owner {owner} --format json --limit 100 \
  | jq '[.items[] | select(.status == "In Progress")]'
```

### Move Item Between Columns (Update Status)

```bash
gh project item-edit \
  --id {item_id} \
  --project-id {project_graphql_id} \
  --field-id {status_field_id} \
  --single-select-option-id {option_id}
```

All four IDs are required. Get them from the field discovery pipeline above.

**Example — move to "In Progress":**
```bash
gh project item-edit \
  --id "PVTI_lAHOAn_JWs4BPGiqzglZbEo" \
  --project-id "PVT_kwHOAn_JWs4BPGiq" \
  --field-id "PVTSSF_lAHOAn_JWs4BPGiqzg9nDRY" \
  --single-select-option-id "47fc9ee4"
```

### Archive Item

```bash
gh project item-archive {number} --owner {owner} --id {item_id}
```

Preferred over delete for completed items — preserves history.

### Delete Item

```bash
gh project item-delete {number} --owner {owner} --id {item_id}
```

Permanently removes from board. Does NOT delete the underlying issue.

---

## Field Management

### Create Custom Field

```bash
gh project field-create {number} --owner {owner} --name "{name}" --data-type SINGLE_SELECT
```

Data types: `TEXT`, `NUMBER`, `DATE`, `SINGLE_SELECT`, `ITERATION`.

---

## Error Handling

### Missing `project` Scope

**Symptom:** Any `gh project *` command fails with an auth/permission error.

**Detection:**
```bash
gh project list --owner {owner} --limit 1 --format json 2>/dev/null
if ($LASTEXITCODE -ne 0) { Write-Output "SCOPE_MISSING" }
```

**Response:** Do NOT retry. Inform the user:
```
⚠ GitHub Projects integration requires the 'project' scope.
  Run: gh auth refresh -s project
```

### Board Not Found

**Symptom:** `gh project view {number}` returns error.

**Response:** Offer to create one.

### Item Already on Board

**Symptom:** `gh project item-add` for an issue already on the board.

**Behavior:** Returns the existing item ID. This is idempotent — safe to re-add.

### Field ID Mismatch

**Symptom:** `item-edit` fails with field/option ID error.

**Response:** Re-run field discovery pipeline. Field IDs change when the board is reconfigured.

---

## Complete Workflow Example

```bash
# 1. Check if board exists
BOARD=$(gh project list --owner bradygaster --format json \
  | jq '.projects[] | select(.title == "Squad Backlog")')

# 2. Create if missing
if [ -z "$BOARD" ]; then
  BOARD=$(gh project create --owner bradygaster --title "Squad Backlog" --format json)
fi

# 3. Get project number and ID
NUMBER=$(echo "$BOARD" | jq -r '.number')
PROJECT_ID=$(echo "$BOARD" | jq -r '.id')

# 4. Link to repo
gh project link $NUMBER --owner bradygaster --repo bradygaster/squad

# 5. Discover Status field
FIELDS=$(gh project field-list $NUMBER --owner bradygaster --format json)
STATUS_FIELD_ID=$(echo "$FIELDS" | jq -r '.fields[] | select(.name == "Status") | .id')
TODO_OPT=$(echo "$FIELDS" | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "Todo") | .id')
IN_PROGRESS_OPT=$(echo "$FIELDS" | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "In Progress") | .id')
DONE_OPT=$(echo "$FIELDS" | jq -r '.fields[] | select(.name == "Status") | .options[] | select(.name == "Done") | .id')

# 6. Add an issue
ITEM=$(gh project item-add $NUMBER --owner bradygaster \
  --url "https://github.com/bradygaster/squad/issues/6" --format json)
ITEM_ID=$(echo "$ITEM" | jq -r '.id')

# 7. Set status to "In Progress"
gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$IN_PROGRESS_OPT"

# 8. Later, move to "Done"
gh project item-edit --id "$ITEM_ID" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$DONE_OPT"

# 9. Archive completed item
gh project item-archive $NUMBER --owner bradygaster --id "$ITEM_ID"
```

---

## PowerShell Equivalents (Windows)

On Windows, `jq` may not be available. Use PowerShell JSON parsing:

```powershell
# List projects and find by title
$projects = gh project list --owner bradygaster --format json | ConvertFrom-Json
$board = $projects.projects | Where-Object { $_.title -eq "Squad Backlog" }

# Get field IDs
$fields = gh project field-list $board.number --owner bradygaster --format json | ConvertFrom-Json
$statusField = $fields.fields | Where-Object { $_.name -eq "Status" }
$todoOpt = $statusField.options | Where-Object { $_.name -eq "Todo" }
$inProgressOpt = $statusField.options | Where-Object { $_.name -eq "In Progress" }
$doneOpt = $statusField.options | Where-Object { $_.name -eq "Done" }
```

---

## What NOT to Do

| Anti-Pattern | Why |
|-------------|-----|
| Use a GraphQL client library | Breaks zero-dependency constraint. `gh` CLI does everything. |
| Use board columns as state machine | No API events on column drag. Labels drive automation; boards visualize. |
| Auto-create boards on `squad init` | Requires `project` scope most users won't have. Opt-in only. |
| Reverse-sync board → labels | Labels are authoritative. Board is a projection. One-way sync only. |
| Run `gh auth refresh` from agent | Requires interactive browser auth. Agent must inform user. |

---

## Provider Compatibility

| Operation | GitHub (`gh project`) | ADO (`az boards`) | GitLab (`glab`) |
|-----------|----------------------|-------------------|-----------------|
| Create board | `gh project create` | Built-in (no create needed) | `glab api POST /projects/{id}/boards` |
| Add item | `gh project item-add` | `az boards work-item create` | Auto (label-driven) |
| Move item | `gh project item-edit` | `az boards work-item update --state` | `glab issue update --unlabel/--label` |
| List items | `gh project item-list` | `az boards query --wiql` | `glab issue list --label` |
| Auth scope | `project` | Built-in PAT | `api` |

GitHub is the most API-complex (opaque IDs, 4-step discovery). ADO has built-in boards. GitLab boards are label projections — our existing label workflow IS the board.
