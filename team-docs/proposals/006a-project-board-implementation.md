# Proposal 006a: Project Board Implementation — Provider Abstraction & Board Capabilities

**Author:** Fenster (Core Dev)  
**Date:** 2026-02-15  
**Status:** Implementation Report  
**Context:** Issue #6, Proposal 033 (WI-1 + WI-2, Phase 1)  
**Builds on:** 033 (Project Boards), 033a (API Feasibility), 032a (Provider Abstraction)

---

## 1. Phase 1 Validation Results

### 1.1 What Was Tested

Every `gh project *` command required for board operations was live-tested against `bradygaster/squad`:

| Command | Status | Notes |
|---------|--------|-------|
| `gh project list` | ✅ Verified | Returns JSON with project number, ID, URL, item count |
| `gh project create` | ✅ Verified | Created "Squad Board (test)" — project #12 |
| `gh project field-list` | ✅ Verified | Returns Status field with option IDs (Todo/In Progress/Done) |
| `gh project item-add` | ✅ Verified | Added issue #6 to board, returned item ID |
| `gh project item-edit` | ✅ Verified | Moved issue between all 3 status columns |
| `gh project item-list` | ✅ Verified | Returns items with current status |
| `gh project item-archive` | ✅ Verified | Archived item, removed from active list |
| `gh project view` | ✅ Verified | Returns board metadata |
| `gh project link` | ✅ Verified | Linked board to bradygaster/squad |
| `gh project delete` | ✅ Verified | Cleaned up test board |

### 1.2 Key Findings

1. **`project` scope is already present** on the current token. No `gh auth refresh` needed for this repo.
2. **The 4-step field discovery pipeline works.** Field IDs and option IDs are project-specific but stable once created.
3. **`item-add` is idempotent** — re-adding an existing issue returns the existing item ID.
4. **`item-edit` requires 4 opaque IDs** — this is the most complex command but fully functional.
5. **No `jq` needed on Windows** — PowerShell `ConvertFrom-Json` handles all JSON parsing.
6. **`--format json` is supported on all commands** — machine-parseable output is reliable.

### 1.3 Gate Assessment

> Can we reliably create boards, add items, and move items between columns using only `gh project *` CLI?

**YES.** Phase 1 gate passes. No need to fall back to raw `gh api graphql` or native HTTP. The `gh project` subcommands cover 100% of required operations.

---

## 2. Board Capability Interface

### 2.1 Supported Operations

| Operation | Description | Required IDs |
|-----------|-------------|-------------|
| `createBoard` | Create a new project board | owner |
| `listBoards` | List existing boards for an owner | owner |
| `viewBoard` | Get board details | owner, number |
| `linkBoard` | Link board to a repository | owner, number, repo |
| `deleteBoard` | Delete a board | owner, number |
| `addItem` | Add issue/PR to board | owner, number, item URL |
| `createDraft` | Create draft-only item | owner, number, title |
| `moveItem` | Change item status | item ID, project ID, field ID, option ID |
| `listItems` | List all board items | owner, number |
| `archiveItem` | Archive completed item | owner, number, item ID |
| `deleteItem` | Remove item from board | owner, number, item ID |
| `discoverFields` | Get field IDs and option IDs | owner, number |

### 2.2 Capability Negotiation

The coordinator checks board availability at session start:

```
Board capability check:
1. Run: gh project list --owner {owner} --limit 1 --format json
2. If exit code 0 → boards AVAILABLE
3. If exit code non-zero → boards UNAVAILABLE (missing scope or CLI issue)
4. If UNAVAILABLE → skip all board operations silently
5. Store result in session state — do not re-check
```

This fits the existing provider abstraction (032a): capabilities are runtime-detected, not compiled.

### 2.3 Capability Declaration

```json
{
  "projectBoards": true,
  "projectBoardColumns": true,
  "projectBoardCustomFields": true,
  "projectBoardDraftItems": true
}
```

When `projectBoards` is `false`, the coordinator skips all board operations. Labels and issues continue to work independently.

---

## 3. GitHub Provider Implementation

### 3.1 Command Templates

All commands documented in the SKILL.md at `.ai-team/skills/github-projects-v2-commands/SKILL.md`. Key templates:

| Operation | Command |
|-----------|---------|
| Create | `gh project create --owner {owner} --title "{title}" --format json` |
| Add item | `gh project item-add {number} --owner {owner} --url {url} --format json` |
| Move item | `gh project item-edit --id {item} --project-id {proj} --field-id {field} --single-select-option-id {opt}` |
| List items | `gh project item-list {number} --owner {owner} --format json --limit 100` |
| Discover fields | `gh project field-list {number} --owner {owner} --format json` |

### 3.2 ID Resolution Workflow

The 4-step pipeline is the core complexity of the GitHub provider:

```
Step 1: gh project list → project NUMBER + project ID
Step 2: gh project field-list NUMBER → Status field ID + option IDs
Step 3: gh project item-add → item ID
Step 4: gh project item-edit → move item (requires all IDs from steps 1-3)
```

IDs should be cached after first discovery. They don't change unless the board is reconfigured.

### 3.3 Default Column Mapping

New boards get 3 default columns: Todo, In Progress, Done.

For Squad's 5-column model (per 033 §2.5), additional options need to be created:

| Board Column | Status Label | Default? |
|-------------|-------------|----------|
| Backlog | `status:draft` | ❌ (create) |
| Ready | `status:approved` | ❌ (create) |
| In Progress | `status:implementing` | ✅ (maps to "In Progress") |
| Blocked | `status:blocked` | ❌ (create) |
| Done | `status:done` | ✅ (maps to "Done") |

Custom columns can be added via `gh project field-create` or manual board configuration.

---

## 4. ADO / GitLab Stubs (Future Work)

### 4.1 Azure DevOps

| Operation | Command | Notes |
|-----------|---------|-------|
| Create board | N/A (built-in) | Every ADO project has a default board |
| Add item | `az boards work-item create --type "User Story"` | Work item types required |
| Move item | `az boards work-item update --id {id} --state "{state}"` | Uses work item states, not custom fields |
| List items | `az boards query --wiql "..."` | WIQL query language |

**Key divergence:** ADO boards are tied to work item states (New → Active → Resolved → Closed). No opaque IDs, but different state model.

### 4.2 GitLab

| Operation | Command | Notes |
|-----------|---------|-------|
| Create board | `glab api POST /projects/{id}/boards` | REST API |
| Add item | N/A (label-driven) | Issues appear on board when labeled |
| Move item | `glab issue update --unlabel "{old}" --label "{new}"` | Label swaps = column moves |
| List items | `glab issue list --label "{status}"` | Filter by label |

**Key insight:** GitLab boards ARE label projections. If Squad already uses `status:*` labels, a GitLab board configured with those labels IS the board. No additional API work needed beyond label management.

### 4.3 Generic Provider

If `projectBoards === false` (no board support detected), all board operations are no-ops. The coordinator continues with labels and issues only.

---

## 5. Recommendations for Phase 2

1. **Board initialization prompt** (WI-3, Verbal) — should use the field discovery pipeline from the SKILL.md. Trigger on "set up a project board" / "create a board".

2. **Label-to-board sync workflow** (WI-4, Fenster) — should use `gh project item-edit` to update board status when `status:*` labels change. The workflow needs to cache field IDs (write to `.ai-team/team.md`).

3. **Custom columns** — defer to v0.5.0. The default 3-column board (Todo/In Progress/Done) covers the basic workflow. The 5-column model requires custom field options which adds complexity to the init flow.

4. **Board metadata storage** — store in `.ai-team/team.md` under `## Project Board`:
   ```markdown
   ## Project Board
   - Number: 12
   - ID: PVT_kwHOAn_JWs4BPGiq
   - URL: https://github.com/users/bradygaster/projects/12
   - Status Field ID: PVTSSF_...
   - Options: Todo=f75ad846, In Progress=47fc9ee4, Done=98236657
   ```

---

## 6. Risk Update

| Risk from 033 | Phase 1 Finding |
|---------------|----------------|
| `gh api graphql` insufficient | **RESOLVED** — `gh project *` commands work. No raw GraphQL needed. |
| `project` scope not granted | **Mitigated** — scope already present on bradygaster token. Detection pattern validated. |
| GraphQL field IDs are project-specific | **Confirmed but manageable** — 4-step discovery pipeline works reliably. Cache after first run. |

No new risks identified. Phase 2 is unblocked.
