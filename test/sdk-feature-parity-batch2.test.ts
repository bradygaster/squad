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
} from '../packages/squad-sdk/src/builders/index.js';

// =============================================================================
// Feature #27: Manual Ceremonies
// =============================================================================

describe('SDK Feature: Manual Ceremonies (#27)', () => {
  it('defineCeremony() accepts trigger: "manual"', () => {
    const ceremony = defineCeremony({
      name: 'design-review',
      trigger: 'manual',
      participants: ['edie', 'fenster', 'hockney'],
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
      participants: ['hockney'],
      agenda: 'Run regression tests and update coverage report',
    });

    expect(ceremony.trigger).toBe('pr-merged');
  });

  it('defineCeremony() accepts trigger: "schedule" with cron', () => {
    const ceremony = defineCeremony({
      name: 'standup',
      trigger: 'schedule',
      schedule: '0 9 * * 1-5',
      participants: ['edie', 'fenster', 'hockney'],
      agenda: 'Yesterday / Today / Blockers',
    });

    expect(ceremony.trigger).toBe('schedule');
    expect(ceremony.schedule).toBe('0 9 * * 1-5');
  });

  it('ceremony with hooks fires named hooks', () => {
    const ceremony = defineCeremony({
      name: 'retrospective',
      trigger: 'manual',
      participants: ['edie', 'fenster'],
      agenda: 'What went well? What to improve?',
      hooks: ['pre-retro-gather-metrics', 'post-retro-create-issues'],
    });

    expect(ceremony.hooks).toHaveLength(2);
    expect(ceremony.hooks).toContain('pre-retro-gather-metrics');
    expect(ceremony.hooks).toContain('post-retro-create-issues');
  });

  it('defineSquad() composes multiple ceremonies including manual', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Alpha', members: ['edie', 'hockney'] }),
      agents: [
        defineAgent({ name: 'edie', role: 'TypeScript Engineer' }),
        defineAgent({ name: 'hockney', role: 'Tester' }),
      ],
      ceremonies: [
        defineCeremony({
          name: 'standup',
          trigger: 'schedule',
          schedule: '0 9 * * 1-5',
          participants: ['edie', 'hockney'],
        }),
        defineCeremony({
          name: 'design-review',
          trigger: 'manual',
          participants: ['edie'],
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

  it('ceremony participants can reference any agent in the squad', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Squad', members: ['edie', 'fenster', 'hockney'] }),
      agents: [
        defineAgent({ name: 'edie', role: 'Lead' }),
        defineAgent({ name: 'fenster', role: 'Tester' }),
        defineAgent({ name: 'hockney', role: 'Developer' }),
      ],
      ceremonies: [
        defineCeremony({
          name: 'full-team-sync',
          trigger: 'manual',
          participants: ['edie', 'fenster', 'hockney'],
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
      participants: ['edie'],
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
      participants: ['edie'],
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
      team: defineTeam({ name: 'CooldownTeam', members: ['edie'] }),
      agents: [defineAgent({ name: 'edie', role: 'Engineer' })],
      ceremonies: [
        defineCeremony({
          name: 'daily-standup',
          trigger: 'schedule',
          schedule: '0 9 * * 1-5',
          participants: ['edie'],
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
    const agent = defineAgent({ name: 'edie', role: 'Engineer', status: 'active' });
    expect(agent.status).toBe('active');
  });

  it('defineAgent() accepts status: "inactive" for paused agents', () => {
    const agent = defineAgent({ name: 'alice', role: 'Product Lead', status: 'inactive' });
    expect(agent.status).toBe('inactive');
  });

  it('defineAgent() accepts status: "retired" for removed agents', () => {
    const agent = defineAgent({ name: 'old-bot', role: 'Archivist', status: 'retired' });
    expect(agent.status).toBe('retired');
  });

  it('squad config can include agents with mixed statuses', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Mixed', members: ['edie', 'alice', 'old-bot'] }),
      agents: [
        defineAgent({ name: 'edie', role: 'Engineer', status: 'active' }),
        defineAgent({ name: 'alice', role: 'Product Lead', status: 'inactive' }),
        defineAgent({ name: 'old-bot', role: 'Archivist', status: 'retired' }),
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
    const agent = defineAgent({ name: 'fenster', role: 'Tester' });
    expect(agent.status).toBeUndefined();
  });

  it('routing rules can reference agents regardless of status', () => {
    const config = defineSquad({
      team: defineTeam({ name: 'Routed', members: ['edie', 'hockney'] }),
      agents: [
        defineAgent({ name: 'edie', role: 'Engineer', status: 'active' }),
        defineAgent({ name: 'hockney', role: 'Tester', status: 'inactive' }),
      ],
      routing: defineRouting({
        rules: [
          { pattern: 'test-*', agents: ['hockney'] },
          { pattern: 'feature-*', agents: ['edie'] },
        ],
        defaultAgent: 'edie',
      }),
    });

    // Routing rules exist for both active and inactive agents
    expect(config.routing!.rules).toHaveLength(2);
    const testRule = config.routing!.rules.find(r => r.pattern === 'test-*');
    expect(testRule!.agents).toContain('hockney');
  });

  it('team members list can include descriptive roles for human oversight', () => {
    const config = defineSquad({
      team: defineTeam({
        name: 'HumanLed',
        members: ['edie', 'fenster', 'project-manager'],
        description: 'Team with human oversight',
      }),
      agents: [
        defineAgent({ name: 'edie', role: 'Engineer' }),
        defineAgent({ name: 'fenster', role: 'Tester' }),
        defineAgent({ name: 'project-manager', role: 'Product Lead', status: 'inactive' }),
      ],
    });

    expect(config.team.members).toContain('project-manager');
    const pm = config.agents.find(a => a.name === 'project-manager');
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
        agentName: 'edie',
        sessionId: 'session-1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('blocks ask_user when budget is exhausted', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'ask_user',
        arguments: { question: 'Question?' },
        agentName: 'edie',
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
        agentName: 'edie',
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
        agentName: 'edie',
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
        agentName: 'edie',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('allows writes to test paths', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'create',
        arguments: { path: 'test/auth.test.ts' },
        agentName: 'fenster',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('blocks writes to paths outside allowed globs', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'edit',
        arguments: { path: 'package.json' },
        agentName: 'edie',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toMatch(/does not match allowed paths/);
    });

    it('allows .squad/ path writes', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'create',
        arguments: { path: '.squad/agents/edie/charter.md' },
        agentName: 'edie',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('read operations bypass write guards', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'read',
        arguments: { path: '/etc/passwd' },
        agentName: 'edie',
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
        agentName: 'edie',
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
        agentName: 'edie',
        sessionId: 's1',
      };

      const result = await pipeline.runPreToolHooks(ctx);
      expect(result.action).toBe('allow');
    });

    it('blocks SQL injection patterns', async () => {
      const ctx: PreToolUseContext = {
        toolName: 'bash',
        arguments: { command: "psql -c 'DROP TABLE users;'" },
        agentName: 'edie',
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
        agentName: 'edie',
        sessionId: 's1',
      });
      expect(write.action).toBe('allow');

      // File write to disallowed path — blocked
      const blocked = await pipeline.runPreToolHooks({
        toolName: 'edit',
        arguments: { path: 'dist/bundle.js' },
        agentName: 'edie',
        sessionId: 's1',
      });
      expect(blocked.action).toBe('block');

      // ask_user within budget — OK
      const ask1 = await pipeline.runPreToolHooks({
        toolName: 'ask_user',
        arguments: { question: 'Q1?' },
        agentName: 'edie',
        sessionId: 's1',
      });
      expect(ask1.action).toBe('allow');
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

    it('defineSquad() with hooks constraints composes correctly', () => {
      const config = defineSquad({
        team: defineTeam({ name: 'Constrained', members: ['edie'] }),
        agents: [defineAgent({ name: 'edie', role: 'Engineer' })],
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
    lockout.lockout('architecture.md', 'edie');
    lockout.lockout('architecture.md', 'fenster');
    lockout.lockout('tests.md', 'hockney');

    expect(lockout.isLockedOut('architecture.md', 'edie')).toBe(true);
    expect(lockout.isLockedOut('architecture.md', 'fenster')).toBe(true);
    expect(lockout.isLockedOut('architecture.md', 'hockney')).toBe(false);
    expect(lockout.isLockedOut('tests.md', 'hockney')).toBe(true);
    expect(lockout.isLockedOut('tests.md', 'edie')).toBe(false);
  });

  it('getLockedAgents() lists all agents locked from an artifact', () => {
    lockout.lockout('design-doc.md', 'edie');
    lockout.lockout('design-doc.md', 'fenster');

    const locked = lockout.getLockedAgents('design-doc.md');
    expect(locked).toHaveLength(2);
    expect(locked).toContain('edie');
    expect(locked).toContain('fenster');
  });

  it('clearLockout() enables handoff to next contributor', () => {
    lockout.lockout('api-spec.md', 'edie');
    expect(lockout.isLockedOut('api-spec.md', 'edie')).toBe(true);

    lockout.clearLockout('api-spec.md');
    expect(lockout.isLockedOut('api-spec.md', 'edie')).toBe(false);
  });

  it('multi-agent artifact workflow: write → lockout → handoff', () => {
    // Agent 1 writes their section, then gets locked out
    lockout.lockout('prd.md', 'edie');

    // Agent 2 can still contribute
    expect(lockout.isLockedOut('prd.md', 'fenster')).toBe(false);

    // Agent 2 finishes their section, gets locked out
    lockout.lockout('prd.md', 'fenster');

    // Agent 3 handles final review
    expect(lockout.isLockedOut('prd.md', 'hockney')).toBe(false);

    // After all contributions complete, clear for next iteration
    lockout.clearLockout('prd.md');
    expect(lockout.getLockedAgents('prd.md')).toHaveLength(0);
  });

  it('artifact lockout integrates with HookPipeline', async () => {
    const pipeline = new HookPipeline({ reviewerLockout: true });
    const rlHook = pipeline.getReviewerLockout();

    // Lock out edie from the artifact path
    rlHook.lockout('src/auth', 'edie');

    // edie tries to edit a file in the locked artifact scope
    const result = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'src/auth/login.ts' },
      agentName: 'edie',
      sessionId: 's1',
    });

    expect(result.action).toBe('block');
    expect(result.reason).toMatch(/lockout/i);

    // Different agent can still edit
    const otherResult = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'src/auth/login.ts' },
      agentName: 'fenster',
      sessionId: 's1',
    });

    expect(otherResult.action).toBe('allow');
  });

  it('multiple artifacts can be tracked independently', () => {
    lockout.lockout('frontend/app.tsx', 'edie');
    lockout.lockout('backend/server.ts', 'fenster');
    lockout.lockout('docs/readme.md', 'hockney');

    expect(lockout.isLockedOut('frontend/app.tsx', 'edie')).toBe(true);
    expect(lockout.isLockedOut('frontend/app.tsx', 'fenster')).toBe(false);
    expect(lockout.isLockedOut('backend/server.ts', 'fenster')).toBe(true);
    expect(lockout.isLockedOut('backend/server.ts', 'edie')).toBe(false);
    expect(lockout.isLockedOut('docs/readme.md', 'hockney')).toBe(true);
  });
});
