#!/usr/bin/env node
// check-shebang-eol.mjs -- EOL invariants over a git repository.
//
//   UNPINNED       Every tracked file starting with `#!` must be pinned to LF.
//   CRLF-BLOB      Every file pinned to LF must actually store an LF blob.
//   WORKTREE-CRLF  Every file pinned to LF must also BE LF on disk. (#1793)
//
// The first two read the index and are enforced by main() as a CI gate. The
// third reads the working tree, is local-only by nature, and is exported for
// `squad doctor` / scripts/fix-crlf-worktree.mjs rather than gated here -- see
// listWorktreeCrlf below for why putting it in CI would be a no-op gate.
//
// A CRLF shebang is never correct. The trailing \r becomes part of the
// interpreter argument on POSIX ("env: node\r: No such file or directory"), and
// it defeats bundler shebang stripping -- Vite leaves a bare `#` as the module's
// first token, so a vitest suite importing the file loads ZERO tests while still
// looking like ordinary noise (#1788).
//
// A rule over a CRLF blob is its own defect: git normalizes the working tree to
// LF while the blob never moves, so the diff can NEVER close. The file shows
// modified in every worktree forever, `git restore` does not stick, and a broad
// `git add` sweeps it -- along with whatever real change happens to share the
// tree. Only `git add --renormalize` clears it. This is the failure that
// survives for years unnoticed, because nothing about it is fatal.
//
// This lint exists because .gitattributes encoded the shebang lesson for `*.sh`
// in one PR and for `*.mjs` in another without ever generalizing, so we paid for
// it twice.
//
// THE TWO INVARIANTS USE DIFFERENT ENUMERATIONS, AND THAT IS THE POINT.
// The shebang set and the eol=lf set overlap; neither contains the other.
// Checking blobs over the shebang set -- as the first version of this lint did
// -- is blind to every pinned file without a `#!`, which is most of them. That
// gap was real: adding `*.js text eol=lf` without renormalizing left two CRLF
// blobs churning while this gate reported green.
//
// SCOPE BOUNDARY -- read this before assuming a green run means "no EOL bugs".
// Not covered: a file that OUGHT to be pinned, has no shebang, and has no rule
// yet. Vitest snapshots were exactly this until `*.snap text eol=lf` was added.
// There is no cheap static signature for "some tool writes this file with LF" --
// it cannot be determined by reading the file -- so guessing would trade a sound
// check for an unsound one. New tool-written file types get pinned by hand;
// from the moment a rule exists, CRLF-BLOB takes over and enforces it.
//
// Uses only Node.js built-ins (child_process, path, url).

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const NUL = '\0';

/** Run git and return stdout as a Buffer, or throw with the stderr attached. */
function git(args, cwd, encoding = 'utf8') {
  return execFileSync('git', args, {
    cwd,
    encoding,
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Every path tracked by git in `cwd`. */
export function listTrackedFiles(cwd) {
  return git(['ls-files', '-z'], cwd).split(NUL).filter(Boolean);
}

/**
 * Read many blobs with a single `git cat-file --batch` process.
 *
 * The obvious implementation spawns one `git cat-file` per tracked file, which
 * costs ~70s on Windows for a repo this size and blows vitest's hook timeout.
 * `--batch` preserves input order, so results correlate by index.
 */
function batchReadBlobs(cwd, paths) {
  if (paths.length === 0) return [];
  const out = execFileSync('git', ['cat-file', '--batch', '--buffer'], {
    cwd,
    input: `${paths.map((p) => `:${p}`).join('\n')}\n`,
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const blobs = [];
  let offset = 0;
  while (offset < out.length && blobs.length < paths.length) {
    const nl = out.indexOf(0x0a, offset);
    if (nl === -1) break;
    const header = out.subarray(offset, nl).toString('utf8');
    offset = nl + 1;
    const match = /^\S+ \S+ (\d+)$/.exec(header);
    if (!match) {
      blobs.push(null); // "missing" / "ambiguous" -- header line only
      continue;
    }
    const size = Number(match[1]);
    blobs.push(out.subarray(offset, offset + size));
    offset += size + 1; // skip the blob's trailing LF
  }
  while (blobs.length < paths.length) blobs.push(null);
  return blobs;
}

/**
 * Paths whose staged blob begins with `#!`, each flagged if its first line ends
 * in CR.
 *
 * Reads the index (`git cat-file :path`) rather than the working tree or HEAD.
 * The working tree is whatever the local checkout smudged it into; HEAD lags a
 * pending `git add --renormalize`. The index is what is actually about to be
 * committed, and in a fresh CI checkout it equals HEAD -- so this is correct
 * both as a pre-commit check and as a CI gate.
 */
export function listShebangFiles(cwd, files = listTrackedFiles(cwd)) {
  const blobs = batchReadBlobs(cwd, files);
  const found = [];
  for (let i = 0; i < files.length; i += 1) {
    const blob = blobs[i];
    if (!blob || blob.length < 2 || blob[0] !== 0x23 || blob[1] !== 0x21) continue;
    const lf = blob.indexOf(0x0a);
    const firstLine = lf === -1 ? blob : blob.subarray(0, lf);
    found.push({
      file: files[i],
      crlf: firstLine.length > 0 && firstLine[firstLine.length - 1] === 0x0d,
    });
  }
  return found;
}

/**
 * Paths whose staged blob contains a CRLF anywhere.
 *
 * Unlike `listShebangFiles` this looks at the whole blob, not the first line:
 * for a file pinned to LF, any CRLF in the blob is the defect.
 */
export function listCrlfBlobs(cwd, files) {
  const blobs = batchReadBlobs(cwd, files);
  const found = [];
  for (let i = 0; i < files.length; i += 1) {
    if (blobs[i] && blobs[i].includes('\r\n')) found.push(files[i]);
  }
  return found;
}

/**
 * `git check-attr eol` for each path, as a Map<path, value>.
 *
 * Paths go over stdin, not argv. This is called with every tracked file
 * (~1800 here, well over 70KB of paths), which blows the 32767-character
 * Windows command-line limit if passed as arguments.
 */
export function eolAttributes(cwd, files) {
  if (files.length === 0) return new Map();
  const out = execFileSync('git', ['check-attr', '--stdin', '-z', 'eol'], {
    cwd,
    input: files.join(NUL),
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).split(NUL);
  const map = new Map();
  // -z output is a flat stream of (path, attr, value) triples.
  for (let i = 0; i + 2 < out.length; i += 3) {
    map.set(out[i], out[i + 2]);
  }
  return map;
}

/**
 * Parse one `git ls-files --eol -z` record into `{ index, worktree, attr, file }`.
 *
 * Record shape is `i/<eol>` `w/<eol>` `attr/<value>` then a TAB then the path;
 * the first three fields are space-padded to fixed columns and the attr value
 * itself contains a space ("text eol=lf"), so the path is everything after the
 * first TAB and the field block is split by whitespace runs, not by column.
 */
function parseEolRecord(record) {
  const tab = record.indexOf('\t');
  if (tab === -1) return undefined;
  const match = /^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*)$/.exec(record.slice(0, tab));
  if (!match) return undefined;
  return { index: match[1], worktree: match[2], attr: match[3].trim(), file: record.slice(tab + 1) };
}

/**
 * WORKTREE-CRLF -- paths pinned to LF whose file ON DISK still has CRLF.
 *
 * THIS IS A THIRD INVARIANT, AND IT IS NOT REDUNDANT WITH THE TWO ABOVE.
 * UNPINNED and CRLF-BLOB both read the *index*. This one reads the *working
 * tree*, and the gap between them is exactly #1793: `.gitattributes` governs
 * checkout, not files already on disk. Adding `*.mjs text eol=lf` (#1790) only
 * rewrites a working file when the merge also changes that file's index
 * content. For a path already stored LF, the index does not move, so git never
 * re-smudges it and it stays CRLF on disk forever. Vite's shebang stripping
 * then leaves a bare `#`, the module fails to parse, and the importing vitest
 * suite reports "no tests" -- a green-looking zero (#1788).
 *
 * DELIBERATELY NOT WIRED INTO main() BELOW. This lint runs in CI, where the
 * checkout is always fresh, so a working-tree assertion there could never
 * observe the failure it is meant to catch -- a permanently green gate is
 * equivalent to no gate. The condition is local-only by nature, so it is
 * surfaced by `squad doctor` and repaired by scripts/fix-crlf-worktree.mjs,
 * both of which run on the developer's actual disk.
 *
 * `w/mixed` counts too: under an eol=lf pin, any CR in the working file is the
 * same defect, just partially applied.
 */
export function listWorktreeCrlf(cwd) {
  const out = git(['ls-files', '--eol', '-z'], cwd).split(NUL).filter(Boolean);
  const found = [];
  for (const record of out) {
    const parsed = parseEolRecord(record);
    if (!parsed) continue;
    if (!/(^|\s)eol=lf(\s|$)/.test(parsed.attr)) continue;
    if (parsed.worktree !== 'crlf' && parsed.worktree !== 'mixed') continue;
    found.push(parsed);
  }
  return found;
}

/**
 * Paths whose working-tree content differs from the index in more than line
 * endings. Git's checkin filter normalizes CRLF away before comparing, so a
 * pure EOL mismatch produces NO entry here while a genuine edit does.
 *
 * This is the safety gate for any repair that overwrites from the index:
 * `git checkout-index -f` is destructive to real uncommitted work, and this is
 * what makes it safe to point at a path.
 */
export function listContentModified(cwd) {
  return new Set(git(['diff', '--name-only', '-z'], cwd).split(NUL).filter(Boolean));
}

/**
 * Pure decision step, separated so tests can drive it with synthetic input.
 * Returns one violation per problem, not per file, so a file can report both.
 *
 * Two invariants, each over its OWN enumeration -- the sets overlap but neither
 * contains the other, which is the bug this signature exists to prevent:
 *
 *   UNPINNED   over shebang files: a `#!` file must have an eol=lf rule.
 *   CRLF-BLOB  over eol=lf files:  a pinned file's blob must not store CRLF.
 *
 * `crlfBlobs` is the list of eol=lf-pinned paths whose blob contains a CRLF.
 * A shebang file with a CRLF first line is reported too even when it is not
 * pinned, because that is independently broken regardless of any rule.
 */
export function findViolations(shebangFiles, attrs, crlfBlobs = []) {
  const violations = [];
  const flaggedCrlf = new Set();

  for (const { file, crlf } of shebangFiles) {
    const eol = attrs.get(file);
    if (eol !== 'lf') {
      violations.push({
        file,
        kind: 'unpinned',
        detail: `no .gitattributes rule pins it to LF (git check-attr eol = ${eol ?? 'unspecified'})`,
      });
    }
    if (crlf) {
      flaggedCrlf.add(file);
      violations.push({
        file,
        kind: 'crlf-blob',
        detail: 'the committed blob stores a CRLF shebang line',
      });
    }
  }

  for (const file of crlfBlobs) {
    if (flaggedCrlf.has(file)) continue; // already reported via the shebang pass
    violations.push({
      file,
      kind: 'crlf-blob',
      detail: 'pinned to LF by .gitattributes but the committed blob stores CRLF',
    });
  }

  return violations;
}

/** Full scan of a repository. */
export function scan(cwd) {
  const files = listTrackedFiles(cwd);
  const shebangFiles = listShebangFiles(cwd, files);
  const attrs = eolAttributes(cwd, files);
  const pinned = files.filter((file) => attrs.get(file) === 'lf');
  const crlfBlobs = listCrlfBlobs(cwd, pinned);
  return { shebangFiles, pinned, crlfBlobs, violations: findViolations(shebangFiles, attrs, crlfBlobs) };
}

function main() {
  const cwd = process.cwd();
  const { shebangFiles, pinned, violations } = scan(cwd);

  if (violations.length === 0) {
    console.log(
      `EOL check passed: ${shebangFiles.length} shebanged file(s) all pinned to LF, ` +
        `${pinned.length} LF-pinned file(s) all storing LF blobs.`,
    );
    process.exit(0);
  }

  const unpinned = violations.filter((v) => v.kind === 'unpinned');
  const crlfBlobs = violations.filter((v) => v.kind === 'crlf-blob');

  console.error(
    `EOL check FAILED: ${violations.length} problem(s) across ${new Set(violations.map((v) => v.file)).size} file(s) ` +
      `(scanned ${shebangFiles.length} shebanged, ${pinned.length} LF-pinned).`,
  );
  console.error('A CRLF shebang breaks POSIX execution and bundler shebang stripping.');
  console.error('An LF rule over a CRLF blob makes the file churn forever -- the diff can never close.\n');
  for (const { file, kind, detail } of violations) {
    console.error(`  ${kind.toUpperCase().padEnd(10)} ${file} -- ${detail}`);
  }
  console.error('\nTo fix:');
  if (unpinned.length > 0) {
    console.error('  1. Add an eol=lf rule to .gitattributes covering the paths listed as UNPINNED.');
    console.error('     Prefer an extension rule (e.g. "*.mjs text eol=lf"); use an explicit path when');
    console.error('     a blanket rule would renormalize files unrelated to the shebang.');
  }
  if (crlfBlobs.length > 0) {
    console.error(`  ${unpinned.length > 0 ? '2' : '1'}. Run: git add --renormalize -- <path>   (a rule alone does not rewrite committed blobs)`);
  }
  console.error('\nDo NOT "fix" this by deleting the shebang -- these files are invoked directly.');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
