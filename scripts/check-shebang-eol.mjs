#!/usr/bin/env node
// check-shebang-eol.mjs -- Every tracked file starting with `#!` must be pinned to LF.
//
// A CRLF shebang is never correct. The trailing \r becomes part of the
// interpreter argument on POSIX ("env: node\r: No such file or directory"), and
// it defeats bundler shebang stripping -- Vite leaves a bare `#` as the module's
// first token, so a vitest suite importing the file loads ZERO tests while still
// looking like ordinary noise (#1788).
//
// This lint exists because .gitattributes encoded that lesson for `*.sh` in one
// PR and for `*.mjs` in another without ever generalizing, so we paid for it
// twice. It checks the RULE (git check-attr says eol=lf) and the REALITY (the
// committed blob's first line does not end in \r) independently -- a rule that
// was added without renormalizing is still a broken repo.
//
// SCOPE BOUNDARY -- read this before assuming a green run means "no EOL bugs".
// There are two CRLF failure classes and this lint covers exactly one:
//
//   1. STRICT PARSE (covered). The file fails to load. `#!` is a cheap, exact,
//      static signature, so the check is sound and has no false negatives.
//
//   2. TOOL REWRITE (NOT covered). A tool writes the file with LF, the checkout
//      has CRLF, and the tree is perpetually dirty -- so a broad `git add`
//      commits line-ending noise, or worse, sweeps in an unrelated real change
//      sitting in the same file. Vitest snapshots (`*.snap`) are the known case;
//      pinned by an explicit .gitattributes rule, NOT found by this lint.
//
// Class 2 has no cheap static signature -- "files some tool writes with LF" is
// not detectable by reading the file. Extending this lint to guess would trade a
// sound check for an unsound one, so the boundary is deliberate. New generated
// or tool-written file types must be pinned in .gitattributes by hand.
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

/** `git check-attr eol` for each path, as a Map<path, value>. */
export function eolAttributes(cwd, files) {
  if (files.length === 0) return new Map();
  const out = git(['check-attr', '-z', 'eol', '--', ...files], cwd).split(NUL);
  const map = new Map();
  // -z output is a flat stream of (path, attr, value) triples.
  for (let i = 0; i + 2 < out.length; i += 3) {
    map.set(out[i], out[i + 2]);
  }
  return map;
}

/**
 * Pure decision step, separated so tests can drive it with synthetic input.
 * Returns one violation per problem, not per file, so a file can report both.
 */
export function findViolations(shebangFiles, attrs) {
  const violations = [];
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
      violations.push({
        file,
        kind: 'crlf-blob',
        detail: 'the committed blob stores a CRLF shebang line',
      });
    }
  }
  return violations;
}

/** Full scan of a repository. */
export function scan(cwd) {
  const shebangFiles = listShebangFiles(cwd);
  const attrs = eolAttributes(cwd, shebangFiles.map((entry) => entry.file));
  return { shebangFiles, violations: findViolations(shebangFiles, attrs) };
}

function main() {
  const cwd = process.cwd();
  const { shebangFiles, violations } = scan(cwd);

  if (violations.length === 0) {
    console.log(`Shebang EOL check passed: all ${shebangFiles.length} shebanged files are pinned to LF.`);
    process.exit(0);
  }

  const unpinned = violations.filter((v) => v.kind === 'unpinned');
  const crlfBlobs = violations.filter((v) => v.kind === 'crlf-blob');

  console.error(
    `Shebang EOL check FAILED: ${violations.length} problem(s) across ${new Set(violations.map((v) => v.file)).size} of ${shebangFiles.length} shebanged file(s).`,
  );
  console.error('A CRLF shebang breaks POSIX execution and bundler shebang stripping.\n');
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
