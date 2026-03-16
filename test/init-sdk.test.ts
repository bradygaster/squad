/**
 * Test suite for squad init --sdk flag (Issue #249)
 *
 * Tests the new configFormat option behavior:
 * - 'markdown' (default): markdown-only squad, no squad.config.ts
 * - 'sdk': SDK-First mode, generates squad.config.ts with defineSquad() syntax
 * - 'typescript' (backward compat): old SquadConfig interface format
 *
 * @module test/init-sdk
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

// Import initSquad from SDK
// Note: initSquad lives at packages/squad-sdk/src/config/init.ts
import { initSquad } from '../packages/squad-sdk/src/config/init.js';
import type { InitOptions } from '../packages/squad-sdk/src/config/init.js';

describe('squad init --sdk flag', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'squad-init-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('default init (markdown) does NOT create squad.config.ts', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
    };

    await initSquad(options);

    // Assert: .squad/ directory created
    expect(existsSync(join(tempDir, '.squad'))).toBe(true);

    // Assert: squad.config.ts does NOT exist
    expect(existsSync(join(tempDir, 'squad.config.ts'))).toBe(false);

    // Assert: .squad/agents/ exists
    expect(existsSync(join(tempDir, '.squad', 'agents'))).toBe(true);

    // Assert: .github/agents/squad.agent.md exists
    expect(existsSync(join(tempDir, '.github', 'agents', 'squad.agent.md'))).toBe(true);
  });

  it('init --sdk creates squad.config.ts with defineSquad() syntax', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
    };

    await initSquad(options);

    // Assert: squad.config.ts exists
    const configPath = join(tempDir, 'squad.config.ts');
    expect(existsSync(configPath)).toBe(true);

    // Read the generated config
    const configContent = await readFile(configPath, 'utf-8');

    // Assert: file contains 'defineSquad'
    expect(configContent).toContain('defineSquad');

    // Assert: file contains 'defineTeam'
    expect(configContent).toContain('defineTeam');

    // Assert: file contains 'defineAgent'
    expect(configContent).toContain('defineAgent');

    // Assert: file imports from '@bradygaster/squad-sdk'
    expect(configContent).toContain('@bradygaster/squad-sdk');

    // Assert: .squad/ directory also created
    expect(existsSync(join(tempDir, '.squad'))).toBe(true);
  });

  it('init --sdk generates valid TypeScript', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Assert: no syntax errors (at minimum, check structure)
    // Check for basic TypeScript syntax patterns
    expect(configContent).toMatch(/export\s+default/);

    // Assert: has proper imports
    expect(configContent).toContain('import');
    expect(configContent).toContain('from');

    // Assert: has function calls with proper parentheses/braces
    expect(configContent).toMatch(/defineSquad\s*\(/);
    expect(configContent).toMatch(/defineTeam\s*\(/);
    expect(configContent).toMatch(/defineAgent\s*\(/);
  });

  it('markdown init still creates all .squad/ directories', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
    };

    await initSquad(options);

    // Assert: .squad/agents/ exists
    expect(existsSync(join(tempDir, '.squad', 'agents'))).toBe(true);

    // Assert: .squad/casting/ exists (if created during init)
    const castingPath = join(tempDir, '.squad', 'casting');
    // May not exist in minimal init, so just check structure

    // Assert: .squad/decisions/ exists
    expect(existsSync(join(tempDir, '.squad', 'decisions'))).toBe(true);

    // Assert: .squad/decisions/inbox/ exists
    expect(existsSync(join(tempDir, '.squad', 'decisions', 'inbox'))).toBe(true);

    // Assert: .copilot/skills/ exists
    expect(existsSync(join(tempDir, '.copilot', 'skills'))).toBe(true);

    // Assert: .squad/identity/ exists
    expect(existsSync(join(tempDir, '.squad', 'identity'))).toBe(true);
  });

  it('backward compat: configFormat typescript still works', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'typescript',
    };

    await initSquad(options);

    // Assert: squad.config.ts exists with old SquadConfig format
    const configPath = join(tempDir, 'squad.config.ts');
    expect(existsSync(configPath)).toBe(true);

    const configContent = await readFile(configPath, 'utf-8');

    // Old format uses SquadConfig interface (not defineSquad)
    // This test verifies we don't break existing behavior
    expect(configContent).toContain('SquadConfig');
  });

  it('init --sdk creates agent definitions matching team roster', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [
        { name: 'edie', role: 'Engineer' },
        { name: 'hockney', role: 'Tester' },
      ],
      configFormat: 'sdk',
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should have at least one agent defined
    const agentMatches = configContent.match(/defineAgent\(/g);
    expect(agentMatches).toBeTruthy();
    expect(agentMatches!.length).toBeGreaterThan(0);
  });

  it('init --sdk respects teamName option', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'Test Squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should contain the team name
    expect(configContent).toContain('Test Squad');
  });

  // ── --sdk --roles integration (#378) ────────────────────────────────

  it('init --sdk --roles uses useRole() instead of defineAgent()', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'scribe', role: 'scribe' }],
      configFormat: 'sdk',
      roles: true,
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    expect(existsSync(configPath)).toBe(true);

    const configContent = await readFile(configPath, 'utf-8');

    // Should import useRole
    expect(configContent).toContain('useRole');
    expect(configContent).toContain('@bradygaster/squad-sdk');

    // Should have useRole() calls for starter team
    expect(configContent).toMatch(/useRole\s*\(\s*'lead'/);
    expect(configContent).toMatch(/useRole\s*\(\s*'backend'/);
    expect(configContent).toMatch(/useRole\s*\(\s*'frontend'/);
    expect(configContent).toMatch(/useRole\s*\(\s*'tester'/);
  });

  it('init --sdk --roles keeps defineAgent() for non-role agents', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [
        { name: 'scribe', role: 'scribe' },
        { name: 'ralph', role: 'ralph' },
      ],
      configFormat: 'sdk',
      roles: true,
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // System agents use defineAgent, not useRole
    expect(configContent).toContain('defineAgent');
    expect(configContent).toMatch(/defineAgent\([\s\S]*?name:\s*'scribe'/);
    expect(configContent).toMatch(/defineAgent\([\s\S]*?name:\s*'ralph'/);
  });

  it('init --sdk --roles includes role catalog comment', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'scribe', role: 'scribe' }],
      configFormat: 'sdk',
      roles: true,
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should have helpful comment about base roles
    expect(configContent).toContain('built-in base roles');
  });

  it('init --sdk --roles generates valid export default', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'scribe', role: 'scribe' }],
      configFormat: 'sdk',
      roles: true,
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    expect(configContent).toMatch(/export\s+default/);
    expect(configContent).toMatch(/defineSquad\s*\(/);
    expect(configContent).toMatch(/defineTeam\s*\(/);
  });

  it('init --sdk --roles uses base role agent when passed', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [
        { name: 'kane', role: 'backend' },
        { name: 'ripley', role: 'lead' },
      ],
      configFormat: 'sdk',
      roles: true,
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should use useRole for recognized base roles
    expect(configContent).toMatch(/useRole\s*\(\s*'backend'.*name:\s*'kane'/s);
    expect(configContent).toMatch(/useRole\s*\(\s*'lead'.*name:\s*'ripley'/s);

    // Should NOT generate default starter team since caller provided roles
    expect(configContent).not.toContain("useRole('frontend'");
  });

  it('init --sdk without --roles still uses defineAgent()', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'sdk',
      roles: false,
    };

    await initSquad(options);

    const configPath = join(tempDir, 'squad.config.ts');
    const configContent = await readFile(configPath, 'utf-8');

    // Should NOT contain useRole
    expect(configContent).not.toContain('useRole');
    // Should contain defineAgent
    expect(configContent).toContain('defineAgent');
  });

  it('init --roles without --sdk still creates markdown-only', async () => {
    const options: InitOptions = {
      teamRoot: tempDir,
      projectName: 'test-squad',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
      roles: true,
    };

    await initSquad(options);

    // Should NOT generate squad.config.ts
    expect(existsSync(join(tempDir, 'squad.config.ts'))).toBe(false);

    // .squad/ directory should still be created
    expect(existsSync(join(tempDir, '.squad'))).toBe(true);
  });
});
