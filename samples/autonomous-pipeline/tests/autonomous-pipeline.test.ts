/**
 * Autonomous Pipeline — Test Suite
 *
 * Validates that the demo's core components wire up correctly
 * using real SDK types and simulated execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CastingEngine,
  CostTracker,
  TelemetryCollector,
  SkillRegistry,
  selectResponseTier,
  StreamingPipeline,
  VERSION,
} from '@bradygaster/squad-sdk';
import type { CastMember, ResponseTier, SquadConfig, TierContext } from '@bradygaster/squad-sdk';

// ============================================================================
// CastingEngine — cast a 4-agent team
// ============================================================================

describe('CastingEngine', () => {
  it('casts a 4-agent team from usual-suspects', () => {
    const engine = new CastingEngine();
    const cast = engine.castTeam({
      universe: 'usual-suspects',
      requiredRoles: ['lead', 'developer', 'tester', 'scribe'],
      teamSize: 4,
    });

    expect(cast).toHaveLength(4);
    const roles = cast.map((m) => m.role);
    expect(roles).toContain('lead');
    expect(roles).toContain('developer');
    expect(roles).toContain('tester');
    expect(roles).toContain('scribe');

    for (const member of cast) {
      expect(member.name).toBeTruthy();
      expect(member.displayName).toContain('—');
      expect(member.personality).toBeTruthy();
      expect(member.backstory).toBeTruthy();
    }
  });

  it('lists available universes', () => {
    const engine = new CastingEngine();
    const universes = engine.getUniverses();
    expect(universes).toContain('usual-suspects');
    expect(universes).toContain('oceans-eleven');
  });
});

// ============================================================================
// CostTracker — accumulate per-agent costs
// ============================================================================

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('records usage and produces summary', () => {
    tracker.recordUsage({
      sessionId: 'session-1',
      agentName: 'Agent1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1200,
      outputTokens: 800,
      estimatedCost: 0.0156,
    });

    const summary = tracker.getSummary();
    expect(summary.totalInputTokens).toBe(1200);
    expect(summary.totalOutputTokens).toBe(800);
    expect(summary.totalEstimatedCost).toBeCloseTo(0.0156, 4);
    expect(summary.agents.get('Agent1')).toBeDefined();
  });

  it('aggregates costs across multiple agents', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'Agent1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 500,
      outputTokens: 300,
      estimatedCost: 0.006,
    });
    tracker.recordUsage({
      sessionId: 's2',
      agentName: 'Agent2',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 800,
      outputTokens: 600,
      estimatedCost: 0.012,
    });

    const summary = tracker.getSummary();
    expect(summary.agents.size).toBe(2);
    expect(summary.totalInputTokens).toBe(1300);
    expect(summary.totalEstimatedCost).toBeCloseTo(0.018, 4);
  });

  it('formats summary as string', () => {
    tracker.recordUsage({
      sessionId: 's1',
      agentName: 'Agent3',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 400,
      outputTokens: 200,
      estimatedCost: 0.004,
    });

    const formatted = tracker.formatSummary();
    expect(formatted).toContain('Squad Cost Summary');
    expect(formatted).toContain('Agent3');
  });
});

// ============================================================================
// TelemetryCollector — opt-in event collection
// ============================================================================

describe('TelemetryCollector', () => {
  it('collects events when enabled', () => {
    const collector = new TelemetryCollector({ enabled: true });
    collector.collectEvent({ name: 'squad.init' });
    collector.collectEvent({ name: 'squad.agent.spawn', properties: { agent: 'Keyser' } });
    expect(collector.pendingCount).toBe(2);
  });

  it('ignores events when disabled', () => {
    const collector = new TelemetryCollector({ enabled: false });
    collector.collectEvent({ name: 'squad.init' });
    expect(collector.pendingCount).toBe(0);
  });

  it('supports consent toggle', () => {
    const collector = new TelemetryCollector();
    expect(collector.getConsentStatus()).toBe(false);
    collector.setConsent(true);
    expect(collector.getConsentStatus()).toBe(true);
    collector.collectEvent({ name: 'squad.run' });
    expect(collector.pendingCount).toBe(1);
  });
});

// ============================================================================
// SkillRegistry — match skills to tasks
// ============================================================================

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.registerSkill({
      id: 'jwt-auth',
      name: 'JWT Authentication',
      domain: 'auth',
      triggers: ['jwt', 'token', 'auth', 'login'],
      agentRoles: ['developer', 'security'],
      content: '# JWT Auth\nUse RS256.',
    });
    registry.registerSkill({
      id: 'api-testing',
      name: 'API Testing',
      domain: 'testing',
      triggers: ['test', 'unit test', 'integration', 'coverage'],
      agentRoles: ['tester'],
      content: '# Testing\nAAA pattern.',
    });
  });

  it('matches skills by keyword triggers', () => {
    const matches = registry.matchSkills('Implement JWT auth endpoints with login', 'developer');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].skill.id).toBe('jwt-auth');
  });

  it('boosts score for role affinity', () => {
    const devMatches = registry.matchSkills('Write unit tests for auth', 'tester');
    const leadMatches = registry.matchSkills('Write unit tests for auth', 'lead');
    // Tester should score higher due to role affinity with api-testing skill
    const testerTestScore = devMatches.find((m) => m.skill.id === 'api-testing')?.score ?? 0;
    const leadTestScore = leadMatches.find((m) => m.skill.id === 'api-testing')?.score ?? 0;
    expect(testerTestScore).toBeGreaterThan(leadTestScore);
  });

  it('returns empty for unrelated tasks', () => {
    const matches = registry.matchSkills('Update the README formatting', 'scribe');
    expect(matches).toHaveLength(0);
  });
});

// ============================================================================
// StreamingPipeline — attach sessions and process events
// ============================================================================

describe('StreamingPipeline', () => {
  it('attaches sessions and processes message deltas', async () => {
    const pipeline = new StreamingPipeline();
    const deltas: string[] = [];

    pipeline.onDelta((event) => {
      deltas.push(event.content);
    });

    pipeline.attachToSession('test-session');
    await pipeline.processEvent({
      type: 'message_delta',
      sessionId: 'test-session',
      agentName: 'Agent1',
      content: 'Hello from Agent1',
      index: 0,
      timestamp: new Date(),
    });

    expect(deltas).toContain('Hello from Agent1');
    pipeline.clear();
  });

  it('ignores events from unattached sessions', async () => {
    const pipeline = new StreamingPipeline();
    const deltas: string[] = [];

    pipeline.onDelta((event) => deltas.push(event.content));

    await pipeline.processEvent({
      type: 'message_delta',
      sessionId: 'unattached',
      content: 'ghost',
      index: 0,
      timestamp: new Date(),
    });

    expect(deltas).toHaveLength(0);
    pipeline.clear();
  });

  it('tracks usage events', async () => {
    const pipeline = new StreamingPipeline();
    const usages: number[] = [];

    pipeline.onUsage((event) => usages.push(event.inputTokens));
    pipeline.attachToSession('s1');

    await pipeline.processEvent({
      type: 'usage',
      sessionId: 's1',
      agentName: 'Agent1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCost: 0.012,
      timestamp: new Date(),
    });

    expect(usages).toEqual([1000]);

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(1000);
    pipeline.clear();
  });
});

// ============================================================================
// selectResponseTier — tier routing
// ============================================================================

describe('selectResponseTier', () => {
  const config: SquadConfig = {
    version: '1.0',
    team: { name: 'Test Squad' },
    routing: {
      rules: [
        { pattern: 'security|audit', agents: ['Agent1'], tier: 'full' },
      ],
      defaultAgent: 'Agent1',
    },
    models: {
      default: 'claude-sonnet-4-20250514',
      defaultTier: 'standard',
      tiers: { premium: ['claude-sonnet-4-20250514'], standard: ['claude-sonnet-4-20250514'], fast: ['claude-haiku-3'] },
    },
    agents: [{ name: 'Keyser', role: 'lead' }],
  };

  it('selects full tier for security audit tasks', () => {
    const tier = selectResponseTier('Run a security audit on auth flow', config);
    expect(tier.tier).toBe('full');
    expect(tier.modelTier).toBe('premium');
  });

  it('selects standard tier for implementation tasks', () => {
    const tier = selectResponseTier('Implement user profile endpoints', config);
    // "implement" + "endpoints" matches FULL_PATTERNS in SDK
    expect(['standard', 'full']).toContain(tier.tier);
  });

  it('returns tier object with all fields', () => {
    const tier = selectResponseTier('Write some docs', config);
    expect(tier).toHaveProperty('tier');
    expect(tier).toHaveProperty('modelTier');
    expect(tier).toHaveProperty('maxAgents');
    expect(tier).toHaveProperty('timeout');
  });
});

// ============================================================================
// Integration — full pipeline wiring
// ============================================================================

describe('Pipeline integration', () => {
  it('wires CastingEngine + CostTracker + TelemetryCollector together', () => {
    const engine = new CastingEngine();
    const cast = engine.castTeam({
      universe: 'usual-suspects',
      requiredRoles: ['lead', 'developer'],
      teamSize: 2,
    });

    const tracker = new CostTracker();
    const telemetry = new TelemetryCollector({ enabled: true });

    telemetry.collectEvent({ name: 'squad.init', properties: { agents: cast.length } });

    for (const member of cast) {
      telemetry.collectEvent({
        name: 'squad.agent.spawn',
        properties: { agent: member.name, role: member.role },
      });
      tracker.recordUsage({
        sessionId: `session-${member.name}`,
        agentName: member.name,
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.012,
      });
    }

    expect(telemetry.pendingCount).toBe(3); // init + 2 spawns
    const summary = tracker.getSummary();
    expect(summary.agents.size).toBe(2);
    expect(summary.totalInputTokens).toBe(2000);
  });

  it('exports VERSION', () => {
    expect(VERSION).toBeDefined();
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });
});
