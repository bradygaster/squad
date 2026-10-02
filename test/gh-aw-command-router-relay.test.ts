import { describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { compileFunction, constants as vmConstants } from 'node:vm';
import {
  classifySquadCommand,
  commandRequiresAuthorization,
  isAuthorizedPermission,
} from '../workflows/shared/squad-command-contract.mjs';

const nodeRequire = createRequire(import.meta.url);

// Regression coverage for the three command-routing defects reported against
// bradygaster/squad source SHA 261d140679b158888f1a3c4d9a5a3e74eb55b633
// (octodemo/zava-social-backend-20261001184422#1):
//
//   #1 lifecycle-repair fallback only recognized exact issue-comment bodies,
//      so a normalized command relayed via workflow_dispatch skipped repair;
//   #2 the router omitted `roles: all`, so gh-aw's default write-role
//      activation gate blocked non-write actors from modes meant to be open
//      to all (open modes still require no mutating permission once past
//      that gate -- the router's own in-script authorization is unchanged);
//   #3 the router dropped originating comment provenance, so a relayed
//      `/squad approve-improvement` could never supply a real
//      `approval_comment_id`.
//
// These tests execute the real extracted step scripts the same way
// `actions/github-script` does (compile the body as an async function and
// invoke it -- see test/scripts/repo-health-comment-transport.test.ts for the
// established pattern in this repo), so they exercise production source, not
// a reimplementation of it.

const ROOT = process.cwd();
const ROUTER = readFileSync(join(ROOT, 'workflows/squad-command-router.md'), 'utf8');
const PACKAGE_ROUTER = readFileSync(join(ROOT, 'workflows/package/squad-command-router.md'), 'utf8');
const SHARED_SQUAD = readFileSync(join(ROOT, 'workflows/shared/squad.md'), 'utf8');

/** Read a `script: |` literal block starting at `marker`, dedented. */
function extractScript(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0);
  const scriptIndex = source.indexOf('script: |', markerIndex);
  expect(scriptIndex, `no script block after marker: ${marker}`).toBeGreaterThanOrEqual(0);
  const lineStart = source.lastIndexOf('\n', scriptIndex) + 1;
  const indent = scriptIndex - lineStart;
  const lines: string[] = [];
  let cursor = source.indexOf('\n', scriptIndex) + 1;
  while (cursor > 0 && cursor < source.length) {
    const nextNewline = source.indexOf('\n', cursor);
    const line = nextNewline >= 0 ? source.slice(cursor, nextNewline) : source.slice(cursor);
    if (line.trim() !== '') {
      const lineIndent = line.match(/^\s*/)![0].length;
      if (lineIndent <= indent) break;
      lines.push(line.slice(indent + 2));
    } else {
      lines.push('');
    }
    if (nextNewline < 0) break;
    cursor = nextNewline + 1;
  }
  return lines.join('\n');
}

function compileScript(script: string) {
  return compileFunction(
    `return (async () => {\n${script}\n})();`,
    ['github', 'context', 'core', 'process', 'require'],
    { importModuleDynamically: vmConstants.USE_MAIN_CONTEXT_DEFAULT_LOADER },
  ) as (...args: unknown[]) => Promise<unknown>;
}

function inlineCommandContract(script: string): string {
  const importStatement =
    'const contract = await import(pathToFileURL(nodePath.join(\n' +
    '  trustedRoot,\n' +
    "  '.github/workflows/shared/squad-command-contract.mjs',\n" +
    ')).href);';
  expect(script).toContain(importStatement);
  return script.replace(
    importStatement,
    `const contract = await import(pathToFileURL(nodePath.join(process.cwd(), 'workflows/shared/squad-command-contract.mjs')).href);`,
  );
}

interface RouterRun {
  dispatchedInputs: Record<string, string> | null;
  failure: string | null;
  permissionLookups: string[];
  postedComments: string[];
}

async function runRouter({
  eventName,
  action,
  actor,
  author,
  authorType,
  senderType,
  body,
  previousBody,
  permissions,
  scriptMutation,
}: {
  eventName: 'issues' | 'issue_comment';
  action: 'opened' | 'edited' | 'reopened' | 'created';
  actor: string;
  author?: string;
  authorType?: string;
  senderType?: string;
  body: string;
  previousBody?: string | null | Record<string, unknown>;
  permissions: Record<string, string>;
  scriptMutation?: (script: string) => string;
}): Promise<RouterRun> {
  const extracted = extractScript(ROUTER, 'Route or reject discovered command');
  const inlined = inlineCommandContract(scriptMutation ? scriptMutation(extracted) : extracted);
  const authorUser = author === undefined ? undefined : { login: author, type: authorType ?? 'User' };
  const textSource = {
    number: 4242,
    ...(eventName === 'issues'
      ? { body, ...(authorUser === undefined ? {} : { user: authorUser }) }
      : {}),
  };
  const comment = eventName === 'issue_comment'
    ? { id: 55001, body, ...(authorUser === undefined ? {} : { user: authorUser }) }
    : undefined;
  const context = {
    repo: { owner: 'bradygaster', repo: 'squad' },
    actor,
    payload: {
      action,
      issue: textSource,
      ...(comment ? { comment } : {}),
      ...(action === 'edited' && previousBody !== undefined
        ? { changes: { body: { from: previousBody } } }
        : {}),
      repository: { default_branch: 'dev' },
      sender: { login: actor, type: senderType ?? 'User' },
    },
  };
  let dispatchedInputs: Record<string, string> | null = null;
  let failure: string | null = null;
  const permissionLookups: string[] = [];
  const postedComments: string[] = [];
  const github = {
    rest: {
      issues: {
        createComment: async ({ body: commentBody }: { body: string }) => {
          postedComments.push(commentBody);
        },
      },
      repos: {
        getCollaboratorPermissionLevel: async ({ username }: { username: string }) => {
          permissionLookups.push(username);
          return { data: { permission: permissions[username] ?? 'unresolved' } };
        },
      },
      actions: {
        createWorkflowDispatch: async (params: { inputs: Record<string, string> }) => {
          dispatchedInputs = params.inputs;
        },
      },
    },
  };
  const core = {
    setFailed: (message: string) => {
      failure = message;
    },
    info: () => undefined,
    warning: () => undefined,
  };
  const previousWorkspace = process.env.GITHUB_WORKSPACE;
  const previousEventName = process.env.SQUAD_EVENT_NAME;
  process.env.GITHUB_WORKSPACE = ROOT;
  process.env.SQUAD_EVENT_NAME = eventName;
  try {
    await compileScript(inlined)(github, context, core, process, nodeRequire);
  } finally {
    if (previousWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
    else process.env.GITHUB_WORKSPACE = previousWorkspace;
    if (previousEventName === undefined) delete process.env.SQUAD_EVENT_NAME;
    else process.env.SQUAD_EVENT_NAME = previousEventName;
  }
  return { dispatchedInputs, failure, permissionLookups, postedComments };
}

function assertAuthorBinding(source: string): void {
  expect(source).toContain("process.env.SQUAD_EVENT_NAME === 'issue_comment'");
  expect(source).toContain('context.payload.comment?.user?.login');
  expect(source).toContain("process.env.SQUAD_EVENT_NAME === 'issues'");
  expect(source).toContain('context.payload.issue?.user?.login');
  expect(source).toContain('const actorAuthorized = Boolean(eventActor)');
  expect(source).toContain('const authorAuthorized = Boolean(commandAuthor)');
  expect(source).toContain('if (!actorAuthorized || !authorAuthorized)');
  expect(source).toContain('both the event actor and the author of the classified command text');
}

describe('gh-aw: router-to-repair workflow_dispatch relay (#2, #3 findings)', () => {
  it('declares roles: all so the activation gate does not block non-write actors (#2)', () => {
    expect(ROUTER).toMatch(/^on:\n\s+roles:\s*all\n/m);
  });

  it('preserves the router-level mutating-mode authorization that remains the real gate', () => {
    // roles: all only removes gh-aw's blanket write-role activation gate; the
    // router's own in-script permission check for mutating modes must be the
    // thing still enforcing authorization afterward.
    expect(ROUTER).toContain('contract.commandRequiresAuthorization(result)');
    expect(ROUTER).toContain('contract.isAuthorizedPermission(actorPermission)');
    expect(ROUTER).toContain('contract.isAuthorizedPermission(authorPermission)');
    expect(ROUTER).toContain('getCollaboratorPermissionLevel');
    assertAuthorBinding(ROUTER);
    expect(commandRequiresAuthorization({ status: 'accepted', mode: 'cast' })).toBe(true);
    expect(commandRequiresAuthorization({ status: 'accepted', mode: 'revoke-improvement' })).toBe(true);
    expect(commandRequiresAuthorization({ status: 'accepted', mode: 'status' })).toBe(false);
    expect(isAuthorizedPermission('read')).toBe(false);
    expect(isAuthorizedPermission('write')).toBe(true);
  });

  it('forwards an aw_context comment pointer alongside the bare relayed command (#3)', () => {
    expect(ROUTER).toContain("comment_id: context.payload.comment?.id ?? null");
    expect(ROUTER).toContain('aw_context: awContext');
    expect(ROUTER).toContain("command: result.argumentText || 'cast'");
  });

  it(
    'relays a normalized issue-comment activation command through the router script to the ' +
      'exact dispatch inputs it emits, end to end',
    async () => {
      const routerScript = extractScript(ROUTER, 'Route or reject discovered command');
      expect(routerScript).not.toContain('${{');

      // An ordinary issue comment -- not a synthetic bare workflow_dispatch
      // input -- posted by an authorized (write-permission) human.
      const commentBody = '/squad activate';
      const context = {
        repo: { owner: 'bradygaster', repo: 'squad' },
        actor: 'maintainer',
        payload: {
          issue: { number: 4242 },
          comment: { id: 55001, body: commentBody, user: { login: 'maintainer' } },
          repository: { default_branch: 'dev' },
        },
      };

      // classifySquadCommand must accept this as the 'activate' mode with a
      // bare argumentText -- this bare form is exactly what the pre-fix
      // repair job's exact-body-only `includes(command)` check could never
      // match once relayed through workflow_dispatch.
      const classified = classifySquadCommand({ comment: context.payload.comment, issue: context.payload.issue }, 'issue_comment');
      expect(classified).toMatchObject({ status: 'accepted', mode: 'activate', argumentText: 'activate' });

      let dispatchedInputs: Record<string, string> | null = null;
      const github = {
        rest: {
          issues: { createComment: async () => undefined },
          repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: 'write' } }) },
          actions: {
            createWorkflowDispatch: async (params: { inputs: Record<string, string> }) => {
              dispatchedInputs = params.inputs;
            },
          },
        },
      };
      const core = { setFailed: (msg: string) => { throw new Error(`core.setFailed: ${msg}`); }, info: () => undefined, warning: () => undefined };

      // The real router script resolves the command contract off a checked-out
      // trusted-base clone (`<workspace>/.squad-command-trusted-base/.github/...`);
      // point that one import *target path* at this repo's own working copy
      // of the real module instead of re-implementing the router's logic.
      // Every other line -- including the `require('node:path')` /
      // `require('node:url')` preamble -- is the real, unmodified extracted
      // script text, executed via the injected real `require`.
      const inlined = inlineCommandContract(routerScript);
      expect(inlined).not.toBe(routerScript);

      const previousWorkspace = process.env.GITHUB_WORKSPACE;
      const previousEventName = process.env.SQUAD_EVENT_NAME;
      process.env.GITHUB_WORKSPACE = ROOT;
      process.env.SQUAD_EVENT_NAME = 'issue_comment';
      try {
        await compileScript(inlined)(github, context, core, process, nodeRequire);
      } finally {
        if (previousWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
        else process.env.GITHUB_WORKSPACE = previousWorkspace;
        if (previousEventName === undefined) delete process.env.SQUAD_EVENT_NAME;
        else process.env.SQUAD_EVENT_NAME = previousEventName;
      }

      expect(dispatchedInputs).not.toBeNull();
      expect(dispatchedInputs).toMatchObject({
        command: 'activate',
        issue_number: '4242',
      });
      const awContext = JSON.parse(dispatchedInputs!.aw_context);
      expect(awContext).toEqual({ item_type: 'issue', item_number: 4242, comment_id: 55001 });

      // Now feed the router's exact emitted dispatch inputs into the real
      // repair job script as a workflow_dispatch event would, and confirm the
      // normalized, relayed command actually reaches and passes the repair
      // job's acceptance + authorization gates (not merely that the router
      // produced the right-looking payload).
      const repairScript = extractScript(SHARED_SQUAD, 'Repair terminal lifecycle after idempotent activation');
      expect(repairScript).not.toContain('${{');

      const repairContext = {
        repo: { owner: 'bradygaster', repo: 'squad' },
        payload: { inputs: dispatchedInputs },
      };
      const paginateCalls: unknown[] = [];
      const repairGithub = {
        paginate: async (_fn: unknown, params: unknown) => {
          paginateCalls.push(params);
          return [];
        },
        rest: { issues: { listComments: () => undefined, updateComment: async () => undefined, createComment: async () => undefined }, repos: {} },
      };
      const infoMessages: string[] = [];
      const repairCore = {
        setFailed: (msg: string) => { throw new Error(`core.setFailed: ${msg}`); },
        info: (msg: string) => { infoMessages.push(msg); },
      };
      const previousEnv: Record<string, string | undefined> = {};
      const applied = {
        ISSUE_NUMBER: dispatchedInputs!.issue_number,
        SQUAD_EVENT_NAME: 'workflow_dispatch',
        SQUAD_COMMAND: dispatchedInputs!.command,
      };
      for (const [key, value] of Object.entries(applied)) {
        previousEnv[key] = process.env[key];
        process.env[key] = value;
      }
      try {
        await compileScript(repairScript)(repairGithub, repairContext, repairCore, process);
      } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }

      // It must have reached the trusted-artifact lookup (proving the
      // normalized "activate" command and the workflow_dispatch pre-authorized
      // branch were both accepted) rather than failing the whole-plan command
      // validation the way the pre-fix exact-body-only check would have.
      expect(paginateCalls).toHaveLength(1);
      expect(infoMessages.some(m => m.includes('authorized via workflow_dispatch'))).toBe(true);
    },
  );

  it('kills the normalization mutation: an un-normalized bare command is rejected again', async () => {
    const repairScript = extractScript(SHARED_SQUAD, 'Repair terminal lifecycle after idempotent activation');
    const mutated = repairScript.replace(
      'command = CANONICAL_BY_BARE_COMMAND[bare] || command;',
      '// normalization removed by mutation',
    );
    expect(mutated).not.toBe(repairScript);

    const context = { repo: { owner: 'bradygaster', repo: 'squad' }, payload: { inputs: { issue_number: '4242', command: 'activate' } } };
    const paginateCalls: unknown[] = [];
    const github = { paginate: async (_fn: unknown, params: unknown) => { paginateCalls.push(params); return []; }, rest: { issues: {}, repos: {} } };
    let failedWith: string | null = null;
    const core = { setFailed: (msg: string) => { failedWith = msg; }, info: () => undefined };
    const previousEnv: Record<string, string | undefined> = {};
    const applied = { ISSUE_NUMBER: '4242', SQUAD_EVENT_NAME: 'workflow_dispatch', SQUAD_COMMAND: 'activate' };
    for (const [key, value] of Object.entries(applied)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }
    try {
      await compileScript(mutated)(github, context, core, process);
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(failedWith).toContain('A valid whole-plan activation command and issue number are required.');
    expect(paginateCalls).toHaveLength(0);
  });
});

describe('gh-aw: mutating router authorization is bound to text provenance', () => {
  it.each([
    ['issues', 'opened'],
    ['issues', 'edited'],
    ['issues', 'reopened'],
    ['issue_comment', 'created'],
    ['issue_comment', 'edited'],
  ] as const)('authorizes the classified author on %s.%s', async (eventName, action) => {
    const result = await runRouter({
      eventName,
      action,
      actor: 'maintainer-editor',
      author: 'unprivileged-author',
      body: 'Please run this request.\n/squad cast',
      ...(action === 'edited' ? { previousBody: 'Please run this request.' } : {}),
      permissions: {
        'maintainer-editor': 'write',
        'unprivileged-author': 'read',
      },
    });

    expect(result.dispatchedInputs).toBeNull();
    expect(result.failure).toContain('command author unprivileged-author=read');
    expect(result.permissionLookups).toEqual(['maintainer-editor', 'unprivileged-author']);
    expect(result.postedComments).toEqual([
      expect.stringContaining(
        'Event actor: @maintainer-editor (write); command author: @unprivileged-author (read).',
      ),
    ]);
  });

  it('allows a mutating comment command only when its privileged author and editor are authorized', async () => {
    const result = await runRouter({
      eventName: 'issue_comment',
      action: 'edited',
      actor: 'maintainer-editor',
      author: 'maintainer-author',
      body: 'Please run this request.\n/squad cast',
      previousBody: 'Please run this request.',
      permissions: {
        'maintainer-editor': 'maintain',
        'maintainer-author': 'write',
      },
    });

    expect(result.failure).toBeNull();
    expect(result.postedComments).toEqual([]);
    expect(result.dispatchedInputs).toMatchObject({ command: 'cast', issue_number: '4242' });
  });

  it('keeps event-actor authorization required when a privileged author is edited by an unprivileged actor', async () => {
    const result = await runRouter({
      eventName: 'issues',
      action: 'edited',
      actor: 'unprivileged-editor',
      author: 'maintainer-author',
      body: 'Please run this request.\n/squad cast',
      previousBody: 'Please run this request.',
      permissions: {
        'unprivileged-editor': 'read',
        'maintainer-author': 'admin',
      },
    });

    expect(result.dispatchedInputs).toBeNull();
    expect(result.failure).toContain('event actor unprivileged-editor=read');
    expect(result.postedComments[0]).toContain(
      'Event actor: @unprivileged-editor (read); command author: @maintainer-author (admin).',
    );
  });

  it.each([
    ['issues', 'opened'],
    ['issue_comment', 'created'],
  ] as const)('fails closed when the %s.%s command author is missing', async (eventName, action) => {
    const result = await runRouter({
      eventName,
      action,
      actor: 'maintainer',
      body: 'Please run this request.\n/squad cast',
      permissions: { maintainer: 'write' },
    });

    expect(result.dispatchedInputs).toBeNull();
    expect(result.failure).toContain('command author unresolved=unresolved');
    expect(result.permissionLookups).toEqual(['maintainer']);
    expect(result.postedComments[0]).toContain('command author: unresolved (unresolved)');
  });

  it('does not permission-gate non-mutating modes when author identity is absent', async () => {
    const result = await runRouter({
      eventName: 'issue_comment',
      action: 'edited',
      actor: 'reader',
      body: 'Please report current state.\n/squad status',
      previousBody: 'Please report current state.',
      permissions: {},
    });

    expect(result.failure).toBeNull();
    expect(result.permissionLookups).toEqual([]);
    expect(result.dispatchedInputs).toMatchObject({ command: 'status', issue_number: '4242' });
  });

  it.each([
    ['issues', 'opened'],
    ['issue_comment', 'created'],
  ] as const)('preserves direct authorized created-event routing for %s.%s', async (eventName, action) => {
    const result = await runRouter({
      eventName,
      action,
      actor: 'maintainer',
      author: 'maintainer',
      body: 'Please run this request.\n/squad cast',
      permissions: { maintainer: 'write' },
    });

    expect(result.failure).toBeNull();
    expect(result.permissionLookups).toEqual(['maintainer']);
    expect(result.dispatchedInputs).toMatchObject({ command: 'cast', issue_number: '4242' });
  });

  it.each([
    ['issues', 'Please update the title.\n/squad status', 'Updated title context.\n\n /squad   status '],
    ['issue_comment', 'Before.\n/squad status extra', 'After.\n\n /squad   status   extra '],
  ] as const)('noops an unrelated %s edit when the accepted or rejected invocation is unchanged', async (
    eventName,
    previousBody,
    body,
  ) => {
    const result = await runRouter({
      eventName,
      action: 'edited',
      actor: 'editor',
      author: 'author',
      previousBody,
      body,
      permissions: { editor: 'write', author: 'write' },
    });

    expect(result.dispatchedInputs).toBeNull();
    expect(result.failure).toBeNull();
    expect(result.postedComments).toEqual([]);
    expect(result.permissionLookups).toEqual([]);
  });

  it.each(['issues', 'issue_comment'] as const)(
    'noops a %s.edited change that only recases parsed command keywords',
    async eventName => {
      const result = await runRouter({
        eventName,
        action: 'edited',
        actor: 'maintainer-editor',
        author: 'maintainer-author',
        previousBody: 'Before.\n/squad PLAN REVISE Keep APIName casing',
        body: 'After.\n/squad plan revise Keep APIName casing',
        permissions: {
          'maintainer-editor': 'maintain',
          'maintainer-author': 'write',
        },
      });

      expect(result.dispatchedInputs).toBeNull();
      expect(result.failure).toBeNull();
      expect(result.postedComments).toEqual([]);
      expect(result.permissionLookups).toEqual([]);
    },
  );

  it.each(['issues', 'issue_comment'] as const)(
    'routes a %s.edited change to meaningful free-form argument case',
    async eventName => {
      const result = await runRouter({
        eventName,
        action: 'edited',
        actor: 'maintainer-editor',
        author: 'maintainer-author',
        previousBody: 'Before.\n/squad PLAN REVISE Keep APIName casing',
        body: 'After.\n/squad plan revise Keep ApiName casing',
        permissions: {
          'maintainer-editor': 'maintain',
          'maintainer-author': 'write',
        },
      });

      expect(result.failure).toBeNull();
      expect(result.permissionLookups).toEqual(['maintainer-editor', 'maintainer-author']);
      expect(result.dispatchedInputs).toMatchObject({
        command: 'plan revise Keep ApiName casing',
        issue_number: '4242',
      });
    },
  );

  it.each([
    ['issues', 'ordinary issue body'],
    ['issue_comment', 'Use `/squad revoke-improvement` only after approval.'],
    ['issue_comment', '```text\n/squad revoke-improvement\n```'],
  ] as const)('routes a newly introduced revoke command from %s after code contexts are excluded', async (
    eventName,
    previousBody,
  ) => {
    const result = await runRouter({
      eventName,
      action: 'edited',
      actor: 'maintainer-editor',
      author: 'maintainer-author',
      previousBody,
      body: 'Approval changed.\n/squad revoke-improvement',
      permissions: {
        'maintainer-editor': 'maintain',
        'maintainer-author': 'write',
      },
    });

    expect(result.failure).toBeNull();
    expect(result.permissionLookups).toEqual(['maintainer-editor', 'maintainer-author']);
    expect(result.dispatchedInputs).toMatchObject({
      command: 'revoke-improvement',
      issue_number: '4242',
    });
  });

  it.each(['issues', 'issue_comment'] as const)(
    'fails closed for %s.edited when changes.body.from is absent or malformed',
    async eventName => {
      for (const previousBody of [undefined, null, { invalid: true }]) {
        const result = await runRouter({
          eventName,
          action: 'edited',
          actor: 'maintainer',
          author: 'maintainer',
          ...(previousBody === undefined ? {} : { previousBody }),
          body: '/squad status',
          permissions: { maintainer: 'write' },
        });
        expect(result.dispatchedInputs).toBeNull();
        expect(result.failure).toBeNull();
        expect(result.postedComments).toEqual([]);
        expect(result.permissionLookups).toEqual([]);
      }
    },
  );

  it.each([
    ['status', 'read', 'read'],
    ['review', 'read', 'read'],
    ['research focused scope', 'none', 'read'],
    ['plan', 'read', 'none'],
  ])('keeps public read-only mode %j open without permission lookups', async (
    command,
    actorPermission,
    authorPermission,
  ) => {
    const result = await runRouter({
      eventName: 'issue_comment',
      action: 'created',
      actor: 'reader',
      author: 'external-author',
      body: `/squad ${command}`,
      permissions: {
        reader: actorPermission,
        'external-author': authorPermission,
      },
    });

    expect(result.failure).toBeNull();
    expect(result.permissionLookups).toEqual([]);
    expect(result.dispatchedInputs).not.toBeNull();
  });

  it.each([
    ['read', 'write', 'event actor reader=read'],
    ['write', 'read', 'command author external-author=read'],
    ['unresolved', 'admin', 'event actor reader=unresolved'],
    ['maintain', 'unresolved', 'command author external-author=unresolved'],
  ])('requires both principals for revoke-improvement: actor=%s author=%s', async (
    actorPermission,
    authorPermission,
    failure,
  ) => {
    const result = await runRouter({
      eventName: 'issue_comment',
      action: 'created',
      actor: 'reader',
      author: 'external-author',
      body: '/squad revoke-improvement',
      permissions: {
        reader: actorPermission,
        'external-author': authorPermission,
      },
    });

    expect(result.dispatchedInputs).toBeNull();
    expect(result.failure).toContain(failure);
    expect(result.permissionLookups).toEqual(['reader', 'external-author']);
  });

  it('allows revoke-improvement only when both the event actor and original author are authorized', async () => {
    const result = await runRouter({
      eventName: 'issues',
      action: 'edited',
      actor: 'maintainer-editor',
      author: 'maintainer-author',
      previousBody: 'Approval state changed.',
      body: 'Approval state changed.\n/squad revoke-improvement',
      permissions: {
        'maintainer-editor': 'maintain',
        'maintainer-author': 'admin',
      },
    });

    expect(result.failure).toBeNull();
    expect(result.permissionLookups).toEqual(['maintainer-editor', 'maintainer-author']);
    expect(result.dispatchedInputs).toMatchObject({ command: 'revoke-improvement' });
  });

  it('kills the replay-gate mutation that redispatches an unchanged edited command', async () => {
    const gate = [
      'if (!contract.editedCommandShouldRoute(',
      '  context.payload,',
      '  process.env.SQUAD_EVENT_NAME,',
      '  result,',
      ')) {',
      "  core.info('Ignoring an edited body whose canonical /squad invocation did not change or whose previous body is unavailable.');",
      '  return;',
      '}',
    ].join('\n');
    expect(extractScript(ROUTER, 'Route or reject discovered command')).toContain(gate);

    const vulnerable = await runRouter({
      eventName: 'issue_comment',
      action: 'edited',
      actor: 'maintainer',
      author: 'maintainer',
      previousBody: 'Before.\n/squad status',
      body: 'After.\n/squad status',
      permissions: { maintainer: 'write' },
      scriptMutation: script => script.replace(gate, ''),
    });
    expect(vulnerable.dispatchedInputs).toMatchObject({ command: 'status' });
  });

  it('kills the author-binding mutation that substitutes the editor for the command author', async () => {
    expect(() => assertAuthorBinding(
      ROUTER.replace(
        "const commandAuthorCandidate = process.env.SQUAD_EVENT_NAME === 'issue_comment'\n" +
          '              ? context.payload.comment?.user?.login\n' +
          "              : process.env.SQUAD_EVENT_NAME === 'issues'\n" +
          '                ? context.payload.issue?.user?.login\n' +
          '                : null;',
        'const commandAuthorCandidate = context.actor;',
      ),
    )).toThrow();

    const vulnerable = await runRouter({
      eventName: 'issue_comment',
      action: 'edited',
      actor: 'maintainer-editor',
      author: 'unprivileged-author',
      body: 'Please run this request.\n/squad cast',
      previousBody: 'Please run this request.',
      permissions: {
        'maintainer-editor': 'write',
        'unprivileged-author': 'read',
      },
      scriptMutation: script => script.replace(
        "const commandAuthorCandidate = process.env.SQUAD_EVENT_NAME === 'issue_comment'\n" +
          '    ? context.payload.comment?.user?.login\n' +
          "    : process.env.SQUAD_EVENT_NAME === 'issues'\n" +
          '      ? context.payload.issue?.user?.login\n' +
          '      : null;',
        'const commandAuthorCandidate = context.actor;',
      ),
    });
    expect(vulnerable.dispatchedInputs).toMatchObject({ command: 'cast' });
  });

  it('preserves author binding in the generated package source and strict-compiled artifact', () => {
    assertAuthorBinding(PACKAGE_ROUTER);
    expect(PACKAGE_ROUTER).toContain('contract.editedCommandShouldRoute(');
    const workspace = mkdtempSync(join(tmpdir(), 'squad-command-router-compiled-'));
    try {
      const workflowDir = join(workspace, '.github', 'workflows');
      mkdirSync(workflowDir, { recursive: true });
      cpSync(join(ROOT, 'workflows'), workflowDir, { recursive: true });
      writeFileSync(join(workflowDir, 'squad-command-router.md'), PACKAGE_ROUTER);
      execFileSync('git', ['init', '--quiet'], { cwd: workspace });
      execFileSync(
        'gh',
        ['aw', 'compile', 'squad-command-router', '--strict', '--no-check-update'],
        { cwd: workspace, stdio: 'pipe', timeout: 60000 },
      );
      const compiled = readFileSync(
        join(workflowDir, 'squad-command-router.lock.yml'),
        'utf8',
      );
      assertAuthorBinding(compiled);
      expect(compiled).toContain('contract.editedCommandShouldRoute(');
      expect(compiled).toContain('context.payload.comment?.user?.login');
      expect(compiled).toContain('context.payload.issue?.user?.login');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

describe('gh-aw: bot-authored /squad command text is never replayed as a trusted command', () => {
  // Regression coverage for the finding that no prior test populated `user.type` or
  // `payload.sender.type`, so the router's bot-authorship block (`commandAuthorTypeCandidate
  // === 'Bot' || commandSenderTypeCandidate === 'Bot'`) was declared in source but never actually
  // exercised by this harness -- a mutation deleting or inverting it would have gone undetected.

  it.each([
    ['issues', 'opened'],
    ['issues', 'edited'],
    ['issue_comment', 'created'],
    ['issue_comment', 'edited'],
  ] as const)('ignores a /squad command whose original author is a bot (%s.%s)', async (eventName, action) => {
    const result = await runRouter({
      eventName,
      action,
      actor: 'relay-bot',
      author: 'relay-bot',
      authorType: 'Bot',
      senderType: 'Bot',
      body: 'Please run this request.\n/squad cast',
      ...(action === 'edited' ? { previousBody: 'Please run this request.' } : {}),
      permissions: {},
    });

    expect(result.failure).toBeNull();
    expect(result.dispatchedInputs).toBeNull();
    expect(result.postedComments).toEqual([]);
    expect(result.permissionLookups).toEqual([]);
  });

  it('ignores an edited comment whose current sender is a bot, even when the original comment author was human', async () => {
    // A bot editing someone else's human-authored comment to inject a command must still be
    // blocked: `commandAuthorTypeCandidate` (the original author) alone would miss this, which is
    // exactly why the router also checks `context.payload.sender`.
    const result = await runRouter({
      eventName: 'issue_comment',
      action: 'edited',
      actor: 'editing-bot',
      author: 'human-author',
      authorType: 'User',
      senderType: 'Bot',
      body: 'Please run this request.\n/squad cast',
      previousBody: 'Please run this request.',
      permissions: { 'human-author': 'write' },
    });

    expect(result.failure).toBeNull();
    expect(result.dispatchedInputs).toBeNull();
    expect(result.postedComments).toEqual([]);
    expect(result.permissionLookups).toEqual([]);
  });

  it('still routes a human-authored, human-sent command (control case proving the bot checks are additive, not blanket)', async () => {
    const result = await runRouter({
      eventName: 'issue_comment',
      action: 'created',
      actor: 'maintainer',
      author: 'maintainer',
      authorType: 'User',
      senderType: 'User',
      body: 'Please run this request.\n/squad cast',
      permissions: { maintainer: 'write' },
    });

    expect(result.failure).toBeNull();
    expect(result.dispatchedInputs).toMatchObject({ command: 'cast', issue_number: '4242' });
  });

  it('kills the mutation that drops the bot-authorship block entirely', async () => {
    const dedentedMarker = "if (commandAuthorTypeCandidate === 'Bot' || commandSenderTypeCandidate === 'Bot') {\n"
      + "    core.info('Ignoring a /squad command discovered in bot-authored issue or comment text.');\n"
      + '    return;\n'
      + '  }';
    expect(extractScript(ROUTER, 'Route or reject discovered command')).toContain(dedentedMarker);

    const vulnerable = await runRouter({
      eventName: 'issue_comment',
      action: 'created',
      actor: 'relay-bot',
      author: 'relay-bot',
      authorType: 'Bot',
      senderType: 'Bot',
      body: 'Please run this request.\n/squad cast',
      previousBody: 'Please run this request.',
      permissions: { 'relay-bot': 'write' },
      scriptMutation: script => {
        expect(script).toContain(dedentedMarker);
        return script.replace(dedentedMarker, '');
      },
    });
    expect(vulnerable.dispatchedInputs).toMatchObject({ command: 'cast' });
  });

  it('kills the mutation that checks only the original author type and ignores the current sender', async () => {
    const marker = "commandAuthorTypeCandidate === 'Bot' || commandSenderTypeCandidate === 'Bot'";
    expect(extractScript(ROUTER, 'Route or reject discovered command')).toContain(marker);

    const vulnerable = await runRouter({
      eventName: 'issue_comment',
      action: 'edited',
      actor: 'editing-bot',
      author: 'human-author',
      authorType: 'User',
      senderType: 'Bot',
      body: 'Please run this request.\n/squad cast',
      previousBody: 'Please run this request.',
      permissions: { 'human-author': 'write', 'editing-bot': 'write' },
      scriptMutation: script => {
        expect(script).toContain(marker);
        return script.replace(marker, "commandAuthorTypeCandidate === 'Bot'");
      },
    });
    expect(vulnerable.dispatchedInputs).toMatchObject({ command: 'cast' });
  });
});
