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
    upsert-research-artifact:
      description: Create or replace the single Squad research artifact for this issue.
      runs-on: ubuntu-slim
      needs: safe_outputs
      permissions:
        issues: write
        pull-requests: write
      max: 1
      output: Research artifact updated.
      inputs:
        body:
          description: Complete research Markdown with an H2 Squad Research heading and all required sections; structured data is normalized by the writer.
          required: true
          type: string
      steps:
        - name: Upsert Squad research artifact
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
                (item) => item.type === "upsert_research_artifact",
              );
              if (items.length !== 1) {
                core.setFailed(`Expected exactly one research update, found ${items.length}.`);
                return;
              }

              const rawBody = String(items[0].body || "")
                .replace(/<!--[\s\S]*?-->/g, "")
                .trim();
              if (rawBody.length > 50000) {
                core.setFailed("Research body exceeds 50,000 characters.");
                return;
              }
              const marker = '"squad_artifact":"research"';
              const trailingMetadata = rawBody.match(
                /\n+(?:Structured data:\s*\n+)?```json\s*(\{(?:(?!```)[\s\S])*?\})\s*```\s*$/i,
              );
              const body = trailingMetadata &&
                trailingMetadata[1].replace(/\s/g, "").includes(marker)
                ? rawBody.slice(0, trailingMetadata.index).trim()
                : rawBody;
              const firstLine = body.split(/\r?\n/, 1)[0];
              const requiredSections = [
                "Goals",
                "Non-goals",
                "Evidence table",
                "Load-bearing assumptions",
                "Open decisions",
                "Acceptance framing",
              ];
              const hasRequiredSections = requiredSections.every((section) => {
                const label = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                return new RegExp(
                  `^(?:#{2,6}\\s+${label}|\\*\\*${label}\\*\\*)\\s*$`,
                  "im",
                ).test(body);
              });
              if (!/^##\s+.*\bSquad Research\b/i.test(firstLine) || !hasRequiredSections) {
                core.setFailed("Research body must include an H2 Squad Research heading and every required section.");
                return;
              }
              if (body.includes("Structured data:") || body.replace(/\s/g, "").includes(marker)) {
                core.setFailed("Research body must omit structured data.");
                return;
              }

              const data = JSON.stringify({
                squad_artifact: "research",
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
              const matches = comments
                .filter((comment) => {
                  if (comment.user?.login !== "github-actions[bot]") return false;
                  const blocks = String(comment.body || "").matchAll(
                    /```json\s*(\{(?:(?!```)[\s\S])*?\})\s*```/gi,
                  );
                  for (const block of blocks) {
                    try {
                      const candidate = JSON.parse(block[1]);
                      if (
                        candidate.squad_artifact === "research" &&
                        candidate.schema_version === "1" &&
                        candidate.origin_issue === issueNumber
                      ) {
                        return true;
                      }
                    } catch {
                      // Ignore non-JSON fences and continue scanning this comment.
                    }
                  }
                  return false;
                })
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
                for (const duplicate of matches.slice(0, -1)) {
                  await github.rest.issues.deleteComment({
                    ...context.repo,
                    comment_id: duplicate.id,
                  });
                }
              } else {
                await github.rest.issues.createComment({
                  ...context.repo,
                  issue_number: issueNumber,
                  body: finalBody,
                });
              }

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
          description: Complete lifecycle Markdown with an H2 lifecycle heading plus state, last-command, and next-action fields; structured data is normalized by the writer.
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

              const rawBody = String(items[0].body || "")
                .replace(/<!--[\s\S]*?-->/g, "")
                .trim();
              if (rawBody.length > 50000) {
                core.setFailed("Lifecycle body exceeds 50,000 characters.");
                return;
              }
              const marker = '"squad_artifact":"lifecycle-state"';
              const trailingMetadata = rawBody.match(
                /\n+(?:Structured data:\s*\n+)?```json\s*(\{(?:(?!```)[\s\S])*?\})\s*```\s*$/i,
              );
              const body = trailingMetadata &&
                trailingMetadata[1].replace(/\s/g, "").includes(marker)
                ? rawBody.slice(0, trailingMetadata.index).trim()
                : rawBody;
              const firstLine = body.split(/\r?\n/, 1)[0];
              const hasLifecycleHeading =
                /^##\s+/.test(firstLine) &&
                /\blifecycle\b/i.test(firstLine) &&
                (/\bsquad\b/i.test(firstLine) || /\bplanning\b/i.test(firstLine));
              const hasState = /^(?:[-*]\s+)?\*\*(?:Current state|State):\*\*\s+\S+/im.test(body);
              const hasLastCommand = /^(?:[-*]\s+)?\*\*Last command:\*\*\s+`\/squad\b[^`]*`/im.test(body);
              const hasNextCommand = /^(?:[-*]\s+)?\*\*Next (?:action|command|recommended):\*\*\s+`\/squad\b[^`]*`/im.test(body);
              const hasActivationDone =
                /^(?:[-*]\s+)?(?:\*\*)?Activation:(?:\*\*)?\s+✅\s+Done\b/im.test(body) ||
                /^\|\s*Activat(?:e|ion|ed)\s*\|\s*✅\s+Done\s*\|/im.test(body);
              const hasTerminalState =
                /^(?:[-*]\s+)?\*\*(?:Current state|State):\*\*\s+Activated\s*$/im.test(body) &&
                hasActivationDone &&
                /^(?:[-*]\s+)?\*\*Last command:\*\*\s+`\/squad (?:activate|plan accept)(?: phase \d+)?`(?:\s+.*)?$/im.test(body) &&
                /^(?:[-*]\s+)?\*\*Next (?:action|command|recommended):\*\*\s+\S.+$/im.test(body);
              const hasNextAction = hasNextCommand || hasTerminalState;
              if (!hasLifecycleHeading || !hasState || !hasLastCommand || !hasNextAction) {
                core.setFailed("Lifecycle body must include an H2 lifecycle heading plus state, last-command, and next-action fields.");
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
  repair_activated_lifecycle:
    name: Repair terminal Squad lifecycle
    needs:
      - agent
      - detection
      - safe_outputs
    if: >-
      ${{
        !cancelled() &&
        needs.agent.result == 'success' &&
        needs.detection.result == 'success' &&
        needs.safe_outputs.result == 'success' &&
        !contains(needs.agent.outputs.output_types, 'upsert_lifecycle_state') &&
        github.event_name == 'issue_comment' &&
        (github.event.comment.body == '/squad activate' ||
         github.event.comment.body == '/squad plan accept')
      }}
    runs-on: ubuntu-slim
    permissions:
      issues: write
      pull-requests: write
    steps:
      - name: Repair terminal lifecycle after idempotent activation
        uses: actions/github-script@v9
        env:
          ISSUE_NUMBER: ${{ github.event.issue.number || github.event.pull_request.number }}
          SQUAD_COMMAND: ${{ github.event.comment.body }}
        with:
          script: |
            const issueNumber = Number(process.env.ISSUE_NUMBER);
            const command = String(process.env.SQUAD_COMMAND || "").trim();
            if (
              !Number.isInteger(issueNumber) ||
              issueNumber <= 0 ||
              !["/squad activate", "/squad plan accept"].includes(command)
            ) {
              core.setFailed("A valid whole-plan activation command and issue number are required.");
              return;
            }

            const comments = await github.paginate(github.rest.issues.listComments, {
              ...context.repo,
              issue_number: issueNumber,
              per_page: 100,
            });
            const trusted = comments.filter(
              (comment) => comment.user?.login === "github-actions[bot]",
            );
            const envelopeFor = (comment) => {
              const matches = String(comment.body || "").matchAll(
                /Structured data:\s*```json\s*([\s\S]*?)```/gi,
              );
              let envelope = null;
              for (const match of matches) {
                try {
                  envelope = JSON.parse(match[1]);
                } catch (error) {
                  if (!(error instanceof SyntaxError)) throw error;
                }
              }
              return envelope;
            };
            const artifacts = trusted.map((comment) => ({
              comment,
              envelope: envelopeFor(comment),
            }));
            const accepted = artifacts.some(
              ({ envelope }) =>
                envelope?.squad_artifact === "plan-accepted" &&
                envelope?.schema_version === "1" &&
                envelope?.origin_issue === issueNumber &&
                Array.isArray(envelope?.phases) &&
                envelope.phases.length === 0,
            );
            if (!accepted) {
              core.info("No trusted whole-plan acceptance artifact; lifecycle repair is not applicable.");
              return;
            }

            const lifecycle = artifacts
              .filter(
                ({ envelope }) =>
                  envelope?.squad_artifact === "lifecycle-state" &&
                  envelope?.schema_version === "1" &&
                  envelope?.origin_issue === issueNumber,
              )
              .sort(({ comment: left }, { comment: right }) =>
                String(left.created_at).localeCompare(String(right.created_at)),
              )
              .at(-1)?.comment;
            const lifecycleBody = String(lifecycle?.body || "");
            const terminal =
              /^(?:[-*]\s+)?\*\*(?:Current state|State):\*\*\s+Activated\s*$/im.test(lifecycleBody) &&
              /^(?:[-*]\s+)?\*\*Activation:\*\*\s+✅\s+Done\s*$/im.test(lifecycleBody) &&
              /^(?:[-*]\s+)?\*\*Last command:\*\*\s+`\/squad (?:activate|plan accept)`\s*$/im.test(lifecycleBody);
            if (terminal) {
              core.info("The newest lifecycle tracker already records terminal activation.");
              return;
            }

            const body = [
              `## 🧭 Squad Lifecycle State — Issue #${issueNumber}`,
              "",
              "- **State:** Activated",
              "- **Plan:** ✅ Done",
              "- **Activation:** ✅ Done",
              `- **Last command:** \`${command}\``,
              "- **Next action:** Track progress on the created task issues; no further planning action is required.",
            ].join("\n");
            const data = JSON.stringify({
              squad_artifact: "lifecycle-state",
              schema_version: "1",
              origin_issue: issueNumber,
              phases: [],
            });
            const finalBody = `${body}\n\nStructured data:\n\n\`\`\`json\n${data}\n\`\`\``;

            if (lifecycle) {
              await github.rest.issues.updateComment({
                ...context.repo,
                comment_id: lifecycle.id,
                body: finalBody,
              });
            } else {
              await github.rest.issues.createComment({
                ...context.repo,
                issue_number: issueNumber,
                body: finalBody,
              });
            }

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
