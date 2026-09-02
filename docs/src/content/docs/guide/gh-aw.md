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

Seven steps from zero to a validated, reviewable Squad bootstrap:

```bash
# 1. Install the gh-aw extension (one-time)
gh extension install github/gh-aw

# 2. Allow GitHub Actions to create pull requests
gh api --method PUT repos/{owner}/{repo}/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true

# 3. Create a bootstrap branch
default_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
git switch -c chore/squad-gh-aw-bootstrap

# 4. Add the Squad workflows to your repo
gh aw add \
  bradygaster/squad/workflows/squad.md@dev \
  bradygaster/squad/workflows/squad-implement-worker.md@dev \
  bradygaster/squad/workflows/squad-deps-worker.md@dev \
  bradygaster/squad/workflows/squad-review.md@dev

# 5. On first install, review the safe-update report.
# If it contains only the documented Squad secrets and init action, approve it:
gh aw compile --strict --approve

# 6. Always run the final strict compile without approval
gh aw compile --strict

# Verify every supported workflow has a source and generated lockfile
for workflow in squad squad-implement-worker squad-deps-worker squad-review; do
  test -f ".github/workflows/${workflow}.md"
  test -f ".github/workflows/${workflow}.lock.yml"
done

# 7. Commit the generated files and open the bootstrap PR
git add -- .gitattributes .github/aw/ .github/workflows/ .github/skills/
git diff --cached --stat
test -z "$(git diff --cached --diff-filter=D --name-only)"
git commit -m "ci: add Squad agentic workflow"
git push -u origin HEAD
gh pr create \
  --base "$default_branch" \
  --title "ci: add Squad agentic workflow" \
  --body "Installs and strictly compiles the supported Squad GH-AW workflows."
gh pr edit --add-reviewer @copilot
gh pr checks --watch
```

> Step 7 stages `.github/skills/` because `gh aw add` installs the Squad skills
> alongside the workflows, and it deliberately does not stage `.github/aw/logs/`.
> Downloaded workflow logs are local diagnostic output — see [ignoring downloaded
> logs](#open-the-bootstrap-pull-request) before you commit.

After the bootstrap PR is reviewed and merged, open an issue in your repo and
write `/squad cast` in the body or a comment. Squad analyzes your codebase,
composes a team of specialist agents, and opens a second PR with the result.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| GitHub repo with Copilot | Copilot must be enabled for the repository |
| `gh` CLI | [Install the GitHub CLI](https://cli.github.com/) and authenticate with `gh auth login` |
| `gh aw` extension | `gh extension install github/gh-aw` |

---

## Setup

### Allow workflow-created pull requests

Squad opens pull requests through GitHub Actions. Enable this repository setting
under **Settings → Actions → General → Workflow permissions → Allow GitHub
Actions to create and approve pull requests**.

You can also enable it from the command line while keeping the default workflow
token read-only:

```bash
gh api --method PUT repos/{owner}/{repo}/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true
```

Replace `{owner}` and `{repo}` with the repository owner and name. Without this
setting, Squad pushes the generated branch but falls back to an issue containing
a link for you to create the pull request manually. A manually created pull
request is authored by your account, and GitHub does not allow authors to
approve their own pull requests.

### Create a bootstrap branch

```bash
default_branch="$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')"
git switch -c chore/squad-gh-aw-bootstrap
```

Keep the generated workflow install isolated on this branch until strict
compilation and human review are complete.

### Install the workflows

```bash
gh aw add \
  bradygaster/squad/workflows/squad.md@dev \
  bradygaster/squad/workflows/squad-implement-worker.md@dev \
  bradygaster/squad/workflows/squad-deps-worker.md@dev \
  bradygaster/squad/workflows/squad-review.md@dev
```

Keep the dispatcher first. `gh aw add` discovers its general worker, dependency
worker, and reviewer dependencies while compiling it; the explicit worker and
reviewer entries then confirm the complete install surface without creating
duplicates.
The installed top-level workflow set is:

- `squad.md` and `squad.lock.yml`
- `squad-implement-worker.md` and `squad-implement-worker.lock.yml`
- `squad-deps-worker.md` and `squad-deps-worker.lock.yml`
- `squad-review.md` and `squad-review.lock.yml`

`gh aw add` also installs the Squad skills under `.github/skills/`, which is why
the bootstrap commit stages that path alongside the workflows.

> **Branch note:** `@dev` pulls from the latest development branch where new modes and fixes land first. Stay on `@dev` to get improvements as they ship. Once gh-aw support reaches stable, you can switch to `@main` or drop the ref entirely for the default branch.

This registers the Squad workflow in your repository's agentic workflow
configuration and compiles the workflow definitions into deterministic
`.lock.yml` files. The supported bootstrap path still runs `gh aw compile
--strict` explicitly before review so every installed source is validated
together and the PR contains the exact generated lockfiles that passed.

### Review first-install safe updates

On a clean repository, `gh aw add` reports these expected safe-update changes:

- Restricted secrets: `SQUAD_GITHUB_APP_PRIVATE_KEY` and `SQUAD_GITHUB_TOKEN`
- Action: `bradygaster/squad/.github/actions/squad-init`

> **These are referenced names, not prerequisites.** `gh aw add` lists the secrets
> the workflows *reference* so you can approve that surface — it is not asking you
> to supply them. Both secrets are optional, they need not exist, and you do not
> need to create either one to enlist a repository. Single-repo activation runs on
> the built-in `github.token`. Configure these only for cross-repo access or
> elevated permissions — see [enhanced permissions with a GitHub
> App](#optional-enhanced-permissions-with-a-github-app) and [PAT
> fallback](#optional-pat-fallback).

Review the report before approving it. If it contains only those documented
entries, complete the first-install approval with:
>
> ```bash
> gh aw compile --strict --approve
> ```

Stop and investigate if the report contains any other secret or action.

This follow-up is only needed when the safe-update warning appears.
It is not a substitute for the final strict compile below.

### Strictly compile the installed workflows

```bash
gh aw compile --strict
```

Run this exact command after any required first-install approval and before
committing. It must report all four workflows succeeded. `squad.md` currently
emits one known warning because both slash-command and `github-actions[bot]`
triggers are configured; the bot trigger is required for controlled worker
continuation dispatches. Any error or any additional warning is a stop condition.

Verify the complete source/lock surface:

```bash
for workflow in squad squad-implement-worker squad-deps-worker squad-review; do
  test -f ".github/workflows/${workflow}.md"
  test -f ".github/workflows/${workflow}.lock.yml"
done
```

### Open the bootstrap pull request

```bash
git add -- .gitattributes .github/aw/ .github/workflows/ .github/skills/
git diff --cached --stat
test -z "$(git diff --cached --diff-filter=D --name-only)"
git commit -m "ci: add Squad agentic workflow"
git push -u origin HEAD
gh pr create \
  --base "$default_branch" \
  --title "ci: add Squad agentic workflow" \
  --body "Installs and strictly compiles the supported Squad GH-AW workflows."
gh pr edit --add-reviewer @copilot
gh pr checks --watch
```

This stages the workflow sources and lockfiles, the gh-aw manifest and pinned
state under `.github/aw/`, the installed skills, and `.gitattributes`. Review
the complete generated diff in the bootstrap PR, address Copilot review
feedback, and wait for required checks. Merge only after human approval.

`gh aw add` may also create `.vscode/settings.json` to enable Copilot for
Markdown workflow files. The command above intentionally leaves that optional
editor setting untracked. Delete it if you do not want the local setting, or
stage it explicitly if your team wants to share it.

> **Troubleshooting:** If the lock files are missing, rerun `gh aw compile
> --strict`. Do not open or merge the bootstrap PR until all four source/lock
> pairs exist and strict compilation succeeds.

Downloaded workflow audit data is local diagnostic output and should not be
committed. If a `.gitignore` is missing from `.github/aw/logs/`, add one there:

```gitignore
# Ignore all downloaded workflow logs
*

# But keep this file
!.gitignore
```

Once pushed, the `/squad` slash command is live on your repo.

### Optional: pin a CLI version

Activation downloads a self-contained GitHub Release bundle; it does not install
Squad from npm. Set a repository variable to select a specific standalone release:

| Variable | Purpose | Default |
|----------|---------|---------|
| `SQUAD_CLI_VERSION` | Standalone GitHub Release tag to install during activation | `v0.13.1` |

Set it in **Settings → Secrets and variables → Actions → Variables**. A value
without the leading `v` is accepted for compatibility with older configurations.

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

## Supported-path validation checklist

Use this checklist for the initial bootstrap and after any workflow update:

| Stage | Action | Expected evidence |
|-------|--------|-------------------|
| Install | Run the four-workflow `gh aw add` command on a bootstrap branch | All four `.md`/`.lock.yml` pairs exist, with shared imports, `.github/aw/`, installed skills, and `.gitattributes` included in the diff |
| Compile | Review any first-install safe-update report, approve only the documented entries, then run `gh aw compile --strict` without approval | All four workflows succeed, only the documented bot-trigger warning remains, and all eight source/lock files exist |
| Bootstrap review | Open the PR, request `@copilot`, wait for checks, and merge only after human approval | The default branch receives the complete generated install as one human-reviewable change |
| Activation | Run `/squad cast` after the bootstrap PR merges | The run resolves `v0.13.1` by default, installs the standalone bundle, initializes only when no committed team exists, runs health, and uploads `squad-state` |
| Cast persistence | Review the Cast PR before merging | The PR contains `.squad/casting/policy.json`, `registry.json`, and `history.json`, plus the team, routing, charters, Copilot agent, and `meet-the-squad.md` |
| Cast checks | Open the linked Cast PR and inspect its checks; if application CI is `action_required`, approve that workflow run and wait for it to finish | Copilot review and the repository's normal build, test, lint, and security checks complete before merge |
| Handoffs | Run `/squad implement` on a ready issue, then `/squad review` on its PR | The dispatcher starts the appropriate isolated worker; the reviewer posts one advisory verdict for the current head SHA |
| Rerun | Repeat the same command after a cancellation or uncertain result | Existing Cast and implementation PRs are detected instead of duplicated; an unchanged reviewed head is not reviewed twice |
| Recovery | Fix the named failing activation step, then use **Re-run failed jobs**; for an interrupted command, rerun the identical `/squad` command | Activation uploads no partial state artifact, and command-specific idempotency resumes from GitHub's committed PR, issue, comment, and review state |

If a work command auto-opens a Cast PR because no committed team exists, merge
that PR and rerun the original command. Do not start a second Cast command.

---

## Slash commands

Every command starts with `/squad`. Type it in an issue body, issue comment, or
PR conversation comment. On a pull request, post the command in the
**Conversation** tab. Inline code-review threads do not trigger Squad commands.

Commands are matched longest-prefix-first, so the most specific command string
wins: `/squad plan accept scope` is not treated as `/squad plan`.

| Category | Command | Purpose | Notes |
|----------|---------|---------|-------|
| Team | `/squad` | Cast a new team | Same as `/squad cast` |
| Team | `/squad cast` | Analyze your repo and generate a tailored team of AI agents | Replaces existing team |
| Team | `/squad cast [brief]` | Cast with an inline brief | Include your team spec in the same comment |
| Team | `/squad connect <owner/repo>` | Link to an external squad source | Remote-managed; syncs at activation |
| Team | `/squad adopt <owner/repo>` | Copy a squad from another repo | One-time copy; you own it after |
| Team | `/squad cast-member <description>` | Add a single specialist to an existing team | Allocates a name from the existing universe |
| Team | `/squad cast-member rename <name> to <new-focus>` | Change an existing member's specialty | Keeps identity; regenerates charter |
| Team | `/squad retire <name>` | Remove a team member | Archived to `_alumni/`; not deleted |
| Team | `/squad status` | Report current team composition | Read-only; no PR created |
| Research | `/squad research` | Deep-dive repo + issue analysis; posts findings as a comment | No issues or PRs created |
| Research | `/squad research <focus>` | Scoped research (e.g., "focus on auth gaps") | Focuses analysis on the specified area |
| Research | `/squad triage` | Classify research findings as work, decision, or excluded | Requires a research comment first |
| Research | `/squad triage revise <feedback>` | Adjust triage dispositions based on feedback | Updates the triage classification comment |
| Planning | `/squad plan` | **Fast path:** program plan + implementation plan in one step | Skips separate triage and scope review |
| Planning | `/squad plan program` | Create a program plan with initiatives, epics, and milestones | Strategic structure only; no tasks |
| Planning | `/squad plan program revise <feedback>` | Revise the program plan based on feedback | Updates the program plan comment |
| Planning | `/squad plan implementation` | Decompose a program plan into PR-sized tasks | Requires a program plan first |
| Planning | `/squad plan validate` | Validate plan readiness before acceptance | Checks dependencies, decisions, sizing |
| Planning | `/squad plan revise <feedback>` | Revise the current plan based on feedback | Works at any planning stage |
| Activation | `/squad activate` | **Recommended fast path:** review and accept the latest fast plan, then create its GitHub issues | Requires an existing fast plan from `/squad plan` and write, maintain, or admin permission |
| Activation | `/squad activate phase {N}` | Review, accept, and create issues for only Phase N of the latest fast plan | Requires an existing fast plan from `/squad plan` and write, maintain, or admin permission; incremental and in order |
| Acceptance | `/squad plan accept` | Legacy alias for `/squad activate` | Preserved for backward compatibility |
| Acceptance | `/squad plan accept phase {N}` | Legacy alias for `/squad activate phase {N}` | Preserved for backward compatibility |
| Acceptance | `/squad plan accept scope` | Approve the program plan scope | Locks strategic structure before decomposition |
| Acceptance | `/squad plan accept implementation` | Approve all phases of the implementation plan | Issues are not created until activate |
| Acceptance | `/squad plan accept implementation phase {N}` | Accept only Phase N of the implementation plan | Also auto-activates when prior phases are ready |
| Activation | `/squad plan activate` | Create GitHub issues from an accepted plan | Terminal step; creates real GitHub issues |
| Activation | `/squad plan activate phase {N}` | Create GitHub issues for only Phase N | Use when accept didn't auto-activate |
| Implementation | `/squad implement` | Implement an issue, or start the next ready wave of an epic | Dispatches an isolated implementation worker |
| Review | `/squad review` | Independently review the current pull request | Advisory `COMMENT` or `REQUEST_CHANGES`; human approval remains mandatory |

### Where you can use slash commands

| Surface | How it works |
|---------|-------------|
| **Issue body** | Write `/squad cast` when creating a new issue |
| **Issue comment** | Comment `/squad cast` on any existing issue |
| **PR conversation comment** | Comment `/squad cast` in the pull request conversation |
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
5. **Scaffolding** — replaces the disposable activation scaffold with the final
   charters, routing, registry, and a compact self-contained GH-AW coordinator
6. **Deterministic validation** — parses the final coordinator and team, checks
   every local path against the exact-case Cast payload/tree, and verifies
   registry, routing, charter, and generated-capability agreement
7. **Pull request** — opens a PR on a `squad/cast-{repo}` branch with the full
   team for review; a failed validation posts recovery guidance instead

The completion comment links the created Cast PR. Open that PR, mark it ready
when it was created as a draft, request Copilot review, and wait for its checks.
GitHub may require maintainer approval before application CI runs on a
workflow-created branch; when the PR shows `action_required`, approve that
workflow run from the checks view and wait for it to finish. Merge the Cast PR
only after its generated files, review, and repository checks are complete.

The validator runs in the agent workspace immediately before the built-in
safe-output request. gh-aw does not provide an independent post-agent hook that
can conditionally authorize PR creation, so this is deterministic pre-output
enforcement rather than a separate post-agent gate.

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
backlog without leaving the issue thread.

### Recommended lifecycle: research → plan → activate

For most work, use the clear three-step lifecycle:

```text
/squad research
/squad plan
/squad activate
```

`/squad research` gathers evidence, `/squad plan` proposes a combined program and
implementation plan for review, and `/squad activate` reviews and accepts the
latest fast plan before creating its GitHub issues. Activation is a mutating
command, so the actor needs write, maintain, or admin repository permission.

To activate one phase at a time, use `/squad activate phase {N}`. The existing
`/squad plan accept` and `/squad plan accept phase {N}` commands remain supported
as legacy aliases with identical behavior.

### Granular lifecycle

```
research → triage → plan program → plan implementation → accept → activate
    │         │           │                │                │         │
    ▼         ▼           ▼                ▼                ▼         ▼
 findings  classify   initiatives/     PR-sized         approve   create
 posted    as work/   epics/           tasks            scope &   GitHub
           decision/  milestones                        impl      issues
           excluded
```

Each step is user-initiated — Squad proposes, you review and approve.

### Lifecycle state tracking

After each command, Squad posts (or updates) a **lifecycle state comment** on the
issue. This comment shows where you are, what just happened, and what to do next:

```
**Current state:** Triaged
**Last command:** `/squad triage` by @user at 2026-08-10
**Next action:** `/squad plan program` — create a program plan from triage dispositions
**Also available:** `/squad triage revise <feedback>` — adjust triage before planning
```

The `Next action` field tells you (or any agent reading the issue) the primary
next command. `Also available` shows alternative valid commands at this point in
the lifecycle. This means you never have to remember the state machine — the
issue thread always shows what's next.

### Fast paths and compatibility aliases

You don't have to use every step. Fast-path commands combine multiple stages:

| Fast path | Equivalent to | Stages skipped |
|-----------|---------------|----------------|
| `/squad plan` | `/squad plan program` + `/squad plan implementation` | Separate triage classification; separate scope review gate |
| `/squad activate` | `/squad plan accept scope` + `/squad plan accept implementation` + `/squad plan activate` | Separate scope lock step; separate implementation approval step; issues created immediately |

`/squad plan accept` remains a backward-compatible alias for `/squad activate`.

#### What you give up with each fast path

**`/squad plan` (skipping triage and separate scope review)**

- **Skips:** `/squad triage` — no explicit classification of findings into work/decision/excluded before planning
- **Skips:** Separate `/squad plan accept scope` gate — the strategic structure (initiatives, epics, milestones) is never independently locked before task decomposition proceeds
- **Risk:** Scope may be broader or narrower than intended because exclusions were never explicitly classified. Triage is where you tell Squad "don't plan that" — without it, Squad infers scope from research findings alone.
- **Good for:** Small, well-understood features where you already know the scope and trust Squad's decomposition without a formal review gate.

**`/squad activate` (skipping separate scope lock and implementation review)**

- **Skips:** Separate `/squad plan accept scope` — you cannot review and approve strategic structure before decomposition runs
- **Skips:** Separate `/squad plan accept implementation` — the task breakdown goes directly to GitHub issue creation without a standalone review step
- **Risk:** GitHub issues are created immediately. If the plan needs revision, you'll need to close issues manually. There is no undo.
- **Good for:** Small projects where one review pass is sufficient and you're comfortable with immediate issue creation.

Use the granular commands when you need tighter review gates (large projects,
cross-team coordination). Use the fast paths for smaller work where one
review pass is enough.

### Research

```
/squad research
```

Squad performs a deep analysis of your repository in context of the issue, then
posts structured findings as a comment. This is the discovery phase — no issues
or PRs are created.

> **No team yet?** If you run `/squad research` (or any other work command) on a repo with no committed team, Squad automatically opens a Cast PR on the same issue, pauses your command for that run, and posts instructions to merge the Cast PR and rerun the original command. You don't need to pre-cast on a separate issue — Squad handles it inline.

The research comment includes:
- **Current state** — architecture, patterns, dependency versions, code health
- **Gap analysis** — what's missing or incomplete relative to the issue/goal
- **Risk assessment** — complexity and risk ratings per area
- **Key findings** — specific evidence with file paths and version numbers
- **Online sources** — a disclosure stating whether current online documentation
  was `consulted` (with the URLs fetched) or was `unavailable` (with the reason).
  When your repository's gh-aw network policy permits outbound access, Squad
  consults authoritative primary documentation (official vendor docs and
  specifications) and cites the URLs; when access is unavailable it says so
  rather than implying it read a source.
- **Recommendations** — sequencing suggestions and things to avoid
- **Next Step** — tells you what to do next:
  - `/squad triage` — classify findings into work items, decisions, and exclusions (granular path)
  - `/squad plan` — skip triage and generate a combined plan directly (fast path)

You can focus the research with additional context:

```
/squad research focus on the authentication and authorization gaps
/squad research what's the current state of the test coverage?
/squad research use aspire.dev as the source of truth when building an Aspire app
```

Natural-language **source-of-truth** instructions like the third example are
honored when that site is reachable under your network policy. Squad does not
manage a domain allowlist — GitHub/gh-aw owns internet enablement and domain
whitelisting through `network.allowed` in the workflow frontmatter, so to make a
specific site reachable you widen your own gh-aw network policy there. Fetched
web content is treated as untrusted evidence, never as instructions.

Research works on issues in any state (open or closed).

### Triage

```
/squad triage
```

After research, triage classifies each finding into one of three dispositions:

| Disposition | Meaning |
|-------------|---------|
| **work** | Becomes a plannable unit of work |
| **decision** | Requires a team decision before planning |
| **excluded** | Out of scope — documented but not planned |

Triage posts its classifications as a comment. To adjust:

```
/squad triage revise move the caching finding to "excluded" — we'll handle that next quarter
```

### Plan program

```
/squad plan program
```

Creates a high-level program plan organized into initiatives, epics, and
milestones. This is strategic structure — not yet PR-sized tasks.

### Plan implementation

```
/squad plan implementation
```

Decomposes the program plan into PR-sized tasks with owners, sizes, dependencies,
and acceptance criteria. The implementation plan is posted as a comment for review.

The plan comment includes:
- Phased issue breakdown with titles, owners, sizes, and dependencies
- Expandable details for each issue (scope, acceptance criteria, notes)
- A dependency graph showing what blocks what
- Execution notes and sequencing advice

### Plan validate

```
/squad plan validate
```

Validates that a plan is ready for acceptance — checks for missing dependencies,
unresolved decisions, and sizing gaps.

### Plan accept scope

```
/squad plan accept scope
```

Approves the program plan scope (initiatives, epics, milestones). This locks the
strategic structure before implementation decomposition proceeds.

### Plan accept implementation

```
/squad plan accept implementation
```

Approves the implementation plan (PR-sized tasks, assignments, dependencies).
After this, the plan is ready to activate.

### Plan activate

```
/squad plan activate
```

Creates GitHub issues from the accepted plan with Squad labels (`squad`,
`squad:{agent-name}`), acceptance criteria, dependency references, and phase
assignments. Flat plans create one child issue per planned task directly under
the originating issue; they do not add a duplicate epic. Dependencies use native
`blockedBy` edges when the installed safe-output tool supports them, otherwise
they remain explicit `Depends On` references in each issue body.

#### Labels are created automatically

You do not need to pre-create any label. Activation applies labels through the
`add-labels` safe output, which is configured with `allowed: [squad, "squad:*"]`
and `create-if-missing: true`, so `squad` and each `squad:{agent}` label is
created the first time a run needs it. A fresh repository with zero Squad labels
requires no manual label setup.

> **Two names, one operation.** `add-labels` (hyphenated) is the *configuration
> key* in the workflow's `safe-outputs` block — that is the spelling to search for
> in `squad.md` and the one the caps below apply to. `add_labels` (underscored) is
> the *tool call* the agent makes at run time, and it is the spelling that appears
> in activation summaries and incomplete reports. They refer to the same
> operation; this page uses whichever form matches the surface being described.

A label created this way receives gh-aw's deterministic color and an **empty
description**. That is expected on a fresh repository, not a failure. Labels that
already exist are left as they are, and re-applying a label on a rerun is a no-op.

#### "Accepted" in an activation summary does not mean "applied"

Activation summaries report **accepted operations**, and that word is exact.
Issue creation and labeling are gh-aw *safe outputs*: during the agent's turn the
run can only queue an operation against a target and observe that it was
accepted. gh-aw applies the queued operations afterward, in a separate post-agent
job. Nothing in the run reads labels back from GitHub.

So a correct summary says a label operation was **accepted**. It must not claim a
label was applied, landed, verified, confirmed, or checked on the issue.

This vocabulary exists for a concrete reason. Labels do not ride along with issue
creation: a label reaches an activated issue through exactly one route, an
accepted `add_labels` operation targeting that issue. `create-issue`'s own
`labels:` field never lands a label the activation run can claim, so it is never
evidence that a label arrived. Labels therefore travel as separate `add_labels`
calls, and "accepted" is the strongest thing the run can truthfully say about one.

Practical consequence: an accepted summary is strong evidence, not proof. To
confirm what actually landed, read the issues themselves:

```bash
gh issue list --label squad --json number,title,labels
```

#### Activation is capped, and shortfalls are reported

A single activation run is bounded. **The user-facing ceiling is 50 issues per
activation run.** Plan for that number.

The two underlying safe-output caps are set above that ceiling on purpose, so
they are headroom rather than the limit you should size against:

| Safe output | Cap | Derivation |
|-------------|-----|------------|
| `create-issue` | 75 | 50 worst-case issues plus 25 bounded margin |
| `add-labels` | 110 | Covers both readings of the worst case — 50 calls (one per issue) and 100 label names (two each) |

`max` counts safe-output **items (tool calls)**, not label names, and it is
enforced at invocation and collection — neither enforcement fails the run.

Two different shortfalls are checked separately, and they are not
interchangeable — the trigger, the wording, and the remedy differ:

| Shortfall | Trigger | What the report says |
|-----------|---------|----------------------|
| Issues not created | Created count is below the plan's declared total | `N of M issues created so far — rerun the identical activation command to continue.` |
| Labels not applied | An activated issue had no `add_labels` call accepted | `{labeled} of {activated} activated issues had a label operation accepted` |

Either one calls `report_incomplete`. **This does not fail the run.** The workflow
run still concludes `success`, so `gh run view --json conclusion` is not a way to
detect a truncated activation. The durable, user-visible signal is a tracking
issue in your repository titled `[aw] ... reported incomplete result`, which
gh-aw opens or updates:

```bash
gh issue list --search '"reported incomplete result" in:title' --state all
```

If a cap was actually reached, the report names which cap and lists the work
items that did not fit, and recommends `/squad plan activate phase {N}` to
continue in smaller batches. A cap is named only when it was *observed* — the
workflow forbids offering a cap as a guessed explanation, so an incomplete report
will not always attribute the shortfall to one.

Work items created in the same run are identified in that report by the temporary
IDs the run minted — `#aw_epic{K}` and `#aw_task{N}` on the hierarchical path,
`#aw_ph{N}` for a fast-path phase issue and `#aw_wi{N}` for a fast-path work item
— rather than by issue number, because at that point creation is still deferred
and no real number exists yet.

Do not read a green run as a complete activation. Check for that tracking issue.

#### Verifying an activation: the bindings block

Every phase and full activation artifact includes an `Activation bindings:`
fenced JSON block — one entry per created or recognized task, built only from
accepted operations. This is the most directly checkable surface Squad emits: a
deterministic post-activation checker compares those bindings against the labels
actually present on the issues.

You can do the same check by hand. Listing labels proves a label exists somewhere,
but not that it landed on the *right* issue — so read the bindings out of the
activation comment and compare them per issue:

```bash
# 1. Find the Activation bindings: block on the issue you activated
gh issue view {origin-issue} --json comments --jq '.comments[].body'

# 2. For each binding, compare its recorded issue and label against reality
gh issue view {issue} --json title,labels

# Broad sweep: every Squad-labeled issue at once
gh issue list --label squad --json number,title,labels
```

A binding whose `label` does not match the labels actually on that issue is the
discrepancy the checker exists to catch.

Where an owner did not become a `squad:{agent}` label — a multi-owner epic, or an
owner matching no roster name — the summary carries a required `Non-roster agent
values` heading naming the value and the issue, and the matching binding records
an omission reason. An omission is always reported explicitly, never left for you
to infer.

### Incremental phase acceptance

Instead of accepting an entire plan at once, you can accept and activate one
phase at a time:

```
/squad plan accept implementation phase 1
```

This accepts Phase 1 **and automatically creates its GitHub issues** in a single
step. After completing Phase 1 work, continue with:

```
/squad plan accept implementation phase 2
```

The accept command automatically activates the phase (creates issues) when all
prior phases are already activated. This means you don't need a separate
`/squad plan activate phase N` command in the common case — accept does it all.

If you need to activate a phase separately (e.g., you accepted it earlier but
skipped auto-activation), use:

```
/squad plan activate phase 1
```

**Rules:**
- Phases must be accepted in order (Phase 2 requires Phase 1 to be accepted first)
- Phases must be activated in order (Phase 2 requires Phase 1 to be activated first)
- Accept automatically activates when prior phases are ready (no separate activate needed)
- Each acceptance/activation posts a summary showing created issues and remaining phases
- Dependencies in later phases automatically reference issue numbers from earlier phases
- `/squad plan accept implementation` with no phase arg still accepts everything (backward compatible)
- `/squad plan activate` with no phase arg still activates everything (backward compatible)
- The same pattern works for the legacy fast path: `/squad plan accept phase {N}`

This is useful for large projects where you want to review and iterate between phases — ship Phase 1, learn from it, then decide whether to adjust Phase 2's plan before accepting it.

### Plan revise

```
/squad plan revise merge the two security issues into one and add a migration step
```

If the plan needs adjustments, revise it at any stage. Squad reads your feedback,
modifies the current plan, and posts an updated comment. The revised plan
supersedes the previous one.

### Examples

**Small project — recommended fast path (3 commands):**

```text
1. /squad research → Deep repo analysis
2. /squad plan     → Program + implementation plan for review
3. /squad activate → Accept the reviewed plan and create issues
```

If the plan needs changes, run `/squad plan revise <feedback>` before activation.
`/squad plan accept` remains an equivalent legacy command.

**Large project — granular lifecycle (7+ commands):**

```
1. /squad research                       → Deep repo analysis
   Next step shown: "/squad triage" or "/squad plan"
2. /squad triage                         → Classify findings
   Next action: "/squad plan program"
   Also available: "/squad triage revise"
3. /squad triage revise move X to excluded → Adjust scope
   Next action: "/squad plan program"
4. /squad plan program                   → Strategic plan with milestones
   Next action: "/squad plan accept scope"
   Also available: "/squad plan program revise"
5. /squad plan accept scope              → Lock the program structure
   Next action: "/squad plan implementation"
6. /squad plan implementation            → PR-sized task decomposition
   Next action: "/squad plan validate"
   Also available: "/squad plan accept implementation"
7. /squad plan accept implementation phase 1  → Accept + auto-activate Phase 1
   (issues created immediately)
   Next action: "/squad plan accept implementation phase 2"
   /squad plan accept implementation phase 2  → Accept + auto-activate Phase 2
   ...
   — OR —
   /squad plan accept implementation     → Accept all at once
   Next action: "/squad plan activate"
8. /squad plan activate                  → Create GitHub issues (terminal)
   — only needed if step 7 used full accept without auto-activate —
```

At every step, the lifecycle state comment on the issue shows exactly what to do
next — no need to memorize the command sequence.

---

## Implementing issues

After `/squad plan activate` creates the implementation backlog, run:

```
/squad implement
```

### Regular issues

On a regular issue, the main Squad workflow dispatches an isolated
`squad-implement-worker` run. The worker:

1. Stops immediately if the issue is already closed
2. Checks that every issue listed in `Depends on:` is closed — posts a blocker comment and stops if any dependency is still open
3. Checks for an existing open PR whose branch starts with `squad/implement-{N}-` or whose body closes the issue — posts the PR URL and stops if one is found
4. Routes work to the squad member named by the `squad:{member}` label, or lets the Lead choose specialists when no label is present
5. Inspects the repository and implements the smallest complete change that satisfies every acceptance criterion
6. Runs the smallest existing build, test, and lint commands covering the change
7. Reviews the final diff against the issue acceptance criteria
8. Opens one focused pull request on branch `squad/implement-{N}-{slug}` that closes the issue

The main Squad workflow retains its narrow cast and planning permissions and
**cannot edit repository files**. Only the implementation worker has `edit`
tool access, and it delivers changes through gh-aw's guarded
`create-pull-request` safe output. Workflow, agent, and Squad configuration
paths (`.github/workflows/`, `.github/agents/`, `.github/aw/`, `.squad/`) are
prohibited from modification; files flagged as protected trigger a review
request rather than a direct commit.

### Epics

On an epic, Squad finds its open child issues through native sub-issue
relationships and `Parent: #N` metadata. It then:

1. Excludes tasks with open dependencies
2. Excludes tasks that already have an open implementation pull request
3. Calculates available slots: `max(0, 3 − active-implementation-count)`
4. Dispatches one worker per selected ready child, up to three concurrent implementation PRs
5. Posts a summary listing dispatched, blocked, active, and deferred tasks

Each worker creates its own branch and pull request. When one of those pull
requests merges, the worker resolves the parent epic and dispatches the main
Squad workflow in implement mode. Squad then dispatches enough ready children
to refill the three active slots. This continues until no open children remain,
without requiring a third workflow.

Both workflows accept gh-aw's propagated `aw_context` and allow the
repository's `github-actions[bot]` to pass the workflow-dispatch activation
gate. Human slash commands retain the normal repository-role checks. The merge
relay targets the repository's default branch so deleting a merged
implementation branch cannot prevent the continuation dispatch.

For example, an epic with ten independent tasks starts three workers. Each
merge automatically starts one replacement, keeping three implementation pull
requests active until the final task is dispatched. Dependencies may
temporarily reduce the active count when no additional child is ready.

`/squad implement` remains available as a manual recovery command if a run is
cancelled or an external change requires the epic to be reevaluated.

> **Repository setting:** Pull-request delivery requires **Settings → Actions →
> General → Workflow permissions → Allow GitHub Actions to create and approve
> pull requests**.

> **Pull request CI:** Pull requests created with the default `GITHUB_TOKEN` do
> not trigger other workflow runs. Set `GH_AW_CI_TRIGGER_TOKEN` to a suitable
> fine-grained PAT if implementation pull requests must start repository CI
> automatically.

> **Manual runs:** From **Actions → Squad → Run workflow**, enter `implement` as
> the command and provide the target issue number.

---

## `/squad implement` vs. assigning to the GitHub Copilot coding agent

These are two separate mechanisms. Understanding the difference helps you
choose the right tool for each task.

| | `/squad implement` | GitHub Copilot coding agent (`@copilot`) |
|---|---|---|
| **What it is** | A gh-aw agentic workflow that dispatches an isolated Squad worker | A separate GitHub product that picks up issues assigned to `copilot-swe-agent[bot]` |
| **How it's triggered** | `/squad implement` slash command or workflow dispatch | Assigning the issue to `@copilot` (via `squad:copilot` label + auto-assign workflow, or manually) |
| **Routing** | Uses `squad:{member}` label and `.squad/routing.md` to select the right specialist | Reads `.github/copilot-instructions.md` for context; not routed by Squad labels |
| **Orchestration** | Squad coordinator fans out up to 3 parallel workers for epic children; merge relay auto-refills slots | Each assignment is independent; no Squad-level fan-out or slot management |
| **Repository editing** | Worker runs inside gh-aw sandbox; file writes go through `create-pull-request` safe output with allowlisted paths | Coding agent creates a `copilot/*` branch and opens a draft PR directly |
| **PR branch** | `squad/implement-{N}-{slug}` | `copilot/{slug}` |
| **PR behavior** | PR closes the issue; protected-file changes trigger a review request | Draft PR opened immediately; requires human promotion |
| **Squad awareness** | Full: reads team roster, routing rules, acceptance criteria | Partial: reads `copilot-instructions.md` if present; not integrated with Squad planning state |
| **Best for** | Issues created by `/squad plan activate`; work that should follow Squad routing and epic fan-out | Standalone tasks (bug fixes, test coverage, lint) that don't require Squad orchestration |

### Does `/squad implement` use the GitHub Copilot coding agent?

No. `/squad implement` dispatches the `squad-implement-worker` gh-aw workflow,
which is a Copilot-powered agentic workflow running in the GitHub Actions
sandbox. It does **not** assign issues to `copilot-swe-agent[bot]` or
interact with the GitHub Copilot coding agent product in any way.

The `@copilot` entry in `.squad/team.md` (added by `squad copilot`) is a
roster slot with `copilot-auto-assign: false` by default. No Squad workflow
reads that flag to dispatch the coding agent. Auto-assignment is handled by a
separate `squad-issue-assign` GitHub Actions workflow that watches for the
`squad:copilot` label — it is entirely independent of `/squad implement`.

See [Copilot coding agent](../features/copilot-coding-agent.md) for setup and
capability profiles.

---

## Review lifecycle

### What happens during and after `/squad implement`

The implementation worker performs an internal self-review before opening a PR:

1. **Dependency check** — refuses to start if any `Depends on:` issue is open
2. **Duplicate check** — refuses to create a second PR if one already exists
3. **Build / test / lint** — runs the smallest existing commands covering the change
4. **Diff review** — the worker reviews its own final diff against the issue acceptance criteria before calling `create-pull-request`
5. **Protected-file guard** — changes to protected paths trigger a review request on the PR rather than a direct commit

After the PR is opened, `squad-review` provides an independent advisory review.
You can start it in either of these ways:

- **Manual:** Comment `/squad review` on a same-repository pull request. The main
  Squad router relays the pull request number, current head SHA, and manual
  origin to the isolated reviewer workflow.
- **Automatic:** A same-repository pull request triggers review on
  `ready_for_review` and `synchronize` when it has recognized Squad or Copilot
  provenance. Fork pull requests are refused.

The reviewer classifies provenance in this priority order:

1. One validated `<!-- squad:implement issue=... run=... -->` worker marker and
   its matching `squad/implement-*` branch
2. A `squad/implement-*` branch when no marker-like text is present
3. Author `copilot-swe-agent[bot]` or a `copilot/*` branch when no marker-like
   text is present
4. Unattributed

Malformed higher-priority evidence fails closed instead of falling through to a
weaker classification. Automatic review refuses unattributed pull requests;
manual review can continue as `Unattributed (manual)`. A
`Squad-Review-Head: <SHA>` marker deduplicates review for an unchanged head, and
per-PR concurrency cancels stale runs after a new push.

### Advisory verdicts and reviewer independence

The reviewer can add a bounded summary comment, inline review comments, and
exactly one pull request review. It returns:

- `REQUEST_CHANGES` for a concrete merge blocker, such as an acceptance-criteria
  violation, unsafe authority expansion, protected-file violation, missing test,
  or required-but-missing changeset
- `COMMENT` when findings are advisory or no merge blocker is established

The reviewer has no file-editing, workflow-dispatch, issue-creation,
pull-request-creation, remediation, merge, or `APPROVE` authority. Its verdict
does not replace branch protection, required status checks, or a human
reviewer's approval. Human approval remains mandatory.

The lifecycle is:

```
/squad implement → implementation PR opened → advisory Squad review → human review + CI → merge → epic relay (next wave)
```

### Advisory fast path

Because review is advisory, it is possible to merge without waiting for an
automatic review or manually running `/squad review`. That fast path gives up an
independent, head-SHA-specific check of the linked issue's acceptance criteria,
Squad routing and charter compliance, protected-file boundaries, focused tests,
and changeset coverage. Your repository's human approval and required checks
still decide whether the pull request can merge.

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

## Acknowledgment messages

When Squad starts processing a slash command, it posts a brief, mode-specific
acknowledgment comment on the issue before doing work:

- `/squad research` → `🤖 Squad is researching this…`
- `/squad plan` → `🤖 Squad is creating a plan…`
- `/squad plan accept implementation phase 1` → `🤖 Squad is creating implementation tasks…`

This replaces the previous generic "processing" message with context about what
Squad is actually doing.

---

## How the workflow runs

Understanding the two-job architecture helps when debugging.

### Job 1: Activation (unrestricted network)

The activation job runs with full network access:

1. Optionally mints a GitHub App installation token
2. Resolves `SQUAD_CLI_VERSION` (default `v0.13.1`) and downloads the matching
   standalone GitHub Release bundle with checksum verification — no npm install
3. Preserves a committed team with roster entries, or runs
   `squad init --preset default --state-backend local` when no usable team exists
4. Rejects `npx`-based MCP wiring and runs `squad health --json`
5. On success, uploads `.squad/` and `.github/agents/squad.agent.md` as a
   one-day `squad-state` artifact

### Job 2: Agent (network-restricted)

The agent job runs inside the `gh aw` sandbox with no outbound network:

1. Downloads the `squad-state` artifact from Job 1
2. Restores team files into the workspace
3. Executes the Squad coordinator using only the pre-generated files

The Squad CLI is never installed in the agent job — only the files it produced
are used. Each run starts from the repository's committed state: a merged Cast
PR persists the complete team and casting files, while activation-only scaffold
state and uncommitted runtime output do not carry over. User-facing changes
persist through Squad's guarded pull requests, issue comments, issues, and
reviews.

---

## Upgrading

Pin upgrades to one immutable 40-character Squad commit SHA. A bare `gh aw add`
does not refresh files that are already installed, so use `--force`:

```bash
SQUAD_SHA="<40-character-commit-sha>"

gh aw add \
  bradygaster/squad/workflows/squad.md@${SQUAD_SHA} \
  bradygaster/squad/workflows/squad-implement-worker.md@${SQUAD_SHA} \
  bradygaster/squad/workflows/squad-deps-worker.md@${SQUAD_SHA} \
  bradygaster/squad/workflows/squad-review.md@${SQUAD_SHA} \
  --force
```

`--force` overwrites the installed source files. Save any local source
customizations first, then reapply them before the final compile. Never customize
generated `.lock.yml` files.

Existing local imports are not guaranteed to refresh with the top-level files.
Fetch every Squad shared import at the same SHA:

```bash
mkdir -p .github/workflows/shared

curl --fail --silent --show-error --location \
  "https://raw.githubusercontent.com/bradygaster/squad/${SQUAD_SHA}/workflows/shared/squad.md" \
  --output .github/workflows/shared/squad.md
curl --fail --silent --show-error --location \
  "https://raw.githubusercontent.com/bradygaster/squad/${SQUAD_SHA}/workflows/shared/squad-cast-validator.md" \
  --output .github/workflows/shared/squad-cast-validator.md
curl --fail --silent --show-error --location \
  "https://raw.githubusercontent.com/bradygaster/squad/${SQUAD_SHA}/workflows/shared/squad-planning-ontology.md" \
  --output .github/workflows/shared/squad-planning-ontology.md
curl --fail --silent --show-error --location \
  "https://raw.githubusercontent.com/bradygaster/squad/${SQUAD_SHA}/workflows/shared/squad-planning-policy.md" \
  --output .github/workflows/shared/squad-planning-policy.md

gh aw compile --strict
```

Confirm all four source files and generated locks reference `SQUAD_SHA`, review
the workflow diff, then commit them together. With gh-aw v0.87.10, do not use
`gh aw update` for this immutable-pin flow: its stored source branch and cooldown
can leave the installed sources at a different revision than the SHA you intend.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Nothing to cast from" comment | Both repo and issue are empty | Add a README or write a casting brief in the issue body |
| Cast produces a generic team | Issue body was empty, repo was analyzed alone | Write a detailed casting brief (see [example](#example-writing-a-casting-brief)) |
| Cast completed but no PR link is visible | The completion response did not resolve the created PR | Open the repository's pull requests and find the newest `[squad] Cast` PR before rerunning; do not start a second Cast command |
| Cast PR application CI shows `action_required` | GitHub requires maintainer approval for checks on the workflow-created branch | Approve the workflow run from the PR checks view, wait for normal repository CI, then continue review |
| "Could not access" error on Connect/Adopt | Source repo is private or doesn't exist | Verify the source repo is accessible and contains a `.squad/` directory |
| `/squad` command is ignored | Lock file not committed or workflow not compiled | Run `gh aw compile --strict`, commit the lock file, and push |
| Universe is full on cast-member | All character names in the universe are allocated | Retire an unused member first, or re-cast with `/squad cast` |
| "No plan found" on plan accept | No `/squad plan` comment exists yet | Run `/squad plan` first to generate a plan for review |
| Plan activation creates fewer issues than the accepted plan declares | The run ended early, or it reached the `create-issue` (75) or `add-labels` (110) safe-output cap | Look for an `[aw] ... reported incomplete result` tracking issue — it names the shortfall and, when a cap was reached, which cap and what did not fit. Re-run the identical activation command (title matching resumes without duplicating existing issues), or activate one phase at a time with `/squad plan activate phase {N}` |
| Activation run is green but some issues are missing or unlabeled | `report_incomplete` records truncation without failing the run | A green run is not proof of a complete activation. Check for the `[aw] ... reported incomplete result` tracking issue, then verify with `gh issue list --label squad` |
| A Squad label has no description and an unexpected color | It was auto-created on a fresh repo by `create-if-missing` | Expected, not a failure. Edit the label if you want a description or a specific color |
| `/squad implement` cannot create a PR | Actions is not allowed to create pull requests | Enable **Allow GitHub Actions to create and approve pull requests** in repository Actions settings |
| Epic implementation dispatches no workers | Every child is blocked or already has an open implementation PR | Merge dependency PRs, then run `/squad implement` on the epic again |
| Standalone activation fails before init | `SQUAD_CLI_VERSION` is invalid or its release assets are unavailable | Correct the variable or select a published release, then use **Re-run failed jobs** |
| Squad health fails | Initialization or committed team state is incomplete | Inspect the `Run Squad health check` JSON, correct the reported state, and rerun; no `squad-state` artifact is uploaded on failure |
| A command run was cancelled or its result is uncertain | The run stopped before a durable output was confirmed | Rerun the identical `/squad` command; Cast, implementation, activation, and review paths check existing GitHub state before creating output |

---

## See also

- [Squad README](https://github.com/bradygaster/squad#readme) — project overview and local CLI usage
- [Workflow definition](https://github.com/bradygaster/squad/blob/dev/workflows/squad.md) — full slash command specification
- [Implementation worker](https://github.com/bradygaster/squad/blob/dev/workflows/squad-implement-worker.md) — isolated issue implementation workflow
- [Bootstrap component](https://github.com/bradygaster/squad/blob/dev/workflows/shared/squad.md) — activation and artifact lifecycle
