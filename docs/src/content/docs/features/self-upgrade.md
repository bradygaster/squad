# Self Upgrade

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

Squad can upgrade itself to the latest release on its own channel, then you refresh your repo templates with `squad upgrade`. Prerelease builds (`X.Y.Z-preview.N`, `X.Y.Z-insider.N`) are published to the npm `insider` dist-tag (`preview` is an alias of it).

---

## What It Does

`squad upgrade --self` upgrades the Squad CLI package:

1. **Detects package manager** — auto-detects npm, pnpm, or yarn
2. **Picks the channel** — a prerelease install follows `@insider`, a stable install follows `@latest`; `--insider` forces `@insider`
3. **Guards against downgrades** — the dist-tag is resolved first; if it points at a version older than the one you run, the upgrade is refused unless you pass `--force`
4. **Upgrades package** — runs `npm install -g @bradygaster/squad-cli@<tag>` (or pnpm/yarn equivalent)

**Preview first:**

```bash
squad upgrade --self --dry-run
```

prints the exact command and installs nothing:

```
Dry run — would self-upgrade via npm (insider → 2.0.0-preview.2):
  npm install -g @bradygaster/squad-cli@insider
Nothing was installed. Run without --dry-run to apply.
```

**Downgrade refused:**

```
❌ Self-upgrade failed: Refusing to downgrade: @latest currently resolves to 1.1.0, older than the installed 2.0.0-preview.1. Pass --force to install it anyway, or --insider to stay on the prerelease channel.
```

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

✅ Squad CLI upgraded to v1.1.0
   Running: squad upgrade (to refresh repo templates)

✅ Repo templates upgraded to v1.1.0
```

---

### Upgrade to Latest Insider

```bash
squad upgrade --self --insider
```

**What's different:**
- Installs latest **prerelease** version (e.g., `v1.1.0-insider.3`)
- May include experimental features
- Used for testing bleeding-edge changes

**Output:**
```
🔄 Upgrading Squad CLI (insider)...
   Detected package manager: pnpm
   Running: pnpm add -g @bradygaster/squad@insider

✅ Squad CLI upgraded to v1.1.0-insider.3
   Running: squad upgrade (to refresh repo templates)

✅ Repo templates upgraded to v1.1.0-insider.3
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

## Refresh Repo Templates

`squad upgrade --self` only replaces the CLI package. Run `squad upgrade` afterwards (from the new CLI) to refresh your repo's Squad-owned files:

- Built-in skills updated to latest versions
- Charter templates refreshed
- Routing/team file patterns updated
- New features added (e.g., cleanup config, scratch dir, external state)

### Your Customizations Are Backed Up

`squad upgrade` overwrites Squad-owned files with the latest templates. Before it overwrites a file you've edited locally, it saves your version alongside it as `<file>.local-backup`, reads the backup back to verify it, and only then overwrites; if the backup cannot be verified the file is left untouched and reported.

This covers every Squad-owned file: `.github/agents/squad.agent.md`, `.github/skills/*/SKILL.md`, the Squad-managed workflow files in `.github/workflows/`, the flat `.squad/casting-*.json` template copies and everything under `.squad/templates/` (including its `skills/` and `workflows/` snapshots, which older releases never refreshed).

```text
⚠  squad.agent.md has local customizations — backed up to squad.agent.md.local-backup
   To restore: copy squad.agent.md.local-backup → squad.agent.md
⚠  .squad/templates/model-selection-reference.md has local customizations — backed up to model-selection-reference.md.local-backup
```

To restore your version, copy the backup back over the refreshed file:

```bash
cp .github/agents/squad.agent.md.local-backup .github/agents/squad.agent.md
```

Things worth knowing:

- **"Customized" means you changed it.** Squad records the hash of every file it ships in `.squad/templates/.shipped-manifest.json`. A file that still matches what Squad shipped is refreshed silently when a new release changes the template; only a file that differs from both the shipped version and the new template is backed up. (Projects upgraded from a release without the manifest get a one-time backup of every differing file.)
- **Line endings don't count as customizations.** A CRLF checkout on Windows compares equal to the LF template, so a second `squad upgrade` right after the first changes nothing and `squad upgrade --dry-run` reports nothing to overwrite.
- **Version stamps don't count as customizations.** The `<!-- version: X.Y.Z -->` line in `squad.agent.md` changes on every release, so it's stripped before comparing.
- **Only the most recent backup is kept.** Backups are written to a fixed path, so re-customizing a file and upgrading again overwrites the previous `.local-backup`. Move anything you want to keep somewhere safe before your next upgrade.
- **Backups aren't gitignored.** They show up as untracked files in `git status`. Delete them once you've merged back what you need.
- **`.gitignore` and `.gitattributes` are appended to, never rewritten.** Missing Squad entries are added in the file's own line-ending style; a one-line addition never produces a whole-file diff.
- **Retired files are cleaned up.** A file Squad shipped in an earlier release but no longer ships is removed when it still matches what was shipped, and left in place (with a warning) when you modified it.

`squad upgrade --dry-run` previews the whole upgrade without writing anything: it lists every file that would be created or overwritten (marking the ones that would be backed up), retired files that would be removed, and `.gitignore`/`.gitattributes` entries that would be appended.

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
@bradygaster/squad v1.1.0
```

Check if a newer version is available:

```bash
npm outdated -g @bradygaster/squad
```

**Output:**
```
Package             Current  Wanted  Latest  Location
@bradygaster/squad  1.0.1    1.1.0   1.1.0   global
```

---

## Checking Update Status Programmatically

```bash
squad update-check --json
```

Reads the same cache the background startup check maintains and prints it as structured JSON, without making a network call:

```json
{
  "current": "1.1.0-insider.2",
  "channel": "insider",
  "latest": "1.1.0-insider.3",
  "updateAvailable": true,
  "cacheAge": "PT2H15M",
  "checkedAt": "2026-05-26T12:00:00.000Z",
  "stale": false
}
```

This gives editor extensions, coordinator instructions, and CI scripts a stable interface to query update status without replicating the OS-specific cache path or TTL-freshness logic themselves. A cache older than 24 hours is reported with `"stale": true` and `"updateAvailable": false` — run `--refresh` to trust it again.

**Flags:**
- `--json` — structured output (shown above)
- `--refresh` — bypass the cache and re-fetch from the npm registry now

**Exit codes:** `0` (up to date, or no cache yet), `1` (update available), `2` (transport failure during `--refresh`)

**Default (non-JSON) output:**

```
Current: 1.1.0-insider.2 (insider channel)
Latest:  1.1.0-insider.3 (cached 2026-05-26, age PT2H15M)
Update available. Run `squad upgrade --self` to install.
```

Honors `SQUAD_NO_UPDATE_CHECK=1` — exits `0` with no output (or `{}` with `--json`) and never calls the network.

---

## Release Channels

| Channel | Tag | Description |
|---------|-----|-------------|
| **Stable** | `@latest` | Production-ready releases (e.g., `v1.1.0`) |
| **Insider** | `@insider` | Prerelease builds for testing (e.g., `v1.1.0-insider.3`) |

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
