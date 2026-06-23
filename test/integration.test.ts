/**
 * M1-12 Integration Tests: Tools + Hooks + Lifecycle (#146)
 * 
 * Comprehensive integration tests verifying M1 components work together:
 * - Tool → Hook Pipeline Integration
 * - Charter → Model → Session Pipeline
 * - Hook Enforcement Scenarios
 * - Session Pool + Event Bus Integration
 * - Error Hierarchy Integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolRegistry, defineTool, type RouteRequest, type DecisionRecord, type MemoryEntry } from '@bradygaster/squad-sdk/tools';
import {
  HookPipeline,
  ReviewerLockoutHook,
  PolicyConfig,
  PreToolUseContext,
  PostToolUseContext,
} from '@bradygaster/squad-sdk/hooks';
import { compileCharter, type CharterCompileOptions } from '@bradygaster/squad-sdk/agents';
import { resolveModel, type ModelResolutionOptions, type TaskType } from '@bradygaster/squad-sdk/agents';
import { EventBus, type SquadEvent } from '@bradygaster/squad-sdk/runtime/event-bus';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import {
  SquadError,
  ErrorFactory,
  ErrorCategory,
  ErrorSeverity,
  TelemetryCollector,
  RateLimitError,
} from '@bradygaster/squad-sdk/adapter/errors';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

// Mock CopilotClient
vi.mock('@github/copilot-sdk', () => {
  return {
    CopilotClient: vi.fn().mockImplementation(() => {
      return {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue([]),
        forceStop: vi.fn().mockResolvedValue(undefined),
        createSession: vi.fn().mockResolvedValue({ sessionId: 'session-1', send: vi.fn().mockResolvedValue('msg-1'), on: vi.fn().mockReturnValue(() => {}), destroy: vi.fn().mockResolvedValue(undefined) }),
        resumeSession: vi.fn().mockResolvedValue({ sessionId: 'session-1', send: vi.fn().mockResolvedValue('msg-1'), on: vi.fn().mockReturnValue(() => {}), destroy: vi.fn().mockResolvedValue(undefined) }),
        listSessions: vi.fn().mockResolvedValue([]),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        getLastSessionId: vi.fn().mockResolvedValue(undefined),
        ping: vi.fn().mockResolvedValue({ message: 'pong', timestamp: Date.now() }),
        getStatus: vi.fn().mockResolvedValue({ version: '1.0.0' }),
        getAuthStatus: vi.fn().mockResolvedValue({ authenticated: true }),
        listModels: vi.fn().mockResolvedValue([]),
        on: vi.fn().mockReturnValue(() => {}),
      };
    }),
  };
});

describe('Integration: Tool → Hook Pipeline', () => {
  let registry: ToolRegistry;
  let pipeline: HookPipeline;
  let testRoot: string;

  beforeEach(() => {
    testRoot = path.join('.', '.test-integration-' + randomUUID());
    registry = new ToolRegistry(testRoot);
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  describe('squad_route through HookPipeline', () => {
    it('should allow squad_route when no blocking hooks', async () => {
      pipeline = new HookPipeline();
      const tool = registry.getTool('squad_route')!;

      const ctx: PreToolUseContext = {
        toolName: 'squad_route',
        arguments: { targetAgent: 'fenster', task: 'Implement feature' },
        agentName: 'coordinator',
        sessionId: 'session-1',
      };

      const hookResult = await pipeline.runPreToolHooks(ctx);
      expect(hookResult.action).toBe('allow');

      // Execute tool. With no fanOutDepsGetter wired into ToolRegistry,
      // the handler returns a structured failure (fan-out-deps-unavailable)
      // rather than the previous fake-success. The point of this test is that
      // the hook pipeline allows the call through; the tool's own outcome is
      // determined by infra wiring (covered separately in test/tools.test.ts).
      const toolResult = await tool.handler(
        { targetAgent: 'fenster', task: 'Implement feature' } as RouteRequest,
        {
          sessionId: 'session-1',
          toolCallId: 'call-1',
          toolName: 'squad_route',
          arguments: {},
        }
      );

      expect(toolResult.resultType).toBe('failure');
      expect((toolResult as { error?: string }).error).toBe('fan-out-deps-unavailable');
    });

    it('should block squad_route when custom hook blocks it', async () => {
      pipeline = new HookPipeline();
      
      // Add custom hook that blocks routing to specific agents
      pipeline.addPreToolHook(async (ctx) => {
        if (ctx.toolName === 'squad_route' && (ctx.arguments as any).targetAgent === 'blocked-agent') {
          return { action: 'block', reason: 'Agent blocked-agent is not available' };
        }
        return { action: 'allow' };
      });

      const ctx: PreToolUseContext = {
        toolName: 'squad_route',
        arguments: { targetAgent: 'blocked-agent', task: 'Do something' },
        agentName: 'coordinator',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('not available');
    });
  });

  describe('squad_decide with file-write guard', () => {
    it('should allow writes to inbox when allowed patterns match', async () => {
      const config: PolicyConfig = {
        allowedWritePaths: ['**/.squad/decisions/inbox/**', '.test-integration-*/**'],
      };
      pipeline = new HookPipeline(config);

      const inboxPath = path.join(testRoot, 'decisions', 'inbox', 'decision-1.md');
      
      const ctx: PreToolUseContext = {
        toolName: 'create',
        arguments: { path: inboxPath },
        agentName: 'fenster',
        sessionId: 'session-1',
      };

      const hookResult = await pipeline.runPreToolHooks(ctx);
      expect(hookResult.action).toBe('allow');

      // Execute squad_decide tool
      const tool = registry.getTool('squad_decide')!;
      const toolResult = await tool.handler(
        {
          author: 'fenster',
          summary: 'Use TypeScript',
          body: 'TypeScript provides better type safety.',
        } as DecisionRecord,
        {
          sessionId: 'session-1',
          toolCallId: 'call-1',
          toolName: 'squad_decide',
          arguments: {},
        }
      );

      expect(toolResult.resultType).toBe('success');
      
      // Verify file was written
      const inboxDir = path.join(testRoot, 'decisions', 'inbox');
      expect(fs.existsSync(inboxDir)).toBe(true);
      const files = fs.readdirSync(inboxDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should block writes outside allowed paths', async () => {
      const config: PolicyConfig = {
        allowedWritePaths: ['.squad/decisions/inbox/**'],
      };
      pipeline = new HookPipeline(config);

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/main.ts' },
        agentName: 'fenster',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('File write blocked');
    });
  });

  describe('squad_memory with PII scrubbing', () => {
    it('should scrub email addresses from tool result', async () => {
      // Create agent history file
      const agentDir = path.join(testRoot, 'agents', 'fenster');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentDir, 'history.md'),
        '# History\n\n## Learnings\n\nInitial content.\n',
        'utf-8'
      );

      const config: PolicyConfig = {
        scrubPii: true,
      };
      pipeline = new HookPipeline(config);

      // Execute squad_memory
      const tool = registry.getTool('squad_memory')!;
      const toolResult = await tool.handler(
        {
          agent: 'fenster',
          section: 'learnings',
          content: 'Collaborated with john.doe@example.com on authentication module.',
        } as MemoryEntry,
        {
          sessionId: 'session-1',
          toolCallId: 'call-1',
          toolName: 'squad_memory',
          arguments: {},
        }
      );

      expect(toolResult.resultType).toBe('success');

      // Scrub the result using post-tool hook
      const postCtx: PostToolUseContext = {
        toolName: 'squad_memory',
        arguments: {},
        result: toolResult,
        agentName: 'fenster',
        sessionId: 'session-1',
      };

      const scrubbedResult = await pipeline.runPostToolHooks(postCtx);
      
      // Check file content was written (PII in file system is OK for squad_memory)
      const historyContent = fs.readFileSync(path.join(agentDir, 'history.md'), 'utf-8');
      expect(historyContent).toContain('john.doe@example.com');

      // But if we return the result to LLM, it should be scrubbed
      const resultText = JSON.stringify(scrubbedResult.result);
      if (resultText.includes('@')) {
        // If there's an email in the result, it should be redacted
        expect(resultText).not.toContain('john.doe@example.com');
      }
    });

    it('should scrub multiple email formats', async () => {
      const config: PolicyConfig = {
        scrubPii: true,
      };
      pipeline = new HookPipeline(config);

      const emails = [
        'user@example.com',
        'first.last@company.co.uk',
        'admin+tag@subdomain.example.org',
      ];

      for (const email of emails) {
        const ctx: PostToolUseContext = {
          toolName: 'view',
          arguments: {},
          result: `Contact: ${email}`,
          agentName: 'fenster',
          sessionId: 'session-1',
        };

        const result = await pipeline.runPostToolHooks(ctx);
        expect(result.result).toBe('Contact: [EMAIL_REDACTED]');
      }
    });
  });

  describe('Blocked tool calls return proper error messages', () => {
    it('should return descriptive error for blocked file writes', async () => {
      const config: PolicyConfig = {
        allowedWritePaths: ['.squad/**'],
      };
      pipeline = new HookPipeline(config);

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/secret.ts', content: 'leaked data' },
        agentName: 'rogue-agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('File write blocked');
      expect(result.reason).toContain('src/secret.ts');
    });

    it('should return descriptive error for blocked shell commands', async () => {
      const config: PolicyConfig = {
        blockedCommands: ['rm -rf', 'git push --force'],
      };
      pipeline = new HookPipeline(config);

      const ctx: PreToolUseContext = {
        toolName: 'powershell',
        arguments: { command: 'rm -rf /tmp/important' },
        agentName: 'agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('Shell command blocked');
      expect(result.reason).toContain('rm -rf');
    });

    it('should return descriptive error for rate limit exceeded', async () => {
      const config: PolicyConfig = {
        maxAskUserPerSession: 1,
      };
      pipeline = new HookPipeline(config);

      const ctx: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Question?' },
        agentName: 'agent',
        sessionId: 'session-1',
      };

      // First call succeeds
      await pipeline.runPreToolHooks(ctx);

      // Second call blocked
      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('rate limit exceeded');
      expect(result.reason).toMatch(/\d+\/\d+/); // Should show count like "2/1"
    });
  });
});

describe('Integration: Charter → Model → Session Pipeline', () => {
  describe('Compile charter → resolve model', () => {
    it('should compile charter and resolve model for code task', () => {
      const charterOptions: CharterCompileOptions = {
        agentName: 'fenster',
        charterPath: '/path/to/charter.md',
        teamContext: 'Team of 5 agents',
      };

      const config = compileCharter(charterOptions);
      expect(config).toBeDefined();
      expect(config.name).toBe('fenster');
      expect(config.prompt).toBeDefined();
      expect(config.prompt.length).toBeGreaterThan(0);

      // Resolve model for code task
      const modelOptions: ModelResolutionOptions = {
        taskType: 'code',
        agentRole: 'Developer',
      };

      const resolved = resolveModel(modelOptions);
      expect(resolved.model).toBeDefined();
      expect(resolved.tier).toBe('standard');
      expect(resolved.source).toBe('task-auto');
    });

    it('should use charter preference when provided', () => {
      const modelOptions: ModelResolutionOptions = {
        charterPreference: 'claude-opus-4.6',
        taskType: 'code',
        agentRole: 'Lead',
      };

      const resolved = resolveModel(modelOptions);
      expect(resolved.model).toBe('claude-opus-4.6');
      expect(resolved.tier).toBe('premium');
      expect(resolved.source).toBe('charter');
    });

    it('should use user override when provided', () => {
      const modelOptions: ModelResolutionOptions = {
        userOverride: 'claude-haiku-4.5',
        charterPreference: 'claude-opus-4.6',
        taskType: 'code',
      };

      const resolved = resolveModel(modelOptions);
      expect(resolved.model).toBe('claude-haiku-4.5');
      expect(resolved.tier).toBe('fast');
      expect(resolved.source).toBe('user-override');
    });

    it('should handle missing charter gracefully', () => {
      // Charter with no model preference
      const modelOptions: ModelResolutionOptions = {
        taskType: 'planning',
        agentRole: 'Coordinator',
      };

      const resolved = resolveModel(modelOptions);
      expect(resolved.model).toBeDefined();
      expect(resolved.source).toMatch(/task-auto|default/);
    });
  });

  describe('Model resolution respects task type', () => {
    const taskTypes: TaskType[] = ['code', 'docs', 'planning', 'prompt', 'visual', 'mechanical'];

    it('should resolve different models for different task types', () => {
      const results = taskTypes.map((taskType) => {
        return resolveModel({ taskType, agentRole: 'Tester' });
      });

      // All should succeed
      results.forEach((result) => {
        expect(result.model).toBeDefined();
        expect(result.tier).toBeDefined();
        expect(result.fallbackChain.length).toBeGreaterThan(0);
      });

      // Code tasks should get standard tier
      const codeResult = results[0];
      expect(codeResult.tier).toBe('standard');

      // Docs/planning tasks should get fast tier (cost optimization)
      const docsResult = results[1];
      expect(docsResult.tier).toBe('fast');
    });

    it('should provide fallback chains for each tier', () => {
      const premiumResult = resolveModel({
        charterPreference: 'claude-opus-4.6',
        taskType: 'prompt',
      });

      expect(premiumResult.tier).toBe('premium');
      expect(premiumResult.fallbackChain.length).toBeGreaterThan(1);
      expect(premiumResult.fallbackChain[0]).toBe('claude-opus-4.6');
    });
  });
});

describe('Integration: Hook Enforcement Scenarios', () => {
  let pipeline: HookPipeline;
  let lockout: ReviewerLockoutHook;

  beforeEach(() => {
    const config: PolicyConfig = {
      reviewerLockout: true,
      scrubPii: true,
      maxAskUserPerSession: 2,
      allowedWritePaths: ['.squad/**'],
      blockedCommands: ['rm -rf', 'git push --force'],
    };
    pipeline = new HookPipeline(config);
    lockout = pipeline.getReviewerLockout();
  });

  describe('Reviewer lockout + tool execution', () => {
    it('should block locked-out agent from editing artifact', async () => {
      // Create a new pipeline with lockout but without file-write restrictions for this test
      const testPipeline = new HookPipeline({
        reviewerLockout: true,
      });
      const testLockout = testPipeline.getReviewerLockout();
      
      testLockout.lockout('src/auth.ts', 'reviewer-1');

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/auth.ts' },
        agentName: 'reviewer-1',
        sessionId: 'session-1',
      };

      const result = await testPipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('Reviewer lockout');
      expect(result.reason).toContain('reviewer-1');
    });

    it('should allow non-locked-out agent to edit same artifact', async () => {
      // Create a new pipeline with lockout but without file-write restrictions
      const testPipeline = new HookPipeline({
        reviewerLockout: true,
      });
      const testLockout = testPipeline.getReviewerLockout();
      
      testLockout.lockout('src/auth.ts', 'reviewer-1');

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/auth.ts' },
        agentName: 'developer-1',
        sessionId: 'session-1',
      };

      const result = await testPipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('should clear lockout and allow subsequent edits', async () => {
      // Create a new pipeline with lockout but without file-write restrictions
      const testPipeline = new HookPipeline({
        reviewerLockout: true,
      });
      const testLockout = testPipeline.getReviewerLockout();
      
      testLockout.lockout('src/auth.ts', 'reviewer-1');
      
      let ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/auth.ts' },
        agentName: 'reviewer-1',
        sessionId: 'session-1',
      };

      expect((await testPipeline.runPreToolHooks(ctx)).action).toBe('block');

      // Clear lockout
      testLockout.clearLockout('src/auth.ts');

      // Now should allow
      const result = await testPipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });
  });

  describe('PII scrub applies across tool outputs', () => {
    it('should scrub emails from different tool outputs', async () => {
      const tools = ['view', 'grep', 'squad_memory', 'powershell'];
      
      for (const toolName of tools) {
        const ctx: PostToolUseContext = {
          toolName,
          arguments: {},
          result: 'Found: admin@company.com in the logs',
          agentName: 'agent',
          sessionId: 'session-1',
        };

        const result = await pipeline.runPostToolHooks(ctx);
        expect(result.result).toBe('Found: [EMAIL_REDACTED] in the logs');
      }
    });

    it('should scrub nested emails in structured outputs', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: {
          users: [
            { name: 'Alice', email: 'alice@example.com' },
            { name: 'Bob', email: 'bob@company.org' },
          ],
        },
        agentName: 'agent',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as any;
      
      expect(scrubbed.users[0].email).toBe('[EMAIL_REDACTED]');
      expect(scrubbed.users[1].email).toBe('[EMAIL_REDACTED]');
      expect(scrubbed.users[0].name).toBe('Alice');
    });
  });

  describe('Rate limiting persists across multiple tool calls', () => {
    it('should track ask_user calls across session', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Question?' },
        agentName: 'agent',
        sessionId: 'session-123',
      };

      // First call - allowed
      const result1 = await pipeline.runPreToolHooks(ctx);
      expect(result1.action).toBe('allow');

      // Second call - allowed (limit is 2)
      const result2 = await pipeline.runPreToolHooks(ctx);
      expect(result2.action).toBe('allow');

      // Third call - blocked
      const result3 = await pipeline.runPreToolHooks(ctx);
      expect(result3.action).toBe('block');
      expect(result3.reason).toContain('rate limit');
    });

    it('should track limits independently per session', async () => {
      const session1: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Q1?' },
        agentName: 'agent',
        sessionId: 'session-1',
      };

      const session2: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Q2?' },
        agentName: 'agent',
        sessionId: 'session-2',
      };

      // Exhaust session-1
      await pipeline.runPreToolHooks(session1);
      await pipeline.runPreToolHooks(session1);
      const blocked = await pipeline.runPreToolHooks(session1);
      expect(blocked.action).toBe('block');

      // session-2 should still work
      const result = await pipeline.runPreToolHooks(session2);
      expect(result.action).toBe('allow');
    });
  });

  describe('Multiple hooks compose correctly', () => {
    it('should apply file write guard before lockout check', async () => {
      lockout.lockout('src/auth.ts', 'reviewer-1');

      // This should be blocked by file-write guard first (not in allowed paths)
      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/auth.ts' },
        agentName: 'reviewer-1',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      // File write guard should trigger first
      expect(result.reason).toContain('File write blocked');
    });

    it('should stop at first blocking hook', async () => {
      const executionOrder: string[] = [];

      const newPipeline = new HookPipeline();
      
      newPipeline.addPreToolHook(async (ctx) => {
        executionOrder.push('hook-1-allow');
        return { action: 'allow' };
      });

      newPipeline.addPreToolHook(async (ctx) => {
        executionOrder.push('hook-2-block');
        return { action: 'block', reason: 'Blocked by hook 2' };
      });

      newPipeline.addPreToolHook(async (ctx) => {
        executionOrder.push('hook-3-should-not-run');
        return { action: 'allow' };
      });

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'test.ts' },
        agentName: 'agent',
        sessionId: 'session-1',
      };

      const result = await newPipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(executionOrder).toEqual(['hook-1-allow', 'hook-2-block']);
    });

    it('should execute all post-tool hooks in sequence', async () => {
      const executionOrder: string[] = [];

      const newPipeline = new HookPipeline({ scrubPii: true });

      newPipeline.addPostToolHook(async (ctx) => {
        executionOrder.push('hook-1');
        return { result: ctx.result };
      });

      newPipeline.addPostToolHook(async (ctx) => {
        executionOrder.push('hook-2');
        return { result: ctx.result };
      });

      const ctx: PostToolUseContext = {
        toolName: 'view',
        arguments: {},
        result: 'test@example.com',
        agentName: 'agent',
        sessionId: 'session-1',
      };

      const result = await newPipeline.runPostToolHooks(ctx);
      
      // PII scrubbing should have happened
      expect(result.result).toBe('[EMAIL_REDACTED]');
      
      // All hooks should execute
      expect(executionOrder.length).toBeGreaterThan(0);
    });
  });
});

describe('Integration: Session Pool + Event Bus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('Sessions emit events that event bus delivers', () => {
    it('should emit and receive session:created event', async () => {
      const receivedEvents: SquadEvent[] = [];

      eventBus.subscribe('session:created', (event) => {
        receivedEvents.push(event);
      });

      const event: SquadEvent = {
        type: 'session:created',
        sessionId: 'session-1',
        agentName: 'fenster',
        payload: { model: 'claude-sonnet-4.5' },
        timestamp: new Date(),
      };

      await eventBus.emit(event);

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].sessionId).toBe('session-1');
      expect(receivedEvents[0].agentName).toBe('fenster');
    });

    it('should emit and receive multiple event types', async () => {
      const events: SquadEvent[] = [];

      eventBus.subscribe('session:created', (e) => events.push(e));
      eventBus.subscribe('session:idle', (e) => events.push(e));
      eventBus.subscribe('session:error', (e) => events.push(e));

      await eventBus.emit({
        type: 'session:created',
        sessionId: 's1',
        payload: {},
        timestamp: new Date(),
      });

      await eventBus.emit({
        type: 'session:idle',
        sessionId: 's1',
        payload: {},
        timestamp: new Date(),
      });

      await eventBus.emit({
        type: 'session:error',
        sessionId: 's1',
        payload: { error: 'Test error' },
        timestamp: new Date(),
      });

      expect(events.length).toBe(3);
      expect(events[0].type).toBe('session:created');
      expect(events[1].type).toBe('session:idle');
      expect(events[2].type).toBe('session:error');
    });

    it('should support wildcard handlers for all events', async () => {
      const allEvents: SquadEvent[] = [];

      eventBus.subscribeAll((event) => {
        allEvents.push(event);
      });

      await eventBus.emit({
        type: 'session:created',
        sessionId: 's1',
        payload: {},
        timestamp: new Date(),
      });

      await eventBus.emit({
        type: 'session:message',
        sessionId: 's1',
        payload: { text: 'Hello' },
        timestamp: new Date(),
      });

      expect(allEvents.length).toBe(2);
    });

    it('should unsubscribe handlers', async () => {
      const events: SquadEvent[] = [];

      const unsubscribe = eventBus.subscribe('session:created', (e) => events.push(e));

      await eventBus.emit({
        type: 'session:created',
        sessionId: 's1',
        payload: {},
        timestamp: new Date(),
      });

      expect(events.length).toBe(1);

      // Unsubscribe
      unsubscribe();

      await eventBus.emit({
        type: 'session:created',
        sessionId: 's2',
        payload: {},
        timestamp: new Date(),
      });

      // Should not receive second event
      expect(events.length).toBe(1);
    });
  });

  describe('Error isolation in event handlers', () => {
    it('should isolate errors in one handler from others', async () => {
      const received: string[] = [];

      eventBus.subscribe('session:created', () => {
        received.push('handler-1');
      });

      eventBus.subscribe('session:created', () => {
        received.push('handler-2-error');
        throw new Error('Handler 2 failed');
      });

      eventBus.subscribe('session:created', () => {
        received.push('handler-3');
      });

      await eventBus.emit({
        type: 'session:created',
        sessionId: 's1',
        payload: {},
        timestamp: new Date(),
      });

      // All handlers should have executed despite error in handler-2
      expect(received).toContain('handler-1');
      expect(received).toContain('handler-2-error');
      expect(received).toContain('handler-3');
    });
  });
});

describe('Integration: Error Hierarchy', () => {
  describe('Tool failure wraps with ErrorFactory', () => {
    it('should wrap tool execution error', () => {
      const originalError = new Error('Tool execution failed');
      
      const wrappedError = ErrorFactory.wrap(originalError, {
        sessionId: 'session-1',
        agentName: 'fenster',
        toolName: 'squad_route',
      });

      expect(wrappedError).toBeInstanceOf(SquadError);
      expect(wrappedError.category).toBe(ErrorCategory.TOOL_EXECUTION);
      expect(wrappedError.context.toolName).toBe('squad_route');
      expect(wrappedError.originalError).toBe(originalError);
    });

    it('should detect specific error types from messages', () => {
      const connError = ErrorFactory.wrap(new Error('ECONNREFUSED: connection refused'), {});
      expect(connError.category).toBe(ErrorCategory.SDK_CONNECTION);

      const authError = ErrorFactory.wrap(new Error('Authentication failed: invalid token'), {});
      expect(authError.category).toBe(ErrorCategory.AUTH);

      const configError = ErrorFactory.wrap(new Error('invalid configuration: Missing required field'), {});
      expect(configError.category).toBe(ErrorCategory.CONFIGURATION);
    });

    it('should detect and wrap rate limit errors', () => {
      const rateLimitMessage = 'API quota exceeded. retry after 60 seconds';
      const error = ErrorFactory.wrap(new Error(rateLimitMessage), {});

      expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(error.message).toContain('quota exceeded');
      
      if (error instanceof RateLimitError) {
        expect(error.retryAfter).toBe(60);
      }
    });
  });

  describe('TelemetryCollector captures tool execution metrics', () => {
    let collector: TelemetryCollector;

    beforeEach(() => {
      collector = new TelemetryCollector();
    });

    it('should track tool execution start and success', () => {
      const telemetryPoints: any[] = [];
      collector.onData((point) => telemetryPoints.push(point));

      const stopwatch = collector.start('squad_route', {
        sessionId: 'session-1',
        agentName: 'fenster',
        metadata: { targetAgent: 'brady' },
      });

      stopwatch.success();

      expect(telemetryPoints.length).toBe(1);
      expect(telemetryPoints[0].operation).toBe('squad_route');
      expect(telemetryPoints[0].success).toBe(true);
      expect(telemetryPoints[0].sessionId).toBe('session-1');
      expect(telemetryPoints[0].agentName).toBe('fenster');
    });

    it('should track tool execution failure', () => {
      const telemetryPoints: any[] = [];
      collector.onData((point) => telemetryPoints.push(point));

      const stopwatch = collector.start('squad_decide', {
        sessionId: 'session-1',
      });

      stopwatch.failure(new Error('Write failed'));

      expect(telemetryPoints.length).toBe(1);
      expect(telemetryPoints[0].operation).toBe('squad_decide');
      expect(telemetryPoints[0].success).toBe(false);
      expect(telemetryPoints[0].errorCategory).toBeDefined();
    });

    it('should measure execution duration', async () => {
      const telemetryPoints: any[] = [];
      collector.onData((point) => telemetryPoints.push(point));

      const stopwatch = collector.start('squad_memory', {});

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));

      stopwatch.success();

      expect(telemetryPoints.length).toBe(1);
      expect(telemetryPoints[0].duration).toBeGreaterThanOrEqual(5);
    });

    it('should track multiple operations independently', () => {
      const telemetryPoints: any[] = [];
      collector.onData((point) => telemetryPoints.push(point));

      // Track multiple operations
      const stopwatch1 = collector.start('squad_route', {});
      stopwatch1.success();

      const stopwatch2 = collector.start('squad_decide', {});
      stopwatch2.success();

      const stopwatch3 = collector.start('squad_route', {});
      stopwatch3.failure(new Error('Failed'));

      expect(telemetryPoints.length).toBe(3);
      expect(telemetryPoints.filter(p => p.operation === 'squad_route').length).toBe(2);
      expect(telemetryPoints.filter(p => p.success).length).toBe(2);
      expect(telemetryPoints.filter(p => !p.success).length).toBe(1);
    });
  });

  describe('Error context includes session and agent info', () => {
    it('should include full context in error', () => {
      const originalError = new Error('Tool failed');
      const error = ErrorFactory.wrap(originalError, {
        sessionId: 'session-123',
        agentName: 'fenster',
        toolName: 'squad_route',
        metadata: {
          targetAgent: 'brady',
          attempt: 1,
        },
      });

      expect(error.context.sessionId).toBe('session-123');
      expect(error.context.agentName).toBe('fenster');
      expect(error.context.toolName).toBe('squad_route');
      expect(error.context.metadata?.targetAgent).toBe('brady');
      expect(error.context.timestamp).toBeInstanceOf(Date);
    });

    it('should serialize error to JSON with context', () => {
      const originalError = new Error('Test error');
      const error = ErrorFactory.wrap(originalError, {
        sessionId: 'session-1',
        agentName: 'agent',
        toolName: 'test_tool',
      });

      const json = error.toJSON();
      
      expect(json.message).toContain('Test error');
      expect(json.category).toBeDefined();
      expect(json.severity).toBeDefined();
      expect(json.context.sessionId).toBe('session-1');
      expect(json.context.agentName).toBe('agent');
      expect(json.recoverable).toBeDefined();
    });

    it('should provide user-friendly error messages', () => {
      const originalError = new Error('Missing model field');
      const configError = ErrorFactory.wrap(originalError, {});
      const userMessage = configError.getUserMessage();
      
      expect(userMessage.length).toBeGreaterThan(0);
      expect(userMessage).not.toContain('undefined');
    });
  });
});

describe('Integration: End-to-End Scenarios', () => {
  let registry: ToolRegistry;
  let pipeline: HookPipeline;
  let eventBus: EventBus;
  let testRoot: string;

  beforeEach(() => {
    testRoot = path.join('.', '.test-e2e-' + randomUUID());
    registry = new ToolRegistry(testRoot);
    
    const config: PolicyConfig = {
      allowedWritePaths: ['.test-e2e-*/**'],
      scrubPii: true,
      maxAskUserPerSession: 3,
    };
    pipeline = new HookPipeline(config);
    eventBus = new EventBus();
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('should execute complete tool pipeline with hooks and events', async () => {
    const events: SquadEvent[] = [];
    eventBus.subscribeAll((e) => events.push(e));

    // Emit session created
    await eventBus.emit({
      type: 'session:created',
      sessionId: 'session-1',
      agentName: 'fenster',
      payload: { model: 'claude-sonnet-4.5' },
      timestamp: new Date(),
    });

    // Pre-tool hook check
    const preCtx: PreToolUseContext = {
      toolName: 'squad_decide',
      arguments: { author: 'fenster', summary: 'Test', body: 'Content' },
      agentName: 'fenster',
      sessionId: 'session-1',
    };

    const preResult = await pipeline.runPreToolHooks(preCtx);
    expect(preResult.action).toBe('allow');

    // Execute tool
    const tool = registry.getTool('squad_decide')!;
    const toolResult = await tool.handler(
      {
        author: 'fenster',
        summary: 'Integration test decision',
        body: 'This decision was made during integration testing.',
      },
      {
        sessionId: 'session-1',
        toolCallId: 'call-1',
        toolName: 'squad_decide',
        arguments: {},
      }
    );

    expect(toolResult.resultType).toBe('success');

    // Post-tool hook (PII scrubbing)
    const postCtx: PostToolUseContext = {
      toolName: 'squad_decide',
      arguments: {},
      result: toolResult,
      agentName: 'fenster',
      sessionId: 'session-1',
    };

    const postResult = await pipeline.runPostToolHooks(postCtx);
    expect(postResult.result).toBeDefined();

    // Emit tool completion event
    await eventBus.emit({
      type: 'session:tool_call',
      sessionId: 'session-1',
      agentName: 'fenster',
      payload: { toolName: 'squad_decide', success: true },
      timestamp: new Date(),
    });

    // Verify events were captured
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('session:created');
    expect(events[1].type).toBe('session:tool_call');

    // Verify file was written
    const inboxDir = path.join(testRoot, 'decisions', 'inbox');
    expect(fs.existsSync(inboxDir)).toBe(true);
  });
});
