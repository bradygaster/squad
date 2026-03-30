/**
 * SQLiteStorageProvider Demo
 *
 * Walks through every StorageProvider operation using the SQLite backend.
 * Run:  npm run demo
 * Keep DB after run:  npm run demo -- --keep
 */

import { SQLiteStorageProvider } from '@bradygaster/squad-sdk';
import { existsSync, statSync, unlinkSync } from 'fs';

const DB_PATH = './squad-demo.db';
const keepDb = process.argv.includes('--keep');

function banner() {
  console.log(`
╔══════════════════════════════════════════════╗
║  SQLiteStorageProvider Demo                  ║
╚══════════════════════════════════════════════╝`);
}

function section(n: number, title: string) {
  console.log(`\n── ${n}. ${title} ${'─'.repeat(Math.max(0, 43 - title.length))}`);
}

async function main() {
  banner();

  // ── 1. Write Files ──────────────────────────────────────────────────────
  section(1, 'Write Files');

  const provider = new SQLiteStorageProvider(DB_PATH);
  await provider.init();
  console.log(`✓ Provider initialized (db: ${DB_PATH})`);

  const files: Array<{ path: string; content: string }> = [
    {
      path: 'team.md',
      content: [
        '# Squad Team',
        '',
        '| Member  | Role       |',
        '| ------- | ---------- |',
        '| FLIGHT  | Commander  |',
        '| EECOM   | Core Dev   |',
        '| GNC     | Navigator  |',
      ].join('\n'),
    },
    {
      path: 'routing.md',
      content: [
        '# Routing Rules',
        '',
        '- bugs → EECOM',
        '- features → GNC',
      ].join('\n'),
    },
    {
      path: 'agents/flight/charter.md',
      content: [
        '# FLIGHT — Commander',
        '',
        '> Calm authority. Decides go/no-go, keeps the mission on track.',
        '',
        '## Responsibilities',
        '',
        '- Final review of all PRs',
        '- Release go/no-go decisions',
        '- Escalation point for cross-cutting concerns',
        '- Keeps the backlog groomed and prioritized',
      ].join('\n'),
    },
  ];

  for (const f of files) {
    await provider.write(f.path, f.content);
    const bytes = Buffer.byteLength(f.content, 'utf-8');
    console.log(`✓ Wrote ${f.path} (${bytes} bytes)`);
  }

  // ── 2. Read Files ───────────────────────────────────────────────────────
  section(2, 'Read Files');

  for (const f of files) {
    const content = await provider.read(f.path);
    const preview = content!.split('\n')[0];
    console.log(`✓ ${f.path} → "${preview}" …`);
  }

  // ── 3. List Directory ───────────────────────────────────────────────────
  section(3, 'List Directory');

  // Write a nested config file to make squad/ listing interesting
  await provider.write('squad/config.json', '{ "version": 1 }');

  const squadEntries = await provider.list('squad');
  console.log(`squad/ entries: [${squadEntries.join(', ')}]`);

  const agentsEntries = await provider.list('agents');
  console.log(`agents/ entries: [${agentsEntries.join(', ')}]`);

  const flightEntries = await provider.list('agents/flight');
  console.log(`agents/flight/ entries: [${flightEntries.join(', ')}]`);

  // ── 4. Stat Files ───────────────────────────────────────────────────────
  section(4, 'Stat Files');

  for (const f of files) {
    const s = await provider.stat(f.path);
    if (s) {
      const time = new Date(s.mtimeMs).toISOString();
      console.log(`✓ ${f.path}: ${s.size} bytes, modified ${time}, dir=${s.isDirectory}`);
    }
  }

  const dirStat = await provider.stat('agents');
  console.log(`✓ agents/: dir=${dirStat?.isDirectory}`);

  // ── 5. Append ───────────────────────────────────────────────────────────
  section(5, 'Append');

  await provider.append('history.md', '## Change Log\n\n');
  await provider.append('history.md', '- v1.0.0: Initial release\n');
  await provider.append('history.md', '- v1.1.0: Added SQLite provider\n');

  const history = await provider.read('history.md');
  console.log(`✓ history.md after appends:\n${history}`);

  // ── 6. Copy ─────────────────────────────────────────────────────────────
  section(6, 'Copy');

  await provider.copy('team.md', 'team-backup.md');
  const backupExists = await provider.exists('team-backup.md');
  const backupStat = await provider.stat('team-backup.md');
  console.log(`✓ Copied team.md → team-backup.md (exists=${backupExists}, ${backupStat?.size} bytes)`);

  // ── 7. Rename ───────────────────────────────────────────────────────────
  section(7, 'Rename');

  await provider.rename('team-backup.md', 'team-archive.md');
  const oldExists = await provider.exists('team-backup.md');
  const newExists = await provider.exists('team-archive.md');
  console.log(`✓ Renamed team-backup.md → team-archive.md`);
  console.log(`  team-backup.md exists: ${oldExists}`);
  console.log(`  team-archive.md exists: ${newExists}`);

  // ── 8. Delete ───────────────────────────────────────────────────────────
  section(8, 'Delete');

  await provider.delete('team-archive.md');
  const deletedExists = await provider.exists('team-archive.md');
  console.log(`✓ Deleted team-archive.md (exists=${deletedExists})`);

  // ── 9. Persistence ──────────────────────────────────────────────────────
  section(9, 'Persistence');

  const dbStat = statSync(DB_PATH);
  console.log(`✓ DB file on disk: ${DB_PATH} (${dbStat.size} bytes)`);

  // Create a brand-new provider instance from the same DB
  const provider2 = new SQLiteStorageProvider(DB_PATH);
  await provider2.init();
  console.log(`✓ Created new provider instance from same DB`);

  const teamContent = await provider2.read('team.md');
  const routingContent = await provider2.read('routing.md');
  console.log(`✓ team.md from new instance: "${teamContent!.split('\n')[0]}" …`);
  console.log(`✓ routing.md from new instance: "${routingContent!.split('\n')[0]}" …`);
  console.log(`✓ Data persists across provider instances!`);

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log(`\n── Cleanup ────────────────────────────────────────`);
  if (keepDb) {
    console.log(`✓ --keep flag set. DB preserved at ${DB_PATH}`);
    console.log(`  Inspect with: sqlite3 ${DB_PATH} "SELECT path FROM files;"`);
  } else if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH);
    console.log(`✓ Removed ${DB_PATH} (use --keep to preserve)`);
  }

  console.log(`\n✅ All demos completed successfully!\n`);
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
