# Self Upgrade

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to upgrade Squad CLI:**
```bash
squad upgrade --self
```

**Try this to upgrade to latest insider build:**
```bash
squad upgrade --self --insider
```

**Try this to upgrade both CLI and repo templates:**
```bash
squad upgrade --self && squad upgrade
```

Squad can upgrade itself to the latest stable or insider release, then automatically refresh your repo templates.

---

## What It Does

`squad upgrade --self` upgrades the Squad CLI package to the latest stable release:

1. **Detects package manager** — auto-detects npm, pnpm, or yarn based on lock files
2. **Upgrades package** — runs `npm install -g @bradygaster/squad@latest` (or pnpm/yarn equivalent)
3. **Runs repo upgrade** — automatically runs `squad upgrade` to apply new templates

**Result:**
- Squad CLI upgraded to latest stable
- Your repo's `.squad/` templates refreshed with latest version
- All in one command

---

## Usage

### Upgrade to Latest Stable

```bash
squad upgrade --self
```

**Output:**
```
🔄 Upgrading Squad CLI...
   Detected package manager: npm
   Running: npm install -g @bradygaster/squad@latest

✅ Squad CLI upgraded to v0.8.0
   Running: squad upgrade (to refresh repo templates)

✅ Repo templates upgraded to v0.8.0
```

---

### Upgrade to Latest Insider

```bash
squad upgrade --self --insider
```

**What's different:**
- Installs latest **prerelease** version (e.g., `v0.9.0-insider.3`)
- May include experimental features
- Used for testing bleeding-edge changes

**Output:**
```
🔄 Upgrading Squad CLI (insider)...
   Detected package manager: pnpm
   Running: pnpm add -g @bradygaster/squad@insider

✅ Squad CLI upgraded to v0.9.0-insider.3
   Running: squad upgrade (to refresh repo templates)

✅ Repo templates upgraded to v0.9.0-insider.3
```

---

## Package Manager Auto-Detection

Squad auto-detects your package manager based on lock files in the current directory:

| Lock File | Detected Manager | Command Used |
|-----------|------------------|--------------|
| `pnpm-lock.yaml` | pnpm | `pnpm add -g @bradygaster/squad@latest` |
| `yarn.lock` | Yarn | `yarn global add @bradygaster/squad@latest` |
| `package-lock.json` | npm | `npm install -g @bradygaster/squad@latest` |
| *(none)* | npm (fallback) | `npm install -g @bradygaster/squad@latest` |

**Notes:**
- Detection runs in current working directory
- If no lock file found, defaults to npm
- For insider upgrades, `@latest` becomes `@insider`

---

## Auto-Refresh Repo Templates

After upgrading the CLI, `squad upgrade --self` automatically runs `squad upgrade` to refresh your repo's `.squad/` templates. This ensures:

- Built-in skills updated to latest versions
- Charter templates refreshed
- Routing/team file patterns updated
- New features added (e.g., cleanup config, scratch dir, external state)

**Skip auto-refresh:**

If you want to upgrade the CLI without refreshing repo templates:

```bash
squad upgrade --self --skip-repo-upgrade
```

*(This flag may not exist yet — just showing the pattern. For now, self-upgrade always runs repo upgrade.)*

---

## Permission Errors

If upgrade fails with permission denied:

```
❌ Error: EACCES: permission denied
```

**Solutions:**

1. **Use sudo (macOS/Linux):**
   ```bash
   sudo squad upgrade --self
   ```

2. **Fix npm permissions:**
   ```bash
   # Option A: Change npm's default directory
   npm config set prefix ~/.npm-global
   export PATH=~/.npm-global/bin:$PATH

   # Option B: Fix permissions for /usr/local
   sudo chown -R $(whoami) /usr/local/lib/node_modules
   ```

3. **Use a version manager (recommended):**
   - **nvm** (Node Version Manager) — avoids global permission issues
   - **volta** — handles global installs without sudo

---

## Version Check

Check current Squad version:

```bash
squad --version
```

**Output:**
```
@bradygaster/squad v0.8.0
```

Check if a newer version is available:

```bash
npm outdated -g @bradygaster/squad
```

**Output:**
```
Package             Current  Wanted  Latest  Location
@bradygaster/squad  0.7.5    0.8.0   0.8.0   global
```

---

## Release Channels

| Channel | Tag | Description |
|---------|-----|-------------|
| **Stable** | `@latest` | Production-ready releases (e.g., `v0.8.0`) |
| **Insider** | `@insider` | Prerelease builds for testing (e.g., `v0.9.0-insider.3`) |

**When to use insider:**
- You want to test upcoming features
- You're contributing to Squad development
- You need a bug fix before the next stable release

**When to use stable:**
- Production use
- You want predictable, tested releases
- You follow semantic versioning

---

## Workflow

**Typical upgrade workflow:**

1. **Check current version:**
   ```bash
   squad --version
   ```

2. **Upgrade CLI to latest stable:**
   ```bash
   squad upgrade --self
   ```

3. **Verify new version:**
   ```bash
   squad --version
   ```

4. **Repo templates auto-refreshed** — no extra step needed

---

## Notes

- Self-upgrade requires network access to npm registry
- Self-upgrade modifies global npm packages — may require elevated permissions
- Repo upgrade (template refresh) runs automatically after successful CLI upgrade
- If CLI upgrade fails, repo upgrade is skipped
- Insider builds may have breaking changes — read release notes before upgrading

---

## Sample Prompts

```
squad upgrade --self
```

Upgrades Squad CLI to latest stable and refreshes repo templates.

```
squad upgrade --self --insider
```

Upgrades Squad CLI to latest insider/prerelease build.

```
squad --version
```

Checks current Squad CLI version.

```
npm outdated -g @bradygaster/squad
```

Checks if a newer version is available without upgrading.
