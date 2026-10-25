/**
 * Planning and transactional application of Squad-owned files during `squad upgrade`.
 *
 * Every file the CLI overwrites on upgrade (manifest templates, `.github/skills`,
 * `.github/workflows/squad-*.yml`, the `.squad/templates/` mirror) flows through one
 * plan so that:
 *
 *  - `--dry-run` reports exactly what a real run would write (EOL-insensitive compare),
 *    and reports nothing right after a completed upgrade (#2297);
 *  - a file the user customized is backed up to `<file>.local-backup` before it is
 *    overwritten; the backup is written and read back before the overwrite happens,
 *    and a failed backup aborts the overwrite of that file (#2297);
 *  - "customized" means the file differs from BOTH the new template AND the version
 *    Squad last shipped. The last-shipped hashes live in
 *    `.squad/templates/.shipped-manifest.json`; without a record the previous copy under
 *    `.squad/templates/` (skills, workflows) is consulted, and failing that a differing
 *    file is treated as customized (a backup nobody needed beats a lost edit).
 *
 * @module cli/core/squad-owned-files
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { writeManagedText } from './managed-file.js';

export const SHIPPED_MANIFEST_SCHEMA = 'squad-shipped-files/v1' as const;
export const SHIPPED_MANIFEST_RELATIVE_PATH = '.squad/templates/.shipped-manifest.json';

export interface ShippedManifest {
  schema: typeof SHIPPED_MANIFEST_SCHEMA;
  /** CLI version that wrote the manifest. */
  version: string;
  /** Repo-root-relative POSIX path → sha256 of the EOL-normalized content Squad shipped. */
  files: Record<string, string>;
}

export type SquadOwnedAction = 'create' | 'overwrite' | 'unchanged';

export interface SquadOwnedFilePlan {
  /** Repo-root-relative POSIX path (what the user sees). */
  relPath: string;
  absPath: string;
  action: SquadOwnedAction;
  /** Existing content differs from the new template AND from the last shipped version. */
  customized: boolean;
  /** Why a conservative backup is required. */
  backupReason?: 'customized' | 'provenance-unavailable';
  /** Text content to write; `null` means a byte copy from `src`. */
  content: string | null;
  src: string;
}

export interface SquadOwnedPlan {
  files: SquadOwnedFilePlan[];
  /** Files whose on-disk content would change (create + overwrite). */
  changed: SquadOwnedFilePlan[];
  /** Subset of `changed` that gets a `.local-backup` first. */
  backups: SquadOwnedFilePlan[];
  unchanged: SquadOwnedFilePlan[];
}

/** A squad-owned file to plan: where it comes from, where it goes, what it should contain. */
export interface SquadOwnedCandidate {
  src: string;
  absPath: string;
  /** Override the content (e.g. generated workflow stubs); defaults to the source file text. */
  content?: string;
}

export interface ApplySquadOwnedResult {
  written: string[];
  backedUp: string[];
  /** Files whose overwrite was aborted because the backup could not be verified. */
  aborted: string[];
}

const TEXT_EXTENSIONS = new Set([
  '.md', '.json', '.yml', '.yaml', '.js', '.mjs', '.cjs', '.ts',
  '.ps1', '.sh', '.txt', '.template', '.mdc', '.toml',
]);

export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function contentHash(text: string): string {
  return createHash('sha256').update(normalizeEol(text), 'utf8').digest('hex');
}

export function toRelPosix(root: string, absPath: string): string {
  return path.relative(root, absPath).split(path.sep).join('/');
}

function readTextIfText(src: string): string | null {
  const lower = src.toLowerCase();
  if (!TEXT_EXTENSIONS.has(path.extname(lower)) && !lower.endsWith('.example')) return null;
  const bytes = readFileSync(src);
  if (bytes.includes(0)) return null;
  const text = bytes.toString('utf8');
  if (!bytes.equals(Buffer.from(text, 'utf8'))) return null;
  return text;
}

function readExistingText(absPath: string): string | undefined {
  try {
    return readFileSync(absPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

export function readShippedManifest(dest: string): ShippedManifest | null {
  const file = path.join(dest, ...SHIPPED_MANIFEST_RELATIVE_PATH.split('/'));
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<ShippedManifest>;
    if (parsed?.schema !== SHIPPED_MANIFEST_SCHEMA || !parsed.files || typeof parsed.files !== 'object') return null;
    return { schema: SHIPPED_MANIFEST_SCHEMA, version: String(parsed.version ?? ''), files: parsed.files };
  } catch {
    return null;
  }
}

/**
 * Record the hashes of every planned file as "what Squad shipped" so the next upgrade can
 * tell a user edit from a template revision. Sorted keys keep the file byte-stable.
 */
export function writeShippedManifest(dest: string, version: string, plan: SquadOwnedPlan): void {
  const file = path.join(dest, ...SHIPPED_MANIFEST_RELATIVE_PATH.split('/'));
  const files: Record<string, string> = {};
  for (const entry of [...plan.files].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const content = entry.content ?? readFileSync(entry.src).toString('utf8');
    files[entry.relPath] = contentHash(content);
  }
  const manifest: ShippedManifest = { schema: SHIPPED_MANIFEST_SCHEMA, version, files };
  mkdirSync(path.dirname(file), { recursive: true });
  // EOL-preserving: a checkout that converted the manifest to CRLF is not rewritten when nothing changed.
  writeManagedText(file, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Where the previous shipped copy of a live file can be found when no manifest record exists.
 * `.github/skills/<x>/SKILL.md` and `.github/workflows/<f>` were seeded by init into
 * `.squad/templates/skills|workflows/`, which upgrade (until #2047) never refreshed — so that
 * mirror is exactly the last shipped version.
 */
function priorShippedSnapshot(dest: string, relPath: string): string | undefined {
  const m = relPath.match(/^\.github\/(skills|workflows)\/(.+)$/);
  if (!m) return undefined;
  return readExistingText(path.join(dest, '.squad', 'templates', m[1]!, ...m[2]!.split('/')));
}

/**
 * Build the upgrade plan for a set of squad-owned candidates. Pure: reads disk, writes nothing.
 * Duplicate destinations keep the first candidate.
 */
export function planSquadOwnedFiles(dest: string, candidates: readonly SquadOwnedCandidate[]): SquadOwnedPlan {
  const manifest = readShippedManifest(dest);
  const seen = new Set<string>();
  const files: SquadOwnedFilePlan[] = [];

  for (const candidate of candidates) {
    const absPath = path.resolve(candidate.absPath);
    const key = process.platform === 'win32' ? absPath.toLowerCase() : absPath;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!existsSync(candidate.src)) continue;

    const relPath = toRelPosix(dest, absPath);
    const content = candidate.content ?? readTextIfText(candidate.src);
    const existing = readExistingText(absPath);

    if (existing === undefined) {
      files.push({ relPath, absPath, action: 'create', customized: false, content, src: candidate.src });
      continue;
    }

    const newText = content ?? readFileSync(candidate.src).toString('utf8');
    const same = content === null
      ? readFileSync(absPath).equals(readFileSync(candidate.src))
      : normalizeEol(existing) === normalizeEol(newText);
    if (same) {
      files.push({ relPath, absPath, action: 'unchanged', customized: false, content, src: candidate.src });
      continue;
    }

    let customized: boolean;
    let backupReason: SquadOwnedFilePlan['backupReason'];
    if (existing.trim().length === 0) {
      customized = false;
    } else if (manifest?.files[relPath]) {
      customized = contentHash(existing) !== manifest.files[relPath];
      if (customized) backupReason = 'customized';
    } else {
      const prior = priorShippedSnapshot(dest, relPath);
      customized = prior === undefined ? true : normalizeEol(prior) !== normalizeEol(existing);
      if (customized) backupReason = prior === undefined ? 'provenance-unavailable' : 'customized';
    }
    files.push({ relPath, absPath, action: 'overwrite', customized, backupReason, content, src: candidate.src });
  }

  const changed = files.filter(f => f.action !== 'unchanged');
  return {
    files,
    changed,
    backups: changed.filter(f => f.customized),
    unchanged: files.filter(f => f.action === 'unchanged'),
  };
}

/**
 * Write `<file>.local-backup` holding the current bytes and verify it before returning.
 * An existing backup with identical bytes is kept as-is. Throws when the backup cannot be
 * proven to hold the original content.
 */
export function writeVerifiedBackup(absPath: string): string {
  const backupPath = absPath + '.local-backup';
  const original = readFileSync(absPath);
  if (existsSync(backupPath) && readFileSync(backupPath).equals(original)) return backupPath;
  writeFileSync(backupPath, original);
  const readBack = readFileSync(backupPath);
  if (!readBack.equals(original)) {
    throw new Error(`backup verification failed for ${path.basename(backupPath)}`);
  }
  return backupPath;
}

/**
 * Apply a plan: back up customized files (verified) and then overwrite/create. A file whose
 * backup fails is left untouched and reported in `aborted`. Unchanged files are never written.
 */
export function applySquadOwnedFiles(
  plan: SquadOwnedPlan,
  log: { warn: (m: string) => void; info?: (m: string) => void } = { warn: console.warn },
): ApplySquadOwnedResult {
  const result: ApplySquadOwnedResult = { written: [], backedUp: [], aborted: [] };

  for (const file of plan.changed) {
    if (file.customized) {
      try {
        const backupPath = writeVerifiedBackup(file.absPath);
        result.backedUp.push(file.relPath);
        log.warn(file.backupReason === 'provenance-unavailable'
          ? `${file.relPath}: prior provenance unavailable — backed up before overwrite to ${path.basename(backupPath)}`
          : `${file.relPath} has local customizations — backed up to ${path.basename(backupPath)}`);
      } catch (err) {
        result.aborted.push(file.relPath);
        log.warn(`${file.relPath}: NOT overwritten — ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    mkdirSync(path.dirname(file.absPath), { recursive: true });
    if (file.content === null) {
      copyFileSync(file.src, file.absPath);
    } else if (file.action === 'create') {
      writeFileSync(file.absPath, file.content, 'utf8');
    } else {
      writeManagedText(file.absPath, file.content);
    }
    result.written.push(file.relPath);
  }

  return result;
}

/** Recursively list files under `dir` as absolute paths (sorted, deterministic). */
export function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

export interface RetiredFilePlan {
  relPath: string;
  absPath: string;
  /** The file no longer matches what Squad shipped — it is reported, never deleted. */
  customized: boolean;
}

/**
 * Files Squad shipped in a previous upgrade (recorded in the shipped manifest) that this
 * version no longer ships. Unmodified copies are safe to remove; modified ones are only
 * reported (#2232). Without a manifest nothing can be proven, so nothing is retired.
 */
export function planRetiredFiles(dest: string, plan: SquadOwnedPlan): RetiredFilePlan[] {
  const manifest = readShippedManifest(dest);
  if (!manifest) return [];
  const current = new Set(plan.files.map(f => f.relPath));
  const retired: RetiredFilePlan[] = [];
  for (const [relPath, hash] of Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b))) {
    if (current.has(relPath)) continue;
    const absPath = path.join(dest, ...relPath.split('/'));
    const existing = readExistingText(absPath);
    if (existing === undefined) continue;
    retired.push({ relPath, absPath, customized: contentHash(existing) !== hash });
  }
  return retired;
}

/** Remove unmodified retired files; leave (and report) modified ones. Returns what was removed and kept. */
export function applyRetiredFiles(retired: readonly RetiredFilePlan[]): { removed: string[]; kept: string[] } {
  const removed: string[] = [];
  const kept: string[] = [];
  for (const file of retired) {
    if (file.customized) {
      kept.push(file.relPath);
      continue;
    }
    try {
      unlinkSync(file.absPath);
      removed.push(file.relPath);
      // Drop directories the removal emptied, up to (not including) the repo root.
      let dir = path.dirname(file.absPath);
      while (existsSync(dir) && readdirSync(dir).length === 0) {
        rmdirSync(dir);
        dir = path.dirname(dir);
      }
    } catch {
      kept.push(file.relPath);
    }
  }
  return { removed, kept };
}

/** Human-readable dry-run rendering of a plan, paths relative to the repo root. */
export function formatSquadOwnedPlan(plan: SquadOwnedPlan): string[] {
  const lines: string[] = [];
  if (plan.changed.length === 0) {
    lines.push(`All ${plan.files.length} squad-owned file(s) are up to date — nothing to overwrite.`);
    return lines;
  }
  const creates = plan.changed.filter(f => f.action === 'create').length;
  const overwrites = plan.changed.length - creates;
  lines.push(
    `Would write ${plan.changed.length} squad-owned file(s)`
    + ` (${overwrites} overwrite, ${creates} create, ${plan.backups.length} backed up to .local-backup first):`,
  );
  for (const file of [...plan.changed].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const suffix = file.backupReason === 'provenance-unavailable'
      ? `  (prior provenance unavailable → ${path.basename(file.relPath)}.local-backup)`
      : file.customized
        ? `  (customized → ${path.basename(file.relPath)}.local-backup)`
        : '';
    lines.push(`  ${file.action.padEnd(9)} ${file.relPath}${suffix}`);
  }
  if (plan.unchanged.length > 0) {
    lines.push(`${plan.unchanged.length} squad-owned file(s) already up to date.`);
  }
  return lines;
}
