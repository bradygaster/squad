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

Six steps from zero to a working Squad team:

```bash
# 1. Install the gh-aw extension (one-time)
gh extension install github/gh-aw

# 2. Allow GitHub Actions to create pull requests
gh api --method PUT repos/{owner}/{repo}/actions/permissions/workflow \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=true

# 3. Add the Squad workflows to your repo
gh aw add \
  bradygaster/squad/workflows/squad-implement-worker.md@dev \
  bradygaster/squad/workflows/squad.md@dev

# 4. Compile the workflows to lock files
gh aw compile

# 5. Commit and push the workflow sources and generated files
git add -- .gitattributes .github/aw/ .github/workflows/
git commit -m "ci: add Squad agentic workflow"
git push

# 6. Open an issue and type /squad cast — done!
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

### Install the workflows

```bash
gh aw add \
  bradygaster/squad/workflows/squad-implement-worker.md@dev \
  bradygaster/squad/workflows/squad.md@dev
```

The single command installs the dedicated worker first, then the main workflow
that dispatches it.

> **Branch note:** `@dev` pulls from the latest development branch where new modes and fixes land first. Stay on `@dev` to get improvements as they ship. Once gh-aw support reaches stable, you can switch to `@main` or drop the ref entirely for the default branch.

This registers the Squad workflow in your repository's agentic workflow
configuration.

### Compile to lock files

```bash
gh aw compile
```

Compiling resolves both workflow definitions and their shared imports into
deterministic `.lock.yml` files. These lock files are what GitHub Actions
actually executes.

### Commit the workflow files

```bash
git add -- .gitattributes .github/aw/ .github/workflows/
git commit -m "ci: add Squad agentic workflow"
git push
```

This stages everything under `.github/aw/` and `.github/workflows/` so new shared imports, additional lock files, or updated shared workflow files are all captured automatically — no need to update the command as Squad's shipped files evolve.

Downloaded workflow audit data under `.github/aw/logs/` is local diagnostic
output and should not be committed. The `gh aw logs` and `gh aw audit` commands
normally create `.github/aw/logs/.gitignore`; if it is missing, add:

```gitignore
# Ignore all downloaded workflow logs
*

# But keep this file
!.gitignore
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

Commands are matched longest-prefix-first, so `/squad plan accept scope` resolves
to the scope-acceptance mode rather than to `/squad plan`.

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
| Acceptance | `/squad plan accept` | **Fast path:** accept all phases of scope + implementation + activate | Creates GitHub issues immediately |
| Acceptance | `/squad plan accept phase {N}` | Accept only Phase N of a plan (incremental, in order) | Combines scope + impl + activate for that phase |
| Acceptance | `/squad plan accept scope` | Approve the program plan scope | Locks strategic structure before decomposition |
| Acceptance | `/squad plan accept implementation` | Approve all phases of the implementation plan | Issues are not created until activate |
| Acceptance | `/squad plan accept implementation phase {N}` | Accept only Phase N of the implementation plan | Also auto-activates when prior phases are ready |
| Activation | `/squad plan activate` | Create GitHub issues from an accepted plan | Terminal step; creates real GitHub issues |
| Activation | `/squad plan activate phase {N}` | Create GitHub issues for only Phase N | Use when accept didn't auto-activate |
| Implementation | `/squad implement` | Implement an issue, or start the next ready wave of an epic | Dispatches an isolated implementation worker |

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
backlog without leaving the issue thread.

### The full lifecycle

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

### Fast paths (backward compatible)

You don't have to use every step. Fast-path commands combine multiple stages:

| Fast path | Equivalent to | Stages skipped |
|-----------|---------------|----------------|
| `/squad plan` | `/squad plan program` + `/squad plan implementation` | Separate triage classification; separate scope review gate |
| `/squad plan accept` | `/squad plan accept scope` + `/squad plan accept implementation` + `/squad plan activate` | Separate scope lock step; separate implementation approval step; issues created immediately |

#### What you give up with each fast path

**`/squad plan` (skipping triage and separate scope review)**

- **Skips:** `/squad triage` — no explicit classification of findings into work/decision/excluded before planning
- **Skips:** Separate `/squad plan accept scope` gate — the strategic structure (initiatives, epics, milestones) is never independently locked before task decomposition proceeds
- **Risk:** Scope may be broader or narrower than intended because exclusions were never explicitly classified. Triage is where you tell Squad "don't plan that" — without it, Squad infers scope from research findings alone.
- **Good for:** Small, well-understood features where you already know the scope and trust Squad's decomposition without a formal review gate.

**`/squad plan accept` (skipping separate scope lock and implementation review)**

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
- **Recommendations** — sequencing suggestions and things to avoid
- **Next Step** — tells you what to do next:
  - `/squad triage` — classify findings into work items, decisions, and exclusions (granular path)
  - `/squad plan` — skip triage and generate a combined plan directly (fast path)

You can focus the research with additional context:

```
/squad research focus on the authentication and authorization gaps
/squad research what's the current state of the test coverage?
```

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

Creates GitHub issues from the accepted plan with proper labels (`squad`,
`squad:{agent-name}`), acceptance criteria, dependency references, and phase
assignments.

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

**Small project — fast path (4 commands):**

```
1. /squad research                → Deep repo analysis
   Next step shown: "/squad triage" or "/squad plan" (fast path)
2. /squad plan                    → Program + implementation in one pass
   Next action: "/squad plan accept"
3. /squad plan revise fewer tasks → Adjusted plan
   Next action: "/squad plan accept"
4. /squad plan accept             → Issues created
```

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

## Review lifecycle and current gaps

### What review happens during and after `/squad implement`

The implementation worker performs an internal self-review before opening a PR:

1. **Dependency check** — refuses to start if any `Depends on:` issue is open
2. **Duplicate check** — refuses to create a second PR if one already exists
3. **Build / test / lint** — runs the smallest existing commands covering the change
4. **Diff review** — the worker reviews its own final diff against the issue acceptance criteria before calling `create-pull-request`
5. **Protected-file guard** — changes to protected paths trigger a review request on the PR rather than a direct commit

After the PR is opened, review follows the standard GitHub flow: human
reviewers, required status checks (CI), and merge by a repository maintainer.
If you configured `GH_AW_CI_TRIGGER_TOKEN`, implementation PRs will trigger
your CI workflows automatically; without it, the default `GITHUB_TOKEN`-created
PRs do not start other workflow runs.

### There is no separate `/squad review` command

Squad does not currently have a post-implementation review command. There is no
`/squad review` slash command, and no workflow runs automatically to review PRs
after `/squad implement` opens them.

This is a **current lifecycle gap**: the path from an open implementation PR to
merge relies entirely on human review, your existing CI, and normal GitHub PR
processes. If you have a squad member designated as a reviewer, you can ask
them to review the PR in a Copilot Chat session, but that is not an automated
Squad workflow.

The lifecycle today is:

```
/squad implement → implementation PR opened → human review + CI → merge → epic relay (next wave)
```

If a dedicated automated review phase is added in a future release, it will
appear as a new slash command in this guide.

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

## Upgrading

To update your compiled workflow after pulling upstream changes:

```bash
gh aw add \
  bradygaster/squad/workflows/squad-implement-worker.md@dev \
  bradygaster/squad/workflows/squad.md@dev
```

This re-compiles the workflow from source. If you have local customizations in your compiled `.github/workflows/squad-*.lock.yml`, they will be overwritten — keep customizations in the source `.md` files instead.

For manual recompilation of all workflows:

```bash
gh aw compile
```

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
| Plan accept creates fewer issues than expected | `create-issue` safe-output has a max of 75 | Re-run the identical activation command — it is idempotent and picks up where it left off |
| `/squad implement` cannot create a PR | Actions is not allowed to create pull requests | Enable **Allow GitHub Actions to create and approve pull requests** in repository Actions settings |
| Epic implementation dispatches no workers | Every child is blocked or already has an open implementation PR | Merge dependency PRs, then run `/squad implement` on the epic again |

---

## See also

- [Squad README](https://github.com/bradygaster/squad#readme) — project overview and local CLI usage
- [Workflow definition](https://github.com/bradygaster/squad/blob/dev/workflows/squad.md) — full slash command specification
- [Implementation worker](https://github.com/bradygaster/squad/blob/dev/workflows/squad-implement-worker.md) — isolated issue implementation workflow
- [Bootstrap component](https://github.com/bradygaster/squad/blob/dev/workflows/shared/squad.md) — activation and artifact lifecycle
