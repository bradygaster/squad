import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  classifySquadCommand,
  commandRequiresAuthorization,
  enforceSquadCommandContract,
  isAuthorizedPermission,
  rejectionComment,
} from '../workflows/shared/squad-command-contract.mjs';

const WORKFLOW = readFileSync(join(process.cwd(), 'workflows', 'squad.md'), 'utf8');
const DISCOVERY_WORKFLOW = readFileSync(
  join(process.cwd(), 'workflows', 'squad-command-router.md'),
  'utf8',
);
const TEST_ROOT = join(process.cwd(), '.test-workspaces');

const issue = (body: string) => ({
  issue: { number: 1824, body },
  repository: { full_name: 'bradygaster/squad' },
});
const comment = (body: string) => ({
  issue: { number: 1824, body: 'ordinary issue body' },
  comment: { body },
  repository: { full_name: 'bradygaster/squad' },
});
const dispatch = (command: string) => ({
  inputs: { command, issue_number: '1824' },
  repository: { full_name: 'bradygaster/squad' },
});

describe('gh-aw: shared /squad command contract (#1824)', () => {
  describe.each([
    ['issue body', issue],
    ['issue or pull request comment', comment],
  ])('%s call site', (_name, payload) => {
    it.each([
      ['/squad cast', 'cast', null],
      [' /squad cast ', 'cast', null],
      ['  /squad cast  ', 'cast', null],
      ['   /squad cast   ', 'cast', null],
      ['Context first.\n\n/squad status   ', 'status', null],
      ['/squad research Focus only on proposal P1', 'research', null],
      ['/squad activate phase 2', 'activate', 2],
      ['/squad plan accept implementation phase 12', 'plan accept implementation', 12],
      ['/squad connect owner/repo', 'connect', null],
      ['/squad cast-member runtime engineer', 'cast-member', null],
      ['/squad plan revise Keep the first milestone small', 'plan revise', null],
      ['/squad', 'cast', null],
    ])('accepts valid placement and whitespace: %j', (body, mode, phase) => {
      expect(classifySquadCommand(payload(body), 'issues')).toMatchObject({
        status: 'accepted',
        mode,
        phase,
      });
    });

    it.each([
      ['/squad dance', 'Unknown command or malformed arguments.'],
      ['/squad status now', 'Unknown command or malformed arguments.'],
      ['/squad connect', 'Unknown command or malformed arguments.'],
      ['/squad activate phase zero', 'Unknown command or malformed arguments.'],
      ['/squad activate phase 0', 'Unknown command or malformed arguments.'],
      ['/squad plan accept scope phase 2', 'Unknown command or malformed arguments.'],
      ['/squadcast', 'Malformed /squad prefix.'],
      ['/Squad cast', 'Malformed /squad prefix.'],
      ['/squad connect owner repo', 'Unknown command or malformed arguments.'],
    ])('classifies unknown and malformed input: %j', (body, expected) => {
      const result = classifySquadCommand(payload(body), 'issues');
      expect(result).toMatchObject({
        status: 'rejected',
        rejectedCommand: body.trim(),
        reason: expected,
      });
    });

    it.each(['', 'No automation requested.', 'The word squad is not a command.'])(
      'leaves no-invocation body as an ordinary non-event: %j',
      body => {
        expect(classifySquadCommand(payload(body), 'issues')).toEqual({
          status: 'none',
          source: _name === 'issue body' ? 'issue' : 'comment',
        });
      },
    );

    it.each([
      ['Please run /squad plan implementation', 'embedded prose'],
      ['Use `/squad cast` after review.', 'inline code'],
      ['```text\n/squad cast\n```', 'fenced code'],
      ['~~~text\n/squad cast\n~~~', 'tilde-fenced code'],
      ['````text\n```\n/squad cast\n````', 'code after a shorter backtick fence'],
      ['~~~~text\n~~~\n/squad cast\n~~~~', 'code after a shorter tilde fence'],
      ['````text\n~~~~\n/squad cast\n````', 'code after a different fence delimiter'],
      ['````text\n```` trailing-info\n/squad cast\n````', 'code after a fence with trailing info'],
      ['    /squad cast', 'four-space-indented code'],
      ['\t/squad cast', 'tab-indented code'],
      [' \t/squad cast', 'one-space-plus-tab-indented code'],
      ['  \t/squad cast', 'two-spaces-plus-tab-indented code'],
      ['   \t/squad cast', 'three-spaces-plus-tab-indented code'],
    ])('ignores %s instead of activating control-plane work', (body) => {
      expect(classifySquadCommand(payload(body), 'issues')).toEqual({
        status: 'none',
        source: _name === 'issue body' ? 'issue' : 'comment',
      });
    });
  });

  describe('workflow_dispatch call site', () => {
    it.each([
      ['implement', 'implement', null],
      ['  implement  ', 'implement', null],
      ['\n\n/squad status\n', 'status', null],
      ['activate phase 3', 'activate', 3],
      ['research Focus only on P1', 'research', null],
    ])('accepts bare or slash-prefixed dispatch %j', (command, mode, phase) => {
      expect(classifySquadCommand(dispatch(command), 'workflow_dispatch')).toMatchObject({
        status: 'accepted',
        source: 'workflow_dispatch',
        mode,
        phase,
      });
    });

    it.each(['', ' ', '\n\n'])('keeps empty activation probe non-eventful: %j', command => {
      expect(classifySquadCommand(dispatch(command), 'workflow_dispatch')).toEqual({
        status: 'none',
        source: 'workflow_dispatch',
      });
    });

    it.each(['unknown', '/squad status extra', '/squadconnect owner/repo'])(
      'rejects malformed dispatch %j',
      command => {
        expect(classifySquadCommand(dispatch(command), 'workflow_dispatch')).toMatchObject({
          status: 'rejected',
          source: 'workflow_dispatch',
          rejectedCommand: command,
        });
      },
    );
  });

  it('posts the rejected command and throws so the safe-output job fails', async () => {
    const posted: Array<{ issueNumber: number; body: string }> = [];
    await expect(
      enforceSquadCommandContract({
        payload: comment('/squad status extra'),
        eventName: 'issue_comment',
        createComment: async (issueNumber, body) => {
          posted.push({ issueNumber, body });
        },
      }),
    ).rejects.toThrow('Squad rejected command: /squad status extra');

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ issueNumber: 1824 });
    expect(posted[0].body).toContain('```text\n/squad status extra\n```');
    expect(posted[0].body).toContain('Unknown command or malformed arguments.');
    expect(posted[0].body).toContain('The workflow stopped without running a Squad mode.');
  });

  it('does not comment or throw for valid commands and no-invocation non-events', async () => {
    const posted: string[] = [];
    const createComment = async (_issueNumber: number, body: string) => {
      posted.push(body);
    };
    await expect(
      enforceSquadCommandContract({
        payload: comment('/squad status'),
        eventName: 'issue_comment',
        createComment,
      }),
    ).resolves.toMatchObject({ status: 'accepted', mode: 'status' });
    await expect(
      enforceSquadCommandContract({
        payload: comment('ordinary discussion'),
        eventName: 'issue_comment',
        createComment,
      }),
    ).resolves.toEqual({ status: 'none', source: 'comment' });
    expect(posted).toEqual([]);
  });

  it('keeps diagnostic formatting in the shared module', () => {
    const result = classifySquadCommand(comment('/squad nope'), 'issue_comment');
    expect(result.status).toBe('rejected');
    expect(rejectionComment(result as Extract<typeof result, { status: 'rejected' }>)).toContain(
      '/squad nope',
    );
  });

  it('wires both the pre-agent context and safe-output failure to the same committed module', () => {
    expect(WORKFLOW).toContain('slash_command:');
    expect(WORKFLOW).toContain('shared/squad-command-contract.mjs');
    expect(WORKFLOW).toContain('Materialize deterministic Squad command context');
    expect(WORKFLOW).toContain('Reject unknown or malformed Squad commands');
    expect(WORKFLOW.match(/squad-command-contract\.mjs/g)).toHaveLength(4);
    expect(WORKFLOW).toContain('enforceSquadCommandContract');
    expect(WORKFLOW).toContain('squad-command-context.json');
    expect(WORKFLOW).not.toContain('### Step PC-1: Extract the command argument');
  });

  it('routes commands outside gh-aw start-only activation through the same contract', () => {
    expect(DISCOVERY_WORKFLOW).toContain("contains(github.event.issue.body, '/squad')");
    expect(DISCOVERY_WORKFLOW).toContain("contains(github.event.comment.body, '/squad')");
    expect(DISCOVERY_WORKFLOW).toContain("startsWith(github.event.issue.body, '/squad ')");
    expect(DISCOVERY_WORKFLOW).toContain("startsWith(github.event.comment.body, '/squad ')");
    expect(DISCOVERY_WORKFLOW).toContain('squad-command-contract.mjs');
    expect(DISCOVERY_WORKFLOW).toContain('classifySquadCommand');
    expect(DISCOVERY_WORKFLOW).toContain('commandRequiresAuthorization');
    expect(DISCOVERY_WORKFLOW).toContain('getCollaboratorPermissionLevel');
    expect(DISCOVERY_WORKFLOW).toContain('isAuthorizedPermission');
    expect(DISCOVERY_WORKFLOW).toContain('No standalone Squad command was found');
    expect(DISCOVERY_WORKFLOW).toContain('rejectionComment');
    expect(DISCOVERY_WORKFLOW).toContain('github.rest.issues.createComment');
    expect(DISCOVERY_WORKFLOW).toContain('core.setFailed(`Squad rejected command:');
    expect(DISCOVERY_WORKFLOW).toContain('github.rest.actions.createWorkflowDispatch');
    expect(DISCOVERY_WORKFLOW).toContain("workflow_id: 'squad.lock.yml'");
    expect(DISCOVERY_WORKFLOW).toContain("command: result.argumentText || 'cast'");
  });

  it('keeps open modes public and fails mutating modes closed on collaborator permission', () => {
    for (const mode of ['status', 'review', 'research', 'plan', 'revoke-improvement']) {
      expect(commandRequiresAuthorization({ status: 'accepted', mode })).toBe(false);
    }
    for (const mode of ['cast', 'triage', 'plan implementation', 'implement']) {
      expect(commandRequiresAuthorization({ status: 'accepted', mode })).toBe(true);
    }
    expect(isAuthorizedPermission('admin')).toBe(true);
    expect(isAuthorizedPermission('maintain')).toBe(true);
    expect(isAuthorizedPermission('write')).toBe(true);
    expect(isAuthorizedPermission('triage')).toBe(false);
    expect(isAuthorizedPermission('read')).toBe(false);
    expect(isAuthorizedPermission('unresolved')).toBe(false);
  });

  it('realistic source mutation is caught by the accepted-command fixtures', async () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    const root = mkdtempSync(join(TEST_ROOT, 'command-contract-mutant-'));
    try {
      const source = join(process.cwd(), 'workflows', 'shared', 'squad-command-contract.mjs');
      const mutant = join(root, 'squad-command-contract-mutant.mjs');
      cpSync(source, mutant);
      const original = readFileSync(mutant, 'utf8');
      const changed = original.replace("  ['status', 'status'],\n", '');
      expect(changed).not.toBe(original);
      writeFileSync(mutant, changed);
      const module = await import(`${pathToFileURL(mutant).href}?mutation=${Date.now()}`);
      expect(module.classifySquadCommand(comment('/squad status'), 'issue_comment')).toMatchObject({
        status: 'rejected',
        rejectedCommand: '/squad status',
      });
      expect(classifySquadCommand(comment('/squad status'), 'issue_comment')).toMatchObject({
        status: 'accepted',
        mode: 'status',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('realistic fence-length mutation exposes a hidden command and is caught', async () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    const root = mkdtempSync(join(TEST_ROOT, 'command-fence-mutant-'));
    try {
      const source = join(process.cwd(), 'workflows', 'shared', 'squad-command-contract.mjs');
      const mutant = join(root, 'squad-command-contract-mutant.mjs');
      cpSync(source, mutant);
      const original = readFileSync(mutant, 'utf8');
      const changed = original.replace(
        '        && closingFence[1].length >= fence.length) {',
        '        ) {',
      );
      expect(changed).not.toBe(original);
      writeFileSync(mutant, changed);
      const module = await import(`${pathToFileURL(mutant).href}?mutation=${Date.now()}`);
      const hidden = comment('````text\n```\n/squad cast\n````');
      expect(module.classifySquadCommand(hidden, 'issue_comment')).toMatchObject({
        status: 'accepted',
        mode: 'cast',
      });
      expect(classifySquadCommand(hidden, 'issue_comment')).toEqual({
        status: 'none',
        source: 'comment',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('realistic CommonMark tab-indentation mutation exposes hidden commands and is caught', async () => {
    mkdirSync(TEST_ROOT, { recursive: true });
    const root = mkdtempSync(join(TEST_ROOT, 'command-indent-mutant-'));
    try {
      const source = join(process.cwd(), 'workflows', 'shared', 'squad-command-contract.mjs');
      const mutant = join(root, 'squad-command-contract-mutant.mjs');
      cpSync(source, mutant);
      const original = readFileSync(mutant, 'utf8');
      const changed = original.replace(
        '/^(?: {4}| {0,3}\\t)/',
        '/^(?: {4}|\\t)/',
      );
      expect(changed).not.toBe(original);
      writeFileSync(mutant, changed);
      const module = await import(`${pathToFileURL(mutant).href}?mutation=${Date.now()}`);
      for (const body of [' \t/squad cast', '  \t/squad cast', '   \t/squad cast']) {
        expect(module.classifySquadCommand(comment(body), 'issue_comment')).toMatchObject({
          status: 'accepted',
          mode: 'cast',
        });
        expect(classifySquadCommand(comment(body), 'issue_comment')).toEqual({
          status: 'none',
          source: 'comment',
        });
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
