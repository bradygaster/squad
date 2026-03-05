# Squad Workstreams

> Scale Squad across multiple Codespaces by partitioning work into labeled workstreams.

## What Are Workstreams?

A **workstream** is a named partition of work within a Squad project. Each workstream targets a specific GitHub label (e.g., `team:ui`, `team:backend`) and optionally restricts agents to certain directories. Multiple Squad instances — each running in its own Codespace — can each activate a different workstream, enabling parallel work across teams.

## Why Workstreams?

Squad was originally designed for a single team per repository. As projects grow, a single Codespace becomes a bottleneck:

- **Model rate limits** — One Codespace hitting API limits slows the whole team
- **Context overload** — Ralph picks up all issues, not just the relevant ones
- **Folder conflicts** — Multiple agents editing the same files causes merge pain

Workstreams solve this by giving each Codespace a scoped view of the project.

## Configuration

### 1. Create `.squad/workstreams.json`

```json
{
  "workstreams": [
    {
      "name": "ui-team",
      "labelFilter": "team:ui",
      "folderScope": ["apps/web", "packages/ui"],
      "workflow": "branch-per-issue",
      "description": "Frontend team — React, CSS, components"
    },
    {
      "name": "backend-team",
      "labelFilter": "team:backend",
      "folderScope": ["apps/api", "packages/core"],
      "workflow": "branch-per-issue",
      "description": "Backend team — APIs, database, services"
    },
    {
      "name": "infra-team",
      "labelFilter": "team:infra",
      "folderScope": [".github", "infrastructure"],
      "workflow": "direct",
      "description": "Infrastructure — CI/CD, deployment, monitoring"
    }
  ],
  "defaultWorkflow": "branch-per-issue"
}
```

### 2. Activate a Workstream

There are three ways to tell Squad which workstream to use:

#### Environment Variable (recommended for Codespaces)

```bash
export SQUAD_TEAM=ui-team
```

Set this in your Codespace's environment or devcontainer.json:

```json
{
  "containerEnv": {
    "SQUAD_TEAM": "ui-team"
  }
}
```

#### .squad-workstream File (local activation)

```bash
squad workstreams activate ui-team
```

This writes a `.squad-workstream` file (gitignored) so the setting is local to your machine.

#### Auto-select (single workstream)

If `workstreams.json` contains only one workstream, it's automatically selected.

### 3. Resolution Priority

1. `SQUAD_TEAM` env var (highest)
2. `.squad-workstream` file
3. Single-workstream auto-select
4. No workstream (classic single-squad mode)

## Workstream Definition Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique workstream identifier (kebab-case) |
| `labelFilter` | Yes | GitHub label to filter issues |
| `folderScope` | No | Directories this workstream may modify |
| `workflow` | No | `branch-per-issue` (default) or `direct` |
| `description` | No | Human-readable purpose |

## CLI Reference

```bash
# List configured workstreams
squad workstreams list

# Show workstream activity (branches, PRs)
squad workstreams status

# Activate a workstream locally
squad workstreams activate <name>
```

## How It Works

### Triage (Ralph)

When a workstream is active, Ralph's triage only picks up issues labeled with the workstream's `labelFilter`. Unmatched issues are left for other workstreams or the main squad.

### Workflow Enforcement

- **branch-per-issue** (default): Every issue gets its own branch and PR. Agents never commit directly to main.
- **direct**: Agents may commit directly (useful for infra/ops workstreams).

### Folder Scope

When `folderScope` is set, agents should primarily modify files within those directories. However, `folderScope` is **advisory, not a hard lock** — agents may still touch shared files (types, configs, package exports) when their issue requires it. The real protection comes from `branch-per-issue` workflow: each issue gets its own branch, so two workstreams editing the same file won't conflict until merge time.

> **Tip:** If two workstreams' PRs touch the same file, Git resolves non-overlapping changes automatically. For semantic conflicts (incompatible API changes), use PR review to catch them.

### Cost Optimization: Single-Machine Multi-Workstream

You don't need a separate Codespace per workstream. One machine can serve multiple workstreams:

```bash
# Switch between workstreams manually
squad workstreams activate ui-team      # Ralph works team:ui issues
# ... later ...
squad workstreams activate backend-team # now works team:backend issues
```

This gives you 1× Codespace cost instead of N×, at the expense of serial (not parallel) execution. Each issue still gets its own branch — no conflicts.

## Example: Multi-Codespace Setup

See [Multi-Codespace Scenario](../scenarios/multi-codespace.md) for a complete walkthrough.
