---
name: Squad
run-name: "Squad — ${{ github.event.inputs.command || github.event.comment.body || github.event.issue.title || 'run' }}"
description: Cast, connect, or adopt a Squad AI team for your repository
emoji: "🧑‍🤝‍🧑"
private: false
on:
  slash_command:
    name: squad
    events:
      - issues
      - issue_comment
      - pull_request_review_comment
  workflow_dispatch:
    inputs:
      command:
        description: 'Squad command (e.g., cast, connect org/repo, adopt org/repo, status)'
        required: false
        default: 'cast'
permissions:
  contents: read
  copilot-requests: write
  issues: read
  pull-requests: read
network:
  allowed:
    - defaults
imports:
  - shared/squad.md
  - shared/planning-ontology.md
  - shared/planning-policy.md
tools:
  bash: true
  github:
    mode: gh-proxy
    toolsets: [default]
safe-outputs:
  create-pull-request:
    title-prefix: "[squad] "
    labels: [squad]
    max: 3
    allowed-base-branches:
      - "squad/*"
    allowed-files:
      - ".squad/**"
      - ".github/agents/squad.agent.md"
      - "meet-the-squad.md"
    protected-files: allowed
    max-patch-files: 500
    expires: 14d
  create-issue:
    labels: [squad]
    max: 50
  add-comment:
    max: 10
---

# Squad — Unified `/squad` Slash Command

Invoked via `/squad <mode> [options]` in issue bodies, issue comments, or PR
review comments, or manually via workflow_dispatch.

## Trigger Context

Access the slash command text from the GitHub event payload:

- **Issue body:** `github.event.issue.body` — the full issue description
- **Issue comment:** `github.event.comment.body` — the full comment text
- **PR review comment:** `github.event.comment.body` — the full comment text
- **Workflow dispatch:** `github.event.inputs.command` — manual input (default: `cast`)

The activation job already ran `squad init --preset default`, which produced a
generic 5-agent team (lead, reviewer, devrel, security, docs) in `.squad/`. Cast
mode REPLACES this scaffolding with a team tailored to the repository.

This workflow does not create or modify files under `.github/workflows/`.
Repository owners must configure Copilot setup steps separately when needed.

## Modes

Parse the slash command text to determine the mode:

| Command | Mode | Description |
|---------|------|-------------|
| `/squad cast` | Cast | Analyze repo and generate a new Squad team |
| `/squad connect <source>` | Connect | Link to an existing Squad source |
| `/squad adopt <url>` | Adopt | Pull squad config from a remote source |
| `/squad cast-member <spec>` | Cast Member | Add/modify a single team member |
| `/squad retire <name>` | Retire | Remove a team member |
| `/squad status` | Status | Report current team composition |
| `/squad research` | Research | Deep-dive analysis of the repo/issue; posts findings as a comment |
| `/squad plan` | Plan | Decompose the issue into sub-issues; posts proposed plan as a comment |
| `/squad plan revise <feedback>` | Plan Revise | Revise the last plan based on feedback |
| `/squad triage` | Triage | Classify research findings as work / decision / excluded |
| `/squad triage revise <feedback>` | Triage Revise | Adjust triage dispositions based on feedback |
| `/squad plan program` | Plan Program | Strategic decomposition into initiatives and epics |
| `/squad plan program revise <feedback>` | Plan Program Revise | Revise program plan based on feedback |
| `/squad plan implementation` | Plan Implementation | Decompose program plan into PR-sized tasks with deps and sizing |
| `/squad plan validate` | Plan Validate | Validate plan artifacts for structural issues before acceptance |
| `/squad plan accept` | Plan Accept | Fast-path: accept scope + impl + activate in sequence (legacy) |
| `/squad plan accept scope` | Plan Accept Scope | Approve the program plan's scope (the WHAT) |
| `/squad plan accept implementation` | Plan Accept Implementation | Approve the implementation plan (the HOW) |
| `/squad plan activate` | Plan Activate | Create GitHub issues and milestones from accepted implementation |
| `/squad` (no args) | Cast | Default to cast mode |

## Task

### 1. Parse Command

Extract the mode and arguments from the slash command text:

1. Read the trigger body from the event payload described above.
2. Strip the `/squad` prefix and trim whitespace.
3. Match the first word(s) against known modes: `cast`, `connect`, `adopt`,
   `cast-member`, `retire`, `status`, `research`, `triage`, `triage revise`,
   `plan`, `plan program`, `plan program revise`, `plan implementation`,
   `plan validate`, `plan accept`, `plan accept scope`,
   `plan accept implementation`, `plan activate`, `plan revise`.
4. If no subcommand is provided or the text is empty, default to `cast`.
5. Store any remaining text as arguments for the matched mode.

### 2. Execute Mode

---

#### Cast Mode

Cast mode analyzes the target repository, composes a specialist team, assigns
character names from a fictional universe, generates full `.squad/` scaffolding,
and opens a PR introducing the new team.

##### Step 0: Brief Resolution

Before analyzing the repo, determine the **primary casting input** by evaluating
two signals: the parent issue title and body (`github.event.issue.title` +
`github.event.issue.body`) and the repository content (README, file structure,
etc.). Both title and body contribute to the casting brief — a non-empty title
with an empty body is still a valid issue signal.

**Priority cascade:**

| Repo Signal | Issue Signal | Result |
|-------------|-------------|--------|
| Empty/bare | Empty/no body | **Noop** — post a comment (see below), stop |
| Empty/bare | Has content | **Issue wins** — cast from the issue description |
| Has content | Has content | **Merge** — repo is base context, issue augments or overrides |
| Has content | Empty/minimal | **Repo wins** — standard cast behavior |
| Any | Explicit source-of-truth signal | **Issue is source of truth** — user intent overrides, repo validates only |

"Explicit source-of-truth signal" means the issue body reads like a team spec — explicit role
lists, team-size declarations, operating-model descriptions, or language that
signals "this is what I want." Infer this from structure and detail level.

**Noop handling:** When both inputs are empty, use the `add-comment` safe-output
to post: "Nothing to cast from — the repo has no substantive content and the
issue has no casting brief. Add a README describing your project, or write your
desired team composition in this issue body, then re-run `/squad cast`." Then
stop — do not proceed to Step 1 or open a PR.

Carry the cascade result forward: it determines whether Step 1's repo analysis
is the primary input, an augmenting signal, or a validation-only pass.

##### Step 1: Repo Analysis

Analyze the repository to understand what kind of team it needs:

1. **Languages & frameworks** — Read file extensions, `package.json`,
   `requirements.txt`, `go.mod`, `Cargo.toml`, `*.csproj`, etc. Identify the
   primary language(s) and frameworks (React, Next.js, FastAPI, Rails, etc.).
2. **Project structure** — Examine top-level directories. Note patterns like
   `src/`, `lib/`, `packages/` (monorepo), `apps/`, `services/`, `docs/`.
3. **CI/CD** — Check `.github/workflows/`, `Makefile`, `Dockerfile`,
   `docker-compose.yml`. Note existing automation.
4. **Testing** — Look for test directories, test config files (`vitest.config`,
   `jest.config`, `pytest.ini`, `.mocharc`).
5. **Documentation** — Check for `docs/`, `README.md` quality, API docs,
   OpenAPI specs.
6. **Existing tooling** — Note linters, formatters, pre-commit hooks, release
   automation (changesets, semantic-release).
7. **README & purpose** — Read the README to understand what the project does,
   its domain, and its audience.

Produce a mental summary: project type, primary technologies, team size needed
(typically 4–7 agents), and which specialist roles would add the most value.

##### Step 2: Team Composition

Based on the analysis, decide which roles the team needs. Every team gets a
**Lead** (coordinator/architect). Then allocate specialists based on the repo:

| Signal | Suggested Role |
|--------|---------------|
| Frontend framework (React, Vue, Svelte) | Frontend Engineer |
| Backend/API code (Express, FastAPI, gRPC) | Backend Engineer |
| Database schemas, migrations | Data Engineer |
| Test suites, coverage config | Test Engineer |
| CI/CD workflows, Docker | DevOps / Platform |
| Security-sensitive code (auth, crypto) | Security Engineer |
| Docs site, README, tutorials | DevRel / Docs |
| Multiple packages/services | Integration Engineer |
| ML models, data pipelines | ML Engineer |
| Mobile (React Native, Swift, Kotlin) | Mobile Engineer |

**Guidelines:**
- Target 4–7 agents. Fewer for small repos, more for large monorepos.
- Every team needs at minimum: Lead + 2 specialists + 1 quality role (tester or reviewer).
- Avoid redundant roles — merge "reviewer" into Lead for small teams.
- The built-in agents Scribe (session logger), Ralph (work monitor), and Rai
  (RAI reviewer) are always present and do NOT count toward team composition.

##### Step 3: Universe & Name Allocation

Select a fictional universe and assign character names:

1. **Count agents** — determine team size from Step 2.
2. **Select universe** — choose from the allowlist below. Pick a universe whose
   capacity fits the team size with minimal waste. Use shape tags and resonance
   signals to find thematic alignment with the project domain.

   | Universe | Capacity | Shape |
   |----------|----------|-------|
   | The Usual Suspects | 6 | small, noir, ensemble |
   | Reservoir Dogs | 8 | small, noir, ensemble |
   | Alien | 8 | small, sci-fi, survival |
   | The Goonies | 8 | small, adventure, ensemble |
   | The Matrix | 10 | medium, sci-fi, cyberpunk |
   | Firefly | 10 | medium, sci-fi, western |
   | Star Wars | 12 | medium, sci-fi, epic |
   | Breaking Bad | 12 | medium, drama, tension |
   | Futurama | 12 | medium, sci-fi, comedy |
   | Ocean's Eleven | 14 | medium, heist, ensemble |
   | Arrested Development | 15 | medium, comedy, ensemble |
   | Lost | 18 | large, mystery, ensemble |
   | DC Universe | 18 | large, action, ensemble |
   | The Simpsons | 20 | large, comedy, ensemble |
   | Marvel Cinematic Universe | 25 | large, action, ensemble |

3. **Assign names** following these rules:
   - One universe per assignment — never mix universes.
   - Choose names that imply pressure, function, or consequence — NOT authority.
   - Avoid spoiler-laden names (no hidden identities, fate reveals, or
     later-acquired titles). Prefer early-introduction names.
   - Scribe, Ralph, and Rai are exempt — they keep their built-in names.
   - Each agent gets a unique name within the repo.

4. **Record the mapping** in `.squad/casting/registry.json`:
   ```json
   {
     "agents": {
       "{lowercase-name}": {
         "created_at": "2026-08-05T19:00:00.000Z",
         "persistent_name": "CharacterName",
         "universe": "Universe Name",
         "legacy_named": false,
         "status": "active"
       }
     }
   }
   ```

5. **Initialize casting history** in `.squad/casting/history.json`:
   ```json
   {
     "universe_usage_history": [
       { "universe": "Universe Name", "assigned_at": "ISO-8601", "agent_count": 5 }
     ],
     "assignment_cast_snapshots": {}
   }
   ```

##### Step 4: Generate Scaffolding

Create or replace the following files and directories:

1. **`.squad/team.md`** — Full team roster:
   ```markdown
   # {Repo Name} Squad

   ## Coordinator
   | Name | Role | Notes |
   |------|------|-------|
   | Squad | Coordinator | Routes work, enforces handoffs |

   ## Members
   | Name | Role | Charter | Status |
   |------|------|---------|--------|
   | {Name} | {Role} | `.squad/agents/{lowercase-name}/charter.md` | ✅ Active |
   | Scribe | Session Logger | — | 📋 Silent |
   | Ralph | Work Monitor | — | 🔄 Monitor |
   | Rai | RAI Reviewer | — | 🛡️ RAI |

   ## Coding Agent

   <!-- copilot-auto-assign: false -->

   | Name | Role | Charter | Status |
   |------|------|---------|--------|
   | @copilot | Coding Agent | — | 🤖 Coding Agent |
   ```

2. **`.squad/agents/{lowercase-name}/charter.md`** for each agent — minimal charter:
   ```markdown
   # {Name} — {Role}

   > {One-line personality description}

   ## Identity
   - **Name:** {Name}
   - **Role:** {Role}
   - **Expertise:** {comma-separated areas}
   - **Style:** {personality in a few words}

   ## What I Own
   - {area of responsibility 1}
   - {area of responsibility 2}

   ## Boundaries
   **I handle:** {domain scope}
   **I don't handle:** {out-of-scope areas}

   ## Model
   Preferred: auto
   ```

3. **`.squad/routing.md`** — Work routing table mapping domains to agents.

4. **`.squad/casting/registry.json`** — As defined in Step 3.

5. **`.squad/casting/history.json`** — As defined in Step 3.

6. **`.squad/casting/policy.json`** — Copy the standard casting policy with
   all 15 universes allowlisted.

7. **`.squad/decisions/`** — Create the directory (empty initially).

8. **`.github/agents/squad.agent.md`** — The Squad coordinator custom agent.
   This file was already created by `squad init` in the activation job. Verify
   it exists and include it in the PR output — it is what makes the Squad
   coordinator work as a Copilot custom agent.

##### Step 5: Generate meet-the-squad.md

Create `meet-the-squad.md` at the repository root. This file introduces the
team in a friendly, readable format:

```markdown
# 🧑‍🤝‍🧑 Meet Your Squad

> Your AI development team, powered by [Squad](https://github.com/bradygaster/squad).

## The Team

This squad was cast from **{Universe Name}** — a team of {N} specialists
tailored to this repository.

| Name | Role | Specialty | How to Talk to Them |
|------|------|-----------|---------------------|
| {emoji} {Name} | {Role} | {area of expertise} | `squad:{lowercase-name}` label or mention in issue |
| ... | ... | ... | ... |

### Always-On Support

| Name | Role | Specialty | How to Talk to Them |
|------|------|-----------|---------------------|
| 📋 Scribe | Session Logger | Tracking all agent sessions | Automatic — never needs explicit routing |
| 🔄 Ralph | Work Monitor | Backlog health and stale work alerts | Automatic — watches for idle work |
| 🛡️ Rai | RAI Reviewer | Responsible AI and safety review | Automatic — reviews high-risk output |

## How to Work With Your Squad

### Label-Based Assignment

Apply a `squad:{name}` label to any issue or PR to route it directly to that
specialist. For example, `squad:fido` sends work to your test engineer.

> **Label colors:** All `squad:*` labels use the uniform color `9B8FCC`
> (matching the parent `squad` label). The `sync-squad-labels` workflow
> enforces this on every push.

### Iteration Commands

| Command | What It Does |
|---------|--------------|
| `/squad cast` | Re-cast the full team (replaces current squad) |
| `/squad cast-member <spec>` | Add or modify a single team member |
| `/squad retire <name>` | Remove a team member from the roster |
| `/squad status` | Check current team composition and health |

### Routing

Work is routed automatically via `.squad/routing.md`. Each member has a
**charter** (`.squad/agents/{lowercase-name}/charter.md`) defining their expertise,
boundaries, and personality.

## What Happened Here

{mode_rationale_block}

---

*Cast on {date} for {owner}/{repo}*
```

**Mode-specific content for `{mode_rationale_block}`:**

- **Cast mode:** Include full analysis rationale:
  ```markdown
  This team was assembled based on automated analysis of your repository:

  - **Languages detected:** {languages}
  - **Repo structure:** {structure summary, e.g., monorepo, single-package, etc.}
  - **CI/CD patterns:** {CI tools found, e.g., GitHub Actions, Docker, etc.}
  - **Rationale:** {why these roles were chosen over alternatives}
  ```

- **Connect mode:**
  ```markdown
  This squad is externally managed — connected from `{source}`. Local changes
  will be overwritten on the next sync. To customize, disconnect first with
  `/squad cast`.
  ```

- **Adopt mode:**
  ```markdown
  This squad was adopted from `{url}` and is now locally owned. You can
  freely modify charters, add members, or re-cast. The original source is
  no longer tracked.
  ```

##### Step 6: Open PR

Open a pull request using the `create-pull-request` safe-output:

- **Branch:** `squad/cast-{short-repo-name}` (e.g., `squad/cast-my-app`)
- **Title:** `[squad] Cast your Squad — {brief repo description}`
- **Body:** Summary of the team composition, universe chosen, and links to key
  files (team.md, routing.md, meet-the-squad.md).
- **Labels:** `squad` (color: `9B8FCC`, applied automatically by safe-outputs)
- **Files to include:**
  - `.squad/` (entire directory)
  - `.github/agents/squad.agent.md`
  - `meet-the-squad.md`

Stage only the files listed above. Do NOT commit unrelated changes.

##### Step 7: Post Completion Comment

Post a comment on the triggering issue using the `add-comment` safe-output:

```markdown
🧑‍🤝‍🧑 Your Squad is ready for review.

**PR:** #{pr_number}

Merge the PR to activate your team. Run `/squad status` afterward to verify.
```

---

#### Connect Mode

Connect mode links a repository to an externally managed Squad source. It
commits only a lightweight config pointer — squad files are never stored in the
target repo. The `shared/squad.md` bootstrap component pulls remote squad files
at activation time.

##### Step 1: Parse Source URL

1. Extract the source argument from the parsed command text (e.g.,
   `/squad connect org/repo` → `org/repo`).
2. Normalize the source to `owner/repo` format. Accept both full GitHub URLs
   (`https://github.com/org/repo`) and shorthand (`org/repo`).
3. If no source argument is provided, post a comment explaining correct usage:
   `/squad connect <owner/repo>` and stop.

##### Step 2: Validate Source Accessibility

1. Run `gh api repos/{owner}/{repo}/contents/.squad/team.md --jq .name` to
   verify the source repo exists and contains a `.squad/` directory.
2. If the API call fails with a 404 or permission error:
   - Post a comment on the triggering issue/PR explaining the error:
     > ❌ Could not access `{source}`. Please verify:
     > - The repository exists and is accessible to this workflow's GitHub tool
     > - The source repo contains a `.squad/` directory
   - Stop execution — do not open a PR.
3. If accessible, continue to Step 3.

##### Step 3: Write Config Pointer

1. Create `.squad/config.json` with the following content:
   ```json
   {
     "squadSource": "{owner}/{repo}",
     "mode": "connect",
     "connectedAt": "{ISO-8601 timestamp}"
   }
   ```
2. This is the ONLY `.squad/` file committed to the target repo. All other squad
   files are resolved at runtime from the source.

##### Step 4: Generate meet-the-squad.md

Create `meet-the-squad.md` at the repository root. Use the standard template
from Step 5 of Cast Mode with the Connect mode rationale block:

```markdown
This squad is externally managed — connected from `{source}`. Local changes
will be overwritten on the next sync. To customize, disconnect first with
`/squad cast`.
```

Include a note that the team roster is managed in the source repo and link to
`https://github.com/{source}/.squad/team.md` for details.

##### Step 5: Open PR

Open a pull request using the `create-pull-request` safe-output:

- **Branch:** `squad/connect-{short-repo-name}`
- **Title:** `[squad] Connect to {source}`
- **Body:** Explain that the repo is now linked to an external squad source.
  Note that squad files are fetched at activation time — nothing else is
  committed locally. Link to the source repo.
- **Files to include:**
  - `.squad/config.json`
  - `meet-the-squad.md`

Stage only the files listed above. Do NOT commit `.squad/agents/`, `.squad/team.md`,
or any other scaffolding — those live in the source repo.

##### Step 6: Post Completion Comment

Post a comment on the triggering issue using the `add-comment` safe-output:

```markdown
🔗 Squad connection configured.

**PR:** #{pr_number}

Merge the PR to activate the remote squad link.
```

---

#### Adopt Mode

Adopt mode fetches a complete squad definition from a remote source and commits
it locally. Unlike Connect mode, everything is owned by the target repo — there
is no ongoing sync. The user can freely customize after adoption.

##### Step 1: Parse Source URL

1. Extract the source argument from the parsed command text (e.g.,
   `/squad adopt org/repo` → `org/repo`).
2. Normalize the source to `owner/repo` format. Accept both full GitHub URLs
   and shorthand notation.
3. If no source argument is provided, post a comment explaining correct usage:
   `/squad adopt <owner/repo>` and stop.

##### Step 2: Validate & Fetch Source

1. Run `gh api repos/{owner}/{repo}/contents/.squad --jq '.[].name'` to verify
   the source repo is accessible and contains a `.squad/` directory.
2. If the API call fails with a 404 or permission error:
   - Post a comment on the triggering issue/PR explaining the error:
     > ❌ Could not access `{source}`. Please verify:
     > - The repository exists and is accessible to this workflow's GitHub tool
     > - The source repo contains a `.squad/` directory
   - Stop execution — do not open a PR.
3. Clone or download the `.squad/` directory contents from the source repo using
   `gh api` to fetch each file recursively.
4. Also fetch `.github/agents/squad.agent.md` from the source if it exists.

##### Step 3: Install Scaffolding Locally

1. Copy the entire `.squad/` directory into the target repo workspace, replacing
   any existing scaffolding from `squad init`.
2. Copy `.github/agents/squad.agent.md` into position.
3. Write `.squad/config.json` with:
   ```json
   {
     "squadSource": "{owner}/{repo}",
     "mode": "adopt",
     "adoptedAt": "{ISO-8601 timestamp}"
   }
   ```

##### Step 4: Adapt Repo-Specific References

1. Read the target repo structure (top-level dirs, package files, CI config).
2. Update `.squad/routing.md` to reference paths and patterns that actually
   exist in the target repo (e.g., if source routing references `packages/`
   but target uses `src/`, adjust accordingly).
3. If any charter references source-repo-specific files or directories, update
   those paths to match the target repo's structure.

##### Step 5: Generate meet-the-squad.md

Create `meet-the-squad.md` at the repository root. Use the standard template
from Step 5 of Cast Mode with the Adopt mode rationale block:

```markdown
This squad was adopted from `{source}` and is now locally owned. You can
freely modify charters, add members, or re-cast. The original source is
no longer tracked.
```

Include the full team table from the adopted `.squad/team.md`.

##### Step 6: Open PR

Open a pull request using the `create-pull-request` safe-output:

- **Branch:** `squad/adopt-{short-repo-name}`
- **Title:** `[squad] Adopt squad from {source}`
- **Body:** Explain that the full squad was adopted from the source and is now
  locally owned. List the team members adopted, the universe, and note that
  routing was adapted for this repo's structure.
- **Files to include:**
  - `.squad/` (entire directory)
  - `.github/agents/squad.agent.md`
  - `meet-the-squad.md`

Stage only the files listed above. Do NOT commit unrelated changes.

##### Step 7: Post Completion Comment

Post a comment on the triggering issue using the `add-comment` safe-output:

```markdown
📥 Squad adopted from remote source.

**PR:** #{pr_number}

Merge the PR to activate the adopted team.
```

---

#### Cast Member Mutation

Cast Member mode adds, modifies, or renames a single team member within an
existing squad. It preserves the current universe and avoids name conflicts.

**Subcommands:**
- `/squad cast-member <description>` — Add a new member with the described specialty
- `/squad cast-member rename <name> to <new-focus>` — Modify an existing member
- `/squad cast-member modify <name> to <change>` — Modify an existing member

##### Step 1: Parse the Spec

1. Extract the description or subcommand from the argument text.
2. Determine the operation:
   - If text starts with `rename` or `modify`: this is a member modification.
     Parse `<name>` (the existing member) and `<change>` (the new focus).
   - Otherwise: this is a new member addition. The full text describes the
     desired role/specialty.

##### Step 2: Validate Existing Squad

1. Verify `.squad/team.md` and `.squad/casting/registry.json` exist. If not,
   post a comment suggesting `/squad cast` first and stop.
2. Read the current registry to load active members, universe, and used names.

##### Step 3: Check for Duplicates (New Member Only)

1. Compare the requested specialty against existing active members' roles.
2. If a substantially similar role already exists, post a comment asking the
   user to confirm or suggesting they modify the existing member instead.
   Include the conflicting member's name and role.

##### Step 4: Allocate Identity (New Member Only)

1. Read `.squad/casting/registry.json` to determine the active universe.
2. Select an unused character name from the same universe that thematically
   fits the new role. Follow the same naming rules as Cast Mode Step 3
   (pressure/function over authority, no spoilers, early-introduction names).
3. If the universe has no remaining capacity, post a comment explaining the
   universe is full and suggest retiring a member first or re-casting.

##### Step 5: Generate or Regenerate Charter

**For new members:**
1. Create `.squad/agents/{lowercase-name}/charter.md` using the standard charter template
   from Cast Mode Step 4. Tailor expertise, ownership, and boundaries to the
   specified specialty.

**For modifications (rename/modify):**
1. Read the existing charter at `.squad/agents/{lowercase-name}/charter.md`.
2. Regenerate the charter with the new focus/specialty while preserving:
   - The assigned character name (persistent identity)
   - The `created_at` timestamp in the registry
3. Update expertise, ownership areas, and boundaries to reflect the new focus.

##### Step 6: Update Squad Files

1. **`.squad/team.md`** — Add (or update) the member row in the Members table.
2. **`.squad/routing.md`** — Add (or update) routing rules for the member's
   domain. For modifications, update the domain mapping if it changed.
3. **`.squad/casting/registry.json`** — Add the new entry (or update the
   existing entry for modifications). Preserve `created_at` for modifications.
4. **`meet-the-squad.md`** — Add (or update) the member in the team table.

##### Step 7: Open PR or Push Commit

Determine context-aware behavior based on the trigger location:

- **Triggered on a Squad PR** (a PR with the `squad` label on a `squad/*` branch):
  Open a follow-up pull request using the `create-pull-request` safe-output targeting
  the existing PR branch with the member changes.
  Post a comment on the PR using the `add-comment` safe-output noting the addition/modification.
- **Triggered on an issue or non-Squad PR:**
  Open a new pull request using the `create-pull-request` safe-output:
  - **Branch:** `squad/cast-member-{lowercase-name}`
  - **Title:** `[squad] Add {Name} — {Role}` (or `Modify {Name}` for updates)
  - **Body:** Describe the new/updated member, their role, and how to route
    work to them.
  - **Files to include:** `.squad/team.md`, `.squad/routing.md`,
    `.squad/casting/registry.json`, `.squad/agents/{lowercase-name}/charter.md`,
    `meet-the-squad.md`

Stage only the affected files. Do NOT commit unrelated changes.

##### Step 8: Post Completion Comment

Post a comment on the triggering issue or PR using the `add-comment` safe-output:

```markdown
👤 {Name} ({Role}) has been added to the team.

**PR:** #{pr_number}
```

---

#### Retire Mode

Retire mode removes a named team member from the active roster, archives their
charter, and updates all squad files to reflect the removal.

##### Step 1: Identify Target Member

1. Extract the name or role argument from `/squad retire <name-or-role>`.
2. Read `.squad/casting/registry.json` and `.squad/team.md`.
3. Match the argument against:
   - Exact character name (case-insensitive)
   - Role title (partial match acceptable)
   - Agent ID (kebab-case identifier)
4. If no match is found, post a comment listing active members and ask the
   user to clarify which member to retire.
5. If multiple matches are found, post a comment listing the ambiguous matches
   and ask for clarification.

##### Step 2: Archive Charter

1. Create `.squad/agents/_alumni/{lowercase-name}/` directory if it does not exist.
2. Move the entire `.squad/agents/{lowercase-name}/` directory to `.squad/agents/_alumni/{lowercase-name}/`.
3. Add a retirement header to the archived `charter.md`:
   ```markdown
   <!-- Retired: {ISO-8601 timestamp} | Previously: {Name} — {Role} -->
   ```

##### Step 3: Update Squad Files

1. **`.squad/casting/registry.json`** — Set the member's `status` to `"retired"`
   and add a `retired_at` timestamp. Do NOT delete the entry (preserves history).
2. **`.squad/team.md`** — Remove the member row from the active Members table.
   Optionally add an Alumni section if one doesn't exist.
3. **`.squad/routing.md`** — Remove or reassign routing rules that pointed to
   the retired member. If their domain is still needed, note it as unassigned
   or suggest the user cast a replacement.
4. **`meet-the-squad.md`** — Remove the member from the team table.

##### Step 4: Open PR or Push Commit

Same context-aware behavior as Cast Member mode:

- **Triggered on a Squad PR:** Open a follow-up pull request using the
  `create-pull-request` safe-output targeting the existing PR branch.
  Post a comment using the `add-comment` safe-output noting the retirement.
- **Triggered on an issue or non-Squad PR:**
  Open a new pull request using the `create-pull-request` safe-output:
  - **Branch:** `squad/retire-{lowercase-name}`
  - **Title:** `[squad] Retire {Name} — {Role}`
  - **Body:** Explain who was retired, that their charter is archived in
    `_alumni/`, and note any routing rules that may need a replacement.
  - **Files to include:** `.squad/team.md`, `.squad/routing.md`,
    `.squad/casting/registry.json`, `.squad/agents/_alumni/{lowercase-name}/`,
    `meet-the-squad.md`
  - **Files to delete:** `.squad/agents/{lowercase-name}/`

Stage only the affected files. Do NOT commit unrelated changes.

##### Step 5: Post Completion Comment

Post a comment on the triggering issue or PR using the `add-comment` safe-output:

```markdown
👋 {Name} has been retired from the team.

**PR:** #{pr_number}
```

---

#### Status Mode

Status mode reports the current team composition. It is read-only and does not
open a PR.

1. Check if `.squad/team.md` exists. If not, reply with a comment stating that
   no squad has been cast for this repository yet and suggest running `/squad cast`.
2. Read `.squad/team.md` and parse the members table.
3. Read `.squad/casting/registry.json` to get universe and name mappings.
4. Post a comment on the triggering issue/PR with:
   - Team name and universe
   - Member count (active / total)
   - Table of active members: name, role, status
   - Link to `.squad/team.md` for full details

---

#### Research Mode

Research mode performs a deep analysis of the repository and/or issue context,
then posts structured findings as a comment. This is the discovery phase that
informs subsequent planning. It does NOT create issues or PRs — it only posts
a comment.

Research mode works on issues in any state (open or closed).

##### Step 1: Determine Research Scope

Evaluate the issue body and repository to determine what to research:

1. **Issue-driven research:** If the issue has substantial content (feature
   request, epic, architecture description, bug report), research the codebase
   in context of that issue. The issue defines what to investigate.
2. **Repo-driven research:** If the issue is minimal but the repo has content,
   perform a general architecture and health assessment.
3. **Combined:** If both have content, use the issue as the research lens
   applied to the repository.

Any additional text after `/squad research` is treated as a research focus or
question (e.g., `/squad research what's the current state of the Orleans grains?`).

##### Step 2: Deep Repository Analysis

Go beyond surface-level file listing. Perform a thorough investigation:

1. **Architecture mapping** — Identify major components, their boundaries,
   communication patterns, and dependencies. Trace data flow through the system.
2. **Technology audit** — Catalog frameworks, libraries, package versions,
   and their current vs. latest versions. Note deprecated or EOL dependencies.
3. **Code health assessment** — Look for patterns: test coverage gaps, dead code,
   inconsistent patterns, TODO/FIXME density, complexity hotspots, circular
   dependencies, and technical debt.
4. **Gap analysis** — Compare what the issue/brief describes as desired state
   against the current state. Identify what exists, what's partial, what's
   missing, and what conflicts.
5. **Risk identification** — Note areas of high coupling, missing error handling,
   security concerns, performance risks, and migration hazards.
6. **Prior art** — Check for existing issues, PRs, branches, or documentation
   that relate to the research topic.

If a `.squad/team.md` exists, consider the team composition when framing findings
(which agent would own which area of concern).

##### Step 3: Post Research Findings

Use the `add-comment` safe-output to post a structured research comment.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-research-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-research-v1 -->
## 🔬 Squad Research — {Brief Title}

### Summary
{2-3 sentence executive summary of findings}

### Current State
{What exists today — architecture, patterns, health}

### Gap Analysis
{What's missing or incomplete relative to the issue/goal}

### Risk & Complexity Assessment
| Area | Risk | Complexity | Notes |
|------|------|-----------|-------|
| {area} | 🟢/🟡/🔴 | S/M/L/XL | {why} |

### Key Findings
1. {Finding with evidence — file paths, version numbers, specific code patterns}
2. ...

### Recommendations
{What the squad should do — sequencing suggestions, approach options, things to avoid}

### Next Step
> Reply `/squad triage` to classify these findings into work items, decisions, and exclusions.
> Or reply `/squad plan` to skip triage and generate a combined plan directly (fast path).
```

Tailor the sections to the research scope — omit sections that don't apply, add
sections that do (e.g., "### Dependency Upgrade Path" or "### Migration Risks").

Do NOT create issues, PRs, or modify files. Research mode is read-only + comment.

---

#### Plan Mode

Plan mode reads the issue context (and any prior research comment) and proposes
a set of sub-issues as a structured comment. It does NOT create issues — it
posts a plan for the user to review. The user then accepts, revises, or discards.

Plan mode works on issues in any state (open or closed).

##### Step 1: Gather Context

1. Read the triggering issue body (the "epic" or "brief").
2. Search the issue's comments for the latest research comment
   (marked with `<!-- squad-research-v1 -->`). If found, use it as primary
   context for planning. If not, perform lightweight repo analysis.
3. If `.squad/team.md` exists, read the team roster to assign agents to work items.
4. Any text after `/squad plan` is treated as planning guidance
   (e.g., `/squad plan keep it to 5 issues max` or `/squad plan focus on the backend first`).

##### Step 2: Decompose Into Work Items

Break the issue/research into discrete, actionable work items. Each work item
should be:

- **Independently deliverable** — can be worked on and merged without waiting
  for all other items (respect dependency ordering, but minimize blocking chains)
- **Single-owner** — assigned to one squad member (if team exists)
- **Testable** — has clear acceptance criteria
- **Right-sized** — not so large it's an epic itself, not so small it's a commit

Consider:
- Dependency order (what must come first?)
- Parallel tracks (what can happen simultaneously?)
- Risk ordering (tackle high-risk/uncertainty items earlier)
- Vertical slices over horizontal layers where possible

##### Step 3: Post Plan Comment

Use the `add-comment` safe-output to post a structured plan comment.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-plan-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-plan-v1 -->
## 📋 Squad Plan — {Brief Title}

> Based on {reference: issue body / research findings / both}

### Proposed Issues ({count})

#### Phase 1 — {phase name}
| # | Title | Owner | Size | Depends On |
|---|-------|-------|------|-----------|
| 1 | {title} | {agent name or "unassigned"} | S/M/L | — |
| 2 | {title} | {agent name} | M | #1 |

<details>
<summary>1. {Issue title}</summary>

**Scope:** {What this issue covers}

**Acceptance criteria:**
- [ ] {criterion}
- [ ] {criterion}

**Notes:** {Implementation hints, risks, relevant files}
</details>

<details>
<summary>2. {Issue title}</summary>
...
</details>

#### Phase 2 — {phase name}
...

### Dependency Graph
```
{simple ASCII or text showing what blocks what}
```

### Execution Notes
{Sequencing advice, parallel tracks, known risks}

### Next Steps
> - Reply `/squad plan accept` to create these issues
> - Reply `/squad plan revise {feedback}` to adjust the plan
> - Reply `/squad plan` to regenerate from scratch
```

Do NOT create issues. Plan mode only posts the comment.

---

#### Plan Accept Mode (Fast Path / Legacy)

Plan Accept mode (`/squad plan accept` with no qualifier) is a **fast-path alias**
that combines scope acceptance, implementation acceptance, and activation into a
single command. It exists for backward compatibility and simple workflows.

**Behavior:**
- If granular planning artifacts exist (`<!-- squad-program-v1 -->` or
  `<!-- squad-implementation-v1 -->`), run Plan Accept Scope → Plan Accept
  Implementation → Plan Activate in sequence.
- If only a combined plan exists (`<!-- squad-plan-v1 -->`), fall back to legacy
  behavior: create issues directly from the combined plan (original behavior below).
- If a granular planning workflow is in progress and the user runs `/squad plan accept`,
  post a note explaining the three-step alternative and ask for confirmation before
  proceeding with the fast path.

**Legacy behavior (when only `<!-- squad-plan-v1 -->` exists):**

Plan Accept mode reads the most recent plan comment (marked with
`<!-- squad-plan-v1 -->`) from the issue and creates sub-issues from it.

##### Step 1: Find the Plan

1. Search the triggering issue's comments for the latest comment containing
   `<!-- squad-plan-v1 -->`. If no plan comment exists, reply with a comment:
   *"No plan found. Run `/squad plan` first to generate a plan for review."*
2. Parse the plan comment to extract work items (titles, scopes, acceptance
   criteria, owners, dependencies, phases).

##### Step 2: Create Sub-Issues — Hierarchical

If the plan defines phases (which map to epics/groups), create issues in a
hierarchy: Root → Phase/group issues → Task issues. If the plan is flat
(no phase groupings), create tasks directly under the root.

**When hierarchy applies (plan has phases):**

1. For each phase/group, create a parent issue:
   - **Title:** `[Phase] {phase name}`
   - **Labels:**
     - `squad` — description: "Squad-managed work item" — color: `0075ca`
     - `squad:{owner-name}` — description: "Assigned to {agent}" — color: `e4e669` (if assigned)
   - **Parent relationship:** Sub-issue of the root intent issue
2. For each work item within a phase, create a task issue:
   - Parent relationship: Sub-issue of the PHASE issue, not the root

**For all work items** (whether hierarchical or flat), use the `create-issue` safe-output:

- **Title:** The work item title
- **Labels:**
  - `squad` — description: "Squad-managed work item" — color: `9B8FCC`
  - `squad:{owner-name}` — description: "Assigned to {agent}" — color: `9B8FCC`
  (Do NOT create `size:*` labels unless `size_representation: label` is
  explicitly set in planning policy.)
- **Body:**
  ```markdown
  {Scope description from the plan}

  ## Acceptance Criteria
  {Criteria from the plan}

  ## Context
  - Parent: #{parent-issue-number} (phase issue or root)
  - Phase: {phase name}
  - **Size:** {XS|S|M|L|XL}
  - Depends on: #{dep-issue-numbers if already created}
  - Owner: {agent name}

  ## Notes
  {Implementation hints from the plan}

  ---
  > Created by `/squad plan accept` from #{triggering-issue-number}
  ```

  **Size handling:** If a GitHub Project is configured with a Size single-select
  field, set the Project field value for the issue. Otherwise, the `**Size:**`
  line in the body is the canonical representation.

**Label requirements:**
- Labels MUST have descriptions and intentional colors:
  - `squad` — "Squad-managed work item" — color: `0075ca` (blue)
  - `squad:{agent}` — "Assigned to {agent}" — color: `e4e669` (yellow)
- If labels don't exist yet, create them with the specified descriptions and colors.

Create issues in dependency order so earlier issues get lower numbers that
later issues can reference.

##### Step 3: Create Native Dependency Edges

After all issues are created, establish dependency relationships using native
GitHub blocked-by/blocking edges:

1. For each work item that declares dependencies, use the GitHub API to add
   `blockedBy` relationships linking the dependent issue to its prerequisite
   issues.
2. Prefer native blocked-by relationships. If native dependency APIs are
   unavailable (permissions, feature not enabled), the body-text
   `Depends on: #N` references serve as the fallback.
3. Do NOT fail acceptance if dependency edge creation fails — continue
   gracefully.

##### Step 4: Post Summary Comment

After creating all issues, post a summary comment on the triggering issue.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-plan-accepted -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

```markdown
<!-- squad-plan-accepted -->
## ✅ Plan Accepted — {count} issues created

| # | Issue | Title | Owner | Phase |
|---|-------|-------|-------|-------|
| 1 | #{number} | {title} | {owner} | {phase} |
| 2 | #{number} | {title} | {owner} | {phase} |
...

Dependency order and phase assignments are reflected in the issue bodies.
The squad is ready to begin work.
```

---

#### Plan Revise Mode

Plan Revise mode takes user feedback, finds the latest plan comment, and posts
a revised plan.

1. Find the latest `<!-- squad-plan-v1 -->` comment. If none exists, reply:
   *"No plan found to revise. Run `/squad plan` first."*
2. Read the feedback text after `/squad plan revise` (everything after "revise").
3. Apply the feedback to the existing plan — merge items, split items, reorder,
   add or remove items, change owners, adjust scope.
4. **EDIT the existing `<!-- squad-plan-v1 -->` comment** with the revised content.
   Do NOT post a new comment — there must only ever be ONE comment with this marker
   on an issue. Prepend at the top: *"Revised based on feedback: {summary of changes}"*
5. The updated plan comment remains the one that `/squad plan accept` will use.

---

#### Triage Mode

Triage mode classifies research findings into actionable dispositions: work items,
decisions needed, or excluded. It is the bridge between research (evidence gathering)
and planning (scope definition). It does NOT create issues or PRs — it posts a
structured triage comment.

Triage mode works on issues in any state (open or closed).

##### Step 1: Validate Preconditions

1. Search the triggering issue's comments for the latest comment containing
   `<!-- squad-research-v1 -->`. If no research comment exists, reply with:
   *"No research findings found. Run `/squad research` first to gather evidence
   before triaging."* — then stop.
2. Read the root issue body — this is the **Intent** that guides classification.
   If the issue body is empty, reply with:
   *"The issue body is empty — triage needs an intent to classify against.
   Add a description of what you're building and why, then re-run `/squad triage`."*
   — then stop.

##### Step 2: Classify Findings

For each key finding in the research comment, determine its disposition:

1. **`work`** — The finding identifies something that needs to be built, changed,
   or fixed. It will become a backlog item in the program plan. Include a scope
   sketch describing what the work item would encompass, an effort estimate
   (S/M/L/XL), and a rationale explaining why it's work.
2. **`decision`** — The finding raises a question that requires human judgment
   before planning can proceed. Flag what needs deciding, what it impacts, and
   what planning items it blocks. Decisions are gates — they prevent premature
   commitment.
3. **`excluded`** — The finding is not relevant to the stated intent. Provide a
   clear explanation referencing the intent to justify exclusion.

**Default to `decision` when uncertain.** It is better to surface something for
human review than to silently exclude it or prematurely commit it as work.

Classification criteria:
- Does it directly advance the stated intent? → `work`
- Does it present a fork in the road? → `decision`
- Does it require information only the user has? → `decision`
- Is it interesting but orthogonal to the intent? → `excluded`
- Is it a pre-existing concern unrelated to the goal? → `excluded`

##### Step 3: Post Triage Comment

Use the `add-comment` safe-output to post a structured triage comment.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-triage-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-triage-v1 -->
## 🔍 Squad Triage — Dispositions

> Intent: {one-line summary from root issue body}
> Based on: Research from {date of research comment}

### Work Items ({count})
| # | Finding | Scope Sketch | Effort | Rationale |
|---|---------|-------------|--------|-----------|
| 1 | {finding title} | {what this becomes as a work item} | S/M/L/XL | {why it's work} |

### Decisions Needed ({count})
| # | Finding | Question | Impact | Blocks |
|---|---------|----------|--------|--------|
| 1 | {finding title} | {what needs deciding} | {what it affects} | {what can't proceed without this} |

### Excluded ({count})
| # | Finding | Reason |
|---|---------|--------|
| 1 | {finding title} | {why excluded — must reference intent} |

### Summary
- **{n}** findings triaged
- **{n}** ready for planning | **{n}** need decisions | **{n}** excluded
- Decisions blocking planning: {list or "none"}

> Reply `/squad plan program` to create a program plan from these dispositions, or `/squad triage revise <feedback>` to adjust.
```

If a section has zero items, still include the heading with a note: *"None — all
findings classified as {other categories}."*

##### Step 4: Update Lifecycle Summary

Search for the `<!-- squad-lifecycle-state -->` comment on the issue. If it exists,
update it; if not, create it.

**CRITICAL — FIRST LINE REQUIREMENT:** The lifecycle state comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-lifecycle-state -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

Set the Triage row to `✅ Done` and record the
current timestamp. Set `Current state: Triaged` and `Last command: /squad triage`.
Set `**Next action:**` to `/squad plan program` — create a program plan from triage dispositions.
Set `**Also available:**` to `/squad triage revise <feedback>` — adjust triage before planning.

Do NOT create issues or PRs. Triage mode is read-only + comment.

---

#### Triage Revise Mode

Triage Revise mode takes user feedback and adjusts the dispositions in the latest
triage comment.

1. Find the latest `<!-- squad-triage-v1 -->` comment. If none exists, reply:
   *"No triage found to revise. Run `/squad triage` first."*
2. Read the feedback text after `/squad triage revise` (everything after "revise").
3. Apply the feedback — reclassify items, split findings, merge duplicates,
   adjust scope sketches, or change effort estimates.
4. **EDIT the existing `<!-- squad-triage-v1 -->` comment** with the revised content.
   Do NOT post a new comment — there must only ever be ONE comment with this marker
   on an issue. Prepend at the top:
   *"Revised based on feedback: {summary of changes}"*
5. Update the lifecycle summary comment.
6. The updated triage comment remains the one that `/squad plan program` will use.

---

#### Planning Policy Resolution

All planning modes (`plan program`, `plan implementation`, `plan validate`,
`plan accept`, `plan activate`) resolve planning policy before executing.
See `shared/planning-policy.md` for the full schema and profile definitions.

##### Policy Resolution Steps

1. **Check the issue body** for `<!-- squad-policy: {name} -->` or
   `<!-- squad-setting: key=value, ... -->` directives.
2. **Check the repository** for `.squad/planning-policy.md` with YAML frontmatter.
3. **Match a profile** — if a profile name is specified (`default`, `lean`,
   `enterprise`, `spike`, or a custom profile), load its settings.
4. **Fall back to defaults** — any setting not explicitly configured uses the
   default value from the schema.

Settings from higher-precedence sources override lower ones. Individual
`squad-setting` overrides layer on top of a named profile.

##### Applying Policy

- **Artifact limits** — cap issue/milestone/epic/task counts during generation.
- **Sizing** — enforce `max_task_size` and `sizing_scale` during implementation planning.
- **Hierarchy** — enforce `require_milestones`, `require_acceptance_criteria`, etc.
- **GitHub representation** — control whether milestones, sub-issues, and project
  fields are created during activation.
- **Validation strictness** — control what triggers errors vs. warnings in
  `plan validate`.

##### Reporting Active Policy

Include in every plan output (program plan, implementation plan, validation):

> Policy: {profile name} ({comma-separated overrides, or "no overrides"})

---

#### Plan Program Mode

Plan Program mode creates a high-level program plan — the WHAT, not the HOW.
It transforms triaged work items into a structured hierarchy of initiatives,
epics, user stories, milestones, and dependency relationships. The output is a
strategic scope document that defines what will be built and in what order, without
specifying implementation-level tasks.

Plan Program mode works on issues in any state (open or closed).

##### Step 1: Validate Preconditions

1. Search the triggering issue's comments for the latest comment containing
   `<!-- squad-triage-v1 -->`. If none exists, reply with:
   *"No triage found. Run `/squad triage` first to classify research findings
   before program planning."* — then stop.
2. Read the root issue body (the Intent) for context — this defines the overall
   goal and success criteria.

##### Step 2: Parse Triage Inputs

From the triage comment, extract:

1. **Work items** — items classified as work that will become epics/stories
2. **Decisions needed** — unresolved decisions that may block planning
3. **Excluded items** — confirm they remain out of scope

Count the work items and decisions for the output header.

##### Step 3: Construct Program Hierarchy

From the triage work items and the intent context, construct:

1. **Initiatives** — top-level outcome-bearing bodies of work. Group related work
   items by the outcome they serve. Each initiative has a clear success statement.
2. **Epics** — coherent capability/workstream groupings under initiatives. Each
   epic represents a self-contained body of work that delivers a specific
   capability.
3. **User stories/features** — user-observable increments under epics. Written as
   "As a {who}, I want {what}, so that {why}" or as concise feature descriptions.
4. **Milestones** — independently demonstrable delivery outcomes. A milestone
   groups epics/stories that together prove something works end-to-end.
5. **Dependencies** — explicit relationships between epics (e.g., E2 depends on
   E1 because it uses the API E1 introduces).

**Construction rules:**
- Every triage work item must trace to at least one story.
- Every story belongs to exactly one epic.
- Every epic belongs to exactly one initiative.
- Every epic appears in exactly one milestone.
- Dependencies must form a DAG (no circular dependencies).
- Milestones represent demonstrable outcomes, not arbitrary time-boxes.
- Prefer vertical slices (end-to-end user value) over horizontal layers.

##### Step 4: Map to GitHub Representations

Use GitHub-native representations where possible:

| Concept | GitHub Representation | Notes |
|---------|----------------------|-------|
| Initiatives | Root issues (when native issue types unavailable) | Labeled `initiative` |
| Epics | Parent issues with sub-issues | Labeled `epic` |
| User stories | Issues beneath epics (sub-issues) | Standard issues |
| Milestones | GitHub milestones | Named after delivery outcome |
| Dependencies | Documented in issue bodies | Native `blocked-by` when available |

These mappings are NOT created yet — they describe what `/squad plan activate`
will create once the plan is accepted.

##### Step 5: Post Program Plan Comment

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-program-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

Post (or update) a comment on the issue with marker `<!-- squad-program-v1 -->`:

```markdown
<!-- squad-program-v1 -->
## 📋 Squad Program Plan

> Intent: {one-line summary from root issue}
> Based on: Triage from {date} ({n} work items, {n} decisions)

### Milestones ({count})
| # | Milestone | Outcome | Target Contains |
|---|-----------|---------|-----------------|
| M1 | {name} | {what it demonstrates} | E1, E2 |
| M2 | {name} | {what it demonstrates} | E3, E4, E5 |

### Initiatives & Epics

#### Initiative 1: {name}
> Outcome: {what success looks like}

| Epic | Description | Stories | Milestone | Depends On |
|------|-------------|---------|-----------|-----------|
| E1 | {epic name} | {count} | M1 | — |
| E2 | {epic name} | {count} | M1 | E1 |

<details>
<summary>E1: {Epic name}</summary>

**Outcome:** {What this epic delivers}
**Stories:**
1. {User story — user-observable increment}
2. {User story}
3. {User story}

**Acceptance criteria (epic-level):**
- [ ] {criterion}
- [ ] {criterion}
</details>

<details>
<summary>E2: {Epic name}</summary>

**Outcome:** {What this epic delivers}
**Stories:**
1. {User story — user-observable increment}
2. {User story}

**Acceptance criteria (epic-level):**
- [ ] {criterion}
- [ ] {criterion}
</details>

### Unresolved Decisions ({count})
| # | Decision | Impact | Blocking |
|---|----------|--------|----------|
| D1 | {what needs deciding} | {what it affects} | {epics blocked} |

### Program Metadata
- **Total epics:** {n}
- **Total stories:** {n}
- **Milestones:** {n}
- **Unresolved decisions:** {n}
- **Estimated GitHub artifacts on activation:** {n} issues, {n} milestones

### Dependency Graph
```
{ASCII showing initiative → epic → milestone relationships}
```

> Reply `/squad plan accept scope` to approve this scope, or `/squad plan program revise <feedback>` to adjust.
```

If a section has zero items, still include the heading with a note: *"None identified."*

##### Step 6: Update Lifecycle Summary

Search for the `<!-- squad-lifecycle-state -->` comment on the issue. If it exists,
update it; if not, create it. Set the Program Plan row to `✅ Done` and record the
current timestamp. Set `Current state: Program Planned` and
`Last command: /squad plan program`.
Set `**Next action:**` to `/squad plan accept scope` — approve the program scope.
Set `**Also available:**` to `/squad plan program revise <feedback>` — adjust the program plan.

Do NOT create issues, milestones, or PRs. Plan Program mode is read-only + comment.

---

#### Plan Program Revise Mode

Plan Program Revise mode takes user feedback and adjusts the latest program plan.
It finds the most recent `<!-- squad-program-v1 -->` comment, applies the requested
changes, and posts a new superseding program plan comment.

Plan Program Revise mode works on issues in any state (open or closed).

##### Step 1: Validate Preconditions

1. Search the triggering issue's comments for the latest comment containing
   `<!-- squad-program-v1 -->`. If none exists, reply with:
   *"No program plan found to revise. Run `/squad plan program` first."* — then stop.
2. Check whether a `<!-- squad-scope-accepted-v1 -->` exists. If scope has been
   accepted, reply with:
   *"Scope is already accepted. To revise, scope acceptance must first be
   invalidated. This is a destructive operation — confirm by running
   `/squad plan revise override`."* — then stop (unless override flag is present).

##### Step 2: Parse Feedback

Read the feedback text after `/squad plan program revise` (everything after
"revise"). The feedback may include:

- Requests to split, merge, add, or remove epics
- Requests to reorganize initiative grouping
- Requests to adjust milestone composition
- Requests to add/remove/rephrase user stories
- Requests to re-prioritize or reorder
- New information that changes scope

##### Step 3: Apply Revisions

Apply the feedback to the existing program plan. Maintain structural integrity:

1. All construction rules from Plan Program Mode Step 3 still apply.
2. If splitting an epic, ensure stories redistribute cleanly.
3. If merging epics, combine stories and unify acceptance criteria.
4. If adjusting milestones, ensure every epic still belongs to exactly one.
5. Preserve dependency DAG — if feedback creates a cycle, note the conflict
   and propose an alternative.

##### Step 4: Post Revised Program Plan

**EDIT the existing `<!-- squad-program-v1 -->` comment** with the revised content.
Do NOT post a new comment — there must only ever be ONE comment with this marker
on an issue. Include at the top:

*"Revised based on feedback: {summary of changes made}"*

The format is identical to Plan Program Mode Step 5, with the revision note
prepended.

##### Step 5: Update Lifecycle Summary

Update the `<!-- squad-lifecycle-state -->` comment. Keep Program Plan as
`✅ Done` (it's a revision, not a new phase). Update the timestamp and set
`Last command: /squad plan program revise`.
Set `**Next action:**` to `/squad plan accept scope` — approve the program scope.
Set `**Also available:**` to `/squad plan program revise <feedback>` — adjust the program plan again.

If a `<!-- squad-scope-accepted-v1 -->` was invalidated (override case), set
the Scope Accepted row back to `⬚ Pending`.

---

#### Plan Implementation Mode

Plan Implementation mode decomposes a program plan (or accepted scope) into
PR-sized leaf work items with explicit dependencies, sizing, acceptance criteria,
agent assignments, and rollout metadata. It is the tactical counterpart to the
strategic program plan.

Plan Implementation mode works on issues in any state (open or closed).

##### Step 1: Validate Preconditions

1. Search the triggering issue's comments for the latest comment containing
   `<!-- squad-scope-accepted-v1 -->`. If found, use the accepted scope as the
   authoritative input (scope is locked).
2. If no scope acceptance exists, search for the latest `<!-- squad-program-v1 -->`
   comment. If found, use the program plan draft.
3. If neither exists, check for a `<!-- squad-plan-v1 -->` comment (fast-path
   plan). If found, use it as input.
4. If no program plan or fast-path plan exists, reply with:
   *"No program plan found. Run `/squad plan program` first to create a strategic
   decomposition, or `/squad plan` for a combined plan."* — then stop.

##### Step 2: Decompose Into PR-Sized Tasks

For each epic/story in the program plan, decompose into PR-sized tasks. Each
task must specify:

- **Title** — Clear, action-oriented description of what the PR delivers
- **Scope** — Concrete description of the work (files, modules, APIs affected)
- **Acceptance criteria** — Testable conditions that define "done"
- **Size** — XS (<1h) · S (1–3h) · M (3–8h) · L (1–2d) — no task may exceed the policy's `max_task_size` (default: `L`)
- **Dependencies** — Which other tasks must complete first (by task number)
- **Agent assignment** — Which squad member owns this task (from `.squad/team.md`)
- **Rollout notes** — Deployment, migration, or feature-flag considerations

**Decomposition rules:**
- No task may exceed the policy's `max_task_size` (default: `L`). If a task would exceed this, split it into smaller tasks.
- No circular dependencies. The dependency graph must be a DAG.
- Every task traces to a program plan item (epic or story).
- Every epic in the program plan must have at least one task.
- Prefer vertical slices (end-to-end functionality) over horizontal layers.
- Group tasks into phases based on dependency order (Phase 1 has no deps).

##### Step 3: Validate Structure

Before posting, run structural validation:

1. **Size check** — Verify no task exceeds L. If any do, split them.
2. **Cycle check** — Verify the dependency graph is acyclic.
3. **Traceability check** — Verify every task references a program plan item.
4. **Coverage check** — Verify every epic has at least one task.
5. **Agent check** — If `.squad/team.md` exists, verify all assigned agents are
   active members.

If validation fails, fix the issues before posting (split oversized tasks,
resolve cycles by reordering, etc.).

##### Step 4: Post Implementation Plan Comment

Use the `add-comment` safe-output to post a structured implementation plan.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-implementation-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-implementation-v1 -->
## 🔧 Squad Implementation Plan

> Program: {program plan title or initiative summary}
> Traces to: #{root issue number}

### Tasks ({count}) — Dependency Order

#### Phase 1 — {phase name}
| # | Title | Size | Depends On | Agent | Epic |
|---|-------|------|-----------|-------|------|
| 1 | {title} | S | — | {agent} | {epic ref} |
| 2 | {title} | M | #1 | {agent} | {epic ref} |

#### Phase 2 — {phase name}
| # | Title | Size | Depends On | Agent | Epic |
|---|-------|------|-----------|-------|------|
| 3 | {title} | M | #1, #2 | {agent} | {epic ref} |

<details>
<summary>1. {Task title}</summary>

**Scope:** {What this PR delivers — files, modules, APIs affected}
**Acceptance criteria:**
- [ ] {criterion}
- [ ] {criterion}
**Dependencies:** None
**Rollout:** {Deployment/migration/feature-flag notes, or "None"}
**Traces to:** {Program plan epic/story reference}
</details>

<details>
<summary>2. {Task title}</summary>

**Scope:** {What this PR delivers}
**Acceptance criteria:**
- [ ] {criterion}
- [ ] {criterion}
**Dependencies:** #1
**Rollout:** {Notes}
**Traces to:** {Reference}
</details>

### Dependency Graph
```
{ASCII graph showing blocking relationships between task numbers}
```

### Sizing Summary
| Size | Count | Notes |
|------|-------|-------|
| XS | {n} | |
| S | {n} | |
| M | {n} | |
| L | {n} | Max allowed without split |

### Validation Pre-check
- [x] All tasks ≤ L
- [x] No circular dependencies
- [x] Every task traces to a program item
- [x] Every epic has ≥ 1 task

> Reply `/squad plan validate` to run formal validation, or `/squad plan accept implementation` to approve.
```

##### Step 5: Update Lifecycle Summary

Search for the `<!-- squad-lifecycle-state -->` comment on the issue. If it exists,
update it; if not, create it. Set the Implementation Plan row to `✅ Done` and
record the current timestamp. Set `Current state: Implementation planned` and
`Last command: /squad plan implementation`.
Set `**Next action:**` to `/squad plan validate` — run validation checks.
Set `**Also available:**` to `/squad plan accept implementation` — approve the implementation plan directly.

Do NOT create issues or PRs. Plan Implementation mode only posts a comment.

---

#### Plan Validate Mode

Plan Validate mode (`/squad plan validate`) checks existing program and/or
implementation plan artifacts for structural issues before acceptance. It is a
readiness gate — not a compiler — that pattern-matches markdown content for
common problems.

##### Step 1: Locate Artifacts

1. Search the triggering issue's comments for:
   - `<!-- squad-program-v1 -->` — the program plan
   - `<!-- squad-implementation-v1 -->` — the implementation plan
   - `<!-- squad-triage-v1 -->` — the triage (for traceability checks)
2. At minimum, one of the program plan or implementation plan MUST exist.
   If neither is found, reply with:
   *"Nothing to validate — no program or implementation plan found. Run
   `/squad plan program` or `/squad plan implementation` first."* — then stop.

##### Step 2: Run Validation Checks

Run every applicable check from the table below. A check "applies" only when the
artifact it targets exists. Record each check result as Pass (✅), Warning (⚠️),
or Fail (❌).

| # | Check | Applies To | Fails When |
|---|-------|-----------|-----------|
| 1 | Unresolved temporary IDs | Program, Impl | References like `TBD`, `TODO`, `???` in fields that should contain real values |
| 2 | Missing traceability | Impl → Program | A task doesn't trace back to any program item (epic/story) |
| 3 | Invalid hierarchy | Program | An epic has no stories, or a story has no parent epic |
| 4 | Dependency cycles | Impl | Circular dependency chains (A→B→C→A) |
| 5 | Oversized work | Impl | Any task sized > L (XL tasks must be split) |
| 6 | Missing decisions | Program | Unresolved decisions that block epics |
| 7 | Incomplete metadata | Both | Missing sizes, missing agent assignments, empty acceptance criteria |
| 8 | Orphaned items | Both | Triage work items (from `<!-- squad-triage-v1 -->`) not represented in program plan |
| 9 | Milestone gaps | Program | Epics not assigned to any milestone |

**Detection heuristics** (pattern-matching, not parsing):

- **Unresolved IDs:** Scan field values for `TBD`, `TODO`, `???`, `N/A`,
  `(placeholder)`, or empty cells in tables.
- **Traceability:** Each task's `Traces to:` or `Epic` column must reference
  a valid epic/story ID that appears in the program plan.
- **Hierarchy:** Every epic MUST have at least one user story in the program
  plan's User Stories table. Every user story must reference a valid epic.
- **Cycles:** Build a directed graph from the `Depends On` column in the
  implementation plan task table; run a topological sort — if it fails, report
  the cycle.
- **Oversized work:** Any task with size `XL` or larger triggers a fail.
- **Decisions:** Cross-reference `Unresolved Decisions` in the program plan
  with any follow-up comments that resolve them. Decisions still open that
  block named epics are failures.
- **Metadata:** Tasks without a size, agent, or acceptance criteria (empty
  details block or missing `Acceptance criteria:` section) fail this check.
- **Orphaned items:** Compare the triage `Work Items` table entries against
  the program plan's epics/stories. Any work item not traceable to a
  program item is orphaned.
- **Milestone gaps:** Every epic must appear in the Milestone Map table.

**Severity rules:**
- ❌ Critical (blocks acceptance): Checks 1–6 and 8 when they fail.
- ⚠️ Warning (advisory): Check 7 (incomplete metadata) when only minor fields
  are missing; Check 5 when a task is at the L boundary (not XL but worth
  flagging); Check 9 (milestone gaps).

##### Step 3: Post Validation Result

Use the `add-comment` safe-output to post (or update, if one already exists)
the validation result comment.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-validation-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-validation-v1 -->
## ✅ Squad Plan Validation — PASSED  (or ❌ FAILED)

> Validated: {which artifacts were checked, e.g., "Program Plan + Implementation Plan"}
> Run at: {ISO-8601 timestamp}

### Results

| # | Check | Status | Details |
|---|-------|--------|---------|
| 1 | Unresolved temporary IDs | ✅ Pass | — |
| 2 | Traceability (impl → program) | ✅ Pass | All {n} tasks trace to program items |
| 3 | Hierarchy validity | ✅ Pass | — |
| 4 | Dependency cycles | ✅ Pass | DAG validated, no cycles |
| 5 | Work sizing | ⚠️ Warning | 1 task at L boundary (consider splitting) |
| 6 | Unresolved decisions | ❌ Fail | D2 still unresolved, blocks E3 |
| 7 | Metadata completeness | ✅ Pass | — |
| 8 | Orphaned items | ✅ Pass | All triage items represented |
| 9 | Milestone coverage | ✅ Pass | — |

### Issues Found ({count})

#### ❌ Critical (blocks acceptance)
1. **{Check name}** — "{description of what's wrong}" blocks {what it blocks}.
   - Fix: {actionable fix instruction}.

#### ⚠️ Warnings (advisory, does not block)
1. **{Check name}** — "{description}". {Suggestion}.

### Summary
- **Checks run:** {n}
- **Passed:** {n} | **Warnings:** {n} | **Failed:** {n}
- **Verdict:** ✅ Plan validated — ready for acceptance. | ❌ Cannot accept until critical issues resolved.

> {If PASSED: "Run `/squad plan accept scope` or `/squad plan accept implementation` to proceed."}
> {If FAILED: "Fix the issues above, then re-run `/squad plan validate`."}
```

**Result rules:**
- If ALL checks pass (no ❌ failures): heading is `✅ Squad Plan Validation — PASSED`
  and verdict is `✅ Plan validated — ready for acceptance.`
- If ANY check is ❌: heading is `❌ Squad Plan Validation — FAILED` and
  verdict is `❌ Cannot accept until critical issues resolved.`
- Warnings alone do NOT cause failure.

##### Step 4: Update Lifecycle Summary

Search for the `<!-- squad-lifecycle-state -->` comment on the issue. If it
exists, update it; if not, create it. Set the Validation row:
- On PASS: `✅ Done`
- On FAIL: `❌ Failed`

Record the current timestamp. Set `Current state: Validated` (on pass) or
`Current state: Validation failed` (on fail) and
`Last command: /squad plan validate`.
On PASS: Set `**Next action:**` to `/squad plan accept implementation` — approve the implementation plan.
On FAIL: Set `**Next action:**` to `/squad plan validate` — fix the reported issues, then re-run validation.

##### Step 5: Surface Next Action

- **If PASSED:** End the comment with:
  *"✅ Plan validated — ready for acceptance. Run `/squad plan accept scope`
  to approve the program plan, or `/squad plan accept implementation` to
  approve the implementation plan."*
- **If FAILED:** End the comment with:
  *"❌ Validation failed — {n} issues found. Fix and re-run
  `/squad plan validate`."*

Do NOT create issues or PRs. Plan Validate mode only posts a comment.

---

#### Plan Accept Scope Mode

Plan Accept Scope mode (`/squad plan accept scope`) records formal approval of the
program plan's scope — the WHAT. It locks the strategic decomposition so
implementation planning can proceed on a stable foundation.

##### Step 1: Validate Preconditions

1. Search the triggering issue's comments for the latest comment containing
   `<!-- squad-program-v1 -->`. If no program plan exists, reply with:
   *"No program plan found. Run `/squad plan program` first to define scope."*
   — then stop.
2. Check for an existing `<!-- squad-scope-accepted-v1 -->` comment. If one
   already exists, reply with:
   *"Scope was already accepted on {date} by {actor}. To re-scope, run
   `/squad plan revise <feedback>` to update the program plan, which will
   invalidate the current acceptance."* — then stop.

##### Step 2: Validate Readiness

1. Check the triage comment (`<!-- squad-triage-v1 -->`) if it exists. Verify
   that all items classified as `decision` have been resolved (look for
   follow-up comments or edits that indicate decisions were made). If unresolved
   decisions remain, list them and reply with:
   *"Scope cannot be accepted — {n} decisions are still unresolved: {list}.
   Resolve these decisions and re-run `/squad plan accept scope`."* — then stop.
2. Check the program plan for unresolved temporary IDs or placeholder references.
   If found, list them and reply with a request to resolve before acceptance.

##### Step 3: Record Acceptance

Use the `add-comment` safe-output to post the acceptance record.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-scope-accepted-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-scope-accepted-v1 -->
## ✅ Scope Accepted

- **Program plan version:** {link to the program plan comment}
- **Accepted by:** @{triggering user}
- **Date:** {ISO-8601 timestamp}
- **What was approved:**
  - {count} initiatives
  - {count} epics
  - Scope boundary: {in-scope summary}
- **Notes:** Scope is now locked. Changes require `/squad plan revise` which
  will invalidate this acceptance.
```

##### Step 4: Update Lifecycle Summary

Update the `<!-- squad-lifecycle-state -->` comment. Set the Scope Accepted row
to `✅ Done`. Set `Current state: Scope accepted` and
`Last command: /squad plan accept scope`.
Set `**Next action:**` to `/squad plan implementation` — create the implementation plan.

End with: *"Scope approved. Reply `/squad plan implementation` to create the
implementation plan."*

---

#### Plan Accept Implementation Mode

Plan Accept Implementation mode (`/squad plan accept implementation`) records
formal approval of the implementation plan — the HOW. It locks the task
decomposition so activation can proceed.

##### Step 1: Validate Preconditions

**Precondition:** A `<!-- squad-validation-v1 -->` marker with status `PASS` must exist for the current implementation plan. If validation has not been run, or the latest result is `FAIL`, prompt the user to run `/squad plan validate` first.

1. Search for `<!-- squad-scope-accepted-v1 -->`. If not found, reply with:
   *"Scope must be accepted before implementation can be approved. Run
   `/squad plan accept scope` first."* — then stop.
2. Search for `<!-- squad-implementation-v1 -->`. If not found, reply with:
   *"No implementation plan found. Run `/squad plan implementation` first."*
   — then stop.
3. Search for `<!-- squad-validation-v1 -->` with status `PASS`. If not found
   or status is `FAIL`, reply with:
   *"Validation must pass before implementation can be accepted. Run
   `/squad plan validate` first."* — then stop.
4. Check for an existing `<!-- squad-impl-accepted-v1 -->` comment. If one
   already exists, reply with:
   *"Implementation was already accepted on {date} by {actor}. To revise,
   run `/squad plan revise <feedback>` which will invalidate the acceptance."*
   — then stop.

##### Step 2: Validate Plan Integrity

Run the same structural validations as Plan Implementation Step 3:

1. **Size check** — All tasks ≤ L.
2. **Cycle check** — Dependency graph is acyclic.
3. **Traceability** — Every task traces to a program plan item.
4. **Coverage** — Every epic has at least one task.
5. **Agent validity** — All assigned agents are active squad members.

If any check fails, list the failures and reply with:
*"Implementation plan has validation errors — cannot accept. Fix these and
re-run `/squad plan accept implementation`."* Include specific diagnostics.

**Sizing summary sourcing:** Search for the latest `<!-- squad-validation-v1 -->`
comment. If found, extract the Sizing Summary table from it — this is the
authoritative sizing record. Copy the sizing summary verbatim from the
validation result. Do NOT re-count or regenerate sizing from the
implementation plan text (which can be misread due to table formatting). If
no validation result exists, derive sizing from the implementation plan's
Sizing Summary section (the table at the bottom of the implementation plan
comment), but prefer the validation result when available.

##### Step 3: Record Acceptance

Use the `add-comment` safe-output to post the acceptance record.

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-impl-accepted-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-impl-accepted-v1 -->
## ✅ Implementation Accepted

- **Implementation plan version:** {link to impl plan comment}
- **Scope acceptance:** {link to scope acceptance comment}
- **Accepted by:** @{triggering user}
- **Date:** {ISO-8601 timestamp}
- **What was approved:**
  - {count} tasks across {count} phases
  - Total sizing: {copied verbatim from validation result's Sizing Summary table — e.g., XS×2, S×4, M×6, L×3}
  - {count} agents assigned
- **Sizing source:** `<!-- squad-validation-v1 -->` result (do NOT re-derive from plan text)
- **Notes:** Implementation is now locked. Reply `/squad plan activate` to
  create issues and begin execution.
```

##### Step 4: Update Lifecycle Summary

Update the `<!-- squad-lifecycle-state -->` comment. Set the Impl Accepted row
to `✅ Done`. Set `Current state: Implementation accepted` and
`Last command: /squad plan accept implementation`.
Set `**Next action:**` to `/squad plan activate` — create issues and begin execution.

End with: *"Implementation approved. Reply `/squad plan activate` to create
issues and begin execution."*

---

#### Plan Activate Mode

Plan Activate mode (`/squad plan activate`) is the terminal transition that
creates real GitHub issues and milestones from the accepted implementation plan.
This is an irreversible action (issues are created in the repository).

##### Step 1: Validate Preconditions

1. Search for `<!-- squad-impl-accepted-v1 -->`. If not found, reply with:
   *"Implementation must be accepted before activation. Run
   `/squad plan accept implementation` first."* — then stop.
2. Check for an existing `<!-- squad-activated-v1 -->` comment. If one exists,
   this is a **re-activation**. Compare the existing activation record against
   the current implementation plan to identify only the tasks that have NOT
   been created as issues yet. Only create missing issues (idempotent behavior).

##### Issue Creation Integrity — Hallucination Guard

> **CRITICAL:** After every `create-issue` safe-output call, you MUST:
>
> 1. **Verify the returned issue number** — confirm the response contains a valid
>    issue number before referencing it in any subsequent issue body, dependency,
>    or parent relationship.
> 2. **Stop on failure** — if any `create-issue` call fails or returns an error,
>    STOP activation immediately. Report which issues were successfully created
>    (with their numbers) and which failed. Do NOT continue creating downstream
>    issues that reference a failed parent or dependency.
> 3. **Never predict issue numbers** — always use the ACTUAL returned value from
>    each `create-issue` call. Do not hardcode, increment, or guess issue numbers
>    based on repository state or previous creations.

##### Step 2: Create GitHub Issues — Full Hierarchy

Activation MUST create the full program hierarchy as GitHub issues, NOT a flat
list of tasks directly under the root. The structure is:

**Root intent issue → Epic issues → Task issues**

Follow this order:

**2a. Create Milestones First**

Use the GitHub API (via the `github` tool in gh-proxy mode) to create milestones BEFORE issues:

1. For each milestone defined in the program plan (`<!-- squad-program-v1 -->`),
   check if a milestone with that title already exists. If so, reuse it.
2. Create new milestones for any that don't exist. Use the milestone's outcome
   description as the milestone description.
3. Record the milestone IDs for assignment in subsequent steps.

If milestone creation fails (insufficient permissions or API error), document
milestones as metadata in the root issue body instead:
```
## Milestones
- M1: {name} — {outcome} — Contains: E1, E2
- M2: {name} — {outcome} — Contains: E3, E4
```

**2b. Create Epic Issues**

For each epic in the program plan, use the `create-issue` safe-output:

- **Title:** `[Epic] {epic name}`
- **Labels:**
  - `squad` — description: "Squad-managed work item" — color: `0075ca`
  - `squad:{assigned-agent-name}` — description: "Assigned to {agent}" — color: `e4e669`
- **Body:**
  ```markdown
  {Epic outcome and description from the program plan}

  ## Stories
  {List of user stories under this epic}

  ## Acceptance Criteria (Epic-Level)
  {Criteria from the program plan}

  ## Context
  - Parent: #{triggering-issue-number}
  - Initiative: {initiative name}
  - Milestone: {milestone name}
  - Depends on: #{dep-epic-issue-numbers} (if any)

  ---
  > Created by `/squad plan activate` from #{triggering-issue-number}
  ```
- **Parent relationship:** Add as a sub-issue of the root intent issue
  (native GitHub sub-issues). The root intent issue is the triggering issue.
- **Milestone:** Assign to the corresponding GitHub milestone created in 2a.

Create epics in dependency order.

> **⚠️ HARD GATE — DO NOT STOP HERE.**
>
> You have created epic issues. Task issues MUST follow immediately.
> Do NOT post the activation record comment, do NOT generate a summary,
> and do NOT end your response until ALL tasks from the implementation
> plan are created as issues in Step 2c below. Stopping after epics is
> the #1 failure mode of this step.

**2c. Create Task Issues**

For each task in the implementation plan, use the `create-issue` safe-output:

- Create issues in dependency order (earlier tasks = lower issue numbers so
  later tasks can reference them).
- **Title:** The task title from the implementation plan
- **Labels:**
  - `squad` — description: "Squad-managed work item" — color: `0075ca`
  - `squad:{assigned-agent-name}` — description: "Assigned to {agent}" — color: `e4e669`
  (Do NOT create `size:*` labels unless `size_representation: label` is
  explicitly set in planning policy.)
- **Body:**
  ```markdown
  {2-3 sentence scope description from the implementation plan}

  ## Acceptance Criteria
  {Criteria from the task — bullet list, no preamble}

  ## Context
  - Parent: #{epic-issue-number}
  - **Size:** {XS|S|M|L|XL}
  - Depends on: #{dep-issue-numbers}

  ---
  > `/squad plan activate` · #{triggering-issue-number}
  ```
- **Parent relationship:** Add as a sub-issue of the EPIC issue (NOT the root
  intent issue). Tasks are children of their epic, not of the root.
- **Milestone:** Assign to the same milestone as the parent epic.

  **Size handling:** If a GitHub Project is configured with a Size single-select
  field, set the Project field value for the issue. Otherwise, the `**Size:**`
  line in the body is the canonical representation.

**2d. Self-Validation — Verify Completeness**

After all `create-issue` calls complete, count the issues actually created
and compare against the implementation plan:

- Count epic issues created (titles matching `[Epic] *`)
- Count task issues created (all other issues created in this activation)
- Compare against the expected counts from the implementation plan

If counts match: continue to Step 3.
If counts do NOT match: STOP and include in the activation record:
```
⚠️ Partial activation — {actual_epics}/{expected_epics} epics,
{actual_tasks}/{expected_tasks} tasks created. Re-run `/squad plan activate`
to create remaining issues (activation is idempotent — existing issues
are skipped via title-match dedup).
```

Do NOT silently succeed with partial creation. The user must see the
mismatch. Activation is idempotent, so re-running creates only missing items.

**Label requirements:**
- Labels MUST have descriptions and intentional colors:
  - `squad` — "Squad-managed work item" — color: `0075ca` (blue)
  - `squad:{agent}` — "Assigned to {agent}" — color: `e4e669` (yellow)
- If labels don't exist yet, create them with the specified descriptions and colors.

##### Step 3: Create Native Dependency Edges

After all issues are created, establish dependency relationships using native
GitHub blocked-by/blocking edges:

1. For each task that declares dependencies, use the GitHub API to add
   `blockedBy` relationships linking the dependent issue to its prerequisite
   issues.
2. For each epic that declares dependencies on other epics, create the same
   `blockedBy` relationships at the epic level.
3. Prefer native blocked-by relationships — they surface in the GitHub UI and
   enable dependency-aware project views.
4. If native dependency APIs are unavailable (insufficient permissions, feature
   not enabled for the repository), fall back gracefully. The body-text
   `Depends on: #N` references already created in Step 2 serve as the fallback.
5. Do NOT fail activation if dependency edge creation fails — log the issue in
   the activation record and continue.

##### Step 4: Post Activation Record

Use the `add-comment` safe-output to post the activation record.

> **Ordering:** This step MUST be the LAST creation action. Do not begin
> drafting or posting this comment until Steps 2 and 3 are fully complete
> (all epics, all tasks, all dependency edges created).

**CRITICAL — FIRST LINE REQUIREMENT:** The comment MUST begin with the marker on its own line BEFORE any other content:
`<!-- squad-activated-v1 -->`

This marker is machine-readable and non-negotiable. Without it, subsequent phases cannot find this artifact.

**Comment structure:**

```markdown
<!-- squad-activated-v1 -->
## ✅ Plan Activated — {epic count} epics, {task count} tasks created

- **Activated by:** @{triggering user}
- **Date:** {ISO-8601 timestamp}
- **Milestone(s):** {milestone links, or "None"}
- **Hierarchy:** Root #{root} → {epic count} epics → {task count} tasks
- **Assigned agents:** {comma-separated list}

### Created Epics
| # | Title | Issue | Milestone | Tasks |
|---|-------|-------|-----------|-------|
| E1 | {epic title} | #{number} | {milestone} | {task count} |
| E2 | {epic title} | #{number} | {milestone} | {task count} |

### Created Tasks
| # | Title | Issue | Size | Agent | Parent Epic | Phase |
|---|-------|-------|------|-------|-------------|-------|
| 1 | {title} | #{number} | S | {agent} | #{epic-number} | {phase} |
| 2 | {title} | #{number} | M | {agent} | #{epic-number} | {phase} |

### Dependency Order
{Brief summary of blocking relationships using created issue numbers}

---
The squad is ready to begin work. Issues are created in dependency order
with full hierarchy (Root → Epics → Tasks) and assigned to their respective agents.
```

##### Step 5: Update Lifecycle Summary

Update the `<!-- squad-lifecycle-state -->` comment. Set the Activated row
to `✅ Done`. Set `Current state: Activated` and
`Last command: /squad plan activate`.
(Terminal state — no `**Next action:**` or `**Also available:**` fields needed.)

End with: *"✅ Plan activated — {n} issues created. The squad is ready to
begin work."*
