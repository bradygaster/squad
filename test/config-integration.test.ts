/**
 * Integration Tests: Config loading, charter compilation, agent source discovery
 * M2-13 — Issue #118
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

import {
  LocalAgentSource,
  AgentRegistry,
  parseCharterMetadata,
  type AgentDefinition,
} from '@bradygaster/squad-sdk/config';
import {
  compileCharter,
  compileCharterFull,
  parseCharterMarkdown,
  type CharterCompileOptions,
  type CharterConfigOverrides,
} from '@bradygaster/squad-sdk/agents';
import { resolveModel } from '@bradygaster/squad-sdk/agents';
import { HookPipeline } from '@bradygaster/squad-sdk/hooks';
import { ToolRegistry } from '@bradygaster/squad-sdk/tools';
import {
  defineConfig,
  validateConfig as validateSchemaConfig,
} from '@bradygaster/squad-sdk/config';
import {
  validateConfig as validateRuntimeConfig,
  validateConfigDetailed,
  loadConfigSync,
  discoverConfigFile,
  DEFAULT_CONFIG as RUNTIME_DEFAULT,
  ConfigValidationError,
} from '@bradygaster/squad-sdk/runtime';
import {
  ModelRegistry,
  MODEL_CATALOG,
} from '@bradygaster/squad-sdk/config';
import {
  parseRoutingMarkdown,
  compileRoutingRules,
  matchRoute,
} from '@bradygaster/squad-sdk/config';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const FIXTURES_ROOT = join(process.cwd(), 'test-fixtures', 'integration');

function fixture(...parts: string[]): string {
  return join(FIXTURES_ROOT, ...parts);
}

const SAMPLE_CHARTER = `# Fenster

## Identity

**Name:** Fenster
**Role:** Core Developer
**Expertise:** TypeScript, testing, architecture
**Style:** Precise and methodical

## What I Own

- src/config/
- src/agents/

## Boundaries

Do not modify docs/ or marketing.

## Model

**Preferred:** claude-sonnet-4.5

## Collaboration

Coordinate with Verbal on prompt changes.
`;

const MINIMAL_CHARTER = `# MinAgent

## Identity

**Name:** MinAgent
**Role:** Helper
`;

const MALFORMED_CHARTER = `This is not a valid charter, just plain text.`;

function setupAgentDir(base: string, agentName: string, charter: string, history?: string) {
  const dir = join(base, agentName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'charter.md'), charter, 'utf-8');
  if (history) {
    writeFileSync(join(dir, 'history.md'), history, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Integration: LocalAgentSource discovery', () => {
  beforeEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
    mkdirSync(FIXTURES_ROOT, { recursive: true });
  });
  afterEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
  });

  it('discovers agents in .squad/agents/', async () => {
    const base = fixture('project-a');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);
    setupAgentDir(agentsDir, 'verbal', MINIMAL_CHARTER);

    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();

    expect(manifests.length).toBe(2);
    expect(manifests.map(m => m.name).sort()).toEqual(['Fenster', 'MinAgent'].sort());
  });

  it('discovers agents in legacy .ai-team/agents/', async () => {
    const base = fixture('project-legacy');
    const agentsDir = join(base, '.ai-team', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();

    expect(manifests.length).toBe(1);
    expect(manifests[0].name).toBe('Fenster');
    expect(manifests[0].role).toBe('Core Developer');
    expect(manifests[0].source).toBe('local');
  });

  it('prefers .squad/agents over .ai-team/agents', async () => {
    const base = fixture('project-dual');
    // Create both directories
    const squadDir = join(base, '.squad', 'agents');
    const aiTeamDir = join(base, '.ai-team', 'agents');
    mkdirSync(squadDir, { recursive: true });
    mkdirSync(aiTeamDir, { recursive: true });
    setupAgentDir(squadDir, 'fenster', SAMPLE_CHARTER);
    setupAgentDir(aiTeamDir, 'legacy-agent', MINIMAL_CHARTER);

    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();

    // Should find fenster from .squad, NOT legacy-agent from .ai-team
    expect(manifests.length).toBe(1);
    expect(manifests[0].name).toBe('Fenster');
  });

  it('returns empty array when no agent directories exist', async () => {
    const base = fixture('project-empty');
    mkdirSync(base, { recursive: true });

    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();

    expect(manifests).toEqual([]);
  });

  it('skips agents with missing charter.md', async () => {
    const base = fixture('project-missing-charter');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(join(agentsDir, 'no-charter'), { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();

    expect(manifests.length).toBe(1);
    expect(manifests[0].name).toBe('Fenster');
  });

  it('handles malformed charter gracefully in listAgents', async () => {
    const base = fixture('project-malformed');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'bad-agent', MALFORMED_CHARTER);

    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();

    // Malformed charter still produces a manifest with folder name as fallback
    expect(manifests.length).toBe(1);
    expect(manifests[0].name).toBe('bad-agent');
    expect(manifests[0].role).toBe('agent');
  });

  it('getAgent returns full AgentDefinition with metadata', async () => {
    const base = fixture('project-get-agent');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER, '# History\n\nSome history.');

    const source = new LocalAgentSource(base);
    const agent = await source.getAgent('fenster');

    expect(agent).not.toBeNull();
    expect(agent!.name).toBe('Fenster');
    expect(agent!.role).toBe('Core Developer');
    expect(agent!.model).toBe('claude-sonnet-4.5');
    expect(agent!.skills).toEqual(['TypeScript', 'testing', 'architecture']);
    expect(agent!.charter).toContain('## Identity');
    expect(agent!.history).toContain('Some history.');
  });

  it('getAgent returns null for non-existent agent', async () => {
    const base = fixture('project-no-agent');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const source = new LocalAgentSource(base);
    const agent = await source.getAgent('nonexistent');

    expect(agent).toBeNull();
  });

  it('getAgent works without history.md', async () => {
    const base = fixture('project-no-history');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const source = new LocalAgentSource(base);
    const agent = await source.getAgent('fenster');

    expect(agent).not.toBeNull();
    expect(agent!.history).toBeUndefined();
  });

  it('getCharter returns raw markdown', async () => {
    const base = fixture('project-get-charter');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const source = new LocalAgentSource(base);
    const charter = await source.getCharter('fenster');

    expect(charter).toBe(SAMPLE_CHARTER);
  });

  it('getCharter returns null for missing agent', async () => {
    const base = fixture('project-no-charter');
    mkdirSync(base, { recursive: true });

    const source = new LocalAgentSource(base);
    const charter = await source.getCharter('ghost');

    expect(charter).toBeNull();
  });

  it('skips non-directory entries in agents folder', async () => {
    const base = fixture('project-files-in-agents');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'README.md'), 'Not an agent', 'utf-8');
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();

    expect(manifests.length).toBe(1);
    expect(manifests[0].name).toBe('Fenster');
  });
});

describe('Integration: parseCharterMetadata', () => {
  it('extracts full metadata from well-formed charter', () => {
    const meta = parseCharterMetadata(SAMPLE_CHARTER);
    expect(meta.name).toBe('Fenster');
    expect(meta.role).toBe('Core Developer');
    expect(meta.model).toBe('claude-sonnet-4.5');
    expect(meta.skills).toEqual(['TypeScript', 'testing', 'architecture']);
  });

  it('handles minimal charter', () => {
    const meta = parseCharterMetadata(MINIMAL_CHARTER);
    expect(meta.name).toBe('MinAgent');
    expect(meta.role).toBe('Helper');
    expect(meta.model).toBeUndefined();
    expect(meta.skills).toBeUndefined();
  });

  it('handles empty content', () => {
    const meta = parseCharterMetadata('');
    expect(meta.name).toBeUndefined();
    expect(meta.role).toBeUndefined();
  });

  it('handles malformed content without crashing', () => {
    const meta = parseCharterMetadata(MALFORMED_CHARTER);
    expect(meta.name).toBeUndefined();
    expect(meta.role).toBeUndefined();
  });

  it('extracts tools from ## Tools section', () => {
    const charter = `## Tools

- \`bash\`
- \`grep\`
- edit
`;
    const meta = parseCharterMetadata(charter);
    expect(meta.tools).toEqual(['bash', 'grep', 'edit']);
  });
});

describe('Integration: Charter compilation with config overrides', () => {
  it('compiles charter with charter content', () => {
    const result = compileCharter({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
    });

    expect(result.name).toBe('fenster');
    expect(result.displayName).toContain('Core Developer');
    expect(result.prompt).toContain('## Identity');
    expect(result.prompt).toContain('Fenster');
  });

  it('config role overrides charter role', () => {
    const result = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      configOverrides: { role: 'Lead Architect' },
    });

    expect(result.displayName).toContain('Lead Architect');
  });

  it('config model overrides charter model', () => {
    const result = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      configOverrides: { model: 'claude-opus-4.6' },
    });

    expect(result.resolvedModel).toBe('claude-opus-4.6');
  });

  it('falls back to charter model when config has no model', () => {
    const result = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
    });

    expect(result.resolvedModel).toBe('claude-sonnet-4.5');
  });

  it('config tools override charter tools', () => {
    const result = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      configOverrides: { tools: ['bash', 'edit'] },
    });

    expect(result.resolvedTools).toEqual(['bash', 'edit']);
  });

  it('config displayName overrides computed displayName', () => {
    const result = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      configOverrides: { displayName: 'The Fenster' },
    });

    expect(result.displayName).toBe('The Fenster');
  });

  it('appends extra prompt from config', () => {
    const result = compileCharter({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      configOverrides: { extraPrompt: '## Custom Rules\n\nDo not eat cookies.' },
    });

    expect(result.prompt).toContain('Do not eat cookies.');
  });

  it('includes team context in compiled prompt', () => {
    const result = compileCharter({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      teamContext: 'Team has 3 members.',
    });

    expect(result.prompt).toContain('Team has 3 members.');
  });

  it('includes routing rules in compiled prompt', () => {
    const result = compileCharter({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      routingRules: 'Route bugs to fenster.',
    });

    expect(result.prompt).toContain('Route bugs to fenster.');
  });

  it('includes decisions in compiled prompt', () => {
    const result = compileCharter({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      decisions: 'ADR-001: Use TypeScript.',
    });

    expect(result.prompt).toContain('ADR-001: Use TypeScript.');
  });

  it('handles empty charter content gracefully', () => {
    const result = compileCharter({
      agentName: 'empty',
      charterPath: '/fake/path',
      charterContent: '',
    });

    expect(result.name).toBe('empty');
    expect(result.prompt).toContain('empty Charter');
  });

  it('compileCharterFull returns parsed charter', () => {
    const result = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
    });

    expect(result.parsed.identity.name).toBe('Fenster');
    expect(result.parsed.identity.expertise).toContain('TypeScript');
    expect(result.parsed.modelPreference).toBe('claude-sonnet-4.5');
    expect(result.parsed.ownership).toContain('src/config/');
  });
});

describe('Integration: Config-driven charter → model resolution', () => {
  it('resolves model from charter preference (layer 2)', () => {
    const compiled = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
    });

    const resolved = resolveModel({
      charterPreference: compiled.resolvedModel,
      taskType: 'code',
      agentRole: 'fenster',
    });

    expect(resolved.model).toBe('claude-sonnet-4.5');
    expect(resolved.source).toBe('charter');
  });

  it('config model override flows through to model resolution (layer 1)', () => {
    const compiled = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      configOverrides: { model: 'claude-opus-4.6' },
    });

    const resolved = resolveModel({
      userOverride: compiled.resolvedModel,
      taskType: 'code',
      agentRole: 'fenster',
    });

    expect(resolved.model).toBe('claude-opus-4.6');
    expect(resolved.source).toBe('user-override');
    expect(resolved.tier).toBe('premium');
  });

  it('falls through to task-auto when no charter or config model', () => {
    const compiled = compileCharterFull({
      agentName: 'minimal',
      charterPath: '/fake/path',
      charterContent: MINIMAL_CHARTER,
    });

    const resolved = resolveModel({
      charterPreference: compiled.resolvedModel,
      taskType: 'code',
    });

    expect(resolved.source).toBe('task-auto');
  });
});

describe('Integration: Routing config → tool filtering', () => {
  it('routing rules compile and match messages', () => {
    const markdown = `## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | fenster | New features, enhancements |
| bug-fix | fenster, verbal | Bug fixes, patches |
| docs | verbal | Documentation updates |
`;

    const config = parseRoutingMarkdown(markdown);
    const router = compileRoutingRules(config);

    const match1 = matchRoute('I need a new feature for the dashboard', router);
    expect(match1.agents).toContain('fenster');

    const match2 = matchRoute('Fix the bug in the login page', router);
    expect(match2.agents).toContain('fenster');

    const match3 = matchRoute('Update the documentation for the API', router);
    expect(match3.agents).toContain('verbal');
  });

  it('fallback when no route matches', () => {
    const config = parseRoutingMarkdown('## Routing Table\n\n| Work Type | Route To |\n|---|---|\n| testing | qa |\n');
    const router = compileRoutingRules(config);

    const match = matchRoute('Play some music', router);
    expect(match.confidence).toBe('low');
    expect(match.agents).toContain('@coordinator');
  });

  it('ToolRegistry filters tools for agent', () => {
    const registry = new ToolRegistry();
    const allTools = registry.getTools();
    expect(allTools.length).toBeGreaterThan(0);

    const filteredTools = registry.getToolsForAgent(['squad_route', 'squad_status']);
    expect(filteredTools.length).toBe(2);
    expect(filteredTools.map(t => t.name).sort()).toEqual(['squad_route', 'squad_status']);
  });

  it('routing rules influence agent tool availability', () => {
    // Simulate: agent only gets tools that match its routing capabilities
    const compiled = compileCharterFull({
      agentName: 'fenster',
      charterPath: '/fake/path',
      charterContent: SAMPLE_CHARTER,
      configOverrides: { tools: ['squad_route', 'squad_decide'] },
    });

    const registry = new ToolRegistry();
    const agentTools = registry.getToolsForAgent(compiled.resolvedTools);
    expect(agentTools.length).toBe(2);
    expect(agentTools.map(t => t.name)).toContain('squad_route');
    expect(agentTools.map(t => t.name)).toContain('squad_decide');
  });
});

describe('Integration: Hook pipeline with config', () => {
  it('HookPipeline enforces config-driven write path restriction', async () => {
    const pipeline = new HookPipeline({
      allowedWritePaths: ['src/**', 'test/**'],
    });

    const allowed = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'src/index.ts' },
      agentName: 'fenster',
      sessionId: 'test-session',
    });
    expect(allowed.action).toBe('allow');

    const blocked = await pipeline.runPreToolHooks({
      toolName: 'edit',
      arguments: { path: 'docs/README.md' },
      agentName: 'fenster',
      sessionId: 'test-session',
    });
    expect(blocked.action).toBe('block');
  });

  it('HookPipeline enforces config-driven blocked commands', async () => {
    const pipeline = new HookPipeline({
      blockedCommands: ['rm -rf', 'git push --force'],
    });

    const result = await pipeline.runPreToolHooks({
      toolName: 'bash',
      arguments: { command: 'rm -rf /' },
      agentName: 'fenster',
      sessionId: 'test-session',
    });

    expect(result.action).toBe('block');
  });
});

describe('Integration: AgentRegistry with LocalAgentSource', () => {
  beforeEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
    mkdirSync(FIXTURES_ROOT, { recursive: true });
  });
  afterEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
  });

  it('registry discovers agents from registered local source', async () => {
    const base = fixture('project-registry');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const registry = new AgentRegistry();
    registry.register(new LocalAgentSource(base));

    const agents = await registry.listAllAgents();
    expect(agents.length).toBe(1);
    expect(agents[0].name).toBe('Fenster');
  });

  it('registry findAgent returns definition', async () => {
    const base = fixture('project-find');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const registry = new AgentRegistry();
    registry.register(new LocalAgentSource(base));

    const agent = await registry.findAgent('fenster');
    expect(agent).not.toBeNull();
    expect(agent!.charter).toContain('Fenster');
  });

  it('registry getCharter returns raw markdown', async () => {
    const base = fixture('project-charter');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const registry = new AgentRegistry();
    registry.register(new LocalAgentSource(base));

    const charter = await registry.getCharter('fenster');
    expect(charter).toBe(SAMPLE_CHARTER);
  });
});

describe('Integration: Config validation error paths', () => {
  it('validateConfig rejects missing version', () => {
    expect(() => validateRuntimeConfig({ models: RUNTIME_DEFAULT.models, routing: RUNTIME_DEFAULT.routing })).toThrow(ConfigValidationError);
  });

  it('validateConfig rejects missing models', () => {
    expect(() => validateRuntimeConfig({ version: '1.0.0', routing: RUNTIME_DEFAULT.routing })).toThrow(ConfigValidationError);
  });

  it('validateConfig rejects missing routing', () => {
    expect(() => validateRuntimeConfig({ version: '1.0.0', models: RUNTIME_DEFAULT.models })).toThrow(ConfigValidationError);
  });

  it('validateConfigDetailed returns errors for invalid agent sources', () => {
    const result = validateConfigDetailed({
      ...RUNTIME_DEFAULT,
      agentSources: [{ type: 'badtype', location: '/path' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('agentSources'))).toBe(true);
  });

  it('validateConfigDetailed warns on duplicate work types', () => {
    const result = validateConfigDetailed({
      ...RUNTIME_DEFAULT,
      routing: {
        ...RUNTIME_DEFAULT.routing,
        rules: [
          { workType: 'feature-dev', agents: ['A'] },
          { workType: 'feature-dev', agents: ['B'] },
        ],
      },
    });
    expect(result.warnings?.some(w => w.includes('Duplicate'))).toBe(true);
  });

  it('schema validateConfig rejects non-object', () => {
    expect(validateSchemaConfig(null)).toBe(false);
    expect(validateSchemaConfig(42)).toBe(false);
    expect(validateSchemaConfig('string')).toBe(false);
  });
});

describe('Integration: Config file discovery', () => {
  const discoveryDir = join(FIXTURES_ROOT, 'discovery');

  beforeEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
    mkdirSync(discoveryDir, { recursive: true });
  });
  afterEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
  });

  it('discovers squad.config.json in current directory', () => {
    writeFileSync(join(discoveryDir, 'squad.config.json'), '{}');
    const found = discoverConfigFile(discoveryDir);
    expect(found).toBe(join(discoveryDir, 'squad.config.json'));
  });

  it('discovers .squad/config.json', () => {
    const squadDir = join(discoveryDir, '.squad');
    mkdirSync(squadDir, { recursive: true });
    writeFileSync(join(squadDir, 'config.json'), '{}');
    const found = discoverConfigFile(discoveryDir);
    expect(found).toBe(join(squadDir, 'config.json'));
  });

  it('walks up to parent directory', () => {
    writeFileSync(join(discoveryDir, 'squad.config.json'), '{}');
    const childDir = join(discoveryDir, 'subdir');
    mkdirSync(childDir, { recursive: true });
    const found = discoverConfigFile(childDir);
    expect(found).toBe(join(discoveryDir, 'squad.config.json'));
  });

  it('returns undefined when nothing found', () => {
    const emptyDir = join(discoveryDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const found = discoverConfigFile(emptyDir);
    expect(found).toBeUndefined();
  });
});

describe('Integration: Full pipeline — discover → compile → resolve → filter', () => {
  beforeEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
    mkdirSync(FIXTURES_ROOT, { recursive: true });
  });
  afterEach(() => {
    rmSync(FIXTURES_ROOT, { recursive: true, force: true });
  });

  it('end-to-end: local source → charter compilation → model selection', async () => {
    // 1. Set up filesystem
    const base = fixture('e2e-project');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER, '# History\n\nBuilt config module.');

    // 2. Discover agents
    const source = new LocalAgentSource(base);
    const manifests = await source.listAgents();
    expect(manifests.length).toBe(1);

    // 3. Load agent definition
    const agent = await source.getAgent('fenster');
    expect(agent).not.toBeNull();

    // 4. Compile charter
    const compiled = compileCharterFull({
      agentName: 'fenster',
      charterPath: join(agentsDir, 'fenster', 'charter.md'),
      charterContent: agent!.charter,
      teamContext: 'Team: fenster, verbal, scribe',
    });

    expect(compiled.name).toBe('fenster');
    expect(compiled.prompt).toContain('## Identity');
    expect(compiled.prompt).toContain('Team: fenster, verbal, scribe');

    // 5. Resolve model
    const resolved = resolveModel({
      charterPreference: compiled.resolvedModel,
      taskType: 'code',
      agentRole: 'fenster',
    });

    expect(resolved.model).toBe('claude-sonnet-4.5');
    expect(resolved.source).toBe('charter');
    expect(resolved.fallbackChain.length).toBeGreaterThan(0);
  });

  it('end-to-end with config overrides', async () => {
    const base = fixture('e2e-overrides');
    const agentsDir = join(base, '.squad', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    setupAgentDir(agentsDir, 'fenster', SAMPLE_CHARTER);

    const source = new LocalAgentSource(base);
    const agent = await source.getAgent('fenster');

    // Config specifies a different model and tools
    const overrides: CharterConfigOverrides = {
      model: 'gpt-5.2-codex',
      tools: ['squad_route', 'squad_decide', 'squad_memory'],
      role: 'Senior Architect',
    };

    const compiled = compileCharterFull({
      agentName: 'fenster',
      charterPath: join(agentsDir, 'fenster', 'charter.md'),
      charterContent: agent!.charter,
      configOverrides: overrides,
    });

    expect(compiled.resolvedModel).toBe('gpt-5.2-codex');
    expect(compiled.resolvedTools).toEqual(['squad_route', 'squad_decide', 'squad_memory']);
    expect(compiled.displayName).toContain('Senior Architect');

    // Model resolution picks up the override
    const resolved = resolveModel({
      userOverride: compiled.resolvedModel,
      taskType: 'code',
    });

    expect(resolved.model).toBe('gpt-5.2-codex');
    expect(resolved.tier).toBe('standard');
  });

  it('handles config-specified agent not found on disk', async () => {
    const base = fixture('e2e-missing');
    mkdirSync(base, { recursive: true });

    const source = new LocalAgentSource(base);
    const agent = await source.getAgent('phantom');

    expect(agent).toBeNull();

    // Compilation with empty charter content is still valid
    const compiled = compileCharter({
      agentName: 'phantom',
      charterPath: join(base, '.squad', 'agents', 'phantom', 'charter.md'),
      charterContent: '',
      configOverrides: {
        role: 'Ghost Agent',
        model: 'claude-haiku-4.5',
      },
    });

    expect(compiled.name).toBe('phantom');
    expect(compiled.displayName).toContain('Ghost Agent');
  });

  it('ModelRegistry validates models from compiled config', () => {
    const registry = new ModelRegistry();
    expect(registry.isModelAvailable('claude-sonnet-4.5')).toBe(true);
    expect(registry.isModelAvailable('nonexistent-model')).toBe(false);

    const chain = registry.getFallbackChain('standard');
    expect(chain.length).toBeGreaterThan(0);
  });

  it('loadConfigSync returns default when no config file', () => {
    const tmpDir = fixture('e2e-no-config');
    mkdirSync(tmpDir, { recursive: true });

    const result = loadConfigSync(tmpDir);
    expect(result.isDefault).toBe(true);
    expect(result.config.version).toBe('1.0.0');
  });

  it('loadConfigSync loads valid JSON config', () => {
    const tmpDir = fixture('e2e-json-config');
    mkdirSync(tmpDir, { recursive: true });

    const config = {
      version: '1.0.0',
      models: {
        defaultModel: 'gpt-5.1-codex',
        defaultTier: 'standard',
        fallbackChains: {
          premium: ['claude-opus-4.6'],
          standard: ['gpt-5.1-codex'],
          fast: ['claude-haiku-4.5'],
        },
      },
      routing: {
        rules: [{ workType: 'feature-dev', agents: ['fenster'] }],
      },
    };

    writeFileSync(join(tmpDir, 'squad.config.json'), JSON.stringify(config), 'utf-8');

    const result = loadConfigSync(tmpDir);
    expect(result.isDefault).toBe(false);
    expect(result.config.models.defaultModel).toBe('gpt-5.1-codex');
  });

  it('defineConfig merges with schema defaults', () => {
    const config = defineConfig({
      team: { name: 'Integration Squad' },
      agents: [{ name: 'fenster', role: 'dev' }],
    });

    expect(config.team.name).toBe('Integration Squad');
    expect(config.agents.length).toBe(1);
    expect(config.models.default).toBe('claude-sonnet-4.6');
  });
});

describe('Integration: parseCharterMarkdown', () => {
  it('extracts all sections', () => {
    const parsed = parseCharterMarkdown(SAMPLE_CHARTER);
    expect(parsed.identity.name).toBe('Fenster');
    expect(parsed.identity.role).toBe('Core Developer');
    expect(parsed.identity.expertise).toContain('TypeScript');
    expect(parsed.identity.style).toBe('Precise and methodical');
    expect(parsed.ownership).toContain('src/config/');
    expect(parsed.boundaries).toContain('Do not modify docs/');
    expect(parsed.modelPreference).toBe('claude-sonnet-4.5');
    expect(parsed.collaboration).toContain('Verbal');
  });

  it('handles empty string', () => {
    const parsed = parseCharterMarkdown('');
    expect(parsed.identity.name).toBeUndefined();
    expect(parsed.fullContent).toBe('');
  });
});
