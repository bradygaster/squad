import { describe, it, expect } from 'vitest';
import {
  MigrationRegistry,
  parseSemVer,
  compareSemVer,
  type Migration,
} from '@bradygaster/squad-sdk/config';
import {
  parseTeamMarkdown,
  parseRoutingRulesMarkdown,
  parseDecisionsMarkdown,
  migrateMarkdownToConfig,
  generateConfigFromParsed,
  type MarkdownParseResult,
} from '@bradygaster/squad-sdk/config';

// ============================================================================
// Migration Registry
// ============================================================================

describe('MigrationRegistry', () => {
  // ---------- SemVer utilities ----------

  describe('parseSemVer', () => {
    it('should parse valid semver strings', () => {
      const v = parseSemVer('1.2.3');
      expect(v).toEqual({ major: 1, minor: 2, patch: 3, raw: '1.2.3' });
    });

    it('should parse 0.0.0', () => {
      expect(parseSemVer('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0, raw: '0.0.0' });
    });

    it('should throw on invalid version strings', () => {
      expect(() => parseSemVer('bad')).toThrow('Invalid version format');
      expect(() => parseSemVer('1.2')).toThrow('Invalid version format');
      expect(() => parseSemVer('1.2.3.4')).toThrow('Invalid version format');
      expect(() => parseSemVer('')).toThrow('Invalid version format');
    });
  });

  describe('compareSemVer', () => {
    it('should return 0 for equal versions', () => {
      expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
    });

    it('should compare major versions', () => {
      expect(compareSemVer('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareSemVer('1.0.0', '2.0.0')).toBeLessThan(0);
    });

    it('should compare minor versions', () => {
      expect(compareSemVer('1.2.0', '1.1.0')).toBeGreaterThan(0);
    });

    it('should compare patch versions', () => {
      expect(compareSemVer('1.0.2', '1.0.1')).toBeGreaterThan(0);
    });
  });

  // ---------- Registration ----------

  describe('register', () => {
    it('should register a migration', () => {
      const registry = new MigrationRegistry();
      registry.register({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        migrate: (c) => ({ ...c, version: '1.1.0' }),
      });
      expect(registry.list()).toHaveLength(1);
    });

    it('should reject duplicate migrations', () => {
      const registry = new MigrationRegistry();
      const m: Migration = {
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        migrate: (c) => c,
      };
      registry.register(m);
      expect(() => registry.register(m)).toThrow('already registered');
    });

    it('should reject invalid version strings', () => {
      const registry = new MigrationRegistry();
      expect(() =>
        registry.register({ fromVersion: 'bad', toVersion: '1.0.0', migrate: (c) => c }),
      ).toThrow('Invalid version format');
    });
  });

  describe('unregister', () => {
    it('should remove a migration and return true', () => {
      const registry = new MigrationRegistry();
      registry.register({ fromVersion: '1.0.0', toVersion: '1.1.0', migrate: (c) => c });
      expect(registry.unregister('1.0.0', '1.1.0')).toBe(true);
      expect(registry.list()).toHaveLength(0);
    });

    it('should return false for non-existent migration', () => {
      const registry = new MigrationRegistry();
      expect(registry.unregister('1.0.0', '1.1.0')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return migrations sorted by fromVersion', () => {
      const registry = new MigrationRegistry();
      registry.register({ fromVersion: '2.0.0', toVersion: '2.1.0', migrate: (c) => c });
      registry.register({ fromVersion: '1.0.0', toVersion: '1.1.0', migrate: (c) => c });

      const list = registry.list();
      expect(list[0].fromVersion).toBe('1.0.0');
      expect(list[1].fromVersion).toBe('2.0.0');
    });
  });

  // ---------- Path finding ----------

  describe('hasPath', () => {
    it('should return true when direct path exists', () => {
      const registry = new MigrationRegistry();
      registry.register({ fromVersion: '1.0.0', toVersion: '1.1.0', migrate: (c) => c });
      expect(registry.hasPath('1.0.0', '1.1.0')).toBe(true);
    });

    it('should return true for chained path', () => {
      const registry = new MigrationRegistry();
      registry.register({ fromVersion: '1.0.0', toVersion: '1.1.0', migrate: (c) => c });
      registry.register({ fromVersion: '1.1.0', toVersion: '2.0.0', migrate: (c) => c });
      expect(registry.hasPath('1.0.0', '2.0.0')).toBe(true);
    });

    it('should return false when no path exists', () => {
      const registry = new MigrationRegistry();
      registry.register({ fromVersion: '1.0.0', toVersion: '1.1.0', migrate: (c) => c });
      expect(registry.hasPath('1.0.0', '3.0.0')).toBe(false);
    });

    it('should return true for same version (no-op)', () => {
      const registry = new MigrationRegistry();
      expect(registry.hasPath('1.0.0', '1.0.0')).toBe(true);
    });
  });

  // ---------- Gap detection ----------

  describe('detectGaps', () => {
    it('should return empty array when no gaps', () => {
      const registry = new MigrationRegistry();
      registry.register({ fromVersion: '1.0.0', toVersion: '1.1.0', migrate: (c) => c });
      registry.register({ fromVersion: '1.1.0', toVersion: '2.0.0', migrate: (c) => c });
      expect(registry.detectGaps('1.0.0', '2.0.0')).toEqual([]);
    });

    it('should detect missing intermediate migration', () => {
      const registry = new MigrationRegistry();
      registry.register({ fromVersion: '1.0.0', toVersion: '1.1.0', migrate: (c) => c });
      // Gap: 1.1.0 -> 2.0.0 missing
      registry.register({ fromVersion: '2.0.0', toVersion: '2.1.0', migrate: (c) => c });

      const gaps = registry.detectGaps('1.0.0', '2.1.0');
      expect(gaps.length).toBeGreaterThan(0);
      expect(gaps).toContainEqual({ from: '1.1.0', to: '2.0.0' });
    });

    it('should return empty for same version', () => {
      const registry = new MigrationRegistry();
      expect(registry.detectGaps('1.0.0', '1.0.0')).toEqual([]);
    });
  });

  // ---------- Running migrations ----------

  describe('runMigrations', () => {
    it('should return unchanged config for same version', () => {
      const registry = new MigrationRegistry();
      const config = { version: '1.0.0', data: 'hello' };
      const result = registry.runMigrations(config, '1.0.0', '1.0.0');
      expect(result.config).toEqual(config);
      expect(result.applied).toHaveLength(0);
      expect(result.rolledBack).toBe(false);
    });

    it('should run a single forward migration', () => {
      const registry = new MigrationRegistry();
      registry.register({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        migrate: (c) => ({ ...c, version: '1.1.0', newField: true }),
      });

      const result = registry.runMigrations({ version: '1.0.0' }, '1.0.0', '1.1.0');
      expect(result.config.version).toBe('1.1.0');
      expect(result.config.newField).toBe(true);
      expect(result.applied).toHaveLength(1);
      expect(result.rolledBack).toBe(false);
    });

    it('should chain multiple forward migrations', () => {
      const registry = new MigrationRegistry();
      registry.register({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        migrate: (c) => ({ ...c, version: '1.1.0', step1: true }),
      });
      registry.register({
        fromVersion: '1.1.0',
        toVersion: '2.0.0',
        migrate: (c) => ({ ...c, version: '2.0.0', step2: true }),
      });

      const result = registry.runMigrations({ version: '1.0.0' }, '1.0.0', '2.0.0');
      expect(result.config.version).toBe('2.0.0');
      expect(result.config.step1).toBe(true);
      expect(result.config.step2).toBe(true);
      expect(result.applied).toHaveLength(2);
    });

    it('should run rollback when from > to', () => {
      const registry = new MigrationRegistry();
      registry.register({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        migrate: (c) => ({ ...c, version: '1.1.0', added: true }),
        rollback: (c) => {
          const { added: _, ...rest } = c as Record<string, unknown> & { added?: boolean };
          return { ...rest, version: '1.0.0' };
        },
      });

      const result = registry.runMigrations({ version: '1.1.0', added: true }, '1.1.0', '1.0.0');
      expect(result.config.version).toBe('1.0.0');
      expect(result.config).not.toHaveProperty('added');
      expect(result.rolledBack).toBe(true);
    });

    it('should throw when rollback is not supported', () => {
      const registry = new MigrationRegistry();
      registry.register({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        migrate: (c) => ({ ...c, version: '1.1.0' }),
        // no rollback
      });

      expect(() =>
        registry.runMigrations({ version: '1.1.0' }, '1.1.0', '1.0.0'),
      ).toThrow('No rollback path found');
    });

    it('should throw when no migration path exists', () => {
      const registry = new MigrationRegistry();
      expect(() =>
        registry.runMigrations({ version: '1.0.0' }, '1.0.0', '5.0.0'),
      ).toThrow('No migration path found');
    });

    it('should chain three migrations in order', () => {
      const registry = new MigrationRegistry();
      const order: string[] = [];
      registry.register({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        migrate: (c) => { order.push('1→1.1'); return { ...c, version: '1.1.0' }; },
      });
      registry.register({
        fromVersion: '1.1.0',
        toVersion: '1.2.0',
        migrate: (c) => { order.push('1.1→1.2'); return { ...c, version: '1.2.0' }; },
      });
      registry.register({
        fromVersion: '1.2.0',
        toVersion: '2.0.0',
        migrate: (c) => { order.push('1.2→2'); return { ...c, version: '2.0.0' }; },
      });

      registry.runMigrations({ version: '1.0.0' }, '1.0.0', '2.0.0');
      expect(order).toEqual(['1→1.1', '1.1→1.2', '1.2→2']);
    });
  });
});

// ============================================================================
// Markdown Migration
// ============================================================================

describe('MarkdownMigration', () => {
  // ---------- team.md ----------

  describe('parseTeamMarkdown', () => {
    it('should parse table format', () => {
      const md = `
## Roster

| Name | Role | Skills | Model |
|------|------|--------|-------|
| Keaton | Lead | architecture, design | claude-opus-4.5 |
| Harper | Developer | typescript, testing | |
`;
      const { agents, warnings } = parseTeamMarkdown(md);
      expect(agents).toHaveLength(2);
      expect(agents[0].name).toBe('keaton');
      expect(agents[0].role).toBe('Lead');
      expect(agents[0].skills).toContain('architecture');
      expect(agents[0].model).toBe('claude-opus-4.5');
      expect(agents[1].name).toBe('harper');
      expect(warnings).toHaveLength(0);
    });

    it('should parse section format', () => {
      const md = `
## Team Members

### Keaton
- **Role:** Lead
- **Skills:** architecture, design
- **Model:** claude-opus-4.5

### Harper
- **Role:** Developer
- **Skills:** typescript
`;
      const { agents } = parseTeamMarkdown(md);
      expect(agents).toHaveLength(2);
      expect(agents[0].role).toBe('Lead');
      expect(agents[1].role).toBe('Developer');
    });

    it('should return empty for blank content', () => {
      const { agents, warnings } = parseTeamMarkdown('');
      expect(agents).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    it('should warn when no agents found in non-empty content', () => {
      const { agents, warnings } = parseTeamMarkdown('## Roster\nNothing here.');
      expect(agents).toHaveLength(0);
      expect(warnings).toContainEqual(expect.stringContaining('Could not parse'));
    });
  });

  // ---------- routing.md ----------

  describe('parseRoutingRulesMarkdown', () => {
    it('should parse routing table', () => {
      const md = `
## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | Lead | New features, enhancements |
| bug-fix | Developer | Bug fixes, patches |
`;
      const { rules, warnings } = parseRoutingRulesMarkdown(md);
      expect(rules).toHaveLength(2);
      expect(rules[0].workType).toBe('feature-dev');
      expect(rules[0].agents).toEqual(['Lead']);
      expect(rules[0].examples).toContain('New features');
      expect(warnings).toHaveLength(0);
    });

    it('should handle multi-agent routing', () => {
      const md = `
## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| testing | Tester, Developer | Unit tests, integration tests |
`;
      const { rules } = parseRoutingRulesMarkdown(md);
      expect(rules[0].agents).toEqual(['Tester', 'Developer']);
    });

    it('should return empty for blank content', () => {
      const { rules } = parseRoutingRulesMarkdown('');
      expect(rules).toHaveLength(0);
    });

    it('should warn when no rules found', () => {
      const { warnings } = parseRoutingRulesMarkdown('## Routing Table\nEmpty');
      expect(warnings.length).toBeGreaterThan(0);
    });

    it("should parse ## Work Type \u2192 Agent heading (this project's routing.md format)", () => {
      const md = `
## Work Type \u2192 Agent

| Work Type | Agent | Examples |
|-----------|-------|---------|
| Core runtime | EECOM | adapter, session pool |
| Tests | FIDO | unit tests, coverage |
`;
      const { rules, warnings } = parseRoutingRulesMarkdown(md);
      expect(rules).toHaveLength(2);
      expect(rules[0]!.workType).toBe('Core runtime');
      expect(rules[0]!.agents).toEqual(['EECOM']);
      expect(rules[1]!.workType).toBe('Tests');
      expect(warnings).toHaveLength(0);
    });

    it('should expose agent references from module ownership', () => {
      const md = `## Routing Table

| Work Type | Route To |
|-----------|----------|
| feature | Lead |

## Module Ownership

| Module | Primary | Secondary |
|--------|---------|-----------|
| src/cli | EECOM | CONTROL |
| src/docs | PAO | — |
`;
      const { agentReferences } = parseRoutingRulesMarkdown(md);
      expect(agentReferences).toEqual(['Lead', 'EECOM', 'CONTROL', 'PAO']);
    });

    it('should parse primary and secondary routing agents', () => {
      const md = `## Routing Table

| Work Type | Primary | Secondary |
|-----------|---------|-----------|
| feature | EECOM | CONTROL, FIDO |
`;
      const { rules, agentReferences } = parseRoutingRulesMarkdown(md);
      expect(rules[0]!.agents).toEqual(['EECOM', 'CONTROL', 'FIDO']);
      expect(agentReferences).toEqual(['EECOM', 'CONTROL', 'FIDO']);
    });
  });

  // ---------- decisions.md ----------

  describe('parseDecisionsMarkdown', () => {
    it('should parse decisions and detect config-relevance', () => {
      const md = `
## Use Claude Opus for architecture
This decision sets the model tier for architecture reviews.

## Code style
Use prettier and eslint.
`;
      const { decisions } = parseDecisionsMarkdown(md);
      expect(decisions).toHaveLength(2);
      expect(decisions[0].title).toBe('Use Claude Opus for architecture');
      expect(decisions[0].configRelevant).toBe(true);
      expect(decisions[1].configRelevant).toBe(false);
    });

    it('should detect config relevance in body', () => {
      const md = `
## Infrastructure
Routing rules should prefer the lead agent for complex tasks.
`;
      const { decisions } = parseDecisionsMarkdown(md);
      expect(decisions[0].configRelevant).toBe(true);
    });

    it('should return empty for blank content', () => {
      const { decisions } = parseDecisionsMarkdown('');
      expect(decisions).toHaveLength(0);
    });
  });

  // ---------- Full migration ----------

  describe('migrateMarkdownToConfig', () => {
    it('should produce valid config from all three files', () => {
      const result = migrateMarkdownToConfig({
        teamMd: `
## Roster

| Name | Role | Skills |
|------|------|--------|
| keaton | lead | architecture |
| harper | developer | typescript |
`,
        routingMd: `
## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | Lead | features |
| bug-fix | Developer | bugs |
`,
        decisionsMd: `
## Use standard tier
Default model tier is standard.
`,
      });

      expect(result.config.version).toBeDefined();
      expect(result.config.routing.rules).toHaveLength(2);
      expect(result.parsed.agents).toHaveLength(2);
      expect(result.migratedSections).toContain('team');
      expect(result.migratedSections).toContain('routing');
      expect(result.migratedSections).toContain('decisions');
    });

    it('should handle missing team.md gracefully', () => {
      const result = migrateMarkdownToConfig({
        routingMd: `
## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | Lead | features |
`,
      });

      expect(result.config).toBeDefined();
      expect(result.skippedSections).toContain('team');
      expect(result.migratedSections).toContain('routing');
    });

    it('should handle all files missing', () => {
      const result = migrateMarkdownToConfig({});
      expect(result.config).toBeDefined();
      expect(result.config.version).toBeDefined();
      expect(result.skippedSections).toContain('team');
      expect(result.skippedSections).toContain('routing');
      expect(result.skippedSections).toContain('decisions');
    });

    it('should merge with provided base config', () => {
      const result = migrateMarkdownToConfig({
        baseConfig: {
          version: '2.0.0',
        },
      });
      expect(result.config.version).toBe('2.0.0');
    });

    it('should prefix agent names with @ in routing rules', () => {
      const result = migrateMarkdownToConfig({
        routingMd: `
## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | Lead | features |
`,
      });
      expect(result.config.routing.rules[0].agents[0]).toBe('@lead');
    });
  });

  describe('generateConfigFromParsed', () => {
    it('should set roleMapping when agents have model preferences', () => {
      const parsed: MarkdownParseResult = {
        agents: [
          { name: 'keaton', role: 'lead', skills: [], model: 'claude-opus-4.5' },
        ],
        routingRules: [],
        decisions: [],
        warnings: [],
      };

      const config = generateConfigFromParsed(parsed);
      expect(config.models.roleMapping).toBeDefined();
      expect(config.models.roleMapping![0].model).toBe('claude-opus-4.5');
    });

    it('should use default routing when no rules parsed', () => {
      const parsed: MarkdownParseResult = {
        agents: [],
        routingRules: [],
        decisions: [],
        warnings: [],
      };

      const config = generateConfigFromParsed(parsed);
      expect(config.routing.rules.length).toBeGreaterThan(0);
    });
  });
});
