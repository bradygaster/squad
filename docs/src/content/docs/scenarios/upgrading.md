# Upgrading Squad

Update Squad-owned files to the latest version without touching your team state.

---

## 1. Run the Upgrade

From your repo root:

```bash
squad upgrade
```

Squad detects your installed version, updates Squad-owned files, and runs any needed migrations:

```
✅ upgraded coordinator from 0.1.0 to 0.2.0
✅ upgraded .squad/templates/

.squad/ untouched — your team state is safe

Squad is upgraded. (v0.2.0)
```

That's it.

---

## What Gets Upgraded

| File | Updated? | Notes |
|------|----------|-------|
| `.github/agents/squad.agent.md` | ✅ Yes | Overwritten with latest coordinator logic |
| `.ai-team-templates/` | ✅ Yes | Overwritten with latest templates |
| `.github/workflows/squad-*.yml` | ✅ Yes | Overwritten with latest squad workflows |
| `.github/copilot-instructions.md` | ⚡ Conditional | Updated only if @copilot is enabled on the team |
| `.ai-team/` | ❌ Never | Your team's knowledge, decisions, casting state, skills |

Squad-owned files (`squad.agent.md` and `.ai-team-templates/`) are replaced entirely. Don't put custom changes in them — they'll be lost on upgrade.

Your team state in `.ai-team/` is never touched. Agent charters, histories, decisions, casting state, skills, and session logs are all safe.

---

## Migrations

Some upgrades require additive changes to your team state directory — like creating a new subdirectory that didn't exist in older versions.

Migrations are:
- **Additive** — they only create new files or directories, never modify existing ones
- **Idempotent** — safe to re-run; if the change already exists, it's skipped

Example: upgrading to v0.2.0 creates `.ai-team/skills/` if it doesn't already exist.

---

## Migrating .ai-team/ → .squad/ (v0.5.0+)

In Squad v0.5.0, the team state directory was renamed from `.ai-team/` to `.squad/`. Existing repos continue to work — Squad detects both. If you're still on `.ai-team/`, you'll see a deprecation warning.

**To migrate your repo:**

```bash
# Step 1: Upgrade to get the latest migration tooling
squad upgrade

# Step 2: Rename the directory
squad upgrade --migrate-directory
```

Then commit:

```bash
git add -A
git commit -m "chore: migrate .ai-team/ → .squad/"
```

**What the migration does:**
- Renames `.ai-team/` → `.squad/`
- Updates `.gitignore` and `.gitattributes` references
- Scrubs email addresses from migrated files (PII cleanup)

**Timeline:** `.ai-team/` support continues through v0.6.0. Migration becomes required in v1.0.0.

**Full details:** See the [Migration Guide](../get-started/migration.md).

---

## Version Stamping

`squad.agent.md` is version-stamped on install and upgrade. The version appears in two places:

### 1. Agent Name (Visible in UI)

The version is displayed in the agent picker across all Copilot hosts (VS Code, CLI, Visual Studio):

```yaml
name: Squad (vX.Y.Z)
```

When you select agents in Copilot, you'll see **"Squad (vX.Y.Z)"** in the dropdown — making it immediately clear which version you're running.

### 2. Version Field (For Reference)

The frontmatter also includes a standalone version field:

```yaml
version: "X.Y.Z"
```

### 3. CLI Check

You can also check your installed version from the command line:

```bash
squad --version
```

The output will show your installed version (e.g., `X.Y.Z`).

---

## Already Up to Date

If you're already on the latest version:

```bash
squad upgrade
```

```
✅ Already up to date (v0.2.0)
```

Squad still runs any missing migrations in case a prior upgrade was interrupted.

---

## 2. Commit the Upgrade

```bash
git add .github/agents/squad.agent.md .ai-team-templates/
git commit -m "Upgrade Squad to v0.2.0"
```

No changes to `.ai-team/` — the diff is limited to Squad-owned files.

---

## Tips

- **Upgrade is safe.** It only overwrites files that Squad owns. Your team state is never modified.
- **Don't customize `squad.agent.md`.** Any changes you make will be overwritten on the next upgrade. If you need custom behavior, use directives in `decisions.md` instead.
- **Re-running upgrade is harmless.** If you're not sure whether an upgrade completed, run it again. It's idempotent.
