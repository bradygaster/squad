/**
 * Tests for CastingEngine (M3-2, Issue #138)
 */

import { afterEach, describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CastingEngine,
  type CastingConfig,
  type CastMember,
  type AgentRole,
  type UniverseId,
} from '@bradygaster/squad-sdk/casting';

const castingRoots: string[] = [];

function castingDir(): string {
  const root = mkdtempSync(join(process.cwd(), '.casting-registry-test-'));
  const dir = join(root, 'casting');
  mkdirSync(dir);
  castingRoots.push(root);
  return dir;
}

function registryRaw(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema: 'squad-agent-provenance/v1',
    schema_version: 1,
    revision: 1,
    generated_at: '2026-09-21T00:00:00.000Z',
    agents: {},
    ...overrides,
  });
}

function historyRaw(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    assignment_cast_snapshots: {},
    universe_usage_history: [],
    ...overrides,
  });
}

afterEach(() => {
  for (const root of castingRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('CastingEngine', () => {
  const engine = new CastingEngine();

  // --- Universe discovery ---

  describe('getUniverses', () => {
    it('should return available universe IDs', () => {
      const ids = engine.getUniverses();
      expect(ids).toContain('usual-suspects');
      expect(ids).toContain('oceans-eleven');
    });

    it('should not include "custom" as a built-in universe', () => {
      const ids = engine.getUniverses();
      expect(ids).not.toContain('custom');
    });
  });

  describe('getUniverse', () => {
    it('should return template for usual-suspects', () => {
      const u = engine.getUniverse('usual-suspects');
      expect(u).toBeDefined();
      expect(u!.id).toBe('usual-suspects');
    });

    it('should return template for oceans-eleven', () => {
      const u = engine.getUniverse('oceans-eleven');
      expect(u).toBeDefined();
      expect(u!.id).toBe('oceans-eleven');
    });

    it('should return undefined for unknown universe', () => {
      expect(engine.getUniverse('star-wars' as UniverseId)).toBeUndefined();
    });
  });

  // --- castTeam: usual-suspects ---

  describe('castTeam — usual-suspects', () => {
    it('should cast a team with default required roles', () => {
      const team = engine.castTeam({ universe: 'usual-suspects' });
      expect(team.length).toBeGreaterThanOrEqual(3);
      const roles = team.map((m) => m.role);
      expect(roles).toContain('lead');
      expect(roles).toContain('developer');
      expect(roles).toContain('tester');
    });

    it('should generate CastMember objects with all fields', () => {
      const team = engine.castTeam({ universe: 'usual-suspects' });
      for (const member of team) {
        expect(member.name).toBeTruthy();
        expect(member.role).toBeTruthy();
        expect(member.personality).toBeTruthy();
        expect(member.backstory).toBeTruthy();
        expect(member.displayName).toContain('—');
      }
    });

    it('should respect teamSize', () => {
      const team = engine.castTeam({ universe: 'usual-suspects', teamSize: 5 });
      expect(team).toHaveLength(5);
    });

    it('should clamp teamSize to available characters', () => {
      const team = engine.castTeam({ universe: 'usual-suspects', teamSize: 100 });
      expect(team.length).toBeLessThanOrEqual(8); // usual-suspects has 8 characters
    });

    it('should ensure teamSize is at least requiredRoles.length', () => {
      const team = engine.castTeam({
        universe: 'usual-suspects',
        teamSize: 1,
        requiredRoles: ['lead', 'developer', 'tester'],
      });
      expect(team.length).toBeGreaterThanOrEqual(3);
    });

    it('should assign unique characters to each role', () => {
      const team = engine.castTeam({ universe: 'usual-suspects', teamSize: 6 });
      const names = team.map((m) => m.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('should fill required roles first', () => {
      const team = engine.castTeam({
        universe: 'usual-suspects',
        requiredRoles: ['security', 'prompt-engineer'],
      });
      const roles = team.map((m) => m.role);
      expect(roles).toContain('security');
      expect(roles).toContain('prompt-engineer');
    });

    it('should format displayName as "Name — Role"', () => {
      const team = engine.castTeam({ universe: 'usual-suspects' });
      const lead = team.find((m) => m.role === 'lead')!;
      expect(lead.displayName).toMatch(/^\w+ — Lead$/);
    });
  });

  // --- castTeam: oceans-eleven ---

  describe('castTeam — oceans-eleven', () => {
    it('should cast a team from oceans-eleven', () => {
      const team = engine.castTeam({ universe: 'oceans-eleven' });
      expect(team.length).toBeGreaterThanOrEqual(3);
    });

    it('should support larger teams from oceans-eleven', () => {
      const team = engine.castTeam({ universe: 'oceans-eleven', teamSize: 8 });
      expect(team).toHaveLength(8);
    });

    it('should assign lead to Danny', () => {
      const team = engine.castTeam({
        universe: 'oceans-eleven',
        requiredRoles: ['lead'],
      });
      const lead = team.find((m) => m.role === 'lead');
      expect(lead).toBeDefined();
      expect(lead!.name).toBe('Danny');
    });
  });

  // --- castTeam: custom ---

  describe('castTeam — custom', () => {
    it('should cast a custom team from customNames', () => {
      const team = engine.castTeam({
        universe: 'custom',
        customNames: {
          lead: 'Alice',
          developer: 'Bob',
          tester: 'Carol',
        } as Record<AgentRole, string>,
      });
      expect(team).toHaveLength(3);
      expect(team.find((m) => m.name === 'Alice')!.role).toBe('lead');
      expect(team.find((m) => m.name === 'Bob')!.role).toBe('developer');
    });

    it('should set personality to "Custom team member."', () => {
      const team = engine.castTeam({
        universe: 'custom',
        customNames: { lead: 'Zara' } as Record<AgentRole, string>,
      });
      expect(team[0].personality).toBe('Custom team member.');
    });

    it('should throw if customNames is missing for custom universe', () => {
      expect(() =>
        engine.castTeam({ universe: 'custom' }),
      ).toThrow('customNames is required');
    });

    it('should throw if customNames is empty for custom universe', () => {
      expect(() =>
        engine.castTeam({ universe: 'custom', customNames: {} as Record<AgentRole, string> }),
      ).toThrow('customNames is required');
    });
  });

  // --- Error handling ---

  describe('error handling', () => {
    it('should throw for unknown universe', () => {
      expect(() =>
        engine.castTeam({ universe: 'narnia' as UniverseId }),
      ).toThrow('Unknown universe');
    });

    it('should throw if more required roles than characters', () => {
      expect(() =>
        engine.castTeam({
          universe: 'usual-suspects',
          requiredRoles: [
            'lead', 'developer', 'tester', 'prompt-engineer',
            'security', 'devops', 'designer', 'scribe', 'reviewer',
          ],
        }),
      ).toThrow('Cannot fill required role');
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('should handle empty requiredRoles', () => {
      const team = engine.castTeam({
        universe: 'usual-suspects',
        requiredRoles: [],
        teamSize: 2,
      });
      expect(team).toHaveLength(2);
    });

    it('should handle teamSize of 0 with empty requiredRoles', () => {
      const team = engine.castTeam({
        universe: 'usual-suspects',
        requiredRoles: [],
        teamSize: 0,
      });
      expect(team).toHaveLength(0);
    });
  });
});

// --- Legacy CastingRegistry backward compat ---

describe('CastingRegistry (legacy)', () => {
  it('should be importable for backward compat', async () => {
    const { CastingRegistry } = await import('@bradygaster/squad-sdk/casting');
    const reg = new CastingRegistry({ castingDir: '.squad/casting' });
    expect(reg.getAllEntries()).toEqual([]);
    expect(reg.getByRole('lead')).toBeUndefined();
  });

  it.each([
    {
      name: 'missing pair',
      write: (_dir: string) => {},
      expected: /both files are required/,
    },
    {
      name: 'one-sided pair',
      write: (dir: string) => writeFileSync(join(dir, 'registry.json'), registryRaw()),
      expected: /both files are required/,
    },
    {
      name: 'mixed generation pair',
      write: (dir: string) => {
        writeFileSync(join(dir, 'registry.json'), registryRaw({ transaction_id: 'registry-generation' }));
        writeFileSync(join(dir, 'history.json'), historyRaw({
          transaction_id: 'history-generation',
          registry_revision: 1,
        }));
      },
      expected: /transaction metadata exists without a commit manifest/,
    },
    {
      name: 'malformed history',
      write: (dir: string) => {
        writeFileSync(join(dir, 'registry.json'), registryRaw());
        writeFileSync(join(dir, 'history.json'), JSON.stringify({
          assignment_cast_snapshots: [],
          universe_usage_history: [],
        }));
      },
      expected: /history shape is invalid/,
    },
  ])('fails closed on a $name', async ({ write, expected }) => {
    const dir = castingDir();
    write(dir);
    const { CastingRegistry } = await import('@bradygaster/squad-sdk/casting');
    await expect(new CastingRegistry({ castingDir: dir }).load()).rejects.toThrow(expected);
  });
});
