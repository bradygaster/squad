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
    max: 20
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
| `/squad plan accept` | Plan Accept | Create sub-issues from the last plan comment |
| `/squad plan revise <feedback>` | Plan Revise | Revise the last plan based on feedback |
| `/squad triage` | Triage | Classify research findings as work / decision / excluded |
| `/squad triage revise <feedback>` | Triage Revise | Adjust triage dispositions based on feedback |
| `/squad plan program` | Plan Program | Strategic decomposition into initiatives and epics |
| `/squad plan implementation` | Plan Implementation | Decompose program plan into PR-sized tasks with deps and sizing |
| `/squad` (no args) | Cast | Default to cast mode |

## Task

### 1. Parse Command

Extract the mode and arguments from the slash command text:

1. Read the trigger body from the event payload described above.
2. Strip the `/squad` prefix and trim whitespace.
3. Match the first word(s) against known modes: `cast`, `connect`, `adopt`,
   `cast-member`, `retire`, `status`, `research`, `triage`, `triage revise`,
   `plan`, `plan program`, `plan implementation`, `plan accept`,
   `plan accept scope`, `plan accept implementation`, `plan activate`,
   `plan revise`.
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
- **Labels:** `squad` (applied automatically by safe-outputs)
- **Files to include:**
  - `.squad/` (entire directory)
  - `.github/agents/squad.agent.md`
  - `meet-the-squad.md`

Stage only the files listed above. Do NOT commit unrelated changes.

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

Use the `add-comment` safe-output to post a structured research comment. The
comment MUST begin with the HTML marker `<!-- squad-research-v1 -->` on its own
line (this allows future commands to locate and reference it).

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
> Reply `/squad plan` to generate a detailed execution plan with sub-issues based on these findings.
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

Use the `add-comment` safe-output to post a structured plan comment. The comment
MUST begin with `<!-- squad-plan-v1 -->` on its own line.

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

#### Plan Accept Mode

Plan Accept mode reads the most recent plan comment (marked with
`<!-- squad-plan-v1 -->`) from the issue and creates sub-issues from it.

##### Step 1: Find the Plan

1. Search the triggering issue's comments for the latest comment containing
   `<!-- squad-plan-v1 -->`. If no plan comment exists, reply with a comment:
   *"No plan found. Run `/squad plan` first to generate a plan for review."*
2. Parse the plan comment to extract work items (titles, scopes, acceptance
   criteria, owners, dependencies, phases).

##### Step 2: Create Sub-Issues

For each work item in the plan, use the `create-issue` safe-output:

- **Title:** The work item title
- **Labels:** `squad`, plus `squad:{owner-name}` if an agent is assigned
- **Body:**
  ```markdown
  {Scope description from the plan}

  ## Acceptance Criteria
  {Criteria from the plan}

  ## Context
  - Parent: #{triggering-issue-number}
  - Phase: {phase name}
  - Depends on: #{dep-issue-numbers if already created}
  - Owner: {agent name}

  ## Notes
  {Implementation hints from the plan}

  ---
  > Created by `/squad plan accept` from #{triggering-issue-number}
  ```

Create issues in dependency order so earlier issues get lower numbers that
later issues can reference.

##### Step 3: Post Summary Comment

After creating all issues, post a summary comment on the triggering issue:

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
4. Post a NEW plan comment (with `<!-- squad-plan-v1 -->` marker) that supersedes
   the old one. Note at the top: *"Revised based on feedback: {summary of changes}"*
5. The new plan comment becomes the one that `/squad plan accept` will use.

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

Use the `add-comment` safe-output to post a structured triage comment. The comment
MUST begin with `<!-- squad-triage-v1 -->` on its own line.

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
update it; if not, create it. Set the Triage row to `✅ Done` and record the
current timestamp. Set `Current state: Triaged` and `Last command: /squad triage`.

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
4. Post a NEW triage comment (with `<!-- squad-triage-v1 -->` marker) that
   supersedes the old one. Note at the top:
   *"Revised based on feedback: {summary of changes}"*
5. Update the lifecycle summary comment.
6. The new triage comment becomes the one that `/squad plan program` will use.

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
- **Size** — XS (<1h) · S (1–3h) · M (3–8h) · L (1–2d) — no task may exceed L
- **Dependencies** — Which other tasks must complete first (by task number)
- **Agent assignment** — Which squad member owns this task (from `.squad/team.md`)
- **Rollout notes** — Deployment, migration, or feature-flag considerations

**Decomposition rules:**
- No task larger than L. If a task would be XL, split it into smaller tasks.
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

Use the `add-comment` safe-output to post a structured implementation plan. The
comment MUST begin with `<!-- squad-implementation-v1 -->` on its own line.

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

Do NOT create issues or PRs. Plan Implementation mode only posts a comment.
