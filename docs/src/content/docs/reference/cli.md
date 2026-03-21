# CLI Reference

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Everything you need to run Squad from the command line — commands, shell interactions, configuration files, and environment variables.

---

## Installation

```bash
# Global install (recommended)
npm install -g @bradygaster/squad-cli

# One-off with npx
npx @bradygaster/squad-cli init

# Latest from GitHub (bleeding edge)
squad init
```

---

## CLI Commands (40+ commands)

### Essential Commands

| Command | Description | Requires `.squad/` |
|---------|-------------|:------------------:|
| `squad` | Enter interactive shell (no args) — routes work to agents | No |
| `squad init` | Initialize Squad in the current repo (idempotent — safe to run multiple times) | No |
| `squad status` | Show which squad is active and why | No |
| `squad doctor` | Validate squad setup integrity and diagnose issues | Yes |

### Setup & Configuration

| Command | Description | Usage |
|---------|-------------|-------|
| `squad init --global` | Create a personal squad in your platform-specific directory | `squad init --global` |
| `squad init --sdk` | Generate typed `squad.config.ts` with `useRole()` calls | `squad init --sdk` |
| `squad init --roles` | Include base role catalog (Lead, Backend, etc.) instead of universe casting | `squad init --roles` |
| `squad init --mode remote <path>` | Initialize linked to a remote team root (dual-root mode) | `squad init --mode remote ../team-repo` |
| `squad build` | Compile `squad.config.ts` into `.squad/` markdown files | `squad build` |
| `squad build --check` | Validate TypeScript definitions without writing changes | `squad build --check` |
| `squad build --dry-run` | Preview generated files without writing | `squad build --dry-run` |
| `squad link <team-repo-path>` | Link project to a remote team root | `squad link ../team-repo` |
| `squad init-remote <path>` | Shorthand for `init --mode remote` | `squad init-remote ../team-repo` |

### Team & Roles

| Command | Description | Usage |
|---------|-------------|-------|
| `squad roles` | List all available Squad roles | `squad roles` |
| `squad roles --category <name>` | Filter roles by category | `squad roles --category engineering` |
| `squad roles --search <query>` | Search for roles by name or description | `squad roles --search "backend"` |
| `squad hire` | Team creation wizard (interactive) | `squad hire` |
| `squad hire --name <name> --role <role>` | Create agent with name and role | `squad hire --name Maya --role backend` |
| `squad copilot` | Add the @copilot coding agent to the team | `squad copilot` |
| `squad copilot --off` | Remove @copilot from the team | `squad copilot --off` |
| `squad copilot --auto-assign` | Enable auto-assignment for @copilot | `squad copilot --auto-assign` |

### Work & Triage

| Command | Description | Usage |
|---------|-------------|-------|
| `squad triage` | Auto-triage issues and assign to team | `squad triage` |
| `squad triage --interval <min>` | Continuous triage with custom interval (default: 10 min) | `squad triage --interval 5` |
| `squad watch` | Alias for `triage` — continuous monitoring | `squad watch` |
| `squad loop` | Work loop with optional filtering | `squad loop --filter "type:bug"` |

### Import & Export

| Command | Description | Usage |
|---------|-------------|-------|
| `squad export` | Export squad to a portable JSON snapshot | `squad export` |
| `squad export --out <path>` | Export to a custom path | `squad export --out /tmp/my-squad.json` |
| `squad import <file>` | Import a squad from an export file | `squad import squad-export.json` |
| `squad import <file> --force` | Replace existing squad (archives the old one) | `squad import squad-export.json --force` |

### Maintenance & Health

| Command | Description | Usage |
|---------|-------------|-------|
| `squad upgrade` | Upgrade Squad-owned files to latest version | `squad upgrade` |
| `squad upgrade --migrate-directory` | Rename legacy `.ai-team/` to `.squad/` | `squad upgrade --migrate-directory` |
| `squad migrate` | Convert between markdown-only and SDK-First formats | `squad migrate --to sdk` |
| `squad migrate --to <sdk\|markdown>` | Specify target format | `squad migrate --to markdown` |
| `squad nap` | Context hygiene (compress, prune, archive .squad/ state) | `squad nap` |
| `squad nap --deep` | Thorough cleanup with recursive descent | `squad nap --deep` |
| `squad nap --dry-run` | Preview cleanup actions without changes | `squad nap --dry-run` |
| `squad scrub-emails [directory]` | Remove email addresses from Squad state files | `squad scrub-emails .squad/` |

### Remote Control & Observability

| Command | Description | Usage |
|---------|-------------|-------|
| `squad start` | Start Copilot with optional remote access from phone/browser | `squad start` |
| `squad start --tunnel` | Enable phone/browser access via devtunnel (shows QR code) | `squad start --tunnel` |
| `squad start --port <n>` | Specific WebSocket port (default: random) | `squad start --port 3456` |
| `squad start --command <cmd>` | Run a custom command instead of copilot | `squad start --command powershell` |
| `squad rc` | Start Remote Control bridge (alias: `remote-control`) | `squad rc --tunnel` |
| `squad rc --tunnel` | Enable devtunnel for remote access | `squad rc --tunnel` |
| `squad rc --port <n>` | Custom WebSocket port for RC bridge | `squad rc --port 3456` |
| `squad rc --path <dir>` | Specify source directory for RC bridge | `squad rc --path ./src` |
| `squad copilot-bridge` | Check Copilot ACP stdio compatibility | `squad copilot-bridge` |
| `squad rc-tunnel` | Check devtunnel CLI availability | `squad rc-tunnel` |
| `squad aspire` | Launch .NET Aspire dashboard for observability | `squad aspire` |
| `squad aspire --docker` | Force Docker mode for Aspire | `squad aspire --docker` |
| `squad aspire --port <n>` | Custom Aspire dashboard port | `squad aspire --port 18888` |

### Collaboration & Extensions

| Command | Description | Usage |
|---------|-------------|-------|
| `squad plugin marketplace add \| remove \| list \| browse` | Manage plugin marketplaces | `squad plugin marketplace list` |
| `squad upstream add <source>` | Add upstream Squad source | `squad upstream add github.com/my/upstream` |
| `squad upstream add <source> --name <n>` | Add with custom name | `squad upstream add github.com/my/upstream --name primary` |
| `squad upstream add <source> --ref <branch>` | Pin to specific branch | `squad upstream add github.com/my/upstream --ref main` |
| `squad upstream remove <name>` | Remove upstream source | `squad upstream remove primary` |
| `squad upstream list` | Show configured upstreams | `squad upstream list` |
| `squad upstream sync [name]` | Sync from upstream(s) | `squad upstream sync` |
| `squad discover` | List known squads and their capabilities | `squad discover` |
| `squad delegate <squad-name> <description>` | Create work in another squad | `squad delegate analytics "Add usage dashboard"` |

### Advanced & Scheduling

| Command | Description | Usage |
|---------|-------------|-------|
| `squad schedule list` | Show configured schedules | `squad schedule list` |
| `squad schedule run <id>` | Manually trigger a scheduled task | `squad schedule run daily-backup` |
| `squad schedule init` | Create a default `schedule.json` template | `squad schedule init` |
| `squad schedule status` | Show last run times and next due dates | `squad schedule status` |
| `squad subsquads list` | Show configured SubSquads | `squad subsquads list` |
| `squad subsquads status` | Show activity per SubSquad | `squad subsquads status` |
| `squad subsquads activate <name>` | Activate a SubSquad for work | `squad subsquads activate backend-team` |
| `squad cost` | Report token usage from orchestration logs | `squad cost` |
| `squad cost --all` | Show costs for all agents | `squad cost --all` |
| `squad cost --agent <name>` | Filter by specific agent | `squad cost --agent Maya` |
| `squad consult` | Enter consult mode with your personal squad | `squad consult` |
| `squad consult --status` | Show current consult mode status | `squad consult --status` |
| `squad extract` | Extract learnings from consult mode session | `squad extract` |

### Meta

| Command | Description | Usage |
|---------|-------------|-------|
| `squad --version` | Print installed version | `squad --version` |
| `squad help` | Show help message with all commands | `squad help` |

## Common Workflows

### Getting Started

Start a new Squad from scratch:

```bash
# 1. Initialize Squad in your repo (creates .squad/ directory)
squad init

# 2. Optional: customize with SDK-first approach
squad init --sdk

# 3. Launch interactive shell to assign work
squad
```

After initialization, run `squad` with no arguments to enter the interactive shell where you can route work to agents.

### Working with Issues

Automate issue triage and assignment:

```bash
# 1. Start interactive shell
squad

# 2. From the shell, connect to your GitHub repo:
squad > /connect my-org/my-repo

# 3. Pick up assigned issues:
squad > Show me issues assigned to @Neo

# Continuous background triage (runs every 10 minutes by default):
squad triage

# Check triage results in the shell:
squad > /status
```

### Health Check

Validate your Squad setup before and after configuration changes:

```bash
# Quick diagnostic check
squad doctor

# After upgrading Squad
squad upgrade && squad doctor

# After cloning a repo with Squad
git clone my-project && cd my-project && squad doctor
```

### Team Building

Add agents to your team interactively:

```bash
# Interactive wizard
squad hire

# Or with flags for automation
squad hire --name Maya --role backend

# View available roles
squad roles --category engineering
```

### Remote Collaboration

Enable phone/browser access for remote pair programming:

```bash
# Start Copilot with local PTY only
squad start

# Enable remote access with devtunnel (shows QR code for phone scanning)
squad start --tunnel

# Custom port for local-only access
squad start --port 3456

# Custom command + remote access
squad start --tunnel --command powershell
```

For details, see [Remote Control Guide](../features/remote-control.md).

### Observability

Monitor Squad operations:

```bash
# View token usage costs by agent
squad cost --all

# Filter costs for a specific agent
squad cost --agent Maya

# Launch .NET Aspire dashboard for tracing
squad aspire
```

### Maintenance

Keep your Squad configuration clean and up to date:

```bash
# Upgrade Squad framework files (never touches your team state)
squad upgrade

# Preview context cleanup without making changes
squad nap --dry-run

# Perform deep cleanup
squad nap --deep

# Export your team configuration
squad export --out my-squad-backup.json

# Migrate from old .ai-team/ format
squad upgrade --migrate-directory
```

---

## Dual-Root Mode (Remote Team Root)

You can link your project to a shared team root to support multiple projects with a single team definition.

**Initialize with dual-root mode:**

```bash
squad init --mode remote ../team-repo
```

**Or link an existing project:**

```bash
squad link ../team-repo
```

In dual-root mode:
- **Project-specific state** lives in your local `.squad/` (decisions, learnings, project-specific files)
- **Team identity** (casting, charters, shared decisions) lives in the remote location
- Both locations are needed for the squad to function

This is useful for **monorepos** where multiple projects share a single team definition, or **organizations** with a shared team structure.

---

### squad start — Remote Control

Start Copilot with optional phone/browser access. Spawns Copilot in a PTY and mirrors to your device via WebSocket.

**Flags:**

- `--tunnel` — Create a devtunnel for remote access (shows QR code). Requires `devtunnel` CLI installed (`devtunnel user login`).
- `--port <N>` — Specific WebSocket port (default: random). Example: `--port 3456`
- `--command <cmd>` — Run custom command instead of copilot. Example: `--command powershell`
- All Copilot flags pass through. Example: `--model gpt-4`, `--yolo`

**Examples:**

```bash
# Local only (no remote access)
squad start

# With phone access via devtunnel QR code
squad start --tunnel

# Custom port, local only
squad start --port 3456

# Custom command with tunnel
squad start --tunnel --command powershell

# Copilot flags pass through
squad start --tunnel --model gpt-4
squad start --tunnel --yolo
```

For architecture, security, keyboard shortcuts, and troubleshooting, see [Remote Control Guide](../features/remote-control.md).

---

## Interactive Shell

Run `squad` with no arguments to enter the interactive shell. You'll see:

```
squad >
```

The interactive shell lets you assign work to agents, check status, and manage sessions — all without leaving the terminal.

### Shell Commands

All shell commands start with `/`.

| Command | What it does |
|---------|-------------|
| `/status` | Show active agents, sessions, and recent decisions |
| `/history` | View session log with tasks, decisions, and agent work |
| `/agents` | List team members with their roles and expertise |
| `/sessions` | List saved sessions |
| `/resume <id>` | Restore a past session |
| `/version` | Show squad version |
| `/clear` | Clear terminal output |
| `/help` | Show all shell commands |
| `/quit` | Exit the shell (also: `Ctrl+C`) |

### Addressing Agents

Route work directly to agents by name, or let the coordinator decide:

```
squad > @Maya, set up database schema
squad > neo, review the API design
squad > Build a blog post about our architecture
```

Agent name matching is **case-insensitive**. Use `@name` or just the name. Omit the name and the coordinator routes to the best fit.

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

---

## Configuration Files

Squad stores all team state in a `.squad/` directory in your project root. Everything is markdown, JSON, or TypeScript — no binary formats.

### `.squad/` Directory Structure

```
.squad/
├── team.md              # Team roster — agent names, roles, team members
├── routing.md           # Work routing rules (which agent gets what)
├── decisions.md         # Architectural decisions log (append-only)
├── directives.md        # Permanent team conventions and rules
├── casting-state.json   # Agent names and universe theme
├── model-config.json    # Per-agent LLM model overrides
├── ceremonies.md        # Team meetings, rituals, and review cycles
├── skills/              # Reusable knowledge files (markdown)
│   ├── auth-rate-limiting.md
│   └── ...
├── agents/
│   ├── maya/
│   │   ├── charter.md   # Agent's role, expertise, and tools
│   │   └── history.md   # Agent's accumulated knowledge
│   └── ...
├── config.json          # Squad configuration (optional; created by init)
└── schedule.json        # Scheduled tasks (optional)
```

Each file serves a specific purpose and is safe to edit manually. Squad respects your changes.

### team.md

Defines who's on your team (agents and humans):

```markdown
## Team

🏗️  Neo      — Lead          Scope, decisions, code review
⚛️  Trinity  — Frontend Dev  React, TypeScript, UI
🔧  Morpheus — Backend Dev   Node.js, Express, database
🧪  Tank     — Tester        Jest, integration testing
📋  Scribe   — (silent)      Memory, decisions, session logs

## Human Team Members

- **Sarah** — Senior Backend Engineer
- **Jamal** — Frontend Lead
```

### routing.md

Controls which agent gets assigned which type of work:

```markdown
# Routing Rules

**Frontend changes** → Trinity
**Backend API work** → Morpheus
**Database migrations** → Morpheus
**Test writing** → Tank
**Architecture decisions** → Neo
```

Squad reads these rules before assigning tasks.

### decisions.md

An **append-only log** of important decisions. Agents read this before every task to understand the team's choices:

```markdown
### 2025-07-15: Use Zod for API validation
**By:** Morpheus
**What:** All API input validation uses Zod schemas
**Why:** Type-safe, composable, generates TypeScript types
```

Never delete or reorder entries — only append.

### directives.md

Permanent rules that all agents follow:

```markdown
- Always use TypeScript strict mode
- No any/unknown casts
- All database queries through Prisma
- Write tests for all public APIs
```

---

## Squad Directory Resolution

When you run `squad`, it searches for `.squad/` in this order:

1. **Local project** — `./.squad/` (current directory and parent directories)
2. **Personal squad** — Platform-specific location:
   - **Linux:** `~/.config/squad/`
   - **macOS:** `~/Library/Application Support/squad/`
   - **Windows:** `%APPDATA%\squad\`
3. **Global fallback** — CLI default (only if no others found)

**First match wins.** This means:
- If your project has `.squad/`, that's used
- Otherwise, your personal squad is used
- No personal squad? Squad creates a temporary default

You can override this with flags:
- `--global` — Force use of personal squad directory
- `squad init --mode remote <path>` — Link to an external team root

---

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `SQUAD_CLIENT` | Detected client platform | `cli`, `vscode`, `web` |
| `SQUAD_DEBUG` | Enable debug logging | Set to `1` for verbose output |
| `SQUAD_NO_UPDATE_CHECK` | Skip update availability check | Set to `1` to disable |

---

---

## Troubleshooting with `squad doctor`

When something isn't working, run:

```bash
squad doctor
```

The doctor performs a comprehensive diagnostic check:

- ✅ `.squad/` directory structure
- ✅ `config.json` validity
- ✅ Team root resolution (dual-root mode)
- ✅ Required files: `team.md`, `routing.md`, `decisions.md`
- ✅ `agents/` directory and agent count
- ✅ Agent charters and configuration

**Quick scenarios:**

```bash
# After cloning a repo with Squad
git clone my-project && cd my-project && squad doctor

# After upgrading Squad
squad upgrade && squad doctor

# Verify setup before opening an issue
squad doctor
```

**Example output:**

```
🩺 Squad Doctor
═══════════════

Mode: local

✅  .squad/ directory exists
✅  team.md found with ## Team header
✅  routing.md found
✅  agents/ directory exists (4 agents)
✅  decisions.md exists

Summary: 5 passed, 0 failed, 0 warnings
```

### Common Issues

**Absolute path warning for `teamRoot`:**

If you see a warning about absolute paths, make it relative:

```json
{
  "teamRoot": "../team-repo/.squad"
}
```

The doctor always exits cleanly (exit code 0) because it's diagnostic, not a gate. Use it to troubleshoot setup issues, validate team state, or provide context when reporting bugs.

For detailed doctor checks and fixes, see [Troubleshooting Reference](../scenarios/troubleshooting.md).

---

## Version Management

Check your current version and update Squad:

```bash
# Check installed version
squad --version

# Update to latest
npm install -g @bradygaster/squad-cli@latest

# Pin to specific version
npm install -g @bradygaster/squad-cli@1.2.3

# Try insider channel (experimental features)
npm install -g @bradygaster/squad-cli@insider

# Show help and version info
squad help
```

---

## See Also

- [SDK Reference](./sdk.md) — Build squads with TypeScript
- [Remote Control Guide](../features/remote-control.md) — Phone/browser access
- [Troubleshooting Guide](../scenarios/troubleshooting.md) — Common issues and fixes
- [Getting Started](../getting-started/index.md) — First steps with Squad
