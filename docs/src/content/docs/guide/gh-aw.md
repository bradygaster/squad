---
title: GitHub Agentic Workflows
description: Setup and usage guide for Squad's /squad slash commands via GitHub Agentic Workflows
---

# GitHub Agentic Workflows integration

Squad ships a first-class integration with **GitHub Agentic Workflows (`gh aw`)**.
One slash command in an issue, and you get a custom AI team — delivered as a pull
request you can review before merging.

This guide covers setup, every slash command, and daily usage patterns.

---

## Quick start

Five steps from zero to a working Squad team:

```bash
# 1. Install the gh-aw extension (one-time)
gh extension install github/gh-aw

# 2. Add the Squad workflow to your repo
gh aw add bradygaster/squad/workflows/squad.md@dev

# 3. Compile the workflow to a lock file
gh aw compile

# 4. Commit and push the compiled workflow
git add .github/workflows/squad.lock.yml
git commit -m "ci: add Squad agentic workflow"
git push

# 5. Open an issue and type /squad cast — done!
```

After pushing, open an issue in your repo and write `/squad cast` in the body or
a comment. Squad analyzes your codebase, composes a team of specialist agents,
and opens a PR with the result.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| GitHub repo with Copilot | Copilot must be enabled for the repository |
| `gh` CLI | [Install the GitHub CLI](https://cli.github.com/) and authenticate with `gh auth login` |
| `gh aw` extension | `gh extension install github/gh-aw` |

---

## Setup

### Install the workflow

```bash
gh aw add bradygaster/squad/workflows/squad.md@dev
```

:::note[Branch note]
`@dev` pulls from the latest development branch where new modes and fixes land first. Stay on `@dev` to get improvements as they ship. Once gh-aw support reaches stable, you can switch to `@main` or drop the ref entirely for the default branch.
:::

This registers the Squad workflow in your repository's agentic workflow
configuration.

### Compile to a lock file

```bash
gh aw compile
```

Compiling resolves the workflow definition (including the shared bootstrap
component) into a deterministic `.github/workflows/squad.lock.yml` file. This
lock file is what GitHub Actions actually executes.

### Commit the lock file

```bash
git add .github/workflows/squad.lock.yml
git commit -m "ci: add Squad agentic workflow"
git push
```

Once pushed, the `/squad` slash command is live on your repo.

### Optional: pin a CLI version

Set a repository variable to control which Squad CLI version the workflow uses:

| Variable | Purpose | Default |
|----------|---------|---------|
| `SQUAD_CLI_VERSION` | Squad CLI version to install during activation | `0.11.0` |

Set it in **Settings → Secrets and variables → Actions → Variables**.

### Optional: enhanced permissions with a GitHub App

By default the workflow uses the built-in `github.token`. For cross-repo access
or elevated permissions, configure a GitHub App:

| Setting | Type | Purpose |
|---------|------|---------|
| `SQUAD_GITHUB_APP_ID` | Variable | GitHub App ID |
| `SQUAD_GITHUB_APP_PRIVATE_KEY` | Secret | App private key (PEM) |
| `SQUAD_GITHUB_APP_OWNER` | Variable | App installation owner (org or user) |

The workflow mints an installation token from these credentials at activation
time.

### Optional: PAT fallback

If you don't want to use a GitHub App but need more than the default token, set
a Personal Access Token:

| Setting | Type | Purpose |
|---------|------|---------|
| `SQUAD_GITHUB_TOKEN` | Secret | Fallback PAT when no GitHub App is configured |

**Auth precedence:** GitHub App token → `SQUAD_GITHUB_TOKEN` → `github.token`.

---

## Slash commands

Every command starts with `/squad`. Type it in an issue body, issue comment, or
PR review comment.

| Command | What it does |
|---------|-------------|
| `/squad` | Cast a new team (same as `/squad cast`) |
| `/squad cast` | Analyze your repo and generate a tailored team of AI agents |
| `/squad connect <owner/repo>` | Link to an external squad source (remote-managed) |
| `/squad adopt <owner/repo>` | Copy a squad from another repo and own it locally |
| `/squad cast-member <description>` | Add a single specialist to an existing team |
| `/squad cast-member rename <name> to <new-focus>` | Change an existing member's specialty |
| `/squad retire <name>` | Remove a team member (archived, not deleted) |
| `/squad status` | Report current team composition (read-only, no PR) |
| `/squad research` | Deep-dive analysis of the repo and issue; posts findings as a comment |
| `/squad plan` | Decompose an issue into sub-issues; posts a proposed plan for review |
| `/squad plan accept` | Create sub-issues from the last approved plan |
| `/squad plan revise <feedback>` | Revise the plan based on your feedback |

### Where you can use slash commands

| Surface | How it works |
|---------|-------------|
| **Issue body** | Write `/squad cast` when creating a new issue |
| **Issue comment** | Comment `/squad cast` on any existing issue |
| **PR review comment** | Comment `/squad cast` on any pull request |
| **Workflow dispatch** | Trigger manually from the Actions tab with a `command` input |

For workflow dispatch, go to **Actions → Squad → Run workflow** and enter the
command (for example `cast` or `connect myorg/my-squad`).

---

## Casting a team

When you run `/squad cast`, the workflow follows these steps:

1. **Brief resolution** — evaluates the issue content and repo structure to
   decide what to build (see [the casting brief](#the-casting-brief) below)
2. **Repo analysis** — scans languages, frameworks, CI/CD, testing, docs, and
   project structure
3. **Team composition** — selects roles (4–7 agents: a Lead, specialists, and
   at least one quality role)
4. **Naming** — uses descriptive role-based names by default (Lead, Frontend,
   Backend, Tester). If you request a themed universe in your brief, Squad picks
   character names from that universe instead — any universe works, not just the
   15 built-in ones.
5. **Scaffolding** — generates all squad files (charters, routing, registry)
6. **Pull request** — opens a PR on a `squad/cast-{repo}` branch with the full
   team for review

### The casting brief

The casting brief is how you tell Squad what kind of team you want. It uses two
signals:

- **Issue signal** — the title and body of the issue where you typed `/squad cast`
- **Repo signal** — your repository's README, file structure, and CI/CD patterns

Squad resolves these with a priority cascade:

| Repo | Issue | Result |
|------|-------|--------|
| Empty / bare | Empty / no body | **No-op** — Squad posts a comment explaining what it needs, then stops |
| Empty / bare | Has content | **Issue wins** — the team is cast from your issue description |
| Has content | Has content | **Merge** — repo provides base context, issue augments or overrides |
| Has content | Empty / minimal | **Repo wins** — standard analysis-driven casting |
| Any | Explicit team spec | **Issue is source of truth** — user intent overrides repo analysis |

#### Example: writing a casting brief

Create an issue titled "Cast my team" with a body like this:

```markdown
## Team spec

I need a team for a TypeScript monorepo with a React frontend and a
FastAPI backend. The frontend is the priority — we're behind on
accessibility and performance.

### Must-have roles
- Frontend specialist (React, a11y, performance)
- Backend engineer (Python, FastAPI, SQLAlchemy)
- Test engineer (Vitest for frontend, pytest for backend)

### Nice-to-have
- DevOps (GitHub Actions, Docker)

### Team size
5 agents maximum.
```

Then comment `/squad cast` on the same issue. Squad reads the brief, merges it
with whatever it learns from scanning your repo, and produces a team that
matches your spec.

---

## What gets created

After merging the Squad PR, your repository contains:

```
.squad/
├── team.md                       # Full roster — names, roles, expertise
├── routing.md                    # Maps work domains to agents
├── agents/
│   └── {name}/charter.md         # Per-agent identity and rules (one per member)
├── casting/
│   ├── registry.json             # Name/universe mapping and status
│   ├── history.json              # Universe usage history
│   └── policy.json               # RAI policy (allowlisted universes)
└── decisions/                    # Team decisions (initially empty)

.github/agents/squad.agent.md    # Copilot custom agent definition
meet-the-squad.md                # Friendly team intro at the repo root
```

The `squad.agent.md` file registers your Squad as a custom Copilot agent. Once
merged, you can `@squad` in Copilot Chat to talk to your team.

---

## Naming modes

Squad supports three naming conventions for your team:

### Descriptive (default)

When you don't request a themed universe, agents get short functional names:
Lead, Frontend, Backend, Tester, Security, Docs, etc. This is the default.

### Built-in universes

Squad includes 15 pre-built fictional universes (The Usual Suspects, Star Wars,
Futurama, Marvel, etc.) with pre-vetted character names. If you ask for themed
names without specifying a universe, Squad auto-selects the best fit based on
your team size and project type.

### Custom universes

You can request **any universe** — it doesn't have to be in the built-in list.
Just say so in your casting brief or slash command:

```
/squad cast use Doctor Who characters
```

Squad allocates character names from its knowledge of the source material.
Spoiler-safety rules still apply (names use early introductions, avoiding
fate-revealing titles or epithets).

### Re-casting with a different naming mode

You can switch naming modes at any time by re-casting:

```
/squad cast switch to Firefly universe
/squad cast use descriptive names instead
```

All agents are renamed and their files updated accordingly.

---

## Research and planning

Squad's SDLC commands let you go from an issue to a fully decomposed, agent-assigned
backlog without leaving the issue thread. The flow is:

```
/squad research  →  /squad plan  →  /squad plan accept
```

Each step is user-initiated — Squad proposes, you review and approve.

### Research

```
/squad research
```

Squad performs a deep analysis of your repository in context of the issue, then
posts structured findings as a comment. This is the discovery phase — no issues
or PRs are created.

The research comment includes:
- **Current state** — architecture, patterns, dependency versions, code health
- **Gap analysis** — what's missing or incomplete relative to the issue/goal
- **Risk assessment** — complexity and risk ratings per area
- **Key findings** — specific evidence with file paths and version numbers
- **Recommendations** — sequencing suggestions and things to avoid

You can focus the research with additional context:

```
/squad research focus on the authentication and authorization gaps
/squad research what's the current state of the test coverage?
```

Research works on issues in any state (open or closed).

### Plan

```
/squad plan
```

Squad reads the issue (and any prior research findings) and proposes a set of
sub-issues organized into phases. The plan is posted as a comment for review —
**no issues are created yet**.

The plan comment includes:
- Phased issue breakdown with titles, owners, sizes, and dependencies
- Expandable details for each issue (scope, acceptance criteria, notes)
- A dependency graph showing what blocks what
- Execution notes and sequencing advice

You can guide the planning:

```
/squad plan keep it to 5 issues max
/squad plan focus on the backend first
```

### Plan accept

```
/squad plan accept
```

Once you're happy with the plan, accept it. Squad creates sub-issues from the
plan with proper labels (`squad`, `squad:{agent-name}`), acceptance criteria,
dependency references, and phase assignments.

### Plan revise

```
/squad plan revise merge the two security issues into one and add a migration step
```

If the plan needs adjustments, revise it. Squad reads your feedback, modifies
the plan, and posts an updated plan comment. The revised plan supersedes the
previous one — `/squad plan accept` always uses the latest.

### Full example

Here's a real workflow from an actual project:

```
1. /squad cast                    → PR with 8-member team
2. /squad research                → Deep repo analysis validating the brief
3. /squad plan                    → 14 issues across 5 phases proposed
4. /squad plan accept             → 14 issues created with labels and dependencies
```

Four comments. Under 75 minutes. From zero to a fully decomposed, dependency-ordered,
agent-assigned backlog.

---

## Connect vs. Adopt

Squad supports two ways to bring in a team from another repository.

### Connect: remote-managed

```
/squad connect myorg/shared-squad
```

Connect links your repo to an external squad source. Only a lightweight config
pointer (`.squad/config.json`) is committed locally — the actual team files are
fetched from the source repo at runtime.

**Use Connect when:**
- Your organization manages a centralized squad definition
- You want all repos to stay in sync with one source of truth
- Team updates in the source repo automatically propagate

**What gets committed:**
- `.squad/config.json` — pointer to the source (`"mode": "connect"`)
- `meet-the-squad.md` — team intro with a note about external management

**Trade-off:** Local changes are overwritten on the next sync. To customize,
disconnect by running `/squad cast`.

### Adopt: copy and own

```
/squad adopt myorg/shared-squad
```

Adopt fetches the full squad definition from a source repo and commits it
locally. After adoption, you own the files — there is no ongoing sync.

**Use Adopt when:**
- You want a starting point but plan to customize
- You're forking a team for a new project with different needs
- You don't want upstream changes to affect your repo

**What gets committed:**
- The entire `.squad/` directory (cloned from source, adapted for your repo)
- `.github/agents/squad.agent.md`
- `meet-the-squad.md`
- `.squad/config.json` — records the adoption source (`"mode": "adopt"`)

**Trade-off:** You get full control, but you won't receive future updates from
the source repo.

### Side-by-side comparison

| | Connect | Adopt |
|---|---------|-------|
| Files committed | Config pointer only | Full `.squad/` directory |
| Ownership | Source repo | Your repo |
| Ongoing sync | Yes (fetched at activation) | No (one-time copy) |
| Customization | Limited (overwritten on sync) | Full (modify freely) |
| PR branch | `squad/connect-{repo}` | `squad/adopt-{repo}` |

---

## Iterating after the initial cast

Your squad isn't frozen after the first cast. You can add, modify, and remove
members at any time.

### Add a member

```
/squad cast-member a security engineer focused on supply-chain attacks and SBOM
```

Squad allocates a character name from the existing universe, generates a charter,
and opens a PR (or pushes to the existing Squad PR if you comment on one).

### Modify a member

```
/squad cast-member rename EECOM to platform engineering and Kubernetes
```

This keeps the character name and identity but regenerates the charter with the
new specialty.

### Retire a member

```
/squad retire EECOM
```

The member's charter moves to `.squad/agents/_alumni/` and their registry entry
is marked `"status": "retired"`. Routing rules for their domain are flagged as
unassigned.

### Re-cast entirely

```
/squad cast
```

Running `/squad cast` again replaces the existing team with a fresh one based on
a new analysis of the repo (and any casting brief you provide).

### Context-aware mutations

When you comment `/squad cast-member` or `/squad retire` on a PR that already
has the `squad` label and is on a `squad/*` branch, the changes are pushed to
that branch as a follow-up PR — keeping all squad changes in one review thread.

---

## How the workflow runs

Understanding the two-job architecture helps when debugging.

### Job 1: Activation (unrestricted network)

The activation job runs with full network access:

1. Optionally mints a GitHub App installation token
2. Installs `@bradygaster/squad-cli` at the configured version
3. Runs `squad init --preset default --state-backend local`
4. Uploads `.squad/` and `.github/agents/squad.agent.md` as a `squad-state`
   artifact

### Job 2: Agent (network-restricted)

The agent job runs inside the `gh aw` sandbox with no outbound network:

1. Downloads the `squad-state` artifact from Job 1
2. Restores team files into the workspace
3. Executes the Squad coordinator using only the pre-generated files

The Squad CLI is never installed in the agent job — only the files it produced
are used. State does not persist across runs.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Nothing to cast from" comment | Both repo and issue are empty | Add a README or write a casting brief in the issue body |
| Cast produces a generic team | Issue body was empty, repo was analyzed alone | Write a detailed casting brief (see [example](#example-writing-a-casting-brief)) |
| "Could not access" error on Connect/Adopt | Source repo is private or doesn't exist | Verify the source repo is accessible and contains a `.squad/` directory |
| `/squad` command is ignored | Lock file not committed or workflow not compiled | Run `gh aw compile`, commit the lock file, and push |
| Universe is full on cast-member | All character names in the universe are allocated | Retire an unused member first, or re-cast with `/squad cast` |
| "No plan found" on plan accept | No `/squad plan` comment exists yet | Run `/squad plan` first to generate a plan for review |
| Plan accept creates fewer issues than expected | `create-issue` safe-output has a max of 20 | Split into multiple plan/accept cycles for very large decompositions |

---

## See also

- [Squad README](https://github.com/bradygaster/squad#readme) — project overview and local CLI usage
- [Workflow definition](https://github.com/bradygaster/squad/blob/dev/workflows/squad.md) — full slash command specification
- [Bootstrap component](https://github.com/bradygaster/squad/blob/dev/workflows/shared/squad.md) — activation and artifact lifecycle
