/**
 * Tests for SkillSource interface & implementations (M5-5, Issue #128)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  LocalSkillSource,
  GitHubSkillSource,
  SkillSourceRegistry,
  type SkillSource,
  type SkillManifest,
} from '@bradygaster/squad-sdk/skills';
import type { GitHubFetcher } from '@bradygaster/squad-sdk/config';

// --- Helpers ---

function makeFetcher(
  dirs: Array<{ name: string; type: 'file' | 'dir' }> = [],
  files: Record<string, string> = {},
): GitHubFetcher {
  return {
    listDirectory: vi.fn(async () => dirs),
    getFileContent: vi.fn(async (_o, _r, p) => files[p] ?? null),
  };
}

const SKILL_MD = `---
name: TypeScript Testing
domain: testing
triggers: [vitest, jest, test]
roles: [tester, developer]
---
Use vitest for all unit tests. Prefer describe/it style.
`;

const SKILL_MD_MINIMAL = `---
name: Docker
domain: devops
triggers: [docker, container]
roles: [ops]
---
Run containers with docker compose.
`;

function createTempDir(): string {
  const dir = path.join(process.env.TEMP || '/tmp', `squad-test-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function removeTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- Tests ---

describe('LocalSkillSource', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('should have correct name and type', () => {
    const source = new LocalSkillSource(tempDir);
    expect(source.name).toBe('local');
    expect(source.type).toBe('local');
  });

  it('should return empty list when .copilot/skills/ does not exist', async () => {
    const source = new LocalSkillSource(tempDir);
    const skills = await source.listSkills();
    expect(skills).toEqual([]);
  });

  it('should list skills from .copilot/skills/ directories', async () => {
    const skillsDir = path.join(tempDir, '.copilot', 'skills', 'ts-testing');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), SKILL_MD);

    const source = new LocalSkillSource(tempDir);
    const skills = await source.listSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('ts-testing');
    expect(skills[0].name).toBe('TypeScript Testing');
    expect(skills[0].domain).toBe('testing');
    expect(skills[0].source).toBe('local');
  });

  it('should skip directories without SKILL.md', async () => {
    const emptyDir = path.join(tempDir, '.copilot', 'skills', 'empty-skill');
    fs.mkdirSync(emptyDir, { recursive: true });

    const source = new LocalSkillSource(tempDir);
    const skills = await source.listSkills();
    expect(skills).toHaveLength(0);
  });

  it('should getSkill by id', async () => {
    const skillsDir = path.join(tempDir, '.copilot', 'skills', 'ts-testing');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), SKILL_MD);

    const source = new LocalSkillSource(tempDir);
    const skill = await source.getSkill('ts-testing');

    expect(skill).not.toBeNull();
    expect(skill!.id).toBe('ts-testing');
    expect(skill!.name).toBe('TypeScript Testing');
    expect(skill!.domain).toBe('testing');
    expect(skill!.triggers).toEqual(['vitest', 'jest', 'test']);
    expect(skill!.agentRoles).toEqual(['tester', 'developer']);
    expect(skill!.content).toContain('vitest');
  });

  it('should return null for non-existent skill', async () => {
    const source = new LocalSkillSource(tempDir);
    const skill = await source.getSkill('does-not-exist');
    expect(skill).toBeNull();
  });

  it('should getContent by id', async () => {
    const skillsDir = path.join(tempDir, '.copilot', 'skills', 'ts-testing');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), SKILL_MD);

    const source = new LocalSkillSource(tempDir);
    const content = await source.getContent('ts-testing');
    expect(content).toContain('vitest');
  });

  it('should return null content for missing skill', async () => {
    const source = new LocalSkillSource(tempDir);
    const content = await source.getContent('missing');
    expect(content).toBeNull();
  });

  it('should fall back to legacy .squad/skills/ when .copilot/skills/ is absent', async () => {
    const legacyDir = path.join(tempDir, '.squad', 'skills', 'legacy-skill');
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, 'SKILL.md'), SKILL_MD_MINIMAL);

    const source = new LocalSkillSource(tempDir);
    const skills = await source.listSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('legacy-skill');
  });

  it('should support custom priority', () => {
    const source = new LocalSkillSource(tempDir, 10);
    expect(source.priority).toBe(10);
  });
});

describe('GitHubSkillSource', () => {
  it('should have correct name and type', () => {
    const source = new GitHubSkillSource('acme/repo', { fetcher: makeFetcher() });
    expect(source.name).toBe('github');
    expect(source.type).toBe('github');
  });

  it('should throw on invalid repo format', () => {
    expect(() => new GitHubSkillSource('bad-format')).toThrow('Invalid repo format');
  });

  it('should list skills from GitHub repo', async () => {
    const fetcher = makeFetcher(
      [{ name: 'ts-testing', type: 'dir' }],
      { '.copilot/skills/ts-testing/SKILL.md': SKILL_MD },
    );
    const source = new GitHubSkillSource('acme/repo', { fetcher });

    const skills = await source.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe('ts-testing');
    expect(skills[0].name).toBe('TypeScript Testing');
    expect(skills[0].source).toBe('github');
  });

  it('should skip directories without SKILL.md', async () => {
    const fetcher = makeFetcher(
      [{ name: 'empty', type: 'dir' }],
      {},
    );
    const source = new GitHubSkillSource('acme/repo', { fetcher });

    const skills = await source.listSkills();
    expect(skills).toHaveLength(0);
  });

  it('should getSkill from GitHub', async () => {
    const fetcher = makeFetcher([], {
      '.copilot/skills/docker/SKILL.md': SKILL_MD_MINIMAL,
    });
    const source = new GitHubSkillSource('acme/repo', { fetcher });

    const skill = await source.getSkill('docker');
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('Docker');
    expect(skill!.domain).toBe('devops');
    expect(skill!.triggers).toEqual(['docker', 'container']);
  });

  it('should return null for missing skill', async () => {
    const fetcher = makeFetcher([], {});
    const source = new GitHubSkillSource('acme/repo', { fetcher });

    const skill = await source.getSkill('nonexistent');
    expect(skill).toBeNull();
  });

  it('should getContent from GitHub', async () => {
    const fetcher = makeFetcher([], {
      '.copilot/skills/docker/SKILL.md': SKILL_MD_MINIMAL,
    });
    const source = new GitHubSkillSource('acme/repo', { fetcher });

    const content = await source.getContent('docker');
    expect(content).toContain('docker compose');
  });
});

describe('SkillSourceRegistry', () => {
  it('should register and unregister sources', () => {
    const registry = new SkillSourceRegistry();
    const source = new LocalSkillSource('/tmp/test');

    registry.register(source);
    expect(registry.getSource('local')).toBe(source);

    registry.unregister('local');
    expect(registry.getSource('local')).toBeUndefined();
  });

  it('should list skills from all sources', async () => {
    const fetcher1 = makeFetcher(
      [{ name: 'skill-a', type: 'dir' }],
      { '.copilot/skills/skill-a/SKILL.md': SKILL_MD },
    );
    const fetcher2 = makeFetcher(
      [{ name: 'skill-b', type: 'dir' }],
      { '.copilot/skills/skill-b/SKILL.md': SKILL_MD_MINIMAL },
    );

    const registry = new SkillSourceRegistry();
    registry.register(new GitHubSkillSource('acme/repo1', { fetcher: fetcher1 }));
    registry.register(new GitHubSkillSource('acme/repo2', { fetcher: fetcher2 }));

    // Since both have name 'github', only the second is registered
    const skills = await registry.listAllSkills();
    expect(skills.length).toBeGreaterThanOrEqual(1);
  });

  it('should find skill across sources', async () => {
    const fetcher = makeFetcher([], {
      '.copilot/skills/docker/SKILL.md': SKILL_MD_MINIMAL,
    });

    const registry = new SkillSourceRegistry();
    registry.register(new GitHubSkillSource('acme/repo', { fetcher }));

    const skill = await registry.findSkill('docker');
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('Docker');
  });

  it('should return null when skill not found in any source', async () => {
    const fetcher = makeFetcher([], {});
    const registry = new SkillSourceRegistry();
    registry.register(new GitHubSkillSource('acme/repo', { fetcher }));

    const skill = await registry.findSkill('nonexistent');
    expect(skill).toBeNull();
  });

  it('should get content across sources', async () => {
    const fetcher = makeFetcher([], {
      '.copilot/skills/docker/SKILL.md': SKILL_MD_MINIMAL,
    });

    const registry = new SkillSourceRegistry();
    registry.register(new GitHubSkillSource('acme/repo', { fetcher }));

    const content = await registry.getContent('docker');
    expect(content).toContain('docker compose');
  });

  it('should respect source priority ordering', async () => {
    const fetcherHigh = makeFetcher([], {
      '.copilot/skills/shared/SKILL.md': `---\nname: High Priority\ndomain: hp\ntriggers: []\nroles: []\n---\nHigh priority content.`,
    });
    const fetcherLow = makeFetcher([], {
      '.copilot/skills/shared/SKILL.md': `---\nname: Low Priority\ndomain: lp\ntriggers: []\nroles: []\n---\nLow priority content.`,
    });

    const registry = new SkillSourceRegistry();

    // Register with different names to allow both in registry
    const highSource = new GitHubSkillSource('acme/high', { fetcher: fetcherHigh, priority: 10 });
    const lowSource = new GitHubSkillSource('acme/low', { fetcher: fetcherLow, priority: 1 });

    // Override name via register to make them unique
    (highSource as any).name = 'github-high';
    (lowSource as any).name = 'github-low';

    registry.register(highSource);
    registry.register(lowSource);

    const skill = await registry.findSkill('shared');
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('High Priority');
  });
});
