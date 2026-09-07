import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  collectRecentPages,
  collectLiveInput,
  collectStateIssues,
  collectionFailureContext,
  deriveRequestGroup,
  evaluateRetro,
  evidenceFingerprint,
  extractErrorLine,
  FAILED_RUN_LIMIT,
  normalizeSignature,
  PULL_REQUEST_LIMIT,
  resolveRetroConfig,
} from '../workflows/shared/squad-retro-evidence.mjs';
import { extractSafeOutputsConfigJson } from './helpers/gh-aw-lock.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = resolve(ROOT, 'workflows/shared/squad-retro-evidence.mjs');
const RETRO = read('workflows/squad-retro.md');
const ROUTER = read('workflows/squad.md');
const REVIEWER = read('workflows/squad-review.md');
const IMPLEMENTER = read('workflows/squad-implement-worker.md');
const CI = read('.github/workflows/squad-ci.yml');
const workspaces: string[] = [];

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
}

function scratch(config?: unknown): string {
  const workspace = mkdtempSync(resolve(ROOT, '.squad-retro-gate-'));
  workspaces.push(workspace);
  if (config !== undefined) {
    mkdirSync(resolve(workspace, '.squad'), { recursive: true });
    writeFileSync(
      resolve(workspace, '.squad', 'config.json'),
      typeof config === 'string' ? config : JSON.stringify(config),
    );
  }
  return workspace;
}

function stateIssue(author = 'github-actions[bot]') {
  return [{
    number: 41,
    author,
    state: 'open',
    labels: ['squad', 'squad-retro-state'],
  }];
}

function stateComment(data: Record<string, unknown>, createdAt = '2026-09-01T00:00:00Z') {
  return [{
    author: 'github-actions[bot]',
    created_at: createdAt,
    body: `## Squad retrospective state\n\nStructured data:\n\n\`\`\`json\n${JSON.stringify({
      squad_artifact: 'retro-state',
      schema_version: '1',
      retro_id: '1',
      ...data,
    })}\n\`\`\``,
  }];
}

function failure(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    run_attempt: 1,
    workflow_name: 'CI',
    job_name: 'test',
    error_line: 'Expected 2 but got 1',
    head_sha: 'a'.repeat(40),
    html_url: 'https://github.example/runs/101',
    created_at: '2026-09-06T00:00:00Z',
    conclusion: 'failure',
    ...overrides,
  };
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    pr_number: 12,
    head_sha: 'b'.repeat(40),
    state: 'CHANGES_REQUESTED',
    submitted_at: '2026-09-06T00:00:00Z',
    html_url: 'https://github.example/pull/12#review-1',
    theme: 'Missing empty-input coverage',
    path_prefix: 'src',
    labels: [],
    ...overrides,
  };
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    now: '2026-09-07T00:00:00Z',
    eventName: 'schedule',
    config: {},
    stateIssues: stateIssue(),
    stateComments: stateComment({
      status: 'IDLE',
      completed_at: '2026-09-03T00:00:00Z',
      resolved_fingerprints: [],
      pending_fingerprints: [],
    }),
    workflowRuns: [],
    reviews: [],
    incoming: {},
    ...overrides,
  };
}

function collectFixture({
  runs = [],
  pulls = [],
  comments = baseInput().stateComments,
  nested = (route: string, _fields: Record<string, unknown>): unknown => {
    throw new Error(`Unexpected API route: ${route}`);
  },
  log = () => Buffer.from('##[error]Expected 2 but got 1'),
}: {
  runs?: Record<string, unknown>[];
  pulls?: Record<string, unknown>[];
  comments?: ReturnType<typeof stateComment>;
  nested?: (route: string, fields: Record<string, unknown>) => unknown;
  log?: () => Buffer;
} = {}) {
  const calls: { route: string; page: number }[] = [];
  let logCalls = 0;
  const input = collectLiveInput({
    GITHUB_REPOSITORY: 'squad-test/example',
    GITHUB_WORKSPACE: scratch({}),
    SQUAD_RETRO_EVENT_NAME: 'schedule',
  }, {
    now: new Date('2026-09-07T00:00:00Z'),
    fetchJson: (route, fields) => {
      calls.push({ route, page: fields.page });
      if (route.endsWith('/issues')) {
        return stateIssue().map(issue => ({ ...issue, user: { login: issue.author } }));
      }
      if (route.endsWith('/comments')) {
        return comments.map(comment => ({ ...comment, user: { login: comment.author } }));
      }
      if (route.endsWith('/actions/runs')) return { workflow_runs: runs };
      if (route.endsWith('/pulls')) return pulls;
      return nested(route, fields);
    },
    fetchLog: () => {
      logCalls++;
      return log();
    },
  });
  return { input, result: evaluateRetro(input), calls, logCalls };
}

afterAll(() => {
  for (const workspace of workspaces) rmSync(workspace, { recursive: true, force: true });
});

describe('Squad retrospective deterministic gate', () => {
  it('normalizes unstable values into a stable fingerprint', () => {
    const left = normalizeSignature(
      'CI job 123 failed at C:\\Temp\\run-55\\out on 2026-09-06T01:02:03Z https://example/1 abcdef1234567',
    );
    const right = normalizeSignature(
      'ci job 999 failed at C:\\Temp\\run-88\\out on 2026-09-07T04:05:06Z https://example/2 fedcba7654321',
    );
    expect(left).toBe(right);
    expect(evidenceFingerprint('fail', left)).toBe(evidenceFingerprint('fail', right));
  });

  it('uses bounded configurable defaults and rejects malformed configuration', () => {
    expect(resolveRetroConfig({})).toEqual({
      enabled: true,
      threshold: 2,
      windowHours: 168,
      cooldownHours: 72,
    });
    expect(() => resolveRetroConfig({ squadRetroEarlyThreshold: 1 })).toThrow();
    expect(() => resolveRetroConfig({ squadRetro: true })).toThrow();
  });

  it('keeps the full retrospective weekly while the evidence window remains configurable', () => {
    const notWeeklyDue = evaluateRetro(baseInput({
      config: { squadRetroWindowHours: 24 },
      stateComments: stateComment({
        retro_id: '20',
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [],
      }),
      workflowRuns: [failure()],
    }));
    expect(notWeeklyDue.weekly_interval_hours).toBe(168);
    expect(notWeeklyDue.trigger_path).toBe('drain');
    expect(notWeeklyDue.action).toBe('noop');

    const weeklyDue = evaluateRetro(baseInput({
      config: { squadRetroWindowHours: 24 },
      stateComments: stateComment({
        retro_id: '21',
        status: 'IDLE',
        completed_at: '2026-08-30T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [],
      }),
      workflowRuns: [failure()],
    }));
    expect(weeklyDue.trigger_path).toBe('scheduled');
    expect(weeklyDue.action).toBe('run');
  });

  it('does not let an early retrospective postpone the next full weekly report', () => {
    const result = evaluateRetro(baseInput({
      stateComments: stateComment({
        retro_id: '22',
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        last_full_completed_at: '2026-08-30T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [],
      }),
      workflowRuns: [failure()],
    }));
    expect(result.state_completed_at).toBe('2026-09-03T00:00:00.000Z');
    expect(result.state_last_full_completed_at).toBe('2026-08-30T00:00:00.000Z');
    expect(result.trigger_path).toBe('scheduled');
    expect(result.action).toBe('run');
  });

  it('keeps an explicit null full-report timestamp due after an early-only completion', () => {
    const result = evaluateRetro(baseInput({
      stateComments: stateComment({
        retro_id: '23',
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        last_full_completed_at: null,
        resolved_fingerprints: [],
        pending_fingerprints: [],
      }),
      workflowRuns: [failure()],
    }));
    expect(result.state_last_full_completed_at).toBeNull();
    expect(result.trigger_path).toBe('scheduled');
    expect(result.action).toBe('run');
  });

  it('requires the exact threshold across independent workflow attempts', () => {
    const one = evaluateRetro(baseInput({ workflowRuns: [failure()] }));
    expect(one.action).toBe('noop');
    expect(one.reason).toBe('early-threshold-not-met');

    const retries = evaluateRetro(baseInput({
      workflowRuns: [failure(), failure({ run_attempt: 2 })],
    }));
    expect(retries.action).toBe('noop');
    expect(retries.evidence_groups[0].attempt_count).toBe(1);

    const independent = evaluateRetro(baseInput({
      workflowRuns: [failure(), failure({ id: 102, html_url: 'https://github.example/runs/102' })],
    }));
    expect(independent.action).toBe('run');
    expect(independent.qualifying_groups[0].attempt_count).toBe(2);
  });

  it('counts repeated review rejection only across distinct revisions', () => {
    const sameRevision = evaluateRetro(baseInput({
      reviews: [review(), review({ html_url: 'https://github.example/pull/12#review-2' })],
    }));
    expect(sameRevision.action).toBe('noop');
    expect(sameRevision.evidence_groups[0].attempt_count).toBe(1);

    const distinctRevision = evaluateRetro(baseInput({
      reviews: [review(), review({ head_sha: 'c'.repeat(40) })],
    }));
    expect(distinctRevision.action).toBe('run');
    expect(distinctRevision.qualifying_groups[0].kind).toBe('review');
  });

  it('treats heading-only review rejections as low-confidence evidence', () => {
    const { result } = collectFixture({
      pulls: [{ number: 12, updated_at: '2026-09-06T00:00:00Z', labels: [] }],
      nested: route => {
        if (route.endsWith('/reviews')) {
          return [
            review({ body: '## Review', commit_id: 'b'.repeat(40) }),
            review({ body: '## Review', commit_id: 'c'.repeat(40) }),
          ];
        }
        if (route.endsWith('/files')) return [{ filename: 'src/example.ts' }];
        throw new Error(`Unexpected API route: ${route}`);
      },
    });
    expect(result.action).toBe('noop');
    expect(result.evidence_groups[0]).toMatchObject({
      attempt_count: 2,
      low_confidence: true,
      qualifies: false,
    });
  });

  it('ignores review provenance and mandatory footer boilerplate as rejection themes', () => {
    const { result } = collectFixture({
      pulls: [{ number: 12, updated_at: '2026-09-06T00:00:00Z', labels: [] }],
      nested: route => {
        if (route.endsWith('/reviews')) {
          return [
            review({
              body: '## Review\nProvenance: Squad implementation worker.\nHuman approval remains mandatory.\nSquad-Review-Head: abc',
              commit_id: 'b'.repeat(40),
            }),
            review({
              body: '## Review\nProvenance: Squad implementation worker.\nHuman approval remains mandatory.\nSquad-Review-Head: def',
              commit_id: 'c'.repeat(40),
            }),
          ];
        }
        if (route.endsWith('/files')) return [{ filename: 'src/example.ts' }];
        throw new Error(`Unexpected API route: ${route}`);
      },
    });
    expect(result.action).toBe('noop');
    expect(result.evidence_groups[0]).toMatchObject({
      attempt_count: 2,
      low_confidence: true,
      qualifies: false,
    });
  });

  it.each(['fail', 'review'])('only drains unresolved or recurring qualifying %s evidence', kind => {
    const fingerprint = kind === 'fail'
      ? evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1')
      : evidenceFingerprint('review', 'Missing empty-input coverage|src');
    const evidence = (latest: string) => kind === 'fail' ? {
      workflowRuns: [
        failure({ created_at: '2026-09-02T00:00:00Z' }),
        failure({ id: 102, created_at: latest }),
      ],
    } : {
      reviews: [
        review({ submitted_at: '2026-09-02T00:00:00Z' }),
        review({ head_sha: 'c'.repeat(40), submitted_at: latest }),
      ],
    };
    const stateComments = stateComment({
      status: 'IDLE',
      completed_at: '2026-09-03T00:00:00Z',
      resolved_fingerprints: [fingerprint],
      pending_fingerprints: [],
    });
    for (const incoming of [{}, { reason: 'drain' }, { reason: 'early-evidence', fingerprint }]) {
      const old = evaluateRetro(baseInput({
        stateComments, incoming, ...evidence('2026-09-03T00:00:00Z'),
      }));
      expect(old.action).toBe('noop');
      expect(old.evidence_groups[0].qualifies).toBe(true);
      expect(old.qualifying_groups).toEqual([]);
      expect(old.primary_fingerprint).toBeNull();

      const recurred = evaluateRetro(baseInput({
        stateComments, incoming, ...evidence('2026-09-03T00:00:01Z'),
      }));
      expect(recurred.action).toBe('run');
      expect(recurred.qualifying_groups.map(group => group.fingerprint)).toEqual([fingerprint]);
      expect(recurred.primary_fingerprint).toBe(fingerprint);
    }
    const unresolved = evaluateRetro(baseInput({
      ...evidence('2026-09-02T00:00:00Z'),
    }));
    expect(unresolved.action).toBe('run');
  });

  it('does not resolve evidence until the final state checkpoint is committed', () => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const comments = [
      ...baseInput().stateComments,
      ...['2026-09-04T00:00:00Z', '2026-09-05T00:00:00Z'].map(createdAt =>
        stateComment({ squad_artifact: 'retro-report', fingerprint }, createdAt)[0]),
    ];
    const old = evaluateRetro(baseInput({
      stateComments: comments,
      workflowRuns: [
        failure({ created_at: '2026-09-04T12:00:00Z' }),
        failure({ id: 102, created_at: '2026-09-05T00:00:00Z' }),
      ],
    }));
    expect(old.action).toBe('run');
    expect(old.qualifying_groups.map(group => group.fingerprint)).toEqual([fingerprint]);
    const recurring = evaluateRetro(baseInput({
      stateComments: comments,
      workflowRuns: [failure(), failure({ id: 102 })],
    }));
    expect(recurring.action).toBe('run');
  });

  it('keeps resolved old groups out of actionable output when another group triggers a drain', () => {
    const resolved = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const actionable = evidenceFingerprint('fail', 'CI|test|new regression');
    const result = evaluateRetro(baseInput({
      stateComments: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: [resolved],
        pending_fingerprints: [],
      }),
      workflowRuns: [
        ...[101, 102, 103].map(id => failure({ id, created_at: '2026-09-02T00:00:00Z' })),
        ...[201, 202].map(id => failure({ id, error_line: 'new regression' })),
      ],
    }));
    expect(result.action).toBe('run');
    expect(result.evidence_groups).toHaveLength(2);
    expect(result.qualifying_groups.map(group => group.fingerprint)).toEqual([actionable]);
    expect(result.primary_fingerprint).toBe(actionable);
  });

  it.each(['manual', 'scheduled'])('still reports resolved evidence on a %s retrospective', path => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const result = evaluateRetro(baseInput({
      config: { squadRetroWindowHours: 336 },
      eventName: path === 'manual' ? 'workflow_dispatch' : 'schedule',
      incoming: path === 'manual' ? { reason: 'manual', origin: 'manual' } : {},
      stateComments: stateComment({
        status: 'IDLE',
        completed_at: '2026-08-30T00:00:00Z',
        resolved_fingerprints: [fingerprint],
        pending_fingerprints: [],
      }),
      workflowRuns: [
        failure({ created_at: '2026-08-29T00:00:00Z' }),
        failure({ id: 102, created_at: '2026-08-29T00:00:00Z' }),
      ],
    }));
    expect(result.trigger_path).toBe(path);
    expect(result.action).toBe('run');
    expect(result.qualifying_groups.map(group => group.fingerprint)).toEqual([fingerprint]);
  });

  it.each([
    { latest: '2026-09-02T00:00:00Z', count: 2, resolved: true, action: 'noop' },
    { latest: '2026-09-06T00:00:00Z', count: 1, resolved: true, action: 'noop' },
    { latest: '2026-09-06T00:00:00Z', count: 2, resolved: true, action: 'run' },
    { latest: '2026-09-02T00:00:00Z', count: 2, resolved: false, action: 'run' },
  ])('requires current valid evidence for a pending drain: %j', ({ latest, count, resolved, action }) => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const result = evaluateRetro(baseInput({
      stateComments: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: resolved ? [fingerprint] : [],
        pending_fingerprints: [fingerprint],
      }),
      workflowRuns: Array.from({ length: count }, (_, index) =>
        failure({ id: 101 + index, created_at: latest })),
    }));
    expect(result.trigger_path).toBe('drain');
    expect(result.action).toBe(action);
    expect(result.pending_fingerprints).toEqual([fingerprint]);
    expect(result.qualifying_groups).toHaveLength(action === 'run' ? 1 : 0);
  });

  it('keeps incoming requests pending during cooldown and drains them after expiry', () => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const cooling = evaluateRetro(baseInput({
      stateComments: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-06T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [],
      }),
      workflowRuns: [failure(), failure({ id: 102 })],
      incoming: { reason: 'early-evidence', origin: 'squad-implement', fingerprint },
    }));
    expect(cooling.action).toBe('suppress');
    expect(cooling.reason).toBe('cooldown-active');
    expect(cooling.pending_fingerprints).toContain(fingerprint);

    const drained = evaluateRetro(baseInput({
      workflowRuns: [failure(), failure({ id: 102 })],
      stateComments: [
        ...stateComment({
          status: 'IDLE',
          completed_at: '2026-09-03T00:00:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: [],
        }),
        {
          author: 'github-actions[bot]',
          created_at: '2026-09-06T00:00:00Z',
          body: `Request\n\nStructured data:\n\n\`\`\`json\n${JSON.stringify({
            squad_artifact: 'retro-request',
            schema_version: '1',
            retro_id: '2',
            fingerprint,
          })}\n\`\`\``,
        },
      ],
    }));
    expect(drained.action).toBe('run');
    expect(drained.pending_fingerprints).toContain(fingerprint);
  });

  it('expires a pending request after its evidence ages out', () => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const result = evaluateRetro(baseInput({
      stateComments: [
        ...stateComment({
          status: 'IDLE',
          completed_at: '2026-09-03T00:00:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: [],
        }),
        {
          author: 'github-actions[bot]',
          created_at: '2026-09-04T00:00:00Z',
          body: `Request\n\nStructured data:\n\n\`\`\`json\n${JSON.stringify({
            squad_artifact: 'retro-request',
            schema_version: '1',
            retro_id: '2',
            fingerprint,
          })}\n\`\`\``,
        },
      ],
    }));
    expect(result.action).toBe('housekeep');
    expect(result.expired_pending_fingerprints).toEqual([fingerprint]);
    expect(result.pending_fingerprints).toEqual([]);
  });

  it.each([
    { failed: true, pulls: true, preservedKinds: ['fail', 'review'], action: 'noop' },
    { failed: true, pulls: false, preservedKinds: ['fail'], action: 'housekeep' },
    { failed: false, pulls: true, preservedKinds: ['review'], action: 'housekeep' },
    { failed: false, pulls: false, preservedKinds: [], action: 'housekeep' },
  ])('expires only complete evidence kinds: $failed/$pulls', ({
    failed, pulls, preservedKinds, action,
  }) => {
    const pending = [
      evidenceFingerprint('fail', 'CI|test|aged-out failure'),
      evidenceFingerprint('review', 'aged-out rejection|src'),
    ];
    const preserved = pending.filter(value => preservedKinds.includes(value.split(':')[0]));
    const expired = pending.filter(value => !preserved.includes(value));
    const result = evaluateRetro(baseInput({
      collection: { failed_runs_truncated: failed, pull_requests_truncated: pulls },
      stateComments: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: pending,
      }),
    }));
    expect(result.action).toBe(action);
    expect(result.pending_fingerprints).toEqual(preserved);
    expect(result.expired_pending_fingerprints).toEqual(expired);
    expect(result.truncation_preserved_fingerprints).toEqual(preserved);
    expect(result.resolved_fingerprints).toEqual([]);
  });

  it('preserves unobserved requests during a bounded report without blocking qualifying evidence', () => {
    const missing = evidenceFingerprint('fail', 'CI|test|uncollected failure');
    const observed = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const result = evaluateRetro(baseInput({
      collection: { failed_runs_truncated: true, pull_requests_truncated: false },
      stateComments: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [missing, observed],
      }),
      workflowRuns: [failure(), failure({ id: 102 })],
    }));
    expect(result.action).toBe('run');
    expect(result.pending_fingerprints).toEqual([missing, observed].sort());
    expect(result.truncation_preserved_fingerprints).toEqual([missing]);
    expect(result.expired_pending_fingerprints).toEqual([]);
    expect(result.qualifying_groups[0].fingerprint).toBe(observed);
  });

  it('recovers stale legacy in-flight state but suppresses an active record', () => {
    const active = evaluateRetro(baseInput({
      stateComments: stateComment({
        status: 'IN_FLIGHT',
        started_at: '2026-09-06T22:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [],
      }),
      workflowRuns: [failure(), failure({ id: 102 })],
    }));
    expect(active.action).toBe('suppress');
    expect(active.reason).toBe('trusted-state-is-in-flight');

    const stale = evaluateRetro(baseInput({
      stateComments: stateComment({
        status: 'IN_FLIGHT',
        started_at: '2026-09-05T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [],
      }),
      workflowRuns: [failure(), failure({ id: 102 })],
    }));
    expect(stale.action).toBe('run');
    expect(stale.stale_in_flight_recovered).toBe(true);
  });

  it('noops for no evidence and excludes retrospective self-evidence', () => {
    expect(evaluateRetro(baseInput()).reason).toBe('no-evidence-in-window');
    const selfOnly = evaluateRetro(baseInput({
      workflowRuns: [
        failure({ id: 201, workflow_name: 'Squad Retro', self_retro: true }),
        failure({ id: 202, workflow_name: 'Squad Retro', self_retro: true }),
      ],
      reviews: [
        review({ self_retro: true }),
        review({ self_retro: true, head_sha: 'd'.repeat(40) }),
      ],
    }));
    expect(selfOnly.action).toBe('noop');
    expect(selfOnly.evidence_count).toBe(0);
  });

  it('refuses user-authored prose as trusted state', () => {
    const result = evaluateRetro(baseInput({ stateIssues: stateIssue('octocat') }));
    expect(result.action).toBe('initialize_state');
  });

  it('repairs the lowest-numbered trusted unlabeled state issue instead of initializing', () => {
    const unlabeled = {
      ...stateIssue()[0],
      title: 'Squad retrospective state',
      labels: ['squad', 'squad-retro'],
    };
    const result = evaluateRetro(baseInput({
      stateIssues: [{ ...unlabeled, number: 99 }, unlabeled],
    }));
    expect(result).toMatchObject({
      action: 'repair_state_label',
      reason: 'trusted-state-issue-unlabeled',
      state_issue: 41,
      missing_label: 'squad-retro-state',
      duplicate_state_issues: 1,
    });
    const repaired = evaluateRetro(baseInput({
      stateIssues: [{ ...unlabeled, labels: [...unlabeled.labels, result.missing_label] }],
    }));
    expect(repaired.action).toBe('noop');
    expect(repaired.state_issue).toBe(41);
  });

  it('prefers the lowest-numbered labeled trusted state over a lower-numbered fallback', () => {
    const result = evaluateRetro(baseInput({
      stateIssues: [
        { ...stateIssue()[0], number: 1, title: 'Squad retrospective state', labels: [] },
        { ...stateIssue()[0], number: 99 },
        ...stateIssue(),
        { ...stateIssue('octocat')[0], number: 2 },
      ],
    }));
    expect(result.action).toBe('noop');
    expect(result.state_issue).toBe(41);
    expect(result.duplicate_state_issues).toBe(2);
  });

  it.each([
    { author: 'octocat' },
    { author: 'another-app[bot]' },
    { title: 'Squad retrospective state ' },
    { title: 'Squad retrospective state proposal' },
    { state: 'closed' },
    { pull_request: { url: 'https://github.example/pull/41' } },
  ])('refuses an untrusted or inexact title fallback: %j', overrides => {
    const result = evaluateRetro(baseInput({
      stateIssues: [{
        ...stateIssue()[0],
        title: 'Squad retrospective state',
        labels: ['squad-retro'],
        ...overrides,
      }],
    }));
    expect(result.action).toBe('initialize_state');
    expect(result).not.toHaveProperty('state_issue');
  });

  it('discovers an unlabeled bot state through a bounded creator-filtered fallback', () => {
    const calls: Record<string, unknown>[] = [];
    const stateIssues = collectStateIssues('squad-test/example', fields => {
      calls.push(fields);
      if (fields.labels) return [];
      return [
        { number: 1, user: { login: 'octocat' }, state: 'open', title: 'Squad retrospective state', labels: [] },
        { number: 3, user: { login: 'github-actions[bot]' }, state: 'open', title: 'Other issue', labels: [] },
        { number: 41, user: { login: 'github-actions[bot]' }, state: 'open', title: 'Squad retrospective state', labels: [] },
      ];
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ labels: 'squad-retro-state' });
    expect(calls[1]).toEqual({
      state: 'open', creator: 'github-actions[bot]', sort: 'created', direction: 'asc',
      per_page: 100, page: 1,
    });
    expect(evaluateRetro(baseInput({ stateIssues }))).toMatchObject({
      action: 'repair_state_label', state_issue: 41,
    });
  });

  it('ignores a human-authored same-title issue returned by fallback discovery', () => {
    const stateIssues = collectStateIssues('squad-test/example', fields => fields.labels ? [] : [{
      number: 41, user: { login: 'octocat' }, state: 'open',
      title: 'Squad retrospective state', labels: [],
    }]);
    expect(evaluateRetro(baseInput({ stateIssues })).action).toBe('initialize_state');
  });

  it('does not scan unlabeled issues when a trusted labeled state exists', () => {
    let calls = 0;
    const stateIssues = collectStateIssues('squad-test/example', fields => {
      calls++;
      expect(fields.labels).toBe('squad-retro-state');
      return [99, 41].map(number => ({
        number, user: { login: 'github-actions[bot]' }, state: 'open',
        labels: [{ name: 'squad-retro-state' }],
      }));
    });
    expect(calls).toBe(1);
    expect(evaluateRetro(baseInput({ stateIssues })).state_issue).toBe(41);
  });

  it('paginates fallback discovery and fails closed if its scan is incomplete', () => {
    const unrelated = Array.from({ length: 100 }, (_, index) => ({
      number: index + 1, user: { login: 'github-actions[bot]' }, state: 'open',
      title: 'Unrelated bot issue', labels: [],
    }));
    const stateIssues = collectStateIssues('squad-test/example', fields => {
      if (fields.labels) return [];
      if (fields.page === 1) return unrelated;
      return [{
        ...unrelated[0], number: 141, title: 'Squad retrospective state',
      }];
    });
    expect(evaluateRetro(baseInput({ stateIssues }))).toMatchObject({
      action: 'repair_state_label', state_issue: 141,
    });
    let calls = 0;
    expect(() => collectStateIssues('squad-test/example', fields => {
      calls++;
      return fields.labels ? [] : unrelated;
    })).toThrow('pagination limit');
    expect(calls).toBe(21);
  });

  it('allows an authorized manual request to override cooldown but not evidence', () => {
    const stateComments = stateComment({
      status: 'IDLE',
      completed_at: '2026-09-06T00:00:00Z',
      resolved_fingerprints: [],
      pending_fingerprints: [],
    });
    expect(evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments,
      incoming: { reason: 'manual', origin: 'manual' },
    })).action).toBe('noop');
    expect(evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments,
      workflowRuns: [failure()],
      incoming: { reason: 'manual', origin: 'manual' },
    })).action).toBe('run');
  });

  it('derives a fingerprint for a wakeup that carries none and never for manual', () => {
    const failFingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const cooling = stateComment({
      status: 'IDLE',
      completed_at: '2026-09-06T00:00:00Z',
      resolved_fingerprints: [],
      pending_fingerprints: [],
    });

    const derived = evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments: cooling,
      workflowRuns: [failure(), failure({ id: 102 })],
      incoming: { reason: 'early-evidence', origin: 'squad-implement' },
    }));
    expect(derived.action).toBe('suppress');
    expect(derived.reason).toBe('cooldown-active');
    expect(derived.incoming_request).toMatchObject({
      fingerprint: failFingerprint,
      derived: true,
      already_pending: false,
    });
    expect(derived.pending_fingerprints).toContain(failFingerprint);

    const reviewOrigin = evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments: cooling,
      workflowRuns: [failure(), failure({ id: 102 })],
      reviews: [review(), review({ head_sha: 'c'.repeat(40) })],
      incoming: { reason: 'early-evidence', origin: 'squad-review' },
    }));
    expect(reviewOrigin.incoming_request.fingerprint)
      .toBe(evidenceFingerprint('review', 'Missing empty-input coverage|src'));

    const manual = evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments: cooling,
      workflowRuns: [failure(), failure({ id: 102 })],
      incoming: { reason: 'manual', origin: 'manual' },
    }));
    expect(manual.incoming_request).toBeNull();
    expect(manual.pending_fingerprints).toEqual([]);
  });

  it('records a newly incoming request exactly once via already_pending', () => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const cooling = {
      eventName: 'workflow_dispatch',
      stateComments: [
        ...stateComment({
          status: 'IDLE',
          completed_at: '2026-09-06T00:00:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: [],
        }),
        {
          author: 'github-actions[bot]',
          created_at: '2026-09-06T12:00:00Z',
          body: `Request\n\nStructured data:\n\n\`\`\`json\n${JSON.stringify({
            squad_artifact: 'retro-request',
            schema_version: '1',
            retro_id: '2',
            fingerprint,
          })}\n\`\`\``,
        },
      ],
      workflowRuns: [failure(), failure({ id: 102 })],
      incoming: { reason: 'early-evidence', origin: 'squad-implement', fingerprint },
    };
    const repeated = evaluateRetro(baseInput(cooling));
    expect(repeated.action).toBe('suppress');
    expect(repeated.incoming_request.already_pending).toBe(true);
    expect(repeated.pending_fingerprints.filter(value => value === fingerprint)).toHaveLength(1);
  });

  it('durably requeues each post-resolution recurrence exactly once', () => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const report = (retroId: string, createdAt: string) => ({
      author: 'github-actions[bot]',
      created_at: createdAt,
      body: `Report\n\nStructured data:\n\n\`\`\`json\n${JSON.stringify({
        squad_artifact: 'retro-report',
        schema_version: '1',
        retro_id: retroId,
        fingerprint,
      })}\n\`\`\``,
    });
    const request = (retroId: string, createdAt: string) => ({
      author: 'github-actions[bot]',
      created_at: createdAt,
      body: `Request\n\nStructured data:\n\n\`\`\`json\n${JSON.stringify({
        squad_artifact: 'retro-request',
        schema_version: '1',
        retro_id: retroId,
        fingerprint,
      })}\n\`\`\``,
    });
    const resolvedState = (retroId: string, completedAt: string) => stateComment({
      retro_id: retroId,
      status: 'IDLE',
      completed_at: completedAt,
      resolved_fingerprints: [fingerprint],
      pending_fingerprints: [],
    }, completedAt);
    const recurrence = failure({
      id: 201,
      created_at: '2026-09-06T12:00:00Z',
    });

    const first = evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments: [
        ...resolvedState('200', '2026-09-06T00:00:00Z'),
        report('200', '2026-09-06T00:00:00Z'),
      ],
      workflowRuns: [recurrence],
      incoming: { reason: 'early-evidence', origin: 'squad-implement', fingerprint },
    }));
    expect(first.action).toBe('suppress');
    expect(first.incoming_request).toMatchObject({
      fingerprint,
      recurrence: true,
      already_pending: false,
    });
    expect(first.pending_fingerprints).toEqual([fingerprint]);

    const repeated = evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments: [
        ...resolvedState('200', '2026-09-06T00:00:00Z'),
        report('200', '2026-09-06T00:00:00Z'),
        request('201', '2026-09-06T13:00:00Z'),
      ],
      workflowRuns: [recurrence],
      incoming: { reason: 'early-evidence', origin: 'squad-implement', fingerprint },
    }));
    expect(repeated.incoming_request.already_pending).toBe(true);
    expect(repeated.pending_fingerprints).toEqual([fingerprint]);

    const later = evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      stateComments: [
        ...resolvedState('300', '2026-09-06T18:00:00Z'),
        report('300', '2026-09-06T18:00:00Z'),
        request('201', '2026-09-06T13:00:00Z'),
      ],
      workflowRuns: [failure({ id: 301, created_at: '2026-09-06T23:00:00Z' })],
      incoming: { reason: 'early-evidence', origin: 'squad-implement', fingerprint },
    }));
    expect(later.incoming_request).toMatchObject({
      recurrence: true,
      already_pending: false,
    });
    expect(later.pending_fingerprints).toEqual([fingerprint]);
  });

  it('never lets a low-confidence failure signature qualify on its own', () => {
    const weak = {
      error_line: '<no-error-line>|step:Run tests',
      error_confidence: 'low',
    };
    const result = evaluateRetro(baseInput({
      workflowRuns: [failure(weak), failure({ id: 102, ...weak })],
    }));
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('early-threshold-not-met');
    expect(result.evidence_groups[0]).toMatchObject({
      attempt_count: 2,
      low_confidence: true,
      qualifies: false,
    });
    expect(result.qualifying_groups).toEqual([]);

    const wakeup = evaluateRetro(baseInput({
      eventName: 'workflow_dispatch',
      workflowRuns: [failure(weak), failure({ id: 102, ...weak })],
      incoming: { reason: 'early-evidence', origin: 'squad-implement' },
    }));
    expect(wakeup.action).toBe('noop');
    expect(deriveRequestGroup(wakeup.evidence_groups, 'squad-implement')?.qualifies).toBe(false);
  });

  it('keeps a failure fingerprint stable across head SHAs', () => {
    const first = evaluateRetro(baseInput({
      workflowRuns: [failure(), failure({ id: 102, head_sha: 'e'.repeat(40) })],
    }));
    expect(first.action).toBe('run');
    expect(first.qualifying_groups).toHaveLength(1);
    expect(first.qualifying_groups[0].attempt_count).toBe(2);
  });

  it('extracts a bounded stable error line and rejects unusable log output', () => {
    const log = [
      '2026-09-06T00:00:00.1234567Z Run npm test',
      '2026-09-06T00:00:01.1234567Z \u001b[31mnot ok 3 - adds numbers\u001b[0m',
      '2026-09-06T00:00:02.1234567Z ##[error]Process completed with exit code 1.',
    ].join('\n');
    expect(extractErrorLine(log)).toBe('not ok 3 - adds numbers');
    expect(extractErrorLine('##[error]Process completed with exit code 1.')).toBeNull();
    expect(extractErrorLine('2026-09-06T00:00:00Z AssertionError: expected 2 to equal 1'))
      .toBe('AssertionError: expected 2 to equal 1');
    expect(extractErrorLine('0 Error(s)\nAssertionError: expected 2 to equal 1'))
      .toBe('AssertionError: expected 2 to equal 1');
    expect(extractErrorLine('Build succeeded. 0 Error(s)')).toBeNull();
    for (const summary of [
      'Passed! - Failed: 0, Passed: 12, Skipped: 0, Total: 12',
      '# fail 0',
      'Found 0 errors.',
      'Tests: 12 passed, 0 failed',
      '[INFO] Tests run: 12, Failures: 0, Errors: 0, Skipped: 0',
      '0 errors, 0 warnings',
    ]) {
      expect(extractErrorLine(`${summary}\nAssertionError: expected 2 to equal 1`))
        .toBe('AssertionError: expected 2 to equal 1');
    }
    expect(extractErrorLine('all good\nnothing to see')).toBeNull();
    expect(extractErrorLine('PK\u0000\u0000binary')).toBeNull();
    expect(extractErrorLine('')).toBeNull();
    expect(extractErrorLine(`##[error]${'x'.repeat(500)}`)).toHaveLength(200);
  });

  it('bounds recent failed runs and stops pagination at the evidence cutoff', () => {
    const recent = Array.from({ length: FAILED_RUN_LIMIT }, (_, index) => ({
      id: index + 1,
      created_at: '2026-09-06T00:00:00Z',
      conclusion: 'failure',
    }));
    let calls = 0;
    const bounded = collectRecentPages(
      () => {
        calls++;
        return recent;
      },
      {
        cutoff: '2026-09-01T00:00:00Z',
        maxPages: 10,
        maxItems: FAILED_RUN_LIMIT,
        occurredAt: run => run.created_at,
        accept: run => run.conclusion === 'failure',
      },
    );
    expect(calls).toBe(1);
    expect(bounded.values).toHaveLength(FAILED_RUN_LIMIT);
    expect(bounded.truncated).toBe(true);

    calls = 0;
    const cutoffBounded = collectRecentPages(
      () => {
        calls++;
        return [
          { id: 1, updated_at: '2026-09-06T00:00:00Z' },
          { id: 2, updated_at: '2026-08-31T23:59:59Z' },
          { id: 3, updated_at: '2026-08-30T00:00:00Z' },
        ];
      },
      {
        cutoff: '2026-09-01T00:00:00Z',
        maxPages: 10,
        maxItems: PULL_REQUEST_LIMIT,
        occurredAt: pull => pull.updated_at,
      },
    );
    expect(calls).toBe(1);
    expect(cutoffBounded.values.map(item => item.id)).toEqual([1]);
    expect(cutoffBounded.reached_cutoff).toBe(true);
    expect(cutoffBounded.truncated).toBe(false);
  });

  it('reports collection truncation in deterministic context', () => {
    const result = evaluateRetro(baseInput({
      collection: {
        api_request_ceiling: 700,
        failed_run_limit: FAILED_RUN_LIMIT,
        failed_runs_truncated: true,
        pull_request_limit: PULL_REQUEST_LIMIT,
        pull_requests_truncated: false,
      },
    }));
    expect(result.evidence_truncated).toBe(true);
    expect(result.collection.api_request_ceiling).toBeLessThan(1000);
    expect(result.collection.failed_run_limit).toBe(100);
  });

  it('recovers the unprocessed state tail from the latest updated checkpoint', () => {
    const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const checkpoint = {
      id: 1,
      user: { login: 'github-actions[bot]' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-09-05T00:00:00Z',
      body: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-05T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [],
      })[0].body,
    };
    const request = {
      id: 2001,
      user: { login: 'github-actions[bot]' },
      created_at: '2026-09-06T00:00:00Z',
      updated_at: '2026-09-06T00:00:00Z',
      body: stateComment({
        squad_artifact: 'retro-request',
        retro_id: '2',
        fingerprint,
      })[0].body,
    };
    const input = collectLiveInput({
      GITHUB_REPOSITORY: 'squad-test/example',
      GITHUB_WORKSPACE: scratch({}),
      SQUAD_RETRO_EVENT_NAME: 'schedule',
    }, {
      now: new Date('2026-09-07T00:00:00Z'),
      fetchJson: (route, fields) => {
        if (route.endsWith('/issues')) {
          return stateIssue().map(issue => ({ ...issue, user: { login: issue.author } }));
        }
        if (route.endsWith('/comments')) {
          if (fields.since) return fields.page === 1 ? [checkpoint, request] : [];
          const page = Number(fields.page);
          const values = Array.from({ length: 100 }, (_, index) => ({
            id: page * 100 + index,
            user: { login: 'octocat' },
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            body: 'unrelated',
          }));
          if (page === 1) values[0] = checkpoint;
          return values;
        }
        if (route.endsWith('/actions/runs')) return { workflow_runs: [] };
        if (route.endsWith('/pulls')) return [];
        throw new Error(`Unexpected API route: ${route}`);
      },
    });
    expect(input.collection).toMatchObject({
      state_comments_truncated: false,
      state_checkpoint_tail_recovered: true,
    });
    expect(evaluateRetro({ ...input, workflowRuns: [failure()] }).pending_fingerprints)
      .toEqual([fingerprint]);
  });

  it('fails closed before mutations when the checkpoint tail is incomplete', () => {
    const result = evaluateRetro(baseInput({
      workflowRuns: [failure(), failure({ id: 102 })],
      collection: {
        state_comments_truncated: true,
        failed_runs_truncated: false,
        pull_requests_truncated: false,
      },
    }));
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('state-ledger-incomplete');
    expect(result.state_ledger_incomplete).toBe(true);
    expect(result.qualifying_groups).toHaveLength(1);
  });

  it.each(['reviews', 'files', 'jobs'])('preserves evidence beyond inner %s page limits', endpoint => {
    const failFingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
    const reviewFingerprint = evidenceFingerprint('review', 'Missing empty-input coverage|src');
    const preserved = endpoint === 'jobs' ? failFingerprint : reviewFingerprint;
    const expired = endpoint === 'jobs' ? reviewFingerprint : failFingerprint;
    const limit = endpoint === 'jobs' ? 2 : 3;
    const { input, result, calls, logCalls } = collectFixture({
      runs: endpoint === 'jobs' ? [failure({ name: 'CI' })] : [],
      pulls: endpoint === 'jobs' ? [] : [{
        number: 12, updated_at: '2026-09-06T00:00:00Z', labels: [],
      }],
      comments: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [failFingerprint, reviewFingerprint],
      }),
      nested: (route, fields) => {
        const page = Number(fields.page);
        if (route.endsWith('/jobs')) {
          return { jobs: page <= limit
            ? Array.from({ length: 100 }, (_, index) => ({
              id: page * 100 + index, name: 'successful job', conclusion: 'success',
            }))
            : [{ id: 999, name: 'test', conclusion: 'failure' }],
          };
        }
        if (route.endsWith('/reviews')) {
          return endpoint === 'reviews' && page <= limit
            ? Array.from({ length: 100 }, () => review({ state: 'APPROVED' }))
            : [review({ body: 'Missing empty-input coverage', commit_id: 'b'.repeat(40) })];
        }
        if (route.endsWith('/files')) {
          return page <= limit
            ? Array.from({ length: 100 }, (_, index) => ({
              filename: `docs/page-${page}-${index}.md`,
            }))
            : [{ filename: 'src/missing-coverage.ts' }];
        }
        throw new Error(`Unexpected API route: ${route}`);
      },
    });
    const nestedCalls = calls.filter(call => call.route.endsWith(`/${endpoint}`));
    expect(nestedCalls.map(call => call.page)).toEqual(
      Array.from({ length: limit }, (_, index) => index + 1),
    );
    expect(input.collection.failed_runs_truncated).toBe(endpoint === 'jobs');
    expect(input.collection.pull_requests_truncated).toBe(endpoint !== 'jobs');
    expect(input.collection.run_jobs_truncated).toBe(endpoint === 'jobs');
    expect(input.collection.reviews_truncated).toBe(endpoint === 'reviews');
    expect(input.collection.files_truncated).toBe(endpoint === 'files');
    expect(result.evidence_truncated).toBe(true);
    expect(result.action).toBe('housekeep');
    expect(result.truncation_preserved_fingerprints).toEqual([preserved]);
    expect(result.pending_fingerprints).toEqual([preserved]);
    expect(result.expired_pending_fingerprints).toEqual([expired]);
    expect(calls.length + logCalls).toBeLessThanOrEqual(input.collection.api_request_ceiling);
  });

  it('preserves pending failures from additional failed jobs not inspected within the log budget', () => {
    const skipped = evidenceFingerprint('fail', 'CI|integration|second regression');
    const { input, result, logCalls } = collectFixture({
      runs: [failure({ name: 'CI' })],
      comments: stateComment({
        status: 'IDLE',
        completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: [],
        pending_fingerprints: [skipped],
      }),
      nested: route => {
        if (route.endsWith('/jobs')) {
          return {
            jobs: [
              { id: 1, name: 'test', conclusion: 'failure' },
              { id: 2, name: 'integration', conclusion: 'failure' },
            ],
          };
        }
        throw new Error(`Unexpected API route: ${route}`);
      },
    });
    expect(logCalls).toBe(1);
    expect(input.collection.job_logs_truncated).toBe(true);
    expect(input.collection.failed_runs_truncated).toBe(true);
    expect(result.truncation_preserved_fingerprints).toEqual([skipped]);
    expect(result.pending_fingerprints).toEqual([skipped]);
    expect(result.expired_pending_fingerprints).toEqual([]);
  });

  it.each(['unavailable', 'bytes', 'lines', 'binary', 'partial'])(
    'preserves pending failures when job logs are incomplete: %s', scenario => {
      const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
      const { input, result, logCalls } = collectFixture({
        runs: [failure({ name: 'CI' })],
        comments: stateComment({
          status: 'IDLE', completed_at: '2026-09-03T00:00:00Z',
          resolved_fingerprints: [], pending_fingerprints: [fingerprint],
        }),
        nested: () => ({ jobs: [{ id: 1, name: 'test', conclusion: 'failure' }] }),
        log: () => {
          if (scenario === 'unavailable') throw new Error('logs unavailable');
          if (scenario === 'partial') {
            throw Object.assign(new Error('maxBuffer exceeded'), {
              stdout: Buffer.from('##[error]another failure'),
            });
          }
          const prefix = scenario === 'bytes' ? 'x'.repeat(262144) :
            scenario === 'lines' ? 'passed\n'.repeat(2000) : 'PK\u0000';
          return Buffer.from(`${prefix}\n##[error]Expected 2 but got 1`);
        },
      });
      expect(logCalls).toBe(1);
      expect(input.collection.run_jobs_truncated).toBe(false);
      expect(input.collection.job_logs_truncated).toBe(true);
      expect(input.collection.failed_runs_truncated).toBe(true);
      expect(input.collection.pull_requests_truncated).toBe(false);
      expect(result.evidence_truncated).toBe(true);
      expect(result.action).toBe('noop');
      expect(result.pending_fingerprints).toEqual([fingerprint]);
      expect(result.truncation_preserved_fingerprints).toEqual([fingerprint]);
      expect(result.expired_pending_fingerprints).toEqual([]);
    },
  );

  it('expires missing fingerprints only after complete nested evidence collection', () => {
    const missing = [
      evidenceFingerprint('fail', 'CI|test|missing failure'),
      evidenceFingerprint('review', 'missing rejection|src'),
    ];
    const { input, result } = collectFixture({
      runs: [failure({ name: 'CI' })],
      pulls: [{ number: 12, updated_at: '2026-09-06T00:00:00Z', labels: [] }],
      comments: stateComment({
        status: 'IDLE', completed_at: '2026-09-03T00:00:00Z',
        resolved_fingerprints: [], pending_fingerprints: missing,
      }),
      nested: route => {
        if (route.endsWith('/jobs')) {
          return { jobs: [{ id: 1, name: 'test', conclusion: 'failure' }] };
        }
        if (route.endsWith('/reviews')) {
          return [review({ body: 'Missing empty-input coverage', commit_id: 'b'.repeat(40) })];
        }
        if (route.endsWith('/files')) return [{ filename: 'src/example.ts' }];
        throw new Error(`Unexpected API route: ${route}`);
      },
    });
    expect(input.collection).toMatchObject({
      failed_runs_truncated: false, run_jobs_truncated: false, job_logs_truncated: false,
      pull_requests_truncated: false, reviews_truncated: false, files_truncated: false,
    });
    expect(result.evidence_truncated).toBe(false);
    expect(result.action).toBe('housekeep');
    expect(result.expired_pending_fingerprints).toEqual(missing);
    expect(result.truncation_preserved_fingerprints).toEqual([]);
  });

  it('retains the exact bounded API ceiling including all nested pages and log requests', () => {
    let calls = 0;
    const full = (value: Record<string, unknown>) => Array.from({ length: 100 }, () => value);
    const input = collectLiveInput({
      GITHUB_REPOSITORY: 'squad-test/example',
      GITHUB_WORKSPACE: scratch({}),
      SQUAD_RETRO_EVENT_NAME: 'schedule',
    }, {
      now: new Date('2026-09-07T00:00:00Z'),
      fetchJson: (route, fields) => {
        calls++;
        const page = fields.page;
        if (route.endsWith('/issues')) {
          if (page < 20) return full({ title: 'Unrelated' });
          return fields.labels ? [] : [{
            ...stateIssue()[0], user: { login: 'github-actions[bot]' },
          }];
        }
        if (route.endsWith('/comments')) {
          if (fields.since) {
            return full({
              id: 2000 + Number(page),
              user: { login: 'octocat' },
              created_at: '2026-09-06T00:00:00Z',
              updated_at: '2026-09-06T00:00:00Z',
              body: 'request',
            });
          }
          const values = full({
            id: Number(page) * 100,
            user: { login: 'octocat' },
            created_at: '2026-09-01T00:00:00Z',
            updated_at: '2026-09-01T00:00:00Z',
            body: 'unrelated',
          });
          if (page === 1) {
            values[0] = {
              id: 1,
              user: { login: 'github-actions[bot]' },
              created_at: '2026-09-01T00:00:00Z',
              updated_at: '2026-09-05T00:00:00Z',
              body: stateComment({
                status: 'IDLE',
                completed_at: '2026-09-05T00:00:00Z',
                resolved_fingerprints: [],
                pending_fingerprints: [],
              })[0].body,
            };
          }
          return values;
        }
        if (route.endsWith('/actions/runs')) {
          return { workflow_runs: full(failure({
            name: 'CI', conclusion: page < 10 ? 'success' : 'failure',
          })) };
        }
        if (route.endsWith('/jobs')) {
          return { jobs: full({ id: 1, name: 'test', conclusion: 'failure' }) };
        }
        if (route.endsWith('/pulls')) {
          return full({
            number: 12, updated_at: '2026-09-06T00:00:00Z',
            labels: page < 10 ? ['squad-retro'] : [],
          });
        }
        if (route.endsWith('/reviews')) {
          return full(review({ body: 'Missing empty-input coverage', commit_id: 'b'.repeat(40) }));
        }
        if (route.endsWith('/files')) return full({ filename: 'src/example.ts' });
        throw new Error(`Unexpected API route: ${route}`);
      },
      fetchLog: () => {
        calls++;
        return Buffer.from('##[error]Expected 2 but got 1');
      },
    });
    expect(input.collection.log_requests_per_run).toBe(1);
    expect(calls).toBe(4 * 20 + 10 + 100 * (2 + 1) + 10 + 50 * (3 + 3));
    expect(calls).toBe(input.collection.api_request_ceiling);
    expect(calls).toBeLessThan(1000);
  });

  it('short-circuits collection when the retrospective is disabled by config', () => {
    const workspace = scratch({ squadRetro: 'deny' });
    const input = collectLiveInput({
      GITHUB_REPOSITORY: 'squad-test/does-not-exist',
      GITHUB_WORKSPACE: workspace,
      SQUAD_RETRO_EVENT_NAME: 'schedule',
    });
    expect(input.stateIssues).toEqual([]);
    expect(input.workflowRuns).toEqual([]);
    expect(input.reviews).toEqual([]);
    expect(input.collection.api_request_ceiling).toBe(700);
    expect(evaluateRetro(input as never).action).toBe('noop');
    expect(evaluateRetro(input as never).reason).toBe('disabled-by-config');
  });

  it('fails closed on malformed config and noops safely on collection failure', () => {
    const invalid = scratch({ squadRetroWindowHours: 0 });
    const invalidRun = spawnSync(
      process.execPath,
      [GATE, '--output', resolve(invalid, 'context.json')],
      {
        cwd: invalid,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_WORKSPACE: invalid,
          GITHUB_REPOSITORY: 'squad-test/does-not-exist',
        },
      },
    );
    expect(invalidRun.status).toBe(1);
    expect(invalidRun.stderr).toContain('squadRetroWindowHours');

    const transient = scratch({});
    const output = resolve(transient, 'context.json');
    const transientRun = spawnSync(
      process.execPath,
      [GATE, '--output', output],
      {
        cwd: transient,
        encoding: 'utf8',
        env: {
          GITHUB_WORKSPACE: transient,
          GITHUB_REPOSITORY: 'squad-test/does-not-exist',
          SystemRoot: process.env.SystemRoot ?? '',
          PATH: '',
          Path: '',
        },
      },
    );
    expect(transientRun.status).toBe(0);
    const context = JSON.parse(readFileSync(output, 'utf8'));
    expect(context.action).toBe('noop');
    expect(context.reason).toBe('evidence-collection-unavailable');
    expect(String(context.diagnostic).length).toBeGreaterThan(0);
    expect(context.pending_fingerprints).toEqual([]);
    expect(context.expired_pending_fingerprints).toEqual([]);
    expect(context.truncation_preserved_fingerprints).toEqual([]);
    expect(collectionFailureContext(new Error('boom'), {}).reason)
      .toBe('evidence-collection-unavailable');
  });
});

describe('Squad retrospective workflow integration', () => {
  it('wires schedule, manual dispatch, worker wakeups, and one non-cancelling slot', () => {
    expect(RETRO).toContain('- cron: "weekly on monday"');
    expect(RETRO).toContain('- cron: "every 6h"');
    expect(RETRO).toContain('group: squad-retro');
    expect(RETRO).toContain('cancel-in-progress: false');
    expect(RETRO).toContain('queue: max');
    expect(RETRO).toContain('shared/squad-retro-evidence.mjs');
    expect(ROUTER).toContain('| `/squad retro` | Retrospective Relay |');
    expect(ROUTER).toContain('"workflow_name": "squad-retro"');
    expect(REVIEWER).toContain('"request_origin": "squad-review"');
    expect(IMPLEMENTER).toContain('"request_origin": "squad-implement"');
    expect(CI).toContain(
      'for WF in squad squad-implement-worker squad-review squad-deps-worker squad-retro; do',
    );
    expect(CI).toContain(
      'squad-deps-worker.lock.yml squad-retro.lock.yml; do',
    );
  });

  it('keeps governance changes human-reviewed and partial retries idempotent', () => {
    expect(RETRO).not.toMatch(/^tools:\n\s+edit:/m);
    expect(RETRO).not.toMatch(/^\s+create-pull-request:/m);
    expect(RETRO).not.toMatch(/^\s+dispatch-workflow:/m);
    expect(RETRO).toContain('Action-Key:');
    expect(RETRO).toContain('open and closed issues labeled `squad-retro-action`');
    expect(RETRO).toContain('human review');
    expect(RETRO).toContain('Do not propose a new coordinator');
  });

  it('gives the deterministic gate a read-only token and a safe failure path', () => {
    expect(RETRO).toContain('GH_TOKEN: ${{ github.token }}');
    expect(RETRO).toMatch(/permissions:\n  contents: read\n/);
    expect(RETRO).not.toMatch(/^permissions:[\s\S]*?^\s{2}(issues|contents|pull-requests): write$/m);
    expect(RETRO).toContain('evidence-collection-unavailable');
    expect(RETRO).toContain('Squad retro diagnostic');
  });

  it('states the durable request and nullable fingerprint contracts', () => {
    expect(RETRO).toContain('required: [squad_artifact, schema_version, retro_id, fingerprint]');
    expect(RETRO).toContain('type: ["string", "null"]');
    expect(RETRO).toContain('`already_pending`');
    expect(RETRO).toContain('fingerprint: null');
    expect(RETRO).toContain('low_confidence');
    expect(RETRO).toContain('the head SHA is\ndeliberately excluded');
    expect(RETRO).toContain('bounded and non-exhaustive');
    expect(RETRO).toContain('truncation_preserved_fingerprints');
    expect(RETRO).toContain('never resolve it merely because evidence is absent');
    expect(RETRO).toContain('`failed_runs_truncated` flag includes incomplete job pagination');
    expect(RETRO).toContain('includes incomplete review and file pagination');
    expect(RETRO).toContain('collector ceiling remains 700 API');
    expect(RETRO).toContain('state-ledger-incomplete');
    expect(RETRO).toContain('`state_last_full_completed_at`');
  });

  it('limits drain actions to new or recurring qualifying evidence, not merely pending requests', () => {
    expect(RETRO).toContain('`qualifying_groups` excludes resolved evidence');
    expect(RETRO).toContain('is later than its resolution timestamp; pending requests do not bypass this');
    expect(RETRO).toContain('Manual and weekly reports may include resolved evidence');
    expect(RETRO).toContain('remain idempotent by `Action-Key:`');
  });

  it('requires explicit label repair followed by noop without creating another issue', () => {
    const repair = RETRO.match(/- `repair_state_label`:([\s\S]*?)(?=\n- `suppress`)/)?.[1] ?? '';
    expect(repair).toContain('`missing_label`');
    expect(repair).toContain('`state_issue` using `add-labels`, then `noop`');
    expect(repair).toContain('Do not create another');
    expect(repair).toContain('same-title human-authored issue');
  });

  it('strict-compiles the worker with bounded safe outputs', () => {
    const workspace = scratch();
    const workflowDir = resolve(workspace, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    execFileSync(
      'gh',
      ['aw', 'compile', 'squad-retro', '--strict', '--no-check-update'],
      { cwd: workspace, encoding: 'utf8', stdio: 'pipe' },
    );
    const lock = readFileSync(resolve(workflowDir, 'squad-retro.lock.yml'), 'utf8');
    const config = JSON.parse(extractSafeOutputsConfigJson(lock)!) as Record<string, {
      max?: number;
      data_schema?: { required?: string[] };
    }>;
    expect(config.create_issue.max).toBe(6);
    expect(config.add_comment.max).toBe(8);
    expect(config.add_comment.data_schema?.required).toContain('fingerprint');
    expect(config).not.toHaveProperty('create_pull_request');
    expect(config).not.toHaveProperty('dispatch_workflow');
    const agent = lock.match(/^  agent:\n([\s\S]*?)(?=^  [\w-]+:\n)/m)?.[1] ?? '';
    expect(agent).not.toMatch(/^\s+(issues|pull-requests|contents): write$/m);
  }, 30000);
});
