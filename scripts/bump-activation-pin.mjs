#!/usr/bin/env node
/**
 * Move the Squad CLI activation pin to a published version (#1825).
 *
 * The pin decays on a schedule nobody controls: every npm release makes it stale,
 * and nothing about releasing touches it. `.github/workflows/squad-cli-pin-drift.yml`
 * is the daily backstop that *notices*; this script is the half that prevents, by
 * moving the pin in the same run that made the new version installable.
 *
 * It is a script rather than an inline `run:` block for two reasons. The patterns
 * below contain backticks (the docs table) and pipes (the YAML `||` fallback), both
 * of which are hostile to quoting inside a workflow block scalar — and as a file it
 * can be exercised by `test/squad-cli-pin.test.ts` without a release.
 *
 * Deliberately does NOT read `packages/squad-cli/package.json`. That holds the next
 * *unreleased* version and resolves to E404 on npm — the exact breakage PR #1818
 * fixed. The caller supplies a version it has already proven is published.
 *
 * Fails closed: if any pattern stops matching, the pin has moved and this script has
 * silently become a no-op. A bumper that cannot find its target must say so loudly,
 * or it reintroduces exactly the silent decay it exists to prevent.
 */

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const PIN_FILE = 'workflows/shared/squad.md';
const DOCS_FILE = 'docs/src/content/docs/guide/gh-aw.md';

/**
 * Every place the pinned version is written out. All three must move together: the
 * effective pin is what activation installs, and the other two are what a human reads
 * when deciding whether the pin is current — a stale copy misinforms precisely the
 * person trying to verify it.
 *
 * None of these patterns contain a literal `${`+`{` sequence, so the file stays safe
 * to reference from a workflow without Actions evaluating it as an expression.
 */
const SITES = [
  {
    file: PIN_FILE,
    label: 'activation env fallback',
    pattern: /(SQUAD_CLI_VERSION:[^\n']*\|\|\s*')[^']*(')/g,
  },
  {
    file: PIN_FILE,
    label: 'header comment default',
    pattern: /^(#\s+Default is )[0-9][^\s.]*(?:\.[^\s.]+)*(\.\s*)$/gm,
  },
  {
    file: DOCS_FILE,
    label: 'docs default column',
    pattern: /(\|\s*`SQUAD_CLI_VERSION`[^|\n]*\|[^|\n]*\|\s*`)[^`\n]*(`\s*\|)/g,
  },
];

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

const target = (process.env.TARGET_VERSION ?? '').trim();

if (!target) {
  fail('TARGET_VERSION is not set — refusing to guess which version to pin.');
}

// Prereleases reach npm too, but activation is the cold-start path for brand-new
// repositories; pointing it at a prerelease would hand every new user an unproven
// build. `dist-tags.latest` is the stable channel, so the pin tracks stable only.
if (!/^\d+\.\d+\.\d+$/.test(target)) {
  fail(`refusing to pin a non-stable version: "${target}" (expected MAJOR.MINOR.PATCH)`);
}

const sources = new Map();
for (const { file } of SITES) {
  if (!sources.has(file)) sources.set(file, readFileSync(file, 'utf8'));
}

const applied = [];
const dirty = new Set();

for (const { file, label, pattern } of SITES) {
  const before = sources.get(file);
  const matches = [...before.matchAll(pattern)];

  if (matches.length === 0) {
    fail(
      `${file}: could not locate the ${label}. The pin moved or changed shape — ` +
        'update this script. A bumper that stops matching becomes a silent no-op, ' +
        'which is worse than no bumper at all.',
    );
  }
  if (matches.length > 1) {
    fail(
      `${file}: found ${matches.length} copies of the ${label}, expected exactly 1. ` +
        'Ambiguous targets mean one of them will be left stale.',
    );
  }

  const previous = matches[0][0];
  const after = before.replace(pattern, (_full, head, tail) => `${head}${target}${tail}`);

  if (after !== before) {
    applied.push({ file, label, previous: previous.trim() });
    dirty.add(file);
  }
  sources.set(file, after);
}

// Only rewrite files that actually changed. Running this against the version already
// pinned must be a true no-op, because that is how `test/squad-cli-pin.test.ts`
// exercises the patterns on every pull request — executing the real script is the only
// check that proves all three still match, and it must not touch the working tree.
for (const file of dirty) {
  writeFileSync(file, sources.get(file));
}

// Re-read from disk and re-extract, rather than trusting the in-memory replace. The
// failure this guards against is a pattern that matched but captured the wrong span,
// which would write a well-formed file pinned to the wrong thing.
const verified = new Map();
for (const { file, label, pattern } of SITES) {
  if (!verified.has(file)) verified.set(file, readFileSync(file, 'utf8'));
  const found = [...verified.get(file).matchAll(pattern)][0]?.[0] ?? '';
  if (!found.includes(target)) {
    fail(`${file}: the ${label} does not read "${target}" after rewriting: ${found.trim()}`);
  }
}

const changed = applied.length > 0;

if (changed) {
  console.log(`Pinned Squad CLI activation to ${target}:`);
  for (const { file, label } of applied) console.log(`  - ${file} (${label})`);
} else {
  console.log(`Activation pin is already ${target} — nothing to do.`);
}

// The pull-request body is composed here, not in the workflow. It is markdown, so it
// is full of backticks and pipes; building it with shell printf means every one of
// them is a quoting hazard, and suppressing the resulting shellcheck noise risks
// masking a genuine one. Node writes the file; the workflow only passes its path.
if (changed && process.env.PR_BODY_FILE) {
  const rows = applied
    .map(({ file, label, previous }) => `| \`${file}\` | ${label} | \`${previous}\` |`)
    .join('\n');

  writeFileSync(
    process.env.PR_BODY_FILE,
    [
      `Squad CLI \`${target}\` is published, so new-repo activation should install it.`,
      '',
      '| File | Site | Was |',
      '|---|---|---|',
      rows,
      '',
      'Opened automatically by `.github/workflows/squad-npm-publish.yml` (#1825) as part',
      `of the run that published \`${target}\`.`,
      '',
      '> **This pull request has no CI.** GitHub does not fire `pull_request` workflows',
      '> for pull requests opened with `GITHUB_TOKEN`. The rewrite was verified in the',
      '> job that produced it — `scripts/bump-activation-pin.mjs` re-reads every file it',
      '> wrote and fails closed — but the usual checks will not appear below. Close and',
      '> reopen this pull request to run them.',
      '',
      'If this sits unmerged, `.github/workflows/squad-cli-pin-drift.yml` will file a',
      'drift issue for the same version within a day. That is the intended backstop, not',
      'a duplicate report.',
      '',
    ].join('\n'),
  );
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}
