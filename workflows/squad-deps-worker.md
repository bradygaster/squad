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
    # No manifest is excluded from protection yet -- Wave 1 exclusions land in a
    # follow-up slice (S2). Until then this worker's manifest writes fall back to
    # a review issue exactly like `squad-implement-worker`'s do, so nothing here
    # can produce a manifest PR before S2 lands. Registry/install config
    # (`NuGet.Config`, `bunfig.toml`, `.npmrc`, `.yarnrc.yml`), SDK/tool pins
    # (`global.json`), and governance docs (`CODEOWNERS`, `SECURITY.md`,
    # `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `DESIGN.md`,
    # `AGENTS.md`) stay protected in every wave -- see issue #1748's Flight
    # Decision comment (APPROVED -- IMPLEMENTATION-READY, 2026-08-25),
    # "bunfig.toml ruling" and "Always-protected" list.
    protected-files:
      policy: fallback-to-issue
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
      - "**/bin/Debug/**"
      - "**/bin/Release/**"
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

This slice (S1) only scaffolds the worker and backfills the extensionless
manifest/lockfile basenames (`go.mod`, `go.sum`, `yarn.lock`,
`package-lock.json`, and related Wave 1 files) into `allowed-files`. No
manifest is yet excluded from `protected-files`, so every manifest write still
falls back to a review issue today -- identical to `squad-implement-worker`.
Wave 1 `protected-files.exclude` entries, the `squadDeps` opt-out guard, and
the `dependency-change` PR presentation rules are separate follow-up slices.

## Gather Context

1. Read the issue title, body, labels, state, and relevant comments.
2. Stop with a comment if the issue is closed.
3. Check for an existing open pull request whose branch starts with
   `squad/deps-${{ github.event.inputs.issue_number }}-` or whose body closes
   this issue. If one exists, comment with its URL and stop.
4. Read `.squad/team.md` and `.squad/routing.md`. Route work to the member
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
