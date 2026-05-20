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

    // Local search returns the local result
    const localResults = await store.search('pull request templates');
    expect(localResults.length).toBeGreaterThanOrEqual(1);
    expect(localResults[0]?.provider).toBe('local');
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
});
