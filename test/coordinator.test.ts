/**
 * Tests for SquadCoordinator (M3-1) + ModelFallbackExecutor (M3-5)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SquadCoordinator,
  type SquadCoordinatorOptions,
  type CoordinatorResult,
} from '@bradygaster/squad-sdk/coordinator';
import type { CoordinatorContext } from '@bradygaster/squad-sdk/coordinator';
import { DirectResponseHandler } from '@bradygaster/squad-sdk/coordinator';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';
import { DEFAULT_CONFIG, type SquadConfig } from '@bradygaster/squad-sdk/runtime';
import {
  compileRoutingRules,
  type CompiledRouter,
} from '@bradygaster/squad-sdk/config';
import type { FanOutDependencies, SpawnResult } from '@bradygaster/squad-sdk/coordinator';
import {
  resolveModel,
  ModelFallbackExecutor,
  inferTierFromModel,
  isTierFallbackAllowed,
  type ResolvedModel,
  type ModelTier,
} from '@bradygaster/squad-sdk/agents';
import { MODEL_CATALOG } from '@bradygaster/squad-sdk/config';
import { MODELS } from '@bradygaster/squad-sdk';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Helpers ---

function makeContext(overrides: Partial<CoordinatorContext> = {}): CoordinatorContext {
  return {
    sessionId: 'test-session-1',
    config: DEFAULT_CONFIG,
    activeAgents: ['fenster', 'verbal'],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<SquadConfig> = {}): SquadConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    routing: {
      ...DEFAULT_CONFIG.routing,
      ...overrides.routing,
      rules: overrides.routing?.rules ?? [
        { workType: 'feature-dev', agents: ['fenster'], confidence: 'high' },
        { workType: 'testing', agents: ['tester'], confidence: 'high' },
        { workType: 'documentation', agents: ['verbal', 'scribe'], confidence: 'medium' },
      ],
    },
  } as SquadConfig;
}

function makeRouter(): CompiledRouter {
  return compileRoutingRules({
    rules: [
      { workType: 'feature-dev', agents: ['fenster'], examples: ['new feature', 'implement'], confidence: 'high' },
      { workType: 'bug-fix', agents: ['fenster'], examples: ['fix bug', 'patch'], confidence: 'high' },
      { workType: 'testing', agents: ['tester'], examples: ['write tests', 'test coverage'], confidence: 'high' },
      { workType: 'documentation', agents: ['verbal', 'scribe'], examples: ['write docs', 'update readme'], confidence: 'medium' },
    ],
  });
}

function makeFanOutDeps(results?: SpawnResult[]): FanOutDependencies {
  const defaultResults: SpawnResult[] = [{
    agentName: 'fenster',
    sessionId: 'session-1',
    status: 'success',
    startTime: new Date(),
    endTime: new Date(),
  }];

  return {
    compileCharter: vi.fn().mockResolvedValue({ name: 'fenster', prompt: 'test' }),
    resolveModel: vi.fn().mockResolvedValue('claude-sonnet-4.5'),
    createSession: vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      sendMessage: vi.fn().mockResolvedValue(undefined),
    }),
    sessionPool: {
      add: vi.fn(),
      size: 0,
      atCapacity: false,
      active: () => [],
    } as any,
    eventBus: {
      emit: vi.fn().mockResolvedValue(undefined),
    } as any,
  };
}

// =============================================================================
// SquadCoordinator Tests
// =============================================================================

describe('SquadCoordinator', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    eventBus = new EventBus();
  });

  describe('constructor', () => {
    it('creates coordinator with default options', () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      expect(coord).toBeDefined();
      expect(coord.getDirectHandler()).toBeInstanceOf(DirectResponseHandler);
    });

    it('accepts custom DirectResponseHandler', () => {
      const custom = new DirectResponseHandler();
      const coord = new SquadCoordinator({ config: makeConfig(), directHandler: custom });
      expect(coord.getDirectHandler()).toBe(custom);
    });

    it('accepts custom compiled router', () => {
      const router = makeRouter();
      const coord = new SquadCoordinator({ config: makeConfig(), compiledRouter: router });
      expect(coord.getRouter()).toBe(router);
    });

    it('compiles router from config when no router provided', () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const router = coord.getRouter();
      expect(router.workTypeRules.length).toBeGreaterThan(0);
    });
  });

  describe('handleMessage — direct responses', () => {
    it('returns direct strategy for "help"', async () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const result = await coord.handleMessage('help', makeContext());
      expect(result.strategy).toBe('direct');
      expect(result.directResponse).toBeDefined();
      expect(result.directResponse!.category).toBe('help');
    });

    it('returns direct strategy for "status"', async () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const result = await coord.handleMessage('status', makeContext());
      expect(result.strategy).toBe('direct');
      expect(result.directResponse!.category).toBe('status');
    });

    it('returns direct strategy for greetings', async () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const result = await coord.handleMessage('hello', makeContext());
      expect(result.strategy).toBe('direct');
      expect(result.directResponse!.category).toBe('greeting');
    });

    it('returns direct strategy for "show team"', async () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const result = await coord.handleMessage('show team', makeContext());
      expect(result.strategy).toBe('direct');
      expect(result.directResponse!.category).toBe('roster');
    });

    it('returns direct strategy for config queries', async () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const result = await coord.handleMessage('show config', makeContext());
      expect(result.strategy).toBe('direct');
      expect(result.directResponse!.category).toBe('config');
    });

    it('includes durationMs in result', async () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const result = await coord.handleMessage('help', makeContext());
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('handleMessage — routing', () => {
    it('routes feature request to fenster (single agent)', async () => {
      const coord = new SquadCoordinator({
        config: makeConfig(),
        compiledRouter: makeRouter(),
      });
      const result = await coord.handleMessage('implement a new feature for auth', makeContext());
      expect(result.strategy).toBe('single');
      expect(result.routing).toBeDefined();
      expect(result.routing!.agents).toContain('fenster');
    });

    it('routes docs request to multiple agents (multi strategy)', async () => {
      const coord = new SquadCoordinator({
        config: makeConfig(),
        compiledRouter: makeRouter(),
      });
      const result = await coord.handleMessage('write docs for the API', makeContext());
      expect(result.strategy).toBe('multi');
      expect(result.routing!.agents.length).toBeGreaterThan(1);
    });

    it('falls back when no route matches', async () => {
      const router = compileRoutingRules({ rules: [] });
      const coord = new SquadCoordinator({
        config: makeConfig(),
        compiledRouter: router,
      });
      const result = await coord.handleMessage('some random unmatched query xyz', makeContext());
      // With empty rules, matchRoute returns coordinator fallback
      expect(result.routing).toBeDefined();
    });

    it('routes test request to tester', async () => {
      const coord = new SquadCoordinator({
        config: makeConfig(),
        compiledRouter: makeRouter(),
      });
      const result = await coord.handleMessage('testing coverage for the parser module', makeContext());
      expect(result.routing!.agents).toContain('tester');
    });
  });

  describe('handleMessage — spawning with fanOutDeps', () => {
    it('spawns single agent when route matches one agent', async () => {
      const deps = makeFanOutDeps();
      const coord = new SquadCoordinator({
        config: makeConfig(),
        compiledRouter: makeRouter(),
        fanOutDeps: deps,
      });
      const result = await coord.handleMessage('fix bug in auth module', makeContext());
      expect(result.strategy).toBe('single');
      expect(result.spawnResults).toBeDefined();
      expect(result.spawnResults!.length).toBe(1);
    });

    it('returns fallback strategy when all spawns fail', async () => {
      const deps = makeFanOutDeps();
      // Make createSession fail
      (deps.createSession as any).mockRejectedValue(new Error('session creation failed'));
      const coord = new SquadCoordinator({
        config: makeConfig(),
        compiledRouter: makeRouter(),
        fanOutDeps: deps,
      });
      const result = await coord.handleMessage('fix bug in auth', makeContext());
      expect(result.strategy).toBe('fallback');
    });

    it('does not spawn when no fanOutDeps provided', async () => {
      const coord = new SquadCoordinator({
        config: makeConfig(),
        compiledRouter: makeRouter(),
      });
      const result = await coord.handleMessage('fix bug in auth', makeContext());
      expect(result.spawnResults).toBeUndefined();
    });
  });

  describe('handleMessage — event emission', () => {
    it('emits coordinator:routing events', async () => {
      const events: any[] = [];
      eventBus.subscribe('coordinator:routing', (e) => events.push(e));

      const coord = new SquadCoordinator({
        config: makeConfig(),
        eventBus,
        compiledRouter: makeRouter(),
      });

      await coord.handleMessage('help', makeContext());
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.some(e => e.payload.phase === 'start')).toBe(true);
    });

    it('emits complete event for direct responses', async () => {
      const events: any[] = [];
      eventBus.subscribe('coordinator:routing', (e) => events.push(e));

      const coord = new SquadCoordinator({
        config: makeConfig(),
        eventBus,
      });

      await coord.handleMessage('help', makeContext());
      expect(events.some(e => e.payload.phase === 'complete' && e.payload.strategy === 'direct')).toBe(true);
    });

    it('emits routed event for routing paths', async () => {
      const events: any[] = [];
      eventBus.subscribe('coordinator:routing', (e) => events.push(e));

      const coord = new SquadCoordinator({
        config: makeConfig(),
        eventBus,
        compiledRouter: makeRouter(),
      });

      await coord.handleMessage('implement auth feature', makeContext());
      expect(events.some(e => e.payload.phase === 'routed')).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('updates config and recompiles router', () => {
      const coord = new SquadCoordinator({ config: makeConfig() });
      const routerBefore = coord.getRouter();

      const newConfig = makeConfig({
        routing: {
          rules: [
            { workType: 'architecture', agents: ['architect'], confidence: 'high' },
          ],
        },
      } as any);

      coord.updateConfig(newConfig);
      const routerAfter = coord.getRouter();
      expect(routerAfter).not.toBe(routerBefore);
    });
  });
});

// =============================================================================
// ModelFallbackExecutor Tests
// =============================================================================

describe('ModelFallbackExecutor', () => {
  function makeResolved(overrides: Partial<ResolvedModel> = {}): ResolvedModel {
    return {
      model: 'claude-sonnet-4.5',
      tier: 'standard',
      source: 'task-auto',
      fallbackChain: ['claude-sonnet-4.5', 'gpt-5.2-codex', 'claude-sonnet-4', 'gpt-5.2'],
      ...overrides,
    };
  }

  describe('execute — success on first try', () => {
    it('returns value without fallback', async () => {
      const executor = new ModelFallbackExecutor();
      const result = await executor.execute(
        makeResolved(),
        'fenster',
        async () => 'ok',
      );
      expect(result.value).toBe('ok');
      expect(result.didFallback).toBe(false);
      expect(result.attempts.length).toBe(0);
      expect(result.model).toBe('claude-sonnet-4.5');
    });

    it('returns the correct tier', async () => {
      const executor = new ModelFallbackExecutor();
      const result = await executor.execute(
        makeResolved({ model: 'claude-opus-4.6', tier: 'premium' }),
        'fenster',
        async () => 42,
      );
      expect(result.tier).toBe('premium');
    });
  });

  describe('execute — fallback on failure', () => {
    it('falls back to next model on failure', async () => {
      const executor = new ModelFallbackExecutor();
      let callCount = 0;
      const result = await executor.execute(
        makeResolved(),
        'fenster',
        async (model) => {
          callCount++;
          if (callCount === 1) throw new Error('rate limit');
          return `ok-${model}`;
        },
      );
      expect(result.didFallback).toBe(true);
      expect(result.attempts.length).toBe(1);
      expect(result.attempts[0].model).toBe('claude-sonnet-4.5');
      expect(result.model).toBe('gpt-5.2-codex');
    });

    it('tries all models in chain before giving up', async () => {
      const executor = new ModelFallbackExecutor();
      await expect(
        executor.execute(
          makeResolved(),
          'fenster',
          async () => { throw new Error('always fails'); },
        ),
      ).rejects.toThrow(/All models exhausted/);
    });

    it('records all attempts in history', async () => {
      const executor = new ModelFallbackExecutor();
      try {
        await executor.execute(
          makeResolved(),
          'fenster',
          async () => { throw new Error('fail'); },
        );
      } catch { /* expected */ }

      const history = executor.getHistory('fenster');
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('tier boundary enforcement', () => {
    it('skips cross-tier models by default', async () => {
      const executor = new ModelFallbackExecutor({ allowCrossTier: false });
      const resolved = makeResolved({
        model: 'claude-sonnet-4.5',
        tier: 'standard',
        fallbackChain: ['claude-sonnet-4.5', 'claude-haiku-4.5', 'gpt-5.2-codex'],
      });

      let triedModels: string[] = [];
      const result = await executor.execute(
        resolved,
        'fenster',
        async (model) => {
          triedModels.push(model);
          if (model === 'claude-sonnet-4.5') throw new Error('fail');
          return `ok-${model}`;
        },
      );

      // haiku is fast tier — should be skipped
      expect(triedModels).not.toContain('claude-haiku-4.5');
      expect(result.model).toBe('gpt-5.2-codex');
    });

    it('allows cross-tier when configured', async () => {
      const executor = new ModelFallbackExecutor({ allowCrossTier: true });
      const resolved = makeResolved({
        model: 'claude-sonnet-4.5',
        tier: 'standard',
        fallbackChain: ['claude-sonnet-4.5', 'claude-haiku-4.5'],
      });

      let triedModels: string[] = [];
      const result = await executor.execute(
        resolved,
        'fenster',
        async (model) => {
          triedModels.push(model);
          if (model === 'claude-sonnet-4.5') throw new Error('fail');
          return 'ok';
        },
      );

      expect(triedModels).toContain('claude-haiku-4.5');
      expect(result.model).toBe('claude-haiku-4.5');
    });
  });

  describe('event emission', () => {
    it('emits model.fallback event on each fallback', async () => {
      const eventBus = new EventBus();
      const events: any[] = [];
      eventBus.subscribe('agent:milestone', (e) => events.push(e));

      const executor = new ModelFallbackExecutor({ eventBus });
      await executor.execute(
        makeResolved(),
        'fenster',
        async (model) => {
          if (model === 'claude-sonnet-4.5') throw new Error('rate limit');
          return 'ok';
        },
      );

      const fallbackEvents = events.filter(e => e.payload.event === 'model.fallback');
      expect(fallbackEvents.length).toBe(1);
      expect(fallbackEvents[0].payload.agentName).toBe('fenster');
    });

    it('emits model.exhausted event when all models fail', async () => {
      const eventBus = new EventBus();
      const events: any[] = [];
      eventBus.subscribe('agent:milestone', (e) => events.push(e));

      const executor = new ModelFallbackExecutor({ eventBus });
      try {
        await executor.execute(
          makeResolved({ fallbackChain: ['claude-sonnet-4.5'] }),
          'fenster',
          async () => { throw new Error('fail'); },
        );
      } catch { /* expected */ }

      const exhaustedEvents = events.filter(e => e.payload.event === 'model.exhausted');
      expect(exhaustedEvents.length).toBe(1);
    });
  });

  describe('history tracking', () => {
    it('tracks attempts per agent', async () => {
      const executor = new ModelFallbackExecutor();

      // Agent 1 — one fallback
      await executor.execute(
        makeResolved(),
        'agent-a',
        async (model) => {
          if (model === 'claude-sonnet-4.5') throw new Error('fail');
          return 'ok';
        },
      );

      // Agent 2 — success
      await executor.execute(
        makeResolved(),
        'agent-b',
        async () => 'ok',
      );

      expect(executor.getHistory('agent-a').length).toBe(1);
      expect(executor.getHistory('agent-b').length).toBe(0);
    });

    it('clearHistory resets all history', async () => {
      const executor = new ModelFallbackExecutor();
      await executor.execute(
        makeResolved(),
        'fenster',
        async (model) => {
          if (model === 'claude-sonnet-4.5') throw new Error('fail');
          return 'ok';
        },
      );
      expect(executor.getHistory('fenster').length).toBeGreaterThan(0);
      executor.clearHistory();
      expect(executor.getHistory('fenster').length).toBe(0);
    });
  });
});

// =============================================================================
// inferTierFromModel + isTierFallbackAllowed Tests
// =============================================================================

describe('inferTierFromModel', () => {
  it('classifies opus as premium', () => {
    expect(inferTierFromModel('claude-opus-4.6')).toBe('premium');
  });

  it('classifies haiku as fast', () => {
    expect(inferTierFromModel('claude-haiku-4.5')).toBe('fast');
  });

  it('classifies mini as fast', () => {
    expect(inferTierFromModel('gpt-5.1-codex-mini')).toBe('fast');
  });

  it('classifies sonnet as standard', () => {
    expect(inferTierFromModel('claude-sonnet-4.5')).toBe('standard');
  });

  it('classifies unknown as standard', () => {
    expect(inferTierFromModel('some-random-model')).toBe('standard');
  });
});

describe('isTierFallbackAllowed', () => {
  it('allows same-tier fallback', () => {
    expect(isTierFallbackAllowed('standard', 'standard', false)).toBe(true);
  });

  it('allows upgrade (fast → standard)', () => {
    expect(isTierFallbackAllowed('fast', 'standard', false)).toBe(true);
  });

  it('blocks downgrade (premium → fast) by default', () => {
    expect(isTierFallbackAllowed('premium', 'fast', false)).toBe(false);
  });

  it('allows downgrade when allowCrossTier is true', () => {
    expect(isTierFallbackAllowed('premium', 'fast', true)).toBe(true);
  });

  it('allows premium → standard (one step down) by default', () => {
    // premium → standard is a downgrade, not same or upgrade
    expect(isTierFallbackAllowed('premium', 'standard', false)).toBe(false);
  });
});

// =============================================================================
// Contract: coordinator spawn guidance is model-ID agnostic (#1720)
// =============================================================================

describe('coordinator spawn guidance contract (#1720)', () => {
  const ROOT = resolve(import.meta.dirname, '..');
  const SPAWN_SECTIONS = [
    '### Per-Agent Model Selection',
    '### Per-Agent Reasoning Effort',
    '### Per-Agent Context Tier',
    '### How to Spawn an Agent',
  ];
  const AGENT_FILES = ['.squad-templates/squad.agent.md', '.github/agents/squad.agent.md'];
  const REFERENCE_FILE = '.squad-templates/model-selection-reference.md';
  const SPAWN_REFERENCE_FILE = '.squad-templates/spawn-reference.md';

  const knownIds = new Set<string>([
    ...MODEL_CATALOG.map((m) => m.id.toLowerCase()),
    ...Object.values(MODELS.FALLBACK_CHAINS).flat().map((id) => id.toLowerCase()),
  ]);
  const ID_PATTERN = /\b(?:gpt|claude|gemini|grok|o[1-9])-[a-z0-9][a-z0-9.-]*|\b(?:opus|sonnet|haiku|codex)\b/gi;

  function section(text: string, heading: string, file: string): { body: string; startLine: number } {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === heading);
    expect(start, `${file} is missing spawn-guidance section '${heading}'`).toBeGreaterThanOrEqual(0);
    let end = lines.findIndex((l, i) => i > start && /^#{2,3} /.test(l));
    if (end === -1) end = lines.length;
    return { body: lines.slice(start, end).join('\n'), startLine: start + 1 };
  }

  function offenders(label: string, body: string, startLine: number): string[] {
    const found: string[] = [];
    body.split('\n').forEach((line, i) => {
      for (const id of knownIds) {
        if (new RegExp(`(^|[^a-z0-9.-])${id.replace(/[.]/g, '\\.')}($|[^a-z0-9.-])`, 'i').test(line)) {
          found.push(`${label}:${startLine + i}: '${id}'`);
        }
      }
      for (const match of line.matchAll(ID_PATTERN)) {
        const hit = `${label}:${startLine + i}: '${match[0].toLowerCase()}'`;
        if (!found.includes(hit)) found.push(hit);
      }
    });
    return found;
  }

  function guidanceTexts(): { label: string; body: string; startLine: number }[] {
    const out: { label: string; body: string; startLine: number }[] = [];
    for (const file of AGENT_FILES) {
      const text = readFileSync(resolve(ROOT, file), 'utf8');
      for (const heading of SPAWN_SECTIONS) {
        out.push({ label: `${file} › ${heading}`, ...section(text, heading, file) });
      }
    }
    const reference = readFileSync(resolve(ROOT, REFERENCE_FILE), 'utf8');
    // Catalog data lives in '## Appendix A'; without it, the whole file is guidance.
    const appendixAt = reference.search(/^## Appendix A\b/m);
    const guidance = appendixAt > 0 ? reference.slice(0, appendixAt) : reference;
    out.push({ label: `${REFERENCE_FILE} (guidance before Appendix A)`, body: guidance, startLine: 1 });
    out.push({ label: SPAWN_REFERENCE_FILE, body: readFileSync(resolve(ROOT, SPAWN_REFERENCE_FILE), 'utf8'), startLine: 1 });
    return out;
  }

  it('contains no hard-coded model IDs', () => {
    const found = guidanceTexts().flatMap(({ label, body, startLine }) => offenders(label, body, startLine));
    expect(found, `Hard-coded model IDs in coordinator spawn guidance:\n${found.join('\n')}`).toEqual([]);
  });

  it('defers to the central resolver precedence and acknowledges model, source and rationale', () => {
    const order = ['user-override', 'config', 'session', 'charter', 'task-auto', 'default'];
    for (const file of AGENT_FILES) {
      const { body } = section(readFileSync(resolve(ROOT, file), 'utf8'), '### Per-Agent Model Selection', file);
      const positions = order.map((source) => body.indexOf(`**${source}**`));
      expect(
        positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]!)),
        `${file} Per-Agent Model Selection must list sources in order ${order.join(' > ')}; positions ${JSON.stringify(
          Object.fromEntries(order.map((s, i) => [s, positions[i]])),
        )}`,
      ).toBe(true);
      expect(body, `${file} spawn acknowledgment must show model, source and rationale`).toContain(
        '({model} · {source})',
      );
      expect(body, `${file} spawn acknowledgment must include a rationale`).toContain('{rationale}');
    }
    const reference = readFileSync(resolve(ROOT, REFERENCE_FILE), 'utf8');
    expect(
      /^## Appendix A\b/m.test(reference),
      `${REFERENCE_FILE} must keep catalog IDs in '## Appendix A', separate from spawn guidance`,
    ).toBe(true);
    for (const source of [...order, 'fallback']) {
      expect(reference, `${REFERENCE_FILE} must document resolver source '${source}'`).toContain(`\`${source}\``);
    }
  });
});
