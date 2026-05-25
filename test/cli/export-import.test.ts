/**
 * CLI Export/Import Command Integration Tests
 * Tests that export/import round-trip preserves squad state
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runExport } from '@bradygaster/squad-cli/commands/export';
import { runImport } from '@bradygaster/squad-cli/commands/import';

const TEST_ROOT = join(tmpdir(), `.test-cli-export-import-${randomBytes(4).toString('hex')}`);
const IMPORT_ROOT = join(tmpdir(), `.test-cli-import-target-${randomBytes(4).toString('hex')}`);

describe('CLI: export/import commands', () => {
  beforeEach(async () => {
    // Clean up both roots
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    if (existsSync(IMPORT_ROOT)) {
      await rm(IMPORT_ROOT, { recursive: true, force: true });
    }
    
    await mkdir(TEST_ROOT, { recursive: true });
    await mkdir(IMPORT_ROOT, { recursive: true });
    
    // Initialize a squad
    await runInit(TEST_ROOT);
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    if (existsSync(IMPORT_ROOT)) {
      await rm(IMPORT_ROOT, { recursive: true, force: true });
    }
  });

  it('should export squad to squad-export.json', async () => {
    // Create team.md to trigger export
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    await runExport(TEST_ROOT);
    
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    expect(existsSync(exportPath)).toBe(true);
    
    const content = await readFile(exportPath, 'utf-8');
    const manifest = JSON.parse(content);
    
    expect(manifest.version).toBe('1.0');
    expect(manifest).toHaveProperty('exported_at');
    expect(manifest).toHaveProperty('casting');
    expect(manifest).toHaveProperty('agents');
    expect(manifest).toHaveProperty('skills');
  });

  it('should export to custom output path', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    const customPath = join(TEST_ROOT, 'custom-export.json');
    await runExport(TEST_ROOT, customPath);
    
    expect(existsSync(customPath)).toBe(true);
  });

  it('should export casting state if present', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    // Create casting state
    const castingDir = join(TEST_ROOT, '.squad', 'casting');
    await mkdir(castingDir, { recursive: true });
    await writeFile(
      join(castingDir, 'registry.json'),
      JSON.stringify({ roles: ['lead', 'dev'] }, null, 2)
    );
    
    await runExport(TEST_ROOT);
    
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    const content = await readFile(exportPath, 'utf-8');
    const manifest = JSON.parse(content);
    
    expect(manifest.casting.registry).toEqual({ roles: ['lead', 'dev'] });
  });

  it('should export agent charters and histories', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    // Create an agent
    const agentDir = join(TEST_ROOT, '.squad', 'agents', 'test-agent');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'charter.md'), '# Charter\nTest charter');
    await writeFile(join(agentDir, 'history.md'), '# History\nTest history');
    
    await runExport(TEST_ROOT);
    
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    const content = await readFile(exportPath, 'utf-8');
    const manifest = JSON.parse(content);
    
    expect(manifest.agents['test-agent']).toBeDefined();
    expect(manifest.agents['test-agent'].charter).toBe('# Charter\nTest charter');
    expect(manifest.agents['test-agent'].history).toBe('# History\nTest history');
  });

  it('should export skills', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    // Create a skill
    const skillDir = join(TEST_ROOT, '.copilot', 'skills', 'test-skill');
    await mkdir(skillDir, { recursive: true });
    const skillContent = 'name: "Test Skill"\ndescription: "A test skill"';
    await writeFile(join(skillDir, 'SKILL.md'), skillContent);
    
    await runExport(TEST_ROOT);
    
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    const content = await readFile(exportPath, 'utf-8');
    const manifest = JSON.parse(content);
    
    expect(Array.isArray(manifest.skills)).toBe(true);
    expect(manifest.skills.length).toBeGreaterThan(0);
  });

  it('should import squad from export file', async () => {
    // Export from source
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    // Create minimal content
    const agentDir = join(TEST_ROOT, '.squad', 'agents', 'lead');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'charter.md'), '# Lead Charter');
    
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    await runExport(TEST_ROOT, exportPath);
    
    // Import to new location
    await runImport(IMPORT_ROOT, exportPath, false);
    
    // Verify directory was created
    expect(existsSync(join(IMPORT_ROOT, '.squad'))).toBe(true);
    expect(existsSync(join(IMPORT_ROOT, '.squad', 'agents', 'lead'))).toBe(true);
  });

  it('should fail import without --force if squad exists', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    await runExport(TEST_ROOT, exportPath);
    
    // Create existing squad in import location
    await runInit(IMPORT_ROOT);
    const importTeamPath = join(IMPORT_ROOT, '.squad', 'team.md');
    await writeFile(importTeamPath, '# Existing Team\n');
    
    // Import should fail without --force (fatal() throws SquadError)
    // Verify that the import fails and the original squad is unchanged
    try {
      await runImport(IMPORT_ROOT, exportPath, false);
      // If we get here, the import succeeded when it shouldn't have
      expect(false).toBe(true); // Force failure
    } catch (err) {
      // Expected to fail - verify original squad is still intact
      const existingTeam = await readFile(importTeamPath, 'utf-8');
      expect(existingTeam).toBe('# Existing Team\n');
    }
  });

  it('should archive existing squad with --force', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    await runExport(TEST_ROOT, exportPath);
    
    // Create existing squad in import location
    await runInit(IMPORT_ROOT);
    const importTeamPath = join(IMPORT_ROOT, '.squad', 'team.md');
    await writeFile(importTeamPath, '# Existing Team\n');
    
    // Import with --force should archive old squad
    await runImport(IMPORT_ROOT, exportPath, true);
    
    // Verify new squad exists
    expect(existsSync(join(IMPORT_ROOT, '.squad'))).toBe(true);
    
    // Verify archive exists
    const files = await require('fs/promises').readdir(IMPORT_ROOT);
    const archiveDir = files.find((f: string) => f.startsWith('.squad-archive-'));
    expect(archiveDir).toBeDefined();
  });

  it('should preserve casting state in round-trip', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    // Create casting state
    const castingDir = join(TEST_ROOT, '.squad', 'casting');
    await mkdir(castingDir, { recursive: true });
    const policyData = { universe: 'testing', roles: ['lead', 'dev'] };
    await writeFile(
      join(castingDir, 'policy.json'),
      JSON.stringify(policyData, null, 2)
    );
    
    // Export and import
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    await runExport(TEST_ROOT, exportPath);
    await runImport(IMPORT_ROOT, exportPath, false);
    
    // Verify casting state was preserved
    const importedPolicyPath = join(IMPORT_ROOT, '.squad', 'casting', 'policy.json');
    expect(existsSync(importedPolicyPath)).toBe(true);
    
    const importedPolicy = JSON.parse(await readFile(importedPolicyPath, 'utf-8'));
    expect(importedPolicy).toEqual(policyData);
  });

  it('should preserve routing.md through export and import round-trip', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    // Create routing.md with rich content
    const routingContent = '# Routing Rules\n\n| Pattern | Agent |\n|---------|-------|\n| build/* | fenster |\n| docs/* | pao |\n\n## Principles\n\n1. Eager by default\n2. Scribe always runs\n';
    await writeFile(join(TEST_ROOT, '.squad', 'routing.md'), routingContent);
    
    // Export and import
    const exportPath = join(TEST_ROOT, 'squad-export.json');
    await runExport(TEST_ROOT, exportPath);
    await runImport(IMPORT_ROOT, exportPath, false);
    
    // Verify routing.md was faithfully preserved
    const importedRoutingPath = join(IMPORT_ROOT, '.squad', 'routing.md');
    expect(existsSync(importedRoutingPath)).toBe(true);
    const importedRouting = await readFile(importedRoutingPath, 'utf-8');
    expect(importedRouting).toBe(routingContent);
  });

  it('should mark history as imported with source info', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');
    
    // Create agent with history
    const agentDir = join(TEST_ROOT, '.squad', 'agents', 'lead');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'charter.md'), '# Charter');
    await writeFile(join(agentDir, 'history.md'), '## Entry 1\nOld history');
    
    // Export and import
    const exportPath = join(TEST_ROOT, 'my-project-export.json');
    await runExport(TEST_ROOT, exportPath);
    await runImport(IMPORT_ROOT, exportPath, false);
    
    // Verify history has import marker
    const historyPath = join(IMPORT_ROOT, '.squad', 'agents', 'lead', 'history.md');
    const history = await readFile(historyPath, 'utf-8');
    
    expect(history).toContain('📌 Imported from');
    expect(history).toContain('my-project-export');
  });

  it('should export and import team.md, decisions.md, and routing.md', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# My Team\nLead: Alice\n');
    await writeFile(join(TEST_ROOT, '.squad', 'decisions.md'), '# Decisions\n- Use TypeScript\n');
    await writeFile(join(TEST_ROOT, '.squad', 'routing.md'), '# Routing\n- `*.ts` → fenster\n');

    const exportPath = join(TEST_ROOT, 'squad-export.json');
    await runExport(TEST_ROOT, exportPath);

    // Verify manifest contains these fields
    const content = await readFile(exportPath, 'utf-8');
    const manifest = JSON.parse(content);
    expect(manifest.team_md).toBe('# My Team\nLead: Alice\n');
    expect(manifest.decisions_md).toBe('# Decisions\n- Use TypeScript\n');
    expect(manifest.routing_md).toBe('# Routing\n- `*.ts` → fenster\n');

    // Import and verify round-trip
    await runImport(IMPORT_ROOT, exportPath, false);
    const importedTeam = await readFile(join(IMPORT_ROOT, '.squad', 'team.md'), 'utf-8');
    const importedDecisions = await readFile(join(IMPORT_ROOT, '.squad', 'decisions.md'), 'utf-8');
    const importedRouting = await readFile(join(IMPORT_ROOT, '.squad', 'routing.md'), 'utf-8');
    expect(importedTeam).toBe('# My Team\nLead: Alice\n');
    expect(importedDecisions).toBe('# Decisions\n- Use TypeScript\n');
    expect(importedRouting).toBe('# Routing\n- `*.ts` → fenster\n');
  });

  it('should reject agent names with path traversal', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');

    // Create a malicious export file with path traversal in agent name
    const maliciousManifest = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      squad_version: '0.6.0',
      casting: {},
      agents: { '../../../etc/evil': { charter: 'malicious content' } },
      skills: [],
    };
    const exportPath = join(TEST_ROOT, 'malicious-export.json');
    await writeFile(exportPath, JSON.stringify(maliciousManifest));

    await expect(
      runImport(IMPORT_ROOT, exportPath, false)
    ).rejects.toThrow(/Invalid agent name|Path traversal/);
  });

  it('should handle older bundles without team_md/decisions_md gracefully', async () => {
    const teamPath = join(TEST_ROOT, '.squad', 'team.md');
    await writeFile(teamPath, '# Team\n');

    // Old format bundle without team_md, decisions_md, routing_md
    const oldManifest = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      squad_version: '0.6.0',
      casting: {},
      agents: {},
      skills: [],
    };
    const exportPath = join(TEST_ROOT, 'old-export.json');
    await writeFile(exportPath, JSON.stringify(oldManifest));

    await runImport(IMPORT_ROOT, exportPath, false);

    // Should write empty defaults
    const importedTeam = await readFile(join(IMPORT_ROOT, '.squad', 'team.md'), 'utf-8');
    const importedDecisions = await readFile(join(IMPORT_ROOT, '.squad', 'decisions.md'), 'utf-8');
    expect(importedTeam).toBe('');
    expect(importedDecisions).toBe('');
    // routing.md should not be created if not in bundle
    expect(existsSync(join(IMPORT_ROOT, '.squad', 'routing.md'))).toBe(false);
  });
});
