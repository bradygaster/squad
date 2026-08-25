import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// #1748 slice S1: `squad-deps-worker.md` is a *scaffold*. It exists so the
// extensionless manifest/lockfile basenames (`go.mod`, `go.sum`, `yarn.lock`,
// `package-lock.json`, ...) have an explicit home in `allowed-files` before
// slice S2 adds Wave 1 `protected-files.exclude` entries. Until S2 lands, this
// worker's `protected-files` carries NO exclusions -- every manifest write
// still falls back to a review issue, identical to `squad-implement-worker`.
// These tests assert that current, deliberately inert, fail-closed state and
// guard the general worker against silently gaining manifest authority.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

function frontmatter(markdown: string): string {
  return markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

function yamlBlock(yaml: string, key: string): string {
  const lines = yaml.split(/\r?\n/);
  const keyPattern = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.*)$`);
  const start = lines.findIndex(line => keyPattern.test(line));
  if (start === -1) return '';

  const match = lines[start].match(keyPattern)!;
  const indent = match[1].length;
  const block = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    block.push(line);
  }
  return block.join('\n');
}

function scalarInBlock(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'm'));
  return match?.[1].trim().replace(/^['"]|['"]$/g, '');
}

function listInBlock(block: string, key: string): string[] {
  const lines = block.split(/\r?\n/);
  const inline = block.match(new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*\\[(.*)\\]\\s*$`, 'm'));
  if (inline) {
    return inline[1]
      .split(',')
      .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  const keyPattern = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*$`);
  const start = lines.findIndex(line => keyPattern.test(line));
  if (start === -1) return [];

  const indent = lines[start].match(keyPattern)![1].length;
  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    const item = line.match(/^\s+-\s+(.+)$/)?.[1];
    if (item) items.push(item.trim().replace(/^['"]|['"]$/g, ''));
  }
  return items;
}

const compileWorkspaces: string[] = [];

afterAll(() => {
  for (const workspace of compileWorkspaces) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

/**
 * Compiles `squad-deps-worker` in an isolated workspace and returns the
 * decoded `create_pull_request` safe-output config gh-aw baked into the
 * `.lock.yml`. This is the only place the *compiled* (as opposed to
 * hand-authored source) `protected_files`/`allowed_files` contract is
 * observable -- gh-aw's built-in manifest catalog is merged in at compile
 * time and is not otherwise visible from the workflow source file.
 */
function compileDepsWorker(): Record<string, unknown> {
  const workspace = mkdtempSync(resolve(tmpdir(), 'squad-deps-worker-contract-'));
  compileWorkspaces.push(workspace);
  const workflowDir = resolve(workspace, '.github', 'workflows');
  mkdirSync(workflowDir, { recursive: true });
  cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  execFileSync(
    'gh',
    ['aw', 'compile', 'squad-deps-worker', '--strict', '--no-check-update'],
    { cwd: workspace, encoding: 'utf8', stdio: 'pipe' },
  );

  const compiled = readFileSync(resolve(workflowDir, 'squad-deps-worker.lock.yml'), 'utf8');
  const lines = compiled.split(/\r?\n/);
  const configStart = lines.findIndex(line => line.includes('/safeoutputs/config.json') && line.includes('<<'));
  const delimiter = lines[configStart]?.match(/<< '([^']+)'/)?.[1];
  const configEnd = delimiter
    ? lines.findIndex((line, index) => index > configStart && line.trim() === delimiter)
    : -1;

  expect(configStart, 'compiled deps worker must write the safe-output config').toBeGreaterThanOrEqual(0);
  expect(delimiter, 'safe-output config must use a parseable heredoc delimiter').toBeDefined();
  expect(configEnd, 'safe-output config heredoc must be terminated').toBeGreaterThan(configStart);

  const safeOutputs = JSON.parse(lines.slice(configStart + 1, configEnd).join('\n')) as Record<
    string,
    Record<string, unknown>
  >;
  return safeOutputs.create_pull_request;
}

// Wave 1 (npm/yarn/pnpm + NuGet CPM + Go) manifest/lockfile basenames that
// gh-aw's basename-anywhere protected-files matching cannot resolve from an
// extension pattern alone (issue #1748's Flight Decision comment, APPROVED --
// IMPLEMENTATION-READY, 2026-08-25, "allowed-files gap").
const WAVE_1_EXTENSIONLESS_BASENAMES = ['go.mod', 'go.sum', 'yarn.lock'];
const WAVE_1_MANIFEST_BASENAMES = [
  'go.mod',
  'go.sum',
  'yarn.lock',
  'package-lock.json',
  'package.json',
  'pnpm-lock.yaml',
  'npm-shrinkwrap.json',
  'Directory.Packages.props',
];

// Registry/install config, SDK/tool pins, and governance docs that must stay
// protected in every wave regardless of ecosystem scope or opt-out (issue
// #1748's Flight Decision comment, APPROVED -- IMPLEMENTATION-READY,
// 2026-08-25, "Always-protected" list + "bunfig.toml ruling").
const ALWAYS_PROTECTED_BASENAMES = [
  'bunfig.toml',
  'NuGet.Config',
  'global.json',
  'CODEOWNERS',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'DESIGN.md',
  'AGENTS.md',
];

describe('gh-aw squad-deps-worker scaffold (#1748 slice S1)', () => {
  const dispatcher = read('workflows/squad.md');
  const generalWorker = read('workflows/squad-implement-worker.md');
  const depsWorker = read('workflows/squad-deps-worker.md');
  const dispatcherFrontmatter = frontmatter(dispatcher);
  const generalWorkerFrontmatter = frontmatter(generalWorker);
  const depsWorkerFrontmatter = frontmatter(depsWorker);

  it('is a standalone workflow_dispatch worker, not yet wired into the dispatcher', () => {
    expect(depsWorkerFrontmatter).toMatch(/^on:\r?\n\s+bots: \["github-actions\[bot\]"\]\r?\n\s+workflow_dispatch:/m);
    expect(depsWorker).not.toContain('slash_command:');
    expect(depsWorkerFrontmatter).toContain('issue_number:');
    expect(depsWorkerFrontmatter).toContain('aw_context:');
    expect(depsWorker).toMatch(/^tools:\r?\n\s+edit:/m);

    // S3 (dispatcher/config routing) has not landed yet -- the deps worker
    // must not be reachable from `squad.md`'s dispatch-workflow allowlist
    // until that slice explicitly wires it in.
    const dispatcherDispatch = yamlBlock(dispatcherFrontmatter, 'dispatch-workflow');
    expect(listInBlock(dispatcherDispatch, 'workflows')).not.toContain('squad-deps-worker');
  });

  it('declares Wave 1 extensionless manifest/lockfile basenames in allowed-files (T3)', () => {
    const allowedFiles = listInBlock(yamlBlock(depsWorkerFrontmatter, 'allowed-files'), 'allowed-files');

    for (const basename of WAVE_1_EXTENSIONLESS_BASENAMES) {
      expect(allowedFiles, `${basename} must be explicitly allowed`).toContain(basename);
    }
    expect(allowedFiles).toContain('package-lock.json');
    expect(allowedFiles).toContain('package.json');
  });

  it('keeps dependency-manifest authority narrow: no broad source-file globs', () => {
    const allowedFiles = listInBlock(yamlBlock(depsWorkerFrontmatter, 'allowed-files'), 'allowed-files');

    // The general worker's broad source-tree allowlist (extensions, `src/**`,
    // language directories, etc.) must not leak into the deps worker -- its
    // entire reason to exist is that it can touch nothing but dependency
    // manifests and lockfiles.
    const broadPatternsFromGeneralWorker = [
      '*.ts',
      '**/*.ts',
      '*.py',
      '**/*.py',
      '*.md',
      '**/*.md',
      'src/**',
      'docs/**',
      'Makefile',
    ];
    for (const pattern of broadPatternsFromGeneralWorker) {
      expect(allowedFiles, `${pattern} must not appear in the deps worker's allowed-files`).not.toContain(pattern);
    }

    // Registry/install config and governance basenames must never be
    // authorized at all -- being absent from `allowed-files` blocks them
    // structurally before `protected-files` is even evaluated.
    for (const basename of ALWAYS_PROTECTED_BASENAMES) {
      expect(allowedFiles, `${basename} must not be in allowed-files`).not.toContain(basename);
    }
    expect(allowedFiles).not.toContain('.npmrc');
    expect(allowedFiles).not.toContain('.yarnrc.yml');
  });

  it('carries no protected-files exclusions yet (S2 has not landed)', () => {
    const protectedFiles = yamlBlock(depsWorkerFrontmatter, 'protected-files');

    expect(scalarInBlock(protectedFiles, 'policy')).toBe('fallback-to-issue');
    expect(scalarInBlock(protectedFiles, 'policy')).not.toBe('request_review');
    expect(scalarInBlock(protectedFiles, 'policy')).not.toBe('allowed');
    // No `exclude:` key at all -- every manifest basename still falls back to
    // a review issue today. Slice S2 introduces the Wave 1 exclude list.
    expect(listInBlock(protectedFiles, 'exclude')).toEqual([]);
  });

  it('structurally strips vendored/generated content from any produced patch', () => {
    const excludedFiles = listInBlock(yamlBlock(depsWorkerFrontmatter, 'excluded-files'), 'excluded-files');

    expect(excludedFiles).toEqual(
      expect.arrayContaining([
        'node_modules/**',
        '**/node_modules/**',
        'vendor/**',
        '**/vendor/**',
        '.github/workflows/**',
        '**/.github/workflows/**',
        '.github/agents/**',
        '**/.github/agents/**',
        '.github/aw/**',
        '**/.github/aw/**',
        '.squad/**',
        '**/.squad/**',
      ]),
    );
  });

  it('leaves squad-implement-worker with no manifest exclusions (general path unchanged)', () => {
    const protectedFiles = yamlBlock(generalWorkerFrontmatter, 'protected-files');
    const excludeList = listInBlock(protectedFiles, 'exclude');

    expect(scalarInBlock(protectedFiles, 'policy')).toBe('fallback-to-issue');
    expect(excludeList).toEqual(['README.md']);
    for (const basename of [...WAVE_1_MANIFEST_BASENAMES, ...ALWAYS_PROTECTED_BASENAMES]) {
      expect(excludeList, `${basename} must not be excluded on the general path`).not.toContain(basename);
    }
  });

  it(
    'compiles cleanly and bakes in a fail-closed protected-files contract',
    () => {
      const config = compileDepsWorker();

      expect(config.protected_files_policy).toBe('fallback-to-issue');
      expect(config.protect_top_level_dot_folders).toBe(true);

      const compiledProtectedFiles = config.protected_files as string[];
      const compiledAllowedFiles = config.allowed_files as string[];
      const compiledExcludedFiles = config.excluded_files as string[];

      // Nothing has been excluded from protection yet: every Wave 1 manifest
      // basename this worker is allowed to *see* still resolves to
      // `fallback-to-issue` when it appears in a patch.
      for (const basename of WAVE_1_MANIFEST_BASENAMES) {
        expect(compiledProtectedFiles, `${basename} must still be protected (S2 has not landed)`).toContain(
          basename,
        );
      }
      // Registry/config and governance files stay protected in gh-aw's
      // built-in catalog regardless of this worker's allowed-files scope.
      for (const basename of ALWAYS_PROTECTED_BASENAMES) {
        expect(compiledProtectedFiles, `${basename} must remain protected`).toContain(basename);
      }

      for (const basename of WAVE_1_EXTENSIONLESS_BASENAMES) {
        expect(compiledAllowedFiles).toContain(basename);
      }
      expect(compiledExcludedFiles).toEqual(
        expect.arrayContaining(['node_modules/**', 'vendor/**', '.squad/**']),
      );
    },
    20000,
  );

  it('does not change squad-implement-worker.md at all', () => {
    // Structural regression guard: compiling the general worker in the same
    // workspace must still exclude only README.md -- the new deps worker file
    // must have zero effect on the general worker's compiled contract.
    const workspace = mkdtempSync(resolve(tmpdir(), 'squad-implement-worker-unaffected-'));
    compileWorkspaces.push(workspace);
    const workflowDir = resolve(workspace, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    execFileSync(
      'gh',
      ['aw', 'compile', 'squad-implement-worker', '--strict', '--no-check-update'],
      { cwd: workspace, encoding: 'utf8', stdio: 'pipe' },
    );

    const compiled = readFileSync(resolve(workflowDir, 'squad-implement-worker.lock.yml'), 'utf8');
    const lines = compiled.split(/\r?\n/);
    const configStart = lines.findIndex(line => line.includes('/safeoutputs/config.json') && line.includes('<<'));
    const delimiter = lines[configStart]?.match(/<< '([^']+)'/)?.[1];
    const configEnd = delimiter
      ? lines.findIndex((line, index) => index > configStart && line.trim() === delimiter)
      : -1;

    expect(configStart, 'compiled general worker must write the safe-output config').toBeGreaterThanOrEqual(0);
    expect(delimiter, 'safe-output config must use a parseable heredoc delimiter').toBeDefined();
    expect(configEnd, 'safe-output config heredoc must be terminated').toBeGreaterThan(configStart);

    const safeOutputs = JSON.parse(lines.slice(configStart + 1, configEnd).join('\n')) as Record<
      string,
      Record<string, unknown>
    >;
    const compiledProtectedFiles = safeOutputs.create_pull_request.protected_files as string[];

    for (const basename of WAVE_1_MANIFEST_BASENAMES) {
      expect(compiledProtectedFiles).toContain(basename);
    }
  }, 20000);
});
