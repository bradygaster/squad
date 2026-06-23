/**
 * Azure Blob StorageProvider Demo
 *
 * Run:  npm run demo:emulator
 * Keep container after run:  npm run demo:emulator:keep
 */

import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { AzureBlobStorageProvider } from './azure-blob-storage-provider.js';

const keepContainer = process.argv.includes('--keep');

// ── Helpers ─────────────────────────────────────────────────────────────

function header(title: string): void {
  const width = 46;
  const padded = ` ${title} `.padEnd(width - 2);
  console.log();
  console.log(`╔${'═'.repeat(width)}╗`);
  console.log(`║${padded}  ║`);
  console.log(`╚${'═'.repeat(width)}╝`);
  console.log();
}

function section(title: string): void {
  console.log(`── ${title} ${'─'.repeat(Math.max(0, 42 - title.length))}`);
}

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

function info(msg: string): void {
  console.log(`    ${msg}`);
}

// ── Main ────────────────────────────────────────────────────────────────

const CONTAINER_NAME = 'squad-storage-demo';

async function main(): Promise<void> {
  header('Azure Blob StorageProvider Demo');

  // ── Setup ───────────────────────────────────────────────────────────

  section('Setup');

  let serviceClient: BlobServiceClient;

  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    serviceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING,
    );
    ok('Connected via connection string');
  } else if (process.env.AZURE_STORAGE_ACCOUNT) {
    serviceClient = new BlobServiceClient(
      `https://${process.env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
      new DefaultAzureCredential(),
    );
    ok(`Connected via DefaultAzureCredential (${process.env.AZURE_STORAGE_ACCOUNT})`);
  } else {
    console.error(
      '\n  ✗ Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT.\n' +
        '    For local dev, run `npx azurite --silent` and use:\n' +
        "    AZURE_STORAGE_CONNECTION_STRING='UseDevelopmentStorage=true'\n",
    );
    process.exit(1);
  }

  const containerClient = serviceClient.getContainerClient(CONTAINER_NAME);
  await containerClient.createIfNotExists();
  ok(`Created container: ${CONTAINER_NAME}`);

  const storage = new AzureBlobStorageProvider(containerClient);
  ok('AzureBlobStorageProvider ready');
  console.log();

  try {
    // ── 1. Write Files ──────────────────────────────────────────────

    section('1. Write Files');
    await storage.write('notes/hello.txt', 'Hello from Azure Blob Storage!');
    ok('Wrote notes/hello.txt');

    await storage.write(
      'notes/todo.txt',
      '- Build StorageProvider\n- Test with Azurite\n',
    );
    ok('Wrote notes/todo.txt');

    await storage.write('config.json', '{ "theme": "dark" }');
    ok('Wrote config.json');
    console.log();

    // ── 2. Read Files ───────────────────────────────────────────────

    section('2. Read Files');
    const content = await storage.read('notes/hello.txt');
    ok(`Read notes/hello.txt → "${content}"`);

    const missing = await storage.read('does-not-exist.txt');
    ok(`Read missing file → ${missing} (undefined)`);
    console.log();

    // ── 3. List Entries ─────────────────────────────────────────────

    section('3. List Entries');
    const rootEntries = await storage.list('');
    ok(`Root entries: [${rootEntries.join(', ')}]`);

    const noteEntries = await storage.list('notes');
    ok(`notes/ entries: [${noteEntries.join(', ')}]`);
    console.log();

    // ── 4. Stat ─────────────────────────────────────────────────────

    section('4. Stat');
    const stat = await storage.stat('notes/hello.txt');
    if (stat) {
      ok(
        `notes/hello.txt → size=${stat.size}, modified=${new Date(stat.mtimeMs).toISOString()}, isDir=${stat.isDirectory}`,
      );
    }

    const missingStat = await storage.stat('nope.txt');
    ok(`nope.txt → ${missingStat} (undefined)`);
    console.log();

    // ── 5. Exists / isDirectory ─────────────────────────────────────

    section('5. Exists / isDirectory');
    ok(`exists("notes/hello.txt") → ${await storage.exists('notes/hello.txt')}`);
    ok(`exists("nope.txt") → ${await storage.exists('nope.txt')}`);
    ok(`isDirectory("notes") → ${await storage.isDirectory('notes')}`);
    ok(`isDirectory("notes/hello.txt") → ${await storage.isDirectory('notes/hello.txt')}`);
    console.log();

    // ── 6. Append ───────────────────────────────────────────────────

    section('6. Append');
    await storage.append('notes/todo.txt', '- Deploy to Azure\n');
    const appended = await storage.read('notes/todo.txt');
    ok(`Appended to notes/todo.txt:`);
    info(JSON.stringify(appended));
    console.log();

    // ── 7. Copy ─────────────────────────────────────────────────────

    section('7. Copy');
    await storage.copy('notes/hello.txt', 'backup/hello.txt');
    const copied = await storage.read('backup/hello.txt');
    ok(`Copied notes/hello.txt → backup/hello.txt → "${copied}"`);
    console.log();

    // ── 8. Rename ───────────────────────────────────────────────────

    section('8. Rename');
    await storage.rename('config.json', 'settings.json');
    ok('Renamed config.json → settings.json');

    const renamed = await storage.read('settings.json');
    ok(`Read settings.json → "${renamed}"`);

    const oldExists = await storage.exists('config.json');
    ok(`config.json still exists? ${oldExists}`);
    console.log();

    // ── 9. Delete ───────────────────────────────────────────────────

    section('9. Delete');
    await storage.delete('settings.json');
    ok('Deleted settings.json');

    await storage.deleteDir('notes');
    ok('Deleted notes/ directory (recursive)');

    await storage.deleteDir('backup');
    ok('Deleted backup/ directory (recursive)');

    const remaining = await storage.list('');
    ok(`Remaining entries: [${remaining.join(', ')}] (empty)`);
    console.log();

    // ── 10. Sync Method Guard ───────────────────────────────────────

    section('10. Sync Method Guard');
    try {
      storage.readSync('test.txt');
    } catch (err: any) {
      ok(`readSync() correctly threw: "${err.message}"`);
    }
    console.log();
  } finally {
    // ── Cleanup ───────────────────────────────────────────────────────

    section('Cleanup');
    if (keepContainer) {
      ok(`--keep flag set. Container preserved: ${CONTAINER_NAME}`);
      ok(`Inspect with: az storage blob list --container-name ${CONTAINER_NAME} --connection-string "$AZURE_STORAGE_CONNECTION_STRING" --output table`);
      ok(`Or browse: http://127.0.0.1:10000/devstoreaccount1/${CONTAINER_NAME}`);
      ok(`Clean up later: az storage container delete --name ${CONTAINER_NAME} --connection-string "$AZURE_STORAGE_CONNECTION_STRING"`);
    } else {
      await containerClient.deleteIfExists();
      ok(`Deleted container: ${CONTAINER_NAME} (use --keep to preserve)`);
    }
    console.log();
  }

  console.log('Done! ✨');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
