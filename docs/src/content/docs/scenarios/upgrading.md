# Upgrading Squad

Update Squad-owned files to the latest version without losing your team state.

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

Casting state validated — your team's identities and history are preserved

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
| `.squad/` (or legacy `.ai-team/`) | ⚡ Conditional | Casting schema migrations and built-in file refreshes; team knowledge is preserved |

Squad-owned files (`squad.agent.md` and `.ai-team-templates/`) are replaced entirely. Don't put custom changes in them — they'll be lost on upgrade.

Updates retain each existing destination's newline style, including CRLF on
Windows, across the coordinator, generated capability block, templates,
built-in skills, and workflows. A newline-only difference does not rewrite a
managed template; real content updates still apply. New files use shipped
template newlines. Upgrade does not change your repository's line-ending policy.

Shared `.mcp.json` entries never contain a standalone installation's absolute
path. Packaged installs use `squad.exe` on Windows or `squad` on Unix from the
MCP host's PATH; npm installs retain their version-pinned `npx` entry.

Agent identities, charters, histories, decisions, and session logs are preserved.
Supported legacy casting state is migrated as described below; built-in skills
may be refreshed as Squad-owned files.

---

## Migrations

Some upgrades require additive changes to your team state directory — like creating a new subdirectory that didn't exist in older versions.

Migrations are:
- **Preserving** — directory migrations are additive; casting schema migrations
  preserve original files in a non-overwriting archive
- **Idempotent** — safe to re-run; if the change already exists, it's skipped

Example: upgrading to v0.2.0 creates `.ai-team/skills/` if it doesn't already exist.

### Legacy casting state (upgrades to 1.x)

`squad upgrade` validates casting state **before** replacing the coordinator,
skills, workflows, or other upgrade-managed files, even when the installed
coordinator already matches the CLI version.

Supported unversioned registries have an `agents` object with persistent names,
universes, statuses, and creation dates. Roles default to the agent ID only when
absent; display names and update dates default to the persistent name and creation
date only when absent. Supported history contains assignment snapshots using
`members[].folder`, agent ID arrays, or role-ID-to-persistent-name maps, with
matching universe usage records using `created_at` or `used_at`.

Migration preserves agent IDs, names, original dates (including timezone offsets),
assignment keys, and snapshot dates. Revision 1 and `generated_at` establish a
**new managed migration baseline**, not a reconstructed historical generation.
An agent created after an older assignment keeps its later creation date.

The byte-exact originals, including repository paths and metadata not represented
by the current runtime schema, are retained at
`casting/legacy-archive-<content-hash>/registry.json` and `history.json`.
Archives are never overwritten. Treat them as private state: inspect them before
sharing or committing. Publication uses the shared writer lock and recoverable
registry/history commit transaction. Repeating migration preserves managed bytes.

`squad upgrade --dry-run` validates and previews migration without creating locks,
archives, or transaction files. Unknown schemas, damaged files, missing pair
members, mismatched assignment evidence, or inconsistent managed transactions
stop the upgrade before managed files change. Back up the state and seek recovery
help; do not manually add `revision`, delete casting files, or rewrite dates.

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

Review the upgrade diff, including any casting migration and original-file
archives, before committing. Do not share archives containing private metadata.

---

## Tips

- **Upgrade preserves your team.** It refreshes Squad-owned files and safely
  migrates supported casting state with original-file archives.
- **Don't customize `squad.agent.md`.** Any changes you make will be overwritten on the next upgrade. If you need custom behavior, use directives in `decisions.md` instead.
- **Re-running upgrade is harmless.** If you're not sure whether an upgrade completed, run it again. It's idempotent.

---

## After upgrading to `two-layer` or `orphan`

After running `squad upgrade --state-backend two-layer` (or `--state-backend orphan`), verify the migration completed cleanly:

### 1. Working tree is clean

```bash
git status
```

You should see no changes. The migration removes the working-tree state files after copying them to the orphan branch — if `.squad/decisions.md` or any `history.md` files still appear as untracked or modified, rerun the migration.

### 2. Orphan branch contains your state

```bash
git ls-tree --name-only -r squad-state
```

You should see your state files listed (e.g. `decisions.md`, `agents/scribe/history.md`). If the branch is missing or empty, the migration may not have completed.

### 3. Push the orphan branch and notes once

The orphan branch and any git notes need to be pushed to the remote so collaborators can access them:

```bash
git push origin squad-state
git push origin 'refs/notes/squad*:refs/notes/squad*'
```

After this, the `post-commit` hook keeps both in sync automatically on every commit.

### If state files reappear later

If `.squad/decisions.md` or `history.md` files reappear in the working tree and a `git commit` is blocked with `⚠ squad pre-commit: refusing to commit two-layer state into the working tree`, see the [pre-commit troubleshooting entry](./troubleshooting#squad-pre-commit-refusing-to-commit-two-layer-state-into-the-working-tree) for the recovery flow.
