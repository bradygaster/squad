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

function lifecycleScript(): string {
  const lines = sharedWorkflow.split(/\r?\n/);
  const step = lines.findIndex((line) => line.includes('- name: Upsert Squad lifecycle state'));
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

describe('#1916: deterministic lifecycle safe output', () => {
  const body = '## Planning Lifecycle\n\n**Current state:** Planned';
  const legacyBody = '## 🧭 Squad Lifecycle State\n\n- **State:** Planned';

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

  it('rejects malformed or duplicate lifecycle output', async () => {
    const malformed = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body: 'not a lifecycle body' },
    ]);
    const duplicate = await runLifecycleUpsert([
      { type: 'upsert_lifecycle_state', body },
      { type: 'upsert_lifecycle_state', body },
    ]);

    expect(malformed.failures).toEqual([
      'Lifecycle body must begin with a recognized Squad lifecycle heading.',
    ]);
    expect(duplicate.failures).toEqual(['Expected exactly one lifecycle update, found 2.']);
  });
});
