/**
 * Tests for CastingHistory (M3-10, Issue #151)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CastingHistory,
  type CastingRecord,
  type SerializedCastingHistory,
} from '@bradygaster/squad-sdk/casting';
import {
  CastingEngine,
  type CastMember,
  type CastingConfig,
} from '@bradygaster/squad-sdk/casting';

// --- helpers ---

function makeMember(name: string, role: 'lead' | 'developer' | 'tester' = 'developer'): CastMember {
  return {
    name,
    role,
    personality: `${name}'s personality`,
    backstory: `${name}'s backstory`,
    displayName: `${name} — ${role.charAt(0).toUpperCase() + role.slice(1)}`,
  };
}

const defaultConfig: CastingConfig = { universe: 'usual-suspects', teamSize: 3 };

describe('CastingHistory', () => {
  let history: CastingHistory;

  beforeEach(() => {
    history = new CastingHistory();
  });

  // --- recordCast ---

  describe('recordCast', () => {
    it('should record a cast and return a CastingRecord', () => {
      const team = [makeMember('Agent1', 'lead'), makeMember('Agent2')];
      const record = history.recordCast(team, defaultConfig);
      expect(record.universe).toBe('usual-suspects');
      expect(record.teamSize).toBe(2);
      expect(record.members).toHaveLength(2);
    });

    it('should store the config snapshot', () => {
      const cfg: CastingConfig = { universe: 'oceans-eleven', teamSize: 5 };
      const team = [makeMember('Danny', 'lead')];
      const record = history.recordCast(team, cfg);
      expect(record.configSnapshot.universe).toBe('oceans-eleven');
      expect(record.configSnapshot.teamSize).toBe(5);
    });

    it('should use provided timestamp', () => {
      const ts = new Date('2025-01-15T12:00:00Z');
      const record = history.recordCast([makeMember('A')], defaultConfig, ts);
      expect(record.timestamp).toBe('2025-01-15T12:00:00.000Z');
    });

    it('should default timestamp to now when omitted', () => {
      const before = new Date();
      const record = history.recordCast([makeMember('A')], defaultConfig);
      const after = new Date();
      const ts = new Date(record.timestamp);
      expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should record member name and role only', () => {
      const team = [makeMember('Agent1', 'tester')];
      const record = history.recordCast(team, defaultConfig);
      expect(record.members[0]).toEqual({ name: 'Agent1', role: 'tester' });
    });

    it('should increment history size after each record', () => {
      expect(history.size).toBe(0);
      history.recordCast([makeMember('A')], defaultConfig);
      expect(history.size).toBe(1);
      history.recordCast([makeMember('B')], defaultConfig);
      expect(history.size).toBe(2);
    });

    it('should handle empty team', () => {
      const record = history.recordCast([], defaultConfig);
      expect(record.teamSize).toBe(0);
      expect(record.members).toHaveLength(0);
    });
  });

  // --- getCastHistory ---

  describe('getCastHistory', () => {
    it('should return empty array initially', () => {
      expect(history.getCastHistory()).toEqual([]);
    });

    it('should return all records in insertion order', () => {
      history.recordCast([makeMember('A')], defaultConfig, new Date('2025-01-01'));
      history.recordCast([makeMember('B')], defaultConfig, new Date('2025-01-02'));
      const all = history.getCastHistory();
      expect(all).toHaveLength(2);
      expect(all[0].members[0].name).toBe('A');
      expect(all[1].members[0].name).toBe('B');
    });

    it('should return a copy, not the internal array', () => {
      history.recordCast([makeMember('X')], defaultConfig);
      const a = history.getCastHistory();
      const b = history.getCastHistory();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  // --- getAgentHistory ---

  describe('getAgentHistory', () => {
    it('should return only records containing the given agent', () => {
      history.recordCast([makeMember('Keyser', 'lead'), makeMember('Verbal')], defaultConfig);
      history.recordCast([makeMember('Danny', 'lead')], { universe: 'oceans-eleven' });
      history.recordCast([makeMember('Verbal', 'tester')], defaultConfig);

      const verbalHistory = history.getAgentHistory('Verbal');
      expect(verbalHistory).toHaveLength(2);
      verbalHistory.forEach((r) =>
        expect(r.members.some((m) => m.name === 'Verbal')).toBe(true),
      );
    });

    it('should return empty array for unknown agent', () => {
      history.recordCast([makeMember('A')], defaultConfig);
      expect(history.getAgentHistory('Unknown')).toEqual([]);
    });

    it('should be case-sensitive', () => {
      history.recordCast([makeMember('Verbal')], defaultConfig);
      expect(history.getAgentHistory('verbal')).toEqual([]);
      expect(history.getAgentHistory('Verbal')).toHaveLength(1);
    });
  });

  // --- clear ---

  describe('clear', () => {
    it('should empty all history', () => {
      history.recordCast([makeMember('A')], defaultConfig);
      history.recordCast([makeMember('B')], defaultConfig);
      history.clear();
      expect(history.size).toBe(0);
      expect(history.getCastHistory()).toEqual([]);
    });
  });

  // --- serializeHistory / deserializeHistory ---

  describe('serialization', () => {
    it('should round-trip through serialize/deserialize', () => {
      const ts = new Date('2025-06-01T10:00:00Z');
      history.recordCast(
        [makeMember('Keyser', 'lead'), makeMember('Fenster', 'tester')],
        { universe: 'usual-suspects', teamSize: 2 },
        ts,
      );
      const serialized = history.serializeHistory();
      const restored = new CastingHistory();
      restored.deserializeHistory(serialized);
      expect(restored.getCastHistory()).toEqual(history.getCastHistory());
    });

    it('should produce version 1 format', () => {
      const serialized = history.serializeHistory();
      expect(serialized.version).toBe(1);
      expect(Array.isArray(serialized.records)).toBe(true);
    });

    it('should serialize empty history', () => {
      const serialized = history.serializeHistory();
      expect(serialized.records).toEqual([]);
    });

    it('should replace existing records on deserialize', () => {
      history.recordCast([makeMember('Old')], defaultConfig);
      const other = new CastingHistory();
      other.recordCast([makeMember('New')], defaultConfig);
      history.deserializeHistory(other.serializeHistory());
      expect(history.size).toBe(1);
      expect(history.getCastHistory()[0].members[0].name).toBe('New');
    });

    it('should throw on invalid data (missing version)', () => {
      expect(() =>
        history.deserializeHistory({ version: 2, records: [] } as any),
      ).toThrow('Invalid casting history data');
    });

    it('should throw on invalid data (missing records)', () => {
      expect(() =>
        history.deserializeHistory({ version: 1 } as any),
      ).toThrow('Invalid casting history data');
    });

    it('should throw on null input', () => {
      expect(() =>
        history.deserializeHistory(null as any),
      ).toThrow('Invalid casting history data');
    });
  });

  // --- Integration with CastingEngine ---

  describe('integration with CastingEngine', () => {
    it('should record a team produced by CastingEngine', () => {
      const engine = new CastingEngine();
      const config: CastingConfig = { universe: 'usual-suspects', teamSize: 4 };
      const team = engine.castTeam(config);
      const record = history.recordCast(team, config);
      expect(record.teamSize).toBe(4);
      expect(record.members).toHaveLength(4);
      // All names should be from usual-suspects universe
      for (const m of record.members) {
        expect(m.name).toBeTruthy();
        expect(m.role).toBeTruthy();
      }
    });

    it('should track multiple casts from different universes', () => {
      const engine = new CastingEngine();
      const cfg1: CastingConfig = { universe: 'usual-suspects', teamSize: 3 };
      const cfg2: CastingConfig = { universe: 'oceans-eleven', teamSize: 5 };

      history.recordCast(engine.castTeam(cfg1), cfg1);
      history.recordCast(engine.castTeam(cfg2), cfg2);

      const all = history.getCastHistory();
      expect(all).toHaveLength(2);
      expect(all[0].universe).toBe('usual-suspects');
      expect(all[1].universe).toBe('oceans-eleven');
    });

    it('should serialize and restore engine-produced history', () => {
      const engine = new CastingEngine();
      const config: CastingConfig = { universe: 'oceans-eleven', teamSize: 6 };
      history.recordCast(engine.castTeam(config), config);

      const serialized = history.serializeHistory();
      const restored = new CastingHistory();
      restored.deserializeHistory(serialized);
      expect(restored.size).toBe(1);
      expect(restored.getCastHistory()[0].teamSize).toBe(6);
    });
  });
});
