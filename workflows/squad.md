---
name: Squad
description: Cast, connect, or adopt a Squad AI team for your repository
emoji: "🧑‍🤝‍🧑"
private: true
on:
  slash_command:
    name: squad
    events:
      - issue_comment
      - pull_request_review_comment
  workflow_dispatch:
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
    close-older-prs: false
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
       "role-id": {
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
   | {Name} | {Role} | `.squad/agents/{id}/charter.md` | ✅ Active |
   | Scribe | Session Logger | — | 📋 Silent |
   | Ralph | Work Monitor | — | 🔄 Monitor |
   ```

2. **`.squad/agents/{id}/charter.md`** for each agent — minimal charter:
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
| {emoji} {Name} | {Role} | {area of expertise} | `squad:{id}` label or mention in issue |
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
<!-- TODO: Full implementation in #1615 -->

Connect mode links a repository to an existing Squad source (remote team
configuration). Not yet implemented — reply with a comment explaining that
Connect mode is coming soon and link to the Squad repository for updates.

---

#### Adopt Mode
<!-- TODO: Full implementation in #1616 -->

Adopt mode pulls a complete squad configuration from a remote URL and installs
it locally. Not yet implemented — reply with a comment explaining that Adopt
mode is coming soon.

---

#### Cast Member Mutation
<!-- TODO: Full implementation in #1617 -->

Cast Member mode adds or modifies a single team member in an existing squad.
Not yet implemented — reply with a comment explaining that Cast Member mutations
are coming soon.

---

#### Retire Mode
<!-- TODO: Full implementation in #1617 -->

Retire mode removes a named team member, archives their charter, and updates
the roster. Not yet implemented — reply with a comment explaining that Retire
mode is coming soon.

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
