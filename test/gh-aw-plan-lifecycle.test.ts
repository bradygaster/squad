/**
 * gh-aw Plan Lifecycle Contract Tests
 *
 * Guards the long-path planning lifecycle in `workflows/squad.md` against the
 * three defects tracked by #1758, the Owner/Agent cast-Name binding of #1759,
 * the structural research contract of #1756, and adversarial validation from
 * #1757.
 *
 * These assertions target the workflow's structural contract (labeled sections,
 * ordering hints, binding rules) rather than incidental prose — a single
 * regression produces a single failing criterion.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createActivation, digest, finalizeActivation, parseActivationPlan, prepareActivation,
} from '../workflows/shared/squad-activation.mjs';
import { parseStructuredData } from '../workflows/shared/check-agent-binding.mjs';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const SQUAD_WORKFLOW = join(WORKFLOWS_DIR, 'squad.md');
const ONTOLOGY = join(WORKFLOWS_DIR, 'shared', 'squad-planning-ontology.md');
const GH_AW_GUIDE = join(process.cwd(), 'docs', 'src', 'content', 'docs', 'guide', 'gh-aw.md');

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

/** Include the skill heading and stop before its end marker, the next skill, or EOF. */
function skillBlock(markdown: string, name: string): string {
  const marker = `## skill: \`${name}\``;
  const endMarker = `## end skill: \`${name}\``;
  const skillHeadings = [...markdown.matchAll(/^## skill:[^\r\n]*$/gm)];
  const requested = skillHeadings.filter(match => match[0] === marker);
  if (requested.length !== 1) {
    throw new Error(`skill block "${name}" must appear exactly once; found ${requested.length}`);
  }
  const start = requested[0].index!;
  const nextSkill = skillHeadings.find(match => match.index! > start);
  const matchingEnds = [...markdown.matchAll(/^## end skill:[^\r\n]*$/gm)].filter(
    match => match[0] === endMarker && match.index! > start,
  );
  if (matchingEnds.length > 1) {
    throw new Error(`skill block "${name}" has duplicate end markers`);
  }
  const end = Math.min(nextSkill?.index ?? markdown.length, matchingEnds[0]?.index ?? markdown.length);
  return markdown.slice(start, end);
}

describe('skillBlock', () => {
  const adjacentSkills = [
    '## skill: `requested`',
    'requested content',
    '## skill: `following`',
    'following content',
    '## end skill: `following`',
    '## agent: `after-skills`',
  ].join('\n');

  it('includes the requested heading and content but excludes the following skill', () => {
    const requested = skillBlock(adjacentSkills, 'requested');

    expect(requested).toBe('## skill: `requested`\nrequested content\n');
    expect(requested).not.toContain('## skill: `following`');
    expect(requested).not.toContain('following content');
    expect(skillBlock(adjacentSkills, 'following')).toBe(
      '## skill: `following`\nfollowing content\n',
    );
    expect(skillBlock('## skill: `only`\nonly content', 'only')).toBe(
      '## skill: `only`\nonly content',
    );
  });

  it('fails closed when the requested marker is missing or duplicated', () => {
    expect(() => skillBlock(adjacentSkills, 'missing')).toThrow(
      'skill block "missing" must appear exactly once; found 0',
    );
    expect(() => skillBlock(`${adjacentSkills}\n## skill: \`requested\``, 'requested')).toThrow(
      'skill block "requested" must appear exactly once; found 2',
    );
    expect(() => skillBlock(`${adjacentSkills}\n## end skill: \`following\``, 'following')).toThrow(
      'skill block "following" has duplicate end markers',
    );
  });
});

/** Slice a `## agent: \`name\`` block out of the workflow markdown. */
function agentBlock(markdown: string, name: string): string {
  const marker = `## agent: \`${name}\``;
  const start = markdown.indexOf(marker);
  if (start === -1) throw new Error(`agent block "${name}" not found`);
  const bodyStart = start + marker.length;
  const rest = markdown.slice(bodyStart);
  const nextH2 = rest.search(/\n## /);
  return nextH2 === -1 ? rest : rest.slice(0, nextH2);
}

const squad = readText(SQUAD_WORKFLOW);
const ontology = readText(ONTOLOGY);
const team = [
  '# Synthetic Team Fixture',
  '',
  '## Members',
  '',
  '| Name | Role |',
  '|------|------|',
  '| Architect | Lead |',
  '| Builder | Runtime Engineer |',
  '| Writer | Documentation |',
  '',
  '## End',
].join('\n');
const guide = readText(GH_AW_GUIDE);

const lifecycleWorkspace = join(process.cwd(), '.test-workspaces-plan-lifecycle');
afterAll(() => rmSync(lifecycleWorkspace, { recursive: true, force: true }));
const stamp = '2026-01-01T00:00:00Z';
const frozenRegistry = {
  schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1,
  generated_at: stamp, transaction_id: 'lifecycle-fixture',
  agents: Object.fromEntries(['Architect', 'Builder', 'Writer'].map(name => [name.toLowerCase(), {
    display_name: name, persistent_name: name, role: 'Engineer', universe: 'synthetic',
    status: 'active', created_at: stamp, updated_at: stamp,
  }])),
};
const structured = (kind: string, phases: number[] = []) =>
  `Structured data:\n\`\`\`json\n${JSON.stringify({
    squad_artifact: kind, schema_version: '1', origin_issue: 42, phases,
  })}\n\`\`\``;
function taskTable(rows = [
  '| 1 | Same title | Builder | builder | None |',
  '| 2 | Same title | Architect | architect | 1 |',
], granular = false) {
  return [
    `| # | Title | ${granular ? 'Agent' : 'Owner'} | Agent ID | Depends On |${granular ? ' Epic |' : ''}`,
    `|---|---|---|---|---|${granular ? '---|' : ''}`, ...rows,
  ].join('\n');
}

/** API doubles copy snapshots so changing current state never changes a frozen capture. */
function activationFixture(body = taskTable(), command = 'activate', kind = 'plan') {
  mkdirSync(lifecycleWorkspace, { recursive: true });
  const root = mkdtempSync(join(lifecycleWorkspace, 'runtime-'));
  mkdirSync(join(root, '.squad/casting'), { recursive: true });
  const registryRaw = JSON.stringify(frozenRegistry);
  const historyRaw = JSON.stringify({
    transaction_id: frozenRegistry.transaction_id, registry_revision: 1,
    assignment_cast_snapshots: { genesis: {
      created_at: stamp, agents: ['architect', 'builder', 'writer'], universe: 'synthetic',
    } },
    universe_usage_history: [{ universe: 'synthetic', used_at: stamp }],
  });
  writeFileSync(join(root, '.squad/casting/registry.json'), registryRaw);
  writeFileSync(join(root, '.squad/casting/history.json'), historyRaw);
  writeFileSync(join(root, '.squad/casting/registry-history.commit.json'), JSON.stringify({
    transaction_id: frozenRegistry.transaction_id, registry_revision: 1,
    registry_sha256: digest(registryRaw), history_sha256: digest(historyRaw),
  }));
  writeFileSync(join(root, '.squad/team.md'), team);
  const outputPath = join(root, 'request.json');
  writeFileSync(outputPath, JSON.stringify({ items: [{ type: 'activate_plan', plan_comment_id: '10' }] }));
  const bot = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };
  const operator = { id: 700, login: 'operator', type: 'User' };
  const context = {
    repo: { owner: 'owner', repo: 'repo' }, actor: operator.login,
    payload: { action: 'created', sender: operator, issue: { number: 42, user: operator },
      comment: { id: 9, body: `/squad ${command}`, user: operator } },
  };
  const env = { GITHUB_EVENT_NAME: 'issue_comment', GITHUB_RUN_ID: '900', GITHUB_RUN_ATTEMPT: '1',
    SQUAD_WORKFLOW_SHA: 'a'.repeat(40) };
  const comment = (id: number, text: string) => ({
    id, body: text, user: bot, created_at: stamp, updated_at: stamp,
    issue_url: 'https://api.github.com/repos/owner/repo/issues/42',
    html_url: `https://github.com/owner/repo/issues/42#issuecomment-${id}`,
  });
  const comments = new Map([[10, comment(10, `${body}\n${structured(kind)}`)]]);
  const issue = (number: number, fields: Record<string, any> = {}) => ({
    number, id: number + 1000, node_id: `I_${number}`, body: '', labels: [],
    url: `https://api.github.com/repos/owner/repo/issues/${number}`,
    html_url: `https://github.com/owner/repo/issues/${number}`, ...fields,
  });
  const issues = new Map<number, any>([[42, issue(42)]]);
  const parents = new Map<number, number>();
  const rest = {
    repos: { getCollaboratorPermissionLevel: vi.fn(async () => ({ data: { permission: 'admin' } })) },
    issues: {
      get: vi.fn(async ({ issue_number }: any) => ({ data: structuredClone(issues.get(issue_number)) })),
      getComment: vi.fn(async ({ comment_id }: any) => ({ data: structuredClone(comments.get(comment_id)) })),
      listComments: vi.fn(async () => ({ data: structuredClone([...comments.values()]) })),
      getLabel: vi.fn(async () => ({ data: {} })),
      createLabel: vi.fn(async () => ({ data: {} })),
      addSubIssue: vi.fn(async ({ issue_number, sub_issue_id }: any) => {
        const child = [...issues.values()].find(issue => issue.id === sub_issue_id);
        if (!child) throw new Error('Unknown child issue');
        parents.set(child.number, issue_number);
        return { data: {} };
      }),
      getParent: vi.fn(async ({ issue_number }: any) => {
        const parent = parents.get(issue_number);
        if (parent === undefined) throw Object.assign(new Error('Parent unavailable'), { status: 404 });
        return { data: structuredClone(issues.get(parent)) };
      }),
      createComment: vi.fn(async ({ body }: any) => {
        const created = comment(1000 + comments.size, body);
        comments.set(created.id, created);
        return { data: structuredClone(created) };
      }),
      updateComment: vi.fn(async ({ comment_id, body }: any) => {
        comments.get(comment_id)!.body = body;
        return { data: structuredClone(comments.get(comment_id)) };
      }),
    },
  };
  const github = { rest, paginate: vi.fn(async (method: any, params: any) => (await method(params)).data) };
  const createIssue = vi.fn(async (params: any) => {
    const created = issue(100 + issues.size, params);
    issues.set(created.number, structuredClone(created));
    return { staged: false, issue: created };
  });
  const prepare = () => prepareActivation({
    github, context, env, root, outputPath, capturePath: join(root, 'capture.json'),
  });
  const create = (capture: any) => createActivation({
    github, context, env, root, capture, createIssue, captureArtifactId: 800,
    journalPath: join(root, 'receipts.json'), sanitizeContent: (text: string) => text,
    formatIssueBody: (value: string) => value,
  });
  const finalize = (capture: any, journal: any) => finalizeActivation({
    github, context, env, root, capture, journal, receiptArtifactId: 801,
  });
  const artifacts = (kind: string) => [...comments.values()].filter(item =>
    parseStructuredData(item.body)?.squad_artifact === kind);
  return { prepare, create, finalize, artifacts, comments, comment, issues, createIssue, github, context };
}

// ---------------------------------------------------------------------------
// team.md parsing — Name column vs Role column
// ---------------------------------------------------------------------------

/** Cast Names from the `## Members` table's `Name` column. */
function castNames(): string[] {
  const section = team.match(/## Members\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
  return [...section.matchAll(/^\|\s*([A-Za-z0-9@]+)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map(m => m[1])
    .filter(name => name && name !== 'Name' && !/^-+$/.test(name));
}

/** Role strings from the `## Members` table's `Role` column. */
function castRoles(): string[] {
  const section = team.match(/## Members\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
  return [...section.matchAll(/^\|\s*([A-Za-z0-9@]+)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map(m => m[2].trim())
    .filter(role => role && role !== 'Role' && !/^-+$/.test(role));
}

const NAMES = castNames();
const NAMES_LC = new Set(NAMES.map(n => n.toLowerCase()));
const ROLES_LC = new Set(castRoles().map(r => r.toLowerCase()));

/**
 * A plan Owner/Agent cell is a "role-string leak" when it fails to resolve to a
 * cast Name from team.md. This is the exact defect #1759 describes: Role strings
 * (`lead`, `devrel`) reaching an Owner column instead of cast Names.
 */
function isRoleStringLeak(ownerCell: string): boolean {
  const value = ownerCell.trim().toLowerCase();
  if (value === '@copilot') return false; // explicit coding-agent fallback
  return !NAMES_LC.has(value);
}

// ---------------------------------------------------------------------------
// #1759 / #1784 — Owner/Agent columns must resolve to cast Names, and the
// binding sites must not seed the model with the tokens they forbid.
// ---------------------------------------------------------------------------

/**
 * #1784: the binding rules used to enumerate their own counter-examples —
 * `` never a Role string (`Lead`, `DevRel`) `` — and live run E3 showed the model
 * emitting `lead`/`devrel` verbatim, including `devrel` for a roster that has no
 * DevRel role. The concrete token is salient; the negation is not.
 *
 * A backticked code span is the most copyable form a token can take in the
 * prompt, so the binding blocks must contain none that name a Role rather than a
 * Name. Roles come from team.md's `Role` column, so this stays honest as the
 * roster changes; the extra literals are the values E3 actually leaked.
 */
const FORBIDDEN_TOKENS = [
  ...castRoles().map(r => r.toLowerCase()),
  'devrel',
  'reviewer',
];

/** Backticked code spans in `text`, lowercased. */
function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim().toLowerCase());
}

/**
 * Code spans in `text` that name a Role (or a known leaked value), in bare or
 * `squad:`-prefixed form. These are the tokens #1784 proved get copied out.
 */
function leakedRoleTokens(text: string): string[] {
  return codeSpans(text).filter(span => {
    const bare = span.startsWith('squad:') ? span.slice('squad:'.length) : span;
    if (NAMES_LC.has(bare)) return false; // a cast Name is a legitimate value
    return FORBIDDEN_TOKENS.includes(bare);
  });
}

describe('#1759: Owner/Agent bind to the cast Name column', () => {
  it('team.md exposes distinct Name and Role columns to bind against', () => {
    expect(NAMES).toContain('Architect');
    expect(NAMES).toContain('Builder');
    expect(ROLES_LC.has('lead')).toBe(true); // "Lead" is a Role, not a Name
    expect(NAMES_LC.has('lead')).toBe(false); // and it is not a valid Owner
  });

  it('the role-leak detector catches a Role string in an Owner column', () => {
    // A well-formed plan table whose Owner cells are cast Names.
    const goodPlan = [
      '| # | Title | Owner | Size | Depends On |',
      '|---|-------|-------|------|-----------|',
      '| 1 | Wire adapter | Builder | M | - |',
      '| 2 | Prompt refactor | Architect | S | 1 |',
    ].join('\n');

    // A plan table that leaked Role strings into the Owner column.
    const badPlan = [
      '| # | Title | Owner | Size | Depends On |',
      '|---|-------|-------|------|-----------|',
      '| 1 | Wire adapter | lead | M | - |',
      '| 2 | Prompt refactor | devrel | S | 1 |',
    ].join('\n');

    const owners = (table: string) =>
      [...table.matchAll(/^\|\s*\d+\s*\|[^|]*\|\s*([^|]+?)\s*\|/gm)].map(m => m[1]);

    expect(owners(goodPlan).some(isRoleStringLeak)).toBe(false);
    expect(owners(badPlan).every(isRoleStringLeak)).toBe(true);
    // The specific failure mode: "lead" is a Role, while the fixture values are Names.
    expect(isRoleStringLeak('lead')).toBe(true);
    expect(isRoleStringLeak('Architect')).toBe(false);
  });

  it('squad-plan binds the Owner column to a certified team.md Name cell', () => {
    const block = skillBlock(squad, 'squad-plan');
    expect(block).toMatch(/Owner binding gate/i);
    expect(block).toContain('`Name` cell');
    expect(block).toMatch(/every work item `Owner` MUST match one certified name/i);
  });

  it('trusted acceptance mints squad:{owner} from the cast Name, not a role', () => {
    const plan = parseActivationPlan(taskTable(), 'plan', frozenRegistry, team);
    expect(plan.tasks.map((task: any) => [task.agent, task.agent_id, task.label])).toEqual([
      ['Builder', 'builder', 'squad:builder'], ['Architect', 'architect', 'squad:architect'],
    ]);
    expect(() => parseActivationPlan(taskTable().replace('Builder | builder', 'lead | -'),
      'plan', frozenRegistry, team)).toThrow(/unknown non-roster owner/);
  });

  it('squad-plan-implementation binds the Agent column to the cast Name', () => {
    const block = skillBlock(squad, 'squad-plan-implementation');
    expect(block).toMatch(/Agent binding rule/i);
    expect(block).toContain('`Name` column');
    expect(block).toMatch(/appears verbatim in the `Name` column/);
  });
});

describe('#1903: fast-path planning binds certified roster owners end to end', () => {
  const plan = skillBlock(squad, 'squad-plan');

  it('requires every fast-path Owner to be certified before posting', () => {
    const gate = plan.match(/3\. Use the `ROSTER_MEMBER:`[\s\S]*?(?=\n4\.)/)?.[0] ?? '';
    expect(gate, 'squad-plan must contain an explicit certified-roster gate').not.toBe('');
    expect(gate).toMatch(/every work item `Owner` MUST match one certified name/i);
    expect(gate).toMatch(/never synthesize a\s+role, alias, or placeholder/i);
    expect(gate).toMatch(/never use `@copilot` while a certified roster\s+exists/i);

    const finalCheck = plan.match(/Re-check every `Owner`[\s\S]*?(?=\nDo NOT create issues)/)?.[0] ?? '';
    expect(finalCheck).toMatch(/do not post until every row passes/i);
    expect(finalCheck).toMatch(/Copy each row's `Depends On` value unchanged/i);
  });

  it('freezes each accepted row and derives its lowercase member label without remapping', async () => {
    const f = activationFixture();
    const capture = await f.prepare();
    expect(capture.plan.tasks.map((task: any) => [task.id, task.agent, task.dependencies, task.label]))
      .toEqual([['1', 'Builder', [], 'squad:builder'], ['2', 'Architect', ['1'], 'squad:architect']]);
    f.comments.get(10)!.body = f.comments.get(10)!.body.replace('Builder | builder', 'Writer | writer');
    await expect(f.create(capture)).rejects.toThrow(/plan changed after capture/);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('creates only the planned tasks under the origin issue for a flat plan', async () => {
    const f = activationFixture();
    const capture = await f.prepare();
    expect(capture.operations.map((operation: any) => operation.id)).toEqual(['task:1', 'task:2']);
    await f.create(capture);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(f.github.rest.issues.addSubIssue.mock.calls.map(([params]) => params.issue_number)).toEqual([42, 42]);
    expect(f.issues.get(42).labels).toEqual([]);
    for (const [params] of f.createIssue.mock.calls) expect(params.body).toContain('**Parent:** #42');
  });

  it('resolves fast-plan hierarchy only from explicit phase headings', () => {
    expect(plan).toMatch(/single `### Phase 1` heading makes the plan phased/i);
    expect(plan).toMatch(/flat plan MUST use one[\s\S]*no `### Phase \{N\}` headings/i);
    const flat = parseActivationPlan(`This prose describes Phase 1.\n${taskTable()}`, 'plan', frozenRegistry, team);
    expect(flat.phased).toBe(false);
    expect(flat.epics).toEqual([]);
    const phased = parseActivationPlan(`### Phase 1\n${taskTable()}`, 'plan', frozenRegistry, team);
    expect(phased.phased).toBe(true);
    expect(phased.epics).toEqual(['phase-1']);
    expect(phased.tasks.map((task: any) => task.epic)).toEqual(['phase-1', 'phase-1']);
  });

  it('preserves every declared dependency through the trusted body-reference fallback', async () => {
    const f = activationFixture(taskTable([
      '| 3 | Consumer | Writer | writer | 2, 1 |',
      '| 1 | First | Builder | builder | None |',
      '| 2 | Second | Architect | architect | 1 |',
    ]));
    const capture = await f.prepare();
    expect(capture.plan.tasks.map((task: any) => task.id)).toEqual(['1', '2', '3']);
    await f.create(capture);
    expect(f.createIssue.mock.calls.map(([params]) =>
      params.body.match(/^\*\*Depends On:\*\* (.*)$/m)?.[1])).toEqual(['None', '#101', '#102, #101']);
    expect(f.createIssue.mock.calls.map(([params]) => params.labels)).toEqual([
      ['squad', 'squad:builder'], ['squad', 'squad:architect'], ['squad', 'squad:writer'],
    ]);
  });

  it('reports the created hierarchy and dependency mode without overclaiming', async () => {
    const f = activationFixture();
    f.github.rest.issues.addSubIssue.mockRejectedValue(Object.assign(new Error('Unavailable'), { status: 404 }));
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const body = f.artifacts('plan-accepted')[0].body;
    expect(body).toContain('2 task issues have complete actual-ID bindings.');
    expect(body).toContain('no native dependency-edge claim');
    expect(body).toContain('parent body references are the recorded fallback');
    expect(parseStructuredData(body).bindings.map((binding: any) => binding.epic_issue)).toEqual(['#42', '#42']);
  });
});

describe('/squad activate reuses the fast-path acceptance lifecycle', () => {
  const modes = squad.match(/^## Modes\n([\s\S]*?)(?=\n## )/m)?.[1] ?? '';
  const execute = squad.match(/^## Execute Mode\n([\s\S]*?)(?=\n## )/m)?.[1] ?? '';
  const plan = skillBlock(squad, 'squad-plan');
  const accept = skillBlock(squad, 'squad-plan-accept');

  it('declares whole-plan and phase-aware activate commands', () => {
    expect(modes).toContain('| `/squad activate` | Activate (recommended fast-path) |');
    expect(modes).toContain(
      '| `/squad activate phase {N}` | Activate (recommended fast-path) |'
    );
    expect(modes).toContain('| `/squad plan accept` | Plan Accept (legacy alias) |');
    expect(modes).toContain(
      '| `/squad plan accept phase {N}` | Plan Accept (legacy alias) |'
    );
  });

  it('routes activate to the existing squad-plan-accept skill', () => {
    expect(execute).toContain('| `activate` | `squad-plan-accept` |');
    expect(squad.match(/^## skill: `squad-plan-accept`$/gm)).toHaveLength(1);
  });

  it('prefers activate in fast-plan next steps while retaining the legacy alias', () => {
    expect(plan).toMatch(/Next Steps \(`\/squad activate` preferred/);
    expect(plan).toContain('`/squad plan accept` remains a supported legacy alias');
    expect(accept).toContain('`/squad activate [phase N]` and `/squad plan accept [phase N]` use the same');
    expect(accept).toContain('trusted activation writer');
  });

  it('documents the recommended three-step lifecycle and both compatibility paths', () => {
    expect(guide).toContain('### Recommended lifecycle: research → plan → activate');
    expect(guide).toMatch(/\/squad research\n\/squad plan\n\/squad activate/);
    expect(guide).toMatch(
      /`\/squad activate` reviews and accepts the\s+latest fast plan before creating its GitHub issues/
    );
    expect(guide).toContain('`/squad plan accept` remains a backward-compatible alias');
    expect(guide).toContain('### Granular lifecycle');
    expect(guide).toContain('| Activation | `/squad plan activate` |');
    expect(guide).toContain(
      '| Activation | `/squad activate` | **Recommended fast path:** review and accept the latest fast plan, then create its GitHub issues | Requires an existing fast plan from `/squad plan` and write, maintain, or admin permission |'
    );
    expect(guide).toContain(
      '| Activation | `/squad activate phase {N}` | Review, accept, and create issues for only Phase N of the latest fast plan | Requires an existing fast plan from `/squad plan` and write, maintain, or admin permission; incremental and in order |'
    );
  });
});

describe('#1784: binding sites never name the tokens they forbid', () => {
  it('the leak detector recognizes a prohibition that enumerates Role tokens', () => {
    // The pre-fix text from workflows/squad.md:913 — this MUST be flagged, or
    // the assertions below prove nothing.
    const preFix =
      'every `Agent` value MUST be a cast **Name** from the `Name` column of ' +
      '`.squad/team.md`, never a Role string (`Lead`, `DevRel`) or lowercased ' +
      'role (`lead`, `reviewer`).';
    expect(leakedRoleTokens(preFix)).toEqual(
      expect.arrayContaining(['lead', 'devrel', 'reviewer'])
    );

    // The pre-fix label text from workflows/squad.md:730.
    const preFixLabel =
      'never mint a role-derived label such as `squad:lead` or `squad:reviewer`.';
    expect(leakedRoleTokens(preFixLabel)).toEqual(
      expect.arrayContaining(['squad:lead', 'squad:reviewer'])
    );

    // A positive-only rule carries no forbidden token.
    const postFix =
      'Every `Agent` value MUST appear verbatim in the `Name` column of the ' +
      '`## Members` table in `.squad/team.md`, or be `@copilot`.';
    expect(leakedRoleTokens(postFix)).toEqual([]);
  });

  for (const skill of [
    'squad-plan',
    'squad-plan-accept',
    'squad-plan-implementation',
    'squad-plan-validate',
    'squad-plan-activate',
  ]) {
    it(`${skill} states the binding positively, without naming a Role token`, () => {
      expect(leakedRoleTokens(skillBlock(squad, skill))).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// #1784 — /squad plan validate must fail a non-roster Owner/Agent value
// ---------------------------------------------------------------------------

describe('#1784: squad-plan-validate treats the Name column as sole truth', () => {
  const block = skillBlock(squad, 'squad-plan-validate');

  it('declares a roster-binding check in the checks table', () => {
    expect(block).toMatch(/Non-roster owner\/agent/i);
  });

  it('scores a non-roster value as Critical, not a warning', () => {
    const severity = block.match(/^Severity:.*$/m)?.[0] ?? '';
    // Check 10 is the roster check; it must sit on the Critical side.
    expect(severity).toMatch(/Critical[^.]*\b10\b/);
    expect(severity).not.toMatch(/Warning[^.]*\b10\b/);
  });

  it('binds the check to the Name column and forbids attesting validity otherwise', () => {
    const check = block.match(/###### Check 10[\s\S]*?(?=\n##### )/)?.[0] ?? '';
    expect(check).not.toEqual('');
    expect(check).toContain('`Name` column');
    expect(check).toMatch(/Critical/);
    expect(check).toMatch(/Never report a value as a\s+valid roster name unless/);
  });
});

// ---------------------------------------------------------------------------
// #1758.1 — squad-plan-accept must route before it can hard-fail
// ---------------------------------------------------------------------------

describe('#1758.1: squad-plan-accept routes granular plans before failing', () => {
  const implementation = taskTable(['| 1 | Granular task | Builder | builder | None | epic1 |'], true);

  it('recognizes an implementation artifact before refusing its missing prerequisite', async () => {
    const f = activationFixture(implementation, 'activate', 'implementation');
    await expect(f.prepare()).rejects.toThrow(/granular activation requires existing scope-accepted/);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('requires Accept Scope then Accept Implementation before granular activation', async () => {
    const f = activationFixture(implementation, 'plan accept', 'implementation');
    f.comments.set(7, f.comment(7, structured('scope-accepted')));
    await expect(f.prepare()).rejects.toThrow(/granular activation requires existing impl-accepted/);
    expect(f.createIssue).not.toHaveBeenCalled();
    f.comments.set(8, f.comment(8, structured('impl-accepted')));
    const capture = await f.prepare();
    expect(capture.plan.kind).toBe('implementation');
    expect(capture.operations.map((operation: any) => operation.id)).toEqual(['epic:epic1', 'task:1']);
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    expect(f.artifacts('activated')).toHaveLength(1);
  });

  it('fails closed without a supported task plan and never turns a program into invented tasks', async () => {
    for (const kind of ['program', 'research']) {
      const f = activationFixture('No implementation task table exists.', 'activate', kind);
      const original = f.comments.get(10)!.body;
      const failure = await f.prepare().then(() => null, (error: Error) => error);
      expect(failure).toBeInstanceOf(Error);
      if (kind === 'program') {
        expect(failure!.message).toContain('only a program plan exists');
        expect(failure!.message.match(/\/squad plan (?:accept scope|implementation|validate|accept implementation|activate)/g))
          .toEqual([
            '/squad plan accept scope',
            '/squad plan implementation',
            '/squad plan validate',
            '/squad plan accept implementation',
            '/squad plan activate',
          ]);
      } else {
        expect(failure!.message).toContain('latest supported plan comment');
      }
      expect(f.comments.get(10)!.body).toBe(original);
      expect(f.createIssue).not.toHaveBeenCalled();
      expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
      expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
      expect(f.github.rest.issues.createLabel).not.toHaveBeenCalled();
      expect(f.github.rest.issues.addSubIssue).not.toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// #1758.2 — Implement descends to leaf tasks, never dispatches epics
// ---------------------------------------------------------------------------

describe('#1758.2: Implement dispatches leaf tasks, not epics', () => {
  it('Step 1 descends the hierarchy recursively to leaf tasks', () => {
    expect(squad).toMatch(/descending recursively through \*\*every\*\* level/);
    expect(squad).toContain('Identify the **leaf tasks**');
    expect(squad).toContain('Intermediate parents');
    expect(squad).toContain('are never dispatched to a worker');
  });

  it('Epic Dispatch iterates leaf tasks and matches leaf branch names', () => {
    const dispatch = squad.match(/##### Epic Dispatch([\s\S]*?)## skill:/)?.[1] ?? '';
    expect(dispatch).toContain('For each open leaf task');
    expect(dispatch).toContain('squad/implement-{leaf-number}-');
    expect(dispatch).toContain('dispatch_implementation_workers');
    expect(dispatch).toContain('"issue_number": 123');
    expect(dispatch).toContain('"worker": "squad-implement-worker"');
    expect(dispatch).not.toContain('implementation_session_id');
    // The immediate-children language that caused the bug must be gone.
    expect(dispatch).not.toContain('For each open child issue');
  });

  it('preserves the three-slot dispatch cap', () => {
    expect(squad).toMatch(/available-slots = max\(0, 3 - active-implementation-count\)/);
  });
});

// ---------------------------------------------------------------------------
// #1758.3 — validate precedes BOTH accept steps (ontology-consistent order)
// ---------------------------------------------------------------------------

interface OntologyTransition {
  from: string;
  to: string;
  command: string;
}

const REQUIRED_LIFECYCLE_STATES = new Set([
  'idle',
  'researching',
  'triaging',
  'program_planning',
  'implementation_planning',
  'validating',
  'scope_accepted',
  'impl_accepted',
  'activated',
]);

const PLANNING_SOURCE_STATES = new Set([
  'triaging',
  'program_planning',
  'implementation_planning',
  'validating',
  'scope_accepted',
  'impl_accepted',
]);

function ontologyTransitions(markdown: string): OntologyTransition[] {
  const sectionMarker = '## 2. State Transition Table';
  const sectionStart = markdown.indexOf(sectionMarker);
  if (sectionStart === -1) {
    throw new Error('Ontology State Transition Table section is missing');
  }

  const afterMarker = markdown.slice(sectionStart + sectionMarker.length);
  const nextSection = afterMarker.search(/\n## \d+\./);
  const section = nextSection === -1 ? afterMarker : afterMarker.slice(0, nextSection);
  const fences = [...section.matchAll(/^```[^\r\n]*\n([\s\S]*?)^```[ \t]*$/gm)];
  if (fences.length !== 1) {
    throw new Error(
      `Ontology State Transition Table must contain exactly one fenced block; found ${fences.length}`,
    );
  }

  const records = fences[0][1]
    .trim()
    .split(/\n[ \t]*\n/)
    .filter(Boolean);
  if (records.length === 0) {
    throw new Error('Ontology State Transition Table contains no transitions');
  }

  const transitions = records.map((record, index) => {
    const match = record.match(
      /^([a-z][a-z0-9_]*)\s*\u2192\s*([a-z][a-z0-9_]*)\n[ \t]+triggered_by:\s*(\/squad [^\n]+)\n[ \t]+requires:\s*([^\n]+)\n[ \t]+produces:\s*([^\n]+)$/,
    );
    if (!match) {
      throw new Error(`Ontology transition ${index + 1} is malformed:\n${record}`);
    }
    return { from: match[1], to: match[2], command: match[3].trim() };
  });

  for (const [field, values] of [
    ['source state', transitions.map(transition => transition.from)],
    ['destination state', transitions.map(transition => transition.to)],
    ['triggered_by command', transitions.map(transition => transition.command)],
  ] as const) {
    const duplicates = [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
    if (duplicates.length > 0) {
      throw new Error(`Ontology has duplicate ${field}(s): ${duplicates.join(', ')}`);
    }
  }

  const states = new Set(transitions.flatMap(transition => [transition.from, transition.to]));
  const missingStates = [...REQUIRED_LIFECYCLE_STATES].filter(state => !states.has(state));
  if (missingStates.length > 0) {
    throw new Error(`Ontology is missing required state(s): ${missingStates.join(', ')}`);
  }
  if (transitions[0].from !== 'idle') {
    throw new Error(`Ontology transition sequence must start at "idle"; found "${transitions[0].from}"`);
  }
  if (transitions.at(-1)?.to !== 'activated') {
    throw new Error(
      `Ontology transition sequence must end at "activated"; found "${transitions.at(-1)?.to}"`,
    );
  }
  for (let index = 0; index < transitions.length - 1; index += 1) {
    if (transitions[index].to !== transitions[index + 1].from) {
      throw new Error(
        `Ontology transition sequence is disconnected: "${transitions[index].to}" is followed by ` +
          `"${transitions[index + 1].from}"`,
      );
    }
  }

  return transitions;
}

function planningCommandOrder(markdown: string): string[] {
  const transitions = ontologyTransitions(markdown);
  const planningTransitions = transitions.filter(transition =>
    PLANNING_SOURCE_STATES.has(transition.from),
  );
  const missingPlanningSources = [...PLANNING_SOURCE_STATES].filter(
    state => !planningTransitions.some(transition => transition.from === state),
  );
  if (missingPlanningSources.length > 0) {
    throw new Error(
      `Ontology is missing planning transition(s) from: ${missingPlanningSources.join(', ')}`,
    );
  }

  const nonPlanningCommands = planningTransitions.filter(
    transition => !transition.command.startsWith('/squad plan '),
  );
  if (nonPlanningCommands.length > 0) {
    throw new Error(
      `Planning state(s) have non-planning triggered_by commands: ${nonPlanningCommands
        .map(transition => `${transition.from}=${transition.command}`)
        .join(', ')}`,
    );
  }

  const commands = planningTransitions.map(transition => transition.command);
  if (commands.length < 2) {
    throw new Error('Planning transition extraction produced zero next-hint comparisons');
  }
  return commands;
}

function workflowPlanningNextHints(markdown: string, commands: string[]): string[] {
  return commands.slice(0, -1).map(command => {
    const skill = command.slice(1).replaceAll(' ', '-');
    const block = skillBlock(markdown, skill);
    const heading = /^##### Step \d+[a-z]?: Update Lifecycle\s*$/m.exec(block);
    if (!heading) {
      throw new Error(`Update Lifecycle step is missing for "${command}" (${skill})`);
    }

    const afterHeading = block.slice(heading.index + heading[0].length);
    const nextHeading = afterHeading.search(/^##### |^## skill:/m);
    const lifecycle = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
    const hints = [
      ...lifecycle.matchAll(
        /\bnext(?:\s+on\s+pass)?\s*(?:=|:)\s*`(\/squad [^`\r\n]+)`/gi,
      ),
    ].map(match => match[1].trim());
    if (hints.length !== 1) {
      throw new Error(
        `Expected exactly one lifecycle next hint for "${command}" (${skill}); ` +
          `found ${hints.length}: ${JSON.stringify(hints)}`,
      );
    }
    return hints[0];
  });
}

function assertPlanningNextHintsMatch(
  ontologyMarkdown: string,
  workflowMarkdown: string,
): void {
  const commands = planningCommandOrder(ontologyMarkdown);
  const expectedHints = commands.slice(1);
  const actualHints = workflowPlanningNextHints(workflowMarkdown, commands);
  if (expectedHints.length === 0 || actualHints.length === 0) {
    throw new Error('Planning next-hint guard made zero comparisons');
  }

  const mismatches = expectedHints.flatMap((expected, index) =>
    actualHints[index] === expected
      ? []
      : [
          `${commands[index]}: expected next hint "${expected}", ` +
            `actual "${actualHints[index] ?? '<missing>'}"`,
        ],
  );
  if (mismatches.length > 0 || actualHints.length !== expectedHints.length) {
    throw new Error(
      [
        'Planning next-hints do not match ontology triggered_by order.',
        ...mismatches,
        `Expected hints: ${JSON.stringify(expectedHints)}`,
        `Actual hints: ${JSON.stringify(actualHints)}`,
      ].join('\n'),
    );
  }
}

describe('#1758.3: validate precedes both accept steps', () => {
  it('ontology sequences validate before accept scope before accept implementation', () => {
    const order = planningCommandOrder(ontology);
    const idx = (cmd: string) => order.indexOf(cmd);
    expect(idx('/squad plan validate')).toBeGreaterThan(-1);
    expect(idx('/squad plan validate')).toBeLessThan(idx('/squad plan accept scope'));
    expect(idx('/squad plan accept scope')).toBeLessThan(
      idx('/squad plan accept implementation'),
    );
  });

  it('squad.md next-hints reproduce the ontology order', () => {
    expect(() => assertPlanningNextHintsMatch(ontology, squad)).not.toThrow();
  });

  it('accepts an informational language tag on the ontology fence', () => {
    const taggedOntology = ontology.replace(
      '## 2. State Transition Table\n\n```',
      '## 2. State Transition Table\n\n```text',
    );
    expect(() => assertPlanningNextHintsMatch(taggedOntology, squad)).not.toThrow();
  });

  it('documents the Validation Result template with the exact machine-parsed RESULT: PASS|FAIL marker, not a stale heading variant', () => {
    // squad-plan-validate's own output contract (and every downstream consumer parsing it,
    // e.g. squad-review-guard.mjs / the plan-lifecycle harness above) requires the literal
    // uppercase `RESULT: PASS` / `RESULT: FAIL` line. An earlier revision of this template
    // documented a `### Result: ✅ PASS` heading instead -- producer/consumer would silently
    // disagree on the contract text even though the actual emitting code was already correct.
    const section = ontology.slice(
      ontology.indexOf('### 3.6 Validation Result'),
      ontology.indexOf('### 3.7', ontology.indexOf('### 3.6 Validation Result')),
    );
    expect(section).toMatch(/^RESULT: <PASS \| FAIL>$/m);
    expect(section).not.toMatch(/Result: ✅/);
    expect(section).not.toMatch(/^### Result:/m);
  });

  it('fails when ontology transitions reorder while pinned inequalities still hold', () => {
    const reordered = ontology
      .replace('triggered_by: /squad plan program', 'triggered_by: /squad plan __swap__')
      .replace(
        'triggered_by: /squad plan implementation',
        'triggered_by: /squad plan program',
      )
      .replace('triggered_by: /squad plan __swap__', 'triggered_by: /squad plan implementation');
    const order = planningCommandOrder(reordered);
    expect(order.indexOf('/squad plan validate')).toBeLessThan(
      order.indexOf('/squad plan accept scope'),
    );
    expect(order.indexOf('/squad plan accept scope')).toBeLessThan(
      order.indexOf('/squad plan accept implementation'),
    );
    expect(() => assertPlanningNextHintsMatch(reordered, squad)).toThrow(
      /expected next hint "\/squad plan program", actual "\/squad plan validate"/,
    );

    const reorderedWorkflow = squad
      .replace(
        'state = Program Planned, next = `/squad plan implementation`.',
        'state = Program Planned, next = `/squad plan validate`.',
      )
      .replace(
        'state = Implementation planned, next = `/squad plan validate`.',
        'state = Implementation planned, next = `/squad plan program`.',
      );
    expect(() => assertPlanningNextHintsMatch(reordered, reorderedWorkflow)).not.toThrow();
  });

  it.each([
    {
      name: 'an empty transition extraction',
      malformedOntology: ontology.replace(/```\nidle[\s\S]*?```/, '```\n```'),
      expectedError: /contains no transitions/,
    },
    {
      name: 'a malformed transition record',
      malformedOntology: ontology.replace(
        '  produces: squad_artifact=validation',
        '  emits: squad_artifact=validation',
      ),
      expectedError: /transition 5 is malformed/,
    },
    {
      name: 'a duplicate triggered_by command',
      malformedOntology: ontology.replace(
        'triggered_by: /squad plan validate',
        'triggered_by: /squad plan implementation',
      ),
      expectedError: /duplicate triggered_by command.*\/squad plan implementation/,
    },
    {
      name: 'a missing required state',
      malformedOntology: ontology.replaceAll('validating', 'reviewing'),
      expectedError: /missing required state.*validating/,
    },
    {
      name: 'a partial planning sequence',
      malformedOntology: ontology.replace(
        'triggered_by: /squad plan validate',
        'triggered_by: /squad validate',
      ),
      expectedError: /non-planning triggered_by commands.*implementation_planning=\/squad validate/,
    },
  ])('fails closed for $name', ({ malformedOntology, expectedError }) => {
    expect(() => assertPlanningNextHintsMatch(malformedOntology, squad)).toThrow(expectedError);
  });

  it('fails closed when a lifecycle step has ambiguous next hints', () => {
    const ambiguousWorkflow = squad.replace(
      'next = `/squad plan implementation`.',
      'next = `/squad plan implementation`, next = `/squad plan validate`.',
    );
    expect(() => assertPlanningNextHintsMatch(ontology, ambiguousWorkflow)).toThrow(
      /exactly one lifecycle next hint.*found 2/,
    );
  });

  it('validate no longer routes straight to accept implementation', () => {
    const block = skillBlock(squad, 'squad-plan-validate');
    expect(block).not.toMatch(/Next on pass: `\/squad plan accept implementation`/);
  });
});

// ---------------------------------------------------------------------------
// #1757 — validation owns an adversarial gate fed by Fact Checker DA evidence
// ---------------------------------------------------------------------------

describe('#1757: squad-plan-validate has adversarial teeth', () => {
  const validation = skillBlock(squad, 'squad-plan-validate');
  const factChecker = agentBlock(squad, 'fact-checker');
  const adversarialChecks = [
    'Opposition steelman',
    'Load-bearing assumptions',
    '30-day pre-mortem',
    'Alternative approach',
    'Remaining risk acceptance',
  ];

  function numberedChecks(block: string): Map<number, string> {
    return new Map(
      [...block.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|/gm)].map(match => [
        Number(match[1]),
        match[2].trim(),
      ]),
    );
  }

  function hasSubstantiveAdversarialValidation(artifact: string): boolean {
    const requiredSections = [
      'Steelman of the opposition',
      'Load-bearing assumptions',
      '30-day pre-mortem',
      'Alternative approach',
      'Remaining risk acceptance',
      'Validator Synthesis',
    ];

    const sectionsAreSubstantive = requiredSections.every((heading, index) => {
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const next = requiredSections
        .slice(index + 1)
        .map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
      const boundary = next ? `(?=\\n### (?:${next})|$)` : '$';
      const body = artifact.match(new RegExp(`### ${escaped}\\n([\\s\\S]*?)${boundary}`))?.[1] ?? '';
      return /\bWHAT:/i.test(body) && /\bWHY:/i.test(body) && /\bHOW:/i.test(body);
    });
    const checkNumbers = [...artifact.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(match =>
      Number(match[1]),
    );

    return (
      sectionsAreSubstantive &&
      checkNumbers.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16' &&
      /### 30-day pre-mortem[\s\S]*\b30 days?\b/i.test(artifact) &&
      /### Remaining risk acceptance[\s\S]*\bACCEPTED\b[\s\S]*\bowner:/i.test(artifact) &&
      /### Validator Synthesis[\s\S]*\bvalidation decision:/i.test(artifact)
    );
  }

  it('extracts the validation skill with its complete marker and no following skill', () => {
    expect(validation).toMatch(/^## skill: `squad-plan-validate`/);
    expect(validation).not.toContain('## skill: `squad-plan-accept-scope`');
  });

  it('preserves structural checks 1-10 and augments them with five adversarial checks', () => {
    const checks = numberedChecks(validation);
    expect([...checks.keys()].slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([...checks.values()].slice(10, 15)).toEqual(adversarialChecks);
    expect(checks.get(16)).toBe('Validator synthesis');
  });

  it('uses Fact Checker DA output as advisory evidence, never as the verdict owner', () => {
    expect(validation).toMatch(/Use the `fact-checker` sub-agent exactly once/);
    expect(validation).toMatch(/brief is input evidence, not a verdict/i);
    expect(validation).toMatch(/Validation — not Fact Checker —[\s\S]*final verdict/);
    expect(factChecker).not.toMatch(/^RESULT: (?:PASS|FAIL)$/m);
    expect(factChecker).toMatch(/Never emit `RESULT: PASS`, `RESULT: FAIL`/);
  });

  it('uses automatic model resolution instead of the literal inherited model', () => {
    expect(factChecker).toMatch(/^model: auto$/m);
    expect(factChecker).not.toMatch(/^model: inherited$/m);
  });

  it('requires all five DA elements with concrete semantic thresholds', () => {
    for (const section of [
      '##### Steelman of the opposition',
      '##### Load-bearing assumptions',
      '##### 30-day pre-mortem',
      '##### Alternative approach',
      '##### Remaining risk acceptance',
    ]) {
      expect(factChecker, `Fact Checker must emit "${section}"`).toContain(section);
    }
    expect(validation).toMatch(/strongest credible opposition steelman/i);
    expect(validation).toMatch(/falsifiable\s+conditions/);
    expect(validation).toMatch(/exactly 30 days after\s+execution begins/);
    expect(validation).toMatch(/materially different alternative approach\s+sketch/);
    expect(validation).toMatch(/explicitly\s+`ACCEPTED` with rationale and an accountable owner/);
  });

  it('fails closed when adversarial evidence or verdict ownership is missing', () => {
    expect(validation).toMatch(
      /sub-agent is unavailable, errors, returns an empty brief,[\s\S]*force `RESULT: FAIL`/,
    );
    expect(validation).toMatch(/copied verdict,[\s\S]*cannot become `RESULT: PASS`/);
    expect(validation).toMatch(/Structural PASS alone cannot produce overall PASS/);
  });

  it('emits lifecycle next actions in the deterministic writer format', () => {
    expect(validation).toContain('**Next action:** `/squad plan accept scope`');
    expect(validation).toContain('**Next action:** `/squad plan validate`');
    expect(validation).toMatch(/backticked command must\s+be the entire field value/);
    expect(validation).toMatch(/retry\s+context in a separate\s+`\*\*Guidance:\*\*` field/);
  });

  it('distinguishes a neatly formatted bad plan from a genuinely validated plan', () => {
    const validationHeader = [
      '## ✅ Squad Plan Validation — PASSED',
      'RESULT: PASS',
      '| Check | Status | Details |',
      '|---|---|---|',
    ];
    const structurallyValidBadPlan = [
      ...validationHeader,
      ...Array.from({ length: 10 }, (_, index) => `| ${index + 1} | ✅ | — |`),
    ].join('\n');

    const genuinelyValidatedPlan = [
      ...validationHeader,
      ...Array.from({ length: 16 }, (_, index) => `| ${index + 1} | ✅ | evidence |`),
      '### Steelman of the opposition',
      'WHAT: Replace the batch design with streaming. WHY: the latency target makes batching unsafe. HOW: prove the target with a prototype.',
      '### Load-bearing assumptions',
      'WHAT: queue ordering is stable. WHY: reordering breaks reconciliation. HOW: add an ordering probe before implementation.',
      '### 30-day pre-mortem',
      'WHAT: The rollout is reverted in 30 days. WHY: retries amplify duplicate writes. HOW: ship idempotency keys and alerts.',
      '### Alternative approach',
      'WHAT: Use a durable outbox. WHY: it narrows the consistency boundary. HOW: compare operational cost before choosing.',
      '### Remaining risk acceptance',
      'WHAT: delayed delivery. WHY: the queue can lag. HOW: ACCEPTED with bounded SLO; owner: EECOM.',
      '### Validator Synthesis',
      'WHAT: Structural and adversarial evidence align. WHY: the identified failure modes are bounded. HOW: validation decision: proceed.',
    ].join('\n');

    expect(hasSubstantiveAdversarialValidation(structurallyValidBadPlan)).toBe(false);
    expect(hasSubstantiveAdversarialValidation(genuinelyValidatedPlan)).toBe(true);
  });

  it('keeps the sub-agent outside every skill block and uses safe nested headings', () => {
    expect(squad).toContain('## end skill: `squad-plan-activate`\n\n## agent: `fact-checker`');
    expect(factChecker).not.toMatch(/^## (?!agent:)/m);
  });
});

// ---------------------------------------------------------------------------
// #1756 — structural research contract replaces the >=200-char floor
// ---------------------------------------------------------------------------

describe('#1756: research uses a structural contract, not a length floor', () => {
  const block = skillBlock(squad, 'squad-research');

  it('drops the >=200-char length floor entirely', () => {
    expect(block).not.toContain('≥200 chars');
    expect(block).not.toMatch(/\b200\b/);
  });

  it('requires the six structural sections', () => {
    for (const section of [
      'Evidence table',
      'Goals',
      'Non-goals',
      'Load-bearing assumptions',
      'Open decisions',
      'Acceptance framing',
    ]) {
      expect(block, `research contract must require "${section}"`).toContain(section);
    }
  });

  it('requires Rn traceability IDs and one citation token per evidence row', () => {
    expect(block).toMatch(/`Rn` traceability ID/);
    expect(block).toMatch(/exactly one citation token/);
  });

  it('the MANDATORY verify step enumerates the structural checks', () => {
    const verify = block.match(/Step 5: Verify Completion \[MANDATORY\]([\s\S]*)$/)?.[1] ?? '';
    expect(verify).toContain('Evidence table');
    expect(verify).toMatch(/unique `Rn` ID and exactly one citation token/);
    expect(verify).not.toContain('≥200 chars');
  });
});

describe('#1914: research creates the planning lifecycle state', () => {
  const block = skillBlock(squad, 'squad-research');

  it('requires an explicit lifecycle update before completion verification', () => {
    const lifecycle = block.match(
      /Step 4: Update Lifecycle([\s\S]*?)Step 5: Verify Completion/,
    )?.[1] ?? '';

    expect(lifecycle).toContain(
      'Call `upsert_lifecycle_state` once with the complete lifecycle body.',
    );
    expect(lifecycle).toContain('Set Research = `✅ Done`');
    expect(lifecycle).toContain('state = Researched');
    expect(lifecycle).toContain('last command = `/squad research`');
    expect(lifecycle).toContain('next = `/squad triage`');
    expect(lifecycle).toContain('also available = `/squad plan`');
  });

  it('fails completion when the lifecycle artifact is missing or stale', () => {
    const verify = block.match(/Step 5: Verify Completion \[MANDATORY\]([\s\S]*)$/)?.[1] ?? '';

    expect(verify).toContain('The `lifecycle-state` artifact records Research complete');
    expect(verify).toContain('`/squad research`');
    expect(verify).toContain('`/squad triage`');
    expect(verify).toContain('`/squad plan`');
  });
});

describe('#1916: fast-path commands maintain the planning lifecycle state', () => {
  const plan = skillBlock(squad, 'squad-plan');
  const revise = skillBlock(squad, 'squad-plan-revise');
  const lifecycleUpsert =
    'Call `upsert_lifecycle_state` once with the complete lifecycle body.';

  it('updates lifecycle state after creating a fast plan', () => {
    const lifecycle = plan.match(/Step 4: Update Lifecycle([\s\S]*)$/)?.[1] ?? '';

    expect(lifecycle).toContain(lifecycleUpsert);
    expect(lifecycle).toContain('Set Plan = `✅ Done`');
    expect(lifecycle).toContain('state = Planned');
    expect(lifecycle).toContain('last command = `/squad plan`');
    expect(lifecycle).toContain('next =\n`/squad activate`');
    expect(lifecycle).toContain('also available = `/squad plan revise <feedback>`');
  });

  it('preserves planned lifecycle state after revising a fast plan', () => {
    expect(revise).toContain(lifecycleUpsert);
    expect(revise).toContain('Keep Plan = `✅ Done`');
    expect(revise).toContain('state = Planned');
    expect(revise).toContain('last command =\n   `/squad plan revise`');
    expect(revise).toContain('next = `/squad activate`');
  });

  it('records phase progress or terminal activation only after trusted finalization', async () => {
    const body = [
      '### Phase 1', taskTable(['| 1 | First task | Builder | builder | None |']),
      '### Phase 2', taskTable(['| 2 | Next task | Architect | architect | 1 |']),
    ].join('\n');
    for (const command of ['activate phase 1', 'activate']) {
      const f = activationFixture(body, command);
      const capture = await f.prepare();
      const journal = await f.create(capture);
      expect(f.artifacts('lifecycle-state')).toHaveLength(0);
      await f.finalize(capture, journal);
      const lifecycle = f.artifacts('lifecycle-state')[0];
      expect(lifecycle).toBeDefined();
      if (command.endsWith('phase 1')) {
        expect(parseStructuredData(lifecycle.body).phases).toEqual([1]);
        expect(lifecycle.body).toContain('Partially activated');
        expect(lifecycle.body).toContain('/squad activate phase 2');
        expect(f.createIssue).toHaveBeenCalledTimes(2);
      } else {
        expect(lifecycle.body).toContain('Activated');
        expect(lifecycle.body).toContain('no further planning action is required');
        expect(f.createIssue).toHaveBeenCalledTimes(4);
      }
    }
  });

  it('repairs stale lifecycle state on a verified no-create rerun without rewriting acceptance', async () => {
    const f = activationFixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const acceptance = f.artifacts('plan-accepted')[0];
    const original = acceptance.body;
    const lifecycle = f.artifacts('lifecycle-state')[0];
    const expectedLifecycle = lifecycle.body;
    lifecycle.body = `## Squad lifecycle\n**State:** Planned\n${structured('lifecycle-state')}`;
    f.github.rest.issues.createComment.mockClear();
    await expect(f.prepare()).resolves.toEqual({ existingAcceptanceId: acceptance.id });
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(acceptance.body).toBe(original);
    expect(lifecycle.body).toBe(expectedLifecycle);
    expect(f.github.rest.issues.updateComment).toHaveBeenCalledTimes(1);
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    await f.prepare();
    expect(f.github.rest.issues.updateComment).toHaveBeenCalledTimes(1);
  });

  it('refuses a later phase without an explicit current-state mapping bridge, even for independent tasks', async () => {
    const body = [
      '### Phase 1', taskTable(['| 1 | First task | Builder | builder | None |']),
      '### Phase 2', taskTable(['| 2 | Independent task | Architect | architect | None |']),
    ].join('\n');
    const f = activationFixture(body, 'activate phase 2');
    await expect(f.prepare()).rejects.toThrow(/prior-phase mapping bridge/);
    expect(f.createIssue).not.toHaveBeenCalled();
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('never repairs invalid acceptance by rerunning creates or relabeling current issues', async () => {
    const f = activationFixture();
    const capture = await f.prepare();
    const journal = await f.create(capture);
    await f.finalize(capture, journal);
    const acceptance = f.artifacts('plan-accepted')[0];
    const original = acceptance.body;
    f.issues.get(101).labels = ['squad'];
    f.github.rest.issues.createComment.mockClear();
    await expect(f.prepare()).rejects.toThrow(/expected squad:builder/);
    expect(f.createIssue).toHaveBeenCalledTimes(2);
    expect(f.github.rest.issues.createComment).not.toHaveBeenCalled();
    expect(f.github.rest.issues.updateComment).not.toHaveBeenCalled();
    expect(acceptance.body).toBe(original);
  });
});

describe('#1922: fast-path planning proves research absence with pagination', () => {
  const plan = skillBlock(squad, 'squad-plan');
  const gatherContext =
    plan.match(/Step 1: Gather Context([\s\S]*?)Step 2: Decompose/)?.[1] ?? '';

  it('requires a complete structured-data scan before falling back', () => {
    expect(gatherContext).toContain('Paginate **all** issue comments');
    expect(gatherContext).toContain('`gh api --paginate`');
    expect(gatherContext).toContain('`squad_artifact = research`');
    expect(gatherContext).toContain('`origin_issue = {issue_number}`');
    expect(gatherContext).toContain('newest matching comment by\n     `created_at`');
    expect(gatherContext).toContain(
      'Only when the completed scan has no match may you use lightweight',
    );
  });

  it('forbids truncated comment discovery and fails closed on retrieval errors', () => {
    expect(gatherContext).toMatch(/Do not use\s+`gh issue view --json comments`/);
    expect(gatherContext).toMatch(/truncate comment output with `head` or\s+`tail`/);
    expect(gatherContext).toContain('call `report_incomplete` and\n     stop');
  });
});

describe('#1924: planning comments contain one gh-aw structured-data envelope', () => {
  const plan = skillBlock(squad, 'squad-plan');
  const contract =
    squad.match(
      /## Planning Artifact Data Contract \(all modes\)([\s\S]*?)# Squad — `\/squad` Slash Command/,
    )?.[1] ?? '';
  const postPlan = plan.match(/Step 3: Post Plan([\s\S]*?)Step 4: Update Lifecycle/)?.[1] ?? '';

  it('requires every planning mode to pass metadata only through data', () => {
    expect(contract).toMatch(/only through the safe-output\s+tool's `data` argument/);
    expect(contract).toContain('Never include a `Structured data:` heading');
    expect(contract).toContain('gh-aw appends exactly one validated block');
  });

  it('repeats the no-embedded-metadata rule at the fast-plan call site', () => {
    expect(postPlan).toContain('The `body` MUST NOT contain a `Structured data:` block');
    expect(postPlan).toMatch(/pass\s+the envelope only through `data`/);
    expect(postPlan).toContain('gh-aw appends it exactly once');
  });
});

// ---------------------------------------------------------------------------
// #1772 (defense-in-depth) — empty workflow_dispatch probe is guarded, not
// turned into a junk issue. Pairs with EECOM's dispatch-workflow max fix
// (PR #1777).
// ---------------------------------------------------------------------------

describe('#1772: empty workflow_dispatch probe halts without junk issues', () => {
  const guard =
    squad.match(/### Workflow-dispatch activation guard[\s\S]*?(?=\nResolve the slash command)/)?.[0] ??
    '';

  it('declares a MANDATORY activation guard that runs before any skill', () => {
    expect(guard, 'activation guard section must exist').not.toBe('');
    expect(guard).toMatch(/\[MANDATORY — run before any skill\]/);
  });

  it('halts an empty-command probe with a log annotation and no side effects', () => {
    expect(guard).toMatch(/Dispatched command\*\*\s+above is empty or missing/);
    expect(guard).toContain('::warning::');
    // The empty probe must STOP without creating an issue, comment, or skill entry.
    expect(guard).toMatch(/Do NOT create an issue, do NOT post a comment, do NOT/);
  });

  it('no longer instructs creating a junk "missing command/issue_number" issue', () => {
    // The old junk-issue generators (fixture #12/#14 root cause) must be gone.
    expect(squad).not.toContain('Squad workflow dispatch missing command');
    expect(squad).not.toContain('Squad workflow dispatch missing issue_number');
  });

  it('references EECOM PR #1777 so the paired fixes are traceable', () => {
    expect(guard).toContain('PR #1777');
  });
});
