# Storage Provider

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.


**Try this to switch storage backends:**
```
Use SQLite for persistent team state
```

**Try this to see where session data is stored:**
```
Where is my squad data stored?
```

**Try this to build a cloud storage backend:**
```
Create a StorageProvider for Azure Blob Storage
```

All of Squad's data — sessions, decisions, agent memories, event logs — flows through a pluggable storage interface. Pick the provider that matches your deployment: filesystem, database, or cloud.

---

## What is StorageProvider?

`StorageProvider` is Squad's I/O contract. Every read, write, delete, and directory operation goes through this interface. This decoupling means:

- **Local development** uses the filesystem. Sessions and state live in `.squad/`.
- **Testing** uses in-memory storage. No disk I/O, no test pollution.
- **Production** can use SQLite, cloud storage, or a database.
- **Multi-team deployments** can route different squads to different backends.

The interface is minimal — just 12 core async methods[^1]:

```typescript
read(filePath: string): Promise<string | undefined>
write(filePath: string, data: string): Promise<void>
append(filePath: string, data: string): Promise<void>
exists(filePath: string): Promise<boolean>
list(dirPath: string): Promise<string[]>
delete(filePath: string): Promise<void>
deleteDir(dirPath: string): Promise<void>
isDirectory(targetPath: string): Promise<boolean>
mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>
rename(oldPath: string, newPath: string): Promise<void>
copy(srcPath: string, destPath: string): Promise<void>
stat(targetPath: string): Promise<StorageStats | undefined>
```

---

## Built-in Providers

### FSStorageProvider

**What it is:** Node.js filesystem wrapper. Standard, portable, no setup.

**When to use it:**
- Local development
- Single-machine deployments
- Monorepo setups where squad data is part of the project

**How it works:** Maps all Squad paths to disk directories. Create parent directories on write. Returns `undefined` on ENOENT instead of throwing.

### InMemoryStorageProvider

**What it is:** HashMap-backed, zero I/O.

**When to use it:**
- Unit tests for agent logic
- Ephemeral sessions that don't need persistence
- CI environments where `.squad/` is discarded

**How it works:** All paths stored in memory as POSIX strings. Fast, isolated, perfect for test fixtures.

### SQLiteStorageProvider

**What it is:** SQLite-backed provider using sql.js (WASM). Single `.db` file, cross-platform.

**When to use it:**
- Small to medium teams
- Need a portable database file
- Windows/Linux/Mac without platform-specific binaries

**How it works:** Stores file content in a `files(path, content, updated_at)` table. sql.js runs entirely in WASM — no native compilation, no dependencies.

| Feature | FSStorageProvider | InMemoryStorageProvider | SQLiteStorageProvider |
|---------|---|---|---|
| Persistence | Disk | None (ephemeral) | Single `.db` file |
| Setup | None | None | 1 import + init |
| Speed | Disk I/O latency | Instant (memory) | Query overhead |
| Portability | Windows/Linux/Mac | Yes | Yes |
| Suitable for | Development, production | Tests | Portable deployments |

---

## Create a Custom Provider

Implement the `StorageProvider` interface to plug in any backend. Here's a skeleton:

```typescript
import type { StorageProvider, StorageStats } from '@bradygaster/squad-sdk';

export class MyCustomStorageProvider implements StorageProvider {
  async read(filePath: string): Promise<string | undefined> {
    // Fetch from your backend (S3, Cosmos, etc.)
    // Return undefined if not found
  }

  async write(filePath: string, data: string): Promise<void> {
    // Write to your backend
    // Create parent directories as needed
  }

  async append(filePath: string, data: string): Promise<void> {
    // Append to a file, creating it if missing
  }

  async exists(filePath: string): Promise<boolean> {
    // Check if path exists
  }

  async list(dirPath: string): Promise<string[]> {
    // Return entry names in directory
    // Return empty array if directory doesn't exist
  }

  async delete(filePath: string): Promise<void> {
    // Delete a file (no-op if missing)
  }

  async deleteDir(dirPath: string): Promise<void> {
    // Recursively delete directory (no-op if missing)
  }

  async isDirectory(targetPath: string): Promise<boolean> {
    // Return true if path is a directory
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    // Create directory
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    // Move/rename file or directory
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    // Copy file, creating parent dirs for destination
  }

  async stat(targetPath: string): Promise<StorageStats | undefined> {
    // Return file metadata: size, mtime, isDirectory
    // Return undefined if path doesn't exist
  }

  // Sync variants (deprecated, but still required for Wave 1 compat)
  readSync(filePath: string): string | undefined { /* ... */ }
  writeSync(filePath: string, data: string): void { /* ... */ }
  appendSync(filePath: string, data: string): void { /* ... */ }
  existsSync(filePath: string): boolean { /* ... */ }
  listSync(dirPath: string): string[] { /* ... */ }
  deleteSync(filePath: string): void { /* ... */ }
  deleteDirSync(dirPath: string): void { /* ... */ }
  isDirectorySync(targetPath: string): boolean { /* ... */ }
  mkdirSync(dirPath: string, options?: { recursive?: boolean }): void { /* ... */ }
  renameSync(oldPath: string, newPath: string): void { /* ... */ }
  copySync(srcPath: string, destPath: string): void { /* ... */ }
  statSync(targetPath: string): StorageStats | undefined { /* ... */ }
}
```

Pass it to the runtime:

```typescript
import { SquadClient } from '@bradygaster/squad-sdk';

const client = new SquadClient({
  storageProvider: new MyCustomStorageProvider(),
  teamRoot: '.squad',
});
```

See `storage-provider-azure` and `storage-provider-sqlite` samples for complete, production-ready implementations.

[^1]: The full interface also includes 12 deprecated synchronous variants (`readSync`, `writeSync`, `appendSync`, `existsSync`, `listSync`, `deleteSync`, `deleteDirSync`, `isDirectorySync`, `mkdirSync`, `renameSync`, `copySync`, `statSync`) — 24 methods total. The sync methods exist for backward compatibility and will be removed in Wave 2. New code should use the async methods exclusively.

---

## Choose the Right Provider

| Goal | Provider |
|------|----------|
| **Local development** | FSStorageProvider |
| **Unit testing agents** | InMemoryStorageProvider |
| **Small team, portable DB** | SQLiteStorageProvider |
| **Scale across multiple machines** | Custom provider (your database, blob store, or message queue) |
| **Azure Blob Storage** | Use `storage-provider-azure` sample as reference |
| **DynamoDB, Firestore, etc.** | Implement StorageProvider — the interface maps cleanly |

---

## Sample Projects

- **storage-provider-sqlite** — Complete SQLite implementation using sql.js
- **storage-provider-azure** — Azure Blob Storage backend with connection pooling

Both live in `/samples` and demonstrate patterns for production providers.
