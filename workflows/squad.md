---
name: Squad
description: Cast, connect, or adopt a Squad AI team for your repository
emoji: "🧑‍🤝‍🧑"
private: false
on:
  slash_command:
    name: squad
    events:
      - issue_comment
      - pull_request_review_comment
  workflow_dispatch:
    inputs:
      command:
        description: 'Squad command (e.g., cast, connect org/repo, adopt org/repo, status)'
        required: false
        default: 'cast'
permissions:
  contents: write
  issues: write
  pull-requests: write
  copilot-requests: write
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
    expires: 14
---

# Squad — Unified `/squad` Slash Command

Invoked via `/squad <mode> [options]` in issue comments or PR review comments,
or manually via workflow_dispatch.

## Trigger Context

Access the slash command text from the GitHub event payload:

- **Issue comment:** `github.event.comment.body` — the full comment text
- **PR review comment:** `github.event.comment.body` — the full comment text
- **Workflow dispatch:** `github.event.inputs.command` — manual input (default: `cast`)

The activation job already ran `squad init --preset default`, which produced a
generic 5-agent team (lead, reviewer, devrel, security, docs) in `.squad/`. Cast
mode REPLACES this scaffolding with a team tailored to the repository.

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
| `/squad` (no args) | Cast | Default to cast mode |

## Task

### 1. Parse Command

Extract the mode and arguments from the slash command text:

1. Read the trigger comment body from the event payload.
2. Strip the `/squad` prefix and trim whitespace.
3. Match the first word against known modes: `cast`, `connect`, `adopt`,
   `cast-member`, `retire`, `status`.
4. If no subcommand is provided or the text is empty, default to `cast`.
5. Store any remaining text as arguments for the matched mode.

### 2. Execute Mode

---

#### Cast Mode

Cast mode analyzes the target repository, composes a specialist team, assigns
character names from a fictional universe, generates full `.squad/` scaffolding,
and opens a PR introducing the new team.

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
  (interactive coach) are always present and do NOT count toward team composition.

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
**charter** (`.squad/agents/{name}/charter.md`) defining their expertise,
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

##### Step 6: Auto-Include copilot-setup-steps.yml

Check if `.github/workflows/copilot-setup-steps.yml` exists in the repository.

If **missing:**
1. Generate a `copilot-setup-steps.yml` appropriate for the detected language/toolchain:
   - For Node.js projects: include `actions/setup-node@v4` + `npm ci`
   - For Python projects: include `actions/setup-python@v5` + `pip install`
   - For Go projects: include `actions/setup-go@v5`
   - For other/mixed: include a minimal checkout-only version
2. Place it at `.github/workflows/copilot-setup-steps.yml`
3. Include it in the PR files (see Step 7)
4. Mention in the PR body: "Also included `copilot-setup-steps.yml` since it was
   missing — this enables the Copilot coding agent to work with your squad immediately."

If **present:** Do nothing. Never overwrite an existing setup steps file.

##### Step 7: Open PR

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
  - `.github/workflows/copilot-setup-steps.yml` (only if generated in Step 6)

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
     > - The repository exists and is not private (or the app has access)
     > - The `SQUAD_GITHUB_APP_*` secrets are configured correctly
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
     > - The repository exists and is not private (or the app has access)
     > - The `SQUAD_GITHUB_APP_*` secrets are configured correctly
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

##### Step 6: Auto-Include copilot-setup-steps.yml

Same as Cast Mode Step 6. Check if `.github/workflows/copilot-setup-steps.yml`
exists. If missing, generate one appropriate for the target repo's detected
language/toolchain and include it in the PR.

##### Step 7: Open PR

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
  - `.github/workflows/copilot-setup-steps.yml` (only if generated in Step 6)

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
  Push a new commit to the existing PR branch with the member changes.
  Post a comment on the PR noting the addition/modification.
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

- **Triggered on a Squad PR:** Push a commit to the existing PR branch.
  Post a comment noting the retirement.
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
