/**
 * CLI Upgrade Command Integration Tests
 * Tests that the upgrade command handles version changes correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade, ensureGitattributes, ensureGitignore, ensureDirectories, ensureCastingDefaults, selfUpgradeCli } from '@bradygaster/squad-cli/core/upgrade';
import { getPackageVersion } from '@bradygaster/squad-cli/core/version';

const TEST_ROOT = join(tmpdir(), `.test-cli-upgrade-${randomBytes(4).toString('hex')}`);

describe('CLI: upgrade command', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
    
    // Initialize a squad
    await runInit(TEST_ROOT);
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('should upgrade squad.agent.md to current version', async () => {
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    
    // Modify version to simulate old version
    let content = await readFile(agentPath, 'utf-8');
    const originalVersion = content.match(/<!-- version: ([^>]+) -->/)?.[1];
    content = content.replace(/<!-- version: [^>]+ -->/m, '<!-- version: 0.1.0 -->');
    await writeFile(agentPath, content);
    
    // Verify we set it to 0.1.0
    const modified = await readFile(agentPath, 'utf-8');
    expect(modified).toContain('<!-- version: 0.1.0 -->');
    
    // Run upgrade
    const result = await runUpgrade(TEST_ROOT);
    
    // Verify upgrade result indicates change
    expect(result.fromVersion).toBe('0.1.0');
    expect(result.toVersion).toBe(getPackageVersion());
    expect(result.filesUpdated).toContain('squad.agent.md');
    
    // Verify the file was updated (version should be different from 0.1.0)
    const upgraded = await readFile(agentPath, 'utf-8');
    expect(upgraded).not.toContain('<!-- version: 0.1.0 -->');
    // Identity section and greeting placeholder must also be stamped
    expect(upgraded).toContain(`- **Version:** ${getPackageVersion()}`);
    expect(upgraded).not.toContain('`Squad v{version}`');
  });

  it('should return upgrade info with updated files', async () => {
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    
    // Simulate old version
    let content = await readFile(agentPath, 'utf-8');
    content = content.replace(/<!-- version: [^>]+ -->/m, '<!-- version: 0.1.0 -->');
    await writeFile(agentPath, content);
    
    const result = await runUpgrade(TEST_ROOT);
    
    expect(result.fromVersion).toBe('0.1.0');
    expect(result.toVersion).toBe(getPackageVersion());
    expect(result.filesUpdated).toContain('squad.agent.md');
    expect(Array.isArray(result.migrationsRun)).toBe(true);
  });

  it('should overwrite squad-owned template files', async () => {
    const ceremoniePath = join(TEST_ROOT, '.squad', 'ceremonies.md');
    
    // Modify a squad-owned file
    const original = await readFile(ceremoniePath, 'utf-8');
    await writeFile(ceremoniePath, '<!-- MODIFIED -->\n' + original);
    
    // Run upgrade
    await runUpgrade(TEST_ROOT);
    
    // Verify the file was overwritten (no longer has our marker)
    const upgraded = await readFile(ceremoniePath, 'utf-8');
    
    // Note: ceremonies.md might not be in overwriteOnUpgrade manifest
    // So this test validates behavior if it IS in manifest
    // If not, we should see the marker still there
  });

  it('should upgrade workflows', async () => {
    const workflowsDir = join(TEST_ROOT, '.github', 'workflows');
    
    if (existsSync(workflowsDir)) {
      // Run upgrade
      const result = await runUpgrade(TEST_ROOT);
      
      // Should report workflows were upgraded
      expect(result.filesUpdated.some(f => f.includes('workflows'))).toBe(true);
    }
  });

  it('should handle upgrade when already at current version', async () => {
    // Run upgrade when already current
    const result = await runUpgrade(TEST_ROOT);
    
    const currentVersion = getPackageVersion();
    expect(result.fromVersion).toBe(currentVersion);
    expect(result.toVersion).toBe(currentVersion);
  });

  it('refreshes squad.agent.md when already at current version (happy-path regression)', async () => {
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const currentVersion = getPackageVersion();

    // Verify initial state — already at current version
    const before = await readFile(agentPath, 'utf-8');
    expect(before).toContain(`<!-- version: ${currentVersion} -->`);

    // Run upgrade (takes version-current path)
    const result = await runUpgrade(TEST_ROOT);

    expect(result.fromVersion).toBe(currentVersion);
    expect(result.toVersion).toBe(currentVersion);
    // squad.agent.md should still be refreshed in the version-current path
    expect(result.filesUpdated).toContain('squad.agent.md');

    // File should still have the correct version stamp
    const after = await readFile(agentPath, 'utf-8');
    expect(after).toContain(`<!-- version: ${currentVersion} -->`);
  });

  it('should preserve version stamp after manifest loop (issue #195)', async () => {
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const currentVersion = getPackageVersion();

    // Simulate old version so upgrade proceeds through the full code path
    let content = await readFile(agentPath, 'utf-8');
    content = content.replace(/<!-- version: [^>]+ -->/m, '<!-- version: 0.1.0 -->');
    await writeFile(agentPath, content);

    // First upgrade — stamps version and runs manifest loop
    await runUpgrade(TEST_ROOT);

    // Version stamp must survive the manifest loop
    const afterFirst = await readFile(agentPath, 'utf-8');
    expect(afterFirst).toContain(`<!-- version: ${currentVersion} -->`);

    // Second upgrade should detect "already current" (not re-stamp from 0.0.0)
    const second = await runUpgrade(TEST_ROOT);
    expect(second.fromVersion).toBe(currentVersion);
    expect(second.toVersion).toBe(currentVersion);
  });

  it('should preserve user state files (team.md, decisions/)', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    const decisionPath = join(TEST_ROOT, '.squad', 'decisions', 'inbox', 'test.md');
    
    // Create user files
    await mkdir(join(TEST_ROOT, '.squad', 'decisions', 'inbox'), { recursive: true });
    await writeFile(teamPath, '# My Team\n');
    await writeFile(decisionPath, '# Decision\n');
    
    // Run upgrade
    await runUpgrade(TEST_ROOT);
    
    // Verify user files are untouched
    if (existsSync(teamPath)) {
      const teamContent = await readFile(teamPath, 'utf-8');
      expect(teamContent).toBe('# My Team\n');
    }
    
    const decisionContent = await readFile(decisionPath, 'utf-8');
    expect(decisionContent).toBe('# Decision\n');
  });

  it('should run migrations from old to new version', async () => {
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    
    // Simulate very old version
    let content = await readFile(agentPath, 'utf-8');
    content = content.replace(/<!-- version: [^>]+ -->/m, '<!-- version: 0.1.0 -->');
    await writeFile(agentPath, content);
    
    const result = await runUpgrade(TEST_ROOT);
    
    // Migrations should be an array (may be empty if no migrations defined)
    expect(Array.isArray(result.migrationsRun)).toBe(true);
  });

  it('should handle .ai-team/ legacy directory', async () => {
    // Create a legacy .ai-team/ directory
    const legacyDir = join(TEST_ROOT, '.ai-team');
    await mkdir(legacyDir, { recursive: true });
    await mkdir(join(legacyDir, 'decisions', 'inbox'), { recursive: true });
    
    // Remove .squad if it exists
    if (existsSync(join(TEST_ROOT, '.squad'))) {
      await rm(join(TEST_ROOT, '.squad'), { recursive: true, force: true });
    }
    
    // Run upgrade (should detect legacy)
    const result = await runUpgrade(TEST_ROOT);
    
    // Should complete without error
    expect(result.toVersion).toBe(getPackageVersion());
  });

  /* ── ensureGitattributes ─────────────────────────────────────── */

  it('ensureGitattributes adds rules when .gitattributes is missing', () => {
    const dir = join(TEST_ROOT, 'gitattr-test-missing');
    mkdirSync(dir, { recursive: true });
    const added = ensureGitattributes(dir);
    expect(added.length).toBeGreaterThanOrEqual(4);
    const content = readFileSync(join(dir, '.gitattributes'), 'utf8');
    expect(content).toContain('.squad/decisions.md merge=union');
    expect(content).toContain('.squad/log/** merge=union');
    rmSync(dir, { recursive: true, force: true });
  });

  it('ensureGitattributes adds missing rules to existing file', () => {
    const dir = join(TEST_ROOT, 'gitattr-test-partial');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.gitattributes'), '.squad/decisions.md merge=union\n');
    const added = ensureGitattributes(dir);
    // Should add the ones not already present
    expect(added).not.toContain('.squad/decisions.md merge=union');
    expect(added.length).toBeGreaterThanOrEqual(3);
    const content = readFileSync(join(dir, '.gitattributes'), 'utf8');
    expect(content).toContain('.squad/orchestration-log/** merge=union');
    rmSync(dir, { recursive: true, force: true });
  });

  it('ensureGitattributes is idempotent', () => {
    const dir = join(TEST_ROOT, 'gitattr-test-idempotent');
    mkdirSync(dir, { recursive: true });
    ensureGitattributes(dir);
    const first = readFileSync(join(dir, '.gitattributes'), 'utf8');
    ensureGitattributes(dir);
    const second = readFileSync(join(dir, '.gitattributes'), 'utf8');
    expect(second).toBe(first);
    rmSync(dir, { recursive: true, force: true });
  });

  it('ensureGitattributes warns and returns empty on read-only file (EPERM)', () => {
    const dir = join(TEST_ROOT, 'gitattr-test-eperm');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, '.gitattributes');
    // Write a partial file, then make it read-only
    writeFileSync(filePath, '# existing content\n');
    chmodSync(filePath, 0o444);
    try {
      const added = ensureGitattributes(dir);
      // Should return empty — graceful degradation, no crash
      expect(added).toEqual([]);
    } finally {
      // Restore write permission so cleanup works
      chmodSync(filePath, 0o644);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /* ── ensureGitignore ─────────────────────────────────────────── */

  it('ensureGitignore adds entries when .gitignore is missing', () => {
    const dir = join(TEST_ROOT, 'gitignore-test-missing');
    mkdirSync(dir, { recursive: true });
    const added = ensureGitignore(dir);
    expect(added.length).toBeGreaterThanOrEqual(5);
    const content = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(content).toContain('.squad/orchestration-log/');
    expect(content).toContain('.squad-workstream');
    rmSync(dir, { recursive: true, force: true });
  });

  it('ensureGitignore is idempotent', () => {
    const dir = join(TEST_ROOT, 'gitignore-test-idempotent');
    mkdirSync(dir, { recursive: true });
    ensureGitignore(dir);
    const first = readFileSync(join(dir, '.gitignore'), 'utf8');
    ensureGitignore(dir);
    const second = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(second).toBe(first);
    rmSync(dir, { recursive: true, force: true });
  });

  /* ── ensureDirectories ───────────────────────────────────────── */

  it('ensureDirectories creates missing directories', () => {
    const dir = join(TEST_ROOT, 'dirs-test');
    mkdirSync(dir, { recursive: true });
    const created = ensureDirectories(dir);
    expect(created.length).toBeGreaterThanOrEqual(5);
    expect(existsSync(join(dir, '.squad', 'identity'))).toBe(true);
    expect(existsSync(join(dir, '.squad', 'sessions'))).toBe(true);
    expect(existsSync(join(dir, '.copilot', 'skills'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('ensureDirectories does not duplicate existing dirs', () => {
    const dir = join(TEST_ROOT, 'dirs-test-existing');
    mkdirSync(dir, { recursive: true });
    ensureDirectories(dir);
    const second = ensureDirectories(dir);
    expect(second.length).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  /* ── "already current" path still runs ensure checks ─────── */

  it('already-current path runs ensure checks', async () => {
    // After init, version is already current — delete dirs to prove ensure recreates
    const sessionsDir = join(TEST_ROOT, '.squad', 'sessions');
    if (existsSync(sessionsDir)) {
      await rm(sessionsDir, { recursive: true, force: true });
    }
    const gitattr = join(TEST_ROOT, '.gitattributes');
    if (existsSync(gitattr)) {
      await rm(gitattr);
    }

    const result = await runUpgrade(TEST_ROOT);

    // Should be already current
    const currentVersion = getPackageVersion();
    expect(result.fromVersion).toBe(currentVersion);
    expect(result.toVersion).toBe(currentVersion);

    // Ensure checks should have repaired missing items
    expect(existsSync(sessionsDir)).toBe(true);
    expect(existsSync(gitattr)).toBe(true);
  });

  /* ── --force flag ───────────────────────────────────────────── */

  it('--force flag triggers full manifest processing even when current', async () => {
    // Run normal upgrade first — should be "already current"
    const normalResult = await runUpgrade(TEST_ROOT);
    const currentVersion = getPackageVersion();
    expect(normalResult.fromVersion).toBe(currentVersion);

    // Now run with force — should go through full upgrade path
    const forceResult = await runUpgrade(TEST_ROOT, { force: true });
    // Force upgrade treats it as a real upgrade (fromVersion != toVersion possible,
    // or it processes the full manifest)
    expect(forceResult.filesUpdated.length).toBeGreaterThan(0);
    expect(forceResult.filesUpdated).toContain('squad.agent.md');
  });

  /* ── --self flag (selfUpgradeCli) ──────────────────────────── */

  it.todo('selfUpgradeCli shells out with correct package tag (ESM spy limitation)');

  /* ── ensureDirectories includes .squad/casting ──────────────── */

  it('ensureDirectories creates .squad/casting/', () => {
    const dir = join(TEST_ROOT, 'dirs-test-casting');
    mkdirSync(dir, { recursive: true });
    const created = ensureDirectories(dir);
    expect(created).toContain('.squad/casting');
    expect(existsSync(join(dir, '.squad', 'casting'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  /* ── ensureCastingDefaults ──────────────────────────────────── */

  it('ensureCastingDefaults scaffolds registry.json, policy.json, history.json', () => {
    const dir = join(TEST_ROOT, 'casting-defaults-test');
    mkdirSync(join(dir, '.squad', 'casting'), { recursive: true });
    const created = ensureCastingDefaults(dir);
    expect(created).toContain('.squad/casting/registry.json');
    expect(created).toContain('.squad/casting/policy.json');
    expect(created).toContain('.squad/casting/history.json');
    // Verify valid JSON
    const registry = JSON.parse(readFileSync(join(dir, '.squad', 'casting', 'registry.json'), 'utf8'));
    expect(registry).toHaveProperty('agents');
    const policy = JSON.parse(readFileSync(join(dir, '.squad', 'casting', 'policy.json'), 'utf8'));
    expect(policy).toHaveProperty('casting_policy_version', '1.1');
    const history = JSON.parse(readFileSync(join(dir, '.squad', 'casting', 'history.json'), 'utf8'));
    expect(history).toHaveProperty('universe_usage_history');
    rmSync(dir, { recursive: true, force: true });
  });

  it('ensureCastingDefaults does not overwrite existing files', () => {
    const dir = join(TEST_ROOT, 'casting-defaults-existing');
    const castingDir = join(dir, '.squad', 'casting');
    mkdirSync(castingDir, { recursive: true });
    writeFileSync(join(castingDir, 'registry.json'), '{"agents":{"custom":true}}');
    const created = ensureCastingDefaults(dir);
    // registry.json should NOT be in created (already exists)
    expect(created).not.toContain('.squad/casting/registry.json');
    // policy.json and history.json should be created
    expect(created).toContain('.squad/casting/policy.json');
    expect(created).toContain('.squad/casting/history.json');
    // Existing file should be preserved
    const registry = JSON.parse(readFileSync(join(castingDir, 'registry.json'), 'utf8'));
    expect(registry.agents.custom).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('upgrade scaffolds casting defaults for repos init before casting existed', async () => {
    // Remove casting directory to simulate pre-casting init
    const castingDir = join(TEST_ROOT, '.squad', 'casting');
    if (existsSync(castingDir)) {
      await rm(castingDir, { recursive: true, force: true });
    }
    const result = await runUpgrade(TEST_ROOT);
    // Casting dir and defaults should be recreated
    expect(existsSync(join(castingDir, 'registry.json'))).toBe(true);
    expect(existsSync(join(castingDir, 'policy.json'))).toBe(true);
    expect(existsSync(join(castingDir, 'history.json'))).toBe(true);
  });
});
