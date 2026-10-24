/**
 * Tests for upstream resolver — proves the coordinator reads and uses
 * upstream content (skills, decisions, wisdom, casting, routing).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveUpstreams, buildInheritedContextBlock, buildSessionDisplay } from '../packages/squad-sdk/src/upstream/resolver.js';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('upstream resolver', () => {
  let orgDir: string;
  let teamDir: string;
  let repoDir: string;

  beforeAll(() => {
    // ── ORG REPO ──
    orgDir = makeTempDir('squad-upstream-org-');
    const orgSquad = path.join(orgDir, '.squad');

    fs.mkdirSync(path.join(orgSquad, 'skills', 'api-conventions'), { recursive: true });
    fs.writeFileSync(path.join(orgSquad, 'skills', 'api-conventions', 'SKILL.md'),
      '---\nname: api-conventions\nconfidence: high\n---\n\n# API Conventions\n\nUse kebab-case URLs.\n');

    fs.mkdirSync(path.join(orgSquad, 'skills', 'error-handling'), { recursive: true });
    fs.writeFileSync(path.join(orgSquad, 'skills', 'error-handling', 'SKILL.md'),
      '---\nname: error-handling\n---\n\n# Error Handling\n\nUse ProblemDetails (RFC 7807).\n');

    fs.writeFileSync(path.join(orgSquad, 'decisions.md'),
      '# Org Decisions\n\n### TypeScript mandatory\n### PostgreSQL default\n');

    fs.mkdirSync(path.join(orgSquad, 'identity'), { recursive: true });
    fs.writeFileSync(path.join(orgSquad, 'identity', 'wisdom.md'),
      '# Org Wisdom\n\nAlways add retry logic.\n');

    fs.mkdirSync(path.join(orgSquad, 'casting'), { recursive: true });
    fs.writeFileSync(path.join(orgSquad, 'casting', 'policy.json'),
      JSON.stringify({ universe_allowlist: ['aliens'] }, null, 2));

    fs.writeFileSync(path.join(orgSquad, 'routing.md'),
      '# Org Routing\n\n| Security | SecLead |\n');

    // ── TEAM REPO ──
    teamDir = makeTempDir('squad-upstream-team-');
    const teamSquad = path.join(teamDir, '.squad');

    fs.mkdirSync(path.join(teamSquad, 'skills', 'react-testing'), { recursive: true });
    fs.writeFileSync(path.join(teamSquad, 'skills', 'react-testing', 'SKILL.md'),
      '---\nname: react-testing\n---\n\n# React Testing\n\nUse RTL.\n');

    fs.writeFileSync(path.join(teamSquad, 'decisions.md'),
      '# Team Decisions\n\n### Use Zustand\n');

    // ── CHILD REPO ──
    repoDir = makeTempDir('squad-upstream-repo-');
    const repoSquad = path.join(repoDir, '.squad');
    fs.mkdirSync(repoSquad, { recursive: true });

    // Write upstream.json pointing to org and team
    fs.writeFileSync(path.join(repoSquad, 'upstream.json'), JSON.stringify({
      upstreams: [
        { name: 'org', type: 'local', source: orgDir, added_at: new Date().toISOString(), last_synced: null },
        { name: 'team', type: 'local', source: teamDir, added_at: new Date().toISOString(), last_synced: null },
      ],
    }, null, 2));
  });

  afterAll(() => {
    cleanDir(orgDir);
    cleanDir(teamDir);
    cleanDir(repoDir);
  });

  it('discovers both upstreams', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'));
    expect(result).not.toBeNull();
    expect(result!.upstreams).toHaveLength(2);
    expect(result!.upstreams[0].name).toBe('org');
    expect(result!.upstreams[1].name).toBe('team');
  });

  it('reads org skills with content', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.skills).toHaveLength(2);
    expect(org.skills.map(s => s.name)).toContain('api-conventions');
    expect(org.skills.find(s => s.name === 'error-handling')!.content).toContain('ProblemDetails');
  });

  it('reads org decisions', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.decisions).toContain('TypeScript mandatory');
    expect(org.decisions).toContain('PostgreSQL default');
  });

  it('reads org wisdom', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.wisdom).toContain('retry logic');
  });

  it('reads org casting policy', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.castingPolicy).toBeDefined();
    expect((org.castingPolicy as Record<string, string[]>).universe_allowlist).toContain('aliens');
  });

  it('reads org routing', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.routing).toContain('Security');
  });

  it('reads team skills', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const team = result.upstreams.find(u => u.name === 'team')!;
    expect(team.skills).toHaveLength(1);
    expect(team.skills[0].name).toBe('react-testing');
  });

  it('reads team decisions', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const team = result.upstreams.find(u => u.name === 'team')!;
    expect(team.decisions).toContain('Zustand');
  });

  it('org changes are visible live', () => {
    // Add a new skill to org
    const newSkillDir = path.join(orgDir, '.squad', 'skills', 'new-skill');
    fs.mkdirSync(newSkillDir, { recursive: true });
    fs.writeFileSync(path.join(newSkillDir, 'SKILL.md'), '---\nname: new-skill\n---\n\n# New\n');

    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.skills).toHaveLength(3);
    expect(org.skills.map(s => s.name)).toContain('new-skill');
  });

  it('builds INHERITED CONTEXT block', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const block = buildInheritedContextBlock(result);
    expect(block).toContain('INHERITED CONTEXT:');
    expect(block).toContain('org:');
    expect(block).toContain('team:');
    expect(block).toContain('skills (3)');
    expect(block).toContain('decisions ✓');
  });

  it('builds session display', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const display = buildSessionDisplay(result);
    expect(display).toContain('📡 Inherited context:');
    expect(display).toContain('org (local)');
    expect(display).toContain('team (local)');
  });

  it('shows warning for unreachable source', () => {
    const display = buildSessionDisplay({
      maxDepth: 3,
      diagnostics: ['dead: git upstream is not materialized locally'],
      upstreams: [{
        name: 'dead', type: 'git', provenance: 'upstream:dead@main', origin: 'https://example.invalid/dead.git', ref: 'main',
        depth: 1, via: [], status: 'unavailable', diagnostic: 'dead: git upstream is not materialized locally', squadDir: null, lastSynced: null,
        skills: [], decisions: null, wisdom: null, castingPolicy: null, routing: null,
      }],
    });
    expect(display).toContain('⚠️');
    expect(display).toContain('dead');
    expect(display).toContain('not materialized locally');
  });

  it('returns null when no upstream.json', () => {
    const emptyDir = makeTempDir('squad-upstream-empty-');
    try {
      fs.mkdirSync(path.join(emptyDir, '.squad'), { recursive: true });
      expect(resolveUpstreams(path.join(emptyDir, '.squad'))).toBeNull();
    } finally {
      cleanDir(emptyDir);
    }
  });

  it('returns empty string for null resolution', () => {
    expect(buildInheritedContextBlock(null)).toBe('');
    expect(buildSessionDisplay(null)).toBe('');
  });
});
