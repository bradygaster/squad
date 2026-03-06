/**
 * CLI Init Command Integration Tests
 * Tests that the init command creates expected files in a temp directory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { runInit } from '@bradygaster/squad-cli/core/init';

const TEST_ROOT = join(process.cwd(), `.test-cli-init-${randomBytes(4).toString('hex')}`);

describe('CLI: init command', () => {
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

  it('should create squad.agent.md in .github/agents/', async () => {
    await runInit(TEST_ROOT);
    
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    expect(existsSync(agentPath)).toBe(true);
    
    const content = await readFile(agentPath, 'utf-8');
    expect(content).toContain('Squad');
    expect(content).toContain('version:');
  });

  it('should create .squad/ directory structure', async () => {
    await runInit(TEST_ROOT);
    
    expect(existsSync(join(TEST_ROOT, '.squad'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'decisions', 'inbox'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'orchestration-log'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'casting'))).toBe(true);
    expect(existsSync(join(TEST_ROOT, '.squad', 'skills'))).toBe(true);
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

  it('should create .copilot/mcp-config.json', async () => {
    await runInit(TEST_ROOT);
    
    const mcpPath = join(TEST_ROOT, '.copilot', 'mcp-config.json');
    expect(existsSync(mcpPath)).toBe(true);
    
    const content = await readFile(mcpPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config).toHaveProperty('mcpServers');
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

  it('should append to .gitignore with log exclusions', async () => {
    await runInit(TEST_ROOT);
    
    const gitignorePath = join(TEST_ROOT, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    
    const content = await readFile(gitignorePath, 'utf-8');
    expect(content).toContain('.squad/orchestration-log/');
    expect(content).toContain('.squad/log/');
  });

  it('should copy templates to .squad/templates/', async () => {
    await runInit(TEST_ROOT);
    
    const templatesPath = join(TEST_ROOT, '.squad', 'templates');
    expect(existsSync(templatesPath)).toBe(true);
    
    // Should contain squad.agent.md
    expect(existsSync(join(templatesPath, 'squad.agent.md'))).toBe(true);
  });

  it('should copy starter skills if none exist', async () => {
    await runInit(TEST_ROOT);
    
    const skillsPath = join(TEST_ROOT, '.squad', 'skills');
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
      'squad-main-guard.yml',
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
