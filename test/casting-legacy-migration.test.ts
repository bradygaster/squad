import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  _setCastingDurabilityHooksForTesting,
  CastingCommitInDoubtError,
  ensureCastingRegistryPair,
  preflightCastingRegistryPair,
  readCastingRegistryPair,
  validateCastingRegistryPairRaw,
} from '../packages/squad-sdk/src/casting/durable-registry.js';

const roots: string[] = [];
const registryRaw = readFileSync(join(process.cwd(), 'test', 'fixtures', 'casting-legacy', 'registry.json'), 'utf8');
const historyRaw = readFileSync(join(process.cwd(), 'test', 'fixtures', 'casting-legacy', 'history.json'), 'utf8');

function fixture() {
  const registry: { agents: Record<string, Record<string, unknown>>; [key: string]: unknown } = JSON.parse(registryRaw);
  const history: {
    assignment_cast_snapshots: Record<string, Record<string, unknown>>;
    universe_usage_history: Record<string, unknown>[];
    [key: string]: unknown;
  } = JSON.parse(historyRaw);
  return { registry, history };
}

function castingDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'squad-legacy-migration-'));
  roots.push(root);
  const dir = join(root, 'casting');
  mkdirSync(dir);
  writeFileSync(join(dir, 'registry.json'), registryRaw);
  writeFileSync(join(dir, 'history.json'), historyRaw);
  return dir;
}

afterEach(() => {
  _setCastingDurabilityHooksForTesting(null);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('historical casting migration', () => {
  it('establishes a new baseline without rewriting identities, dates, or original metadata', () => {
    const dir = castingDir();
    expect(() => readCastingRegistryPair(dir, 1)).toThrow(/revision is invalid/);
    _setCastingDurabilityHooksForTesting({ now: () => Date.parse('2026-10-08T12:00:00.000Z') });
    expect(preflightCastingRegistryPair(dir)).toBe(true);
    const snapshot = readCastingRegistryPair(dir);
    expect(snapshot.registry).toMatchObject({
      revision: 1, generated_at: '2026-10-08T12:00:00.000Z',
      agents: {
        alpha: { ...fixture().registry.agents.alpha, display_name: 'Alpha', updated_at: '2026-03-10T14:34:25.614Z' },
        beta: { ...fixture().registry.agents.beta, display_name: 'Beta', updated_at: '2026-05-18T17:43:49.438+02:00' },
      },
    });
    expect(snapshot.history).toMatchObject({
      assignment_cast_snapshots: {
        'initial-assignment': { universe: 'Example', created_at: '2026-03-10T14:34:25.614Z', agents: ['alpha', 'beta'] },
      },
      universe_usage_history: [{ universe: 'Example', used_at: '2026-03-10T14:34:25.614Z' }],
    });
    const archives = readdirSync(dir).filter(name => name.startsWith('legacy-archive-'));
    expect(archives).toHaveLength(1);
    expect(readFileSync(join(dir, archives[0]!, 'registry.json'), 'utf8')).toBe(registryRaw);
    expect(readFileSync(join(dir, archives[0]!, 'history.json'), 'utf8')).toBe(historyRaw);
    expect(preflightCastingRegistryPair(dir)).toBe(false);
    expect(ensureCastingRegistryPair(dir, '{}', '{}').migrated).toBe(false);
    expect(readCastingRegistryPair(dir)).toEqual(snapshot);
    expect(readdirSync(dir).filter(name => name.startsWith('legacy-archive-'))).toEqual(archives);
  });

  it('also migrates through initialization using the shared protocol', () => {
    const dir = castingDir();
    expect(ensureCastingRegistryPair(dir, '{}', '{}').migrated).toBe(true);
    expect(readCastingRegistryPair(dir).transactionId).toBeDefined();
  });

  it.each(['map', 'array'])('supports the documented %s snapshot variant and used_at', variant => {
    const dir = castingDir();
    const pair = fixture();
    delete pair.registry.agents.alpha!.role;
    delete pair.registry.agents.beta!.role;
    pair.registry.agents.beta!.updated_at = '2026-06-01T12:00:00Z';
    const snapshot = pair.history.assignment_cast_snapshots['initial-assignment']!;
    delete snapshot.members;
    snapshot.agents = variant === 'map' ? { alpha: 'Alpha', beta: 'Beta' } : ['alpha', 'beta'];
    const usage = pair.history.universe_usage_history[0]!;
    usage.used_at = usage.created_at;
    delete usage.created_at;
    writeFileSync(join(dir, 'registry.json'), JSON.stringify(pair.registry));
    writeFileSync(join(dir, 'history.json'), JSON.stringify(pair.history));
    expect(preflightCastingRegistryPair(dir)).toBe(true);
    expect(readCastingRegistryPair(dir).registry).toMatchObject({
      agents: { alpha: { role: 'alpha' }, beta: { role: 'beta', updated_at: '2026-06-01T12:00:00Z' } },
    });
  });

  it('validates dry runs without locks, archives, creation, or recovery', () => {
    const dir = castingDir();
    expect(preflightCastingRegistryPair(dir, true)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
    expect(readFileSync(join(dir, 'registry.json'), 'utf8')).toBe(registryRaw);
    expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(historyRaw);
    expect(preflightCastingRegistryPair(join(dir, 'missing'), true)).toBe(false);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
  });

  it.each([
    ['unknown schema', (pair: ReturnType<typeof fixture>) => { pair.registry.schema = 'future/v2'; }],
    ['partial revision', (pair: ReturnType<typeof fixture>) => { pair.registry.revision = 1; }],
    ['history generation', (pair: ReturnType<typeof fixture>) => { pair.history.registry_revision = 1; }],
    ['snapshot generation', (pair: ReturnType<typeof fixture>) => { pair.history.assignment_cast_snapshots['initial-assignment']!.revision = 2; }],
    ['invalid usage date', (pair: ReturnType<typeof fixture>) => { pair.history.universe_usage_history[0]!.used_at = null; }],
    ['missing creation date', (pair: ReturnType<typeof fixture>) => { delete pair.registry.agents.beta!.created_at; }],
    ['invalid update date', (pair: ReturnType<typeof fixture>) => { pair.registry.agents.beta!.updated_at = null; }],
    ['duplicate name', (pair: ReturnType<typeof fixture>) => { pair.registry.agents.beta!.persistent_name = 'Alpha'; }],
    ['unknown agent', (pair: ReturnType<typeof fixture>) => {
      pair.history.assignment_cast_snapshots['initial-assignment']!.agents = ['missing'];
      delete pair.history.assignment_cast_snapshots['initial-assignment']!.members;
    }],
    ['name mismatch', (pair: ReturnType<typeof fixture>) => {
      pair.history.assignment_cast_snapshots['initial-assignment']!.members = [
        { folder: 'alpha', persistent_name: 'Wrong', role: 'Lead' },
      ];
    }],
    ['assignment mismatch', (pair: ReturnType<typeof fixture>) => { pair.history.universe_usage_history[0]!.assignment_id = 'other'; }],
    ['repository mismatch', (pair: ReturnType<typeof fixture>) => { pair.history.universe_usage_history[0]!.repository = 'other'; }],
    ['timestamp mismatch', (pair: ReturnType<typeof fixture>) => { pair.history.universe_usage_history[0]!.created_at = '2026-03-11T00:00:00Z'; }],
    ['missing usage', (pair: ReturnType<typeof fixture>) => { pair.history.universe_usage_history = []; }],
  ] as const)('refuses %s without changing the pair or archiving', (_name, mutate) => {
    const dir = castingDir();
    const pair = fixture();
    mutate(pair);
    const beforeRegistry = JSON.stringify(pair.registry);
    const beforeHistory = JSON.stringify(pair.history);
    writeFileSync(join(dir, 'registry.json'), beforeRegistry);
    writeFileSync(join(dir, 'history.json'), beforeHistory);
    expect(() => preflightCastingRegistryPair(dir, true)).toThrow();
    expect(() => preflightCastingRegistryPair(dir)).toThrow();
    expect(readFileSync(join(dir, 'registry.json'), 'utf8')).toBe(beforeRegistry);
    expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(beforeHistory);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
  });

  it.each(['archive:write', 'archive:file-fsync', 'archive:parent-fsync', 'payload:registry-write'] as const)('preserves originals when %s fails', failure => {
    const dir = castingDir();
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => { if (boundary === failure) throw new Error('injected failure'); },
    });
    expect(() => preflightCastingRegistryPair(dir)).toThrow('injected failure');
    expect(readFileSync(join(dir, 'registry.json'), 'utf8')).toBe(registryRaw);
    expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(historyRaw);
    _setCastingDurabilityHooksForTesting(null);
    expect(preflightCastingRegistryPair(dir)).toBe(true);
  });

  it('never overwrites a differing archive on retry', () => {
    const dir = castingDir();
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => { if (boundary === 'payload:registry-write') throw new Error('stop before journal'); },
    });
    expect(() => preflightCastingRegistryPair(dir)).toThrow('stop before journal');
    _setCastingDurabilityHooksForTesting(null);
    const archive = readdirSync(dir).find(name => name.startsWith('legacy-archive-'))!;
    writeFileSync(join(dir, archive, 'registry.json'), 'keep this archive');
    expect(() => preflightCastingRegistryPair(dir)).toThrow(/archive differs/);
    expect(readFileSync(join(dir, archive, 'registry.json'), 'utf8')).toBe('keep this archive');
    expect(readFileSync(join(dir, 'registry.json'), 'utf8')).toBe(registryRaw);
  });

  it('rolls forward an interrupted migration before retry and refuses recovery during dry run', () => {
    const dir = castingDir();
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => { if (boundary === 'history:rename') throw new Error('interrupted publication'); },
    });
    expect(() => preflightCastingRegistryPair(dir)).toThrow(CastingCommitInDoubtError);
    const before = readdirSync(dir);
    expect(() => preflightCastingRegistryPair(dir, true)).toThrow(/awaiting roll-forward/);
    expect(readdirSync(dir)).toEqual(before);
    _setCastingDurabilityHooksForTesting(null);
    expect(preflightCastingRegistryPair(dir)).toBe(false);
    expect(readCastingRegistryPair(dir).transactionId).toBeDefined();
    expect(readdirSync(dir).filter(name => name.startsWith('legacy-archive-'))).toHaveLength(1);
  });

  it('does not relax strict managed pair validation', () => {
    const dir = castingDir();
    preflightCastingRegistryPair(dir);
    const snapshot = readCastingRegistryPair(dir);
    const modified = JSON.parse(snapshot.historyRaw!);
    modified.assignment_cast_snapshots['initial-assignment'].repository = 'unexpected';
    const raw = JSON.stringify(modified);
    writeFileSync(join(dir, 'history.json'), raw);
    expect(() => preflightCastingRegistryPair(dir)).toThrow();
    expect(() => validateCastingRegistryPairRaw(snapshot.registryRaw, raw, undefined,
      readFileSync(join(dir, 'registry-history.commit.json'), 'utf8'))).toThrow();
    expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(raw);
  });

  it('refuses damaged UTF-8 rather than archiving replacement characters', () => {
    const dir = castingDir();
    const prefix = Buffer.from(registryRaw.slice(0, registryRaw.indexOf('Alpha')));
    const suffix = Buffer.from(registryRaw.slice(registryRaw.indexOf('Alpha') + 5));
    const raw = Buffer.concat([prefix, Buffer.from([0xff]), suffix]);
    writeFileSync(join(dir, 'registry.json'), raw);
    expect(() => preflightCastingRegistryPair(dir)).toThrow(/valid UTF-8/);
    expect(readFileSync(join(dir, 'registry.json'))).toEqual(raw);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
  });

  it('holds the shared writer lock during archival and publication', () => {
    const dir = castingDir();
    let observed = false;
    let clock = Date.now();
    _setCastingDurabilityHooksForTesting({
      now: () => clock,
      wait: milliseconds => { clock += milliseconds; },
      lockTimeoutMs: 50,
      boundary: ({ boundary }) => {
        if (boundary !== 'archive:write' || observed) return;
        observed = true;
        expect(() => preflightCastingRegistryPair(dir)).toThrow(/Timed out waiting/);
      },
    });
    expect(preflightCastingRegistryPair(dir)).toBe(true);
    expect(observed).toBe(true);
    expect(readCastingRegistryPair(dir).transactionId).toBeDefined();
  });
});
