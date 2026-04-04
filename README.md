# Squad

[English](README.md) | [中文](README.zh.md)

**AI agent teams for any project.** One command. A team that grows with your code.

[![Status](https://img.shields.io/badge/status-alpha-blueviolet)](#status)
[![Platform](https://img.shields.io/badge/platform-GitHub%20Copilot-blue)](#what-is-squad)

> ⚠️ **Alpha Software** — Squad is experimental. APIs and CLI commands may change between releases. We'll document breaking changes in [CHANGELOG.md](CHANGELOG.md).

---

## What is Squad?

Squad gives you an AI development team through GitHub Copilot. Describe what you're building. Get a team of specialists — frontend, backend, tester, lead — that live in your repo as files. They persist across sessions, learn your codebase, share decisions, and get better the more you use them.

It's not a chatbot wearing hats. Each team member runs in its own context, reads only its own knowledge, and writes back what it learned.

---

## Quick Start

### 1. Create your project

```bash
mkdir my-project && cd my-project
git init
```

**✓ Validate:** Run `git status` — you should see "No commits yet".

### 2. Install Squad

```bash
npm install -g @bradygaster/squad-cli
squad init
```

**✓ Validate:** Check that `.squad/team.md` was created in your project.

### 3. Authenticate with GitHub (for Issues, PRs, and Ralph)

```bash
gh auth login
```

**✓ Validate:** Run `gh auth status` — you should see "Logged in to github.com".

### 4. Open Copilot and go

```
copilot --agent squad --yolo
```

> **Why `--yolo`?** Squad makes many tool calls in a typical session. Without it, Copilot will prompt you to approve each one.

**In VS Code**, open Copilot Chat and select the **Squad** agent.

Then:

```
I'm starting a new project. Set up the team.
Here's what I'm building: a recipe sharing app with React and Node.
```

**✓ Validate:** Squad responds with team member proposals. Type `yes` to confirm — they're ready to work.

Squad proposes a team — each member named from a persistent thematic cast. You say **yes**. They're ready.

---

## Upgrading

Upgrading Squad is a two-step process.

**Step 1: Update the CLI binary**

```bash
npm install -g @bradygaster/squad-cli@latest
```

**Step 2: Update Squad-owned files in your project**

```bash
squad upgrade
```

`squad upgrade` updates `squad.agent.md`, templates, and GitHub workflows to the latest versions. It never touches your `.squad/` team state — your agents, decisions, and history are always preserved.

Use `--force` to re-apply updates even when your installed version already matches the latest.

---

## All Commands (17 commands)

| Command | What it does |
|---------|-------------|
| `squad init` | **Init** — scaffold Squad in the current directory (idempotent — safe to run multiple times); alias: `hire`; use `--global` to init in personal squad directory, `--mode remote <path>` for dual-root mode |
| `squad upgrade` | Update Squad-owned files to latest; never touches your team state; use `--global` to upgrade personal squad, `--migrate-directory` to rename `.ai-team/` → `.squad/` |
| `squad upgrade --self` | Update the Squad CLI package itself; add `--insider` for prerelease builds |
| `squad status` | Show which squad is active and why |
| `squad triage` | Watch issues and auto-triage to team (aliases: `watch`, `loop`); use `--interval <minutes>` to set polling frequency (default: 10) |
| `squad copilot` | Add/remove the Copilot coding agent (@copilot); use `--off` to remove, `--auto-assign` to enable auto-assignment |
| `squad doctor` | Check your setup and diagnose issues (alias: `heartbeat`) |
| `squad link <team-repo-path>` | Connect to a remote team |
| `squad externalize` | Move `.squad/` state outside the working tree; survives branch switches; use `--key <name>` for custom project key |
| `squad internalize` | Move externalized state back into `.squad/` |
| `squad shell` | Launch interactive shell explicitly |
| `squad export` | Export squad to a portable JSON snapshot |
| `squad import <file>` | Import squad from an export file |
| `squad plugin marketplace add\|remove\|list\|browse` | Manage plugin marketplaces |
| `squad upstream add\|remove\|list\|sync` | Manage upstream Squad sources |
| `squad nap` | Context hygiene — compress, prune, archive; use `--deep` for aggressive compression, `--dry-run` to preview changes |
| `squad aspire` | Open Aspire dashboard for observability |
| `squad scrub-emails [directory]` | Remove email addresses from Squad state files (default: `.squad/`) |

---

## Interactive Shell

Tired of typing `squad` followed by a command every time? Enter the interactive shell.

### Entering the Shell

```bash
squad
```

No arguments. Just `squad`. You'll get a prompt:

```
squad >
```

You're now connected to your team. Talk to them.

### Shell Commands

All shell commands start with `/`:

| Command | What it does |
|---------|-------------|
| `/status` | Check your team and what's happening |
| `/history` | See recent messages |
| `/agents` | List all team members |
| `/sessions` | List saved sessions |
| `/resume <id>` | Restore a past session |
| `/version` | Show version |
| `/clear` | Clear the screen |
| `/help` | Show all commands |
| `/quit` | Exit the shell (or Ctrl+C) |

### Talking to Agents

Use `@AgentName` (case-insensitive) or natural language with a comma:

```
squad > @Keaton, analyze the architecture of this project
squad > McManus, write a blog post about our new feature
squad > Build the login page
```

The coordinator routes messages to the right agents. Multiple agents can work in parallel—you'll see progress in real-time.

### What the Shell Does

- **Real-time visibility:** See agents working, decisions being recorded, blockers as they happen
- **Message routing:** Describe what you need; the coordinator figures out who should do it
- **Parallel execution:** Multiple agents work simultaneously on independent tasks
- **Session persistence:** If an agent crashes, it resumes from checkpoint; you never lose context
- **Decision logging:** Every decision is recorded in `.squad/decisions.md` for the whole team to see

For more details on shell usage, see the commands table above.

## Samples

Eight working examples from beginner to advanced — casting, governance, streaming, Docker. See [samples/README.md](samples/README.md).

---

## Agents Work in Parallel— You Catch Up When You're Ready

Squad doesn't work on a human schedule. When you give a task, the coordinator launches every agent that can usefully start — simultaneously.

```
You: "Team, build the login page"

  🏗️ Lead — analyzing requirements...          ⎤
  ⚛️ Frontend — building login form...          ⎥ all launched
  🔧 Backend — setting up auth endpoints...     ⎥ in parallel
  🧪 Tester — writing test cases from spec...   ⎥
  📋 Scribe — logging everything...             ⎦
```

When agents finish, the coordinator immediately chains follow-up work. If you step away, a breadcrumb trail is waiting when you get back:

- **`decisions.md`** — every decision any agent made
- **`orchestration-log/`** — what was spawned, why, and what happened
- **`log/`** — full session history, searchable

**Knowledge compounds across sessions.** Every time an agent works, it writes lasting learnings to its `history.md`. After a few sessions, agents know your conventions, your preferences, your architecture. They stop asking questions they've already answered.

**And it's all in git.** Anyone who clones your repo gets the team — with all their accumulated knowledge.

---

## What Gets Created

```
.squad/
├── team.md              # Roster — who's on the team
├── routing.md           # Routing — who handles what
├── decisions.md         # Shared brain — team decisions
├── ceremonies.md        # Sprint ceremonies config
├── casting/
│   ├── policy.json      # Casting configuration
│   ├── registry.json    # Persistent name registry
│   └── history.json     # Universe usage history
├── agents/
│   ├── {name}/
│   │   ├── charter.md   # Identity, expertise, voice
│   │   └── history.md   # What they know about YOUR project
│   └── scribe/
│       └── charter.md   # Silent memory manager
├── skills/              # Compressed learnings from work
├── identity/
│   ├── now.md           # Current team focus
│   └── wisdom.md        # Reusable patterns
└── log/                 # Session history (searchable archive)
```

**Commit this folder.** Your team persists. Names persist. Anyone who clones gets the team — with the same cast.

### SDK-First Mode (New in Phase 1)

> ⚠️ **Experimental.** SDK-first mode is under active development and has known bugs. Use markdown-first (the default) for production teams.

Prefer TypeScript? You can define your team in code instead of markdown. Create a `squad.config.ts` with builder functions, run `squad build`, and the `.squad/` files are generated automatically.

```typescript
// squad.config.ts
import { defineSquad, defineTeam, defineAgent } from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({ name: 'Platform Squad', members: ['@edie', '@mcmanus'] }),
  agents: [
    defineAgent({ name: 'edie', role: 'TypeScript Engineer', model: 'claude-sonnet-4' }),
    defineAgent({ name: 'mcmanus', role: 'DevRel', model: 'claude-haiku-4.5' }),
  ],
});
```

Run `squad build` to generate all the markdown. See the [SDK-First Mode Guide](docs/src/content/docs/sdk-first-mode.md) for full documentation.

---

## Monorepo Development

Squad is a monorepo with two packages:
- **`@bradygaster/squad-sdk`** — Core runtime and library for programmable agent orchestration
- **`@bradygaster/squad-cli`** — Command-line interface that depends on the SDK

### Building

```bash
# Install dependencies (npm workspaces)
npm install

# Build TypeScript to dist/
npm run build

# Build CLI bundle (dist/ + esbuild → cli.js)
npm run build:cli

# Watch mode for development
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Linting

```bash
# Type check (no emit)
npm run lint
```

### Publishing

Squad uses [changesets](https://github.com/changesets/changesets) for independent versioning across packages:

```bash
# Add a changeset
npx changeset add

# Validate changesets
npm run changeset:check
```

Changesets are resolved on the `main` branch; releases happen independently per package.

---

## SDK documentation

The SDK provides programmatic control over agent orchestration — custom tools, hook pipelines, file-write guards, PII scrubbing, reviewer lockout, and event-driven monitoring.

- [SDK API reference](docs/src/content/docs/reference/sdk.md)
- [Custom tools and hooks guide](docs/src/content/docs/reference/tools-and-hooks.md)
- [Extensibility guide](docs/src/content/docs/guide/extensibility.md)
- [Samples](samples/README.md) — eight working examples from beginner to advanced

For SDK installation: `npm install @bradygaster/squad-sdk`
