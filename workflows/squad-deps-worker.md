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
      aw_context:
        description: Originating agentic workflow context
        required: false
        type: string
permissions:
  contents: read
  copilot-requests: write
  issues: read
  pull-requests: read
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
tools:
  edit:
  bash: true
  github:
    mode: gh-proxy
    toolsets: [default]
safe-outputs:
  create-pull-request:
    title-prefix: "[squad-deps] "
    labels: [squad]
    max: 1
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
    # Wave 1 protected-files exclusions (S2, issue #1748 Flight Decision comment,
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
    # Flight Decision comment.
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
      # Flight Decision comment (APPROVED -- IMPLEMENTATION-READY, 2026-08-25),
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
- Files: include only files required for this issue.

If the repository already satisfies the issue, comment with evidence and do
not create an empty pull request.
