import { describe, it, expect } from 'vitest';
import {
  SquadConfig,
  AgentConfig,
  defineConfig,
  validateConfig,
  DEFAULT_CONFIG,
  AgentSource,
  AgentManifest,
  AgentDefinition,
  LocalAgentSource,
  GitHubAgentSource,
  MarketplaceAgentSource,
  AgentRegistry,
} from '@bradygaster/squad-sdk/config';

describe('Configuration Schema', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have required fields', () => {
      expect(DEFAULT_CONFIG.version).toBe('0.6.0');
      expect(DEFAULT_CONFIG.team.name).toBe('Default Squad');
      expect(DEFAULT_CONFIG.routing.fallbackBehavior).toBe('coordinator');
      expect(DEFAULT_CONFIG.models.default).toBe('claude-sonnet-4.6');
      expect(DEFAULT_CONFIG.agents).toEqual([]);
    });

    it('should have tier definitions', () => {
      expect(DEFAULT_CONFIG.models.tiers.premium).toContain('claude-opus-4.7');
      expect(DEFAULT_CONFIG.models.tiers.standard).toContain('claude-sonnet-4.6');
      expect(DEFAULT_CONFIG.models.tiers.fast).toContain('claude-haiku-4.5');
    });
  });

  describe('defineConfig', () => {
    it('should merge with defaults', () => {
      const config = defineConfig({
        team: { name: 'Test Squad' },
      });

      expect(config.version).toBe('0.6.0');
      expect(config.team.name).toBe('Test Squad');
      expect(config.routing.fallbackBehavior).toBe('coordinator');
    });

    it('should merge nested objects', () => {
      const config = defineConfig({
        team: {
          name: 'My Squad',
          description: 'A test squad',
        },
        models: {
          default: 'gpt-5.1-codex',
          defaultTier: 'fast',
          tiers: DEFAULT_CONFIG.models.tiers,
        },
      });

      expect(config.team.name).toBe('My Squad');
      expect(config.team.description).toBe('A test squad');
      expect(config.models.default).toBe('gpt-5.1-codex');
    });

    it('should preserve custom agents', () => {
      const agents: AgentConfig[] = [
        { name: 'test-agent', role: 'tester', status: 'active' },
      ];

      const config = defineConfig({ agents });

      expect(config.agents).toEqual(agents);
      expect(config.agents.length).toBe(1);
    });

    it('should preserve routing rules', () => {
      const config = defineConfig({
        routing: {
          rules: [
            { pattern: 'test.*', agents: ['test-agent'], tier: 'direct' },
          ],
          defaultAgent: 'coordinator',
          fallbackBehavior: 'default-agent',
        },
      });

      expect(config.routing.rules.length).toBe(1);
      expect(config.routing.rules[0].pattern).toBe('test.*');
      expect(config.routing.fallbackBehavior).toBe('default-agent');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const valid = validateConfig(DEFAULT_CONFIG);
      expect(valid).toBe(true);
    });

    it('should reject null or non-object', () => {
      expect(validateConfig(null)).toBe(false);
      expect(validateConfig(undefined)).toBe(false);
      expect(validateConfig('string')).toBe(false);
      expect(validateConfig(123)).toBe(false);
    });

    it('should reject missing version', () => {
      const invalid = { ...DEFAULT_CONFIG, version: undefined };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('should reject missing team name', () => {
      const invalid = { ...DEFAULT_CONFIG, team: {} };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('should reject invalid routing', () => {
      const invalid = { ...DEFAULT_CONFIG, routing: { rules: 'not-array' } };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('should reject missing models default', () => {
      const invalid = { ...DEFAULT_CONFIG, models: { tiers: {} } };
      expect(validateConfig(invalid)).toBe(false);
    });

    it('should reject non-array agents', () => {
      const invalid = { ...DEFAULT_CONFIG, agents: 'not-array' };
      expect(validateConfig(invalid)).toBe(false);
    });
  });

  describe('Type constraints', () => {
    it('should enforce agent status enum', () => {
      const agent: AgentConfig = {
        name: 'test',
        role: 'tester',
        status: 'active',
      };

      expect(['active', 'inactive', 'retired']).toContain(agent.status);
    });

    it('should enforce routing tier enum', () => {
      const config = defineConfig({
        routing: {
          rules: [
            { pattern: '.*', agents: ['any'], tier: 'lightweight' },
          ],
        },
      });

      const tier = config.routing.rules[0].tier;
      expect(['direct', 'lightweight', 'standard', 'full']).toContain(tier);
    });

    it('should enforce fallback behavior enum', () => {
      const behavior = DEFAULT_CONFIG.routing.fallbackBehavior;
      expect(['ask', 'default-agent', 'coordinator']).toContain(behavior);
    });
  });
});

describe('Agent Source Registry', () => {
  describe('AgentSource interface', () => {
    it('should have required properties and methods', () => {
      const source: AgentSource = new LocalAgentSource('/test');

      expect(source.name).toBeDefined();
      expect(source.type).toBeDefined();
      expect(typeof source.listAgents).toBe('function');
      expect(typeof source.getAgent).toBe('function');
      expect(typeof source.getCharter).toBe('function');
    });
  });

  describe('LocalAgentSource', () => {
    it('should initialize with correct type', () => {
      const source = new LocalAgentSource('/test/path');

      expect(source.name).toBe('local');
      expect(source.type).toBe('local');
    });

    it('should return empty array for listAgents', async () => {
      const source = new LocalAgentSource('/test');
      const agents = await source.listAgents();

      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBe(0);
    });

    it('should return null for getAgent', async () => {
      const source = new LocalAgentSource('/test');
      const agent = await source.getAgent('test');

      expect(agent).toBeNull();
    });

    it('should return null for getCharter', async () => {
      const source = new LocalAgentSource('/test');
      const charter = await source.getCharter('test');

      expect(charter).toBeNull();
    });
  });

  describe('GitHubAgentSource', () => {
    it('should initialize with correct type', () => {
      const source = new GitHubAgentSource('owner/repo');

      expect(source.name).toBe('github');
      expect(source.type).toBe('github');
    });

    it('should accept optional ref parameter', () => {
      const source = new GitHubAgentSource('owner/repo', 'main');
      expect(source).toBeDefined();
    });
  });

  describe('MarketplaceAgentSource', () => {
    it('should initialize with correct type', () => {
      const source = new MarketplaceAgentSource('https://api.example.com');

      expect(source.name).toBe('marketplace');
      expect(source.type).toBe('marketplace');
    });
  });

  describe('AgentRegistry', () => {
    it('should register and retrieve sources', () => {
      const registry = new AgentRegistry();
      const source = new LocalAgentSource('/test');

      registry.register(source);

      expect(registry.getSource('local')).toBe(source);
    });

    it('should unregister sources', () => {
      const registry = new AgentRegistry();
      const source = new LocalAgentSource('/test');

      registry.register(source);
      const removed = registry.unregister('local');

      expect(removed).toBe(true);
      expect(registry.getSource('local')).toBeUndefined();
    });

    it('should return false when unregistering non-existent source', () => {
      const registry = new AgentRegistry();
      const removed = registry.unregister('non-existent');

      expect(removed).toBe(false);
    });

    it('should list agents from all sources', async () => {
      const registry = new AgentRegistry();
      const source1 = new LocalAgentSource('/test1');
      const source2 = new GitHubAgentSource('owner/repo');

      registry.register(source1);
      registry.register(source2);

      const agents = await registry.listAllAgents();

      expect(Array.isArray(agents)).toBe(true);
    });

    it('should find agent from first matching source', async () => {
      const registry = new AgentRegistry();
      const source = new LocalAgentSource('/test');

      registry.register(source);

      const agent = await registry.findAgent('test-agent');

      expect(agent).toBeNull();
    });

    it('should get charter from first matching source', async () => {
      const registry = new AgentRegistry();
      const source = new LocalAgentSource('/test');

      registry.register(source);

      const charter = await registry.getCharter('test-agent');

      expect(charter).toBeNull();
    });

    it('should handle multiple sources in registry', () => {
      const registry = new AgentRegistry();

      registry.register(new LocalAgentSource('/test'));
      registry.register(new GitHubAgentSource('owner/repo'));
      registry.register(new MarketplaceAgentSource('https://api.example.com'));

      expect(registry.getSource('local')).toBeDefined();
      expect(registry.getSource('github')).toBeDefined();
      expect(registry.getSource('marketplace')).toBeDefined();
    });
  });

  describe('AgentManifest and AgentDefinition types', () => {
    it('should define minimal manifest', () => {
      const manifest: AgentManifest = {
        name: 'test-agent',
        role: 'tester',
        source: 'local',
      };

      expect(manifest.name).toBe('test-agent');
      expect(manifest.role).toBe('tester');
      expect(manifest.source).toBe('local');
    });

    it('should define full manifest with optional fields', () => {
      const manifest: AgentManifest = {
        name: 'test-agent',
        role: 'tester',
        version: '1.0.0',
        source: 'github',
      };

      expect(manifest.version).toBe('1.0.0');
    });

    it('should define agent definition with charter', () => {
      const definition: AgentDefinition = {
        name: 'test-agent',
        role: 'tester',
        source: 'local',
        charter: 'Test agent charter',
        model: 'claude-sonnet-4',
        tools: ['bash', 'grep'],
        skills: ['testing', 'debugging'],
      };

      expect(definition.charter).toBe('Test agent charter');
      expect(definition.tools).toEqual(['bash', 'grep']);
      expect(definition.skills).toEqual(['testing', 'debugging']);
    });
  });
});
