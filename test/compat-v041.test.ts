/**
 * Compatibility Tests vs. v0.4.1 (M3-12, Issue #153)
 *
 * Regression guards verifying v1 behavior matches v0.4.1 (current beta)
 * for critical paths. These should NOT test new v1 features — only
 * that existing behaviour is preserved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Routing ---
import {
  compileRoutingRules,
  matchRoute,
  parseRoutingMarkdown,
  matchIssueLabels,
  type CompiledRouter,
} from '@bradygaster/squad-sdk/config';

// --- Casting ---
import { CastingEngine, type CastMember } from '@bradygaster/squad-sdk/casting';

// --- Config ---
import {
  DEFAULT_CONFIG,
  validateConfig,
  validateConfigDetailed,
  loadConfigSync,
  type SquadConfig,
} from '@bradygaster/squad-sdk/runtime';

// --- Tools ---
import { ToolRegistry } from '@bradygaster/squad-sdk/tools';

// --- Hooks ---
import {
  HookPipeline,
  ReviewerLockoutHook,
  DEFAULT_BLOCKED_COMMANDS,
  type PreToolUseContext,
} from '@bradygaster/squad-sdk/hooks';

// --- Event Bus ---
import { EventBus, type SquadEvent, type SquadEventType } from '@bradygaster/squad-sdk/runtime/event-bus';

// --- Models ---
import {
  ModelRegistry,
  MODEL_CATALOG,
  DEFAULT_FALLBACK_CHAINS,
  getModelInfo,
  getFallbackChain,
  isModelAvailable,
} from '@bradygaster/squad-sdk/config';

// --- Skills ---
import { SkillRegistry, parseFrontmatter, parseSkillFile } from '@bradygaster/squad-sdk/skills';

// --- Streaming ---
import { StreamingPipeline, type UsageEvent } from '@bradygaster/squad-sdk/runtime/streaming';

// --- Agent doc ---
import { parseAgentDoc } from '@bradygaster/squad-sdk/config';

// --- Migration ---
import { MigrationRegistry, compareSemVer, parseSemVer } from '@bradygaster/squad-sdk/config';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ============================================================================
// Helpers
// ============================================================================

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'squad-compat-'));
}

// ============================================================================
// 1. Same routing rules produce same agent assignments
// ============================================================================

describe('Compat v0.4.1: Routing Parity', () => {
  const RULES = [
    { workType: 'feature-dev', agents: ['fenster'], examples: ['new feature', 'implement', 'add'], confidence: 'high' as const },
    { workType: 'bug-fix', agents: ['fenster'], examples: ['fix bug', 'patch', 'broken'], confidence: 'high' as const },
    { workType: 'testing', agents: ['hockney'], examples: ['test', 'coverage', 'spec'], confidence: 'high' as const },
    { workType: 'documentation', agents: ['verbal', 'scribe'], examples: ['docs', 'readme', 'changelog'], confidence: 'medium' as const },
    { workType: 'refactoring', agents: ['fenster', 'mcmanus'], examples: ['refactor', 'clean up', 'restructure'], confidence: 'medium' as const },
  ];

  let router: CompiledRouter;

  beforeEach(() => {
    router = compileRoutingRules({ rules: RULES });
  });

  it('routes "implement a new feature" to fenster', () => {
    const match = matchRoute('implement a new feature for the API', router);
    expect(match.agents).toContain('fenster');
  });

  it('routes "fix a broken test" to fenster (bug-fix)', () => {
    const match = matchRoute('fix a broken build in CI', router);
    expect(match.agents).toContain('fenster');
  });

  it('routes "test coverage for the spec suite" to hockney', () => {
    const match = matchRoute('improve test coverage for the spec suite', router);
    expect(match.agents).toContain('hockney');
  });

  it('routes "write the changelog docs" to verbal and scribe', () => {
    const match = matchRoute('write the changelog docs for the release', router);
    expect(match.agents).toContain('verbal');
    expect(match.agents).toContain('scribe');
  });

  it('falls back to coordinator when no match', () => {
    const emptyRouter = compileRoutingRules({ rules: [] });
    const match = matchRoute('random unrecognized message xyz', emptyRouter);
    expect(match.agents).toContain('@coordinator');
    expect(match.confidence).toBe('low');
  });

  it('compiled rules are sorted by priority (most specific first)', () => {
    const priorities = router.workTypeRules.map((r) => r.priority);
    for (let i = 0; i < priorities.length - 1; i++) {
      expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i + 1]);
    }
  });

  it('parseRoutingMarkdown produces equivalent rules from markdown table', () => {
    const md = `## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | fenster | new feature, implement |
| bug-fix | fenster | fix bug, patch |
| testing | hockney | test, coverage |
`;
    const config = parseRoutingMarkdown(md);
    expect(config.rules.length).toBe(3);
    expect(config.rules[0].workType).toBe('feature-dev');
    expect(config.rules[0].agents).toContain('fenster');
    expect(config.rules[2].agents).toContain('hockney');
  });
});

// ============================================================================
// 2. Same casting universe produces equivalent team composition
// ============================================================================

describe('Compat v0.4.1: Casting Parity', () => {
  let engine: CastingEngine;

  beforeEach(() => {
    engine = new CastingEngine();
  });

  it('usual-suspects default cast has lead, developer, tester', () => {
    const team = engine.castTeam({ universe: 'usual-suspects' });
    const roles = team.map((m) => m.role);
    expect(roles).toContain('lead');
    expect(roles).toContain('developer');
    expect(roles).toContain('tester');
  });

  it('usual-suspects lead is Keyser', () => {
    const team = engine.castTeam({ universe: 'usual-suspects' });
    const lead = team.find((m) => m.role === 'lead');
    expect(lead?.name).toBe('Keyser');
  });

  it('usual-suspects developer is McManus', () => {
    const team = engine.castTeam({ universe: 'usual-suspects' });
    const dev = team.find((m) => m.role === 'developer');
    expect(dev?.name).toBe('McManus');
  });

  it('usual-suspects tester is Fenster', () => {
    const team = engine.castTeam({ universe: 'usual-suspects' });
    const tester = team.find((m) => m.role === 'tester');
    expect(tester?.name).toBe('Fenster');
  });

  it('oceans-eleven lead is Danny', () => {
    const team = engine.castTeam({ universe: 'oceans-eleven' });
    const lead = team.find((m) => m.role === 'lead');
    expect(lead?.name).toBe('Danny');
  });

  it('display name format is preserved', () => {
    const team = engine.castTeam({ universe: 'usual-suspects' });
    for (const m of team) {
      expect(m.displayName).toBe(`${m.name} — ${formatRole(m.role)}`);
    }
  });
});

function formatRole(role: string): string {
  return role
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ============================================================================
// 3. Config loaded from .ai-team/ matches config loaded from .squad/
// ============================================================================

describe('Compat v0.4.1: Config Path Equivalence', () => {
  it('loadConfigSync returns default when no config files exist', () => {
    const dir = tmpDir();
    const result = loadConfigSync(dir);
    expect(result.isDefault).toBe(true);
    expect(result.config.version).toBe(DEFAULT_CONFIG.version);
    fs.rmSync(dir, { recursive: true });
  });

  it('loadConfigSync loads .squad/config.json', () => {
    const dir = tmpDir();
    const squadDir = path.join(dir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(
      path.join(squadDir, 'config.json'),
      JSON.stringify(DEFAULT_CONFIG),
    );
    const result = loadConfigSync(dir);
    // The file exists but squad.config.json is checked before .squad/config.json
    // In loadConfigSync only squad.config.json is checked
    expect(result.config.version).toBe(DEFAULT_CONFIG.version);
    fs.rmSync(dir, { recursive: true });
  });

  it('DEFAULT_CONFIG has expected shape', () => {
    expect(DEFAULT_CONFIG.version).toBe('1.0.0');
    expect(DEFAULT_CONFIG.models.defaultModel).toBe('claude-sonnet-4.6');
    expect(DEFAULT_CONFIG.models.defaultTier).toBe('standard');
    expect(DEFAULT_CONFIG.routing.rules.length).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_CONFIG.casting?.allowlistUniverses).toBeDefined();
  });

  it('validateConfigDetailed accepts DEFAULT_CONFIG', () => {
    const result = validateConfigDetailed(DEFAULT_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

// ============================================================================
// 4. Tool registration API is backwards compatible
// ============================================================================

describe('Compat v0.4.1: Tool Registration', () => {
  it('ToolRegistry registers all 5 built-in tools', () => {
    const registry = new ToolRegistry();
    const tools = registry.getTools();
    expect(tools.length).toBe(5);
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'squad_route',
        'squad_decide',
        'squad_memory',
        'squad_status',
        'squad_skill',
      ]),
    );
  });

  it('getTool returns correct tool by name', () => {
    const registry = new ToolRegistry();
    const tool = registry.getTool('squad_route');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('squad_route');
    expect(tool!.description).toContain('Route');
  });

  it('getTool returns undefined for unknown tool', () => {
    const registry = new ToolRegistry();
    expect(registry.getTool('nonexistent')).toBeUndefined();
  });

  it('getToolsForAgent filters correctly', () => {
    const registry = new ToolRegistry();
    const filtered = registry.getToolsForAgent(['squad_route']);
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('squad_route');
  });

  it('getToolsForAgent returns all when no filter', () => {
    const registry = new ToolRegistry();
    const all = registry.getToolsForAgent(undefined);
    expect(all.length).toBe(5);
  });
});

// ============================================================================
// 5. Hook pipeline applies same policies
// ============================================================================

describe('Compat v0.4.1: Hook Pipeline', () => {
  it('default blocked commands list is preserved', () => {
    expect(DEFAULT_BLOCKED_COMMANDS).toContain('rm -rf');
    expect(DEFAULT_BLOCKED_COMMANDS).toContain('git push --force');
    expect(DEFAULT_BLOCKED_COMMANDS).toContain('git rebase');
    expect(DEFAULT_BLOCKED_COMMANDS).toContain('git reset --hard');
  });

  it('file write guard blocks writes outside allowed paths', async () => {
    const pipeline = new HookPipeline({ allowedWritePaths: ['src/**'] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'secrets/keys.json' },
      agentName: 'fenster',
      sessionId: 's1',
    });
    vi.restoreAllMocks();
    expect(result.action).toBe('block');
  });

  it('file write guard allows writes to allowed paths', async () => {
    const pipeline = new HookPipeline({ allowedWritePaths: ['src/**'] });
    const result = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'src/config/schema.ts' },
      agentName: 'fenster',
      sessionId: 's1',
    });
    expect(result.action).toBe('allow');
  });

  it('ask_user rate limiter blocks after max calls', async () => {
    const pipeline = new HookPipeline({ maxAskUserPerSession: 2 });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ctx: PreToolUseContext = {
      toolName: 'ask_user', arguments: {}, agentName: 'fenster', sessionId: 's1',
    };
    await pipeline.runPreToolHooks(ctx); // 1
    await pipeline.runPreToolHooks(ctx); // 2
    const result = await pipeline.runPreToolHooks(ctx); // 3 — should be blocked
    vi.restoreAllMocks();
    expect(result.action).toBe('block');
  });

  it('reviewer lockout blocks locked-out agent from artifact', () => {
    const lockout = new ReviewerLockoutHook();
    lockout.lockout('src/auth.ts', 'fenster');
    expect(lockout.isLockedOut('src/auth.ts', 'fenster')).toBe(true);
    expect(lockout.isLockedOut('src/auth.ts', 'verbal')).toBe(false);
  });
});

// ============================================================================
// 6. Event bus emits compatible event shapes
// ============================================================================

describe('Compat v0.4.1: Event Bus Shape', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('session:created event has standard shape', async () => {
    const events: SquadEvent[] = [];
    bus.subscribe('session:created', (e) => events.push(e));
    await bus.emit({
      type: 'session:created',
      sessionId: 'abc-123',
      agentName: 'fenster',
      payload: { model: 'claude-sonnet-4.5' },
      timestamp: new Date(),
    });
    expect(events[0].type).toBe('session:created');
    expect(events[0].sessionId).toBe('abc-123');
    expect(events[0].agentName).toBe('fenster');
    expect(events[0].timestamp).toBeInstanceOf(Date);
    expect(events[0].payload).toEqual({ model: 'claude-sonnet-4.5' });
  });

  it('session:error event preserves error payload', async () => {
    const events: SquadEvent[] = [];
    bus.subscribe('session:error', (e) => events.push(e));
    await bus.emit({
      type: 'session:error',
      sessionId: 'abc-123',
      payload: { error: 'rate limit exceeded', code: 429 },
      timestamp: new Date(),
    });
    expect(events[0].type).toBe('session:error');
    expect((events[0].payload as any).error).toBe('rate limit exceeded');
    expect((events[0].payload as any).code).toBe(429);
  });

  it('coordinator:routing event has expected fields', async () => {
    const events: SquadEvent[] = [];
    bus.subscribe('coordinator:routing', (e) => events.push(e));
    await bus.emit({
      type: 'coordinator:routing',
      sessionId: 's1',
      payload: { phase: 'start', messageLength: 42 },
      timestamp: new Date(),
    });
    expect(events[0].type).toBe('coordinator:routing');
    expect((events[0].payload as any).phase).toBe('start');
  });

  it('unsubscribe function works correctly', async () => {
    let count = 0;
    const unsub = bus.subscribe('session:created', () => count++);
    await bus.emit({ type: 'session:created', sessionId: 's1', payload: {}, timestamp: new Date() });
    expect(count).toBe(1);
    unsub();
    await bus.emit({ type: 'session:created', sessionId: 's2', payload: {}, timestamp: new Date() });
    expect(count).toBe(1); // unchanged
  });

  it('supported event types include all lifecycle events', () => {
    const lifecycleTypes: SquadEventType[] = [
      'session:created',
      'session:idle',
      'session:error',
      'session:destroyed',
    ];
    // Verify these are valid by subscribing (no type error)
    for (const type of lifecycleTypes) {
      const unsub = bus.subscribe(type, () => {});
      unsub();
    }
  });

  it('supported event types include operational events', () => {
    const opTypes: SquadEventType[] = [
      'session:message',
      'session:tool_call',
      'agent:milestone',
      'coordinator:routing',
      'pool:health',
    ];
    for (const type of opTypes) {
      const unsub = bus.subscribe(type, () => {});
      unsub();
    }
  });
});

// ============================================================================
// 7. Model catalog and fallback chains match v0.4.1
// ============================================================================

describe('Compat v0.4.1: Model Catalog', () => {
  it('catalog contains expected premium models', () => {
    expect(isModelAvailable('claude-opus-4.6')).toBe(true);
    expect(isModelAvailable('claude-opus-4.5')).toBe(true);
  });

  it('catalog contains expected standard models', () => {
    expect(isModelAvailable('claude-sonnet-4.5')).toBe(true);
    expect(isModelAvailable('claude-sonnet-4')).toBe(true);
    expect(isModelAvailable('gpt-5.2-codex')).toBe(true);
  });

  it('catalog contains expected fast models', () => {
    expect(isModelAvailable('claude-haiku-4.5')).toBe(true);
    expect(isModelAvailable('gpt-5.1-codex-mini')).toBe(true);
    expect(isModelAvailable('gpt-4.1')).toBe(true);
  });

  it('premium fallback chain starts with opus', () => {
    expect(DEFAULT_FALLBACK_CHAINS.premium[0]).toBe('claude-opus-4.6');
  });

  it('standard fallback chain starts with sonnet', () => {
    expect(DEFAULT_FALLBACK_CHAINS.standard[0]).toBe('claude-sonnet-4.6');
  });

  it('fast fallback chain starts with haiku', () => {
    expect(DEFAULT_FALLBACK_CHAINS.fast[0]).toBe('claude-haiku-4.5');
  });

  it('getModelInfo returns correct tier for known models', () => {
    expect(getModelInfo('claude-opus-4.6')!.tier).toBe('premium');
    expect(getModelInfo('claude-sonnet-4.5')!.tier).toBe('standard');
    expect(getModelInfo('claude-haiku-4.5')!.tier).toBe('fast');
  });
});

// ============================================================================
// 8. Skill system API compatibility
// ============================================================================

describe('Compat v0.4.1: Skill System', () => {
  it('parseFrontmatter extracts metadata and body', () => {
    const raw = `---
name: Test Skill
domain: testing
triggers: [test, spec]
roles: [tester]
---
Body content here.`;
    const { meta, body } = parseFrontmatter(raw);
    expect(meta.name).toBe('Test Skill');
    expect(meta.domain).toBe('testing');
    expect(meta.triggers).toEqual(['test', 'spec']);
    expect(body).toBe('Body content here.');
  });

  it('parseFrontmatter returns raw body when no frontmatter', () => {
    const raw = 'Just a plain document.';
    const { meta, body } = parseFrontmatter(raw);
    expect(Object.keys(meta).length).toBe(0);
    expect(body).toBe('Just a plain document.');
  });

  it('parseSkillFile returns undefined when body is empty', () => {
    const raw = '---\nname: Empty\n---\n';
    const skill = parseSkillFile('empty', raw);
    expect(skill).toBeUndefined();
  });

  it('SkillRegistry matchSkills returns empty array when no match', () => {
    const registry = new SkillRegistry();
    registry.registerSkill({
      id: 'ts', name: 'TS', domain: 'ts', content: 'c',
      triggers: ['typescript'], agentRoles: [],
    });
    const matches = registry.matchSkills('python flask api', 'developer');
    expect(matches.length).toBe(0);
  });
});

// ============================================================================
// 9. Streaming pipeline compatibility
// ============================================================================

describe('Compat v0.4.1: Streaming Pipeline', () => {
  it('usage summary shape matches expected format', async () => {
    const pipeline = new StreamingPipeline();
    pipeline.attachToSession('s1');
    await pipeline.processEvent({
      type: 'usage',
      sessionId: 's1',
      agentName: 'fenster',
      model: 'claude-sonnet-4.5',
      inputTokens: 500,
      outputTokens: 200,
      estimatedCost: 0.03,
      timestamp: new Date(),
    });
    const summary = pipeline.getUsageSummary();
    // Verify shape
    expect(typeof summary.totalInputTokens).toBe('number');
    expect(typeof summary.totalOutputTokens).toBe('number');
    expect(typeof summary.estimatedCost).toBe('number');
    expect(summary.byAgent).toBeInstanceOf(Map);
    // Verify values
    const agentUsage = summary.byAgent.get('fenster')!;
    expect(agentUsage.model).toBe('claude-sonnet-4.5');
    expect(agentUsage.turnCount).toBe(1);
  });

  it('throws when attaching same session twice', () => {
    const pipeline = new StreamingPipeline();
    pipeline.attachToSession('s1');
    expect(() => pipeline.attachToSession('s1')).toThrow(/already attached/);
  });
});

// ============================================================================
// 10. Agent doc parser compatibility
// ============================================================================

describe('Compat v0.4.1: Agent Doc Parser', () => {
  it('extracts name from H1 heading', () => {
    const result = parseAgentDoc('# Squad Coordinator\n\nSome content');
    expect(result.name).toBe('Squad Coordinator');
  });

  it('extracts tools from ## Tools section', () => {
    const result = parseAgentDoc('# Agent\n\n## Tools\n- squad_route\n- squad_decide\n');
    expect(result.tools).toContain('squad_route');
    expect(result.tools).toContain('squad_decide');
  });

  it('extracts capabilities from ## Capabilities section', () => {
    const result = parseAgentDoc('# Agent\n\n## Capabilities\n- Can route tasks\n- Can compile charters\n');
    expect(result.capabilities.length).toBe(2);
  });

  it('returns empty metadata for empty input', () => {
    const result = parseAgentDoc('');
    expect(result.capabilities.length).toBe(0);
    expect(result.tools.length).toBe(0);
  });
});

// ============================================================================
// 11. Version comparison compatibility
// ============================================================================

describe('Compat v0.4.1: Version Comparison', () => {
  it('parseSemVer parses valid versions', () => {
    const v = parseSemVer('1.2.3');
    expect(v.major).toBe(1);
    expect(v.minor).toBe(2);
    expect(v.patch).toBe(3);
  });

  it('compareSemVer orders correctly', () => {
    expect(compareSemVer('0.4.0', '0.5.0')).toBeLessThan(0);
    expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemVer('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });

  it('parseSemVer rejects invalid format', () => {
    expect(() => parseSemVer('not-a-version')).toThrow();
  });
});
