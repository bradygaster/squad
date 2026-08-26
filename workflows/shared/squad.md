---
# Squad Bootstrap Component — installs and initializes Squad
# (https://github.com/bradygaster/squad) in the activation job, then hands off
# the generated team state to the agent job.
#
# This is the DISTRIBUTION version of the bootstrap, living under workflows/shared/
# so users can pull it via:
#   gh aw add \
#     bradygaster/squad/workflows/squad.md@dev \
#     bradygaster/squad/workflows/squad-implement-worker.md@dev \
#     bradygaster/squad/workflows/squad-deps-worker.md@dev \
#     bradygaster/squad/workflows/squad-review.md@dev
#
# Design credit: adapted from Peli de Halleux's proven gh-aw integration in
# github/gh-aw. Original:
#   https://github.com/github/gh-aw/blob/main/.github/workflows/shared/squad.md
#
# The Squad CLI is never installed or executed in the agent job — only the files it
# produces (`.squad/` team state and `.github/agents/squad.agent.md`) are restored
# there. This is deliberate: gh-aw's network firewall only constrains the agent job,
# so the npm install and initialization happen in the unrestricted activation job.
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
# Default is 0.12.0.
#   This is the latest published stable release when this workflow was authored.
#   The release pipeline updates this pin only after npm publication.
#
# Optional model override:
#   vars.SQUAD_MODEL
#   Set to a model name or alias (e.g., 'agent', 'opus', 'gpt-5.6-sol',
#   'claude-opus-4.6'). Omit or set to 'auto' for engine default. The gh-aw
#   proxy resolves aliases based on model availability, so if the chosen model
#   is unavailable the proxy walks a fallback chain automatically.
#
# State backend is pinned to `local`: the compiled agent invocation passes
# `--disable-builtin-mcps`, so Squad's `state-mcp` bridge does not load. A non-local
# backend would fail silently. If a committed .squad/team.md with roster entries
# exists (e.g. from a previous /squad cast), init is skipped to preserve it.
model: ${{ vars.SQUAD_MODEL || 'auto' }}
engine:
  id: copilot
  version: 1.0.78
  agent: squad

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

      - name: Install Squad CLI
        id: squad-cli
        env:
          SQUAD_CLI_VERSION: ${{ vars.SQUAD_CLI_VERSION || '0.12.0' }}
        run: |
          set -euo pipefail
          install_root="${RUNNER_TEMP}/squad-cli"
          npm install --global --prefix "$install_root" "@bradygaster/squad-cli@${SQUAD_CLI_VERSION}"
          installed_version="$("$install_root/bin/squad" --version)"
          echo "Installed Squad CLI ${installed_version} (requested ${SQUAD_CLI_VERSION})."
          echo "version=${installed_version}" >> "$GITHUB_OUTPUT"
          echo "$install_root/bin" >> "$GITHUB_PATH"

      - name: Initialize Squad team
        env:
          GH_TOKEN: ${{ steps.squad-app-token.outputs.token || secrets.SQUAD_GITHUB_TOKEN || github.token }}
        run: |
          # Preserve committed cast state: if .squad/team.md already exists with
          # roster entries, skip init to avoid overwriting a merged cast (#1657).
          # Only data rows count as roster entries: a scaffolded team.md carries
          # the table header and separator, and treating those as a cast skips
          # init, leaving a team the readiness check then rejects (#1605).
          if [ -f ".squad/team.md" ] && awk '
            /^## Members/ { in_members = 1; next }
            /^## / { in_members = 0 }
            in_members && /^\|/ && !/^\|[[:space:]]*Name[[:space:]]*\|/ && /[[:alnum:]]/ { found = 1 }
            END { exit found ? 0 : 1 }
          ' .squad/team.md; then
            echo "✓ Existing squad team detected with roster entries — skipping init."
          else
            echo "No existing squad team found — running squad init."
            squad init --preset default --state-backend local
          fi

      - name: Run Squad health check
        env:
          GH_TOKEN: ${{ steps.squad-app-token.outputs.token || secrets.SQUAD_GITHUB_TOKEN || github.token }}
          SQUAD_CLI_VERSION: ${{ steps.squad-cli.outputs.version }}
        run: |
          set -euo pipefail
          if squad help | grep -Fq 'Validate team state for CI'; then
            squad health --json
          else
            echo "::warning::Squad CLI ${SQUAD_CLI_VERSION} predates the health command; the readiness gate will activate after the next published CLI pin."
          fi

      - name: Upload Squad state artifact
        if: success()
        uses: actions/upload-artifact@v7.0.1
        with:
          name: squad-state
          include-hidden-files: true
          path: |
            .squad
            .github/agents/squad.agent.md
          if-no-files-found: error
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
   uses a supplied PAT), installs the selected published Squad CLI globally,
   checks whether `.squad/team.md` already exists with roster entries (preserving
   any previously committed cast), and only runs `squad init` if no usable team
   is found. It then runs `squad health --json` when the installed release
   supports it and uploads the resulting `.squad/` team state plus
   `.github/agents/squad.agent.md` only when readiness checks pass — all inside
   the activation job with unrestricted egress.

2. **`steps:`** (agent job) — downloads the `squad-state` artifact and restores it
   into the workspace. The Squad CLI is never installed here; only the files it
   produced are needed.

-->

## Working with Squad

Squad's team state (`.squad/`) and its Copilot custom agent
(`.github/agents/squad.agent.md`) were initialized during activation and restored
into this checkout before you started — do **not** install Squad or run `squad init`
yourself.

- Verify `.squad/team.md` exists before delegating work to the team. If it is
  missing, the activation-job bootstrap step failed — call `noop` and explain
  why instead of proceeding.
- Coordinate work through the Squad team already defined in `.squad/` rather
  than proposing a brand-new team from scratch.
- This run uses the `local` state backend, and the Squad `state-mcp` bridge is
  **not** available (the agent runs with `--disable-builtin-mcps`). Treat `.squad/`
  as plain files on disk.
- State does **not** carry over between runs unless a committed `.squad/team.md`
  with roster entries exists — in that case, the bootstrap preserves it. The
  casting registry, session logs, and any output produced live only for this run.
