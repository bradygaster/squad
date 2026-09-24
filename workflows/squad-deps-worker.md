---
name: Squad Dependency Worker
run-name: "Squad deps — ${{ github.event.inputs.issue_number }}"
description: >-
  Add, remove, or update package dependencies for one Squad issue under narrow
  dependency-manifest/lockfile authority (Wave 1: npm/yarn/pnpm, NuGet CPM, Go)
private: false
on:
  bots: ["github-actions[bot]"]
  workflow_dispatch:
    inputs:
      issue_number:
        description: Issue number requesting a dependency change
        required: true
        type: string
      implementation_session_id:
        description: >-
          Opaque durable identifier minted by the dispatching Squad run and
          shared by every implementation pull request in that scheduling wave.
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
  group: "squad-deps-${{ github.event.inputs.issue_number }}"
  cancel-in-progress: false
  job-discriminator: ${{ github.run_id }}
network:
  allowed:
    - defaults
    - containers
    - dotnet
    - go
    - node
imports:
  - shared/squad.md
resources:
  - shared/squad-implementation-provenance.mjs
  - shared/implementation-provenance-v1.schema.json
tools:
  edit:
  bash: true
  github:
    mode: gh-proxy
    toolsets: [default]
pre-agent-steps:
  - name: Checkout executing workflow commit for the identity guard
    uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
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
safe-outputs:
  steps:
    - name: Checkout executing workflow commit for the implementation provenance guard
      uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      with:
        ref: ${{ github.workflow_sha }}
        persist-credentials: false
        path: .squad-trusted-base
    - name: Enforce dependency implementation provenance before any output
      uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0
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
      description: >-
        Emit authoritative implementation provenance as a comment after the
        referenced pull request has been created.
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
    labels: [squad]
    max: 1
    require-temporary-id: true
    allowed-base-branches:
      - "squad/*"
    allowed-branches:
      - "squad/deps-*"
    # Narrow, dependency-manifest/lockfile-only authority (Wave 1: npm/yarn/pnpm,
    # NuGet central package management, Go). This worker MUST NOT gain the broad
    # source-file authority `squad-implement-worker` has -- its entire reason to
    # exist is that it can touch nothing else. Extensionless basenames (`go.mod`,
    # `go.sum`, `yarn.lock`) match no existing extension pattern and must be
    # listed explicitly; `package.json`/`package-lock.json`/`pnpm-lock.yaml`/
    # `npm-shrinkwrap.json`/`Directory.Packages.props` are listed explicitly too,
    # even though their extensions would otherwise match a broader glob, so this
    # list stays the single source of truth for what the worker may touch.
    allowed-files:
      - "package.json"
      - "**/package.json"
      - "package-lock.json"
      - "**/package-lock.json"
      - "npm-shrinkwrap.json"
      - "**/npm-shrinkwrap.json"
      - "yarn.lock"
      - "**/yarn.lock"
      - "pnpm-lock.yaml"
      - "**/pnpm-lock.yaml"
      - "Directory.Packages.props"
      - "**/Directory.Packages.props"
      - "go.mod"
      - "**/go.mod"
      - "go.sum"
      - "**/go.sum"
    # Wave 1 protected-files exclusions (S2, issue #1748 architecture decision,
    # APPROVED -- IMPLEMENTATION-READY, 2026-08-25). Excluding a basename from
    # `protected-files` allows the agent to produce a signed PR for that file;
    # the exclusion is compiled into `.lock.yml` at `gh aw compile` time and
    # cannot be changed at runtime. Only the exact Wave 1 basenames are excluded:
    # npm/yarn/pnpm manifests and lockfiles, NuGet central package management,
    # and Go modules. Registry/install config (`NuGet.Config`, `bunfig.toml`,
    # `.npmrc`, `.yarnrc.yml`), SDK/tool pins (`global.json`), and governance
    # docs (`CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md`,
    # `CODE_OF_CONDUCT.md`, `DESIGN.md`, `AGENTS.md`) stay protected in every
    # wave -- see "bunfig.toml ruling" and "Always-protected" list in that
    # architecture decision.
    protected-files:
      policy: fallback-to-issue
      exclude:
        # Wave 1: npm/yarn/pnpm
        - package.json
        - package-lock.json
        - yarn.lock
        - pnpm-lock.yaml
        - npm-shrinkwrap.json
        # Wave 1: .NET — NuGet central package management only;
        # NuGet.Config and global.json stay protected.
        - Directory.Packages.props
        # Wave 1: Go
        - go.mod
        - go.sum
    excluded-files:
      # Never authorize vendored or generated dependency content, even once a
      # manifest basename above is excluded from protection in a later slice.
      # `excluded-files` strips these paths from the patch structurally, before
      # protected-files evaluation -- the correct mechanism per issue #1748's
      # architecture decision (APPROVED -- IMPLEMENTATION-READY, 2026-08-25),
      # "Vendored/generated dependency content" threat-model row.
      - "node_modules/**"
      - "**/node_modules/**"
      - "vendor/**"
      - "**/vendor/**"
      - "bin/**"
      - "**/bin/**"
      - "obj/**"
      - "**/obj/**"
      - ".github/workflows/**"
      - "**/.github/workflows/**"
      - ".github/agents/**"
      - "**/.github/agents/**"
      - ".github/aw/**"
      - "**/.github/aw/**"
      - ".squad/**"
      - "**/.squad/**"
    max-patch-files: 25
    expires: 14d
  add-comment:
    max: 3
    target: "*"
---

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
