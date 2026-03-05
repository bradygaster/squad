# Upgrading Squad

Update Squad-owned files to the latest version without touching your team state.

---

## 1. Run the Upgrade

From your repo root:

```bash
# Global install
squad upgrade

# Local install (npm --save-dev)
npx squad upgrade

# One-off (no install)
npx @bradygaster/squad-cli upgrade
```

Squad detects your installed version, updates Squad-owned files, and runs any needed migrations:

```
✅ upgraded coordinator from 0.8.18 to 0.8.21
✅ upgraded .squad/templates/

.squad/ untouched — your team state is safe

Squad is upgraded. (v0.8.21)
```

That's it.

---

## What Gets Upgraded

| File | Updated? | Notes |
|------|----------|-------|
| `.github/agents/squad.agent.md` | ✅ Yes | Overwritten with latest coordinator logic |
| `.squad/templates/` | ✅ Yes | Overwritten with latest templates |
| `.github/workflows/squad-*.yml` | ✅ Yes | Overwritten with latest squad workflows |
| `.github/copilot-instructions.md` | ⚡ Conditional | Updated only if @copilot is enabled on the team |
| `.squad/` | ❌ Never | Your team's knowledge, decisions, casting state, skills |

Squad-owned files (`squad.agent.md` and `.squad/templates/`) are replaced entirely. Don't put custom changes in them — they'll be lost on upgrade.

Your team state in `.squad/` is never touched. Agent charters, histories, decisions, casting state, skills, and session logs are all safe.

---

## Migrations

Some upgrades require additive changes to your team state directory — like creating a new subdirectory that didn't exist in older versions.

Migrations are:
- **Additive** — they only create new files or directories, never modify existing ones
- **Idempotent** — safe to re-run; if the change already exists, it's skipped

---

## Migrating .ai-team/ → .squad/

Very early versions of Squad used `.ai-team/` instead of `.squad/`. The `upgrade --migrate-directory` flag handles this rename:

```bash
squad upgrade --migrate-directory
```

What it does:
- Renames `.ai-team/` → `.squad/`
- Updates `.gitignore` and `.gitattributes` references
- Scrubs email addresses from migrated files (PII cleanup)

---

## Version Stamping

`squad.agent.md` is version-stamped on install and upgrade. The version appears in two places:

### 1. Agent Name (Visible in UI)

The version is displayed in the agent picker across all Copilot hosts (VS Code, CLI, Visual Studio):

```
Squad (vX.Y.Z)
```

When you select agents in Copilot, you'll see **"Squad (vX.Y.Z)"** in the dropdown — making it immediately clear which version you're running.

### 2. CLI Check

You can also check your installed version from the command line:

```bash
# Global install
squad --version

# Local install
npx squad --version

# One-off
npx @bradygaster/squad-cli --version
```

---

## Already Up to Date

If you're already on the latest version, `squad upgrade` reports it and still runs any pending migrations:

```
✅ Already up to date (v0.8.21)
```

---

## 2. Commit the Upgrade

```bash
git add .github/agents/squad.agent.md .squad/templates/
git commit -m "Upgrade Squad to vX.Y.Z"
```

No changes to `.squad/` — the diff is limited to Squad-owned files.

---

## Tips

- **Upgrade is safe.** It only overwrites files that Squad owns. Your team state is never modified.
- **Don't customize `squad.agent.md`.** Any changes you make will be overwritten on the next upgrade. If you need custom behavior, use directives in `decisions.md` instead.
- **Re-running upgrade is harmless.** If you're not sure whether an upgrade completed, run it again. It's idempotent.
- **After a major version jump**, consider running `squad migrate` instead of `squad upgrade` — it performs a full backup, clean, and reinit in one step. See the [Migration Guide](../get-started/migration.md).
