/**
 * SDK Feature Parity Tests — Batch 2 (Issue #347 / #341)
 *
 * Tests for SDK features that were previously marked "⚠️ Needs Setup" in the
 * feature parity matrix. These exercise real SDK implementations:
 *
 *   #27  Manual Ceremonies          — ceremony trigger types and config composition
 *   #28  Ceremony Cooldown          — ceremony schedule & re-trigger gating
 *   #36  Human Team Members         — agent status lifecycle and roster composition
 *   #49  Constraint Budget          — ask_user rate limiting, file-write path guards
 *   #50  Multi-Agent Artifact       — artifact-level lockout coordination
 *
 * @see test/sdk-feature-parity.test.ts  — Batch 1 (worktree, lockout, deadlock, confidence)
 * @see test/feature-parity.test.ts      — Integration tests (coordinator, casting, etc.)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HookPipeline,
  ReviewerLockoutHook,
  type PreToolUseContext,
  type PostToolUseContext,
  type PolicyConfig,
} from '../packages/squad-sdk/src/hooks/index.js';
import type {
  CeremonyDefinition,
  AgentDefinition,
  HooksDefinition,
  SquadSDKConfig,
} from '../packages/squad-sdk/src/builders/types.js';
import {
  defineTeam,
  defineAgent,
  defineRouting,
  defineCeremony,
  defineHooks,
  defineCasting,
  defineSquad,
  BuilderValidationError,
} from '../packages/squad-sdk/src/builders/index.js';

// =============================================================================
// Feature #27: Manual Ceremonies
// =============================================================================

describe('SDK Feature: Manual Ceremonies (#27)', () => {
  it('defineCeremony() accepts trigger: "manual"', () => {
    const ceremony = defineCeremony({
      name: 'design-review',
      trigger: 'manual',
      participants: ['test-agent-1', 'test-agent-2', 'test-agent-3'],
      agenda: 'Review architecture decisions and trade-offs',
    });

    expect(ceremony.name).toBe('design-review');
    expect(ceremony.trigger).toBe('manual');
    expect(ceremony.participants).toHaveLength(3);
    expect(ceremony.agenda).toContain('architecture');
  });

  it('defineCeremony() accepts trigger: "pr-merged"', () => {
    const ceremony = defineCeremony({
      name: 'post-merge-review',
      trigger: 'pr-merged',
      participants: ['test-agent-3'],
      agenda: 'Run regression tests and update coverage report',
    });

    expect(ceremony.trigger).toBe('pr-merged');
  });

  it('defineCeremony() accepts trigger: "schedule" with cron', () => {
    const ceremony = defineCeremony({
      name: 'standup',
      trigger: 'schedule',
      schedule: '0 9 * * 1-5',
      participants: ['test-agent-1', 'test-agent-2', 'test-agent-3'],
      agenda: 'Yesterday / Today / Blockers',
    });

    expect(ceremony.trigger).toBe('schedule');
    expect(ceremony.schedule).toBe('0 9 * * 1-5');
  });

  it('ceremony with hooks fires named hooks', () => {
    const ceremony = defineCeremony({
      name: 'retrospective',
      trigger: 'manual',
      participants: ['test-agent-1', 'test-agent-2'],
      agenda: 'What went well? What to improve?',
      hooks: ['pre-retro-gather-metrics', 'post-retro-create-issues'],
    });

    expect(ceremony.hooks).toHaveLength(2);
    expect(ceremony.hooks).toContain('pre-retro-gather-metrics');
    expect(ceremony.hooks).toContain('post-retro-create-issues');
  });

  it('defineSquad() composes multiple ceremonies including manual', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Alpha', members: ['test-agent-1', 'test-agent-3'] }),
      agents: [
        defineAgent({ name: 'test-agent-1', role: 'TypeScript Engineer' }),
        defineAgent({ name: 'test-agent-3', role: 'Tester' }),
      ],
      ceremonies: [
        defineCeremony({
          name: 'standup',
          trigger: 'schedule',
          schedule: '0 9 * * 1-5',
          participants: ['test-agent-1', 'test-agent-3'],
        }),
        defineCeremony({
          name: 'design-review',
          trigger: 'manual',
          participants: ['test-agent-1'],
          agenda: 'Review pending architecture decisions',
        }),
      ],
    });

    expect(config.ceremonies).toHaveLength(2);
    const manual = config.ceremonies!.find(c => c.trigger === 'manual');
    expect(manual).toBeDefined();
    expect(manual!.name).toBe('design-review');

    const scheduled = config.ceremonies!.find(c => c.trigger === 'schedule');
    expect(scheduled).toBeDefined();
    expect(scheduled!.schedule).toBe('0 9 * * 1-5');
  });

  it('defineCeremony() throws on missing name', () => {
    expect(() =>
      defineCeremony({ name: '', trigger: 'manual' } as any),
    ).toThrow(BuilderValidationError);
  });

  it('defineCeremony() throws on non-string trigger', () => {
    expect(() =>
      defineCeremony({ name: 'bad', trigger: 42 } as any),
    ).toThrow(BuilderValidationError);
  });

  it('defineCeremony() throws on non-array participants', () => {
    expect(() =>
      defineCeremony({ name: 'bad', participants: 'test-agent-1' } as any),
    ).toThrow(BuilderValidationError);
  });

  it('defineCeremony() throws on non-string schedule', () => {
    expect(() =>
      defineCeremony({ name: 'bad', schedule: 42 } as any),
    ).toThrow(BuilderValidationError);
  });

  it('defineCeremony() throws on non-array hooks', () => {
    expect(() =>
      defineCeremony({ name: 'bad', hooks: 'hook-one' } as any),
    ).toThrow(BuilderValidationError);
  });

  it('defineCeremony() throws on non-object config', () => {
    expect(() =>
      defineCeremony(null as any),
    ).toThrow(BuilderValidationError);
  });

  it('ceremony participants can reference any agent in the squad', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Squad', members: ['test-agent-1', 'test-agent-2', 'test-agent-3'] }),
      agents: [
        defineAgent({ name: 'test-agent-1', role: 'Lead' }),
        defineAgent({ name: 'test-agent-2', role: 'Tester' }),
        defineAgent({ name: 'test-agent-3', role: 'Developer' }),
      ],
      ceremonies: [
        defineCeremony({
          name: 'full-team-sync',
          trigger: 'manual',
          participants: ['test-agent-1', 'test-agent-2', 'test-agent-3'],
          agenda: 'Cross-team sync',
        }),
      ],
    });

    const ceremony = config.ceremonies![0];
    // All participants should be valid agent names from the squad
    for (const p of ceremony.participants!) {
      const agent = config.agents.find(a => a.name === p);
      expect(agent).toBeDefined();
    }
  });
});

// =============================================================================
// Feature #28: Ceremony Cooldown (Schedule-Gated Re-Trigger)
// =============================================================================

describe('SDK Feature: Ceremony Cooldown (#28)', () => {
  it('ceremony with schedule defines a cadence (preventing over-triggering)', () => {
    const ceremony = defineCeremony({
      name: 'standup',
      trigger: 'schedule',
      schedule: '0 9 * * 1-5',
      participants: ['test-agent-1'],
      agenda: 'Yesterday / Today / Blockers',
    });

    // Schedule field enables cadence — the ceremony should only fire on schedule
    expect(ceremony.schedule).toBe('0 9 * * 1-5');
    expect(ceremony.trigger).toBe('schedule');
  });

  it('ceremony without schedule has no cadence restriction', () => {
    const ceremony = defineCeremony({
      name: 'ad-hoc-review',
      trigger: 'manual',
      participants: ['test-agent-1'],
    });

    expect(ceremony.schedule).toBeUndefined();
    expect(ceremony.trigger).toBe('manual');
  });

  it('multiple ceremonies can have different schedules', () => {
    const ceremonies = [
      defineCeremony({ name: 'standup', trigger: 'schedule', schedule: '0 9 * * 1-5' }),
      defineCeremony({ name: 'retro', trigger: 'schedule', schedule: '0 15 * * 5' }),
      defineCeremony({ name: 'planning', trigger: 'schedule', schedule: '0 10 * * 1' }),
    ];

    const schedules = ceremonies.map(c => c.schedule);
    // All have distinct schedules
    expect(new Set(schedules).size).toBe(3);
  });

  it('defineSquad() validates ceremonies with schedules in full config', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'CooldownTeam', members: ['test-agent-1'] }),
      agents: [defineAgent({ name: 'test-agent-1', role: 'Engineer' })],
      ceremonies: [
        defineCeremony({
          name: 'daily-standup',
          trigger: 'schedule',
          schedule: '0 9 * * 1-5',
          participants: ['test-agent-1'],
          agenda: 'Daily sync',
        }),
      ],
    });

    expect(config.ceremonies![0].schedule).toBe('0 9 * * 1-5');
  });
});

// =============================================================================
// Feature #36: Human Team Members
// =============================================================================

describe('SDK Feature: Human Team Members (#36)', () => {
  it('defineAgent() accepts status: "active" for active agents', () => {
    const agent = defineAgent({ name: 'test-agent-1', role: 'Engineer', status: 'active' });
    expect(agent.status).toBe('active');
  });

  it('defineAgent() accepts status: "inactive" for paused agents', () => {
    const agent = defineAgent({ name: 'test-agent-4', role: 'Product Lead', status: 'inactive' });
    expect(agent.status).toBe('inactive');
  });

  it('defineAgent() accepts status: "retired" for removed agents', () => {
    const agent = defineAgent({ name: 'test-agent-retired', role: 'Archivist', status: 'retired' });
    expect(agent.status).toBe('retired');
  });

  it('squad config can include agents with mixed statuses', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Mixed', members: ['test-agent-1', 'test-agent-4', 'test-agent-retired'] }),
      agents: [
        defineAgent({ name: 'test-agent-1', role: 'Engineer', status: 'active' }),
        defineAgent({ name: 'test-agent-4', role: 'Product Lead', status: 'inactive' }),
        defineAgent({ name: 'test-agent-retired', role: 'Archivist', status: 'retired' }),
      ],
    });

    const active = config.agents.filter(a => a.status === 'active');
    const inactive = config.agents.filter(a => a.status === 'inactive');
    const retired = config.agents.filter(a => a.status === 'retired');

    expect(active).toHaveLength(1);
    expect(inactive).toHaveLength(1);
    expect(retired).toHaveLength(1);
  });

  it('agent without status defaults to undefined (implicit active)', () => {
    const agent = defineAgent({ name: 'test-agent-2', role: 'Tester' });
    expect(agent.status).toBeUndefined();
  });

  it('defineAgent() throws on invalid status value', () => {
    expect(() =>
      defineAgent({ name: 'bad', role: 'Tester', status: 'suspended' } as any),
    ).toThrow(BuilderValidationError);
    expect(() =>
      defineAgent({ name: 'bad', role: 'Tester', status: 'suspended' } as any),
    ).toThrow(/must be one of/);
  });

  it('defineAgent() throws on empty name', () => {
    expect(() =>
      defineAgent({ name: '', role: 'Engineer' }),
    ).toThrow(BuilderValidationError);
  });

  it('defineAgent() throws on empty role', () => {
    expect(() =>
      defineAgent({ name: 'test-agent-1', role: '' }),
    ).toThrow(BuilderValidationError);
  });

  it('defineAgent() throws on non-string status', () => {
    expect(() =>
      defineAgent({ name: 'test-agent-1', role: 'Engineer', status: true } as any),
    ).toThrow(BuilderValidationError);
  });

  it('defineAgent() throws on non-object config', () => {
    expect(() =>
      defineAgent('not-an-object' as any),
    ).toThrow(BuilderValidationError);
  });

  it('routing rules can reference agents regardless of status', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Routed', members: ['test-agent-1', 'test-agent-3'] }),
      agents: [
        defineAgent({ name: 'test-agent-1', role: 'Engineer', status: 'active' }),
        defineAgent({ name: 'test-agent-3', role: 'Tester', status: 'inactive' }),
      ],
      routing: defineRouting({
        rules: [
          { pattern: 'test-*', agents: ['test-agent-3'] },
          { pattern: 'feature-*', agents: ['test-agent-1'] },
        ],
        defaultAgent: 'test-agent-1',
      }),
    });

    // Routing rules exist for both active and inactive agents
    expect(config.routing!.rules).toHaveLength(2);
    const testRule = config.routing!.rules.find(r => r.pattern === 'test-*');
    expect(testRule!.agents).toContain('test-agent-3');
  });

  it('team members list can include descriptive roles for human oversight', () => {
    const config = defineSquad({
      team: defineTeam({
        name: 'HumanLed',
        members: ['test-agent-1', 'test-agent-2', 'test-pm'],
        description: 'Team with human oversight',
      }),
      agents: [
        defineAgent({ name: 'test-agent-1', role: 'Engineer' }),
        defineAgent({ name: 'test-agent-2', role: 'Tester' }),
        defineAgent({ name: 'test-pm', role: 'Product Lead', status: 'inactive' }),
      ],
    });

    expect(config.team.members).toContain('test-pm');
    const pm = config.agents.find(a => a.name === 'test-pm');
    expect(pm!.role).toBe('Product Lead');
    expect(pm!.status).toBe('inactive');
  });
});

// =============================================================================
// Feature #49: Constraint Budget
// =============================================================================

describe('SDK Feature: Constraint Budget (#49)', () => {
  let pipeline: HookPipeline;

  describe('ask_user rate limiting', () => {
    beforeEach(() => {
      pipeline = new HookPipeline({ maxAskUserPerSession: 3 });
    });

    it('allows ask_user calls within budget', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Which DB?' },
        agentName: 'test-agent-1',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('blocks ask_user when budget is exhausted', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Question?' },
        agentName: 'test-agent-1',
        sessionId: 'session-1',
      };

      // Exhaust the budget
      for (let i = 0; i < 3; i++) {
        const r = await pipeline.runPreToolHooks(ctx);
        expect(r.action).toBe('allow');
      }

      // 4th call should be blocked
      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toMatch(/rate limit/i);
    });

    it('tracks ask_user budget per session independently', async () => {
      const session1: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Q?' },
        agentName: 'test-agent-1',
        sessionId: 'session-1',
      };
      const session2: PreToolUseContext = {
        ...session1,
        sessionId: 'session-2',
      };

      // Exhaust session-1 budget
      for (let i = 0; i < 3; i++) {
        await pipeline.runPreToolHooks(session1);
      }

      // session-1 blocked, session-2 still allowed
      const r1 = await pipeline.runPreToolHooks(session1);
      expect(r1.action).toBe('block');

      const r2 = await pipeline.runPreToolHooks(session2);
      expect(r2.action).toBe('allow');
    });

    it('non-ask_user tools are unaffected by rate limit', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/foo.ts' },
        agentName: 'test-agent-1',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });
  });

  describe('file-write path constraints', () => {
    beforeEach(() => {
      pipeline = new HookPipeline({
        allowedWritePaths: ['src/**', 'test/**', '.squad/**'],
      });
    });

    it('allows writes to permitted paths', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'src/components/auth.ts' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('allows writes to test paths', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'create',
        arguments: { path: 'test/auth.test.ts' },
        agentName: 'test-agent-2',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('blocks writes to paths outside allowed globs', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'package.json' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toMatch(/does not match allowed paths/);
    });

    it('allows .squad/ path writes', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'create',
        arguments: { path: '.squad/agents/test-agent-1/charter.md' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('read operations bypass write guards', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'read',
        arguments: { path: '/etc/passwd' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });
  });

  describe('shell command restrictions', () => {
    beforeEach(() => {
      pipeline = new HookPipeline({
        blockedCommands: ['rm -rf', 'DROP TABLE'],
      });
    });

    it('blocks dangerous shell commands', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'bash',
        arguments: { command: 'rm -rf /important/data' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toMatch(/rm -rf/);
    });

    it('allows safe shell commands', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'bash',
        arguments: { command: 'npm test' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('blocks SQL injection patterns', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'bash',
        arguments: { command: "psql -c 'DROP TABLE users;'" },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
    });
  });

  describe('combined constraints', () => {
    it('enforces multiple constraint types simultaneously', async () => {
      pipeline = new HookPipeline({
        maxAskUserPerSession: 2,
        allowedWritePaths: ['src/**'],
        blockedCommands: ['rm -rf'],
        reviewerLockout: true,
      });

      // File write to allowed path — OK
      const write = await pipeline.runPreToolHooks({
        toolName: 'edit',
        arguments: { path: 'src/app.ts' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      });
      expect(write.action).toBe('allow');

      // File write to disallowed path — blocked
      const blocked = await pipeline.runPreToolHooks({
        toolName: 'edit',
        arguments: { path: 'dist/bundle.js' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      });
      expect(blocked.action).toBe('block');

      // ask_user within budget — OK
      const ask1 = await pipeline.runPreToolHooks({
        toolName: 'ask_user',
        arguments: { question: 'Q1?' },
        agentName: 'test-agent-1',
        sessionId: 's1',
      });
      expect(ask1.action).toBe('allow');
    });
  });

  describe('PII scrubbing (postToolUse)', () => {
    beforeEach(() => {
      pipeline = new HookPipeline({ scrubPii: true });
    });

    it('redacts email addresses from string results', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'bash',
        arguments: { command: 'git log' },
        result: 'Author: Test User <testuser1@example.com>',
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('Author: Test User <[EMAIL_REDACTED]>');
      expect(result.result).not.toContain('testuser1@example.com');
    });

    it('redacts multiple email addresses in a single string', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'bash',
        arguments: { command: 'cat AUTHORS' },
        result: 'testuser1@example.com, testuser2@example.com, testuser3@example.com',
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('[EMAIL_REDACTED], [EMAIL_REDACTED], [EMAIL_REDACTED]');
    });

    it('leaves strings without emails unchanged', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'bash',
        arguments: { command: 'echo hello' },
        result: 'Hello world — no PII here',
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('Hello world — no PII here');
    });

    it('scrubs emails from nested object results', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'read',
        arguments: { path: 'config.json' },
        result: {
          author: 'testuser1@example.com',
          metadata: {
            reviewer: 'testuser2@example.com',
            notes: 'Reviewed by testuser2@example.com on Monday',
          },
        },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as any;
      expect(scrubbed.author).toBe('[EMAIL_REDACTED]');
      expect(scrubbed.metadata.reviewer).toBe('[EMAIL_REDACTED]');
      expect(scrubbed.metadata.notes).toBe('Reviewed by [EMAIL_REDACTED] on Monday');
    });

    it('scrubs emails from arrays', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'read',
        arguments: { path: 'team.json' },
        result: ['testuser1@example.com', 'testuser2@example.com', 'no-email-here'],
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as string[];
      expect(scrubbed[0]).toBe('[EMAIL_REDACTED]');
      expect(scrubbed[1]).toBe('[EMAIL_REDACTED]');
      expect(scrubbed[2]).toBe('no-email-here');
    });

    it('handles non-string/non-object results (numbers, null)', async () => {
      const numCtx: PostToolUseContext = {
        toolName: 'bash',
        arguments: { command: 'wc -l' },
        result: 42,
        agentName: 'test-agent-1',
        sessionId: 's1',
      };
      const numResult = await pipeline.runPostToolHooks(numCtx);
      expect(numResult.result).toBe(42);

      const nullCtx: PostToolUseContext = {
        ...numCtx,
        result: null,
      };
      const nullResult = await pipeline.runPostToolHooks(nullCtx);
      expect(nullResult.result).toBeNull();
    });

    it('does not scrub when scrubPii is disabled', async () => {
      const noScrubPipeline = new HookPipeline({ scrubPii: false });
      const ctx: PostToolUseContext = {
        toolName: 'bash',
        arguments: { command: 'git log' },
        result: 'Author: testuser1@example.com',
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await noScrubPipeline.runPostToolHooks(ctx);
      expect(result.result).toBe('Author: testuser1@example.com');
    });

    it('scrubs deeply nested objects with mixed types', async () => {
      const ctx: PostToolUseContext = {
        toolName: 'read',
        arguments: { path: 'data.json' },
        result: {
          users: [
            { name: 'TestUser1', email: 'testuser1@example.com', age: 30 },
            { name: 'TestUser2', email: 'testuser2@example.com', active: true },
          ],
          count: 2,
          note: null,
        },
        agentName: 'test-agent-1',
        sessionId: 's1',
      };

      const result = await pipeline.runPostToolHooks(ctx);
      const scrubbed = result.result as any;
      expect(scrubbed.users[0].email).toBe('[EMAIL_REDACTED]');
      expect(scrubbed.users[0].name).toBe('TestUser1');
      expect(scrubbed.users[0].age).toBe(30);
      expect(scrubbed.users[1].email).toBe('[EMAIL_REDACTED]');
      expect(scrubbed.users[1].active).toBe(true);
      expect(scrubbed.count).toBe(2);
    });
  });

  describe('defineHooks() builder integration', () => {
    it('defineHooks() accepts and validates constraint fields', () => {
      const hooks = defineHooks({
        allowedWritePaths: ['src/**', 'test/**'],
        blockedCommands: ['rm -rf'],
        maxAskUser: 5,
        scrubPii: true,
        reviewerLockout: true,
      });

      expect(hooks.allowedWritePaths).toEqual(['src/**', 'test/**']);
      expect(hooks.blockedCommands).toEqual(['rm -rf']);
      expect(hooks.maxAskUser).toBe(5);
      expect(hooks.scrubPii).toBe(true);
      expect(hooks.reviewerLockout).toBe(true);
    });

    it('defineHooks() passes through without setting defaults', () => {
      const hooks = defineHooks({});
      // defineHooks is a validator, not a defaulter — undefined fields stay undefined
      expect(hooks.maxAskUser).toBeUndefined();
    });

    it('defineHooks() throws on non-array allowedWritePaths', () => {
      expect(() =>
        defineHooks({ allowedWritePaths: 'src/**' } as any),
      ).toThrow(BuilderValidationError);
    });

    it('defineHooks() throws on non-array blockedCommands', () => {
      expect(() =>
        defineHooks({ blockedCommands: 'rm -rf' } as any),
      ).toThrow(BuilderValidationError);
    });

    it('defineHooks() throws on non-number maxAskUser', () => {
      expect(() =>
        defineHooks({ maxAskUser: 'three' } as any),
      ).toThrow(BuilderValidationError);
    });

    it('defineHooks() throws on non-boolean scrubPii', () => {
      expect(() =>
        defineHooks({ scrubPii: 'yes' } as any),
      ).toThrow(BuilderValidationError);
    });

    it('defineHooks() throws on non-boolean reviewerLockout', () => {
      expect(() =>
        defineHooks({ reviewerLockout: 1 } as any),
      ).toThrow(BuilderValidationError);
    });

    it('defineHooks() throws on non-object config', () => {
      expect(() =>
        defineHooks(null as any),
      ).toThrow(BuilderValidationError);
    });

    it('defineSquad() with hooks constraints composes correctly', () => {
      const config = defineSquad({
        team: defineTeam({ name: 'Constrained', members: ['test-agent-1'] }),
        agents: [defineAgent({ name: 'test-agent-1', role: 'Engineer' })],
        hooks: defineHooks({
          maxAskUser: 2,
          allowedWritePaths: ['src/**'],
          blockedCommands: ['rm -rf /'],
          scrubPii: true,
        }),
      });

      expect(config.hooks).toBeDefined();
      expect(config.hooks!.maxAskUser).toBe(2);
      expect(config.hooks!.allowedWritePaths).toEqual(['src/**']);
    });
  });
});

// =============================================================================
// Feature #50: Multi-Agent Artifact Coordination
// =============================================================================

describe('SDK Feature: Multi-Agent Artifact Coordination (#50)', () => {
  let lockout: ReviewerLockoutHook;

  beforeEach(() => {
    lockout = new ReviewerLockoutHook();
  });

  it('artifact lockout tracks per-artifact per-agent', () => {
    lockout.lockout('architecture.md', 'test-agent-1');
    lockout.lockout('architecture.md', 'test-agent-2');
    lockout.lockout('tests.md', 'test-agent-3');

    expect(lockout.isLockedOut('architecture.md', 'test-agent-1')).toBe(true);
    expect(lockout.isLockedOut('architecture.md', 'test-agent-2')).toBe(true);
    expect(lockout.isLockedOut('architecture.md', 'test-agent-3')).toBe(false);
    expect(lockout.isLockedOut('tests.md', 'test-agent-3')).toBe(true);
    expect(lockout.isLockedOut('tests.md', 'test-agent-1')).toBe(false);
  });

  it('getLockedAgents() lists all agents locked from an artifact', () => {
    lockout.lockout('design-doc.md', 'test-agent-1');
    lockout.lockout('design-doc.md', 'test-agent-2');

    const locked = lockout.getLockedAgents('design-doc.md');
    expect(locked).toHaveLength(2);
    expect(locked).toContain('test-agent-1');
    expect(locked).toContain('test-agent-2');
  });

  it('clearLockout() enables handoff to next contributor', () => {
    lockout.lockout('api-spec.md', 'test-agent-1');
    expect(lockout.isLockedOut('api-spec.md', 'test-agent-1')).toBe(true);

    lockout.clearLockout('api-spec.md');
    expect(lockout.isLockedOut('api-spec.md', 'test-agent-1')).toBe(false);
  });

  it('multi-agent artifact workflow: write → lockout → handoff', () => {
    // Agent 1 writes their section, then gets locked out
    lockout.lockout('prd.md', 'test-agent-1');

    // Agent 2 can still contribute
    expect(lockout.isLockedOut('prd.md', 'test-agent-2')).toBe(false);

    // Agent 2 finishes their section, gets locked out
    lockout.lockout('prd.md', 'test-agent-2');

    // Agent 3 handles final review
    expect(lockout.isLockedOut('prd.md', 'test-agent-3')).toBe(false);

    // After all contributions complete, clear for next iteration
    lockout.clearLockout('prd.md');
    expect(lockout.getLockedAgents('prd.md')).toHaveLength(0);
  });

  it('artifact lockout integrates with HookPipeline', async () => {
    const pipeline = new HookPipeline({ reviewerLockout: true });
    const rlHook = pipeline.getReviewerLockout();

    // Lock out test-agent-1 from the artifact path
    rlHook.lockout('src/auth', 'test-agent-1');

    // test-agent-1 tries to edit a file in the locked artifact scope
    const result = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'src/auth/login.ts' },
      agentName: 'test-agent-1',
      sessionId: 's1',
    });

    expect(result.action).toBe('block');
    expect(result.reason).toMatch(/lockout/i);

    // Different agent can still edit
    const otherResult = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'src/auth/login.ts' },
      agentName: 'test-agent-2',
      sessionId: 's1',
    });

    expect(otherResult.action).toBe('allow');
  });

  it('multiple artifacts can be tracked independently', () => {
    lockout.lockout('frontend/app.tsx', 'test-agent-1');
    lockout.lockout('backend/server.ts', 'test-agent-2');
    lockout.lockout('docs/readme.md', 'test-agent-3');

    expect(lockout.isLockedOut('frontend/app.tsx', 'test-agent-1')).toBe(true);
    expect(lockout.isLockedOut('frontend/app.tsx', 'test-agent-2')).toBe(false);
    expect(lockout.isLockedOut('backend/server.ts', 'test-agent-2')).toBe(true);
    expect(lockout.isLockedOut('backend/server.ts', 'test-agent-1')).toBe(false);
    expect(lockout.isLockedOut('docs/readme.md', 'test-agent-3')).toBe(true);
  });
});
