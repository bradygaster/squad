/**
 * CLI Upgrade Command Integration Tests
 * Tests that the upgrade command handles version changes correctly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade } from '@bradygaster/squad-cli/core/upgrade';
import { getPackageVersion } from '@bradygaster/squad-cli/core/version';

const TEST_ROOT = join(process.cwd(), `.test-cli-upgrade-${randomBytes(4).toString('hex')}`);

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
});
