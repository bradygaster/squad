/**
 * actionlint configuration guard
 *
 * `.github/actionlint.yaml` suppresses specific actionlint errors. Every entry
 * narrows the CI gate, so this suite freezes the list: adding a suppression
 * requires editing this file too, which forces the reviewer to see it.
 *
 * Background (#1827). `.github/workflows/squad-workflow-lint.yml` used to skip
 * any workflow whose header marked it DO-NOT-EDIT generated output. The reason
 * was real — actionlint v1.7.12 (still the latest release, so this is not
 * fixable by upgrading) reports errors against gh-aw's emitted YAML for schema
 * gaps rather than genuine defects. But the cure removed the gate: the
 * `*.lock.yml` file is the artifact that actually runs, and it was linted by
 * nothing at all, so a real defect in generated output was indistinguishable
 * from the expected noise.
 *
 * Measured against the pinned actionlint version by compiling the sources and
 * linting the emitted output: 7 errors, every one falling into the three classes
 * enumerated below, and none a genuine defect. Suppressing those by exact
 * message and scoped path takes generated files from unlinted to linted with
 * three known exemptions — the difference between hiding every future error
 * class and hiding exactly the ones that were measured and explained.
 *
 * These exemptions describe *actionlint's* schema, not ours, so they expire
 * when the tool catches up. Re-check them on every actionlint upgrade: an
 * exemption that outlives the gap it documents silently narrows the gate.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const CONFIG_PATH = join(process.cwd(), '.github', 'actionlint.yaml');
const LINT_WORKFLOW_PATH = join(
  process.cwd(),
  '.github',
  'workflows',
  'squad-workflow-lint.yml',
);

/**
 * The complete set of suppressions, keyed by the path glob they are scoped to.
 * Adding an entry here is a deliberate act that widens what CI ignores.
 */
const EXPECTED_IGNORES: Record<string, string[]> = {
  // Style-only shellcheck suggestion on the Actions multiline-output heredoc.
  '**/*.yml': ['SC2129'],
  // gh-aw compiler output: two real Actions features missing from actionlint's schema.
  '**/*.lock.yml': [
    'unknown permission scope "copilot-requests"',
    'unexpected key "queue" for "concurrency" section',
  ],
  // gh-aw code-generator output: an intentional empty `choice` option.
  '**/agentics-maintenance.yml': ['string should not be empty'],
};

interface ActionlintConfig {
  paths?: Record<string, { ignore?: string[] }>;
}

function readConfig(): ActionlintConfig {
  return parse(readFileSync(CONFIG_PATH, 'utf8')) as ActionlintConfig;
}

describe('actionlint config (#1827)', () => {
  it('suppresses exactly the reviewed set of errors', () => {
    const paths = readConfig().paths ?? {};

    // Compared as whole objects so an unreviewed *path* is caught alongside an
    // unreviewed *pattern* — a new glob is just as much a widening as a new entry.
    const actual = Object.fromEntries(
      Object.entries(paths).map(([glob, v]) => [glob, v?.ignore ?? []]),
    );

    expect(actual).toEqual(EXPECTED_IGNORES);
  });

  it('scopes generated-output suppressions to generated files', () => {
    const paths = readConfig().paths ?? {};

    // The two gh-aw exemptions describe compiler output. If either were widened to
    // the repo-wide `**/*.yml` glob, a hand-authored workflow could carry a genuine
    // permissions or concurrency error and still pass.
    const repoWide = paths['**/*.yml']?.ignore ?? [];
    for (const pattern of repoWide) {
      expect(pattern).not.toMatch(/copilot-requests|concurrency|should not be empty/);
    }
  });

  it('documents every suppression with a rationale comment', () => {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const lines = raw.split(/\r?\n/);

    // An undocumented suppression cannot be re-evaluated later, because nothing
    // records what it was working around or when it should expire.
    for (const patterns of Object.values(EXPECTED_IGNORES)) {
      for (const pattern of patterns) {
        const idx = lines.findIndex((l) => l.includes(pattern) && l.trimStart().startsWith('-'));
        expect(idx, `no list entry found for: ${pattern}`).toBeGreaterThan(-1);
        expect(
          lines[idx - 1]?.trimStart().startsWith('#'),
          `suppression is undocumented: ${pattern}`,
        ).toBe(true);
      }
    }
  });

  it('does not reintroduce a wholesale skip of generated workflows', () => {
    const workflow = readFileSync(LINT_WORKFLOW_PATH, 'utf8');

    // The header-grep skip is what the scoped ignores replace. Restoring it would
    // silently return the lock file to being linted by nothing, which is the exact
    // condition #1827 was filed about.
    expect(workflow).not.toMatch(/automatically generated\|DO NOT EDIT/i);
    expect(workflow).toMatch(/actionlint \.github\/workflows\/\*\.yml/);
  });
});
