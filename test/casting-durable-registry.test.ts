import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  _setCastingDurabilityHooksForTesting,
  acquireCastingRegistryLock,
  CastingCommitInDoubtError,
  commitCastingRegistryPair,
  ensureCastingRegistryPair,
  readCastingRegistryPair,
  recoverCastingRegistryTransaction,
  type CastingDurabilityBoundary,
} from '../packages/squad-sdk/src/casting/durable-registry.js';

const roots: string[] = [];

function temporaryCastingDir(name: string): string {
  const root = join(tmpdir(), `squad-durable-${name}-${process.pid}-${Date.now()}-${roots.length}`);
  const castingDir = join(root, '.squad', 'casting');
  mkdirSync(castingDir, { recursive: true });
  roots.push(root);
  return castingDir;
}

function missingCastingDir(name: string): string {
  const root = join(tmpdir(), `squad-durable-${name}-${process.pid}-${Date.now()}-${roots.length}`);
  roots.push(root);
  return join(root, '.squad', 'casting');
}

function writeOwner(
  lockPath: string,
  overrides: Partial<{
    version: number;
    token: string;
    pid: number;
    hostname: string;
    created_at: string;
  }> = {},
): void {
  mkdirSync(lockPath);
  writeFileSync(join(lockPath, 'owner.json'), JSON.stringify({
    version: 1,
    token: 'owner-token',
    pid: 4242,
    hostname: hostname(),
    created_at: '2026-09-20T00:00:00.000Z',
    ...overrides,
  }) + '\n');
}

function initialPair(): {
  registry: Record<string, unknown>;
  history: Record<string, unknown>;
  registryRaw: string;
  historyRaw: string;
} {
  const registry = {
    schema: 'squad-agent-provenance/v1',
    schema_version: 1,
    revision: 1,
    generated_at: '2026-09-20T00:00:00.000Z',
    agents: {},
  };
  const history = {
    assignment_cast_snapshots: {},
    universe_usage_history: [],
  };
  return {
    registry,
    history,
    registryRaw: JSON.stringify(registry, null, 2) + '\n',
    historyRaw: JSON.stringify(history, null, 2) + '\n',
  };
}

function historySnapshot(universe = 'test'): {
  created_at: string;
  agents: string[];
  universe: string;
} {
  return {
    created_at: '2026-09-20T00:00:00.000Z',
    agents: [],
    universe,
  };
}

afterEach(() => {
  _setCastingDurabilityHooksForTesting(null);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('casting registry directory lock', () => {
  it('wires cast, init, preset, upgrade, export, and checkers to the shared pair protocol', () => {
    const presetSource = readFileSync(
      join(process.cwd(), 'packages/squad-sdk/src/presets/scaffold.ts'),
      'utf8',
    );
    const castSource = readFileSync(
      join(process.cwd(), 'packages/squad-cli/src/cli/core/cast.ts'),
      'utf8',
    );
    const initSource = readFileSync(
      join(process.cwd(), 'packages/squad-sdk/src/config/init.ts'),
      'utf8',
    );
    const upgradeSource = readFileSync(
      join(process.cwd(), 'packages/squad-cli/src/cli/core/upgrade.ts'),
      'utf8',
    );
    const readerSources = [
      'packages/squad-cli/src/cli/commands/export.ts',
      'packages/squad-cli/src/cli/commands/doctor.ts',
      'packages/squad-cli/src/cli/commands/health.ts',
      'packages/squad-sdk/src/config/team-capabilities.ts',
    ].map(file => readFileSync(join(process.cwd(), file), 'utf8'));
    const importSource = readFileSync(
      join(process.cwd(), 'packages/squad-cli/src/cli/commands/import.ts'),
      'utf8',
    );
    expect(presetSource).toContain('acquireCastingRegistryLock(castingDir');
    expect(castSource).toContain('acquireCastingRegistryLockAsync(castingDir');
    expect(initSource).toContain('ensureCastingRegistryPair(');
    expect(upgradeSource).toContain('ensureCastingRegistryPair(');
    expect(importSource).toContain('commitCastingRegistryPair(');
    for (const source of readerSources) {
      expect(source).toContain('readCastingRegistryPair(');
    }
    expect(presetSource).not.toContain("join(castingDir, 'registry.lock')");
    expect(castSource).not.toContain("open(lockPath, 'wx')");
  });

  it('allows at most one critical entrant', () => {
    const castingDir = temporaryCastingDir('single-entrant');
    const release = acquireCastingRegistryLock(castingDir);
    let clock = Date.now();
    _setCastingDurabilityHooksForTesting({
      now: () => clock,
      wait: milliseconds => { clock += milliseconds; },
      lockTimeoutMs: 50,
    });
    expect(() => acquireCastingRegistryLock(castingDir)).toThrow(/Timed out waiting/);
    release();
    expect(existsSync(join(castingDir, 'registry.lock'))).toBe(false);
  });

  it('fails closed when a delayed release observes replacement ownership', () => {
    const castingDir = temporaryCastingDir('release-replacement');
    const lockPath = join(castingDir, 'registry.lock');
    const release = acquireCastingRegistryLock(castingDir);
    let replaced = false;
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => {
        if (boundary !== 'lock:before-release-quarantine' || replaced) return;
        replaced = true;
        const oldPath = `${lockPath}.old`;
        renameSync(lockPath, oldPath);
        writeOwner(lockPath, { token: 'replacement-token', pid: process.pid });
        rmSync(oldPath, { recursive: true });
      },
    });
    expect(release).toThrow(/ownership changed/);
    expect(JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8')).token)
      .toBe('replacement-token');
  });

  it('preserves a live replacement installed after final stale-owner validation', () => {
    const castingDir = temporaryCastingDir('stale-aba');
    const lockPath = join(castingDir, 'registry.lock');
    writeOwner(lockPath);
    let replaced = false;
    let clock = Date.parse('2026-09-21T00:00:00.000Z');
    _setCastingDurabilityHooksForTesting({
      now: () => clock,
      wait: milliseconds => { clock += milliseconds; },
      isProcessAlive: () => false,
      staleLockAgeMs: 1,
      lockTimeoutMs: 50,
      boundary: ({ boundary }) => {
        if (boundary !== 'lock:before-stale-quarantine' || replaced) return;
        replaced = true;
        const oldPath = `${lockPath}.old`;
        renameSync(lockPath, oldPath);
        writeOwner(lockPath, { token: 'replacement-token', pid: process.pid });
        rmSync(oldPath, { recursive: true });
      },
    });
    expect(() => acquireCastingRegistryLock(castingDir)).toThrow(/ownership changed/);
    expect(JSON.parse(readFileSync(join(lockPath, 'owner.json'), 'utf8')).token)
      .toBe('replacement-token');
  });

  it.each([
    ['live', { isProcessAlive: () => true }],
    ['unknown', { isProcessAlive: () => undefined }],
    ['remote', { hostname: 'remote.example', isProcessAlive: () => false }],
    ['malformed', { version: 99, isProcessAlive: () => false }],
  ] as const)('fails closed for a %s stale owner', (_label, scenario) => {
    const castingDir = temporaryCastingDir(`closed-${_label}`);
    const lockPath = join(castingDir, 'registry.lock');
    writeOwner(lockPath, 'hostname' in scenario ? { hostname: scenario.hostname } : (
      'version' in scenario ? { version: scenario.version } : {}
    ));
    let clock = Date.parse('2026-09-21T00:00:00.000Z');
    _setCastingDurabilityHooksForTesting({
      now: () => clock,
      wait: milliseconds => { clock += milliseconds; },
      isProcessAlive: scenario.isProcessAlive,
      staleLockAgeMs: 1,
      lockTimeoutMs: 50,
    });
    expect(() => acquireCastingRegistryLock(castingDir)).toThrow(/Timed out waiting/);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('recovers only a dead same-host stale owner', () => {
    const castingDir = temporaryCastingDir('dead-owner');
    writeOwner(join(castingDir, 'registry.lock'));
    _setCastingDurabilityHooksForTesting({
      now: () => Date.parse('2026-09-21T00:00:00.000Z'),
      isProcessAlive: () => false,
      staleLockAgeMs: 1,
    });
    const release = acquireCastingRegistryLock(castingDir);
    release();
    expect(readdirSync(castingDir).filter(name => name.includes('.stale-'))).toEqual([]);
  });

  it('does not steal a crashed recovery guard', () => {
    const castingDir = temporaryCastingDir('guard-crash');
    writeOwner(join(castingDir, 'registry.lock.recovery'), {
      token: 'guard-token',
      pid: 999999,
    });
    let clock = Date.now();
    _setCastingDurabilityHooksForTesting({
      now: () => clock,
      wait: milliseconds => { clock += milliseconds; },
      isProcessAlive: () => false,
      lockTimeoutMs: 50,
    });
    expect(() => acquireCastingRegistryLock(castingDir)).toThrow(/Timed out waiting/);
    expect(existsSync(join(castingDir, 'registry.lock.recovery'))).toBe(true);
  });

  it('serializes competing stale recoverers and critical entrants', async () => {
    const castingDir = temporaryCastingDir('stale-recoverers');
    writeOwner(join(castingDir, 'registry.lock'), { pid: 2_147_483_647 });
    const logPath = join(castingDir, 'entrants.log');
    const modulePath = join(
      process.cwd(),
      'packages/squad-sdk/src/casting/durable-registry.ts',
    );
    const script = `
      import { acquireCastingRegistryLock } from ${JSON.stringify(modulePath)};
      import { appendFileSync } from 'node:fs';
      const castingDir = process.argv[1];
      const logPath = process.argv[2];
      const release = acquireCastingRegistryLock(castingDir, 'stale recovery test');
      appendFileSync(logPath, 'enter ' + process.pid + '\\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      appendFileSync(logPath, 'exit ' + process.pid + '\\n');
      release();
    `;
    const runChild = (): Promise<void> => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        '--experimental-strip-types',
        '--input-type=module',
        '-e',
        script,
        castingDir,
        logPath,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      child.once('error', reject);
      child.once('exit', code => {
        if (code === 0) resolve();
        else reject(new Error(`stale recovery child exited ${code}: ${stderr}`));
      });
    });
    await Promise.all([runChild(), runChild()]);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^enter /);
    expect(lines[1]).toMatch(/^exit /);
    expect(lines[2]).toMatch(/^enter /);
    expect(lines[3]).toMatch(/^exit /);
  });
});

describe('casting registry/history roll-forward transaction', () => {
  const preJournalBoundaries: CastingDurabilityBoundary[] = [
    'payload:registry-write',
    'payload:registry-fsync',
    'payload:history-write',
    'payload:history-fsync',
    'payload:dir-fsync',
    'payload:parent-fsync',
    'journal:write',
    'journal:file-fsync',
    'journal:rename',
    'journal:parent-fsync',
  ];
  const postJournalBoundaries: CastingDurabilityBoundary[] = [
    'history:write',
    'history:file-fsync',
    'history:rename',
    'history:parent-fsync',
    'manifest:write',
    'manifest:file-fsync',
    'manifest:rename',
    'manifest:parent-fsync',
    'registry:write',
    'registry:file-fsync',
    'registry:rename',
    'registry:parent-fsync',
    'cleanup:journal-unlink',
    'cleanup:journal-parent-fsync',
    'cleanup:payload-remove',
    'cleanup:payload-parent-fsync',
  ];
  const uncertainJournalCleanupBoundaries: CastingDurabilityBoundary[] = [
    'cleanup:journal-unlink',
    'cleanup:journal-parent-fsync',
  ];

  it.each(preJournalBoundaries)('keeps exactly the old pair when %s fails', (failure) => {
    const castingDir = temporaryCastingDir(`pre-boundary-${failure.replace(':', '-')}`);
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    let injected = false;
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => {
        if (!injected && boundary === failure) {
          injected = true;
          throw new Error(`crash at ${failure}`);
        }
      },
    });
    expect(() => commitCastingRegistryPair(
      castingDir,
      old.registryRaw,
      { ...old.registry, revision: 2 },
      old.historyRaw,
      { ...old.history, assignment_cast_snapshots: { second: historySnapshot() } },
      2,
    )).toThrow(`crash at ${failure}`);
    expect(readFileSync(join(castingDir, 'registry.json'), 'utf8')).toBe(old.registryRaw);
    expect(readFileSync(join(castingDir, 'history.json'), 'utf8')).toBe(old.historyRaw);
    expect(existsSync(join(castingDir, 'registry-history.transaction.json'))).toBe(false);
  });

  it.each(postJournalBoundaries.filter(
    boundary => !uncertainJournalCleanupBoundaries.includes(boundary),
  ))('publishes exactly the new pair after %s fails', (failure) => {
    const castingDir = temporaryCastingDir(`boundary-${failure.replace(':', '-')}`);
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    const nextRegistry = { ...old.registry, revision: 2 };
    const nextHistory = {
      ...old.history,
      assignment_cast_snapshots: { second: historySnapshot() },
    };
    let injected = false;
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => {
        if (!injected && boundary === failure) {
          injected = true;
          throw new Error(`crash at ${failure}`);
        }
      },
    });
    commitCastingRegistryPair(
      castingDir,
      old.registryRaw,
      nextRegistry,
      old.historyRaw,
      nextHistory,
      2,
    );
    _setCastingDurabilityHooksForTesting(null);
    recoverCastingRegistryTransaction(castingDir);
    const pair = readCastingRegistryPair(castingDir);
    expect(pair.registry?.revision).toBe(2);
    expect(pair.history?.registry_revision).toBe(2);
    expect(pair.registry?.transaction_id).toBe(pair.history?.transaction_id);
    expect(existsSync(join(castingDir, 'registry-history.transaction.json'))).toBe(false);
  });

  it.each(uncertainJournalCleanupBoundaries)(
    'surfaces commit-in-doubt and preserves recovery metadata after %s fails',
    (failure) => {
      const castingDir = temporaryCastingDir(`cleanup-uncertain-${failure.replace(':', '-')}`);
      const old = initialPair();
      writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
      writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
      let injected = false;
      _setCastingDurabilityHooksForTesting({
        boundary: ({ boundary }) => {
          if (!injected && boundary === failure) {
            injected = true;
            throw new Error(`uncertain at ${failure}`);
          }
        },
      });

      expect(() => commitCastingRegistryPair(
        castingDir,
        old.registryRaw,
        { ...old.registry, revision: 2 },
        old.historyRaw,
        { ...old.history, assignment_cast_snapshots: { next: historySnapshot() } },
        2,
      )).toThrow(CastingCommitInDoubtError);
      expect(readdirSync(castingDir).some(name =>
        name.startsWith('registry-history.transaction.')
        && name.endsWith('.payload')
      )).toBe(true);
      if (failure === 'cleanup:journal-unlink') {
        expect(existsSync(join(castingDir, 'registry-history.transaction.json'))).toBe(true);
        expect(() => readCastingRegistryPair(castingDir, 1)).toThrow(/awaiting roll-forward/);
      }

      _setCastingDurabilityHooksForTesting(null);
      recoverCastingRegistryTransaction(castingDir);
      const pair = readCastingRegistryPair(castingDir);
      expect(pair.registry?.revision).toBe(2);
      expect(pair.history?.registry_revision).toBe(2);
      expect(existsSync(join(castingDir, 'registry-history.transaction.json'))).toBe(false);
      expect(readdirSync(castingDir).some(name =>
        name.startsWith('registry-history.transaction.')
        && name.endsWith('.payload')
      )).toBe(false);
    },
  );

  it.each([
    ...preJournalBoundaries,
    ...postJournalBoundaries,
  ])('recovers a child-process crash at %s to one complete pair', (failure) => {
    const castingDir = temporaryCastingDir(`child-crash-${failure.replace(':', '-')}`);
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    const modulePath = join(
      process.cwd(),
      'packages/squad-sdk/src/casting/durable-registry.ts',
    );
    const child = spawnSync(process.execPath, [
      '--experimental-strip-types',
      '--input-type=module',
      '-e',
      `
        import {
          _setCastingDurabilityHooksForTesting,
          commitCastingRegistryPair,
        } from ${JSON.stringify(modulePath)};
        import { readFileSync } from 'node:fs';
        import { join } from 'node:path';
        const failure = process.argv[1];
        const castingDir = process.argv[2];
        const registryRaw = readFileSync(join(castingDir, 'registry.json'), 'utf8');
        const historyRaw = readFileSync(join(castingDir, 'history.json'), 'utf8');
        const registry = JSON.parse(registryRaw);
        const history = JSON.parse(historyRaw);
        _setCastingDurabilityHooksForTesting({
          boundary: ({ boundary }) => {
            if (boundary === failure) process.exit(86);
          },
        });
        commitCastingRegistryPair(
          castingDir,
          registryRaw,
          { ...registry, revision: 2 },
          historyRaw,
          {
            ...history,
            assignment_cast_snapshots: {
              next: {
                created_at: '2026-09-20T00:00:00.000Z',
                agents: [],
                universe: 'test',
              },
            },
          },
          2,
        );
      `,
      failure,
      castingDir,
    ], { encoding: 'utf8' });
    expect(child.status, child.stderr).toBe(86);

    recoverCastingRegistryTransaction(castingDir);
    const pair = readCastingRegistryPair(castingDir);
    const expectedRevision = (
      failure === 'journal:parent-fsync'
      || postJournalBoundaries.includes(failure)
    ) ? 2 : 1;
    expect(pair.registry?.revision).toBe(expectedRevision);
    if (expectedRevision === 2) {
      expect(pair.history?.registry_revision).toBe(2);
      expect(pair.registry?.transaction_id).toBe(pair.history?.transaction_id);
    } else {
      expect(pair.history?.registry_revision).toBeUndefined();
      expect(pair.registry?.transaction_id).toBeUndefined();
    }
    expect(existsSync(join(castingDir, 'registry-history.transaction.json'))).toBe(false);
  });

  it('accepts legacy pairs only when no transaction metadata exists', () => {
    const castingDir = temporaryCastingDir('legacy');
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    expect(readCastingRegistryPair(castingDir).transactionId).toBeUndefined();
    writeFileSync(join(castingDir, 'registry.json'), JSON.stringify({
      ...old.registry,
      transaction_id: 'orphan',
    }) + '\n');
    expect(() => readCastingRegistryPair(castingDir, 1)).toThrow(
      /transaction metadata exists without a commit manifest/,
    );
  });

  it('migrates a valid generationless legacy pair to matching persisted generations', () => {
    const castingDir = temporaryCastingDir('legacy-migration');
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);

    const result = ensureCastingRegistryPair(
      castingDir,
      old.registryRaw,
      old.historyRaw,
      'legacy migration test',
    );

    expect(result.migrated).toBe(true);
    expect(result.snapshot.transactionId).toBeDefined();
    expect(result.snapshot.registry?.transaction_id)
      .toBe(result.snapshot.history?.transaction_id);
    expect(result.snapshot.history?.registry_revision)
      .toBe(result.snapshot.registry?.revision);
  });

  it('migrates a canonical non-empty legacy genesis pair', () => {
    const castingDir = temporaryCastingDir('legacy-canonical-genesis');
    const createdAt = '2026-09-12T19:25:45.986Z';
    const registry = {
      ...initialPair().registry,
      generated_at: '2026-09-22T00:00:00.000Z',
      agents: {
        architect: {
          display_name: 'architect',
          persistent_name: 'architect',
          role: 'Lead Architect',
          universe: 'descriptive',
          status: 'active',
          created_at: createdAt,
          updated_at: '2026-09-22T00:00:00.000Z',
        },
        'state-storage-dev': {
          display_name: 'state-storage-dev',
          persistent_name: 'state-storage-dev',
          role: 'State & Storage Engineer',
          universe: 'descriptive',
          status: 'active',
          created_at: createdAt,
          updated_at: '2026-09-22T00:00:00.000Z',
        },
      },
    };
    const history = {
      assignment_cast_snapshots: {
        'active-team-reset-2026-09-12': {
          created_at: '2026-09-12T12:25:45.986-07:00',
          agents: ['architect', 'state-storage-dev'],
          universe: 'descriptive',
        },
      },
      universe_usage_history: [{
        universe: 'descriptive',
        used_at: '2026-09-12T12:25:45.986-07:00',
      }],
    };
    const registryRaw = JSON.stringify(registry) + '\n';
    const historyRaw = JSON.stringify(history) + '\n';
    writeFileSync(join(castingDir, 'registry.json'), registryRaw);
    writeFileSync(join(castingDir, 'history.json'), historyRaw);

    const result = ensureCastingRegistryPair(
      castingDir,
      registryRaw,
      historyRaw,
      'canonical genesis migration test',
    );

    expect(result.migrated).toBe(true);
    expect(result.snapshot.registry?.transaction_id)
      .toBe(result.snapshot.history?.transaction_id);
    expect(result.snapshot.history?.registry_revision).toBe(1);
  });

  it('rejects a revision-2 registry paired with unrelated empty legacy history', () => {
    const castingDir = temporaryCastingDir('legacy-revision-two-empty-history');
    const old = initialPair();
    const registry = { ...old.registry, revision: 2 };
    writeFileSync(join(castingDir, 'registry.json'), JSON.stringify(registry) + '\n');
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);

    expect(() => readCastingRegistryPair(castingDir, 1)).toThrow(/mixed-generation/);
    expect(() => ensureCastingRegistryPair(
      castingDir,
      JSON.stringify(registry) + '\n',
      old.historyRaw,
      'mixed empty legacy migration',
    )).toThrow(/mixed-generation/);
    expect(existsSync(join(castingDir, 'registry-history.commit.json'))).toBe(false);
  });

  it('accepts exhaustive shared legacy generation evidence', () => {
    const castingDir = temporaryCastingDir('legacy-exhaustive');
    const generatedAt = '2026-09-20T02:00:00.000Z';
    const registry = {
      ...initialPair().registry,
      revision: 3,
      generated_at: generatedAt,
    };
    const history = {
      assignment_cast_snapshots: {
        'preset-test-revision-2-2026-09-20T01:00:00.000Z': {
          created_at: '2026-09-20T01:00:00.000Z',
          agents: [],
          universe: 'test',
        },
        'preset-test-revision-3-2026-09-20T02:00:00.000Z': {
          created_at: generatedAt,
          agents: [],
          universe: 'test',
        },
      },
      universe_usage_history: [
        { universe: 'test', used_at: '2026-09-20T01:00:00.000Z' },
        { universe: 'test', used_at: generatedAt },
      ],
    };
    writeFileSync(join(castingDir, 'registry.json'), JSON.stringify(registry) + '\n');
    writeFileSync(join(castingDir, 'history.json'), JSON.stringify(history) + '\n');

    expect(readCastingRegistryPair(castingDir, 1).registry?.revision).toBe(3);
  });

  it.each([
    {
      name: 'missing snapshot-key evidence',
      history: {
        assignment_cast_snapshots: {
          'preset-test-2026-09-20T00:00:00.000Z': historySnapshot(),
        },
        universe_usage_history: [
          { universe: 'test', used_at: '2026-09-20T00:00:00.000Z' },
        ],
      },
      expected: /snapshot key lacks generation evidence/,
    },
    {
      name: 'one-sided usage evidence',
      history: {
        assignment_cast_snapshots: {
          'preset-test-revision-2-2026-09-19T00:00:00.000Z': {
            ...historySnapshot(),
            created_at: '2026-09-19T00:00:00.000Z',
          },
          'preset-test-revision-3-2026-09-20T00:00:00.000Z': historySnapshot(),
        },
        universe_usage_history: [
          { universe: 'test', used_at: '2026-09-20T00:00:00.000Z' },
        ],
      },
      expected: /mixed-generation/,
    },
    {
      name: 'mixed revision history',
      history: {
        assignment_cast_snapshots: {
          'preset-test-revision-3-2026-09-20T00:00:00.000Z': historySnapshot(),
        },
        universe_usage_history: [
          { universe: 'test', used_at: '2026-09-20T00:00:00.000Z' },
        ],
      },
      expected: /mixed-generation/,
    },
  ])('rejects legacy pairs with $name', ({ history, expected }) => {
    const castingDir = temporaryCastingDir('legacy-adversarial');
    const registry = {
      ...initialPair().registry,
      revision: 3,
    };
    writeFileSync(join(castingDir, 'registry.json'), JSON.stringify(registry) + '\n');
    writeFileSync(join(castingDir, 'history.json'), JSON.stringify(history) + '\n');

    expect(() => readCastingRegistryPair(castingDir, 1)).toThrow(expected);
  });

  it('fails closed on an ambiguous one-file legacy state', () => {
    const castingDir = temporaryCastingDir('legacy-ambiguous');
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);

    expect(() => ensureCastingRegistryPair(
      castingDir,
      old.registryRaw,
      old.historyRaw,
      'ambiguous migration test',
    )).toThrow(/exactly one authoritative file exists/);
    expect(existsSync(join(castingDir, 'history.json'))).toBe(false);
  });

  it('fails closed when a manifest-free legacy pair is missing or malformed', () => {
    const missingDir = temporaryCastingDir('legacy-missing');
    expect(() => readCastingRegistryPair(missingDir, 1)).toThrow(/both files are required/);

    const malformedDir = temporaryCastingDir('legacy-malformed');
    const old = initialPair();
    writeFileSync(join(malformedDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(malformedDir, 'history.json'), '{"assignment_cast_snapshots":[]}\n');
    expect(() => readCastingRegistryPair(malformedDir, 1)).toThrow(/history shape is invalid/);
  });

  it('fails closed on a mixed-generation legacy pair', () => {
    const castingDir = temporaryCastingDir('legacy-mixed-generation');
    const generatedAt = '2026-09-20T00:00:00.000Z';
    const registry = {
      schema: 'squad-agent-provenance/v1',
      schema_version: 1,
      revision: 1,
      generated_at: generatedAt,
      agents: {
        existing: {
          display_name: 'Existing',
          persistent_name: 'Existing',
          role: 'Lead',
          universe: 'descriptive',
          status: 'active',
          created_at: generatedAt,
          updated_at: generatedAt,
        },
      },
    };
    const history = {
      assignment_cast_snapshots: {
        'repl-cast-r2-2026-09-20T00:00:00.000Z': {
          created_at: generatedAt,
          agents: ['existing'],
          universe: 'descriptive',
        },
      },
      universe_usage_history: [{ universe: 'descriptive', used_at: generatedAt }],
    };
    writeFileSync(join(castingDir, 'registry.json'), JSON.stringify(registry) + '\n');
    writeFileSync(join(castingDir, 'history.json'), JSON.stringify(history) + '\n');

    expect(() => readCastingRegistryPair(castingDir, 1)).toThrow(/mixed-generation/);
    expect(() => ensureCastingRegistryPair(
      castingDir,
      JSON.stringify(registry) + '\n',
      JSON.stringify(history) + '\n',
      'mixed legacy migration',
    )).toThrow(/mixed-generation/);
    expect(existsSync(join(castingDir, 'registry-history.commit.json'))).toBe(false);
  });

  it('rejects a stable manifest over mixed pair bytes', () => {
    const castingDir = temporaryCastingDir('mixed-observer');
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    commitCastingRegistryPair(
      castingDir,
      old.registryRaw,
      { ...old.registry, revision: 2 },
      old.historyRaw,
      { ...old.history, assignment_cast_snapshots: { next: historySnapshot() } },
      2,
    );
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    expect(() => readCastingRegistryPair(castingDir, 1)).toThrow(
      /do not match the stable commit manifest/,
    );
  });

  it('fails before journal publication when an external writer mutates the pair', () => {
    const castingDir = temporaryCastingDir('external-mutation');
    const old = initialPair();
    const registryPath = join(castingDir, 'registry.json');
    writeFileSync(registryPath, old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => {
        if (boundary === 'payload:parent-fsync') {
          writeFileSync(registryPath, JSON.stringify({ external: true }) + '\n');
        }
      },
    });
    expect(() => commitCastingRegistryPair(
      castingDir,
      old.registryRaw,
      { ...old.registry, revision: 2 },
      old.historyRaw,
      old.history,
      2,
    )).toThrow(/changed before durable journal publication/);
    expect(existsSync(join(castingDir, 'registry-history.transaction.json'))).toBe(false);
  });

  it.each([
    {
      name: 'partial history snapshot',
      history: {
        assignment_cast_snapshots: { partial: { agents: [], universe: 'test' } },
        universe_usage_history: [],
      },
      targetRevision: 1,
      expected: /history snapshot is malformed/,
    },
    {
      name: 'extra history field',
      history: {
        assignment_cast_snapshots: {},
        universe_usage_history: [],
        extra: true,
      },
      targetRevision: 1,
      expected: /unexpected fields/,
    },
    {
      name: 'history revision mismatch',
      history: {
        assignment_cast_snapshots: {},
        universe_usage_history: [],
        registry_revision: 2,
      },
      targetRevision: 1,
      expected: /history registry revision does not match/,
    },
    {
      name: 'history snapshot with an unknown agent',
      history: {
        assignment_cast_snapshots: {
          invalid: {
            created_at: '2026-09-20T00:00:00.000Z',
            agents: ['missing-agent'],
            universe: 'test',
          },
        },
        universe_usage_history: [],
      },
      targetRevision: 1,
      expected: /history snapshot references unknown agents/,
    },
    {
      name: 'target revision mismatch',
      history: {
        assignment_cast_snapshots: {},
        universe_usage_history: [],
      },
      targetRevision: 2,
      expected: /target revision does not match/,
    },
  ])('rejects $name before any filesystem mutation', ({ history, targetRevision, expected }) => {
    const castingDir = missingCastingDir('strict-writer');
    const old = initialPair();

    expect(() => commitCastingRegistryPair(
      castingDir,
      undefined,
      old.registry,
      undefined,
      history,
      targetRevision,
    )).toThrow(expected);
    expect(existsSync(castingDir)).toBe(false);
  });

  it('never lets an observer accept a mixed pair at any commit boundary', () => {
    const castingDir = temporaryCastingDir('boundary-observer');
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    const acceptedRevisions: number[] = [];
    _setCastingDurabilityHooksForTesting({
      boundary: () => {
        try {
          const pair = readCastingRegistryPair(castingDir, 1);
          const revision = Number(pair.registry?.revision);
          acceptedRevisions.push(revision);
          if (revision === 1) expect(pair.history?.registry_revision).toBeUndefined();
          else expect(pair.history?.registry_revision).toBe(2);
        } catch (error) {
          expect(String(error)).toMatch(/consistent casting registry\/history pair/);
        }
      },
    });
    commitCastingRegistryPair(
      castingDir,
      old.registryRaw,
      { ...old.registry, revision: 2 },
      old.historyRaw,
      { ...old.history, assignment_cast_snapshots: { next: historySnapshot() } },
      2,
    );
    const finalPair = readCastingRegistryPair(castingDir);
    acceptedRevisions.push(Number(finalPair.registry?.revision));
    expect(finalPair.history?.registry_revision).toBe(2);
    expect(new Set(acceptedRevisions)).toEqual(new Set([1, 2]));
  });

  it('is byte-idempotent when recovery is repeated after publication', () => {
    const castingDir = temporaryCastingDir('idempotent-recovery');
    const old = initialPair();
    writeFileSync(join(castingDir, 'registry.json'), old.registryRaw);
    writeFileSync(join(castingDir, 'history.json'), old.historyRaw);
    let injected = false;
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => {
        if (!injected && boundary === 'registry:rename') {
          injected = true;
          throw new Error('interrupt registry publication');
        }
      },
    });
    commitCastingRegistryPair(
      castingDir,
      old.registryRaw,
      { ...old.registry, revision: 2 },
      old.historyRaw,
      { ...old.history, assignment_cast_snapshots: { next: historySnapshot() } },
      2,
    );
    _setCastingDurabilityHooksForTesting(null);
    const registryBytes = readFileSync(join(castingDir, 'registry.json'), 'utf8');
    const historyBytes = readFileSync(join(castingDir, 'history.json'), 'utf8');
    const manifestBytes = readFileSync(join(castingDir, 'registry-history.commit.json'), 'utf8');
    recoverCastingRegistryTransaction(castingDir);
    recoverCastingRegistryTransaction(castingDir);
    expect(readFileSync(join(castingDir, 'registry.json'), 'utf8')).toBe(registryBytes);
    expect(readFileSync(join(castingDir, 'history.json'), 'utf8')).toBe(historyBytes);
    expect(readFileSync(join(castingDir, 'registry-history.commit.json'), 'utf8'))
      .toBe(manifestBytes);
  });
});
