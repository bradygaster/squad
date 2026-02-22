/**
 * E2E test: proves upper-level Squad context (decisions, skills, wisdom,
 * routing, casting) is visible to lower-level repos through the resolver.
 *
 * Simulates: Org repo → Team repo → Project repo (3-level hierarchy)
 * Verifies: each level can see all upstream content, closest wins on conflicts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  resolveUpstreams,
  buildInheritedContextBlock,
  buildSessionDisplay,
} from '../packages/squad-sdk/src/upstream/resolver.js';
import type { UpstreamConfig } from '../packages/squad-sdk/src/upstream/types.js';

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function clean(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

describe('E2E: Org → Team → Repo upstream inheritance', () => {
  let orgDir: string;
  let teamDir: string;
  let repoDir: string;

  beforeAll(() => {
    // ═══════════════════════════════════════════════════════
    // ORG LEVEL — shared standards for the whole organization
    // ═══════════════════════════════════════════════════════
    orgDir = tmp('e2e-org-');
    const org = path.join(orgDir, '.squad');

    // Org skill: API conventions
    fs.mkdirSync(path.join(org, 'skills', 'api-conventions'), { recursive: true });
    fs.writeFileSync(path.join(org, 'skills', 'api-conventions', 'SKILL.md'),
      '---\nname: api-conventions\nconfidence: high\n---\n\n# API Conventions\n\n- Use kebab-case for URL paths\n- Return ProblemDetails on errors\n- Version APIs via URL prefix /v1/\n');

    // Org skill: security patterns
    fs.mkdirSync(path.join(org, 'skills', 'security-patterns'), { recursive: true });
    fs.writeFileSync(path.join(org, 'skills', 'security-patterns', 'SKILL.md'),
      '---\nname: security-patterns\nconfidence: high\n---\n\n# Security Patterns\n\n- OAuth 2.0 + PKCE for user auth\n- httpOnly cookies for tokens\n- Never store secrets in env vars without a vault\n');

    // Org decisions
    fs.writeFileSync(path.join(org, 'decisions.md'),
      '# Org-Wide Decisions\n\n' +
      '### 2025-01-15: TypeScript mandatory\n**By:** CTO\n**What:** All new projects must use TypeScript.\n\n' +
      '### 2025-02-01: PostgreSQL as default DB\n**By:** Platform Lead\n**What:** Use PostgreSQL unless explicitly approved otherwise.\n\n' +
      '### 2025-02-15: No class-based React components\n**By:** Frontend Lead\n**What:** Function components with hooks only.\n');

    // Org wisdom
    fs.mkdirSync(path.join(org, 'identity'), { recursive: true });
    fs.writeFileSync(path.join(org, 'identity', 'wisdom.md'),
      '# Org Wisdom\n\n## Patterns\n\n' +
      '**Pattern:** Always add retry with exponential backoff for external HTTP calls.\n' +
      '**Pattern:** Use structured logging (JSON) with correlation IDs.\n' +
      '**Pattern:** Feature flags for all user-facing changes.\n\n' +
      '## Anti-Patterns\n\n' +
      '**Avoid:** SELECT * in production queries.\n' +
      '**Avoid:** Storing secrets in environment variables without a vault.\n');

    // Org casting policy
    fs.mkdirSync(path.join(org, 'casting'), { recursive: true });
    fs.writeFileSync(path.join(org, 'casting', 'policy.json'),
      JSON.stringify({ universe_allowlist: ['aliens', 'blade-runner', 'the-thing'], max_capacity: 12 }, null, 2));

    // Org routing
    fs.writeFileSync(path.join(org, 'routing.md'),
      '# Org Routing\n\n| Work Type | Route To |\n|-----------|----------|\n' +
      '| Security review | SecOps Lead |\n| Compliance | Legal Bot |\n| Accessibility | A11y Expert |\n');

    // ═══════════════════════════════════════════════════════
    // TEAM LEVEL — frontend team standards (inherits from org)
    // ═══════════════════════════════════════════════════════
    teamDir = tmp('e2e-team-');
    const team = path.join(teamDir, '.squad');

    // Team skill: React testing
    fs.mkdirSync(path.join(team, 'skills', 'react-testing'), { recursive: true });
    fs.writeFileSync(path.join(team, 'skills', 'react-testing', 'SKILL.md'),
      '---\nname: react-testing\nconfidence: medium\n---\n\n# React Testing\n\n- Use React Testing Library, not Enzyme\n- Test behavior, not implementation\n- Colocate tests in __tests__/ dirs\n');

    // Team decisions
    fs.writeFileSync(path.join(team, 'decisions.md'),
      '# Team Decisions\n\n' +
      '### Use Zustand for state management\n**What:** Zustand over Redux for all new state.\n\n' +
      '### Use React 19 with Server Components\n**What:** Standardize on React 19.\n');

    // Team wisdom
    fs.mkdirSync(path.join(team, 'identity'), { recursive: true });
    fs.writeFileSync(path.join(team, 'identity', 'wisdom.md'),
      '# Team Wisdom\n\n**Pattern:** Prefer Zustand over Redux.\n**Pattern:** Colocate tests with components.\n');

    // Team also points to org as its upstream
    fs.writeFileSync(path.join(team, 'upstream.json'), JSON.stringify({
      upstreams: [{ name: 'org', type: 'local', source: orgDir, added_at: new Date().toISOString(), last_synced: null }],
    } as UpstreamConfig, null, 2));

    // ═══════════════════════════════════════════════════════
    // REPO LEVEL — the actual project (inherits from team AND org)
    // ═══════════════════════════════════════════════════════
    repoDir = tmp('e2e-repo-');
    const repo = path.join(repoDir, '.squad');
    fs.mkdirSync(repo, { recursive: true });

    // Repo's own local skill
    fs.mkdirSync(path.join(repo, 'skills', 'project-patterns'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'skills', 'project-patterns', 'SKILL.md'),
      '---\nname: project-patterns\n---\n\n# Project Patterns\n\nUse MSW for API mocking in tests.\n');

    // Repo's own decisions
    fs.writeFileSync(path.join(repo, 'decisions.md'),
      '# Project Decisions\n\n### Use Vite for bundling\n**What:** Vite over webpack.\n');

    // Repo's own wisdom
    fs.mkdirSync(path.join(repo, 'identity'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'identity', 'wisdom.md'),
      '# Project Wisdom\n\n**Pattern:** Use MSW for API mocking.\n');

    // Repo points to both team and org
    fs.writeFileSync(path.join(repo, 'upstream.json'), JSON.stringify({
      upstreams: [
        { name: 'org', type: 'local', source: orgDir, added_at: new Date().toISOString(), last_synced: null },
        { name: 'team', type: 'local', source: teamDir, added_at: new Date().toISOString(), last_synced: null },
      ],
    } as UpstreamConfig, null, 2));
  });

  afterAll(() => {
    clean(orgDir);
    clean(teamDir);
    clean(repoDir);
  });

  // ── CORE: resolver finds all upstreams ──

  it('resolves both org and team upstreams from repo level', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'));
    expect(result).not.toBeNull();
    expect(result!.upstreams).toHaveLength(2);
    expect(result!.upstreams.map(u => u.name)).toEqual(['org', 'team']);
  });

  // ── ORG DECISIONS visible at repo level ──

  it('org decisions (TypeScript, PostgreSQL, no classes) are visible at repo level', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;

    expect(org.decisions).toContain('TypeScript mandatory');
    expect(org.decisions).toContain('PostgreSQL as default DB');
    expect(org.decisions).toContain('No class-based React components');
  });

  // ── TEAM DECISIONS visible at repo level ──

  it('team decisions (Zustand, React 19) are visible at repo level', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const team = result.upstreams.find(u => u.name === 'team')!;

    expect(team.decisions).toContain('Zustand');
    expect(team.decisions).toContain('React 19');
  });

  // ── ALL THREE LEVELS OF DECISIONS COEXIST ──

  it('repo, team, and org decisions all coexist (closest-wins)', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;

    // Repo's own decisions
    const localDecisions = fs.readFileSync(path.join(repoDir, '.squad', 'decisions.md'), 'utf8');
    expect(localDecisions).toContain('Vite');

    // Org decisions via upstream
    expect(result.upstreams.find(u => u.name === 'org')!.decisions).toContain('TypeScript');

    // Team decisions via upstream
    expect(result.upstreams.find(u => u.name === 'team')!.decisions).toContain('Zustand');
  });

  // ── ORG SKILLS visible at repo level ──

  it('org skills (api-conventions, security-patterns) readable with full content', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;

    expect(org.skills).toHaveLength(2);
    const apiSkill = org.skills.find(s => s.name === 'api-conventions')!;
    expect(apiSkill.content).toContain('kebab-case');
    expect(apiSkill.content).toContain('ProblemDetails');

    const secSkill = org.skills.find(s => s.name === 'security-patterns')!;
    expect(secSkill.content).toContain('OAuth 2.0');
    expect(secSkill.content).toContain('httpOnly cookies');
  });

  // ── TEAM SKILLS visible at repo level ──

  it('team skills (react-testing) readable with content', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const team = result.upstreams.find(u => u.name === 'team')!;

    expect(team.skills).toHaveLength(1);
    expect(team.skills[0].content).toContain('React Testing Library');
  });

  // ── LOCAL + UPSTREAM SKILLS COEXIST ──

  it('local repo skill coexists with org and team skills', () => {
    // Local skill exists
    const localSkill = fs.readFileSync(
      path.join(repoDir, '.squad', 'skills', 'project-patterns', 'SKILL.md'), 'utf8');
    expect(localSkill).toContain('MSW');

    // Upstream skills also available
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    expect(result.upstreams.find(u => u.name === 'org')!.skills).toHaveLength(2);
    expect(result.upstreams.find(u => u.name === 'team')!.skills).toHaveLength(1);
  });

  // ── ORG WISDOM visible at repo level ──

  it('org wisdom (retry, logging, feature flags, anti-patterns) visible', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;

    expect(org.wisdom).toContain('exponential backoff');
    expect(org.wisdom).toContain('structured logging');
    expect(org.wisdom).toContain('Feature flags');
    expect(org.wisdom).toContain('SELECT *');
  });

  // ── ORG CASTING POLICY visible at repo level ──

  it('org casting policy visible', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;

    expect(org.castingPolicy).toBeDefined();
    expect((org.castingPolicy as any).universe_allowlist).toContain('aliens');
    expect((org.castingPolicy as any).max_capacity).toBe(12);
  });

  // ── ORG ROUTING visible at repo level ──

  it('org routing rules (security, compliance, a11y) visible as fallback', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;

    expect(org.routing).toContain('Security review');
    expect(org.routing).toContain('Compliance');
    expect(org.routing).toContain('Accessibility');
  });

  // ── LIVE UPDATES: org changes propagate instantly ──

  it('org adds a new decision → visible at repo level without sync', () => {
    fs.appendFileSync(path.join(orgDir, '.squad', 'decisions.md'),
      '\n### 2025-03-01: Require PR reviews\n**What:** All PRs need at least one approval.\n');

    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.decisions).toContain('Require PR reviews');
  });

  it('org adds a new skill → visible at repo level without sync', () => {
    const newDir = path.join(orgDir, '.squad', 'skills', 'ci-cd-standards');
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, 'SKILL.md'),
      '---\nname: ci-cd-standards\n---\n\n# CI/CD\n\nAll PRs must pass CI.\n');

    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const org = result.upstreams.find(u => u.name === 'org')!;
    expect(org.skills.map(s => s.name)).toContain('ci-cd-standards');
  });

  // ── SESSION DISPLAY shows hierarchy ──

  it('session display shows both upstreams with content summary', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const display = buildSessionDisplay(result);

    expect(display).toContain('📡 Inherited context:');
    expect(display).toContain('org (local)');
    expect(display).toContain('team (local)');
    expect(display).toContain('decisions');
    expect(display).toContain('wisdom');
    expect(display).toContain('skill');
  });

  // ── SPAWN PROMPT BLOCK includes both sources ──

  it('INHERITED CONTEXT block lists both sources for spawn prompts', () => {
    const result = resolveUpstreams(path.join(repoDir, '.squad'))!;
    const block = buildInheritedContextBlock(result);

    expect(block).toContain('INHERITED CONTEXT:');
    expect(block).toContain('org:');
    expect(block).toContain('team:');
    expect(block).toContain('decisions ✓');
    expect(block).toContain('wisdom ✓');
    expect(block).toContain('routing ✓');
  });

  // ── TEAM ALSO SEES ORG (transitive) ──

  it('team repo can also resolve org as its own upstream', () => {
    const teamResult = resolveUpstreams(path.join(teamDir, '.squad'));
    expect(teamResult).not.toBeNull();
    expect(teamResult!.upstreams).toHaveLength(1);
    expect(teamResult!.upstreams[0].name).toBe('org');
    expect(teamResult!.upstreams[0].decisions).toContain('TypeScript');
  });
});
