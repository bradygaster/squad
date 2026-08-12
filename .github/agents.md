---
description: Agent-facing guide to using Squad — the multi-agent team orchestrator for GitHub Copilot. Covers installation, slash commands, planning lifecycle, structured artifacts, and safe-output constraints.
---

# Using Squad in This Repository

Squad is a multi-agent team orchestrator for GitHub Copilot. It composes specialist AI agents into a coordinated team that lives in your repository, then drives planning and execution through structured workflows.

---

## Getting started

GitHub Agentic Workflows (`gh-aw`) are composable AI workflows triggered by slash commands in GitHub issues. Squad uses them to orchestrate multi-agent planning and execution directly inside your repository.

### Prerequisites

- **GitHub CLI** (`gh`) installed and authenticated — [install guide](https://cli.github.com/)
- **`gh aw` extension** available (ships with recent `gh` versions; run `gh aw --help` to verify)

### Install the Squad workflow

```bash
gh aw add bradygaster/squad/workflows/squad.md@dev
```

This command:

1. Fetches the Squad workflow definition from the source repository
2. Compiles it into a GitHub Actions–compatible workflow
3. Adds the workflow to your repository's `.github/` directory

### Verify installation

After running the command, confirm the workflow appears in your repository's **Actions** tab. You should see a new workflow named "Squad" (or similar) listed and ready to trigger.

### Try your first command

1. Create a new issue describing what you want to build.
2. Post a comment on that issue:
   ```
   /squad cast
   ```
3. Squad generates a specialist team tailored to your project and opens a PR with the `.squad/` directory.

---

## Usage modes

Once installed, Squad supports two interaction modes:

| Mode | Trigger | Best for |
|------|---------|----------|
| **gh-aw** (GitHub Agentic Workflows) | Slash commands in issues | Automated, issue-driven planning and execution |
| **CLI** (interactive) | `squad` command in terminal | Local development, experimentation |

This guide focuses on the **gh-aw** approach — the primary mode for agent-driven work. Everything below assumes you've completed the installation steps above.

---

## Where the team lives

```
.squad/
├── team.md              # Roster, roles, capabilities
├── routing.md           # Work-type → agent mapping
├── decisions.md         # Architectural decisions log
├── casting/
│   └── registry.json    # Agent registry
└── agents/
    └── {name}/
        └── charter.md   # Agent identity, constraints, skills
```

---

## Slash Commands — Complete Reference

All commands are issued as comments on a GitHub issue. Prefix: `/squad`.

### Team Management

| Command | Purpose | Preconditions | Repo artifacts | User sees |
|---------|---------|---------------|----------------|-----------|
| `/squad cast` | Generate a specialist team for the repository | Issue exists with description of what to build | PR opened with `.squad/` directory + `.github/agents/squad.agent.md` | PR link posted as comment |
| `/squad cast-member <role>` | Add a single team member to an existing team | `.squad/team.md` exists with roster | PR updating `.squad/agents/{name}/charter.md` and `team.md` | PR link posted as comment |
| `/squad retire <name>` | Remove a team member | Named agent exists in `.squad/agents/` | PR removing agent directory and roster entry | PR link posted as comment |
| `/squad status` | Show team status and health | `.squad/team.md` exists | None | Comment with team state summary |
| `/squad connect <owner/repo>` | Connect to a GitHub repository for issue management | Target repo accessible | `.squad/config` updated with connected repo | Confirmation comment |
| `/squad adopt <path>` | Adopt an existing `.squad/` directory from another source | Path contains valid `.squad/` structure | PR with adopted `.squad/` directory | PR link posted as comment |

### Planning Workflow

| Command | Purpose | Preconditions | Repo artifacts | User sees |
|---------|---------|---------------|----------------|-----------|
| `/squad research` | Deep-dive analysis of the issue and repository | Issue exists with intent | Comment with `squad_artifact: research` data | Structured research findings |
| `/squad triage` | Classify research findings into work, decisions, and exclusions | Research artifact exists | Comment with `squad_artifact: triage` data | Categorized findings table |
| `/squad triage revise <feedback>` | Adjust triage dispositions based on feedback | Triage artifact exists | Updated `triage` artifact | Revised triage |
| `/squad plan` | Generate combined program + implementation plan (fast path) | Triage artifact exists | Comment with `squad_artifact: plan` data | Combined plan |
| `/squad plan program` | Generate high-level program plan with epics and milestones | Triage artifact exists | Comment with `squad_artifact: program` data | Epics, milestones, user stories |
| `/squad plan program revise <feedback>` | Adjust program plan based on feedback | Program plan artifact exists | Updated `program` artifact | Revised program plan |
| `/squad plan implementation` | Decompose program plan into PR-sized tasks | Program plan artifact exists | Comment with `squad_artifact: implementation` data | Task breakdown with deps and sizing |
| `/squad plan validate` | Run structural readiness checks on the plan | Implementation plan artifact exists | Comment with `squad_artifact: validation` data | Pass/fail checklist |
| `/squad plan revise <feedback>` | Revise the current plan based on feedback | Program or implementation plan exists | Updated plan artifact | Revised plan |
| `/squad plan accept` | Accept scope + implementation + activate (fast path) | Implementation plan + validation pass | Structured acceptance/activation artifacts; issues created | Acceptance confirmations + issue links |
| `/squad plan accept scope` | Approve the program plan's scope | Program plan artifact exists | Comment with `squad_artifact: scope-accepted` data | Scope lock confirmation |
| `/squad plan accept implementation` | Approve the implementation plan | Implementation plan + validation pass | Comment with `squad_artifact: impl-accepted` data | Implementation lock confirmation |
| `/squad plan activate` | Create GitHub issues from accepted plan | Both scope and implementation accepted | Issues + milestones + labels; `activated` artifact | Issue links and summary |

---

## The Planning Lifecycle

### State Machine

```
idle
  → researching        (/squad research)
  → triaging           (/squad triage)
  → program_planning   (/squad plan program)
  → implementation_planning  (/squad plan implementation)
  → validating         (/squad plan validate)
  → scope_accepted     (/squad plan accept scope)
  → impl_accepted      (/squad plan accept implementation)
  → activated          (/squad plan activate)
```

### Stage-by-Stage Reference

| Stage | Command | `squad_artifact` | Location | Idempotent? |
|-------|---------|------------------|----------|-------------|
| Intent | (issue body) | — | Issue description | N/A |
| Research | `/squad research` | `research` | Issue comment | Yes — re-running replaces previous |
| Triage | `/squad triage` | `triage` | Issue comment | Yes |
| Program Plan | `/squad plan program` | `program` | Issue comment | Yes |
| Implementation Plan | `/squad plan implementation` | `implementation` | Issue comment | Yes |
| Validation | `/squad plan validate` | `validation` | Issue comment | Yes |
| Scope Acceptance | `/squad plan accept scope` | `scope-accepted` | Issue comment | No — locks scope |
| Impl Acceptance | `/squad plan accept implementation` | `impl-accepted` | Issue comment | No — locks implementation |
| Activation | `/squad plan activate` | `activated` | Issue comment | No — creates issues |
| Lifecycle State | (auto-updated) | `lifecycle-state` | Issue comment | Auto-maintained |

**Idempotency note:** Research, triage, plans, and validation can be re-run safely — each re-run replaces the previous artifact. Acceptance and activation are one-way transitions.

---

## Fast Paths vs Granular Commands

### Fast path — fewer steps, less control

```
/squad plan            → generates program + implementation in one pass
/squad plan accept     → accepts scope + implementation + activates
```

Use when: the intent is clear, the scope is small-to-medium, and you trust the decomposition without intermediate review.

### Granular path — more control, full auditability

```
/squad research
/squad triage
/squad plan program
/squad plan implementation
/squad plan validate
/squad plan accept scope
/squad plan accept implementation
/squad plan activate
```

Use when: scope is large or ambiguous, you need stakeholder sign-off at each stage, or you want to revise intermediate artifacts before proceeding.

You can mix: use `/squad plan` for the fast program+implementation pass, then review and `/squad plan accept scope` and `/squad plan accept implementation` separately.

---

## What Gets Created in the Repo

### `.squad/` directory

Created by `/squad cast`. Contains team state, agent charters, routing rules, and configuration. Delivered as a PR — never committed directly to the default branch.

### Labels

- `squad` — applied to all Squad-managed issues and PRs
- `squad:{agent-name}` — assigns ownership to a specific team member

### Issues

Created during `/squad plan activate`:
- **Epics** — high-level work items with sub-issues
- **Tasks** — PR-sized implementation units linked to epics
- Hierarchy uses GitHub sub-issues when available

### Milestones

Created during activation to group epics by delivery phase.

### Comments

Structured planning artifacts are posted as human-readable issue comments. gh-aw appends a validated `Structured data:` JSON block for programmatic identification.

### Pull requests

- `/squad cast` → PR with `.squad/` scaffolding
- `/squad cast-member` → PR adding a new agent
- `/squad retire` → PR removing an agent

---

## Planning Policy

Squad's planning behavior is configurable through policy profiles.

### Built-in Profiles

| Profile | Max issues | Milestones required | Acceptance criteria | Best for |
|---------|-----------|--------------------|--------------------|----------|
| `default` | 20 | Yes | Yes | Most projects |
| `lean` | 10 | No | No | Small scope, fast iteration |
| `enterprise` | 50 | Yes (strict) | Yes (strict) | Large orgs, compliance needs |
| `spike` | 5 | No | No | Exploration, prototyping |

### Selecting a Profile

Add an HTML comment to the issue body:

```html
<!-- squad-policy: lean -->
```

Or configure at the repo level in `.squad/planning-policy.md` with YAML frontmatter.

### Priority Order

1. Issue body (`<!-- squad-policy: ... -->`) — highest
2. Repository file (`.squad/planning-policy.md`)
3. Profile name (built-in)
4. Default — fallback

---

## Safe-Output Constraints

GitHub Agentic Workflows enforce output limits per run to prevent runaway mutations.

| Output type | Maximum per run | Notes |
|-------------|----------------|-------|
| `create-issue` | 75 | For large decompositions, split into multiple plan/accept cycles |
| `create-pull-request` | 3 | Cast, cast-member, and retire each produce one PR |
| `add-comment` | 20 | Planning artifacts are posted as comments |

### Implications

- All mutations are explicitly declared — no surprise side effects
- If a plan produces more than 20 tasks, activation will create the first 20; re-run to continue
- Allowed branch patterns for PRs: `squad/*`
- Allowed file patterns for PRs: `.squad/**`, `.github/agents/squad.agent.md`, `meet-the-squad.md`
- Labels `[squad]` are applied automatically to all created issues and PRs

---

## Structured Data for Programmatic Access

Every planning artifact uses the gh-aw safe-output data envelope:

```json
{
  "squad_artifact": "research",
  "schema_version": "1",
  "origin_issue": 123,
  "phases": []
}
```

gh-aw appends the envelope as a `Structured data:` fenced JSON block. `phases` is empty except on phase-state artifacts, where it contains the accumulated phase numbers. Paginate all comments, parse the JSON, match the current `origin_issue` and desired `squad_artifact`, then take the newest match.

HTML comments are not Squad state: gh-aw removes them from compiled prompts and sanitized safe-output bodies. See the planning ontology §4 for the complete artifact registry.
