/**
 * Tests for Agent Lifecycle (M1-7) and History Shadows (M1-11)
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  AgentLifecycleManager,
  type AgentHandle,
  type SpawnAgentOptions,
  createHistoryShadow,
  appendToHistory,
  readHistory,
  shadowExists,
  deleteHistoryShadow,
} from '@bradygaster/squad-sdk/agents';
import { SquadClientWithPool } from '@bradygaster/squad-sdk/client';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';
import { MODELS } from '@bradygaster/squad-sdk';

describe('Agent Lifecycle Manager', () => {
  let tempDir: string;
  let teamRoot: string;
  let mockClient: SquadClientWithPool;
  let lifecycleManager: AgentLifecycleManager;

  beforeEach(async () => {
    // Create temporary team root
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'squad-lifecycle-test-'));
    teamRoot = tempDir;

    // Create team structure
    const agentsDir = path.join(teamRoot, '.ai-team', 'agents', 'test-agent');
    await fs.mkdir(agentsDir, { recursive: true });

    // Create a mock charter.md
    const charterContent = `# Test Agent Charter

## Identity

**Name:** Test Agent
**Role:** Test Role
**Expertise:** Testing, Validation
**Style:** Systematic

## What I Own

Test ownership areas.

## Model

**Preferred:** claude-haiku-4.5

## Collaboration

Test collaboration patterns.
`;

    await fs.writeFile(
      path.join(agentsDir, 'charter.md'),
      charterContent,
      'utf-8'
    );

    // Create mock client
    mockClient = createMockClient();

    // Create lifecycle manager
    lifecycleManager = new AgentLifecycleManager({
      client: mockClient,
      teamRoot,
      defaultIdleTimeout: 60_000, // 1 minute for tests
    });
  });

  afterEach(async () => {
    // Cleanup
    await lifecycleManager.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should spawn agent with full pipeline', async () => {
    const options: SpawnAgentOptions = {
      agentName: 'test-agent',
      task: 'Test task',
      taskType: 'code',
      teamContext: 'Test team context',
    };

    const handle = await lifecycleManager.spawnAgent(options);

    expect(handle).toBeTruthy();
    expect(handle.agentName).toBe('test-agent');
    expect(handle.status).toBe('active');
    expect(handle.sessionId).toBeTruthy();
    expect(handle.model).toBeTruthy();
    expect(handle.createdAt).toBeInstanceOf(Date);
  });

  it('should list active agents', async () => {
    await lifecycleManager.spawnAgent({
      agentName: 'test-agent',
      task: 'Test task',
    });

    const active = lifecycleManager.listActive();

    expect(Array.isArray(active)).toBe(true);
    expect(active.length).toBe(1);
    expect(active[0].agentName).toBe('test-agent');
  });

  it('should get agent by session ID', async () => {
    await lifecycleManager.spawnAgent({
      agentName: 'test-agent',
      task: 'Test task',
    });

    const active = lifecycleManager.listActive();
    const sessionId = active[0].sessionId;

    const agent = lifecycleManager.getAgent(sessionId);

    expect(agent).toBeTruthy();
    expect(agent?.sessionId).toBe(sessionId);
  });

  it('should send message to agent', async () => {
    await lifecycleManager.spawnAgent({
      agentName: 'test-agent',
      task: 'Test task',
    });

    const active = lifecycleManager.listActive();
    const handle = active[0];

    await handle.sendMessage('Another task');

    expect(handle.status).toBe('active');
  });

  it('should destroy agent gracefully', async () => {
    await lifecycleManager.spawnAgent({
      agentName: 'test-agent',
      task: 'Test task',
    });

    const active = lifecycleManager.listActive();
    const handle = active[0];

    await lifecycleManager.destroyAgent(handle);

    expect(handle.status).toBe('destroyed');

    const activeAfter = lifecycleManager.listActive();
    expect(activeAfter.length).toBe(0);
  });

  it('should throw on missing charter', async () => {
    const options: SpawnAgentOptions = {
      agentName: 'nonexistent-agent',
      task: 'Test task',
    };

    await expect(lifecycleManager.spawnAgent(options)).rejects.toThrow(/Charter not found/);
  });

  it('should apply model override', async () => {
    const options: SpawnAgentOptions = {
      agentName: 'test-agent',
      task: 'Test task',
      modelOverride: 'claude-opus-4.5',
    };

    const handle = await lifecycleManager.spawnAgent(options);

    expect(handle.model).toBe('claude-opus-4.5');

    await lifecycleManager.destroyAgent(handle);
  });

  it('should shutdown all agents', async () => {
    // Spawn multiple agents
    await lifecycleManager.spawnAgent({
      agentName: 'test-agent',
      task: 'Task 1',
    });

    await lifecycleManager.spawnAgent({
      agentName: 'test-agent',
      task: 'Task 2',
    });

    const beforeShutdown = lifecycleManager.listActive();
    expect(beforeShutdown.length).toBe(2);

    await lifecycleManager.shutdown();

    const afterShutdown = lifecycleManager.listActive();
    expect(afterShutdown.length).toBe(0);
  });
});

describe('History Shadows', () => {
  let tempDir: string;
  let teamRoot: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'squad-history-test-'));
    teamRoot = tempDir;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should create history shadow', async () => {
    const shadowPath = await createHistoryShadow(
      teamRoot,
      'test-agent',
      'Initial test context'
    );

    expect(shadowPath).toBeTruthy();
    expect(shadowPath).toContain('test-agent');

    const exists = await shadowExists(teamRoot, 'test-agent');
    expect(exists).toBe(true);

    const content = await fs.readFile(shadowPath, 'utf-8');
    expect(content).toContain('Initial test context');
    expect(content).toContain('## Context');
    expect(content).toContain('## Learnings');
  });

  it('should not overwrite existing shadow', async () => {
    const firstPath = await createHistoryShadow(
      teamRoot,
      'test-agent',
      'First context'
    );

    const secondPath = await createHistoryShadow(
      teamRoot,
      'test-agent',
      'Second context'
    );

    expect(firstPath).toBe(secondPath);

    const content = await fs.readFile(firstPath, 'utf-8');
    expect(content).toContain('First context');
    expect(content).not.toContain('Second context');
  });

  it('should append to existing section', async () => {
    await createHistoryShadow(teamRoot, 'test-agent', 'Initial context');

    await appendToHistory(
      teamRoot,
      'test-agent',
      'Learnings',
      'Learned something important about the codebase.'
    );

    const history = await readHistory(teamRoot, 'test-agent');

    expect(history.learnings).toBeTruthy();
    expect(history.learnings).toContain('Learned something important');
  });

  it('should create section if it does not exist', async () => {
    await createHistoryShadow(teamRoot, 'test-agent', 'Initial context');

    await appendToHistory(
      teamRoot,
      'test-agent',
      'Issues',
      'Encountered a build error with TypeScript compilation.'
    );

    const history = await readHistory(teamRoot, 'test-agent');

    expect(history.issues).toBeTruthy();
    expect(history.issues).toContain('build error');
  });

  it('should read parsed history', async () => {
    await createHistoryShadow(teamRoot, 'test-agent', 'Initial context');
    await appendToHistory(teamRoot, 'test-agent', 'Learnings', 'Test learning');
    await appendToHistory(teamRoot, 'test-agent', 'Issues', 'Test issue');

    const history = await readHistory(teamRoot, 'test-agent');

    expect(history.fullContent).toBeTruthy();
    expect(history.context).toBeTruthy();
    expect(history.learnings).toBeTruthy();
    expect(history.issues).toBeTruthy();
  });

  it('should handle missing shadow gracefully', async () => {
    const history = await readHistory(teamRoot, 'nonexistent-agent');

    expect(history.fullContent).toBe('');
    expect(history.context).toBeUndefined();
  });

  it('should check shadow existence', async () => {
    await createHistoryShadow(teamRoot, 'test-agent', 'Initial context');

    const exists = await shadowExists(teamRoot, 'test-agent');
    expect(exists).toBe(true);

    const notExists = await shadowExists(teamRoot, 'nonexistent');
    expect(notExists).toBe(false);
  });

  it('should delete shadow', async () => {
    await createHistoryShadow(teamRoot, 'test-agent', 'Initial context');

    await deleteHistoryShadow(teamRoot, 'test-agent');

    const exists = await shadowExists(teamRoot, 'test-agent');
    expect(exists).toBe(false);
  });

  it('should throw on append to missing shadow', async () => {
    await expect(
      appendToHistory(
        teamRoot,
        'deleted-agent',
        'Learnings',
        'Test content'
      )
    ).rejects.toThrow(/History shadow not found/);
  });
});

describe('Agent Lifecycle Manager — cost policy wiring (AC11, #1089 fix)', () => {
  let tempDir: string;
  let teamRoot: string;
  let mockClient: SquadClientWithPool;
  let eventBus: EventBus;
  let events: Array<{ type: string; payload: unknown }>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let manager: AgentLifecycleManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'squad-policy-test-'));
    teamRoot = tempDir;
    const agentsDir = path.join(teamRoot, '.ai-team', 'agents', 'policy-agent');
    await fs.mkdir(agentsDir, { recursive: true });
    // Charter deliberately WITHOUT a ## Model section → implicit task-auto path.
    const charterContent = `# Policy Agent Charter

## Identity

**Name:** Policy Agent
**Role:** Test Role
**Expertise:** Testing
**Style:** Systematic

## What I Own

Test ownership areas.

## Collaboration

Test collaboration.
`;
    await fs.writeFile(path.join(agentsDir, 'charter.md'), charterContent, 'utf-8');

    mockClient = createMockClient();
    eventBus = new EventBus();
    events = [];
    eventBus.subscribe('agent:milestone', (e) => {
      events.push({ type: e.type, payload: e.payload });
    });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    manager = new AgentLifecycleManager({
      client: mockClient,
      teamRoot,
      defaultIdleTimeout: 60_000,
      eventBus,
    });
  });

  afterEach(async () => {
    warnSpy.mockRestore();
    await manager.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('downgrades an implicit over-ceiling pick end-to-end AND surfaces the change', async () => {
    // visual → task-auto claude-opus-5.5 (powerful); ceiling versatile ⇒ downgrade.
    const handle = await manager.spawnAgent({
      agentName: 'policy-agent',
      task: 'Draw a diagram',
      taskType: 'visual',
      sessionCostPolicy: { maxCategory: 'versatile' },
    });

    // The wired policy must actually change the session model (the #1089 dead-code bug).
    expect(handle.model).toBe('claude-sonnet-5.5');

    // The policy change must be SURFACED, not swallowed: emitted on the bus.
    const policyEvents = events.filter(
      (e) => (e.payload as { event?: string })?.event === 'model.policy',
    );
    expect(policyEvents.length).toBeGreaterThan(0);
  });

  it('honors an explicit over-ceiling override but emits a loud warning (AC6/FR8)', async () => {
    const handle = await manager.spawnAgent({
      agentName: 'policy-agent',
      task: 'Do work',
      taskType: 'code',
      modelOverride: 'claude-opus-4.8', // explicit, powerful
      sessionCostPolicy: { maxCategory: 'versatile' },
    });

    // Explicit intent wins — model is NOT downgraded.
    expect(handle.model).toBe('claude-opus-4.8');
    // ...but the warning MUST surface (console + bus).
    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.flat().join(' ');
    expect(warned).toMatch(/versatile/i);
  });

  it('no policy ⇒ unchanged behavior (no warning, no policy event)', async () => {
    const handle = await manager.spawnAgent({
      agentName: 'policy-agent',
      task: 'Draw',
      taskType: 'visual',
    });
    expect(handle.model).toBe(MODELS.FALLBACK_CHAINS.premium[0]);
    const policyEvents = events.filter(
      (e) => (e.payload as { event?: string })?.event === 'model.policy',
    );
    expect(policyEvents.length).toBe(0);
  });
});

describe('Agent Lifecycle Manager — persistent model preference + provenance (#1720)', () => {
  let tempDir: string;
  let squadDir: string;
  let mockClient: SquadClientWithPool;
  let sessionConfigs: Array<Record<string, unknown>>;
  let events: Array<Record<string, unknown>>;
  let manager: AgentLifecycleManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'squad-model-pref-spawn-'));
    squadDir = path.join(tempDir, '.squad');
    const agentsDir = path.join(squadDir, 'agents', 'pref-agent');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(
      path.join(agentsDir, 'charter.md'),
      `# Pref Agent\n\n## Identity\n\n**Name:** Pref Agent\n**Role:** Test\n\n## Model\n\n**Preferred:** charter-model\n`,
      'utf-8',
    );
    mockClient = createMockClient();
    sessionConfigs = [];
    const create = mockClient.createSession.bind(mockClient);
    (mockClient as any).createSession = async (config: Record<string, unknown>) => {
      sessionConfigs.push(config);
      return create(config as any);
    };
    const eventBus = new EventBus();
    events = [];
    eventBus.subscribe('agent:milestone', (e) => {
      events.push(e.payload as Record<string, unknown>);
    });
    manager = new AgentLifecycleManager({ client: mockClient, teamRoot: tempDir, defaultIdleTimeout: 60_000, eventBus });
  });

  afterEach(async () => {
    await manager.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(squadDir, 'config.json'), JSON.stringify({ version: 1, ...config }), 'utf-8');
  }

  it('per-agent persistent config beats charter and task in the created session', async () => {
    await writeConfig({ defaultModel: 'global-model', agentModelOverrides: { 'pref-agent': 'persisted-model' } });
    const handle = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work', taskType: 'visual' });

    expect(sessionConfigs[0]?.model, `createSession model with agentModelOverrides set: ${JSON.stringify(sessionConfigs[0])}`).toBe('persisted-model');
    expect(handle.model).toBe('persisted-model');
    expect(handle.modelResolution?.source, `handle provenance: ${JSON.stringify(handle.modelResolution)}`).toBe('config');
    expect(handle.modelResolution?.rationale).toMatch(/config\.json.*'persisted-model'/);
  });

  it('global defaultModel applies when the agent has no override', async () => {
    await writeConfig({ defaultModel: 'global-model' });
    const handle = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work' });
    expect(sessionConfigs[0]?.model, `createSession model with defaultModel set: ${JSON.stringify(sessionConfigs[0])}`).toBe('global-model');
    expect(handle.modelResolution?.source).toBe('config');
  });

  it("'auto' persisted preference falls through to the charter", async () => {
    await writeConfig({ defaultModel: 'auto' });
    const handle = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work' });
    expect(sessionConfigs[0]?.model, `createSession model with defaultModel 'auto': ${JSON.stringify(sessionConfigs[0])}`).toBe('charter-model');
    expect(handle.modelResolution?.source).toBe('charter');
  });

  it('explicit spawn override still beats persistent config', async () => {
    await writeConfig({ defaultModel: 'global-model' });
    const handle = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work', modelOverride: 'spawn-model' });
    expect(sessionConfigs[0]?.model).toBe('spawn-model');
    expect(handle.modelResolution?.source).toBe('user-override');
  });

  it('records resolution provenance as a model.resolved milestone event', async () => {
    await writeConfig({ agentModelOverrides: { 'pref-agent': 'persisted-model' } });
    await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work' });
    const resolved = events.filter((e) => e.event === 'model.resolved');
    expect(resolved, `model.resolved events: ${JSON.stringify(events)}`).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ model: 'persisted-model', source: 'config' });
    expect(String(resolved[0]!.rationale)).toMatch(/config\.json/);
  });

  it('inherits the session model (e.g. opt-in hydrafusion) over the charter in the created session', async () => {
    const handle = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work', taskType: 'code', sessionModel: 'hydrafusion' });
    expect(sessionConfigs[0]?.model, `createSession with sessionModel 'hydrafusion': ${JSON.stringify(sessionConfigs[0])}`).toBe('hydrafusion');
    expect(handle.model).toBe('hydrafusion');
    expect(handle.modelResolution?.source, `handle provenance: ${JSON.stringify(handle.modelResolution)}`).toBe('session');
    const resolved = events.filter((e) => e.event === 'model.resolved');
    expect(resolved[0], `model.resolved events: ${JSON.stringify(events)}`).toMatchObject({ model: 'hydrafusion', source: 'session' });
  });

  it("'auto' session model falls through to the charter", async () => {
    const handle = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work', sessionModel: ' AUTO ' });
    expect(sessionConfigs[0]?.model, `createSession with sessionModel ' AUTO ': ${JSON.stringify(sessionConfigs[0])}`).toBe('charter-model');
    expect(handle.modelResolution?.source).toBe('charter');
  });

  it('explicit spawn override and persistent config both beat the session model', async () => {
    const explicit = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work', modelOverride: 'spawn-model', sessionModel: 'hydrafusion' });
    expect(sessionConfigs[0]?.model, `override vs session: ${JSON.stringify(sessionConfigs[0])}`).toBe('spawn-model');
    expect(explicit.modelResolution?.source).toBe('user-override');

    await writeConfig({ agentModelOverrides: { 'pref-agent': 'persisted-model' } });
    const persisted = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work', sessionModel: 'hydrafusion' });
    expect(sessionConfigs[1]?.model, `config vs session: ${JSON.stringify(sessionConfigs[1])}`).toBe('persisted-model');
    expect(persisted.modelResolution?.source).toBe('config');
  });

  it('forwards unavailableModels: falls forward along the chain and records fallback provenance', async () => {
    const chain = MODELS.FALLBACK_CHAINS.standard;
    const handle = await manager.spawnAgent({
      agentName: 'pref-agent', task: 'Work', modelOverride: chain[1], unavailableModels: [chain[1]!],
    });
    expect(sessionConfigs[0]?.model, `createSession with '${chain[1]}' unavailable: ${JSON.stringify(sessionConfigs[0])}`).toBe(chain[2]);
    expect(handle.modelResolution).toMatchObject({ source: 'fallback', fallbackFrom: { model: chain[1], source: 'user-override' } });
  });

  it('exhausted fallback omits the model key from the SDK session config (no undefined own property)', async () => {
    const chain = MODELS.FALLBACK_CHAINS.standard;
    const last = chain[chain.length - 1]!;
    const handle = await manager.spawnAgent({ agentName: 'pref-agent', task: 'Work', sessionModel: last, unavailableModels: [last] });
    const config = sessionConfigs[0]!;
    expect(
      Object.prototype.hasOwnProperty.call(config, 'model'),
      `createSession config must not carry a 'model' key when '${last}' (last chain entry) is unavailable: ${JSON.stringify(Object.keys(config))} model=${String(config.model)}`,
    ).toBe(false);
    expect(handle.modelResolution, `handle provenance: ${JSON.stringify(handle.modelResolution)}`).toMatchObject({
      source: 'fallback', omitModel: true, fallbackFrom: { model: last, source: 'session' },
    });
  });

  it('unavailable session hydrafusion under a lightweight session ceiling omits the model key instead of an over-ceiling fallback', async () => {
    const spawn = { agentName: 'pref-agent', task: 'Work', taskType: 'code' as const, sessionModel: 'hydrafusion', sessionCostPolicy: { maxCategory: 'lightweight' as const }, unavailableModels: ['hydrafusion'] };
    const handle = await manager.spawnAgent(spawn);
    const config = sessionConfigs[0]!;
    expect(
      Object.prototype.hasOwnProperty.call(config, 'model'),
      `spawnAgent(${JSON.stringify(spawn)}) with ceiling lightweight passed createSession model '${String(config.model)}'; no in-ceiling fallback exists, so 'model' must be omitted`,
    ).toBe(false);
    expect(handle.modelResolution, `handle provenance: ${JSON.stringify(handle.modelResolution)}`).toMatchObject({
      source: 'fallback', omitModel: true, fallbackFrom: { model: 'hydrafusion', source: 'session' },
    });
  });

  it('unavailable session hydrafusion under a versatile config ceiling passes only an allowed fallback to createSession', async () => {
    const cappedManager = new AgentLifecycleManager({
      client: mockClient, teamRoot: tempDir, defaultIdleTimeout: 60_000, costPolicy: { maxCategory: 'versatile' },
    });
    try {
      // Every versatile standard entry is unavailable; the remaining powerful entries must be skipped, so the model is omitted.
      const unavailable = ['hydrafusion', 'claude-sonnet-5.5', 'gpt-5.6-terra', 'claude-sonnet-5'];
      const spawn = { agentName: 'pref-agent', task: 'Work', taskType: 'code' as const, sessionModel: 'hydrafusion', unavailableModels: unavailable };
      const handle = await cappedManager.spawnAgent(spawn);
      expect(
        Object.prototype.hasOwnProperty.call(sessionConfigs[0] ?? {}, 'model'),
        `spawnAgent(${JSON.stringify(spawn)}) with config ceiling versatile passed createSession model '${String(sessionConfigs[0]?.model)}'; powerful 'gpt-5.5' must be skipped`,
      ).toBe(false);
      expect(handle.modelResolution).toMatchObject({ source: 'fallback', omitModel: true, fallbackFrom: { model: 'hydrafusion', source: 'session' } });
    } finally {
      await cappedManager.shutdown();
    }
  });
});

// --- Mock Client ---

function createMockClient(): SquadClientWithPool {
  let sessionCounter = 0;
  const sessions = new Map<string, any>();

  return {
    async connect() {},
    async disconnect() { return []; },
    async forceDisconnect() {},
    getState() { return 'connected' as any; },
    isConnected() { return true; },

    async createSession(config: any) {
      const sessionId = `test-session-${++sessionCounter}`;
      const session = {
        sessionId,
        model: config.model || 'claude-haiku-4.5',
        async sendMessage(options: any) {},
        async close() {
          sessions.delete(sessionId);
        },
        on() {},
        off() {},
      };
      sessions.set(sessionId, session);
      return session;
    },

    async resumeSession(sessionId: string, config: any) {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      return session;
    },

    async deleteSession(sessionId: string) {
      sessions.delete(sessionId);
    },

    async listSessions() {
      return Array.from(sessions.values());
    },

    async ping() { return { message: 'pong' }; },
    async getStatus() { return {} as any; },
    async getAuthStatus() { return {} as any; },
    async listModels() { return []; },
    on() {},
    async shutdown() {},

    pool: {
      add() {},
      remove() { return true; },
      get() { return undefined; },
      getAll() { return []; },
      getByAgent() { return []; },
      size: 0,
      async shutdown() {},
      on() {},
    } as any,

    eventBus: {
      async emit() {},
      on() {},
      off() {},
      once() {},
      clear() {},
    } as any,
  } as any;
}
