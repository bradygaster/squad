# Choose your interface

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Squad works across multiple interfaces. Pick the one that fits your workflow.

---

## Try this:

```bash
# Day-to-day work with your squad
copilot --agent squad

# Setup and diagnostics
squad init
squad doctor
```

---

## What are the ways to use Squad?

Squad runs in multiple modes and across multiple platforms:

### GitHub Copilot CLI (`copilot` command)

The conversational terminal interface. Powered by the GitHub Copilot CLI, this is the recommended way to work with Squad day-to-day.

```bash
copilot --agent squad
```

Reads `.squad/` and uses `squad.agent.md` to coordinate your team. Full feature set — sub-agent spawning, per-spawn model selection, background execution, SQL tools, parallel fan-out.

### VS Code (GitHub Copilot in the editor)

Squad works identically in VS Code through GitHub Copilot. Same `.squad/` directory, same agents, same decisions. Full file access, parallel execution, MCP tool inheritance. See [Squad in VS Code](../features/vscode.md) for details.

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

REPL mode for conversational interaction directly via the Squad CLI. Enter `squad` with no arguments to start a persistent shell session. See [Interactive Shell Guide](../guide/shell.md).

This works, but **GitHub Copilot CLI is recommended** — richer agent experience, better tools, full MCP integration.

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
| **Work with your squad day-to-day** | **GitHub Copilot CLI** or **VS Code** | Conversational interface, full agent spawning, parallel execution. Most natural way to collaborate with your team. |
| **Set up Squad in a new repo** | **Squad CLI** (`squad init`) | One command initializes `.squad/` directory and all configuration. |
| **Check if Squad is working** | **Squad CLI** (`squad doctor`) | Validates directory structure, agents, configuration integrity. |
| **Monitor work 24/7** | **Squad CLI** (`squad watch`) | Persistent polling for new issues, auto-triage, agent assignment. |
| **View OpenTelemetry traces** | **Squad CLI** (`squad aspire`) | Launches Aspire dashboard for observability. |
| **Process issues autonomously** | **Copilot Coding Agent** | GitHub Actions workflow watches for labeled issues and dispatches `@copilot`. |
| **Build tools on top of Squad** | **SDK** | Typed APIs, configuration loading, agent lifecycle hooks. |

---

## Feature availability matrix

Not every feature works everywhere. Here's what's available where:

| Feature | GitHub Copilot CLI | VS Code | Squad CLI | SDK |
|---------|:------------------:|:-------:|:---------:|:---:|
| Agent spawning | ✅ | ✅ | ✅ (via shell) | ✅ |
| Ralph / work monitoring | ✅ | ✅ | ✅ (`squad watch`) | ✅ |
| Per-spawn model selection | ✅ | ⚠️ (session model only) | ✅ | ✅ |
| Background execution | ✅ | ⚠️ (parallel sync) | ✅ | ✅ |
| SQL tool | ✅ | ❌ | ✅ | ✅ |
| Aspire dashboard | ❌ | ❌ | ✅ | ❌ |
| `squad doctor` diagnostics | ❌ | ❌ | ✅ | ✅ |
| Issue assignment to `@copilot` | ❌ | ❌ | ✅ (setup) | ❌ |

**Legend:**
- ✅ Fully supported
- ⚠️ Limited or constrained
- ❌ Not available

For a detailed breakdown of VS Code constraints and CLI parity, see [Client Compatibility Matrix](../scenarios/client-compatibility.md).

---

## Common workflows

### "I use GitHub Copilot CLI for everything"

```bash
# Terminal 1: Work with Squad
copilot --agent squad

# Let Squad call `squad` commands when needed (doctor, watch, aspire)
```

This is the recommended workflow. The CLI automatically invokes Squad CLI commands when needed.

### "I run squad watch in one terminal and use GitHub Copilot CLI in another"

```bash
# Terminal 1: Monitoring (persistent)
squad watch --interval 10

# Terminal 2: Work with Squad
copilot --agent squad
```

Keep Ralph monitoring issues in the background while you work conversationally.

### "I use VS Code with Copilot for coding and Squad CLI for setup"

```bash
# One-time setup
squad init
squad doctor

# Open VS Code, select Squad from agent picker
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
