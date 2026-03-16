/**
 * Integration tests for ToolRegistry (M1-1, M1-2, Issues #88 #92)
 * 
 * Tests tool registration, lookup, filtering, and handler execution for:
 * - squad_route: Routing tasks to agents
 * - squad_decide: Writing decisions to inbox
 * - squad_memory: Appending to agent history
 * - squad_status: Querying session state
 * - squad_skill: Reading/writing skills
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolRegistry, defineTool, type RouteRequest, type DecisionRecord, type MemoryEntry } from '@bradygaster/squad-sdk/tools';
import { SessionPool } from '@bradygaster/squad-sdk/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

describe('defineTool', () => {
  it('should create a typed SquadTool', () => {
    const tool = defineTool({
      name: 'test_tool',
      description: 'A test tool',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
      handler: async (args: { input: string }) => {
        return `Received: ${args.input}`;
      },
    });

    expect(tool.name).toBe('test_tool');
    expect(tool.description).toBe('A test tool');
    expect(tool.parameters).toBeDefined();
    expect(tool.handler).toBeInstanceOf(Function);
  });

  it('should execute handler and return result', async () => {
    const tool = defineTool({
      name: 'echo',
      description: 'Echo tool',
      parameters: { type: 'object' },
      handler: async (args: { message: string }) => {
        return { textResultForLlm: args.message, resultType: 'success' as const };
      },
    });

    const result = await tool.handler({ message: 'hello' }, {
      sessionId: 'test-session',
      toolCallId: 'test-call',
      toolName: 'echo',
      arguments: { message: 'hello' },
    });

    expect(result).toEqual({
      textResultForLlm: 'hello',
      resultType: 'success',
    });
  });
});

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let testRoot: string;

  beforeEach(() => {
    testRoot = path.join('.', '.test-squad-' + randomUUID());
    registry = new ToolRegistry(testRoot);
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('registration', () => {
    it('should register all five squad tools', () => {
      const tools = registry.getTools();
      expect(tools.length).toBe(5);

      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('squad_route');
      expect(toolNames).toContain('squad_decide');
      expect(toolNames).toContain('squad_memory');
      expect(toolNames).toContain('squad_status');
      expect(toolNames).toContain('squad_skill');
    });

    it('should register tools with descriptions and parameters', () => {
      const routeTool = registry.getTool('squad_route');
      expect(routeTool).toBeDefined();
      expect(routeTool!.name).toBe('squad_route');
      expect(routeTool!.description).toContain('Route a task');
      expect(routeTool!.parameters).toBeDefined();
    });
  });

  describe('getTools', () => {
    it('should return all registered tools', () => {
      const tools = registry.getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBe(5);
    });

    it('should return tools with handler functions', () => {
      const tools = registry.getTools();
      tools.forEach(tool => {
        expect(tool.handler).toBeInstanceOf(Function);
      });
    });
  });

  describe('getToolsForAgent', () => {
    it('should return all tools when no filter provided', () => {
      const tools = registry.getToolsForAgent();
      expect(tools.length).toBe(5);
    });

    it('should filter tools by allowed list', () => {
      const tools = registry.getToolsForAgent(['squad_route', 'squad_decide']);
      expect(tools.length).toBe(2);
      expect(tools.map(t => t.name)).toEqual(['squad_route', 'squad_decide']);
    });

    it('should handle empty allowed list', () => {
      const tools = registry.getToolsForAgent([]);
      expect(tools.length).toBe(0);
    });

    it('should filter out non-existent tools', () => {
      const tools = registry.getToolsForAgent(['squad_route', 'nonexistent_tool', 'squad_decide']);
      expect(tools.length).toBe(2);
      expect(tools.map(t => t.name)).toEqual(['squad_route', 'squad_decide']);
    });
  });

  describe('getTool', () => {
    it('should retrieve tool by name', () => {
      const tool = registry.getTool('squad_route');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('squad_route');
    });

    it('should return undefined for non-existent tool', () => {
      const tool = registry.getTool('nonexistent');
      expect(tool).toBeUndefined();
    });
  });
});

describe('squad_route handler', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('.test-squad-route');
  });

  it('should validate target agent is required', async () => {
    const tool = registry.getTool('squad_route')!;
    const result = await tool.handler(
      { targetAgent: '', task: 'Do something' } as RouteRequest,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_route',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'Invalid target agent',
    });
  });

  it('should create route request with valid inputs', async () => {
    const tool = registry.getTool('squad_route')!;
    const result = await tool.handler(
      {
        targetAgent: 'fenster',
        task: 'Implement feature X',
        priority: 'high',
        context: 'Related to PRD-2',
      } as RouteRequest,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_route',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).textResultForLlm).toContain('fenster');
    expect((result as any).textResultForLlm).toContain('high');
  });

  it('should default priority to normal', async () => {
    const tool = registry.getTool('squad_route')!;
    const result = await tool.handler(
      {
        targetAgent: 'brady',
        task: 'Review code',
      } as RouteRequest,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_route',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).toolTelemetry.routeRequest.priority).toBe('normal');
  });
});

describe('squad_decide handler', () => {
  let registry: ToolRegistry;
  let testRoot: string;

  beforeEach(() => {
    testRoot = path.join('.', '.test-squad-decide-' + randomUUID());
    registry = new ToolRegistry(testRoot);
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('should write decision to inbox directory', async () => {
    const tool = registry.getTool('squad_decide')!;
    const result = await tool.handler(
      {
        author: 'fenster',
        summary: 'Use TypeScript for all new code',
        body: 'TypeScript provides better type safety and developer experience.',
        references: ['PRD-2', 'Issue #88'],
      } as DecisionRecord,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_decide',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });

    const inboxDir = path.join(testRoot, 'decisions', 'inbox');
    expect(fs.existsSync(inboxDir)).toBe(true);

    const files = fs.readdirSync(inboxDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^fenster-use-typescript-for-all-new-code\.md$/);

    const content = fs.readFileSync(path.join(inboxDir, files[0]), 'utf-8');
    expect(content).toContain('Use TypeScript for all new code');
    expect(content).toContain('**By:** fenster');
    expect(content).toContain('**What:**');
    expect(content).toContain('**Why:**');
    expect(content).toContain('**References:** PRD-2, Issue #88');
    expect(content).toContain('TypeScript provides better type safety');
  });

  it('should handle decision without references', async () => {
    const tool = registry.getTool('squad_decide')!;
    const result = await tool.handler(
      {
        author: 'brady',
        summary: 'Short decision',
        body: 'Decision details here.',
      } as DecisionRecord,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_decide',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });

    const inboxDir = path.join(testRoot, 'decisions', 'inbox');
    const files = fs.readdirSync(inboxDir);
    const content = fs.readFileSync(path.join(inboxDir, files[0]), 'utf-8');
    
    expect(content).toContain('Short decision');
    expect(content).toContain('**By:** brady');
    expect(content).not.toContain('**References:**');
  });
});

describe('squad_memory handler', () => {
  let registry: ToolRegistry;
  let testRoot: string;

  beforeEach(() => {
    testRoot = path.join('.', '.test-squad-memory-' + randomUUID());
    registry = new ToolRegistry(testRoot);

    // Create test agent history file
    const agentDir = path.join(testRoot, 'agents', 'fenster');
    fs.mkdirSync(agentDir, { recursive: true });
    
    const historyContent = `# Fenster's History

## Learnings

### 2024-01-01T00:00:00.000Z
Initial learning entry.

## Updates

### 2024-01-01T00:00:00.000Z
Initial update entry.

## Sessions

### 2024-01-01T00:00:00.000Z
Initial session entry.
`;
    fs.writeFileSync(path.join(agentDir, 'history.md'), historyContent, 'utf-8');
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('should append to existing section', async () => {
    const tool = registry.getTool('squad_memory')!;
    const result = await tool.handler(
      {
        agent: 'fenster',
        section: 'learnings',
        content: 'Learned how to implement ToolRegistry.',
      } as MemoryEntry,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_memory',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });

    const historyFile = path.join(testRoot, 'agents', 'fenster', 'history.md');
    const content = fs.readFileSync(historyFile, 'utf-8');
    
    expect(content).toContain('Learned how to implement ToolRegistry');
    expect(content).toContain('## Learnings');
    
    // Check it's in the right section
    const learningsIndex = content.indexOf('## Learnings');
    const updatesIndex = content.indexOf('## Updates');
    const newEntryIndex = content.indexOf('Learned how to implement ToolRegistry');
    
    expect(newEntryIndex).toBeGreaterThan(learningsIndex);
    expect(newEntryIndex).toBeLessThan(updatesIndex);
  });

  it('should create section if it does not exist', async () => {
    // Create a history file without Sessions section
    const agentDir = path.join(testRoot, 'agents', 'brady');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'history.md'), '# Brady History\n\n## Learnings\n', 'utf-8');

    const tool = registry.getTool('squad_memory')!;
    const result = await tool.handler(
      {
        agent: 'brady',
        section: 'sessions',
        content: 'Session on M1-1 implementation.',
      } as MemoryEntry,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_memory',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });

    const historyFile = path.join(testRoot, 'agents', 'brady', 'history.md');
    const content = fs.readFileSync(historyFile, 'utf-8');
    
    expect(content).toContain('## Sessions');
    expect(content).toContain('Session on M1-1 implementation');
  });

  it('should fail if agent history does not exist', async () => {
    const tool = registry.getTool('squad_memory')!;
    const result = await tool.handler(
      {
        agent: 'nonexistent',
        section: 'learnings',
        content: 'Some content.',
      } as MemoryEntry,
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_memory',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'History file does not exist',
    });
  });
});

describe('squad_status handler', () => {
  let registry: ToolRegistry;
  let sessionPool: SessionPool;

  beforeEach(() => {
    sessionPool = new SessionPool({ maxConcurrent: 5, idleTimeout: 60000, healthCheckInterval: 30000 });
    registry = new ToolRegistry('.test-squad-status', () => sessionPool);
  });

  it('should return pool status with no sessions', async () => {
    const tool = registry.getTool('squad_status')!;
    const result = await tool.handler(
      {},
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_status',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).textResultForLlm).toContain('0/5 sessions');
    expect((result as any).toolTelemetry.poolInfo.poolSize).toBe(0);
  });

  it('should return pool status with active sessions', async () => {
    // Add some sessions to the pool
    sessionPool.add({
      id: 'session-1',
      agentName: 'fenster',
      status: 'active',
      createdAt: new Date(),
    });
    sessionPool.add({
      id: 'session-2',
      agentName: 'verbal',
      status: 'active',
      createdAt: new Date(),
    });

    const tool = registry.getTool('squad_status')!;
    const result = await tool.handler(
      {},
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_status',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).textResultForLlm).toContain('2/5 sessions');
    expect((result as any).toolTelemetry.poolInfo.poolSize).toBe(2);
    expect((result as any).toolTelemetry.poolInfo.activeSessions).toBe(2);
  });

  it('should filter by agent name', async () => {
    sessionPool.add({
      id: 'session-1',
      agentName: 'fenster',
      status: 'active',
      createdAt: new Date(),
    });
    sessionPool.add({
      id: 'session-2',
      agentName: 'verbal',
      status: 'active',
      createdAt: new Date(),
    });

    const tool = registry.getTool('squad_status')!;
    const result = await tool.handler(
      { agentName: 'fenster' },
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_status',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).textResultForLlm).toContain('Filtered results: 1 sessions');
    expect((result as any).toolTelemetry.poolInfo.filteredCount).toBe(1);
  });

  it('should include verbose session details', async () => {
    sessionPool.add({
      id: 'session-123',
      agentName: 'fenster',
      status: 'active',
      createdAt: new Date(Date.now() - 5000), // 5 seconds ago
    });

    const tool = registry.getTool('squad_status')!;
    const result = await tool.handler(
      { verbose: true },
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_status',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).textResultForLlm).toContain('Sessions:');
    expect((result as any).textResultForLlm).toContain('fenster');
    expect((result as any).textResultForLlm).toContain('active');
  });

  it('should handle query without pool', async () => {
    const registryNoPool = new ToolRegistry('.test-squad-status');
    const tool = registryNoPool.getTool('squad_status')!;
    const result = await tool.handler(
      {},
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_status',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).textResultForLlm).toContain('Pool size: 0');
    expect((result as any).toolTelemetry.poolAvailable).toBe(false);
  });
});

describe('squad_skill handler', () => {
  let registry: ToolRegistry;
  let testRoot: string;
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = path.join('.', '.test-squad-skill-' + randomUUID());
    testRoot = path.join(projectRoot, '.squad');
    fs.mkdirSync(testRoot, { recursive: true });
    registry = new ToolRegistry(testRoot);
  });

  afterEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('should write skill file', async () => {
    const tool = registry.getTool('squad_skill')!;
    const result = await tool.handler(
      {
        skillName: 'typescript-refactoring',
        operation: 'write',
        content: 'Expert at refactoring TypeScript code for better maintainability.',
        confidence: 'high',
      },
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_skill',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });

    const skillFile = path.join(projectRoot, '.copilot', 'skills', 'typescript-refactoring', 'SKILL.md');
    expect(fs.existsSync(skillFile)).toBe(true);

    const content = fs.readFileSync(skillFile, 'utf-8');
    expect(content).toContain('# typescript-refactoring');
    expect(content).toContain('**Confidence:** high');
    expect(content).toContain('Expert at refactoring TypeScript');
  });

  it('should read existing skill file', async () => {
    // Create a skill file first
    const skillDir = path.join(testRoot, 'skills', 'debugging');
    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = '# debugging\n\n**Confidence:** medium\n\nExpert at debugging Node.js applications.';
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent, 'utf-8');

    const tool = registry.getTool('squad_skill')!;
    const result = await tool.handler(
      {
        skillName: 'debugging',
        operation: 'read',
      },
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_skill',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'success',
    });
    expect((result as any).textResultForLlm).toContain('debugging');
    expect((result as any).textResultForLlm).toContain('Expert at debugging Node.js');
  });

  it('should fail to read non-existent skill', async () => {
    const tool = registry.getTool('squad_skill')!;
    const result = await tool.handler(
      {
        skillName: 'nonexistent',
        operation: 'read',
      },
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_skill',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'Skill file does not exist',
    });
  });

  it('should fail to write without content', async () => {
    const tool = registry.getTool('squad_skill')!;
    const result = await tool.handler(
      {
        skillName: 'test-skill',
        operation: 'write',
      },
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_skill',
        arguments: {},
      }
    );

    expect(result).toMatchObject({
      resultType: 'failure',
      error: 'Missing required field: content',
    });
  });

  it('should default confidence to medium', async () => {
    const tool = registry.getTool('squad_skill')!;
    await tool.handler(
      {
        skillName: 'test-skill',
        operation: 'write',
        content: 'Test skill content',
      },
      {
        sessionId: 'test-session',
        toolCallId: 'test-call',
        toolName: 'squad_skill',
        arguments: {},
      }
    );

    const skillFile = path.join(projectRoot, '.copilot', 'skills', 'test-skill', 'SKILL.md');
    const content = fs.readFileSync(skillFile, 'utf-8');
    expect(content).toContain('**Confidence:** medium');
  });
});
