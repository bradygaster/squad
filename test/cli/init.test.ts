/**
 * CLI Init Command Integration Tests
 * Tests that the init command creates expected files in a temp directory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { getPackageVersion } from '@bradygaster/squad-cli/core/version';

const TEST_ROOT = join(tmpdir(), `.test-cli-init-${randomBytes(4).toString('hex')}`);
const TEST_HOME = join(tmpdir(), `.test-cli-init-home-${randomBytes(4).toString('hex')}`);

describe('CLI: init command', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
    if (existsSync(TEST_HOME)) {
      await rm(TEST_HOME, { recursive: true, force: true });
    }
    await mkdir(TEST_HOME, { recursive: true });
    // iter-7: redirect ~/.copilot/mcp-config.json writes to a temp dir so
    // tests don't pollute the developer's real HOME.
    process.env.SQUAD_HOME_DIR_OVERRIDE = TEST_HOME;
  });

  afterEach(async () => {
    delete process.env.SQUAD_HOME_DIR_OVERRIDE;
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    if (existsSync(TEST_HOME)) {
      await rm(TEST_HOME, { recursive: true, force: true });
    }
  });

  it('should create squad.agent.md in .github/agents/', async () => {
    await runInit(TEST_ROOT);
    
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    expect(existsSync(agentPath)).toBe(true);
    
    const content = await readFile(agentPath, 'utf-8');
    expect(content).toContain('Squad');
    expect(content).toContain('version:');
  });

  it('should stamp CLI version in squad.agent.md during init (#321)', async () => {
    await runInit(TEST_ROOT);
    
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const content = await readFile(agentPath, 'utf-8');
    const currentVersion = getPackageVersion();
    
    // HTML comment must contain the current CLI version
    expect(content).toContain(`<!-- version: ${currentVersion} -->`);
    // Identity section must contain the current CLI version
    expect(content).toContain(`- **Version:** ${currentVersion}`);
    // {version} placeholder must be replaced
    expect(content).not.toContain('`Squad v{version}`');
    expect(content).toContain(`Squad v${currentVersion}`);
  });

  it('should create .squad/ directory structure', async () => {
    await runInit(TEST_ROOT);
    
    expect(existsSync(join(TEST_ROOT, '.squad'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'decisions', 'inbox'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'orchestration-log'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'casting'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.copilot', 'skills'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'plugins'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'identity'))).toBe(true);
  });

  it('should create identity files (now.md, wisdom.md)', async () => {
    await runInit(TEST_ROOT);
    
    const nowPath = join(TEST_ROOT, '.squad', 'identity', 'now.md');
    const wisdomPath = join(TEST_ROOT, '.squad', 'identity', 'wisdom.md');
    
    expect(existsSync(nowPath)).toBe(true);
    expect(existsSync(wisdomPath)).toBe(true);
    
    const nowContent = await readFile(nowPath, 'utf-8');
    expect(nowContent).toContain('What We\'re Focused On');
    expect(nowContent).toContain('updated_at:');
    
    const wisdomContent = await readFile(wisdomPath, 'utf-8');
    expect(wisdomContent).toContain('Team Wisdom');
  });

  it('should create .copilot/mcp-config.json without squad_state (iter-7: lives in ~/.copilot)', async () => {
    await runInit(TEST_ROOT);

    const mcpPath = join(TEST_ROOT, '.copilot', 'mcp-config.json');
    expect(existsSync(mcpPath)).toBe(true);

    const content = await readFile(mcpPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config).toHaveProperty('mcpServers');
    // iter-7: squad_state is now written to ~/.copilot/mcp-config.json and
    // tombstoned out of the project file so github/copilot auto-loads it.
    expect(config.mcpServers).not.toHaveProperty('squad_state');
    expect(content).not.toContain('SQUAD_TEAM_ROOT');
    expect(content).not.toContain(TEST_ROOT);
  });

  it('should write MCP config into agent frontmatter when requested', async () => {
    await runInit(TEST_ROOT, { mcpFrontmatter: true });

    const mcpPath = join(TEST_ROOT, '.copilot', 'mcp-config.json');
    expect(existsSync(mcpPath)).toBe(false);

    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const content = await readFile(agentPath, 'utf-8');
    expect(content).toContain('mcp-servers:');
    expect(content).toContain('  squad_state:');
    expect(content).toContain('    type: local');
    // args may be pinned (`@bradygaster/squad-cli@<version>`) or unpinned
    // depending on whether getPackageVersion() resolved a real version at
    // test time. Either shape is acceptable here.
    expect(content).toMatch(/args:\s*\['-y',\s*'@bradygaster\/squad-cli(@[^']+)?',\s*'state-mcp'\]/);
    expect(content).toContain('    tools: ["*"]');
    const frontmatterEnd = content.indexOf('\n---', 4);
    expect(frontmatterEnd).toBeGreaterThan(0);
    const frontmatter = content.slice(0, frontmatterEnd);
    expect(frontmatter).not.toContain('SQUAD_TEAM_ROOT');
    expect(frontmatter).not.toContain(TEST_ROOT);

    const squadConfigPath = join(TEST_ROOT, '.squad', 'config.json');
    const squadConfig = JSON.parse(await readFile(squadConfigPath, 'utf-8'));
    expect(squadConfig.mcpConfigMode).toBe('agent-frontmatter');
  });

  it('should not patch existing agent frontmatter on re-init', async () => {
    await runInit(TEST_ROOT);

    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const firstContent = await readFile(agentPath, 'utf-8');

    await runInit(TEST_ROOT, { mcpFrontmatter: true });

    const secondContent = await readFile(agentPath, 'utf-8');
    expect(secondContent).toBe(firstContent);
    expect(secondContent).not.toContain('mcp-servers:');
  });

  it('should create ceremonies.md', async () => {
    await runInit(TEST_ROOT);
    
    const ceremoniesPath = join(TEST_ROOT, '.squad', 'ceremonies.md');
    expect(existsSync(ceremoniesPath)).toBe(true);
  });

  it('should append to .gitattributes with merge=union rules', async () => {
    await runInit(TEST_ROOT);
    
    const gitattributesPath = join(TEST_ROOT, '.gitattributes');
    expect(existsSync(gitattributesPath)).toBe(true);
    
    const content = await readFile(gitattributesPath, 'utf-8');
    expect(content).toContain('.squad/decisions.md merge=union');
    expect(content).toContain('.squad/orchestration-log/** merge=union');
  });

  it('should append to .gitignore with runtime state exclusions', async () => {
    await runInit(TEST_ROOT);
    
    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('.squad/orchestration-log/');
    expect(content).toContain('.squad/log/');
    expect(content).toContain('.squad/decisions/inbox/');
    expect(content).toContain('.squad/sessions/');
  });

  it('should copy templates to .squad/templates/', async () => {
    await runInit(TEST_ROOT);
    
    const templatesPath = join(TEST_ROOT, '.squad', 'templates');
    expect(existsSync(templatesPath)).toBe(true);
    
    // Should contain squad.agent.md.template (renamed to prevent CLI discovery)
    expect(existsSync(join(templatesPath, 'squad.agent.md.template'))).toBe(true);
  });

  it('should copy starter skills if none exist', async () => {
    await runInit(TEST_ROOT);
    
    const skillsPath = join(TEST_ROOT, '.copilot', 'skills');
    const skills = await readdir(skillsPath);
    
    // Should have at least one skill
    expect(skills.length).toBeGreaterThan(0);
  });

  it('should install exactly the 4 framework workflows', async () => {
    await runInit(TEST_ROOT);
    
    const workflowsPath = join(TEST_ROOT, '.github', 'workflows');
    expect(existsSync(workflowsPath)).toBe(true);
    
    const frameworkWorkflows = [
      'squad-heartbeat.yml',
      'squad-triage.yml',
      'squad-issue-assign.yml',
      'sync-squad-labels.yml'
    ];
    
    for (const workflow of frameworkWorkflows) {
      expect(existsSync(join(workflowsPath, workflow))).toBe(true);
    }
  });

  it('should NOT install CI/CD workflows', async () => {
    await runInit(TEST_ROOT);
    
    const workflowsPath = join(TEST_ROOT, '.github', 'workflows');
    
    const cicdWorkflows = [
      'squad-ci.yml',
      'squad-release.yml',
      'squad-docs.yml',
      'squad-insider-release.yml',
      'squad-preview.yml',
      'squad-promote.yml',
      'squad-label-enforce.yml'
    ];
    
    for (const workflow of cicdWorkflows) {
      expect(existsSync(join(workflowsPath, workflow))).toBe(false);
    }
  });

  it('should not overwrite existing files on re-init', async () => {
    await runInit(TEST_ROOT);
    
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const firstContent = await readFile(agentPath, 'utf-8');
    
    // Modify the file
    const modified = firstContent + '\n<!-- MODIFIED -->';
    await rm(agentPath);
    await mkdir(join(TEST_ROOT, '.github', 'agents'), { recursive: true });
    await require('fs/promises').writeFile(agentPath, modified);
    
    // Run init again
    await runInit(TEST_ROOT);
    
    // File should be skipped (not overwritten)
    const secondContent = await readFile(agentPath, 'utf-8');
    expect(secondContent).toContain('<!-- MODIFIED -->');
  });
});
