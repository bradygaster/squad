# @bradygaster/squad-cli

The programmable multi-agent CLI for GitHub Copilot. Build an AI team, assign roles, and let them work your repo—automating issue triage, code review, documentation, and more through orchestrated AI agents.

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

## Installation

### Prerequisites

- **Node.js ≥ 20** — Squad requires modern JavaScript runtime features
- **GitHub Copilot** — provides the AI backend for agent orchestration and code analysis
- **GitHub CLI** (`gh`) — required for issue/PR operations and the work loop

### Install from npm

```bash
# Global (recommended)
npm install -g @bradygaster/squad-cli@latest

# Project-local
npm install --save-dev @bradygaster/squad-cli

# One-shot (no install)
npx @bradygaster/squad-cli

# Insider channel (pre-release builds)
npm install -g @bradygaster/squad-cli@insider
```

### Verify Installation

```bash
squad --version
squad doctor    # Validate setup
```

## Quick Start

Get a working AI team in three steps:

```bash
# 1. Initialize Squad in your repo
squad init

# 2. Launch the interactive shell and talk to your team
squad
```

The `init` command creates a `.squad/` directory with default agents and configuration. Then `squad` opens a REPL where you can chat with agents, assign work, and monitor progress.

**Example:**

```
squad > @Neo, review the authentication module
squad > Trinity, add unit tests for the login page
squad > /status    # See what's in progress
```

## Commands Reference

For detailed documentation on each command, see the [CLI Reference](https://docs.squad.ai/reference/cli) on the docs site.

### Core Commands

| Command | Purpose |
|---------|---------|
| `squad` | Enter interactive shell (no arguments) |
| `squad init` | Initialize Squad in current repo (idempotent) |
| `squad init --global` | Create a personal squad in your home directory |
| `squad status` | Show which squad is active and why |
| `squad doctor` | Validate setup integrity and diagnose issues |
| `squad upgrade` | Update Squad-owned files to latest version |

### Team Management

| Command | Purpose |
|---------|---------|
| `squad hire --name <name> --role <role>` | Add a new agent to your team |
| `squad copilot` | Add the @copilot coding agent |
| `squad copilot --off` | Remove @copilot from the team |
| `squad copilot --auto-assign` | Enable auto-assignment for @copilot |

### Work & Automation

| Command | Purpose |
|---------|---------|
| `squad triage` | Auto-triage issues and assign to agents |
| `squad triage --interval <min>` | Run triage continuously (default: 10 min) |
| `squad plugin` | Manage plugin marketplaces (add/remove/list/browse) |

### Export & Import

| Command | Purpose |
|---------|---------|
| `squad export` | Export team to a portable JSON snapshot |
| `squad export --out <path>` | Export to custom path |
| `squad import <file>` | Import team from snapshot (or existing squad) |
| `squad import <file> --force` | Replace existing team (archives old one) |

### Utilities

| Command | Purpose |
|---------|---------|
| `squad scrub-emails [directory]` | Remove email addresses from `.squad/` state files |
| `squad --version` | Print installed version |
| `squad help` | Show command help |

## Interactive Shell

Run `squad` with no arguments to enter the REPL. You'll see:

```
squad >
```

### Shell Commands

All shell commands start with `/`.

| Command | Purpose |
|---------|---------|
| `/status` | Show active agents, sessions, recent decisions |
| `/history` | View session log — tasks, decisions, agent work |
| `/agents` | List team members with roles and expertise |
| `/sessions` | List saved sessions |
| `/resume <id>` | Restore a past session |
| `/clear` | Clear terminal output |
| `/help` | Show all commands |
| `/quit` | Exit the shell (also: `Ctrl+C`) |

### Addressing Agents

Use agent names to route messages. Name matching is **case-insensitive**:

```
squad > @Neo, review the architecture
squad > @trinity fix the login bug
squad > Summarize the latest decisions
```

Omit the agent name and the coordinator routes to the best fit.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Scroll command history |
| `Ctrl+A` | Jump to start of line |
| `Ctrl+E` | Jump to end of line |
| `Ctrl+U` | Clear to start of line |
| `Ctrl+K` | Clear to end of line |
| `Ctrl+W` | Delete previous word |
| `Ctrl+C` | Exit shell |

## .squad/ Directory Structure

When you run `squad init`, Squad creates a `.squad/` directory with this structure:

```
.squad/
├── team.md                # Roster — agent names, roles, human members
├── routing.md             # Work routing rules (which agent handles what)
├── decisions.md           # Architectural decisions log (append-only)
├── directives.md          # Permanent team rules and conventions
├── ceremonies.md          # Team ceremonies and rituals
├── casting-state.json     # Agent names, universe theme
├── model-config.json      # Per-agent model overrides
├── manifest.json          # Squad metadata and version
├── config.json            # Local config (teamRoot, etc.)
├── agents/                # Agent knowledge files
│   ├── neo/
│   │   ├── charter.md     # Role definition, expertise
│   │   └── history.md     # Accumulated knowledge
│   └── ...
├── skills/                # Reusable knowledge (markdown files)
│   ├── auth-rate-limiting.md
│   └── ...
└── sessions/              # Saved REPL sessions
```

### Key Files

**`team.md`** — Defines your roster:

```markdown
## Team

🏗️  Neo       — Lead        Scope, decisions, code review
⚛️  Trinity   — Frontend    React, TypeScript, UI
🔧  Morpheus — Backend     Node.js, Express, databases
🧪  Tank     — Tester      Jest, integration tests
```

**`routing.md`** — Controls work assignment:

```markdown
# Routing Rules

**Frontend changes** → Trinity
**Backend API work** → Morpheus
**Database migrations** → Morpheus
**Test writing** → Tank
**Architecture** → Neo
```

**`decisions.md`** — Append-only architectural log (agents read this before every task):

```markdown
### 2025-03-20: Use Zod for API validation
**By:** Morpheus
**What:** All API input validation uses Zod schemas
**Why:** Type-safe, composable, generates TypeScript types
```

**`directives.md`** — Permanent rules agents always follow:

```markdown
- Always use TypeScript strict mode
- No any/unknown casts
- All database queries through Prisma, no raw SQL
```

## Built-in Skills

When you run `squad init`, Squad installs **8 curated skills** into `.copilot/skills/`. These skills teach your agents best practices and conventions:

| Skill | Purpose |
|-------|---------|
| `squad-conventions` | Squad behavioral conventions |
| `error-recovery` | Graceful error recovery patterns |
| `secret-handling` | Secrets management and credential safety |
| `git-workflow` | Git workflow conventions and branch management |
| `session-recovery` | Session checkpoint and recovery patterns |
| `reviewer-protocol` | Code review protocol and reviewer gate patterns |
| `test-discipline` | Test-first discipline and coverage expectations |
| `agent-collaboration` | Multi-agent collaboration and handoff patterns |

Each skill is a `SKILL.md` file inside `.copilot/skills/<skill-name>/`.

### Skill lifecycle

- **`squad init`** — Installs the 8 manifest skills on first run. If `.copilot/skills/` already has content, init skips skill installation (idempotent).
- **`squad upgrade`** — Refreshes manifest skills to their latest versions. Skills marked `overwriteOnUpgrade: true` (all built-in skills) are always updated to pick up fixes and improvements.

### Adding custom skills

You can add your own skills by creating a new directory under `.copilot/skills/`:

```
.copilot/skills/my-custom-skill/
└── SKILL.md
```

Custom skills are not overwritten during upgrade because they are not part of the built-in manifest.

## Configuration

### .squadrc / config.json

Squad looks for `.squad/config.json` to customize behavior:

```json
{
  "teamRoot": "./team-config",
  "maxAgents": 10,
  "modelDefaults": {
    "temperature": 0.7
  }
}
```

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `SQUAD_CLIENT` | Detected platform | `cli`, `vscode` |
| `COPILOT_TOKEN` | Copilot auth token (SDK usage) | `gho_...` |

### Squad Resolution Order

When Squad starts, it looks for `.squad/` in this order:

1. Current directory (`./.squad/`)
2. Parent directories (walk up to project root)
3. Personal squad directory (platform-specific: `~/.config/squad/` on Linux, `~/Library/Application Support/squad/` on macOS, `%APPDATA%\squad\` on Windows)
4. Global CLI default (fallback only)

First match wins.

## Troubleshooting

### Run `squad doctor`

When something isn't working, run:

```bash
squad doctor
```

This performs a comprehensive diagnostic check:

- `.squad/` directory structure
- Required files: `team.md`, `routing.md`, `decisions.md`
- Agent directory and count
- Configuration validity
- Team root resolution (remote mode)

**Example output:**

```
🩺 Squad Doctor
═══════════════

Mode: local

✅  .squad/ directory exists — directory present
✅  team.md found — file present
✅  routing.md found — file present
✅  agents/ directory exists (4 agents)
✅  decisions.md exists — file present

Summary: 5 passed, 0 failed
```

### Common Issues

**Missing `.squad/` directory**

Run `squad init` to create it.

**Authentication errors**

Ensure GitHub Copilot is installed and you're authenticated. Check your token:

```bash
gh auth status
```

**Node.js version mismatch**

Squad requires Node.js ≥ 20. Check your version:

```bash
node --version
```

**ESM import errors**

Squad is an ESM-only module. If you see import errors, ensure your Node.js version is 20+.

## Links

- **Documentation:** [docs.squad.ai](https://docs.squad.ai)
- **CLI Reference:** [docs.squad.ai/reference/cli](https://docs.squad.ai/reference/cli) — detailed command docs
- **SDK:** [@bradygaster/squad-sdk](https://www.npmjs.com/package/@bradygaster/squad-sdk) — programmatic API
- **GitHub:** [github.com/bradygaster/squad](https://github.com/bradygaster/squad)
- **Issues:** [github.com/bradygaster/squad/issues](https://github.com/bradygaster/squad/issues)

## License

MIT. See [LICENSE](https://github.com/bradygaster/squad/blob/main/LICENSE) in the repository root.
