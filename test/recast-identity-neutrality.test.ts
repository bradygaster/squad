import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const workflowCopies = [
  '.github/workflows/squad-triage.yml',
  '.squad-templates/workflows/squad-triage.yml',
  'templates/workflows/squad-triage.yml',
  'packages/squad-cli/templates/workflows/squad-triage.yml',
  'packages/squad-sdk/templates/workflows/squad-triage.yml',
];
const assignmentWorkflowCopies = [
  '.github/workflows/squad-issue-assign.yml',
  '.squad-templates/workflows/squad-issue-assign.yml',
  'templates/workflows/squad-issue-assign.yml',
  'packages/squad-cli/templates/workflows/squad-issue-assign.yml',
  'packages/squad-sdk/templates/workflows/squad-issue-assign.yml',
];
const labelSyncWorkflowCopies = [
  '.github/workflows/sync-squad-labels.yml',
  '.squad-templates/workflows/sync-squad-labels.yml',
  'templates/workflows/sync-squad-labels.yml',
  'packages/squad-cli/templates/workflows/sync-squad-labels.yml',
  'packages/squad-sdk/templates/workflows/sync-squad-labels.yml',
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
type AssignmentHelpers = {
  slugify: (value: string) => string;
  findMemberBySlug: (
    lines: string[],
    memberName: string
  ) => { member: Member | null; ambiguous: boolean };
};
type LabelSyncHelpers = {
  slugify: (value: string) => string;
  assertUniqueMemberSlugs: (members: Member[]) => void;
};

function manifestSkillNames(): string[] {
  const source = readFileSync('packages/squad-sdk/src/config/init.ts', 'utf8');
  const block = source.match(/export const MANIFEST_SKILL_NAMES = \[([\s\S]*?)\] as const;/);
  expect(block).not.toBeNull();
  return [...block![1].matchAll(/'([^']+)'/g)].map(match => match[1]);
}

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

function assignmentHelpers(workflow: string): AssignmentHelpers {
  const start = workflow.indexOf('            const slugify =');
  const end = workflow.indexOf('            // Extract member name from label');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const context: { result?: AssignmentHelpers } = {};
  runInNewContext(
    `${workflow.slice(start, end)}
     result = { slugify, findMemberBySlug };`,
    context
  );
  if (!context.result) {
    throw new Error('Unable to load assignment helpers from workflow');
  }
  return context.result;
}

function labelSyncHelpers(workflow: string): LabelSyncHelpers {
  const start = workflow.indexOf('            function slugify');
  const end = workflow.indexOf('            // Ensure the base "squad" triage label exists');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const context: { members: Member[]; result?: LabelSyncHelpers } = { members: [] };
  runInNewContext(
    `${workflow.slice(start, end)}
     result = { slugify, assertUniqueMemberSlugs };`,
    context
  );
  if (!context.result) {
    throw new Error('Unable to load label-sync helpers from workflow');
  }
  return context.result;
}

describe('product and team isolation', () => {
  it('keeps build and template synchronization independent of live .squad state', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const buildInputs = [
      packageJson.scripts.prebuild,
      readFileSync('scripts/sync-templates.mjs', 'utf8'),
      readFileSync('scripts/sync-skill-templates.mjs', 'utf8'),
      readFileSync('scripts/size-regression-guard.mjs', 'utf8'),
      readFileSync('packages/squad-sdk/src/config/init.ts', 'utf8'),
    ];

    expect(packageJson.scripts.prebuild).not.toContain('sync-skill-templates');
    expect(packageJson.scripts.prebuild).not.toContain('sync-templates');
    expect(packageJson.scripts['verify:team-isolation']).toBe(
      'node scripts/verify-team-isolation.mjs'
    );
    for (const input of buildInputs) {
      expect(input).not.toContain("join(rootDir, '.squad',");
      expect(input).not.toContain('.squad/skills');
    }

    const ciWorkflow = readFileSync('.github/workflows/squad-ci.yml', 'utf8');
    expect(ciWorkflow).not.toMatch(/SDK_CLI_PATH_REGEX=.*\\\.squad\/agents/);
    expect(ciWorkflow).toContain('run: npm run verify:team-isolation');

    const isolationCheck = readFileSync('scripts/verify-team-isolation.mjs', 'utf8');
    expect(isolationCheck).toContain("file !== '.squad' && !file.startsWith('.squad/')");
    expect(isolationCheck).toContain('writeSyntheticTeam(syntheticTeamRoot)');
    expect(isolationCheck).toContain("join(teamDir, 'agents', 'moss-verifier')");
    expect(isolationCheck).toContain("join(teamDir, 'agents', 'moss-verifier', 'charter.md')");
    expect(isolationCheck).toMatch(
      /cpSync\(source, join\(destination, '\.squad'\), \{\s*recursive: true/
    );
    expect(isolationCheck).not.toContain("['ls-files', '-z', '--', '.squad']");
    expect(isolationCheck).toContain('Product build or package output changed');
    expect(isolationCheck).toContain("['pack', '--dry-run', '--json', '--ignore-scripts']");
    expect(isolationCheck).not.toContain("'test/cli-packaging-smoke.test.ts'");

    const activationWorkflow = readFileSync('workflows/squad.md', 'utf8');
    expect(activationWorkflow).toMatch(
      /replace each run of non-`a-z0-9`\s+characters with `-`/
    );
    expect(activationWorkflow).toContain('"label":"squad:{slugged Agent cell}"');
    expect(activationWorkflow).not.toContain(
      '"label":"squad:{lowercased Agent cell}"'
    );
    const phaseLabels = activationWorkflow.match(
      /\*\*Label set, per issue:\*\*([\s\S]*?)- The triggering intent issue/
    )?.[1] ?? '';
    expect(phaseLabels).toContain('emit `squad:{owner-slug}`');
    expect(phaseLabels).toMatch(/Phase issue:[\s\S]*slugged as above/);

    const labelPreflight = activationWorkflow.match(
      /##### Label Pre-flight([\s\S]*?)##### Transient Failure Handling/
    )?.[1] ?? '';
    expect(labelPreflight).toContain('mint `squad:{agent-slug}`');
    expect(labelPreflight).toMatch(
      /replacing each run of\s+non-`a-z0-9` characters with `-`/
    );

    const testFiles = filesUnder('test').filter(file => file.endsWith('.ts'));
    for (const file of testFiles) {
      expect(readFileSync(file, 'utf8'), `${file} reads live team state`).not.toMatch(
        /join\(process\.cwd\(\), ['"]\.squad['"]/
      );
    }

    expect(readFileSync('.dockerignore', 'utf8')).toMatch(/^\.squad$/m);
    const heartbeat = readFileSync('.github/workflows/squad-heartbeat.yml', 'utf8');
    expect(heartbeat).toContain('node templates/ralph-triage.js');
    expect(heartbeat).not.toContain('node .squad/templates/ralph-triage.js');
  });

  it('ships every manifest skill from product-owned canonical templates', () => {
    const mirrorRoots = [
      'templates/skills',
      'packages/squad-cli/templates/skills',
      'packages/squad-sdk/templates/skills',
    ];

    const canonicalRoot = '.squad-templates/skills';
    const canonicalFiles = filesUnder(canonicalRoot)
      .map(file => relative(canonicalRoot, file))
      .sort();

    for (const skill of manifestSkillNames()) {
      expect(canonicalFiles).toContain(join(skill, 'SKILL.md'));
    }

    for (const root of mirrorRoots) {
      const mirrorFiles = filesUnder(root)
        .map(file => relative(root, file))
        .sort();
      expect(mirrorFiles, `${root} must exactly mirror canonical skills`).toEqual(canonicalFiles);
      for (const file of canonicalFiles) {
        expect(
          readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n'),
          `${root}/${file} drifted from the product-owned canonical template`
        ).toEqual(readFileSync(join(canonicalRoot, file), 'utf8').replace(/\r\n/g, '\n'));
      }
    }

    const modelSelectionLocations = [
      '.squad-templates/skills/model-selection/SKILL.md',
      'templates/skills/model-selection/SKILL.md',
      'packages/squad-cli/templates/skills/model-selection/SKILL.md',
      'packages/squad-sdk/templates/skills/model-selection/SKILL.md',
    ];
    for (const file of modelSelectionLocations) {
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('"agent-alpha":');
      expect(content).toContain('"agent-beta":');
      for (const formerName of ['Fenster', 'Redfoot', 'Keaton', 'McManus']) {
        expect(content).not.toMatch(new RegExp(`\\b${formerName}\\b`, 'i'));
      }
    }

    const activePolicy = readFileSync('.copilot/skills/model-selection/SKILL.md', 'utf8');
    expect(activePolicy).toContain('Agent Alpha');
    for (const formerName of ['Fenster', 'Redfoot', 'Keaton', 'McManus']) {
      expect(activePolicy).not.toMatch(new RegExp(`\\b${formerName}\\b`, 'i'));
    }
  });

  it.each(assignmentWorkflowCopies)(
    '%s resolves multi-word labels and rejects colliding roster slugs',
    file => {
      const helpers = assignmentHelpers(readFileSync(file, 'utf8'));
      const roster = [
        '## Members',
        '| Name | Role |',
        '| --- | --- |',
        '| Quartz Navigator | Runtime |',
      ];

      expect(helpers.slugify('Quartz Navigator')).toBe('quartz-navigator');
      expect(helpers.slugify('---Quartz Navigator---')).toBe('quartz-navigator');
      expect(helpers.findMemberBySlug(roster, 'quartz-navigator')).toEqual({
        member: { name: 'Quartz Navigator', role: 'Runtime' },
        ambiguous: false,
      });

      const collision = [
        ...roster,
        '| Foo Bar | Runtime |',
        '| Foo-Bar | Quality |',
      ];
      expect(helpers.findMemberBySlug(collision, 'foo-bar')).toEqual({
        member: null,
        ambiguous: true,
      });
    }
  );

  it.each(labelSyncWorkflowCopies)(
    '%s rejects colliding member-label slugs before synchronization',
    file => {
      const helpers = labelSyncHelpers(readFileSync(file, 'utf8'));
      expect(helpers.slugify('---Quartz Navigator---')).toBe('quartz-navigator');
      expect(() => helpers.assertUniqueMemberSlugs([
        { name: 'Quartz Navigator', role: 'Runtime' },
        { name: 'Moss Verifier', role: 'Quality' },
      ])).not.toThrow();
      expect(() => helpers.assertUniqueMemberSlugs([
        { name: 'Foo Bar', role: 'Runtime' },
        { name: 'Foo-Bar', role: 'Quality' },
      ])).toThrow('Squad member label slug "foo-bar" is ambiguous');
    }
  );

  it.each(workflowCopies)('%s derives ownership from routing.md instead of role-name heuristics', file => {
    const workflow = readFileSync(file, 'utf8');

    expect(workflow).toContain('function routingRules(markdown, teamMembers)');
    expect(workflow).toContain('Matched routing rule');
    expect(workflow).not.toContain("role.includes('frontend')");
    expect(workflow).not.toContain("role.includes('backend')");
    expect(workflow).not.toContain("role.includes('devops')");
  });

  it.each(workflowCopies)('%s executes boundary-safe, ambiguity-aware routing', file => {
    const workflow = readFileSync(file, 'utf8');
    const helpers = triageHelpers(workflow);
    const architect = { name: 'Architect', role: 'Architect' };
    const lead = { name: 'Team Lead', role: 'Technical Lead' };
    const runtime = { name: 'Runtime Engineer', role: 'Runtime' };
    const quality = { name: 'Quality Engineer', role: 'Quality' };
    const experience = { name: 'Experience Engineer', role: 'UX' };
    const types = { name: 'Type Engineer', role: 'Type system' };
    const ann = { name: 'Ann', role: 'Documentation' };
    const anna = { name: 'Anna', role: 'Documentation' };
    const members = [architect, lead, runtime, quality, experience, types, ann, anna];
    const routing = [
      '| Work Type | Agent | Examples',
      '| --- | --- | ---',
      '| Core runtime | Runtime Engineer 🔧 | adapter, session pool, API',
      '| Tests & quality | Quality Engineer | CI/CD, API failure',
      '| Experience | Experience Engineer | UI, UX',
      '| Type system | Type Engineer | C#, generics',
      '| Docs | Anna 📚 | readme, documentation',
    ].join('\n');

    expect(helpers.findLead(members)).toEqual(lead);
    expect(helpers.findLead([architect])).toEqual(architect);
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
        'CI failure in the release workflow',
        routing,
        members,
        lead
      )
    ).toEqual({ member: quality, workType: 'Tests & quality' });
    expect(
      helpers.selectRoutingAssignment(
        'UI polish and UX review',
        routing,
        members,
        lead
      )
    ).toEqual({ member: experience, workType: 'Experience' });
    expect(
      helpers.selectRoutingAssignment(
        'C# generic constraint regression',
        routing,
        members,
        lead
      )
    ).toEqual({ member: types, workType: 'Type system' });
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
    expect(
      helpers.selectRoutingAssignment(
        'rapid response required',
        routing,
        members,
        lead
      )
    ).toEqual({ member: lead, workType: null });
    expect(
      helpers.selectRoutingAssignment(
        'engineer needed',
        routing,
        members,
        lead
      )
    ).toEqual({ member: lead, workType: null });
    expect(
      helpers.selectRoutingAssignment(
        'API failure',
        routing,
        members,
        lead
      )
    ).toEqual({ member: quality, workType: 'Tests & quality' });

    const ambiguousRouting = [
      '| Work Type | Agent | Examples',
      '| --- | --- | ---',
      '| Runtime | Runtime Engineer | API',
      '| Quality | Quality Engineer | failure',
    ].join('\n');
    expect(
      helpers.selectRoutingAssignment(
        'API failure',
        ambiguousRouting,
        members,
        lead
      )
    ).toEqual({ member: lead, workType: null });

    const invalidDestinationRouting = [
      '| Work Type | Agent | Examples',
      '| --- | --- | ---',
      '| Runtime | Runtime Engineer / Quality Engineer | adapter',
    ].join('\n');
    expect(
      helpers.selectRoutingAssignment(
        'adapter regression',
        invalidDestinationRouting,
        members,
        lead
      )
    ).toEqual({ member: lead, workType: null });

    const presetRouting = [
      '| Work Type | Primary | Secondary |',
      '| --- | --- | --- |',
      '| Backend Engineer | Runtime Engineer | Quality Engineer |',
    ].join('\n');
    expect(
      helpers.selectRoutingAssignment(
        'backend regression',
        presetRouting,
        members,
        lead
      )
    ).toEqual({ member: runtime, workType: 'Backend Engineer' });
  });
});
