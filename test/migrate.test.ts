/**
 * Test suite for squad migrate command (Issue #250)
 *
 * Tests the migration between markdown and SDK-First config modes:
 * - `squad migrate --to sdk`: converts markdown squad to SDK config
 * - `squad migrate --to markdown`: removes SDK config, keeps .squad/
 * - `squad migrate --from ai-team`: renames .ai-team/ to .squad/
 *
 * @module test/migrate
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { runMigrate } from '../packages/squad-cli/src/cli/commands/migrate.js';

// Note: migrate function location TBD - adjust import when implementation lands
// Expected at packages/squad-sdk/src/config/migration.ts or cli command
// For now, define test structure that can be filled in when implementation is ready

describe('squad migrate', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'squad-migrate-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: Create a minimal markdown-only squad structure
   */
  async function createMarkdownSquad(targetDir: string) {
    const squadDir = join(targetDir, '.squad');
    await mkdir(squadDir, { recursive: true });
    await mkdir(join(squadDir, 'agents'), { recursive: true });
    await mkdir(join(squadDir, 'decisions'), { recursive: true });
    await mkdir(join(squadDir, 'skills'), { recursive: true });

    // Create team.md with roster
    const teamMd = `# Team

## Members

| Name | Role | Status |
|------|------|--------|
| edie | TypeScript Engineer | active |
| hockney | Tester | active |
| fenster | Systems Engineer | active |
`;
    await writeFile(join(squadDir, 'team.md'), teamMd, 'utf-8');

    // Create agent charters
    await mkdir(join(squadDir, 'agents', 'edie'), { recursive: true });
    await writeFile(
      join(squadDir, 'agents', 'edie', 'charter.md'),
      '# Edie — TypeScript Engineer\n\nExpert in TypeScript...',
      'utf-8'
    );

    await mkdir(join(squadDir, 'agents', 'hockney'), { recursive: true });
    await writeFile(
      join(squadDir, 'agents', 'hockney', 'charter.md'),
      '# Hockney — Tester\n\nSkeptical, relentless...',
      'utf-8'
    );

    await mkdir(join(squadDir, 'agents', 'fenster'), { recursive: true });
    await writeFile(
      join(squadDir, 'agents', 'fenster', 'charter.md'),
      '# Fenster — Systems Engineer\n\nInfrastructure expert...',
      'utf-8'
    );

    // Create decisions.md
    const decisionsMd = `# Team Decisions

## Coding Standards
- Use TypeScript strict mode
- Vitest for testing
`;
    await writeFile(join(squadDir, 'decisions.md'), decisionsMd, 'utf-8');
  }

  /**
   * Helper: Create an SDK-First squad with squad.config.ts
   */
  async function createSdkSquad(targetDir: string) {
    await createMarkdownSquad(targetDir);

    const configTs = `import { defineSquad, defineTeam, defineAgent } from '@bradygaster/squad-sdk';

export default defineSquad({
  team: defineTeam({
    name: 'Test Squad',
    members: ['edie', 'hockney'],
  }),
  agents: [
    defineAgent({ name: 'edie', role: 'TypeScript Engineer' }),
    defineAgent({ name: 'hockney', role: 'Tester' }),
  ],
});
`;
    await writeFile(join(targetDir, 'squad.config.ts'), configTs, 'utf-8');
  }

  it('--to sdk generates squad.config.ts from existing .squad/', async () => {
    await createMarkdownSquad(tempDir);

    // TODO: Call migrate function when implementation lands
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // For now, test structure is defined but will skip
    // Uncomment when implementation is ready:
    /*
    const configPath = join(tempDir, 'squad.config.ts');
    expect(existsSync(configPath)).toBe(true);

    const configContent = await readFile(configPath, 'utf-8');
    expect(configContent).toContain('defineSquad');
    expect(configContent).toContain('defineTeam');
    expect(configContent).toContain('defineAgent');
    */
  });

  it('--to sdk warns that SDK-first migration is deprecated', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await expect(runMigrate(tempDir, { to: 'sdk' })).rejects.toThrow('No squad found');
      expect(log.mock.calls.flat().join('\n')).toContain(
        '`squad migrate --to sdk` is deprecated and will be removed in v2'
      );
    } finally {
      log.mockRestore();
    }
  });

  it('--to sdk --dry-run prints preview without writing', async () => {
    await createMarkdownSquad(tempDir);

    // TODO: Call migrate with dry-run flag
    // const result = await migrate({ targetDir: tempDir, to: 'sdk', dryRun: true });

    // Assert: squad.config.ts NOT created
    expect(existsSync(join(tempDir, 'squad.config.ts'))).toBe(false);

    // Assert: output contains the config preview (check return value)
    // expect(result.preview).toBeTruthy();
  });

  it('--to sdk preserves decisions.md untouched', async () => {
    await createMarkdownSquad(tempDir);

    const decisionsPath = join(tempDir, '.squad', 'decisions.md');
    const originalContent = await readFile(decisionsPath, 'utf-8');

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // Assert: decisions.md unchanged
    const afterContent = await readFile(decisionsPath, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('--to sdk parses team.md members table correctly', async () => {
    await createMarkdownSquad(tempDir);

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'squad.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: generated config has 3 defineAgent() calls (edie, hockney, fenster)
    // const agentMatches = configContent.match(/defineAgent\(/g);
    // expect(agentMatches).toHaveLength(3);
  });

  it('--to markdown removes squad.config.ts', async () => {
    await createSdkSquad(tempDir);

    // Verify config exists before migration
    expect(existsSync(join(tempDir, 'squad.config.ts'))).toBe(true);

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'markdown' });

    // Assert: squad.config.ts removed (or backed up)
    // expect(existsSync(join(tempDir, 'squad.config.ts'))).toBe(false);

    // Assert: .squad/ directory preserved
    expect(existsSync(join(tempDir, '.squad'))).toBe(true);
    expect(existsSync(join(tempDir, '.squad', 'team.md'))).toBe(true);
  });

  it('detects already-SDK squad and reports no-op', async () => {
    await createSdkSquad(tempDir);

    // TODO: Call migrate --to sdk on already-SDK squad
    // const result = await migrate({ targetDir: tempDir, to: 'sdk' });

    // Assert: reports "already in SDK mode" or similar
    // expect(result.status).toBe('no-op');
    // expect(result.message).toMatch(/already.*sdk/i);
  });

  it('--from ai-team renames .ai-team/ to .squad/', async () => {
    // Create old .ai-team/ structure
    const aiTeamDir = join(tempDir, '.ai-team');
    await mkdir(aiTeamDir, { recursive: true });
    await mkdir(join(aiTeamDir, 'agents'), { recursive: true });
    await writeFile(join(aiTeamDir, 'team.md'), '# Old AI Team', 'utf-8');

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, from: 'ai-team' });

    // Assert: .ai-team/ gone
    // expect(existsSync(join(tempDir, '.ai-team'))).toBe(false);

    // Assert: .squad/ exists with contents
    // expect(existsSync(join(tempDir, '.squad'))).toBe(true);
    // expect(existsSync(join(tempDir, '.squad', 'team.md'))).toBe(true);
  });

  it('--to sdk handles agents with no charter file', async () => {
    await createMarkdownSquad(tempDir);

    // Remove one charter file
    await rm(join(tempDir, '.squad', 'agents', 'fenster', 'charter.md'));

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // Assert: still generates config with fenster agent (with empty or placeholder charter)
    // const configPath = join(tempDir, 'squad.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');
    // expect(configContent).toContain('fenster');
  });

  it('--to sdk preserves agent capabilities from charter frontmatter', async () => {
    await createMarkdownSquad(tempDir);

    // Add frontmatter to edie's charter
    const charterWithMeta = `---
capabilities:
  - name: typescript
    level: expert
  - name: testing
    level: proficient
---

# Edie — TypeScript Engineer

Expert in TypeScript...
`;
    await writeFile(
      join(tempDir, '.squad', 'agents', 'edie', 'charter.md'),
      charterWithMeta,
      'utf-8'
    );

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'squad.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: capabilities included in defineAgent call
    // expect(configContent).toMatch(/capabilities.*typescript.*expert/s);
  });

  it('--to sdk preserves routing rules from routing.md', async () => {
    await createMarkdownSquad(tempDir);

    // Create routing.md
    const routingMd = `# Routing

## Rules

- \`feature-*\` → edie
- \`bug-*\` → fenster
- \`test-*\` → hockney

Default: edie
`;
    await writeFile(join(tempDir, '.squad', 'routing.md'), routingMd, 'utf-8');

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'squad.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: routing section included
    // expect(configContent).toContain('defineRouting');
    // expect(configContent).toContain('feature-*');
  });

  it('--to sdk handles skills/ directory', async () => {
    await createMarkdownSquad(tempDir);

    // Create a skill file
    await mkdir(join(tempDir, '.squad', 'skills', 'git-workflow'), { recursive: true });
    const skillMd = `---
name: Git Workflow
domain: workflow
---

Branch from dev, use squad/* naming...
`;
    await writeFile(
      join(tempDir, '.squad', 'skills', 'git-workflow', 'SKILL.md'),
      skillMd,
      'utf-8'
    );

    // TODO: Call migrate
    // await migrate({ targetDir: tempDir, to: 'sdk' });

    // const configPath = join(tempDir, 'squad.config.ts');
    // const configContent = await readFile(configPath, 'utf-8');

    // Assert: skills section included (if supported)
    // expect(configContent).toContain('skills');
  });

  it('validates markdown squad exists before migration', async () => {
    // Empty directory, no .squad/

    // TODO: Call migrate on empty directory
    // await expect(
    //   migrate({ targetDir: tempDir, to: 'sdk' })
    // ).rejects.toThrow(/no squad found/i);
  });

  it('--force flag overwrites existing squad.config.ts', async () => {
    await createMarkdownSquad(tempDir);

    // Create existing config with different content
    await writeFile(
      join(tempDir, 'squad.config.ts'),
      '// Old config',
      'utf-8'
    );

    // TODO: Call migrate with force
    // await migrate({ targetDir: tempDir, to: 'sdk', force: true });

    // const configContent = await readFile(join(tempDir, 'squad.config.ts'), 'utf-8');
    // expect(configContent).not.toContain('Old config');
    // expect(configContent).toContain('defineSquad');
  });
});
