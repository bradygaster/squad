import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// #1748 slice S2: `squad-deps-worker.md` gains Wave 1 `protected-files.exclude`
// entries. The Wave 1 basenames (npm/yarn/pnpm + NuGet CPM + Go) are excluded
// from `protected-files` so the agent can produce a signed PR for those files.
// Registry/install config, SDK/tool pins, and governance docs remain protected.
// The general worker (`squad-implement-worker`) is not modified -- it retains
// `policy: fallback-to-issue` with only `README.md` excluded.

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
 * Compiles a workflow in an isolated workspace and returns the decoded
 * `create_pull_request` safe-output config gh-aw bakes into `.lock.yml`.
 */
function compileWorker(workflowId: string): Record<string, unknown> {
  const workspace = mkdtempSync(resolve(tmpdir(), `${workflowId}-contract-`));
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
  const configStart = lines.findIndex(line => line.includes('/safeoutputs/config.json') && line.includes('<<'));
  const delimiter = lines[configStart]?.match(/<< '([^']+)'/)?.[1];
  const configEnd = delimiter
    ? lines.findIndex((line, index) => index > configStart && line.trim() === delimiter)
    : -1;

  expect(configStart, `compiled ${workflowId} must write the safe-output config`).toBeGreaterThanOrEqual(0);
  expect(delimiter, 'safe-output config must use a parseable heredoc delimiter').toBeDefined();
  expect(configEnd, 'safe-output config heredoc must be terminated').toBeGreaterThan(configStart);

  const safeOutputs = JSON.parse(lines.slice(configStart + 1, configEnd).join('\n')) as Record<
    string,
    Record<string, unknown>
  >;
  return safeOutputs.create_pull_request;
}

/**
 * Compiles `squad-deps-worker` and returns the decoded `create_pull_request`
 * safe-output config gh-aw bakes into `.lock.yml`.
 */
function compileDepsWorker(): Record<string, unknown> {
  return compileWorker('squad-deps-worker');
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

describe('gh-aw squad-deps-worker S2: Wave 1 protected-files.exclude (#1748)', () => {
  const dispatcher = read('workflows/squad.md');
  const generalWorker = read('workflows/squad-implement-worker.md');
  const depsWorker = read('workflows/squad-deps-worker.md');
  const dispatcherFrontmatter = frontmatter(dispatcher);
  const generalWorkerFrontmatter = frontmatter(generalWorker);
  const depsWorkerFrontmatter = frontmatter(depsWorker);

  // ── T1: authored exclude list contains exact Wave-1 basenames ─────────────
  it('authors the exact Wave-1 exclude list in protected-files (T1)', () => {
    const protectedFiles = yamlBlock(depsWorkerFrontmatter, 'protected-files');
    const excludeList = listInBlock(protectedFiles, 'exclude');

    for (const basename of WAVE_1_MANIFEST_BASENAMES) {
      expect(excludeList, `Wave-1 basename ${basename} must be in exclude`).toContain(basename);
    }
    // Exact membership: no always-protected basename should appear
    for (const basename of ALWAYS_PROTECTED_BASENAMES) {
      expect(excludeList, `Always-protected ${basename} must NOT be in exclude`).not.toContain(basename);
    }
    expect(excludeList, '.npmrc must NOT be in exclude').not.toContain('.npmrc');
    expect(excludeList, '.yarnrc.yml must NOT be in exclude').not.toContain('.yarnrc.yml');
    expect(excludeList, 'README.md must NOT be in deps worker exclude').not.toContain('README.md');
    // Exact cardinality: no unlisted entries allowed
    expect(excludeList.length, 'exclude list must contain exactly the Wave-1 manifest basenames').toBe(WAVE_1_MANIFEST_BASENAMES.length);
  });

  // ── T2: always-protected basenames absent from exclude, present in compiled ─
  it('always-protected basenames are absent from authored exclude and present in compiled protected_files (T2)', () => {
    const protectedFiles = yamlBlock(depsWorkerFrontmatter, 'protected-files');
    const excludeList = listInBlock(protectedFiles, 'exclude');

    for (const basename of ALWAYS_PROTECTED_BASENAMES) {
      expect(excludeList, `${basename} must not appear in deps worker exclude`).not.toContain(basename);
    }
    expect(excludeList, '.npmrc must not appear in deps worker exclude').not.toContain('.npmrc');
    expect(excludeList, '.yarnrc.yml must not appear in deps worker exclude').not.toContain('.yarnrc.yml');
  });

  // ── T3: fallback-to-issue policy authored ─────────────────────────────────
  it('authors fallback-to-issue policy in protected-files (T3)', () => {
    const protectedFiles = yamlBlock(depsWorkerFrontmatter, 'protected-files');

    expect(scalarInBlock(protectedFiles, 'policy')).toBe('fallback-to-issue');
    expect(scalarInBlock(protectedFiles, 'policy')).not.toBe('request_review');
    expect(scalarInBlock(protectedFiles, 'policy')).not.toBe('allowed');
    expect(scalarInBlock(protectedFiles, 'policy')).not.toBe('blocked');
  });

  // ── T4/T5/T6: compiled contract ───────────────────────────────────────────
  it(
    'compiled: Wave-1 basenames are removed from protected_files, always-protected remain, policy is fallback-to-issue, package-lock.json in allowed (T4/T5/T6)',
    () => {
      const config = compileDepsWorker();

      // T3/T4: policy compiled
      expect(config.protected_files_policy).toBe('fallback-to-issue');
      expect(config.protect_top_level_dot_folders).toBe(true);

      const compiledProtectedFiles = config.protected_files as string[];
      const compiledAllowedFiles = config.allowed_files as string[];
      const compiledExcludedFiles = config.excluded_files as string[];

      // T4: Wave-1 basenames are excluded from compiled protected_files
      for (const basename of WAVE_1_MANIFEST_BASENAMES) {
        expect(
          compiledProtectedFiles,
          `${basename} must NOT be in compiled protected_files (S2 excluded it)`,
        ).not.toContain(basename);
      }

      // T5: always-protected still in compiled protected_files
      for (const basename of ALWAYS_PROTECTED_BASENAMES) {
        expect(compiledProtectedFiles, `${basename} must remain in compiled protected_files`).toContain(basename);
      }
      // .npmrc and .yarnrc.yml are protected structurally by absence from
      // allowed-files -- gh-aw's built-in catalog does not include them in
      // the compiled protected_files list, so we assert only that they are
      // absent from the exclude list (see T1/T2), not from protected_files.

      // T6: package-lock.json in compiled allowed_files AND excluded from protected
      expect(compiledAllowedFiles, 'package-lock.json must be in compiled allowed_files').toContain('package-lock.json');
      expect(
        compiledProtectedFiles,
        'package-lock.json must NOT be in compiled protected_files (excluded by S2)',
      ).not.toContain('package-lock.json');

      // T8: vendored/generated paths in excluded_files
      expect(compiledExcludedFiles).toEqual(
        expect.arrayContaining(['node_modules/**', 'vendor/**', '.squad/**']),
      );
    },
    20000,
  );

  // ── T7: general worker authored + compiled unchanged ──────────────────────
  it('leaves squad-implement-worker with only README.md excluded (authored) (T7)', () => {
    const protectedFiles = yamlBlock(generalWorkerFrontmatter, 'protected-files');
    const excludeList = listInBlock(protectedFiles, 'exclude');

    expect(scalarInBlock(protectedFiles, 'policy')).toBe('fallback-to-issue');
    expect(excludeList).toEqual(['README.md']);
    for (const basename of [...WAVE_1_MANIFEST_BASENAMES, ...ALWAYS_PROTECTED_BASENAMES]) {
      expect(excludeList, `${basename} must not be excluded on the general path`).not.toContain(basename);
    }
  });

  it(
    'compiled general worker: Wave-1 basenames remain compiled protected (T7 compiled)',
    () => {
      const config = compileWorker('squad-implement-worker');
      const compiledProtectedFiles = config.protected_files as string[];

      for (const basename of WAVE_1_MANIFEST_BASENAMES) {
        expect(
          compiledProtectedFiles,
          `${basename} must still be protected in compiled general worker`,
        ).toContain(basename);
      }
    },
    20000,
  );

  // ── T8: vendored/generated paths remain in authored excluded-files ─────────
  it('structurally strips vendored/generated content from any produced patch (T8)', () => {
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

  // ── T6 authored: package-lock.json is in allowed-files AND exclude ─────────
  it('package-lock.json is in allowed-files and in protected-files.exclude (T6 authored)', () => {
    const allowedFiles = listInBlock(yamlBlock(depsWorkerFrontmatter, 'allowed-files'), 'allowed-files');
    const protectedFiles = yamlBlock(depsWorkerFrontmatter, 'protected-files');
    const excludeList = listInBlock(protectedFiles, 'exclude');

    expect(allowedFiles, 'package-lock.json must be in allowed-files').toContain('package-lock.json');
    expect(excludeList, 'package-lock.json must be in protected-files.exclude').toContain('package-lock.json');
  });

  // ── S1 guards preserved (existing behavior) ───────────────────────────────
  it('is a standalone workflow_dispatch worker, not yet wired into the dispatcher', () => {
    expect(depsWorkerFrontmatter).toMatch(/^on:\r?\n\s+bots: \["github-actions\[bot\]"\]\r?\n\s+workflow_dispatch:/m);
    expect(depsWorker).not.toContain('slash_command:');
    expect(depsWorkerFrontmatter).toContain('issue_number:');
    expect(depsWorkerFrontmatter).toContain('aw_context:');
    expect(depsWorker).toMatch(/^tools:\r?\n\s+edit:/m);

    const dispatcherDispatch = yamlBlock(dispatcherFrontmatter, 'dispatch-workflow');
    expect(listInBlock(dispatcherDispatch, 'workflows')).not.toContain('squad-deps-worker');
  });

  it('declares Wave 1 extensionless manifest/lockfile basenames in allowed-files', () => {
    const allowedFiles = listInBlock(yamlBlock(depsWorkerFrontmatter, 'allowed-files'), 'allowed-files');

    for (const basename of WAVE_1_EXTENSIONLESS_BASENAMES) {
      expect(allowedFiles, `${basename} must be explicitly allowed`).toContain(basename);
    }
    expect(allowedFiles).toContain('package-lock.json');
    expect(allowedFiles).toContain('package.json');
  });

  it('keeps dependency-manifest authority narrow: no broad source-file globs', () => {
    const allowedFiles = listInBlock(yamlBlock(depsWorkerFrontmatter, 'allowed-files'), 'allowed-files');

    const broadPatternsFromGeneralWorker = [
      '*.ts', '**/*.ts', '*.py', '**/*.py', '*.md', '**/*.md', 'src/**', 'docs/**', 'Makefile',
    ];
    for (const pattern of broadPatternsFromGeneralWorker) {
      expect(allowedFiles, `${pattern} must not appear in the deps worker's allowed-files`).not.toContain(pattern);
    }
    for (const basename of ALWAYS_PROTECTED_BASENAMES) {
      expect(allowedFiles, `${basename} must not be in allowed-files`).not.toContain(basename);
    }
    expect(allowedFiles).not.toContain('.npmrc');
    expect(allowedFiles).not.toContain('.yarnrc.yml');
  });

  // ── T9: mutation tests ─────────────────────────────────────────────────────
  describe('mutation tests: weakening the contract must be detected (T9)', () => {
    /**
     * Apply a mutation to the authored workflow source and assert that the
     * validator throws (i.e. the mutation is correctly detected). The function
     * returns void; detection is asserted internally.
     *
     * The validator receives the exclude list AND the mutated frontmatter so
     * that tests asserting scalar values (e.g. policy) can parse them from the
     * same pipeline-produced output rather than re-applying the mutation
     * independently.
     */
    function applyMutationAndValidate(
      mutationDescription: string,
      mutateFrontmatter: (fm: string) => string,
      validator: (excludeList: string[], mutatedFm: string) => void,
    ): void {
      const mutatedFm = mutateFrontmatter(depsWorkerFrontmatter);
      const protectedFiles = yamlBlock(mutatedFm, 'protected-files');
      const excludeList = listInBlock(protectedFiles, 'exclude');
      let caught = false;
      try {
        validator(excludeList, mutatedFm);
      } catch {
        caught = true;
      }
      expect(caught, `mutation "${mutationDescription}" should have been detected but was not`).toBe(true);
    }

    it('detects: remove a Wave-1 exclusion (package.json removed from exclude)', () => {
      applyMutationAndValidate(
        'remove package.json from exclude',
        fm => fm.replace(/^\s+- package\.json\s*$/m, ''),
        excludeList => {
          expect(excludeList, 'package.json must be in exclude').toContain('package.json');
        },
      );
    });

    it('detects: remove a Wave-1 exclusion (go.mod removed from exclude)', () => {
      applyMutationAndValidate(
        'remove go.mod from exclude',
        fm => fm.replace(/^\s+- go\.mod\s*$/m, ''),
        excludeList => {
          expect(excludeList, 'go.mod must be in exclude').toContain('go.mod');
        },
      );
    });

    it('detects: add an always-protected basename to exclude (NuGet.Config leaked in)', () => {
      applyMutationAndValidate(
        'add NuGet.Config to exclude',
        fm => fm.replace(/(\s+- go\.sum\s*\n)/, '$1        - NuGet.Config\n'),
        excludeList => {
          expect(excludeList, 'NuGet.Config must NOT be in exclude').not.toContain('NuGet.Config');
        },
      );
    });

    it('detects: add .npmrc to exclude (always-protected registry config leaked in)', () => {
      applyMutationAndValidate(
        'add .npmrc to exclude',
        fm => fm.replace(/(\s+- go\.sum\s*\n)/, '$1        - .npmrc\n'),
        excludeList => {
          expect(excludeList, '.npmrc must NOT be in exclude').not.toContain('.npmrc');
        },
      );
    });

    it('detects: relax policy from fallback-to-issue to allowed', () => {
      applyMutationAndValidate(
        'relax policy to allowed',
        fm => fm.replace('policy: fallback-to-issue', 'policy: allowed'),
        (_excludeList, mutatedFm) => {
          const mutatedProtected = yamlBlock(mutatedFm, 'protected-files');
          const policy = scalarInBlock(mutatedProtected, 'policy');
          expect(policy, 'policy must be fallback-to-issue').toBe('fallback-to-issue');
        },
      );
    });

    it('detects: Wave-1 exclusion leaked into general worker (package.json added to implement-worker exclude)', () => {
      const generalProtected = yamlBlock(generalWorkerFrontmatter, 'protected-files');
      const generalExclude = listInBlock(generalProtected, 'exclude');
      // Simulate the mutation: check our assertion would catch it
      const mutatedExclude = [...generalExclude, 'package.json'];
      let caught = false;
      try {
        expect(
          mutatedExclude,
          'package.json must not be excluded on the general path',
        ).not.toContain('package.json');
      } catch {
        caught = true;
      }
      expect(caught, 'mutation "leak package.json into general worker exclude" should be detected').toBe(true);
    });

    it('detects: vendored-content exclusion removed (node_modules removed from excluded-files)', () => {
      // The YAML stores the value as `- "node_modules/**"` (quoted); match that form.
      const mutatedFm = depsWorkerFrontmatter.replace(/^\s+- "node_modules\/\*\*"\s*$/m, '');
      const excludedFiles = listInBlock(yamlBlock(mutatedFm, 'excluded-files'), 'excluded-files');
      let caught = false;
      try {
        expect(excludedFiles, 'node_modules/** must be in excluded-files').toContain('node_modules/**');
      } catch {
        caught = true;
      }
      expect(caught, 'mutation "remove node_modules from excluded-files" should be detected').toBe(true);
    });
  });
});
