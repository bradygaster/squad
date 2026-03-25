# Choose your path

> ⚠️ **Experimental** - Squad is alpha software. APIs, commands, and behavior may change between releases.

CLI, provider agent (Copilot or Claude Code), or SDK? Pick the right mode for your workflow.

---

## Three modes

### CLI mode

Install Squad globally or per-project, then use terminal commands to initialize, route work, and manage your team.

```bash
npm install -g @bradygaster/squad-cli
squad init
squad status
squad watch
```

**Use for:** Terminal workflows, automation scripts, CI/CD integration.

---

### Provider agent mode (Copilot or Claude Code)

Talk to Squad in GitHub Copilot CLI, Claude Code CLI, or VS Code. Squad is built-in as an agent. Your `.squad/` directory works identically to CLI mode.

```bash
# Copilot
copilot --agent squad

# Claude Code
claude --agent squad
```

**Use for:** Conversational workflows, exploratory work, VS Code users.

---

### SDK mode

Write TypeScript code that spawns agents, routes work, and coordinates teams programmatically. Full access to Squad's internals.

```bash
npm install @bradygaster/squad-sdk
```

```typescript
import { Coordinator } from '@bradygaster/squad-sdk';

const coordinator = new Coordinator();
const result = await coordinator.route('Build a login page');
```

**Use for:** Building tools on Squad, custom integrations, advanced automation.

---

## Decision table

| **Your goal** | **Use** |
|---------------|---------|
| Try Squad quickly | **Provider agent** (Copilot or Claude Code) |
| Work in the terminal | **CLI** or **Provider agent** |
| Work in VS Code | **Provider agent** |
| Automate repetitive tasks | **CLI** or **SDK** |
| Build custom tooling | **SDK** |
| CI/CD integration | **CLI** or **SDK** |

---

## Can I use multiple modes?

Yes. Your `.squad/` directory is the source of truth. CLI, provider agent (Copilot or Claude Code), and SDK all read and write the same files. You can switch between modes anytime.

Example workflow:
1. Use **Copilot agent** to form your team and do exploratory work
2. Use **CLI** (`squad watch`) to monitor issues in the background
3. Use **SDK** to build a custom deployment script that spawns agents

All three modes share the same memory and decisions.
