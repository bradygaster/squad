import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WAVE_1_BASENAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Directory.Packages.props',
  'go.mod',
  'go.sum',
]);

interface RoutingFixture {
  name: string;
  title: string;
  body: string;
  requiredFiles: string[];
  config: string;
  expectedWorkflow: 'squad-deps-worker' | 'squad-implement-worker' | 'denied';
}

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

function frontmatter(markdown: string): string {
  return markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

function yamlBlock(yaml: string, key: string): string {
  const lines = yaml.split(/\r?\n/);
  const keyPattern = new RegExp(
    `^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*)$`,
  );
  const start = lines.findIndex(line => keyPattern.test(line));
  if (start === -1) return '';

  const indent = lines[start].match(keyPattern)![1].length;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    block.push(line);
  }
  return block.join('\n');
}

function listInBlock(block: string, key: string): string[] {
  const inline = block.match(
    new RegExp(
      `^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\[(.*)\\]\\s*$`,
      'm',
    ),
  );
  if (inline) {
    return inline[1]
      .split(',')
      .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  return [];
}

function explicitDependencyIntent(title: string, body: string): boolean {
  const task = `${title}\n${body}`.toLowerCase();
  return (
    /\b(add|install|remove|uninstall|update|upgrade|bump)\b[\s\S]*\b(package|dependency|dependencies|module|lockfile)\b/.test(
      task,
    ) ||
    /\bregenerate\b[\s\S]*\blockfile\b/.test(task) ||
    /\badd\b[\s\S]*\b(package\.json|package-lock\.json|go\.mod|go\.sum|directory\.packages\.props)\b/.test(
      task,
    )
  );
}

function dependencyConfigAllows(configText: string): boolean {
  let config: unknown;
  try {
    config = JSON.parse(configText);
  } catch {
    return false;
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) return false;
  const object = config as Record<string, unknown>;
  if (!Object.hasOwn(object, 'squadDeps')) return true;
  return object.squadDeps === 'allow';
}

function routeFixture(fixture: RoutingFixture): RoutingFixture['expectedWorkflow'] {
  const dependencyOnly =
    fixture.requiredFiles.length > 0 &&
    fixture.requiredFiles.every(file => WAVE_1_BASENAMES.has(basename(file)));
  if (!explicitDependencyIntent(fixture.title, fixture.body) || !dependencyOnly) {
    return 'squad-implement-worker';
  }
  return dependencyConfigAllows(fixture.config) ? 'squad-deps-worker' : 'denied';
}

const compileWorkspaces: string[] = [];

afterAll(() => {
  for (const workspace of compileWorkspaces) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function compileSafeOutputs(workflowId: string): Record<string, Record<string, unknown>> {
  const workspace = mkdtempSync(resolve(tmpdir(), `${workflowId}-routing-contract-`));
  compileWorkspaces.push(workspace);
  const workflowDir = resolve(workspace, '.github', 'workflows');
  mkdirSync(workflowDir, { recursive: true });
  cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  execFileSync(
    'gh',
    ['aw', 'compile', workflowId, '--strict', '--no-check-update'],
    { cwd: workspace, encoding: 'utf8', stdio: 'pipe' },
  );

  const compiled = readFileSync(resolve(workflowDir, `${workflowId}.lock.yml`), 'utf8');
  const lines = compiled.split(/\r?\n/);
  const configStart = lines.findIndex(
    line => line.includes('/safeoutputs/config.json') && line.includes('<<'),
  );
  const delimiter = lines[configStart]?.match(/<< '([^']+)'/)?.[1];
  const configEnd = delimiter
    ? lines.findIndex((line, index) => index > configStart && line.trim() === delimiter)
    : -1;

  expect(configStart, `${workflowId} must compile safe-output config`).toBeGreaterThanOrEqual(0);
  expect(delimiter, `${workflowId} safe-output delimiter must be present`).toBeDefined();
  expect(configEnd, `${workflowId} safe-output config must terminate`).toBeGreaterThan(configStart);
  return JSON.parse(lines.slice(configStart + 1, configEnd).join('\n')) as Record<
    string,
    Record<string, unknown>
  >;
}

describe('gh-aw dependency dispatcher routing (#1748 S3)', () => {
  const dispatcher = read('workflows/squad.md');
  const depsWorker = read('workflows/squad-deps-worker.md');
  const generalWorker = read('workflows/squad-implement-worker.md');
  const fixtures = JSON.parse(
    read('test/fixtures/gh-aw-deps-routing.json'),
  ) as RoutingFixture[];
  const dispatcherTargets = listInBlock(
    yamlBlock(frontmatter(dispatcher), 'dispatch-workflow'),
    'workflows',
  );

  it('wires both workers and keeps the dependency route conservative', () => {
    expect(dispatcherTargets).toEqual(
      expect.arrayContaining(['squad-implement-worker', 'squad-deps-worker']),
    );
    expect(dispatcher).toContain('Choose `squad_deps_worker` only when **all**');
    expect(dispatcher).toContain(
      'Choose `squad_implement_worker` for every other task.',
    );
    expect(dispatcher).toContain('Never call both workers for one issue.');
    expect(dispatcher).toContain(
      'do not reroute it to the general worker',
    );
  });

  it.each(fixtures)('fixture: $name -> $expectedWorkflow', fixture => {
    const routed = routeFixture(fixture);
    expect(routed).toBe(fixture.expectedWorkflow);
    if (routed !== 'denied') {
      expect(dispatcherTargets).toContain(routed);
      const toolName = routed.replaceAll('-', '_');
      expect(dispatcher).toContain(`\`${toolName}\``);
    }
  });

  it('fails closed for every unrecognized squadDeps value', () => {
    for (const denied of [
      '{"squadDeps":"ALLOW"}',
      '{"squadDeps":"unexpected"}',
      '{"squadDeps":true}',
      '{"squadDeps":1}',
      '{"squadDeps":null}',
      '{"squadDeps":[]}',
      '{"squadDeps":{}}',
      '[]',
      'not-json',
    ]) {
      expect(dependencyConfigAllows(denied), denied).toBe(false);
    }
    expect(dependencyConfigAllows('{}')).toBe(true);
    expect(dependencyConfigAllows('{"squadDeps":"allow"}')).toBe(true);
    expect(dependencyConfigAllows('{"squadDeps":"deny"}')).toBe(false);
    expect(dispatcher).toContain('Every other value, including any other string');
    expect(depsWorker).toContain('Any other value -- including another string');
  });

  it(
    'strict-compiles dispatcher targets and preserves dependency/general file boundaries',
    () => {
      const dispatcherSafeOutputs = compileSafeOutputs('squad');
      const depsSafeOutputs = compileSafeOutputs('squad-deps-worker');
      const generalSafeOutputs = compileSafeOutputs('squad-implement-worker');
      const dispatch = dispatcherSafeOutputs.dispatch_workflow;
      const depsPullRequest = depsSafeOutputs.create_pull_request;
      const generalPullRequest = generalSafeOutputs.create_pull_request;

      expect(dispatch.aw_context_workflows).toEqual(
        expect.arrayContaining([
          'squad-implement-worker',
          'squad-deps-worker',
        ]),
      );

      const depsAllowed = depsPullRequest.allowed_files as string[];
      const depsExcluded = depsPullRequest.excluded_files as string[];
      const depsProtected = depsPullRequest.protected_files as string[];
      const generalProtected = generalPullRequest.protected_files as string[];
      expect(depsAllowed).toEqual(
        expect.arrayContaining(['package.json', 'package-lock.json', 'go.mod', 'go.sum']),
      );
      expect(depsExcluded).toEqual(
        expect.arrayContaining([
          'node_modules/**',
          'vendor/**',
          '.github/workflows/**',
          '.squad/**',
        ]),
      );
      expect(depsProtected).not.toContain('package.json');
      expect(depsProtected).toContain('NuGet.Config');
      expect(generalProtected).toContain('package.json');
      expect(generalProtected).toContain('go.mod');
    },
    30000,
  );

  it('keeps the general worker structurally unchanged', () => {
    const protectedFiles = yamlBlock(frontmatter(generalWorker), 'protected-files');
    expect(protectedFiles).toContain('- README.md');
    expect(protectedFiles).not.toContain('- package.json');
    expect(protectedFiles).not.toContain('- go.mod');
  });
});
