---
# Squad Bootstrap Component — installs and initializes Squad
# (https://github.com/bradygaster/squad) in the activation job, then hands off
# the generated team state to the agent job.
#
# This is the DISTRIBUTION version of the bootstrap, living under workflows/shared/
# so users can pull it via:
#   gh aw add bradygaster/squad/workflows/squad.md@latest
#
# Design credit: adapted from Peli de Halleux's proven gh-aw integration in
# github/gh-aw. Original:
#   https://github.com/github/gh-aw/blob/main/.github/workflows/shared/squad.md
#
# The Squad CLI is never installed or executed in the agent job — only the files it
# produces (`.squad/` team state and `.github/agents/squad.agent.md`) are restored
# there. This is deliberate: gh-aw's network firewall only constrains the agent job,
# so all install/network work happens in the unrestricted activation job.
#
# Usage (as an import in your gh-aw workflow):
#   imports:
#     - shared/squad.md
#
# Usage (remote import, pinned to a ref):
#   imports:
#     - bradygaster/squad/workflows/shared/squad.md@latest
#   (Pin to a SHA for reproducible builds:
#     - bradygaster/squad/workflows/shared/squad.md@<40-char-commit-sha>)
#
# How the coordinator reaches the agent: gh-aw natively restores files under
# `.github/agents/*.agent.md` as inline sub-agents. The `squad.agent.md` that
# `squad init` writes is picked up by that mechanism. Additionally, `engine.agent`
# is set to `squad`, so the compiler emits `--agent squad` on the Copilot invocation.
#
# `ambient-folders` (gh-aw main): upstream now uses a top-level
# `ambient-folders: [.squad, .github/agents]` key to bundle Squad's files into the
# standard activation artifact. That feature is unreleased on stable — once it ships,
# the explicit artifact upload/download below can be replaced.
#
# Optional custom credentials for `squad init`:
#   vars.SQUAD_GITHUB_APP_ID / secrets.SQUAD_GITHUB_APP_PRIVATE_KEY / vars.SQUAD_GITHUB_APP_OWNER
#     — mints a GitHub App installation token
#   secrets.SQUAD_GITHUB_TOKEN
#     — fallback if the App ID is not set
# Auth precedence: GitHub App installation token > SQUAD_GITHUB_TOKEN > github.token
#
# Optional custom Squad CLI version:
#   vars.SQUAD_CLI_VERSION
#   Default is determined by the squad-init composite action (latest release).
#
# State backend is pinned to `local`: the compiled agent invocation passes
# `--disable-builtin-mcps`, so Squad's `state-mcp` bridge does not load. A non-local
# backend would fail silently. Cross-run state does NOT persist — every run starts
# from a fresh `squad init`.
engine:
  id: copilot
  agent: squad

ambient-folders:
  - ".squad"
  - ".github/agents"

jobs:
  activation:
    pre-steps:
      - name: Mint Squad GitHub App token
        id: squad-app-token
        if: ${{ vars.SQUAD_GITHUB_APP_ID != '' }}
        uses: actions/create-github-app-token@v3.2.0
        with:
          app-id: ${{ vars.SQUAD_GITHUB_APP_ID }}
          private-key: ${{ secrets.SQUAD_GITHUB_APP_PRIVATE_KEY }}
          owner: ${{ vars.SQUAD_GITHUB_APP_OWNER }}

      - name: Initialize Squad team
        uses: bradygaster/squad/.github/actions/squad-init@dev
        with:
          version: ${{ vars.SQUAD_CLI_VERSION || 'latest' }}
          preset: default
          state-backend: local
        env:
          GH_TOKEN: ${{ steps.squad-app-token.outputs.token || secrets.SQUAD_GITHUB_TOKEN || github.token }}

      - name: Upload Squad state artifact
        if: success()
        uses: actions/upload-artifact@v7.0.1
        with:
          name: squad-state
          include-hidden-files: true
          path: |
            .squad
            .github/agents/squad.agent.md
          if-no-files-found: ignore
          retention-days: 1

steps:
  - name: Restore Squad state from activation artifact
    continue-on-error: true
    uses: actions/download-artifact@v8.0.1
    with:
      name: squad-state
      path: ${{ github.workspace }}
---

<!--

## Squad Bootstrap Component

This shared component handles the entire Squad install/init lifecycle outside the
agent sandbox:

1. **`jobs.activation.pre-steps`** — the repository is already checked out by the
   activation job. This step optionally mints a GitHub App installation token (or
   uses a supplied PAT), runs Squad initialization via the `squad-init` composite
   action (from bradygaster/squad/.github/actions/squad-init@dev — the npm-free
   replacement for `npx @bradygaster/squad-cli`), and uploads the resulting
   `.squad/` team state plus `.github/agents/squad.agent.md` as a `squad-state`
   artifact — all inside the activation job with unrestricted egress.

2. **`steps:`** (agent job) — downloads the `squad-state` artifact and restores it
   into the workspace. The Squad CLI is never installed here; only the files it
   produced are needed.

Key difference from the .github/workflows/shared/ version: this file uses the
squad-init composite action instead of npx, eliminating the npm registry dependency.

-->

## Working with Squad

Squad's team state (`.squad/`) and its Copilot custom agent
(`.github/agents/squad.agent.md`) were initialized during activation and restored
into this checkout before you started — do **not** install Squad or run `squad init`
yourself, and do **not** try to reach the npm registry.

- Verify `.squad/team.md` exists before delegating work to the team. If it is
  missing, the activation-job bootstrap step failed — call `noop` and explain
  why instead of proceeding.
- Coordinate work through the Squad team already defined in `.squad/` rather
  than proposing a brand-new team from scratch.
- This run uses the `local` state backend, and the Squad `state-mcp` bridge is
  **not** available (the agent runs with `--disable-builtin-mcps`). Treat `.squad/`
  as plain files on disk.
- State does **not** carry over between runs. The casting registry, session logs,
  and any output produced live only for this run.
