---
name: "distributed-mesh"
description: "How to coordinate with squads on different machines using git as transport"
domain: "distributed-coordination"
confidence: "high"
source: "multi-model-consensus (Opus 4.6, Sonnet 4.5, GPT-5.4)"
---

## Context

When squads are on different machines (developer laptops, CI runners, cloud VMs, partner orgs), the local file-reading convention still works — but remote files need to arrive on your disk first. This skill teaches the pattern for distributed squad communication.

**When this applies:**
- Squads span multiple machines, VMs, or CI runners
- Squads span organizations or companies
- An agent needs context from a squad whose files aren't on the local filesystem

**When this does NOT apply:**
- All squads are on the same machine (just read the files directly)

## Patterns

### The Core Principle

> "The filesystem is the mesh, and git is how the mesh crosses machine boundaries."

The agent interface never changes. Agents always read local files. The distributed layer's only job is to make remote files appear locally before the agent reads them.

### Three Zones of Communication

**Zone 1 — Local:** Same filesystem. Read files directly. Zero transport.

**Zone 2 — Remote-Trusted:** Different host, same org, shared git auth. Transport: `git pull` from a shared repo. This collapses Zone 2 into Zone 1 — files materialize on disk, agent reads them normally.

**Zone 3 — Remote-Opaque:** Different org, no shared auth. Transport: `curl` to fetch published contracts (SUMMARY.md). One-way visibility — you see only what they publish.

### Agent Lifecycle (Distributed)

```
1. SYNC:    git pull (Zone 2) + curl (Zone 3) — materialize remote state
2. READ:    cat .mesh/**/state.md — all files are local now
3. WORK:    do the task
4. WRITE:   update own billboard, log, drops
5. PUBLISH: git add + commit + push — share state with remote peers
```

Steps 2–4 are identical to local-only. Steps 1 and 5 are the entire distributed extension.

### The mesh.json Config

```json
{
  "squads": {
    "auth-squad": { "zone": "local", "path": "../auth-squad/.mesh" },
    "ci-squad": {
      "zone": "remote-trusted",
      "source": "git@github.com:our-org/ci-squad.git",
      "ref": "main",
      "sync_to": ".mesh/remotes/ci-squad"
    },
    "partner-fraud": {
      "zone": "remote-opaque",
      "source": "https://partner.dev/squad-contracts/fraud/SUMMARY.md",
      "sync_to": ".mesh/remotes/partner-fraud",
      "auth": "bearer"
    }
  }
}
```

Three zone types, one file. Local squads need only a path. Remote-trusted need a git URL. Remote-opaque need an HTTP URL.

### Write Partitioning

Each squad writes only to its own directory (`boards/{self}.md`, `squads/{self}/*`, `drops/{date}-{self}-*.md`). No two squads write to the same file. Git push/pull never conflicts. If push fails ("branch is behind"), the fix is always `git pull --rebase && git push`.

### Trust Boundaries

Trust maps to git permissions:
- **Same repo access** = full mesh visibility
- **Read-only access** = can observe, can't write
- **No access** = invisible (correct behavior)

For selective visibility, use separate repos per audience (internal, partner, public). Git permissions ARE the trust negotiation.

### Phased Rollout

- **Phase 0:** Convention only — document zones, agree on mesh.json fields, manually run `git pull`/`git push`. Zero new code.
- **Phase 1:** Sync script (~30 lines bash or PowerShell) when manual sync gets tedious.
- **Phase 2:** Published contracts + curl fetch when a Zone 3 partner appears.
- **Phase 3:** Never. No MCP federation, A2A, service discovery, message queues.

### Mesh State Repo

The shared mesh state repo is a plain git repository — NOT a Squad project. It holds:
- One directory per participating squad
- Each directory contains at minimum a SUMMARY.md with the squad's current state
- A root README explaining what the repo is and who participates

No `.squad/` folder, no agents, no automation. Write partitioning means each squad only pushes to its own directory. The repo is a rendezvous point, not an intelligent system.

If you want a squad that *observes* mesh health, that's a separate Squad project that lists the state repo as a Zone 2 remote in its `mesh.json` — it does NOT live inside the state repo.

## Examples

### Developer Laptop + CI Squad (Zone 2)

Auth-squad agent wakes up. `git pull` brings ci-squad's latest results. Agent reads: "3 test failures in auth module." Adjusts work. Pushes results when done. **Overhead: one `git pull`, one `git push`.**

### Two Orgs Collaborating (Zone 3)

Payment-squad fetches partner's published SUMMARY.md via curl. Reads: "Risk scoring v3 API deprecated April 15. New field `device_fingerprint` required." Agent adds the field. Partner can't see payment-squad's internals.

### Same Org, Shared Mesh Repo (Zone 2)

Three squads on different machines. One shared git repo holds the mesh. Each squad: `git pull` before work, `git push` after. Write partitioning ensures zero merge conflicts.

## Anti-Patterns

- ❌ **Building a federation protocol.** Git push/pull IS federation.
- ❌ **Running a sync daemon or server.** Agents are not persistent. Sync at startup, publish at shutdown.
- ❌ **Real-time notifications.** Agents don't need real-time. They need "recent enough." `git pull` is recent enough.
- ❌ **Schema validation for markdown.** The LLM reads markdown. If the format changes, it adapts.
- ❌ **Service discovery protocol.** mesh.json is a file with 10 entries. Not a "discovery problem."
- ❌ **Auth framework.** Git SSH keys and HTTPS tokens. Not a framework. Already configured.
- ❌ **Message queues / event buses.** Agents wake, read, work, write, sleep. Nobody's home to receive events.
- ❌ **Any component requiring a running process.** That's the line. Don't cross it.
