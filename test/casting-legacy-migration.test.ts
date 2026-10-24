import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
  const root = mkdtempSync(join(tmpdir(), '.test-legacy-migration-'));
  roots.push(root);
  const dir = join(root, 'casting');
  mkdirSync(dir);
  writeFileSync(join(dir, 'registry.json'), registryRaw);
  writeFileSync(join(dir, 'history.json'), historyRaw);
  return dir;
}

function entriesFixture(dir: string, crlf = false) {
  const fixtureDir = join(process.cwd(), 'test', 'fixtures', 'casting-entries');
  const registry = JSON.parse(readFileSync(join(fixtureDir, 'registry.json'), 'utf8'));
  const history = JSON.parse(readFileSync(join(fixtureDir, 'history.json'), 'utf8'));
  const identities: Record<string, string> = JSON.parse(readFileSync(join(fixtureDir, 'identities.json'), 'utf8'));
  for (const file of ['registry.json', 'history.json']) {
    writeFileSync(join(dir, file), readFileSync(join(fixtureDir, file)));
  }
  for (const [id, charter] of Object.entries(identities)) {
    const folder = join(dir, '..', 'agents', id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'charter.md'), crlf ? charter.replace(/\n/g, '\r\n') : charter);
  }
  return { registry, history, identities };
}

afterEach(() => {
  _setCastingDurabilityHooksForTesting(null);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('historical casting migration', () => {
  it.each([false, true])('maps anonymized native entries using authoritative charters (CRLF=%s), not name slugs or today’s roster', crlf => {
    const dir = castingDir();
    const source = entriesFixture(dir, crlf);
    writeFileSync(join(dir, '..', 'team.md'), 'A misleading current roster with no historical membership.\n');
    const originals = ['registry.json', 'history.json'].map(file => readFileSync(join(dir, file)));
    expect(preflightCastingRegistryPair(dir, true)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
    expect(readFileSync(join(dir, 'registry.json'))).toEqual(originals[0]);
    expect(readFileSync(join(dir, 'history.json'))).toEqual(originals[1]);
    expect(preflightCastingRegistryPair(dir)).toBe(true);
    const pair = readCastingRegistryPair(dir);
    const agents = pair.registry!.agents as Record<string, Record<string, unknown>>;
    expect(Object.keys(agents)).toEqual(Object.keys(source.identities));
    for (const [index, id] of Object.keys(source.identities).entries()) {
      expect(agents[id]).toMatchObject({
        ...source.registry.entries[index],
        role: index < 12 ? `Example Role ${String(index + 1).padStart(2, '0')}` : id,
        updated_at: source.registry.entries[index].created_at,
      });
    }
    expect(pair.history).toMatchObject({
      assignment_cast_snapshots: {
        'example-onboarding-001': {
          agents: Object.keys(source.identities).slice(0, 12),
          universe: 'descriptive', created_at: '2024-02-03',
        },
      },
      universe_usage_history: [{ universe: 'descriptive', used_at: '2024-02-03' }],
    });
    const archive = readdirSync(dir).find(name => name.startsWith('legacy-archive-'))!;
    for (const [index, file] of ['registry.json', 'history.json'].entries()) {
      expect(readFileSync(join(dir, archive, file))).toEqual(originals[index]);
    }
    expect(preflightCastingRegistryPair(dir)).toBe(false);
    expect(readCastingRegistryPair(dir)).toEqual(pair);
    for (const [id, charter] of Object.entries(source.identities)) {
      expect(readFileSync(join(dir, '..', 'agents', id, 'charter.md'), 'utf8'))
        .toBe(crlf ? charter.replace(/\n/g, '\r\n') : charter);
    }
  });

  it.each([
    'missing-charter', 'duplicate-folder', 'multiple-names', 'multiple-sections', 'multiple-roles',
    'conflicting-role', 'conflicting-folder', 'invalid-folder', 'unknown-member',
    'duplicate-member', 'duplicate-entry', 'duplicate-assignment', 'entry-generation', 'assignment-generation',
  ])('refuses %s entries evidence without changing either original or creating archives', kind => {
    const dir = castingDir();
    const pair = entriesFixture(dir);
    const agentsDir = join(dir, '..', 'agents');
    const charter = join(agentsDir, 'agent-key-01', 'charter.md');
    if (kind === 'missing-charter') rmSync(charter);
    if (kind === 'duplicate-folder' || kind === 'invalid-folder') {
      const folder = join(agentsDir, kind === 'invalid-folder' ? 'Invalid_Folder' : 'different-folder');
      mkdirSync(folder);
      writeFileSync(join(folder, 'charter.md'), pair.identities['agent-key-01']!);
      if (kind === 'invalid-folder') rmSync(charter);
    }
    if (kind === 'multiple-names') writeFileSync(charter, pair.identities['agent-key-01']!.replace(
      '## Identity\n', '## Identity\n- **Name:** Example Member 01\n',
    ));
    if (kind === 'multiple-sections') writeFileSync(charter, pair.identities['agent-key-01']! + '\n## Identity\n- **Name:** Example Member 01\n');
    if (kind === 'multiple-roles') writeFileSync(charter, pair.identities['agent-key-01']!.replace(
      '## Identity\n', '## Identity\n- **Role:** Another role\n',
    ));
    if (kind === 'conflicting-role') pair.registry.entries[0].role = 'Conflicting role';
    if (kind === 'conflicting-folder') pair.registry.entries[0].folder = 'different-folder';
    if (kind === 'unknown-member') pair.history.assignments[0].agents.push('No recorded identity');
    if (kind === 'duplicate-member') pair.history.assignments[0].agents.push(pair.history.assignments[0].agents[0]);
    if (kind === 'duplicate-entry') pair.registry.entries.push(pair.registry.entries[0]);
    if (kind === 'duplicate-assignment') pair.history.assignments.push(pair.history.assignments[0]);
    if (kind === 'entry-generation') pair.registry.entries[0].revision = 9;
    if (kind === 'assignment-generation') pair.history.assignments[0].revision = 9;
    const originals = [JSON.stringify(pair.registry), JSON.stringify(pair.history)];
    writeFileSync(join(dir, 'registry.json'), originals[0]!);
    writeFileSync(join(dir, 'history.json'), originals[1]!);
    expect(() => preflightCastingRegistryPair(dir, true)).toThrow(/Cannot migrate legacy casting/);
    expect(() => preflightCastingRegistryPair(dir)).toThrow(/Cannot migrate legacy casting/);
    expect(readFileSync(join(dir, 'registry.json'), 'utf8')).toBe(originals[0]);
    expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(originals[1]);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
  });

  it.each([['created_at', 'used_at'], ['created_at', 'assigned_at'], ['used_at', 'assigned_at']])(
    'rejects conflicting entries assignment timestamps %s/%s without writes', (first, second) => {
      const dir = castingDir();
      const pair = entriesFixture(dir);
      const assignment = pair.history.assignments[0];
      delete assignment.created_at;
      assignment[first!] = '2024-02-03';
      assignment[second!] = '2024-02-04';
      const raw = JSON.stringify(pair.history);
      writeFileSync(join(dir, 'history.json'), raw);
      expect(() => preflightCastingRegistryPair(dir, true)).toThrow(/timestamps disagree/);
      expect(() => preflightCastingRegistryPair(dir)).toThrow(/timestamps disagree/);
      expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(raw);
      expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
    },
  );

  it('preserves explicit historical subsets and simultaneous distinct entries assignments', () => {
    const dir = castingDir();
    const pair = entriesFixture(dir);
    pair.history.assignments.push({
      ...pair.history.assignments[0], assignment_id: 'another-assignment', agents: ['Example Member 14'],
    });
    writeFileSync(join(dir, 'history.json'), JSON.stringify(pair.history));
    preflightCastingRegistryPair(dir);
    expect(readCastingRegistryPair(dir).history).toMatchObject({
      assignment_cast_snapshots: {
        'example-onboarding-001': { agents: Object.keys(pair.identities).slice(0, 12) },
        'another-assignment': { agents: ['agent-key-14'] },
      },
      universe_usage_history: [
        { universe: 'descriptive', used_at: '2024-02-03' },
        { universe: 'descriptive', used_at: '2024-02-03' },
      ],
    });
  });

  it('refuses the anonymized native thirteen-agent pair with its missing universes, null snapshot and empty usage intact', () => {
    const dir = castingDir();
    const fixtureDir = join(process.cwd(), 'test', 'fixtures', 'casting-incomplete-universe');
    const originals = ['registry.json', 'history.json'].map(file => readFileSync(join(fixtureDir, file)));
    const registry = JSON.parse(originals[0]!.toString());
    const history = JSON.parse(originals[1]!.toString());
    expect(Object.keys(registry.agents)).toHaveLength(13);
    expect(Object.values(registry.agents).every(agent => !Object.hasOwn(agent as object, 'universe'))).toBe(true);
    expect(history.assignment_cast_snapshots['example-writing-2024-02-03'].universe).toBeNull();
    expect(history.universe_usage_history).toEqual([]);
    for (const [index, file] of ['registry.json', 'history.json'].entries()) writeFileSync(join(dir, file), originals[index]!);
    for (const dryRun of [true, false, false]) {
      expect(() => preflightCastingRegistryPair(dir, dryRun)).toThrow(/authoritative universe evidence.*Incomplete legacy provenance/);
      for (const [index, file] of ['registry.json', 'history.json'].entries()) {
        expect(readFileSync(join(dir, file))).toEqual(originals[index]);
      }
      expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
    }
  });

  it('migrates the anonymized pinned assigned_at producer pair without altering dates or membership', () => {
    const dir = castingDir();
    const originalRegistry = readFileSync(join(process.cwd(), 'test', 'fixtures', 'casting-assigned-at', 'registry.json'));
    const originalHistory = readFileSync(join(process.cwd(), 'test', 'fixtures', 'casting-assigned-at', 'history.json'));
    writeFileSync(join(dir, 'registry.json'), originalRegistry);
    writeFileSync(join(dir, 'history.json'), originalHistory);
    expect(preflightCastingRegistryPair(dir, true)).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
    expect(readFileSync(join(dir, 'registry.json'))).toEqual(originalRegistry);
    expect(readFileSync(join(dir, 'history.json'))).toEqual(originalHistory);
    expect(preflightCastingRegistryPair(dir)).toBe(true);
    const pair = readCastingRegistryPair(dir);
    const source = JSON.parse(originalHistory.toString());
    const key = 'descriptive-2026-08-08T01:16:24.000Z';
    expect(pair.history).toMatchObject({
      assignment_cast_snapshots: {
        [key]: {
          agents: source.assignment_cast_snapshots[key].agents,
          universe: 'none (descriptive naming)',
          created_at: source.assignment_cast_snapshots[key].assigned_at,
        },
      },
      universe_usage_history: [{ universe: 'none (descriptive naming)', used_at: '2026-08-08T01:16:24.000Z' }],
    });
    const archive = readdirSync(dir).find(name => name.startsWith('legacy-archive-'))!;
    expect(readFileSync(join(dir, archive, 'registry.json'))).toEqual(originalRegistry);
    expect(readFileSync(join(dir, archive, 'history.json'))).toEqual(originalHistory);
    expect(preflightCastingRegistryPair(dir)).toBe(false);
    expect(readCastingRegistryPair(dir)).toEqual(pair);
  });

  it.each(['snapshot', 'usage'] as const)('accepts agreeing timestamp aliases on %s and retains the original offset', kind => {
    const dir = castingDir();
    const pair = fixture();
    const record = kind === 'snapshot'
      ? pair.history.assignment_cast_snapshots['initial-assignment']!
      : pair.history.universe_usage_history[0]!;
    record.created_at = kind === 'snapshot' ? '2026-03-10T16:34:25.614+02:00' : '2026-03-10T14:34:25.614Z';
    record.used_at = kind === 'usage' ? '2026-03-10T16:34:25.614+02:00' : '2026-03-10T14:34:25.614Z';
    record.assigned_at = '2026-03-10T14:34:25.614Z';
    writeFileSync(join(dir, 'history.json'), JSON.stringify(pair.history));
    preflightCastingRegistryPair(dir);
    const result = readCastingRegistryPair(dir).history!;
    expect(kind === 'snapshot'
      ? (result.assignment_cast_snapshots as Record<string, Record<string, unknown>>)['initial-assignment']!.created_at
      : (result.universe_usage_history as Record<string, unknown>[])[0]!.used_at)
      .toBe('2026-03-10T16:34:25.614+02:00');
  });

  it.each(['snapshot', 'usage'] as const)('rejects every conflicting recognized timestamp pair on %s without writes', kind => {
    for (const fields of [['created_at', 'used_at'], ['created_at', 'assigned_at'], ['used_at', 'assigned_at']]) {
      const dir = castingDir();
      const pair = fixture();
      const record = kind === 'snapshot'
        ? pair.history.assignment_cast_snapshots['initial-assignment']!
        : pair.history.universe_usage_history[0]!;
      delete record.created_at;
      record[fields[0]!] = '2026-03-10T14:34:25.614Z';
      record[fields[1]!] = '2026-03-11T14:34:25.614Z';
      const raw = JSON.stringify(pair.history);
      writeFileSync(join(dir, 'history.json'), raw);
      expect(() => preflightCastingRegistryPair(dir, true)).toThrow(/timestamps disagree/);
      expect(() => preflightCastingRegistryPair(dir)).toThrow(/timestamps disagree/);
      expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(raw);
      expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
    }
  });

  it.each(['agents', 'snapshot', 'usage'] as const)('refuses missing universe evidence at %s without manufacturing provenance', kind => {
    const dir = castingDir();
    const pair = fixture();
    if (kind === 'agents') {
      for (const agent of Object.values(pair.registry.agents)) delete agent.universe;
      pair.history.assignment_cast_snapshots['initial-assignment']!.universe = null;
      pair.history.universe_usage_history = [];
    } else if (kind === 'snapshot') {
      pair.history.assignment_cast_snapshots['initial-assignment']!.universe = null;
    } else {
      delete pair.history.universe_usage_history[0]!.universe;
    }
    const rawRegistry = JSON.stringify(pair.registry);
    const rawHistory = JSON.stringify(pair.history);
    writeFileSync(join(dir, 'registry.json'), rawRegistry);
    writeFileSync(join(dir, 'history.json'), rawHistory);
    expect(() => preflightCastingRegistryPair(dir, true)).toThrow(/authoritative universe evidence.*No universe or historical usage will be invented/);
    expect(() => preflightCastingRegistryPair(dir)).toThrow(/Incomplete legacy provenance/);
    expect(readFileSync(join(dir, 'registry.json'), 'utf8')).toBe(rawRegistry);
    expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(rawHistory);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
  });

  it('recognizes entries/assignments but refuses to derive historical identities from names', () => {
    const dir = castingDir();
    const pair = fixture();
    const rawRegistry = JSON.stringify({ entries: Object.values(pair.registry.agents) });
    const rawHistory = JSON.stringify({ assignments: [] });
    writeFileSync(join(dir, 'registry.json'), rawRegistry);
    writeFileSync(join(dir, 'history.json'), rawHistory);
    expect(() => preflightCastingRegistryPair(dir, true)).toThrow(/authoritative historical identity mapping/);
    expect(() => preflightCastingRegistryPair(dir)).toThrow(/current team roster cannot establish historical membership/);
    expect(readFileSync(join(dir, 'registry.json'), 'utf8')).toBe(rawRegistry);
    expect(readFileSync(join(dir, 'history.json'), 'utf8')).toBe(rawHistory);
    expect(readdirSync(dir).sort()).toEqual(['history.json', 'registry.json']);
  });

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
