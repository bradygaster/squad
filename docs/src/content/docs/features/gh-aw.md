# GitHub Agentic Workflows (gh-aw)

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Run your Squad inside a [GitHub Agentic Workflow](https://github.com/github/gh-aw)
(gh-aw). Squad ships a shared gh-aw component that bootstraps your team on a
GitHub Actions runner, so a gh-aw workflow can hand work to the Squad
coordinator — triage, planning, review — without you installing anything in the
agent sandbox.

> **Credit:** the design of this integration is Peli de Halleux's. He built and
> proved it inside [`github/gh-aw`](https://github.com/github/gh-aw/blob/main/.github/workflows/shared/squad.md)
> and offered it for upstreaming. Squad's shared component is an adaptation of
> that work.

---

## What it does

The shared component `.github/workflows/shared/squad.md` installs and initializes
Squad **once**, in the gh-aw activation job, then republishes the generated team
state to the agent job. The Squad CLI never runs in the agent job — only the
files it produced are restored there.

That split is the whole trick, and it exists because of how gh-aw's network
firewall works.

---

## The activation / agent job split

A gh-aw workflow runs in two phases with very different network rules:

| Phase | Network | What the component does |
|-------|---------|-------------------------|
| **Activation job** (`jobs.activation.pre-steps`) | Unrestricted egress | Runs `npx @bradygaster/squad-cli@… init --preset default --state-backend local`, then uploads `.squad/` + `.github/agents/squad.agent.md` as a `squad-state` artifact. |
| **Agent job** (`steps:`) | Restricted by `network:` | Downloads the `squad-state` artifact and restores it into the workspace. No CLI, no npm. |

The gh-aw firewall **only constrains the agent job** — activation runs unblocked.
By doing all install/init work in activation and only *restoring files* in the
agent job, the integration sidesteps the sandbox entirely.

The coordinator reaches the agent through gh-aw's own mechanism: gh-aw natively
restores `.github/agents/*.agent.md` files as inline sub-agents, so the
`squad.agent.md` that `squad init` writes is picked up automatically. There is
**no `--agent` flag** involved.

---

## Using it

### Option A — repo-local (vendored)

Copy `shared/squad.md` into your repo at `.github/workflows/shared/squad.md`,
then import it with a repo-relative path:

```yaml
imports:
  - shared/squad.md
```

### Option B — remote import (pinned)

Import straight from `bradygaster/squad`, pinned to a commit SHA for
reproducible builds:

```yaml
imports:
  - bradygaster/squad/.github/workflows/shared/squad.md@<40-char-commit-sha>
```

A branch (`@main`) or tag (`@v0.11.0`) also works, but a SHA is recommended.
gh-aw fetches remote imports at compile time and caches them under
`.github/aw/imports/` by commit SHA.

A minimal consuming workflow looks like this (see
`.github/workflows/squad-backlog-triage.md` in this repo for a complete example):

```yaml
---
name: Squad Backlog Triage
on:
  workflow_dispatch:
permissions:
  contents: read
  issues: read
  copilot-requests: write
network:
  allowed:
    - defaults
imports:
  - shared/squad.md
safe-outputs:
  create-issue:
    title-prefix: "[squad:triage] "
    labels: [squad:triage]
---

# Squad Backlog Triage
Use the Squad team to triage this repo's open issues and file a report.
```

The shared component itself has **no `on:` field** — that is what makes it an
importable component rather than a standalone workflow. Your consuming workflow
supplies the trigger.

---

## Configuration

All configuration is optional.

### CLI version — `vars.SQUAD_CLI_VERSION`

Pins the `@bradygaster/squad-cli` release used in activation. Defaults to
`0.11.0`. Set the repository/organization variable `SQUAD_CLI_VERSION` to
override.

### Cross-org / private-repo credentials

`squad init` uses the workflow's own `github.token` by default. If your Squad
must reach **other** organizations or private repositories, supply either a
GitHub App or a token. Auth precedence is:

1. **GitHub App installation token** — set `vars.SQUAD_GITHUB_APP_ID`,
   `secrets.SQUAD_GITHUB_APP_PRIVATE_KEY`, and `vars.SQUAD_GITHUB_APP_OWNER`.
   The component mints a short-lived token via
   `actions/create-github-app-token`.
2. **`secrets.SQUAD_GITHUB_TOKEN`** — used when no App id is set.
3. **`github.token`** — the workflow's default token, used otherwise.

---

## Known limitations

Read these before relying on the integration — they are real and, for now, by
design.

- **State does not persist between runs.** The `squad-state` artifact is a
  *within-run* handoff from activation to agent, with `retention-days: 1`. The
  casting registry, session logs, and any Scribe output produced in a run do
  **not** survive to the next run — every run starts from a fresh `squad init`.
  Persisting state across runs (via artifacts, the Actions cache, or a dedicated
  branch) is unsolved and out of scope for this component.
- **No MCP state bridge in the agent job.** gh-aw's compiled Copilot invocation
  passes `--disable-builtin-mcps`, so Squad's `state-mcp` server does not load.
  That is why the component pins `--state-backend local`: the coordinator reads
  and writes `.squad/` as plain files rather than through MCP state tools. A
  non-local backend would fail silently.
- **npm is required in the activation job.** Activation runs `npx …
  @bradygaster/squad-cli`. On GitHub-hosted runners this works because
  activation has open egress. A **self-hosted runner behind a corporate firewall
  that blocks npm will fail** at the init step. Mitigating that (for example by
  vendoring the CLI) is out of scope here.
