# Azure Blob StorageProvider sample

This sample builds a cloud-backed `StorageProvider` for [Azure Blob Storage](https://learn.microsoft.com/azure/storage/blobs/storage-blobs-introduction). It shows how to implement every method in the StorageProvider interface against a remote object store, and demonstrates patterns for handling virtual directories, sync-method guards, and copy-based rename.

## Prerequisites

- Node.js 20 or later
- npm 10 or later
- **One of:**
  - An Azure subscription with a Storage account, **or**
  - [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (local emulator — no Azure account needed)

## Quick start

> **Note:** Azurite is included as a dev dependency (`npm install` pulls it in automatically). No separate global installation is needed.

### Option 1: Run with Azurite (local, no Azure account needed)

```bash
# Terminal 1 — start the emulator (stores data in ./azurite)
cd samples/storage-provider-azure
npm run azurite

# Terminal 2 — run the demo
cd samples/storage-provider-azure
npm install
npm run demo:emulator
```

> **Tip:** Add `--keep` to preserve the container after the demo finishes so you can inspect it:
> ```bash
> npm run demo:emulator:keep
> ```

### Option 2: Run with an Azure Storage account (DefaultAzureCredential)

```bash
# Login to Azure
az login

# Set your storage account name
export AZURE_STORAGE_ACCOUNT=yourstorageaccount

# Run the demo
cd samples/storage-provider-azure
npm install
npm run demo
```

### Option 3: Run with a connection string

```bash
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=..."
cd samples/storage-provider-azure
npm install
npm run demo
```

### Option 4: Create Azure resources from scratch

If you don't have a Storage account yet, the included scripts create one for you:

```bash
# Create a resource group + storage account (returns connection string)
npm run azure:create
# or with custom names:
bash scripts/create-storage.sh my-rg westus2

# Copy the connection string from the output, then:
export AZURE_STORAGE_CONNECTION_STRING="<paste here>"
npm run demo

# When done, tear down everything:
npm run azure:delete
# or with custom name:
bash scripts/delete-storage.sh my-rg
```

## Cleanup

After running with `--keep`, or if a demo was interrupted, clean up the container:

```bash
# Remove the demo container (Azurite)
npm run clean

# Remove the demo container (real Azure — set connection string first)
export AZURE_STORAGE_CONNECTION_STRING="..."
npm run clean

# Delete the entire Azure resource group and storage account
npm run azure:delete
```

## What you'll learn

- How to implement all 24 `StorageProvider` methods against Azure Blob Storage
- How virtual directories work (prefix-based hierarchy listing)
- How to handle operations that have no native blob equivalent (`append`, `rename`)
- Why sync methods throw in a cloud provider and what that means for Wave 2 migration
- How to support both local development (Azurite) and production (Azure) with one codebase

## How it works

`AzureBlobStorageProvider` wraps an Azure `ContainerClient` and maps StorageProvider paths directly to blob names inside a single container. Files become blobs; directories are virtual — they exist only when at least one blob shares the prefix.

**Read/write** operations use `BlockBlobClient.download()` and `BlockBlobClient.upload()`. The `read()` method streams the response body into a UTF-8 string and returns `undefined` on 404 rather than throwing.

**Append** is a read-modify-write cycle because Azure Block Blobs have no native text-append primitive. The provider reads the current content, concatenates the new data, and writes the result back. (For high-throughput log-style appending, you would use an `AppendBlobClient` instead.)

**Rename** is a copy-then-delete because Azure Blob Storage has no atomic rename operation. The provider copies the source blob to the destination via `beginCopyFromURL()`, waits for completion, then deletes the source.

**List** uses `listBlobsByHierarchy('/')` with a prefix to return only the immediate children of a virtual directory — not recursive descendants. This matches the StorageProvider contract.

**Sync methods** all throw with a clear message. Cloud I/O cannot be made synchronous without blocking the event loop, and the sync surface is deprecated in Wave 2 anyway.

## Expected output

```
╔══════════════════════════════════════════════╗
║ Azure Blob StorageProvider Demo              ║
╚══════════════════════════════════════════════╝

── Setup ──────────────────────────────────────
  ✓ Connected via connection string
  ✓ Created container: squad-storage-demo
  ✓ AzureBlobStorageProvider ready

── 1. Write Files ─────────────────────────────
  ✓ Wrote notes/hello.txt
  ✓ Wrote notes/todo.txt
  ✓ Wrote config.json

── 2. Read Files ──────────────────────────────
  ✓ Read notes/hello.txt → "Hello from Azure Blob Storage!"
  ✓ Read missing file → undefined (undefined)

── 3. List Entries ────────────────────────────
  ✓ Root entries: [config.json, notes]
  ✓ notes/ entries: [hello.txt, todo.txt]

── 4. Stat ────────────────────────────────────
  ✓ notes/hello.txt → size=30, modified=2025-..., isDir=false
  ✓ nope.txt → undefined (undefined)

── 5. Exists / isDirectory ────────────────────
  ✓ exists("notes/hello.txt") → true
  ✓ exists("nope.txt") → false
  ✓ isDirectory("notes") → true
  ✓ isDirectory("notes/hello.txt") → false

── 6. Append ──────────────────────────────────
  ✓ Appended to notes/todo.txt:
    "- Build StorageProvider\n- Test with Azurite\n- Deploy to Azure\n"

── 7. Copy ────────────────────────────────────
  ✓ Copied notes/hello.txt → backup/hello.txt → "Hello from Azure Blob Storage!"

── 8. Rename ──────────────────────────────────
  ✓ Renamed config.json → settings.json
  ✓ Read settings.json → "{ \"theme\": \"dark\" }"
  ✓ config.json still exists? false

── 9. Delete ──────────────────────────────────
  ✓ Deleted settings.json
  ✓ Deleted notes/ directory (recursive)
  ✓ Deleted backup/ directory (recursive)
  ✓ Remaining entries: [] (empty)

── 10. Sync Method Guard ──────────────────────
  ✓ readSync() correctly threw: "Sync operations are not supported ..."

── Cleanup ────────────────────────────────────
  ✓ Deleted container: squad-storage-demo

Done! ✨
```

## Key files

| File | Purpose |
| --- | --- |
| `azure-blob-storage-provider.ts` | Full `StorageProvider` implementation backed by Azure Blob Storage |
| `index.ts` | Demo script that exercises every method and prints results |
| `package.json` | Dependencies: `@azure/storage-blob`, `@azure/identity`, `@bradygaster/squad-sdk` |
| `scripts/create-storage.sh` | Creates an Azure resource group + storage account with full-access connection string |
| `scripts/delete-storage.sh` | Deletes the resource group and all resources inside it |

## Key patterns

| Pattern | Why |
| --- | --- |
| Blobs map 1:1 to StorageProvider paths | Simple mapping — blob name **is** the path |
| Directories are virtual (prefix-based listing) | Azure Blob Storage has no real directories; `listBlobsByHierarchy` fakes them |
| Sync methods throw | Cloud I/O is inherently async; sync surface is deprecated in Wave 2 |
| `append()` uses read-modify-write | Block Blobs have no native text-append; read existing → concat → write |
| `rename()` uses copy-then-delete | No native rename in Blob Storage; copy via `beginCopyFromURL` then delete source |
| 404 → `undefined` (reads) / no-op (deletes) | Matches the StorageProvider contract for missing paths |
| `--keep` flag preserves container | Pass `--keep` to skip cleanup so you can inspect blobs in Azure Portal or Azurite |

## npm scripts

| Script | Description |
| --- | --- |
| `npm run azurite` | Start Azurite emulator (stores data in `./azurite/`) |
| `npm run demo` | Run against Azure (needs `AZURE_STORAGE_ACCOUNT` or `AZURE_STORAGE_CONNECTION_STRING`) |
| `npm run demo:emulator` | Run against Azurite (local emulator) |
| `npm run demo:emulator:keep` | Run against Azurite and keep the container after exit |
| `npm run clean` | Delete the `squad-storage-demo` container |
| `npm run azure:create` | Create an Azure resource group + storage account |
| `npm run azure:delete` | Delete the Azure resource group and all resources |

## When to use an Azure Blob provider

- **Multi-machine shared state** — multiple agents or services read/write the same storage
- **Cloud-native deployments** — Azure Functions, Container Apps, AKS
- **Serverless** — no local filesystem available
- **Persistent storage** — survives container restarts and scale-to-zero
- **Compliance** — data stays in Azure with RBAC, encryption at rest, and audit logs

## Extending this sample

- **Add caching** — wrap reads in an LRU cache to reduce round-trips for frequently accessed files
- **Retry policies** — pass a `StoragePipelineOptions` with retry config to the `BlobServiceClient`
- **Use AppendBlob for logs** — swap `BlockBlobClient` for `AppendBlobClient` when the `append()` pattern is write-heavy
- **Lease-based locking** — acquire a blob lease before read-modify-write to prevent lost updates
- **Multi-container mapping** — route different path prefixes to different containers

## Next steps

- Try the [hello-squad](../hello-squad/) sample to see the SDK basics
- Read the [StorageProvider interface](../../packages/squad-sdk/src/storage/storage-provider.ts) for the full contract
- Explore [Azure Blob Storage docs](https://learn.microsoft.com/azure/storage/blobs/) for advanced features
