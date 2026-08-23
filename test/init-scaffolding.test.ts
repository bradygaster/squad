/**
 * Init scaffolding completeness tests (#579)
 *
 * Verifies that `initSquad()` and `runInit()` produce a complete .squad/
 * directory — particularly the casting/ subtree that doctor validates.
 * Also confirms init works without errors in repos that have no remote.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'fs/promises';
import { join, resolve, relative, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { initSquad } from '@bradygaster/squad-sdk';
import type { InitOptions } from '@bradygaster/squad-sdk';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runDoctor } from '@bradygaster/squad-cli/commands/doctor';
import type { DoctorCheck } from '@bradygaster/squad-cli/commands/doctor';

// Sandbox lives in the OS temp dir, NOT inside the repository (#1796).
// runInit()/initSquad() walk upward to find the enclosing git root when the
// target directory is not itself a repo. A sandbox under process.cwd() therefore
// resolves to the *real* repository and stampVersion() rewrites the tracked
// .github/agents/squad.agent.md — a passing test silently mutating source.
const TEST_ROOT = join(tmpdir(), `.test-init-scaffold-${randomBytes(4).toString('hex')}`);

/** Repository root — used only by the working-tree guard below. */
const REPO_ROOT = resolve(__dirname, '..');

/** Files this suite must never touch. Relative to REPO_ROOT. */
const GUARDED_PATHS = ['.github/agents/squad.agent.md', '.squad-templates/squad.agent.md'];

/** Porcelain status of the guarded paths, so pre-existing local edits don't skew the guard. */
function guardedStatus(): string {
  return execFileSync('git', ['status', '--porcelain', '--', ...GUARDED_PATHS], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** Captured before any test in this file runs. */
let guardedStatusBefore = '';

beforeAll(() => {
  guardedStatusBefore = guardedStatus();
});


/** Create a bare git repo at the given path (no remote). */
function gitInit(dir: string): void {
  execFileSync('git', ['init'], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Configure git identity so commits don't fail
  execFileSync('git', ['config', 'user.email', 'test@test.local'], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  execFileSync('git', ['config', 'user.name', 'Test'], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Default InitOptions for SDK-level initSquad(). */
function sdkOptions(teamRoot: string): InitOptions {
  return {
    teamRoot,
    projectName: 'scaffold-test',
    agents: [{ name: 'edie', role: 'Engineer' }],
    configFormat: 'markdown',
    includeWorkflows: false,
  };
}

// ─── Casting directory scaffolding (SDK initSquad) ─────────────────────

describe('casting directory scaffolding — initSquad()', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('creates .squad/casting/ directory', async () => {
    await initSquad(sdkOptions(TEST_ROOT));
    expect(existsSync(join(TEST_ROOT, '.squad', 'casting'))).toBe(true);
  });

  it('creates .squad/casting/registry.json as valid JSON', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    const filePath = join(TEST_ROOT, '.squad', 'casting', 'registry.json');
    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    // Registry is an object (with agents key) or an array — both are valid
    expect(typeof parsed).toBe('object');
  });

  it('creates .squad/casting/policy.json as valid JSON', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    const filePath = join(TEST_ROOT, '.squad', 'casting', 'policy.json');
    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('creates .squad/casting/history.json as valid JSON', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    const filePath = join(TEST_ROOT, '.squad', 'casting', 'history.json');
    expect(existsSync(filePath)).toBe(true);

    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('does not overwrite existing casting files on re-init', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    // Modify registry.json to detect overwrite
    const registryPath = join(TEST_ROOT, '.squad', 'casting', 'registry.json');
    const original = await readFile(registryPath, 'utf-8');
    const modified = JSON.stringify({ agents: { sentinel: true } });
    await rm(registryPath);
    const { writeFile } = await import('fs/promises');
    await writeFile(registryPath, modified, 'utf-8');

    // Re-init
    await initSquad(sdkOptions(TEST_ROOT));

    const after = await readFile(registryPath, 'utf-8');
    expect(after).toContain('sentinel');
  });
});

// ─── Casting directory scaffolding (CLI runInit) ───────────────────────

describe('casting directory scaffolding — runInit()', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('creates all three casting files via CLI init', async () => {
    await runInit(TEST_ROOT);

    for (const file of ['registry.json', 'policy.json', 'history.json']) {
      const filePath = join(TEST_ROOT, '.squad', 'casting', file);
      expect(existsSync(filePath), `${file} should exist`).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      // Should parse without throwing
      const parsed = JSON.parse(content);
      expect(parsed).toBeDefined();
    }
  });
});

// ─── No-remote resilience ──────────────────────────────────────────────

describe('no-remote resilience (#579)', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('initSquad succeeds in a git repo with no remote', async () => {
    gitInit(TEST_ROOT);

    // Confirm no remote exists
    let hasRemote = true;
    try {
      execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: TEST_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      hasRemote = false;
    }
    expect(hasRemote).toBe(false);

    // Init should not throw
    await expect(initSquad(sdkOptions(TEST_ROOT))).resolves.toBeDefined();

    // Verify scaffolding completed
    expect(existsSync(join(TEST_ROOT, '.squad'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'casting', 'registry.json'))).toBe(true);
  });

  it('initSquad succeeds in a brand-new git repo (just git init)', async () => {
    gitInit(TEST_ROOT);

    const result = await initSquad(sdkOptions(TEST_ROOT));
    expect(result.createdFiles.length).toBeGreaterThan(0);
    expect(result.squadDir).toBeTruthy();
  });

  it('runInit succeeds in a git repo with no remote', async () => {
    gitInit(TEST_ROOT);

    // Should complete without error
    await expect(runInit(TEST_ROOT)).resolves.toBeUndefined();

    // Verify key output files
    expect(existsSync(join(TEST_ROOT, '.squad'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.github', 'agents', 'squad.agent.md'))).toBe(true);
  });

  it('runInit CLI: monorepo subfolder — no nested .git, agent at git root (#939)', async () => {
    // Set up a monorepo: git init at TEST_ROOT, run from a subfolder
    gitInit(TEST_ROOT);
    const subfolder = join(TEST_ROOT, 'services', 'api');
    await mkdir(subfolder, { recursive: true });

    // runInit from the subfolder — CLI should detect the parent git repo
    await expect(runInit(subfolder)).resolves.toBeUndefined();

    // 1. No nested .git/ in subfolder (the original bug)
    expect(existsSync(join(subfolder, '.git'))).toBe(false);
    // 2. .squad/ created in the subfolder
    expect(existsSync(join(subfolder, '.squad'))).toBe(true);
    expect(existsSync(join(subfolder, '.squad', 'casting', 'registry.json'))).toBe(true);
    // 3. squad.agent.md placed at the git root, not the subfolder
    expect(existsSync(join(TEST_ROOT, '.github', 'agents', 'squad.agent.md'))).toBe(true);
    expect(existsSync(join(subfolder, '.github', 'agents', 'squad.agent.md'))).toBe(false);
  });

  it('initSquad succeeds when git is not initialized at all', async () => {
    // TEST_ROOT is a plain directory — no git init
    await expect(initSquad(sdkOptions(TEST_ROOT))).resolves.toBeDefined();
    expect(existsSync(join(TEST_ROOT, '.squad', 'casting', 'registry.json'))).toBe(true);
  });

  it('monorepo subfolder: no nested git init, agent at root, .squad in subfolder (#939)', async () => {
    // Set up a monorepo with a subfolder
    gitInit(TEST_ROOT);
    const subfolder = join(TEST_ROOT, 'team-alpha');
    await mkdir(subfolder, { recursive: true });

    // Run SDK init with agentFileRoot pointing to the git root
    // Enable workflows to test monorepo skip behavior
    const result = await initSquad({
      ...sdkOptions(subfolder),
      agentFileRoot: TEST_ROOT,
      includeWorkflows: true,
    });

    // 1. No nested .git/ in subfolder
    expect(existsSync(join(subfolder, '.git'))).toBe(false);
    // 2. .squad/ created in subfolder
    expect(existsSync(join(subfolder, '.squad'))).toBe(true);
    expect(existsSync(join(subfolder, '.squad', 'casting', 'registry.json'))).toBe(true);
    // 3. squad.agent.md created at monorepo root
    expect(existsSync(join(TEST_ROOT, '.github', 'agents', 'squad.agent.md'))).toBe(true);
    // 4. squad.agent.md NOT in subfolder
    expect(existsSync(join(subfolder, '.github', 'agents', 'squad.agent.md'))).toBe(false);
    // 5. createdFiles should include relative path with ..
    expect(result.createdFiles.some(f => f.includes('squad.agent.md'))).toBe(true);
    // 6. Workflows NOT placed in subfolder (GitHub Actions ignores them there)
    expect(existsSync(join(subfolder, '.github', 'workflows'))).toBe(false);
    // 7. Warning emitted about skipped workflows
    expect(result.warnings?.some(w => w.includes('monorepo-subfolder'))).toBe(true);
  });
});

// ─── Doctor validation after init ──────────────────────────────────────

describe('doctor passes after init (#579)', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('doctor reports casting/registry.json as pass after initSquad()', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('pass');
  });

  it('doctor has zero failures after initSquad()', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    const checks = await runDoctor(TEST_ROOT);
    const failures = checks.filter((c: DoctorCheck) => c.status === 'fail');
    // All core checks should pass after a fresh init
    expect(failures).toEqual([]);
  });

  it('doctor reports casting/registry.json as pass after runInit()', async () => {
    await runInit(TEST_ROOT);

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('pass');
  });

  it('doctor fails when casting/registry.json is missing', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    // Remove registry.json
    await rm(join(TEST_ROOT, '.squad', 'casting', 'registry.json'));

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('fail');
  });

  it('doctor fails when casting/registry.json is invalid JSON', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    // Corrupt registry.json
    const { writeFile } = await import('fs/promises');
    await writeFile(
      join(TEST_ROOT, '.squad', 'casting', 'registry.json'),
      'NOT VALID JSON {{{',
      'utf-8',
    );

    const checks = await runDoctor(TEST_ROOT);
    const registryCheck = checks.find(
      (c: DoctorCheck) => c.name === 'casting/registry.json exists',
    );
    expect(registryCheck).toBeDefined();
    expect(registryCheck?.status).toBe('fail');
  });
});

// ─── squad.agent.md template handling (#730) ───────────────────────────

describe('squad.agent.md template handling (#730)', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('initSquad creates squad.agent.md when template exists (happy-path regression)', async () => {
    const result = await initSquad(sdkOptions(TEST_ROOT));

    // squad.agent.md should be in createdFiles
    const agentEntry = result.createdFiles.find(f => f.includes('squad.agent.md'));
    expect(agentEntry).toBeDefined();

    // File should exist on disk
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    expect(existsSync(agentPath)).toBe(true);

    // No warnings should be emitted
    expect(result.warnings).toEqual([]);
  });

  it('initSquad returns warning when squad.agent.md template is missing', async () => {
    const { FSStorageProvider } = await import('@bradygaster/squad-sdk');
    const realStorage = new FSStorageProvider();

    // Create a proxy storage that hides squad.agent.md.template
    const maskedStorage = new Proxy(realStorage, {
      get(target, prop, receiver) {
        if (prop === 'existsSync') {
          return (filePath: string) => {
            if (filePath.endsWith('squad.agent.md.template')) {
              return false;
            }
            return target.existsSync(filePath);
          };
        }
        if (prop === 'readSync') {
          return (filePath: string) => {
            if (filePath.endsWith('squad.agent.md.template')) {
              return undefined;
            }
            return target.readSync(filePath);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const result = await initSquad(sdkOptions(TEST_ROOT), maskedStorage as typeof realStorage);

    // Warning should be present
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('squad.agent.md template not found');

    // squad.agent.md should NOT be in createdFiles
    const agentEntry = result.createdFiles.find(f => f.includes('squad.agent.md'));
    expect(agentEntry).toBeUndefined();

    // Other files should still be created
    expect(result.createdFiles.length).toBeGreaterThan(0);
  });
});

// ─── .gitignore marker block for two-layer/orphan backends (#1228) ─────────

describe('.gitignore state-backend marker block — initSquad()', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
    gitInit(TEST_ROOT);
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('initSquad({stateBackend: "two-layer"}) adds the marker block to .gitignore', async () => {
    await initSquad({ ...sdkOptions(TEST_ROOT), stateBackend: 'two-layer' });

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('# Squad: state owned by squad-state branch (two-layer/orphan backend)');
    expect(content).toContain('.squad/decisions.md');
    expect(content).toContain('.squad/agents/*/history.md');
    expect(content).toContain('# /Squad: state owned by squad-state branch');
  });

  it('initSquad({stateBackend: "orphan"}) adds the marker block to .gitignore', async () => {
    await initSquad({ ...sdkOptions(TEST_ROOT), stateBackend: 'orphan' });

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('# Squad: state owned by squad-state branch (two-layer/orphan backend)');
    expect(content).toContain('.squad/decisions.md');
    expect(content).toContain('.squad/agents/*/history.md');
  });

  it('initSquad({stateBackend: "local"}) does NOT add the marker block to .gitignore', async () => {
    await initSquad({ ...sdkOptions(TEST_ROOT), stateBackend: 'local' });

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).not.toContain('# Squad: state owned by squad-state branch');
    expect(content).not.toContain('.squad/decisions.md');
    expect(content).not.toContain('.squad/agents/*/history.md');
  });

  it('initSquad() with no stateBackend does NOT add the marker block', async () => {
    await initSquad(sdkOptions(TEST_ROOT));

    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).not.toContain('# Squad: state owned by squad-state branch');
  });

  it('initSquad with two-layer is idempotent — second call does not duplicate marker block', async () => {
    await initSquad({ ...sdkOptions(TEST_ROOT), stateBackend: 'two-layer' });
    await initSquad({ ...sdkOptions(TEST_ROOT), stateBackend: 'two-layer' });

    const content = await readFile(join(TEST_ROOT, '.gitignore'), 'utf-8');
    const occurrences = (content.match(/# Squad: state owned by squad-state branch/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});

// ─── Working-tree containment guard (#1796) ────────────────────────────────

describe('repository working tree is not mutated by this suite (#1796)', () => {
  it('sandbox root is outside the repository working tree', () => {
    const rel = relative(REPO_ROOT, TEST_ROOT);
    // A path inside REPO_ROOT produces a relative path that neither escapes
    // upward nor is absolute. Anything else means the sandbox is contained.
    const isInsideRepo = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
    expect(isInsideRepo, `TEST_ROOT (${TEST_ROOT}) must not live under ${REPO_ROOT}`).toBe(false);
  });

  it('tracked squad.agent.md files are byte-unchanged after init runs', () => {
    // Pre-fix this is red: initSquad()/runInit() on a sandbox that has no git
    // root of its own walk upward, find the real repository, and stampVersion()
    // rewrites .github/agents/squad.agent.md from 0.0.0-source to the package
    // version. The suite still passes — the mutation is silent.
    expect(guardedStatus()).toBe(guardedStatusBefore);
  });
});

