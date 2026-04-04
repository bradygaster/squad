/**
 * Parse PR diff output into structured file data.
 * Uses only Node.js built-ins.
 *
 * Issue: #733
 */

/**
 * Parse `gh pr diff --name-only` output into structured data.
 * @param {string} diffOutput — raw output from `gh pr diff --name-only`
 * @returns {{ added: string[], modified: string[], deleted: string[], all: string[] }}
 */
export function parseDiffNames(diffOutput) {
  const all = diffOutput
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Name-only output has no status info; classify all as modified.
  // Caller should use enrichFileStatuses() when API data is available.
  return { added: [], modified: [...all], deleted: [], all };
}

/**
 * Build structured file data from the GitHub Pulls files API response.
 * Each entry has {filename, status} where status is added|removed|modified|renamed|copied|changed.
 * @param {Array<{filename: string, status: string}>} apiFiles
 * @returns {{ added: string[], modified: string[], deleted: string[], all: string[] }}
 */
export function enrichFileStatuses(apiFiles) {
  const added = [];
  const modified = [];
  const deleted = [];
  const all = [];

  for (const f of apiFiles) {
    all.push(f.filename);
    switch (f.status) {
      case 'added':
        added.push(f.filename);
        break;
      case 'removed':
        deleted.push(f.filename);
        break;
      default: // modified, renamed, copied, changed
        modified.push(f.filename);
        break;
    }
  }

  return { added, modified, deleted, all };
}
