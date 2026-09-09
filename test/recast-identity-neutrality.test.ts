import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const retiredNames = [
  'Flight',
  'EECOM',
  'FIDO',
  'PAO',
  'CAPCOM',
  'CONTROL',
  'Booster',
  'Surgeon',
  'Belanna',
  'GNC',
  'RETRO',
  'INCO',
  'GUIDO',
  'VOX',
  'DSKY',
  'Sims',
  'Handbook',
];

const identityNeutralFiles = [
  '.github/instructions/squad-routing-guard.instructions.md',
  '.github/PR_REQUIREMENTS.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/dependabot.yml',
];

const templateRoots = [
  '.squad/skills',
  '.squad-templates',
  'templates',
  'packages/squad-cli/templates',
  'packages/squad-sdk/templates',
];

const broadlyScannableTemplateNames = retiredNames.filter(
  name => !['Flight', 'CONTROL', 'RETRO'].includes(name)
);

const contextualTemplateNameChecks = [
  { name: 'Flight', pattern: /(?<!in-)\bflight\b/i },
  { name: 'CONTROL', pattern: /(?:squad:|@)control\b|\bcontrol\b\s+(?:agent|owner|engineer)/i },
  { name: 'RETRO', pattern: /(?:squad:|@)retro\b|\bretro\b\s+(?:agent|owner|reviewer)/i },
];

type Member = { name: string; role: string };
type RoutingAssignment = { member: Member; workType: string | null };
type TriageHelpers = {
  findLead: (members: Member[]) => Member | undefined;
  selectRoutingAssignment: (
    issueText: string,
    routingContent: string,
    members: Member[],
    lead: Member
  ) => RoutingAssignment;
};

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function triageHelpers(workflow: string): TriageHelpers {
  const start = workflow.indexOf('            function findLead');
  const end = workflow.indexOf('            const lead = findLead');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const context: { result?: TriageHelpers } = {};
  runInNewContext(
    `${workflow.slice(start, end)}
     result = { findLead, selectRoutingAssignment };`,
    context
  );
  if (!context.result) {
    throw new Error('Unable to load triage helpers from workflow');
  }
  return context.result;
}

describe('re-cast identity neutrality', () => {
  it.each(identityNeutralFiles)('%s does not bind policy to a cast name', file => {
    const content = readFileSync(file, 'utf8');
    for (const name of retiredNames) {
      expect(content).not.toMatch(new RegExp(`\\b${name}\\b`, 'i'));
    }
  });

  it('shipped templates do not contain cast-specific agent names', () => {
    const templateFiles = templateRoots.flatMap(filesUnder);

    for (const file of templateFiles) {
      const content = readFileSync(file, 'utf8');
      for (const name of broadlyScannableTemplateNames) {
        expect(content, `${file} contains ${name}`).not.toMatch(
          new RegExp(`\\b${name}\\b`, 'i')
        );
      }
      for (const check of contextualTemplateNameChecks) {
        expect(content, `${file} contains ${check.name}`).not.toMatch(check.pattern);
      }
    }
  });

  it('triage derives ownership from routing.md instead of role-name heuristics', () => {
    const workflow = readFileSync('.github/workflows/squad-triage.yml', 'utf8');

    expect(workflow).toContain('function routingRules(markdown, teamMembers)');
    expect(workflow).toContain('Matched routing rule');
    expect(workflow).not.toContain("role.includes('frontend')");
    expect(workflow).not.toContain("role.includes('backend')");
    expect(workflow).not.toContain("role.includes('devops')");
  });

  it('executes routing matches, exact destinations, and Lead fallback', () => {
    const workflow = readFileSync('.github/workflows/squad-triage.yml', 'utf8');
    const helpers = triageHelpers(workflow);
    const architect = { name: 'Architect', role: 'Architect' };
    const lead = { name: 'Team Lead', role: 'Technical Lead' };
    const runtime = { name: 'Runtime Engineer', role: 'Runtime' };
    const ann = { name: 'Ann', role: 'Documentation' };
    const anna = { name: 'Anna', role: 'Documentation' };
    const members = [architect, lead, runtime, ann, anna];
    const routing = [
      '| Work Type | Agent | Examples',
      '| --- | --- | ---',
      '| Core runtime | Runtime Engineer 🔧 | adapter, session pool',
      '| Docs | Anna 📚 | readme, documentation',
    ].join('\n');

    expect(helpers.findLead(members)).toEqual(lead);
    expect(
      helpers.selectRoutingAssignment(
        'adapter session pool regression',
        routing,
        members,
        lead
      )
    ).toEqual({ member: runtime, workType: 'Core runtime' });
    expect(
      helpers.selectRoutingAssignment(
        'readme documentation update',
        routing,
        members,
        lead
      )
    ).toEqual({ member: anna, workType: 'Docs' });
    expect(
      helpers.selectRoutingAssignment(
        'unclassified request',
        routing,
        members,
        lead
      )
    ).toEqual({ member: lead, workType: null });
  });
});
