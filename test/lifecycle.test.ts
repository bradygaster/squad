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
    // visual → task-auto claude-opus-4.6 (powerful); ceiling versatile ⇒ downgrade.
    const handle = await manager.spawnAgent({
      agentName: 'policy-agent',
      task: 'Draw a diagram',
      taskType: 'visual',
      sessionCostPolicy: { maxCategory: 'versatile' },
    });

    // The wired policy must actually change the session model (the #1089 dead-code bug).
    expect(handle.model).toBe('claude-sonnet-4.6');

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
    expect(handle.model).toBe('claude-opus-4.6');
    const policyEvents = events.filter(
      (e) => (e.payload as { event?: string })?.event === 'model.policy',
    );
    expect(policyEvents.length).toBe(0);
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
