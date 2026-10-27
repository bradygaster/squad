// Regression tests: governed memory class names are case-insensitive.
// The coordinator template used to tell agents to call memory.write with
// class `decision`. squad_state's MCP bridge does not enforce the tool
// schema's enum, so the lowercase value reached LocalMemoryStore, missed every
// exact-match gate, and was filed in memory/local instead of decisions/inbox.
// These tests drive the real ToolRegistry handlers through an MCP Server and
// Client the same way `squad state-mcp` does.
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { clearResolveSquadCache, resolveSquadState } from '../packages/squad-sdk/src/resolution.js';
import { ToolRegistry } from '../packages/squad-sdk/src/tools/index.js';
import { FSStorageProvider } from '../packages/squad-sdk/src/storage/fs-storage-provider.js';
import { LocalMemoryStore, parseMemoryClass, type MemoryProvider } from '../packages/squad-sdk/src/memory/index.js';

const VALID = 'Use one of: TRANSIENT, LOCAL, DECISION, POLICY, COPILOT_MEMORY, FORBIDDEN.';
const tempRoots: string[] = [];

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-memory-class-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, '.squad'), { recursive: true });
  fs.writeFileSync(path.join(root, '.squad', 'config.json'), JSON.stringify({ stateBackend: 'local' }, null, 2));
  return root;
}

function normalizeToolResult(result: unknown) {
  const record = (result ?? {}) as Record<string, unknown>;
  return {
    content: [{ type: 'text' as const, text: String(record['textResultForLlm'] ?? JSON.stringify(result)) }],
    isError: record['resultType'] === 'failure' || record['resultType'] === 'denied' || record['resultType'] === 'rejected',
  };
}

async function connect(projectDir: string) {
  clearResolveSquadCache();
  const context = resolveSquadState(projectDir)!;
  const registry = new ToolRegistry(context.paths.teamSquadDir, undefined, context.storage, undefined, undefined, undefined, {
    backendName: context.backend.name, upstreamDir: context.paths.projectDir, runtimeVersion: 'test',
  });
  const tools = new Map(registry.getTools().map(tool => [tool.name, tool]));
  const server = new Server({ name: 'squad-state', version: 'test' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [] }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = tools.get(request.params.name)!;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return normalizeToolResult(await tool.handler(args as never, { toolName: request.params.name, toolCallId: 't', arguments: args, sessionId: 'mcp' } as never));
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'memory-class-test', version: '0.0.0' });
  await client.connect(clientTransport);
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }>; isError?: boolean };
    return { text: res.content[0]?.text ?? '', isError: res.isError === true };
  };
  const squadDir = context.paths.teamSquadDir;
  const ls = (...p: string[]) => (fs.existsSync(path.join(squadDir, ...p)) ? fs.readdirSync(path.join(squadDir, ...p)) : []);
  const index = () => JSON.parse(fs.readFileSync(path.join(squadDir, 'memory', 'index.json'), 'utf8')) as Array<Record<string, unknown>>;
  return { call, squadDir, ls, index, close: () => client.close() };
}

afterAll(() => {
  clearResolveSquadCache();
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
});

describe('governed memory class names are case-insensitive', () => {
  it.each(['DECISION', 'decision', 'Decision', ' decision '])('memory.write class %j lands in decisions/inbox', async cls => {
    const mcp = await connect(makeProject());
    try {
      const res = await mcp.call('memory.write', { content: 'We decided to use Vitest.', title: 'Use Vitest', author: 'dallas', class: cls });
      expect(res.isError).toBe(false);
      expect(res.text).toMatch(/^Stored DECISION memory .* at \.squad[\\/]decisions[\\/]inbox[\\/]dallas-use-vitest-/);
      expect(mcp.ls('decisions', 'inbox')).toHaveLength(1);
      expect(mcp.ls('memory', 'local')).toHaveLength(0);
      expect(mcp.index()[0]).toMatchObject({ class: 'DECISION', loadGuidance: 'ALWAYS' });
      expect((await mcp.call('squad_state_list', { dir: 'decisions/inbox' })).text).toMatch(/dallas-use-vitest-.*\.md/);
    } finally {
      await mcp.close();
    }
  });

  it.each(['decisions', 'foo'])('memory.write rejects unknown class %j and stores nothing', async cls => {
    const mcp = await connect(makeProject());
    try {
      const res = await mcp.call('memory.write', { content: 'We decided to use Vitest.', class: cls });
      expect(res).toEqual({ isError: true, text: `Unknown memory class ${JSON.stringify(cls)}. ${VALID}` });
      expect(mcp.ls('decisions', 'inbox')).toHaveLength(0);
      expect(mcp.ls('memory', 'local')).toHaveLength(0);
    } finally {
      await mcp.close();
    }
  });

  it('memory.write still rejects and audits secrets when the class name is unknown', async () => {
    const mcp = await connect(makeProject());
    try {
      const res = await mcp.call('memory.write', { content: 'token=abc123456789012345', class: 'decisions' });
      expect(res.isError).toBe(true);
      expect(res.text).toMatch(/^Rejected FORBIDDEN memory/);
      const audit = fs.readFileSync(path.join(mcp.squadDir, 'memory', 'audit.jsonl'), 'utf8');
      expect(audit).toContain('"class":"FORBIDDEN"');
      expect(audit).not.toContain('abc123456789012345');
    } finally {
      await mcp.close();
    }
  });

  it('lowercase gated classes now hit their gates', async () => {
    const mcp = await connect(makeProject());
    try {
      const content = 'Team prefers small pull requests.';
      expect(await mcp.call('memory.write', { content, class: 'forbidden' }))
        .toEqual({ isError: true, text: 'Rejected FORBIDDEN memory: Requested class is forbidden' });
      expect(await mcp.call('memory.write', { content, class: 'transient' }))
        .toEqual({ isError: true, text: 'Rejected TRANSIENT memory: Transient task state is not persisted as durable memory' });
      const copilot = await mcp.call('memory.write', { content, class: 'copilot_memory' });
      expect(copilot.isError).toBe(true);
      expect(copilot.text).toMatch(/^Rejected COPILOT_MEMORY memory: COPILOT_MEMORY writes are disabled/);
      // The content scan is unchanged and still wins for a valid lowercase class.
      expect(await mcp.call('memory.write', { content: 'password: hunter2', class: 'local' }))
        .toEqual({ isError: true, text: 'Rejected FORBIDDEN memory: Rejected as forbidden memory: credential-like assignment' });
      expect(mcp.ls('memory', 'local')).toHaveLength(0);
    } finally {
      await mcp.close();
    }
  });

  it('blank class still means "auto-classify"', async () => {
    const mcp = await connect(makeProject());
    try {
      expect((await mcp.call('memory.write', { content: 'We decided to use Vitest.', class: '' })).text).toMatch(/^Stored DECISION memory/);
      expect((await mcp.call('memory.write', { content: 'Prefer small modules.', class: '   ' })).text).toMatch(/^Stored LOCAL memory/);
    } finally {
      await mcp.close();
    }
  });

  it('memory.classify and memory.promote normalize too', async () => {
    const mcp = await connect(makeProject());
    try {
      expect(await mcp.call('memory.classify', { content: 'We decided to use Vitest.', class: 'decision' }))
        .toEqual({ isError: false, text: 'DECISION: Content is allowed for governed local memory' });
      const seed = await mcp.call('memory.write', { content: 'Prefer Vitest.', title: 'Seed', class: 'local' });
      const id = /memory ([0-9a-f-]{36})/.exec(seed.text)![1]!;
      const promote = await mcp.call('memory.promote', { id, targetClass: 'decision' });
      expect(promote.text).toMatch(new RegExp(`^Promoted memory ${id} to DECISION as `));
      expect(mcp.ls('decisions', 'inbox')).toHaveLength(1);
      expect(await mcp.call('memory.promote', { id, targetClass: 'bogus' }))
        .toEqual({ isError: true, text: `Unknown memory class "bogus". ${VALID}` });
      expect((await mcp.call('memory.promote', { id })).text).toMatch(/^memory.promote needs targetClass/);
      expect(await mcp.call('memory.promote', { id, targetClass: 'forbidden' }))
        .toEqual({ isError: true, text: 'memory.promote targetClass must be LOCAL, DECISION, POLICY or COPILOT_MEMORY.' });
      expect(await mcp.call('memory.promote', { id, targetClass: 'transient' }))
        .toEqual({ isError: true, text: 'memory.promote targetClass must be LOCAL, DECISION, POLICY or COPILOT_MEMORY.' });
    } finally {
      await mcp.close();
    }
  });

  it('LocalMemoryStore normalizes for direct SDK callers and throws on unknown classes', async () => {
    const root = makeProject();
    const replicated: string[] = [];
    const provider: MemoryProvider = {
      id: 'spy', name: 'Spy', supportedClasses: ['DECISION'],
      status: async () => ({ id: 'spy', name: 'Spy', available: true }),
      write: async request => { replicated.push(request.classification.class); return { id: 'spy-1' }; },
      search: async () => [],
    } as MemoryProvider;
    const store = new LocalMemoryStore(new FSStorageProvider(), root, { registeredProviders: [provider] });
    const ok = await store.write({ content: 'We decided to use Vitest.', title: 'Direct', requestedClass: 'decision' as never });
    expect(ok.path).toMatch(/decisions[\\/]inbox/);
    expect(replicated).toEqual(['DECISION']);
    await expect(store.write({ content: 'Prefer Vitest.', requestedClass: 'bogus' as never }))
      .rejects.toThrow(`Unknown memory class "bogus". ${VALID}`);
    // Forbidden content is rejected (and audited) before the class is even read.
    await expect(store.write({ content: 'token=abc123456789012345', requestedClass: 'bogus' as never }))
      .resolves.toMatchObject({ stored: false, classification: { class: 'FORBIDDEN' } });
    expect(parseMemoryClass(undefined)).toBeUndefined();
    expect(parseMemoryClass('  ')).toBeUndefined();
    expect(parseMemoryClass('Copilot_Memory')).toBe('COPILOT_MEMORY');
  });
});
