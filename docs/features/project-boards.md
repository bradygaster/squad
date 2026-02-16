# Project Boards

**Try this to visualize workflow tracking:**
```
Create a project board for v0.5.0 with columns for each workflow stage
```

**Try this to link issues to a board:**
```
Sync issue #42 to the project board
```

Squad integrates with GitHub Projects V2 for visual workflow tracking. Labels are the source of truth, boards are one-way projections that visualize the state machine.

---

## Prerequisites

GitHub Projects V2 access requires the `project` scope:

```bash
gh auth refresh -s project
```

Verify:

```bash
gh auth status
```

You should see `✓ Token scopes: repo, project, workflow` (or similar).

## How It Works

Squad treats labels as the state machine and boards as a **read-mostly visualization**:

1. **Labels drive state** — Issue gets `go:yes` + `squad:fenster` → state changes to "In Progress".
2. **Board updates** — Squad syncs label changes to the project board automatically.
3. **Board changes propagate** — If you drag an issue to "Done" on the board, Squad applies the corresponding label (`status:done`).

Labels are authoritative. Boards reflect labels, not the other way around.

## Board Structure

Squad's default board has 5 columns matching issue lifecycle:

| Column | Label State | Description |
|--------|-------------|-------------|
| **Backlog** | `go:no` or `release:backlog` | Not approved or deferred |
| **Needs Research** | `go:needs-research` | Lead is investigating feasibility |
| **Ready** | `go:yes`, no `squad:*` | Approved, awaiting assignment |
| **In Progress** | `go:yes` + `squad:{member}` | Agent actively working |
| **Done** | Issue closed | Completed and merged |

## Creating a Board

> "Create a project board for this repository"

Squad runs:

```bash
gh project create --owner {org} --title "Squad Board" --format "Board"
```

Then adds the 5 default columns and syncs all existing issues based on their labels.

## Syncing Labels to Board

Squad's `sync-board.yml` workflow runs:
- **On label change** — Issue labeled `go:yes` → moves to "Ready" column
- **On issue close** → moves to "Done" column
- **On PR merge** → linked issue moves to "Done"
- **On schedule** (every 30 min) — full board resync to catch any drift

### Manual Sync

```bash
gh project item-list --owner {org} --project {project-id}
# For each item, check label state and update column
```

## Board-to-Label Sync

When you manually move an issue on the board:

1. **Board webhook triggers** — GitHub sends `projects_v2_item.moved` event
2. **Squad workflow runs** — Reads new column, infers label change
3. **Labels update** — Applies appropriate `go:*`, `squad:*`, or `status:*` label

Example:
- Drag issue from "Backlog" to "Ready" → Squad applies `go:yes`
- Drag issue from "Ready" to "In Progress" → Squad prompts: "Assign to which member?" then applies `squad:{member}`

## Board CLI Commands

| Command | What it does |
|---------|--------------|
| `gh project list --owner {org}` | List all projects in org/repo |
| `gh project view {id}` | Show project board layout |
| `gh project item-add {id} --url {issue-url}` | Add issue to board |
| `gh project item-delete {id} --item-id {item}` | Remove issue from board |
| `gh project field-list {id}` | List custom fields (Status, Priority, etc.) |

**Note:** `gh project` uses GraphQL, not REST. All operations are against the Projects V2 API.

## Custom Fields

You can add custom fields to the board (Assignee, Priority, Release):

```bash
gh project field-create {id} --name "Priority" --data-type "SINGLE_SELECT" --options "P0,P1,P2"
```

Squad syncs these from labels:
- `priority:p0` → Board "Priority" field = "P0"
- `release:v0.4.0` → Board "Release" field = "v0.4.0"

## Current Status

GitHub Projects V2 integration is **planned for v0.4.0**. Current capabilities:

- ✅ Label-based state machine (fully implemented)
- ✅ CLI access via `gh project` (prerequisite met)
- 🚧 Automated board sync workflows (in development)
- 🚧 Bidirectional sync (board → labels) (in development)
- ❌ Custom field mapping (not yet implemented)

You can manually use `gh project` commands now. Full automation arrives in v0.4.0.

## Sample Prompts

```
Create a project board for Squad work
```
Initializes a new GitHub Projects V2 board with default columns and syncs existing issues.

```
Move issue #42 to In Progress
```
Updates board column and applies `squad:{member}` label (prompts for member if not set).

```
Sync all issues to the project board
```
Re-scans all open issues, updates board columns based on current label state.

```
Add a custom Priority field to the board
```
Creates a custom field on the project board and maps it to `priority:*` labels.

```
Show me the board status — how many issues in each column?
```
Queries the project board and displays issue count per column (Backlog, Ready, In Progress, Done).
