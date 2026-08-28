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
# there. The activation job downloads a self-contained GitHub Release bundle, runs
# initialization, and hands the resulting state to the network-constrained agent job.
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
# `ambient-folders` adds committed `.squad/` state to gh-aw's activation checkout
# so the roster guard can preserve an existing cast. The explicit artifact below
# remains the fail-fast handoff for the standalone distribution.
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
# Default is v0.13.1.
#   This is a GitHub Release tag whose standalone assets are installed without npm.
#   Values without a leading `v` are normalized for compatibility with older configs.
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
ambient-folders:
  - .squad

safe-outputs:
  jobs:
    upsert-lifecycle-state:
      description: Update the single Squad planning lifecycle comment for this issue.
      runs-on: ubuntu-slim
      needs: safe_outputs
      permissions:
        issues: write
        pull-requests: write
      max: 1
      output: Lifecycle state updated.
      inputs:
        body:
          description: Complete lifecycle Markdown beginning with "## Planning Lifecycle"; omit structured data.
          required: true
          type: string
      steps:
        - name: Upsert Squad lifecycle state
          uses: actions/github-script@v9
          env:
            ISSUE_NUMBER: ${{ github.event.issue.number || github.event.pull_request.number || github.event.inputs.issue_number }}
          with:
            script: |
              const { readFileSync } = await import("node:fs");
              const issueNumber = Number(process.env.ISSUE_NUMBER);
              if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
                core.setFailed("A valid issue or pull request number is required.");
                return;
              }

              const output = JSON.parse(readFileSync(process.env.GH_AW_AGENT_OUTPUT, "utf8"));
              const items = (output.items || []).filter(
                (item) => item.type === "upsert_lifecycle_state",
              );
              if (items.length !== 1) {
                core.setFailed(`Expected exactly one lifecycle update, found ${items.length}.`);
                return;
              }

              const body = String(items[0].body || "")
                .replace(/<!--[\s\S]*?-->/g, "")
                .trim();
              if (!body.startsWith("## Planning Lifecycle")) {
                core.setFailed('Lifecycle body must begin with "## Planning Lifecycle".');
                return;
              }
              if (body.length > 50000) {
                core.setFailed("Lifecycle body exceeds 50,000 characters.");
                return;
              }
              if (body.includes("Structured data:") || body.replace(/\s/g, "").includes('"squad_artifact":"lifecycle-state"')) {
                core.setFailed("Lifecycle body must omit structured data.");
                return;
              }

              const data = JSON.stringify({
                squad_artifact: "lifecycle-state",
                schema_version: "1",
                origin_issue: issueNumber,
                phases: [],
              });
              const finalBody = `${body}\n\nStructured data:\n\n\`\`\`json\n${data}\n\`\`\``;
              const comments = await github.paginate(github.rest.issues.listComments, {
                ...context.repo,
                issue_number: issueNumber,
                per_page: 100,
              });
              const marker = '"squad_artifact":"lifecycle-state"';
              const matches = comments
                .filter((comment) =>
                  comment.user?.login === "github-actions[bot]" &&
                  String(comment.body || "").replace(/\s/g, "").includes(marker),
                )
                .sort((left, right) =>
                  String(left.created_at).localeCompare(String(right.created_at)),
                );
              const current = matches.at(-1);

              if (current) {
                await github.rest.issues.updateComment({
                  ...context.repo,
                  comment_id: current.id,
                  body: finalBody,
                });
              } else {
                await github.rest.issues.createComment({
                  ...context.repo,
                  issue_number: issueNumber,
                  body: finalBody,
                });
              }

jobs:
  activation:
    steps:
      - name: Mint Squad GitHub App token
        id: squad-app-token
        if: ${{ vars.SQUAD_GITHUB_APP_ID != '' }}
        uses: actions/create-github-app-token@v3.2.0
        with:
          app-id: ${{ vars.SQUAD_GITHUB_APP_ID }}
          private-key: ${{ secrets.SQUAD_GITHUB_APP_PRIVATE_KEY }}
          owner: ${{ vars.SQUAD_GITHUB_APP_OWNER }}

      - name: Resolve Squad standalone release
        id: squad-release
        env:
          SQUAD_CLI_VERSION: ${{ vars.SQUAD_CLI_VERSION || 'v0.13.1' }}
        run: |
          set -euo pipefail
          release_tag="${SQUAD_CLI_VERSION}"
          case "${release_tag}" in
            v*) ;;
            *) release_tag="v${release_tag}" ;;
          esac
          if ! echo "${release_tag}" | LC_ALL=C grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "::error::SQUAD_CLI_VERSION must be a semver release tag (for example v0.13.1)."
            exit 1
          fi
          echo "tag=${release_tag}" >> "$GITHUB_OUTPUT"

      - name: Install Squad CLI from standalone release
        id: squad-cli
        uses: bradygaster/squad/.github/actions/squad-init@d8d7ef2d6da93460fecbfd56f8de20f9d10fd377
        with:
          version: ${{ steps.squad-release.outputs.tag }}
          skip-init: 'true'

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

      - name: Verify npm-free Squad state wiring
        run: |
          set -euo pipefail
          if [ -f .mcp.json ] && grep -q '"npx"' .mcp.json; then
            echo "::error::.mcp.json references npx; expected the standalone Squad launcher."
            exit 1
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

1. **`jobs.activation.steps`** — the repository is already checked out by the
   activation job. This step optionally mints a GitHub App installation token (or
   uses a supplied PAT), downloads the selected standalone GitHub Release bundle,
   checks whether `.squad/team.md` already exists with roster entries (preserving
   any previously committed cast), and only runs `squad init` if no usable team
   is found. It then runs `squad health --json` when the installed release
   supports it and uploads the resulting `.squad/` team state plus
   `.github/agents/squad.agent.md` only when readiness checks pass — all inside
   the activation job without contacting an npm registry.

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
