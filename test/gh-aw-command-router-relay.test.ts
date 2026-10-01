import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('gh-aw: router-to-repair workflow_dispatch relay (#2, #3 findings)', () => {
  it('declares roles: all so the activation gate does not block non-write actors (#2)', () => {
    expect(ROUTER).toMatch(/^on:\n\s+roles:\s*all\n/m);
  });

  it('preserves the router-level mutating-mode authorization that remains the real gate', () => {
    // roles: all only removes gh-aw's blanket write-role activation gate; the
    // router's own in-script permission check for mutating modes must be the
    // thing still enforcing authorization afterward.
    expect(ROUTER).toContain('contract.commandRequiresAuthorization(result)');
    expect(ROUTER).toContain('contract.isAuthorizedPermission(permission)');
    expect(ROUTER).toContain('getCollaboratorPermissionLevel');
    expect(commandRequiresAuthorization({ status: 'accepted', mode: 'cast' })).toBe(true);
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
          comment: { id: 55001, body: commentBody },
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
      const importStatement =
        'const contract = await import(pathToFileURL(nodePath.join(\n' +
        '  trustedRoot,\n' +
        "  '.github/workflows/shared/squad-command-contract.mjs',\n" +
        ')).href);';
      expect(routerScript).toContain(importStatement);
      const inlined = routerScript.replace(
        importStatement,
        `const contract = await import(pathToFileURL(nodePath.join(process.cwd(), 'workflows/shared/squad-command-contract.mjs')).href);`,
      );
      expect(inlined).not.toBe(routerScript);

      const previousWorkspace = process.env.GITHUB_WORKSPACE;
      process.env.GITHUB_WORKSPACE = ROOT;
      try {
        await compileScript(inlined)(github, context, core, process, nodeRequire);
      } finally {
        if (previousWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
        else process.env.GITHUB_WORKSPACE = previousWorkspace;
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
