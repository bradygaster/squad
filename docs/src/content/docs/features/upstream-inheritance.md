# Upstream Inheritance

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Upstream inheritance lets you declare external Squad sources (from repositories, local directories, or exports) and automatically inherit their context at session start. Share practices across teams, organizations, and projects without duplicating configuration.

## How it works

At session start, the coordinator reads all declared upstreams from `upstream.json` and makes their context available to every agent:

- **Skills** — `.squad/skills/*/SKILL.md`
- **Decisions** — `.squad/decisions.md`
- **Wisdom** — `.squad/identity/wisdom.md`
- **Casting policy** — `.squad/casting/policy.json`
- **Routing** — `.squad/routing.md`

**Resolution order:** Later entries override earlier ones. Layer upstreams from org → team → repo, with each level adding or overriding as needed.

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
# Verify upstreams are configured
squad upstream list

# Sync and validate sources
squad upstream sync

# Restart your session (resolution happens at session start)
```

For git upstreams, check `.squad/_upstream_repos/{name}` exists.

### Cached clone out of date

```bash
squad upstream sync <name>
```

Then start a new session.

### Conflicting upstreams

Later entries in `upstream.json` override earlier ones. Check order with `squad upstream list`. Reorder with `remove` + `add` if needed.

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
- For local/export: coordinator reads live at session start (no sync needed)

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

Resolved content from a single upstream:

```typescript
interface ResolvedUpstream {
  name: string;
  type: UpstreamType;
  skills: Array<{ name: string; content: string }>;
  decisions: string | null;
  wisdom: string | null;
  castingPolicy: Record<string, unknown> | null;
  routing: string | null;
}
```

#### `UpstreamResolution`

Result of resolving all upstreams:

```typescript
interface UpstreamResolution {
  upstreams: ResolvedUpstream[];
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

#### `resolveUpstreams(squadDir: string): UpstreamResolution | null`

Resolve all upstream sources declared in `upstream.json`.

For each upstream:
- **local**: reads directly from the source's `.squad/`
- **git**: reads from `.squad/_upstream_repos/{name}/` (must be cloned first)
- **export**: reads from the JSON file

**Returns:** `null` if no `upstream.json` exists. If a source can't be reached, that upstream is included with empty content (no error thrown).

**Example:**
```typescript
import { resolveUpstreams } from '@bradygaster/squad-sdk';

const resolution = resolveUpstreams('.squad');
if (resolution) {
  for (const upstream of resolution.upstreams) {
    console.log(`${upstream.name}: ${upstream.skills.length} skills`);
  }
}
```

#### `buildInheritedContextBlock(resolution: UpstreamResolution | null): string`

Build a text block summarizing inherited context (for agent prompts).

**Returns:** Empty string if no resolution or upstreams.

**Example output:**
```
INHERITED CONTEXT:
  platform: skills (3), decisions ✓, casting ✓
  shared: skills (5), routing ✓
  snapshot: (empty)
```

**Usage:** The coordinator includes this in agent spawn prompts to signal what context is available.

#### `buildSessionDisplay(resolution: UpstreamResolution | null): string`

Build a user-facing display for session start greeting.

**Returns:** Empty string if no resolution or upstreams.

**Example output:**
```
📡 Inherited context:
  platform (git) — 3 skills, decisions, casting
  shared (local) — 5 skills, routing
  ⚠️ snapshot (export) — source not reachable
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
