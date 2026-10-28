import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadWatchConfig, runWatch } from '../packages/squad-cli/src/cli/commands/watch/index.js';
import { parseWatchDuration, watchBoundReason } from '../packages/squad-cli/src/cli/commands/watch/bounds.js';
import type { WatchConfig } from '../packages/squad-cli/src/cli/commands/watch/config.js';

const roots: string[] = [];

function writeWatchConfig(watch: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'squad-watch-bounds-'));
  roots.push(root);
  mkdirSync(path.join(root, '.squad'));
  writeFileSync(path.join(root, '.squad', 'config.json'), JSON.stringify({ watch }));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('watch run bounds (#1714)', () => {
  it('parses explicit positive durations without rounding or overflow', () => {
    expect(parseWatchDuration('1ms')).toBe(1);
    expect(parseWatchDuration('30s')).toBe(30_000);
    expect(parseWatchDuration('5m')).toBe(300_000);
    expect(parseWatchDuration('8h')).toBe(28_800_000);
    expect(parseWatchDuration('2d')).toBe(172_800_000);
    for (const invalid of ['0h', '-1h', '1.5h', '8', '8hours', '8h ', '9007199254740992ms']) {
      expect(parseWatchDuration(invalid)).toBeUndefined();
    }
  });

  it('stops on a completed round count or elapsed deadline, not before', () => {
    expect(watchBoundReason(0, 999, 1, 1_000, '1s')).toBeUndefined();
    expect(watchBoundReason(1, 999, 1, 1_000, '1s')).toBe('max rounds reached (1/1)');
    expect(watchBoundReason(0, 1_000, undefined, 1_000, '1s')).toBe('max duration reached (1s)');
    expect(watchBoundReason(0, 1_001, undefined, 1_000, '1s')).toBe('max duration reached (1s)');
    expect(watchBoundReason(1, 1_000, 1, 1_000, '1s')).toBe('max rounds reached (1/1)');
    expect(watchBoundReason(100, 100_000)).toBeUndefined();
  });

  it('loads both limits from config and lets CLI overrides win', () => {
    const root = writeWatchConfig({ maxRounds: 20, maxDuration: '8h' });
    expect(loadWatchConfig(root, {})).toMatchObject({ maxRounds: 20, maxDuration: '8h', capabilities: {} });
    expect(loadWatchConfig(root, { maxRounds: 3, maxDuration: '30m' })).toMatchObject({
      maxRounds: 3,
      maxDuration: '30m',
    });
  });

  it('rejects mistyped bound settings instead of silently running forever', () => {
    expect(() => loadWatchConfig(writeWatchConfig({ maxRounds: '20' }), {})).toThrow('watch.maxRounds');
    expect(() => loadWatchConfig(writeWatchConfig({ maxDuration: 8 }), {})).toThrow('watch.maxDuration');
  });

  it('rejects invalid limits before touching the project or platform', async () => {
    const base: WatchConfig = { interval: 10, execute: false, maxConcurrent: 1, timeout: 30, capabilities: {} };
    for (const maxRounds of [0, -1, 1.5, NaN, Infinity]) {
      await expect(runWatch('missing-project', { ...base, maxRounds })).rejects.toThrow('--max-rounds');
    }
    for (const maxDuration of ['', '0h', '1.5h', '1h ']) {
      await expect(runWatch('missing-project', { ...base, maxDuration })).rejects.toThrow('--max-duration');
    }
  });
});
