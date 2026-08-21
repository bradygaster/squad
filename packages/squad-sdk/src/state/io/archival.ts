/**
 * Archival integrity — make "move content between state files" incapable of
 * destroying that content.
 *
 * Archival is a two-half operation: append to a destination, then trim from a
 * source. Three production defects came from the halves coming apart:
 *
 * - #1774 — the trim ran and the append never did.
 * - #1783 — the append ran, but to an *untracked* destination. Under a
 *   git-excluded `.squad/`, already-tracked files still commit while brand-new
 *   files silently never do. The trim commits; the destination does not.
 *   Archival becomes deletion, and the reported outcome is success.
 * - #1760 — inbox bodies were spliced verbatim under `###` entries, landing
 *   `##` children beneath an `###` parent and breaking document hierarchy.
 *
 * The rules encoded here, in the order they must execute:
 *
 * 1. Assert the destination is git-tracked *before* writing to it.
 * 2. Append, verify the entries actually landed, and only then trim.
 * 3. Report entry counts, never file sizes. Size is not an integrity signal —
 *    a merge and an archive in the same pass can move a file's size in the
 *    wrong direction while both halves behave correctly.
 * 4. Demote inbox headings on merge so relative structure is preserved.
 * 5. Never report a gate outcome that was not measured.
 *
 * @module state/io/archival
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

/** Thrown when an archive destination cannot be committed. */
export class UntrackedArchiveDestinationError extends Error {
  readonly destination: string;

  constructor(destination: string) {
    super(
      `Archive destination is not tracked by git: ${destination}\n` +
        `Writing here would make archival a deletion: the trim from the tracked ` +
        `source would commit while this destination never would. ` +
        `Redirect to an existing tracked archive file, or abort.`,
    );
    this.name = 'UntrackedArchiveDestinationError';
    this.destination = destination;
  }
}

/** Thrown when an append cannot be proven to have landed. Source is left intact. */
export class ArchiveVerificationError extends Error {
  readonly missing: string[];

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = 'ArchiveVerificationError';
    this.missing = missing;
  }
}

/** Runs a git command and returns its exit code. Injectable for tests. */
export type GitRunner = (args: string[], cwd: string) => number;

const defaultGitRunner: GitRunner = (args, cwd) => {
  try {
    execFileSync('git', args, { cwd, stdio: 'pipe' });
    return 0;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return typeof status === 'number' ? status : 1;
  }
};

/**
 * Rule 1 — is this path tracked by git?
 *
 * `git ls-files --error-unmatch <path>` exits 0 only for tracked paths. It is
 * deliberately *not* `git check-ignore`: a file can be untracked without being
 * ignored, and both cases are equally uncommittable in an automated run.
 */
export function isTrackedInGit(
  filePath: string,
  repoRoot: string,
  git: GitRunner = defaultGitRunner,
): boolean {
  return git(['ls-files', '--error-unmatch', '--', filePath], repoRoot) === 0;
}

/**
 * Rule 1 — refuse to archive into a destination that cannot be committed.
 *
 * When `fallbackDestination` is supplied and itself tracked, the write is
 * redirected there instead of aborting.
 *
 * @returns the destination that is safe to write to.
 * @throws {UntrackedArchiveDestinationError} when no tracked destination exists.
 */
export function resolveTrackedDestination(options: {
  destination: string;
  repoRoot: string;
  fallbackDestination?: string;
  git?: GitRunner;
}): { destination: string; redirected: boolean } {
  const { destination, repoRoot, fallbackDestination, git = defaultGitRunner } = options;

  if (isTrackedInGit(destination, repoRoot, git)) {
    return { destination, redirected: false };
  }

  if (fallbackDestination && isTrackedInGit(fallbackDestination, repoRoot, git)) {
    return { destination: fallbackDestination, redirected: true };
  }

  throw new UntrackedArchiveDestinationError(destination);
}

// ---------------------------------------------------------------------------
// Fence-aware markdown scanning
//
// `decisions.md` contains fenced samples with lines like `# In workflows/squad.md:`.
// A naive `^#{1,6} ` regex treats those as headings and corrupts the samples,
// so every scanner below tracks fence state.
// ---------------------------------------------------------------------------

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^(#{1,6})(\s+)(.*)$/;

interface ScannedLine {
  readonly text: string;
  readonly inFence: boolean;
  readonly headingLevel: number | null;
}

function scanLines(markdown: string): ScannedLine[] {
  const out: ScannedLine[] = [];
  let fence: string | null = null;

  for (const text of markdown.split('\n')) {
    const fenceMatch = FENCE_RE.exec(text);
    if (fenceMatch) {
      const marker = fenceMatch[1]?.[0] ?? '`';
      if (fence === null) {
        fence = marker;
        out.push({ text, inFence: true, headingLevel: null });
        continue;
      }
      if (marker === fence) {
        fence = null;
        out.push({ text, inFence: true, headingLevel: null });
        continue;
      }
    }

    if (fence !== null) {
      out.push({ text, inFence: true, headingLevel: null });
      continue;
    }

    const heading = HEADING_RE.exec(text);
    const level = heading?.[1]?.length ?? null;
    out.push({ text, inFence: false, headingLevel: level });
  }

  return out;
}

/** Fence-aware heading text extraction, e.g. `### 2026-03-26: Copilot git safety rules`. */
export function extractHeadings(markdown: string, level?: number): string[] {
  return scanLines(markdown)
    .filter((l) => l.headingLevel !== null && (level === undefined || l.headingLevel === level))
    .map((l) => l.text.trim());
}

/**
 * Rule 3 — count entries. This is the only valid integrity signal for archival.
 *
 * Fence-aware, so `#` comments inside code samples are never counted.
 */
export function countEntries(markdown: string, level = 3): number {
  return extractHeadings(markdown, level).length;
}

/**
 * Rule 4 — shift every heading in a body down by `by` levels, fence-aware.
 *
 * Levels clamp at 6 (the deepest heading markdown defines), so a body that is
 * already deep degrades gracefully rather than emitting `#######`.
 */
export function demoteHeadings(markdown: string, by = 2): string {
  if (by <= 0) return markdown;

  return scanLines(markdown)
    .map((line) => {
      if (line.headingLevel === null) return line.text;
      const match = HEADING_RE.exec(line.text);
      if (!match?.[1]) return line.text;
      const level = Math.min(6, match[1].length + by);
      return `${'#'.repeat(level)}${match[2] ?? ' '}${match[3] ?? ''}`;
    })
    .join('\n');
}

/**
 * Rule 4 — prepare an inbox body to be spliced beneath an `###` entry.
 *
 * The shift is computed from the body's *shallowest* heading so that it lands
 * at `####`, which preserves relative structure whether the inbox file used
 * `##` sections (the common case, #1760) or `###`.
 */
export function prepareInboxBodyForMerge(body: string, parentLevel = 3): string {
  const levels = scanLines(body)
    .map((l) => l.headingLevel)
    .filter((l): l is number => l !== null);

  if (levels.length === 0) return body;

  const shallowest = Math.min(...levels);
  const shift = parentLevel + 1 - shallowest;
  return shift > 0 ? demoteHeadings(body, shift) : body;
}

/** A single `###` decision entry: its heading and the body that follows it. */
export interface DecisionEntry {
  readonly heading: string;
  readonly text: string;
}

/** Split a decisions document into a preamble plus its `###` entries. */
export function splitEntries(
  markdown: string,
  level = 3,
): { preamble: string; entries: DecisionEntry[] } {
  const lines = scanLines(markdown);
  const preamble: string[] = [];
  const entries: DecisionEntry[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.headingLevel !== null && line.headingLevel <= level) {
      if (line.headingLevel === level) {
        if (current) entries.push({ heading: current.heading, text: current.lines.join('\n') });
        current = { heading: line.text.trim(), lines: [line.text] };
        continue;
      }
      // A heading shallower than an entry closes the current entry.
      if (current) {
        entries.push({ heading: current.heading, text: current.lines.join('\n') });
        current = null;
      }
    }
    if (current) current.lines.push(line.text);
    else preamble.push(line.text);
  }

  if (current) entries.push({ heading: current.heading, text: current.lines.join('\n') });

  return { preamble: preamble.join('\n'), entries };
}

/** Measured outcome of an archival run. Counts only — never sizes. */
export interface ArchivalResult {
  readonly removedFromSource: number;
  readonly addedToDestination: number;
  readonly headings: string[];
  readonly destination: string;
  readonly redirected: boolean;
}

export interface ArchiveEntriesOptions {
  /** Tracked file entries are moved out of. */
  sourcePath: string;
  /** Intended archive destination. Must be tracked, or redirect via fallback. */
  destinationPath: string;
  /** Repo root used for `git ls-files`. */
  repoRoot: string;
  /** Predicate selecting which entries to archive. */
  select: (entry: DecisionEntry) => boolean;
  /** Existing tracked archive to fall back to when `destinationPath` is untracked. */
  fallbackDestination?: string;
  /** Heading level that delimits entries. Defaults to 3 (`###`). */
  level?: number;
  git?: GitRunner;
  /**
   * File I/O seam. Defaults to `node:fs`. Exists so the verify-then-trim rule
   * can be exercised against a destination that accepts a write but does not
   * persist it — which is exactly #1774's shape.
   */
  io?: {
    readFile: (p: string) => string;
    appendFile: (p: string, data: string) => void;
    writeFile: (p: string, data: string) => void;
    exists: (p: string) => boolean;
  };
}

/**
 * Archive entries from a source document into a destination archive.
 *
 * Order is load-bearing and enforced, not merely documented:
 *
 * 1. resolve a **tracked** destination (rule 1) — before any write;
 * 2. **append** to the destination;
 * 3. **verify** by re-reading the destination and confirming every archived
 *    heading is literally present and the count matches (rule 2);
 * 4. only then **trim** the source.
 *
 * If verification fails the source is never touched, so a failed archive
 * degrades to a no-op with a duplicate in the archive — recoverable — rather
 * than to silent data loss.
 */
export function archiveEntries(options: ArchiveEntriesOptions): ArchivalResult {
  const {
    sourcePath,
    destinationPath,
    repoRoot,
    select,
    fallbackDestination,
    level = 3,
    git = defaultGitRunner,
    io = {
      readFile: (p: string) => readFileSync(p, 'utf8'),
      appendFile: (p: string, data: string) => appendFileSync(p, data, 'utf8'),
      writeFile: (p: string, data: string) => writeFileSync(p, data, 'utf8'),
      exists: (p: string) => existsSync(p),
    },
  } = options;

  // Rule 1 — resolve a committable destination before writing anything.
  const { destination, redirected } = resolveTrackedDestination({
    destination: destinationPath,
    repoRoot,
    fallbackDestination,
    git,
  });

  const sourceMarkdown = io.readFile(sourcePath);
  const { preamble, entries } = splitEntries(sourceMarkdown, level);
  const selected = entries.filter(select);

  if (selected.length === 0) {
    return {
      removedFromSource: 0,
      addedToDestination: 0,
      headings: [],
      destination,
      redirected,
    };
  }

  const headings = selected.map((e) => e.heading);
  const before = io.exists(destination) ? io.readFile(destination) : '';
  const beforeCount = countEntries(before, level);

  // Rule 2, step 1 — append.
  const payload = `${before.endsWith('\n') || before === '' ? '' : '\n'}\n${selected
    .map((e) => e.text.replace(/\s+$/, ''))
    .join('\n\n')}\n`;
  io.appendFile(destination, payload);

  // Rule 2, step 2 — verify by re-reading. Every heading must literally be
  // present and the entry count must have grown by exactly what we appended.
  const after = io.readFile(destination);
  const afterHeadings = new Set(extractHeadings(after, level));
  const missing = headings.filter((h) => !afterHeadings.has(h));
  const added = countEntries(after, level) - beforeCount;

  if (missing.length > 0) {
    throw new ArchiveVerificationError(
      `Archive append could not be verified — ${missing.length} of ${headings.length} ` +
        `entries are not present in ${destination}. Source left intact.`,
      missing,
    );
  }
  if (added !== selected.length) {
    throw new ArchiveVerificationError(
      `Archive append count mismatch — expected ${selected.length} entries added to ` +
        `${destination}, measured ${added}. Source left intact.`,
    );
  }

  // Rule 2, step 3 — only now is it safe to trim.
  const kept = entries.filter((e) => !select(e));
  const rebuilt = [preamble.replace(/\s+$/, ''), ...kept.map((e) => e.text.replace(/\s+$/, ''))]
    .filter((part) => part.length > 0)
    .join('\n\n');
  io.writeFile(sourcePath, `${rebuilt}\n`);

  return {
    removedFromSource: selected.length,
    addedToDestination: added,
    headings,
    destination,
    redirected,
  };
}

/**
 * Rules 3 + 5 — render a report from measured counts.
 *
 * Refuses to render a mismatched result: a report is only allowed to describe
 * numbers that were actually observed and that balance. "No archival required"
 * must come from a measurement, never from an assumption.
 */
export function formatArchivalReport(result: ArchivalResult, repoRoot?: string): string {
  if (result.removedFromSource !== result.addedToDestination) {
    throw new ArchiveVerificationError(
      `Refusing to report an unbalanced archival: ${result.removedFromSource} removed ` +
        `from source vs ${result.addedToDestination} added to destination.`,
    );
  }

  const dest = repoRoot ? path.relative(repoRoot, result.destination) : result.destination;
  if (result.removedFromSource === 0) {
    return 'ARCHIVAL: measured 0 entries eligible — 0 removed from source / 0 added to destination.';
  }

  const redirectNote = result.redirected ? ` (redirected to tracked destination)` : '';
  return (
    `ARCHIVAL: ${result.removedFromSource} removed from source / ` +
    `${result.addedToDestination} added to ${dest}${redirectNote}.`
  );
}
