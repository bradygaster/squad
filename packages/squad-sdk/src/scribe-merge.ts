/**
 * Scribe Inbox Merge — claim protocol for concurrent-safe inbox merging.
 *
 * Implements the Scribe Claim Protocol from the shared-squad-across-clones
 * design: atomic rename from inbox/ → processing/, merge into canonical
 * file with content-hash deduplication, crash recovery for stale
 * processing/ entries.
 *
 * @module scribe-merge
 */

import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import type { StorageProvider } from './storage/storage-provider.js';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import type { ResolvedSquadPaths } from './resolution-base.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MergeOptions {
  /** If true, return what would be merged without writing. */
  dryRun?: boolean;
}

export interface MergeResult {
  /** Number of entries successfully merged into the canonical file. */
  merged: number;
  /** Number of entries skipped (already present via dedup). */
  skipped: number;
  /** Non-fatal errors encountered during processing. */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Hash a trimmed string with SHA-256 → hex. */
function contentHash(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Extract an ISO-style timestamp from a journal filename.
 *
 * Expected format: `{agent}-{ISO-timestamp}-{8hex}.md`
 * Example: `flight-2025-07-22T10-05-00Z-a1b2c3d4.md`
 *
 * The timestamp portion uses hyphens instead of colons (filename-safe).
 * Falls back to epoch 0 if parsing fails — entries with unparseable
 * timestamps sort to the front rather than being dropped.
 */
function extractTimestamp(filename: string): Date {
  // Strip .md extension
  const base = filename.replace(/\.md$/i, '');
  // Match ISO-like timestamp: YYYY-MM-DDTHH-MM-SSZ or similar
  const match = base.match(
    /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}(?:-\d{2})?Z)/,
  );
  if (!match) return new Date(0);
  // Restore colons: 2025-07-22T10-05-00Z → 2025-07-22T10:05:00Z
  const parts = match[1]!.split('T');
  if (parts.length !== 2) return new Date(0);
  const timePart = parts[1]!;
  const segments = timePart.replace(/Z$/, '').split('-');
  const restored =
    parts[0] + 'T' + segments.join(':') + 'Z';
  const d = new Date(restored);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

/**
 * Split a canonical markdown file into individual entry blocks.
 *
 * Entries are delimited by `### ` headings at the start of a line.
 * Returns trimmed content strings (heading included).
 */
function splitEntries(content: string): string[] {
  if (!content.trim()) return [];
  const blocks: string[] = [];
  const lines = content.split(/\r?\n/);
  let current: string[] = [];
  let pendingSection: string[] = [];

  for (const line of lines) {
    // A ## header (not ###) starts a section — buffer it to attach to the next ### entry
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      // Flush any in-progress entry
      if (current.length > 0) {
        const trimmed = current.join('\n').trim();
        if (trimmed) blocks.push(trimmed);
        current = [];
      }
      pendingSection = [line];
      continue;
    }

    // A ### header starts a new entry — attach any pending ## section header
    if (line.startsWith('### ')) {
      if (current.length > 0) {
        const trimmed = current.join('\n').trim();
        if (trimmed) blocks.push(trimmed);
      }
      current = pendingSection.length > 0 ? [...pendingSection, line] : [line];
      pendingSection = [];
      continue;
    }

    // Accumulate into pending section or current entry
    if (pendingSection.length > 0) {
      pendingSection.push(line);
    } else {
      current.push(line);
    }
  }

  // Flush remaining
  if (pendingSection.length > 0) {
    const trimmed = pendingSection.join('\n').trim();
    if (trimmed) blocks.push(trimmed);
  }
  if (current.length > 0) {
    const trimmed = current.join('\n').trim();
    if (trimmed) blocks.push(trimmed);
  }
  return blocks;
}

/** Build a Set of content hashes from existing canonical entries. */
function buildDedupSet(canonicalContent: string): Set<string> {
  const entries = splitEntries(canonicalContent);
  const hashes = new Set<string>();
  for (const entry of entries) {
    hashes.add(contentHash(entry));
  }
  return hashes;
}

/** Safely list a directory, returning [] if it doesn't exist. */
function safeListSync(dir: string, storage: StorageProvider): string[] {
  return storage.listSync(dir);
}

/** Safely read a file, returning '' if it doesn't exist. */
function safeReadSync(filePath: string, storage: StorageProvider): string {
  return storage.readSync(filePath) ?? '';
}

// ---------------------------------------------------------------------------
// Core merge
// ---------------------------------------------------------------------------

/**
 * Merge all `.md` files from an inbox directory into a canonical file
 * using the Scribe Claim Protocol.
 *
 * Protocol:
 *   1. List `.md` files in `inboxDir`
 *   2. Atomically rename each to `processing/` (sibling of inbox)
 *   3. Read ALL files in `processing/` (includes crash-recovered entries)
 *   4. Sort by timestamp extracted from filename
 *   5. Read existing canonical file content
 *   6. Append new entries, deduplicating by content hash
 *   7. Write merged result via atomic temp+rename
 *   8. Delete processed files
 *   9. Remove processing/ if empty
 */
export function mergeInbox(
  inboxDir: string,
  canonicalFile: string,
  options?: MergeOptions,
  storage: StorageProvider = new FSStorageProvider(),
): MergeResult {
  const result: MergeResult = { merged: 0, skipped: 0, errors: [] };
  const processingDir = path.join(path.dirname(inboxDir), 'processing');

  // Step 1: List inbox .md files
  const inboxFiles = safeListSync(inboxDir, storage).filter((f) =>
    f.endsWith('.md'),
  );

  // Step 2: Claim — atomic rename to processing/
  if (inboxFiles.length > 0) {
    storage.mkdirSync(processingDir, { recursive: true });
  }
  for (const file of inboxFiles) {
    const src = path.join(inboxDir, file);
    const dest = path.join(processingDir, file);
    try {
      storage.renameSync(src, dest);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Another Scribe claimed this file — skip silently
        continue;
      }
      result.errors.push(`claim ${file}: ${(err as Error).message}`);
    }
  }

  // Step 3: Read ALL files in processing/ (claimed + pre-existing from crashes)
  const processingFiles = safeListSync(processingDir, storage).filter((f) =>
    f.endsWith('.md'),
  );
  if (processingFiles.length === 0) {
    return result;
  }

  // Step 4: Sort by timestamp from filename
  const sorted = [...processingFiles].sort((a, b) => {
    return extractTimestamp(a).getTime() - extractTimestamp(b).getTime();
  });

  // Step 5: Read existing canonical + build dedup set
  const existingContent = safeReadSync(canonicalFile, storage);
  const dedupSet = buildDedupSet(existingContent);

  // Step 6: Collect new entries (dedup by content hash)
  const newEntries: string[] = [];
  const processedFiles: string[] = [];

  for (const file of sorted) {
    const filePath = path.join(processingDir, file);
    try {
      const raw = storage.readSync(filePath);
      if (raw === undefined) {
        result.errors.push(`read ${file}: file not found`);
        continue;
      }
      const content = raw.trim();
      if (!content) {
        processedFiles.push(file);
        result.skipped++;
        continue;
      }
      const hash = contentHash(content);
      if (dedupSet.has(hash)) {
        // Already in canonical — skip (idempotent)
        processedFiles.push(file);
        result.skipped++;
      } else {
        dedupSet.add(hash);
        newEntries.push(content);
        processedFiles.push(file);
        result.merged++;
      }
    } catch (err: unknown) {
      result.errors.push(`read ${file}: ${(err as Error).message}`);
    }
  }

  // Step 7: Write merged result via atomic temp+rename
  if (newEntries.length > 0 && !options?.dryRun) {
    const separator = existingContent.trim() ? '\n\n' : '';
    const merged = existingContent.trimEnd() + separator + newEntries.join('\n\n') + '\n';
    const tmpFile =
      canonicalFile + '.tmp.' + randomBytes(4).toString('hex');
    storage.mkdirSync(path.dirname(canonicalFile), { recursive: true });
    storage.writeSync(tmpFile, merged);
    storage.renameSync(tmpFile, canonicalFile);
  }

  // Step 8: Delete processed files from processing/
  if (!options?.dryRun) {
    for (const file of processedFiles) {
      try {
        storage.deleteSync(path.join(processingDir, file));
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          result.errors.push(`delete ${file}: ${(err as Error).message}`);
        }
      }
    }

    // Step 9: Remove processing/ if empty (non-recursive rmdir semantics)
    try {
      const remaining = storage.listSync(processingDir);
      if (remaining.length === 0) {
        storage.deleteDirSync(processingDir);
      }
    } catch {
      // Not empty or already gone — fine
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * Recover stale files from `processing/` by moving them back to `inbox/`.
 *
 * A file is considered stale if its mtime is older than `maxAgeMinutes`.
 * This handles the case where a Scribe crashed after claiming files but
 * before completing the merge.
 *
 * @returns Count of recovered files.
 */
export function recoverStaleProcessing(
  processingDir: string,
  maxAgeMinutes = 5,
  storage: StorageProvider = new FSStorageProvider(),
): number {
  const files = safeListSync(processingDir, storage).filter((f) =>
    f.endsWith('.md'),
  );
  if (files.length === 0) return 0;

  const inboxDir = path.join(path.dirname(processingDir), 'inbox');
  const cutoff = maxAgeMinutes <= 0
    ? Infinity  // 0 or negative = treat everything as stale
    : Date.now() - maxAgeMinutes * 60_000;
  let recovered = 0;

  for (const file of files) {
    const filePath = path.join(processingDir, file);
    try {
      const st = storage.statSync(filePath);
      if (!st) continue; // File disappeared — skip
      if (st.mtimeMs < cutoff) {
        storage.mkdirSync(inboxDir, { recursive: true });
        storage.renameSync(filePath, path.join(inboxDir, file));
        recovered++;
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
      // File already moved — skip
    }
  }

  return recovered;
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Merge the decisions inbox into `decisions.md`.
 */
export function mergeDecisionsInbox(
  paths: ResolvedSquadPaths,
  options?: MergeOptions,
  storage: StorageProvider = new FSStorageProvider(),
): MergeResult {
  return mergeInbox(
    path.join(paths.teamDir, 'decisions', 'inbox'),
    path.join(paths.teamDir, 'decisions.md'),
    options,
    storage,
  );
}

/**
 * Merge a single agent's history inbox into `history.md`.
 */
export function mergeAgentHistoryInbox(
  paths: ResolvedSquadPaths,
  agentName: string,
  options?: MergeOptions,
  storage: StorageProvider = new FSStorageProvider(),
): MergeResult {
  return mergeInbox(
    path.join(paths.teamDir, 'agents', agentName, 'history', 'inbox'),
    path.join(paths.teamDir, 'agents', agentName, 'history.md'),
    options,
    storage,
  );
}

/**
 * Merge ALL agent history inboxes.
 *
 * Scans the `agents/` directory for subdirectories that contain a
 * `history/inbox/` folder, and merges each one.
 */
export function mergeAllHistoryInboxes(
  paths: ResolvedSquadPaths,
  options?: MergeOptions,
  storage: StorageProvider = new FSStorageProvider(),
): Map<string, MergeResult> {
  const results = new Map<string, MergeResult>();
  const agentsDir = path.join(paths.teamDir, 'agents');
  const agents = safeListSync(agentsDir, storage);

  for (const agent of agents) {
    const inboxPath = path.join(agentsDir, agent, 'history', 'inbox');
    // Only merge if the inbox directory exists
    if (storage.existsSync(inboxPath)) {
      try {
        const r = mergeAgentHistoryInbox(paths, agent, options, storage);
        results.set(agent, r);
      } catch (err: unknown) {
        results.set(agent, {
          merged: 0,
          skipped: 0,
          errors: [(err as Error).message],
        });
      }
    }
  }

  return results;
}
