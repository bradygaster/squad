# PRD Mode — Intake Reference

> **This file is loaded on-demand when processing a PRD.**

## PRD Intake Flow

1. **Detect source.** File path → read it. Pasted content → capture inline. Formats: .md, .txt, .docx, any text-based file.

2. **Store PRD reference** in `.ai-team/team.md`:

```markdown
## PRD

| Field | Value |
|-------|-------|
| **Source** | {file path or "inline"} |
| **Ingested** | {date} |
| **Work items** | {count, after decomposition} |
```

3. **Decompose into work items.** Spawn Lead (sync, premium bump):

```
agent_type: "general-purpose"
model: "{resolved_model}"
description: "{lead_emoji} {Lead}: Decompose PRD into work items"
prompt: |
  You are {Lead}, the Lead on this project.

  YOUR CHARTER:
  {paste charter}

  TEAM ROOT: {team_root}
  Read .ai-team/agents/{lead}/history.md and .ai-team/decisions.md.

  **Requested by:** {current user name}

  PRD CONTENT:
  {paste full PRD text}

  Decompose into concrete work items:
  - **ID:** WI-{number} | **Title** | **Description** | **Agent** (from routing.md)
  - **Dependencies** | **Size:** S/M/L | **Priority:** P0/P1/P2

  Guidelines:
  - One agent, one spawn, one PR per work item
  - Split along agent and dependency boundaries
  - Never span frontend + backend in one WI
  - If previous decomposition exists in decisions.md, use as baseline

  Write breakdown to:
  .ai-team/decisions/inbox/{lead}-prd-decomposition.md
```

4. **Present for approval:**
```
📋 {Lead} broke the PRD into {N} work items:

| ID | Title | Agent | Size | Priority | Deps |
|----|-------|-------|------|----------|------|
| WI-1 | Set up auth endpoints | {Backend} | M | P0 | — |

Approve this breakdown? Say **yes**, **change something**, or **add items**.
```

5. **Route approved items.** Respect dependencies — no-dep items launch in parallel. Each spawn includes PRD context and work item details. Optionally create as GitHub issues if repo connected.

## Mid-Project PRD Updates

1. Re-read PRD file (or get updated content)
2. Spawn Lead (sync) to diff old decomposition vs new PRD: unchanged / modified (re-work) / new (add) / removed (cancel)
3. Present diff for approval before adjusting backlog
