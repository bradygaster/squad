# Distributed Mesh

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to coordinate squads across machines:**
```
Set up a distributed mesh so my local squad can see the state of our CI squad
```

**Try this to sync remote squad state:**
```
Run sync-mesh.sh to pull the latest state from all remote squads
```

The distributed mesh lets squads on different machines coordinate through git and HTTP. Local squads read remote squad state after syncing it locally.

---

## What Is the Distributed Mesh?

One sentence:

> **"The filesystem is the mesh, and git is how the mesh crosses machine boundaries."**

Squad agents always read local files. When squads live on different machines, you need to materialize remote state locally before agents can see it. The distributed mesh does this through simple sync scripts — no servers, no federation protocols, no real-time messaging.

---

## Three Zones

| Zone | Description | Transport | Complexity |
|------|-------------|-----------|------------|
| **1 — Local** | Same host/filesystem | Direct file read | Zero |
| **2 — Remote-Trusted** | Different host, same org | `git pull` from shared repo | Zero new (git exists) |
| **3 — Remote-Opaque** | Different org, no shared auth | `curl` / HTTP fetch | ~15 lines of shell |

**Zone 1 (Local):** `cat ../squad-b/SUMMARY.md` works because the file is on your disk.

**Zone 2 (Remote-Trusted):** Squads push their state to a shared git repo. You pull from that repo to materialize their state locally.

**Zone 3 (Remote-Opaque):** A remote organization publishes their squad's `SUMMARY.md` at an HTTPS URL. You curl it to materialize locally.

---

## How It Works

### Agent Lifecycle with Sync

```
Agent wakes up
  │
  ├─ SYNC: git pull (Zone 2) + curl (Zone 3)
  ├─ READ: cat .mesh/**/state.md — all local now
  ├─ WORK: do the task
  ├─ WRITE: update own billboard, log, drops
  └─ PUBLISH: git push
```

Two new steps (SYNC, PUBLISH). Both are transport only — they move files, not change them.

### What Doesn't Change

- Agents read local files
- Write partitioning (each squad owns its directory)
- Pull-based coordination
- Eventual consistency
- LLMs as the relevance engine

### What Changes

Remote files need to arrive locally before agents can read them.

---

## Configuration

### The `mesh.json` File

One JSON file lists where to find each squad:

```json
{
  "squads": {
    "auth-squad": { "zone": "local", "path": "../auth-squad/.mesh" },
    "ci-squad": {
      "zone": "remote-trusted",
      "source": "git@github.com:our-org/ci-squad.git",
      "sync_to": ".mesh/remotes/ci-squad"
    },
    "partner-fraud": {
      "zone": "remote-opaque",
      "source": "https://partner.dev/squad-contracts/fraud/SUMMARY.md",
      "sync_to": ".mesh/remotes/partner-fraud"
    }
  }
}
```

### Sync Scripts

**Bash (requires `jq` and `git`):**

```bash
./sync-mesh.sh          # reads mesh.json, materializes remote state
```

**PowerShell (requires `git` only):**

```powershell
.\sync-mesh.ps1                        # default: reads mesh.json
.\sync-mesh.ps1 -MeshJson custom.json  # custom config path
```

Both scripts read `mesh.json`, pull from remote-trusted repos, curl from remote-opaque URLs, and materialize everything into `.mesh/remotes/`.

---

## Getting Started

### Prerequisites

- Git (with SSH or HTTPS auth configured)
- A shell (bash/zsh) or PowerShell
- `jq` ([github.com/jqlang/jq](https://github.com/jqlang/jq)) for the bash sync script (PowerShell script has no external dependencies)

### 1. Create the Mesh State Repo

The **mesh state repo** is a shared git repository where squads publish their current state. Nothing more — no code, no automation, no agents.

```bash
git clone git@github.com:our-org/squad-mesh-state.git
cd squad-mesh-state
```

### 2. Directory Structure

One directory per squad, each with a `SUMMARY.md`:

```
squad-mesh-state/
├── README.md          # What this repo is, who participates
├── auth-squad/
│   └── SUMMARY.md     # Auth squad's current state
├── ci-squad/
│   └── SUMMARY.md     # CI squad's current state
└── data-squad/
    └── SUMMARY.md     # Data squad's current state
```

### 3. Register Your Squad

Create your directory, write initial state, push:

```bash
mkdir my-squad
echo "# my-squad — active" > my-squad/SUMMARY.md
git add . && git commit -m "register my-squad" && git push
```

### 4. Configure `mesh.json`

Point at the shared repo:

```json
{
  "squads": {
    "ci-squad": {
      "zone": "remote-trusted",
      "source": "git@github.com:our-org/squad-mesh-state.git",
      "sync_to": ".mesh/remotes/ci-squad"
    }
  }
}
```

### 5. Run Your First Sync

```bash
./sync-mesh.sh          # reads mesh.json, materializes remote state
ls .mesh/remotes/       # should show directories per remote squad
```

> **Does the mesh state repo need its own Squad?** No. It's a shared data directory — a dumb pipe. No agents, no `.squad/` folder, no automation. Each squad pushes its own state via write partitioning. The repo is just a git-based rendezvous point. If you later want a "mesh observer" that monitors all squads, THAT would be its own Squad project — but it's not required and shouldn't be the state repo itself.

---

## Cross-Org Setup (Zone 3)

Remote org publishes `SUMMARY.md` at a URL. Add an HTTP entry to `mesh.json`:

```json
"partner-squad": {
  "zone": "remote-opaque",
  "source": "https://partner.dev/squad-contracts/SUMMARY.md",
  "sync_to": ".mesh/remotes/partner-squad"
}
```

---

## How This Relates to Other Features

### SubSquads (Streams)

**SubSquads** partition work **within a single repo** using GitHub labels (e.g., `team:ui`, `team:backend`). Each SubSquad runs in its own Codespace but shares the same git repository.

**Distributed mesh** coordinates **across repos and machines** — different organizations, different git repos, potentially no shared authentication.

SubSquads solve "one repo, many teams." Distributed mesh solves "many repos, many machines, crossing org boundaries."

See [SubSquads](./streams.md) for within-repo partitioning.

### Export & Import

**Export/import** is a **snapshot-based** knowledge transfer. You export a trained squad from one repo and import it into another. It's a one-time copy.

**Distributed mesh** is **continuous coordination**. Remote squads keep working; you sync their latest state every time your agents wake up.

Use export/import when you want to **clone a team**. Use distributed mesh when you want **live coordination**.

See [Multiple Squads scenario](../scenarios/multiple-squads.md) for when to use each approach.

---

## Upstream inheritance

The **upstream module** and the **distributed mesh** serve different coordination needs. They're complementary, not competing.

### Upstream: top-down inheritance

The `upstream/` module (configured in `upstream.json`) is for **hierarchical inheritance**. An organization-level or team-level squad pushes skills, decisions, wisdom, casting policy, and routing rules **down** to project squads. The consuming squad treats upstream content as **read-only** — it inherits conventions but doesn't write back.

### Mesh: peer coordination

The distributed mesh (configured in `mesh.json`) is for **peer-to-peer coordination**. Squads on equal footing share their **current state** with each other. Each squad **publishes** its own state (SUMMARY.md, billboards) and **reads** everyone else's. It's read-write for each squad's own directory.

### Use them together

A squad can have **both** an upstream (inheriting org conventions) **and** mesh peers (coordinating with sibling squads). For example:

- Your project squad inherits security policies and routing rules from the org-level squad via `upstream.json`
- The same squad coordinates with other project squads (auth, ci, data) via `mesh.json`

### Comparison

| | Upstream | Mesh |
|---|---|---|
| **Direction** | Top-down (parent → child) | Peer-to-peer (squad ↔ squad) |
| **Write model** | Read-only for consumer | Read-write (own directory) |
| **What flows** | Skills, decisions, wisdom, casting, routing | Current state (SUMMARY.md, billboards) |
| **Config file** | `upstream.json` | `mesh.json` |
| **Transport** | Local path / git clone / export JSON | Local path / git pull / HTTP curl |
| **Use case** | Org policies flowing into team projects | Sibling squads keeping each other informed |

### What neither does

Neither upstream nor mesh is about **agent-to-agent communication within a single squad**. That's the drop-box pattern — agents write to `decisions/inbox/`, read from `history.md`, and coordinate asynchronously within one `.squad/` directory.

---

## Skill scope

When you ask an agent to set up a distributed mesh, the skill produces three things:

1. **`mesh.json` config file** — defines squads, zones, and sync sources
2. **A decision entry** — records why you configured the mesh this way
3. **A pointer to sync scripts** — points you to `templates/mesh/sync-mesh.sh` and `sync-mesh.ps1`

The skill does **not** generate:

- ❌ Code (validators, helpers, utilities)
- ❌ Tests (the sync scripts are pre-tested templates)
- ❌ Custom sync scripts (copy from `templates/mesh/`, don't regenerate)

**Why this matters:** Deterministic skills give you consistent results. The sync scripts already exist as battle-tested templates at `templates/mesh/`. Agents shouldn't waste time generating 76-line validators or rewriting sync logic from scratch — they should copy the templates and configure your `mesh.json`.

If you need to customize the sync behavior, edit the template scripts after copying them to your project root. The mesh skill's job ends at configuration.

---

## What We're NOT Building

- ❌ Federation protocol (git push/pull IS federation)
- ❌ Discovery service (mesh.json IS discovery)
- ❌ Auth system (git auth IS the auth system)
- ❌ A2A endpoints (no running servers)
- ❌ Schema versioning (markdown; LLM reads it)
- ❌ Real-time sync (agents are async; eventual consistency is correct)
- ❌ Message queues (agents aren't persistent; nobody's listening)
- ❌ CRDTs/conflict resolution (write partitioning; no conflicts possible)

---

## Sample Prompts

```
configure a distributed mesh with our CI squad on GitHub
```

Creates a `mesh.json` entry for a remote-trusted squad and runs the first sync.

```
sync remote squad state before starting work
```

Runs the sync script to materialize the latest state from all configured remote squads.

```
add a partner squad from https://partner.dev/squad-contracts/SUMMARY.md
```

Adds a remote-opaque Zone 3 entry to `mesh.json` for cross-org coordination.

```
show me what remote squads are configured
```

Lists all squads in `mesh.json` and their zones.
