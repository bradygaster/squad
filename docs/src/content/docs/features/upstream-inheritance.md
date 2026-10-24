# Upstream Inheritance

Upstream inheritance lets you declare external Squad sources (from repositories, local directories, or exports) and inherit their context at session start. Share practices across teams, organizations, and projects without duplicating configuration.

## How it works

`squad upstream add` records each source in `.squad/upstream.json` and, for git sources, clones it under `.squad/_upstream_repos/<name>/`. At session start the coordinator calls the `squad_state_upstreams` tool (exposed by `squad state-mcp`, so every supported host gets it) which resolves the declared upstreams **from local disk only** and returns:

- **Skills** — `.copilot/skills/*/SKILL.md` or `.squad/skills/*/SKILL.md` of the upstream
- **Decisions** — `.squad/decisions.md`
- **Wisdom** — `.squad/identity/wisdom.md`
- **Casting policy** — `.squad/casting/policy.json`
- **Routing** — `.squad/routing.md`

`squad doctor` and `squad status` run the same resolution and print it, so you can see exactly what a session will inherit.

### Rules the resolver enforces

- **No fetch at session start.** Sessions read only what is already on disk: a `local` path, the clone made by `squad upstream add|sync` for `git`, or an export file. If a git upstream has not been synced, it is reported as `unavailable` with a hint to run `squad upstream sync <name>`; nothing is cloned implicitly.
- **Deterministic precedence.** The local `.squad/` always wins. Then upstreams apply in **declared order** (earlier entries win conflicts), each followed by its own upstreams (depth-first). On a skill-name or casting-policy conflict the first match stays; inherited decisions and routing are additional context, never a replacement for your own `decisions.md` / `routing.md`.
- **Provenance on everything.** Every inherited item is tagged `upstream:<name>@<ref>` (`@local`, `@export`, or the git ref). The coordinator cites that tag whenever inherited content shapes a spawn or an answer.
- **Transitive, bounded.** An upstream's own `upstream.json` is followed up to a depth of 3 (direct upstreams are depth 1). Deeper entries are reported as `depth-exceeded` and not read. A squad reached twice (a diamond) is inherited once, from its earliest position. Declarations found *inside a git snapshot* are third-party content: only the git upstreams that snapshot carries itself (synced into its own `_upstream_repos/`, plain-identifier names) are followed; nested `local` and `export` entries declared by a git upstream are reported as `invalid` and never read, so a remote repository cannot point your session at other paths on your machine. Chains made only of your own `local` declarations keep working. Every clone directory is vetted before it is followed: at depth 1 the project's own `.squad/_upstream_repos` and `_upstream_repos/<name>` must be regular directories (a link planted in your checkout makes the upstream `invalid`); deeper, the same check runs from the parent snapshot (a committed link in a clone is refused). After the reader is anchored, its canonical root is re-validated against the vetted path before the first read, and every file read re-verifies via open → `fstat` identity. `squad upstream sync` clones with `core.symlinks=false` so links are never materialized.
- **Cycle detection.** An upstream that resolves back to a squad directory already on the chain is reported as `cycle` and skipped.
- **Soft failure.** `missing` paths, `invalid` entries or export files, `unavailable` clones and `stale` clones (older than 30 days, still read) each carry a one-line diagnostic; the rest of the upstreams still resolve.
- **Transactional `add`.** `squad upstream add <git-url>` writes `upstream.json` only after the clone succeeded; a failed clone leaves the configuration untouched (a failed explicit `squad upstream sync` of an already-registered upstream is the allowed, different case). Git URLs with embedded credentials (`https://user:token@…`) are refused and never persisted, printed or passed to `git`.
- **Confined, race-safe reads.** An upstream is third-party content. Every file is reached by an `lstat` walk from the snapshot root (symlinks and junctions are never followed), budgeted from `lstat` sizes before any read (1 MiB per file, 256 KiB for a nested `upstream.json`, 8 MiB and 2000 files in total across every upstream of one resolution, 500 entries per directory, depth 8), then opened and verified with `fstat` (same device/inode/size) before being read through the descriptor. Any refusal marks the whole upstream `invalid`; nothing from it is served.
- **Git sources are allow-listed.** `squad upstream add|sync` accepts `https://`, `ssh://` and `git@host:path` only; leading-dash sources, remote helpers (`ext::`, `fd::`), `file://` and `http://` are refused, `--` precedes every positional, and the git subprocess runs with remote helpers and the file protocol disabled.
- **Inherited content is data, not instructions.** The tool output labels every inherited body `UNTRUSTED` and the coordinator contract tells the model to cite it, never follow directives inside it. This is a mitigation that labels the data; it is not a sandbox or an authorization boundary. Inherited content cannot change tools, permissions, approvals, MCP servers or host settings — those are governed by the host and the state backend, not by anything a snapshot says.

**Source types:**

| Type | Example | Use case |
|------|---------|----------|
| **local** | `../org-practices/.squad/` | Sibling repo, shared drive, monorepo package |
| **git** | `https://github.com/acme/platform-squad.git` | Public/private team repo (with credentials) |
| **export** | `./exports/squad-export.json` | Snapshot for offline use or version pinning |

## Quick start

**Local upstream:**

```bash
squad upstream add ../org-practices/.squad
squad upstream list
# org-practices → local: /path/to/org-practices/.squad (never synced)
```

**Git upstream:**

```bash
squad upstream add https://github.com/acme/platform-squad.git --name platform --ref main
squad upstream sync platform
```

**Export snapshot:**

```bash
squad export-config --output ./exports/snapshot.json
squad upstream add ./exports/snapshot.json --name snapshot
```

## Troubleshooting

### Git clone or sync fails

Ensure the URL is correct and you have access. For private repos, use SSH (`git@github.com:owner/repo.git`) with your SSH key in ssh-agent, or use a GitHub PAT with `https://[PAT]@github.com/owner/repo.git`.

### Local upstream not found

Verify the path exists: `ls ../shared/.squad`. Use absolute paths if relative paths fail.

### Agents don't see inherited context

```bash
# Verify upstreams are configured and readable (same resolver the session uses)
squad upstream list
squad doctor          # "upstream inheritance" check lists every upstream with its status

# Materialize/refresh git upstreams (sessions never fetch on their own)
squad upstream sync

# Restart your session (resolution happens once at session start)
```

For git upstreams, check `.squad/_upstream_repos/{name}` exists. In a session you can also ask the coordinator to call `squad_state_upstreams` directly.

### Cached clone out of date

```bash
squad upstream sync <name>
```

Then start a new session. Clones not synced for 30 days are reported as `stale` (still read).

### Conflicting upstreams

The local `.squad/` wins, then **earlier** entries in `upstream.json` win over later ones. Check order with `squad upstream list`. Reorder with `remove` + `add` if needed.

## CLI Reference

### `squad upstream add <source>`

Add a new upstream source.

**Signature:**
```
squad upstream add <source> [--name <name>] [--ref <branch>]
```

**Arguments:**
- `<source>` — File path, git URL, or export JSON file. Squad auto-detects the type.

**Options:**
- `--name <name>` — Display name (optional; defaults to repo/dir name)
- `--ref <branch>` — Git branch/tag (only for git sources; defaults to `main`)

**Examples:**

Local directory:
```bash
squad upstream add ../shared-squad --name shared
```

Git repository:
```bash
squad upstream add https://github.com/acme/platform-squad.git --name platform --ref main
```

Export file:
```bash
squad upstream add ./exports/org-snapshot.json --name org-snapshot
```

**What happens:**
- Reads `upstream.json` from `.squad/`
- Detects source type (local, git, export)
- For git sources: auto-clones to `.squad/_upstream_repos/{name}`
- Adds entry to `.squad/upstream.json`
- For local/export: sessions read the path from disk at startup (no sync needed); `sync` only re-validates it
- For git: sessions read the clone, never the remote; run `sync` to refresh it

### `squad upstream remove <name>`

Remove an upstream by name.

**Signature:**
```
squad upstream remove <name>
```

**Examples:**
```bash
squad upstream remove platform
```

**What happens:**
- Removes entry from `.squad/upstream.json`
- Deletes cached clone from `.squad/_upstream_repos/{name}` if it exists

### `squad upstream list`

Show all configured upstreams.

**Signature:**
```
squad upstream list
```

**Output example:**
```
Configured upstreams:

  platform  →  git: https://github.com/acme/platform-squad.git (ref: main)  (synced 2026-02-22)
  shared    →  local: /home/alice/shared-squad  (never synced)
  snapshot  →  export: ./exports/org-snapshot.json  (synced 2026-02-22)
```

### `squad upstream sync [name]`

Update cached clones for git upstreams, or validate paths for local/export upstreams.

**Signature:**
```
squad upstream sync [name]
```

**Examples:**

Sync all:
```bash
squad upstream sync
```

Sync one:
```bash
squad upstream sync platform
```

**What happens:**
- For **git** sources: `git pull --ff-only` on the cached clone, or re-clones if needed
- For **local** sources: validates that the path exists
- For **export** sources: validates that the file exists
- Updates `last_synced` timestamp in `upstream.json`

## SDK API Reference

The upstream module provides resolver functions for programmatic use.

### Types

#### `UpstreamType`

```typescript
type UpstreamType = 'local' | 'git' | 'export';
```

#### `UpstreamSource`

A declared upstream from `upstream.json`:

```typescript
interface UpstreamSource {
  name: string;           // Display name (e.g., "platform")
  type: UpstreamType;     // How to access it
  source: string;         // Path, URL, or export file location
  ref?: string;           // Git ref (only for type: "git")
  added_at: string;       // ISO timestamp
  last_synced: string | null;  // Last successful sync
}
```

#### `UpstreamConfig`

The `upstream.json` file format:

```typescript
interface UpstreamConfig {
  upstreams: UpstreamSource[];
}
```

#### `ResolvedUpstream`

Resolved content from a single upstream, with provenance and status:

```typescript
type UpstreamStatus = 'ok' | 'stale' | 'missing' | 'unavailable' | 'invalid' | 'cycle' | 'depth-exceeded';

interface ResolvedUpstream {
  name: string;
  type: UpstreamType;
  provenance: string;        // "upstream:<name>@<ref>" — attached to every inherited item
  origin: string;            // declared path / URL / export file
  ref?: string;              // git ref
  depth: number;             // 1 = declared by the local squad
  via: string[];             // upstream names this one was reached through
  status: UpstreamStatus;    // content is read only for "ok" and "stale"
  diagnostic: string | null; // actionable text for non-ok statuses
  squadDir: string | null;   // local directory (or export file) the content came from
  lastSynced: string | null;
  skills: Array<{ name: string; content: string }>;
  decisions: string | null;
  wisdom: string | null;
  castingPolicy: Record<string, unknown> | null;
  routing: string | null;
}
```

#### `UpstreamResolution`

Result of resolving all upstreams, in precedence order:

```typescript
interface UpstreamResolution {
  upstreams: ResolvedUpstream[]; // declared order, each followed by its own upstreams (depth-first)
  diagnostics: string[];         // one line per upstream that is not "ok"
  maxDepth: number;              // depth limit applied (default 3)
}
```

#### `EffectiveUpstreamContext`

The merged view after precedence (local content is never included because it always wins):

```typescript
interface EffectiveUpstreamContext {
  skills: Array<{ name: string; content: string; provenance: string; overriddenBy: string | null }>;
  decisions: Array<{ provenance: string; content: string }>;
  routing: Array<{ provenance: string; content: string }>;
  wisdom: Array<{ provenance: string; content: string }>;
  castingPolicy: { provenance: string; policy: Record<string, unknown> } | null;
}
```

### Functions

#### `readUpstreamConfig(squadDir: string): UpstreamConfig | null`

Read and parse `upstream.json` from a squad directory.

**Returns:** `null` if file doesn't exist or is invalid.

**Example:**
```typescript
import { readUpstreamConfig } from '@bradygaster/squad-sdk';

const config = readUpstreamConfig('.squad');
if (config) {
  console.log(`Found ${config.upstreams.length} upstreams`);
}
```

#### `resolveUpstreams(squadDir: string, storage?, options?): UpstreamResolution | null`

Resolve all upstream sources declared in `upstream.json`, recursively, from local disk only.

For each upstream:
- **local**: reads directly from the source's `.squad/` (the source may be the project root or the `.squad/` directory itself)
- **git**: reads from `.squad/_upstream_repos/{name}/` (must have been cloned by `squad upstream add|sync`); never fetches
- **export**: reads from the JSON file

`options`: `{ maxDepth?: number /* default 3 */, staleAfterDays?: number /* default 30 */, now?: Date }`.

**Returns:** `null` if no `upstream.json` exists. Sources that cannot be read are included with an explanatory `status`/`diagnostic` and empty content (no error thrown).

**Example:**
```typescript
import { resolveUpstreams } from '@bradygaster/squad-sdk';

const resolution = resolveUpstreams('.squad');
if (resolution) {
  for (const upstream of resolution.upstreams) {
    console.log(`${upstream.provenance}: ${upstream.status}, ${upstream.skills.length} skills`);
  }
  for (const line of resolution.diagnostics) console.warn(line);
}
```

#### `buildEffectiveUpstreamContext(resolution, localSkillNames?, localCastingPolicy?): EffectiveUpstreamContext`

Apply precedence: local skill names and the local casting policy win, then upstreams in resolution order. Losing skills are kept with `overriddenBy` set so a coordinator can explain the outcome.

#### `formatUpstreamReport(resolution, effective, { detail? }): string`

The text returned by the `squad_state_upstreams` tool: every upstream with provenance, status and diagnostic, the effective skills with their outcome, and (with `detail: true`) the inherited decision/routing/wisdom/skill bodies under provenance headers.

#### `upstreamProvenance(name, type, ref?): string`

Builds the `upstream:<name>@<ref>` tag (`@local`, `@export`, or the git ref, defaulting to `main`).

#### `buildInheritedContextBlock(resolution: UpstreamResolution | null): string`

Build a text block summarizing inherited context (for agent prompts).

**Returns:** Empty string if no resolution or upstreams.

**Example output:**
```
INHERITED CONTEXT: (local .squad/ wins; then in this order)
  platform: skills (3), decisions ✓, casting ✓ (upstream:platform@main)
  shared: skills (5), routing ✓ (upstream:shared@local)
  snapshot: (empty) (upstream:snapshot@export) [missing]
```

**Usage:** The coordinator includes this in agent spawn prompts to signal what context is available and where it came from.

#### `buildSessionDisplay(resolution: UpstreamResolution | null): string`

Build a user-facing display for session start greeting, `squad status` and `squad doctor`.

**Returns:** Empty string if no resolution or upstreams.

**Example output:**
```
📡 Inherited context:
  platform (git) [upstream:platform@main] — 3 skills, decisions, casting
  shared (local) [upstream:shared@local] — 5 skills, routing
  ⚠️ snapshot (export) [upstream:snapshot@export] — missing
     snapshot: export file not found (./exports/snapshot.json); fix the path or run "squad upstream remove snapshot"
```

**Usage:** Shown in the session greeting to confirm what upstreams are available.

## Use cases

### Shared practices across teams

**Problem:** Multiple teams need consistent agent definitions, decisions, and casting policy without duplicating configuration.

**Solution:** Create a central Squad repo (platform-squad) with shared context. Product teams add it as an upstream.

```bash
# In platform-squad repo
.squad/
  decisions.md
  casting/policy.json
  skills/
    platform-engineer/SKILL.md
    backend-engineer/SKILL.md

# In product-a repo
squad upstream add https://github.com/acme/platform-squad.git --name platform --ref main
```

**Outcome:** Platform team updates practices once. All product teams inherit changes at next `squad upstream sync`. Product teams can layer their own skills or override decisions as needed.

**Also works for:**
- Open-source frameworks with community plugins
- Consultancy methodology across client projects

---

### Domain consistency across services

**Problem:** Multiple microservices share a domain model (user, order, payment). You need a single source of truth for how agents work with that model.

**Solution:** Create a shared-domain repo with domain-specific skills and decisions. Each service adds it as an upstream.

```bash
# In shared-domain repo
.squad/
  skills/
    domain-modeler/SKILL.md
    database-engineer/SKILL.md
  decisions.md
  routing.md

# In user-service, order-service, payment-service repos
squad upstream add https://github.com/acme/shared-domain.git --name domain
```

**Outcome:** All agents across services understand the domain model. Domain conventions change once; each service pulls independently. Services stay decoupled with consistency.

---

### Multi-team scaling patterns

**Problem:** Post-acquisition, migration, or enterprise modernization requires coordinating practices across teams with different histories.

**Solution:** Create a unified practices or playbook repo. All teams add it as an upstream.

```bash
# In acme-unified-practices repo (post-acquisition example)
.squad/
  decisions.md        # Merged decision framework
  casting/policy.json # Unified roles
  skills/
    acme-engineer/SKILL.md
    acquired-engineer/SKILL.md

# In both original and acquired product repos
squad upstream add https://github.com/acme/acme-unified-practices.git --name unified
```

**Outcome:** Teams work independently while culturally aligned. Agents understand both traditions. Gradual convergence without painful rewrites.

**Also works for:**
- Monolith-to-microservices modernization (playbook defines architecture patterns)
- Multi-geo teams converging on shared standards

## Next Steps

- **Read more:** See `docs/guide/casting.md` for how inherited casting policy shapes agent behavior
- **Set up**: Run `squad upstream add <source>` to add your first upstream
- **Share:** Export your Squad config with `squad export-config` for others to inherit
- **Iterate:** Update your upstream and run `squad upstream sync` to pull changes across all consuming projects
