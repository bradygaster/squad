# Team Setup & Init Mode

When you first run Squad in a repository, it doesn't impose a team — it proposes one. The init flow analyzes your project, suggests roles and members, waits for your confirmation, then creates the `.ai-team/` directory structure and installs the crew.

## How Init Works

1. **Discovery** — Squad scans your repository: language distribution, file structure, test frameworks, dependencies, existing workflows.
2. **Proposal** — Based on what it finds, Squad proposes a team roster with 3-7 members and their roles.
3. **Confirmation** — You review the proposal and can accept as-is, add members, remove members, or change roles.
4. **Creation** — Squad writes `.ai-team/team.md`, creates agent directories under `.ai-team/agents/{member}/`, and sets up the coordinator.

### File Structure Created

```
.ai-team/
├── team.md                         # Team roster
├── routing.md                      # Work routing rules
├── decisions.md                    # Team memory (directives)
├── decisions/inbox/                # Pending decision writes
├── agents/
│   ├── {member1}/
│   │   ├── charter.md              # Role, skills, voice
│   │   └── context.md              # Agent-specific notes
│   ├── {member2}/
│   │   └── charter.md
│   └── ...
├── skills/
│   ├── {skill1}.md                 # Skill definitions
│   └── ...
├── log/                            # Execution logs
├── orchestration-log/              # Coordinator state
└── casting/                        # Universe assignments
```

## Customizing During Init

| What you say | What happens |
|--------------|--------------|
| "Accept" / "Looks good" | Creates team as proposed |
| "Add a designer" | Adds a designer role to the roster |
| "Remove the tester" | Drops tester from the team |
| "Change backend to Rust specialist" | Adjusts role focus for that member |
| "Make Fenster the frontend lead" | Assigns specific name to role |

## Customizing After Init

You can modify `.ai-team/team.md` directly or ask the coordinator:

> "Add a security specialist to the team"

The coordinator will:
1. Cast a new member from the universe
2. Create their agent directory and charter
3. Update `team.md` and `routing.md`

> "Remove McManus from the team"

The coordinator will:
1. Remove the member from `team.md`
2. Archive their agent directory (moves to `.ai-team/agents/.archived/{member}/`)
3. Update routing rules

## Default Team Composition

For most projects, Squad proposes:

| Role | When Included |
|------|--------------|
| **Lead** | Always — triages, reviews, unblocks |
| **Core Dev** | Always — main implementation |
| **Tester** | If tests exist or `package.json`/`pyproject.toml` has test deps |
| **DevRel** | If README exists or docs/ present |
| **Frontend** | If React/Vue/Svelte/Angular detected |
| **Backend** | If API routes, database code, or server framework detected |
| **Scribe** | Always — decision logger |

## Upgrade vs. Init

| Command | When to Use |
|---------|------------|
| `init` | First-time setup in a new repository |
| `upgrade` | Existing `.ai-team/` — updates templates, adds new members, migrates config |

Running `init` on an existing Squad repository prompts for upgrade mode automatically.

## Sample Prompts

```
Start a new Squad team for this project
```
Triggers init mode. Squad analyzes the repository and proposes a team.

```
Add a database specialist to the team
```
Adds a new member post-init. Coordinator casts from universe, creates charter, updates routing.

```
Remove the designer role — we don't need it
```
Removes a team member. Archives their directory and updates team.md.

```
Show me the current team roster
```
Displays team.md with all members, roles, and capabilities.

```
Change the tester to focus on integration tests instead of unit tests
```
Updates the tester's charter to adjust their focus area and expertise.
