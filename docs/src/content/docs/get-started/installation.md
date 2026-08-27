# Installation

Install the Squad CLI with npm or as a self-contained bundle. Every method
provides the same `squad` command and uses the same `.squad/` team state.

## Before you begin

All CLI installations need:

- **[Git](https://git-scm.com/)** and a new or existing Git repository
- **GitHub Copilot CLI**, installed separately, to run the agent team
- **[GitHub CLI](https://cli.github.com/)** only for GitHub issues, pull
  requests, project boards, and the work loop

Node.js 22.5 or later is required for npm and npx installs. The install script,
Homebrew cask, WinGet package, and direct archives vendor Node.js, so they do
not need Node.js, npm, or access to `registry.npmjs.org`.

## Install the CLI

Choose one method for your platform.

### npm

Use npm when Node.js 22.5 or later is already available:

```bash
npm install -g @bradygaster/squad-cli@latest
```

To test an on-demand prerelease from `dev`:

```bash
npm install -g @bradygaster/squad-cli@preview
```

For one-off use without a global install:

```bash
npx @bradygaster/squad-cli init
```

### macOS or Linux install script

The verified install script selects the correct archive, checks its SHA-256,
and installs it under `/usr/local` or `$HOME/.local`:

```bash
curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/main/scripts/install.sh | sh
```

### Homebrew on macOS

```bash
brew tap bradygaster/squad
brew install --cask squad
```

### WinGet on Windows

```powershell
winget install --id bradygaster.Squad --exact
```

WinGet updates become searchable after the Windows Package Manager community
repository accepts the automated release pull request. If the package is not
found yet, use the direct Windows archive.

### Direct download

Download the archive for your operating system and CPU from
[GitHub Releases](https://github.com/bradygaster/squad/releases/latest):

```text
squad-linux-x64.tar.gz     squad-darwin-x64.tar.gz    squad-win32-x64.zip
squad-linux-arm64.tar.gz   squad-darwin-arm64.tar.gz  squad-win32-arm64.zip
SHA256SUMS.txt
```

Verify the archive against `SHA256SUMS.txt`, unpack it, and add the directory
containing `squad` or `squad.exe` to `PATH`.

See [Standalone Install](../features/standalone-install.md) for version pinning,
custom install locations, checksums, bundle contents, CI examples, and current
signing limitations.

## Choose an installation method

| Method | Platforms | Node.js required | Best for |
|--------|-----------|------------------|----------|
| npm or npx | macOS, Linux, Windows | Yes | Node.js environments, previews, and insider builds |
| Install script | macOS, Linux | No | Verified command-line installation without npm |
| Homebrew | macOS | No | Homebrew-managed upgrades |
| WinGet | Windows | No | Windows Package Manager-managed upgrades |
| Direct archive | macOS, Linux, Windows | No | Mirrors, offline staging, and controlled deployment |

Homebrew, WinGet, and the install script track stable releases. Use npm's
`preview` tag for release candidates, `insider` for development snapshots, or
a direct GitHub prerelease archive when testing an early build.

## Verify the installation

```bash
squad --version
squad doctor
```

## Initialize Squad in your project

From your repository root:

```bash
squad init
```

This creates:

```text
.github/agents/squad.agent.md  # coordinator agent
.squad/                        # team state directory
```

The same files work from the Copilot CLI and VS Code.

## Use Squad in VS Code

Open the initialized project in VS Code, open Copilot Chat, and select the
Squad agent. VS Code and the CLI share the same agents, decisions, and memory
from `.squad/`.

## Install the SDK

The SDK is a Node.js project dependency for building tools on top of Squad:

```bash
npm install @bradygaster/squad-sdk
```

```typescript
import { defineConfig, loadConfig, resolveSquad } from '@bradygaster/squad-sdk';
```

See the [SDK Reference](../reference/sdk.md) for the typed configuration,
routing, and agent lifecycle APIs.

## Update Squad

Update the CLI through the same channel used to install it:

| Installed with | Update command |
|----------------|----------------|
| npm | `npm install -g @bradygaster/squad-cli@latest` |
| npm preview | `npm install -g @bradygaster/squad-cli@preview` |
| Homebrew | `brew upgrade --cask squad` |
| WinGet | `winget upgrade --id bradygaster.Squad --exact` |
| Install script | Re-run the install script |
| Direct archive | Download and unpack the newer release |

Then refresh the Squad-owned files in each initialized project:

```bash
squad upgrade
squad doctor
```

`squad upgrade` preserves your agents, decisions, and history in `.squad/`.

If you use the SDK, update it separately:

```bash
npm install @bradygaster/squad-sdk@latest
```

## Optional: Personal squad

A personal squad lets projects inherit shared agent configuration without
running `squad init` in each repository:

```bash
squad init --global
```

| Platform | Path |
|----------|------|
| Linux | `~/.config/squad/` |
| macOS | `~/Library/Application Support/squad/` |
| Windows | `%APPDATA%\squad\` |

## Troubleshooting

### `squad: command not found`

Open a new terminal after installing. For npm, confirm the npm global binary
directory is on `PATH`. For the install script or direct archive, confirm the
selected install directory is on `PATH`.

### WinGet cannot find `bradygaster.Squad`

The latest automated manifest may still be awaiting review in
`microsoft/winget-pkgs`. Install the direct Windows archive from GitHub
Releases, then switch to WinGet after the package becomes available.

### `Cannot find .squad/ directory`

Run `squad init` from the repository root, or `squad init --global` for a
personal squad.

### Version mismatch between CLI and SDK

Update the CLI using its installation channel, then update the SDK:

```bash
npm install @bradygaster/squad-sdk@latest
```

## Next step

Continue to [Your First Session](first-session.md).
