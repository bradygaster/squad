/**
 * Tests for routing configuration module
 */

import { describe, it, expect } from 'vitest';
import {
  parseRoutingMarkdown,
  compileRoutingRules,
  matchRoute,
  matchIssueLabels
} from '@bradygaster/squad-sdk/config';
import type { RoutingConfig, IssueRoutingRule } from '@bradygaster/squad-sdk/runtime';

describe('parseRoutingMarkdown', () => {
  it('parses basic routing table', () => {
    const markdown = `
# Work Routing

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | Lead | New features, enhancements |
| bug-fix | Developer | Bug fixes, patches |
| testing | Tester | Write tests, QA |
`;

    const config = parseRoutingMarkdown(markdown);
    
    expect(config.rules).toHaveLength(3);
    expect(config.rules[0].workType).toBe('feature-dev');
    expect(config.rules[0].agents).toEqual(['Lead']);
    expect(config.rules[0].examples).toEqual(['New features', 'enhancements']);
    
    expect(config.rules[1].workType).toBe('bug-fix');
    expect(config.rules[1].agents).toEqual(['Developer']);
  });

  it('handles multiple agents per rule', () => {
    const markdown = `
## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| security | Lead, Security | Security review, audits |
`;

    const config = parseRoutingMarkdown(markdown);
    
    expect(config.rules[0].agents).toEqual(['Lead', 'Security']);
  });

  it('handles tables without examples column', () => {
    const markdown = `
## Routing Table

| Work Type | Route To |
|-----------|----------|
| refactoring | Developer |
`;

    const config = parseRoutingMarkdown(markdown);
    
    expect(config.rules).toHaveLength(1);
    expect(config.rules[0].workType).toBe('refactoring');
    expect(config.rules[0].examples).toBeUndefined();
  });

  it('skips empty rows and sections', () => {
    const markdown = `
## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| feature-dev | Lead | New features |

## Other Section

Some other content
`;

    const config = parseRoutingMarkdown(markdown);
    
    expect(config.rules).toHaveLength(1);
  });

  it('returns default governance settings', () => {
    const markdown = `
## Routing Table

| Work Type | Route To |
|-----------|----------|
| feature-dev | Lead |
`;

    const config = parseRoutingMarkdown(markdown);
    
    expect(config.governance?.eagerByDefault).toBe(true);
    expect(config.governance?.scribeAutoRuns).toBe(false);
  });
});

describe('compileRoutingRules', () => {
  it('compiles rules with regex patterns', () => {
    const config: RoutingConfig = {
      rules: [
        {
          workType: 'feature-dev',
          agents: ['Lead'],
          examples: ['new feature', 'enhancement']
        }
      ]
    };

    const router = compileRoutingRules(config);
    
    expect(router.workTypeRules).toHaveLength(1);
    expect(router.workTypeRules[0].patterns.length).toBeGreaterThan(0);
  });

  it('sorts rules by priority (specificity)', () => {
    const config: RoutingConfig = {
      rules: [
        {
          workType: 'bug',
          agents: ['Developer']
        },
        {
          workType: 'critical-security-bug-fix',
          agents: ['Security', 'Lead']
        },
        {
          workType: 'feature-dev',
          agents: ['Lead']
        }
      ]
    };

    const router = compileRoutingRules(config);
    
    // More specific (longer) work types should have higher priority
    expect(router.workTypeRules[0].workType).toBe('critical-security-bug-fix');
    expect(router.workTypeRules[router.workTypeRules.length - 1].workType).toBe('bug');
  });

  it('compiles issue routing rules', () => {
    const issueRule: IssueRoutingRule = {
      label: 'squad:lead',
      action: 'assign',
      target: 'Lead'
    };

    const config: RoutingConfig = {
      rules: [],
      issueRouting: [issueRule]
    };

    const router = compileRoutingRules(config);
    
    expect(router.issueRules).toHaveLength(1);
    expect(router.issueRules![0].action).toBe('assign');
  });
});

describe('matchRoute', () => {
  const config: RoutingConfig = {
    rules: [
      {
        workType: 'feature-dev',
        agents: ['Lead'],
        examples: ['new feature', 'enhancement']
      },
      {
        workType: 'bug-fix',
        agents: ['Developer'],
        examples: ['fix bug', 'patch']
      },
      {
        workType: 'testing',
        agents: ['Tester'],
        examples: ['write tests', 'test coverage']
      }
    ]
  };

  const router = compileRoutingRules(config);

  it('matches based on work type keywords', () => {
    const match = matchRoute('implement new feature for authentication', router);
    
    expect(match.agents).toContain('Lead');
    expect(match.confidence).toBe('medium'); // Default confidence from compileRoutingRules
    expect(match.rule?.workType).toBe('feature-dev');
  });

  it('matches based on examples', () => {
    const match = matchRoute('need to fix bug in login flow', router);
    
    expect(match.agents).toContain('Developer');
    expect(match.rule?.workType).toBe('bug-fix');
  });

  it('returns fallback for no match', () => {
    const match = matchRoute('what is the weather today?', router);
    
    expect(match.agents).toEqual(['@coordinator']);
    expect(match.confidence).toBe('low');
    expect(match.reason).toContain('fallback');
  });

  it('routes explicit @agent mentions with high confidence', () => {
    const match = matchRoute('@lead please review this feature', router);

    expect(match.agents).toEqual(['@lead']);
    expect(match.confidence).toBe('high');
    expect(match.reason).toContain('Explicit agent mention: @lead');
  });

  it('does not let @coordinator override normal routing or fallback', () => {
    const matchedRoute = matchRoute('@coordinator implement new feature for authentication', router);
    expect(matchedRoute.agents).toContain('Lead');
    expect(matchedRoute.confidence).toBe('medium');
    expect(matchedRoute.rule?.workType).toBe('feature-dev');

    const fallbackRoute = matchRoute('@coordinator what is the weather today?', router);
    expect(fallbackRoute.agents).toEqual(['@coordinator']);
    expect(fallbackRoute.confidence).toBe('low');
    expect(fallbackRoute.reason).toContain('fallback');
  });

  it('does not treat email addresses as explicit @agent mentions', () => {
    const match = matchRoute('contact user@example.com about the new feature', router);

    expect(match.agents).toContain('Lead');
    expect(match.confidence).toBe('medium');
    expect(match.rule?.workType).toBe('feature-dev');
  });

  it('prefers more specific matches', () => {
    const specificConfig: RoutingConfig = {
      rules: [
        {
          workType: 'security-audit',
          agents: ['Security'],
          examples: ['security review', 'audit']
        },
        {
          workType: 'review',
          agents: ['Lead'],
          examples: ['code review']
        }
      ]
    };

    const specificRouter = compileRoutingRules(specificConfig);
    const match = matchRoute('need security audit for auth module', specificRouter);
    
    // Should match more specific rule first
    expect(match.agents).toContain('Security');
  });
});

describe('matchIssueLabels', () => {
  const issueRules = compileRoutingRules({
    rules: [],
    issueRouting: [
      {
        label: 'squad:lead',
        action: 'assign',
        target: 'Lead'
      },
      {
        label: 'squad:developer',
        action: 'assign',
        target: 'Developer',
        requiredLabels: ['bug'],
        excludedLabels: ['wontfix']
      }
    ]
  }).issueRules!;

  it('matches simple label', () => {
    const match = matchIssueLabels(['squad:lead', 'enhancement'], issueRules);
    
    expect(match).toBeDefined();
    expect(match?.action).toBe('assign');
    expect(match?.target).toBe('Lead');
  });

  it('respects required labels', () => {
    const matchWithRequired = matchIssueLabels(
      ['squad:developer', 'bug'],
      issueRules
    );
    
    expect(matchWithRequired).toBeDefined();
    expect(matchWithRequired?.target).toBe('Developer');
    
    const matchWithoutRequired = matchIssueLabels(
      ['squad:developer', 'enhancement'],
      issueRules
    );
    
    expect(matchWithoutRequired).toBeUndefined();
  });

  it('respects excluded labels', () => {
    const match = matchIssueLabels(
      ['squad:developer', 'bug', 'wontfix'],
      issueRules
    );
    
    expect(match).toBeUndefined();
  });

  it('returns undefined for no match', () => {
    const match = matchIssueLabels(['unrelated', 'labels'], issueRules);
    
    expect(match).toBeUndefined();
  });
});
