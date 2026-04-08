# State Backends

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

**Try this to store squad state in git-notes:**
```
Switch to git-notes backend for distributed state
```

**Try this to use orphan branches for state:**
```
Configure orphan-branch backend for isolation
```

State backends store squad's persistent data (decisions, session records, agent memory) directly in Git. Choose how to embed that data: in worktree directories, git-notes, orphan branches, or external services.

---

## What is StateBackend?

`StateBackend` is Squad's interface for reading and writing state to Git-based storage. Unlike `StorageProvider` (which is generic file I/O), state backends are Git-native — they leverage Git's native features for versioning, merging, and distribution.

```typescript
export interface StateBackend {
  read(relativePath: string): string | undefined;
  write(relativePath: string, content: string): void;
  exists(relativePath: string): boolean;
  list(relativeDir: string): string[];
  readonly name: string;
}

export type StateBackendType = 'worktree' | 'external' | 'git-notes' | 'orphan';
```

State backends are **synchronous** by design — they execute during CLI operations that can't wait for async I/O.

---

## Built-in Backends

### WorktreeBackend

**What it is:** Stores state directly in `.squad/` directory. Standard, portable, no git magic.

**When to use it:**
- Local development
- Single-machine deployments
- Simple setups where squad data is part of the project

**How it works:** Maps relative paths to filesystem directories. All state lives in `.squad/` and is tracked by Git.

**Example:**
```
.squad/
  decisions/
  session-log/
  team.md
  agents/
    backend/
      charter.md
      history.md
```

---

### GitNotesBackend

**What it is:** Stores state as JSON blobs in `git notes --ref=squad`.

**When to use it:**
- Distributed teams
- Don't want state files cluttering the worktree
- State lives "off-branch" but is still version-controlled

**How it works:** Serializes all state as a single JSON object attached to HEAD via `git notes`. Lightweight, invisible to the worktree.

**Example:**
```bash
$ git notes --ref=squad show HEAD
{
  "decisions/inbox/copilot-fix-auth.md": "# Decision: ...",
  "session-log/2025-03-20.md": "## Session 1 ...",
  "agents/backend/history.md": "## Learnings\n..."
}
```

**Pros:**
- Zero worktree pollution
- State is Git-versioned
- Works across branches

**Cons:**
- All state in one blob (not ideal for large teams)
- Requires `git notes` support (most platforms have it)

---

### OrphanBranchBackend

**What it is:** Stores state on an orphan branch (no parent commit).

**When to use it:**
- Complete isolation from main development
- State history doesn't clutter the main branch
- Need state to survive branch switches

**How it works:** Maintains a separate `squad-state` orphan branch. All reads/writes go to that branch, then switch back to the working branch.

**Example:**
```bash
$ git branch --orphan squad-state
$ ls -la
  decisions/
  session-log/
  team.md
$ git checkout main  # Back to main; state lives separately
```

**Pros:**
- Complete isolation
- State history is separate
- No pollution of main branch

**Cons:**
- More complex to debug (requires switching branches)
- Slower (branch switching overhead)

---

### ExternalBackend

**What it is:** State lives in an external service (database, cloud storage, or HTTP API).

**When to use it:**
- Multi-organization deployments
- Centralized state management
- Compliance requirements (audit logs, access control)

**Configuration:**

```json
{
  "state": {
    "backend": "external",
    "config": {
      "url": "https://my-state-service.com",
      "apiKey": "your-api-key",
      "organizationId": "my-org"
    }
  }
}
```

**How it works:** All reads/writes proxy to an HTTP API. Your external service implements the state storage logic.

| Feature | WorktreeBackend | GitNotesBackend | OrphanBranchBackend | ExternalBackend |
|---------|---|---|---|---|
| Storage location | `.squad/` directory | git-notes blob | Orphan branch | External service |
| Git-versioned | Yes | Yes | Yes | No (depends on service) |
| Worktree cleanup | No (files visible) | Yes (invisible) | Yes (on separate branch) | Yes |
| Merge conflicts | Possible | Auto-merged | Auto-merged | Service handles |
| Distributed teams | Good | Good | Good | Excellent |
| Offline support | Full | Full | Full | None |
| Complexity | Low | Medium | High | Medium |

---

## Create a Custom Backend

Implement `StateBackend` to use any storage system. Here's a skeleton:

```typescript
import type { StateBackend } from '@bradygaster/squad-sdk';

export class MyCustomStateBackend implements StateBackend {
  readonly name = 'my-backend';

  constructor(private serviceUrl: string, private apiKey: string) {}

  read(relativePath: string): string | undefined {
    // Query your service for the content at this path
    const response = this.fetchFromService(relativePath);
    return response?.content;
  }

  write(relativePath: string, content: string): void {
    // Write content to your service
    this.writeToService(relativePath, content);
  }

  exists(relativePath: string): boolean {
    // Check if path exists
    return this.fetchFromService(relativePath) !== null;
  }

  list(relativeDir: string): string[] {
    // List entries in a directory
    const items = this.listEntriesInService(relativeDir);
    return items.map(item => item.name);
  }

  private fetchFromService(path: string): { content: string } | null {
    // Implementation: call your service
    throw new Error('Implement this');
  }

  private writeToService(path: string, content: string): void {
    // Implementation: call your service
    throw new Error('Implement this');
  }

  private listEntriesInService(dir: string): Array<{ name: string }> {
    // Implementation: call your service
    throw new Error('Implement this');
  }
}
```

Register it in `.squad/config.json`:

```json
{
  "state": {
    "backend": "my-backend",
    "config": {
      "serviceUrl": "https://my-state-service.com",
      "apiKey": "your-api-key"
    }
  }
}
```

---

## Configuration

Specify the state backend in `.squad/config.json`:

```json
{
  "state": {
    "backend": "worktree"
  }
}
```

Options: `"worktree"`, `"git-notes"`, `"orphan"`, `"external"`.

If you use `"external"`, include backend-specific config:

```json
{
  "state": {
    "backend": "external",
    "config": {
      "url": "https://my-service.com/squad-state",
      "apiKey": "secret-key"
    }
  }
}
```

---

## Related

- [Pluggable Interfaces](pluggable-interfaces.md) — Overview of all pluggable interfaces
- [StorageProvider](pluggable-interfaces.md) — Where squad data lives
- [PlatformAdapter](platform-adapters.md) — Work with GitHub, ADO, or Planner
- [API Reference](api-reference.md) — All public SDK exports
