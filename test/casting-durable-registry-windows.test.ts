import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Emulate Windows filesystem semantics on any host (issue #2106):
// - FlushFileBuffers on a directory handle fails with EPERM (file handles flush normally).
// - MoveFileEx onto an existing directory fails with EPERM instead of POSIX ENOTEMPTY/EEXIST.
// - Optionally, a directory rename into release quarantine fails with a transient code a set
//   number of times per source path, as when antivirus briefly holds a freshly written owner.json.
// - Optionally, deleting a release quarantine fails with a given code.
const fsFaults = vi.hoisted(() => ({
  releaseRenameFailuresPerPath: 0,
  releaseRenameCode: 'EPERM',
  injected: new Map<string, number>(),
  quarantineRemoveCode: null as string | null,
  directoryFsyncEperm: true,
}));

const WIN32_TRANSIENT_CODES = ['EPERM', 'EACCES', 'EBUSY'] as const;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const fsError = (code: string, syscall: string): Error =>
    Object.assign(new Error(`${code}: simulated failure, ${syscall}`), { code, syscall });
  const eperm = (syscall: string): Error =>
    Object.assign(new Error(`EPERM: operation not permitted, ${syscall}`), { code: 'EPERM', syscall });
  const fsyncSync = vi.fn((descriptor: number) => {
    if (actual.fstatSync(descriptor).isDirectory()) {
      // With the fault off, emulate a POSIX host where directory fsync succeeds.
      if (fsFaults.directoryFsyncEperm) throw eperm('fsync');
      return undefined;
    }
    return actual.fsyncSync(descriptor);
  });
  const rmSync = vi.fn((target: string, options?: import('node:fs').RmOptions) => {
    if (fsFaults.quarantineRemoveCode && String(target).includes('.released-')) {
      throw fsError(fsFaults.quarantineRemoveCode, 'rmdir');
    }
    return actual.rmSync(target, options);
  });
  const renameSync = vi.fn((from: string, to: string) => {
    if (process.platform === 'win32' && String(to).includes('.released-')) {
      const seen = fsFaults.injected.get(String(from)) ?? 0;
      if (seen < fsFaults.releaseRenameFailuresPerPath) {
        fsFaults.injected.set(String(from), seen + 1);
        throw fsError(fsFaults.releaseRenameCode, 'rename');
      }
    }
    try {
      return actual.renameSync(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (process.platform === 'win32' && (code === 'ENOTEMPTY' || code === 'EEXIST')) {
        throw eperm('rename');
      }
      throw error;
    }
  });
  const overrides = { fsyncSync, renameSync, rmSync };
  return { ...actual, ...overrides, default: { ...actual, ...overrides } };
});

const {
  _setCastingDurabilityHooksForTesting,
  acquireCastingRegistryLock,
  acquireCastingRegistryLockAsync,
  ensureCastingRegistryPair,
} = await import('../packages/squad-sdk/src/casting/durable-registry.js');

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const roots: string[] = [];

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
}

function castingDir(name: string): string {
  const root = join(tmpdir(), `squad-durable-win-${name}-${process.pid}-${Date.now()}`);
  roots.push(root);
  const dir = join(root, '.squad', 'casting');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function useFastLockClock(): { advance: (milliseconds: number) => void } {
  let clock = Date.now();
  _setCastingDurabilityHooksForTesting({
    now: () => clock,
    wait: milliseconds => { clock += milliseconds; },
    lockTimeoutMs: 50,
  });
  return { advance: milliseconds => { clock += milliseconds; } };
}

const registryRaw = JSON.stringify({
  schema: 'squad-agent-provenance/v1',
  schema_version: 1,
  revision: 1,
  generated_at: '2026-09-20T00:00:00.000Z',
  agents: {},
}, null, 2) + '\n';
const historyRaw = JSON.stringify({
  assignment_cast_snapshots: {},
  universe_usage_history: [],
}, null, 2) + '\n';

afterEach(() => {
  fsFaults.releaseRenameFailuresPerPath = 0;
  fsFaults.releaseRenameCode = 'EPERM';
  fsFaults.injected.clear();
  fsFaults.quarantineRemoveCode = null;
  fsFaults.directoryFsyncEperm = true;
  _setCastingDurabilityHooksForTesting(null);
  Object.defineProperty(process, 'platform', originalPlatform);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('casting registry durability on Windows filesystem semantics (#2106)', () => {
  it('initializes the casting pair on win32 when directory fsync returns EPERM', () => {
    setPlatform('win32');
    const dir = castingDir('init');

    expect(
      () => ensureCastingRegistryPair(dir, registryRaw, historyRaw),
      'ensureCastingRegistryPair must not fsync directory handles on win32 '
        + '(Windows rejects FlushFileBuffers on a directory with EPERM)',
    ).not.toThrow();
    expect(JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8'))).toMatchObject({ revision: 1, agents: {} });
    expect(JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8'))).toMatchObject({ universe_usage_history: [] });
  });

  it('still flushes directories on POSIX and surfaces a directory fsync failure', () => {
    setPlatform('linux');
    const dir = castingDir('posix');

    expect(
      () => ensureCastingRegistryPair(dir, registryRaw, historyRaw),
      'on POSIX the directory fsync is a required durability step; its failure must not be swallowed',
    ).toThrow(/EPERM: operation not permitted, fsync/);
  });

  it('waits on a held lock when win32 reports the publish rename as EPERM (sync)', () => {
    setPlatform('win32');
    const dir = castingDir('lock-sync');
    const release = acquireCastingRegistryLock(dir);
    useFastLockClock();

    expect(
      () => acquireCastingRegistryLock(dir),
      'a second acquirer on win32 must treat EPERM from renaming onto the held lock '
        + 'directory as contention and time out, not crash with EPERM',
    ).toThrow(/Timed out waiting for concurrent casting writer lock: .*\(last publish error: EPERM\)/);
    release();
    expect(existsSync(join(dir, 'registry.lock'))).toBe(false);
  });

  it('waits on a held lock when win32 reports the publish rename as EPERM (async)', async () => {
    setPlatform('win32');
    const dir = castingDir('lock-async');
    const release = acquireCastingRegistryLock(dir);
    useFastLockClock();

    await expect(
      acquireCastingRegistryLockAsync(dir),
      'the async acquirer on win32 must treat EPERM from renaming onto the held lock '
        + 'directory as contention and time out, not crash with EPERM',
    ).rejects.toThrow(/Timed out waiting for concurrent casting writer lock: .*\(last publish error: EPERM\)/);
    release();
    expect(existsSync(join(dir, 'registry.lock'))).toBe(false);
  });

  it.each(WIN32_TRANSIENT_CODES)(
    'retries a transient win32 %s when releasing the lock and its recovery guard',
    code => {
      setPlatform('win32');
      const dir = castingDir(`release-transient-${code}`);
      const release = acquireCastingRegistryLock(dir);
      useFastLockClock();
      fsFaults.releaseRenameCode = code;
      fsFaults.releaseRenameFailuresPerPath = 2;

      expect(
        () => release(),
        `release on win32 must retry a transient ${code} from the quarantine rename; `
          + 'a leftover registry.lock.recovery wedges every later casting writer',
      ).not.toThrow();
      expect([...fsFaults.injected.keys()].map(p => basename(p)).sort()).toEqual([
        'registry.lock',
        'registry.lock.recovery',
      ]);
      expect(existsSync(join(dir, 'registry.lock'))).toBe(false);
      expect(existsSync(join(dir, 'registry.lock.recovery'))).toBe(false);
    },
  );

  it('gives up on a persistent win32 EPERM when releasing after the retry window', () => {
    setPlatform('win32');
    const dir = castingDir('release-persistent');
    const release = acquireCastingRegistryLock(dir);
    useFastLockClock();
    fsFaults.releaseRenameFailuresPerPath = Number.POSITIVE_INFINITY;

    expect(
      () => release(),
      'a persistent EPERM on release must surface after a bounded retry, not loop forever',
    ).toThrow(/EPERM: simulated failure, rename/);
  });

  it.each(WIN32_TRANSIENT_CODES)(
    'releases on win32 when deleting the quarantined lock hits %s',
    code => {
      setPlatform('win32');
      const dir = castingDir(`release-rm-win32-${code}`);
      const release = acquireCastingRegistryLock(dir);
      fsFaults.quarantineRemoveCode = code;

      expect(
        () => release(),
        `on win32 the lock is released once the quarantine rename succeeds; a ${code} `
          + 'deleting the quarantined copy (antivirus holding owner.json) must not fail release',
      ).not.toThrow();
      expect(existsSync(join(dir, 'registry.lock'))).toBe(false);
      expect(existsSync(join(dir, 'registry.lock.recovery'))).toBe(false);
      expect(readdirSync(dir).filter(name => name.includes('.released-'))).toHaveLength(2);
    },
  );

  it('sweeps abandoned quarantines on a later release, keeping guard quarantines until stale', () => {
    setPlatform('win32');
    const dir = castingDir('sweep');
    const clock = useFastLockClock();
    const leftovers = (): string[] =>
      readdirSync(dir).filter(name => /\.(released|stale)-/.test(name)).sort();

    fsFaults.quarantineRemoveCode = 'EPERM';
    acquireCastingRegistryLock(dir)();
    expect(leftovers(), 'setup: an abandoned delete leaves a lock and a guard quarantine').toHaveLength(2);
    fsFaults.quarantineRemoveCode = null;
    mkdirSync(join(dir, 'registry.lock.stale-abandoned'));

    acquireCastingRegistryLock(dir)();
    const young = leftovers();
    expect(
      young.map(name => name.replace(/-.*/, '-*')),
      'a later release must sweep abandoned lock quarantines (.released-*, .stale-*) under the '
        + `recovery guard, but keep a guard quarantine younger than the stale age; left: ${young.join(', ')}`,
    ).toEqual(['registry.lock.recovery.released-*']);

    clock.advance(5_001);
    acquireCastingRegistryLock(dir)();
    expect(
      leftovers(),
      'a guard quarantine older than the stale-lock age must be swept on the next release',
    ).toEqual([]);
  });

  it('still surfaces a quarantine delete failure on POSIX', () => {
    setPlatform('linux');
    fsFaults.directoryFsyncEperm = false;
    const dir = castingDir('release-rm-posix');
    const release = acquireCastingRegistryLock(dir);
    fsFaults.quarantineRemoveCode = 'EPERM';

    expect(
      () => release(),
      'the win32 best-effort delete must not swallow POSIX delete failures',
    ).toThrow(/EPERM: simulated failure, rmdir/);
  });
});
