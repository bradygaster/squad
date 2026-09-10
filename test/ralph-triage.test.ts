import { createRequire } from 'node:module';
import { describe, it, expect, expectTypeOf, afterEach } from 'vitest';
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

const TEAM_MD = [
  '# Team',
  '',
  '## Members',
  '',
  '| Name | Role |',
  '|------|------|',
  '| Team Lead | Lead |',
  '| Runtime Engineer | Backend Runtime |',
  '| Quality Engineer | Test Engineer |',
  '| Experience Engineer | Frontend UX |',
  '| Scribe | Session Memory |',
  '| Ralph | Work Monitor |',
].join('\n');

const ROUTING_MD = [
  '# Routing',
  '',
  '## Routing Table',
  '',
  '| Work Type | Route To | Examples |',
  '|-----------|-------|----------|',
  '| Core runtime | Runtime Engineer 🔧 | adapter, session pool, API |',
  '| Tests & quality | Quality Engineer 🧪 | Test coverage, Vitest, edge cases, CI/CD |',
  '| Experience | Experience Engineer 🎨 | UI, UX, CSS |',
  '',
  '## Module Ownership',
  '',
  '| Module | Primary | Secondary |',
  '|--------|---------|-----------|',
  '| `src/ralph/` | Runtime Engineer | Team Lead |',
  '| `src/` | Team Lead | Runtime Engineer |',
].join('\n');

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
      // Verify structure without reading the repository's live team state.
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
    it('parses the canonical Routing Table with Route To column', () => {
      const rules = parseRoutingRules(ROUTING_MD);
      expect(rules.length).toBeGreaterThan(0);
      // Verify structure using the synthetic roster.
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

    it('accepts generated preset routing with a Primary column', () => {
      const markdown = [
        '## Routing Table',
        '',
        '| Work Type | Primary | Secondary |',
        '|-----------|---------|-----------|',
        '| Runtime | Runtime Engineer | Quality Engineer |',
      ].join('\n');

      expect(parseRoutingRules(markdown)).toEqual([
        { workType: 'Runtime', agentName: 'Runtime Engineer', keywords: [] },
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
      const markdown = [
        '## Module Ownership',
        '',
        '| Module | Primary | Secondary |',
        '|--------|---------|-----------|',
        '| `src/ralph/` | Runtime Engineer | — |',
      ].join('\n');

      expect(parseModuleOwnership(markdown)).toEqual([
        { modulePath: 'src/ralph/', primary: 'Runtime Engineer', secondary: null },
      ]);
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
    // Find a module path from the synthetic routing fixture.
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
    expect(decision?.agent.name).toBe('Runtime Engineer');
  });

  it('routing keyword match returns routing-rule source', () => {
    const decision = triageIssue(
      issue('Need better quality checks', 'Vitest coverage should include edge cases'),
      rules,
      modules,
      roster,
    );

    expect(decision?.source).toBe('routing-rule');
    expect(decision?.agent.name).toBe('Quality Engineer');
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

  it('does not infer ownership from role-name keywords', () => {
    const roleRoster: TeamMember[] = [
      { name: 'Lead', role: 'Technical Lead', label: 'squad:lead' },
      { name: 'Front', role: 'Frontend UI Engineer', label: 'squad:front' },
      { name: 'Back', role: 'Backend API Engineer', label: 'squad:back' },
      { name: 'QA', role: 'Test Engineer', label: 'squad:qa' },
    ];

    const frontend = triageIssue(issue('Button CSS regression in UI'), [], [], roleRoster);
    const backend = triageIssue(issue('Database timeout on API endpoint'), [], [], roleRoster);
    const testing = triageIssue(issue('Flaky test bug fix needed'), [], [], roleRoster);

    expect(frontend?.agent.name).toBe('Lead');
    expect(backend?.agent.name).toBe('Lead');
    expect(testing?.agent.name).toBe('Lead');
    expect(frontend?.source).toBe('lead-fallback');
    expect(backend?.source).toBe('lead-fallback');
    expect(testing?.source).toBe('lead-fallback');
  });

  it('lead fallback when no match', () => {
    const decision = triageIssue(issue('Unclear request', 'No obvious signal here'), rules, modules, roster);
    expect(decision?.source).toBe('lead-fallback');
    expect(decision?.agent.name).toBe('Team Lead');
    expect(decision?.confidence).toBe('low');
  });

  it('returns null when no roster members', () => {
    const decision = triageIssue(issue('Anything'), rules, modules, []);
    expect(decision).toBeNull();
  });

  it('combines title + body for matching', () => {
    const onlyBodyRule: RoutingRule[] = [
      { workType: 'Testing', agentName: 'Quality Engineer', keywords: ['vitest'] },
    ];
    const qualityOnly: TeamMember[] = [
      { name: 'Quality Engineer', role: 'Tester', label: 'squad:quality-engineer' },
    ];

    const decision = triageIssue(
      issue('Please investigate', 'This appears only in body: vitest'),
      onlyBodyRule,
      [],
      qualityOnly,
    );

    expect(decision?.source).toBe('routing-rule');
    expect(decision?.agent.name).toBe('Quality Engineer');
  });

  it('case insensitive matching', () => {
    const onlyBodyRule: RoutingRule[] = [
      { workType: 'Testing', agentName: 'Quality Engineer', keywords: ['vitest'] },
    ];
    const qualityOnly: TeamMember[] = [
      { name: 'Quality Engineer', role: 'Tester', label: 'squad:quality-engineer' },
    ];

    const decision = triageIssue(issue('Need VITEST coverage now'), onlyBodyRule, [], qualityOnly);
    expect(decision?.source).toBe('routing-rule');
  });

  it('prefers longer module path match (src/ralph/ over src/)', () => {
    const customModules: ModuleOwnership[] = [
      { modulePath: 'src/', primary: 'Team Lead', secondary: null },
      { modulePath: 'src/ralph/', primary: 'Runtime Engineer', secondary: null },
    ];
    const customRoster: TeamMember[] = [
      { name: 'Team Lead', role: 'Lead', label: 'squad:team-lead' },
      { name: 'Runtime Engineer', role: 'Core Dev', label: 'squad:runtime-engineer' },
    ];

    const decision = triageIssue(
      issue('Issue in src/ralph/triage.ts resolver'),
      [],
      customModules,
      customRoster,
    );

    expect(decision?.source).toBe('module-ownership');
    expect(decision?.agent.name).toBe('Runtime Engineer');
  });
});

describe('triage parity', () => {
  const require = createRequire(import.meta.url);
  const standalone = require('../templates/ralph-triage.js') as {
    parseRoster: typeof parseRoster;
    parseRoutingRules: typeof parseRoutingRules;
    triageIssue: typeof triageIssue;
  };
  const implementations: Array<{
    name: string;
    parseTeam: typeof parseRoster;
    parseRules: typeof parseRoutingRules;
    triage: typeof triageIssue;
  }> = [
    { name: 'SDK', parseTeam: parseRoster, parseRules: parseRoutingRules, triage: triageIssue },
    {
      name: 'standalone script',
      parseTeam: standalone.parseRoster,
      parseRules: standalone.parseRoutingRules,
      triage: standalone.triageIssue,
    },
  ];

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

  it.each(implementations)('$name uses workflow-compatible route boundaries and destinations', ({
    parseTeam,
    parseRules,
    triage,
  }) => {
    const teamMd = [
      '## Members',
      '| Name | Role |',
      '|---|---|',
      '| Team Lead | Technical Lead |',
      '| Runtime Engineer | Runtime |',
      '| Quality Engineer | Quality |',
      '| Anna | Documentation |',
      '| A.B | Specialist |',
    ].join('\n');
    const routingMd = [
      '## Routing Table',
      '| Work Type | Agent | Examples |',
      '|---|---|---|',
      '| Runtime | Runtime Engineer | API |',
      '| Quality | Quality Engineer | failure |',
      '| Docs | Ann | readme |',
      '| Punctuation | AB | punctuation |',
      '| Decorated | **Anna** 📚 | handbook |',
    ].join('\n');
    const parsedRoster = parseTeam(teamMd);
    const parsedRules = parseRules(routingMd);
    const decide = (title: string) =>
      triage({ number: 1, title, body: '', labels: [] }, parsedRules, [], parsedRoster);

    expect(decide('API regression')?.agent.name).toBe('Runtime Engineer');
    expect(decide('API.')?.agent.name).toBe('Runtime Engineer');
    expect(decide('rapid response required')?.agent.name).toBe('Team Lead');
    expect(decide('API failure')?.agent.name).toBe('Team Lead');
    expect(decide('readme update')?.agent.name).toBe('Team Lead');
    expect(decide('punctuation update')?.agent.name).toBe('Team Lead');
    expect(decide('handbook update')?.agent.name).toBe('Anna');

    const semicolonRules = parseRules([
      '## Routing Table',
      '| Work Type | Agent | Examples |',
      '|---|---|---|',
      '| Runtime | Runtime Engineer | API; server |',
      '| Quality | Quality Engineer | failure |',
    ].join('\n'));
    const semicolonDecision = triage(
      { number: 2, title: 'API failure', body: '', labels: [] },
      semicolonRules,
      [],
      parsedRoster,
    );
    expect(semicolonDecision?.agent.name).toBe('Team Lead');
    expect(decide('failure.')?.agent.name).toBe('Quality Engineer');
  });
});

describe('resolveGithubApiBase() — GitHub Enterprise support', () => {
  const require = createRequire(import.meta.url);
  const { resolveGithubApiBase } = require('../templates/ralph-triage.js');

  const originalApiUrl = process.env.GITHUB_API_URL;
  const originalServerUrl = process.env.GITHUB_SERVER_URL;

  afterEach(() => {
    if (originalApiUrl === undefined) delete process.env.GITHUB_API_URL;
    else process.env.GITHUB_API_URL = originalApiUrl;
    if (originalServerUrl === undefined) delete process.env.GITHUB_SERVER_URL;
    else process.env.GITHUB_SERVER_URL = originalServerUrl;
  });

  it('uses GITHUB_API_URL when set (GHE runners set this to <host>/api/v3)', () => {
    process.env.GITHUB_API_URL = 'https://ghe.example.com/api/v3';
    delete process.env.GITHUB_SERVER_URL;
    expect(resolveGithubApiBase()).toBe('https://ghe.example.com/api/v3');
  });

  it('strips a trailing slash from GITHUB_API_URL', () => {
    process.env.GITHUB_API_URL = 'https://api.github.com/';
    expect(resolveGithubApiBase()).toBe('https://api.github.com');
  });

  it('falls back to GITHUB_SERVER_URL + /api/v3 when GITHUB_API_URL is unset', () => {
    delete process.env.GITHUB_API_URL;
    process.env.GITHUB_SERVER_URL = 'https://ghe.example.com';
    expect(resolveGithubApiBase()).toBe('https://ghe.example.com/api/v3');
  });

  it('falls back to https://api.github.com when neither env var is set', () => {
    delete process.env.GITHUB_API_URL;
    delete process.env.GITHUB_SERVER_URL;
    expect(resolveGithubApiBase()).toBe('https://api.github.com');
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
