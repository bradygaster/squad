/**
 * Feature Parity Integration Tests (M3-11, Issue #152)
 *
 * Comprehensive integration tests proving v1 SDK has feature parity
 * with the beta. Exercises full pipelines end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Coordinator pipeline ---
import {
  SquadCoordinator,
  type CoordinatorResult,
} from '@bradygaster/squad-sdk/coordinator';
import {
  DirectResponseHandler,
  type CoordinatorContext,
} from '@bradygaster/squad-sdk/coordinator';
import {
  selectResponseTier,
  getTier,
  type TierName,
} from '@bradygaster/squad-sdk/coordinator';
import {
  compileRoutingRules,
  matchRoute,
  parseRoutingMarkdown,
} from '@bradygaster/squad-sdk/config';

// --- Casting ---
import { CastingEngine, type CastingConfig, type AgentRole } from '@bradygaster/squad-sdk/casting';

// --- Skills ---
import {
  SkillRegistry,
  parseSkillFile,
  parseFrontmatter,
  type SkillDefinition,
} from '@bradygaster/squad-sdk/skills';

// --- Streaming ---
import {
  StreamingPipeline,
  type StreamDelta,
  type UsageEvent,
} from '@bradygaster/squad-sdk/runtime/streaming';

// --- Config ---
import {
  DEFAULT_CONFIG,
  validateConfig,
  validateConfigDetailed,
  type SquadConfig,
} from '@bradygaster/squad-sdk/runtime';
import {
  defineConfig,
  validateConfig as validateSchemaConfig,
} from '@bradygaster/squad-sdk/config';
import {
  MigrationRegistry,
  parseSemVer,
  compareSemVer,
} from '@bradygaster/squad-sdk/config';

// --- Legacy fallback ---
import {
  detectLegacySetup,
  loadLegacyAgentMd,
  mergeLegacyWithConfig,
  type LegacyConfig,
} from '@bradygaster/squad-sdk/config';

// --- Models ---
import {
  resolveModel,
  ModelFallbackExecutor,
  inferTierFromModel,
  isTierFallbackAllowed,
  type ResolvedModel,
} from '@bradygaster/squad-sdk/agents';
import {
  ModelRegistry,
  MODEL_CATALOG,
  DEFAULT_FALLBACK_CHAINS,
} from '@bradygaster/squad-sdk/config';

// --- Event bus ---
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';

// --- Hooks ---
import { HookPipeline, type PolicyConfig } from '@bradygaster/squad-sdk/hooks';

// --- Tools ---
import { ToolRegistry } from '@bradygaster/squad-sdk/tools';

// --- Agents ---
import { parseAgentDoc } from '@bradygaster/squad-sdk/config';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================================
// Helpers
// ============================================================================

function makeConfig(overrides: Partial<SquadConfig> = {}): SquadConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    routing: {
      ...DEFAULT_CONFIG.routing,
      ...overrides.routing,
      rules: overrides.routing?.rules ?? [
        { workType: 'feature-dev', agents: ['fenster'], confidence: 'high' as const },
        { workType: 'testing', agents: ['tester'], confidence: 'high' as const },
        { workType: 'documentation', agents: ['verbal', 'scribe'], confidence: 'medium' as const },
      ],
    },
    models: {
      ...DEFAULT_CONFIG.models,
      ...overrides.models,
    },
  } as SquadConfig;
}

function makeContext(overrides: Partial<CoordinatorContext> = {}): CoordinatorContext {
  return {
    sessionId: 'test-session',
    config: makeConfig(),
    activeAgents: ['fenster', 'verbal', 'tester'],
    ...overrides,
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-parity-'));
}

// ============================================================================
// 1. Coordinator Pipeline: message → route → tier → spawn → response
// ============================================================================

describe('Feature Parity: Coordinator Pipeline', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  it('routes a feature request through full pipeline', async () => {
    const router = compileRoutingRules({
      rules: [
        { workType: 'feature-dev', agents: ['fenster'], examples: ['new feature', 'implement'], confidence: 'high' },
      ],
    });
    const coord = new SquadCoordinator({
      config: makeConfig(),
      compiledRouter: router,
      eventBus,
    });
    const result = await coord.handleMessage('implement a new auth feature', makeContext());
    expect(result.strategy).toBe('single');
    expect(result.routing!.agents).toContain('fenster');
  });

  it('direct-responds to help without spawning', async () => {
    const coord = new SquadCoordinator({ config: makeConfig(), eventBus });
    const result = await coord.handleMessage('help', makeContext());
    expect(result.strategy).toBe('direct');
    expect(result.directResponse!.category).toBe('help');
    expect(result.spawnResults).toBeUndefined();
  });

  it('direct-responds to status queries', async () => {
    const coord = new SquadCoordinator({ config: makeConfig(), eventBus });
    const result = await coord.handleMessage('status', makeContext());
    expect(result.strategy).toBe('direct');
    expect(result.directResponse!.response).toContain('fenster');
  });

  it('direct-responds to greetings', async () => {
    const coord = new SquadCoordinator({ config: makeConfig(), eventBus });
    const result = await coord.handleMessage('hello', makeContext());
    expect(result.strategy).toBe('direct');
    expect(result.directResponse!.category).toBe('greeting');
  });

  it('routes multi-agent doc requests', async () => {
    const router = compileRoutingRules({
      rules: [
        { workType: 'documentation', agents: ['verbal', 'scribe'], examples: ['docs', 'readme'], confidence: 'medium' },
      ],
    });
    const coord = new SquadCoordinator({ config: makeConfig(), compiledRouter: router, eventBus });
    const result = await coord.handleMessage('update the readme docs', makeContext());
    expect(result.strategy).toBe('multi');
    expect(result.routing!.agents.length).toBeGreaterThanOrEqual(2);
  });

  it('emits routing events through the event bus', async () => {
    const events: any[] = [];
    eventBus.subscribe('coordinator:routing', (e) => events.push(e));
    const coord = new SquadCoordinator({ config: makeConfig(), eventBus });
    await coord.handleMessage('implement new feature', makeContext());
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('includes timing in coordinator result', async () => {
    const coord = new SquadCoordinator({ config: makeConfig(), eventBus });
    const result = await coord.handleMessage('help', makeContext());
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back gracefully with empty routing rules', async () => {
    const router = compileRoutingRules({ rules: [] });
    const coord = new SquadCoordinator({ config: makeConfig(), compiledRouter: router, eventBus });
    const result = await coord.handleMessage('do something random', makeContext());
    expect(result.routing).toBeDefined();
    expect(result.routing!.confidence).toBe('low');
  });
});

// ============================================================================
// 2. Casting: castTeam → agent personas → charter compilation
// ============================================================================

describe('Feature Parity: Casting', () => {
  let engine: CastingEngine;

  beforeEach(() => {
    engine = new CastingEngine();
  });

  it('casts a team from usual-suspects universe', () => {
    const team = engine.castTeam({ universe: 'usual-suspects' });
    expect(team.length).toBeGreaterThanOrEqual(3);
    expect(team.some((m) => m.role === 'lead')).toBe(true);
    expect(team.some((m) => m.role === 'developer')).toBe(true);
    expect(team.some((m) => m.role === 'tester')).toBe(true);
  });

  it('casts a team from oceans-eleven universe', () => {
    const team = engine.castTeam({ universe: 'oceans-eleven' });
    expect(team.length).toBeGreaterThanOrEqual(3);
    expect(team.some((m) => m.name === 'Danny')).toBe(true);
  });

  it('fills required roles first', () => {
    const team = engine.castTeam({
      universe: 'usual-suspects',
      requiredRoles: ['lead', 'developer', 'security'],
    });
    const roles = team.map((m) => m.role);
    expect(roles).toContain('lead');
    expect(roles).toContain('developer');
    expect(roles).toContain('security');
  });

  it('generates display names in correct format', () => {
    const team = engine.castTeam({ universe: 'usual-suspects' });
    for (const member of team) {
      expect(member.displayName).toMatch(/.+ — .+/);
    }
  });

  it('supports custom universe with custom names', () => {
    const team = engine.castTeam({
      universe: 'custom',
      customNames: {
        lead: 'Alice',
        developer: 'Bob',
      } as Record<AgentRole, string>,
    });
    expect(team.length).toBe(2);
    expect(team.find((m) => m.name === 'Alice')?.role).toBe('lead');
  });

  it('clamps team size to available characters', () => {
    const team = engine.castTeam({ universe: 'usual-suspects', teamSize: 100 });
    expect(team.length).toBeLessThanOrEqual(8); // usual-suspects has 8 characters
  });

  it('lists available universes', () => {
    const universes = engine.getUniverses();
    expect(universes).toContain('usual-suspects');
    expect(universes).toContain('oceans-eleven');
  });
});

// ============================================================================
// 3. Skills: register → match → load → inject into agent context
// ============================================================================

describe('Feature Parity: Skills', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
  });

  it('registers and retrieves a skill', () => {
    const skill: SkillDefinition = {
      id: 'ts-testing',
      name: 'TypeScript Testing',
      domain: 'testing',
      content: '# Testing\nUse vitest...',
      triggers: ['vitest', 'jest', 'test'],
      agentRoles: ['tester', 'developer'],
    };
    registry.registerSkill(skill);
    expect(registry.getSkill('ts-testing')).toBe(skill);
    expect(registry.size).toBe(1);
  });

  it('matches skills by trigger keywords', () => {
    registry.registerSkill({
      id: 'ts-testing',
      name: 'TypeScript Testing',
      domain: 'testing',
      content: 'Use vitest for testing',
      triggers: ['vitest', 'jest', 'test'],
      agentRoles: ['tester'],
    });
    const matches = registry.matchSkills('write vitest tests for the parser', 'developer');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].skill.id).toBe('ts-testing');
  });

  it('boosts score for matching agent role', () => {
    registry.registerSkill({
      id: 'ts-testing',
      name: 'TypeScript Testing',
      domain: 'testing',
      content: 'Testing knowledge',
      triggers: ['test'],
      agentRoles: ['tester'],
    });
    const testerMatches = registry.matchSkills('write a test', 'tester');
    const devMatches = registry.matchSkills('write a test', 'developer');
    expect(testerMatches[0].score).toBeGreaterThan(devMatches[0].score);
  });

  it('loads skill content for injection', () => {
    registry.registerSkill({
      id: 'security',
      name: 'Security',
      domain: 'security',
      content: '# Security Guidelines\nAlways sanitize input.',
      triggers: ['security', 'xss'],
      agentRoles: ['security'],
    });
    const content = registry.loadSkill('security');
    expect(content).toContain('Security Guidelines');
  });

  it('returns undefined for unknown skill', () => {
    expect(registry.loadSkill('nonexistent')).toBeUndefined();
  });

  it('unregisters a skill', () => {
    registry.registerSkill({
      id: 'temp', name: 'Temp', domain: 'misc',
      content: 'tmp', triggers: ['tmp'], agentRoles: [],
    });
    expect(registry.unregisterSkill('temp')).toBe(true);
    expect(registry.size).toBe(0);
  });

  it('parses skill frontmatter correctly', () => {
    const raw = `---
name: TypeScript Testing
domain: testing
triggers: [vitest, jest, test]
roles: [tester, developer]
---
Use vitest for unit tests.`;
    const skill = parseSkillFile('ts-testing', raw);
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('TypeScript Testing');
    expect(skill!.triggers).toEqual(['vitest', 'jest', 'test']);
    expect(skill!.agentRoles).toEqual(['tester', 'developer']);
  });

  it('getAllSkills returns all registered skills', () => {
    registry.registerSkill({ id: 'a', name: 'A', domain: 'a', content: 'a', triggers: ['a'], agentRoles: [] });
    registry.registerSkill({ id: 'b', name: 'B', domain: 'b', content: 'b', triggers: ['b'], agentRoles: [] });
    expect(registry.getAllSkills().length).toBe(2);
  });
});

// ============================================================================
// 4. Streaming: attach → receive deltas → usage tracking → cost summary
// ============================================================================

describe('Feature Parity: Streaming', () => {
  let pipeline: StreamingPipeline;

  beforeEach(() => {
    pipeline = new StreamingPipeline();
  });

  it('attaches to a session', () => {
    pipeline.attachToSession('session-1');
    expect(pipeline.isAttached('session-1')).toBe(true);
  });

  it('receives message deltas for attached sessions', async () => {
    pipeline.attachToSession('session-1');
    const deltas: StreamDelta[] = [];
    pipeline.onDelta((d) => deltas.push(d));

    await pipeline.processEvent({
      type: 'message_delta',
      sessionId: 'session-1',
      content: 'Hello',
      index: 0,
      timestamp: new Date(),
    });
    expect(deltas.length).toBe(1);
    expect(deltas[0].content).toBe('Hello');
  });

  it('ignores events from unattached sessions', async () => {
    const deltas: StreamDelta[] = [];
    pipeline.onDelta((d) => deltas.push(d));

    await pipeline.processEvent({
      type: 'message_delta',
      sessionId: 'orphan-session',
      content: 'Should be ignored',
      index: 0,
      timestamp: new Date(),
    });
    expect(deltas.length).toBe(0);
  });

  it('tracks usage data and produces cost summary', async () => {
    pipeline.attachToSession('session-1');

    await pipeline.processEvent({
      type: 'usage',
      sessionId: 'session-1',
      agentName: 'fenster',
      model: 'claude-sonnet-4.5',
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCost: 0.05,
      timestamp: new Date(),
    });

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(1000);
    expect(summary.totalOutputTokens).toBe(500);
    expect(summary.estimatedCost).toBe(0.05);
    expect(summary.byAgent.get('fenster')!.turnCount).toBe(1);
  });

  it('aggregates usage across multiple sessions', async () => {
    pipeline.attachToSession('s1');
    pipeline.attachToSession('s2');

    await pipeline.processEvent({
      type: 'usage', sessionId: 's1', agentName: 'a', model: 'm',
      inputTokens: 100, outputTokens: 50, estimatedCost: 0.01, timestamp: new Date(),
    });
    await pipeline.processEvent({
      type: 'usage', sessionId: 's2', agentName: 'b', model: 'm',
      inputTokens: 200, outputTokens: 100, estimatedCost: 0.02, timestamp: new Date(),
    });

    const summary = pipeline.getUsageSummary();
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.byAgent.size).toBe(2);
  });

  it('detaches sessions cleanly', () => {
    pipeline.attachToSession('s1');
    pipeline.detachFromSession('s1');
    expect(pipeline.isAttached('s1')).toBe(false);
  });

  it('clears all state', () => {
    pipeline.attachToSession('s1');
    pipeline.clear();
    expect(pipeline.isAttached('s1')).toBe(false);
    expect(pipeline.getUsageSummary().totalInputTokens).toBe(0);
  });
});

// ============================================================================
// 5. Config Roundtrip: load → validate → migrate → save
// ============================================================================

describe('Feature Parity: Config Roundtrip', () => {
  it('validates a well-formed config', () => {
    const result = validateConfigDetailed(DEFAULT_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('rejects config with missing version', () => {
    const bad = { ...DEFAULT_CONFIG, version: undefined };
    const result = validateConfigDetailed(bad);
    expect(result.valid).toBe(false);
  });

  it('rejects config with missing models', () => {
    const bad = { ...DEFAULT_CONFIG, models: undefined };
    const result = validateConfigDetailed(bad);
    expect(result.valid).toBe(false);
  });

  it('validates and merges defaults for optional fields', () => {
    const minimal: any = {
      version: '1.0.0',
      models: DEFAULT_CONFIG.models,
      routing: DEFAULT_CONFIG.routing,
    };
    const validated = validateConfig(minimal);
    expect(validated.casting).toBeDefined();
    expect(validated.platforms).toBeDefined();
  });

  it('migration registry runs forward migration', () => {
    const registry = new MigrationRegistry();
    registry.register({
      fromVersion: '0.4.0',
      toVersion: '0.5.0',
      migrate: (config) => ({ ...config, version: '0.5.0', migrated: true }),
      rollback: (config) => ({ ...config, version: '0.4.0' }),
    });
    const result = registry.runMigrations(
      { version: '0.4.0' },
      '0.4.0',
      '0.5.0',
    );
    expect(result.config.version).toBe('0.5.0');
    expect((result.config as any).migrated).toBe(true);
    expect(result.applied.length).toBe(1);
  });

  it('migration registry runs rollback', () => {
    const registry = new MigrationRegistry();
    registry.register({
      fromVersion: '0.4.0',
      toVersion: '0.5.0',
      migrate: (config) => ({ ...config, version: '0.5.0' }),
      rollback: (config) => ({ ...config, version: '0.4.0', rolledback: true }),
    });
    const result = registry.runMigrations(
      { version: '0.5.0' },
      '0.5.0',
      '0.4.0',
    );
    expect(result.config.version).toBe('0.4.0');
    expect(result.rolledBack).toBe(true);
  });

  it('config schema defineConfig merges defaults', () => {
    const cfg = defineConfig({ agents: [{ name: 'a', role: 'lead' }] });
    expect(cfg.version).toBeDefined();
    expect(cfg.agents.length).toBe(1);
    expect(cfg.routing.rules).toBeDefined();
  });
});

// ============================================================================
// 6. Backwards Compat: legacy .ai-team/ → config fallback → merged config
// ============================================================================

describe('Feature Parity: Backwards Compatibility', () => {
  it('detectLegacySetup returns false for empty dir', () => {
    const dir = tmpDir();
    expect(detectLegacySetup(dir)).toBe(false);
    fs.rmSync(dir, { recursive: true });
  });

  it('detectLegacySetup returns true when .github/agents/squad.agent.md exists', () => {
    const dir = tmpDir();
    const agentDir = path.join(dir, '.github', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'squad.agent.md'), '# Squad Agent\n## Identity\nName: TestBot');
    expect(detectLegacySetup(dir)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  it('detectLegacySetup returns true when .ai-team/team.md exists', () => {
    const dir = tmpDir();
    const aiTeamDir = path.join(dir, '.ai-team');
    fs.mkdirSync(aiTeamDir, { recursive: true });
    fs.writeFileSync(path.join(aiTeamDir, 'team.md'), '# Team');
    expect(detectLegacySetup(dir)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  it('loadLegacyAgentMd parses squad.agent.md from .github/agents/', () => {
    const dir = tmpDir();
    const agentDir = path.join(dir, '.github', 'agents');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'squad.agent.md'),
      '# Squad Coordinator\n\n## Identity\nName: TestBot\nDescription: A test bot\n\n## Tools\n- squad_route\n- squad_decide\n',
    );
    const legacy = loadLegacyAgentMd(dir);
    expect(legacy).toBeDefined();
    expect(legacy!.tools).toContain('squad_route');
    expect(legacy!.sourcePath).toContain('squad.agent.md');
    fs.rmSync(dir, { recursive: true });
  });

  it('loadLegacyAgentMd returns undefined when no legacy file exists', () => {
    const dir = tmpDir();
    expect(loadLegacyAgentMd(dir)).toBeUndefined();
    fs.rmSync(dir, { recursive: true });
  });

  it('mergeLegacyWithConfig: config takes precedence over legacy', () => {
    const legacy: LegacyConfig = {
      systemPrompt: 'legacy prompt',
      tools: ['squad_route'],
      agents: [{ name: 'legacy-agent', role: 'dev' }],
      routingHints: [],
      routingRules: [
        { workType: 'feature-dev', agents: ['legacy-agent'], confidence: 'high' },
        { workType: 'docs', agents: ['legacy-scribe'], confidence: 'medium' },
      ],
      modelPreferences: ['claude-opus-4.6'],
      sourcePath: '/fake/path',
      hasAiTeamDir: false,
    };
    const config = makeConfig();
    // Suppress deprecation warning
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged = mergeLegacyWithConfig(legacy, config);
    vi.restoreAllMocks();

    // Config's feature-dev rule wins
    const featureRule = merged.routing.rules.find((r) => r.workType === 'feature-dev');
    expect(featureRule!.agents).toContain('fenster');
    // Legacy's docs rule fills gap
    const docsRule = merged.routing.rules.find((r) => r.workType === 'docs');
    expect(docsRule).toBeDefined();
  });
});

// ============================================================================
// 7. Model Fallback: primary fails → fallback chain → tier boundary
// ============================================================================

describe('Feature Parity: Model Fallback', () => {
  it('resolves model with user override', () => {
    const resolved = resolveModel({
      userOverride: 'claude-opus-4.6',
      taskType: 'code',
    });
    expect(resolved.model).toBe('claude-opus-4.6');
    expect(resolved.source).toBe('user-override');
  });

  it('resolves model from charter preference', () => {
    const resolved = resolveModel({
      charterPreference: 'gpt-5.2-codex',
      taskType: 'code',
    });
    expect(resolved.model).toBe('gpt-5.2-codex');
    expect(resolved.source).toBe('charter');
  });

  it('auto-selects model based on task type', () => {
    const resolved = resolveModel({ taskType: 'code' });
    expect(resolved.model).toBeDefined();
    expect(resolved.source).toBe('task-auto');
  });

  it('fallback executor succeeds on first try', async () => {
    const executor = new ModelFallbackExecutor();
    const resolved: ResolvedModel = {
      model: 'claude-sonnet-4.5',
      tier: 'standard',
      source: 'task-auto',
      fallbackChain: ['claude-sonnet-4.5', 'gpt-5.2-codex'],
    };
    const result = await executor.execute(resolved, 'fenster', async () => 'ok');
    expect(result.value).toBe('ok');
    expect(result.didFallback).toBe(false);
  });

  it('fallback executor falls back on failure', async () => {
    const executor = new ModelFallbackExecutor();
    let callCount = 0;
    const resolved: ResolvedModel = {
      model: 'claude-sonnet-4.5',
      tier: 'standard',
      source: 'task-auto',
      fallbackChain: ['claude-sonnet-4.5', 'gpt-5.2-codex', 'claude-sonnet-4'],
    };
    const result = await executor.execute(resolved, 'fenster', async (model) => {
      callCount++;
      if (callCount === 1) throw new Error('rate limit');
      return `ok-${model}`;
    });
    expect(result.didFallback).toBe(true);
    expect(result.attempts.length).toBe(1);
  });

  it('tier boundary enforcement blocks cross-tier by default', () => {
    expect(isTierFallbackAllowed('premium', 'fast', false)).toBe(false);
  });

  it('tier boundary enforcement allows same tier', () => {
    expect(isTierFallbackAllowed('standard', 'standard', false)).toBe(true);
  });

  it('tier inference works for known models', () => {
    expect(inferTierFromModel('claude-opus-4.6')).toBe('premium');
    expect(inferTierFromModel('claude-sonnet-4.5')).toBe('standard');
    expect(inferTierFromModel('claude-haiku-4.5')).toBe('fast');
  });
});

// ============================================================================
// 8. Direct Response: pattern match → no-spawn response
// ============================================================================

describe('Feature Parity: Direct Response', () => {
  let handler: DirectResponseHandler;

  beforeEach(() => {
    handler = new DirectResponseHandler();
  });

  it('recognizes help requests', () => {
    expect(handler.shouldHandleDirectly('help')).toBe(true);
    expect(handler.shouldHandleDirectly('what can you do')).toBe(true);
  });

  it('recognizes status queries', () => {
    expect(handler.shouldHandleDirectly('status')).toBe(true);
    expect(handler.shouldHandleDirectly("what's the status")).toBe(true);
  });

  it('recognizes greetings', () => {
    expect(handler.shouldHandleDirectly('hello')).toBe(true);
    expect(handler.shouldHandleDirectly('hey')).toBe(true);
  });

  it('does not match complex task messages', () => {
    expect(handler.shouldHandleDirectly('implement JWT auth with refresh tokens')).toBe(false);
  });

  it('returns correct category for help', () => {
    const result = handler.handleDirect('help', makeContext());
    expect(result.category).toBe('help');
    expect(result.confidence).toBe('high');
  });

  it('returns active agents in status response', () => {
    const result = handler.handleDirect('status', makeContext({ activeAgents: ['fenster', 'verbal'] }));
    expect(result.response).toContain('fenster');
    expect(result.response).toContain('verbal');
  });

  it('supports custom patterns', () => {
    handler.addPattern({
      category: 'status',
      patterns: [/^ping$/i],
      handler: () => 'pong',
    });
    expect(handler.shouldHandleDirectly('ping')).toBe(true);
    const result = handler.handleDirect('ping', makeContext());
    expect(result.response).toBe('pong');
  });
});

// ============================================================================
// 9. Response Tiers: message analysis → tier selection → model recommendation
// ============================================================================

describe('Feature Parity: Response Tiers', () => {
  it('selects direct tier for greetings', () => {
    const tier = selectResponseTier('hello', makeConfig() as any);
    expect(tier.tier).toBe('direct');
  });

  it('selects full tier for multi-agent tasks', () => {
    const tier = selectResponseTier('refactor the entire codebase for ESM', makeConfig() as any);
    expect(tier.tier).toBe('full');
  });

  it('selects lightweight tier for simple queries', () => {
    const tier = selectResponseTier('list all active sessions', makeConfig() as any);
    expect(tier.tier).toBe('lightweight');
  });

  it('defaults to standard for moderate tasks', () => {
    const tier = selectResponseTier('add error handling to the parser module with proper types', makeConfig() as any);
    expect(tier.tier).toBe('standard');
  });

  it('getTier returns correct maxAgents', () => {
    expect(getTier('direct').maxAgents).toBe(0);
    expect(getTier('lightweight').maxAgents).toBe(1);
    expect(getTier('standard').maxAgents).toBe(1);
    expect(getTier('full').maxAgents).toBe(5);
  });

  it('getTier returns correct model tier suggestions', () => {
    expect(getTier('direct').modelTier).toBe('none');
    expect(getTier('lightweight').modelTier).toBe('fast');
    expect(getTier('standard').modelTier).toBe('standard');
    expect(getTier('full').modelTier).toBe('premium');
  });

  it('load adjustment caps tier when load is high', () => {
    const tier = selectResponseTier(
      'refactor the entire codebase',
      makeConfig() as any,
      { currentLoad: 5 },
    );
    // High load should cap full → standard
    expect(tier.tier).toBe('standard');
  });
});

// ============================================================================
// 10. Additional Integration: Event Bus + Hooks + Tools
// ============================================================================

describe('Feature Parity: Event Bus Integration', () => {
  it('event bus supports typed subscriptions', async () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribe('session:created', (e) => events.push(e));
    await bus.emit({
      type: 'session:created',
      sessionId: 's1',
      payload: { agentName: 'fenster' },
      timestamp: new Date(),
    });
    expect(events.length).toBe(1);
    expect(events[0].payload.agentName).toBe('fenster');
  });

  it('event bus wildcard subscriptions receive all events', async () => {
    const bus = new EventBus();
    const events: any[] = [];
    bus.subscribeAll((e) => events.push(e));
    await bus.emit({ type: 'session:created', sessionId: 's1', payload: {}, timestamp: new Date() });
    await bus.emit({ type: 'session:idle', sessionId: 's2', payload: {}, timestamp: new Date() });
    expect(events.length).toBe(2);
  });

  it('event bus isolates handler errors', async () => {
    const bus = new EventBus();
    const errors: Error[] = [];
    bus.onError((e) => errors.push(e));
    bus.subscribe('session:created', () => { throw new Error('boom'); });
    await bus.emit({ type: 'session:created', sessionId: 's1', payload: {}, timestamp: new Date() });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toBe('boom');
  });
});

describe('Feature Parity: Hooks Pipeline', () => {
  it('blocks dangerous shell commands', async () => {
    const pipeline = new HookPipeline({ blockedCommands: ['rm -rf'] });
    const result = await pipeline.runPreToolHooks({
      toolName: 'bash',
      arguments: { command: 'rm -rf /' },
      agentName: 'fenster',
      sessionId: 's1',
    });
    expect(result.action).toBe('block');
  });

  it('allows safe shell commands', async () => {
    const pipeline = new HookPipeline({ blockedCommands: ['rm -rf'] });
    const result = await pipeline.runPreToolHooks({
      toolName: 'bash',
      arguments: { command: 'ls -la' },
      agentName: 'fenster',
      sessionId: 's1',
    });
    expect(result.action).toBe('allow');
  });

  it('scrubs PII from output when enabled', async () => {
    const pipeline = new HookPipeline({ scrubPii: true });
    const result = await pipeline.runPostToolHooks({
      toolName: 'read',
      arguments: {},
      result: 'Contact: user@example.com for info',
      agentName: 'fenster',
      sessionId: 's1',
    });
    expect(result.result).toContain('[EMAIL_REDACTED]');
    expect(result.result).not.toContain('user@example.com');
  });
});

describe('Feature Parity: Tool Registry', () => {
  it('registers all built-in squad tools', () => {
    const registry = new ToolRegistry();
    const tools = registry.getTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('squad_route');
    expect(names).toContain('squad_decide');
    expect(names).toContain('squad_memory');
    expect(names).toContain('squad_status');
    expect(names).toContain('squad_skill');
  });

  it('filters tools for agent by allowed list', () => {
    const registry = new ToolRegistry();
    const filtered = registry.getToolsForAgent(['squad_route', 'squad_status']);
    expect(filtered.length).toBe(2);
  });

  it('returns all tools when no filter specified', () => {
    const registry = new ToolRegistry();
    expect(registry.getTools().length).toBeGreaterThanOrEqual(5);
  });
});

describe('Feature Parity: Model Registry', () => {
  it('contains all model catalog entries', () => {
    const registry = new ModelRegistry();
    expect(registry.getAllModelIds().length).toBe(MODEL_CATALOG.length);
  });

  it('looks up model info by ID', () => {
    const registry = new ModelRegistry();
    const info = registry.getModelInfo('claude-sonnet-5.5');
    expect(info).toBeDefined();
    expect(info!.tier).toBe('standard');
    expect(info!.provider).toBe('anthropic');
  });

  it('returns fallback chain by tier', () => {
    const registry = new ModelRegistry();
    const chain = registry.getFallbackChain('standard');
    expect(chain.length).toBeGreaterThanOrEqual(2);
  });

  it('getNextFallback skips already-attempted models', () => {
    const registry = new ModelRegistry();
    const next = registry.getNextFallback(
      'claude-sonnet-4.5',
      'standard',
      new Set(['gpt-5.2-codex']),
    );
    expect(next).not.toBe('claude-sonnet-4.5');
    expect(next).not.toBe('gpt-5.2-codex');
  });
});
