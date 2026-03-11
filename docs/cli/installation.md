# Global CLI Installation Guide

> **⚠️ Experimental:** Squad CLI is under active development. APIs and file formats may change between versions. We'd love your feedback — if something isn't working as expected, please [file a bug report](https://github.com/bradygaster/squad/issues/new).

This guide explains how to install the Squad CLI globally, use it one-off with `npx`, set up a personal squad, and understand package resolution.

## Quick Start

### Option 1: Global Install (Recommended)

Install the CLI as a global binary:

```bash
npm install -g @bradygaster/squad-cli
```

Now use it from anywhere:

```bash
squad init
squad status
squad watch
```

### Option 2: One-Off with npx

Use without installing:

```bash
npx @bradygaster/squad-cli init
npx @bradygaster/squad-cli status
```

### Option 3: Latest from GitHub

For development or testing, run directly from the GitHub repository:

```bash
squad init
squad status
```

This clones the repo and runs `dist/cli-entry.js` without installing locally.

## How Resolution Works

When you type `squad` or `npx @bradygaster/squad-cli`, here's what happens:

### Global Install (`npm install -g`)

```
$ squad init
    ↓
npm looks up 'squad' in global PATH
    ↓
Found: ~/.nvm/versions/node/v20.x/bin/squad (symlink)
    ↓
Resolves to: ~/.nvm/versions/node/v20.x/lib/node_modules/@bradygaster/squad-cli/dist/cli-entry.js
    ↓
Executes: node dist/cli-entry.js ["init"]
```

**`cli-entry.js` then:**
1. Parses arguments (`init` → `cmd = 'init'`)
2. Imports SDK: `import { resolveSquad, loadConfig } from '@bradygaster/squad-sdk'`
3. Finds `.squad/` in current directory or parents
4. Loads configuration
5. Executes command

### npx (No Install)

```
$ npx @bradygaster/squad-cli init
    ↓
npx fetches @bradygaster/squad-cli@latest from npm
    ↓
Extracts to ~/.npm/_npx/XXXXX/
    ↓
Executes: node .../dist/cli-entry.js ["init"]
```

Same execution flow as global install, but no persistent disk footprint.

### GitHub Native (Legacy — no longer supported)

```
$ squad init
    ↓
npx resolves @bradygaster/squad-cli from npm registry
    ↓
npm install (cached)
    ↓
npm run build
    ↓
node dist/cli-entry.js ["init"]
```

**Why use this:** Bleeding-edge commits, before they're published to npm. Requires build time.

## Personal Squad: `squad init --global`

A "personal squad" is a global `.squad/` directory in your home directory, shared across all projects.

### Setup

```bash
squad init --global
```

**What happens:**
1. Creates your personal squad directory at a platform-specific path:
   - Linux: `~/.config/squad/`
   - macOS: `~/Library/Application Support/squad/`
   - Windows: `%APPDATA%\squad\`
2. Scaffolds standard team structure
3. Sets up agents that can be inherited by project squads

### Use Cases

- **Shared agent definitions** across projects
- **Common skills and practices** at the personal level
- **Persistent history** that carries across repos
- **Consistent casting** — same agent names/universes everywhere

### Example Workflow

```bash
# 1. Set up personal squad (one-time)
squad init --global

# 2. Create a personal upstream practice doc (use your actual path)
# Linux: ~/.config/squad/.squad/skills/
# macOS: ~/Library/Application Support/squad/.squad/skills/
# Windows: %APPDATA%\squad\.squad\skills\
mkdir -p "$(squad status | grep 'Global squad:' | cut -d' ' -f3)/.squad/skills/personal-guidelines"
echo "# My Python conventions..." > "$(squad status | grep 'Global squad:' | cut -d' ' -f3)/.squad/skills/personal-guidelines/SKILL.md"

# 3. In a project, inherit from personal squad
cd ~/my-project
squad upstream add "$(resolveGlobalSquadPath)" --name personal

# 4. Now all agents in this project inherit from personal squad
squad  # launch shell
> status
# Output: "Inherited skills from: personal"
```

### Global vs. Local Squad

| Aspect | Global (personal squad) | Local (`./.squad/`) |
|--------|-----|-----|
| **Created by** | `squad init --global` | `squad init` |
| **Location** | Platform-specific (see below) | Project root |
| **Scope** | All projects on this machine | Single project |
| **Inheritance** | Can be upstream for local squads | Can inherit from global |
| **History** | Persistent across projects | Per-project learning |
| **Shared agents** | Yes (optional setup) | No |
| **Used when** | No `.squad/` in project + parents | Found in project hierarchy |

**Platform-specific paths:**
- Linux: `~/.config/squad/`
- macOS: `~/Library/Application Support/squad/`
- Windows: `%APPDATA%\squad\`

### Resolution Order

When Squad starts, it looks for `.squad/` in this order:

1. Current directory (`./.squad/`)
2. Parent directories (walk up to project root)
3. Personal squad directory (platform-specific: `~/.config/squad/` on Linux, `~/Library/Application Support/squad/` on macOS, `%APPDATA%\squad\` on Windows)
4. Global `@bradygaster/squad-cli` default (fallback only)

**First match wins.** If you're in a project with `.squad/`, the global personal squad is ignored (but can be an upstream).

## Commands at a Glance

All work with global or npx installations:

| Command | Global | npx | Needs .squad/ |
|---------|--------|-----|-------|
| `squad init` | ✅ | ✅ | No |
| `squad init --global` | ✅ | ✅ | No |
| `squad status` | ✅ | ✅ | Yes |
| `squad upgrade` | ✅ | ✅ | Yes |
| `squad watch` | ✅ | ✅ | Yes |
| `squad upstream add` | ✅ | ✅ | Yes |
| `squad export` | ✅ | ✅ | Yes |
| `squad import` | ✅ | ✅ | No |

## Advanced: Which Installation to Use?

### Use Global Install If...

- You run Squad regularly in multiple projects
- You want fast startup time
- You want bash/shell completion (future feature)
- You're on a team and everyone has the same version

**Install:** `npm install -g @bradygaster/squad-cli`

**Update:** `npm install -g @bradygaster/squad-cli@latest`

### Use npx If...

- You want zero disk footprint
- You're running Squad in a CI/CD pipeline
- You want `@latest` without version management
- You're testing a specific version temporarily

**Usage:** `npx @bradygaster/squad-cli init`

### Use GitHub Native If...

- You're a contributor or early tester
- You need unreleased features
- You're debugging a specific commit

**Usage:** `squad init`

**Note:** Slower (clones and builds), requires build tools.

## Troubleshooting

### "squad: command not found"

**Cause:** CLI not installed globally, or npm bin not in PATH

**Fix:**
```bash
# Check if installed
npm list -g @bradygaster/squad-cli

# If missing:
npm install -g @bradygaster/squad-cli

# If installed but still "not found", check PATH:
echo $PATH | grep npm  # Unix/Mac
echo %PATH% | find npm # Windows (use PowerShell or cmd)

# Add npm bin to PATH if missing (usually done by Node installer)
# For nvm: nvm use {version}
```

### "Cannot find .squad/ directory"

**Cause:** No squad in current directory or parents

**Fix:**
```bash
# Create one in current directory:
squad init

# Or use global squad:
squad init --global
# Then projects will inherit from your personal squad
```

### "npm ERR! code E403" when installing globally

**Cause:** Permissions issue or private package

**Fix:**
```bash
# Use npx instead (no install):
npx @bradygaster/squad-cli init

# Or use sudo (not recommended, but works):
sudo npm install -g @bradygaster/squad-cli

# Or change npm default dir:
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm install -g @bradygaster/squad-cli
```

### "Version mismatch" errors when using SDK

**Cause:** Global CLI version doesn't match installed SDK

**Fix:**
```bash
# Update both to latest
npm install -g @bradygaster/squad-cli@latest
npm install @bradygaster/squad-sdk@latest  # in your project
```

### Using squad with Docker or containers

```dockerfile
FROM node:20

# Install CLI globally in image
RUN npm install -g @bradygaster/squad-cli

# Or use npx (no install):
RUN npx @bradygaster/squad-cli init
```

## Version Management

### Check Installed Version

```bash
squad --version
```

### Update to Latest

```bash
npm install -g @bradygaster/squad-cli@latest
```

### Pin to Specific Version

```bash
npm install -g @bradygaster/squad-cli@1.2.3
```

### Update Frequency

- **Stable:** ~monthly releases (minor + patch)
- **Insider:** Push to `insider` branch, install with `@insider` tag

```bash
npm install -g @bradygaster/squad-cli@insider
```

## Next Steps

- **Getting Started:** See [README](../../README.md) for your first squad
- **Command Reference:** See individual command docs in `docs/guide/`
- **SDK API:** See [SDK Reference](../reference/sdk.md) to understand the programmatic API
