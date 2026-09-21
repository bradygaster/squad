import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  PROVENANCE_LABEL,
  PROVENANCE_SCHEMA,
  RECORD_TYPE,
  emitImplementationProvenanceComment,
  evaluateImplementationProvenanceItems,
  extractImplementationProvenance,
  implementationDispatchReceipt,
  implementationSessionId,
  validateImplementationProvenance,
  validateWorkerIdentity,
  verifyReplacementEvidence,
} from '../workflows/shared/squad-implementation-provenance.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaces: string[] = [];
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');
const readJson = (path: string): Record<string, any> => JSON.parse(read(path));

function scratch(): string {
  const path = mkdtempSync(resolve(ROOT, '.implementation-provenance-'));
  workspaces.push(path);
  return path;
}

afterAll(() => {
  for (const path of workspaces) rmSync(path, { recursive: true, force: true });
});

function bodyFor(payload: Record<string, unknown>): string {
  return `${PROVENANCE_LABEL}\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

function env(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    GITHUB_REPOSITORY: 'octo/example',
    GITHUB_REPOSITORY_ID: '12345',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_ACTOR: 'github-actions[bot]',
    GITHUB_RUN_ID: '70001',
    GITHUB_RUN_ATTEMPT: '1',
    SQUAD_IMPLEMENT_WORKER: 'squad-implement-worker',
    SQUAD_IMPLEMENT_ISSUE_NUMBER: '42',
    SQUAD_IMPLEMENT_SESSION_ID: 'squad-implementation-session/v1/12345/67890',
    SQUAD_IMPLEMENT_DISPATCHER_WORKFLOW: '.github/workflows/squad.lock.yml',
    SQUAD_IMPLEMENT_DISPATCHER_RUN_ID: '67890',
    SQUAD_IMPLEMENT_DISPATCHER_RUN_ATTEMPT: '1',
    SQUAD_IMPLEMENT_WORKFLOW: '.github/workflows/squad-implement-worker.lock.yml',
    SQUAD_IMPLEMENT_NAMESPACE: 'implement',
    SQUAD_IMPLEMENT_REQUIRE_LEGACY_MARKER: 'true',
    ...overrides,
  };
}

function receiptComment() {
  return {
    user: { login: 'github-actions[bot]', type: 'Bot' },
    body: implementationDispatchReceipt({
      repository: 'octo/example',
      issueNumber: 42,
      worker: 'squad-implement-worker',
      sessionId: 'squad-implementation-session/v1/12345/67890',
      workflow: '.github/workflows/squad.lock.yml',
      runId: 67890,
      runAttempt: 1,
    }),
  };
}

function identityFetch(route: string) {
  if (route.endsWith('/actions/runs/67890')) {
    return {
      id: 67890,
      run_attempt: 1,
      path: '.github/workflows/squad.lock.yml@refs/heads/dev',
      repository: { full_name: 'octo/example' },
    };
  }
  if (route.endsWith('/issues/42/comments')) return [receiptComment()];
  throw new Error(`Unexpected route ${route}`);
}

function pullItem(body = [
  'Closes #42',
  '',
  '<!-- squad:implement issue=42 run=70001 -->',
].join('\n')) {
  return {
    type: 'create_pull_request',
    temporary_id: 'aw_impl42',
    branch: 'squad/implement-42-example',
    body,
  };
}

function recordItem(overrides: Record<string, unknown> = {}) {
  return {
    type: RECORD_TYPE,
    pull_request: 'aw_impl42',
    goals_json: JSON.stringify([{
      repository: 'octo/example',
      issue: 42,
      relationship: 'closes',
    }]),
    replaces_json: '[]',
    ...overrides,
  };
}

describe('Squad implementation provenance v1', () => {
  const fixture = readJson('test-fixtures/implementation-provenance/valid-v1.json');
  const multiGoal = readJson(
    'test-fixtures/implementation-provenance/multi-goal-replacement-v1.json',
  );
  const schema = readJson('workflows/shared/implementation-provenance-v1.schema.json');
  const implementWorker = read('workflows/squad-implement-worker.md');
  const dependencyWorker = read('workflows/squad-deps-worker.md');
  const dispatcher = read('workflows/squad.md');

  it('publishes only actual PR numbers and rejects unresolved sentinels', () => {
    expect(schema.$id).toBe(PROVENANCE_SCHEMA);
    expect(schema.properties.pull_request.properties.number).toEqual({
      type: 'integer',
      minimum: 1,
    });
    expect(validateImplementationProvenance(fixture)).toEqual([]);
    expect(validateImplementationProvenance(multiGoal)).toEqual([]);

    const unresolved = structuredClone(fixture);
    unresolved.pull_request.number = 'self';
    expect(validateImplementationProvenance(unresolved)).toEqual(expect.arrayContaining([
      { kind: 'implementation-provenance-unresolved-sentinel' },
      { kind: 'implementation-provenance-pull-request-invalid' },
    ]));
  });

  it('rejects unknown and nested malformed fields, duplicates, and partial payloads', () => {
    expect(validateImplementationProvenance({ ...fixture, unknown: true })).toEqual([
      { kind: 'implementation-provenance-shape-invalid' },
    ]);
    const nested = structuredClone(fixture);
    nested.workflow_run.unknown = true;
    expect(validateImplementationProvenance(nested)).toContainEqual({
      kind: 'implementation-provenance-workflow-run-invalid',
    });
    const partial = structuredClone(fixture);
    delete partial.session_origin;
    expect(validateImplementationProvenance(partial)).toEqual([
      { kind: 'implementation-provenance-shape-invalid' },
    ]);
    const duplicate = structuredClone(fixture);
    duplicate.replaces = [
      { repository: 'octo/example', number: 99 },
      { repository: 'octo/example', number: 99 },
    ];
    expect(validateImplementationProvenance(duplicate)).toContainEqual({
      kind: 'implementation-provenance-replacements-duplicate',
    });
    expect(extractImplementationProvenance(
      `${bodyFor(fixture)}\n\n${bodyFor(fixture)}`,
    )).toBeUndefined();
  });

  it('requires one strict post-create record for every PR before creation', () => {
    const valid = evaluateImplementationProvenanceItems({
      items: [pullItem(), recordItem()],
      repository: 'octo/example',
      issueNumber: 42,
      namespace: 'implement',
      runId: 70001,
      requireLegacyMarker: true,
    });
    expect(valid).toMatchObject({ ok: true, enforced: true, violations: [] });

    expect(evaluateImplementationProvenanceItems({
      items: [pullItem()],
      repository: 'octo/example',
      issueNumber: 42,
      namespace: 'implement',
      runId: 70001,
      requireLegacyMarker: true,
    }).ok).toBe(false);
    expect(evaluateImplementationProvenanceItems({
      items: [pullItem(), recordItem({ nested: true })],
      repository: 'octo/example',
      issueNumber: 42,
      namespace: 'implement',
      runId: 70001,
      requireLegacyMarker: true,
    }).violations).toContainEqual({
      kind: 'implementation-provenance-record-invalid',
    });
    expect(evaluateImplementationProvenanceItems({
      items: [recordItem(), pullItem()],
      repository: 'octo/example',
      issueNumber: 42,
      namespace: 'implement',
      runId: 70001,
      requireLegacyMarker: true,
    }).violations).toContainEqual({
      kind: 'implementation-provenance-record-order-invalid',
    });
    expect(evaluateImplementationProvenanceItems({
      items: [pullItem(`${bodyFor(fixture)}\n<!-- squad:implement issue=42 run=70001 -->`), recordItem()],
      repository: 'octo/example',
      issueNumber: 42,
      namespace: 'implement',
      runId: 70001,
      requireLegacyMarker: true,
    }).violations).toContainEqual({
      kind: 'implementation-provenance-premature-durable-evidence',
    });
  });

  it('binds identity to the bot dispatcher run and exact durable receipt', async () => {
    expect(implementationSessionId('12345', '67890')).toBe(
      'squad-implementation-session/v1/12345/67890',
    );
    await expect(validateWorkerIdentity(env(), {
      fetchJson: async route => identityFetch(route),
    })).resolves.toMatchObject({
      ok: true,
      repository: 'octo/example',
      issueNumber: 42,
      dispatcherRunId: 67890,
    });

    await expect(validateWorkerIdentity(env({ GITHUB_ACTOR: 'octocat' }), {
      fetchJson: async route => identityFetch(route),
    })).resolves.toMatchObject({
      ok: false,
      violations: [{ kind: 'implementation-provenance-dispatch-identity-invalid' }],
    });
    await expect(validateWorkerIdentity(env({
      SQUAD_IMPLEMENT_SESSION_ID: 'squad-implementation-session/v1/12345/99999',
    }), {
      fetchJson: async route => identityFetch(route),
    })).resolves.toMatchObject({ ok: false });
    await expect(validateWorkerIdentity(env(), {
      fetchJson: async route => route.endsWith('/comments') ? [] : identityFetch(route),
    })).resolves.toMatchObject({
      ok: false,
      violations: [{ kind: 'implementation-provenance-dispatch-receipt-unproven' }],
    });
  });

  it('accepts merge continuation evidence only from the trusted bot boundary', async () => {
    const continuationEnv = env({
      GITHUB_EVENT_NAME: 'pull_request',
      SQUAD_IMPLEMENT_PULL_MERGED: 'true',
      SQUAD_IMPLEMENT_PULL_BASE_REF: 'dev',
      SQUAD_IMPLEMENT_DEFAULT_BRANCH: 'dev',
      SQUAD_IMPLEMENT_PULL_NUMBER: '101',
      SQUAD_IMPLEMENT_PULL_HEAD_REF: 'squad/implement-42-example',
    });
    await expect(validateWorkerIdentity(continuationEnv, {
      fetchJson: async () => [{ user: { login: 'octocat' }, body: bodyFor(fixture) }],
    })).resolves.toMatchObject({
      ok: false,
      violations: [{ kind: 'implementation-provenance-continuation-evidence-invalid' }],
    });
    await expect(validateWorkerIdentity(continuationEnv, {
      fetchJson: async () => [{
        user: { login: 'github-actions[bot]' },
        body: bodyFor(fixture),
      }],
    })).resolves.toMatchObject({
      ok: true,
      origin: 'merge-continuation',
      issueNumber: 42,
      sessionId: 'squad-implementation-session/v1/12345/67890',
    });
  });

  it('fails malformed, missing, duplicate, and unrelated replacements closed', async () => {
    const replacement = {
      ...fixture,
      pull_request: {
        repository: 'octo/example',
        number: 101,
        head_ref: 'squad/implement-42-example',
      },
    };
    const fetchJson = async (route: string) => {
      if (route.endsWith('/pulls/101')) {
        return {
          number: 101,
          base: { repo: { full_name: 'octo/example' } },
          head: { ref: 'squad/implement-42-example' },
        };
      }
      if (route.endsWith('/issues/101/comments')) {
        return [{ user: { login: 'github-actions[bot]' }, body: bodyFor(replacement) }];
      }
      throw new Error(`not found: ${route}`);
    };
    await expect(verifyReplacementEvidence({
      replacements: [{ repository: 'octo/example', number: 101 }],
      repository: 'octo/example',
      originIssue: 42,
      sessionId: 'squad-implementation-session/v1/12345/67890',
      fetchJson,
    })).resolves.toEqual([]);
    await expect(verifyReplacementEvidence({
      replacements: [{ repository: 'octo/example', number: 101 }],
      repository: 'octo/example',
      originIssue: 42,
      sessionId: 'squad-implementation-session/v1/12345/67890',
      fetchJson: async route => route.endsWith('/comments')
        ? [{ user: { login: 'octocat' }, body: bodyFor(replacement) }]
        : fetchJson(route),
    })).resolves.toContainEqual({
      kind: 'implementation-provenance-replacement-unrelated',
      number: 101,
    });
    await expect(verifyReplacementEvidence({
      replacements: [
        { repository: 'octo/example', number: 101 },
        { repository: 'octo/example', number: 101 },
      ],
      repository: 'octo/example',
      originIssue: 42,
      sessionId: 'squad-implementation-session/v1/12345/67890',
      fetchJson,
    })).resolves.toContainEqual({
      kind: 'implementation-provenance-replacements-duplicate',
    });
    await expect(verifyReplacementEvidence({
      replacements: [{ repository: 'octo/example', number: 404 }],
      repository: 'octo/example',
      originIssue: 42,
      sessionId: 'squad-implementation-session/v1/12345/67890',
      fetchJson,
    })).resolves.toContainEqual({
      kind: 'implementation-provenance-replacement-not-found',
      number: 404,
    });
    const unrelated = structuredClone(replacement);
    unrelated.implementation_session_id = 'squad-implementation-session/v1/12345/99999';
    await expect(verifyReplacementEvidence({
      replacements: [{ repository: 'octo/example', number: 101 }],
      repository: 'octo/example',
      originIssue: 42,
      sessionId: 'squad-implementation-session/v1/12345/67890',
      fetchJson: async route => route.endsWith('/comments')
        ? [{ user: { login: 'github-actions[bot]' }, body: bodyFor(unrelated) }]
        : fetchJson(route),
    })).resolves.toContainEqual({
      kind: 'implementation-provenance-replacement-unrelated',
      number: 101,
    });
  });

  it('emits the actual PR number only from the post-create handler', async () => {
    const comments: string[] = [];
    const fetchJson = async (route: string) => {
      if (route.endsWith('/pulls/202')) {
        return {
          number: 202,
          body: pullItem().body,
          base: { repo: { full_name: 'octo/example' } },
          head: { ref: 'squad/implement-42-example' },
        };
      }
      return identityFetch(route);
    };
    await emitImplementationProvenanceComment({
      item: recordItem(),
      resolvedTemporaryIds: {
        aw_impl42: { repo: 'octo/example', number: 202 },
      },
      env: env(),
      fetchJson,
      createComment: async (_repository, number, body) => {
        expect(number).toBe(202);
        comments.push(body);
      },
    });
    const payload = extractImplementationProvenance(comments[0]);
    expect(payload?.pull_request.number).toBe(202);
    expect(JSON.stringify(payload)).not.toContain('"self"');
    expect(payload?.session_origin).toMatchObject({
      workflow: '.github/workflows/squad.lock.yml',
      run_id: 67890,
    });
  });

  it('compiles the handler path and detects a realistic contract mutation', () => {
    for (const source of [implementWorker, dependencyWorker]) {
      expect(source).toContain('ref: ${{ github.workflow_sha }}');
      expect(source).toContain('record-implementation-provenance:');
      expect(source).toContain('require-temporary-id: true');
    }
    expect(dispatcher).toContain('Dispatcher-Workflow: .github/workflows/squad.lock.yml');

    const workspace = scratch();
    const workflowDir = resolve(workspace, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    execFileSync(
      'gh',
      ['aw', 'compile', 'squad-implement-worker', '--strict', '--no-check-update'],
      { cwd: workspace, stdio: 'pipe', timeout: 60_000 },
    );
    const lockPath = resolve(workflowDir, 'squad-implement-worker.lock.yml');
    const lock = readFileSync(lockPath, 'utf8');
    expect(lock).toContain('safe_output_script_record_implementation_provenance.cjs');
    expect(lock).toContain('GH_AW_SAFE_OUTPUT_SCRIPTS');
    expect(lock).toContain('require_temporary_id');
    expect(lock).toContain("ref: ${{ github.workflow_sha }}");

    const sourcePath = resolve(workflowDir, 'squad-implement-worker.md');
    writeFileSync(
      sourcePath,
      readFileSync(sourcePath, 'utf8').replace('    require-temporary-id: true\n', ''),
    );
    execFileSync(
      'gh',
      ['aw', 'compile', 'squad-implement-worker', '--strict', '--no-check-update'],
      { cwd: workspace, stdio: 'pipe', timeout: 60_000 },
    );
    const mutated = readFileSync(lockPath, 'utf8');
    expect(mutated).not.toContain('require_temporary_id');
  }, 120_000);
});
