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

### One-off with npx

No install needed — run the latest version directly:

```bash
npx @bradygaster/squad-cli init
npx @bradygaster/squad-cli status
```

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
| Try Squad quickly | **CLI** with `npx` | No install needed. Run `npx @bradygaster/squad-cli init` and you're testing it. |
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

Your npm global bin directory isn't in your PATH. Follow these steps:

**1. Confirm the package is installed:**

```bash
npm list -g @bradygaster/squad-cli
```

If it's not listed, re-run `npm install -g @bradygaster/squad-cli`.

**2. Find your npm global bin directory:**

```bash
npm prefix -g
```

This prints the directory where npm installs global packages (e.g. `/usr/local`, `~/.npm-global`, or `C:\Users\<you>\AppData\Roaming\npm`). The `squad` binary lives in the `bin/` subdirectory on macOS/Linux, or directly in that directory on Windows.

**3. Add it to your PATH:**

<details>
<summary><strong>macOS / Linux</strong></summary>

Add this line to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.profile`):

```bash
export PATH="$(npm prefix -g)/bin:$PATH"
```

Then reload your shell using the command for the shell you use:

```bash
# Bash
source ~/.bashrc
```

```bash
# Zsh
source ~/.zshrc
```

</details>

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

Run this in PowerShell to permanently add the npm global directory to your user PATH. It reads only the **User**-scoped PATH (not the merged process PATH) and skips the append if the entry is already present, so repeated runs won't duplicate entries or copy Machine-level paths into your User PATH:

```powershell
$npmPrefix = (npm prefix -g).Trim()
$userPath  = [Environment]::GetEnvironmentVariable("PATH", "User")
if (-not (($userPath -split ';') -contains $npmPrefix)) {
    $newUserPath = if ([string]::IsNullOrEmpty($userPath)) { $npmPrefix } else { $userPath.TrimEnd(';') + ";" + $npmPrefix }
    [Environment]::SetEnvironmentVariable("PATH", $newUserPath, "User")
}
```

Then **restart your terminal** for the change to take effect.

</details>

:::note
If you use a Node version manager like [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm), `npm prefix -g` points to a version-specific directory that changes when you switch Node versions. Rather than hardcoding it in your PATH, let the version manager manage your PATH (it adds the active version's bin directory automatically), and make sure its shell initialization runs in your profile.
:::

**4. Verify it works:**

```bash
squad --version
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
