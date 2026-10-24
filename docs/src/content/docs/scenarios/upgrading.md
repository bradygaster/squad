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

Agent identities, charters, histories, decisions, session logs, and
`.squad/team.md` are preserved byte-for-byte. Upgrade can install optional
built-in charters, but it never adds those agents to the roster.
Supported legacy casting state is migrated as described below; built-in skills
may be refreshed as Squad-owned files.

### Opting optional built-ins into the roster

Rai and Fact Checker remain opt-in for existing squads. Use the explicit roster
command instead of upgrade:

```bash
# Preview the exact team.md diff without writing
squad roster add rai --dry-run

# Add one or both optional built-ins
squad roster add rai
squad roster add fact-checker
squad roster add all

# Remove only rows previously added by this command
squad roster remove rai
```

The first add writes and verifies `.squad/team.md.roster-backup` before changing
`team.md`, then records row ownership in `.squad/.roster-provenance.json`.
Repeated adds do not create duplicates, including when an equivalent or
case-only row already exists. Removing the last tool-owned row restores the
original bytes when the file has not otherwise changed.

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

This is **projection uninstall only**. It does not change the installed CLI, your `.squad/` team state, or the Squad version your repository is on, and it is **not** a way to return to an older Squad.

### There is no supported downgrade

Never run an older Squad CLI (`npx @bradygaster/squad-cli@<old>`, an old standalone bundle, or a stale global install) against a repository that has been upgraded:

- Old CLIs have no newer-version guard; a real `squad upgrade` from them rewrites the coordinator, skills, workflows and templates back to the old version.
- 0.9.1's `squad upgrade --dry-run` is **not trustworthy**: it performs the downgrade instead of previewing it. Later 0.13.x–1.1.0 CLIs honor `--dry-run` but still preview overwriting Squad-owned files.
- If an old CLI has already touched an upgraded repository, re-run `squad upgrade` with the current CLI to repair the Squad-owned files. Team state (`team.md`, `decisions.md`, agents' charters and histories) is not changed by either direction.

The verified behavior of every old release is recorded under [Tested upgrade paths](#tested-upgrade-paths) below.

### Removed in 2.0

Squad 2.0 removes some 1.x features outright; the single record of what was removed is the **BREAKING** row in [What's New → Breaking & Behavior Changes (v2.0.0)](../whatsnew.md#breaking--behavior-changes-v200). There is no migration tool for removed features. Squad now resolves a team only from the project `.squad/` (current directory and parents): outside a project, `squad status`, `squad doctor`, `squad cast` and `squad cost` exit with `No squad in this directory. Run "squad init" first.`

`squad upgrade` removes an obsolete `teamRoot` setting that older versions could leave in `.squad/config.json` pointing outside the project (one line: `Removed obsolete "teamRoot" setting from .squad/config.json.`); a `teamRoot` that points at another repository (dual-root mode) is left alone. `squad upgrade` also no longer treats its own version stamps in `squad.agent.md` as a local customization, so an existing `squad.agent.md.local-backup` survives repeated upgrades.

### Downgrading and old CLIs

Squad does not support downgrading in place. Older CLIs have no "newer workspace" guard — a 0.9.x or 1.x `squad upgrade` run against a 2.0 workspace will rewrite Squad-owned files to its own templates without warning, and on 0.9.1 `squad upgrade --dry-run` still writes. To go back, restore `.github/agents/squad.agent.md`, `.github/workflows/squad-*.yml` and `.squad/` from version control, then install the older CLI. Keep the CLI version pinned per repository (`npx @bradygaster/squad-cli@<version>`) when several people work on the same workspace.

---

<!-- UPGRADE-MATRIX:START -->

<!-- GENERATED from test-fixtures/spec/suite-v0.2/upgrade-matrix.json by scripts/render-upgrade-matrix.mjs. Edit the JSON (or merge new suite results), then re-run the script. -->

## Tested upgrade paths

Every row below is a pinned, published artifact of an older Squad release driven through `squad init` under a given project state shape, then **upgraded** with the CLI packed from the tree under test (`npm pack` of `@bradygaster/squad-sdk` + `@bradygaster/squad-cli`) by `test/squad-20-upgrade-matrix.test.ts`. A row **passes** only when every non-xfail assertion passed; a row that carries a pinned finding is reported as **pass WITH known … failure (F<n>)**, never as a bare pass; **fail** names the failing checks; **not applicable** cells are each explained individually below (none means "not run"). Machine-readable source: `test-fixtures/spec/suite-v0.2/upgrade-matrix.json` (protocol `upgrade-matrix/v1`).

### Three different things

| Term | Meaning |
|------|---------|
| **upgrade** | `squad upgrade` with the current CLI: refreshes Squad-owned files, migrates casting/state, preserves user state. The only supported direction. |
| **projection uninstall** | `uninstallClients()` from `@bradygaster/squad-sdk/client`: removes generated host projections and restores shared files byte-exact. Does not change the installed CLI, `.squad/` state, or the repository's Squad version. |
| **unsupported downgrade** | Running an older Squad CLI against an upgraded repository. Not supported; the `downgrade-probe` check only records what each old CLI does so users are warned (0.9.1 `--dry-run` mutates — F3). |

> ⚠️ **Never run an older Squad CLI against an upgraded repository.** There is no supported downgrade. The `downgrade-probe` rows record what each old CLI does: 0.9.1 `squad upgrade --dry-run` is **not trustworthy** — it rewrites the coordinator, skills, workflows and templates in place (F3); 0.13.1–1.1.0 preview overwriting them. If an old CLI has already touched an upgraded repository, re-run `squad upgrade` with the current CLI to repair the Squad-owned files; your `.squad/` team state is not changed by either direction. `uninstallClients()` removes host projections only — it is **not** a way back to an older Squad.

### Runs

All recorded runs executed against **one tree**, commit `9da01a2e41ba15794d31b0b8251ddaa3abd34ba8`, with harness hash `bca27c39dc2dcbff…` (sha256 over the suite, renderer, workflow, fs hook and this fixture minus `runs`; the integrity test refuses a recorded run whose harness differs from the committed one, so folding results may change nothing but the runs data).

| Platform | Arch | Node | Target | Tree (targetSha) | Trigger | Recorded | Outcome |
|----------|------|------|--------|------------------|---------|----------|---------|
| Linux (`linux`) | x64 | v22.23.3 | v1.2.0-preview.1 | `9da01a2e41ba` | [workflow_dispatch](https://github.com/bradygaster/squad/actions/runs/39903943542) | 2026-10-23 | 35 rows passed all non-xfail assertions; 4 of them carry a known expected failure (F3: Squad 0.9.1 squad upgrade --dry-run is not dry); 0 rows failed; 7 rows are structurally inapplicable (listed below). |
| Windows (`win32`) | x64 | v22.23.4 | v1.2.0-preview.1 | `9da01a2e41ba` | [workflow_dispatch](https://github.com/bradygaster/squad/actions/runs/39903943542) | 2026-10-23 | 35 rows passed all non-xfail assertions; 4 of them carry a known expected failure (F3: Squad 0.9.1 squad upgrade --dry-run is not dry); 0 rows failed; 7 rows are structurally inapplicable (listed below). |

### Producers (pinned, immutable provenance)

| Version | Provenance | Artifact pins | Why it is in the matrix | `--state-backend` |
|---------|------------|---------------|-------------------------|-------------------|
| **0.9.1** | npm | `@bradygaster/squad-cli@0.9.1`<br>sha1 `a5ee3dbfc44b7457eba56476f708ad6fdc2e09ca`<br>`sha512-TcZqRbJk3XBg4N8Y5/5OWJeA52ARAMuzk4MGtB0bfdr87e7iJRV6lJEw8+OIYz9IQ+1JxN/Q30dZDALMOcdi2w==`<br>`@bradygaster/squad-sdk@0.9.1`<br>sha1 `4735aba9f125de415160cd979ea3f1467903f16e`<br>`sha512-1KqZ2N6Lt/B4uYlU/Su9JjA1s/7ng0OAEb9CZrkRk19YSPi6tg7K5QWdTKl5gY/gp8zPAJqfjVffOwrZwGlzmw==` | Oldest 0.x line that still installs on Node 22 (engines >=22.5); pinned with its own @bradygaster/squad-sdk@0.9.1 (its `>=0.9.0` range would otherwise float to 1.0.1). Scaffolds `.squad/` with an EMPTY `casting/` directory and skills under `.copilot/skills/`; predates --state-backend. | no |
| **0.13.1** | npm | `@bradygaster/squad-cli@0.13.1`<br>sha1 `c8f6427bab4cae989934574315eabda98495fb37`<br>`sha512-ogfx2nhyx6fqMyqlaI5tDnOzUbRdh+a6Uh/rMQ0aNJwAXnvQp4N37Xp/eOTyB5CxcB7E34NBtAfCxyXbWSiS8w==`<br>`@bradygaster/squad-sdk@0.13.1`<br>sha1 `90e98450971e921ca2072673b325fcc8126a2fb6`<br>`sha512-1Jt6c9kahJq1JCcE77j/50D79YcXVG6Rt1genuLJ3O9J2SKTZKemlbvHgftkc5LgGH22DkWqHh5zLNEQ/p+ukA==` | Last 0.x stable; first line with --state-backend (local\|orphan\|two-layer) and user-profile squads (writes teamRoot when a profile squad exists). | yes |
| **1.0.0** | npm | `@bradygaster/squad-cli@1.0.0`<br>sha1 `e4e776ef938cbe8c65d8d2c729f2249a48bca638`<br>`sha512-mnZXnA+GAtp4KSLf7a4Zw0BpeOaHFAxYV5oxAy58ancZ9C2LguUGbcTxWIG0djM96XWET8K9fcncif3Vm6Z9RQ==`<br>`@bradygaster/squad-sdk@1.0.0`<br>sha1 `4abb8e450e79827b865a7846af6589789d079cab`<br>`sha512-9f4NthJaQDq6ifXU3f6VfsZz2bbWs2u57fHhXKtDgDMSvZ3Xq8FPjMvddxhRvseWqaSlkYcWsag3M/lzTtKaJA==` | First 1.x stable; last version published to npm (dist-tag latest). | yes |
| **1.0.1** | GitHub Release | [bradygaster/squad v1.0.1](https://github.com/bradygaster/squad/releases/tag/v1.0.1) — assets by immutable id:<br>`squad-darwin-arm64.tar.gz` id `610330560` sha256 `47a8d44d0a9a338ae2c2b6192cb761187ebd71edbd1171a4800cee11cb001b43`<br>`squad-darwin-x64.tar.gz` id `610330564` sha256 `b88db7e8949878ba2cdf756758651cd50a0e9b5fc83f4c759bd7438d596b4951`<br>`squad-linux-arm64.tar.gz` id `610330558` sha256 `9d8105c903eeac4d1762e43432f54827a6c4676f4aa42cfdf34bf645e497e756`<br>`squad-linux-x64.tar.gz` id `610330551` sha256 `283a1893be9ddad11056dcc8bd0673eff6b48a789bbf523b3f7ec31994d27ac7`<br>`squad-win32-arm64.zip` id `610330674` sha256 `586c4e2d3d708f4d3f08b2c8ffb965d9312d6586d0830a1b8a817b27c3c14bd0`<br>`squad-win32-x64.zip` id `610330559` sha256 `f38a8f85e60982dba340187b761488f01de1aec68ea50c1b85725783d32df2fe` | Patch release whose CLI never reached npm (release run 37222633918: SDK publish failed, CLI publish skipped); only the standalone bundles exist. | yes |
| **1.1.0** | GitHub Release | [bradygaster/squad v1.1.0](https://github.com/bradygaster/squad/releases/tag/v1.1.0) — assets by immutable id:<br>`squad-darwin-arm64.tar.gz` id `659607638` sha256 `057c8d2296e1c95cd77933bae55475409a2dce88aa5b3443cc6ca6cfcd545631`<br>`squad-darwin-x64.tar.gz` id `659607644` sha256 `4e4e8574f6a339f5537c82eb586d66ecf2ee3005e86b058b834b965be33a43cd`<br>`squad-linux-arm64.tar.gz` id `659607639` sha256 `992e9dbfe677e3c772446960051329aaed1578d5e4dbcb3350827dbb755e8b00`<br>`squad-linux-x64.tar.gz` id `659607641` sha256 `2de647a3feaef334051eb1b3084acba37a511818aad029a16abfe32fadb41aff`<br>`squad-win32-arm64.zip` id `659607808` sha256 `3c922c37863b255546403cffb2aa1c7dff2a347be87ca582759c149aec7bb1da`<br>`squad-win32-x64.zip` id `659607643` sha256 `571d734f7ae718fefefdfa9864f9f82a3d1fb1546f01ec8bf8866fa7e1829c57` | Latest 1.x release; npm CLI publish failed in release run 39442663504 ("Could not verify @bradygaster/squad-cli@1.1.0 on npm dist-tag 'latest' after 20 attempts"), so the standalone bundle is the only published artifact. | yes |
| **HEAD** | local HEAD (pack) | npm pack of packages/squad-sdk and packages/squad-cli from the tree under test (targetSha) | Same-version idempotency: the CLI packed from this tree scaffolds and then upgrades itself. | yes |

npm tarballs are fetched by exact version through the registry npm is configured for and verified against the recorded sha1 + sha512 before use; GitHub Release bundles are downloaded by immutable asset id and verified against the recorded sha256. A verification mismatch **fails** the producer's rows (it is never a skip); only an unreachable registry/release yields a skip, and that skip carries the reason.

### State shapes

| Shape | Setup |
|-------|-------|
| `default` | `squad init` with an empty profile directory, plus a custom agent (`agents/probe/`), an appended decision, a hand-written `.mcp.json` server, `AGENTS.md`, `CLAUDE.md` and a `.gitignore` rule. |
| `profile` | As `default`, but the platform config dir is pre-seeded with the 1.x user-profile layout (a roster directory and a `.squad/` under `<config>/squad/`); the whole tree must stay sha256-identical and the project must not be linked to it. |
| `legacy-casting` | As `default`, then `.squad/casting/` is replaced by a hand-written `registry.json` (`{universe, agents:[{name, role, status}]}`) with no history — the shape an agent-edited 1.x registry has. |
| `orphan` | `squad init --state-backend orphan` (producers that have the flag); the `squad-state` branch and `stateBackend` must survive. |
| `two-layer` | `squad init --state-backend two-layer` (producers that have the flag); the `squad-state` branch and `stateBackend` must survive. |
| `ai-team` | As `default`, then `.squad/` is renamed to the legacy `.ai-team/` and the upgrade runs with `--migrate-directory`. |
| `upstream` | HEAD only: a second squad is declared via `squad upstream add <path> --name org`; `upstream.json` must survive the upgrade byte-exact. |

### Results (version × shape × OS)

| Producer | Provenance | Shape | Linux | Windows |
|----------|------------|-------|---|---|
| **0.9.1** | npm | `default` | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) |
| **0.9.1** | npm | `profile` | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) |
| **0.9.1** | npm | `legacy-casting` | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) |
| **0.9.1** | npm | `orphan` | ⏭️ not applicable — `@bradygaster/squad-cli@0.9.1` has no `--state-backend` flag (first shipped in 0.13.x), so an orphan-backend project cannot be produced by it. | ⏭️ not applicable — `@bradygaster/squad-cli@0.9.1` has no `--state-backend` flag (first shipped in 0.13.x), so an orphan-backend project cannot be produced by it. |
| **0.9.1** | npm | `two-layer` | ⏭️ not applicable — `@bradygaster/squad-cli@0.9.1` has no `--state-backend` flag (first shipped in 0.13.x), so a two-layer-backend project cannot be produced by it. | ⏭️ not applicable — `@bradygaster/squad-cli@0.9.1` has no `--state-backend` flag (first shipped in 0.13.x), so a two-layer-backend project cannot be produced by it. |
| **0.9.1** | npm | `ai-team` | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) | ✅⚠️ pass WITH known destructive downgrade-probe failure (F3) |
| **0.9.1** | npm | `upstream` | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 0.9.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 0.9.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **0.13.1** | npm | `default` | ✅ pass | ✅ pass |
| **0.13.1** | npm | `profile` | ✅ pass | ✅ pass |
| **0.13.1** | npm | `legacy-casting` | ✅ pass | ✅ pass |
| **0.13.1** | npm | `orphan` | ✅ pass | ✅ pass |
| **0.13.1** | npm | `two-layer` | ✅ pass | ✅ pass |
| **0.13.1** | npm | `ai-team` | ✅ pass | ✅ pass |
| **0.13.1** | npm | `upstream` | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 0.13.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 0.13.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **1.0.0** | npm | `default` | ✅ pass | ✅ pass |
| **1.0.0** | npm | `profile` | ✅ pass | ✅ pass |
| **1.0.0** | npm | `legacy-casting` | ✅ pass | ✅ pass |
| **1.0.0** | npm | `orphan` | ✅ pass | ✅ pass |
| **1.0.0** | npm | `two-layer` | ✅ pass | ✅ pass |
| **1.0.0** | npm | `ai-team` | ✅ pass | ✅ pass |
| **1.0.0** | npm | `upstream` | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.0.0 cannot declare an upstream, so there is nothing for the upgrade to preserve. | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.0.0 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **1.0.1** | GitHub Release | `default` | ✅ pass | ✅ pass |
| **1.0.1** | GitHub Release | `profile` | ✅ pass | ✅ pass |
| **1.0.1** | GitHub Release | `legacy-casting` | ✅ pass | ✅ pass |
| **1.0.1** | GitHub Release | `orphan` | ✅ pass | ✅ pass |
| **1.0.1** | GitHub Release | `two-layer` | ✅ pass | ✅ pass |
| **1.0.1** | GitHub Release | `ai-team` | ✅ pass | ✅ pass |
| **1.0.1** | GitHub Release | `upstream` | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.0.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.0.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **1.1.0** | GitHub Release | `default` | ✅ pass | ✅ pass |
| **1.1.0** | GitHub Release | `profile` | ✅ pass | ✅ pass |
| **1.1.0** | GitHub Release | `legacy-casting` | ✅ pass | ✅ pass |
| **1.1.0** | GitHub Release | `orphan` | ✅ pass | ✅ pass |
| **1.1.0** | GitHub Release | `two-layer` | ✅ pass | ✅ pass |
| **1.1.0** | GitHub Release | `ai-team` | ✅ pass | ✅ pass |
| **1.1.0** | GitHub Release | `upstream` | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.1.0 cannot declare an upstream, so there is nothing for the upgrade to preserve. | ⏭️ not applicable — Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.1.0 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **HEAD** | local HEAD (pack) | `default` | ✅ pass | ✅ pass |
| **HEAD** | local HEAD (pack) | `profile` | ✅ pass | ✅ pass |
| **HEAD** | local HEAD (pack) | `legacy-casting` | ✅ pass | ✅ pass |
| **HEAD** | local HEAD (pack) | `orphan` | ✅ pass | ✅ pass |
| **HEAD** | local HEAD (pack) | `two-layer` | ✅ pass | ✅ pass |
| **HEAD** | local HEAD (pack) | `ai-team` | ✅ pass | ✅ pass |
| **HEAD** | local HEAD (pack) | `upstream` | ✅ pass | ✅ pass |

### Not-applicable cells, each explained

These 7 cells are structurally impossible to exercise — the old producer cannot create that project shape — so they are **not** "not run"; the suite asserts the recorded skipped rows are exactly this list.

| Producer | Shape | Why it cannot apply |
|----------|-------|---------------------|
| **0.9.1** | `orphan` | `@bradygaster/squad-cli@0.9.1` has no `--state-backend` flag (first shipped in 0.13.x), so an orphan-backend project cannot be produced by it. |
| **0.9.1** | `two-layer` | `@bradygaster/squad-cli@0.9.1` has no `--state-backend` flag (first shipped in 0.13.x), so a two-layer-backend project cannot be produced by it. |
| **0.9.1** | `upstream` | Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 0.9.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **0.13.1** | `upstream` | Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 0.13.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **1.0.0** | `upstream` | Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.0.0 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **1.0.1** | `upstream` | Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.0.1 cannot declare an upstream, so there is nothing for the upgrade to preserve. |
| **1.1.0** | `upstream` | Upstream inheritance (`.squad/upstream.json`, `squad upstream add`) is a Squad 2.0 feature; 1.1.0 cannot declare an upstream, so there is nothing for the upgrade to preserve. |

### Expected failures (pinned)

Each pin names an open finding; the suite reports the check as `xfail` and **fails the moment it starts passing** (`xpass`), so a pin cannot outlive its bug.

| Check | Producers | Shapes | Platforms | Finding |
|-------|-----------|--------|-----------|---------|
| `downgrade-probe` | 0.9.1 | all | all | [F3](#f3) |

### Checks

| Check | Meaning |
|-------|---------|
| `producer-artifact-verified` | The pinned artifact that was executed matched its recorded hashes (npm: sha1 shasum + sha512 integrity of both tarballs; GitHub Release: sha256 of the asset downloaded by id). A mismatch FAILS every row of that producer — it is never a skip; only an unreachable registry/release skips, with the reason. |
| `scenario-setup` | The matrix could set up the shape (e.g. configure the `upstream` squad). Only recorded when setup fails: a row can never be `fail` without a failing check (LD-2). |
| `producer-init` | The OLD CLI (the pinned producer artifact) scaffolds the project non-interactively (exit 0, `.squad/team.md` present). |
| `upgrade-plain` | `squad upgrade` (plus `--migrate-directory` for `ai-team`) with the NEW packed CLI exits 0. |
| `coordinator-is-new-template` | `.github/agents/squad.agent.md` carries the new version stamp (`<!-- version: X -->`, `Squad (vX)`). |
| `user-state-preserved` | Full manifest compare (path + sha256 of every file outside `.git/`) before/after the plain upgrade: every seeded user file — active and retired agent folders, nested unknown files, filenames with spaces and Unicode, appended `decisions.md`/`team.md`/`routing.md`, a user skill — is byte-identical; every changed path matches a declared Squad-owned pattern (`squadOwned`); the custom `config.json` key is kept. For `orphan`/`two-layer` the mutable state (`decisions.md`, `agents/*/history.md`) is seeded as git blobs on `squad-state` and every seeded blob OID must be unchanged and no branch path deleted. For `ai-team` the legacy directory is mapped onto `.squad/` first so the migration itself is not counted. |
| `casting-pair-valid` | `readCastingRegistryPair` from the packed SDK reads a numbered registry + history; for `legacy-casting` the hand-written original is archived and `probe` is in the repaired registry. |
| `state-backend-preserved` | `config.json` `stateBackend` is unchanged; for `orphan`/`two-layer` the `squad-state` branch still exists. |
| `ai-team-migrated` | `.ai-team/` is gone and `.squad/team.md` exists (only for the `ai-team` shape). |
| `team-root-absent` | `config.json` has no `teamRoot` after the upgrade (Squad 2.0 never links a project to a profile directory). |
| `profile-untouched` | The seeded 1.x `<config>/squad/` profile tree (roster directory + `.squad/`) is sha256-identical after EVERY phase (upgrade, second upgrade, downgrade probe, projection, doctor, uninstall — the offending phase is named) AND the fs access logger loaded into every Squad 2.0 process (`NODE_OPTIONS=--require test/fixtures/upgrade-matrix/fs-access-log.cjs`) recorded zero reads, probes or writes under it (only for `profile`). |
| `idempotent-second-upgrade` | A second plain `squad upgrade` changes nothing: sha256 of every file outside `.git/`, every git ref OID (`for-each-ref`, incl. the `squad-state` branch and any notes refs), `git status --porcelain` and the `squad-state` commit count are identical. |
| `downgrade-probe` | UNSUPPORTED PATH, recorded not endorsed: the OLD CLI's `upgrade --dry-run` against a copy of the upgraded project must modify nothing; its exit code and message are recorded as a note. Squad has no supported downgrade. |
| `clients-projected` | `squad upgrade --client all --force` exits 0, `config.json` `clients` lists all 7 hosts, and every projection PARSES with its host's format — JSON (`.mcp.json`, `.kiro/agents/squad.json`, `.kiro/settings/mcp.json`, `opencode.json`, `.cursor/mcp.json`), TOML (`.codex/agents/squad.toml`, `.codex/config.toml`), YAML frontmatter (`.github/agents/squad.agent.md`, `.claude/agents/squad.md`, `.kiro/steering/squad.md`, `.opencode/agent/squad.md`, `.cursor/agents/squad.md`, `.cursor/rules/squad.mdc`, `.agents/agents/squad.md`) — with a `squad_state` MCP entry where the host has one; mirrors the per-host assertions in `test/clients.test.ts`. |
| `user-config-preserved` | After projection the user's `.mcp.json` server, `AGENTS.md`/`CLAUDE.md` paragraphs and `.gitignore` rule are intact (for `upstream`: `upstream.json` is byte-identical). |
| `doctor` | `squad doctor` exits 0 with no ❌ line. |
| `projection-uninstall-byte-exact` | `uninstallClients(CLIENT_IDS)` from the packed SDK, judged against the tree right after the plain upgrade (before any projection): `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.gitignore` byte-identical to that baseline (absent stays absent); all 8 projection files removed (agents, Kiro steering, Cursor rules, Kiro agent JSON); `.mcp.json` equal to the baseline minus the `squad_state` entry Squad installed, with the user's server intact; Kiro/Cursor MCP JSON, `opencode.json` and `.codex/config.toml` created by the projection carry no `squad_state`; seeded `.squad/` files and `squad-state` blobs untouched. This is projection uninstall — NOT a package or repository rollback and NOT a downgrade. |

Paths a plain `squad upgrade` may create or rewrite (the only changes `user-state-preserved` accepts):

- `^\.github/agents/squad\.agent\.md(\.local-backup)?$`
- `^\.github/copilot-instructions\.md$`
- `^\.github/skills/`
- `^\.copilot/skills/`
- `^\.github/workflows/(squad-[\w-]+|sync-squad-labels)\.yml(\.local-backup)?$`
- `^\.squad/\.first-run$`
- `^\.squad/config\.json$`
- `^\.squad/casting/`
- `^\.squad/templates/`
- `^\.squad/casting-(history|policy|registry)\.json$`
- `^\.squad/agents/(rai|Rai|fact-checker|ralph|scribe)/`
- `^\.squad/(rai|fact-checker|identity|memory)/`
- `^\.squad/(ceremonies|ralph-instructions)\.md$`
- `^\.gitignore$`
- `^\.gitattributes$`
- `^\.mcp\.json$`
- `^\.copilot/mcp-config\.json$`
- `^\.vscode/`

### Findings

Real upgrade defects observed by the suite. An open finding is pinned as an expected failure until fixed (the fix lands in the layer named, not in this test-only layer); a resolved finding keeps its repro here so the matrix row that used to carry it documents the regression guard.

#### F1 — Stale `teamRoot` written by 0.13.x–1.x `init` survives `squad upgrade`; the upgraded project resolves in remote mode against the removed profile squad

**Severity:** high · **Owner:** C — user-profile squad removal (`runUpgrade` / `resolveSquadPaths`) · **Status:** ✅ resolved

Repro:

1. Seed a 1.x profile tree under the platform config dir: the user-profile roster directory and `.squad/` under `<config>/squad/` (APPDATA on Windows, XDG_CONFIG_HOME on Linux).
1. `squad init` with @bradygaster/squad-cli 0.13.1 or 1.0.0 (npm) or the 1.0.1 / 1.1.0 standalone bundle: it prints its profile-detected notice and writes `.squad/config.json` → `{ "version": 1, "teamRoot": "<config>\\squad" }`.
1. Upgrade with the 2.0 CLI packed from this tree: `squad upgrade` (exit 0, no warning about teamRoot).
1. `cat .squad/config.json` still contains `teamRoot: <config>/squad`; `squad doctor` reports `Mode: remote` and ❌ `routing.md`, `casting/registry.json`, `decisions.md` not found — it is reading `<config>/squad/.squad/`, not the project.

Observed: `team-root-absent` fails (`teamRoot=<config-home>/squad`) and `doctor` fails for the `profile` shape on every 0.13.1+ producer. The profile tree itself stays sha256-identical (`profile-untouched` passes), so this is a resolution defect, not a write: Squad 2.0 keeps honouring a link to a directory it no longer supports. Expected: `squad upgrade` drops (or refuses with guidance) a `teamRoot` that points at the platform config dir, and the project resolves in local mode.

Resolved: Fixed on squad2-c @ 21ecca77 (PR #2279): `squad upgrade` removes a `teamRoot` that resolves to the platform config dir / `~/.squad` / `SQUAD_HOME` (`isRetiredProfileTeamRoot()` in `@bradygaster/squad-sdk/resolution`) and prints `Removed stale teamRoot pointing to <path>; project state is now local`; `--dry-run` previews it; `resolveSquadPaths` treats such a teamRoot as local mode. Dual-root targets are untouched. Verified by this matrix: `team-root-absent` and `doctor` now pass for every 0.13.1+ producer × `profile` on both OSes (the former pins produced `xpass` before removal).

#### F2 — `squad upgrade` never recognizes its own stamped coordinator: every run reports "local customizations" and overwrites `squad.agent.md.local-backup`

**Severity:** medium · **Owner:** CLI core — `packages/squad-cli/src/cli/core/upgrade.ts` `writeAgentTemplate` · **Status:** ✅ resolved

Repro:

1. `squad init` (any producer, including the 2.0 CLI itself), then `squad upgrade` once — a genuine pre-upgrade coordinator is saved to `.github/agents/squad.agent.md.local-backup`.
1. Run `squad upgrade` again with nothing changed.
1. Output again says `⚠️ squad.agent.md has local customizations — backed up to squad.agent.md.local-backup`; the backup is overwritten with the pristine current coordinator, so the user's real pre-upgrade copy is gone. The only file whose sha256 changes between run 1 and run 2 is `.github/agents/squad.agent.md.local-backup`.

Observed: `idempotent-second-upgrade` fails with exactly `.github/agents/squad.agent.md.local-backup` for every old producer × shape × platform. On a project initialized by the 2.0 CLI itself the warning is printed on every run too (`Already up to date` + `⚠️ … local customizations`), but the overwritten backup is byte-identical, so the HEAD rows are not pinned. Cause: `writeAgentTemplate` strips `<!-- squad-cli vX -->` before comparing, but `stampVersion` writes `<!-- version: X -->`, `- **Version:** X` and `Squad vX`, so a stamped coordinator never equals the template. Expected: a second `squad upgrade` is a byte-for-byte no-op, prints no customization warning, and never touches an existing `.local-backup`.

Resolved: Fixed on squad2-c @ 21ecca77 (PR #2279): `stripAgentStamps()` (`@bradygaster/squad-cli/core/upgrade`) normalizes `<!-- version: X -->`, the `- **Version:**` token, `` `Squad vX` ``, `@bradygaster/squad-cli@X` and the legacy `<!-- squad-cli vX -->` before the customization compare, and an identical `.local-backup` is not rewritten. Verified by this matrix: `idempotent-second-upgrade` now passes for every producer × shape on both OSes.

#### F3 — Squad 0.9.1 `squad upgrade --dry-run` is not dry: pointed at a 2.0 project it silently downgrades the coordinator, skills, workflows and templates in place

**Severity:** info (historical producer defect — not fixable in 2.0; recorded for the downgrade story) · **Owner:** none — behavior of the published 0.9.1 CLI · **Status:** 🔴 open

Repro:

1. Scaffold with 0.9.1 (`npm install @bradygaster/squad-cli@0.9.1`), upgrade with the 2.0 CLI, copy the project.
1. In the copy run the 0.9.1 CLI: `squad upgrade --dry-run`.
1. It exits 0, prints the normal upgrade summary (`Upgrade complete: v1.2.0-preview.1 → v0.9.1 … Preserves user state: …`) and rewrites ~44 files with the pinned 0.9.1 SDK (~83 when 0.9.1's `>=0.9.0` SDK range floats to 1.0.1): `.github/agents/squad.agent.md` (back to 0.9.1), `.copilot/skills/*`, `.github/workflows/squad-*.yml`, `.squad/templates/*`, plus stray `.squad/charter.md`, `.squad/roster.md`, `.squad/history.md` … at the state root.

Observed: `downgrade-probe` fails for every 0.9.1 row because the dry-run modified files (destructive: it IS the downgrade) and printed `Upgrade complete: v1.2.0-preview.1 → v0.9.1`; 0.13.1, 1.0.0, 1.0.1 and 1.1.0 honor `--dry-run` (`Run without --dry-run to apply.`, nothing modified) but their preview lists `overwrite .github/workflows/squad-*.yml` etc. — none of the old CLIs has a newer-version guard, so running any of them for real against a 2.0 project downgrades the Squad-owned files. Guidance for users: never run an older CLI against an upgraded repository; re-run `squad upgrade` with the 2.0 CLI to repair a downgraded coordinator (team state is not touched by the downgrade).

Pinned checks: `downgrade-probe` (0.9.1 × all shapes × all platforms).

#### F4 — First `squad upgrade` of a 0.9.x project (empty `.squad/casting/`) does not converge: the coordinator's team-capabilities block is only rendered by the second upgrade

**Severity:** medium · **Owner:** CLI core — `packages/squad-cli/src/cli/core/upgrade.ts` (coordinator write + `syncTeamCapabilities` run before the casting pair is scaffolded) · **Status:** ✅ resolved

Repro:

1. `npx @bradygaster/squad-cli@0.9.1 init` with `@bradygaster/squad-sdk@0.9.1` pinned (the faithful 0.9.1 layout): `.squad/casting/` exists but contains no `registry.json`/`history.json`.
1. Run the 2.0 CLI `squad upgrade`: it prints `⚠️ Could not refresh squad.agent.md team capabilities: Cannot read a consistent casting registry/history pair: both files are required`, then creates the casting pair later in the same run.
1. Run `squad upgrade` again: `✓ upgraded squad.agent.md` — the coordinator gains the 17-line `<!-- squad:capabilities … -->` block that run 1 could not render. Nothing else changes.

Observed: `idempotent-second-upgrade` fails with exactly `.github/agents/squad.agent.md` for 0.9.1 × `default`/`profile`/`ai-team` on both OSes. 0.9.1 × `legacy-casting` is unaffected because the hand-written registry is repaired in the preflight, so the pair exists before the coordinator is written. The project is correct after the second run; the defect is ordering — the capabilities sync should run after the casting pair is ensured (or the pair should be ensured in the preflight).

Resolved: Fixed on squad2-c @ 50afa91a (PR #2279): `runUpgrade` runs `preflightCastingPair()` (ensureCastingDefaults) before `writeAgentTemplate` in both the already-current and the normal path, so a 0.9.x project with an empty `.squad/casting/` gets the `<!-- squad:capabilities -->` block on the first upgrade and the second upgrade is byte-identical (C test: `test/upgrade-profile-teamroot.test.ts` › "F4: a 0.9.x project (empty casting/) upgrades in ONE pass"). Verified by this matrix: with the pin still in place, `idempotent-second-upgrade` produced `xpass` on exactly 0.9.1 × default/profile/ai-team; the pin is removed.

### Unsupported downgrade — what each old CLI does to an upgraded repository

Recorded by the `downgrade-probe` check (dry-run on a copy; the only assertion is "modified nothing"). This is **not** a supported path — see the warning at the top of this section.

| Platform | Producer | Shapes | Observed |
|----------|----------|--------|----------|
| `linux` | 0.9.1 | all 4 shapes | exit 0, last lines "[32m✓[0m refreshed .squad/templates/ \| Upgrade complete: v1.2.0-preview.1 → v0.9.1 \| [2mPreserves user state: team.md, decisions/, agents/*/history.md[0m"; MODIFIED 45 files (20 coordinator/templates/workflows, e.g. .copilot/skills/agent-collaboration/SKILL.md, .copilot/skills/cross-squad/SKILL.md, .copilot/skills/git-workflow/SKILL.md …) |
| `linux` | 0.13.1 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |
| `linux` | 1.0.0 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |
| `linux` | 1.0.1 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |
| `linux` | 1.1.0 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |
| `win32` | 0.9.1 | all 4 shapes | exit 0, last lines "[32m✓[0m refreshed .squad/templates/ \| Upgrade complete: v1.2.0-preview.1 → v0.9.1 \| [2mPreserves user state: team.md, decisions/, agents/*/history.md[0m"; MODIFIED 44 files (20 coordinator/templates/workflows, e.g. .copilot/skills/agent-collaboration/SKILL.md, .copilot/skills/cross-squad/SKILL.md, .copilot/skills/git-workflow/SKILL.md …) |
| `win32` | 0.13.1 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |
| `win32` | 1.0.0 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |
| `win32` | 1.0.1 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |
| `win32` | 1.1.0 | all 6 shapes | exit 0, last lines "overwrite  ../.github/workflows/squad-triage.yml \| overwrite  ../.github/workflows/sync-squad-labels.yml \| Run without --dry-run to apply."; modified nothing |

<!-- UPGRADE-MATRIX:END -->

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
