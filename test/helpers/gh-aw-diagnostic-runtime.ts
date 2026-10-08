import { compileFunction, createContext } from 'node:vm';
import { createRequire } from 'node:module';
import { dirname, posix } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

export const DIAGNOSTIC_RUNTIME_SHA = '2fbab69bfca02bebd76cd0fc43f2d12acfed994f';
const requireNode = createRequire(import.meta.url);
const entrypoints = [
  'handle_agent_failure.cjs', 'handle_noop_message.cjs', 'handle_detection_runs.cjs',
  'report_failed_jobs.cjs', 'notify_comment_error.cjs', 'missing_tool.cjs',
  'report_incomplete_handler.cjs', 'setup_globals.cjs', 'add_workflow_run_comment.cjs',
];

/** Fetch the real pinned handler closure, including its templates, without executing network clients. */
export async function fetchDiagnosticRuntime() {
  const sources = new Map<string, string>();
  let pending = entrypoints.map(name => `js/${name}`);
  while (pending.length) {
    const batch = [...new Set(pending)].filter(name => !sources.has(name));
    pending = [];
    await Promise.all(batch.map(async name => {
      const response = await fetch(
        `https://raw.githubusercontent.com/github/gh-aw-actions/${DIAGNOSTIC_RUNTIME_SHA}/setup/${name.replace(/^prompts\//, 'md/')}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok) throw new Error(`Pinned runtime fetch failed: ${name} HTTP ${response.status}`);
      sources.set(name, await response.text());
    }));
    for (const name of batch.filter(name => name.endsWith('.cjs'))) {
      const source = sources.get(name)!;
      for (const [, dependency] of source.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
        pending.push(posix.normalize(posix.join(posix.dirname(name), dependency)));
      }
      for (const [, template] of source.matchAll(/getPromptPath\(["']([^"']+)["']\)/g)) {
        pending.push(`prompts/${template}`);
      }
    }
  }
  return sources;
}

/**
 * Only IO is substituted: real handlers, loaders, boolean parsing, sanitizers and
 * templates execute unchanged. GitHub writes are recorded locally, never sent.
 */
export function diagnosticRuntime(
  sources: Map<string, string>, scratch: string, items: Record<string, unknown>[],
  env: Record<string, string>, existingIssue = false,
) {
  const outputPath = `${scratch}/diagnostic-output.json`;
  writeFileSync(outputPath, JSON.stringify({ items }));
  const logs: string[] = [];
  const failures: string[] = [];
  const writes: { method: string; params: Record<string, unknown> }[] = [];
  const calls: string[] = [];
  const ioErrors: string[] = [];
  const summary = {
    addRaw: (text: string) => { logs.push(text); return summary; },
    addHeading: (text: string) => { logs.push(text); return summary; },
    addTable: () => summary,
    write: async () => {},
  };
  const core = {
    info: (text: string) => logs.push(text), warning: (text: string) => logs.push(text),
    debug: (text: string) => logs.push(text), error: (text: string) => logs.push(text),
    setFailed: (text: string) => failures.push(text), setOutput: () => {},
    startGroup: () => {}, endGroup: () => {}, summary,
  };
  const api = (method: string) => async (params: Record<string, unknown> = {}) => {
    calls.push(method);
    if (method === 'search.issuesAndPullRequests' && String(params.q).includes('is:pr')) return { data: { total_count: 0, items: [] } };
    if (method === 'search.issuesAndPullRequests') return { data: {
      total_count: existingIssue ? 1 : 0,
      items: existingIssue ? [{ number: 900, node_id: 'I_tracking', html_url: 'https://github.com/owner/repo/issues/900', body: '' }] : [],
    } };
    if (method === 'actions.listJobsForWorkflowRun') return { data: {
      jobs: [{ name: 'upsert_lifecycle_state', conclusion: 'failure', html_url: 'https://github.com/owner/repo/actions/runs/1/job/2' }],
    } };
    if (method === 'rateLimit.get') return { data: { resources: { core: { remaining: 5000, limit: 5000 } } } };
    if (method === 'issues.listComments') return { data: [] };
    if (method === 'issues.get') return { data: {
      number: 900, state: 'open', labels: [], body: '', html_url: 'https://github.com/owner/repo/issues/900',
    } };
    if (method === 'pulls.list') return { data: [] };
    if (method === 'repos.get') return { data: { default_branch: 'dev' } };
    if (['issues.create', 'issues.update', 'issues.createComment', 'issues.addLabels',
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}'].includes(method)) {
      writes.push({ method, params });
      return { data: { number: 900, id: 901, node_id: 'I_tracking', html_url: 'https://github.com/owner/repo/issues/900' } };
    }
    ioErrors.push(`Unexpected GitHub IO: ${method}`);
    throw new Error(ioErrors.at(-1));
  };
  const rest = new Proxy({}, {
    get: (_target, group: string) => new Proxy({}, {
      get: (_target, method: string) => api(`${group}.${method}`),
    }),
  });
  const github = {
    rest, request: (method: string, params: Record<string, unknown>) => api(method)(params),
    hook: { before: () => {} },
  };
  const runtimeEnv = {
    GITHUB_REPOSITORY: 'owner/repo', RUNNER_TEMP: scratch, GITHUB_WORKSPACE: scratch,
    GH_AW_WORKFLOW_NAME: 'Squad', GH_AW_RUN_URL: 'https://github.com/owner/repo/actions/runs/1',
    ...env, GH_AW_AGENT_OUTPUT: outputPath,
  };
  const context = {
    repo: { owner: 'owner', repo: 'repo' }, runId: 1, eventName: 'issue_comment',
    payload: { issue: { number: 42 }, repository: { default_branch: 'dev' } },
  };
  const sandbox = createContext({
    core, github, context, console, Buffer, URL, TextDecoder, TextEncoder,
    process: { env: runtimeEnv, cwd: () => scratch },
  });
  sandbox.global = sandbox;
  const modules = new Map<string, { exports: Record<string, any> }>();
  const filesystem = {
    existsSync: (path: string) => path === outputPath,
    readFileSync: (path: string) => {
      if (path === outputPath) return readFileSync(outputPath, 'utf8');
      const template = sources.get(`prompts/${String(path).split('/prompts/')[1]}`);
      if (template !== undefined) return template;
      // Optional runner logs are absent; never read outside this fixture.
      throw Object.assign(new Error(`Fixture file absent: ${path}`), { code: 'ENOENT' });
    },
    readdirSync: () => [],
    mkdirSync: () => {},
    writeFileSync: () => {},
  };
  const load = (name: string): Record<string, any> => {
    if (modules.has(name)) return modules.get(name)!.exports;
    const source = sources.get(name);
    if (!source) throw new Error(`Unfetched pinned runtime dependency: ${name}`);
    const module = { exports: {} };
    modules.set(name, module);
    const require = (request: string): any => {
      if (request.startsWith('.')) return load(posix.normalize(posix.join(posix.dirname(name), request)));
      if (request === 'fs' || request === 'node:fs') return filesystem;
      if (request === 'os' || request === 'node:os') return { ...requireNode(request), tmpdir: () => scratch };
      if (['path', 'node:path', 'crypto', 'node:crypto', 'util', 'node:util'].includes(request)) return requireNode(request);
      if (['https', 'http', 'child_process'].includes(request)) return new Proxy({}, {
        get: (_target, method: string) => (command: string) => {
          if (request === 'child_process' && method === 'execSync' && command === 'git rev-parse --abbrev-ref HEAD') return 'dev\n';
          ioErrors.push(`Forbidden external IO: ${request}.${method}`);
          throw new Error(ioErrors.at(-1));
        },
      });
      throw new Error(`Forbidden runtime dependency: ${request}`);
    };
    compileFunction(source, ['module', 'exports', 'require', '__dirname', '__filename'],
      { parsingContext: sandbox })(module, module.exports, require, dirname(name), name);
    return module.exports;
  };
  return {
    logs, failures, writes, calls, ioErrors,
    run: async (name: string) => {
      load('js/setup_globals.cjs').setupGlobals(core, github, context, {}, {}, () => github);
      return load(`js/${name}`).main();
    },
  };
}
