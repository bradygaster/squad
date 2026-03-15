/**
 * Builder function tests — SDK-First Squad Mode (Phase 1)
 *
 * Tests the defineTeam(), defineAgent(), defineRouting(), defineCeremony(),
 * defineHooks(), defineCasting(), and defineTelemetry() builder functions.
 *
 * Builder functions are typed identity wrappers with runtime validation.
 * Valid configs pass through; invalid configs throw with actionable messages.
 *
 * ⚠️ Implementation expected at: packages/squad-sdk/src/builders/index.ts
 * @see packages/squad-sdk/src/builders/types.ts
 * When implementation lands, remove local stubs and use real imports.
 * @module test/builders
 */

import { describe, it, expect } from 'vitest';

// Real types — these exist in the codebase already (Edie's types.ts)
import type {
  TeamDefinition,
  AgentDefinition,
  RoutingDefinition,
  RoutingRule,
  CeremonyDefinition,
  HooksDefinition,
  CastingDefinition,
  TelemetryDefinition,
  SquadSDKConfig,
} from '../packages/squad-sdk/src/builders/types.js';

// ⚠️ Note: SkillDefinition type will be added to types.ts when #255 lands
// Until then, using the stub type defined with the stub function below

// ⚠️ When the real builder functions exist, replace this block with:
//   import {
//     defineTeam, defineAgent, defineRouting, defineCeremony,
//     defineHooks, defineCasting, defineTelemetry,
//   } from '../packages/squad-sdk/src/builders/index.js';
//
// ============================================================================
// Local stubs — implement the PRD contract so tests are runnable today.
// These will be deleted once the real module lands.
// ============================================================================

class BuilderValidationError extends Error {
  constructor(
    public readonly builder: string,
    public readonly field: string,
    message: string,
  ) {
    super(`${builder}: ${message}`);
    this.name = 'BuilderValidationError';
  }
}

function defineTeam(config: TeamDefinition): TeamDefinition {
  if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
    throw new BuilderValidationError('defineTeam', 'name', 'team name is required and must be a non-empty string');
  }
  if (!Array.isArray(config.members) || config.members.length === 0) {
    throw new BuilderValidationError('defineTeam', 'members', 'team must have at least one member');
  }
  for (const member of config.members) {
    if (typeof member !== 'string' || member.trim() === '') {
      throw new BuilderValidationError('defineTeam', 'members', `invalid member reference: "${member}"`);
    }
  }
  return config;
}

function defineAgent(config: AgentDefinition): AgentDefinition {
  if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
    throw new BuilderValidationError('defineAgent', 'name', 'agent name is required and must be a non-empty string');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(config.name)) {
    throw new BuilderValidationError('defineAgent', 'name', `agent name must be kebab-case: "${config.name}"`);
  }
  if (!config.role || typeof config.role !== 'string' || config.role.trim() === '') {
    throw new BuilderValidationError('defineAgent', 'role', 'agent role is required and must be a non-empty string');
  }
  return config;
}

function defineRouting(config: RoutingDefinition): RoutingDefinition {
  if (!Array.isArray(config.rules)) {
    throw new BuilderValidationError('defineRouting', 'rules', 'routing rules must be an array');
  }
  // Check for duplicate patterns (warning-level)
  const patterns = config.rules.map((r) => r.pattern);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const p of patterns) {
    if (seen.has(p)) duplicates.push(p);
    seen.add(p);
  }
  if (duplicates.length > 0) {
    // Per PRD: "actionable error messages" — warn on duplicate patterns.
    // The real implementation may use a warning channel or throw.
    throw new BuilderValidationError(
      'defineRouting',
      'rules',
      `duplicate routing patterns detected: ${duplicates.join(', ')}`,
    );
  }
  for (const rule of config.rules) {
    if (!rule.pattern || typeof rule.pattern !== 'string') {
      throw new BuilderValidationError('defineRouting', 'rules.pattern', 'each routing rule must have a non-empty pattern');
    }
    if (!Array.isArray(rule.agents) || rule.agents.length === 0) {
      throw new BuilderValidationError('defineRouting', 'rules.agents', `rule "${rule.pattern}" must route to at least one agent`);
    }
  }
  return config;
}

function defineCeremony(config: CeremonyDefinition): CeremonyDefinition {
  if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
    throw new BuilderValidationError('defineCeremony', 'name', 'ceremony name is required and must be a non-empty string');
  }
  return config;
}

function defineHooks(config: HooksDefinition): HooksDefinition {
  // Apply defaults
  return {
    scrubPii: config.scrubPii ?? false,
    reviewerLockout: config.reviewerLockout ?? true,
    maxAskUser: config.maxAskUser ?? 3,
    ...config,
  };
}

function defineCasting(config: CastingDefinition): CastingDefinition {
  if (
    config.allowlistUniverses !== undefined &&
    Array.isArray(config.allowlistUniverses) &&
    config.allowlistUniverses.length === 0
  ) {
    throw new BuilderValidationError(
      'defineCasting',
      'allowlistUniverses',
      'universe list must not be empty when provided — omit the field for no restriction',
    );
  }
  return config;
}

function defineTelemetry(config: TelemetryDefinition): TelemetryDefinition {
  return {
    endpoint: config.endpoint ?? 'http://localhost:4317',
    enabled: config.enabled ?? true,
    serviceName: config.serviceName ?? 'squad',
    sampleRate: config.sampleRate ?? 1.0,
    ...config,
  };
}

interface SkillTool {
  name: string;
  description: string;
  when?: string;
}

interface SkillDefinition {
  name: string;
  description: string;
  domain: string;
  content: string;
  confidence?: 'high' | 'medium' | 'low';
  source?: 'manual' | 'extracted' | 'inferred';
  tools?: SkillTool[];
}

function defineSkill(config: SkillDefinition): SkillDefinition {
  if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
    throw new BuilderValidationError('defineSkill', 'name', 'skill name is required and must be a non-empty string');
  }
  if (!config.description || typeof config.description !== 'string' || config.description.trim() === '') {
    throw new BuilderValidationError('defineSkill', 'description', 'skill description is required and must be a non-empty string');
  }
  if (!config.domain || typeof config.domain !== 'string' || config.domain.trim() === '') {
    throw new BuilderValidationError('defineSkill', 'domain', 'skill domain is required and must be a non-empty string');
  }
  if (!config.content || typeof config.content !== 'string' || config.content.trim() === '') {
    throw new BuilderValidationError('defineSkill', 'content', 'skill content is required and must be a non-empty string');
  }
  if (config.confidence !== undefined) {
    const validConfidences = ['high', 'medium', 'low'];
    if (!validConfidences.includes(config.confidence)) {
      throw new BuilderValidationError('defineSkill', 'confidence', `confidence must be one of: ${validConfidences.join(', ')}`);
    }
  }
  if (config.source !== undefined) {
    const validSources = ['manual', 'extracted', 'inferred'];
    if (!validSources.includes(config.source)) {
      throw new BuilderValidationError('defineSkill', 'source', `source must be one of: ${validSources.join(', ')}`);
    }
  }
  return config;
}

// ============================================================================
// defineTeam()
// ============================================================================

describe('defineTeam()', () => {
  it('returns a typed TeamDefinition for a valid config', () => {
    const input: TeamDefinition = {
      name: 'Alpha Squad',
      description: 'Frontend team',
      members: ['edie', 'hockney', 'fenster'],
    };

    const result = defineTeam(input);
    expect(result).toEqual(input);
    expect(result.name).toBe('Alpha Squad');
    expect(result.members).toHaveLength(3);
    expect(result.description).toBe('Frontend team');
  });

  it('accepts config with projectContext', () => {
    const input: TeamDefinition = {
      name: 'Backend Squad',
      projectContext: 'TypeScript monorepo, Node 20+, ESM-only',
      members: ['kujan'],
    };

    const result = defineTeam(input);
    expect(result.projectContext).toBe('TypeScript monorepo, Node 20+, ESM-only');
  });

  it('throws with actionable message when name is missing', () => {
    expect(() =>
      defineTeam({ name: '', members: ['edie'] }),
    ).toThrow(/name.*required/i);
  });

  it('throws with actionable message when members array is empty', () => {
    expect(() =>
      defineTeam({ name: 'Empty Squad', members: [] }),
    ).toThrow(/at least one member/i);
  });

  it('throws when a member reference is blank', () => {
    expect(() =>
      defineTeam({ name: 'Bad Ref', members: ['edie', ''] }),
    ).toThrow(/invalid member/i);
  });

  it('readonly contract — returned object has readonly members array', () => {
    const result = defineTeam({ name: 'Squad', members: ['edie'] });
    // The type system enforces readonly; runtime check that shape is intact
    expect(Array.isArray(result.members)).toBe(true);
  });
});

// ============================================================================
// defineAgent()
// ============================================================================

describe('defineAgent()', () => {
  it('returns a typed AgentDefinition with all required fields', () => {
    const input: AgentDefinition = {
      name: 'edie',
      role: 'TypeScript Engineer',
    };

    const result = defineAgent(input);
    expect(result.name).toBe('edie');
    expect(result.role).toBe('TypeScript Engineer');
  });

  it('preserves optional fields when present', () => {
    const input: AgentDefinition = {
      name: 'hockney',
      role: 'Tester',
      model: 'claude-sonnet-4.5',
      tools: ['grep', 'vitest'],
      capabilities: [
        { name: 'testing', level: 'expert' },
        { name: 'code-review', level: 'proficient' },
      ],
      charter: 'Skeptical, relentless. If it can break, he\'ll find how.',
      status: 'active',
    };

    const result = defineAgent(input);
    expect(result.model).toBe('claude-sonnet-4.5');
    expect(result.tools).toEqual(['grep', 'vitest']);
    expect(result.capabilities).toHaveLength(2);
    expect(result.charter).toContain('Skeptical');
    expect(result.status).toBe('active');
  });

  it('throws when name is missing', () => {
    expect(() =>
      defineAgent({ name: '', role: 'Engineer' }),
    ).toThrow(/name.*required/i);
  });

  it('throws when name is not kebab-case', () => {
    expect(() =>
      defineAgent({ name: 'BadName', role: 'Engineer' }),
    ).toThrow(/kebab-case/i);
  });

  it('throws when role is missing', () => {
    expect(() =>
      defineAgent({ name: 'edie', role: '' }),
    ).toThrow(/role.*required/i);
  });

  it('accepts agents with inactive status', () => {
    const result = defineAgent({ name: 'retired-bot', role: 'Archivist', status: 'retired' });
    expect(result.status).toBe('retired');
  });
});

// ============================================================================
// defineRouting()
// ============================================================================

describe('defineRouting()', () => {
  it('returns a valid RoutingDefinition with rules', () => {
    const input: RoutingDefinition = {
      rules: [
        { pattern: 'feature-*', agents: ['edie'] },
        { pattern: 'bug-*', agents: ['fenster'] },
      ],
      defaultAgent: 'edie',
    };

    const result = defineRouting(input);
    expect(result.rules).toHaveLength(2);
    expect(result.defaultAgent).toBe('edie');
  });

  it('accepts empty rules array (valid — fallback agent handles everything)', () => {
    const input: RoutingDefinition = {
      rules: [],
      defaultAgent: 'coordinator',
    };

    const result = defineRouting(input);
    expect(result.rules).toHaveLength(0);
    expect(result.defaultAgent).toBe('coordinator');
  });

  it('preserves routing tier and priority on rules', () => {
    const input: RoutingDefinition = {
      rules: [
        { pattern: 'security-*', agents: ['baer'], tier: 'full', priority: 1 },
        { pattern: 'docs-*', agents: ['verbal'], tier: 'lightweight', priority: 10 },
      ],
    };

    const result = defineRouting(input);
    expect(result.rules[0]!.tier).toBe('full');
    expect(result.rules[0]!.priority).toBe(1);
    expect(result.rules[1]!.tier).toBe('lightweight');
  });

  it('throws on duplicate patterns with actionable message', () => {
    expect(() =>
      defineRouting({
        rules: [
          { pattern: 'feature-*', agents: ['edie'] },
          { pattern: 'feature-*', agents: ['fenster'] },
        ],
      }),
    ).toThrow(/duplicate.*pattern/i);
  });

  it('preserves fallback strategy', () => {
    const input: RoutingDefinition = {
      rules: [{ pattern: '*', agents: ['edie'] }],
      fallback: 'coordinator',
    };

    const result = defineRouting(input);
    expect(result.fallback).toBe('coordinator');
  });
});

// ============================================================================
// defineCeremony()
// ============================================================================

describe('defineCeremony()', () => {
  it('returns a valid CeremonyDefinition with all fields', () => {
    const input: CeremonyDefinition = {
      name: 'standup',
      trigger: 'schedule',
      schedule: '0 9 * * 1-5',
      participants: ['edie', 'hockney', 'fenster'],
      agenda: 'What did you do? What will you do? Blockers?',
      hooks: ['pre-standup', 'post-standup'],
    };

    const result = defineCeremony(input);
    expect(result.name).toBe('standup');
    expect(result.trigger).toBe('schedule');
    expect(result.schedule).toBe('0 9 * * 1-5');
    expect(result.participants).toHaveLength(3);
    expect(result.agenda).toContain('Blockers');
    expect(result.hooks).toEqual(['pre-standup', 'post-standup']);
  });

  it('accepts minimal ceremony with only name', () => {
    const result = defineCeremony({ name: 'retrospective' });
    expect(result.name).toBe('retrospective');
    expect(result.trigger).toBeUndefined();
  });

  it('throws when name is missing', () => {
    expect(() =>
      defineCeremony({ name: '' }),
    ).toThrow(/name.*required/i);
  });

  it('throws when name is whitespace-only', () => {
    expect(() =>
      defineCeremony({ name: '   ' }),
    ).toThrow(/name.*required/i);
  });
});

// ============================================================================
// defineHooks()
// ============================================================================

describe('defineHooks()', () => {
  it('returns a valid HooksDefinition with all fields', () => {
    const input: HooksDefinition = {
      allowedWritePaths: ['src/**', 'test/**'],
      blockedCommands: ['rm -rf /', 'DROP TABLE'],
      maxAskUser: 5,
      scrubPii: true,
      reviewerLockout: true,
    };

    const result = defineHooks(input);
    expect(result.allowedWritePaths).toEqual(['src/**', 'test/**']);
    expect(result.blockedCommands).toHaveLength(2);
    expect(result.maxAskUser).toBe(5);
    expect(result.scrubPii).toBe(true);
    expect(result.reviewerLockout).toBe(true);
  });

  it('applies sensible defaults for omitted fields', () => {
    const result = defineHooks({});
    // PRD: "default values applied"
    expect(result.scrubPii).toBe(false);
    expect(result.reviewerLockout).toBe(true);
    expect(result.maxAskUser).toBe(3);
  });

  it('explicit values override defaults', () => {
    const result = defineHooks({ scrubPii: true, maxAskUser: 10 });
    expect(result.scrubPii).toBe(true);
    expect(result.maxAskUser).toBe(10);
  });
});

// ============================================================================
// defineCasting()
// ============================================================================

describe('defineCasting()', () => {
  it('returns a valid CastingDefinition with universe list', () => {
    const input: CastingDefinition = {
      allowlistUniverses: ['The Usual Suspects', 'Breaking Bad'],
      overflowStrategy: 'generic',
      capacity: { 'The Usual Suspects': 6, 'Breaking Bad': 4 },
    };

    const result = defineCasting(input);
    expect(result.allowlistUniverses).toHaveLength(2);
    expect(result.overflowStrategy).toBe('generic');
    expect(result.capacity?.['The Usual Suspects']).toBe(6);
  });

  it('accepts config without universe list (no restriction)', () => {
    const result = defineCasting({ overflowStrategy: 'rotate' });
    expect(result.allowlistUniverses).toBeUndefined();
    expect(result.overflowStrategy).toBe('rotate');
  });

  it('throws when universe list is explicitly empty', () => {
    expect(() =>
      defineCasting({ allowlistUniverses: [] }),
    ).toThrow(/universe list must not be empty/i);
  });

  it('preserves capacity limits per universe', () => {
    const result = defineCasting({
      allowlistUniverses: ['Firefly'],
      capacity: { 'Firefly': 9 },
    });
    expect(result.capacity?.['Firefly']).toBe(9);
  });
});

// ============================================================================
// defineTelemetry()
// ============================================================================

describe('defineTelemetry()', () => {
  it('returns a valid TelemetryDefinition with all fields', () => {
    const input: TelemetryDefinition = {
      enabled: true,
      endpoint: 'http://otel-collector:4317',
      serviceName: 'my-squad',
      sampleRate: 0.5,
      aspireDefaults: true,
    };

    const result = defineTelemetry(input);
    expect(result.enabled).toBe(true);
    expect(result.endpoint).toBe('http://otel-collector:4317');
    expect(result.serviceName).toBe('my-squad');
    expect(result.sampleRate).toBe(0.5);
    expect(result.aspireDefaults).toBe(true);
  });

  it('applies default endpoint when omitted', () => {
    const result = defineTelemetry({ enabled: true });
    expect(result.endpoint).toBe('http://localhost:4317');
  });

  it('applies default serviceName when omitted', () => {
    const result = defineTelemetry({});
    expect(result.serviceName).toBe('squad');
  });

  it('applies default sampleRate when omitted', () => {
    const result = defineTelemetry({});
    expect(result.sampleRate).toBe(1.0);
  });

  it('applies default enabled=true when omitted', () => {
    const result = defineTelemetry({});
    expect(result.enabled).toBe(true);
  });

  it('explicit false overrides default enabled', () => {
    const result = defineTelemetry({ enabled: false });
    expect(result.enabled).toBe(false);
  });
});

// ============================================================================
// SquadSDKConfig composition — the full config built from builders
// ============================================================================

describe('SquadSDKConfig composition', () => {
  it('composes a full config from all builder results', () => {
    const config: SquadSDKConfig = {
      version: '1.0.0',
      team: defineTeam({ name: 'Alpha', members: ['edie', 'hockney'] }),
      agents: [
        defineAgent({ name: 'edie', role: 'TypeScript Engineer' }),
        defineAgent({ name: 'hockney', role: 'Tester' }),
      ],
      routing: defineRouting({
        rules: [
          { pattern: 'feature-*', agents: ['edie'] },
          { pattern: 'test-*', agents: ['hockney'] },
        ],
        defaultAgent: 'edie',
      }),
      ceremonies: [
        defineCeremony({ name: 'standup', schedule: '0 9 * * 1-5' }),
      ],
      hooks: defineHooks({ scrubPii: true }),
      casting: defineCasting({ allowlistUniverses: ['The Usual Suspects'] }),
      telemetry: defineTelemetry({ enabled: true }),
    };

    expect(config.version).toBe('1.0.0');
    expect(config.team.name).toBe('Alpha');
    expect(config.agents).toHaveLength(2);
    expect(config.routing?.rules).toHaveLength(2);
    expect(config.ceremonies).toHaveLength(1);
    expect(config.hooks?.scrubPii).toBe(true);
    expect(config.casting?.allowlistUniverses).toContain('The Usual Suspects');
    expect(config.telemetry?.enabled).toBe(true);
  });

  it('minimal config requires only team and agents', () => {
    const config: SquadSDKConfig = {
      team: defineTeam({ name: 'Tiny', members: ['solo'] }),
      agents: [defineAgent({ name: 'solo', role: 'Generalist' })],
    };

    expect(config.team.name).toBe('Tiny');
    expect(config.agents).toHaveLength(1);
    expect(config.routing).toBeUndefined();
    expect(config.ceremonies).toBeUndefined();
  });
});

// ============================================================================
// defineSkill() — Issue #255
// ============================================================================

describe('defineSkill()', () => {
  it('accepts a valid skill with all fields', () => {
    const skill = defineSkill({
      name: 'git-workflow',
      description: 'Squad branching model',
      domain: 'workflow',
      confidence: 'high',
      source: 'manual',
      content: '## Patterns\nBranch from dev...',
      tools: [{ name: 'gh', description: 'GitHub CLI', when: 'Creating PRs' }],
    });
    expect(skill.name).toBe('git-workflow');
    expect(skill.description).toBe('Squad branching model');
    expect(skill.domain).toBe('workflow');
    expect(skill.confidence).toBe('high');
    expect(skill.source).toBe('manual');
    expect(skill.content).toContain('Branch from dev');
    expect(skill.tools).toHaveLength(1);
    expect(skill.tools![0]!.name).toBe('gh');
  });

  it('accepts minimal skill (required fields only)', () => {
    const skill = defineSkill({
      name: 'testing',
      description: 'Test conventions',
      domain: 'quality',
      content: 'Use Vitest for all tests.',
    });
    expect(skill.name).toBe('testing');
    expect(skill.description).toBe('Test conventions');
    expect(skill.domain).toBe('quality');
    expect(skill.content).toBe('Use Vitest for all tests.');
    expect(skill.confidence).toBeUndefined();
    expect(skill.source).toBeUndefined();
    expect(skill.tools).toBeUndefined();
  });

  it('rejects empty name', () => {
    expect(() =>
      defineSkill({
        name: '',
        description: 'Test',
        domain: 'test',
        content: 'test content',
      }),
    ).toThrow(/name.*required/i);
  });

  it('rejects missing description', () => {
    expect(() =>
      defineSkill({
        name: 'test-skill',
        description: '',
        domain: 'test',
        content: 'test content',
      }),
    ).toThrow(/description.*required/i);
  });

  it('rejects missing domain', () => {
    expect(() =>
      defineSkill({
        name: 'test-skill',
        description: 'Test skill',
        domain: '',
        content: 'test content',
      }),
    ).toThrow(/domain.*required/i);
  });

  it('rejects missing content', () => {
    expect(() =>
      defineSkill({
        name: 'test-skill',
        description: 'Test skill',
        domain: 'test',
        content: '',
      }),
    ).toThrow(/content.*required/i);
  });

  it('rejects invalid confidence value', () => {
    expect(() =>
      defineSkill({
        name: 'test-skill',
        description: 'Test skill',
        domain: 'test',
        content: 'test content',
        confidence: 'super-high' as any,
      }),
    ).toThrow(/confidence.*one of.*high.*medium.*low/i);
  });

  it('rejects invalid source value', () => {
    expect(() =>
      defineSkill({
        name: 'test-skill',
        description: 'Test skill',
        domain: 'test',
        content: 'test content',
        source: 'automatic' as any,
      }),
    ).toThrow(/source.*one of.*manual.*extracted.*inferred/i);
  });

  it('accepts optional tools array with valid entries', () => {
    const skill = defineSkill({
      name: 'cli-testing',
      description: 'CLI test patterns',
      domain: 'testing',
      content: 'Test CLI commands with spawn',
      tools: [
        { name: 'vitest', description: 'Test runner' },
        { name: 'spawn', description: 'Process spawning', when: 'Testing CLI' },
      ],
    });
    expect(skill.tools).toHaveLength(2);
    expect(skill.tools![0]!.name).toBe('vitest');
    expect(skill.tools![1]!.when).toBe('Testing CLI');
  });

  it('preserves all optional fields when present', () => {
    const skill = defineSkill({
      name: 'typescript-patterns',
      description: 'TypeScript best practices',
      domain: 'engineering',
      content: '# TypeScript\n\nUse strict mode...',
      confidence: 'medium',
      source: 'extracted',
      tools: [{ name: 'tsc', description: 'TypeScript compiler' }],
    });
    expect(skill.confidence).toBe('medium');
    expect(skill.source).toBe('extracted');
    expect(skill.tools).toBeDefined();
  });
});
