# Multi-Codespace Setup with Squad Workstreams

> End-to-end walkthrough of running multiple Squad instances across Codespaces.

## Background: The Tetris Experiment

We validated Squad Workstreams by building a multiplayer Tetris game using 3 Codespaces, each running a separate workstream:

| Codespace | Workstream | Label | Focus |
|-----------|--------|-------|-------|
| CS-1 | `ui-team` | `team:ui` | React game board, piece rendering, animations |
| CS-2 | `backend-team` | `team:backend` | WebSocket server, game state, matchmaking |
| CS-3 | `infra-team` | `team:infra` | CI/CD, Docker, deployment |

All three Codespaces shared the same repository. Each Squad instance only picked up issues matching its workstream's label.

## Setup Steps

### 1. Create the workstreams config

In your repository, create `.squad/workstreams.json`:

```json
{
  "workstreams": [
    {
      "name": "ui-team",
      "labelFilter": "team:ui",
      "folderScope": ["src/client", "src/components"],
      "description": "Game UI and rendering"
    },
    {
      "name": "backend-team",
      "labelFilter": "team:backend",
      "folderScope": ["src/server", "src/shared"],
      "description": "Game server and state management"
    },
    {
      "name": "infra-team",
      "labelFilter": "team:infra",
      "folderScope": [".github", "docker", "k8s"],
      "workflow": "direct",
      "description": "Build and deploy pipeline"
    }
  ],
  "defaultWorkflow": "branch-per-issue"
}
```

### 2. Configure each Codespace

In `.devcontainer/devcontainer.json`, set the `SQUAD_TEAM` env var. For multiple configs, use [devcontainer features](https://containers.dev/features) or separate devcontainer folders:

**Option A: Separate devcontainer configs**

```
.devcontainer/
  ui-team/
    devcontainer.json    # SQUAD_TEAM=ui-team
  backend-team/
    devcontainer.json    # SQUAD_TEAM=backend-team
  infra-team/
    devcontainer.json    # SQUAD_TEAM=infra-team
```

**Option B: Set env var after launch**

```bash
export SQUAD_TEAM=ui-team
squad  # launches with workstream context
```

### 3. Label your issues

Create GitHub issues with the appropriate team labels:

```bash
gh issue create --title "Add piece rotation animation" --label "team:ui"
gh issue create --title "Implement matchmaking queue" --label "team:backend"
gh issue create --title "Add Docker compose for dev" --label "team:infra"
```

### 4. Launch Squad in each Codespace

Each Codespace runs `squad` normally. The workstream context is detected automatically:

```bash
# In Codespace 1 (SQUAD_TEAM=ui-team)
squad
# → Ralph only triages issues labeled "team:ui"
# → Agents only modify files in src/client, src/components

# In Codespace 2 (SQUAD_TEAM=backend-team)
squad
# → Ralph only triages issues labeled "team:backend"
# → Agents only modify files in src/server, src/shared
```

### 5. Monitor across workstreams

Use the CLI from any Codespace to see all workstreams:

```bash
squad workstreams status
```

<!-- Screenshot: workstreams status output showing PRs per workstream -->
<!-- TODO: Add screenshot placeholder -->

## What Worked

- **Clear separation**: Each workstream had well-defined boundaries, minimizing merge conflicts
- **Parallel velocity**: 3x throughput vs. single-squad mode for independent work
- **Label-based routing**: Simple, uses existing GitHub infrastructure

## What Didn't Work (Yet)

- **Cross-workstream dependencies**: When the UI team needed a backend API change, manual coordination was required
- **Shared files**: `package.json`, `tsconfig.json`, and other root files caused occasional conflicts
- **No meta-coordinator**: No automated way to coordinate across workstreams (future work)

## Lessons Learned

1. **Keep workstreams independent** — design folder boundaries to minimize shared files
2. **Use branch-per-issue** — direct commits across workstreams cause merge hell
3. **Label everything** — unlabeled issues get lost between workstreams
4. **Start with 2 workstreams** — add more once the team finds its rhythm
