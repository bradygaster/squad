---
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
          description: Complete lifecycle Markdown with an H2 lifecycle heading plus state, last-command, and next-action fields. For a nonterminal state, the next-action value must consist of a backticked /squad command; put explanatory prose in a separate field. Structured data is normalized by the writer.
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
              const hasNextCommand = /^(?:[-*]\s+)?\*\*Next (?:action|command|recommended):\*\*\s+`\/squad\b[^`]*`[ \t]*$/im.test(body);
              const hasActivationDone =
                /^(?:[-*]\s+)?(?:\*\*)?Activation:(?:\*\*)?\s+✅\s+Done\b/im.test(body) ||
                /^\|\s*Activat(?:e|ion|ed)\s*\|\s*✅\s+Done\b[^|]*\|/im.test(body);
              const hasTerminalState =
                /^(?:[-*]\s+)?\*\*(?:Current state|State):\*\*\s+Activated\s*$/im.test(body) &&
                hasActivationDone &&
                /^(?:[-*]\s+)?\*\*Last command:\*\*\s+`\/squad (?:activate|plan accept|plan activate)(?: phase \d+)?`(?:\s+.*)?$/im.test(body) &&
                /^(?:[-*]\s+)?\*\*Next (?:action|command|recommended):\*\*\s+\S.+$/im.test(body);
              const hasNextAction = hasNextCommand || hasTerminalState;
              if (!hasLifecycleHeading || !hasState || !hasLastCommand || !hasNextAction) {
                core.setFailed("Lifecycle body must include an H2 lifecycle heading plus state, last-command, and a nonterminal next-action value consisting of a backticked /squad command.");
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
  steps:
    - name: Checkout executing workflow commit for the implementation provenance guard
      uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
      with:
        ref: ${{ github.workflow_sha }}
        persist-credentials: false
        path: .squad-trusted-base
    - name: Enforce dependency implementation provenance before any output
      uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3
      env:
        GH_AW_AGENT_OUTPUT: ${{ steps.setup-agent-output-env.outputs.GH_AW_AGENT_OUTPUT }}
        GITHUB_REPOSITORY_ID: ${{ github.event.repository.id }}
        SQUAD_IMPLEMENT_WORKER: squad-deps-worker
        SQUAD_IMPLEMENT_ISSUE_NUMBER: ${{ github.event.inputs.issue_number }}
        SQUAD_IMPLEMENT_SESSION_ID: ${{ github.event.inputs.implementation_session_id }}
        SQUAD_IMPLEMENT_DISPATCHER_WORKFLOW: ${{ github.event.inputs.implementation_session_origin_workflow }}
        SQUAD_IMPLEMENT_DISPATCHER_RUN_ID: ${{ github.event.inputs.implementation_session_origin_run_id }}
        SQUAD_IMPLEMENT_DISPATCHER_RUN_ATTEMPT: ${{ github.event.inputs.implementation_session_origin_run_attempt }}
        SQUAD_IMPLEMENT_WORKFLOW: .github/workflows/squad-deps-worker.lock.yml
        SQUAD_IMPLEMENT_NAMESPACE: deps
        SQUAD_IMPLEMENT_REQUIRE_LEGACY_MARKER: "false"
      with:
        script: |
          const nodePath = require('node:path');
          const { pathToFileURL } = require('node:url');
          const trustedRoot = nodePath.join(process.env.GITHUB_WORKSPACE, '.squad-trusted-base');
          const provenance = await import(pathToFileURL(nodePath.join(
            trustedRoot,
            '.github/workflows/shared/squad-implementation-provenance.mjs',
          )).href);
          const fetchJson = async (route, fields) =>
            (await github.request(`GET /${route}`, fields)).data;
          const result = await provenance.enforceImplementationProvenanceSafeOutputs(
            process.env,
            { fetchJson },
          );
          if (result.ok) return;
          for (const line of provenance.describeImplementationProvenanceViolations(
            result.violations,
          )) core.error(`refused: ${line}`);
          core.setFailed('Squad implementation provenance guard refused this run.');
  env:
    GITHUB_REPOSITORY_ID: ${{ github.event.repository.id }}
    SQUAD_IMPLEMENT_WORKER: squad-deps-worker
    SQUAD_IMPLEMENT_ISSUE_NUMBER: ${{ github.event.inputs.issue_number }}
    SQUAD_IMPLEMENT_SESSION_ID: ${{ github.event.inputs.implementation_session_id }}
    SQUAD_IMPLEMENT_DISPATCHER_WORKFLOW: ${{ github.event.inputs.implementation_session_origin_workflow }}
    SQUAD_IMPLEMENT_DISPATCHER_RUN_ID: ${{ github.event.inputs.implementation_session_origin_run_id }}
    SQUAD_IMPLEMENT_DISPATCHER_RUN_ATTEMPT: ${{ github.event.inputs.implementation_session_origin_run_attempt }}
    SQUAD_IMPLEMENT_WORKFLOW: .github/workflows/squad-deps-worker.lock.yml
    SQUAD_IMPLEMENT_NAMESPACE: deps
    SQUAD_IMPLEMENT_REQUIRE_LEGACY_MARKER: "false"
  scripts:
    record-implementation-provenance:
      description: Emit authoritative implementation provenance as a comment after the referenced pull request has been created.
      inputs:
        pull_request:
          description: Temporary ID of the create_pull_request output
          required: true
          type: string
        goals_json:
          description: JSON array of explicit issue goals for the pull request
          required: true
          type: string
        replaces_json:
          description: JSON array of verified pull requests replaced by this pull request
          required: true
          type: string
      script: |
        const nodePath = require('node:path');
        const { pathToFileURL } = require('node:url');
        const trustedRoot = nodePath.join(process.env.GITHUB_WORKSPACE, '.squad-trusted-base');
        const provenance = await import(pathToFileURL(nodePath.join(
          trustedRoot,
          '.github/workflows/shared/squad-implementation-provenance.mjs',
        )).href);
        const fetchJson = async (route, fields) =>
          (await github.request(`GET /${route}`, fields)).data;
        return provenance.emitImplementationProvenanceComment({
          item,
          resolvedTemporaryIds,
          env: process.env,
          fetchJson,
          createComment: async (repository, issueNumber, body) => {
            const [owner, repo] = repository.split('/');
            await github.rest.issues.createComment({
              owner,
              repo,
              issue_number: issueNumber,
              body,
            });
          },
        });
  create-pull-request:
    title-prefix: "[squad-deps] "
    labels:
      - squad
    max: 1
    require-temporary-id: true
    allowed-base-branches:
      - squad/*
    allowed-branches:
      - squad/deps-*
    allowed-files:
      - package.json
      - "**/package.json"
      - package-lock.json
      - "**/package-lock.json"
      - npm-shrinkwrap.json
      - "**/npm-shrinkwrap.json"
      - yarn.lock
      - "**/yarn.lock"
      - pnpm-lock.yaml
      - "**/pnpm-lock.yaml"
      - Directory.Packages.props
      - "**/Directory.Packages.props"
      - go.mod
      - "**/go.mod"
      - go.sum
      - "**/go.sum"
    protected-files:
      policy: fallback-to-issue
      exclude:
        - package.json
        - package-lock.json
        - yarn.lock
        - pnpm-lock.yaml
        - npm-shrinkwrap.json
        - Directory.Packages.props
        - go.mod
        - go.sum
    excluded-files:
      - node_modules/**
      - "**/node_modules/**"
      - vendor/**
      - "**/vendor/**"
      - bin/**
      - "**/bin/**"
      - obj/**
      - "**/obj/**"
      - .github/workflows/**
      - "**/.github/workflows/**"
      - .github/agents/**
      - "**/.github/agents/**"
      - .github/aw/**
      - "**/.github/aw/**"
      - .squad/**
      - "**/.squad/**"
    max-patch-files: 25
    expires: 14d
  add-comment:
    max: 3
    target: "*"
jobs:
  repair_activated_lifecycle:
    name: Repair terminal Squad lifecycle
    needs:
      - agent
      - detection
      - safe_outputs
    if: |-
      ${{
        !cancelled() &&
        needs.agent.result == 'success' &&
        needs.detection.result == 'success' &&
        needs.safe_outputs.result == 'success' &&
        !contains(needs.agent.outputs.output_types, 'upsert_lifecycle_state') &&
        github.event_name == 'issue_comment' &&
        (github.event.comment.body == '/squad activate' ||
         github.event.comment.body == '/squad plan accept' ||
         github.event.comment.body == '/squad plan activate')
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
              !["/squad activate", "/squad plan accept", "/squad plan activate"].includes(command)
            ) {
              core.setFailed("A valid whole-plan activation command and issue number are required.");
              return;
            }

            const actor = String(context.payload.comment?.user?.login || "").trim();
            if (!actor) {
              core.setFailed("Lifecycle repair requires an identifiable comment author.");
              return;
            }
            let permission;
            try {
              const response = await github.rest.repos.getCollaboratorPermissionLevel({
                ...context.repo,
                username: actor,
              });
              permission = String(response.data?.permission || "").toLowerCase();
            } catch (error) {
              core.setFailed(`Unable to verify lifecycle repair permission for ${actor}: ${error.message}`);
              return;
            }
            if (!["admin", "maintain", "write"].includes(permission)) {
              core.info(`Lifecycle repair is not authorized for ${actor} with ${permission || "unresolved"} permission.`);
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
            const ok = artifacts.some(
              ({ envelope: e }) =>
                ["plan-accepted", "activated"].includes(e?.squad_artifact) &&
                e?.schema_version === "1" &&
                e?.origin_issue === issueNumber &&
                Array.isArray(e?.phases) &&
                (e.squad_artifact === "activated" || e.phases.length === 0),
            );
            if (!ok) {
              core.info("No trusted whole-plan acceptance or activation artifact; lifecycle repair is not applicable.");
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
              (/^(?:[-*]\s+)?(?:\*\*)?Activation:(?:\*\*)?\s+✅\s+Done\b/im.test(lifecycleBody) ||
                /^\|\s*Activat(?:e|ion|ed)\s*\|\s*✅\s+Done\b[^|]*\|/im.test(lifecycleBody)) &&
              /^(?:[-*]\s+)?\*\*Last command:\*\*\s+`\/squad (?:activate|plan accept|plan activate)(?: phase \d+)?`(?:\s+.*)?$/im.test(lifecycleBody);
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
          skip-init: "true"
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
name: Squad Dependency Worker
run-name: Squad deps — ${{ github.event.inputs.issue_number }}
description: "Add, remove, or update package dependencies for one Squad issue under narrow dependency-manifest/lockfile authority (Wave 1: npm/yarn/pnpm, NuGet CPM, Go)"
private: false
on:
  bots:
    - github-actions[bot]
  workflow_dispatch:
    inputs:
      issue_number:
        description: Issue number requesting a dependency change
        required: true
        type: string
      implementation_session_id:
        description: Opaque durable identifier minted by the dispatching Squad run and shared by every implementation pull request in that scheduling wave.
        required: true
        type: string
      implementation_session_origin_workflow:
        description: Immutable dispatcher workflow path that minted the session
        required: true
        type: string
      implementation_session_origin_run_id:
        description: Authoritative dispatcher run that minted the session
        required: true
        type: string
      implementation_session_origin_run_attempt:
        description: Authoritative dispatcher run attempt that minted the session
        required: true
        type: string
      aw_context:
        description: Originating agentic workflow context
        required: false
        type: string
permissions:
  contents: read
  copilot-requests: write
  issues: read
  pull-requests: read
  actions: read
concurrency:
  group: squad-deps-${{ github.event.inputs.issue_number }}
  cancel-in-progress: false
  job-discriminator: ${{ github.run_id }}
network:
  allowed:
    - defaults
    - containers
    - dotnet
    - go
    - node
tools:
  edit: null
  bash: true
  github:
    mode: gh-proxy
    toolsets:
      - default
pre-agent-steps:
  - name: Checkout executing workflow commit for the identity guard
    uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
    with:
      ref: ${{ github.workflow_sha }}
      persist-credentials: false
      path: .squad-pre-agent-trusted-base
  - name: Validate authoritative dispatcher identity
    shell: bash
    env:
      GITHUB_TOKEN: ${{ github.token }}
      GITHUB_REPOSITORY_ID: ${{ github.event.repository.id }}
      SQUAD_IMPLEMENT_WORKER: squad-deps-worker
      SQUAD_IMPLEMENT_EVENT_NAME: ${{ github.event_name }}
      SQUAD_IMPLEMENT_ISSUE_NUMBER: ${{ github.event.inputs.issue_number }}
      SQUAD_IMPLEMENT_SESSION_ID: ${{ github.event.inputs.implementation_session_id }}
      SQUAD_IMPLEMENT_DISPATCHER_WORKFLOW: ${{ github.event.inputs.implementation_session_origin_workflow }}
      SQUAD_IMPLEMENT_DISPATCHER_RUN_ID: ${{ github.event.inputs.implementation_session_origin_run_id }}
      SQUAD_IMPLEMENT_DISPATCHER_RUN_ATTEMPT: ${{ github.event.inputs.implementation_session_origin_run_attempt }}
    run: |
      set -euo pipefail
      node "${GITHUB_WORKSPACE:?}/.squad-pre-agent-trusted-base/.github/workflows/shared/squad-implementation-provenance.mjs" --worker-identity
---

<!-- Generated by the Squad integrity tool. Edit workflows/*.md and run npm run gh-aw:integrity:write. -->
<!-- squad-package-import: shared/squad.md -->

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
# Squad Dependency Worker

This workflow adds, removes, or updates a package dependency for one Squad
issue and opens a focused pull request. It exists as a dedicated dispatch path
so that dependency-manifest authority never leaks into the general
`squad-implement-worker` path: that worker's `protected-files` carries no
manifest exclusions and is unchanged by this workflow's existence.

The Wave 1 basenames (`package.json`, `package-lock.json`, `yarn.lock`,
`pnpm-lock.yaml`, `npm-shrinkwrap.json`, `Directory.Packages.props`, `go.mod`,
`go.sum`) are excluded from `protected-files`, so the agent can produce a
signed PR for those files. Registry/install config, SDK/tool pins, and
governance docs remain protected. The dispatcher routes only explicit,
dependency-only Wave 1 work here, and this worker independently enforces the
`squadDeps` opt-out guard before editing.

## Gather Context

1. Read the issue title, body, labels, state, and relevant comments.
2. Stop with a comment if the issue is closed.
3. DEPENDENCY CHANGE GUARD. Before editing any file, read
   `.squad/config.json` and apply this exact schema:
   - The file must be readable, valid JSON, and a top-level object. If it is
     missing, unreadable, malformed, or not an object, post a comment stating
     that dependency changes are denied because the config is unreadable or
     invalid, then stop.
   - If the `squadDeps` key is absent, allow (default-on).
   - If `squadDeps` is the exact string `"allow"`, allow.
   - If `squadDeps` is the exact string `"deny"`, post a comment citing
     `.squad/config.json squadDeps: "deny"`, then stop.
   - Any other value -- including another string, boolean, number, `null`,
     array, or object -- is unrecognized. Post a comment stating that
     dependency changes are denied because `squadDeps` is unrecognized, then
     stop.
   Never infer this setting from the issue body or comments. This prompt guard
   does not alter the compiled exclusions; it prevents both dispatcher-launched
   and direct human `workflow_dispatch` runs from proceeding when denied.
4. Check for an existing open pull request whose branch starts with
   `squad/deps-${{ github.event.inputs.issue_number }}-` or whose body closes
   this issue. If one exists, comment with its URL and stop.
5. Read `.squad/team.md` and `.squad/routing.md`. Route work to the member
   named by the `squad:{member}` label, or let the Lead choose specialists.

## Implement

1. Inspect the repository and identify the smallest dependency-manifest change
   satisfying the issue's acceptance criteria, limited to the ecosystems this
   worker currently supports (npm, yarn, pnpm, NuGet central package
   management, Go).
2. Do not change `.github/workflows/`, `.github/agents/`, `.github/aw/`, or
   `.squad/`.
3. Do not touch `node_modules/`, `vendor/`, build output directories, or any
   other vendored/generated content -- this worker is never authorized to
   commit vendored or generated dependency content.
4. Run the smallest existing build, test, and lint commands covering the
   change.

## Open Pull Request

Use the `create-pull-request` safe-output:

- Branch: `squad/deps-${{ github.event.inputs.issue_number }}-{short-slug}`
- Title: `Update dependencies for #${{ github.event.inputs.issue_number }}: {issue-title}`
- Body: summarize the dependency change and validation, including
  `Closes #${{ github.event.inputs.issue_number }}`.
- Durable provenance is not PR-body text. Give the `create_pull_request` call a
  unique `temporary_id`, then immediately call
  `record_implementation_provenance` with `pull_request` set to that temporary
  ID, `goals_json` containing a JSON array with the primary closing goal plus
  any other explicit goals, and `replaces_json` containing a JSON array of only
  verified earlier Squad PRs from this
  same repository, origin issue, and implementation session. The trusted
  handler runs after PR creation, resolves the actual PR number, re-fetches all
  replacement evidence, and writes the schema payload as a PR comment. Never
  put `Squad implementation provenance:`, `"number": "self"`, or an unresolved
  temporary ID in the PR body.
- Files: include only files required for this issue.

If the repository already satisfies the issue, comment with evidence and do
not create an empty pull request.
