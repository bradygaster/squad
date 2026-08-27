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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSIX_SHELL } from './posix-shell';

const SQUAD_WORKFLOW = join(process.cwd(), 'workflows', 'squad.md');
const workflow = readFileSync(SQUAD_WORKFLOW, 'utf8');

/**
 * POSIX-shell resolution lives in `./posix-shell` so the gh-aw suites share one
 * implementation. It used to live here, and `gh-aw-quality.test.ts` grew its own
 * `/bin/sh`-only variant that silently skipped 13 tests on Windows (#1833).
 */

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
const AG1_HEADING = '### Step AG-1: Classify the parsed mode';
const AG2_HEADING = '### Step AG-2: Resolve actor permission';
const AG3_HEADING = '### Step AG-3: Decide authorization';
const AG4_HEADING = '### Step AG-4: Refuse unauthorized mutation loudly';

/** Run a command extracted from the workflow with real environment values. */
function runDeclaredEnv(command: string, env: Record<string, string>): string {
  if (!POSIX_SHELL) throw new Error('no POSIX shell resolved');
  return execFileSync(POSIX_SHELL, ['-c', command], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  }).replace(/\r/g, '').replace(/\n+$/, '');
}

/** Run a command extracted from the workflow with one value in the environment. */
function runDeclared(command: string, value: string, varName = 'SQUAD_TRIGGER_BODY'): string {
  return runDeclaredEnv(command, { [varName]: value });
}

const parse = (body: string) => runDeclared(bashBlockAfter(PC1_HEADING), body);
const diagnose = (body: string) => runDeclared(bashBlockAfter(PC3_HEADING), body);
const normalize = (command: string) =>
  runDeclared(bashBlockAfter(PC0_HEADING), command, 'SQUAD_DISPATCH_COMMAND');
const classifyMode = (mode: string) => runDeclared(bashBlockAfter(AG1_HEADING), mode, 'SQUAD_PARSED_MODE');
const decideAuthorization = (modeClass: string, permission: string) =>
  runDeclaredEnv(bashBlockAfter(AG3_HEADING), {
    SQUAD_MODE_AUTH_CLASS: modeClass,
    SQUAD_ACTOR_PERMISSION: permission,
  });
const resolveActorPermission = (
  eventName: string,
  actor = '',
  repository = ''
) =>
  runDeclaredEnv(bashBlockAfter(AG2_HEADING), {
    SQUAD_EVENT_NAME: eventName,
    SQUAD_TRIGGER_ACTOR: actor,
    SQUAD_REPOSITORY: repository,
  });
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
      'activate',
      'activate phase 2',
      'cast',
      'status',
      'connect org/repo',
      'plan accept implementation phase 2',
      'plan accept',
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

    // #1835: PC-0 anchored on NR==1, so a value whose first character is a
    // newline put an EMPTY string on the scanned record and a structurally
    // valid command halted silently. Silent-loss-of-a-valid-command is the
    // defect class #1824 and #1832 exist to close, so it is closed here too.
    describe('leading blank lines are skipped, not read as an empty command (#1835)', () => {
      const leading: Array<{ input: string; expected: string }> = [
        { input: '\nimplement', expected: 'implement' },
        { input: '\n\n\ncast', expected: 'cast' },
        { input: '\n  connect org/repo  ', expected: 'connect org/repo' },
        { input: '\n/squad status', expected: 'status' },
      ];

      it.each(leading)('dispatching $input reaches its mode', ({ input, expected }) => {
        expect(
          normalize(input),
          `PC-0 must skip leading blank lines and normalize ${JSON.stringify(input)} ` +
            `to "/squad ${expected}". Scanning only record 1 reads the leading newline ` +
            'as an empty command and emits EMPTY_DISPATCH, halting a valid dispatch ' +
            'silently via the activation guard.'
        ).toBe(`/squad ${expected}`);

        expect(
          parseDispatch(input),
          `The full dispatch path (PC-0 then PC-1) must resolve ${JSON.stringify(input)} ` +
            `to ${JSON.stringify(expected)}.`
        ).toBe(expected);
      });

      it.each(['', '   ', '\n', '\n\n', ' \n \t \n '])(
        'genuinely empty input %j still yields EMPTY_DISPATCH',
        blank => {
          // The fix must not overshoot: whitespace-only input carries no command,
          // so it must still reach the silent activation-guard halt rather than
          // being normalized into a bogus "/squad " with an empty argument.
          expect(
            normalize(blank),
            `${JSON.stringify(blank)} carries no command, so PC-0 must still yield ` +
              'EMPTY_DISPATCH for the silent activation-guard halt (PR #1777).'
          ).toBe('EMPTY_DISPATCH');
        }
      );
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

  describe('Actor Authorization Guard (#1730)', () => {
    const ag1 = workflow.slice(workflow.indexOf(AG1_HEADING), workflow.indexOf(AG2_HEADING));
    const ag2 = workflow.slice(workflow.indexOf(AG2_HEADING), workflow.indexOf(AG3_HEADING));
    const ag4 = workflow.slice(workflow.indexOf(AG4_HEADING), workflow.indexOf('## Execute Mode'));

    it.each([
      'implement',
      'cast',
      'connect',
      'adopt',
      'cast-member',
      'retire',
      'plan revise',
      'triage',
      'triage revise',
      'plan program',
      'plan program revise',
      'plan implementation',
      'plan validate',
      'activate',
      'plan accept',
      'plan accept scope',
      'plan accept implementation',
      'plan activate',
    ])(
      'classifies mutating mode %j as requiring authorization',
      mode => {
        expect(
          classifyMode(mode),
          `${JSON.stringify(mode)} must require authorization before the router mutates state or dispatches work.`
        ).toBe('AUTH_REQUIRED');
      }
    );

    it.each(['research', 'status', 'review', 'plan'])(
      'classifies open mode %j as bypassing authorization',
      mode => {
        expect(
          classifyMode(mode),
          `${JSON.stringify(mode)} must stay on the explicit read-only allow-list so its UX stays open.`
        ).toBe('READ_ONLY');
      }
    );

    it.each(['NO_COMMAND', 'unknown', 'plan accepted?', ''])(
      'does not silently classify malformed mode %j as read-only',
      mode => {
        expect(
          classifyMode(mode),
          `${JSON.stringify(mode)} must not bypass the guard by landing on the read-only branch.`
        ).toBe('AUTH_REQUIRED');
      }
    );

    it.each(['DISPATCH_AUTHORIZED', 'admin', 'maintain', 'write'])(
      'permits mutating modes for repository permission %j',
      permission => {
        expect(
          decideAuthorization('AUTH_REQUIRED', permission),
          `${JSON.stringify(permission)} must authorize a mutating /squad mode.`
        ).toBe('AUTHORIZED');
      }
    );

    it.each(['read', 'triage', 'none', '', 'PERMISSION_UNRESOLVED'])(
      'refuses mutating modes for repository permission %j',
      permission => {
        expect(
          decideAuthorization('AUTH_REQUIRED', permission),
          `${JSON.stringify(permission)} must fail closed for a mutating /squad mode.`
        ).toBe('REFUSE');
      }
    );

    it('skips the permission branch entirely for read-only modes', () => {
      expect(decideAuthorization('READ_ONLY', 'none')).toBe('AUTH_SKIPPED');
      expect(ag1).toContain('skip the permission lookup entirely');
      expect(ag2).toContain('When **Step AG-1** returned `AUTH_REQUIRED`');
    });

    it('uses GitHub workflow_dispatch authorization for controlled relays', () => {
      expect(resolveActorPermission('workflow_dispatch')).toBe('DISPATCH_AUTHORIZED');
      expect(ag2).toContain('GitHub requires write access to trigger `workflow_dispatch`');
      expect(ag2).toContain('Only the exact `workflow_dispatch` event');
    });

    it('fails closed when non-dispatch actor identity cannot be resolved', () => {
      expect(resolveActorPermission('issue_comment')).toBe('PERMISSION_UNRESOLVED');
    });

    it('uses the collaborator-permission API and routes refusals to an actionable comment', () => {
      expect(ag2).toContain('collaborators/$actor/permission');
      expect(ag2).toContain("jq -r '.permission // empty'");
      expect(ag2).toContain('PERMISSION_UNRESOLVED');
      expect(ag4).toContain('add-comment');
      expect(ag4).toContain('::error::');
      expect(ag4).toContain('Ask a repository maintainer');
      expect(ag4).toContain('admin');
      expect(ag4).toContain('maintain');
      expect(ag4).toContain('write');
    });

    it('keeps activate phase variants behind authorization', () => {
      expect(ag1).toContain('Anything outside the allow-list');
      expect(classifyMode('activate')).toBe('AUTH_REQUIRED');
      expect(workflow).toContain('`activate phase {N}` → `activate`');
    });
  });

  describe('/squad activate fast-path alias', () => {
    const pc2 = workflow.slice(
      workflow.indexOf('### Step PC-2:'),
      workflow.indexOf(PC3_HEADING)
    );

    it.each([
      ['activate', 'activate'],
      ['activate phase 2', 'activate phase 2'],
      ['plan accept', 'plan accept'],
    ])('extracts %j without changing the command arguments', (command, expected) => {
      expect(parse(`/squad ${command}`)).toBe(expected);
      expect(parseDispatch(command)).toBe(expected);
    });

    it('routes the alias as its own one-token mode after longer plan commands', () => {
      const twoTokenModes = pc2.indexOf('`plan implementation` (2)');
      const activateMode = pc2.indexOf('`activate` (1)');
      expect(twoTokenModes).toBeGreaterThan(-1);
      expect(activateMode).toBeGreaterThan(twoTokenModes);
    });
  });
});
