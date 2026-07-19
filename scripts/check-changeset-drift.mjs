#!/usr/bin/env node

/**
 * Changeset Drift Check — fails CI when unreleased changesets accumulate.
 *
 * The .changeset/ workflow only works if fragments are consumed by a release
 * (`changeset version`) at a reasonable cadence. Issue #1273 documented the
 * failure mode: 104 fragments piled up while the root CHANGELOG sat a full
 * minor version behind, and nothing in CI noticed.
 *
 * Thresholds are deliberately loose — this is a smoke alarm for "the release
 * flow stopped consuming fragments", not a nag on active development.
 *
 * Modes:
 *   --mode=warn  (default) emit a workflow warning, exit 0
 *   --mode=fail  emit an error annotation, exit 1
 *
 * Issue: bradygaster/squad#1273
 */

import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_FRAGMENTS = 25;
export const MAX_AGE_DAYS = 30;

/**
 * List pending changeset fragments (markdown files that `changeset version`
 * would consume). README.md and non-.md files (config.json) are not fragments.
 */
export function listFragments(changesetDir) {
  if (!existsSync(changesetDir)) return [];
  return readdirSync(changesetDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort();
}

/**
 * Age in days of a fragment, measured from the commit that added it.
 * Untracked or unresolvable files count as age 0 (they can't be stale).
 */
export function fragmentAgeDays(repoRoot, fragment, nowMs = Date.now()) {
  try {
    const out = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--format=%ct', '-1', '--', join('.changeset', fragment)],
      { cwd: repoRoot, encoding: 'utf8' },
    ).trim();
    if (!out) return 0;
    const addedMs = Number(out) * 1000;
    if (!Number.isFinite(addedMs) || addedMs <= 0) return 0;
    return Math.max(0, (nowMs - addedMs) / 86_400_000);
  } catch {
    return 0;
  }
}

/**
 * Pure threshold logic — drifted when the pending count exceeds maxFragments
 * OR the oldest pending fragment exceeds maxAgeDays.
 */
export function evaluateDrift({ count, oldestAgeDays, maxFragments = MAX_FRAGMENTS, maxAgeDays = MAX_AGE_DAYS }) {
  const reasons = [];
  if (count > maxFragments) {
    reasons.push(`${count} unreleased changeset fragments (threshold: ${maxFragments})`);
  }
  if (oldestAgeDays > maxAgeDays) {
    reasons.push(`oldest fragment is ${Math.floor(oldestAgeDays)} days old (threshold: ${maxAgeDays})`);
  }
  return { drifted: reasons.length > 0, reasons };
}

function main() {
  const mode = process.argv.includes('--mode=fail') ? 'fail' : 'warn';
  const repoRoot = process.cwd();
  const fragments = listFragments(join(repoRoot, '.changeset'));

  let oldestAgeDays = 0;
  let oldestName = '';
  for (const fragment of fragments) {
    const age = fragmentAgeDays(repoRoot, fragment);
    if (age > oldestAgeDays) {
      oldestAgeDays = age;
      oldestName = fragment;
    }
  }

  const { drifted, reasons } = evaluateDrift({ count: fragments.length, oldestAgeDays });

  console.log(`Pending changeset fragments: ${fragments.length} (thresholds: >${MAX_FRAGMENTS} count, >${MAX_AGE_DAYS} days age)`);
  if (oldestName) {
    console.log(`Oldest: ${oldestName} (${Math.floor(oldestAgeDays)} days)`);
  }

  if (!drifted) {
    console.log('✅ No changeset drift');
    return;
  }

  const detail = `${reasons.join('; ')}. Run the release flow (changeset version) or consolidate — see #1273.`;
  if (mode === 'fail') {
    console.log(`::error::Changeset drift: ${detail}`);
    process.exitCode = 1;
  } else {
    console.log(`::warning::Changeset drift: ${detail}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
