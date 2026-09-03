# Installation

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad coordinates AI agents in your repository by providing a structured workspace, routing rules, and agent templates. This article walks you through installing the Squad command-line interface (CLI), initializing Squad in your project, and validating the setup.

## Prerequisites

Before you install Squad, confirm you have the following:

- **[Node.js 20 or later](https://nodejs.org/en/download)** — verify by running `node --version`
- **[A Git repository](https://git-scm.com/)** (new or existing)
- **[GitHub Copilot](https://github.com/features/copilot)** — required for the VS Code agent workflow

## Installation methods

Squad provides three installation paths. Choose the one that matches your workflow.

| Method | Best for | Command |
| --- | --- | --- |
| [CLI (recommended)](#install-the-cli) | All projects, cross-platform | `npm install -g @bradygaster/squad-cli` |
| [VS Code](#use-squad-in-vs-code) | Already using Copilot in VS Code | No install needed — uses CLI init |
| [SDK](#install-the-sdk) | Building tools on top of Squad | `npm install @bradygaster/squad-sdk` |

## Install the CLI

To install the Squad CLI globally:

1. Run the following command:

   ```bash
   npm install -g @bradygaster/squad-cli
   ```

2. Verify the installation:

   ```bash
   squad --version
   ```

### Use npx (no install)

For one-off use, run Squad without a global install:

```bash
npx @bradygaster/squad-cli init
```

## Use Squad in VS Code

Squad integrates with GitHub Copilot in VS Code. The `.squad/` directory created by the CLI works identically in VS Code — same agents, same decisions, same memory.

**Tip:** Initialize your team with the CLI (`squad init`), then open the project in VS Code to keep working with the same squad.

## Install the SDK

If you're building tools on top of Squad, install the SDK as a project dependency:

1. Run the following command:

   ```bash
   npm install @bradygaster/squad-sdk
   ```

2. Import what you need in your code:

   ```typescript
   import { defineConfig, loadConfig, resolveSquad } from '@bradygaster/squad-sdk';
   ```

The SDK gives you typed configuration, routing, model selection, and the full agent lifecycle API. For details, see the [SDK Reference](https://bradygaster.github.io/squad/docs/reference/sdk/).

## Update Squad

To update the Squad CLI to the latest version:

```bash
npm install -g @bradygaster/squad-cli@latest
```

If you also use the SDK, update it separately:

```bash
npm install @bradygaster/squad-sdk@latest
```

## Initialize Squad in your project

To initialize Squad in your repository:

1. Navigate to your project root:

   ```bash
   cd <your-project-root>
   ```

2. Run the init command:

   ```bash
   squad init
   ```

3. Confirm Squad created the following files and directories:

   - `.github/agents/squad.agent.md` — coordinator agent definition
   - `.squad/` — Squad workspace directory

**Expected output:**

```
✅ Squad installed.
   .github/agents/squad.agent.md — coordinator agent
   .squad/templates/ — 11 template files

Open GitHub Copilot and select Squad from the agent list.
```

## Validate the installation

To confirm Squad is working correctly:

1. Run the status command:

   ```bash
   squad status
   ```

   You can also use `npx squad status` if you skipped the global install.

2. Check that `.squad/` contains the expected files:

   ```bash
   ls .squad/
   ```

   The directory should include `team.md`, `routing.md`, `decisions.md`, and an `agents/` subdirectory.

## Optional: Personal squad (cross-project)

A personal squad lets any project on your machine inherit a shared agent configuration without running `squad init` in each repository.

To create a personal squad:

```bash
squad init --global
```

Squad writes the personal configuration to a platform-specific path:

| Platform | Path |
| --- | --- |
| Linux | `~/.config/squad/` |
| macOS | `~/Library/Application Support/squad/` |
| Windows | `%APPDATA%\squad\` |

## Configuration

Use the portable markdown files under `.squad/` for new teams. The former typed `squad.config.ts` authoring mode is deprecated and will be removed in v2. Existing typed-config projects can continue using `squad build` during the transition.

## Troubleshoot

### `squad: command not found`

The npm global binary directory is not in your `PATH`.

**macOS and Linux** — Add the npm global bin to your shell profile:

```bash
export PATH="$(npm bin -g):$PATH"
```

**Windows** — Add the npm global bin directory to your `PATH` environment variable:

```powershell
$env:PATH += ";$(npm bin -g)"
```

Then restart your terminal and re-run `squad --version`.

### `Cannot find .squad/ directory`

Squad was not initialized in the current directory. Run one of the following:

- For the current project: `squad init`
- For a personal squad shared across projects: `squad init --global`

### Version mismatch between CLI and SDK

If Squad reports a version conflict between the CLI and the software development kit (SDK), update both packages:

```bash
npm install -g @bradygaster/squad-cli@latest
npm install @bradygaster/squad-sdk@latest
```
