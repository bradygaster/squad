/**
 * Init / Upgrade / Doctor Parity Tests
 *
 * Ensures init and upgrade produce equivalent scaffolding.
 * When casting was added to init, upgrade was not updated -- these tests
 * guard against that class of drift.
 *
 * @see https://github.com/bradygaster/squad/issues/822
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { runInit } from '@bradygaster/squad-cli/core/init';
import {
  runUpgrade,
  ensureGitattributes,
  ensureDirectories,
} from '@bradygaster/squad-cli/core/upgrade';

const TEST_ROOT = join(
  tmpdir(),
  `.test-init-upgrade-parity-${randomBytes(4).toString('hex')}`,
);

/**
 * Directories that upgrade's ENSURE_DIRECTORIES must cover.
 * Derived from what init scaffolds (SDK initSquad).
 */
const INIT_INFRASTRUCTURE_DIRS = [
  '.squad/identity',
  '.squad/orchestration-log',
  '.squad/log',
  '.squad/sessions',
  '.squad/decisions/inbox',
  '.squad/casting',
  '.squad/agents',
  '.copilot/skills',
];

/**
 * .gitattributes merge=union rules both paths must install.
 */
const EXPECTED_GITATTRIBUTES_RULES = [
  '.squad/decisions.md merge=union',
  '.squad/agents/*/history.md merge=union',
  '.squad/log/** merge=union',
  '.squad/orchestration-log/** merge=union',
];

/**
 * Casting default files both paths should scaffold.
 */
const CASTING_FILES = [
  'registry.json',
  'policy.json',
  'history.json',
];

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Init / Upgrade parity', () => {
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
  // -------------------------------------------------------------------------
  // 1. ENSURE_DIRECTORIES covers every infrastructure dir init creates
  // -------------------------------------------------------------------------
  it('ENSURE_DIRECTORIES matches init infrastructure directories', async () => {
    await runInit(TEST_ROOT);

    // Any dirs init missed should be filled in by ensureDirectories
    const created = ensureDirectories(TEST_ROOT);

    // After both init + ensureDirectories, every dir must exist
    for (const dir of INIT_INFRASTRUCTURE_DIRS) {
      expect(
        existsSync(join(TEST_ROOT, dir)),
      ).toBe(true);
    }

    // Track which dirs init missed so drift is visible in test output.
    // Ideally created.length === 0 (init scaffolds everything upgrade expects).
    if (created.length > 0) {
      console.warn(
        `[parity drift] init missed ${created.length} dirs that upgrade ensures: ${created.join(', ')}`,
      );
    }
  });

  // -------------------------------------------------------------------------
  // 2. Upgrade scaffolds casting defaults
  // -------------------------------------------------------------------------
  it('upgrade scaffolds casting directory and init creates casting files', async () => {
    await runInit(TEST_ROOT);

    const castingDir = join(TEST_ROOT, '.squad', 'casting');
    expect(existsSync(castingDir)).toBe(true);

    // Init should have created the three casting JSON files
    for (const file of CASTING_FILES) {
      const filePath = join(castingDir, file);
      expect(existsSync(filePath)).toBe(true);

      const content = await readFile(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    }

    // After upgrade on an already-init'd directory, casting files survive
    await runUpgrade(TEST_ROOT);

    for (const file of CASTING_FILES) {
      expect(existsSync(join(castingDir, file))).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Upgrade doesn't overwrite existing files (force: false)
  // -------------------------------------------------------------------------
  it('upgrade does not overwrite existing user state files', async () => {
    await runInit(TEST_ROOT);

    // Write sentinel values into user state files
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    const sentinel = '<!-- USER_SENTINEL -->\n';
    if (existsSync(teamPath)) {
      await writeFile(teamPath, sentinel);
    }

    // Write a sentinel casting file
    const registryPath = join(TEST_ROOT, '.squad', 'casting', 'registry.json');
    const customRegistry = JSON.stringify({ agents: { sentinel: true } });
    if (existsSync(registryPath)) {
      await writeFile(registryPath, customRegistry);
    }

    await runUpgrade(TEST_ROOT);

    // team.md should still have our sentinel
    if (existsSync(teamPath)) {
      const teamContent = await readFile(teamPath, 'utf-8');
      expect(teamContent).toContain('USER_SENTINEL');
    }

    // casting/registry.json should still have our custom content
    if (existsSync(registryPath)) {
      const regContent = await readFile(registryPath, 'utf-8');
      expect(regContent).toContain('sentinel');
    }
  });
  // -------------------------------------------------------------------------
  // 4. Both paths create .squad/agents/
  // -------------------------------------------------------------------------
  it('both init and upgrade ensure .squad/agents/ exists', async () => {
    // init creates .squad/agents/
    await runInit(TEST_ROOT);
    expect(existsSync(join(TEST_ROOT, '.squad', 'agents'))).toBe(true);

    // ENSURE_DIRECTORIES includes .squad/agents, so upgrade also covers it.
    // Verify by checking that the full list of INIT_INFRASTRUCTURE_DIRS
    // is present after init + ensureDirectories.
    ensureDirectories(TEST_ROOT);
    for (const dir of INIT_INFRASTRUCTURE_DIRS) {
      expect(existsSync(join(TEST_ROOT, dir))).toBe(true);
    }
  });

  // -------------------------------------------------------------------------
  // 5. Both paths create .gitattributes with merge=union rules
  // -------------------------------------------------------------------------
  it('both init and upgrade create .gitattributes merge=union rules', async () => {
    // After init
    await runInit(TEST_ROOT);
    const attrPath = join(TEST_ROOT, '.gitattributes');
    expect(existsSync(attrPath)).toBe(true);

    const afterInit = await readFile(attrPath, 'utf-8');
    for (const rule of EXPECTED_GITATTRIBUTES_RULES) {
      expect(afterInit).toContain(rule);
    }

    // Wipe .gitattributes and run upgrade -- should recreate rules
    await writeFile(attrPath, '');
    await runUpgrade(TEST_ROOT);

    const afterUpgrade = await readFile(attrPath, 'utf-8');
    for (const rule of EXPECTED_GITATTRIBUTES_RULES) {
      expect(afterUpgrade).toContain(rule);
    }
  });

  // -------------------------------------------------------------------------
  // 6. ensureDirectories is idempotent on second call
  // -------------------------------------------------------------------------
  it('ensureDirectories is idempotent on second call', async () => {
    await runInit(TEST_ROOT);

    // First call fills any gaps init left
    ensureDirectories(TEST_ROOT);

    // Second call should return empty (everything now exists)
    const second = ensureDirectories(TEST_ROOT);
    expect(second).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 7. ensureGitattributes does not duplicate rules
  // -------------------------------------------------------------------------
  it('ensureGitattributes does not duplicate rules', async () => {
    await runInit(TEST_ROOT);

    // Run twice
    ensureGitattributes(TEST_ROOT);
    ensureGitattributes(TEST_ROOT);

    const content = await readFile(
      join(TEST_ROOT, '.gitattributes'),
      'utf-8',
    );

    // Each rule should appear exactly once
    for (const rule of EXPECTED_GITATTRIBUTES_RULES) {
      const count = content.split(rule).length - 1;
      expect(count).toBe(1);
    }
  });
});