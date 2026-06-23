# SQLite StorageProvider sample

This sample demonstrates `SQLiteStorageProvider` from `@bradygaster/squad-sdk` — a portable, single-file storage backend powered by [sql.js](https://github.com/nicolewhite/sql.js/) (SQLite compiled to WASM). No native dependencies required.

## Prerequisites

- Node.js 20 or later
- npm 10 or later

## Quick start

1. Navigate to the sample directory:

   ```bash
   cd samples/storage-provider-sqlite
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the demo:

   ```bash
   npm run demo
   ```

4. Run the demo and keep the DB for inspection:

   ```bash
   npm run demo:keep
   # Then inspect: sqlite3 squad-demo.db "SELECT path FROM files;"
   # Clean up when done: npm run clean
   ```

## What you'll learn

- How to create and initialize a `SQLiteStorageProvider` with a custom database path
- Writing, reading, listing, and stat-ing virtual files stored in SQLite
- Appending content to files incrementally
- Copying, renaming, and deleting files
- How data persists across provider instances through the `.db` file
- Cleaning up the database file when finished

## How it works

The demo creates a `SQLiteStorageProvider` backed by a local `squad-demo.db` file. Under the hood, sql.js runs a full SQLite engine compiled to WebAssembly — no native binaries or platform-specific compilation needed. Files are stored as rows in a `files(path, content, updated_at)` table, with paths treated as virtual keys (not filesystem paths).

The script walks through every `StorageProvider` operation: write, read, list, stat, append, copy, rename, and delete. It then proves persistence by creating a **second** provider instance from the same database file and reading data back.

At the end, the demo removes the `.db` file so you start clean each run. Pass `--keep` (or use `npm run demo:keep`) to preserve it for inspection.

## Expected output

```
╔══════════════════════════════════════════════╗
║  SQLiteStorageProvider Demo                  ║
╚══════════════════════════════════════════════╝

── 1. Write Files ────────────────────────────────
✓ Provider initialized (db: ./squad-demo.db)
✓ Wrote team.md (138 bytes)
✓ Wrote routing.md (52 bytes)
✓ Wrote agents/flight/charter.md (254 bytes)

── 2. Read Files ─────────────────────────────────
✓ team.md → "# Squad Team" …
✓ routing.md → "# Routing Rules" …
✓ agents/flight/charter.md → "# FLIGHT — Commander" …

── 3. List Directory ─────────────────────────────
squad/ entries: [config.json]
agents/ entries: [flight]
agents/flight/ entries: [charter.md]

── 4. Stat Files ─────────────────────────────────
✓ team.md: 138 bytes, modified 2025-01-15T10:30:00.000Z, dir=false
✓ routing.md: 52 bytes, modified 2025-01-15T10:30:00.000Z, dir=false
✓ agents/flight/charter.md: 254 bytes, modified 2025-01-15T10:30:00.000Z, dir=false
✓ agents/: dir=true

── 5. Append ─────────────────────────────────────
✓ history.md after appends:
## Change Log

- v1.0.0: Initial release
- v1.1.0: Added SQLite provider

── 6. Copy ───────────────────────────────────────
✓ Copied team.md → team-backup.md (exists=true, 138 bytes)

── 7. Rename ─────────────────────────────────────
✓ Renamed team-backup.md → team-archive.md
  team-backup.md exists: false
  team-archive.md exists: true

── 8. Delete ─────────────────────────────────────
✓ Deleted team-archive.md (exists=false)

── 9. Persistence ────────────────────────────────
✓ DB file on disk: ./squad-demo.db (12288 bytes)
✓ Created new provider instance from same DB
✓ team.md from new instance: "# Squad Team" …
✓ routing.md from new instance: "# Routing Rules" …
✓ Data persists across provider instances!

── Cleanup ────────────────────────────────────────
✓ Removed ./squad-demo.db (use --keep to preserve)

✅ All demos completed successfully!
```

> **Note:** Timestamps and exact byte sizes for the DB file will vary per run.

## Key files

| File | Purpose |
| --- | --- |
| `index.ts` | Demo script — exercises every StorageProvider operation |
| `package.json` | Dependencies and `npm run demo` script |

## Key patterns

- **`init()` is required.** `SQLiteStorageProvider` loads sql.js asynchronously, so you must call `await provider.init()` before any read/write operations.
- **Paths are virtual.** Files stored in SQLite use forward-slash paths as keys — they don't touch the filesystem. This makes the provider ideal for sandboxed environments.
- **Persistence via `.db` file.** Every write atomically persists the in-memory SQLite database to disk (write-then-rename for crash safety).
- **No native dependencies.** sql.js compiles SQLite to WebAssembly, so it works on Windows, Linux, macOS, and macOS ARM without platform-specific binaries.

## When to use the SQLite provider

| Scenario | Why SQLite fits |
| --- | --- |
| Portable single-file storage | One `.db` file contains all squad data — easy to copy, back up, or share |
| Embedded applications | No filesystem layout required; everything lives in one file |
| Testing with persistence | Swap in a fresh `.db` per test run for isolated, repeatable tests |
| Environments without filesystem access | Virtual paths mean you can run in containers or serverless with minimal volume mounts |

## Next steps

- Explore the [StorageProvider interface](../../packages/squad-sdk/src/storage/storage-provider.ts) for the full API contract
- See `InMemoryStorageProvider` for a zero-persistence alternative
- See `FSStorageProvider` for traditional filesystem-backed storage
- Check the [squad-sdk README](../../packages/squad-sdk/README.md) for more SDK features
