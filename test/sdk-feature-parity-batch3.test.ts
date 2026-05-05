/**
 * SDK Feature Parity Tests — Batch 3 (Issue #347 / #341)
 *
 * Tests for ⚠️ Needs Setup features not covered by batch 1 or batch 2:
 *   - #31 Ralph Idle-Watch Mode (RalphMonitor)
 *   - #47 Client Compatibility (Platform Detection)
 *
 * Plus deepened coverage for partially-tested features from batch 1:
 *   - #45 Reviewer Lockout — rejection protocol edge cases
 *   - #46 Deadlock Handling — escalation and recovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RalphMonitor,
  type MonitorConfig,
  type AgentWorkStatus,
} from '../packages/squad-sdk/src/ralph/index.js';
import {
  parseGitHubRemote,
  parseAzureDevOpsRemote,
  detectPlatformFromUrl,
  detectWorkItemSource,
  type GitHubRemoteInfo,
  type AzureDevOpsRemoteInfo,
} from '../packages/squad-sdk/src/platform/detect.js';
import {
  ReviewerLockoutHook,
  HookPipeline,
  type PreToolUseContext,
} from '../packages/squad-sdk/src/hooks/index.js';
import { EventBus, type SquadEvent } from '../packages/squad-sdk/src/runtime/event-bus.js';

// ============================================================================
// SDK Feature: Ralph Idle-Watch Mode (#31)
// ============================================================================

describe('SDK Feature: Ralph Idle-Watch Mode (#31)', () => {
  let monitor: RalphMonitor;
  let eventBus: EventBus;
  const baseConfig: MonitorConfig = {
    teamRoot: '/tmp/test-squad',
    healthCheckInterval: 1000,
    staleSessionThreshold: 5000,
  };

  beforeEach(() => {
    monitor = new RalphMonitor(baseConfig);
    eventBus = new EventBus();
  });

  describe('construction and configuration', () => {
    it('creates monitor with provided config', () => {
      expect(monitor).toBeInstanceOf(RalphMonitor);
    });

    it('starts with empty agent status', () => {
      const status = monitor.getStatus();
      expect(status).toEqual([]);
    });

    it('starts with no health check history', async () => {
      const results = await monitor.healthCheck();
      expect(results).toEqual([]);
    });
  });

  describe('event handling', () => {
    it('tracks agent on session:created event', async () => {
      await monitor.start(eventBus);
      const now = new Date();

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: now,
      });

      const status = monitor.getStatus();
      expect(status).toHaveLength(1);
      expect(status[0]!.agentName).toBe('test-agent-1');
      expect(status[0]!.sessionId).toBe('sess-001');
      expect(status[0]!.status).toBe('working');

      await monitor.stop();
    });

    it('removes agent on session:destroyed event', async () => {
      await monitor.start(eventBus);
      const now = new Date();

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: now,
      });

      expect(monitor.getStatus()).toHaveLength(1);

      eventBus.emit({
        type: 'session:destroyed',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: now,
      });

      expect(monitor.getStatus()).toHaveLength(0);

      await monitor.stop();
    });

    it('marks agent as error on session:error event', async () => {
      await monitor.start(eventBus);
      const now = new Date();

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: now,
      });

      eventBus.emit({
        type: 'session:error',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: { error: 'timeout' },
        timestamp: now,
      });

      const status = monitor.getStatus();
      expect(status[0]!.status).toBe('error');

      await monitor.stop();
    });

    it('records milestones on agent:milestone event', async () => {
      await monitor.start(eventBus);
      const now = new Date();

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: now,
      });

      eventBus.emit({
        type: 'agent:milestone',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: { milestone: 'tests-written', task: 'Write unit tests' },
        timestamp: now,
      });

      const status = monitor.getStatus();
      expect(status[0]!.milestones).toContain('tests-written');
      expect(status[0]!.currentTask).toBe('Write unit tests');

      await monitor.stop();
    });

    it('tracks multiple agents independently', async () => {
      await monitor.start(eventBus);
      const now = new Date();

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: now,
      });

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-2',
        sessionId: 'sess-002',
        payload: null,
        timestamp: now,
      });

      const status = monitor.getStatus();
      expect(status).toHaveLength(2);
      const names = status.map((s) => s.agentName);
      expect(names).toContain('test-agent-1');
      expect(names).toContain('test-agent-2');

      await monitor.stop();
    });
  });

  describe('health check — stale session detection', () => {
    it('detects stale agents when lastActivity exceeds threshold', async () => {
      await monitor.start(eventBus);
      const pastTime = new Date(Date.now() - 10_000); // 10s ago

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: pastTime,
      });

      // Config threshold is 5000ms, agent last active 10000ms ago → stale
      const results = await monitor.healthCheck();
      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('stale');

      await monitor.stop();
    });

    it('keeps active agents as working', async () => {
      await monitor.start(eventBus);
      const recentTime = new Date(); // just now

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: recentTime,
      });

      const results = await monitor.healthCheck();
      expect(results[0]!.status).toBe('working');

      await monitor.stop();
    });

    it('does not change error status during health check', async () => {
      await monitor.start(eventBus);
      const pastTime = new Date(Date.now() - 10_000);

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: pastTime,
      });

      eventBus.emit({
        type: 'session:error',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: { error: 'crash' },
        timestamp: pastTime,
      });

      // Even though lastActivity is old, error agents stay in error state
      const results = await monitor.healthCheck();
      expect(results[0]!.status).toBe('error');

      await monitor.stop();
    });

    it('uses configurable stale threshold', async () => {
      const shortThreshold = new RalphMonitor({
        ...baseConfig,
        staleSessionThreshold: 100, // 100ms
      });

      await shortThreshold.start(eventBus);

      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: new Date(Date.now() - 200), // 200ms ago, exceeds 100ms threshold
      });

      const results = await shortThreshold.healthCheck();
      expect(results[0]!.status).toBe('stale');

      await shortThreshold.stop();
    });
  });

  describe('stop and cleanup', () => {
    it('unsubscribes from events on stop', async () => {
      await monitor.start(eventBus);
      await monitor.stop();

      // After stop, new events should not be tracked
      eventBus.emit({
        type: 'session:created',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        payload: null,
        timestamp: new Date(),
      });

      expect(monitor.getStatus()).toHaveLength(0);
    });
  });
});

// ============================================================================
// SDK Feature: Client Compatibility — Platform Detection (#47)
// ============================================================================

describe('SDK Feature: Client Compatibility — Platform Detection (#47)', () => {
  describe('parseGitHubRemote', () => {
    it('parses HTTPS GitHub URL', () => {
      const result = parseGitHubRemote('https://github.com/bradygaster/squad.git');
      expect(result).toEqual({ owner: 'bradygaster', repo: 'squad' });
    });

    it('parses HTTPS GitHub URL without .git suffix', () => {
      const result = parseGitHubRemote('https://github.com/bradygaster/squad');
      expect(result).toEqual({ owner: 'bradygaster', repo: 'squad' });
    });

    it('parses SSH GitHub URL', () => {
      const result = parseGitHubRemote('git@github.com:bradygaster/squad.git');
      expect(result).toEqual({ owner: 'bradygaster', repo: 'squad' });
    });

    it('parses SSH GitHub URL without .git suffix', () => {
      const result = parseGitHubRemote('git@github.com:bradygaster/squad');
      expect(result).toEqual({ owner: 'bradygaster', repo: 'squad' });
    });

    it('returns null for non-GitHub URL', () => {
      const result = parseGitHubRemote('https://dev.azure.com/org/project/_git/repo');
      expect(result).toBeNull();
    });

    it('returns null for invalid URL', () => {
      const result = parseGitHubRemote('not-a-url');
      expect(result).toBeNull();
    });
  });

  describe('parseAzureDevOpsRemote', () => {
    it('parses HTTPS dev.azure.com URL', () => {
      const result = parseAzureDevOpsRemote(
        'https://dev.azure.com/myorg/myproject/_git/myrepo',
      );
      expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
    });

    it('parses HTTPS dev.azure.com URL with user prefix', () => {
      const result = parseAzureDevOpsRemote(
        'https://myorg@dev.azure.com/myorg/myproject/_git/myrepo',
      );
      expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
    });

    it('parses SSH dev.azure.com URL', () => {
      const result = parseAzureDevOpsRemote(
        'git@ssh.dev.azure.com:v3/myorg/myproject/myrepo',
      );
      expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
    });

    it('parses legacy visualstudio.com URL', () => {
      const result = parseAzureDevOpsRemote(
        'https://myorg.visualstudio.com/myproject/_git/myrepo',
      );
      expect(result).toEqual({ org: 'myorg', project: 'myproject', repo: 'myrepo' });
    });

    it('returns null for GitHub URL', () => {
      const result = parseAzureDevOpsRemote('https://github.com/owner/repo.git');
      expect(result).toBeNull();
    });

    it('returns null for invalid URL', () => {
      const result = parseAzureDevOpsRemote('not-a-url');
      expect(result).toBeNull();
    });
  });

  describe('detectPlatformFromUrl', () => {
    it('detects GitHub from HTTPS URL', () => {
      expect(detectPlatformFromUrl('https://github.com/owner/repo.git')).toBe('github');
    });

    it('detects GitHub from SSH URL', () => {
      expect(detectPlatformFromUrl('git@github.com:owner/repo.git')).toBe('github');
    });

    it('detects Azure DevOps from dev.azure.com URL', () => {
      expect(
        detectPlatformFromUrl('https://dev.azure.com/org/project/_git/repo'),
      ).toBe('azure-devops');
    });

    it('detects Azure DevOps from SSH URL', () => {
      expect(
        detectPlatformFromUrl('git@ssh.dev.azure.com:v3/org/project/repo'),
      ).toBe('azure-devops');
    });

    it('detects Azure DevOps from visualstudio.com URL', () => {
      expect(
        detectPlatformFromUrl('https://org.visualstudio.com/project/_git/repo'),
      ).toBe('azure-devops');
    });

    it('defaults to github for unrecognized URL', () => {
      expect(detectPlatformFromUrl('https://gitlab.com/owner/repo')).toBe('github');
    });
  });

  describe('detectWorkItemSource', () => {
    it('returns planner when config specifies planner', () => {
      expect(detectWorkItemSource('/tmp/test', 'planner')).toBe('planner');
    });

    it('falls back to platform detection when config is undefined', () => {
      const result = detectWorkItemSource(process.cwd());
      expect(['github', 'azure-devops']).toContain(result);
    });
  });
});

// ============================================================================
// SDK Feature: Reviewer Lockout — Rejection Protocol (#45) — Deepened
// ============================================================================

describe('SDK Feature: Reviewer Lockout — Rejection Protocol (#45) — Deepened', () => {
  let lockout: ReviewerLockoutHook;

  beforeEach(() => {
    lockout = new ReviewerLockoutHook();
  });

  describe('rejection triggers lockout', () => {
    it('locks agent out of artifact after reviewer rejection', () => {
      // Simulate: reviewer rejects test-agent-1's work on 'src/auth'
      lockout.lockout('src/auth', 'test-agent-1');

      expect(lockout.isLockedOut('src/auth', 'test-agent-1')).toBe(true);
    });

    it('locked-out agent cannot self-revise (hook blocks writes)', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      const hook = lockout.createHook();

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        arguments: { path: 'src/auth/login.ts' },
      };

      const result = hook(ctx);
      expect(result.action).toBe('block');
      expect(result.reason).toContain('locked out');
    });

    it('different agent can work on the same artifact', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      const hook = lockout.createHook();

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        agentName: 'test-agent-2',
        sessionId: 'sess-002',
        arguments: { path: 'src/auth/login.ts' },
      };

      const result = hook(ctx);
      expect(result.action).toBe('allow');
    });
  });

  describe('lockout scope is per-artifact', () => {
    it('agent locked out of one artifact can work on another', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      const hook = lockout.createHook();

      const ctx: PreToolUseContext = {
        toolName: 'edit',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        arguments: { path: 'src/api/routes.ts' },
      };

      // 'src/api/routes.ts' does not match artifact 'src/auth'
      const result = hook(ctx);
      expect(result.action).toBe('allow');
    });

    it('multiple agents can be locked out of the same artifact', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      lockout.lockout('src/auth', 'test-agent-2');

      expect(lockout.isLockedOut('src/auth', 'test-agent-1')).toBe(true);
      expect(lockout.isLockedOut('src/auth', 'test-agent-2')).toBe(true);
      expect(lockout.getLockedAgents('src/auth')).toHaveLength(2);
    });

    it('lockout on one artifact does not affect others', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      lockout.lockout('src/api', 'test-agent-2');

      expect(lockout.isLockedOut('src/auth', 'test-agent-2')).toBe(false);
      expect(lockout.isLockedOut('src/api', 'test-agent-1')).toBe(false);
    });
  });

  describe('lockout persists through revision cycle', () => {
    it('lockout survives multiple hook invocations', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      const hook = lockout.createHook();

      // First attempt
      const result1 = hook({
        toolName: 'edit',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        arguments: { path: 'src/auth/login.ts' },
      });
      expect(result1.action).toBe('block');

      // Second attempt — still blocked
      const result2 = hook({
        toolName: 'edit',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        arguments: { path: 'src/auth/middleware.ts' },
      });
      expect(result2.action).toBe('block');
    });
  });
});

// ============================================================================
// SDK Feature: Deadlock Handling (#46) — Deepened
// ============================================================================

describe('SDK Feature: Deadlock Handling (#46) — Deepened', () => {
  let lockout: ReviewerLockoutHook;

  beforeEach(() => {
    lockout = new ReviewerLockoutHook();
  });

  describe('all-agents-locked detection', () => {
    it('detects when all agents are locked out of an artifact', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      lockout.lockout('src/auth', 'test-agent-2');
      lockout.lockout('src/auth', 'test-agent-3');

      const locked = lockout.getLockedAgents('src/auth');
      expect(locked).toHaveLength(3);

      // In a 3-agent team, all being locked = deadlock
      const teamAgents = ['test-agent-1', 'test-agent-2', 'test-agent-3'];
      const allLocked = teamAgents.every((a) => lockout.isLockedOut('src/auth', a));
      expect(allLocked).toBe(true);
    });

    it('no deadlock when at least one agent is not locked', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      lockout.lockout('src/auth', 'test-agent-2');

      const teamAgents = ['test-agent-1', 'test-agent-2', 'test-agent-3'];
      const allLocked = teamAgents.every((a) => lockout.isLockedOut('src/auth', a));
      expect(allLocked).toBe(false);
    });
  });

  describe('clearLockout as escalation mechanism', () => {
    it('clearLockout removes all locks for an artifact', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      lockout.lockout('src/auth', 'test-agent-2');

      lockout.clearLockout('src/auth');

      expect(lockout.isLockedOut('src/auth', 'test-agent-1')).toBe(false);
      expect(lockout.isLockedOut('src/auth', 'test-agent-2')).toBe(false);
      expect(lockout.getLockedAgents('src/auth')).toHaveLength(0);
    });

    it('clearLockout on one artifact does not affect others', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      lockout.lockout('src/api', 'test-agent-1');

      lockout.clearLockout('src/auth');

      expect(lockout.isLockedOut('src/auth', 'test-agent-1')).toBe(false);
      expect(lockout.isLockedOut('src/api', 'test-agent-1')).toBe(true);
    });
  });

  describe('clearAll as full reset', () => {
    it('clearAll removes lockouts across all artifacts', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      lockout.lockout('src/api', 'test-agent-2');
      lockout.lockout('src/db', 'test-agent-3');

      lockout.clearAll();

      expect(lockout.getLockedAgents('src/auth')).toHaveLength(0);
      expect(lockout.getLockedAgents('src/api')).toHaveLength(0);
      expect(lockout.getLockedAgents('src/db')).toHaveLength(0);
    });
  });

  describe('deadlock recovery', () => {
    it('agents can work again after clearLockout', () => {
      lockout.lockout('src/auth', 'test-agent-1');
      const hook = lockout.createHook();

      // Blocked before clear
      const blocked = hook({
        toolName: 'edit',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        arguments: { path: 'src/auth/login.ts' },
      });
      expect(blocked.action).toBe('block');

      // Clear the lockout (escalation)
      lockout.clearLockout('src/auth');

      // Allowed after clear
      const allowed = hook({
        toolName: 'edit',
        agentName: 'test-agent-1',
        sessionId: 'sess-001',
        arguments: { path: 'src/auth/login.ts' },
      });
      expect(allowed.action).toBe('allow');
    });
  });
});
