/**
 * Parse `git diff --name-status` output into structured diff results.
 * Pure function — no side effects.
 */

export type DiffStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';

export interface DiffFile {
  path: string;
  status: DiffStatus;
  /** Original path for renames/copies */
  oldPath?: string;
}

export interface DiffResult {
  files: DiffFile[];
}

const STATUS_MAP: Record<string, DiffStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
};

/**
 * Parse a single line of `git diff --name-status` output.
 * Handles tab-separated fields: STATUS\tPATH or STATUS\tOLD_PATH\tNEW_PATH (for renames).
 */
function parseLine(line: string): DiffFile | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Name-status format: STATUS<tab>PATH or STATUS<score><tab>OLD<tab>NEW
  const parts = trimmed.split('\t');
  if (parts.length < 2) return null;

  const statusRaw = parts[0]!;
  // R100, R095, C100 etc. — extract the letter prefix
  const statusChar = statusRaw.charAt(0).toUpperCase();
  const status = STATUS_MAP[statusChar];

  if (!status) return null;

  if ((status === 'renamed' || status === 'copied') && parts.length >= 3) {
    return {
      path: parts[2]!,
      status,
      oldPath: parts[1]!,
    };
  }

  return {
    path: parts[1]!,
    status,
  };
}

/**
 * Parse complete `git diff --name-status` output.
 */
export function parseDiff(nameStatusOutput: string): DiffResult {
  const lines = nameStatusOutput.split('\n');
  const files: DiffFile[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed) {
      files.push(parsed);
    }
  }

  return { files };
}
