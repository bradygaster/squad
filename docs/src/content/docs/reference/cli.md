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

## CLI Commands (16 commands)

| Command | Description | Requires `.squad/` |
|---------|-------------|:------------------:|
| `squad` | Enter interactive shell (no args) | No |
| `squad init` | Initialize Squad in the current repo (idempotent — safe to run multiple times) | No |
| `squad init --global` | Create a personal squad in your platform-specific directory | No |
| `squad init --mode remote <path>` | Initialize linked to a remote team root (dual-root mode) | No |
| `squad start [--tunnel] [--port N] [--command cmd]` | Start Copilot with remote phone access via PTY and WebSocket | No |
| `squad status` | Show which squad is active and why | Yes |
| `squad doctor` | Validate squad setup integrity and diagnose issues (alias: `heartbeat`) | Yes |
| `squad upgrade` | Upgrade Squad-owned files to latest version | Yes |
| `squad upgrade --migrate-directory` | Rename legacy `.ai-team/` directory to `.squad/` | Yes |
| `squad link <team-repo-path>` | Link project to a remote team root | Yes |
| `squad triage` | Auto-triage issues and assign to team (primary name; `watch` is an alias) | Yes |
| `squad triage --interval <min>` | Continuous triage (default: every 10 min) | Yes |
| `squad copilot` | Add the @copilot coding agent to the team | Yes |
| `squad copilot --off` | Remove @copilot from the team | Yes |
| `squad copilot --auto-assign` | Enable auto-assignment for @copilot | Yes |
| `squad plugin marketplace add\|remove\|list\|browse` | Manage plugin marketplaces | Yes |
| `squad export` | Export squad to a portable JSON snapshot | Yes |
| `squad export --out <path>` | Export to a custom path | Yes |
| `squad import <file>` | Import a squad from an export file | No |
| `squad import <file> --force` | Replace existing squad (archives the old one) | No |
| `squad aspire` | Launch Aspire dashboard for observability | No |
| `squad aspire --docker` | Force Docker mode for Aspire | No |
| `squad upstream add\|remove\|list\|sync` | Manage upstream Squad sources | Yes |
| `copilot --agent squad` | Launch interactive shell explicitly | No |
| `squad nap` | Context hygiene (compress, prune, archive .squad/ state) | Yes |
| `squad nap --deep` | Thorough cleanup with recursive descent | Yes |
| `squad nap --dry-run` | Preview cleanup actions without changes | Yes |
| `squad scrub-emails [directory]` | Remove email addresses from Squad state files (default: `.squad/`) | No |
| `squad --version` | Print installed version | No |

### Remote Init Mode

Use `--mode remote` to link your project to a shared team root:

```bash
squad init --mode remote ../team-repo
```

In dual-root mode, project-specific state lives in your local `.squad/` while team identity (casting, charters, shared decisions) lives in the remote location. This is useful for monorepos or organizations with a shared team definition.

---

### squad start

Start Copilot with optional remote access via phone. Spawns Copilot in a PTY and mirrors to your phone via WebSocket + devtunnel.

**Flags:**

- `--tunnel` — Create a devtunnel for remote access (shows QR code for phone scanning). Requires `devtunnel` CLI installed and authenticated (`devtunnel user login`).
- `--port <N>` — Specific WebSocket port (default: random). Example: `--port 3456`
- `--command <cmd>` — Run a custom command instead of copilot. Example: `--command powershell`
- All copilot flags pass through. Example: `squad start --tunnel --yolo` or `squad start --tunnel --model gpt-4`

**Examples:**

```bash
# Basic local PTY (no phone access)
squad start

# With phone access + devtunnel
squad start --tunnel
# Output: QR Code, URL, Session ID

# Custom port, local only
squad start --port 3456

# Custom command with tunnel
squad start --tunnel --command powershell

# Copilot flags pass through
squad start --tunnel --yolo
squad start --tunnel --model gpt-4 --no-config
```

For details on architecture, security, mobile keyboard, and troubleshooting, see [Remote Control Guide](../features/remote-control.md).

---

## Interactive Shell

Enter the shell with `squad` (no arguments). You'll see:

```
squad >
```

### Shell Commands

All shell commands start with `/`.

| Command | What it does |
|---------|-------------|
| `/status` | Show active agents, sessions, recent decisions |
| `/history` | View session log — tasks, decisions, agent work |
| `/agents` | List team members with roles and expertise |
| `/sessions` | List saved sessions |
| `/resume <id>` | Restore a past session |
| `/version` | Show version |
| `/clear` | Clear terminal output |
| `/help` | Show all commands |
| `/quit` | Exit the shell (also: `Ctrl+C`) |

### Addressing Agents

```
squad > @Keaton, analyze the architecture
squad > Keaton, set up the database schema
squad > Build a blog post about our casting system
```

Agent name matching is **case-insensitive** — `@keaton`, `@Keaton`, and `@KEATON` all route to the same agent. Name an agent to route directly. Omit the name and the coordinator routes to the best fit.

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

### `.squad/` Directory Structure

```
.squad/
├── team.md              # Roster — agent names, roles, human members
├── routing.md           # Work routing rules
├── decisions.md         # Architectural decisions log
├── directives.md        # Permanent team rules and conventions
├── casting-state.json   # Agent names, universe theme
├── model-config.json    # Per-agent model overrides
├── ceremonies.md        # Team ceremonies and rituals
├── skills/              # Reusable knowledge (markdown files)
│   ├── auth-rate-limiting.md
│   └── ...
├── agents/
│   ├── neo/
│   │   ├── charter.md   # Role definition, expertise, tools
│   │   └── history.md   # Accumulated knowledge
│   └── ...
└── history-archive/     # Archived old session logs
```

### `team.md`

Defines the roster. Squad generates this during init, but you can edit it:

```markdown
## Team

🏗️  Neo      — Lead          Scope, decisions, code review
⚛️  Trinity  — Frontend Dev  React, TypeScript, UI
🔧  Morpheus — Backend Dev   Node.js, Express, Prisma
🧪  Tank     — Tester        Jest, integration tests
📋  Scribe   — (silent)      Memory, decisions, session logs

## Human Team Members

- **Sarah** — Senior Backend Engineer
- **Jamal** — Frontend Lead
```

### `routing.md`

Controls which agent gets which work:

```markdown
# Routing Rules

**Frontend changes** → Trinity
**Backend API work** → Morpheus
**Database migrations** → Morpheus
**Test writing** → Tank
**Architecture decisions** → Neo
**Backend architecture decisions** → Sarah (human)
```

### `decisions.md`

Append-only log of architectural decisions. Agents read this before every task:

```markdown
### 2025-07-15: Use Zod for API validation
**By:** Morpheus
**What:** All API input validation uses Zod schemas
**Why:** Type-safe, composable, generates TypeScript types
```

### `directives.md`

Permanent rules agents always follow:

```markdown
- Always use TypeScript strict mode
- No any/unknown casts
- All database queries through Prisma, no raw SQL
```

---

## Resolution Order

When Squad starts, it looks for `.squad/` in this order:

1. Current directory (`./.squad/`)
2. Parent directories (walk up to project root)
3. Personal squad directory (platform-specific: `~/.config/squad/` on Linux, `~/Library/Application Support/squad/` on macOS, `%APPDATA%\squad\` on Windows)
4. Global CLI default (fallback only)

First match wins.

---

## Environment Variables

| Variable | Purpose | Values |
|----------|---------|--------|
| `SQUAD_CLIENT` | Detected client platform | `cli`, `vscode` |
| `COPILOT_TOKEN` | Copilot auth token (SDK usage) | Token string |

---

---

## Troubleshooting with `squad doctor`

When something isn't working, run:

```bash
squad doctor
```

This performs a comprehensive diagnostic check of your Squad setup, validating:

- `.squad/` directory structure
- `config.json` validity and `teamRoot` configuration (if present)
- Team root resolution (remote mode)
- Required files: `team.md`, `routing.md`, `decisions.md`
- `agents/` directory and agent count
- `casting/registry.json` integrity

### Usage Examples

```bash
# Run diagnostics on the current project
squad doctor

# Quick check after upgrading Squad
squad upgrade && squad doctor

# Verify setup after cloning a repo with a squad
git clone my-project && cd my-project && squad doctor
```

### Example Output

```
🩺 Squad Doctor
═══════════════

Mode: local

✅  .squad/ directory exists — directory present
✅  team.md found with ## Members header — file present, header found
✅  routing.md found — file present
✅  agents/ directory exists — directory present (4 agents)
✅  casting/registry.json exists — file present, valid JSON
✅  decisions.md exists — file present

Summary: 6 passed, 0 failed, 0 warnings
```

The doctor always exits cleanly (exit code 0) because it's a diagnostic tool, not a gate. Use it to troubleshoot setup issues, validate team state, or run before opening an issue on GitHub.

For a full reference of every check, warning, and fix, see [Troubleshooting: `squad doctor` warnings and failures](../scenarios/troubleshooting.md#squad-doctor-warnings-and-failures).

### Common Issues

**Absolute path warning for teamRoot:**

If you see `⚠ teamRoot uses absolute path — consider making it relative`, it means your `squad.config.ts` or `.squad/config.json` contains an absolute path like `C:\Users\me\squad\` or `/Users/me/squad/`. This breaks portability.

**Fix:** Make the path relative to your project root:
```json
{
  "teamRoot": ".squad"
}
```

For linked teams (dual-root mode), use a relative path:
```json
{
  "teamRoot": "../team-repo/.squad"
}
```

See [FAQ: squad doctor complains about absolute path for teamRoot](../guide/faq.md#squad-doctor-complains-about-absolute-path-for-teamroot) for details.

---

## Version Management

```bash
squad --version                              # Check version
npm install -g @bradygaster/squad-cli@latest # Update
npm install -g @bradygaster/squad-cli@1.2.3  # Pin version
npm install -g @bradygaster/squad-cli@insider # Insider builds
```

---

## See Also

- [SDK Reference](./sdk.md) — Programmatic API
- [Recipes & Advanced Scenarios](../cookbook/recipes.md) — Prompt-driven cookbook
- [Adding Squad to an Existing Repo](../scenarios/existing-repo.md) — Getting started walkthrough
