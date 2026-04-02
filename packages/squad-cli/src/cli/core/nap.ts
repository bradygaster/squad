/**
 * Nap — context hygiene engine for .squad/ state
 * Compresses histories, prunes logs, archives decisions, cleans inbox.
 * @module cli/core/nap
 */

// Raw fs imports removed — Wave 3a migrated all stat/append/delete to StorageProvider.
import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();

// ─── Types ──────────────────────────────────────────────────────────────

export interface NapOptions {
  squadDir: string;   // path to .squad/
  deep?: boolean;     // tier 2
  dryRun?: boolean;   // don't modify files
}

export interface NapResult {
  before: NapMetrics;
  after: NapMetrics;
  actions: NapAction[];
}

export interface NapMetrics {
  totalFiles: number;
  totalBytes: number;
  historyBytes: number;
  logBytes: number;
  decisionBytes: number;
  inboxFiles: number;
}

export interface NapAction {
  type: 'compress' | 'prune' | 'archive' | 'merge' | 'cleanup';
  target: string;
  description: string;
  bytesSaved: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

const HISTORY_THRESHOLD = 15 * 1024;       // 15 KB
const DECISION_THRESHOLD = 20 * 1024;      // 20 KB
const LOG_MAX_AGE_DAYS = 7;
const DECISION_MAX_AGE_DAYS = 30;
const KEEP_ENTRIES_DEFAULT = 5;
const KEEP_ENTRIES_DEEP = 3;
const JOURNAL_FILE = '.nap-journal';
const TOKENS_PER_KB = 250;

// ─── Helpers ────────────────────────────────────────────────────────────

function collectFiles(dir: string): string[] {
  if (!storage.existsSync(dir)) return [];
  const results: string[] = [];
  const walk = (d: string) => {
    for (const name of storage.listSync(d)) {
      const full = path.join(d, name);
      if (storage.isDirectorySync(full)) walk(full);
      else results.push(full);
    }
  };
  walk(dir);
  return results;
}

function dirSize(dir: string): { files: number; bytes: number } {
  const files = collectFiles(dir);
  let bytes = 0;
  for (const f of files) {
    try { bytes += storage.statSync(f)?.size ?? 0; } catch { /* skip */ }
  }
  return { files: files.length, bytes };
}

function fileSize(p: string): number {
  try { return storage.statSync(p)?.size ?? 0; } catch { return 0; }
}

function isOlderThan(filePath: string, days: number): boolean {
  try {
    const s = storage.statSync(filePath);
    if (!s) return false;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return s.mtimeMs < cutoff;
  } catch { return false; }
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanTokens(bytes: number): string {
  const tokens = Math.round((bytes / 1024) * TOKENS_PER_KB);
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(0)}K`;
}

function daysAgoFromLine(line: string): number | null {
  // Match dates like 2026-02-28 or ### 2026-02-28
  const m = line.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const d = new Date(m[1]!);
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (24 * 60 * 60 * 1000);
}

// ─── Metrics collection ─────────────────────────────────────────────────

function collectMetrics(squadDir: string): NapMetrics {
  const agentsDir = path.join(squadDir, 'agents');
  const orchLogDir = path.join(squadDir, 'orchestration-log');
  const logDir = path.join(squadDir, 'log');
  const decisionsFile = path.join(squadDir, 'decisions.md');
  const inboxDir = path.join(squadDir, 'decisions', 'inbox');

  let historyBytes = 0;
  if (storage.existsSync(agentsDir)) {
    for (const name of storage.listSync(agentsDir)) {
      if (!storage.isDirectorySync(path.join(agentsDir, name))) continue;
      const hf = path.join(agentsDir, name, 'history.md');
      historyBytes += fileSize(hf);
    }
  }

  const orchLog = dirSize(orchLogDir);
  const sessionLog = dirSize(logDir);
  const logBytes = orchLog.bytes + sessionLog.bytes;

  const decisionBytes = fileSize(decisionsFile);

  let inboxFiles = 0;
  if (storage.existsSync(inboxDir)) {
    inboxFiles = storage.listSync(inboxDir).filter((f: string) => !f.startsWith('.')).length;
  }

  const total = dirSize(squadDir);

  return {
    totalFiles: total.files,
    totalBytes: total.bytes,
    historyBytes,
    logBytes,
    decisionBytes,
    inboxFiles,
  };
}

// ─── History compression ────────────────────────────────────────────────

function compressHistory(
  filePath: string,
  keepEntries: number,
  dryRun: boolean,
): NapAction | null {
  if (!storage.existsSync(filePath)) return null;
  const size = fileSize(filePath);
  if (size <= HISTORY_THRESHOLD) return null;

  const content = storage.readSync(filePath) ?? '';
  const lines = content.split('\n');

  // Find ## Core Context section bounds
  let coreStart = -1;
  let coreEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.match(/^##\s+Core\s+Context/i)) {
      coreStart = i;
      // Ends at next ## heading or end of file
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]!.match(/^##\s/)) { coreEnd = j; break; }
      }
      if (coreEnd === -1) coreEnd = lines.length;
      break;
    }
  }

  // Find all ## Learnings sections (or any ## section after Core Context)
  const sections: { start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === coreStart) { i = coreEnd - 1; continue; }
    if (lines[i]!.match(/^##\s/)) {
      const secStart = i;
      let secEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]!.match(/^##\s/)) { secEnd = j; break; }
      }
      sections.push({ start: secStart, end: secEnd });
      i = secEnd - 1;
    }
  }

  if (sections.length <= keepEntries) return null;

  // Keep the most recent N sections (last N)
  const keep = sections.slice(-keepEntries);
  const archive = sections.slice(0, -keepEntries);

  // Build archive content
  const archiveLines: string[] = [];
  for (const sec of archive) {
    archiveLines.push(...lines.slice(sec.start, sec.end));
    archiveLines.push('');
  }

  // Build new file: header (lines before first section or core context) + core context + kept sections
  const newLines: string[] = [];

  // Lines before any ## heading
  const firstHeading = Math.min(
    coreStart >= 0 ? coreStart : Infinity,
    sections.length > 0 ? sections[0]!.start : Infinity,
  );
  if (firstHeading < Infinity) {
    newLines.push(...lines.slice(0, firstHeading));
  }

  // Core context
  if (coreStart >= 0) {
    newLines.push(...lines.slice(coreStart, coreEnd));
    if (!newLines[newLines.length - 1]?.match(/^\s*$/)) newLines.push('');
  }

  // Kept sections
  for (const sec of keep) {
    newLines.push(...lines.slice(sec.start, sec.end));
    if (!newLines[newLines.length - 1]?.match(/^\s*$/)) newLines.push('');
  }

  const newContent = newLines.join('\n');
  const archiveContent = archiveLines.join('\n');
  const saved = size - Buffer.byteLength(newContent, 'utf8');

  if (!dryRun) {
    const archivePath = filePath.replace(/\.md$/, '-archive.md');
    // Append to archive
    if (archiveContent.trim()) {
      storage.appendSync(archivePath, archiveContent + '\n');
    }
    storage.writeSync(filePath, newContent);
  }

  const relPath = path.basename(path.dirname(filePath));
  return {
    type: 'compress',
    target: filePath,
    description: `Compressed ${relPath}/history.md: kept ${keepEntries} entries, archived ${archive.length}`,
    bytesSaved: Math.max(0, saved),
  };
}

// ─── Log pruning ────────────────────────────────────────────────────────

function pruneLogs(dir: string, dryRun: boolean): NapAction[] {
  if (!storage.existsSync(dir)) return [];
  const actions: NapAction[] = [];
  const files = collectFiles(dir);
  for (const f of files) {
    if (isOlderThan(f, LOG_MAX_AGE_DAYS)) {
      const size = fileSize(f);
      if (!dryRun) {
        storage.deleteSync(f);
      }
      actions.push({
        type: 'prune',
        target: f,
        description: `Pruned old log: ${path.basename(f)}`,
        bytesSaved: size,
      });
    }
  }
  return actions;
}

// ─── Inbox cleanup ──────────────────────────────────────────────────────

function cleanInbox(squadDir: string, dryRun: boolean): NapAction[] {
  const inboxDir = path.join(squadDir, 'decisions', 'inbox');
  const decisionsFile = path.join(squadDir, 'decisions.md');
  if (!storage.existsSync(inboxDir)) return [];

  const files = storage.listSync(inboxDir).filter((f: string) => !f.startsWith('.'));
  if (files.length === 0) return [];

  const actions: NapAction[] = [];
  for (const f of files) {
    const fp = path.join(inboxDir, f);
    if (storage.isDirectorySync(fp)) continue;
    const content = storage.readSync(fp) ?? '';
    const size = Buffer.byteLength(content, 'utf8');

    if (!dryRun) {
      storage.appendSync(decisionsFile, '\n' + content.trimEnd() + '\n');
      storage.deleteSync(fp);
    }

    actions.push({
      type: 'merge',
      target: fp,
      description: `Merged inbox file: ${f} into decisions.md`,
      bytesSaved: size,
    });
  }
  return actions;
}

// ─── Decision archival ──────────────────────────────────────────────────

/**
 * Archive stale decision entries from `decisions.md` to `decisions-archive.md`.
 *
 * **Entry format:** Each entry starts with `### YYYY-MM-DD: Topic`. Entries
 * without a parseable date are treated as undated and always preserved (they
 * are typically foundational directives).
 *
 * **Invariant:** `entries_before === entries_kept + entries_archived` — no
 * decision data is ever silently dropped.
 *
 * **Threshold:** The file must exceed {@link DECISION_THRESHOLD} (default
 * 20 KB) before any archival is attempted. This constant is overridable via
 * config in future iterations.
 *
 * **Archival strategy:**
 * 1. *Age-based* — entries older than {@link DECISION_MAX_AGE_DAYS} are
 *    archived first.
 * 2. *Count-based fallback* — when no entries exceed the age limit but the
 *    file still exceeds the threshold, the oldest dated entries are archived
 *    until the remaining content fits within the budget.
 *
 * @param squadDir - Absolute path to the `.squad` directory.
 * @param dryRun  - When `true`, calculates the action without writing to disk.
 * @returns `null` when the file is under threshold, doesn't exist, or nothing
 *   was archivable (e.g. only undated entries remain). Otherwise a
 *   {@link NapAction} describing the archive operation and bytes saved.
 */
function archiveDecisions(squadDir: string, dryRun: boolean): NapAction | null {
  const decisionsFile = path.join(squadDir, 'decisions.md');
  if (!storage.existsSync(decisionsFile)) return null;
  const size = fileSize(decisionsFile);
  if (size <= DECISION_THRESHOLD) return null;

  const content = storage.readSync(decisionsFile) ?? '';
  const lines = content.split('\n');

  // Find entry boundaries (### headings)
  const entries: { start: number; end: number; daysAgo: number | null }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.match(/^###\s/)) {
      const entryStart = i;
      let entryEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]!.match(/^###\s/)) { entryEnd = j; break; }
      }
      const age = daysAgoFromLine(lines[i]!);
      entries.push({ start: entryStart, end: entryEnd, daysAgo: age });
      i = entryEnd - 1;
    }
  }

  // Split: keep entries from last 30 days
  const recent: typeof entries = [];
  const old: typeof entries = [];
  for (const e of entries) {
    if (e.daysAgo !== null && e.daysAgo > DECISION_MAX_AGE_DAYS) {
      old.push(e);
    } else {
      recent.push(e);
    }
  }

  // Count-based fallback: if nothing is old enough but file exceeds threshold,
  // archive the oldest dated recent entries to get under the size limit.
  // Undated entries are preserved — they are often foundational directives.
  if (old.length === 0) {
    const dated = recent.filter(e => e.daysAgo !== null);
    const undated = recent.filter(e => e.daysAgo === null);

    if (dated.length === 0) return null; // only undated entries, nothing to archive

    // Sort dated entries: most recent first (smallest daysAgo)
    dated.sort((a, b) => a.daysAgo! - b.daysAgo!);

    // Keep the most recent dated entries that fit under the threshold
    // along with all undated entries and the header.
    // Account for separator newlines added during reassembly:
    //   recentContent = header + '\n' + entries.join('\n') + '\n'
    // Each entry contributes +1 byte for its join separator (overestimates
    // by 1 byte for the last entry, which is a safe margin).
    const headerEnd = entries.length > 0 ? entries[0]!.start : lines.length;
    const headerSize = Buffer.byteLength(lines.slice(0, headerEnd).join('\n'), 'utf8');
    const reassemblyOverhead = 2; // '\n' after header + trailing '\n'
    const undatedSize = undated.reduce(
      (sum, e) => sum + Buffer.byteLength(lines.slice(e.start, e.end).join('\n'), 'utf8') + 1, 0,
    );
    let budget = DECISION_THRESHOLD - headerSize - reassemblyOverhead - undatedSize;

    const keptDated: typeof entries = [];
    for (const e of dated) {
      const entrySize = Buffer.byteLength(lines.slice(e.start, e.end).join('\n'), 'utf8') + 1;
      if (budget >= entrySize) {
        budget -= entrySize;
        keptDated.push(e);
      } else {
        old.push(e);
      }
    }

    if (old.length === 0) return null; // everything fits, no archival needed

    // Rebuild recent: undated + kept dated, in original document order
    recent.length = 0;
    recent.push(...undated, ...keptDated);
    recent.sort((a, b) => a.start - b.start);
  }

  // Header: lines before first ### heading
  const headerEnd = entries.length > 0 ? entries[0]!.start : lines.length;
  const header = lines.slice(0, headerEnd).join('\n');

  const recentContent = header + '\n' + recent.map(e => lines.slice(e.start, e.end).join('\n')).join('\n') + '\n';
  const archiveContent = old.map(e => lines.slice(e.start, e.end).join('\n')).join('\n') + '\n';

  const saved = size - Buffer.byteLength(recentContent, 'utf8');

  if (!dryRun) {
    const archivePath = path.join(squadDir, 'decisions-archive.md');
    if (archiveContent.trim()) {
      storage.appendSync(archivePath, archiveContent);
    }
    storage.writeSync(decisionsFile, recentContent);
  }

  return {
    type: 'archive',
    target: decisionsFile,
    description: `Archived ${old.length} old decision entries, kept ${recent.length} recent`,
    bytesSaved: Math.max(0, saved),
  };
}

// ─── Journal safety ─────────────────────────────────────────────────────

function checkJournal(squadDir: string): boolean {
  return storage.existsSync(path.join(squadDir, JOURNAL_FILE));
}

function writeJournal(squadDir: string): void {
  storage.writeSync(
    path.join(squadDir, JOURNAL_FILE),
    `nap started at ${new Date().toISOString()}\n`,
  );
}

function removeJournal(squadDir: string): void {
  const jp = path.join(squadDir, JOURNAL_FILE);
  if (storage.existsSync(jp)) storage.deleteSync(jp);
}

// ─── Main entry ─────────────────────────────────────────────────────────

export async function runNap(options: NapOptions): Promise<NapResult> {
  const { squadDir, deep = false, dryRun = false } = options;
  const actions: NapAction[] = [];

  if (!storage.existsSync(squadDir)) {
    return { before: emptyMetrics(), after: emptyMetrics(), actions };
  }

  // Journal safety check
  if (checkJournal(squadDir)) {
    const noColor = !!process.env['NO_COLOR'];
    const prefix = noColor ? '[WARN]' : '\x1b[33m⚠️\x1b[0m';
    console.error(`${prefix} Previous nap was interrupted. Continuing anyway.`);
  }

  // Collect before metrics
  const before = collectMetrics(squadDir);

  if (!dryRun) writeJournal(squadDir);

  try {
    const keepEntries = deep ? KEEP_ENTRIES_DEEP : KEEP_ENTRIES_DEFAULT;

    // History compression
    const agentsDir = path.join(squadDir, 'agents');
    if (storage.existsSync(agentsDir)) {
      for (const name of storage.listSync(agentsDir)) {
        if (!storage.isDirectorySync(path.join(agentsDir, name))) continue;
        const hf = path.join(agentsDir, name, 'history.md');
        const action = compressHistory(hf, keepEntries, dryRun);
        if (action) actions.push(action);
      }
    }

    // Log pruning
    actions.push(...pruneLogs(path.join(squadDir, 'orchestration-log'), dryRun));
    actions.push(...pruneLogs(path.join(squadDir, 'log'), dryRun));

    // Inbox cleanup
    actions.push(...cleanInbox(squadDir, dryRun));

    // Decision archival
    const archiveAction = archiveDecisions(squadDir, dryRun);
    if (archiveAction) actions.push(archiveAction);

  } finally {
    if (!dryRun) removeJournal(squadDir);
  }

  // Collect after metrics
  const after = dryRun ? estimateAfterMetrics(before, actions) : collectMetrics(squadDir);

  return { before, after, actions };
}

/**
 * Synchronous version of runNap for use in REPL (executeCommand is sync).
 * All internal operations use sync fs calls, so this is safe.
 */
export function runNapSync(options: NapOptions): NapResult {
  const { squadDir, deep = false, dryRun = false } = options;
  const actions: NapAction[] = [];

  if (!storage.existsSync(squadDir)) {
    return { before: emptyMetrics(), after: emptyMetrics(), actions };
  }

  if (checkJournal(squadDir)) {
    const noColor = !!process.env['NO_COLOR'];
    const prefix = noColor ? '[WARN]' : '\x1b[33m⚠️\x1b[0m';
    console.error(`${prefix} Previous nap was interrupted. Continuing anyway.`);
  }

  const before = collectMetrics(squadDir);

  if (!dryRun) writeJournal(squadDir);

  try {
    const keepEntries = deep ? KEEP_ENTRIES_DEEP : KEEP_ENTRIES_DEFAULT;

    const agentsDir = path.join(squadDir, 'agents');
    if (storage.existsSync(agentsDir)) {
      for (const name of storage.listSync(agentsDir)) {
        if (!storage.isDirectorySync(path.join(agentsDir, name))) continue;
        const hf = path.join(agentsDir, name, 'history.md');
        const action = compressHistory(hf, keepEntries, dryRun);
        if (action) actions.push(action);
      }
    }

    actions.push(...pruneLogs(path.join(squadDir, 'orchestration-log'), dryRun));
    actions.push(...pruneLogs(path.join(squadDir, 'log'), dryRun));
    actions.push(...cleanInbox(squadDir, dryRun));

    const archiveAction = archiveDecisions(squadDir, dryRun);
    if (archiveAction) actions.push(archiveAction);
  } finally {
    if (!dryRun) removeJournal(squadDir);
  }

  const after = dryRun ? estimateAfterMetrics(before, actions) : collectMetrics(squadDir);

  return { before, after, actions };
}

// ─── Report formatting ──────────────────────────────────────────────────

export function formatNapReport(result: NapResult, noColor?: boolean): string {
  const nc = noColor ?? !!process.env['NO_COLOR'];
  const B = nc ? '' : '\x1b[1m';
  const D = nc ? '' : '\x1b[2m';
  const G = nc ? '' : '\x1b[32m';
  const Y = nc ? '' : '\x1b[33m';
  const R = nc ? '' : '\x1b[0m';
  const sep = '-'.repeat(40);

  const { before, after, actions } = result;
  const saved = before.totalBytes - after.totalBytes;
  const tokensSaved = humanTokens(Math.max(0, saved));

  const lines: string[] = [];

  if (actions.length === 0) {
    lines.push(`${nc ? '' : '😴 '}${B}Nap complete${R} - nothing to clean up.`);
    lines.push(`${D}Total: ${humanBytes(before.totalBytes)} (${humanTokens(before.totalBytes)} tokens est.)${R}`);
    return lines.join('\n');
  }

  lines.push(`${nc ? '' : '😴 '}${B}Nap Report${R}`);
  lines.push(sep);
  lines.push('');

  // Before/after summary
  lines.push(`${B}Overall${R}`);
  lines.push(`  ${humanBytes(before.totalBytes)} ${D}->${R} ${G}${humanBytes(after.totalBytes)}${R} ${D}(saved ~${tokensSaved} tokens)${R}`);
  lines.push('');

  // Category breakdown
  lines.push(`${B}Breakdown${R}`);
  const categories: [string, number, number][] = [
    ['History', before.historyBytes, after.historyBytes],
    ['Logs', before.logBytes, after.logBytes],
    ['Decisions', before.decisionBytes, after.decisionBytes],
  ];
  for (const [name, b, a] of categories) {
    if (b === 0 && a === 0) continue;
    const delta = b - a;
    const deltaStr = delta > 0 ? `${D}(-${humanBytes(delta)})${R}` : '';
    lines.push(`  ${name}: ${humanBytes(b)} -> ${humanBytes(a)} ${deltaStr}`);
  }

  if (before.inboxFiles > 0) {
    lines.push(`  Inbox: ${before.inboxFiles} file${before.inboxFiles !== 1 ? 's' : ''} -> ${after.inboxFiles}`);
  }

  lines.push('');
  lines.push(`${B}Actions${R} (${actions.length})`);
  for (const a of actions) {
    const tag = actionTag(a.type, nc);
    lines.push(`  ${tag} ${a.description}`);
  }

  lines.push('');
  lines.push(`${D}Token estimate: 1 KB ~ ${TOKENS_PER_KB} tokens${R}`);

  return lines.join('\n');
}

function actionTag(type: NapAction['type'], noColor: boolean): string {
  if (noColor) return `[${type.toUpperCase()}]`;
  const colors: Record<string, string> = {
    compress: '\x1b[36m',  // cyan
    prune: '\x1b[31m',     // red
    archive: '\x1b[33m',   // yellow
    merge: '\x1b[32m',     // green
    cleanup: '\x1b[35m',   // magenta
  };
  const c = colors[type] ?? '';
  return `${c}[${type.toUpperCase()}]\x1b[0m`;
}

function emptyMetrics(): NapMetrics {
  return { totalFiles: 0, totalBytes: 0, historyBytes: 0, logBytes: 0, decisionBytes: 0, inboxFiles: 0 };
}

function estimateAfterMetrics(before: NapMetrics, actions: NapAction[]): NapMetrics {
  let totalSaved = 0;
  let historySaved = 0;
  let logSaved = 0;
  let decisionSaved = 0;
  let inboxMerged = 0;

  for (const a of actions) {
    totalSaved += a.bytesSaved;
    if (a.type === 'compress') historySaved += a.bytesSaved;
    if (a.type === 'prune') logSaved += a.bytesSaved;
    if (a.type === 'archive') decisionSaved += a.bytesSaved;
    if (a.type === 'merge') inboxMerged++;
  }

  return {
    totalFiles: before.totalFiles, // approximate in dry-run
    totalBytes: Math.max(0, before.totalBytes - totalSaved),
    historyBytes: Math.max(0, before.historyBytes - historySaved),
    logBytes: Math.max(0, before.logBytes - logSaved),
    decisionBytes: Math.max(0, before.decisionBytes - decisionSaved),
    inboxFiles: Math.max(0, before.inboxFiles - inboxMerged),
  };
}
