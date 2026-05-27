/**
 * Tests for the coordinator export pipeline:
 * - IR loader (load-export-context)
 * - Prompt compiler (compile-coordinator-prompt)
 * - Frontmatter renderer (render-frontmatter)
 * - File writer (write-coordinator-agent)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadExportContext } from '../../packages/squad-sdk/src/repo-native/load-export-context.js';
import { compileCoordinatorPrompt, estimateTokens } from '../../packages/squad-sdk/src/repo-native/compile-coordinator-prompt.js';
import { renderFrontmatter } from '../../packages/squad-sdk/src/repo-native/render-frontmatter.js';
import { writeCoordinatorAgent } from '../../packages/squad-sdk/src/repo-native/write-coordinator-agent.js';
import { startWatchExport } from '../../packages/squad-sdk/src/repo-native/watch-export.js';
import type { CoordinatorMeta, LoadExportContextOptions } from '../../packages/squad-sdk/src/repo-native/types.js';

let TEST_ROOT: string;

function setupSquadFixture(opts?: { members?: number; routing?: boolean; ceremonies?: boolean }) {
  const { members = 3, routing = true, ceremonies = true } = opts ?? {};

  const squadDir = join(TEST_ROOT, '.squad');
  mkdirSync(squadDir, { recursive: true });

  const names = ['Garfield', 'Salem', 'Felix', 'Nala', 'Crookshanks', 'Whiskers', 'Mittens', 'Shadow', 'Luna', 'Simba'];
  const roles = ['Research Lead', 'SDK Analyst', 'CLI Analyst', 'Writer', 'Fact Checker', 'Tester', 'Reviewer', 'Ops', 'Security', 'Infra'];

  const memberRows = Array.from({ length: members }, (_, i) => {
    const name = names[i % names.length]!;
    const role = roles[i % roles.length]!;
    const slug = name.toLowerCase();
    return `| ${name} | ${role} | .squad/agents/${slug}/charter.md | Active |`;
  });

  writeFileSync(join(squadDir, 'team.md'), [
    '# Test Squad',
    '',
    '> Automated testing squad',
    '',
    '## Members',
    '',
    '| Name | Role | Charter | Status |',
    '|------|------|---------|--------|',
    ...memberRows,
    '',
    '## Project Context',
    '',
    '- **User:** Test User',
  ].join('\n'));

  // Create agent charters
  const agentsDir = join(squadDir, 'agents');
  for (let i = 0; i < members; i++) {
    const slug = names[i % names.length]!.toLowerCase();
    const agentDir = join(agentsDir, slug);
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'charter.md'), [
      `# ${slug}`,
      '',
      '## Role',
      '',
      `- Responsible for ${slug}-related work`,
      '- Collaborates with team members',
      '- Follows project conventions',
    ].join('\n'));
  }

  if (routing) {
    writeFileSync(join(squadDir, 'routing.md'), [
      '# Work Routing',
      '',
      '## Routing Table',
      '',
      '| Work Type | Route To | Examples |',
      '|-----------|----------|----------|',
      '| Research | Garfield | synthesis, strategy |',
      '| SDK work | Salem | runtime, hooks |',
      '| CLI work | Felix | commands, UX |',
      '',
      '## Rules',
      '',
      '1. Eager by default.',
      '2. Spawn downstream validation early.',
    ].join('\n'));
  }

  if (ceremonies) {
    writeFileSync(join(squadDir, 'ceremonies.md'), [
      '# Ceremonies',
      '',
      '## Deep Dive',
      '- Trigger: user asks for research',
      '- Facilitator: Garfield',
      '- Participants: relevant analysts + Nala',
      '',
      '## Fact Check Gate',
      '- Trigger: before promoting claims',
      '- Facilitator: Crookshanks',
    ].join('\n'));
  }

  return squadDir;
}

describe('Coordinator Export: load-export-context', () => {
  beforeEach(() => {
    TEST_ROOT = mkdtempSync(join(tmpdir(), '.test-coord-export-'));
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('should parse a full .squad/ directory into IR', async () => {
    const squadDir = setupSquadFixture();
    const options: LoadExportContextOptions = {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'none',
    };

    const ctx = await loadExportContext(TEST_ROOT, squadDir, options);

    expect(ctx.team.name).toBe('Test Squad');
    expect(ctx.team.mission).toBe('Automated testing squad');
    expect(ctx.team.user).toBe('Test User');
    expect(ctx.team.members).toHaveLength(3);
    expect(ctx.team.members[0]!.slug).toBe('garfield');
    expect(ctx.team.members[0]!.role).toBe('Research Lead');
    expect(ctx.routing.rules).toHaveLength(3);
    expect(ctx.routing.principles).toHaveLength(2);
    expect(ctx.ceremonies).toHaveLength(2);
    expect(ctx.sourceFiles).toContain('.squad/team.md');
  });

  it('should handle missing optional files gracefully', async () => {
    const squadDir = setupSquadFixture({ routing: false, ceremonies: false });
    const options: LoadExportContextOptions = {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'none',
    };

    const ctx = await loadExportContext(TEST_ROOT, squadDir, options);

    expect(ctx.routing.rules).toHaveLength(0);
    expect(ctx.ceremonies).toHaveLength(0);
    expect(ctx.team.members).toHaveLength(3);
  });

  it('should resolve skills in baseline mode', async () => {
    const squadDir = setupSquadFixture();
    const skillDir = join(TEST_ROOT, '.copilot', 'skills', 'squad-conventions');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Conventions');

    const options: LoadExportContextOptions = {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'baseline',
    };

    const ctx = await loadExportContext(TEST_ROOT, squadDir, options);
    expect(ctx.coordinator.skills).toContain('squad-conventions');
  });
});

describe('Coordinator Export: compile-coordinator-prompt', () => {
  beforeEach(() => {
    TEST_ROOT = mkdtempSync(join(tmpdir(), '.test-coord-compile-'));
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('should compile a prompt within soft budget for normal teams', async () => {
    const squadDir = setupSquadFixture();
    const ctx = await loadExportContext(TEST_ROOT, squadDir, {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'none',
    });

    const result = compileCoordinatorPrompt(ctx, {
      softLimit: 14_000,
      hardLimit: 20_000,
      compact: false,
    });

    expect(result.estimatedTokens).toBeLessThan(14_000);
    expect(result.mode).toBe('full');
    expect(result.markdown).toContain('## Team roster');
    expect(result.markdown).toContain('## Dispatch rules');
    expect(result.markdown).toContain('Garfield');
    expect(result.markdown).toContain('generated by squad export');
  });

  it('should apply compact mode when forced', async () => {
    const squadDir = setupSquadFixture();
    const ctx = await loadExportContext(TEST_ROOT, squadDir, {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'none',
    });

    const result = compileCoordinatorPrompt(ctx, {
      softLimit: 14_000,
      hardLimit: 20_000,
      compact: true,
    });

    expect(result.mode).toBe('compact');
    expect(result.appliedCompactions).toContain('forced-compact');
  });

  it('should fail if prompt exceeds hard budget', async () => {
    const squadDir = setupSquadFixture({ members: 5 });
    const ctx = await loadExportContext(TEST_ROOT, squadDir, {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'none',
    });

    expect(() => compileCoordinatorPrompt(ctx, {
      softLimit: 50,
      hardLimit: 100,
      compact: false,
    })).toThrow(/Export aborted/);
  });

  it('should estimate tokens correctly', () => {
    expect(estimateTokens('hello world')).toBe(3);
    expect(estimateTokens('')).toBe(0);
  });
});

describe('Coordinator Export: render-frontmatter', () => {
  it('should render valid YAML frontmatter', () => {
    const meta: CoordinatorMeta = {
      displayName: 'Squad',
      description: 'Test coordinator',
      tools: '*',
      skills: ['squad-conventions', 'agent-collaboration'],
    };

    const result = renderFrontmatter(meta);

    expect(result).toContain('---');
    expect(result).toContain('name: "Squad"');
    expect(result).toContain('description: "Test coordinator"');
    expect(result).toContain('tools: "*"');
    expect(result).toContain('user-invocable: true');
    expect(result).toContain('deferred-tool-loading: true');
    expect(result).toContain('  - "squad-conventions"');
    expect(result).toContain('  - "agent-collaboration"');
  });

  it('should include model when specified', () => {
    const meta: CoordinatorMeta = {
      displayName: 'Squad',
      description: 'Test',
      model: 'claude-sonnet-4.5',
      tools: '*',
      skills: [],
    };

    const result = renderFrontmatter(meta);
    expect(result).toContain('model: "claude-sonnet-4.5"');
  });

  it('should omit model when not specified', () => {
    const meta: CoordinatorMeta = {
      displayName: 'Squad',
      description: 'Test',
      tools: '*',
      skills: [],
    };

    const result = renderFrontmatter(meta);
    expect(result).not.toContain('model:');
  });
});

describe('Coordinator Export: write-coordinator-agent', () => {
  beforeEach(() => {
    TEST_ROOT = mkdtempSync(join(tmpdir(), '.test-coord-write-'));
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('should write the agent file to .github/agents/', () => {
    const output = '---\nname: Squad\n---\n\n<!-- generated by squad export: do not edit by hand -->\nTest content';

    const result = writeCoordinatorAgent({
      root: TEST_ROOT,
      outputPath: '.github/agents/squad.md',
      output,
      check: false,
      dryRun: false,
      force: false,
      cleanLegacyAgent: false,
    });

    expect(result.written).toBe(true);
    const written = readFileSync(join(TEST_ROOT, '.github', 'agents', 'squad.md'), 'utf-8');
    expect(written).toBe(output);
  });

  it('should detect drift in check mode', () => {
    const agentsDir = join(TEST_ROOT, '.github', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'squad.md'), '<!-- generated by squad export: do not edit by hand -->\nOld content');

    const result = writeCoordinatorAgent({
      root: TEST_ROOT,
      outputPath: '.github/agents/squad.md',
      output: '<!-- generated by squad export: do not edit by hand -->\nNew content',
      check: true,
      dryRun: false,
      force: false,
      cleanLegacyAgent: false,
    });

    expect(result.driftDetected).toBe(true);
    expect(result.written).toBe(false);
  });

  it('should not overwrite user-owned files without --force', () => {
    const agentsDir = join(TEST_ROOT, '.github', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'squad.md'), 'User-owned content without generated marker');

    expect(() => writeCoordinatorAgent({
      root: TEST_ROOT,
      outputPath: '.github/agents/squad.md',
      output: '<!-- generated by squad export: do not edit by hand -->\nNew',
      check: false,
      dryRun: false,
      force: false,
      cleanLegacyAgent: false,
    })).toThrow(/not generated by squad export/);
  });

  it('should detect legacy squad.agent.md collision', () => {
    const agentsDir = join(TEST_ROOT, '.github', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'squad.agent.md'), 'legacy file');

    const output = '<!-- generated by squad export: do not edit by hand -->\nNew';
    const result = writeCoordinatorAgent({
      root: TEST_ROOT,
      outputPath: '.github/agents/squad.md',
      output,
      check: false,
      dryRun: false,
      force: false,
      cleanLegacyAgent: false,
    });

    expect(result.legacyCollision).toBe(true);
    expect(result.legacyCleaned).toBe(false);
    expect(existsSync(join(agentsDir, 'squad.agent.md'))).toBe(true);
  });

  it('should clean legacy file when --clean-legacy-agent is set', () => {
    const agentsDir = join(TEST_ROOT, '.github', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'squad.agent.md'), 'legacy file');

    const output = '<!-- generated by squad export: do not edit by hand -->\nNew';
    const result = writeCoordinatorAgent({
      root: TEST_ROOT,
      outputPath: '.github/agents/squad.md',
      output,
      check: false,
      dryRun: false,
      force: false,
      cleanLegacyAgent: true,
    });

    expect(result.legacyCleaned).toBe(true);
    expect(existsSync(join(agentsDir, 'squad.agent.md'))).toBe(false);
    // Backup uses timestamp suffix, verify any .bak.* file exists
    const files = require('node:fs').readdirSync(agentsDir) as string[];
    const backupFile = files.find((f: string) => f.startsWith('squad.agent.md.bak.'));
    expect(backupFile).toBeDefined();
  });

  it('should not overwrite existing backup files (uses unique timestamp)', () => {
    const agentsDir = join(TEST_ROOT, '.github', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    // Create a pre-existing backup
    writeFileSync(join(agentsDir, 'squad.agent.md.bak'), 'existing backup');
    writeFileSync(join(agentsDir, 'squad.agent.md'), 'legacy file');

    const output = '<!-- generated by squad export: do not edit by hand -->\nNew';
    const result = writeCoordinatorAgent({
      root: TEST_ROOT,
      outputPath: '.github/agents/squad.md',
      output,
      check: false,
      dryRun: false,
      force: false,
      cleanLegacyAgent: true,
    });

    expect(result.legacyCleaned).toBe(true);
    // Original .bak file should still exist untouched
    expect(readFileSync(join(agentsDir, 'squad.agent.md.bak'), 'utf-8')).toBe('existing backup');
  });

  it('should flag user-owned file in check mode without reporting drift', () => {
    const agentsDir = join(TEST_ROOT, '.github', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'squad.md'), 'User-owned content without generated marker');

    const result = writeCoordinatorAgent({
      root: TEST_ROOT,
      outputPath: '.github/agents/squad.md',
      output: '<!-- generated by squad export: do not edit by hand -->\nNew',
      check: true,
      dryRun: false,
      force: false,
      cleanLegacyAgent: false,
    });

    expect(result.userOwned).toBe(true);
    expect(result.driftDetected).toBe(false);
    expect(result.written).toBe(false);
  });
});

describe('Coordinator Export: load-export-context path safety', () => {
  beforeEach(() => {
    TEST_ROOT = mkdtempSync(join(tmpdir(), '.test-coord-path-'));
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('should reject charter paths that escape the repo root', async () => {
    const squadDir = join(TEST_ROOT, '.squad');
    mkdirSync(squadDir, { recursive: true });

    writeFileSync(join(squadDir, 'team.md'), [
      '# Evil Squad',
      '',
      '## Members',
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      '| Hacker | Exploit | ../../etc/passwd | Active |',
    ].join('\n'));

    const options: LoadExportContextOptions = {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'none',
    };

    await expect(loadExportContext(TEST_ROOT, squadDir, options))
      .rejects.toThrow(/resolves outside the repository root/);
  });

  it('should reject absolute charter paths', async () => {
    const squadDir = join(TEST_ROOT, '.squad');
    mkdirSync(squadDir, { recursive: true });

    writeFileSync(join(squadDir, 'team.md'), [
      '# Evil Squad',
      '',
      '## Members',
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      '| Hacker | Exploit | /etc/passwd | Active |',
    ].join('\n'));

    const options: LoadExportContextOptions = {
      outputPath: '.github/agents/squad.md',
      generatedAt: '2026-01-01T00:00:00Z',
      skillMode: 'none',
    };

    await expect(loadExportContext(TEST_ROOT, squadDir, options))
      .rejects.toThrow(/resolves outside the repository root/);
  });
});

describe('Coordinator Export: render-frontmatter YAML safety', () => {
  it('should safely encode values with YAML special characters', () => {
    const meta: CoordinatorMeta = {
      displayName: 'Squad: The Coordinator',
      description: 'Contains # special: chars "and" newline\nhere',
      model: 'model: injection',
      tools: ['tool: bad', 'tool# comment'],
      skills: ['skill: evil'],
    };

    const result = renderFrontmatter(meta);

    // All values should be properly quoted
    expect(result).toContain('name: "Squad: The Coordinator"');
    expect(result).toContain('description: "Contains # special: chars \\"and\\" newline\\nhere"');
    expect(result).toContain('model: "model: injection"');
    expect(result).toContain('  - "tool: bad"');
    expect(result).toContain('  - "tool# comment"');
    expect(result).toContain('  - "skill: evil"');
  });
});

describe('Coordinator Export: watch-export', () => {
  beforeEach(() => {
    TEST_ROOT = mkdtempSync(join(tmpdir(), '.test-coord-watch-'));
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('should trigger rebuild when a .squad/ file changes', async () => {
    const squadDir = join(TEST_ROOT, '.squad');
    mkdirSync(squadDir, { recursive: true });
    writeFileSync(join(squadDir, 'team.md'), '# Team');

    let rebuildCount = 0;
    const cleanup = startWatchExport({
      root: TEST_ROOT,
      squadRoot: squadDir,
      onRebuild: async () => { rebuildCount++; },
      debounceMs: 50,
    });

    // Modify a file
    await new Promise(resolve => setTimeout(resolve, 100));
    writeFileSync(join(squadDir, 'team.md'), '# Updated Team');

    // Wait for debounce to fire
    await new Promise(resolve => setTimeout(resolve, 200));
    cleanup();

    expect(rebuildCount).toBeGreaterThanOrEqual(1);
  });

  it('should trigger rebuild when a new file is created in .squad/', async () => {
    const squadDir = join(TEST_ROOT, '.squad');
    mkdirSync(squadDir, { recursive: true });

    let rebuildCount = 0;
    const cleanup = startWatchExport({
      root: TEST_ROOT,
      squadRoot: squadDir,
      onRebuild: async () => { rebuildCount++; },
      debounceMs: 50,
    });

    // Create a new file in the watched directory
    await new Promise(resolve => setTimeout(resolve, 100));
    writeFileSync(join(squadDir, 'routing.md'), '# Routing');

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 200));
    cleanup();

    expect(rebuildCount).toBeGreaterThanOrEqual(1);
  });

  it('should debounce multiple rapid changes into one rebuild', async () => {
    const squadDir = join(TEST_ROOT, '.squad');
    mkdirSync(squadDir, { recursive: true });
    writeFileSync(join(squadDir, 'team.md'), '# Team');

    let rebuildCount = 0;
    const cleanup = startWatchExport({
      root: TEST_ROOT,
      squadRoot: squadDir,
      onRebuild: async () => { rebuildCount++; },
      debounceMs: 100,
    });

    // Rapid-fire changes
    await new Promise(resolve => setTimeout(resolve, 50));
    writeFileSync(join(squadDir, 'team.md'), '# Update 1');
    writeFileSync(join(squadDir, 'team.md'), '# Update 2');
    writeFileSync(join(squadDir, 'team.md'), '# Update 3');

    // Wait for debounce to settle
    await new Promise(resolve => setTimeout(resolve, 300));
    cleanup();

    // Should have debounced into 1 rebuild (not 3)
    expect(rebuildCount).toBe(1);
  });

  it('should ignore non-relevant file extensions', async () => {
    const squadDir = join(TEST_ROOT, '.squad');
    mkdirSync(squadDir, { recursive: true });

    let rebuildCount = 0;
    const cleanup = startWatchExport({
      root: TEST_ROOT,
      squadRoot: squadDir,
      onRebuild: async () => { rebuildCount++; },
      debounceMs: 50,
    });

    // Create an irrelevant file
    await new Promise(resolve => setTimeout(resolve, 100));
    writeFileSync(join(squadDir, 'notes.txt'), 'ignored');

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 200));
    cleanup();

    expect(rebuildCount).toBe(0);
  });

  it('should clean up watchers when stop function is called', () => {
    const squadDir = join(TEST_ROOT, '.squad');
    mkdirSync(squadDir, { recursive: true });

    const cleanup = startWatchExport({
      root: TEST_ROOT,
      squadRoot: squadDir,
      onRebuild: async () => {},
      debounceMs: 50,
    });

    // Should not throw
    cleanup();
  });
});
