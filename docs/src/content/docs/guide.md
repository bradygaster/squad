# Squad — Product Guide

## What Is Squad?

Squad gives you an AI development team through GitHub Copilot. You describe what you're building. Squad proposes a team of specialists — lead, frontend, backend, tester — that live in your repo as files. Each agent runs in its own context window, reads its own knowledge, and writes back what it learned. They persist across sessions, share decisions, and get better the more you use them.

It is not a chatbot wearing hats. Each team member is spawned as a real sub-agent with its own tools, its own memory, and its own area of expertise.

---

## Which CLI should I use?

**Use GitHub Copilot CLI for day-to-day work.** It's the recommended interface for interacting with your Squad — full agent spawning, model selection, and conversational access to all features.

**Use Squad CLI for setup and operations:**
- Initial setup: `squad init`
- Diagnostics: `squad doctor`
- Continuous triage: `squad triage --interval 10`
- Aspire dashboard: `squad aspire`
- Export/import: `squad export` and `squad import`

**Common workflow:**
```bash
# Terminal 1: Run continuous triage (Squad CLI)
squad triage --interval 10

# Terminal 2: Work with your team (GitHub Copilot CLI)
gh copilot
> @squad what issues are ready to work?
```

Both CLIs read and write the same `.squad/` directory, so state stays synchronized. For more details, see [FAQ: Which CLI should I use?](guide/faq.md#which-cli-should-i-use) and [Client Compatibility Matrix](scenarios/client-compatibility.md).

---

## Supported Platforms

Squad works across multiple interfaces — GitHub Copilot CLI, VS Code, Squad CLI, SDK, and the Copilot Coding Agent. Pick the one that fits your workflow:

- **GitHub Copilot CLI** — Day-to-day conversational work with your squad (recommended)
- **VS Code** — Same experience, editor-integrated
- **Squad CLI** — Setup, diagnostics, monitoring (`squad init`, `squad doctor`, `squad watch`)
- **SDK** — Build tools on top of Squad
- **Copilot Coding Agent** — Autonomous issue processing via `@copilot`

Not sure which to use? See [Choose your interface](get-started/choose-your-interface.md) for a complete comparison and decision tree.

---

## Installation

```bash
npx github:bradygaster/squad
```

**Requirements:**
- Node.js 20+ (LTS)
- GitHub Copilot (CLI, VS Code, Visual Studio, or Coding Agent)
- A git repository (Squad stores team state in `.ai-team/`)
- **`gh` CLI** — required for GitHub Issues, PRs, Ralph, and Project Boards ([install](https://cli.github.com/))

This copies `squad.agent.md` into `.github/agents/`, installs 10 GitHub Actions workflows into `.github/workflows/`, and adds templates to `.ai-team-templates/`. Your actual team (`.ai-team/`) is created at runtime when you first talk to Squad.

**Note:** When you select Squad from the agent picker, you'll see the version number in the name (e.g., "Squad (v0.3.0)"). This helps you confirm which version is installed.

### GitHub CLI Authentication

Squad uses the `gh` CLI for all GitHub API operations — issues, PRs, labels, project boards, and Ralph's work monitoring. You must authenticate before using any of these features.

**Quick start:**

```bash
gh auth login
```

Choose **GitHub.com**, **HTTPS**, and authenticate with your browser or a Personal Access Token (PAT Classic).

**Verify it worked:**

```bash
gh auth status
```

**Additional scopes** — some features require scopes beyond the default:

| Feature | Required Scope | Command |
|---------|---------------|---------|
| Issues, PRs, Ralph | `repo` (included by default) | — |
| Project Boards | `project` | `gh auth refresh -s project` |

The `gh auth refresh` command adds scopes to your existing token — it takes about 10 seconds and you only need to do it once.

**Troubleshooting:**

- **"gh: command not found"** — Install the GitHub CLI from https://cli.github.com/
- **"HTTP 401" or "authentication required"** — Run `gh auth login` to re-authenticate
- **Project board commands fail** — Run `gh auth refresh -s project` to add the `project` scope
- **"Resource not accessible by integration"** — Your token may lack the `repo` scope. Re-authenticate with a PAT Classic that has `repo` and `project` scopes

---

## How Teams Form (Init Mode)

When you open Copilot and select **Squad** for the first time in a repo, there's no team yet. Squad enters Init Mode:

1. **Squad identifies you** via `git config user.name` and uses your name in conversation.
2. **You describe your project** — language, stack, what it does.
3. **Squad casts a team** — agents get names from a single fictional universe (e.g., The Usual Suspects, Alien, Ocean's Eleven). The universe is selected deterministically based on team size, project shape, and what's been used before. Names are persistent identifiers — they don't change the agent's behavior or voice.
4. **Squad proposes the team:**

```
🏗️  Ripley   — Lead          Scope, decisions, code review
⚛️  Dallas   — Frontend Dev  React, UI, components
🔧  Kane     — Backend Dev   APIs, database, services
🧪  Lambert  — Tester        Tests, quality, edge cases
📋  Scribe   — (silent)      Memory, decisions, session logs
```

5. **You confirm** — say "yes", adjust roles, add someone, or just give a task (which counts as implicit yes).

Squad then creates the `.ai-team/` directory structure with charters, histories, routing rules, casting state, and ceremony config. Each agent's `history.md` is seeded with your project description and tech stack so they have day-1 context.

### What gets created

```
.ai-team/
├── team.md                    # Roster — who's on the team
├── routing.md                 # Who handles what
├── ceremonies.md              # Team meeting definitions
├── decisions.md               # Shared brain — team decisions
├── decisions/inbox/           # Drop-box for parallel decision writes
├── casting/
│   ├── policy.json            # Universe allowlist and capacity
│   ├── registry.json          # Persistent agent name registry
│   └── history.json           # Universe usage history
├── agents/
│   ├── {name}/
│   │   ├── charter.md         # Identity, expertise, boundaries
│   │   └── history.md         # What they know about YOUR project
│   └── scribe/
│       └── charter.md         # Silent memory manager
├── skills/                    # Shared skill files (SKILL.md)
├── orchestration-log/         # Per-spawn log entries
└── log/                       # Session history
```

**Commit this folder.** Anyone who clones your repo gets the team — with all their accumulated knowledge.

---

## Talking to Your Team (Routing)

How you phrase your message determines who works on it.

### Name an agent directly

```
> Ripley, fix the error handling in the API
```

Squad spawns Ripley specifically.

### Say "team" for parallel fan-out

```
> Team, build the login page
```

Squad spawns multiple agents simultaneously — frontend builds the UI, backend sets up endpoints, tester writes test cases from the spec, all at once.

### General requests

```
> Add input validation to the form
```

Squad checks `routing.md`, picks the best match, and may launch anticipatory agents (e.g., tester writes validation test cases while the implementer builds).

### Quick questions — no spawn

```
> What port does the server run on?
```

Squad answers directly without spawning an agent.

### Example prompts to try

| You say | What happens |
|---------|-------------|
| `"Dallas, set up the project structure"` | Dallas (Frontend) scaffolds the project |
| `"Team, build the user dashboard"` | Multiple agents launch in parallel |
| `"Where are we?"` | Squad gives a quick status from recent logs |
| `"Run a retro"` | Lead facilitates a retrospective ceremony |
| `"I need a DevOps person"` | A new agent joins, named from the same universe |
| `"Always use single quotes in TypeScript"` | Captured as a directive to `decisions.md` |

---

## Response Modes

Squad automatically picks the right response speed based on your request complexity. Direct answers take seconds, full agent spawns take longer but deliver deeper reasoning and parallel work. You don't control the mode — Squad routes based on what the task needs.

→ [Full guide: Response Modes](features/response-modes.md)

---

## Memory System

Squad's memory is layered — personal agent histories, shared team decisions, and reusable skills. Knowledge compounds over sessions. After a few sessions, agents stop asking questions they've already answered. Mature projects carry full architecture knowledge and decision history.

→ [Full guide: Memory System](features/memory.md)

---

## Export and Import

Export creates a portable snapshot of your entire team — agents, knowledge, skills. Import brings that snapshot into another repo. Squad handles collision detection and splits imported knowledge into portable learnings and project-specific context automatically.

→ [Full guide: Export and Import](features/export-import.md#export--import)

---

## GitHub Issues Mode

Squad integrates with GitHub Issues for issue-driven development. Connect to a repo, view the backlog, assign issues to agents, and Squad handles branch creation, implementation, PR creation, and review feedback. Agents link work to issues automatically.

→ [Full guide: GitHub Issues Mode](features/github-issues.md#github-issues-mode)

---

## PRD Mode

Paste your product requirements document directly into Squad. The Lead agent decomposes the spec into discrete work items, assigns them to the right agents, and the team works in parallel. Specs become trackable tasks automatically.

→ [Full guide: PRD Mode](features/prd-mode.md#prd-mode)

---

## Human Team Members

Not every team member needs to be an AI agent. Add humans to the roster for decisions that require a real person — design sign-off, security review, product approval. Squad pauses when work is routed to a human and reminds you if they haven't responded.

→ [Full guide: Human Team Members](features/human-team-members.md#human-team-members)

---

## Notifications

Your squad can notify you when they need input — send instant pings to Teams, Discord, iMessage, or any webhook. Agents trigger notifications when they're blocked, need a decision, hit an error, or complete important work.

**Setup is quick:** Configure an MCP notification server (takes 5 minutes), and agents automatically know when to ping you.

See [Notifications Guide](features/notifications.md#quick-start-teams-simplest-path) for platform-specific setup and examples. For MCP configuration details, see [MCP Setup Guide](features/mcp.md#step-by-step-cli-setup).

---

## Ceremonies

Ceremonies are structured team meetings. Squad ships with two default ceremonies — Design Review (triggers before multi-agent work) and Retrospective (triggers after failures). You can trigger ceremonies manually, create custom ones, or disable them. Configuration lives in `.ai-team/ceremonies.md`.

→ [Full guide: Ceremonies](features/ceremonies.md#ceremonies)

---

## Upgrading

Already have Squad installed? Update to the latest version:

```bash
npx github:bradygaster/squad upgrade
```

This overwrites `squad.agent.md` and `.ai-team-templates/` with the latest versions. It **never touches `.ai-team/`** — your team's knowledge, decisions, casting state, and skills are safe.

Smart upgrade detects your installed version, reports what changed, and runs any needed migrations (e.g., creating `.ai-team/skills/` if it didn't exist). Migrations are additive and idempotent — safe to re-run.

---

## Context Budget

Each agent runs in its own context window. Real numbers:

| What | Tokens | % of 200K window |
|------|--------|-------------------|
| Coordinator (squad.agent.md) | ~13,200 | 6.6% |
| Agent at Week 1 (charter + seed history + decisions) | ~1,250 | 0.6% |
| Agent at Week 4 (+ 15 learnings, 8 decisions) | ~3,300 | 1.7% |
| Agent at Week 12 (+ 50 learnings, 47 decisions) | ~9,000 | 4.5% |
| **Remaining for actual work** | **~187,000** | **93%+** |

The coordinator uses 6.6% of its window. A 12-week veteran agent uses 4.5% — but in **its own window**, not yours. Fan out to 5 agents and you get ~1M tokens of total reasoning capacity across all windows.

---

## Known Limitations

- **Experimental** — file formats and APIs may change between versions.
- **Silent success bug** — approximately 7–10% of background agent spawns complete all their file writes but return no text response. This is a platform-level issue. Squad detects it by checking the filesystem for work product and reports what it finds. Work is not lost.
- **Platform latency** — response times depend on the Copilot platform. Complex multi-agent tasks take 40–60 seconds. Simple questions are answered in 2–3 seconds.
- **Node 20+** — requires a Node.js LTS release (v20.0.0 or later).
- **GitHub Copilot required** — Squad works across Copilot hosts (CLI, VS Code, Visual Studio, Coding Agent).
- **First session is the least capable** — agents improve as they accumulate history. Give it a few sessions before judging.

---

## Adding and Removing Team Members

### Adding

```
> I need a DevOps person
```

Squad allocates a name from the current universe, generates a charter and history seeded with project context, and adds them to the roster. Immediately productive.

### Removing

```
> Remove the designer — we're past that phase
```

Agents are never deleted. Their charter and history move to `.ai-team/agents/_alumni/`. Knowledge is preserved. If you need them back later, they remember everything.

---

## Reviewer Protocol

Agents with review authority can reject work. On rejection, the original author is locked out and a different agent must handle the revision. This prevents the common failure mode where an agent keeps fixing its own work in circles.

→ [Full guide: Reviewer Protocol](features/reviewer-protocol.md#reviewer-rejection-protocol)

---

## File Ownership

Squad maintains a clear ownership model:

| What | Owner | Safe to edit? |
|------|-------|--------------|
| `.github/agents/squad.agent.md` | Squad (overwritten on upgrade) | No — your changes will be lost |
| `.ai-team-templates/` | Squad (overwritten on upgrade) | No |
| `.ai-team/` | You and your team | Yes — this is your team's state |
| Everything else | You | Yes |

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `npx github:bradygaster/squad` | Install Squad in the current repo |
| `npx github:bradygaster/squad upgrade` | Update Squad-owned files to latest |
| `npx github:bradygaster/squad export` | Export team to `squad-export.json` |
| `npx github:bradygaster/squad import <file>` | Import team from export file |
| `npx github:bradygaster/squad import <file> --force` | Import, archiving existing agents |
| `npx github:bradygaster/squad --version` | Show installed version |
| `npx github:bradygaster/squad --help` | Show help |
