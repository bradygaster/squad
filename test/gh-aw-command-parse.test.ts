/**
 * Behavioral coverage for the `/squad` command parser in `workflows/squad.md` (#1824).
 *
 * `/squad cast` silently no-opped with a green check whenever the command did not
 * start the issue body. Success and no-op were indistinguishable, on the first-run
 * path for every new user.
 *
 * These tests compare two independent sources: the shell commands *declared* in the
 * Parse Command section of `workflows/squad.md` are extracted from the markdown and
 * then *executed* against real issue bodies. Nothing here re-reads prose to confirm
 * prose. A test asserting only "a command at position 0 parses" would guard the one
 * case that was never broken, so the load-bearing assertions below are the inverse:
 * a body that yields no mode must produce an explicit sentinel and a diagnostic that
 * names the offending text verbatim.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQUAD_WORKFLOW = join(process.cwd(), 'workflows', 'squad.md');
const workflow = readFileSync(SQUAD_WORKFLOW, 'utf8');

/**
 * Resolve a POSIX shell. Checking only `/bin/sh` (as the older gh-aw suites do)
 * silently skips every behavioral case on Windows, and a check that never runs is
 * indistinguishable from a check that always passes. Git ships a POSIX shell on
 * Windows, so fall back to it rather than skipping.
 */
function resolvePosixShell(): string | null {
  if (existsSync('/bin/sh')) return '/bin/sh';
  if (process.platform !== 'win32') return null;
  const roots = [
    process.env['ProgramFiles'] ?? 'C:\\Program Files',
    process.env['ProgramW6432'] ?? 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    join(process.env['LOCALAPPDATA'] ?? 'C:\\', 'Programs'),
  ];
  return roots.map(r => join(r, 'Git', 'bin', 'bash.exe')).find(existsSync) ?? null;
}

const POSIX_SHELL = resolvePosixShell();

/** Pull the first fenced bash block that follows `heading`, dedented. */
function bashBlockAfter(heading: string): string {
  const at = workflow.indexOf(heading);
  expect(at, `"${heading}" is missing from workflows/squad.md`).toBeGreaterThan(-1);

  const rest = workflow.slice(at);
  const fence = /^[ \t]*```bash[ \t]*\r?\n([\s\S]*?)^[ \t]*```/m.exec(rest);
  expect(fence, `no fenced bash block follows "${heading}" in workflows/squad.md`).not.toBeNull();

  return (fence?.[1] ?? '')
    .split('\n')
    .map(line => line.replace(/^[ \t]+/, ''))
    .join('\n')
    .trim();
}

const PC0_HEADING = '### Step PC-0: Normalize a dispatched command';
const PC1_HEADING = '### Step PC-1: Extract the command argument';
const PC3_HEADING = '### Step PC-3: No recognized command';

/** Run a command extracted from the workflow with a value in the environment. */
function runDeclared(command: string, value: string, varName = 'SQUAD_TRIGGER_BODY'): string {
  if (!POSIX_SHELL) throw new Error('no POSIX shell resolved');
  return execFileSync(POSIX_SHELL, ['-c', command], {
    encoding: 'utf8',
    env: { ...process.env, [varName]: value },
  }).replace(/\r/g, '').replace(/\n+$/, '');
}

const parse = (body: string) => runDeclared(bashBlockAfter(PC1_HEADING), body);
const diagnose = (body: string) => runDeclared(bashBlockAfter(PC3_HEADING), body);
const normalize = (command: string) =>
  runDeclared(bashBlockAfter(PC0_HEADING), command, 'SQUAD_DISPATCH_COMMAND');
/** The dispatch path exactly as the workflow runs it: PC-0, then PC-1. */
const parseDispatch = (command: string) => parse(normalize(command));

describe('gh-aw: /squad command parsing (#1824)', () => {
  // A skipped behavioral suite is a permanently-green gate. Fail loudly instead of
  // quietly reporting a pass for assertions that never executed.
  it('resolves a POSIX shell, so the behavioral cases below actually run', () => {
    expect(
      POSIX_SHELL,
      'No POSIX shell found. The parser cases below are behavioral — skipping them ' +
        'would report a green suite for assertions that never ran. Install Git for ' +
        'Windows (provides bash.exe) or run on a POSIX host.'
    ).not.toBeNull();
  });

  describe('Step PC-1 — the command is found anywhere in the body', () => {
    const cases: Array<{ name: string; body: string; expected: string }> = [
      // The regression that was never broken — kept only as a floor.
      { name: 'command at position 0', body: '/squad cast', expected: 'cast' },
      // #1824 proper: the natural shape of a first-run issue.
      {
        name: 'prose, blank line, then the command',
        body: 'Hi team! Excited to try this out.\n\n/squad cast',
        expected: 'cast',
      },
      { name: 'leading blank line', body: '\n/squad cast', expected: 'cast' },
      // Mutation-hardening: the three cases above all survive a *line*-anchored scan
      // (`/^\/squad/`), because awk anchors per record. Only a command that is not the
      // first token on its line distinguishes a body-wide scan from a line-anchored one,
      // so these two cases carry that weight. Do not delete them as redundant.
      {
        name: 'command indented under prose (not line-anchored)',
        body: 'Setting Squad up on this repo.\n\n    /squad cast',
        expected: 'cast',
      },
      {
        name: 'command mid-sentence',
        body: 'When you get a chance please run /squad plan accept implementation phase 2 today',
        expected: 'plan accept implementation phase 2 today',
      },
      { name: 'CRLF body', body: 'Hello\r\n\r\n/squad cast\r\n', expected: 'cast' },
      { name: 'bare /squad after prose', body: 'context first\n\n/squad', expected: '' },
      // Two tokens on one line. A greedy `sub(/^.*\/squad/,"")` strips through the
      // LAST token and resolves these to `status` / `implement` — a different mode
      // than the user asked for, silently. First-token-wins is the declared
      // contract, so extraction stays anchored to match()'s RSTART/RLENGTH.
      // Both positions are kept: `(^|[[:space:]])` matches empty at position 0 and
      // a real space mid-line, so RLENGTH differs by one between them.
      {
        name: 'two commands on one line, first mid-line — the first wins',
        body: 'Please /squad cast, then /squad status',
        expected: 'cast, then /squad status',
      },
      {
        name: 'two commands on one line, first at position 0 — the first wins',
        body: '/squad research and later /squad implement',
        expected: 'research and later /squad implement',
      },
      // The no-op cases — these are the ones that matter.
      { name: 'no command anywhere', body: 'We should improve the docs.', expected: 'NO_COMMAND' },
      { name: 'empty body', body: '', expected: 'NO_COMMAND' },
    ];

    it.each(cases)('$name', ({ body, expected }) => {
      // Name the offending input in the failure message. A bare `toBe` reports the
      // values but not which fixture produced them, and a diagnostic that omits the
      // input is the same non-signal #1824 was filed about.
      expect(
        parse(body),
        `PC-1 must extract ${JSON.stringify(expected)} from ${JSON.stringify(body)}.`
      ).toBe(expected);
    });
  });

  describe('the workflow_dispatch relay path carries a bare command (PC-0)', () => {
    // The absent assertion that let a working path break. `workflow_dispatch`
    // delivers a BARE token: squad-implement-worker.md dispatches
    // {"command": "implement"}, and squad.md's own input schema documents
    // `cast`, `implement`, `connect org/repo`. None carry a `/squad` prefix, so
    // PC-1 alone returns NO_COMMAND and PC-3 hard-fails a run that worked before.
    const dispatched = [
      'implement', // squad-implement-worker.md relay, and the schema's examples
      'research',
      'cast',
      'status',
      'connect org/repo',
      'plan accept implementation phase 2',
    ];

    it.each(dispatched)('dispatching %j reaches its mode instead of failing the run', cmd => {
      expect(
        parseDispatch(cmd),
        `A workflow_dispatch of ${JSON.stringify(cmd)} must resolve to that command. ` +
          'Both manual dispatch and the squad-implement-worker relay send a bare ' +
          'token; NO_COMMAND here routes a structurally valid run into PC-3 and ' +
          'hard-fails it — a regression on the autonomous relay.'
      ).toBe(cmd);
    });

    it('normalization is idempotent for a human-typed slash prefix', () => {
      // Someone typing `/squad implement` into the Actions dispatch box must not
      // be punished with a doubled prefix that then matches no mode.
      expect(normalize('/squad implement')).toBe('/squad implement');
      expect(parseDispatch('/squad implement')).toBe('implement');
    });

    it('trims whitespace around the dispatched input', () => {
      expect(parseDispatch('  implement  ')).toBe('implement');
    });

    it('an empty dispatch halts via the activation guard, never via PC-3', () => {
      // PR #1777 / junk issues #12 and #14: the empty activation probe must stay
      // silent and side-effect free. Routing it to PC-3 would post a comment and
      // fail the run — the exact side effect the activation guard exists to stop.
      expect(
        normalize(''),
        'An empty dispatch must yield EMPTY_DISPATCH so it routes to the activation ' +
          'guard halt, not to PC-3.'
      ).toBe('EMPTY_DISPATCH');
      expect(normalize('')).not.toBe('NO_COMMAND');
    });

    it('PC-1 is NOT loosened — a bare token still fails on the comment path', () => {
      // The tempting wrong fix is to teach PC-1 to accept bare words. That reopens
      // #1824: prose merely containing "cast" would silently mint a team. The
      // asymmetry is deliberate — dispatch is schema-guaranteed a command, a
      // comment is not, so absence stays an error there.
      for (const bare of ['implement', 'cast', 'please cast the team']) {
        expect(
          parse(bare),
          `PC-1 must still reject ${JSON.stringify(bare)}, which carries no /squad ` +
            'token. Loosening PC-1 instead of normalizing in PC-0 reopens #1824 on ' +
            'the issue-body and comment paths.'
        ).toBe('NO_COMMAND');
      }
    });
  });

  describe('a run that matched no command must be loud, not silent', () => {
    it('an invocation that looks real but does not parse yields NO_COMMAND and a diagnostic naming it', () => {
      // Wrong case: unmistakably an attempted invocation, not a parseable one.
      const body = 'Hello team\n\n/Squad cast\n';

      expect(
        parse(body),
        'A body with no parseable command must produce the NO_COMMAND sentinel so the ' +
          'router can fail. Anything else lets the run proceed and finish green.'
      ).toBe('NO_COMMAND');

      const diagnostic = diagnose(body);

      // Mutation guard: a generic "unrecognized command" message passes a status-only
      // assertion while telling the user nothing. Require the offending text itself.
      expect(
        diagnostic,
        'The failure diagnostic must quote the text it actually saw. A message that ' +
          'omits the offending input leaves the user with the same non-signal #1824 ' +
          'was filed about.'
      ).toContain('/Squad cast');
      expect(diagnostic, 'the diagnostic must locate the text it saw').toMatch(/^3:/m);
      expect(diagnostic).not.toBe('NO_SQUAD_TEXT_IN_BODY');
    });

    it('a glued invocation is reported verbatim rather than ignored', () => {
      const body = 'Please /squadcast the team';
      expect(parse(body)).toBe('NO_COMMAND');
      expect(diagnose(body)).toContain('/squadcast');
    });

    it('a body with no /squad text still reports an explicit sentinel, never silence', () => {
      const body = 'We should improve the docs.';
      expect(parse(body)).toBe('NO_COMMAND');
      expect(diagnose(body)).toBe('NO_SQUAD_TEXT_IN_BODY');
    });
  });

  describe('Step PC-2 routes NO_COMMAND to failure, not to cast', () => {
    const pc2 = workflow.slice(
      workflow.indexOf('### Step PC-2:'),
      workflow.indexOf(PC3_HEADING)
    );

    it('sends NO_COMMAND to PC-3 and forbids the cast fallback', () => {
      expect(pc2, 'PC-2 must be present').not.toBe('');
      const noCommandRule = pc2.slice(pc2.indexOf('NO_COMMAND'));
      expect(noCommandRule).toContain('Step PC-3');
      expect(
        /do \*\*not\*\* fall back to `cast`/i.test(noCommandRule),
        'PC-2 must explicitly forbid defaulting to cast when no command parsed — that ' +
          'fallback is what made a typo indistinguishable from a real cast.'
      ).toBe(true);
    });

    it('PC-3 fails the run instead of reporting success', () => {
      const pc3 = workflow.slice(workflow.indexOf(PC3_HEADING));
      expect(pc3).toContain('::error::');
      expect(pc3, 'PC-3 must fail the run').toMatch(/exit non-zero/i);
      expect(pc3, 'PC-3 must not fall back to noop, which reports no comment').toMatch(
        /Never call `noop`/i
      );
    });
  });
});
