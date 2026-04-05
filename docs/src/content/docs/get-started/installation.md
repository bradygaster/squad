# Installation

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


Three ways to get Squad running. Pick the one that fits.

---

## Try this:

```bash
npm install -g @bradygaster/squad-cli
squad
```

That's it. You're in.

---

## 1. CLI (Recommended)

The CLI is the fastest way to use Squad from any terminal.

### Global install

```bash
npm install -g @bradygaster/squad-cli
```

Now use it anywhere:

```bash
squad init
squad status
squad watch
```

### One-off approach

Already installed globally? Just run:

```bash
squad init
squad status
```

No reinstall needed for each project.

### Verify

```bash
squad --version
```

### Update

```bash
npm install -g @bradygaster/squad-cli@latest
```

---

## Which method should I use?

Pick based on what you're doing:

| **You want to...** | **Use** | **Why** |
|--------------------|---------|---------|
| Try Squad quickly | **CLI** with `npm install -g` | Install once: `npm install -g @bradygaster/squad-cli`. Then run `squad init` and you're testing it. |
| Use Squad across all projects | **CLI** with `--global` | One install. Works everywhere. Run `squad` from any terminal. |
| Work inside VS Code | **VS Code** (just open your project) | Already using Copilot? Squad just works. Same `.squad/` directory as CLI. |
| Build tools on top of Squad | **SDK** | Typed APIs, routing config, agent lifecycle hooks. Programmatic access to everything. |

Can't decide? → Start with **CLI**. You can always add VS Code or the SDK later. Your `.squad/` directory works identically everywhere.

---

## 2. VS Code

Squad works in VS Code through GitHub Copilot. Your `.squad/` directory works identically in both CLI and VS Code — same agents, same decisions, same memory.

> **Tip:** Initialize your team with the CLI (`squad`), then open the project in VS Code to keep working with the same squad.

---

## 3. SDK

Building your own tooling on top of Squad? Install the SDK as a project dependency:

```bash
npm install @bradygaster/squad-sdk
```

Then import what you need:

```typescript
import { defineConfig, loadConfig, resolveSquad } from '@bradygaster/squad-sdk';
```

The SDK gives you typed configuration, routing, model selection, and the full agent lifecycle API. See the [SDK Reference](../reference/sdk.md) for details.

---

### Personal squad (cross-project)

Want the same agents across all your projects?

```bash
squad init --global
```

This creates your personal squad directory — a personal team root that any project can inherit from. See [Upstream Inheritance](../features/upstream-inheritance.md) for details.

**Personal squad location by platform:**

| Platform | Path |
|----------|------|
| Linux | `~/.config/squad/` |
| macOS | `~/Library/Application Support/squad/` |
| Windows | `%APPDATA%\squad\` |

---

## First-Time Setup

After installing, initialize Squad in your project:

```bash
cd your-project
squad init
```

This creates:

```
.github/agents/squad.agent.md  — coordinator agent
.squad/                        — team state directory
```

### Configuration (optional)

For typed configuration, create a `squad.config.ts` at your project root:

```typescript
import { defineConfig } from '@bradygaster/squad-sdk';

export default defineConfig({
  team: {
    name: 'my-squad',
    root: '.squad',
    description: 'My project team',
  },
});
```

`defineConfig()` gives you full autocomplete and validation. But you don't need it to get started — Squad works out of the box with sensible defaults.

---

## Troubleshooting

### `squad: command not found`

Your npm global bin isn't in your PATH. Fix:

```bash
# Check if installed
npm list -g @bradygaster/squad-cli

# If installed but not found, check PATH:
echo $PATH | grep npm          # macOS/Linux
echo %PATH% | findstr npm      # Windows
```

### `Cannot find .squad/ directory`

Run `squad init` in your project root, or `squad init --global` for a personal squad.

### Version mismatch between CLI and SDK

Update both:

```bash
npm install -g @bradygaster/squad-cli@latest
npm install @bradygaster/squad-sdk@latest
```

---

## Ready to Learn?

New to Squad? Check out [**Tamir's Squad Skills Workshop**](https://github.com/tamirdresher/squad-skills/tree/main/workshop) for hands-on learning and practical patterns.

---

## Next Steps

→ [Your First Session](first-session.md)
