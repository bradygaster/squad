/**
 * .squad/ Leakage Detector — warns if .squad/ files are included in a PR.
 *
 * Feature branches should not typically modify .squad/ files (team config,
 * agent charters, routing). This script detects accidental leakage.
 *
 * Usage: node scripts/check-squad-leakage.mjs [base-ref]
 * Default base-ref: origin/dev
 *
 * Exit code: always 0 (informational only — does not block merge)
 * Output: JSON { leaked: boolean, files: string[] }
 *
 * Uses only node:* built-ins (runs in CI before npm install).
 */

import { execFileSync } from 'node:child_process';
import { decodeGitNameOnly } from './git-path-decoder.mjs';

const baseRef = process.argv[2] || 'origin/dev';
const headRef = process.argv[3] || 'HEAD';

try {
  const output = execFileSync(
    'git',
    ['diff', `${baseRef}...${headRef}`, '--name-only', '--diff-filter=ACMRT', '--', '.squad/'],
    { encoding: 'buffer', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const changedFiles = decodeGitNameOnly(output);
  const result = {
    leaked: changedFiles.length > 0,
    files: changedFiles,
  };

  console.log(JSON.stringify(result));

  if (result.leaked) {
    console.error(
      `\n⚠️  Squad file leakage: ${changedFiles.length} .squad/ file(s) modified in this PR:`,
    );
    for (const file of changedFiles) {
      console.error(`  - ${file}`);
    }
    console.error(
      '\nThis is usually unintentional. If these changes are deliberate, ensure they are ' +
      'approved by the team lead. .squad/ files affect team routing, agent charters, and decisions.',
    );
  } else {
    console.error('\n✅ No .squad/ file leakage detected.');
  }
} catch (err) {
  const errorMessage = err instanceof Error ? err.message : String(err);
  console.error(`Squad leakage scan failed: ${errorMessage}`);
  process.exitCode = 1;
}
