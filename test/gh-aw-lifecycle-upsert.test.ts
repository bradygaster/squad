import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileFunction, constants as vmConstants } from 'node:vm';

const sharedWorkflow = readFileSync('workflows/shared/squad.md', 'utf8');
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function scriptForStep(stepName: string): string {
  const lines = sharedWorkflow.split(/\r?\n/);
  const step = lines.findIndex((line) => line.includes(`- name: ${stepName}`));
  expect(step).toBeGreaterThan(-1);
  const start = lines.findIndex((line, index) => index > step && /^\s+script:\s*\|$/.test(line));
  expect(start).toBeGreaterThan(step);
  const indent = lines[start].match(/^\s*/)![0].length;
  const script: string[] = [];

  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() && line.match(/^\s*/)![0].length <= indent) break;
    script.push(line.trim() ? line.slice(indent + 2) : '');
  }
  return script.join('\n');
}

function lifecycleScript(): string {
  return scriptForStep('Upsert Squad lifecycle state');
}

function lifecycleRepairScript(): string {
  return scriptForStep('Repair terminal lifecycle after idempotent activation');
}

interface Comment {
  id: number;
  body: string;
  created_at: string;
  user: { login: string };
}

async function runLifecycleUpsert(items: unknown[], comments: Comment[] = []) {
  const directory = mkdtempSync(join(tmpdir(), 'squad-lifecycle-'));
  tempDirectories.push(directory);
  const outputPath = join(directory, 'agent-output.json');
  writeFileSync(outputPath, JSON.stringify({ items }));

  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const failures: string[] = [];
  const github = {
    paginate: async () => comments,
    rest: {
      issues: {
        listComments: () => undefined,
        createComment: async (params: Record<string, unknown>) => created.push(params),
        updateComment: async (params: Record<string, unknown>) => updated.push(params),
      },
    },
  };
  const context = { repo: { owner: 'octodemo', repo: 'consumer' } };
  const previousOutput = process.env.GH_AW_AGENT_OUTPUT;
  const previousIssue = process.env.ISSUE_NUMBER;
  process.env.GH_AW_AGENT_OUTPUT = outputPath;
  process.env.ISSUE_NUMBER = '5';

  try {
    const compiled = compileFunction(
      `return (async () => {\n${lifecycleScript()}\n})();`,
      ['github', 'context', 'core'],
      { importModuleDynamically: vmConstants.USE_MAIN_CONTEXT_DEFAULT_LOADER },
    ) as (...args: unknown[]) => Promise<unknown>;
    await compiled(github, context, { setFailed: (message: string) => failures.push(message) });
  } finally {
    if (previousOutput === undefined) delete process.env.GH_AW_AGENT_OUTPUT;
    else process.env.GH_AW_AGENT_OUTPUT = previousOutput;
    if (previousIssue === undefined) delete process.env.ISSUE_NUMBER;
    else process.env.ISSUE_NUMBER = previousIssue;
  }

  return { created, updated, failures };
}

async function runLifecycleRepair(
  comments: Comment[],
  command = '/squad activate',
) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const failures: string[] = [];
  const info: string[] = [];
  const github = {
    paginate: async () => comments,
    rest: {
      issues: {
        listComments: () => undefined,
        createComment: async (params: Record<string, unknown>) => created.push(params),
        updateComment: async (params: Record<string, unknown>) => updated.push(params),
      },
    },
  };
  const context = { repo: { owner: 'octodemo', repo: 'consumer' } };
  const previousIssue = process.env.ISSUE_NUMBER;
  const previousCommand = process.env.SQUAD_COMMAND;
  process.env.ISSUE_NUMBER = '5';
  process.env.SQUAD_COMMAND = command;

  try {
    const compiled = compileFunction(
      `return (async () => {\n${lifecycleRepairScript()}\n})();`,
      ['github', 'context', 'core'],
    ) as (...args: unknown[]) => Promise<unknown>;
    await compiled(github, context, {
      info: (message: string) => info.push(message),
      setFailed: (message: string) => failures.push(message),
    });
  } finally {
    if (previousIssue === undefined) delete process.env.ISSUE_NUMBER;
    else process.env.ISSUE_NUMBER = previousIssue;
    if (previousCommand === undefined) delete process.env.SQUAD_COMMAND;
    else process.env.SQUAD_COMMAND = previousCommand;
  }

  return { created, updated, failures, info };
}

describe('#1916: deterministic lifecycle safe output', () => {
  const body = [
    '## Planning Lifecycle',
    '',
    '**Current state:** Planned',
    '**Last command:** `/squad plan`',
    '**Next action:** `/squad activate`',
  ].join('\n');
  const legacyBody = [
    '## 🧭 Squad Lifecycle State',
    '',
    '- **State:** Planned',
    '- **Last command:** `/squad plan`',
    '- **Next command:** `/squad activate`',
  ].join('\n');
  const issueHeadingBody = [
    '## 🔄 Squad Lifecycle State — Issue #5',
    '',
    '| Stage | Status |',
    '| --- | --- |',
    '| Research | Done |',
    '| Plan | Done |',
    '',
    '**Current state:** Planned',
    '**Last command:** `/squad plan`',
    '**Next recommended:** `/squad activate`',
  ].join('\n');
  const terminalBody = [
    '## 🧭 Squad Lifecycle State',
    '',
    '- **State:** Activated',
    '- **Research:** ✅ Done',
    '- **Plan:** ✅ Done',
    '- **Activation:** ✅ Done',
    '- **Last command:** `/squad activate`',
    '- **Next action:** Track progress on the 5 created task issues; no further planning action required.',
  ].join('\n');

  it('creates the first tracker with the fixed structured envelope', async () => {
    const result = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body },
    ]);

    expect(result.failures).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].issue_number).toBe(5);
    expect(result.created[0].body).toContain(body);
    expect(result.created[0].body).toContain(
      '{"squad_artifact":"lifecycle-state","schema_version":"1","origin_issue":5,"phases":[]}',
    );
  });

  it('updates the newest trusted tracker in place', async () => {
    const marker = '{"squad_artifact":"lifecycle-state"}';
    const result = await runLifecycleUpsert(
      [{ type: 'upsert_lifecycle_state', body: legacyBody }],
      [
        {
          id: 10,
          body: marker,
          created_at: '2026-08-27T23:00:00Z',
          user: { login: 'github-actions[bot]' },
        },
        {
          id: 20,
          body: marker,
          created_at: '2026-08-28T00:00:00Z',
          user: { login: 'github-actions[bot]' },
        },
        {
          id: 30,
          body: marker,
          created_at: '2026-08-28T01:00:00Z',
          user: { login: 'untrusted-user' },
        },
      ],
    );

    expect(result.failures).toEqual([]);
    expect(result.created).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].comment_id).toBe(20);
    expect(result.updated[0].body).toContain(legacyBody);
  });

  it('replaces agent-supplied trailing metadata with the trusted envelope', async () => {
    const result = await runLifecycleUpsert([
      {
        type: 'upsert_lifecycle_state',
        body: `${legacyBody}\n\nStructured data:\n\`\`\`json\n{"squad_artifact":"lifecycle-state","origin_issue":999}\n\`\`\``,
      },
    ]);

    expect(result.failures).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].body).toContain(legacyBody);
    expect((result.created[0].body as string).match(/Structured data:/g)).toHaveLength(1);
    expect(result.created[0].body).toContain(
      '{"squad_artifact":"lifecycle-state","schema_version":"1","origin_issue":5,"phases":[]}',
    );
    expect(result.created[0].body).not.toContain('"origin_issue":999');
  });

  it('replaces an unlabeled trailing lifecycle envelope with the trusted envelope', async () => {
    const result = await runLifecycleUpsert([
      {
        type: 'upsert_lifecycle_state',
        body: `${legacyBody}\n\n\`\`\`json\n{"squad_artifact":"lifecycle-state","origin_issue":999}\n\`\`\``,
      },
    ]);

    expect(result.failures).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].body).toContain(legacyBody);
    expect((result.created[0].body as string).match(/Structured data:/g)).toHaveLength(1);
    expect(result.created[0].body).toContain(
      '{"squad_artifact":"lifecycle-state","schema_version":"1","origin_issue":5,"phases":[]}',
    );
    expect(result.created[0].body).not.toContain('"origin_issue":999');
  });

  it('rejects lifecycle metadata that is not the trailing JSON fence', async () => {
    const result = await runLifecycleUpsert([
      {
        type: 'upsert_lifecycle_state',
        body: `${legacyBody}\n\n\`\`\`json\n{"squad_artifact":"lifecycle-state","origin_issue":999}\n\`\`\`\n\nUnexpected trailing text.`,
      },
    ]);

    expect(result.failures).toEqual(['Lifecycle body must omit structured data.']);
    expect(result.created).toEqual([]);
  });

  it('accepts issue-specific lifecycle presentation headings', async () => {
    const result = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body: issueHeadingBody },
    ]);

    expect(result.failures).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].body).toContain(issueHeadingBody);
  });

  it('accepts non-command guidance for the terminal Activated state', async () => {
    const result = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body: terminalBody },
    ]);

    expect(result.failures).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0].body).toContain(terminalBody);
  });

  it('rejects non-command next actions for nonterminal states', async () => {
    const result = await runLifecycleUpsert([
      {
        type: 'upsert_lifecycle_state',
        body: body.replace(
          '**Next action:** `/squad activate`',
          '**Next action:** Wait for more information.',
        ),
      },
    ]);

    expect(result.failures).toEqual([
      'Lifecycle body must include an H2 lifecycle heading plus state, last-command, and next-action fields.',
    ]);
    expect(result.created).toEqual([]);
  });

  it.each([
    ['state', body.replace('**Current state:** Planned\n', '')],
    ['last command', body.replace('**Last command:** `/squad plan`\n', '')],
    ['next action', body.replace('**Next action:** `/squad activate`', '')],
  ])('rejects lifecycle output missing its %s field', async (_field, incompleteBody) => {
    const result = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body: incompleteBody },
    ]);

    expect(result.failures).toEqual([
      'Lifecycle body must include an H2 lifecycle heading plus state, last-command, and next-action fields.',
    ]);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
  });

  it('rejects malformed or duplicate lifecycle output', async () => {
    const malformed = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body: 'not a lifecycle body' },
    ]);
    const duplicate = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body },
      { type: 'upsert_lifecycle_state', body },
    ]);

    expect(malformed.failures).toEqual([
      'Lifecycle body must include an H2 lifecycle heading plus state, last-command, and next-action fields.',
    ]);
    expect(duplicate.failures).toEqual(['Expected exactly one lifecycle update, found 2.']);
  });
});

describe('#1928: deterministic terminal lifecycle repair', () => {
  const accepted = {
    id: 10,
    body: [
      '## Plan accepted',
      '',
      'Structured data:',
      '```json',
      '{"squad_artifact":"plan-accepted","schema_version":"1","origin_issue":5,"phases":[]}',
      '```',
    ].join('\n'),
    created_at: '2026-08-28T01:00:00Z',
    user: { login: 'github-actions[bot]' },
  };
  const lifecycleEnvelope =
    '{"squad_artifact":"lifecycle-state","schema_version":"1","origin_issue":5,"phases":[]}';
  const stale = {
    id: 20,
    body: [
      '## 🧭 Squad Lifecycle State',
      '',
      '**State:** Planned',
      '**Last command:** `/squad plan`',
      '**Next action:** `/squad activate`',
      '',
      'Structured data:',
      '```json',
      lifecycleEnvelope,
      '```',
    ].join('\n'),
    created_at: '2026-08-28T02:00:00Z',
    user: { login: 'github-actions[bot]' },
  };

  it('repairs the newest stale tracker after whole-plan acceptance', async () => {
    const result = await runLifecycleRepair([accepted, stale]);

    expect(result.failures).toEqual([]);
    expect(result.created).toEqual([]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].comment_id).toBe(20);
    expect(result.updated[0].body).toContain('- **State:** Activated');
    expect(result.updated[0].body).toContain('- **Activation:** ✅ Done');
    expect(result.updated[0].body).toContain('- **Last command:** `/squad activate`');
    expect(result.updated[0].body).toContain(lifecycleEnvelope);
  });

  it('does nothing when the newest tracker is already terminal', async () => {
    const terminal = {
      ...stale,
      body: stale.body
        .replace('**State:** Planned', '**State:** Activated\n**Activation:** ✅ Done')
        .replace('**Last command:** `/squad plan`', '**Last command:** `/squad activate`'),
    };
    const result = await runLifecycleRepair([accepted, terminal]);

    expect(result.failures).toEqual([]);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.info).toContain(
      'The newest lifecycle tracker already records terminal activation.',
    );
  });

  it('does not trust a user-authored acceptance artifact', async () => {
    const result = await runLifecycleRepair([
      { ...accepted, user: { login: 'untrusted-user' } },
      stale,
    ]);

    expect(result.failures).toEqual([]);
    expect(result.created).toEqual([]);
    expect(result.updated).toEqual([]);
    expect(result.info).toContain(
      'No trusted whole-plan acceptance artifact; lifecycle repair is not applicable.',
    );
  });
});
