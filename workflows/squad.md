---
name: Squad
description: Cast, connect, or adopt a Squad AI team for your repository
emoji: "🧑‍🤝‍🧑"
private: true
on:
  slash_command:
    name: squad
    events:
      - issue_comment
      - pull_request_review_comment
  workflow_dispatch:
permissions:
  contents: write
  issues: write
  pull-requests: write
  copilot-requests: write
network:
  allowed:
    - defaults
imports:
  - shared/squad.md
tools:
  bash: true
  github:
    mode: gh-proxy
    toolsets: [default]
safe-outputs:
  create-pull-request:
    title-prefix: "[squad] "
    labels: [squad]
    max: 3
    expires: 14
    close-older-prs: false
---

# Squad — Unified `/squad` Slash Command

Invoked via `/squad <mode> [options]` in issue comments or PR review comments,
or manually via workflow_dispatch.

## Modes

Parse the slash command text to determine the mode:

| Command | Mode | Description |
|---------|------|-------------|
| `/squad cast` | Cast | Analyze repo and generate a new Squad team |
| `/squad connect <source>` | Connect | Link to an existing Squad source |
| `/squad adopt <url>` | Adopt | Pull squad config from a remote source |
| `/squad cast-member <spec>` | Cast Member | Add/modify a single team member |
| `/squad retire <name>` | Retire | Remove a team member |
| `/squad status` | Status | Report current team composition |
| `/squad` (no args) | Cast | Default to cast mode |

## Task

<!-- TODO: Full implementation in #1614-#1617 -->

### 1. Parse Command

Extract mode and arguments from the slash command text. Default to `cast` if
no subcommand is provided.

### 2. Execute Mode

#### Cast Mode
<!-- TODO: Full implementation in #1614 -->

1. Analyze the repository structure, languages, and conventions
2. Run `squad init` via the squad-init composite action
3. Generate `meet-the-squad.md` introducing the cast team
4. Open a PR with the `.squad/` directory and `meet-the-squad.md`

#### Connect Mode
<!-- TODO: Full implementation in #1615 -->

1. Validate the provided `<source>` URL or repo reference
2. Write `.squad/config.json` with `squadSource` pointing to the remote team
3. Open a PR with the configuration change

#### Adopt Mode
<!-- TODO: Full implementation in #1616 -->

1. Fetch squad configuration from the provided `<url>`
2. Copy `.squad/` directory contents into the local repository
3. Run any necessary migrations or version checks
4. Open a PR with the adopted squad configuration

#### Cast Member Mutation
<!-- TODO: Full implementation in #1617 -->

1. Parse the member specification from arguments
2. Modify the existing squad (add, update, or mutate the specified member)
3. Push changes to a PR branch

#### Retire Mode
<!-- TODO: Full implementation in #1617 -->

1. Locate the named member in `.squad/agents/`
2. Remove from roster in `team.md` and routing table
3. Archive the agent's charter and history
4. Push changes to a PR branch

#### Status Mode

1. Read `.squad/team.md` and parse the roster
2. Report team composition: members, roles, and status
3. Post a comment summarizing the current squad state
