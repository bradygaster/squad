/**
 * Deterministic tests for createIfAbsent across all state backends.
 *
 * Requirements verified:
 *   - Exactly one concurrent creator succeeds; all others receive StateKeyConflictError.
 *   - Winner content is preserved unchanged.
 *   - No partial or duplicate state results.
 *   - StateKeyConflictError on existing key.
 *   - Repository isolation: operations in different repos/dirs do not conflict.
 *   - StateBackendUncertaintyError surfaces for two-layer disagreement and backend failure.
 *   - ToolRegistry exposes squad_state_create_if_absent with correct failure shapes.
 *   - FSStorageProvider and InMemoryStorageProvider behave correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  WorktreeBackend,
  GitNotesBackend,
  OrphanBranchBackend,
  TwoLayerBackend,
  StateBackendStorageAdapter,
} from '../packages/squad-sdk/src/state-backend.js';
import { StateKeyConflictError, StateBackendUncertaintyError } from '../packages/squad-sdk/src/storage/storage-error.js';
import { FSStorageProvider } from '../packages/squad-sdk/src/storage/fs-storage-provider.js';
import { InMemoryStorageProvider } from '../packages/squad-sdk/src/storage/in-memory-storage-provider.js';
import { SQLiteStorageProvider } from '../packages/squad-sdk/src/storage/sqlite-storage-provider.js';
import { ToolRegistry } from '../packages/squad-sdk/src/tools/index.js';
import { clearResolveSquadCache } from '../packages/squad-sdk/src/resolution.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const TMP = join(process.cwd(), `.test-cia-${randomBytes(4).toString('hex')}`);
const TMP2 = join(process.cwd(), `.test-cia2-${randomBytes(4).toString('hex')}`);

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function initRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  git('init', dir);
  git('config user.email "test@test.com"', dir);
  git('config user.name "Test"', dir);
  writeFileSync(join(dir, 'README.md'), '# test\n');
  git('add .', dir);
  git('commit -m "init"', dir);
}

function cleanup(...dirs: string[]): void {
  for (const d of dirs) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
}

// ── WorktreeBackend ──────────────────────────────────────────────────────────

describe('WorktreeBackend.createIfAbsent', () => {
  const squadDir = () => join(TMP, '.squad');

  beforeEach(() => {
    cleanup(TMP);
    mkdirSync(squadDir(), { recursive: true });
  });
  afterEach(() => { clearResolveSquadCache(); cleanup(TMP); });

  it('creates the key when absent', () => {
    const b = new WorktreeBackend(squadDir());
    b.createIfAbsent('sessions/alpha.md', '# Alpha\n');
    expect(b.read('sessions/alpha.md')).toBe('# Alpha\n');
  });

  it('throws StateKeyConflictError when key already exists', () => {
    const b = new WorktreeBackend(squadDir());
    b.write('sessions/alpha.md', '# Original\n');
    expect(() => b.createIfAbsent('sessions/alpha.md', '# New\n'))
      .toThrow(StateKeyConflictError);
    // original content preserved
    expect(b.read('sessions/alpha.md')).toBe('# Original\n');
  });

  it('exactly one of two independent instances succeeds (concurrent create)', () => {
    const b1 = new WorktreeBackend(squadDir());
    const b2 = new WorktreeBackend(squadDir());
    let successes = 0;
    let conflicts = 0;
    for (const b of [b1, b2]) {
      try {
        b.createIfAbsent('sessions/race.md', `writer-${successes + conflicts}\n`);
        successes++;
      } catch (e) {
        if (e instanceof StateKeyConflictError) conflicts++;
        else throw e;
      }
    }
    expect(successes).toBe(1);
    expect(conflicts).toBe(1);
    // key exists with exactly the winner's content
    const content = b1.read('sessions/race.md');
    expect(typeof content).toBe('string');
    expect(content).toMatch(/^writer-/);
  });

  it('repository isolation: different squad dirs do not conflict', () => {
    const dir2 = join(TMP, '.squad2');
    mkdirSync(dir2, { recursive: true });
    const b1 = new WorktreeBackend(squadDir());
    const b2 = new WorktreeBackend(dir2);
    b1.createIfAbsent('sessions/shared.md', 'repo1\n');
    // should not throw in b2
    expect(() => b2.createIfAbsent('sessions/shared.md', 'repo2\n')).not.toThrow();
    expect(b1.read('sessions/shared.md')).toBe('repo1\n');
    expect(b2.read('sessions/shared.md')).toBe('repo2\n');
  });
});

// ── GitNotesBackend ──────────────────────────────────────────────────────────

describe('GitNotesBackend.createIfAbsent', { timeout: 30_000 }, () => {
  beforeEach(() => { cleanup(TMP); initRepo(TMP); });
  afterEach(() => { clearResolveSquadCache(); cleanup(TMP); });

  it('creates a key when absent', () => {
    const b = new GitNotesBackend(TMP);
    b.createIfAbsent('sessions/beta.md', '# Beta\n');
    expect(b.read('sessions/beta.md')).toBe('# Beta\n');
  });

  it('throws StateKeyConflictError when key already exists', () => {
    const b = new GitNotesBackend(TMP);
    b.write('sessions/beta.md', '# Original\n');
    expect(() => b.createIfAbsent('sessions/beta.md', '# New\n'))
      .toThrow(StateKeyConflictError);
    expect(b.read('sessions/beta.md')).toBe('# Original\n');
  });

  it('exactly one of two sequential instances succeeds (concurrent create)', () => {
    const b1 = new GitNotesBackend(TMP);
    const b2 = new GitNotesBackend(TMP);
    let successes = 0;
    let conflicts = 0;
    for (const b of [b1, b2]) {
      try {
        b.createIfAbsent('sessions/notes-race.md', `writer-${successes + conflicts}\n`);
        successes++;
      } catch (e) {
        if (e instanceof StateKeyConflictError) conflicts++;
        else throw e;
      }
    }
    expect(successes).toBe(1);
    expect(conflicts).toBe(1);
    const content = b1.read('sessions/notes-race.md');
    expect(typeof content).toBe('string');
  });

  it('repository isolation: different repos do not conflict', () => {
    cleanup(TMP2);
    initRepo(TMP2);
    const b1 = new GitNotesBackend(TMP);
    const b2 = new GitNotesBackend(TMP2);
    b1.createIfAbsent('sessions/shared.md', 'repo1\n');
    expect(() => b2.createIfAbsent('sessions/shared.md', 'repo2\n')).not.toThrow();
    expect(b1.read('sessions/shared.md')).toBe('repo1\n');
    expect(b2.read('sessions/shared.md')).toBe('repo2\n');
    cleanup(TMP2);
  });
});

// ── OrphanBranchBackend ──────────────────────────────────────────────────────

describe('OrphanBranchBackend.createIfAbsent', { timeout: 30_000 }, () => {
  beforeEach(() => { cleanup(TMP); initRepo(TMP); });
  afterEach(() => { clearResolveSquadCache(); cleanup(TMP); });

  it('creates a key when absent', () => {
    const b = new OrphanBranchBackend(TMP);
    b.createIfAbsent('sessions/gamma.md', '# Gamma\n');
    expect(b.read('sessions/gamma.md')).toBe('# Gamma\n');
  });

  it('throws StateKeyConflictError when key already exists', () => {
    const b = new OrphanBranchBackend(TMP);
    b.write('sessions/gamma.md', '# Original\n');
    expect(() => b.createIfAbsent('sessions/gamma.md', '# New\n'))
      .toThrow(StateKeyConflictError);
    expect(b.read('sessions/gamma.md')).toBe('# Original\n');
  });

  it('exactly one of two sequential instances succeeds (concurrent create)', () => {
    const b1 = new OrphanBranchBackend(TMP);
    const b2 = new OrphanBranchBackend(TMP);
    let successes = 0;
    let conflicts = 0;
    for (const b of [b1, b2]) {
      try {
        b.createIfAbsent('sessions/orphan-race.md', `writer-${successes + conflicts}\n`);
        successes++;
      } catch (e) {
        if (e instanceof StateKeyConflictError) conflicts++;
        else throw e;
      }
    }
    expect(successes).toBe(1);
    expect(conflicts).toBe(1);
    const content = b1.read('sessions/orphan-race.md');
    expect(typeof content).toBe('string');
  });

  it('repository isolation: different repos do not conflict', () => {
    cleanup(TMP2);
    initRepo(TMP2);
    const b1 = new OrphanBranchBackend(TMP);
    const b2 = new OrphanBranchBackend(TMP2);
    b1.createIfAbsent('sessions/shared.md', 'repo1\n');
    expect(() => b2.createIfAbsent('sessions/shared.md', 'repo2\n')).not.toThrow();
    expect(b1.read('sessions/shared.md')).toBe('repo1\n');
    expect(b2.read('sessions/shared.md')).toBe('repo2\n');
    cleanup(TMP2);
  });

  it('repeated conflicts stay typed and do not trip the circuit breaker', () => {
    const b = new OrphanBranchBackend(TMP);
    b.createIfAbsent('sessions/hot-key.md', '# Winner\n');
    // CIRCUIT_BREAKER_THRESHOLD is 5; drive well past it with legitimate conflicts.
    for (let i = 0; i < 8; i++) {
      expect(() => b.createIfAbsent('sessions/hot-key.md', `# Loser ${i}\n`))
        .toThrow(StateKeyConflictError);
    }
    // The backend is still healthy: an unrelated create still succeeds.
    expect(() => b.createIfAbsent('sessions/still-healthy.md', '# Fine\n')).not.toThrow();
    // And the original winner's content was never overwritten.
    expect(b.read('sessions/hot-key.md')).toBe('# Winner\n');
  });
});

// ── TwoLayerBackend ──────────────────────────────────────────────────────────

describe('TwoLayerBackend.createIfAbsent', { timeout: 30_000 }, () => {
  beforeEach(() => { cleanup(TMP); initRepo(TMP); });
  afterEach(() => { clearResolveSquadCache(); cleanup(TMP); });

  it('creates a key when absent (both layers)', () => {
    const b = new TwoLayerBackend(TMP);
    b.createIfAbsent('sessions/delta.md', '# Delta\n');
    expect(b.read('sessions/delta.md')).toBe('# Delta\n');
  });

  it('throws StateKeyConflictError when key already exists in orphan layer', () => {
    const b = new TwoLayerBackend(TMP);
    b.write('sessions/delta.md', '# Original\n');
    expect(() => b.createIfAbsent('sessions/delta.md', '# New\n'))
      .toThrow(StateKeyConflictError);
    expect(b.read('sessions/delta.md')).toBe('# Original\n');
  });

  it('exactly one of two sequential instances succeeds (concurrent create)', () => {
    const b1 = new TwoLayerBackend(TMP);
    const b2 = new TwoLayerBackend(TMP);
    let successes = 0;
    let conflicts = 0;
    for (const b of [b1, b2]) {
      try {
        b.createIfAbsent('sessions/two-layer-race.md', `writer-${successes + conflicts}\n`);
        successes++;
      } catch (e) {
        if (e instanceof StateKeyConflictError) conflicts++;
        else throw e;
      }
    }
    expect(successes).toBe(1);
    expect(conflicts).toBe(1);
  });

  it('fail-closed: throws StateBackendUncertaintyError when notes already has the key but orphan does not', () => {
    // Plant the key in notes only (no write through TwoLayerBackend.write, which would also set orphan).
    const notes = new GitNotesBackend(TMP);
    notes.write('sessions/disagreement.md', '# Notes only\n');

    // OrphanBranchBackend doesn't have it — createIfAbsent on TwoLayerBackend:
    // orphan succeeds, notes sees conflict → uncertainty.
    const b = new TwoLayerBackend(TMP);
    expect(() => b.createIfAbsent('sessions/disagreement.md', '# Two-layer\n'))
      .toThrow(StateBackendUncertaintyError);
  });

  it('fail-closed: notes-layer failure (not conflict) also surfaces as StateBackendUncertaintyError', () => {
    const b = new TwoLayerBackend(TMP);
    // Force the notes layer to fail for a reason other than an existing key.
    const boom = new Error('simulated notes backend outage');
    b.notes.createIfAbsent = () => { throw boom; };

    expect(() => b.createIfAbsent('sessions/notes-outage.md', '# Payload\n'))
      .toThrow(StateBackendUncertaintyError);
    // The uncertainty must name the disagreement, not masquerade as a conflict.
    try {
      b.notes.createIfAbsent = () => { throw boom; };
      b.createIfAbsent('sessions/notes-outage-2.md', '# Payload\n');
      throw new Error('expected StateBackendUncertaintyError');
    } catch (e) {
      expect(e).toBeInstanceOf(StateBackendUncertaintyError);
      expect((e as StateBackendUncertaintyError).message).toMatch(/orphan succeeded but notes layer failed/);
    }
  });

  it('two-layer conflict on an existing key is a conflict, never success-shaped', () => {
    const b = new TwoLayerBackend(TMP);
    b.createIfAbsent('sessions/once.md', '# Winner\n');
    expect(() => b.createIfAbsent('sessions/once.md', '# Loser\n')).toThrow(StateKeyConflictError);
    expect(b.read('sessions/once.md')).toBe('# Winner\n');
  });
});

// ── Backend uncertainty (fail-closed on repository identity) ─────────────────

describe('createIfAbsent fails closed on uncertain repository identity', { timeout: 30_000 }, () => {
  beforeEach(() => { cleanup(TMP); mkdirSync(TMP, { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); cleanup(TMP); });

  it('GitNotesBackend throws StateBackendUncertaintyError outside a git repository', () => {
    const notARepo = join(TMP, 'plain-dir');
    mkdirSync(notARepo, { recursive: true });
    const b = new GitNotesBackend(notARepo);
    expect(() => b.createIfAbsent('sessions/nope.md', 'x\n'))
      .toThrow(StateBackendUncertaintyError);
  });

  it('OrphanBranchBackend throws StateBackendUncertaintyError outside a git repository', () => {
    const notARepo = join(TMP, 'plain-dir-2');
    mkdirSync(notARepo, { recursive: true });
    const b = new OrphanBranchBackend(notARepo);
    expect(() => b.createIfAbsent('sessions/nope.md', 'x\n'))
      .toThrow(StateBackendUncertaintyError);
  });

  it('never creates state when repository identity is uncertain', () => {
    const notARepo = join(TMP, 'plain-dir-3');
    mkdirSync(notARepo, { recursive: true });
    const b = new OrphanBranchBackend(notARepo);
    try { b.createIfAbsent('sessions/nope.md', 'x\n'); } catch { /* expected */ }
    expect(existsSync(join(notARepo, 'sessions'))).toBe(false);
    expect(existsSync(join(notARepo, '.git'))).toBe(false);
  });

  it('WorktreeBackend throws StateBackendUncertaintyError when the parent path is not a directory', () => {
    const squadDir = join(TMP, '.squad');
    mkdirSync(squadDir, { recursive: true });
    // "sessions" is a FILE, so mkdir of the parent directory cannot succeed.
    writeFileSync(join(squadDir, 'sessions'), 'not a directory\n');
    const b = new WorktreeBackend(squadDir);
    expect(() => b.createIfAbsent('sessions/blocked.md', 'x\n'))
      .toThrow(StateBackendUncertaintyError);
  });
});

// ── FSStorageProvider ────────────────────────────────────────────────────────

describe('FSStorageProvider.createIfAbsent', () => {
  beforeEach(() => { cleanup(TMP); mkdirSync(TMP, { recursive: true }); });
  afterEach(() => { cleanup(TMP); });

  it('creates a file when absent', async () => {
    const fs = new FSStorageProvider(TMP);
    await fs.createIfAbsent('sessions/new.md', '# New\n');
    expect(await fs.read('sessions/new.md')).toBe('# New\n');
  });

  it('throws StateKeyConflictError when file already exists', async () => {
    const fs = new FSStorageProvider(TMP);
    await fs.write('sessions/exists.md', '# Original\n');
    await expect(fs.createIfAbsent('sessions/exists.md', '# New\n'))
      .rejects.toThrow(StateKeyConflictError);
    expect(await fs.read('sessions/exists.md')).toBe('# Original\n');
  });

  it('exactly one of two concurrent creates succeeds', async () => {
    const fs1 = new FSStorageProvider(TMP);
    const fs2 = new FSStorageProvider(TMP);
    mkdirSync(join(TMP, 'sessions'), { recursive: true });
    const results = await Promise.allSettled([
      fs1.createIfAbsent('sessions/concurrent.md', 'writer-1\n'),
      fs2.createIfAbsent('sessions/concurrent.md', 'writer-2\n'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof StateKeyConflictError,
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const content = await fs1.read('sessions/concurrent.md');
    expect(['writer-1\n', 'writer-2\n']).toContain(content);
  });
});

// ── InMemoryStorageProvider ──────────────────────────────────────────────────

describe('InMemoryStorageProvider.createIfAbsent', () => {
  it('creates a key when absent', async () => {
    const mem = new InMemoryStorageProvider();
    await mem.createIfAbsent('sessions/mem.md', '# Mem\n');
    expect(await mem.read('sessions/mem.md')).toBe('# Mem\n');
  });

  it('throws StateKeyConflictError when key already exists', async () => {
    const mem = new InMemoryStorageProvider();
    await mem.write('sessions/mem.md', '# Original\n');
    await expect(mem.createIfAbsent('sessions/mem.md', '# New\n'))
      .rejects.toThrow(StateKeyConflictError);
    expect(await mem.read('sessions/mem.md')).toBe('# Original\n');
  });

  it('exactly one of many concurrent creators wins and its content is preserved', async () => {
    const mem = new InMemoryStorageProvider();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => mem.createIfAbsent('sessions/many.md', `writer-${i}\n`)),
    );
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(
      r => r.status === 'rejected' && r.reason instanceof StateKeyConflictError,
    )).toHaveLength(7);

    const winnerIndex = results.findIndex(r => r.status === 'fulfilled');
    expect(await mem.read('sessions/many.md')).toBe(`writer-${winnerIndex}\n`);
  });

  it('repository isolation: separate provider instances do not share keys', async () => {
    const repo1 = new InMemoryStorageProvider();
    const repo2 = new InMemoryStorageProvider();
    await repo1.createIfAbsent('sessions/shared.md', 'repo1\n');
    await expect(repo2.createIfAbsent('sessions/shared.md', 'repo2\n')).resolves.toBeUndefined();
    expect(await repo1.read('sessions/shared.md')).toBe('repo1\n');
    expect(await repo2.read('sessions/shared.md')).toBe('repo2\n');
  });
});

// ── SQLiteStorageProvider ────────────────────────────────────────────────────

describe('SQLiteStorageProvider.createIfAbsent', { timeout: 30_000 }, () => {
  beforeEach(() => { cleanup(TMP); mkdirSync(TMP, { recursive: true }); });
  afterEach(() => { cleanup(TMP); });

  it('creates when absent and conflicts on an existing key without overwriting', async () => {
    const db = new SQLiteStorageProvider(join(TMP, 'state.db'));
    await db.createIfAbsent('sessions/sqlite.md', '# Winner\n');
    expect(await db.read('sessions/sqlite.md')).toBe('# Winner\n');

    await expect(db.createIfAbsent('sessions/sqlite.md', '# Loser\n'))
      .rejects.toThrow(StateKeyConflictError);
    expect(await db.read('sessions/sqlite.md')).toBe('# Winner\n');
  });

  it('exactly one of two concurrent creators succeeds', async () => {
    const db = new SQLiteStorageProvider(join(TMP, 'state2.db'));
    const results = await Promise.allSettled([
      db.createIfAbsent('sessions/race.md', 'writer-1\n'),
      db.createIfAbsent('sessions/race.md', 'writer-2\n'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(
      r => r.status === 'rejected' && r.reason instanceof StateKeyConflictError,
    )).toHaveLength(1);
    expect(['writer-1\n', 'writer-2\n']).toContain(await db.read('sessions/race.md'));
  });
});

// ── StateBackendStorageAdapter ───────────────────────────────────────────────

describe('StateBackendStorageAdapter.createIfAbsent', { timeout: 30_000 }, () => {
  const squadDir = () => join(TMP, '.squad');

  beforeEach(() => { cleanup(TMP); initRepo(TMP); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); cleanup(TMP); });

  it('forwards create/conflict semantics from the underlying backend', async () => {
    const backend = new OrphanBranchBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());

    await adapter.createIfAbsent(join(squadDir(), 'sessions/adapter.md'), '# Winner\n');
    expect(backend.read('sessions/adapter.md')).toBe('# Winner\n');

    await expect(adapter.createIfAbsent(join(squadDir(), 'sessions/adapter.md'), '# Loser\n'))
      .rejects.toThrow(StateKeyConflictError);
    // Winning content preserved through the adapter.
    expect(backend.read('sessions/adapter.md')).toBe('# Winner\n');
  });

  it('forwards uncertainty from the underlying backend', async () => {
    const backend = new OrphanBranchBackend(TMP);
    backend.createIfAbsent = () => {
      throw new StateBackendUncertaintyError('orphan:createIfAbsent(x)', 'simulated');
    };
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    await expect(adapter.createIfAbsent(join(squadDir(), 'sessions/x.md'), 'x\n'))
      .rejects.toThrow(StateBackendUncertaintyError);
  });
});

// ── ToolRegistry: squad_state_create_if_absent ───────────────────────────────

describe('ToolRegistry squad_state_create_if_absent', { timeout: 30_000 }, () => {
  const squadDir = () => join(TMP, '.squad');

  beforeEach(() => { cleanup(TMP); initRepo(TMP); mkdirSync(squadDir(), { recursive: true }); });
  afterEach(() => { clearResolveSquadCache(); cleanup(TMP); });

  function makeRegistry() {
    const backend = new OrphanBranchBackend(TMP);
    const adapter = new StateBackendStorageAdapter(backend, squadDir());
    return { registry: new ToolRegistry(squadDir(), undefined, adapter), backend };
  }

  it('appears in registered tools list', () => {
    const { registry } = makeRegistry();
    expect(registry.getTool('squad_state_create_if_absent')).toBeDefined();
  });

  it('returns success and creates the key when absent', async () => {
    const { registry, backend } = makeRegistry();
    const tool = registry.getTool('squad_state_create_if_absent')!;
    const result = await tool.handler({ key: 'sessions/tool-new.md', content: '# Created\n' });
    expect(result.resultType).toBe('success');
    expect(backend.read('sessions/tool-new.md')).toBe('# Created\n');
  });

  it('returns failure with error="conflict" when key already exists', async () => {
    const { registry, backend } = makeRegistry();
    backend.write('sessions/existing.md', '# Original\n');
    const tool = registry.getTool('squad_state_create_if_absent')!;
    const result = await tool.handler({ key: 'sessions/existing.md', content: '# New\n' });
    expect(result.resultType).toBe('failure');
    expect((result as { error?: unknown }).error).toBe('conflict');
    // original content unchanged
    expect(backend.read('sessions/existing.md')).toBe('# Original\n');
  });

  it('returns failure for invalid/protected key', async () => {
    const { registry } = makeRegistry();
    const tool = registry.getTool('squad_state_create_if_absent')!;
    const result = await tool.handler({ key: 'team.md', content: '# Bad\n' });
    expect(result.resultType).toBe('failure');
  });

  it('returns failure with error="conflict" — not success — on conflict (no success-shaped conflict)', async () => {
    const { registry, backend } = makeRegistry();
    backend.write('sessions/guard.md', '# Guard\n');
    const tool = registry.getTool('squad_state_create_if_absent')!;
    const result = await tool.handler({ key: 'sessions/guard.md', content: '# Attempt\n' });
    // Must NOT be success-shaped
    expect(result.resultType).not.toBe('success');
    expect((result as { error?: unknown }).error).toBe('conflict');
  });
});
