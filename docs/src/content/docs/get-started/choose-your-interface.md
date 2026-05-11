# Choose your interface

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Squad works across multiple interfaces. Pick the one that fits your workflow.

---

## Try this:

```bash
# Day-to-day work with your squad (pick your agent CLI)
copilot --agent squad   # GitHub Copilot CLI
claude                  # Claude Code
gemini                  # Gemini CLI
opencode                # OpenCode

# Setup and diagnostics
squad init
squad doctor
```

---

## What are the ways to use Squad?

Squad runs in multiple modes and across multiple platforms:

### Agent CLIs

The conversational terminal interface. Squad works with multiple agent CLIs — pick whichever fits your workflow:

| Agent CLI | Command | Notes |
|-----------|---------|-------|
| **GitHub Copilot CLI** | `copilot --agent squad` | Auto-discovers `squad.agent.md`. Full sub-agent spawning, background execution, SQL tools. |
| **Claude Code** | `claude` | Point to `.github/agents/squad.agent.md` on first use. |
| **Gemini CLI** | `gemini` | Point to `.github/agents/squad.agent.md` on first use. |
| **OpenCode** | `opencode` | Point to `.github/agents/squad.agent.md` on first use. |

All CLIs read the same `.squad/` directory and use the same `squad.agent.md` to coordinate your team.

### VS Code

Squad works in VS Code through any AI assistant that supports agent files. Same `.squad/` directory, same agents, same decisions. Full file access, parallel execution, MCP tool inheritance. See [Squad in VS Code](../features/vscode.md) for details.

### Squad CLI (`squad` command)

The Squad CLI provides setup, diagnostics, and automation commands. Not conversational — use this for installation, validation, and operational tasks.

```bash
# Setup
squad init

# Validation
squad doctor

# Monitoring
squad watch

# Observability
squad aspire
```

See [CLI Reference](../reference/cli.md) for all commands.

### Interactive shell (`squad start` / `squad shell`)

> ⚠️ **Deprecated:** The interactive shell is no longer recommended. Use your preferred agent CLI instead for a richer agent experience.

REPL mode for conversational interaction directly via the Squad CLI. Enter `squad` with no arguments to start a persistent shell session.

### SDK (`@bradygaster/squad-sdk`)

Programmatic access for building tools on top of Squad. Typed APIs, routing config, agent lifecycle hooks.

```bash
npm install @bradygaster/squad-sdk
```

```typescript
import { resolveSquad, loadConfig, SquadCoordinator } from '@bradygaster/squad-sdk';
```

See [SDK Reference](../reference/sdk.md) for the complete API.

### Copilot Coding Agent (`@copilot`)

Autonomous GitHub bot that picks up labeled issues and opens draft PRs. Works across your entire organization without human intervention. Issue gets labeled → agent picks it up → PR gets opened → human reviews.

See [Copilot Coding Agent](../features/copilot-coding-agent.md) for setup.

---

## Which should I use?

| You want to... | Use | Why |
|----------------|-----|-----|
| **Work with your squad day-to-day** | **Any agent CLI** or **VS Code** | Conversational interface, full agent spawning, parallel execution. Most natural way to collaborate with your team. |
| **Set up Squad in a new repo** | **Squad CLI** (`squad init`) | One command initializes `.squad/` directory and all configuration. |
| **Check if Squad is working** | **Squad CLI** (`squad doctor`) | Validates directory structure, agents, configuration integrity, and detects installed agent CLIs. |
| **Monitor work 24/7** | **Squad CLI** (`squad watch`) | Persistent polling for new issues, auto-triage, agent assignment. Works with any agent CLI via `--agent-cmd`. |
| **View OpenTelemetry traces** | **Squad CLI** (`squad aspire`) | Launches Aspire dashboard for observability. |
| **Process issues autonomously** | **Copilot Coding Agent** | GitHub Actions workflow watches for labeled issues and dispatches `@copilot`. |
| **Build tools on top of Squad** | **SDK** | Typed APIs, configuration loading, agent lifecycle hooks. |

---

## Feature availability matrix

Not every feature works everywhere. Here's what's available where:

| Feature | Copilot CLI | Claude Code | Gemini CLI | OpenCode | VS Code | Squad CLI | SDK |
|---------|:----------:|:-----------:|:----------:|:--------:|:-------:|:---------:|:---:|
| Agent spawning | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ralph / work monitoring | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (`squad watch`) | ✅ |
| Per-spawn model selection | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ | ✅ |
| Background execution | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Aspire dashboard | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `squad doctor` diagnostics | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

**Legend:**
- ✅ Fully supported
- ⚠️ Limited or constrained
- ❌ Not available

For a detailed breakdown of VS Code constraints and CLI parity, see [Client Compatibility Matrix](../scenarios/client-compatibility.md).

---

## Common workflows

### "I use one agent CLI for everything"

```bash
# Terminal 1: Work with Squad (pick your CLI)
copilot --agent squad   # or: claude, gemini, opencode

# Let Squad call `squad` commands when needed (doctor, watch, aspire)
```

The recommended workflow. Your agent CLI reads `squad.agent.md` and orchestrates the team.

### "I run squad watch in one terminal and my agent CLI in another"

```bash
# Terminal 1: Monitoring (persistent, auto-detects your agent CLI)
squad watch --interval 10

# Terminal 2: Work with Squad
claude   # or: copilot --agent squad, gemini, opencode
```

Keep Ralph monitoring issues in the background while you work conversationally.

### "I use VS Code for coding and Squad CLI for setup"

```bash
# One-time setup
squad init
squad doctor

# Open VS Code, select Squad from agent picker (or point your AI assistant to squad.agent.md)
# Same .squad/ directory, same team
```

Initialize with CLI, work in VS Code.

---

## See also

- [Installation](installation.md) — Install Squad CLI, SDK, or use in VS Code
- [First Session](first-session.md) — Get started with your first Squad conversation
- [Client Compatibility Matrix](../scenarios/client-compatibility.md) — Full feature comparison across platforms
- [CLI Reference](../reference/cli.md) — All Squad CLI commands
- [Squad in VS Code](../features/vscode.md) — VS Code-specific guidance
- [SDK Reference](../reference/sdk.md) — Programmatic API
