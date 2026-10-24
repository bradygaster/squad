/**
 * Explicit built-in roster management.
 *
 * `squad upgrade` never edits team.md. These commands are the consent boundary for adding
 * optional built-ins, and provenance ensures removal only touches rows this command added.
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import {
  insertBuiltinRosterRows,
  OPTIONAL_BUILTIN_ROSTER_ROWS,
  rosterHasBuiltin,
  type BuiltinRosterRow,
} from '../core/team-md.js';
import { GREEN, RESET } from '../core/output.js';

const PROVENANCE_SCHEMA = 'squad-roster-provenance/v1' as const;
const PROVENANCE_FILE = '.roster-provenance.json';
const BACKUP_FILE = 'team.md.roster-backup';

interface RosterAddition {
  id: string;
  line: string;
}

interface RosterProvenance {
  schema: typeof PROVENANCE_SCHEMA;
  backupFile: typeof BACKUP_FILE;
  originalSha256: string;
  appliedSha256: string;
  diverged: boolean;
  additions: RosterAddition[];
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function isRosterAddition(value: unknown): value is RosterAddition {
  if (!value || typeof value !== 'object') return false;
  const addition = value as Partial<RosterAddition>;
  return OPTIONAL_BUILTIN_ROSTER_ROWS.some((row) => row.dirName === addition.id)
    && typeof addition.line === 'string'
    && addition.line.startsWith('|')
    && addition.line.endsWith('|');
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function eolOf(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function readProvenance(squadDir: string): RosterProvenance | null {
  const file = path.join(squadDir, PROVENANCE_FILE);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RosterProvenance>;
    if (
      parsed.schema !== PROVENANCE_SCHEMA ||
      parsed.backupFile !== BACKUP_FILE ||
      !isSha256(parsed.originalSha256) ||
      !isSha256(parsed.appliedSha256) ||
      typeof parsed.diverged !== 'boolean' ||
      !Array.isArray(parsed.additions) ||
      !parsed.additions.every(isRosterAddition) ||
      new Set(parsed.additions.map((addition) => addition.id)).size !== parsed.additions.length
    ) {
      throw new Error('invalid schema');
    }
    return parsed as RosterProvenance;
  } catch {
    throw new Error(`Cannot read .squad/${PROVENANCE_FILE}; refusing to infer roster ownership`);
  }
}

function writeProvenance(squadDir: string, provenance: RosterProvenance): void {
  writeFileSync(
    path.join(squadDir, PROVENANCE_FILE),
    JSON.stringify(provenance, null, 2) + '\n',
    'utf8',
  );
}

function verifyBackup(squadDir: string, expectedHash: string): Buffer {
  const backupPath = path.join(squadDir, BACKUP_FILE);
  if (!existsSync(backupPath)) {
    throw new Error(`Roster backup is missing: .squad/${BACKUP_FILE}`);
  }
  const backup = readFileSync(backupPath);
  if (sha256(backup) !== expectedHash) {
    throw new Error(`Roster backup verification failed: .squad/${BACKUP_FILE}`);
  }
  return backup;
}

function requestedRows(value: string | undefined): BuiltinRosterRow[] {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (normalized === 'all') return [...OPTIONAL_BUILTIN_ROSTER_ROWS];
  const compact = normalized.replace(/-/g, '');
  const row = OPTIONAL_BUILTIN_ROSTER_ROWS.find((candidate) =>
    candidate.dirName === normalized ||
    candidate.name.toLowerCase().replace(/[^a-z0-9]/g, '') === compact,
  );
  return row ? [row] : [];
}

function insertedLines(before: string, after: string): string[] {
  const counts = new Map<string, number>();
  for (const line of before.split(/\r?\n/)) counts.set(line, (counts.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of after.split(/\r?\n/)) {
    const remaining = counts.get(line) ?? 0;
    if (remaining > 0) counts.set(line, remaining - 1);
    else added.push(line);
  }
  return added;
}

function removeExactLine(content: string, line: string): string | null {
  const eol = eolOf(content);
  const lines = content.split(/\r?\n/);
  const index = lines.lastIndexOf(line);
  if (index === -1) return null;
  lines.splice(index, 1);
  return lines.join(eol);
}

/** Render the exact changed range rather than a summary of the intended operation. */
export function formatRosterDiff(before: string, after: string): string[] {
  if (before === after) return [];
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) suffix++;
  const removed = a.slice(prefix, a.length - suffix);
  const added = b.slice(prefix, b.length - suffix);
  return [
    '--- .squad/team.md',
    '+++ .squad/team.md',
    `@@ line ${prefix + 1} @@`,
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
  ];
}

function printDiff(before: string, after: string): void {
  for (const line of formatRosterDiff(before, after)) console.log(line);
}

function addRows(squadDir: string, rows: BuiltinRosterRow[], dryRun: boolean): number {
  const teamPath = path.join(squadDir, 'team.md');
  const beforeBytes = readFileSync(teamPath);
  const before = beforeBytes.toString('utf8');
  const missing = rows.filter((row) => !rosterHasBuiltin(before, row));
  if (missing.length === 0) {
    console.log('Requested built-in roster entries are already configured; no changes.');
    return 0;
  }
  for (const row of missing) {
    if (!existsSync(path.join(squadDir, 'agents', row.dirName, 'charter.md'))) {
      console.error(`❌ ${row.name} is not available; run \`squad upgrade\` to install its charter first.`);
      return 1;
    }
  }

  const after = insertBuiltinRosterRows(before, missing);
  if (after === before) {
    console.error('❌ team.md has no Members or Built-in Support Agents table; no roster rows were added.');
    return 1;
  }
  printDiff(before, after);
  if (dryRun) {
    console.log('Preview only; no files were written.');
    return 0;
  }

  const existing = readProvenance(squadDir);
  const backupPath = path.join(squadDir, BACKUP_FILE);
  let originalSha256: string;
  let additions: RosterAddition[];
  let diverged = false;
  if (existing) {
    verifyBackup(squadDir, existing.originalSha256);
    originalSha256 = existing.originalSha256;
    additions = [...existing.additions];
    diverged = existing.diverged || sha256(beforeBytes) !== existing.appliedSha256;
  } else {
    if (existsSync(backupPath) && !readFileSync(backupPath).equals(beforeBytes)) {
      console.error(`❌ Existing .squad/${BACKUP_FILE} does not match team.md; refusing to replace it.`);
      return 1;
    }
    writeFileSync(backupPath, beforeBytes);
    if (!readFileSync(backupPath).equals(beforeBytes)) {
      console.error(`❌ Could not verify .squad/${BACKUP_FILE}; team.md was not changed.`);
      return 1;
    }
    originalSha256 = sha256(beforeBytes);
    additions = [];
  }

  const lines = insertedLines(before, after);
  if (lines.length !== missing.length) {
    console.error('❌ Could not verify the exact roster rows to record; team.md was not changed.');
    return 1;
  }
  for (let i = 0; i < missing.length; i++) {
    additions.push({ id: missing[i]!.dirName, line: lines[i]! });
  }
  writeProvenance(squadDir, {
    schema: PROVENANCE_SCHEMA,
    backupFile: BACKUP_FILE,
    originalSha256,
    appliedSha256: sha256(after),
    diverged,
    additions,
  });
  writeFileSync(teamPath, after, 'utf8');
  console.log(`${GREEN}✓${RESET} Added ${missing.map((row) => row.name).join(', ')}; backup: .squad/${BACKUP_FILE}`);
  return 0;
}

function removeRows(squadDir: string, rows: BuiltinRosterRow[], dryRun: boolean): number {
  const provenance = readProvenance(squadDir);
  if (!provenance) {
    console.log('No Squad-owned roster additions are recorded; team.md was not changed.');
    return 0;
  }
  const ids = new Set(rows.map((row) => row.dirName));
  const selected = provenance.additions.filter((addition) => ids.has(addition.id));
  if (selected.length === 0) {
    console.log('Requested roster entries were not added by Squad; team.md was not changed.');
    return 0;
  }

  const teamPath = path.join(squadDir, 'team.md');
  const beforeBytes = readFileSync(teamPath);
  const before = beforeBytes.toString('utf8');
  const backup = verifyBackup(squadDir, provenance.originalSha256);
  const removingAll = selected.length === provenance.additions.length;
  const unchangedSinceApply = !provenance.diverged && sha256(beforeBytes) === provenance.appliedSha256;
  let after: string;
  let exactRestore: Buffer | null = null;
  let diverged = provenance.diverged || !unchangedSinceApply;

  if (removingAll && unchangedSinceApply) {
    exactRestore = backup;
    after = backup.toString('utf8');
    diverged = false;
  } else {
    after = before;
    for (const addition of selected) {
      const next = removeExactLine(after, addition.line);
      if (next === null) {
        console.error(`❌ The Squad-owned ${addition.id} row was edited or removed; refusing to delete an unverified row.`);
        return 1;
      }
      after = next;
    }
  }

  printDiff(before, after);
  if (dryRun) {
    console.log('Preview only; no files were written.');
    return 0;
  }

  writeFileSync(teamPath, exactRestore ?? after);
  const remaining = provenance.additions.filter((addition) => !ids.has(addition.id));
  if (remaining.length === 0) {
    unlinkSync(path.join(squadDir, PROVENANCE_FILE));
    unlinkSync(path.join(squadDir, BACKUP_FILE));
  } else {
    writeProvenance(squadDir, {
      ...provenance,
      appliedSha256: sha256(after),
      diverged,
      additions: remaining,
    });
  }
  console.log(`${GREEN}✓${RESET} Removed only Squad-owned roster additions.`);
  return 0;
}

export async function runRosterCommand(dest: string, args: string[]): Promise<number> {
  const action = args[0]?.toLowerCase();
  const target = args[1];
  const dryRun = args.includes('--dry-run');
  if (!['add', 'remove', 'disable', 'uninstall'].includes(action ?? '')) {
    console.error('❌ Usage: squad roster add|remove <rai|fact-checker|all> [--dry-run]');
    return 1;
  }
  const rows = requestedRows(target);
  if (rows.length === 0) {
    console.error('❌ Built-in must be one of: rai, fact-checker, all');
    return 1;
  }
  try {
    const squadDir = detectSquadDir(dest).path;
    return action === 'add'
      ? addRows(squadDir, rows, dryRun)
      : removeRows(squadDir, rows, dryRun);
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
