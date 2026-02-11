# Upgrading Squad

Update Squad-owned files to the latest version without touching your team state.

---

## 1. Run the Upgrade

From your repo root:

```bash
npx github:bradygaster/squad upgrade
```

Squad detects your installed version, updates Squad-owned files, and runs any needed migrations:

```
✅ upgraded coordinator from 0.1.0 to 0.2.0
✅ upgraded .ai-team-templates/

.ai-team/ untouched — your team state is safe

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

Some upgrades require additive changes to your `.ai-team/` directory — like creating a new subdirectory that didn't exist in older versions.

Migrations are:
- **Additive** — they only create new files or directories, never modify existing ones
- **Idempotent** — safe to re-run; if the change already exists, it's skipped

Example: upgrading to v0.2.0 creates `.ai-team/skills/` if it doesn't already exist.

---

## Version Stamping

`squad.agent.md` is version-stamped on install and upgrade. You can check your installed version:

```bash
npx github:bradygaster/squad --version
```

```
0.2.0
```

Or look at the frontmatter in `.github/agents/squad.agent.md`:

```yaml
version: "0.2.0"
```

---

## Already Up to Date

If you're already on the latest version:

```bash
npx github:bradygaster/squad upgrade
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
