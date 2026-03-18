# Choose your path

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

CLI, Copilot agent, or SDK? Pick the right mode for your workflow.

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

### Copilot agent mode

Talk to Squad in GitHub Copilot CLI or VS Code. Squad is built-in as an agent. Your `.squad/` directory works identically to CLI mode.

```bash
copilot
> /agent Squad

Squad: Hey Brady, what are you building?
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
| Try Squad quickly | **Copilot agent** — no install |
| Work in the terminal | **CLI** |
| Work in VS Code | **Copilot agent** |
| Automate repetitive tasks | **CLI** or **SDK** |
| Build custom tooling | **SDK** |
| CI/CD integration | **CLI** or **SDK** |

---

## Can I use multiple modes?

Yes. Your `.squad/` directory is the source of truth. CLI, Copilot agent, and SDK all read and write the same files. You can switch between modes anytime.

Example workflow:
1. Use **Copilot agent** to form your team and do exploratory work
2. Use **CLI** (`squad watch`) to monitor issues in the background
3. Use **SDK** to build a custom deployment script that spawns agents

All three modes share the same memory and decisions.
