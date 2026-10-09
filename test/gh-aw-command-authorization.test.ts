import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { compileFunction, constants } from 'node:vm';
import { parse } from 'yaml';
import { createFirstInstallFixture } from './helpers/gh-aw-install-fixture.js';
import { authorizeSquadCommand, classifySquadCommand } from '../workflows/shared/squad-command-contract.mjs';
import { compileWithPinnedActions } from '../workflows/shared/squad-install-verifier.mjs';
import { DIAGNOSTIC_RUNTIME_SHA, diagnosticRuntime, fetchDiagnosticRuntime } from './helpers/gh-aw-diagnostic-runtime.js';

interface Step {
  name?: string;
  id?: string;
  if?: string;
  env?: Record<string, string>;
  with?: { script?: string; ref?: string; path?: string };
}
interface Lock {
  jobs: Record<string, { needs?: string[]; if?: string; permissions?: Record<string, string>; steps: Step[] }>;
}
type Item = Record<string, unknown>;
const root = process.cwd();
const scratch = mkdtempSync(join(root, '.test-command-authorization-'));
const trusted = join(scratch, '.squad-command-trusted-base/.github/workflows/shared');
const outputPath = join(scratch, 'agent-output.json');
const nodeRequire = createRequire(import.meta.url);
const human = (login = 'maintainer') => ({ login, type: 'User' });
const bot = { login: 'github-actions[bot]', type: 'Bot' };
const payloadFor = (command: string, eventName = 'issue_comment') => ({
  action: eventName === 'issues' ? 'opened' : 'created',
  sender: human(),
  repository: { default_branch: 'dev' },
  issue: { number: 42, body: `/squad ${command}`, user: human() },
  ...(eventName === 'issue_comment'
    ? { comment: { id: 123, body: `/squad ${command}`, user: human() } }
    : eventName === 'workflow_dispatch'
      ? { inputs: { command, issue_number: '42' } }
      : {}),
});
let dispatcher: Lock;
let router: Lock;
let sanitizeContent: (body: string, options?: { allowedAliases: string[] }) => string;
let diagnosticSources: Map<string, string>;

beforeAll(async () => {
  const fixture = createFirstInstallFixture('a'.repeat(40), 'package');
  dispatcher = parse(fixture.consumerFiles.get('.github/workflows/squad.lock.yml')!.toString());
  router = parse(fixture.consumerFiles.get('.github/workflows/squad-command-router.lock.yml')!.toString());
  // Execute the actual sanitizer dependency closure at the compiled action pin,
  // in memory, with no GitHub clients or writes and no approximate sanitizer stubs.
  const runtimeSha = DIAGNOSTIC_RUNTIME_SHA;
  expect(fixture.consumerFiles.get('.github/workflows/squad.lock.yml')!.toString())
    .toContain(`github/gh-aw-actions/setup@${runtimeSha} # v0.91.5`);
  const sources = new Map(await Promise.all([
    'sanitize_content.cjs', 'sanitize_content_core.cjs', 'markdown_code_region_balancer.cjs',
    'repo_helpers.cjs', 'slash_command_matcher.cjs', 'glob_pattern_helpers.cjs', 'error_codes.cjs',
  ].map(async name => {
    const response = await fetch(
      `https://raw.githubusercontent.com/github/gh-aw-actions/${runtimeSha}/setup/js/${name}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok) throw new Error(`Pinned sanitizer fetch failed: ${name} HTTP ${response.status}`);
    return [name, await response.text()] as const;
  })));
  const modules = new Map<string, { exports: Record<string, any> }>();
  const load = (name: string): Record<string, any> => {
    if (modules.has(name)) return modules.get(name)!.exports;
    const source = sources.get(name);
    if (!source) throw new Error(`Unexpected sanitizer dependency: ${name}`);
    const module = { exports: {} };
    modules.set(name, module);
    compileFunction(source, ['module', 'exports', 'require', 'process'])(module, module.exports,
      (request: string) => request.startsWith('./') ? load(request.slice(2)) : nodeRequire(request),
      { env: { GITHUB_REPOSITORY: 'owner/repo' } });
    return module.exports;
  };
  sanitizeContent = load('sanitize_content.cjs').sanitizeContent;
  diagnosticSources = await fetchDiagnosticRuntime();
  mkdirSync(trusted, { recursive: true });
  cpSync(join(root, 'workflows/shared/squad-command-contract.mjs'), join(trusted, 'squad-command-contract.mjs'));
}, 180_000);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function runGuard({
  eventName = 'issue_comment', payload = payloadFor('cast'), actor = 'maintainer',
  permission = 'write', items = [{ type: 'create_issue', title: 'must be gated' }],
  permissionFailure = false, omitOutput = false, source = 'dispatcher',
}: {
  eventName?: string; payload?: ReturnType<typeof payloadFor>; actor?: string;
  permission?: string | Record<string, string>; items?: Item[];
  permissionFailure?: boolean; omitOutput?: boolean; source?: 'dispatcher' | 'router';
} = {}) {
  const lock = source === 'dispatcher' ? dispatcher : router;
  const stepName = source === 'dispatcher'
    ? 'Reject unknown or malformed Squad commands' : 'Route or reject discovered command';
  const step = lock.jobs.safe_outputs.steps.find(candidate => candidate.name === stepName)!;
  expect(step?.with?.script).toBeTruthy();
  expect(step.env?.GH_AW_AGENT_OUTPUT).toBe('${{ steps.setup-agent-output-env.outputs.GH_AW_AGENT_OUTPUT }}');
  writeFileSync(outputPath, JSON.stringify({ items }));
  const mutations: string[] = [];
  const failures: string[] = [];
  const permissionLookup = vi.fn(async ({ username }: { username: string }) => {
    if (permissionFailure) throw new Error('permission API unavailable');
    return { data: { permission: typeof permission === 'string' ? permission : permission[username] } };
  });
  const github = { rest: {
    repos: { getCollaboratorPermissionLevel: permissionLookup },
    issues: { createComment: async () => { mutations.push('diagnostic comment'); } },
    actions: { createWorkflowDispatch: async () => { mutations.push('dispatch'); } },
  } };
  const context = { actor, payload, repo: { owner: 'owner', repo: 'repo' } };
  const core = { setFailed: (message: string) => { failures.push(message); }, info: vi.fn() };
  const script = compileFunction(`return (async () => { ${step.with!.script} })();`,
    ['github', 'context', 'core', 'process', 'require'],
    { importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
  try {
    await script(github, context, core, { env: {
      GITHUB_WORKSPACE: scratch, SQUAD_EVENT_NAME: eventName,
      GH_AW_AGENT_OUTPUT: omitOutput ? undefined : outputPath,
    } }, nodeRequire);
  } catch (error) {
    failures.push(String(error));
  }
  return { failures, mutations, permissionLookup };
}

async function interpretLifecycleComment(body?: string) {
  const step = dispatcher.jobs.repair_activated_lifecycle.steps
    .find(candidate => candidate.name === 'Repair terminal lifecycle after idempotent activation')!;
  expect(step?.with?.script).toBeTruthy();
  const mutations: Record<string, unknown>[] = [];
  const failures: string[] = [];
  const github = {
    paginate: async () => body === undefined ? [] : [{
      id: 123, body, created_at: '2026-10-08T00:00:00Z', user: bot,
    }],
    rest: { issues: {
      listComments: vi.fn(),
      createComment: async (params: Record<string, unknown>) => mutations.push(params),
      updateComment: async (params: Record<string, unknown>) => mutations.push(params),
    } },
  };
  await compileFunction(`return (async () => { ${step.with!.script} })();`,
    ['github', 'context', 'core', 'process'])(github,
    { repo: { owner: 'owner', repo: 'repo' } },
    { setFailed: (message: string) => failures.push(message), info: vi.fn() },
    { env: { ISSUE_NUMBER: '42', SQUAD_EVENT_NAME: 'workflow_dispatch', SQUAD_COMMAND: 'plan accept' } });
  expect(failures).toEqual([]);
  return mutations;
}

describe('compiled Squad command authorization boundary (#2185)', () => {
  function assertDiagnosticIsolation(lock: Lock) {
    const steps = lock.jobs.conclusion.steps;
    const usage = steps.filter(step =>
      step.name === 'Generate usage activity summary and unified session');
    expect(usage).toHaveLength(1);
    expect(usage[0].with?.script).toContain("'generate_usage_artifacts.cjs'");
    const handlers = steps.filter(step => step.with?.script && !usage.includes(step));
    expect(handlers.every(step => ['noop', 'missing_tool', 'report_incomplete',
      'handle_agent_failure', 'conclusion'].includes(step.id || ''))).toBe(true);
    expect(steps.find(step => step.id === 'handle_agent_failure')?.env?.GH_AW_FAILURE_REPORT_AS_ISSUE)
      .toBe('false');
    expect(steps.find(step => step.id === 'noop')?.env?.GH_AW_NOOP_REPORT_AS_ISSUE).toBe('false');
    expect(steps.some(step => step.id === 'detection_runs')).toBe(false);
    expect(steps.find(step => step.id === 'report_failed_jobs')?.env?.GH_AW_REPORT_FAILED_JOBS ?? 'false')
      .toBe('false');
    const completion = steps.find(step => step.id === 'conclusion');
    if (completion) {
      expect(JSON.parse(completion.env!.GH_AW_SAFE_OUTPUT_MESSAGES).activationComments).toBe('false');
    }
    expect(JSON.parse(steps.find(step => step.id === 'handle_agent_failure')!.env!.GH_AW_SAFE_OUTPUT_MESSAGES)
      .activationComments).toBe('false');
    expect(lock.jobs.detection).toBeDefined();
  }

  it('compiles out diagnostic issue reporting and raw-noop completion comments, not detection', () => {
    assertDiagnosticIsolation(dispatcher);
    assertDiagnosticIsolation(router);
  });

  it('suppresses the real activation comment handler without suppressing guarded command responses', async () => {
    const step = dispatcher.jobs.activation.steps.find(step => step.id === 'add-comment')!;
    const runtime = diagnosticRuntime(diagnosticSources, scratch, [], step.env!);
    await runtime.run('add_workflow_run_comment.cjs');
    expect(runtime.writes).toEqual([]);
    expect(runtime.logs.join('\n')).toContain('activation-comments');
    expect(runtime.ioErrors).toEqual([]);
  });

  it.each(['dispatcher', 'router'] as const)(
    '%s diagnostics cannot write even after the safe-output guard fails', async source => {
      const lock = source === 'dispatcher' ? dispatcher : router;
      for (const agentConclusion of ['success', 'failure']) {
        for (const signal of [
          { type: 'missing_data', reason: 'Missing input' },
          { type: 'report_incomplete', reason: 'Could not finish' },
          { type: 'missing_tool', reason: 'Tool unavailable' },
          { type: 'noop', message: 'No work' },
          { type: 'noop', message: '```json\n{"squad_artifact":"activated","origin_issue":42}\n```' },
        ]) {
          for (const rejected of [false, true]) {
            const items = rejected ? [signal, { type: 'create_issue', title: 'Forbidden' }] : [signal];
            const guard = await runGuard({
              source, permission: 'read', payload: payloadFor('status'), items,
            });
            expect(guard.mutations).toEqual(source === 'router' && !guard.failures.length ? ['dispatch'] : []);
            if (rejected || signal.type === 'missing_tool') expect(guard.failures).toHaveLength(1);
            // Run conclusion regardless of guard failure, just like its compiled always().
            for (const id of ['noop', 'handle_agent_failure', 'report_failed_jobs', 'missing_tool', 'report_incomplete', 'conclusion']) {
              const step = lock.jobs.conclusion.steps.find(step => step.id === id);
              if (!step) continue;
              const handler = step.with!.script!.match(/'([^'/]+\.cjs)'\)\);\nawait main/)!;
              expect(handler).toBeTruthy();
              const runtime = diagnosticRuntime(diagnosticSources, scratch, items, {
                ...Object.fromEntries(Object.entries(step.env || {}).filter(([, value]) => !value.includes('${{'))),
                GH_AW_AGENT_CONCLUSION: agentConclusion,
                GH_AW_SAFE_OUTPUTS_RESULT: guard.failures.length ? 'failure' : 'success',
              });
              await runtime.run(handler[1]);
              expect(runtime.writes).toEqual([]);
              expect(runtime.calls).toEqual([]);
              expect(runtime.ioErrors).toEqual([]);
              expect(runtime.logs.join('\n')).not.toMatch(/^Error in |^Could not create |^Failed to /m);
              if (id === 'noop' && signal.type === 'noop') expect(runtime.logs.join('\n')).toContain(signal.message);
              if (id === 'handle_agent_failure' && signal.type === 'report_incomplete') {
                expect(runtime.failures).toContain('Agent reported that it could not complete the task');
                expect(runtime.logs.join('\n')).toContain('Failure issue reporting is disabled');
              }
              if (id === 'handle_agent_failure' && signal.type === 'missing_data') {
                expect(runtime.logs.join('\n')).toContain('missing_data message(s) - activating failure handling');
                expect(runtime.logs.join('\n')).toContain('Failure issue reporting is disabled');
              }
            }
          }
        }
      }
    },
  );

  it('real pinned handlers expose the original tracking and completion writes when enabled', async () => {
    for (const existingIssue of [false, true]) {
      for (const [handler, items, env] of [
        ['handle_agent_failure.cjs', [{ type: 'report_incomplete', reason: 'Could not finish' }], { GH_AW_FAILURE_REPORT_AS_ISSUE: 'true' }],
        ['handle_agent_failure.cjs', [{ type: 'missing_data', reason: 'Missing input' }], { GH_AW_FAILURE_REPORT_AS_ISSUE: 'true' }],
        ['handle_noop_message.cjs', [{ type: 'noop', message: 'No work' }], { GH_AW_NOOP_REPORT_AS_ISSUE: 'true' }],
        ['handle_detection_runs.cjs', [], { GH_AW_DETECTION_CONCLUSION: 'warning' }],
        ['report_failed_jobs.cjs', [], { GH_AW_REPORT_FAILED_JOBS: 'true' }],
        ['notify_comment_error.cjs', [{ type: 'noop', message: 'Structured data:\n```json\n{"squad_artifact":"activated"}\n```' }], {
          GH_AW_SAFE_OUTPUT_MESSAGES: '{"appendOnlyComments":true,"activationComments":true}',
          GH_AW_SAFE_OUTPUTS_RESULT: 'failure',
        }],
      ] as [string, Item[], Record<string, string>][]) {
        const runtime = diagnosticRuntime(diagnosticSources, scratch, items, {
          GH_AW_AGENT_CONCLUSION: 'success', ...env,
          ...(existingIssue && handler === 'handle_agent_failure.cjs' ? { GH_AW_FAILURE_ISSUE_NUMBER: '900' } : {}),
        }, existingIssue);
        await runtime.run(handler);
        expect(runtime.ioErrors, `${handler}\n${runtime.logs.join('\n')}`).toEqual([]);
        expect(runtime.writes.length, `${handler}\n${runtime.logs.join('\n')}\n${runtime.failures}`).toBeGreaterThan(0);
        if (handler === 'notify_comment_error.cjs') {
          expect(runtime.writes[0].params.body).toContain('"squad_artifact":"activated"');
        }
      }
    }
  });

  it.each(['squad', 'squad-command-router'])(
    'rejects each re-enabled diagnostic channel after strict-compiling mutated %s source', name => {
      const fixture = createFirstInstallFixture('a'.repeat(40), 'package');
      const mutationRoot = join(scratch, `diagnostic-mutant-${name}`);
      for (const [path, bytes] of fixture.consumerFiles) {
        const destination = join(mutationRoot, path);
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
      execFileSync('git', ['init', '--quiet'], { cwd: mutationRoot });
      const sourcePath = join(mutationRoot, `.github/workflows/${name}.md`);
      const original = readFileSync(sourcePath, 'utf8');
      for (const disabled of [
        'report-failure-as-issue: false', 'report-failed-jobs: false',
        'activation-comments: false', 'threat-detection:\n    report-as-issue: false',
        'noop:\n    max: 1\n    report-as-issue: false',
      ]) {
        expect(original).toContain(disabled);
        writeFileSync(sourcePath, original.replace(disabled, disabled.replace('false', 'true')));
        compileWithPinnedActions(mutationRoot);
        const mutant = parse(readFileSync(join(mutationRoot, `.github/workflows/${name}.lock.yml`), 'utf8'));
        expect(() => assertDiagnosticIsolation(mutant), disabled).toThrow();
      }
    }, 120_000,
  );

  it('runs the guard after output download but before privileged handlers, with dependent custom jobs', () => {
    for (const [lock, name] of [
      [dispatcher, 'Reject unknown or malformed Squad commands'],
      [router, 'Route or reject discovered command'],
    ] as const) {
      const steps = lock.jobs.safe_outputs.steps;
      const gate = steps.findIndex(step => step.name === name);
      expect(gate).toBeGreaterThan(steps.findIndex(step => step.id === 'setup-agent-output-env'));
      expect(steps[gate - 1].with).toMatchObject({
        ref: '${{ github.workflow_sha }}', path: '.squad-command-trusted-base',
      });
      const handlers = steps.filter(step => /Process safe outputs/i.test(step.name || ''));
      expect(handlers.length).toBeGreaterThan(0);
      for (const handler of handlers) {
        expect(steps.indexOf(handler)).toBeGreaterThan(gate);
        expect(handler.if || '').not.toMatch(/always\(\)|!cancelled\(\)/);
      }
    }
    for (const job of ['upsert_research_artifact', 'upsert_lifecycle_state', 'repair_activated_lifecycle']) {
      expect(dispatcher.jobs[job].needs).toContain('safe_outputs');
      expect(dispatcher.jobs[job].if).toContain("needs.safe_outputs.result == 'success'");
    }
  });

  it.each(['issues', 'issue_comment'])('denies read/triage/noncollaborator commands on %s', async eventName => {
    for (const permission of ['read', 'triage', 'none', 'unresolved', '']) {
      const result = await runGuard({ eventName, payload: payloadFor('cast', eventName), permission });
      expect(result.failures).toHaveLength(1);
      expect(result.mutations).toEqual([]);
    }
  });

  it.each(['write', 'maintain', 'admin'])('allows %s command authors', async permission => {
    const result = await runGuard({ permission });
    expect(result.failures).toEqual([]);
    expect(result.permissionLookup).toHaveBeenCalledTimes(1);
  });

  it('denies missing identities, mismatched senders, unknown events, and API failures', async () => {
    const missingAuthor = payloadFor('cast');
    missingAuthor.comment!.user.login = '';
    const missingSender = payloadFor('cast');
    missingSender.sender.login = '';
    for (const options of [
      { actor: '' }, { payload: missingAuthor }, { payload: missingSender },
      { eventName: 'repository_dispatch' }, { permissionFailure: true },
    ]) {
      expect((await runGuard(options)).failures).toHaveLength(1);
    }
  });

  it.each(['issues', 'issue_comment'])('binds changed %s text to both editor and original author', async eventName => {
    const payload = { ...payloadFor('cast', eventName), action: 'edited',
      changes: { body: { from: '/squad status' } } };
    payload.sender = human('editor');
    for (const permission of [
      { editor: 'read', maintainer: 'write' },
      { editor: 'write', maintainer: 'read' },
    ]) {
      expect((await runGuard({ payload, eventName, actor: 'editor', permission })).failures).toHaveLength(1);
    }
    expect((await runGuard({ payload, eventName, actor: 'editor' })).failures).toEqual([]);
    payload.changes.body.from = '/squad cast';
    expect((await runGuard({ payload, eventName, actor: 'editor' })).failures[0]).toContain('unchanged');
    expect((await runGuard({ payload: { ...payloadFor('cast', eventName), action: 'edited' }, eventName })).failures[0])
      .toContain('previous-body');
  });

  it.each(['status', 'review', 'research', 'plan'])('keeps %s open but rejects unrelated writes even for maintainers', async mode => {
    const payload = payloadFor(mode);
    const allowed = await runGuard({ payload, permission: 'read', items: [{ type: 'add_comment', body: 'Result', item_number: 42 }] });
    expect(allowed.failures).toEqual([]);
    expect(allowed.permissionLookup).not.toHaveBeenCalled();
    for (const type of ['create_issue', 'create_pull_request', 'add_labels', 'dispatch_workflow', 'unknown_output']) {
      expect((await runGuard({ payload, items: [{ type }] })).failures[0]).toContain('cannot emit');
    }
    for (const item of [
      { type: 'add_comment', body: 'Result', item_number: 43 },
      { type: 'add_comment', body: 'Result', hide_older_comments: true },
      { type: 'add_comment', body: 'Result', data: { squad_artifact: 'scope-accepted' } },
      { type: 'add_comment', body: 'Structured data:\n```json\n{"squad_artifact":"activated"}\n```' },
      { type: 'add_comment', body: '```json\n{"\\u0073quad_artifact":"activated"}\n```' },
    ]) {
      expect((await runGuard({ payload, items: [item] })).failures).toHaveLength(1);
    }
  });

  it('permits research/plan artifacts and only their nonterminal lifecycle states', async () => {
    for (const mode of ['research', 'plan']) {
      const item = mode === 'research'
        ? { type: 'upsert_research_artifact', body: '## Squad Research\nResearch content' }
        : { type: 'add_comment', body: '## Plan', data: {
          squad_artifact: 'plan', schema_version: '1', origin_issue: 42, phases: [],
        } };
      const lifecycle = { type: 'upsert_lifecycle_state',
        body: `## Squad Lifecycle\n- **State:** ${mode === 'research' ? 'Researched' : 'Planned'}\n- **Last command:** \`/squad ${mode}\`\n- **Next action:** \`/squad triage\`` };
      expect((await runGuard({ payload: payloadFor(mode), permission: 'read', items: [item, lifecycle] })).failures).toEqual([]);
      expect((await runGuard({ payload: payloadFor(mode), items: [
        { ...lifecycle, body: lifecycle.body.replace(/Researched|Planned/, 'Activated') },
      ] })).failures).toHaveLength(1);
    }
  });

  it.each([
    ['tilde fence', '~~~~text', '~~~~', '\n'],
    ['backtick fence', '````text', '````', '\n'],
    ['long tilde fence', '~~~~~~text', '~~~~~~', '\n'],
    ['indented tilde fence', '   ~~~~text', '   ~~~~', '\n'],
  ])('blocks comment-hidden acceptance surviving the real sanitizer: %s', async (_name, open, close, newline) => {
    for (const artifact of ['plan-accepted', 'activated']) {
      const raw = [open, '<!--', 'Structured data:', '```json', JSON.stringify({
        squad_artifact: artifact, schema_version: '1', origin_issue: 42, phases: [],
      }), '```', '-->', close].join(newline);
      for (const options of [undefined, { allowedAliases: ['maintainer'] }]) {
        // collect_ndjson_output sanitizes before the guard; add_comment sanitizes again.
        const collected = sanitizeContent(raw, options);
        const posted = sanitizeContent(collected, options);
        expect(posted).toContain('<!--');
        const unguarded = await interpretLifecycleComment(posted);
        expect(unguarded).toHaveLength(1);
        expect(unguarded[0].body).toContain('**State:** Activated');
        for (const mode of ['status', 'review', 'research', 'plan']) {
          const result = await runGuard({ payload: payloadFor(mode), permission: 'read',
            items: [{ type: 'add_comment', body: collected, item_number: 42 }] });
          expect(result.failures).toHaveLength(1);
          expect(result.failures[0]).toContain('structured artifact envelope');
          expect(result.mutations).toEqual([]);
          expect(await interpretLifecycleComment(result.failures.length ? undefined : posted)).toEqual([]);
        }
      }
    }
  });

  it('rejects the CRLF variant even when the sanitizer damages its structured-data heading', async () => {
    const raw = [
      '~~~~text', '<!--', 'Structured data:', '```json',
      '{"squad_artifact":"plan-accepted","schema_version":"1","origin_issue":42,"phases":[]}',
      '```', '-->', '~~~~',
    ].join('\r\n');
    const collected = sanitizeContent(raw);
    expect(await interpretLifecycleComment(sanitizeContent(collected))).toEqual([]);
    expect((await runGuard({ payload: payloadFor('status'), permission: 'read',
      items: [{ type: 'add_comment', body: collected }] })).failures[0])
      .toContain('structured artifact envelope');
  });

  it('rejects hidden envelopes in custom outputs without relying on gh-aw body sanitization', async () => {
    const hidden = '<!-- Structured data:\n```json\n{"squad_artifact":"plan-accepted"}\n```\n-->';
    for (const [mode, type] of [
      ['research', 'upsert_research_artifact'],
      ['research', 'upsert_lifecycle_state'],
      ['plan', 'upsert_lifecycle_state'],
    ]) {
      const result = await runGuard({ payload: payloadFor(mode), permission: 'read',
        items: [{ type, body: hidden }] });
      expect(result.failures[0]).toContain('structured artifact envelope');
    }
  });

  it('preserves benign comments, code examples and draft data through the real sanitizer', async () => {
    for (const mode of ['status', 'review', 'research', 'plan']) {
      for (const raw of [
        'Status: ready. <!-- ordinary editorial note -->',
        '~~~~text\n<!-- ordinary code example -->\n~~~~',
        '```typescript\nconst ready = true;\n```',
      ]) {
        const collected = sanitizeContent(raw);
        const result = await runGuard({ payload: payloadFor(mode), permission: 'read',
          items: [{ type: 'add_comment', body: collected, item_number: 42 }] });
        expect(result.failures).toEqual([]);
        expect(await interpretLifecycleComment(sanitizeContent(collected))).toEqual([]);
      }
    }
    for (const artifact of ['plan', 'program', 'implementation', 'validation']) {
      const item = { type: 'add_comment', body: sanitizeContent('Draft result'), data: {
        squad_artifact: artifact, schema_version: '1', origin_issue: 42, phases: [],
      } };
      expect((await runGuard({ payload: payloadFor('plan'), permission: 'read', items: [item] })).failures)
        .toEqual([]);
      expect(await interpretLifecycleComment(
        `${sanitizeContent(item.body)}\n\nStructured data:\n\`\`\`json\n${JSON.stringify(item.data)}\n\`\`\``,
      )).toEqual([]);
    }
  });

  it('accepts authenticated manual dispatch, router relay and worker continuation, not bot text', async () => {
    for (const command of ['cast', 'status', 'implement']) {
      for (const sender of [human(), bot, { login: 'automation[bot]', type: 'Bot' }]) {
        const payload = { ...payloadFor(command, 'workflow_dispatch'), sender };
        const result = await runGuard({ payload, actor: sender.login, eventName: 'workflow_dispatch',
          permissionFailure: true, items: [{ type: 'noop', message: 'No work' }] });
        expect(result.failures).toEqual([]);
        expect(result.permissionLookup).not.toHaveBeenCalled();
      }
    }
    for (const mode of ['cast', 'status']) {
      const payload = { ...payloadFor(mode), sender: bot };
      expect((await runGuard({ payload, actor: bot.login })).failures).toHaveLength(1);
    }
    expect((await runGuard({ payload: payloadFor('', 'workflow_dispatch'), eventName: 'workflow_dispatch' })).failures[0])
      .toContain('No explicit Squad command');
  });

  it('fails closed without agent-output evidence and blocks mixed batches before any handler', async () => {
    expect((await runGuard({ omitOutput: true })).failures[0]).toContain('GH_AW_AGENT_OUTPUT');
    const result = await runGuard({ payload: payloadFor('plan'), items: [
      { type: 'add_comment', body: 'Allowed' }, { type: 'dispatch_workflow' },
    ] });
    expect(result.failures).toHaveLength(1);
    expect(result.mutations).toEqual([]);
  });

  it('router permits only deterministic dispatch and rejects malicious agent outputs first', async () => {
    const allowed = await runGuard({ source: 'router', items: [{ type: 'noop', message: 'Done' }] });
    expect(allowed.failures).toEqual([]);
    expect(allowed.mutations).toEqual(['dispatch']);
    for (const type of ['dispatch_workflow', 'add_comment', 'create_issue']) {
      const result = await runGuard({ source: 'router', items: [{ type }] });
      expect(result.failures[0]).toContain('diagnostics only');
      expect(result.mutations).toEqual([]);
    }
  });

  it('requires the same permission policy at router and dispatcher call sites', async () => {
    const payload = payloadFor('cast');
    const result = classifySquadCommand(payload, 'issue_comment');
    await expect(authorizeSquadCommand({
      payload, eventName: 'issue_comment', actor: 'maintainer', result,
      resolvePermission: async () => 'triage',
    })).rejects.toThrow('refused mutating mode');
  });

  it('detects a live-source mutation that removes authorization after strict compilation', async () => {
    const fixture = createFirstInstallFixture('a'.repeat(40), 'package');
    const mutationRoot = join(scratch, 'mutant');
    for (const [path, bytes] of fixture.consumerFiles) {
      const destination = join(mutationRoot, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes);
    }
    const sourcePath = join(mutationRoot, '.github/workflows/squad.md');
    const original = readFileSync(sourcePath, 'utf8');
    const mutant = original.replace('await contract.enforceSquadCommandContract({', 'await (async () => {})({');
    expect(mutant).not.toBe(original);
    writeFileSync(sourcePath, mutant);
    execFileSync('git', ['init', '--quiet'], { cwd: mutationRoot });
    compileWithPinnedActions(mutationRoot);
    const realDispatcher = dispatcher;
    const assertDenial = (result: Awaited<ReturnType<typeof runGuard>>) => {
      expect(result.failures).toHaveLength(1);
    };
    assertDenial(await runGuard({ permission: 'read' }));
    try {
      dispatcher = parse(readFileSync(join(mutationRoot, '.github/workflows/squad.lock.yml'), 'utf8'));
      const result = await runGuard({ permission: 'read' });
      expect(() => assertDenial(result)).toThrow();
      expect(result.permissionLookup).not.toHaveBeenCalled();
    } finally {
      dispatcher = realDispatcher;
    }
  }, 120_000);
});
