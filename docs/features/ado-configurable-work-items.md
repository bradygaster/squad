# ADO Configurable Work Items

**Try this to see available work item types:**
```
squad init --introspect
```

**Try this to configure your work items:**
```
squad config set workItemType "Scenario" areaPath "MyProject\\Team A"
```

**Try this to create a work item in a specific area:**
```
squad create issue "Add feature X" --areaPath "MyProject\\Frontend"
```

Work with any Azure DevOps process template. Squad automatically detects available work item types, area paths, and iterations—no more hardcoded User Stories.

---

## What ADO Configurable Work Items Does

Work item creation was hardcoded: Squad always created User Stories in a default area. This breaks with custom ADO process templates. Now Squad adapts to your ADO setup:

1. **Introspect** — Auto-discover available work item types in your project
2. **Configure** — Set default type, area path, and iteration
3. **Create** — Create work items matching your process template
4. **Validate** — Pre-check that your config is valid before using it

## Quick Start

### Initialize and Introspect

When setting up a new squad in Azure DevOps:
```bash
squad init --org contoso --project "My Project" --introspect
```

Squad queries the ADO API to find:
- Available work item types (User Story, Bug, Task, Scenario, etc.)
- Area paths in the project
- Iterations/sprints
- Custom fields

Output:
```
Azure DevOps Process Template: Scrum

Available Work Item Types:
  - Impediment
  - Bug
  - Task
  - User Story
  - Feature
  - Epic

Available Areas:
  - My Project
  - My Project\Backend Team
  - My Project\Frontend Team

Available Iterations:
  - My Project\Sprint 1
  - My Project\Sprint 2
```

### Configure Defaults

Store your preferences in `.squad/config.json`:

```bash
squad config set workItemType "Bug" areaPath "My Project\Backend Team"
```

Or edit `.squad/config.json` directly:

```json
{
  "ado": {
    "org": "contoso",
    "project": "My Project",
    "defaultWorkItemType": "Bug",
    "areaPath": "My Project\Backend Team",
    "iterationPath": "My Project\Sprint 1"
  }
}
```

### Create Work Items

Ralph (work monitor) now uses your config:

```bash
squad ralph scan
```

Creates work items with:
- Type from `defaultWorkItemType` (or "User Story" fallback)
- Area from `areaPath` (or project root fallback)
- Iteration from `iterationPath` (optional)

Override per-item:
```bash
squad create issue "Critical bug" --type Bug --areaPath "My Project\Backend Team"
```

## Configuration Reference

Add to `.squad/config.json`:

```json
{
  "ado": {
    "org": "your-org",
    "project": "Your Project Name",
    "defaultWorkItemType": "User Story",
    "areaPath": "Your Project\Team Name",
    "iterationPath": "Your Project\Sprint 1"
  }
}
```

All fields are optional. Defaults:
- `defaultWorkItemType`: "User Story"
- `areaPath`: Project root
- `iterationPath`: Not set

### Validation

Before using a config, validate it:

```bash
squad config validate
```

Output:
```
✓ Organization: contoso
✓ Project: My Project
✓ Default Work Item Type: Bug (found in available types)
✓ Area Path: My Project\Backend Team (found)
✓ Iteration Path: My Project\Sprint 1 (found)

Config is valid. Ready to use.
```

## How It Works

### Introspection

When you run `squad init --introspect`:

1. Connect to ADO using `az cli` credentials
2. Query the project's process template
3. List available work item types
4. Enumerate area paths
5. List iterations/sprints
6. Save suggestions to `.squad/config.json`

### Creation

When creating a work item:

1. Load config from `.squad/config.json`
2. Resolve `areaPath` to ADO internal ID
3. Resolve `iterationPath` to ADO internal ID
4. Call `az boards work-item create` with all parameters
5. Log the created work item ID

### Validation

Before attempting creation:

1. Check that `defaultWorkItemType` exists in the project
2. Check that `areaPath` exists in the project
3. Check that `iterationPath` exists (if specified)
4. Return validation errors before attempting creation

## Process Template Support

Squad works with all ADO process templates:

### Scrum
- Work item types: Epic, Feature, User Story, Task, Bug, Impediment
- Area paths: Team names
- Iterations: Sprint 1, Sprint 2, etc.

### Agile
- Work item types: Epic, Feature, User Story, Task, Bug, Issue
- Area paths: Component names
- Iterations: Iteration 1, Iteration 2, etc.

### CMMI
- Work item types: Epic, Feature, Requirement, Task, Bug, Review, etc.
- Area paths: Department/Team structure
- Iterations: Phase 1, Phase 2, etc.

### Custom Templates
- Introspect to see what's available
- Configure Squad to match your template

## Real-World Example

### Multi-Team Setup

Your org has three teams, each with their own squad:

**Backend Squad** (Scrum process):
```json
{
  "ado": {
    "org": "acme",
    "project": "Platform",
    "defaultWorkItemType": "User Story",
    "areaPath": "Platform\Backend",
    "iterationPath": "Platform\Sprint 1"
  }
}
```

**Frontend Squad** (Agile process, custom):
```json
{
  "ado": {
    "org": "acme",
    "project": "Platform",
    "defaultWorkItemType": "Story",
    "areaPath": "Platform\Frontend"
  }
}
```

**QA Squad** (Bug-focused):
```json
{
  "ado": {
    "org": "acme",
    "project": "Platform",
    "defaultWorkItemType": "Bug",
    "areaPath": "Platform\QA"
  }
}
```

Each squad creates work items in their native format and area.

## Ralph Integration

Ralph (work monitor) uses your ADO config to create and track work:

```bash
squad ralph scan --ado
```

Ralph now creates work items using:
- Your configured `defaultWorkItemType`
- Your configured `areaPath`
- Your configured `iterationPath` (if set)

Example: Backend squad finds an issue → creates Bug in "Platform\Backend" area

## Fallback Behavior

If config is not set or validation fails:

1. Try to use config values
2. If missing, fall back to:
   - Work item type: "User Story"
   - Area: Project root
   - Iteration: None
3. Log warnings if fallback occurs

## See Also

- [Persistent Ralph](/features/persistent-ralph) — Monitor work with your ADO config
- [Cross-Squad Orchestration](/features/cross-squad-orchestration) — Delegate work across squads
- [Generic Scheduler](/features/generic-scheduler) — Run ADO operations on schedule
