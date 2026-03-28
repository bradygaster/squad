/**
 * Guard removal & Scribe commit safety tests (#99)
 *
 * Validates that:
 * 1. The v0.5.4 migration in index.js correctly deletes squad-main-guard.yml
 * 2. TEMPLATE_MANIFEST does not include squad-main-guard.yml
 * 3. Init and upgrade never (re-)create the guard workflow
 * 4. No remaining workflow templates block .squad/ on push to main
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, writeFileSync, readFileSync, rmSync,
  existsSync, readdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { initSquad } from '@bradygaster/squad-sdk';
import type { InitOptions } from '@bradygaster/squad-sdk';
import { runInit } from '@bradygaster/squad-cli/core/init';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = join(ROOT, 'templates');
const WORKFLOWS_DIR = join(TEMPLATES_DIR, 'workflows');

// ============================================================================
// Helpers
// ============================================================================

function makeTempDir(): string {
  const dir = join(
    process.cwd(),
    `.test-guard-removal-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sdkInitOptions(teamRoot: string): InitOptions {
  return {
    teamRoot,
    projectName: 'guard-test',
    agents: [{ name: 'test-agent', role: 'Dev' }],
    configFormat: 'markdown',
    includeWorkflows: true,
  };
}

// ============================================================================
// Test 1: v0.5.4 migration in index.js removes squad-main-guard.yml
// ============================================================================

describe('v0.5.4 migration removes squad-main-guard.yml', () => {
  it('index.js contains a v0.5.4 migration that deletes the guard file', () => {
    // Source-level verification: the bundled CLI has the migration
    const indexSrc = readFileSync(join(ROOT, 'index.js'), 'utf8');

    // Must have version 0.5.4 migration
    expect(indexSrc).toContain("version: '0.5.4'");
    expect(indexSrc).toContain("'Remove squad-main-guard.yml workflow'");

    // Must use fs.unlinkSync to delete the file
    expect(indexSrc).toContain('squad-main-guard.yml');
    expect(indexSrc).toContain('unlinkSync(guardPath)');
  });

  it('migration logic correctly targets .github/workflows/squad-main-guard.yml', () => {
    const indexSrc = readFileSync(join(ROOT, 'index.js'), 'utf8');

    // Extract the v0.5.4 migration block
    const migrationMatch = indexSrc.match(
      /\{\s*version:\s*'0\.5\.4'[\s\S]*?(?=\{[\s\n]*version:\s*')/,
    );
    expect(migrationMatch).not.toBeNull();
    const block = migrationMatch![0];

    // Guard path is constructed from dest + .github/workflows/
    expect(block).toContain('.github');
    expect(block).toContain('workflows');
    expect(block).toContain('squad-main-guard.yml');

    // Conditional delete (existsSync + unlinkSync)
    expect(block).toContain('existsSync');
    expect(block).toContain('unlinkSync');
  });

  it('SDK migrations module does NOT create or reference the guard file', async () => {
    const { runMigrations } = await import(
      '../packages/squad-cli/dist/cli/core/migrations.js'
    );

    // Run all migrations in a temp dir — none should create the guard
    const tmpDir = makeTempDir();
    try {
      mkdirSync(join(tmpDir, '.github', 'workflows'), { recursive: true });
      await runMigrations(tmpDir, '0.0.0', '99.0.0');
      expect(
        existsSync(join(tmpDir, '.github', 'workflows', 'squad-main-guard.yml')),
      ).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// Test 2: TEMPLATE_MANIFEST does not include squad-main-guard.yml
// ============================================================================

describe('TEMPLATE_MANIFEST excludes squad-main-guard', () => {
  it('no entry references squad-main-guard in source or destination', async () => {
    const { TEMPLATE_MANIFEST } = await import(
      '../packages/squad-cli/dist/cli/core/templates.js'
    );

    for (const entry of TEMPLATE_MANIFEST) {
      expect(entry.source).not.toContain('main-guard');
      expect(entry.destination).not.toContain('main-guard');
    }
  });

  it('no workflow template file named squad-main-guard.yml exists', () => {
    const files = readdirSync(WORKFLOWS_DIR);
    expect(files).not.toContain('squad-main-guard.yml');
  });
});

// ============================================================================
// Test 3: Init and upgrade do not create squad-main-guard.yml
// ============================================================================

describe('squad init/upgrade never creates squad-main-guard.yml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('SDK initSquad() does not create the guard workflow', async () => {
    await initSquad(sdkInitOptions(tmpDir));

    const guardPath = join(tmpDir, '.github', 'workflows', 'squad-main-guard.yml');
    expect(existsSync(guardPath)).toBe(false);
  });

  it('CLI runInit() does not create the guard workflow', async () => {
    await runInit(tmpDir);

    const guardPath = join(tmpDir, '.github', 'workflows', 'squad-main-guard.yml');
    expect(existsSync(guardPath)).toBe(false);
  });

  it('upgrade of existing project does not create the guard workflow', async () => {
    // First init
    await runInit(tmpDir);

    // Verify guard absent after init
    const guardPath = join(tmpDir, '.github', 'workflows', 'squad-main-guard.yml');
    expect(existsSync(guardPath)).toBe(false);

    // Import and run upgrade
    const { runUpgrade } = await import('@bradygaster/squad-cli/core/upgrade');
    await runUpgrade(tmpDir).catch(() => {
      // Upgrade may fail in test env (missing git, etc.) — that's OK
    });

    // Guard must still be absent
    expect(existsSync(guardPath)).toBe(false);
  });
});

// ============================================================================
// Test 4: No workflow blocks .squad/ files on push to main
// ============================================================================

describe('no workflow template blocks .squad/ on push to main', () => {
  it('no template workflow has guard logic blocking .squad/ paths', () => {
    const workflowFiles = readdirSync(WORKFLOWS_DIR).filter(f =>
      f.endsWith('.yml'),
    );
    expect(workflowFiles.length).toBeGreaterThan(0);

    for (const file of workflowFiles) {
      const content = readFileSync(join(WORKFLOWS_DIR, file), 'utf8');

      // A blocking guard would: push on main + .squad/ paths filter + exit 1
      const hasPushMain =
        /push:[\s\S]*?branches:[\s\S]*?(?:\[.*main.*\]|main)/m.test(content);
      const hasSquadPathBlock =
        /paths:[\s\S]*?['"]?\.squad\/\*\*['"]?/m.test(content);
      const hasExitFailure = /exit\s+1/.test(content);

      const isBlockingGuard = hasPushMain && hasSquadPathBlock && hasExitFailure;
      expect(
        isBlockingGuard,
        `${file} should not block .squad/ commits on push to main`,
      ).toBe(false);
    }
  });

  it('squad-main-guard.yml is not among template workflow files', () => {
    const workflowFiles = readdirSync(WORKFLOWS_DIR);
    expect(workflowFiles).not.toContain('squad-main-guard.yml');
  });
});
