import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FSStorageProvider } from '../packages/squad-sdk/src/storage/fs-storage-provider.js';
import {
  ensureMemoryGovernanceDefaults,
  LocalMemoryStore,
  type CopilotMemoryProviderClient,
  type CopilotMemoryProviderWriteRequest,
} from '../packages/squad-sdk/src/memory/index.js';
import { runMemoryCommand } from '../packages/squad-cli/src/cli/commands/memory.js';
import { ensureMemoryGovernanceUpgradeDefaults } from '../packages/squad-cli/src/cli/core/upgrade.js';

const roots: string[] = [];

function testRoot(prefix: string): string {
  const root = path.join(process.cwd(), `.test-${prefix}-${randomUUID()}`);
  roots.push(root);
  fs.mkdirSync(path.join(root, '.squad'), { recursive: true });
  return root;
}

function readMemoryIndex(root: string): Array<Record<string, unknown>> {
  return JSON.parse(fs.readFileSync(path.join(root, '.squad', 'memory', 'index.json'), 'utf8')) as Array<Record<string, unknown>>;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('memory governance defaults', () => {
  it('scaffolds local-only governance config idempotently without overwriting edits', async () => {
    const root = testRoot('memory-defaults');
    const storage = new FSStorageProvider();
    const first = await ensureMemoryGovernanceDefaults(storage, root);
    expect(first).toContain(path.join('.squad', 'memory', 'config.json'));

    const configPath = path.join(root, '.squad', 'memory', 'config.json');
    fs.writeFileSync(configPath, '{"version":1,"custom":true}\n');

    const second = await ensureMemoryGovernanceDefaults(storage, root);
    expect(second).toEqual([]);
    expect(fs.readFileSync(configPath, 'utf8')).toContain('"custom":true');
  });

  it('upgrade scaffolding is idempotent and non-overwriting', () => {
    const root = testRoot('memory-upgrade');
    const first = ensureMemoryGovernanceUpgradeDefaults(root);
    expect(first).toContain(path.join('.squad', 'memory', 'config.json'));

    const configPath = path.join(root, '.squad', 'memory', 'config.json');
    fs.writeFileSync(configPath, '{"version":1,"defaultProvider":"local","note":"keep"}\n');

    const second = ensureMemoryGovernanceUpgradeDefaults(root);
    expect(second).toEqual([]);
    expect(fs.readFileSync(configPath, 'utf8')).toContain('"note":"keep"');
  });
});

describe('LocalMemoryStore', () => {
  it('rejects forbidden memory and audits without persisting content', async () => {
    const root = testRoot('memory-forbidden');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const result = await store.write({
      content: 'password=super-secret-value',
      title: 'bad memory',
      author: 'worf',
    });

    expect(result.stored).toBe(false);
    expect(result.classification.class).toBe('FORBIDDEN');
    expect(fs.readdirSync(path.join(root, '.squad', 'memory', 'local'))).toHaveLength(0);
    const audit = await store.auditLog();
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('super-secret-value');
  });

  it('uses a safe placeholder title for no-title rejected sensitive writes', async () => {
    const root = testRoot('memory-no-title-reject');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const result = await store.write({
      content: 'token=never-leak-this-value',
      author: 'worf',
    });

    expect(result.stored).toBe(false);
    const audit = await store.auditLog();
    expect(audit[0]).toMatchObject({
      action: 'reject',
      title: 'Rejected governed memory',
    });
    expect(JSON.stringify(audit)).not.toContain('never-leak-this-value');
  });

  it('rejects private customer data before persistence', async () => {
    const root = testRoot('memory-customer-data');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const result = await store.write({
      content: 'Private customer data: Contoso tenant contact and support details.',
      title: 'customer case',
      author: 'worf',
    });

    expect(result.stored).toBe(false);
    expect(result.classification.class).toBe('FORBIDDEN');
    expect(result.classification.reason).toContain('private customer data');
    expect(fs.readdirSync(path.join(root, '.squad', 'memory', 'local'))).toHaveLength(0);
  });

  it('rejects unreviewed vulnerability notes before persistence', async () => {
    const root = testRoot('memory-unreviewed-vuln');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const result = await store.write({
      content: 'Unreviewed vulnerability in production authentication flow.',
      title: 'security note',
      author: 'worf',
    });

    expect(result.stored).toBe(false);
    expect(result.classification.class).toBe('FORBIDDEN');
    expect(result.classification.reason).toContain('unreviewed vulnerability');
    expect(fs.readdirSync(path.join(root, '.squad', 'memory', 'local'))).toHaveLength(0);
  });

  it('audits explicit classify calls without storing classified content', async () => {
    const root = testRoot('memory-classify-audit');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const classification = await store.classify(
      { content: 'Use local governed memory for stable facts.' },
      { audit: true, actor: 'seven' },
    );

    expect(classification.allowed).toBe(true);
    const audit = await store.auditLog();
    expect(audit).toHaveLength(1);
    expect(audit[0]?.action).toBe('classify');
    expect(JSON.stringify(audit)).not.toContain('stable facts');
  });

  it('assigns load-guidance tags for durable, on-demand, and rejected memory', async () => {
    const root = testRoot('memory-load-guidance');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    await expect(store.classify({ content: 'Always use the Squad memory governance provider.' }))
      .resolves.toMatchObject({ class: 'POLICY', loadGuidance: 'ALWAYS' });
    await expect(store.classify({ content: 'Remember this stable implementation note.' }))
      .resolves.toMatchObject({ class: 'LOCAL', loadGuidance: 'ON-DEMAND' });
    await expect(store.classify({ content: 'password=do-not-store' }))
      .resolves.toMatchObject({ class: 'FORBIDDEN', loadGuidance: 'NEVER' });

    const write = await store.write({
      content: 'Use load guidance metadata for selective memory loading.',
      title: 'Load guidance metadata',
      requestedClass: 'LOCAL',
      metadata: { loadGuidance: '[ALWAYS]' },
    });

    expect(write.classification.loadGuidance).toBe('ALWAYS');
    const index = readMemoryIndex(root);
    expect(index[0]).toMatchObject({ id: write.id, loadGuidance: 'ALWAYS' });
    expect(fs.readFileSync(path.join(root, write.path!), 'utf8')).toContain('loadGuidance: [ALWAYS]');
    await expect(store.search('selective memory loading')).resolves.toEqual([
      expect.objectContaining({ id: write.id, loadGuidance: 'ALWAYS' }),
    ]);
  });

  it('writes, searches, deletes, and audits governed local memory', async () => {
    const root = testRoot('memory-local');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const write = await store.write({
      content: 'Use Vitest for memory governance regression tests.',
      title: 'Memory tests',
      author: 'data',
      requestedClass: 'LOCAL',
    });

    expect(write.stored).toBe(true);
    expect(write.path).toContain(path.join('.squad', 'memory', 'local'));

    const results = await store.search('Vitest');
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe(write.id);

    const deleted = await store.delete(write.id!, 'data');
    expect(deleted).toBe(true);
    expect(await store.search('Vitest')).toEqual([]);

    const audit = await store.auditLog();
    expect(audit.map(r => r.action)).toEqual(['write', 'search', 'delete', 'search']);
    expect(fs.existsSync(path.join(root, '.squad', 'memory', 'tombstones', `${write.id}.json`))).toBe(true);
  });

  it('routes decisions to the decision inbox and supports promotion', async () => {
    const root = testRoot('memory-decision');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const local = await store.write({
      content: 'Use the local memory store as the default governance provider.',
      title: 'Local default',
      author: 'data',
      requestedClass: 'LOCAL',
    });
    const promoted = await store.promote(local.id!, 'DECISION', 'scribe');

    expect(promoted.stored).toBe(true);
    expect(promoted.path).toContain(path.join('.squad', 'decisions', 'inbox'));
    expect(fs.readdirSync(path.join(root, '.squad', 'decisions', 'inbox'))).toHaveLength(1);
  });

  it('links superseded entries forward while preserving archive tombstone metadata', async () => {
    const root = testRoot('memory-superseded-forward-link');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const local = await store.write({
      content: 'Use a queryable forward link when memory is promoted.',
      title: 'Forward link source',
      author: 'data',
      requestedClass: 'LOCAL',
    });
    const originalPath = local.path!;
    const promoted = await store.promote(local.id!, 'DECISION', 'scribe');

    expect(promoted.stored).toBe(true);
    const promotedSearch = await store.search('forward link');
    expect(promotedSearch).toEqual([
      expect.objectContaining({ id: promoted.id, class: 'DECISION', loadGuidance: 'ALWAYS' }),
    ]);

    let index = readMemoryIndex(root);
    expect(index.find(entry => entry.id === local.id)).toMatchObject({
      status: 'superseded',
      loadGuidance: 'ARCHIVE',
      supersededBy: promoted.id,
    });
    expect(index.find(entry => entry.id === promoted.id)).toMatchObject({
      status: 'active',
      supersedes: local.id,
    });
    expect(fs.readFileSync(path.join(root, originalPath), 'utf8')).toContain(`supersededBy: ${promoted.id}`);

    await expect(store.delete(local.id!, 'data')).resolves.toBe(true);
    index = readMemoryIndex(root);
    expect(index.find(entry => entry.id === local.id)).toMatchObject({
      status: 'deleted',
      loadGuidance: 'ARCHIVE',
      supersededBy: promoted.id,
    });
    const tombstone = JSON.parse(fs.readFileSync(path.join(root, '.squad', 'memory', 'tombstones', `${local.id}.json`), 'utf8'));
    expect(tombstone).toMatchObject({
      id: local.id,
      previousStatus: 'superseded',
      supersededBy: promoted.id,
      loadGuidance: '[ARCHIVE]',
    });
    expect(fs.existsSync(path.join(root, originalPath))).toBe(false);
  });

  it('preserves prompt-only fallback boundary by rejecting semantic provider writes by default', async () => {
    const root = testRoot('memory-semantic');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    const result = await store.write({
      content: 'Copilot Memory should remember this stable convention.',
      title: 'Semantic candidate',
      author: 'scribe',
      requestedClass: 'COPILOT_MEMORY',
      approved: true,
    });

    expect(result.stored).toBe(false);
    expect(result.classification.reason).toContain('disabled');
    expect(await store.search('Copilot Memory')).toEqual([]);
  });

  it('reports and configures hostInjectedCopilotAdapter selection explicitly', async () => {
    const root = testRoot('memory-provider-selection');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    expect(await store.providerStatus()).toMatchObject({
      defaultProvider: 'local',
      realCopilotMemory: {
        available: false,
        configured: false,
      },
      hostInjectedCopilotAdapter: {
        enabled: false,
        requireApproval: true,
        configured: false,
        clientAvailable: false,
      },
    });

    await store.configureHostInjectedCopilotAdapter({
      enabled: true,
      requireApproval: false,
      defaultProvider: 'hostInjectedCopilotAdapter',
      actor: 'data',
    });

    expect(await store.providerStatus()).toMatchObject({
      defaultProvider: 'hostInjectedCopilotAdapter',
      realCopilotMemory: {
        available: false,
        configured: false,
      },
      hostInjectedCopilotAdapter: {
        enabled: true,
        requireApproval: false,
        configured: true,
        clientAvailable: false,
      },
    });
  });

  it('fails closed when hostInjectedCopilotAdapter is configured without a host client', async () => {
    const root = testRoot('memory-provider-missing-client');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);
    await store.configureHostInjectedCopilotAdapter({ enabled: true, requireApproval: false });

    const result = await store.write({
      content: 'Semantic memory should be sent only through an available governed provider.',
      title: 'Missing client',
      requestedClass: 'COPILOT_MEMORY',
      approved: true,
    });

    expect(result.stored).toBe(false);
    expect(result.classification.reason).toContain('hostInjectedCopilotAdapter is enabled');
    expect(JSON.stringify(await store.auditLog())).not.toContain('Semantic memory should be sent');
  });

  it('rejects provider=copilot because no real Copilot Memory API exists locally', async () => {
    const root = testRoot('memory-provider-real-copilot-unavailable');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    await expect(store.configureCopilotProvider({
      enabled: true,
      defaultProvider: 'copilot',
    })).rejects.toThrow('Real Copilot Memory API unavailable');
  });

  it('recognizes manually configured provider=copilot but fails closed without invoking host client', async () => {
    const root = testRoot('memory-provider-real-copilot-configured');
    await ensureMemoryGovernanceDefaults(new FSStorageProvider(), root);
    const configPath = path.join(root, '.squad', 'memory', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...config, defaultProvider: 'copilot' }, null, 2) + '\n');

    let writeCalls = 0;
    let searchCalls = 0;
    const client: CopilotMemoryProviderClient = {
      async write() {
        writeCalls += 1;
        return { id: 'should-not-write' };
      },
      async search() {
        searchCalls += 1;
        return [{ id: 'should-not-search', title: 'Nope', snippet: 'Nope' }];
      },
      async delete() {
        return true;
      },
    };
    const store = new LocalMemoryStore(new FSStorageProvider(), root, { hostInjectedCopilotAdapterClient: client });

    await expect(store.providerStatus()).resolves.toMatchObject({
      defaultProvider: 'copilot',
      realCopilotMemory: {
        available: false,
        configured: true,
      },
    });

    const write = await store.write({
      content: 'Safe semantic memory that still needs a real Copilot provider.',
      title: 'Real provider candidate',
      author: 'data',
      requestedClass: 'COPILOT_MEMORY',
      approved: true,
    });
    expect(write.stored).toBe(false);
    expect(write.classification.reason).toContain('Real Copilot Memory API unavailable');

    await expect(store.search('safe semantic memory')).resolves.toEqual([]);
    expect(writeCalls).toBe(0);
    expect(searchCalls).toBe(0);
    const audit = await store.auditLog();
    expect(audit.map(r => r.action)).toEqual(['reject', 'reject']);
    expect(audit.every(r => r.provider === 'copilot')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('Safe semantic memory');
    expect(JSON.stringify(audit)).not.toContain('safe semantic memory');
  });

  it('rejects forbidden search before provider=copilot availability handling', async () => {
    const root = testRoot('memory-provider-real-copilot-forbidden-search');
    await ensureMemoryGovernanceDefaults(new FSStorageProvider(), root);
    const configPath = path.join(root, '.squad', 'memory', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    fs.writeFileSync(configPath, JSON.stringify({ ...config, defaultProvider: 'copilot' }, null, 2) + '\n');
    const store = new LocalMemoryStore(new FSStorageProvider(), root);

    await expect(store.search('password=never-send-provider-query')).resolves.toEqual([]);

    const audit = await store.auditLog();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'reject',
      class: 'FORBIDDEN',
      title: 'Rejected governed memory search',
    });
    expect(audit[0]?.reason).toContain('credential-like assignment');
    expect(audit[0]?.provider).toBeUndefined();
    expect(JSON.stringify(audit)).not.toContain('never-send-provider-query');
  });

  it('CLI rejects provider=copilot configuration while reporting status honestly', async () => {
    const root = testRoot('memory-provider-cli-real-copilot');

    await expect(runMemoryCommand(root, ['provider', '--provider', 'copilot']))
      .rejects.toThrow('Real Copilot Memory API unavailable');

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      output.push(String(value));
    };
    try {
      await runMemoryCommand(root, ['provider']);
    } finally {
      console.log = originalLog;
    }

    const status = JSON.parse(output[0] ?? '{}');
    expect(status).toMatchObject({
      defaultProvider: 'local',
      realCopilotMemory: {
        available: false,
        configured: false,
      },
      hostInjectedCopilotAdapter: {
        configured: false,
        clientAvailable: false,
      },
    });
  });

  it('writes, searches, deletes, tombstones, and audits through hostInjectedCopilotAdapter', async () => {
    const root = testRoot('memory-provider-host-client');
    const providerWrites: CopilotMemoryProviderWriteRequest[] = [];
    const providerSearches: string[] = [];
    const deletedIds: string[] = [];
    const client: CopilotMemoryProviderClient = {
      async write(request) {
        providerWrites.push(request);
        return { id: 'copilot-1', path: 'host-injected-copilot-adapter:copilot-1' };
      },
      async search(query) {
        providerSearches.push(query);
        return query.includes('semantic')
          ? [{ id: 'copilot-1', title: 'Provider memory', snippet: 'safe semantic result', path: 'host-injected-copilot-adapter:copilot-1' }]
          : [];
      },
      async delete(id) {
        deletedIds.push(id);
        return true;
      },
    };
    const store = new LocalMemoryStore(new FSStorageProvider(), root, { hostInjectedCopilotAdapterClient: client });
    await store.configureHostInjectedCopilotAdapter({ enabled: true, requireApproval: true });

    const write = await store.write({
      content: 'Safe semantic memory for provider-backed retrieval.',
      title: 'Provider memory',
      author: 'data',
      requestedClass: 'COPILOT_MEMORY',
      approved: true,
    });

    expect(write).toMatchObject({ stored: true, id: 'copilot-1', path: 'host-injected-copilot-adapter:copilot-1' });
    expect(providerWrites).toHaveLength(1);

    const results = await store.search('semantic');
    expect(results).toEqual([
      expect.objectContaining({ id: 'copilot-1', provider: 'hostInjectedCopilotAdapter', class: 'COPILOT_MEMORY' }),
    ]);
    expect(providerSearches).toEqual(['semantic']);

    await expect(store.delete('copilot-1', 'data')).resolves.toBe(true);
    expect(deletedIds).toEqual(['copilot-1']);
    expect(fs.existsSync(path.join(root, '.squad', 'memory', 'tombstones', 'copilot-1.json'))).toBe(true);
    const audit = await store.auditLog();
    expect(audit.map(r => r.action)).toEqual(['configure', 'write', 'search', 'delete']);
    expect(JSON.stringify(audit)).not.toContain('Safe semantic memory');
  });

  it('rejects forbidden search queries before invoking hostInjectedCopilotAdapter', async () => {
    const root = testRoot('memory-provider-search-reject-first');
    let searchCalls = 0;
    const client: CopilotMemoryProviderClient = {
      async write() {
        return { id: 'unused' };
      },
      async search() {
        searchCalls += 1;
        return [{ id: 'unused', title: 'Should not happen', snippet: 'Should not happen' }];
      },
      async delete() {
        return true;
      },
    };
    const store = new LocalMemoryStore(new FSStorageProvider(), root, { hostInjectedCopilotAdapterClient: client });
    await store.configureHostInjectedCopilotAdapter({ enabled: true, requireApproval: false });

    const results = await store.search('password=never-send-this-search-query');

    expect(results).toEqual([]);
    expect(searchCalls).toBe(0);
    const audit = await store.auditLog();
    expect(audit.map(r => r.action)).toEqual(['configure', 'reject']);
    expect(audit[1]).toMatchObject({
      action: 'reject',
      class: 'FORBIDDEN',
      title: 'Rejected governed memory search',
    });
    expect(JSON.stringify(audit)).not.toContain('never-send-this-search-query');
  });

  it('rejects forbidden memory before invoking hostInjectedCopilotAdapter', async () => {
    const root = testRoot('memory-provider-reject-first');
    let calls = 0;
    const client: CopilotMemoryProviderClient = {
      async write() {
        calls += 1;
        return { id: 'should-not-happen' };
      },
      async search() {
        return [];
      },
      async delete() {
        return true;
      },
    };
    const store = new LocalMemoryStore(new FSStorageProvider(), root, { hostInjectedCopilotAdapterClient: client });
    await store.configureHostInjectedCopilotAdapter({ enabled: true, requireApproval: false });

    const result = await store.write({
      content: 'token=never-send-this-to-provider',
      title: 'Forbidden external',
      requestedClass: 'COPILOT_MEMORY',
      approved: true,
    });

    expect(result.stored).toBe(false);
    expect(result.classification.class).toBe('FORBIDDEN');
    expect(calls).toBe(0);
    expect(JSON.stringify(await store.auditLog())).not.toContain('never-send-this-to-provider');
  });
});
