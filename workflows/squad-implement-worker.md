---
name: Squad Implement Worker
run-name: "Squad implement #${{ github.event.inputs.issue_number }}"
description: Implement one Squad issue and open a pull request
private: true
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: Issue number to implement
        required: true
        type: string
permissions:
  contents: read
  copilot-requests: write
  issues: read
  pull-requests: read
concurrency:
  group: "squad-implement-${{ github.event.inputs.issue_number }}"
  cancel-in-progress: false
network:
  allowed:
    - defaults
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
    title-prefix: "[squad] "
    labels: [squad]
    max: 1
    allowed-base-branches:
      - "squad/*"
    allowed-branches:
      - "squad/implement-*"
    allowed-files:
      - "*"
      - "app/**"
      - "bin/**"
      - "cmd/**"
      - "config/**"
      - "docs/**"
      - "examples/**"
      - "internal/**"
      - "lib/**"
      - "packages/**"
      - "public/**"
      - "samples/**"
      - "scripts/**"
      - "src/**"
      - "test/**"
      - "tests/**"
      - "tools/**"
    protected-files: request_review
    max-patch-files: 500
    expires: 14d
  add-comment:
    max: 3
    target: "*"
---

# Squad Implementation Worker

Implement issue `${{ github.event.inputs.issue_number }}` in the current
repository and open a focused pull request.

## Gather Context

1. Read the issue title, body, labels, state, and relevant comments.
2. Stop with a comment if the issue is closed.
3. Parse its `Depends on:` line. Check every referenced issue and stop with a
   blocker comment if any dependency remains open.
4. Check for an existing open pull request whose branch starts with
   `squad/implement-${{ github.event.inputs.issue_number }}-` or whose body
   closes this issue. If one exists, comment with its URL and stop.
5. Read `.squad/team.md` and `.squad/routing.md`. Route work to the member named
   by the `squad:{member}` label, or let the Lead choose specialists.

## Implement

1. Inspect the repository and implement the smallest complete change satisfying
   every acceptance criterion.
2. Use the routed Squad specialists for design, implementation, tests, and
   review. Keep delegation bounded to this issue.
3. Do not change `.github/workflows/`, `.github/agents/`, `.github/aw/`, or
   `.squad/`.
4. Run the smallest existing build, test, and lint commands covering the change.
5. Review the final diff against the issue acceptance criteria.

## Open Pull Request

Use the `create-pull-request` safe-output:

- Branch: `squad/implement-${{ github.event.inputs.issue_number }}-{short-slug}`
- Title: `Implement #${{ github.event.inputs.issue_number }}: {issue-title}`
- Body: summarize implementation and validation, including
  `Closes #${{ github.event.inputs.issue_number }}`.
- Files: include only files required for this issue.

If the repository already satisfies the issue, comment with evidence and do not
create an empty pull request.
