# Workstreams PRD — Product Requirements Document

> Scaling Squad across multiple Codespaces via labeled workstreams.

## Problem Statement

Squad was designed for a single agent team per repository. In practice, larger projects hit scaling limits:

1. **Rate limits**: A single Codespace hitting model API rate limits blocks the entire team
2. **Triage overload**: Ralph picks up all open issues, even those outside the current focus area
3. **File contention**: Multiple agents editing the same files causes merge conflicts
4. **Context window saturation**: Large repos exceed practical context limits for a single coordinator

### Validated by Experiment

We tested this with a 3-Codespace setup building a multiplayer Tetris game. Each Codespace ran Squad independently, manually filtering by GitHub labels. The results showed 3x throughput for independent workstreams, validating the approach. However, the manual coordination was error-prone and needed to be automated.

## Requirements

### Must Have (P0)

- [ ] **Workstream Definition**: Define workstreams in `.squad/workstreams.json` with name, label filter, folder scope, and workflow
- [ ] **Workstream Resolution**: Automatically detect active workstream from env var, file, or config
- [ ] **Label Filtering**: Ralph only triages issues matching the workstream's label
- [ ] **Folder Scoping**: Agents restrict modifications to workstream's folder scope
- [ ] **CLI Management**: `squad workstreams list|status|activate` commands
- [ ] **Init Integration**: `squad init` optionally generates workstreams config
- [ ] **Agent Template**: squad.agent.md includes workstream awareness instructions

### Should Have (P1)

- [ ] **Workstream Status Dashboard**: Show PR/branch activity per workstream
- [ ] **Conflict Detection**: Warn when workstreams overlap on file paths
- [ ] **Auto-labeling**: Suggest labels for new issues based on file paths

### Could Have (P2)

- [ ] **Meta-coordinator**: A coordinator that orchestrates across workstreams
- [ ] **Cross-workstream dependencies**: Track and resolve inter-workstream blockers
- [ ] **Workstream metrics**: Throughput, cycle time, merge conflict rate per workstream

## Design Decisions

### 1. GitHub Labels as the Partition Key

**Decision**: Use GitHub labels (e.g., `team:ui`) to partition work across workstreams.

**Rationale**: Labels are a first-class GitHub concept. They're visible in the UI, queryable via API, and already used by Squad for agent assignment. No new infrastructure needed.

**Alternatives considered**:
- Custom metadata in issue body — fragile, not queryable
- Separate repositories — too heavy, loses monorepo benefits
- Branch-based partitioning — branches are for code, not work items

### 2. File-Based Workstream Activation

**Decision**: Use `.squad-workstream` file (gitignored) for local activation, `SQUAD_TEAM` env var for Codespaces.

**Rationale**: The file is simple and doesn't require environment configuration. The env var is ideal for Codespaces where the environment is defined in `devcontainer.json`. Both are easy to understand and debug.

### 3. Resolution Priority (Env > File > Config)

**Decision**: Env var overrides file, which overrides config auto-select.

**Rationale**: In Codespaces, the env var is the most reliable signal. On local machines, the file is convenient. Config auto-select handles the simple case of a single workstream.

### 4. Synthesized Definitions for Unknown Workstreams

**Decision**: When `SQUAD_TEAM` or `.squad-workstream` specifies a workstream name not in the config, synthesize a minimal definition with `labelFilter: "team:{name}"`.

**Rationale**: Fail-open is better than fail-closed. Users should be able to set `SQUAD_TEAM=my-team` without needing to update `workstreams.json` first. The convention of `team:{name}` is predictable and consistent.

## Design Clarifications

### Overlapping Folder Scope

**Multiple workstreams MAY work on the same folders.** `folderScope` is an advisory guideline, not a hard lock. Reasons:

- **Shared packages**: In a monorepo, `packages/shared/` might be touched by all workstreams. Preventing access would break legitimate work.
- **Interface contracts**: Backend and Frontend workstreams both need to update shared type definitions.
- **Branch isolation handles it**: Since each issue gets its own branch (`squad/{issue}-{slug}`), two workstreams editing the same file won't conflict until merge time — and Git resolves non-overlapping changes automatically.

**When it breaks**: Semantic conflicts — two workstreams make incompatible API changes to the same file. This happened in the Tetris experiment where Backend restructured `game-engine/index.ts` exports while UI added color constants to the same file. Git merged cleanly but the result needed manual reconciliation.

**Mitigation (v2)**: Conflict detection — warn when two workstreams have open PRs touching the same file. Surface this in `squad workstreams status`.

### Single-Machine Multi-Workstream

**One machine can serve multiple workstreams to save costs.** Instead of 1 Codespace per workstream:

```bash
# Sequential switching
squad workstreams activate ui-team    # Ralph works team:ui issues
# ... switch when done ...
squad workstreams activate backend-team  # now works team:backend issues
```

**v2: Round-robin mode** — Ralph cycles through workstreams automatically:
```json
{
  "workstreams": [...],
  "mode": "round-robin",
  "issuesPerWorkstream": 3
}
```

| Approach | Cost | Speed | Isolation |
|----------|------|-------|-----------|
| 1 Codespace per workstream | N× | Fastest (true parallel) | Best |
| 1 machine, manual switch | 1× | Serial | Good |
| 1 machine, round-robin | 1× | Interleaved | Okay — branches isolate, context switches add overhead |

Branch-per-issue ensures no file conflicts regardless of approach — the "workstream" only determines which issues Ralph picks up.

## Future Work

### Meta-Coordinator

A "coordinator of coordinators" that:
- Monitors all workstreams for cross-cutting concerns
- Detects when one workstream's work blocks another
- Suggests label assignments for ambiguous issues
- Produces a unified status dashboard

### Cross-Workstream Dependencies

Track when a workstream needs work from another workstream:
- Automated detection via import graphs
- Cross-workstream issue linking
- Priority escalation for blocking dependencies

### Workstream Templates

Pre-built workstream configurations for common architectures:
- **Frontend/Backend** — 2 workstreams for web apps
- **Monorepo** — 1 workstream per package
- **Microservices** — 1 workstream per service
- **Feature teams** — dynamic workstreams per feature area
