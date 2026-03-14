# Migration Guide

> Upgrading from an older version of Squad? Find your scenario below.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Scenario 1: Brand New User](#scenario-1-brand-new-user)
- [Scenario 2: Upgrading from v0.5.4 Beta](#scenario-2-upgrading-from-v054-beta)
- [Scenario 3: Already on v0.8.x via npm](#scenario-3-already-on-v08x-via-npm)
- [Scenario 4: Was Using @bradygaster/create-squad](#scenario-4-was-using-bradygastercreate-squad)
- [Scenario 5: Was Using npx github: Distribution](#scenario-5-was-using-npx-github-distribution)
- [Scenario 6: My .squad/ Directory Broke After Upgrading](#scenario-6-my-squad-directory-broke-after-upgrading)
- [Scenario 7: I Have .ai-team/ from an Older Version](#scenario-7-i-have-ai-team-from-an-older-version)
- [Scenario 8: Using Squad in CI/CD](#scenario-8-using-squad-in-cicd)
- [Scenario 9: Using Squad SDK Programmatically](#scenario-9-using-squad-sdk-programmatically)
- [Troubleshooting](#troubleshooting)
- [Rolling Back](#rolling-back)
- [What's New in v0.8.18](#whats-new-in-v0818)

---

## Quick Reference

| Before | After |
|--------|-------|
| `npx github:bradygaster/squad` | `npx @bradygaster/squad-cli` |
| `@bradygaster/create-squad` | `@bradygaster/squad-cli` |
| `.ai-team/` directory | `.squad/` directory |
| v0.5.4 (beta) | v0.8.x (latest) |

---

## Scenario 1: Brand New User

Never used Squad before? Start here.

### Prerequisites

- Node.js 20 or later
- npm 9 or later
- A GitHub account with [GitHub Copilot](https://github.com/features/copilot) enabled
- `gh` CLI authenticated (`gh auth status` should show you logged in)

### Install

```bash
npm install -g @bradygaster/squad-cli
```

Or run without installing:

```bash
npx @bradygaster/squad-cli
```

### Initialize a Project

```bash
cd your-project
squad init
```

This creates a `.squad/` directory with your team roster, agent charters, and configuration files.

### Verify

```bash
squad doctor
```

All checks should pass. You're ready to go.

---

## Scenario 2: Upgrading from v0.5.4 Beta

This is the biggest jump. The codebase was rewritten in TypeScript, the `.squad/` directory format changed, and the command structure was reorganized.

### What Changed

- **TypeScript rewrite:** Entire codebase ported from JavaScript to TypeScript (strict mode).
- **`.squad/` directory format:** v0.5.4 format is incompatible with v0.8.18. You must reinitialize.
- **Command structure:** Some commands were reorganized or renamed.
- **SDK API:** The public API changed significantly if you were using Squad programmatically.
- **Distribution:** npm-only. The `npx github:` install path is gone.

### Step-by-Step

1. **Back up your existing `.squad/` directory:**

   ```bash
   cp -r .squad .squad-v054-backup
   ```

2. **Uninstall the old version (if globally installed):**

   ```bash
   npm uninstall -g @bradygaster/create-squad
   ```

3. **Install the latest version:**

   **Global (recommended):**
   ```bash
   npm install -g @bradygaster/squad-cli@latest
   ```

   **Local (project dependency):**
   ```bash
   npm install --save-dev @bradygaster/squad-cli@latest
   ```

   **npx (no install):**
   ```bash
   npx @bradygaster/squad-cli@latest
   ```

4. **Remove the old `.squad/` directory:**

   ```bash
   rm -rf .squad
   ```

5. **Reinitialize:**

   ```bash
   squad init
   ```

6. **Manually migrate your customizations.** Open `.squad-v054-backup/` and copy over any custom agent charters, team roster entries, or decisions into the new `.squad/` directory structure. The new format uses Markdown files (not JSON).

   **Which files are safe to copy?** Use this table as your guide:

   | Directory/File | Safe to copy? | Notes |
   |---|---|---|
   | `agents/` | ✅ Yes — all of them | Including scribe and ralph — their history is valuable context |
   | `decisions.md` | ✅ Yes | Your team's decision ledger |
   | `decisions/` | ✅ Yes | Including `inbox/` |
   | `routing.md` | ✅ Yes | Your routing rules |
   | `team.md` | ✅ Yes | Your roster |
   | `skills/` | ✅ Yes | Learned patterns |
   | `casting/` | ❌ Skip | Regenerated automatically on first run |
   | `templates/` | ❌ Skip | Overwritten by `squad upgrade` |
   | `log/` | 🟡 Optional | Diagnostic archive — no harm copying, but not required |
   | `orchestration-log/` | 🟡 Optional | Same as log/ |

7. **Validate with squad doctor:**

   ```bash
   squad doctor
   ```

   This runs 9 checks to ensure your `.squad/` directory is healthy after migration. All checks should pass before you consider the upgrade complete.

### Key Format Changes

| v0.5.4 | v0.8.18 |
|--------|---------|
| `.squad/config.json` | `.squad/team.md` (Markdown with YAML front matter) |
| JSON decision log | `.squad/decisions.md` (append-only Markdown) |
| Flat agent files | `.squad/agents/{name}/charter.md` (directory per agent) |

---

## Scenario 3: Already on v0.8.x via npm

If you're already on any v0.8.x release, this is a simple update.

**Global:**
```bash
npm install -g @bradygaster/squad-cli@latest
```

**Local:**
```bash
npm install --save-dev @bradygaster/squad-cli@latest
```

**npx:**
If you use `npx`, no update needed — it always pulls the latest version.

Verify the version:

```bash
squad --version
```

Expected output: `0.8.18` (or `0.8.18-preview.N`).

Your `.squad/` directory is compatible — no reinitialization needed.

---

## Scenario 4: Was Using @bradygaster/create-squad

The `@bradygaster/create-squad` package is deprecated. It has been replaced by `@bradygaster/squad-cli`.

### Switch

```bash
# Remove the old package
npm uninstall -g @bradygaster/create-squad

# Install the new package
npm install -g @bradygaster/squad-cli
```

The `squad` command works the same way. Your `.squad/` directory does not need to change if you were already on v0.8.x.

---

## Scenario 5: Was Using npx github: Distribution

The GitHub-native distribution (`npx github:bradygaster/squad`) has been removed. Squad is now distributed exclusively through npm.

### Switch

Replace any usage of:

```bash
# OLD — no longer works
npx github:bradygaster/squad
```

With:

```bash
# NEW
npx @bradygaster/squad-cli
```

If you had this in scripts or CI/CD workflows, update every reference.

---

## Scenario 6: My .squad/ Directory Broke After Upgrading

If `squad doctor` fails or commands error out after upgrading, follow these steps.

### 1. Back Up

```bash
cp -r .squad .squad-broken-backup
```

### 2. Reinitialize

```bash
rm -rf .squad
squad init
```

### 3. Restore Customizations

Manually copy custom agent charters, roster entries, and decisions from `.squad-broken-backup/` into the new `.squad/` structure.

### 4. Verify

```bash
squad doctor
```

If `squad doctor` still fails, see [Troubleshooting](#troubleshooting) below.

---

## Scenario 7: I Have .ai-team/ from an Older Version

Very early versions of Squad used `.ai-team/` instead of `.squad/`. This directory name is no longer recognized.

### Migrate

1. **Back up:**

   ```bash
   mv .ai-team .ai-team-backup
   ```

2. **Initialize the new directory:**

   ```bash
   squad init
   ```

3. **Manually migrate** any custom configuration from `.ai-team-backup/` into `.squad/`.

4. **Update `.gitignore`** if it references `.ai-team/`:

   ```bash
   # Remove .ai-team references, add .squad if needed
   ```

5. **Verify:**

   ```bash
   squad doctor
   ```

---

## Scenario 8: Using Squad in CI/CD

If you run Squad in GitHub Actions or another CI/CD system, update your workflow files.

### Before (old distribution)

```yaml
- name: Run Squad
  run: npx github:bradygaster/squad
```

### After (v0.8.18)

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'

- name: Install Squad
  run: npm install -g @bradygaster/squad-cli@latest

- name: Run Squad
  run: squad doctor && squad status
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Key CI/CD Notes

- Set `GITHUB_TOKEN` as an environment variable. Squad requires it for GitHub Copilot operations.
- Pin to a specific version (e.g., `@0.8.22`) in CI to avoid surprise upgrades.
- If you use `npx`, use `npx @bradygaster/squad-cli@0.8.22` with a pinned version.
- Node.js 20+ is required. Update your workflow's `setup-node` action if needed.

---

## Scenario 9: Using Squad SDK Programmatically

If you import Squad as a library, the package name and API have changed.

### Package Change

```bash
# OLD
npm install @bradygaster/squad

# NEW
npm install @bradygaster/squad-sdk
```

### Import Change

```typescript
// OLD
import { Squad } from '@bradygaster/squad';

// NEW
import { Squad } from '@bradygaster/squad-sdk';
```

### API Notes

- The SDK is now fully typed (TypeScript strict mode).
- Some methods were renamed or reorganized. Check the [SDK documentation](sdk/) for the current API surface.
- If you were relying on internal/undocumented APIs, those have changed. Stick to the documented public API.

---

## Troubleshooting

### `command not found: squad`

Squad isn't on your PATH. Either install globally or use `npx`:

```bash
npm install -g @bradygaster/squad-cli
# or
npx @bradygaster/squad-cli doctor
```

### npm 404 error when installing

You may be using the old package name. Use the correct name:

```bash
npm install -g @bradygaster/squad-cli
```

If the package genuinely isn't published yet, check [the npm page](https://www.npmjs.com/package/@bradygaster/squad-cli) or the [GitHub repo](https://github.com/bradygaster/squad) for release status.

### Permission denied during install

Use one of these approaches (do **not** use `sudo npm`):

```bash
# Option 1: Fix npm prefix (recommended)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Option 2: Use npx instead
npx @bradygaster/squad-cli
```

### Old format not recognized

Your `.squad/` directory is from an older version. Back it up and reinitialize:

```bash
cp -r .squad .squad-old-backup
rm -rf .squad
squad init
```

### GITHUB_TOKEN issues

Squad needs a valid GitHub token for Copilot operations. Verify:

```bash
echo $GITHUB_TOKEN
```

If empty, authenticate via the GitHub CLI:

```bash
gh auth login
export GITHUB_TOKEN=$(gh auth token)
```

### gh auth issues

Make sure the GitHub CLI is installed and authenticated:

```bash
gh auth status
```

If not authenticated:

```bash
gh auth login
```

### npx cache serving a stale version

Clear the npx cache and retry:

```bash
npx clear-npx-cache
npx @bradygaster/squad-cli@latest
```

Or install globally to bypass npx caching entirely:

```bash
npm install -g @bradygaster/squad-cli@latest
```

### Wrong version installed

Check your installed version:

```bash
squad --version
```

If it shows an old version:

```bash
npm uninstall -g @bradygaster/squad-cli
npm install -g @bradygaster/squad-cli@latest
```

### Team roster gone after upgrade

Your `.squad/team.md` may not have survived the upgrade. Reinitialize and restore from backup:

```bash
squad init
# Then manually restore roster entries from your backup
```

### `squad doctor` fails

Run it to see which checks fail:

```bash
squad doctor
```

Common causes:

- Missing `.squad/` directory — run `squad init`.
- Missing `GITHUB_TOKEN` — see [GITHUB_TOKEN issues](#github_token-issues) above.
- Node.js too old — upgrade to Node.js 20+.
- Corrupted `.squad/` files — back up, remove, and reinitialize.

### Node.js version too old

Squad requires Node.js 20 or later. Check your version:

```bash
node --version
```

If below 20, upgrade via [nodejs.org](https://nodejs.org/) or your preferred version manager:

```bash
# nvm
nvm install 20
nvm use 20

# fnm
fnm install 20
fnm use 20
```

---

## Rolling Back

If you need to downgrade from v0.8.18:

```bash
npm install -g @bradygaster/squad-cli@0.8.17
```

### Warnings

- **The GitHub-native distribution (`npx github:bradygaster/squad`) is permanently removed.** You cannot roll back to that install method.
- **`.squad/` directory format changed between v0.5.4 and v0.8.x.** If you roll back to v0.5.4, your current `.squad/` directory will not be compatible. Keep backups.
- Rolling back within the v0.8.x line (e.g., 0.8.18 to 0.8.17) should be safe — the `.squad/` format is stable across v0.8.x releases.

---

## What's New in v0.8.18

- **Remote Squad Mode:** `squad link`, `squad init --mode remote`, and dual-root path resolution for team identity directories.
- **`squad doctor`:** 9-check setup validation with clear pass/fail output.
- **npm-only distribution:** Simpler install, semantic versioning, stable and insider channels.
- **TypeScript strict mode:** Full type safety across the SDK and CLI.
- **Semver fix:** Version format now follows the semver spec (`0.8.18-preview.N` instead of `0.8.18.N-preview`).

For the full list of changes, see the [CHANGELOG](https://github.com/bradygaster/squad/blob/main/CHANGELOG.md).

---

*Questions or issues? Open an issue at [github.com/bradygaster/squad](https://github.com/bradygaster/squad/issues).*
