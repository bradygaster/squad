/**
 * Tests for MemPalaceMemoryProvider and IndexServerMemoryProvider.
 *
 * Each test proves:
 * - Governed safe memory can be written and searched through the provider
 * - FORBIDDEN content is rejected BEFORE the provider is called
 * - TRANSIENT content is rejected BEFORE the provider is called
 * - provider=copilot path still fails closed (unrelated to these providers)
 * - Providers appear in providerStatus()
 * - Diagnostics do not contain raw memory content or raw query text
 */

import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FSStorageProvider } from '../packages/squad-sdk/src/storage/fs-storage-provider.js';
import {
  LocalMemoryStore,
  MemPalaceMemoryProvider,
  IndexServerMemoryProvider,
  type CopilotMemoryProviderWriteRequest,
  type MemoryProvider,
  type MemoryProviderSearchResult,
  type MemoryProviderStatus,
} from '../packages/squad-sdk/src/memory/index.js';

const roots: string[] = [];

function testRoot(prefix: string): string {
  const root = path.join(process.cwd(), `.test-${prefix}-${randomUUID()}`);
  roots.push(root);
  fs.mkdirSync(path.join(root, '.squad'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── MemPalaceMemoryProvider ────────────────────────────────────────────────

describe('MemPalaceMemoryProvider', () => {
  it('reports status as available', async () => {
    const provider = new MemPalaceMemoryProvider();
    const status = await provider.status();
    expect(status).toMatchObject({ id: 'mempalace', name: 'MemPalace', available: true });
  });

  it('stores and retrieves a governed LOCAL memory', async () => {
    const provider = new MemPalaceMemoryProvider();
    const req: CopilotMemoryProviderWriteRequest = {
      content: 'Use Vitest for unit tests in the SDK.',
      title: 'Vitest SDK rule',
      classification: {
        class: 'LOCAL',
        allowed: true,
        reason: 'Content is allowed for governed local memory',
        destination: 'local',
        loadGuidance: 'ON-DEMAND',
      },
    };
    const result = await provider.write(req);
    expect(result.id).toMatch(/^mempalace-/);
    expect(result.path).toContain('mempalace:default:');

    const hits = await provider.search('Vitest');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(result.id);
    expect(hits[0]?.title).toBe('Vitest SDK rule');
    expect(hits[0]).toMatchObject({ class: 'LOCAL', loadGuidance: 'ON-DEMAND' });
  });

  it('stores a DECISION memory at a named locus', async () => {
    const provider = new MemPalaceMemoryProvider();
    const req: CopilotMemoryProviderWriteRequest = {
      content: 'All significant architecture decisions must be recorded in the decisions inbox.',
      title: 'Architecture decisions policy',
      metadata: { locus: 'decisions-locus' },
      classification: {
        class: 'DECISION',
        allowed: true,
        reason: 'Content is allowed for governed local memory',
        destination: 'decision-inbox',
        loadGuidance: 'ALWAYS',
      },
    };
    const result = await provider.write(req);
    expect(result.path).toContain('mempalace:decisions-locus:');

    const hits = await provider.search('architecture decisions');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.path).toContain('decisions-locus');
  });

  it('deletes an entry and confirms it is gone', async () => {
    const provider = new MemPalaceMemoryProvider();
    const req: CopilotMemoryProviderWriteRequest = {
      content: 'Temporary rule to test deletion.',
      title: 'Temp rule',
      classification: {
        class: 'LOCAL',
        allowed: true,
        reason: 'Content is allowed for governed local memory',
        destination: 'local',
        loadGuidance: 'ON-DEMAND',
      },
    };
    const result = await provider.write(req);
    expect(provider.size).toBe(1);

    const deleted = await provider.delete(result.id);
    expect(deleted).toBe(true);
    expect(provider.size).toBe(0);

    const hits = await provider.search('deletion');
    expect(hits).toHaveLength(0);
  });

  it('returns empty results for unmatched search query', async () => {
    const provider = new MemPalaceMemoryProvider();
    const hits = await provider.search('nonexistent-query-xyz');
    expect(hits).toHaveLength(0);
  });

  it('bounds long-lived in-memory provider entries', async () => {
    const provider = new MemPalaceMemoryProvider(1);
    const classification = {
      class: 'LOCAL' as const,
      allowed: true,
      reason: 'Content is allowed for governed local memory',
      destination: 'local' as const,
      loadGuidance: 'ON-DEMAND' as const,
    };

    await provider.write({ content: 'First memory', title: 'First', classification });
    await provider.write({ content: 'Second memory', title: 'Second', classification });

    expect(provider.size).toBe(1);
    expect(await provider.search('First')).toHaveLength(0);
    expect(await provider.search('Second')).toHaveLength(1);
  });
});

// ── IndexServerMemoryProvider ──────────────────────────────────────────────

describe('IndexServerMemoryProvider', () => {
  it('reports status as available', async () => {
    const provider = new IndexServerMemoryProvider();
    const status = await provider.status();
    expect(status).toMatchObject({ id: 'indexserver', name: 'IndexServer', available: true });
  });

  it('stores and retrieves a governed POLICY memory', async () => {
    const provider = new IndexServerMemoryProvider();
    const req: CopilotMemoryProviderWriteRequest = {
      content: 'Always run tests before merging to the main branch.',
      title: 'Test-before-merge policy',
      classification: {
        class: 'POLICY',
        allowed: true,
        reason: 'Content is allowed for governed local memory',
        destination: 'policy-inbox',
        loadGuidance: 'ALWAYS',
      },
    };
    const result = await provider.write(req);
    expect(result.id).toMatch(/^indexserver-/);
    expect(result.path).toContain('indexserver:policy:');

    const hits = await provider.search('run tests before merging');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(result.id);
    expect(hits[0]?.title).toBe('Test-before-merge policy');
    expect(hits[0]).toMatchObject({ class: 'POLICY', loadGuidance: 'ALWAYS' });
  });

  it('stores a DECISION memory under its topic', async () => {
    const provider = new IndexServerMemoryProvider();
    const req: CopilotMemoryProviderWriteRequest = {
      content: 'Use semantic versioning for all SDK packages.',
      title: 'SDK versioning decision',
      metadata: { topic: 'versioning' },
      classification: {
        class: 'DECISION',
        allowed: true,
        reason: 'Content is allowed for governed local memory',
        destination: 'decision-inbox',
        loadGuidance: 'ALWAYS',
      },
    };
    const result = await provider.write(req);
    expect(result.path).toContain('indexserver:versioning:');

    const hits = await provider.search('semantic versioning');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.path).toContain('versioning');
  });

  it('deletes a catalog entry and confirms it is gone', async () => {
    const provider = new IndexServerMemoryProvider();
    const req: CopilotMemoryProviderWriteRequest = {
      content: 'Ephemeral catalog entry for delete test.',
      title: 'Ephemeral entry',
      classification: {
        class: 'LOCAL',
        allowed: true,
        reason: 'Content is allowed for governed local memory',
        destination: 'local',
        loadGuidance: 'ON-DEMAND',
      },
    };
    const result = await provider.write(req);
    expect(provider.size).toBe(1);

    const deleted = await provider.delete(result.id);
    expect(deleted).toBe(true);
    expect(provider.size).toBe(0);

    const hits = await provider.search('Ephemeral');
    expect(hits).toHaveLength(0);
  });

  it('returns empty results for unmatched search query', async () => {
    const provider = new IndexServerMemoryProvider();
    const hits = await provider.search('nonexistent-query-xyz');
    expect(hits).toHaveLength(0);
  });
});

// ── LocalMemoryStore routing through registered providers ─────────────────

describe('LocalMemoryStore with registered providers', () => {
  it('routes a LOCAL write to MemPalace and IndexServer providers', async () => {
    const root = testRoot('mp-is-write');
    const memPalace = new MemPalaceMemoryProvider();
    const indexServer = new IndexServerMemoryProvider();
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [memPalace, indexServer],
    });

    const result = await store.write({
      content: 'Use governed memory providers to reduce context pressure.',
      title: 'Memory provider note',
      author: 'data',
      requestedClass: 'LOCAL',
    });

    expect(result.stored).toBe(true);
    // Local store wrote the file (path is .squad-relative, join with root to resolve)
    expect(result.path).toContain('.squad');
    expect(fs.existsSync(path.join(root, result.path!))).toBe(true);

    // Both providers received the write
    expect(memPalace.size).toBe(1);
    expect(indexServer.size).toBe(1);
  });

  it('routes a POLICY write to both providers', async () => {
    const root = testRoot('mp-is-policy');
    const memPalace = new MemPalaceMemoryProvider();
    const indexServer = new IndexServerMemoryProvider();
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [memPalace, indexServer],
    });

    await store.write({
      content: 'Always use semantic versioning for release tags.',
      title: 'Semantic versioning policy',
      author: 'picard',
      requestedClass: 'POLICY',
    });

    expect(memPalace.size).toBe(1);
    expect(indexServer.size).toBe(1);
  });

  it('includes provider search results alongside local results', async () => {
    const root = testRoot('mp-is-search');
    const memPalace = new MemPalaceMemoryProvider();
    const indexServer = new IndexServerMemoryProvider();
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [memPalace, indexServer],
    });

    await store.write({
      content: 'Use pull request templates for consistent review checklists.',
      title: 'PR template rule',
      author: 'data',
      requestedClass: 'LOCAL',
    });

    const results = await store.search('pull request templates');
    expect(results.some(result => result.provider === 'local')).toBe(true);
    expect(results.some(result => result.provider === 'mempalace')).toBe(true);
    expect(results.some(result => result.provider === 'indexserver')).toBe(true);
  });

  it('rejects FORBIDDEN content BEFORE any provider receives the write', async () => {
    const root = testRoot('mp-is-forbidden');
    let memPalaceWriteCalls = 0;
    let indexServerWriteCalls = 0;

    const memPalace = new MemPalaceMemoryProvider();
    const indexServer = new IndexServerMemoryProvider();

    // Spy: wrap write to count calls
    const origMpWrite = memPalace.write.bind(memPalace);
    (memPalace as unknown as Record<string, unknown>)['write'] = async (req: CopilotMemoryProviderWriteRequest) => {
      memPalaceWriteCalls++;
      return origMpWrite(req);
    };
    const origIsWrite = indexServer.write.bind(indexServer);
    (indexServer as unknown as Record<string, unknown>)['write'] = async (req: CopilotMemoryProviderWriteRequest) => {
      indexServerWriteCalls++;
      return origIsWrite(req);
    };

    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [memPalace, indexServer],
    });

    const result = await store.write({
      content: 'password=never-send-to-provider',
      title: 'Forbidden write',
      author: 'worf',
    });

    expect(result.stored).toBe(false);
    expect(result.classification.class).toBe('FORBIDDEN');
    expect(memPalaceWriteCalls).toBe(0);
    expect(indexServerWriteCalls).toBe(0);

    const audit = await store.auditLog();
    expect(JSON.stringify(audit)).not.toContain('never-send-to-provider');
  });

  it('rejects TRANSIENT content BEFORE any provider receives the write', async () => {
    const root = testRoot('mp-is-transient');
    const memPalace = new MemPalaceMemoryProvider();
    const indexServer = new IndexServerMemoryProvider();
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [memPalace, indexServer],
    });

    // Explicitly request TRANSIENT class with safe content (auto-detected TRANSIENT
    // content also matches FORBIDDEN patterns, so use requestedClass to isolate).
    const result = await store.write({
      content: 'Working notes for today that should not be persisted.',
      title: 'Ephemeral working note',
      author: 'ralph',
      requestedClass: 'TRANSIENT',
    });

    expect(result.stored).toBe(false);
    expect(result.classification.class).toBe('TRANSIENT');
    expect(memPalace.size).toBe(0);
    expect(indexServer.size).toBe(0);
  });

  it('COPILOT_MEMORY writes still reject without real host client regardless of registered providers', async () => {
    const root = testRoot('mp-is-copilot-closed');
    const memPalace = new MemPalaceMemoryProvider();
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [memPalace],
    });

    const result = await store.write({
      content: 'Copilot Memory should remember this stable convention.',
      title: 'Semantic candidate',
      author: 'scribe',
      requestedClass: 'COPILOT_MEMORY',
      approved: true,
    });

    // Even with a registered provider, COPILOT_MEMORY is disabled by default
    expect(result.stored).toBe(false);
    expect(result.classification.reason).toContain('disabled');
    // MemPalace did NOT receive the write
    expect(memPalace.size).toBe(0);
  });

  it('provider=copilot still fails closed regardless of registered providers', async () => {
    const root = testRoot('mp-is-copilot-reserved');
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [new MemPalaceMemoryProvider(), new IndexServerMemoryProvider()],
    });

    await expect(
      store.configureCopilotProvider({ enabled: true, defaultProvider: 'copilot' }),
    ).rejects.toThrow('Real Copilot Memory API unavailable');
  });

  it('providerStatus includes registered provider statuses', async () => {
    const root = testRoot('mp-is-provider-status');
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [new MemPalaceMemoryProvider(), new IndexServerMemoryProvider()],
    });

    const status = await store.providerStatus();
    expect(status.registeredProviders).toHaveLength(2);
    expect(status.registeredProviders[0]).toMatchObject({ id: 'mempalace', name: 'MemPalace', available: true });
    expect(status.registeredProviders[1]).toMatchObject({ id: 'indexserver', name: 'IndexServer', available: true });
    // Core fields still present
    expect(status.defaultProvider).toBe('local');
    expect(status.realCopilotMemory.available).toBe(false);
  });

  it('does not include raw content or raw query in audit records when providers are registered', async () => {
    const root = testRoot('mp-is-audit-safe');
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [new MemPalaceMemoryProvider(), new IndexServerMemoryProvider()],
    });

    await store.write({
      content: 'Use governed memory to reduce context pressure and improve precision.',
      title: 'Governance note',
      author: 'data',
      requestedClass: 'LOCAL',
    });

    await store.search('context pressure');

    const audit = await store.auditLog();
    const auditJson = JSON.stringify(audit);
    // Safe metadata is recorded; raw content is not
    expect(auditJson).not.toContain('Use governed memory to reduce context pressure');
    expect(auditJson).not.toContain('context pressure');
    // Actions are recorded
    expect(audit.map(r => r.action)).toContain('write');
    expect(audit.map(r => r.action)).toContain('search');
  });

  it('records safe provider failures without raw provider error text', async () => {
    const root = testRoot('mp-is-provider-error');
    const provider: MemoryProvider = {
      id: 'failing-provider',
      name: 'FailingProvider',
      supportedClasses: ['LOCAL'],
      async status(): Promise<MemoryProviderStatus> {
        return { id: 'failing-provider', name: 'FailingProvider', available: true };
      },
      async write(): Promise<{ id: string }> {
        throw new Error('raw failure includes context pressure and secret-like text');
      },
      async search(): Promise<MemoryProviderSearchResult[]> {
        throw new Error('raw search query context pressure leaked');
      },
      async delete(): Promise<boolean> {
        return false;
      },
    };
    const store = new LocalMemoryStore(new FSStorageProvider(), root, {
      registeredProviders: [provider],
    });

    await store.write({
      content: 'Use governed memory to reduce context pressure.',
      title: 'Provider failure note',
      author: 'data',
      requestedClass: 'LOCAL',
    });
    await store.search('context pressure');

    const auditJson = JSON.stringify(await store.auditLog());
    expect(auditJson).toContain('provider-error');
    expect(auditJson).toContain('FailingProvider provider write failed (Error); raw provider error text omitted');
    expect(auditJson).toContain('FailingProvider provider search failed (Error); raw provider error text omitted');
    expect(auditJson).not.toContain('raw failure includes');
    expect(auditJson).not.toContain('raw search query');
  });

  it('rotates audit logs when configured size is exceeded', async () => {
    const root = testRoot('mp-is-audit-rotate');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    await store.configureHostInjectedCopilotAdapter({
      enabled: false,
      actor: 'test',
    });
    const configPath = path.join(root, '.squad', 'memory', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      policy: { auditMaxBytes: number; auditMaxArchives: number };
    };
    config.policy.auditMaxBytes = 1;
    config.policy.auditMaxArchives = 1;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    await store.write({
      content: 'Use bounded audit logs for long-running projects.',
      title: 'Audit rotation note',
      requestedClass: 'LOCAL',
    });

    expect(fs.existsSync(path.join(root, '.squad', 'memory', 'audit.1.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.squad', 'memory', 'audit.jsonl'))).toBe(true);
  });

  it('blocks unsafe indexed paths during local search', async () => {
    const root = testRoot('mp-is-path-safety');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    await store.write({
      content: 'Safe memory entry.',
      title: 'Safe memory',
      requestedClass: 'LOCAL',
    });
    const indexPath = path.join(root, '.squad', 'memory', 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as Array<Record<string, string>>;
    index[0]!.path = '../outside.md';
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

    await expect(store.search('Safe')).rejects.toThrow('Unsafe memory path blocked');
  });
});

// ── Regression tests for critical/medium PR comment fixes ─────────────────

describe('LocalMemoryStore — concurrent writes and index integrity', () => {
  it('two concurrent writes produce two index entries (no lost update)', async () => {
    const root = testRoot('concurrent-writes');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    // Fire both writes simultaneously and await together.
    const [r1, r2] = await Promise.all([
      store.write({ content: 'First concurrent memory.', title: 'First', requestedClass: 'LOCAL' }),
      store.write({ content: 'Second concurrent memory.', title: 'Second', requestedClass: 'LOCAL' }),
    ]);

    expect(r1.stored).toBe(true);
    expect(r2.stored).toBe(true);
    expect(r1.id).not.toBe(r2.id);

    // Both entries must survive in the persisted index.
    const indexPath = path.join(root, '.squad', 'memory', 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as Array<{ id: string; status: string }>;
    const activeIds = index.filter(e => e.status === 'active').map(e => e.id);
    expect(activeIds).toContain(r1.id!);
    expect(activeIds).toContain(r2.id!);
  });

  it('many concurrent writes all survive in the index', async () => {
    const root = testRoot('concurrent-writes-many');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        store.write({ content: `Memory number ${i}.`, title: `Entry ${i}`, requestedClass: 'LOCAL' }),
      ),
    );

    expect(results.every(r => r.stored)).toBe(true);
    const ids = new Set(results.map(r => r.id));
    expect(ids.size).toBe(N);

    const indexPath = path.join(root, '.squad', 'memory', 'index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as Array<{ id: string; status: string }>;
    const activeIds = new Set(index.filter(e => e.status === 'active').map(e => e.id));
    for (const id of ids) {
      expect(activeIds.has(id!)).toBe(true);
    }
  });
});

describe('LocalMemoryStore — corrupted index.json handling', () => {
  it('throws a descriptive error when index.json contains invalid JSON', async () => {
    const root = testRoot('corrupt-index-json');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    // Initialize by writing a valid memory first.
    await store.write({ content: 'Baseline memory.', title: 'Baseline', requestedClass: 'LOCAL' });

    // Corrupt the index.
    const indexPath = path.join(root, '.squad', 'memory', 'index.json');
    fs.writeFileSync(indexPath, '{ this is: not valid JSON }');

    // A subsequent write must throw, not silently reset to empty.
    await expect(
      store.write({ content: 'After corruption.', title: 'After', requestedClass: 'LOCAL' }),
    ).rejects.toThrow(/Memory index is corrupt/);
  });

  it('preserves a backup of the corrupt index file when it throws', async () => {
    const root = testRoot('corrupt-index-backup');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    await store.write({ content: 'Baseline memory.', title: 'Baseline', requestedClass: 'LOCAL' });

    const indexPath = path.join(root, '.squad', 'memory', 'index.json');
    const corruptContent = '{ this is: not valid JSON }';
    fs.writeFileSync(indexPath, corruptContent);

    await expect(store.write({ content: 'x', title: 'x', requestedClass: 'LOCAL' })).rejects.toThrow();

    // Backup must exist alongside the index with the original corrupt content.
    const backupPath = `${indexPath}.corrupt`;
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf8')).toBe(corruptContent);
  });

  it('throws when index.json root is not an array', async () => {
    const root = testRoot('corrupt-index-not-array');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    await store.write({ content: 'Baseline memory.', title: 'Baseline', requestedClass: 'LOCAL' });

    const indexPath = path.join(root, '.squad', 'memory', 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ entries: [] }));

    await expect(
      store.write({ content: 'After corruption.', title: 'After', requestedClass: 'LOCAL' }),
    ).rejects.toThrow(/Memory index is corrupt/);
  });
});

describe('LocalMemoryStore — delete tombstone ordering', () => {
  it('tombstone is written before source file is deleted', async () => {
    const root = testRoot('delete-tombstone-order');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    const { id, path: entryPath } = await store.write({
      content: 'Memory to be deleted.',
      title: 'To delete',
      requestedClass: 'LOCAL',
    });

    // Intercept: record which files exist the moment delete() is called
    // (we cannot easily hook into the middle of delete, so instead we verify
    // the tombstone exists AFTER a successful delete and that the audit records
    // "Deleted governed memory and wrote tombstone").
    const deleted = await store.delete(id!);
    expect(deleted).toBe(true);

    const tombstonePath = path.join(root, '.squad', 'memory', 'tombstones', `${id}.json`);
    expect(fs.existsSync(tombstonePath)).toBe(true);

    const tombstone = JSON.parse(fs.readFileSync(tombstonePath, 'utf8')) as {
      id: string; previousStatus: string; path: string;
    };
    expect(tombstone.id).toBe(id);
    expect(tombstone.previousStatus).toBe('active');
    expect(tombstone.path).toBe(entryPath);

    // Source file must no longer exist.
    const sourcePath = path.join(root, entryPath!);
    expect(fs.existsSync(sourcePath)).toBe(false);

    // Audit must contain the delete record.
    const audit = await store.auditLog();
    expect(audit.some(r => r.action === 'delete' && r.id === id)).toBe(true);
  });

  it('tombstone survives when source deletion fails (source may be already gone)', async () => {
    // Manually inject a storage provider that fails on delete() after tombstone
    // to simulate a crash between index update and source deletion.
    const root = testRoot('delete-tombstone-survives');
    let deleteCallCount = 0;
    const realProvider = new FSStorageProvider();

    // Proxy that lets the tombstone write pass but throws on the source delete.
    const faultingProvider = new Proxy(realProvider, {
      get(target, prop) {
        if (prop === 'delete') {
          return async (filePath: string) => {
            deleteCallCount++;
            // Fail on the first real source delete call.
            if (deleteCallCount === 1) throw new Error('Simulated source delete failure');
            return (target.delete as (p: string) => Promise<void>)(filePath);
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[prop];
      },
    }) as FSStorageProvider;

    const store = new LocalMemoryStore(faultingProvider, root);
    const { id } = await store.write({
      content: 'Memory subject to delete fault.',
      title: 'Delete fault test',
      requestedClass: 'LOCAL',
    });

    // Delete should propagate the storage error.
    await expect(store.delete(id!)).rejects.toThrow('Simulated source delete failure');

    // Tombstone must exist (written before the source delete).
    const tombstonePath = path.join(root, '.squad', 'memory', 'tombstones', `${id}.json`);
    expect(fs.existsSync(tombstonePath)).toBe(true);
  });
});
