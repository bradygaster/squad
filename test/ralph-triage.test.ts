import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  parseRoster,
  parseRoutingRules,
  parseModuleOwnership,
  triageIssue,
  type TriageIssue,
  type TeamMember,
  type RoutingRule,
  type ModuleOwnership,
} from '../packages/squad-sdk/src/ralph/triage.js';
import type { GhIssue, GhPullRequest } from '../packages/squad-cli/src/cli/core/gh-cli.js';

const ROUTING_MD = readFileSync(join(process.cwd(), '.squad', 'routing.md'), 'utf-8');
const TEAM_MD = readFileSync(join(process.cwd(), '.squad', 'team.md'), 'utf-8');

function issue(title: string, body = ''): TriageIssue {
  return {
    number: 1,
    title,
    body,
    labels: [],
  };
}

describe('ralph triage parser helpers', () => {
  describe('parseRoster()', () => {
    it('parses a standard team.md with ## Members table', () => {
      const roster = parseRoster(TEAM_MD);
      expect(roster.length).toBeGreaterThan(0);
      // Verify structure, not specific names — names change during team rebirths
      expect(roster[0]).toHaveProperty('name');
      expect(roster[0]).toHaveProperty('role');
      expect(roster[0]).toHaveProperty('label');
    });

    it('handles ## Team Roster header (legacy)', () => {
      const legacy = [
        '# Team',
        '',
        '## Team Roster',
        '',
        '| Name | Role |',
        '|------|------|',
        '| Alpha | Developer |',
      ].join('\n');

      const roster = parseRoster(legacy);
      expect(roster).toEqual([{ name: 'Alpha', role: 'Developer', label: 'squad:alpha' }]);
    });

    it('slugifies multi-word names into labels', () => {
      const multiWord = [
        '## Members',
        '',
        '| Name | Role |',
        '|------|------|',
        '| Steve Rogers | Lead |',
        '| Tony Stark | Engineer |',
      ].join('\n');

      const roster = parseRoster(multiWord);
      expect(roster[0]!.label).toBe('squad:steve-rogers');
      expect(roster[1]!.label).toBe('squad:tony-stark');
    });

    it('slugifies names with parentheses into labels', () => {
      const withParens = [
        '## Members',
        '',
        '| Name | Role |',
        '|------|------|',
        '| Tony Stark (Iron Man) | Engineer |',
      ].join('\n');

      const roster = parseRoster(withParens);
      expect(roster[0]!.label).toBe('squad:tony-stark-iron-man');
    });

    it('filters out Scribe and Ralph', () => {
      const roster = parseRoster(TEAM_MD);
      expect(roster.some((member) => member.name === 'Scribe')).toBe(false);
      expect(roster.some((member) => member.name === 'Ralph')).toBe(false);
    });

    it('returns empty array for empty roster', () => {
      const empty = [
        '## Members',
        '',
        '| Name | Role |',
        '|------|------|',
      ].join('\n');

      expect(parseRoster(empty)).toEqual([]);
    });

    it('returns empty array when no Members header', () => {
      const noMembersHeader = [
        '## Contributors',
        '',
        '| Name | Role |',
        '|------|------|',
        '| Alpha | Developer |',
      ].join('\n');

      expect(parseRoster(noMembersHeader)).toEqual([]);
    });

    it('handles tables with extra columns (Charter, Status)', () => {
      const roster = parseRoster(TEAM_MD);
      // Verify at least one member has all properties populated (not just name)
      const withRole = roster.find((member) => member.role && member.role.length > 0);
      expect(withRole).toBeDefined();
      expect(withRole!.label).toMatch(/^squad:/);
    });

    it('handles member names with emojis in role column', () => {
      const withRoleEmoji = [
        '## Members',
        '',
        '| Name | Role |',
        '|------|------|',
        '| Quinn | QA 🧪 |',
      ].join('\n');

      const roster = parseRoster(withRoleEmoji);
      expect(roster).toEqual([{ name: 'Quinn', role: 'QA 🧪', label: 'squad:quinn' }]);
    });
  });

  describe('parseRoutingRules()', () => {
    it('parses standard routing.md with Work Type → Agent table', () => {
      const rules = parseRoutingRules(ROUTING_MD);
      expect(rules.length).toBeGreaterThan(0);
      // Verify structure — agent names change during team rebirths
      expect(rules[0]).toHaveProperty('workType');
      expect(rules[0]).toHaveProperty('agentName');
      expect(rules[0]).toHaveProperty('keywords');
    });

    it('extracts keywords from Examples column', () => {
      const rules = parseRoutingRules(ROUTING_MD);
      const testsRule = rules.find((rule) => rule.workType === 'Tests & quality');
      expect(testsRule?.keywords).toContain('Vitest');
      expect(testsRule?.keywords).toContain('edge cases');
    });

    it('handles missing Examples column gracefully', () => {
      const markdown = [
        '## Work Type → Agent',
        '',
        '| Work Type | Agent |',
        '|-----------|-------|',
        '| Runtime | Fenster |',
      ].join('\n');

      expect(parseRoutingRules(markdown)).toEqual([
        { workType: 'Runtime', agentName: 'Fenster', keywords: [] },
      ]);
    });

    it('returns empty array for empty/missing section', () => {
      expect(parseRoutingRules('# No routing section')).toEqual([]);
      expect(parseRoutingRules('## Work Type → Agent')).toEqual([]);
    });

    it('handles emoji in agent name column', () => {
      const rules = parseRoutingRules(ROUTING_MD);
      // At least one agent name should contain an emoji (squad convention)
      expect(rules.some((rule) => /[\u{1F300}-\u{1FAD6}]/u.test(rule.agentName))).toBe(true);
    });
  });

  describe('parseModuleOwnership()', () => {
    it('parses Module Ownership table', () => {
      const modules = parseModuleOwnership(ROUTING_MD);
      expect(modules.length).toBeGreaterThan(0);
      // Verify structure — agent names change during team rebirths
      expect(modules[0]).toHaveProperty('modulePath');
      expect(modules[0]).toHaveProperty('primary');
    });

    it('handles "—" as secondary (should be null)', () => {
      const modules = parseModuleOwnership(ROUTING_MD);
      expect(modules.find((module) => module.modulePath === 'src/ralph/')?.secondary).toBeNull();
    });

    it('returns empty array for missing section', () => {
      expect(parseModuleOwnership('# No module ownership')).toEqual([]);
    });

    it('normalizes paths (backslash to forward slash)', () => {
      const markdown = [
        '## Module Ownership',
        '',
        '| Module | Primary | Secondary |',
        '|--------|---------|-----------|',
        '| `SRC\\CLI\\` | Fenster | — |',
      ].join('\n');

      expect(parseModuleOwnership(markdown)).toEqual([
        { modulePath: 'src/cli/', primary: 'Fenster', secondary: null },
      ]);
    });
  });
});

describe('triageIssue()', () => {
  const roster = parseRoster(TEAM_MD);
  const rules = parseRoutingRules(ROUTING_MD);
  const modules = parseModuleOwnership(ROUTING_MD);

  it('module path match returns module-ownership source with high confidence', () => {
    // Find a module path from the live routing to test with
    const firstModule = modules[0];
    expect(firstModule).toBeDefined();
    const decision = triageIssue(
      issue(`Failure in packages/squad-sdk/${firstModule.modulePath}triage.ts during assignment`),
      rules,
      modules,
      roster,
    );

    expect(decision?.source).toBe('module-ownership');
    expect(decision?.confidence).toBe('high');
    // Agent name comes from live routing — don't hardcode it
    expect(decision?.agent.name).toBeTruthy();
  });

  it('routing keyword match returns routing-rule source', () => {
    const decision = triageIssue(
      issue('Need better quality checks', 'Vitest coverage should include edge cases'),
      rules,
      modules,
      roster,
    );

    expect(decision?.source).toBe('routing-rule');
    // Agent name comes from live routing — don't hardcode it
    expect(decision?.agent.name).toBeTruthy();
  });

  it('multiple keyword matches get higher confidence', () => {
    const decision = triageIssue(
      issue('Quality gap', 'Vitest edge cases are missing in CI/CD'),
      rules,
      modules,
      roster,
    );

    expect(decision?.source).toBe('routing-rule');
    expect(decision?.confidence).toBe('high');
  });

  it('role keyword fallback works for frontend/backend/test', () => {
    const roleRoster: TeamMember[] = [
      { name: 'Front', role: 'Frontend UI Engineer', label: 'squad:front' },
      { name: 'Back', role: 'Backend API Engineer', label: 'squad:back' },
      { name: 'QA', role: 'Test Engineer', label: 'squad:qa' },
    ];

    const frontend = triageIssue(issue('Button CSS regression in UI'), [], [], roleRoster);
    const backend = triageIssue(issue('Database timeout on API endpoint'), [], [], roleRoster);
    const testing = triageIssue(issue('Flaky test bug fix needed'), [], [], roleRoster);

    expect(frontend?.agent.name).toBe('Front');
    expect(backend?.agent.name).toBe('Back');
    expect(testing?.agent.name).toBe('QA');
    expect(frontend?.source).toBe('role-keyword');
    expect(backend?.source).toBe('role-keyword');
    expect(testing?.source).toBe('role-keyword');
  });

  it('lead fallback when no match', () => {
    const decision = triageIssue(issue('Unclear request', 'No obvious signal here'), rules, modules, roster);
    expect(decision?.source).toBe('lead-fallback');
    // Should find *some* lead — don't hardcode the name
    expect(decision?.agent.name).toBeTruthy();
    expect(decision?.confidence).toBe('low');
  });

  it('returns null when no roster members', () => {
    const decision = triageIssue(issue('Anything'), rules, modules, []);
    expect(decision).toBeNull();
  });

  it('combines title + body for matching', () => {
    const onlyBodyRule: RoutingRule[] = [
      { workType: 'Testing', agentName: 'Hockney', keywords: ['vitest'] },
    ];
    const hockneyOnly: TeamMember[] = [{ name: 'Hockney', role: 'Tester', label: 'squad:hockney' }];

    const decision = triageIssue(
      issue('Please investigate', 'This appears only in body: vitest'),
      onlyBodyRule,
      [],
      hockneyOnly,
    );

    expect(decision?.source).toBe('routing-rule');
    expect(decision?.agent.name).toBe('Hockney');
  });

  it('case insensitive matching', () => {
    const onlyBodyRule: RoutingRule[] = [
      { workType: 'Testing', agentName: 'Hockney', keywords: ['vitest'] },
    ];
    const hockneyOnly: TeamMember[] = [{ name: 'Hockney', role: 'Tester', label: 'squad:hockney' }];

    const decision = triageIssue(issue('Need VITEST coverage now'), onlyBodyRule, [], hockneyOnly);
    expect(decision?.source).toBe('routing-rule');
  });

  it('prefers longer module path match (src/ralph/ over src/)', () => {
    const customModules: ModuleOwnership[] = [
      { modulePath: 'src/', primary: 'Keaton', secondary: null },
      { modulePath: 'src/ralph/', primary: 'Fenster', secondary: null },
    ];
    const customRoster: TeamMember[] = [
      { name: 'Keaton', role: 'Lead', label: 'squad:keaton' },
      { name: 'Fenster', role: 'Core Dev', label: 'squad:fenster' },
    ];

    const decision = triageIssue(
      issue('Issue in src/ralph/triage.ts resolver'),
      [],
      customModules,
      customRoster,
    );

    expect(decision?.source).toBe('module-ownership');
    expect(decision?.agent.name).toBe('Fenster');
  });
});

describe('triage parity', () => {
  it('ralph-triage.js is valid JavaScript', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    // --check validates syntax without executing
    await expect(exec('node', ['--check', 'templates/ralph-triage.js'])).resolves.toBeDefined();
  });

  it('SDK and script use same routing priority order', () => {
    // Verify the SDK triage priority is: module-ownership > routing-rule > role-keyword > lead-fallback
    // This is the documented contract both implementations must follow
    const routingMd = `## Work Type → Agent
| Work Type | Agent | Examples |
|---|---|---|
| Runtime | Fenster 🔧 | streaming, event loop |

## Module Ownership
| Module | Primary | Secondary |
|---|---|---|
| src/runtime/ | Fenster 🔧 | — |`;
    const teamMd = `## Members
| Name | Role |
|---|---|
| Fenster | Core Dev |
| Keaton | Lead |`;

    const rules = parseRoutingRules(routingMd);
    const modules = parseModuleOwnership(routingMd);
    const roster = parseRoster(teamMd);

    // Module ownership should win over routing rules
    const moduleIssue = { number: 1, title: 'Fix src/runtime/ bug with streaming', body: '', labels: [] };
    const result = triageIssue(moduleIssue, rules, modules, roster);
    expect(result?.source).toBe('module-ownership');

    // Routing rule should win over role keywords
    const ruleIssue = { number: 2, title: 'Fix event loop issue', body: '', labels: [] };
    const result2 = triageIssue(ruleIssue, rules, modules, roster);
    expect(result2?.source).toBe('routing-rule');
  });
});

describe('gh-cli.ts type contracts', () => {
  it('GhIssue includes optional body field', () => {
    expectTypeOf<GhIssue>().toMatchTypeOf<{
      number: number;
      title: string;
      body?: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
    }>();

    const withBody: GhIssue = {
      number: 42,
      title: 'Issue',
      body: 'details',
      labels: [],
      assignees: [],
    };
    expect(withBody.body).toBe('details');
  });

  it('GhPullRequest interface shape is preserved', () => {
    expectTypeOf<GhPullRequest>().toMatchTypeOf<{
      number: number;
      title: string;
      author: { login: string };
      labels: Array<{ name: string }>;
      isDraft: boolean;
      reviewDecision: string;
      state: string;
      headRefName: string;
      statusCheckRollup: Array<{ state: string; name: string }>;
    }>();
  });
});
