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

## Upgrading to Squad 2.0

### What changes for existing Copilot-only users

Nothing changes unless you opt in:

- Running `squad upgrade` without `--client` keeps your repository Copilot-only, preserves your `.squad/` team state, and does not generate files for Claude Code, Kiro, OpenCode, Cursor, Codex, or Antigravity.
- Plain `squad init` and `squad upgrade` only scaffold `.squad/` runtime ignores (including `.squad/backend/`) in `.gitignore`; client-specific ignores such as `.claude/worktrees/` are added only when `--client claude` (or `--client all`) is selected.

### Adding multi-host client projections (`--client`)

Project your existing `.squad/` team into any of the 7 supported hosts (`copilot`, `claude`, `kiro`, `opencode`, `cursor`, `codex`, `antigravity`, or `all`):

```bash
# Preview which host files would be created or updated
squad upgrade --dry-run --client claude,cursor,codex

# Apply and persist the selected hosts in .squad/config.json clients[]
squad upgrade --client claude,cursor,codex
```

Subsequent `squad upgrade` runs automatically refresh every client listed in `.squad/config.json` `clients[]` while preserving your existing MCP servers, formatting, and line endings in `.mcp.json`, `.kiro/settings/mcp.json`, `opencode.json` / `opencode.jsonc`, `.cursor/mcp.json`, and `.codex/config.toml`.

### Handwritten casting registry repair and `team.md` backfill

If `.squad/casting/registry.json` was previously hand-edited by an agent or is empty after an older CLI init, `squad upgrade` (and `squad upgrade --dry-run`) automatically repairs it before upgrading managed files:

- Valid provenance records (including `retired` and `inactive` agents and extra fields) are kept verbatim and `revision` is incremented.
- Empty registries are backfilled from `.squad/team.md` when each specialist maps to a provable `.squad/agents/<id>/charter.md` folder.
- Pre-repair originals are archived at `.squad/casting/handwritten-archive-<sha256>/`.
- If an entry cannot be proven (for example, bare strings without a role/name object or a roster row with no matching charter folder), `squad upgrade` fails closed and prints the exact dropped entries and how to fix them (`npx squad cast --name <Name> --role "<Role>"`).

### Deprecated `@bradygaster/squad-sdk/clients` alias

If you import host adapter APIs programmatically, update `@bradygaster/squad-sdk/clients` to the canonical `@bradygaster/squad-sdk/client` subpath. The `/clients` subpath remains exported in 2.0 as a deprecated compatibility alias for the same symbols.

### Experimental backend flag (`--experimental-backend`)

`@bradygaster/squad-sdk/backend` (`BACKEND_CONTRACT_STAGE = 'experimental'`) is an opt-in preview surface (DurableSquad Phase 2 server-side integration for remote durable approvals and lease epochs is pending):

- In `squad state-mcp`, the 11 `squad_backend_*` MCP conversation tools are disabled by default. Pass `--experimental-backend` or set `SQUAD_EXPERIMENTAL_BACKEND=1` to expose them (`SQUAD_BACKEND_URL` alone does not enable them).
- In SDK code, import `createSquadBackend` / `DurableHttpSquadBackend` from `@bradygaster/squad-sdk/backend` and pass an explicit `https://` `baseUrl` (`http://` only for localhost) and optional `token`.

### Rolling back client projections (`uninstallClients`)

To remove generated host projections and restore shared files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.gitignore`, and shared MCP config files) byte-for-byte outside Squad's managed sections:

```ts
import { uninstallClients } from '@bradygaster/squad-sdk/client';

uninstallClients(['claude', 'cursor', 'codex'], {
  root: process.cwd(),
  mcp: { command: 'squad', args: ['state-mcp'] },
});
```

Then remove the corresponding slug(s) from `clients` in `.squad/config.json`.

### Removed in 2.0

Squad 2.0 removes some 1.x features outright; the single record of what was removed is the **BREAKING** row in [What's New → Breaking & Behavior Changes (v2.0.0)](../whatsnew.md#breaking--behavior-changes-v200). There is no migration tool for removed features. Squad now resolves a team only from the project `.squad/` (current directory and parents): outside a project, `squad status`, `squad doctor`, `squad cast` and `squad cost` exit with `No squad in this directory. Run "squad init" first.`

`squad upgrade` removes an obsolete `teamRoot` setting that older versions could leave in `.squad/config.json` pointing outside the project (one line: `Removed obsolete "teamRoot" setting from .squad/config.json.`); a `teamRoot` that points at another repository (dual-root mode) is left alone. `squad upgrade` also no longer treats its own version stamps in `squad.agent.md` as a local customization, so an existing `squad.agent.md.local-backup` survives repeated upgrades.

### Downgrading and old CLIs

Squad does not support downgrading in place. Older CLIs have no "newer workspace" guard — a 0.9.x or 1.x `squad upgrade` run against a 2.0 workspace will rewrite Squad-owned files to its own templates without warning, and on 0.9.1 `squad upgrade --dry-run` still writes. To go back, restore `.github/agents/squad.agent.md`, `.github/workflows/squad-*.yml` and `.squad/` from version control, then install the older CLI. Keep the CLI version pinned per repository (`npx @bradygaster/squad-cli@<version>`) when several people work on the same workspace.

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
Snapshots and usage records also accept the historical `assigned_at` timestamp.
If multiple recognized timestamp fields are present, each must be valid and
denote the same instant. The original timestamp string, including its timezone
offset, is retained; migration never substitutes an agent creation date for an
assignment date.

The historical `entries[]` / `assignments[]` variant is also supported when
each registry entry's persistent name matches exactly one canonical folder's
`charter.md` under the team's `agents/` directory. The charter must contain an
`## Identity` section with `- **Name:**`; its optional `- **Role:**` supplies the
role, otherwise the canonical folder ID is used. Missing, duplicated, malformed,
or conflicting identities stop migration; names are never slugified into IDs.
Keep the original producer's charters with the state when testing this variant.
Each assignment's explicit persistent-name list supplies **only that historical
membership**, not today's roster. Its recorded universe and timestamp supply
the corresponding usage event. Missing universe or date evidence is never filled
from the current naming policy or agent creation dates.

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

#### Incomplete legacy provenance

Automatic migration refuses agents without a nonempty universe, snapshots with
a missing or `null` universe, and snapshots without matching historical usage.
Descriptive names alone do not prove a universe. A current coordinator's naming
policy does not prove the policy of an older assignment. Migration will not
invent a universe, usage entry, or historical membership.

The historical `entries[]` / `assignments[]` pair requires recovery when original
folder/charter identities are missing or ambiguous. Persistent names are not
canonical folder IDs. Today's team roster is not evidence of which agents
belonged to an older assignment. Restore the original authoritative `charter.md`
files alongside the original casting pair; do not create charters from guessed
name-to-folder mappings.

If either policy stops your upgrade:

1. Keep the installed coordinator and both original casting files intact. Make
   a private backup of the entire team state directory and coordinator before
   attempting recovery.
2. Retrieve the original assignment records and producing coordinator from
   version control or backups. For identity recovery, include original folder
   IDs and each historical assignment's membership, not just today's roster.
   For universe recovery, include recorded universe and usage evidence for each
   assignment. Do not fill fields from guesses or create synthetic usage.
3. Request migration/recovery support with the producer version, schema shape,
   and anonymized evidence. Do not publish private paths, state archives, or
   team knowledge. If evidence is unavailable, keep using the installed version;
   this refusal is **not** a completed migration.
4. After an evidence-backed recovery is available, test it on a disposable
   backup using `squad upgrade --dry-run`, then upgrade and verify identities,
   historical membership, dates, and byte-exact original archives before
   applying it to the live team.

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
