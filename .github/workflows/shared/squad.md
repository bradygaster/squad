---
# Squad Bootstrap — installs and initializes Squad (https://github.com/bradygaster/squad)
# in the activation job only, then republishes the generated team state to the agent job.
#
# Design credit: adapted from Peli de Halleux's proven gh-aw integration in
# github/gh-aw, offered for upstreaming into Squad. Original:
#   https://github.com/github/gh-aw/blob/main/.github/workflows/shared/squad.md
#
# The Squad CLI is never installed or executed in the agent job — only the files it
# produces (`.squad/` team state and `.github/agents/squad.agent.md`) are restored there.
# This is deliberate: gh-aw's network firewall only constrains the agent job, so all
# npm/network work happens in the unrestricted activation job.
#
# Usage (repo-local — you have vendored this file into .github/workflows/shared/):
#   imports:
#     - shared/squad.md
#
# Usage (remote — importing straight from bradygaster/squad, pinned to a SHA):
#   imports:
#     - bradygaster/squad/.github/workflows/shared/squad.md@<40-char-commit-sha>
#   (A branch (@main) or tag (@v0.11.0) also works, but pin to a SHA for reproducible
#   builds. gh-aw caches remote imports under .github/aw/imports/ by commit SHA.)
#
# How the coordinator reaches the agent: gh-aw natively restores files under
# `.github/agents/*.agent.md` as inline sub-agents (its compiled lock has a
# "Restore inline sub-agents from activation artifact" step keyed on
# GH_AW_SUB_AGENT_DIR=".github/agents" / GH_AW_SUB_AGENT_EXT=".agent.md"). The
# `squad.agent.md` this bootstrap produces is picked up by that mechanism — there is
# NO `--agent squad` flag on the compiled Copilot invocation, so do not rely on one.
#
# Optional custom credentials for `squad init` (only needed when Squad must reach other
# organizations or private repositories beyond the current one):
#   vars.SQUAD_GITHUB_APP_ID / secrets.SQUAD_GITHUB_APP_PRIVATE_KEY / vars.SQUAD_GITHUB_APP_OWNER
#     — mints a GitHub App installation token for `squad init`
#   secrets.SQUAD_GITHUB_TOKEN
#     — used if the App id is not set
# Auth precedence: GitHub App installation token > SQUAD_GITHUB_TOKEN > the workflow's
# own default token (`github.token`).
#
# Optional custom Squad CLI version (defaults to 0.11.0):
#   vars.SQUAD_CLI_VERSION
#   NOTE: bump this default with every Squad CLI release so remote importers who do not
#   set vars.SQUAD_CLI_VERSION get a current CLI. See the PR body for the follow-up on
#   wiring this into release tooling automatically.
#
# State backend is pinned to `local` on purpose: the compiled agent invocation passes
# `--disable-builtin-mcps`, so Squad's `state-mcp` bridge does not load in the agent job.
# A non-local backend would fail silently, so `squad init` is run with `--state-backend
# local`. Cross-run state does NOT persist (the squad-state artifact is a within-run
# handoff with retention-days: 1) — every run starts from a fresh `squad init`.
engine:
  id: copilot

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
        env:
          SQUAD_CLI_VERSION: ${{ vars.SQUAD_CLI_VERSION }}
          GH_TOKEN: ${{ steps.squad-app-token.outputs.token || secrets.SQUAD_GITHUB_TOKEN || github.token }}
        run: npx --yes "@bradygaster/squad-cli@${SQUAD_CLI_VERSION:-0.11.0}" init --preset default --state-backend local

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

This shared component moves the entire Squad (https://github.com/bradygaster/squad)
install/init lifecycle out of the agent job:

1. **`jobs.activation.pre-steps`** — the repository is already checked out by the
   activation job itself, so this only installs the pinned `@bradygaster/squad-cli`
   npm release, optionally mints a GitHub App installation token (or uses a supplied
   PAT) so `squad init` can see other organizations or private repositories, runs
   `squad init --preset default --state-backend local` (idempotent), and uploads the
   resulting `.squad/` team state plus `.github/agents/squad.agent.md` as a dedicated
   `squad-state` artifact — all inside the activation job, which runs with
   unrestricted egress, alongside the rest of the prompt/skills/sub-agent packaging.
2. **`steps:`** (agent job) — downloads the `squad-state` artifact and restores it into
   the checked-out workspace. The Squad CLI itself is never installed here; only the
   files it produced are copied in.

-->

## Working with Squad

Squad's team state (`.squad/`) and its Copilot custom agent
(`.github/agents/squad.agent.md`) were already initialized during activation and
restored into this checkout before you started — do **not** install Squad or run
`squad init` yourself, and do **not** try to reach the npm registry.

- Verify `.squad/team.md` exists before delegating work to the team. If it is
  missing, the activation-job bootstrap step failed — call `noop` and explain
  why instead of proceeding.
- Coordinate work through the Squad team already defined in `.squad/` rather
  than proposing a brand-new team from scratch.
- This run uses the `local` state backend, and the Squad `state-mcp` bridge is
  **not** available in this job (the agent runs with `--disable-builtin-mcps`).
  Treat `.squad/` as plain files on disk: read and write team state directly
  rather than expecting MCP state tools.
- State does **not** carry over between runs. The casting registry, session
  logs, and any Scribe output you produce live only for this run. Do not assume
  a prior run's decisions are still on disk — start from what `squad init`
  produced plus the repository's own tracked history (issues, PRs, `.squad/`
  files committed to the repo).
