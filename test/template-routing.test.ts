/**
 * Template routing regression test (iter-5).
 *
 * Prior to iter-5, TEMPLATE_MANIFEST entries for ~20 generic template docs
 * (charter.md, history.md, roster.md, scribe-charter.md, ...) had
 * `destination: '<basename>.md'` — flat to `.squad/`. On every `squad upgrade`,
 * the upgrade loop would dump that pile of reference docs into the `.squad/`
 * root, cluttering it and confusing users (visible in
 * `.squad/files/validation/REVAL-ITER4-multiplayer-sudoku.md`).
 *
 * This test pins the routing: every `.md` template (except those that target
 * `.github/` or `.copilot/` via the `..` parent prefix) must land under either
 * `templates/`, `agents/`, `identity/`, or another nested subdirectory — never
 * directly at `.squad/` root.
 */

import { describe, it, expect } from 'vitest';
import { TEMPLATE_MANIFEST } from '../packages/squad-cli/src/cli/core/templates.js';

describe('TEMPLATE_MANIFEST routing (iter-5: no doc dumping into .squad/ root)', () => {
  it('no plain .md template lands at the .squad/ root', () => {
    const offenders: { source: string; destination: string }[] = [];

    for (const entry of TEMPLATE_MANIFEST) {
      // skip files routed outside .squad/ (../.github, ../.copilot)
      if (entry.destination.startsWith('..')) continue;
      // only check markdown templates here
      if (!entry.destination.endsWith('.md')) continue;
      // user-owned bootstrap files (overwriteOnUpgrade: false) legitimately
      // live at the root — they are real runtime files, not template docs.
      if (!entry.overwriteOnUpgrade) continue;
      // anything still at the root after the above is a flat-doc offender
      if (!entry.destination.includes('/')) {
        offenders.push({ source: entry.source, destination: entry.destination });
      }
    }

    expect(
      offenders,
      `${offenders.length} template .md(s) are still flat-routed to .squad/ root: ` +
        JSON.stringify(offenders, null, 2),
    ).toEqual([]);
  });

  it('generic doc templates are routed to .squad/templates/', () => {
    const expected: Record<string, string> = {
      'charter.md': 'templates/charter.md',
      'history.md': 'templates/history.md',
      'roster.md': 'templates/roster.md',
      'run-output.md': 'templates/run-output.md',
      'mcp-config.md': 'templates/mcp-config.md',
      'orchestration-log.md': 'templates/orchestration-log.md',
      'multi-agent-format.md': 'templates/multi-agent-format.md',
      'plugin-marketplace.md': 'templates/plugin-marketplace.md',
      'raw-agent-output.md': 'templates/raw-agent-output.md',
      'constraint-tracking.md': 'templates/constraint-tracking.md',
      'copilot-instructions.md': 'templates/copilot-instructions.md',
      'skill.md': 'templates/skill.md',
      'issue-lifecycle.md': 'templates/issue-lifecycle.md',
      'scribe-charter.md': 'templates/scribe-charter.md',
      'Rai-charter.md': 'templates/Rai-charter.md',
      'fact-checker-charter.md': 'templates/fact-checker-charter.md',
      'rai-policy.md': 'templates/rai-policy.md',
    };

    for (const [source, dest] of Object.entries(expected)) {
      const entry = TEMPLATE_MANIFEST.find(e => e.source === source);
      expect(entry, `manifest is missing entry for source="${source}"`).toBeDefined();
      expect(entry!.destination, `source="${source}" should route to "${dest}"`).toBe(dest);
    }
  });

  it('casting JSON files remain flat at .squad/ root (runtime contract)', () => {
    // The SDK and many agent skills read these via the flat path; moving them
    // would silently break runtime. This pin documents the intentional carve-out.
    const flatJsonExpected = [
      'casting-history.json',
      'casting-policy.json',
      'casting-registry.json',
    ];
    for (const name of flatJsonExpected) {
      const entry = TEMPLATE_MANIFEST.find(e => e.source === name);
      expect(entry, `manifest missing casting entry "${name}"`).toBeDefined();
      expect(entry!.destination).toBe(name);
    }
  });
});
