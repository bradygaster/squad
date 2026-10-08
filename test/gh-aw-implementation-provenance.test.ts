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
  enforceImplementationProvenanceSafeOutputs,
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

function receiptComment(worker = 'squad-implement-worker') {
  return {
    user: { login: 'github-actions[bot]', type: 'Bot' },
    body: implementationDispatchReceipt({
      repository: 'octo/example',
      issueNumber: 42,
      worker,
      sessionId: 'squad-implementation-session/v1/12345/67890',
      workflow: '.github/workflows/squad.lock.yml',
      runId: 67890,
      runAttempt: 1,
    }),
  };
}

function identityFetch(route: string, worker = 'squad-implement-worker') {
  if (route.endsWith('/actions/runs/67890')) {
    return {
      id: 67890,
      run_attempt: 1,
      path: '.github/workflows/squad.lock.yml@refs/heads/dev',
      repository: { full_name: 'octo/example' },
    };
  }
  if (route.endsWith('/issues/42/comments')) return [receiptComment(worker)];
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

function provenanceCommentItem(
  body: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    type: 'add_comment',
    item_number: '#aw_impl42',
    body,
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

  it('rejects every provenance-like add_comment targeting the temporary PR', () => {
    const candidates = [
      `${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n`,
      `${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n\`\`\``,
      '{"schema_version":"1"}',
      bodyFor({ ...fixture, unknown: true }),
      `${PROVENANCE_LABEL}\n\`\`\`json\n${JSON.stringify(fixture)}\n\`\`\``,
    ];
    for (const body of candidates) {
      const result = evaluateImplementationProvenanceItems({
        items: [pullItem(), recordItem(), provenanceCommentItem(body)],
        repository: 'octo/example',
        issueNumber: 42,
        namespace: 'implement',
        runId: 70001,
        requireLegacyMarker: true,
      });
      expect(result.ok).toBe(false);
      expect(result.violations).toContainEqual({
        kind: 'implementation-provenance-comment-candidate-invalid',
      });
    }

    const duplicate = evaluateImplementationProvenanceItems({
      items: [
        pullItem(),
        recordItem(),
        provenanceCommentItem(bodyFor(fixture)),
        provenanceCommentItem(`${PROVENANCE_LABEL}\nnot-json`),
      ],
      repository: 'octo/example',
      issueNumber: 42,
      namespace: 'implement',
      runId: 70001,
      requireLegacyMarker: true,
    });
    expect(duplicate.violations).toEqual(expect.arrayContaining([
      { kind: 'implementation-provenance-comment-candidate-invalid' },
      { kind: 'implementation-provenance-comment-candidate-ambiguous' },
    ]));

    expect(evaluateImplementationProvenanceItems({
      items: [
        pullItem(),
        recordItem(),
        provenanceCommentItem('ordinary implementation status'),
      ],
      repository: 'octo/example',
      issueNumber: 42,
      namespace: 'implement',
      runId: 70001,
      requireLegacyMarker: true,
    }).ok).toBe(true);
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
    const malformed = `${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n`;
    for (const botComments of [
      [],
      [
        { user: { login: 'github-actions[bot]' }, body: malformed },
      ],
      [
        {
          user: { login: 'github-actions[bot]' },
          body: `${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n\`\`\``,
        },
      ],
      [
        { user: { login: 'github-actions[bot]' }, body: bodyFor(replacement) },
        { user: { login: 'github-actions[bot]' }, body: bodyFor(replacement) },
      ],
      [
        { user: { login: 'github-actions[bot]' }, body: bodyFor(replacement) },
        { user: { login: 'github-actions[bot]' }, body: malformed },
      ],
      [
        { user: { login: 'github-actions[bot]' }, body: bodyFor({ ...replacement, unknown: true }) },
      ],
    ]) {
      await expect(verifyReplacementEvidence({
        replacements: [{ repository: 'octo/example', number: 101 }],
        repository: 'octo/example',
        originIssue: 42,
        sessionId: 'squad-implementation-session/v1/12345/67890',
        fetchJson: async route => route.endsWith('/comments')
          ? botComments
          : fetchJson(route),
      })).resolves.toContainEqual({
        kind: 'implementation-provenance-replacement-unrelated',
        number: 101,
      });
    }
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

  it('post-create handler refuses provenance-like add_comment candidates in raw output', async () => {
    const comments: string[] = [];
    const outputItems = [
      pullItem(),
      recordItem(),
      provenanceCommentItem(`${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n`),
    ];
    await expect(emitImplementationProvenanceComment({
      item: outputItems[1],
      items: outputItems,
      resolvedTemporaryIds: {
        aw_impl42: { repo: 'octo/example', number: 202 },
      },
      env: env(),
      fetchJson: async (route: string) => {
        if (route.endsWith('/pulls/202')) {
          return {
            number: 202,
            body: pullItem().body,
            base: { repo: { full_name: 'octo/example' } },
            head: { ref: 'squad/implement-42-example' },
          };
        }
        return identityFetch(route);
      },
      createComment: async (_repository, _number, body) => comments.push(body),
    })).rejects.toThrow('implementation-provenance-comment-candidate-invalid');
    expect(comments).toEqual([]);
  });

  it('compiles both handler paths and fails production-shaped comment candidates closed', async () => {
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
    for (const workflowId of ['squad-implement-worker', 'squad-deps-worker']) {
      execFileSync(
        'gh',
        ['aw', 'compile', workflowId, '--strict', '--no-check-update'],
        { cwd: workspace, stdio: 'pipe', timeout: 60_000 },
      );
      const lock = readFileSync(resolve(workflowDir, `${workflowId}.lock.yml`), 'utf8');
      const guard = lock.indexOf(
        workflowId === 'squad-implement-worker'
          ? 'name: Enforce implement provenance before any output'
          : 'name: Enforce dependency implementation provenance before any output',
      );
      const handler = lock.indexOf(
        'safe_output_script_record_implementation_provenance.cjs',
      );
      const process = lock.indexOf('name: Process Safe Outputs');
      expect(guard).toBeGreaterThan(-1);
      expect(handler).toBeGreaterThan(guard);
      expect(process).toBeGreaterThan(handler);
      expect(lock.slice(handler, process)).toContain(
        'return provenance.emitImplementationProvenanceComment({',
      );
      expect(lock.slice(guard, process)).toContain('GH_AW_AGENT_OUTPUT');
      expect(lock.slice(guard, process)).toContain(
        'enforceImplementationProvenanceSafeOutputs(',
      );
      expect(lock).toContain('GH_AW_SAFE_OUTPUT_SCRIPTS');
      expect(lock).toContain('require_temporary_id');
      expect(lock).toContain("ref: ${{ github.workflow_sha }}");

      const dependency = workflowId === 'squad-deps-worker';
      const malformed = provenanceCommentItem(
        `${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n`,
      );
      const adversarialComments = [
        [malformed],
        [provenanceCommentItem(
          `${PROVENANCE_LABEL}\n\`\`\`json\n{"schema_version":"1"}\n\`\`\``,
        )],
        [provenanceCommentItem(bodyFor({ ...fixture, unknown: true }))],
        [
          provenanceCommentItem(bodyFor(fixture)),
          provenanceCommentItem(bodyFor(fixture)),
        ],
        [
          provenanceCommentItem(bodyFor(fixture)),
          malformed,
        ],
      ];
      for (const comments of adversarialComments) {
        const result = await enforceImplementationProvenanceSafeOutputs(env({
          SQUAD_IMPLEMENT_WORKER: workflowId,
          SQUAD_IMPLEMENT_WORKFLOW: `.github/workflows/${workflowId}.lock.yml`,
          SQUAD_IMPLEMENT_NAMESPACE: dependency ? 'deps' : 'implement',
          SQUAD_IMPLEMENT_REQUIRE_LEGACY_MARKER: dependency ? 'false' : 'true',
        }), {
          readItems: () => [
            {
              ...pullItem(),
              branch: dependency
                ? 'squad/deps-42-example'
                : 'squad/implement-42-example',
            },
            recordItem(),
            ...comments,
          ],
          fetchJson: async route => identityFetch(route, workflowId),
        });
        expect(result.ok).toBe(false);
        expect(result.violations).toContainEqual({
          kind: 'implementation-provenance-comment-candidate-invalid',
        });
      }
    }

    const lockPath = resolve(workflowDir, 'squad-implement-worker.lock.yml');
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
