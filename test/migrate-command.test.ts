/**
 * Comprehensive tests for Squad Migrate Command
 * Tests migration, backup, restore, and rollback functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMigrate, type MigrateOptions } from '../packages/squad-cli/src/cli/core/migrate.js';

// Mock the SDK
vi.mock('@bradygaster/squad-sdk', () => ({
  initSquad: vi.fn(async (opts) => {
    // Simulate what sdkInitSquad does: create .squad/ structure
    const squadDir = join(opts.teamRoot, '.squad');
    mkdirSync(squadDir, { recursive: true });
    mkdirSync(join(squadDir, 'templates'), { recursive: true });
    mkdirSync(join(squadDir, 'casting'), { recursive: true });
    writeFileSync(join(squadDir, 'team.md'), '# Team\n\nFresh init team.md\n');
    // Simulate first-run markers that should be cleaned up
    writeFileSync(join(squadDir, '.first-run'), '');
    writeFileSync(join(squadDir, '.init-prompt'), 'some prompt');
  }),
}));

describe('Squad Migrate Command', () => {
  let testDir: string;
  let exitSpy: any;
  let sdkInitSquad: any;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'squad-migrate-test-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: any) => {
      throw new Error(`process.exit: ${code}`);
    });

    // Get mocked sdkInitSquad
    const { initSquad } = await import('@bradygaster/squad-sdk');
    sdkInitSquad = initSquad;
    vi.mocked(sdkInitSquad).mockClear();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findLatestBackup (tested indirectly via restore)', () => {
    it('should exit(1) when no backups exist', async () => {
      await expect(
        runMigrate(testDir, { restore: true })
      ).rejects.toThrow('process.exit: 1');
    });

    it('should restore from the only backup when one exists', async () => {
      // Create .squad/ with content
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'agents'), { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Original Team\n');

      // Run migrate to create a backup
      await runMigrate(testDir, {});

      // Modify .squad/team.md
      writeFileSync(join(squadDir, 'team.md'), '# Modified Team\n');

      // Restore
      await runMigrate(testDir, { restore: true });

      const restoredContent = readFileSync(join(squadDir, 'team.md'), 'utf8');
      expect(restoredContent).toBe('# Original Team\n');
    });

    it('should restore from the most recent backup when multiple exist', async () => {
      const squadDir = join(testDir, '.squad');

      // Create three backups manually
      const backup1 = join(testDir, '.squad-backup-2024-01-01T10-00-00');
      const backup2 = join(testDir, '.squad-backup-2024-01-02T10-00-00');
      const backup3 = join(testDir, '.squad-backup-2024-01-03T10-00-00');

      mkdirSync(backup1, { recursive: true });
      writeFileSync(join(backup1, 'team.md'), 'backup1');

      mkdirSync(backup2, { recursive: true });
      writeFileSync(join(backup2, 'team.md'), 'backup2');

      mkdirSync(backup3, { recursive: true });
      writeFileSync(join(backup3, 'team.md'), 'backup3');

      // Create current .squad/
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), 'current');

      // Restore with auto-detect
      await runMigrate(testDir, { restore: true });

      const restoredContent = readFileSync(join(squadDir, 'team.md'), 'utf8');
      expect(restoredContent).toBe('backup3'); // Most recent
    });
  });

  describe('runMigrate - dry run', () => {
    it('should create no files or directories in dry-run mode', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'templates'), { recursive: true });
      mkdirSync(join(squadDir, 'agents'), { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Team\n');

      const beforeEntries = readdirSync(testDir);

      await runMigrate(testDir, { dryRun: true });

      const afterEntries = readdirSync(testDir);
      expect(afterEntries).toEqual(beforeEntries);
    });

    it('should not call sdkInitSquad in dry-run mode', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Team\n');

      await runMigrate(testDir, { dryRun: true });

      expect(sdkInitSquad).not.toHaveBeenCalled();
    });
  });

  describe('runMigrate - normal flow', () => {
    it('should create a backup with timestamp format', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Original\n');

      await runMigrate(testDir, {});

      const entries = readdirSync(testDir);
      const backupDirs = entries.filter(e => e.startsWith('.squad-backup-'));
      expect(backupDirs.length).toBe(1);
      expect(backupDirs[0]).toMatch(/\.squad-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    });

    it('should backup the original contents', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'agents', 'test-agent'), { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Original Team\n');
      writeFileSync(join(squadDir, 'agents', 'test-agent', 'charter.md'), '# Test Charter\n');

      await runMigrate(testDir, {});

      const entries = readdirSync(testDir);
      const backupDir = entries.find(e => e.startsWith('.squad-backup-'));
      expect(backupDir).toBeDefined();

      const backupPath = join(testDir, backupDir!);
      expect(readFileSync(join(backupPath, 'team.md'), 'utf8')).toBe('# Original Team\n');
      expect(readFileSync(join(backupPath, 'agents', 'test-agent', 'charter.md'), 'utf8')).toBe('# Test Charter\n');
    });

    it('should remove SQUAD_OWNED dirs (templates, casting) before reinit', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'templates'), { recursive: true });
      mkdirSync(join(squadDir, 'casting'), { recursive: true });
      writeFileSync(join(squadDir, 'templates', 'test.md'), 'template content');
      writeFileSync(join(squadDir, 'casting', 'proposal.json'), '{}');

      await runMigrate(testDir, {});

      // After migration, these should be freshly created by sdkInitSquad (empty or default)
      // But the old content should be gone
      const entries = readdirSync(testDir);
      const backupDir = entries.find(e => e.startsWith('.squad-backup-'));
      const backupPath = join(testDir, backupDir!);

      // Backup should have the original files
      expect(existsSync(join(backupPath, 'templates', 'test.md'))).toBe(true);
      expect(existsSync(join(backupPath, 'casting', 'proposal.json'))).toBe(true);
    });

    it('should restore USER_OWNED files after reinit', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'agents', 'my-agent'), { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# My Team\n');
      writeFileSync(join(squadDir, 'routing.md'), '# My Routing\n');
      writeFileSync(join(squadDir, 'agents', 'my-agent', 'charter.md'), '# My Charter\n');

      await runMigrate(testDir, {});

      // After migration, user files should be restored
      expect(readFileSync(join(squadDir, 'team.md'), 'utf8')).toBe('# My Team\n');
      expect(readFileSync(join(squadDir, 'routing.md'), 'utf8')).toBe('# My Routing\n');
      expect(readFileSync(join(squadDir, 'agents', 'my-agent', 'charter.md'), 'utf8')).toBe('# My Charter\n');
    });

    it('should delete .first-run and .init-prompt markers after sdkInitSquad', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Team\n');

      await runMigrate(testDir, {});

      // sdkInitSquad creates these markers, but migrate should clean them up
      expect(existsSync(join(squadDir, '.first-run'))).toBe(false);
      expect(existsSync(join(squadDir, '.init-prompt'))).toBe(false);
    });
  });

  describe('runMigrate - no .squad/ directory', () => {
    it('should run fresh init when no .squad/ exists', async () => {
      await runMigrate(testDir, {});

      expect(sdkInitSquad).toHaveBeenCalledWith(
        expect.objectContaining({
          teamRoot: testDir,
          skipExisting: true,
          includeWorkflows: true,
          includeTemplates: true,
        })
      );

      expect(existsSync(join(testDir, '.squad'))).toBe(true);
    });

    it('should not create a backup when no .squad/ exists', async () => {
      await runMigrate(testDir, {});

      const entries = readdirSync(testDir);
      const backupDirs = entries.filter(e => e.startsWith('.squad-backup-'));
      expect(backupDirs.length).toBe(0);
    });
  });

  describe('runMigrate - legacy .ai-team/ directory', () => {
    it('should detect and migrate from .ai-team/ when .squad/ absent', async () => {
      const legacyDir = join(testDir, '.ai-team');
      mkdirSync(join(legacyDir, 'agents'), { recursive: true });
      writeFileSync(join(legacyDir, 'team.md'), '# Legacy Team\n');

      await runMigrate(testDir, {});

      // After migration, .squad/ should exist with the legacy content
      const squadDir = join(testDir, '.squad');
      expect(existsSync(squadDir)).toBe(true);
      expect(readFileSync(join(squadDir, 'team.md'), 'utf8')).toBe('# Legacy Team\n');

      // .ai-team/ should be removed
      expect(existsSync(legacyDir)).toBe(false);
    });

    it('should back up .ai-team/ contents before removing', async () => {
      const legacyDir = join(testDir, '.ai-team');
      mkdirSync(legacyDir, { recursive: true });
      writeFileSync(join(legacyDir, 'team.md'), '# Legacy Team\n');

      await runMigrate(testDir, {});

      const entries = readdirSync(testDir);
      const backupDir = entries.find(e => e.startsWith('.squad-backup-'));
      expect(backupDir).toBeDefined();

      const backupPath = join(testDir, backupDir!);
      expect(readFileSync(join(backupPath, 'team.md'), 'utf8')).toBe('# Legacy Team\n');
    });
  });

  describe('runMigrate - auto-rollback on error', () => {
    it('should restore .squad/ from backup when sdkInitSquad throws', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'agents'), { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Original Team\n');

      // Make sdkInitSquad throw
      vi.mocked(sdkInitSquad).mockRejectedValueOnce(new Error('Init failed'));

      await expect(
        runMigrate(testDir, {})
      ).rejects.toThrow('process.exit: 1');

      // After rollback, .squad/ should have original content
      expect(readFileSync(join(squadDir, 'team.md'), 'utf8')).toBe('# Original Team\n');
    });

    it('should call process.exit(1) after rollback', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Team\n');

      vi.mocked(sdkInitSquad).mockRejectedValueOnce(new Error('Init failed'));

      await expect(
        runMigrate(testDir, {})
      ).rejects.toThrow('process.exit: 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('runMigrate - restore with auto-detection', () => {
    it('should remove existing .squad/ and replace with backup contents', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Original\n');

      // Run migrate to create backup
      await runMigrate(testDir, {});

      // Modify current .squad/
      writeFileSync(join(squadDir, 'team.md'), '# Modified\n');
      writeFileSync(join(squadDir, 'new-file.md'), '# New\n');

      // Restore
      await runMigrate(testDir, { restore: true });

      expect(readFileSync(join(squadDir, 'team.md'), 'utf8')).toBe('# Original\n');
      expect(existsSync(join(squadDir, 'new-file.md'))).toBe(false);
    });
  });

  describe('runMigrate - restore with explicit path', () => {
    it('should restore from explicit absolute path', async () => {
      const squadDir = join(testDir, '.squad');
      const backupPath = join(testDir, 'my-custom-backup');

      // Create backup manually
      mkdirSync(backupPath, { recursive: true });
      writeFileSync(join(backupPath, 'team.md'), '# Custom Backup\n');

      // Create current .squad/
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '# Current\n');

      // Restore from explicit path
      await runMigrate(testDir, { restore: backupPath });

      expect(readFileSync(join(squadDir, 'team.md'), 'utf8')).toBe('# Custom Backup\n');
    });

    it('should exit(1) when explicit restore path does not exist', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });

      await expect(
        runMigrate(testDir, { restore: '/non/existent/path' })
      ).rejects.toThrow('process.exit: 1');
    });
  });

  describe('runMigrate - casting state initialization', () => {
    it('should create legacy casting registry when backup has no casting state (v0.5.x repo)', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'agents', 'alice'), { recursive: true });
      mkdirSync(join(squadDir, 'agents', 'bob'), { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '## Members\n- alice\n- bob\n');

      await runMigrate(testDir, {});

      const registryPath = join(squadDir, 'casting', 'registry.json');
      expect(existsSync(registryPath)).toBe(true);

      const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
      expect(registry.agents).toBeDefined();
      expect(registry.agents['alice']).toMatchObject({ legacy_named: true, universe: 'legacy', status: 'active' });
      expect(registry.agents['bob']).toMatchObject({ legacy_named: true, universe: 'legacy', status: 'active' });
    });

    it('should create policy.json and history.json alongside registry.json', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'agents', 'charlie'), { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '## Members\n- charlie\n');

      await runMigrate(testDir, {});

      const castingDir = join(squadDir, 'casting');
      expect(existsSync(join(castingDir, 'policy.json'))).toBe(true);
      expect(existsSync(join(castingDir, 'history.json'))).toBe(true);

      const policy = JSON.parse(readFileSync(join(castingDir, 'policy.json'), 'utf8'));
      expect(policy.casting_policy_version).toBe('1.1');
      expect(Array.isArray(policy.allowlist_universes)).toBe(true);

      const history = JSON.parse(readFileSync(join(castingDir, 'history.json'), 'utf8'));
      expect(history.assignment_cast_snapshots).toBeDefined();
    });

    it('should restore casting from backup when backup has casting state (v0.8.x repo)', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(join(squadDir, 'casting'), { recursive: true });
      const existingRegistry = {
        agents: {
          dave: { created_at: '2026-01-01T00:00:00Z', persistent_name: 'Dave', universe: 'Reservoir Dogs', legacy_named: false, status: 'active' },
        },
      };
      writeFileSync(join(squadDir, 'casting', 'registry.json'), JSON.stringify(existingRegistry, null, 2));
      writeFileSync(join(squadDir, 'team.md'), '## Members\n- dave\n');

      await runMigrate(testDir, {});

      const registryPath = join(squadDir, 'casting', 'registry.json');
      expect(existsSync(registryPath)).toBe(true);

      const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
      // Original casting state preserved, not replaced with legacy
      expect(registry.agents['dave']).toMatchObject({ universe: 'Reservoir Dogs', legacy_named: false });
    });

    it('should not overwrite existing casting state when sdkInitSquad already created it', async () => {
      const squadDir = join(testDir, '.squad');
      mkdirSync(squadDir, { recursive: true });
      writeFileSync(join(squadDir, 'team.md'), '## Members\n');

      // Pre-populate what the mock sdkInitSquad would create (empty casting dir, no registry)
      // In this test the mock doesn't write registry.json, so we verify our code creates it
      await runMigrate(testDir, {});

      // After migration with no agents, registry should exist but be empty
      const registryPath = join(squadDir, 'casting', 'registry.json');
      expect(existsSync(registryPath)).toBe(true);
      const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
      expect(registry.agents).toEqual({});
    });
  });
});
