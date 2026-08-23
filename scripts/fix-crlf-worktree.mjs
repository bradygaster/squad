#!/usr/bin/env node
// fix-crlf-worktree.mjs -- Repair a working tree that predates an eol=lf rule.
//
// THE PROBLEM THIS SOLVES (#1793)
// `.gitattributes` governs CHECKOUT, not files already on disk. When #1790
// added `*.mjs text eol=lf`, git only rewrote the working file for paths whose
// INDEX content also changed. The paths already stored LF in the index did not
// move, so git never re-smudged them and they stayed CRLF on disk. Vite's
// shebang stripping leaves a bare `#` on such a file, the module fails to
// parse, and every vitest suite importing it reports "no tests" -- a zero that
// reads as green. Every Windows checkout created before the rule is in this
// state and nothing about pulling the fix repairs it.
//
// WHY `git checkout -- <path>` IS NOT THE ANSWER
// In this state the file is content-clean: git's checkin filter normalizes the
// CRLF away, so the cleaned blob equals the index blob exactly. `git checkout`
// has nothing to restore and can no-op, which is precisely what makes the
// condition so durable. `git checkout-index -f` writes from the index
// unconditionally and is the primitive that actually repairs it.
//
// WHY NOT `git add --renormalize .`
// That rewrites the INDEX, which is the opposite side of the defect, and in
// this repo it would sweep every CRLF-storing .ts blob -- most of them, and
// none of them ours -- into one line-ending churn commit. `.gitattributes`
// documents that exclusion deliberately. (It cites a specific count; treat
// that as illustrative, since it drifts with the tree.) This is a local
// working-tree repair; it must produce no commit at all.
//
// SAFETY
// `git checkout-index -f` overwrites the file on disk. It is only ever pointed
// at paths that git reports as having NO content difference from the index, so
// there is nothing to lose. Paths with real uncommitted edits are skipped and
// listed, never overwritten.
//
// Uses only Node.js built-ins (child_process, url).

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { listContentModified, listWorktreeCrlf } from './check-shebang-eol.mjs';

/**
 * Rewrite the given paths from the index, forcing git past its "nothing to do"
 * shortcut.
 *
 * Batched by FILE COUNT, which bounds argv length only indirectly. 200 paths
 * sit well under the 32767-character Windows limit at this repo's path lengths
 * (longest tracked path is ~80 chars, so a full batch is ~16K), but that is a
 * property of the tree, not a guarantee: it would take a ~164-character mean
 * path to overflow a batch. Deliberately not doing explicit length accounting
 * -- the repair set is normally a handful of files, and a tree with 200 paths
 * averaging 164 characters has larger problems.
 */
function checkoutIndex(cwd, files) {
  const BATCH = 200;
  for (let i = 0; i < files.length; i += BATCH) {
    execFileSync('git', ['checkout-index', '-f', '--', ...files.slice(i, i + BATCH)], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
}

/**
 * Repair every LF-pinned path whose working file is CRLF.
 * Returns what was repaired, what was skipped, and what survived the repair.
 */
export function repair(cwd) {
  const stale = listWorktreeCrlf(cwd);
  if (stale.length === 0) return { repaired: [], skipped: [], remaining: [] };

  const modified = listContentModified(cwd);
  const skipped = stale.map((e) => e.file).filter((f) => modified.has(f));
  const repairable = stale.map((e) => e.file).filter((f) => !modified.has(f));

  checkoutIndex(cwd, repairable);

  // Re-measure rather than trusting the write: the whole class of bug this
  // script exists for is a repair that silently did not take effect.
  const stillStale = new Set(listWorktreeCrlf(cwd).map((e) => e.file));
  return {
    repaired: repairable.filter((f) => !stillStale.has(f)),
    skipped,
    remaining: repairable.filter((f) => stillStale.has(f)),
  };
}

function main() {
  const cwd = process.cwd();
  const { repaired, skipped, remaining } = repair(cwd);

  if (repaired.length === 0 && skipped.length === 0 && remaining.length === 0) {
    console.log('Working tree EOL check passed: no LF-pinned file has CRLF on disk.');
    process.exit(0);
  }

  if (repaired.length > 0) {
    console.log(`Repaired ${repaired.length} file(s) from CRLF to LF on disk:`);
    for (const file of repaired) console.log(`  ${file}`);
  }

  if (skipped.length > 0) {
    console.error(`\nSKIPPED ${skipped.length} file(s) with uncommitted changes -- not overwritten:`);
    for (const file of skipped) console.error(`  ${file}`);
    console.error('\nCommit or stash these, then re-run. Their content would have been lost.');
  }

  if (remaining.length > 0) {
    console.error(`\nSTILL CRLF after repair -- ${remaining.length} file(s):`);
    for (const file of remaining) console.error(`  ${file}`);
    console.error('\nThis should not happen. Check that .gitattributes pins these paths to eol=lf.');
  }

  if (skipped.length > 0 || remaining.length > 0) process.exit(1);

  console.log(
    '\nVerified: re-measured after the repair and no LF-pinned path reports CRLF on disk.\n' +
      "To inspect the raw state: git ls-files --eol   (every entry whose attr includes eol=lf\n" +
      'should read w/lf -- the pin is not limited to *.mjs).'
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
