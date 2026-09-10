import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  collectRecentPages,
  collectLiveInput,
  collectRetroContext,
  collectRemediationInput,
  collectStateIssues,
  collectionFailureContext,
  deriveActionTemporaryId,
  deriveActionTemporaryIds,
  deriveAutoImplementCandidates,
  deriveRequestGroup,
  evaluateRetro,
  evidenceFingerprint,
  extractErrorLine,
  hasTrustedActionProvenance,
  AUTO_IMPLEMENT_MAX,
  AUTO_IMPLEMENT_MAX_ATTEMPTS,
  FAILED_RUN_LIMIT,
  normalizeSignature,
  PULL_REQUEST_LIMIT,
  resolveRetroConfig,
  SELF_PULL_VERIFICATION_LIMIT,
  SELF_PULL_FETCH_LIMIT,
} from '../workflows/shared/squad-retro-evidence.mjs';
import { extractSafeOutputsConfigJson } from './helpers/gh-aw-lock.js';
import * as guard from '../workflows/shared/squad-retro-provenance.mjs';

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

let compiledRetroLockText: string | null = null;

/** The real compiled squad-retro lock, compiled once per file run. */
function compiledRetroLock(): string {
  if (compiledRetroLockText !== null) return compiledRetroLockText;
  const workspace = scratch();
  const workflowDir = resolve(workspace, '.github', 'workflows');
  mkdirSync(workflowDir, { recursive: true });
  cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  execFileSync(
    'gh',
    ['aw', 'compile', 'squad-retro', '--strict', '--no-check-update'],
    { cwd: workspace, encoding: 'utf8', stdio: 'pipe', timeout: 60000 },
  );
  compiledRetroLockText = readFileSync(resolve(workflowDir, 'squad-retro.lock.yml'), 'utf8');
  return compiledRetroLockText;
}

/** The `safe_outputs:` job block of a compiled lock, up to the next job key. */
function safeOutputsJob(lock: string): string {
  const marker = '\n  safe_outputs:\n';
  const start = lock.indexOf(marker);
  expect(start, 'compiled lock must contain a safe_outputs job').toBeGreaterThan(-1);
  const body = lock.slice(start + marker.length);
  const next = /^ {2}[\w-]+:\n/m.exec(body);
  return next ? body.slice(0, next.index) : body;
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
      autoImplementEnabled: false,
      autoImplementRetryHours: 48,
      threshold: 2,
      windowHours: 168,
      cooldownHours: 72,
    });
    expect(() => resolveRetroConfig({ squadRetroEarlyThreshold: 1 })).toThrow();
    expect(() => resolveRetroConfig({ squadRetro: true })).toThrow();
    expect(() => resolveRetroConfig({ squadRetroAutoImplement: 'yes' })).toThrow();
    expect(() => resolveRetroConfig({ squadRetroAutoImplementRetryHours: 0 })).toThrow();
    expect(resolveRetroConfig({ squadRetroAutoImplement: 'allow' }).autoImplementEnabled).toBe(true);
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
    // Labels cannot suppress PRs. The first page supplies fifty candidates
    // here, so nine formerly skipped label-only pages are no longer requested.
    expect(calls).toBe(4 * 20 + 10 + 100 * (2 + 1) + 1 + 50 * (3 + 3));
    expect(input.collection.self_pull_verifications).toBe(0);
    expect(input.collection.api_request_ceiling).toBe(calls + 9 + SELF_PULL_VERIFICATION_LIMIT + SELF_PULL_FETCH_LIMIT);
    expect(input.collection.api_request_ceiling).toBe(720);
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
    expect(input.collection.api_request_ceiling).toBe(720);
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
    expect(ROUTER).toContain('| `/squad retro` | Retro Relay |');
    expect(ROUTER).toMatch(/"workflow_name"\s*:\s*"squad-retro"/);
    expect(REVIEWER).toContain('"request_origin": "squad-review"');
    expect(IMPLEMENTER).toContain('"request_origin": "squad-implement"');
    expect(CI).toContain(
      'for WF in squad squad-implement-worker squad-review squad-deps-worker squad-retro squad-improvement-worker; do',
    );
    expect(CI).toContain(
      'squad-deps-worker.lock.yml squad-retro.lock.yml squad-improvement-worker.lock.yml; do',
    );
  });

  it('keeps governance changes human-reviewed and partial retries idempotent', () => {
    expect(RETRO).not.toMatch(/^tools:\n\s+edit:/m);
    expect(RETRO).not.toMatch(/^\s+create-pull-request:/m);
    expect(RETRO).toContain('Action-Key:');
    expect(RETRO).toContain('open and closed issues labeled `squad-retro-action`');
    expect(RETRO).toContain('human review');
    expect(RETRO).toContain('Do not propose a new coordinator');
  });

  it('bounds the opt-in auto-implement dispatch to squad-implement-worker only, never proposals', () => {
    // squad-retro's only mutation beyond issues/comments/labels/state is this
    // single, narrowly-targeted relay (#2005 follow-up) -- it must never grow
    // into a general dispatch-workflow escape hatch.
    const flat = RETRO.replace(/\s+/g, ' ');
    expect(RETRO).toMatch(/^\s+dispatch-workflow:\n\s+workflows: \[squad-implement-worker\]\n\s+max: 3\n\s+target-ref:/m);
    expect(RETRO).toContain('Opt-in and disabled by default');
    expect(RETRO).toContain('"squadRetroAutoImplement":\n"allow"');
    expect(flat).toContain('never dispatch a proposal-labeled issue under any circumstance');
    expect(flat).toContain('always produces a **draft** pull request');
  });

  it('refuses every dispatch at the output boundary when auto-implementation is disabled', () => {
    // The default is enforced by code in a job the agent cannot reach, not by
    // the agent believing an empty candidate list.
    const steps = RETRO.match(/^ {2}steps:\n([\s\S]*?)^ {2}data:/m)?.[1] ?? '';
    expect(steps).toContain('shared/squad-retro-provenance.mjs');
    expect(steps).toContain('enforceRetroSafeOutputs');
    expect(steps).toContain('core.setFailed');
    // The guard needs the trusted base on disk: squad-retro has no
    // create-pull-request, so gh-aw adds no checkout of its own.
    expect(steps).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
    expect(steps).toContain('persist-credentials: false');
    expect(steps).toContain('ref: refs/heads/${{ github.event.repository.default_branch }}');
    expect(steps).toContain('SQUAD_RETRO_DEFAULT_BRANCH');
    expect(RETRO).toContain('shared/squad-retro-provenance.mjs');
    expect(RETRO.replace(/\s+/g, ' ')).toContain('REFUSED here');
  });

  it('writes the durable dispatch marker BEFORE dispatching, so a lost output retries instead of duplicating', () => {
    // Safe outputs are applied one at a time and are not transactional. A
    // marker without a dispatch is recovered by the bounded retry; a dispatch
    // without a marker would look un-dispatched and run twice, and a dispatch
    // whose create_issue failed has no authoritative action issue at all.
    const section = RETRO.slice(RETRO.indexOf('## Auto-implementation dispatch'));
    const createIndex = section.indexOf('the `create_issue` for the action');
    const markerIndex = section.indexOf('Squad-Retro-Dispatch: #{temporary_id} at {context.now}');
    const dispatchIndex = section.indexOf('"workflow_name": "squad-implement-worker"');
    expect(createIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeGreaterThan(createIndex);
    expect(dispatchIndex).toBeGreaterThan(markerIndex);
    const flat = section.replace(/\s+/g, ' ');
    expect(flat).toContain('Safe outputs are applied one at a time and are not transactional');
    expect(flat).toContain('a failed comment does not cancel a later dispatch');
    expect(flat).toContain('an unresolved reference is a failed dispatch, never a silent success');
  });

  it('keeps the action creation ceiling independent of the dispatch cap', () => {
    // Creating more than three actions in one run stays normal; the extra ones
    // are dispatched by a later reconciliation instead of being dropped.
    expect(RETRO).toContain('max: 6');
    expect(RETRO).toContain('Open at most five issues');
    expect(RETRO.replace(/\s+/g, ' ')).toContain(
      'That cap is independent of the action/report creation ceiling',
    );
  });

  it('requires trusted provenance and a visible hand-off when the retry budget is spent', () => {
    // A label alone is not provenance (FIDO review #1), and an exhausted
    // retry budget must reach a human instead of disappearing.
    const flat = RETRO.replace(/\s+/g, ' ');
    expect(flat).toContain('carries trusted retrospective provenance');
    expect(flat).toContain('a relabeled human-authored issue can never enter this list');
    expect(flat).toContain('standalone and unindented');
    expect(RETRO).toContain('Squad-Retro-Dispatch-Abandoned: #{issue_number}');
    expect(flat).toContain('auto_implement_exhausted');
  });

  it('documents the reconcile outcome as maintenance that never touches state or pending requests', () => {
    // `reconcile` is the only gate outcome whose whole contract is prompt-side:
    // the module decides WHEN it happens, the prompt decides what it may do.
    const reconcile = RETRO.match(/- `reconcile`:([\s\S]*?)(?=\n- `run`)/)?.[1] ?? '';
    expect(reconcile).not.toBe('');
    const flat = reconcile.replace(/\s+/g, ' ');
    expect(flat).toContain('six-hourly periodic reconciliation path');
    expect(flat).toContain('do exactly what `suppress` does for `incoming_request`');
    expect(flat).toContain('never call `upsert_retro_state`');
    expect(flat).toContain('never clear or resolve a pending fingerprint on this path');
    expect(flat).toContain('an early request that arrives during cooldown must survive it untouched');
    expect(flat).toContain('apply **Auto-implementation dispatch**');
  });

  it('reports linked implement pull requests as human-managed instead of retrying them', () => {
    const flat = RETRO.replace(/\s+/g, ' ');
    expect(flat).toContain('every `auto_implement_suppressed` entry with its `pull_state`');
    expect(flat).toContain(
      'A `closed-unmerged` entry means a human closed that implementation without merging it',
    );
    expect(flat).toContain('never re-dispatch, reopen, or open a rival pull request for it');
    expect(flat).toContain('Never dispatch an `auto_implement_suppressed` entry');
  });

  it('sends the typed origin and action key on every dispatch, and never a hand-rolled aw_context', () => {
    const payload = RETRO.match(
      /```json\n(\{\n {2}"workflow_name": "squad-implement-worker"[\s\S]*?)\n```/,
    )?.[1];
    expect(payload, 'the dispatch payload must be a single parseable JSON block').toBeDefined();
    const parsed = JSON.parse(payload!) as { workflow_name: string; inputs: Record<string, string> };
    expect(parsed.workflow_name).toBe('squad-implement-worker');
    expect(Object.keys(parsed.inputs).sort()).toEqual([
      'issue_number', 'request_origin', 'retro_action_key',
    ]);
    expect(parsed.inputs.request_origin).toBe('squad-retro');
    expect(RETRO.replace(/\s+/g, ' ')).toContain('Do not supply `aw_context`');
  });

  it('tells the agent to use the gate\'s deterministic temporary id for a same-run action', () => {
    const flat = RETRO.replace(/\s+/g, ' ');
    expect(flat).toContain('`temporary_id` set to the exact value in `auto_implement_new_action_ids`');
    expect(flat).toContain('Never invent, reuse, or reorder one');
    expect(flat).toContain('the sealed plan assigns distinct IDs in full-fingerprint order');
  });

  it('publishes an approval template that matches what the improvement gate accepts', () => {
    // The gate refuses an approval that does not enumerate the proposed
    // paths, so the proposal issue has to tell the maintainer that exact form.
    expect(RETRO).toContain('/squad approve-improvement');
    expect(RETRO).toContain('Approved-Path: {first proposed path}');
    expect(RETRO).toContain('/squad revoke-improvement');
    expect(RETRO).toContain('Never post that command yourself in a comment');
  });

  it('keeps the dispatch target draft-only for every caller, retro or not', () => {
    // gh-aw already defaults `draft` to true; pinning it explicitly makes the
    // guarantee survive a future default change now that an automated,
    // untrusted-origin caller can reach this worker. Compiling proves the
    // pinned value is what actually ships.
    const workspace = mkdtempSync(resolve(ROOT, '.squad-implement-draft-'));
    try {
      const workflowDir = resolve(workspace, '.github', 'workflows');
      mkdirSync(workflowDir, { recursive: true });
      cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
      execFileSync('git', ['init', '--quiet'], { cwd: workspace });
      execFileSync(
        'gh',
        ['aw', 'compile', 'squad-implement-worker', '--strict', '--no-check-update'],
        { cwd: workspace, encoding: 'utf8', stdio: 'pipe' },
      );
      const lock = readFileSync(resolve(workflowDir, 'squad-implement-worker.lock.yml'), 'utf8');
      const config = JSON.parse(extractSafeOutputsConfigJson(lock)!) as Record<string, { draft?: boolean }>;
      expect(config.create_pull_request.draft).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 60000);

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
    expect(RETRO).toContain('collector ceiling is 720 API');
    expect(RETRO).toContain('self_pull_verification_limit');
    expect(RETRO).toContain('squad:retro-action');
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
    const lock = compiledRetroLock();
    const config = JSON.parse(extractSafeOutputsConfigJson(lock)!) as Record<string, {
      max?: number;
      data_schema?: { required?: string[] };
      workflows?: string[];
      allowed_labels?: string[];
    }>;
    expect(config.create_issue.max).toBe(6);
    expect(config.create_issue.allowed_labels).toEqual(
      expect.arrayContaining(['squad-retro-action', 'squad-retro-proposal', 'squad:*']),
    );
    expect(config.add_comment.max).toBe(14);
    expect(config.add_comment.data_schema?.required).toContain('fingerprint');
    expect(config).not.toHaveProperty('create_pull_request');
    // squad-retro's ONLY mutation beyond issues/comments/labels/state is the
    // bounded, opt-in relay to squad-implement-worker (#2005 follow-up); it
    // must never gain a broader dispatch surface.
    expect(config.dispatch_workflow?.workflows).toEqual(['squad-implement-worker']);
    expect(config.dispatch_workflow?.max).toBe(3);
    const agent = lock.match(/^  agent:\n([\s\S]*?)(?=^  [\w-]+:\n)/m)?.[1] ?? '';
    expect(agent).not.toMatch(/^\s+(issues|pull-requests|contents): write$/m);
  }, 30000);

  // -------------------------------------------------------------------------
  // FIDO blocker 2: this workflow's own comment claimed the dispatch guard ran
  // "after a fresh checkout of the trusted ref", but the checkout it added had
  // no `ref:` at all -- so actions/checkout materialized the TRIGGERING ref, and
  // a run started from any other branch would have authorized its own dispatch
  // with that branch's `.squad/config.json` and that branch's guard code. Both
  // the pin and the ordering are asserted against the real compiler output.
  // -------------------------------------------------------------------------
  it('compiles the dispatch guard behind an unconditional, default-branch-pinned checkout', () => {
    const job = safeOutputsJob(compiledRetroLock());

    const trustedIndex = job.indexOf('name: Checkout trusted base for the dispatch guard');
    const guardIndex = job.indexOf('name: Enforce retro dispatch provenance before any output');
    const processIndex = job.indexOf('name: Process Safe Outputs');
    expect(trustedIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeGreaterThan(trustedIndex);
    expect(processIndex).toBeGreaterThan(guardIndex);

    const trustedStep = job.slice(trustedIndex, guardIndex);
    expect(trustedStep).toContain(
      'uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    );
    // The pin itself. `refs/heads/` is deliberate: an empty default_branch
    // fails the checkout instead of silently falling back to the trigger ref.
    expect(trustedStep).toContain('ref: refs/heads/${{ github.event.repository.default_branch }}');
    expect(trustedStep).toContain('persist-credentials: false');
    expect(trustedStep).toContain('path: .squad-trusted-base');
    expect(trustedStep).not.toMatch(/\n\s+(if|continue-on-error):/);
    // squad-retro has no create-pull-request, so gh-aw contributes no checkout
    // of its own here: this one is the only one, and it must never be skippable.
    expect(job.slice(0, trustedIndex)).not.toContain('uses: actions/checkout@');

    // A failing guard has to stop everything, so neither it nor gh-aw's
    // processing step may carry an `if:` that survives a failed predecessor.
    const guardStep = job.slice(guardIndex, processIndex);
    expect(guardStep).not.toMatch(/\n\s+(if|continue-on-error):/);
    expect(guardStep).toContain('core.setFailed');
    // Config and guard code both come from the trusted checkout: the relay is
    // authorized by what ships on the default branch and nothing else.
    expect(guardStep).toContain(".squad-trusted-base'");
    expect(guardStep).toContain('GITHUB_WORKSPACE: trustedRoot');
    expect(guardStep).not.toMatch(
      /nodePath\.join\(\s*process\.env\.GITHUB_WORKSPACE,\s*'\.github\/workflows\/shared/,
    );
  }, 30000);
});

describe('Squad retro -> squad-implement-worker auto-dispatch (#2005 follow-up)', () => {
  const ACTION_KEY = 'fail:0123456789abcdef';
  const actionIssue = (overrides: Record<string, unknown> = {}) => ({
    number: 500,
    state: 'open',
    author: 'github-actions[bot]',
    labels: ['squad', 'squad-retro-action'],
    body: `Fix the thing.\n\nAction-Key: ${ACTION_KEY}\n`,
    comments: [],
    ...overrides,
  });
  const dispatchMarker = (issueNumber: number, at: string) => ({
    author: 'github-actions[bot]',
    body: `Squad-Retro-Dispatch: #${issueNumber} at ${at}`,
    created_at: at,
  });
  // Every candidate list assertion below is about the eligible set's issue
  // numbers and retry flags; `action_key` propagation and the suppressed set
  // have their own dedicated tests.
  const derive = (args: Parameters<typeof deriveAutoImplementCandidates>[0]) =>
    deriveAutoImplementCandidates(args).eligible.map(({ action_key: _key, ...rest }) => rest);
  const nativeResponse = (statesByIssue: Record<number, string> = {}) =>
    (_query: string, variables: Record<string, unknown>) => {
      const state = statesByIssue[Number(variables.number)];
      return {
        data: {
          repository: {
            issue: {
              closedByPullRequestsReferences: {
                nodes: state ? [{ number: 900 + Number(variables.number), state }] : [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      };
    };
  const noNativeLinks = nativeResponse();

  describe('deriveAutoImplementCandidates', () => {
    it('is eligible on first sight with no prior dispatch marker', () => {
      const result = derive({
        actionIssues: [actionIssue()],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([{ issue_number: 500, retry: false }]);
    });

    it('excludes a proposal-labeled issue -- governance stays human-review-only', () => {
      const result = derive({
        actionIssues: [actionIssue({ labels: ['squad', 'squad-retro-action', 'squad-retro-proposal'] })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([]);
    });

    it('excludes a closed action issue', () => {
      const result = derive({
        actionIssues: [actionIssue({ state: 'closed' })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([]);
    });

    it('excludes an issue with an open squad-implement-worker pull request', () => {
      const result = derive({
        actionIssues: [actionIssue()],
        implementPulls: [{ number: 1, state: 'open', merged: false, head_ref: 'squad/implement-500-fix' }],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([]);
    });

    it('permanently excludes an issue whose fix already merged', () => {
      const result = derive({
        actionIssues: [actionIssue()],
        implementPulls: [{ number: 1, state: 'closed', merged: true, head_ref: 'squad/implement-500-fix' }],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([]);
    });

    it('excludes a recently dispatched issue until the retry cooldown elapses', () => {
      const recent = derive({
        actionIssues: [actionIssue({ comments: [dispatchMarker(500, '2026-09-06T12:00:00Z')] })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(recent).toEqual([]);
    });

    it('re-offers a durable retry once the marker ages past retryHours, with no matching pull request', () => {
      const result = derive({
        actionIssues: [actionIssue({ comments: [dispatchMarker(500, '2026-09-01T00:00:00Z')] })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([{ issue_number: 500, retry: true }]);
    });

    it('never retries past AUTO_IMPLEMENT_MAX_ATTEMPTS, regardless of marker age', () => {
      expect(AUTO_IMPLEMENT_MAX_ATTEMPTS).toBe(2);
      const comments = Array.from({ length: AUTO_IMPLEMENT_MAX_ATTEMPTS }, (_, index) =>
        dispatchMarker(500, `2026-0${index + 1}-01T00:00:00Z`));
      const result = derive({
        actionIssues: [actionIssue({ comments })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([]);
    });

    it('ignores a dispatch marker for a different issue number (no cross-issue bleed)', () => {
      const result = derive({
        actionIssues: [actionIssue({ comments: [dispatchMarker(999, '2026-09-06T23:00:00Z')] })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([{ issue_number: 500, retry: false }]);
    });

    it('ignores a marker-shaped comment not authored by the trusted bot', () => {
      const result = derive({
        actionIssues: [actionIssue({
          comments: [{ author: 'octocat', body: 'Squad-Retro-Dispatch: #500 at 2026-09-01T00:00:00Z' }],
        })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result).toEqual([{ issue_number: 500, retry: false }]);
    });

    it('sorts ascending by issue number and respects the bounded max', () => {
      const result = derive({
        actionIssues: [actionIssue({ number: 30 }), actionIssue({ number: 10 }), actionIssue({ number: 20 })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
        max: 2,
      });
      expect(result).toEqual([{ issue_number: 10, retry: false }, { issue_number: 20, retry: false }]);
      expect(AUTO_IMPLEMENT_MAX).toBeGreaterThanOrEqual(1);
    });

    it('throws on a non-ISO-8601 `now`', () => {
      expect(() => deriveAutoImplementCandidates({ actionIssues: [], implementPulls: [], now: 'not-a-date', retryHours: 48 }))
        .toThrow();
    });
  });

  describe('deriveAutoImplementCandidates: trusted provenance (FIDO review #1)', () => {
    // A `squad-retro-action` label proves nothing: anyone who can label an
    // issue could otherwise aim a privileged implementation run at arbitrary
    // human-authored text. Dispatch requires proof the issue really is a
    // retrospective artifact.
    const provenanceArgs = (issue: Record<string, unknown>) => ({
      actionIssues: [issue],
      implementPulls: [],
      now: '2026-09-07T00:00:00Z',
      retryHours: 48,
    });

    it('never dispatches a human-authored issue that merely carries the label', () => {
      expect(derive(provenanceArgs(actionIssue({ author: 'octocat' })))).toEqual([]);
    });

    it('never dispatches a bot-authored issue with no Action-Key line', () => {
      expect(derive(provenanceArgs(actionIssue({ body: 'Fix the thing.\n' })))).toEqual([]);
    });

    it('never dispatches an issue whose Action-Key is not a real evidence fingerprint', () => {
      for (const key of ['not-a-key', 'fail:zzzz', 'fail:0123', 'other:0123456789abcdef', '']) {
        expect(derive(provenanceArgs(actionIssue({ body: `Action-Key: ${key}\n` })))).toEqual([]);
      }
    });

    it('never dispatches an issue whose Action-Key is only mentioned inline, not on its own line', () => {
      expect(derive(provenanceArgs(actionIssue({
        body: `See Action-Key: ${ACTION_KEY} for details.\n`,
      })))).toEqual([]);
    });

    it('accepts a matching structured retro-action block alongside the Action-Key', () => {
      const body = [
        `Action-Key: ${ACTION_KEY}`,
        '',
        'Structured data:',
        '',
        '```json',
        JSON.stringify({
          squad_artifact: 'retro-action',
          schema_version: '1',
          retro_id: '42',
          fingerprint: ACTION_KEY,
        }),
        '```',
      ].join('\n');
      expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([{ issue_number: 500, retry: false }]);
    });

    it('refuses when the structured block and the Action-Key disagree (tampered or corrupt)', () => {
      const body = [
        `Action-Key: ${ACTION_KEY}`,
        '',
        'Structured data:',
        '',
        '```json',
        JSON.stringify({
          squad_artifact: 'retro-action',
          schema_version: '1',
          retro_id: '42',
          fingerprint: 'fail:ffffffffffffffff',
        }),
        '```',
      ].join('\n');
      expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([]);
    });

    it('refuses when the structured block claims a different artifact or schema version', () => {
      for (const data of [
        { squad_artifact: 'retro-report', schema_version: '1', fingerprint: ACTION_KEY },
        { squad_artifact: 'retro-action', schema_version: '2', fingerprint: ACTION_KEY },
      ]) {
        const body = `Action-Key: ${ACTION_KEY}\n\nStructured data:\n\n\`\`\`json\n${JSON.stringify(data)}\n\`\`\``;
        expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([]);
      }
    });

    it('never treats an unrelated fenced JSON reproduction as structured metadata (reviewer finding B)', () => {
      // An action issue whose own description happens to include a fenced
      // JSON reproduction (e.g. illustrating an unrelated config toggle) but
      // carries no real gh-aw "Structured data:" trailer at all must still be
      // trusted: `data` is optional, and an incidental fence is not a
      // malformed envelope, it is simply the absence of one.
      const body = [
        `Action-Key: ${ACTION_KEY}`,
        '',
        'The bug reproduces with a config like this:',
        '```json',
        JSON.stringify({ enabled: false }),
        '```',
      ].join('\n');
      expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([{ issue_number: 500, retry: false }]);
      expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(true);
    });

    it('refuses a genuinely malformed trailer instead of silently treating it as absent', () => {
      const body = [
        `Action-Key: ${ACTION_KEY}`,
        '',
        'Structured data:',
        '',
        '```json',
        '{"squad_artifact": "retro-action", not valid json',
        '```',
      ].join('\n');
      expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([]);
      expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(false);
    });

    // -------------------------------------------------------------------------
    // gh-aw's REAL safe-output serializer (actions/setup/js/safe_output_type_
    // validator.cjs @ v0.87.10, `STRUCTURED_DATA_LABEL` + `dataBlock`) appends
    // `${body}\n\n` + `Structured data:\n` + fenced JSON built with
    // `JSON.stringify(item.data, null, 2)` -- a SINGLE newline before the
    // fence, and pretty-printed, multi-line JSON, not the single-line
    // `JSON.stringify(data)` every other fixture in this file exercises. A
    // parser proven only against the compact idealized mock shape has never
    // actually been proven against what gh-aw writes to GitHub. This must
    // parse identically, still ignore an unrelated fenced JSON reproduction
    // quoted earlier in the same body, still distinguish "absent" from
    // "malformed", and still flow through the same receiver + reconciliation
    // trust decision as the compact form.
    // -------------------------------------------------------------------------
    describe('the real gh-aw v0.87.10 envelope shape (pretty-printed, single-newline)', () => {
      const realEnvelope = (data: Record<string, unknown>) =>
        `Structured data:\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
      const validData = { squad_artifact: 'retro-action', schema_version: '1', fingerprint: ACTION_KEY };

      it('parses gh-aw\'s real pretty-printed envelope exactly like the compact mock shape', () => {
        const body = `Action-Key: ${ACTION_KEY}\n\n${realEnvelope(validData)}`;
        expect(guard.parseStructuredData(body)).toEqual(validData);
        expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(true);
        expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([{ issue_number: 500, retry: false }]);
      });

      it('never mistakes an unrelated fenced JSON reproduction for the real trailer, even alongside it', () => {
        const body = [
          `Action-Key: ${ACTION_KEY}`,
          '',
          'For context, a config like this reproduces the bug:',
          '```json',
          JSON.stringify({ enabled: false }, null, 2),
          '```',
          '',
          realEnvelope(validData),
        ].join('\n');
        expect(guard.parseStructuredData(body)).toEqual(validData);
        expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(true);
        expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([{ issue_number: 500, retry: false }]);
      });

      it('rejects a malformed real-shaped trailer instead of treating it as absent', () => {
        const body = `Action-Key: ${ACTION_KEY}\n\nStructured data:\n\`\`\`json\n{"squad_artifact": "retro-action", not valid json\n\`\`\``;
        expect(guard.parseStructuredData(body)).toBeUndefined();
        expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(false);
        expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([]);
      });

      it('still treats a genuinely absent trailer as absent (data is optional), not malformed', () => {
        const body = `Action-Key: ${ACTION_KEY}\n\nNo structured metadata here at all.`;
        expect(guard.parseStructuredData(body)).toBeNull();
        expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(true);
      });

      it('refuses when the real-shaped block disagrees with the Action-Key (tampered)', () => {
        const body = `Action-Key: ${ACTION_KEY}\n\n${realEnvelope({ ...validData, fingerprint: 'fail:ffffffffffffffff' })}`;
        expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(false);
        expect(derive(provenanceArgs(actionIssue({ body })))).toEqual([]);
      });

      it('ignores Structured data examples inside fenced Markdown instead of treating them as authority', () => {
        const body = [
          `Action-Key: ${ACTION_KEY}`,
          '',
          '````markdown',
          'Structured data:',
          '```json',
          JSON.stringify({ squad_artifact: 'retro-report', schema_version: '1', fingerprint: 'fail:ffffffffffffffff' }),
          '```',
          '````',
        ].join('\n');
        expect(guard.parseStructuredData(body)).toBeNull();
        expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(true);
      });

      it('accepts exactly one top-level envelope while ignoring nested examples before it', () => {
        const body = [
          `Action-Key: ${ACTION_KEY}`,
          '',
          '````text',
          'Structured data:',
          '```json',
          '{"squad_artifact":"retro-report"}',
          '```',
          '````',
          '',
          realEnvelope(validData),
        ].join('\n');
        expect(guard.parseStructuredData(body)).toEqual(validData);
        expect(hasTrustedActionProvenance(actionIssue({ body }))).toBe(true);
      });

      it('rejects top-level unterminated and duplicate envelopes, including incomplete duplicates', () => {
        const unterminated = `Action-Key: ${ACTION_KEY}\n\nStructured data:\n\`\`\`json\n${JSON.stringify(validData)}`;
        expect(guard.parseStructuredData(unterminated)).toBeUndefined();
        expect(hasTrustedActionProvenance(actionIssue({ body: unterminated }))).toBe(false);

        const duplicate = `Action-Key: ${ACTION_KEY}\n\n${realEnvelope(validData)}\n\n${realEnvelope(validData)}`;
        expect(guard.parseStructuredData(duplicate)).toBeUndefined();
        expect(hasTrustedActionProvenance(actionIssue({ body: duplicate }))).toBe(false);

        const incompleteDuplicate = `Action-Key: ${ACTION_KEY}\n\n${realEnvelope(validData)}\n\nStructured data:\n\`\`\`json\n{`;
        expect(guard.parseStructuredData(incompleteDuplicate)).toBeUndefined();
        expect(hasTrustedActionProvenance(actionIssue({ body: incompleteDuplicate }))).toBe(false);
      });
    });

    it('exposes the same rule as a reusable predicate', () => {
      expect(hasTrustedActionProvenance(actionIssue())).toBe(true);
      expect(hasTrustedActionProvenance(actionIssue({ author: 'octocat' }))).toBe(false);
      expect(hasTrustedActionProvenance({ user: { login: 'github-actions[bot]' }, body: `Action-Key: ${ACTION_KEY}` }))
        .toBe(true);
    });
  });

  describe('deriveAutoImplementCandidates: exhausted retry hand-off (FIDO review, durable dispatch gap)', () => {
    const exhaustedComments = () => Array.from({ length: AUTO_IMPLEMENT_MAX_ATTEMPTS }, (_, index) =>
      dispatchMarker(500, `2026-0${index + 1}-01T00:00:00Z`));

    it('reports an issue that burned its whole retry budget with no pull request', () => {
      const result = deriveAutoImplementCandidates({
        actionIssues: [actionIssue({ comments: exhaustedComments() })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result.eligible).toEqual([]);
      expect(result.exhausted).toEqual([{ issue_number: 500, attempts: AUTO_IMPLEMENT_MAX_ATTEMPTS }]);
    });

    it('reports it only once -- a durable abandoned marker suppresses repeats', () => {
      const comments = [
        ...exhaustedComments(),
        { author: 'github-actions[bot]', body: 'Squad-Retro-Dispatch-Abandoned: #500\nNeeds a human.' },
      ];
      const result = deriveAutoImplementCandidates({
        actionIssues: [actionIssue({ comments })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result.exhausted).toEqual([]);
    });

    it('ignores an abandoned marker written by anyone other than the bot', () => {
      const comments = [
        ...exhaustedComments(),
        { author: 'octocat', body: 'Squad-Retro-Dispatch-Abandoned: #500' },
      ];
      const result = deriveAutoImplementCandidates({
        actionIssues: [actionIssue({ comments })],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result.exhausted).toEqual([{ issue_number: 500, attempts: AUTO_IMPLEMENT_MAX_ATTEMPTS }]);
    });

    it('never reports an issue whose fix already shipped, however many attempts it took', () => {
      const result = deriveAutoImplementCandidates({
        actionIssues: [actionIssue({ comments: exhaustedComments() })],
        implementPulls: [{ number: 9, state: 'closed', merged: true, head_ref: 'squad/implement-500-fix' }],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result.eligible).toEqual([]);
      expect(result.exhausted).toEqual([]);
      // Shipped is human-managed state, reported rather than retried.
      expect(result.suppressed).toEqual([{ issue_number: 500, pull_state: 'merged' }]);
    });
  });

  describe('deriveAutoImplementCandidates: linked pull request dedup (gap 6)', () => {
    const withPull = (pull: Record<string, unknown>) => deriveAutoImplementCandidates({
      actionIssues: [actionIssue()],
      implementPulls: [pull],
      now: '2026-09-07T00:00:00Z',
      retryHours: 48,
    });

    it('suppresses and reports a closed-unmerged implement pull request instead of retrying it', () => {
      // A human closed that implementation without merging. Re-dispatching
      // would relitigate the decision automatically.
      const result = withPull({ number: 3, state: 'closed', merged: false, head_ref: 'squad/implement-500-fix' });
      expect(result.eligible).toEqual([]);
      expect(result.exhausted).toEqual([]);
      expect(result.suppressed).toEqual([{ issue_number: 500, pull_state: 'closed-unmerged' }]);
    });

    it('labels each suppressing state distinctly so the report can name it', () => {
      expect(withPull({ number: 1, state: 'open', merged: false, head_ref: 'squad/implement-500-a' }).suppressed)
        .toEqual([{ issue_number: 500, pull_state: 'open' }]);
      expect(withPull({ number: 2, state: 'closed', merged: true, head_ref: 'squad/implement-500-b' }).suppressed)
        .toEqual([{ issue_number: 500, pull_state: 'merged' }]);
    });

    it('ignores a pull request belonging to a different issue', () => {
      const result = withPull({ number: 4, state: 'closed', merged: false, head_ref: 'squad/implement-501-fix' });
      expect(result.suppressed).toEqual([]);
      expect(result.eligible).toEqual([{ issue_number: 500, retry: false, action_key: ACTION_KEY }]);
    });

    it.each([
      ['bare with colon', 'Closes: #500'],
      ['repo-qualified', 'Closes squad-test/example#500'],
      ['repo-qualified with colon', 'Fixes: squad-test/example#500'],
      ['full issue URL', 'Resolves https://github.com/squad-test/example/issues/500'],
    ])('suppresses a CLOSED-unmerged human PR linked only by supported closing syntax (%s) (reviewer finding C)', (_name, body) => {
      // No `squad/implement-500-*` branch convention here: the ONLY signal is
      // GitHub's own closing-keyword syntax in a human-authored PR body.
      const result = deriveAutoImplementCandidates({
        actionIssues: [actionIssue()],
        implementPulls: [{ number: 5, state: 'closed', merged: false, head_ref: 'human/own-fix', body }],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
        repository: 'squad-test/example',
      });
      expect(result.eligible).toEqual([]);
      expect(result.suppressed).toEqual([{ issue_number: 500, pull_state: 'closed-unmerged' }]);
    });

    it('never lets a repo-qualified reference to a DIFFERENT repository suppress dispatch', () => {
      const result = deriveAutoImplementCandidates({
        actionIssues: [actionIssue()],
        implementPulls: [{ number: 5, state: 'closed', merged: false, head_ref: 'human/own-fix', body: 'Closes other-org/other-repo#500' }],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
        repository: 'squad-test/example',
      });
      expect(result.suppressed).toEqual([]);
      expect(result.eligible).toEqual([{ issue_number: 500, retry: false, action_key: ACTION_KEY }]);
    });

    it('carries each candidate action key through for the typed dispatch input', () => {
      const result = deriveAutoImplementCandidates({
        actionIssues: [actionIssue()],
        implementPulls: [],
        now: '2026-09-07T00:00:00Z',
        retryHours: 48,
      });
      expect(result.eligible).toEqual([{ issue_number: 500, retry: false, action_key: ACTION_KEY }]);
    });
  });

  describe('collectRemediationInput: native planning links', () => {
    const keys = [0, 1, 2, 3].map(index => `fail:${String(index).repeat(16)}`);
    const actionWithKey = (number: number, key: string) => actionIssue({
      number,
      body: `Fix ${number}.\n\nAction-Key: ${key}\n`,
      user: { login: 'github-actions[bot]' },
    });
    const actions = () => keys.map((key, index) => actionWithKey(500 + index, key));
    const fetchJson = (route: string, fields: Record<string, unknown>) => {
      if (route.endsWith('/issues') && fields.labels === 'squad-retro-action') return actions();
      if (route.endsWith('/pulls')) return [];
      if (/\/issues\/50[1-3]\/comments$/.test(route)) return [];
      throw new Error(`Unexpected API route: ${route}`);
    };
    const planFrom = (remediation: ReturnType<typeof collectRemediationInput>) => evaluateRetro(baseInput({
      config: { squadRetroAutoImplement: 'allow' },
      workflowRuns: [],
      reviews: [],
      run_id: '7',
      ...remediation,
    }));

    it('suppresses a native-linked closed-unmerged action before the three-dispatch cap', async () => {
      const remediation = collectRemediationInput(
        'squad-test/example',
        resolveRetroConfig({ squadRetroAutoImplement: 'allow' }),
        new Date('2026-09-07T00:00:00Z'),
        fetchJson,
        nativeResponse({ 500: 'CLOSED' }),
      );
      const plan = planFrom(remediation);
      expect(plan.action).toBe('reconcile');
      expect(plan.auto_implement_suppressed).toEqual([{ issue_number: 500, pull_state: 'closed-unmerged' }]);
      expect(plan.auto_implement_candidates).toEqual([
        { issue_number: 501, retry: false, action_key: keys[1] },
        { issue_number: 502, retry: false, action_key: keys[2] },
        { issue_number: 503, retry: false, action_key: keys[3] },
      ]);
      expect(remediation.collection.native_linked_actions_suppressed).toBe(1);
      expect(remediation.collection.implement_pulls_truncated).toBe(false);

      const items = plan.auto_implement_candidates.flatMap(candidate => [
        {
          type: 'add_comment',
          item_number: String(candidate.issue_number),
          body: guard.dispatchMarker(candidate.issue_number, candidate.action_key, '7', plan.now),
        },
        {
          type: 'dispatch_workflow',
          workflow_name: 'squad-implement-worker',
          inputs: {
            issue_number: String(candidate.issue_number),
            request_origin: 'squad-retro',
            retro_action_key: candidate.action_key,
          },
        },
      ]);
      const result = await guard.enforceRetroSafeOutputs({
        GITHUB_REPOSITORY: 'squad-test/example',
        GITHUB_RUN_ID: '7',
        GITHUB_REF: 'refs/heads/dev',
        SQUAD_RETRO_DEFAULT_BRANCH: 'dev',
      } as never, {
        readItems: () => items,
        autoImplementEnabled: true,
        readPlan: () => plan,
        fetchGraphql: noNativeLinks,
        fetchJson: async (route: string) => {
          if (route.endsWith('/pulls') || route.endsWith('/comments')) return [];
          const number = Number(route.split('/').at(-1));
          return actions().find(issue => issue.number === number);
        },
      });
      expect(result.ok).toBe(true);
      expect(result.targets).toHaveLength(3);
    });

    it('fails closed during planning when native-link discovery is incomplete', () => {
      const remediation = collectRemediationInput(
        'squad-test/example',
        resolveRetroConfig({ squadRetroAutoImplement: 'allow' }),
        new Date('2026-09-07T00:00:00Z'),
        fetchJson,
        () => ({ __status: 503 }),
      );
      const plan = planFrom(remediation);
      expect(remediation.collection.native_links_truncated).toBe(true);
      expect(remediation.collection.implement_pulls_truncated).toBe(true);
      expect(plan.auto_implement_candidates).toEqual([]);
      expect(plan.auto_implement_suppressed).toEqual([]);
    });
  });

  describe('evaluateRetro wiring', () => {
    const stateComments = () => stateComment({
      status: 'IDLE',
      completed_at: '2026-09-01T00:00:00Z',
      resolved_fingerprints: [],
      pending_fingerprints: [],
    });

    it('stays empty by default even when eligible action issues exist (opt-in, disabled by default)', () => {
      const result = evaluateRetro(baseInput({
        config: {},
        stateComments: stateComments(),
        workflowRuns: [failure(), failure({ id: 102 })],
        actionIssues: [actionIssue()],
        implementPulls: [],
        collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      }));
      expect(result.action).toBe('run');
      expect(result.auto_implement_candidates).toEqual([]);
    });

    it('populates candidates on a `run` outcome when explicitly enabled', () => {
      const result = evaluateRetro(baseInput({
        config: { squadRetroAutoImplement: 'allow' },
        stateComments: stateComments(),
        workflowRuns: [failure(), failure({ id: 102 })],
        actionIssues: [actionIssue()],
        implementPulls: [],
        collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      }));
      expect(result.action).toBe('run');
      expect(result.auto_implement_candidates).toEqual([{ issue_number: 500, retry: false, action_key: ACTION_KEY }]);
    });

    it('populates candidates on a `housekeep` outcome too', () => {
      const cooling = {
        config: { squadRetroAutoImplement: 'allow' },
        stateComments: stateComment({
          status: 'IDLE',
          completed_at: '2026-08-01T00:00:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: ['fail:1111111111111111'],
        }),
        actionIssues: [actionIssue()],
        implementPulls: [],
        collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      };
      const result = evaluateRetro(baseInput(cooling));
      expect(result.action).toBe('housekeep');
      expect(result.auto_implement_candidates).toEqual([{ issue_number: 500, retry: false, action_key: ACTION_KEY }]);
    });

    it('never populates candidates for the in-flight suppress outcome, even when enabled', () => {
      // A genuine retrospective is already running: reconciliation waits for
      // the constant concurrency lock rather than racing it.
      const suppressed = evaluateRetro(baseInput({
        config: { squadRetroAutoImplement: 'allow' },
        stateComments: stateComment({
          status: 'IN_FLIGHT',
          started_at: '2026-09-06T23:50:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: [],
        }),
        actionIssues: [actionIssue()],
        implementPulls: [],
        collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      }));
      expect(suppressed.action).toBe('suppress');
      expect(suppressed.auto_implement_candidates).toEqual([]);
    });

    it('never populates candidates when nothing enabled it, whatever the outcome', () => {
      const noEvidence = evaluateRetro(baseInput({
        config: {},
        stateComments: stateComments(),
        actionIssues: [actionIssue()],
        implementPulls: [],
        collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      }));
      expect(noEvidence.action).toBe('noop');
      expect(noEvidence.reason).toBe('no-evidence-in-window');
      expect(noEvidence.auto_implement_candidates).toEqual([]);
      expect(noEvidence.auto_implement_new_action_ids).toEqual([]);
    });

    it('still noops when enabled but there is nothing at all to reconcile', () => {
      const idle = evaluateRetro(baseInput({
        config: { squadRetroAutoImplement: 'allow' },
        stateComments: stateComments(),
        actionIssues: [],
        implementPulls: [],
        collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      }));
      expect(idle.action).toBe('noop');
      expect(idle.reason).toBe('no-evidence-in-window');
    });

    it('fails closed to an empty candidate list when the action-issue or implement-pull collection is truncated', () => {
      const truncatedActionIssues = evaluateRetro(baseInput({
        config: { squadRetroAutoImplement: 'allow' },
        stateComments: stateComments(),
        workflowRuns: [failure(), failure({ id: 102 })],
        actionIssues: [actionIssue()],
        implementPulls: [],
        collection: { action_issues_truncated: true, implement_pulls_truncated: false },
      }));
      expect(truncatedActionIssues.action).toBe('run');
      expect(truncatedActionIssues.auto_implement_candidates).toEqual([]);

      const truncatedPulls = evaluateRetro(baseInput({
        config: { squadRetroAutoImplement: 'allow' },
        stateComments: stateComments(),
        workflowRuns: [failure(), failure({ id: 102 })],
        actionIssues: [actionIssue()],
        implementPulls: [],
        collection: { action_issues_truncated: false, implement_pulls_truncated: true },
      }));
      expect(truncatedPulls.auto_implement_candidates).toEqual([]);
    });
  });

  describe('periodic reconciliation independent of report selection (gap 4)', () => {
    const enabled = (overrides: Record<string, unknown> = {}) => baseInput({
      config: { squadRetroAutoImplement: 'allow' },
      actionIssues: [actionIssue()],
      implementPulls: [],
      collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      ...overrides,
    });

    it('reconciles under an active cooldown instead of suppressing the whole run', () => {
      // Cooldown governs REPORTING; open action handoffs still need servicing
      // on the six-hourly schedule.
      const result = evaluateRetro(enabled({
        stateComments: stateComment({
          status: 'IDLE',
          completed_at: '2026-09-06T23:00:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: [],
        }),
        workflowRuns: [failure(), failure({ id: 102 })],
      }));
      expect(result.action).toBe('reconcile');
      expect(result.reason).toBe('cooldown-active');
      expect(result.report_suppressed).toBe(true);
      expect(result.auto_implement_candidates).toEqual([
        { issue_number: 500, retry: false, action_key: ACTION_KEY },
      ]);
    });

    it('still suppresses under cooldown when there is nothing to reconcile', () => {
      const result = evaluateRetro(enabled({
        actionIssues: [],
        stateComments: stateComment({
          status: 'IDLE',
          completed_at: '2026-09-06T23:00:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: [],
        }),
        workflowRuns: [failure(), failure({ id: 102 })],
      }));
      expect(result.action).toBe('suppress');
      expect(result.reason).toBe('cooldown-active');
    });

    it('preserves an early request arriving during cooldown rather than clearing it', () => {
      const fingerprint = evidenceFingerprint('fail', 'CI|test|Expected 2 but got 1');
      const result = evaluateRetro(enabled({
        stateComments: stateComment({
          status: 'IDLE',
          completed_at: '2026-09-06T23:00:00Z',
          resolved_fingerprints: [],
          pending_fingerprints: [],
        }),
        workflowRuns: [failure(), failure({ id: 102 })],
        incoming: { reason: 'early-evidence', origin: 'squad-implement' },
      }));
      expect(result.action).toBe('reconcile');
      expect(result.incoming_request?.fingerprint).toBe(fingerprint);
      expect(result.incoming_request?.already_pending).toBe(false);
      // The durable request is queued, never dropped, by the reconcile path.
      expect(result.pending_fingerprints).toContain(fingerprint);
      expect(result.expired_pending_fingerprints).toEqual([]);
    });

    it('reconciles a drain run that found no evidence at all', () => {
      const result = evaluateRetro(enabled({ workflowRuns: [], reviews: [] }));
      expect(result.action).toBe('reconcile');
      expect(result.reason).toBe('no-evidence-in-window');
      expect(result.auto_implement_candidates).toEqual([
        { issue_number: 500, retry: false, action_key: ACTION_KEY },
      ]);
    });

    it('reconciles a failed dispatch retry with no new evidence once the retry window elapses', () => {
      const stale = actionIssue({
        comments: [{
          author: 'github-actions[bot]',
          body: 'Squad-Retro-Dispatch: #500 at 2026-09-01T00:00:00Z',
          created_at: '2026-09-01T00:00:00Z',
        }],
      });
      const result = evaluateRetro(enabled({ actionIssues: [stale], workflowRuns: [], reviews: [] }));
      expect(result.action).toBe('reconcile');
      expect(result.auto_implement_candidates).toEqual([
        { issue_number: 500, retry: true, action_key: ACTION_KEY },
      ]);
    });

    it('reconciles an exhausted hand-off even with no evidence and no eligible candidate', () => {
      const spent = actionIssue({
        comments: Array.from({ length: AUTO_IMPLEMENT_MAX_ATTEMPTS }, (_value, index) => ({
          author: 'github-actions[bot]',
          body: `Squad-Retro-Dispatch: #500 at 2026-08-0${index + 1}T00:00:00Z`,
          created_at: `2026-08-0${index + 1}T00:00:00Z`,
        })),
      });
      const result = evaluateRetro(enabled({ actionIssues: [spent], workflowRuns: [], reviews: [] }));
      expect(result.action).toBe('reconcile');
      expect(result.auto_implement_candidates).toEqual([]);
      expect(result.auto_implement_exhausted).toEqual([
        { issue_number: 500, attempts: AUTO_IMPLEMENT_MAX_ATTEMPTS },
      ]);
    });

    it('reconciles action-owned handoffs without trusting an incomplete report ledger', () => {
      const result = evaluateRetro(enabled({
        collection: {
          state_comments_truncated: true,
          action_issues_truncated: false,
          implement_pulls_truncated: false,
        },
      }));
      expect(result.action).toBe('reconcile');
      expect(result.reason).toBe('state-ledger-incomplete');
      expect(result.auto_implement_candidates).toEqual([{ issue_number: 500, retry: false, action_key: ACTION_KEY }]);
      expect(result.auto_implement_new_action_ids).toEqual([]);
    });
  });

  describe('same-run action creation identifiers (gap 3)', () => {
    it('publishes one deterministic temporary id per qualifying fingerprint when enabled', () => {
      const result = evaluateRetro(baseInput({
        config: { squadRetroAutoImplement: 'allow' },
        workflowRuns: [failure(), failure({ id: 102 })],
        collection: { action_issues_truncated: false, implement_pulls_truncated: false },
      }));
      expect(result.action).toBe('run');
      expect(result.auto_implement_new_action_ids).toHaveLength(1);
      const [entry] = result.auto_implement_new_action_ids;
      expect(entry.fingerprint).toBe(result.qualifying_groups[0].fingerprint);
      expect(entry.temporary_id).toBe(deriveActionTemporaryId(entry.fingerprint));
      // Must satisfy gh-aw's own temporary-id shape, or the create_issue call
      // is rejected and the whole same-run relay silently degrades.
      expect(entry.temporary_id).toMatch(/^aw_[A-Za-z0-9_]{3,12}$/);
    });

    it('stays empty while the feature is disabled', () => {
      const result = evaluateRetro(baseInput({
        config: {},
        workflowRuns: [failure(), failure({ id: 102 })],
      }));
      expect(result.action).toBe('run');
      expect(result.auto_implement_new_action_ids).toEqual([]);
    });

    it('derives a stable, distinct id from the fingerprint alone', () => {
      expect(deriveActionTemporaryId('fail:0123456789abcdef')).toBe('aw_f0123450');
      expect(deriveActionTemporaryId('review:0123456789abcdef')).toBe('aw_r0123450');
      expect(deriveActionTemporaryId('fail:0123456789abcdef'))
        .toBe(deriveActionTemporaryId('fail:0123456789abcdef'));
      expect(deriveActionTemporaryId('not-a-fingerprint')).toBeNull();
    });
  });

  describe('collectLiveInput', () => {
    it('spends zero additional API requests on action issues or implement pulls when the feature is disabled (default)', () => {
      const calls: string[] = [];
      const input = collectLiveInput({
        GITHUB_REPOSITORY: 'squad-test/example',
        GITHUB_WORKSPACE: scratch({}),
        SQUAD_RETRO_EVENT_NAME: 'schedule',
      }, {
        now: new Date('2026-09-07T00:00:00Z'),
        fetchJson: (route, fields) => {
          calls.push(`${route}?labels=${fields.labels ?? ''}&sort=${fields.sort ?? ''}`);
          if (route.endsWith('/issues')) return stateIssue().map(issue => ({ ...issue, user: { login: issue.author } }));
          if (route.endsWith('/comments')) return baseInput().stateComments.map(comment => ({ ...comment, user: { login: comment.author } }));
          if (route.endsWith('/actions/runs')) return { workflow_runs: [] };
          if (route.endsWith('/pulls')) return [];
          throw new Error(`Unexpected API route: ${route}`);
        },
        fetchGraphql: noNativeLinks,
        fetchLog: () => Buffer.from(''),
      });
      expect(input.actionIssues).toEqual([]);
      expect(input.implementPulls).toEqual([]);
      expect(input.collection.action_issues_considered).toBe(0);
      expect(input.collection.implement_pulls_considered).toBe(0);
      expect(calls.some(call => call.includes('labels=squad-retro-action'))).toBe(false);
      expect(calls.filter(call => call.startsWith('repos/squad-test/example/pulls')).length).toBe(1);
    });

    it('collects bounded action-issue and implement-pull evidence when explicitly enabled', () => {
      const input = collectLiveInput({
        GITHUB_REPOSITORY: 'squad-test/example',
        GITHUB_WORKSPACE: scratch({ squadRetroAutoImplement: 'allow' }),
        SQUAD_RETRO_EVENT_NAME: 'schedule',
      }, {
        now: new Date('2026-09-07T00:00:00Z'),
        fetchJson: (route, fields) => {
          if (route.endsWith('/issues') && fields.labels === 'squad-retro-action') {
            return [
              {
                number: 501,
                state: 'open',
                labels: [{ name: 'squad-retro-action' }],
                body: 'Action-Key: fail:0123456789abcdef\n',
                user: { login: 'github-actions[bot]' },
              },
              // A relabeled human issue must not even cost a comment page.
              {
                number: 502,
                state: 'open',
                labels: [{ name: 'squad-retro-action' }],
                body: 'Action-Key: fail:0123456789abcdef\n',
                user: { login: 'octocat' },
              },
            ];
          }
          if (route.endsWith('/issues')) return stateIssue().map(issue => ({ ...issue, user: { login: issue.author } }));
          if (route.endsWith('/501/comments')) return [];
          if (route.endsWith('/comments')) return baseInput().stateComments.map(comment => ({ ...comment, user: { login: comment.author } }));
          if (route.endsWith('/actions/runs')) return { workflow_runs: [] };
          if (route.endsWith('/pulls') && fields.sort === 'created') {
            return [{ number: 9, state: 'open', head: { ref: 'squad/implement-777-fix' }, merged_at: null }];
          }
          if (route.endsWith('/pulls')) return [];
          throw new Error(`Unexpected API route: ${route}`);
        },
        fetchGraphql: noNativeLinks,
        fetchLog: () => Buffer.from(''),
      });
      expect(input.actionIssues).toMatchObject([{
        number: 501,
        state: 'open',
        author: 'github-actions[bot]',
        labels: [{ name: 'squad-retro-action' }],
        body: 'Action-Key: fail:0123456789abcdef\n',
        comments: [],
      }]);
      expect(input.implementPulls).toMatchObject([{ number: 9, state: 'open', merged_at: null, head: { ref: 'squad/implement-777-fix' } }]);
      expect(input.collection.action_issues_truncated).toBe(false);
      expect(input.collection.implement_pulls_truncated).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Output-boundary dispatch guard (#2005 gap 3, mechanical enforcement)
// ---------------------------------------------------------------------------
// These exercise the guard the compiled safe-outputs job actually runs. They
// are deliberately not prose checks: the contract under test is that a
// malformed, out-of-order, disabled, or forged dispatch batch is REFUSED, and
// that refusal is what stops gh-aw's "Process Safe Outputs" step.

describe('Squad retro dispatch output guard', () => {
  const ACTION_KEY = 'fail:0123456789abcdef';
  const TEMP_ID = deriveActionTemporaryId(ACTION_KEY)!;
  const kinds = (result: { violations: { kind: string }[] }) => result.violations.map(v => v.kind);

  const createItem = (overrides: Record<string, unknown> = {}) => {
    const item = {
      type: 'create_issue',
      temporary_id: TEMP_ID,
      title: '[retro] Fix the thing',
      labels: ['squad-retro-action', 'squad:booster'],
      body: `Fix it.\n\nAction-Key: ${ACTION_KEY}\n`,
      data: { squad_artifact: 'retro-action', schema_version: '1', retro_id: '7', fingerprint: ACTION_KEY },
      ...overrides,
    };
    return { ...item, body: `${item.body}\n\nStructured data:\n\`\`\`json\n${JSON.stringify(item.data, null, 2)}\n\`\`\`` };
  };
  const markerItem = (target: string | number = `#${TEMP_ID}`, overrides: Record<string, unknown> = {}) => ({
    type: 'add_comment',
    item_number: String(target),
    body: guard.dispatchMarker(target, ACTION_KEY, '7', '2026-09-07T00:00:00Z'),
    ...overrides,
  });
  const dispatchItem = (target: string | number = `#${TEMP_ID}`, overrides: Record<string, unknown> = {}) => ({
    type: 'dispatch_workflow',
    workflow_name: 'squad-implement-worker',
    inputs: {
      issue_number: String(target),
      request_origin: 'squad-retro',
      retro_action_key: ACTION_KEY,
    },
    ...overrides,
  });
  const sameRunBatch = () => [createItem(), markerItem(), dispatchItem()];
  const evaluate = (items: Record<string, unknown>[], autoImplementEnabled = true) =>
    guard.evaluateRetroDispatchOutputs({ items, autoImplementEnabled, maxDispatch: 3 });
  const sealedPlan = (numbers = [500]) => ({
    repository: 'squad-test/example', run_id: '7', now: '2026-09-07T00:00:00Z',
    action: 'reconcile', config: { autoImplementEnabled: true, autoImplementRetryHours: 48 },
    action_scan_complete: true,
    auto_implement_candidates: numbers.map(issue_number => ({ issue_number, action_key: ACTION_KEY })),
    auto_implement_new_action_ids: [],
  });
  // The reconciliation loop also re-checks GitHub's *native* issue<->PR link
  // (the PR "Development" sidebar, queried via `closedByPullRequestsReferences`)
  // alongside the REST pull scan. This default answers "no native link, scan
  // complete" so tests that are not exercising that check keep their existing
  // REST-only expectations; native-specific tests override it explicitly.
  const noNativeLinks = async () => ({
    data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } },
  });

  it('accepts the create -> marker -> dispatch transaction shape', () => {
    const result = evaluate(sameRunBatch());
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.targets).toEqual([
      { target: `#${TEMP_ID}`, action_key: ACTION_KEY, same_run: true, issue_number: null },
    ]);
  });

  it('validates same-run action creation against the final gh-aw serialized receiver contract', () => {
    const created = createItem();
    const materialized = guard.materializeNewActionIssue(created)!;
    expect(materialized.body).toContain(JSON.stringify(created.data, null, 2));
    expect(guard.hasTrustedNewActionProvenance(created, ACTION_KEY)).toBe(true);
    expect(hasTrustedActionProvenance({ ...materialized, number: 500 })).toBe(true);
    expect(deriveAutoImplementCandidates({
      actionIssues: [{ ...materialized, number: 500, comments: [] }],
      implementPulls: [],
      now: '2026-09-07T00:00:00Z',
      retryHours: 48,
    }).eligible).toEqual([{ issue_number: 500, retry: false, action_key: ACTION_KEY }]);
  });

  it.each([
    ['wrong fingerprint', { squad_artifact: 'retro-action', schema_version: '1', retro_id: '7', fingerprint: 'fail:ffffffffffffffff' }],
    ['wrong artifact', { squad_artifact: 'retro-report', schema_version: '1', retro_id: '7', fingerprint: ACTION_KEY }],
  ])('refuses a same-run dispatch whose final serialized provenance has the %s', (_name, data) => {
    const result = evaluate([createItem({ data }), markerItem(), dispatchItem()]);
    expect(result.ok).toBe(false);
    expect(kinds(result)).toContain('new-action-provenance-invalid');
    expect(hasTrustedActionProvenance({ ...guard.materializeNewActionIssue(createItem({ data })), number: 500 })).toBe(false);
  });

  it('refuses invalid same-run provenance at the safe-output boundary before dispatch can recover-drop it', async () => {
    const invalid = [
      createItem({ data: { squad_artifact: 'retro-action', schema_version: '1', retro_id: '7', fingerprint: 'fail:ffffffffffffffff' } }),
      markerItem(),
      dispatchItem(),
    ];
    const result = await guard.enforceRetroSafeOutputs({
      GITHUB_REPOSITORY: 'squad-test/example',
      GITHUB_RUN_ID: '7',
      GITHUB_REF: 'refs/heads/dev',
      SQUAD_RETRO_DEFAULT_BRANCH: 'dev',
    } as never, {
      readItems: () => invalid,
      autoImplementEnabled: true,
      readPlan: () => ({
        ...sealedPlan([]),
        action: 'run',
        qualifying_groups: [{ fingerprint: ACTION_KEY }],
        auto_implement_new_action_ids: [{ fingerprint: ACTION_KEY, temporary_id: TEMP_ID }],
      }),
      fetchGraphql: noNativeLinks,
      fetchJson: async () => [],
    });
    expect(result.ok).toBe(false);
    expect(kinds(result)).toContain('new-action-provenance-invalid');
  });

  it('refuses every dispatch when auto-implementation is disabled in the trusted checkout', () => {
    // The default is enforced HERE, not by the agent honoring an empty
    // candidate list.
    const result = evaluate(sameRunBatch(), false);
    expect(result.ok).toBe(false);
    expect(kinds(result)).toEqual(['dispatch-while-auto-implement-disabled']);
    expect(result.targets).toEqual([]);
  });

  it('leaves a run with no dispatch output alone', () => {
    const result = evaluate([createItem(), { type: 'add_comment', item_number: '41', body: 'report' }], false);
    expect(result.ok).toBe(true);
    expect(result.enforced).toBe(false);
  });

  it('refuses a dispatch whose temporary id was never created in this batch', () => {
    // gh-aw forwards an unresolved `#aw_x` literally with only a warning, so
    // an unmatched reference can never be a successful dispatch.
    expect(kinds(evaluate([markerItem(), dispatchItem()]))).toContain('unresolved-temporary-id');
    // Created AFTER the dispatch is just as unresolvable at dispatch time.
    expect(kinds(evaluate([markerItem(), dispatchItem(), createItem()])))
      .toContain('unresolved-temporary-id');
  });

  it('refuses a dispatch emitted before its durable marker', () => {
    expect(kinds(evaluate([createItem(), dispatchItem(), markerItem()])))
      .toContain('dispatch-without-durable-marker');
    expect(kinds(evaluate([createItem(), dispatchItem()])))
      .toContain('dispatch-without-durable-marker');
  });

  it('refuses a marker that names a different target or carries no timestamp', () => {
    expect(kinds(evaluate([createItem(), markerItem('#aw_rdeadbee'), dispatchItem()])))
      .toContain('dispatch-without-durable-marker');
    expect(kinds(evaluate([
      createItem(),
      markerItem(`#${TEMP_ID}`, { body: `Squad-Retro-Dispatch: #${TEMP_ID} at not-a-time` }),
      dispatchItem(),
    ]))).toContain('dispatch-without-durable-marker');
  });

  it('refuses a temporary id that is not derived from the created issue\'s own Action-Key', () => {
    const forged = 'aw_f9999999';
    expect(kinds(evaluate([
      createItem({ temporary_id: forged }),
      markerItem(`#${forged}`),
      dispatchItem(`#${forged}`),
    ]))).toContain('temporary-id-not-derived');
  });

  it('refuses when the created issue\'s Action-Key disagrees with the dispatch input', () => {
    expect(kinds(evaluate([
      createItem({ body: 'Action-Key: fail:ffffffffffffffff\n' }),
      markerItem(),
      dispatchItem(),
    ]))).toContain('dispatch-action-key-mismatch');
    // An indented or inline key is not a standalone key line at all.
    expect(kinds(evaluate([
      createItem({ body: `  Action-Key: ${ACTION_KEY}\n` }),
      markerItem(),
      dispatchItem(),
    ]))).toContain('dispatch-action-key-mismatch');
  });

  it('refuses a same-run dispatch of a proposal-labeled or unlabeled action', () => {
    expect(kinds(evaluate([
      createItem({ labels: ['squad-retro-action', 'squad-retro-proposal'] }),
      markerItem(),
      dispatchItem(),
    ]))).toContain('dispatch-target-is-proposal');
    expect(kinds(evaluate([createItem({ labels: ['squad'] }), markerItem(), dispatchItem()])))
      .toContain('dispatch-target-not-action-labeled');
  });

  it('refuses a target that is neither a number nor a temporary id', () => {
    for (const target of ['#123', 'https://github.example/issues/500', 'the retro issue', '']) {
      expect(kinds(evaluate([markerItem(target), dispatchItem(target)])))
        .toContain('dispatch-target-not-resolvable');
    }
  });

  it('refuses a dispatch to any workflow other than squad-implement-worker', () => {
    expect(kinds(evaluate([
      createItem(),
      markerItem(),
      dispatchItem(`#${TEMP_ID}`, { workflow_name: 'squad' }),
    ]))).toContain('dispatch-workflow-not-allowed');
  });

  it('requires the typed origin and key inputs, and forbids a hand-rolled aw_context', () => {
    const withInputs = (inputs: Record<string, unknown>) => evaluate([
      createItem(),
      markerItem(),
      { ...dispatchItem(), inputs },
    ]);
    expect(kinds(withInputs({ issue_number: `#${TEMP_ID}`, retro_action_key: ACTION_KEY })))
      .toContain('dispatch-origin-not-declared');
    expect(kinds(withInputs({
      issue_number: `#${TEMP_ID}`,
      request_origin: 'squad-retro',
      retro_action_key: 'not-a-fingerprint',
    }))).toContain('dispatch-action-key-malformed');
    expect(kinds(withInputs({
      issue_number: `#${TEMP_ID}`,
      request_origin: 'squad-retro',
      retro_action_key: ACTION_KEY,
      aw_context: '{"workflow_id":"forged"}',
    }))).toContain('dispatch-input-not-allowed');
  });

  it('refuses duplicate dispatches of the same target and more than the configured max', () => {
    expect(kinds(evaluate([createItem(), markerItem(), dispatchItem(), markerItem(), dispatchItem()])))
      .toContain('duplicate-dispatch-target');
    const many = [1, 2, 3, 4].flatMap(number => [markerItem(number), dispatchItem(number)]);
    expect(kinds(evaluate(many))).toContain('dispatch-over-max');
  });

  it('accepts a numeric target and hands it to the live trust check', () => {
    const result = evaluate([markerItem(500), dispatchItem(500)]);
    expect(result.ok).toBe(true);
    expect(result.targets).toEqual([
      { target: '500', action_key: ACTION_KEY, same_run: false, issue_number: 500 },
    ]);
  });

  it('re-fetches every numeric target and refuses an untrusted one', async () => {
    const issue = (overrides: Record<string, unknown> = {}) => ({
      number: 500,
      state: 'open',
      user: { login: 'github-actions[bot]' },
      labels: [{ name: 'squad-retro-action' }],
      body: `Action-Key: ${ACTION_KEY}\n`,
      ...overrides,
    });
    const run = (response: unknown, env: Record<string, string> = {}) =>
      guard.enforceRetroSafeOutputs({
        GITHUB_REPOSITORY: 'squad-test/example',
        GITHUB_RUN_ID: '7',
        GITHUB_REF: env.GITHUB_REF_NAME ? `refs/heads/${env.GITHUB_REF_NAME}` : 'refs/heads/dev',
        GITHUB_REF_NAME: 'dev',
        SQUAD_RETRO_DEFAULT_BRANCH: 'dev',
        ...env,
      } as never, {
        readItems: () => [markerItem(500), dispatchItem(500)],
        autoImplementEnabled: true,
        readPlan: () => sealedPlan(),
        fetchGraphql: noNativeLinks,
        fetchJson: async route => route.endsWith('/pulls') || route.endsWith('/comments') ? [] : response,
      });

    expect((await run(issue())).ok).toBe(true);
    expect(kinds(await run(issue({ user: { login: 'attacker' } })))).toContain('dispatch-target-untrusted');
    expect(kinds(await run(issue({ state: 'closed' })))).toContain('dispatch-target-untrusted');
    expect(kinds(await run(issue({
      labels: [{ name: 'squad-retro-action' }, { name: 'squad-retro-proposal' }],
    })))).toContain('dispatch-target-untrusted');
    expect(kinds(await run(issue({ body: 'Action-Key: fail:ffffffffffffffff\n' }))))
      .toContain('dispatch-target-untrusted');
    expect(kinds(await run({ __status: 404 }))).toContain('dispatch-target-untrusted');
    // The relay is pinned to the trusted base.
    expect(kinds(await run(issue(), { GITHUB_REF_NAME: 'attacker-branch' })))
      .toContain('dispatch-off-default-branch');
  });

  it('memoizes the live lookup so the guard stays within its own bounded cost', async () => {
    let fetches = 0;
    const result = await guard.enforceRetroSafeOutputs({
      GITHUB_REPOSITORY: 'squad-test/example',
      GITHUB_RUN_ID: '7',
      GITHUB_REF: 'refs/heads/dev',
      GITHUB_REF_NAME: 'dev',
      SQUAD_RETRO_DEFAULT_BRANCH: 'dev',
    } as never, {
      readItems: () => [markerItem(500), dispatchItem(500), markerItem(501), dispatchItem(501)],
      autoImplementEnabled: true,
      readPlan: () => sealedPlan([500, 501]),
      fetchGraphql: noNativeLinks,
      fetchJson: async (route: string) => {
        fetches++;
        if (route.endsWith('/pulls') || route.endsWith('/comments')) return [];
        return {
          number: Number(route.split('/').at(-1)),
          state: 'open',
          user: { login: 'github-actions[bot]' },
          labels: [{ name: 'squad-retro-action' }],
          body: `Action-Key: ${ACTION_KEY}\n`,
        };
      },
    });
    expect(result.ok).toBe(true);
    expect(fetches).toBe(5);
    expect(fetches).toBeLessThanOrEqual(guard.RETRO_GUARD_API_REQUEST_CEILING);
  });

  // ---------------------------------------------------------------------------
  // Native GitHub issue<->PR links (the PR "Development" sidebar) can attach a
  // human PR to the target issue with no closing-keyword text at all. The
  // reconciliation re-check must catch this the same as the REST pull scan
  // does, including a PR already closed unmerged, and must fail closed (never
  // authorize the dispatch) if the native scan itself is incomplete.
  // ---------------------------------------------------------------------------
  describe('reconciliation also re-checks the native issue<->PR link (finishing part C)', () => {
    const baseIssue = {
      number: 500, state: 'open', user: { login: 'github-actions[bot]' },
      labels: [{ name: 'squad-retro-action' }], body: `Action-Key: ${ACTION_KEY}\n`,
    };
    const run = (fetchGraphql: (query: string, variables: unknown) => unknown) => guard.enforceRetroSafeOutputs({
      GITHUB_REPOSITORY: 'squad-test/example', GITHUB_RUN_ID: '7', GITHUB_REF: 'refs/heads/dev',
      GITHUB_REF_NAME: 'dev', SQUAD_RETRO_DEFAULT_BRANCH: 'dev',
    } as never, {
      readItems: () => [markerItem(500), dispatchItem(500)],
      autoImplementEnabled: true,
      readPlan: () => sealedPlan(),
      fetchGraphql,
      fetchJson: async route => route.endsWith('/pulls') || route.endsWith('/comments') ? [] : baseIssue,
    });

    it.each([
      ['OPEN'], ['CLOSED'], ['MERGED'],
    ])('refuses a dispatch already covered by a native %s link with no body reference', async nativeState => {
      const result = await run(async () => ({
        data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [{ number: 900, state: nativeState }], pageInfo: { hasNextPage: false, endCursor: null } } } } },
      }));
      expect(result.ok).toBe(false);
      expect(kinds(result)).toContain('dispatch-no-longer-eligible');
    });

    it('fails closed when the native scan errors, never authorizing the dispatch', async () => {
      const result = await run(async () => ({ __status: 503 }));
      expect(result.ok).toBe(false);
      expect(kinds(result)).toEqual(expect.arrayContaining(['implement-pull-scan-incomplete', 'dispatch-no-longer-eligible']));
    });

    it('follows a complete paginated native response before authorizing', async () => {
      let calls = 0;
      const result = await run(async () => {
        calls++;
        return calls === 1
          ? { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'c1' } } } } } }
          : { data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
      });
      expect(calls).toBe(2);
      expect(result.ok).toBe(true);
    });
  });

  it('treats an unreadable agent output as a refusal, not as an empty run', async () => {
    const result = await guard.enforceRetroSafeOutputs({
      GITHUB_REPOSITORY: 'squad-test/example',
    } as never, { readItems: () => null, autoImplementEnabled: true });
    expect(result.ok).toBe(false);
    expect(kinds(result)).toEqual(['unreadable-agent-output']);
  });

  it('reads the enabling flag only from the checkout, never from agent output', () => {
    expect(guard.readAutoImplementEnabled(scratch({}))).toBe(false);
    expect(guard.readAutoImplementEnabled(scratch({ squadRetroAutoImplement: 'deny' }))).toBe(false);
    expect(guard.readAutoImplementEnabled(scratch({ squadRetroAutoImplement: 'allow' }))).toBe(true);
    expect(guard.readAutoImplementEnabled(scratch('{ not json'))).toBe(false);
    expect(guard.readAutoImplementEnabled(scratch())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Verified self-pull suppression (#2005 gap 5)
// ---------------------------------------------------------------------------

describe('Squad retro evidence: verified self-pull suppression', () => {
  const ACTION_KEY = 'fail:0123456789abcdef';
  const marker = (issueNumber = 500, key = ACTION_KEY) =>
    `Closes #${issueNumber}\n\nAction-Key: ${key}\n${guard.retroActionPullMarker(issueNumber, key)}`;

  function collect({
    pullAuthor = 'github-actions[bot]',
    pullBody = marker(),
    pullLabels = [] as string[],
    runs = [] as Record<string, unknown>[],
    issue = {
      number: 500,
      state: 'open',
      user: { login: 'github-actions[bot]' },
      labels: [{ name: 'squad-retro-action' }],
      body: `Action-Key: ${ACTION_KEY}\n`,
    } as Record<string, unknown> | null,
  } = {}) {
    const issueFetches: number[] = [];
    const input = collectLiveInput({
      GITHUB_REPOSITORY: 'squad-test/example',
      GITHUB_WORKSPACE: scratch({}),
      SQUAD_RETRO_EVENT_NAME: 'schedule',
    }, {
      now: new Date('2026-09-07T00:00:00Z'),
      fetchJson: (route, fields) => {
        if (/\/issues\/\d+$/.test(route)) {
          issueFetches.push(Number(route.split('/').at(-1)));
          if (!issue) throw new Error('not found');
          return issue;
        }
        if (route.endsWith('/pulls/77')) return {
          number: 77, body: pullBody, user: { login: pullAuthor },
          head: { ref: 'squad/implement-500-fix', sha: 'b'.repeat(40) }, labels: pullLabels,
        };
        if (route.endsWith('/issues')) {
          return fields.page === 1
            ? stateIssue().map(value => ({ ...value, user: { login: value.author } }))
            : [];
        }
        if (route.endsWith('/comments')) {
          return fields.page === 1
            ? stateComment({
                status: 'IDLE',
                completed_at: '2026-09-01T00:00:00Z',
                resolved_fingerprints: [],
                pending_fingerprints: [],
              }).map(comment => ({ ...comment, user: { login: comment.author } }))
            : [];
        }
        if (route.endsWith('/actions/runs')) return { workflow_runs: runs };
        if (route.endsWith('/jobs')) return { jobs: [{ id: 123, name: 'test', conclusion: 'failure' }] };
        if (route.endsWith('/pulls')) {
          return fields.page === 1
            ? [{
                number: 77,
                updated_at: '2026-09-06T00:00:00Z',
                labels: pullLabels,
                head: { ref: 'squad/implement-500-fix' },
                user: { login: pullAuthor },
                body: pullBody,
              }]
            : [];
        }
        if (route.endsWith('/reviews')) {
          return fields.page === 1
            ? [review({ commit_id: 'b'.repeat(40), body: 'Missing empty-input coverage' })]
            : [];
        }
        if (route.endsWith('/files')) return fields.page === 1 ? [{ filename: 'src/example.ts' }] : [];
        throw new Error(`Unexpected API route: ${route}`);
      },
      fetchLog: () => Buffer.from(''),
    });
    return { input, issueFetches };
  }

  it('drops review evidence from its OWN verified retro-originated pull request', () => {
    const { input, issueFetches } = collect();
    expect(input.reviews).toEqual([]);
    expect(input.collection.self_pulls_suppressed).toBe(1);
    expect(issueFetches).toEqual([500]);
    expect(evaluateRetro(input as never).action).toBe('noop');
  });

  it('never trusts pull request prose on its own', () => {
    // A human-authored pull request that simply copies the marker text.
    expect(collect({ pullAuthor: 'attacker' }).input.reviews).toHaveLength(1);
    // A bot pull request naming an issue that is not a trusted action issue.
    expect(collect({ issue: { number: 500, state: 'open', user: { login: 'attacker' }, labels: [{ name: 'squad-retro-action' }], body: `Action-Key: ${ACTION_KEY}\n` } }).input.reviews).toHaveLength(1);
    expect(collect({ issue: { number: 500, state: 'closed', user: { login: 'github-actions[bot]' }, labels: [{ name: 'squad-retro-action' }], body: `Action-Key: ${ACTION_KEY}\n` } }).input.reviews).toHaveLength(0);
    // The action issue exists but carries a different key.
    expect(collect({ issue: { number: 500, state: 'open', user: { login: 'github-actions[bot]' }, labels: [{ name: 'squad-retro-action' }], body: 'Action-Key: fail:ffffffffffffffff\n' } }).input.reviews).toHaveLength(1);
    // The marker and the standalone key line disagree, so nothing is proven.
    expect(collect({ pullBody: `Action-Key: fail:ffffffffffffffff\n<!-- squad:retro-action issue=500 action-key=${ACTION_KEY} -->` }).input.reviews).toHaveLength(1);
    // No marker at all: an ordinary bot pull request is ordinary evidence.
    expect(collect({ pullBody: 'Closes #500' }).input.reviews).toHaveLength(1);
  });

  it('keeps the evidence when the verification lookup itself fails', () => {
    const { input } = collect({ issue: null });
    expect(input.reviews).toHaveLength(1);
    expect(input.collection.self_pulls_suppressed).toBe(0);
  });

  it('spends no verification request on a pull request with no marker', () => {
    const { issueFetches } = collect({ pullBody: 'Closes #500' });
    expect(issueFetches).toEqual([]);
  });

  it('retains labels-only claims but suppresses corroborated failure/review evidence with one cached issue read', () => {
    const run = failure({ name: 'CI', head_sha: 'b'.repeat(40), pull_requests: [{ number: 77 }] });
    const verified = collect({ runs: [run] });
    expect(verified.input.workflowRuns).toEqual([]);
    expect(verified.input.reviews).toEqual([]);
    expect(verified.input.collection.self_failures_suppressed).toBe(1);
    expect(verified.issueFetches).toEqual([500]);
    const forged = collect({ runs: [run], pullAuthor: 'human', pullBody: 'Closes #500', pullLabels: ['squad-retro-action'] });
    expect(forged.input.reviews).toHaveLength(1);
    expect(forged.input.workflowRuns).toHaveLength(1);
    expect(forged.issueFetches).toEqual([]);
  });

  it('retains evidence after the shared live-provenance budget is exhausted', () => {
    let sourceReads = 0;
    const pulls = Array.from({ length: 25 }, (_, index) => ({
      number: index + 1, updated_at: '2026-09-06T00:00:00Z', labels: [],
      user: { login: 'github-actions[bot]' },
      head: { ref: `squad/implement-${501 + index}-fix` },
      body: marker(501 + index),
    }));
    const input = collectLiveInput({
      GITHUB_REPOSITORY: 'squad-test/example', GITHUB_WORKSPACE: scratch({}),
      SQUAD_RETRO_EVENT_NAME: 'schedule',
    }, {
      now: new Date('2026-09-07T00:00:00Z'),
      fetchJson: (route, fields) => {
        if (/\/issues\/\d+$/.test(route)) {
          sourceReads++;
          return {
            number: Number(route.split('/').at(-1)), state: 'closed', user: { login: 'github-actions[bot]' },
            labels: ['squad-retro-action'], body: `Action-Key: ${ACTION_KEY}`,
          };
        }
        if (route.endsWith('/issues')) return stateIssue().map(item => ({ ...item, user: { login: item.author } }));
        if (route.endsWith('/comments')) return [];
        if (route.endsWith('/actions/runs')) return { workflow_runs: [] };
        if (route.endsWith('/pulls')) return fields.page === 1 ? pulls : [];
        if (route.endsWith('/reviews')) return [review({ commit_id: 'b'.repeat(40), body: 'Missing empty-input coverage' })];
        if (route.endsWith('/files')) return [{ filename: 'src/example.ts' }];
        throw new Error(route);
      },
    });
    expect(sourceReads).toBe(SELF_PULL_VERIFICATION_LIMIT);
    expect(input.collection.self_pulls_suppressed).toBe(SELF_PULL_VERIFICATION_LIMIT);
    expect(input.reviews).toHaveLength(25 - SELF_PULL_VERIFICATION_LIMIT);
  });
});

describe('retrospective: action authority and sealed plan mutations', () => {
  const key = 'fail:0123456789abcdef';
  const now = '2026-09-07T00:00:00Z';
  const action = (number = 500) => ({
    number, state: 'open', user: { login: 'github-actions[bot]', type: 'Bot' },
    labels: ['squad-retro-action'], body: `Action-Key: ${key}`, comments: [],
  });
  it('allocates five unique deterministic IDs even when every hash prefix collides', () => {
    const keys = Array.from({ length: 5 }, (_, index) => `fail:0123456789abcde${index}`);
    const ids = deriveActionTemporaryIds(keys);
    expect(ids).toEqual(deriveActionTemporaryIds([...keys].reverse()));
    expect(new Set(ids.map(entry => entry.temporary_id)).size).toBe(5);
    expect(deriveActionTemporaryIds([...keys, 'review:0123456789abcdef'])).toHaveLength(5);
    expect(ids.every(entry => /^aw_[a-z0-9_]{8}$/.test(entry.temporary_id))).toBe(true);
  });
  it('keeps an action eligible after its report fingerprint is resolved, without reporting again', () => {
    const result = evaluateRetro(baseInput({
      config: { squadRetroAutoImplement: 'allow' }, workflowRuns: [], reviews: [],
      actionIssues: [action()], implementPulls: [],
      stateComments: stateComment({
        status: 'IDLE', completed_at: '2026-09-06T23:00:00Z',
        resolved_fingerprints: [key], pending_fingerprints: [],
      }),
    }));
    expect(result.action).toBe('reconcile');
    expect(result.auto_implement_candidates).toEqual([{ issue_number: 500, action_key: key, retry: false }]);
    expect(result.auto_implement_new_action_ids).toEqual([]);
  });
  it('continues deterministic action reconciliation when the report evidence API fails', () => {
    const root = scratch({ squadRetroAutoImplement: 'allow' });
    const context = collectRetroContext({
      GITHUB_REPOSITORY: 'squad-test/example', GITHUB_WORKSPACE: root, GITHUB_RUN_ID: '7', SQUAD_RETRO_EVENT_NAME: 'schedule',
    }, {
      now: new Date(now),
      fetchJson: (route, fields) => {
        if (route.endsWith('/issues') && fields.labels === 'squad-retro-action') return [action()];
        if (route.endsWith('/pulls') || route.endsWith('/500/comments')) return [];
        throw new Error('Reporting unavailable');
      },
      fetchGraphql: () => ({
        data: { repository: { issue: { closedByPullRequestsReferences: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } },
      }),
    });
    expect(context.action).toBe('reconcile');
    expect(context.reason).toBe('evidence-collection-unavailable');
    expect(context.auto_implement_candidates).toEqual([{ issue_number: 500, action_key: key, retry: false }]);
    expect(context.run_id).toBe('7');
  });
  it('rotates the bounded comment window rather than starving action 521 forever', () => {
    const visited = new Set<number>();
    const config = resolveRetroConfig({ squadRetroAutoImplement: 'allow' });
    for (let shift = 0; shift < 2; shift++) {
      const result = collectRemediationInput('squad-test/example', config, new Date(Date.parse(now) + shift * 6 * 3600000), (route, fields) => {
        if (route.endsWith('/issues')) return Array.from({ length: 21 }, (_, index) => action(501 + index));
        if (route.endsWith('/pulls')) return [];
        const match = /\/issues\/(\d+)\/comments$/.exec(route);
        if (match) { visited.add(Number(match[1])); return []; }
        throw new Error(route);
      });
      expect(result.collection.action_issues_considered).toBeLessThanOrEqual(20);
      expect(result.collection.action_issues_truncated).toBe(false);
    }
    expect(visited.size).toBe(21);
  });
  it('does not abandon a second dispatch while its worker is still within the retry window', () => {
    const comments = ['2026-09-01T00:00:00Z', '2026-09-06T23:00:00Z'].map((at, index) => ({
      user: { login: 'github-actions[bot]' }, created_at: at, body: guard.dispatchMarker(500, key, String(index + 1), at),
    }));
    const result = deriveAutoImplementCandidates({ actionIssues: [{ ...action(), comments }], implementPulls: [], now, retryHours: 48 });
    expect(result.eligible).toEqual([]);
    expect(result.exhausted).toEqual([]);
  });
  it('fails closed for omitted handoffs, invented actions, cooldown reports and dropped pending requests', () => {
    const plan = {
      action: 'reconcile', state_issue: 41, config: { autoImplementEnabled: true },
      auto_implement_candidates: [{ issue_number: 500, action_key: key }],
      auto_implement_exhausted: [{ issue_number: 501, attempts: 2 }],
      incoming_request: { fingerprint: key, already_pending: false }, qualifying_groups: [],
    };
    const violations = guard.evaluateRetroPlanOutputs([
      { type: 'create_issue', labels: ['squad-retro-action'], body: `Action-Key: ${key}` },
      { type: 'add_comment', data: { squad_artifact: 'retro-report' } },
      { type: 'upsert_retro_state' }, { type: 'upsert_lifecycle_state' },
    ], plan).map(entry => entry.kind);
    expect(violations).toEqual(expect.arrayContaining([
      'action-create-without-report', 'unqualified-action', 'remediation-plan-not-delivered',
      'exhausted-handoff-not-recorded', 'report-during-reconciliation',
      'checkpoint-during-reconciliation', 'pending-request-not-recorded', 'unexpected-retro-output',
    ]));
    const creates = Array.from({ length: 6 }, () => ({ type: 'create_issue', labels: ['squad-retro-action'], body: `Action-Key: ${key}` }));
    expect(guard.evaluateRetroPlanOutputs(creates, { action: 'run' }).map(v => v.kind)).toContain('action-create-cap');
  });
  it('rejects forged/missing sealed context instead of trusting the agent-local advisory JSON', async () => {
    const result = await guard.enforceRetroSafeOutputs({
      GITHUB_REPOSITORY: 'squad-test/example', GITHUB_RUN_ID: '7',
    }, {
      readItems: () => [], readPlan: () => ({ repository: 'squad-test/example', run_id: 'different' }),
      autoImplementEnabled: true,
    });
    expect(result.violations.map(v => v.kind)).toContain('trusted-plan-unavailable');
    const lock = compiledRetroLock();
    expect(lock.indexOf('name: Seal deterministic retrospective plan before the agent')).toBeLessThan(lock.indexOf('name: Execute GitHub Copilot CLI'));
    expect(safeOutputsJob(lock)).toContain('name: Read sealed retrospective plan');
  }, 90000);
});

// Public pinned code is executed in memory. All GitHub writes are API mocks;
// no issues, PRs, artifacts or vendored runtime files are created.
const RUNTIMES = [
  { version: 'v0.87.2', sha: 'b304200a0ef4b3998673bfc7945acb08ab8c88b7' },
  { version: 'compiler v0.87.10 runtime', sha: 'bc8c008a419c5b7a29df6f5641edd35fd1c6ea85' },
];
const runtimeSources = new Map<string, Promise<Record<string, string>>>();
async function pinnedRuntime(sha: string) {
  if (!runtimeSources.has(sha)) {
    runtimeSources.set(sha, Promise.all([
      'temporary_id.cjs', 'safe_output_handler_manager.cjs', 'safe_outputs_status.cjs',
      'sanitize_content_core.cjs', 'markdown_code_region_balancer.cjs', 'dispatch_workflow.cjs', 'aw_context.cjs',
      'safe_output_type_validator.cjs',
    ].map(async name => {
      const response = await fetch(`https://raw.githubusercontent.com/github/gh-aw-actions/${sha}/setup/js/${name}`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Pinned runtime fetch failed: ${name} HTTP ${response.status}`);
      return [name, await response.text()] as const;
    })).then(entries => Object.fromEntries(entries)));
  }
  const source = await runtimeSources.get(sha)!;
  const sent: any[] = [];
  const warnings: string[] = [];
  const nativeRequire = createRequire(import.meta.url);
  const loaded: Record<string, any> = {};
  const noop = () => {};
  const github = { rest: { actions: { createWorkflowDispatch: async (input: any) => { sent.push(input); return { data: { workflow_run_id: 900 } }; } } } };
  const stubs: Record<string, any> = {
    getErrorMessage: (error: any) => String(error.message || error),
    createAuthenticatedGitHubClient: async () => github,
    resolveTargetRepoConfig: () => ({ defaultTargetRepo: null, allowedRepos: new Set() }),
    extractCreatedItemFromResult: () => null,
    readExperimentAssignments: () => null,
    isStagedMode: () => false,
  };
  const fallback = new Proxy(stubs, { get: (target, name: string) => target[name] || (name.startsWith('loadCustom') ? () => new Set() : noop) });
  function load(name: string): any {
    if (loaded[name]) return loaded[name];
    const module = { exports: {} };
    loaded[name] = module.exports;
    runInNewContext(source[name], {
      module, exports: module.exports, Buffer, URL, Map, Set, console, setTimeout, __dirname: '.',
      core: { info: noop, warning: (line: string) => warnings.push(line), error: noop, debug: noop },
      context: { repo: { owner: 'squad-test', repo: 'example' }, payload: { repository: { default_branch: 'dev' } }, ref: 'refs/heads/dev', runId: 88, actor: 'maintainer', eventName: 'schedule' },
      process: { env: {
        GITHUB_RUN_ID: '88', GITHUB_RUN_ATTEMPT: '1', GITHUB_REF: 'refs/heads/dev',
        GITHUB_WORKFLOW_REF: `squad-test/example/${guard.RETRO_WORKFLOW_PATH}@refs/heads/dev`,
        GH_AW_VALIDATION_CONFIG: JSON.stringify({
          create_issue: {
            fields: {
              title: { type: 'string' }, body: { type: 'string' },
              temporary_id: { type: 'string' }, labels: { type: 'array', itemType: 'string' },
            },
            dataEnabled: true,
          },
        }),
      } },
      require: (request: string) => request.startsWith('.') ? source[request.slice(2)] ? load(request.slice(2)) : fallback : nativeRequire(request),
    }, { filename: `${sha}/${name}` });
    return (loaded[name] = module.exports);
  }
  return { load, sent, warnings };
}

async function runtimeNormalizedItems(items: any[], sha = RUNTIMES[1].sha) {
  const runtime = await pinnedRuntime(sha);
  const validator = runtime.load('safe_output_type_validator.cjs');
  // collect_ndjson_output.cjs writes normalizedItem, not the original item,
  // to agent_output.json. JSON round-tripping also removes VM prototypes.
  return JSON.parse(JSON.stringify({ items: items.map((item, index) => {
    const result = validator.validateItem(item, item.type, index + 1);
    expect(result.isValid, result.error).toBe(true);
    return result.normalizedItem;
  }) })).items;
}

describe('pinned gh-aw v0.87.10 normalization boundary', () => {
  const key = 'fail:0123456789abcdef';
  const otherKey = 'review:fedcba9876543210';
  const target = '#aw_f0123450';
  const now = '2026-09-07T00:00:00Z';
  const path = '.squad/skills/regression-testing/SKILL.md';
  const data = { squad_artifact: 'retro-action', schema_version: '1', retro_id: '88', fingerprint: key };
  const rawCreate = (overrides: Record<string, unknown> = {}) => ({
    type: 'create_issue', temporary_id: target.slice(1), title: '[retro] Add regression guidance',
    labels: ['squad-retro-action', 'squad:booster'], body: `Action-Key: ${key}`, data, ...overrides,
  });
  const plan = (autoImplementEnabled: boolean) => ({
    repository: 'squad-test/example', run_id: '88', now, action: 'run',
    config: { autoImplementEnabled, autoImplementRetryHours: 48 }, action_scan_complete: true,
    qualifying_groups: [{ fingerprint: key }, { fingerprint: otherKey }],
    auto_implement_candidates: [],
    auto_implement_new_action_ids: deriveActionTemporaryIds([key, otherKey]),
  });
  const sender = async (items: any[], autoImplementEnabled = false) => {
    const directory = scratch();
    writeFileSync(resolve(directory, 'agent_output.json'), JSON.stringify({ items }));
    return guard.enforceRetroSafeOutputs({
      GITHUB_REPOSITORY: 'squad-test/example', GITHUB_RUN_ID: '88',
      GITHUB_REF: 'refs/heads/dev', SQUAD_RETRO_DEFAULT_BRANCH: 'dev',
    }, {
      directory, autoImplementEnabled, readPlan: () => plan(autoImplementEnabled),
      fetchJson: async () => [],
    });
  };
  const published = (item: any) => ({
    number: 500, state: 'open', user: { login: guard.BOT, type: 'Bot' },
    title: item.title, labels: item.labels, body: item.body,
  });
  const receiver = (item: any) => guard.validateImplementOrigin({
    GITHUB_REPOSITORY: 'squad-test/example', GITHUB_ACTOR: guard.BOT, GITHUB_REF: 'refs/heads/dev',
    SQUAD_IMPLEMENT_EVENT_NAME: 'workflow_dispatch', SQUAD_IMPLEMENT_ISSUE_NUMBER: '500',
    SQUAD_IMPLEMENT_REQUEST_ORIGIN: 'squad-retro', SQUAD_IMPLEMENT_RETRO_ACTION_KEY: key,
    SQUAD_IMPLEMENT_DEFAULT_BRANCH: 'dev',
    SQUAD_IMPLEMENT_AW_CONTEXT: JSON.stringify({
      workflow_id: `squad-test/example/${guard.RETRO_WORKFLOW_PATH}@refs/heads/dev`,
      repo: 'squad-test/example', run_id: '88', run_attempt: '1',
    }),
  }, async route => {
    if (route.endsWith('/actions/runs/88')) return {
      id: 88, run_attempt: 1, path: guard.RETRO_WORKFLOW_PATH, head_branch: 'dev', event: 'schedule',
      repository: { full_name: 'squad-test/example' }, head_repository: { full_name: 'squad-test/example' },
    };
    if (route.endsWith('/comments')) return [{
      user: { login: guard.BOT, type: 'Bot' }, created_at: now,
      body: guard.dispatchMarker(500, key, '88', now),
    }];
    return published(item);
  });
  const reconcile = (item: any, retry = false) => deriveAutoImplementCandidates({
    actionIssues: [{
      ...published(item),
      comments: retry ? [{
        author: guard.BOT, created_at: '2026-09-01T00:00:00Z',
        body: guard.dispatchMarker(500, key, '88', '2026-09-01T00:00:00Z'),
      }] : [],
    }],
    implementPulls: [], now, retryHours: 48,
  }).eligible;
  const transaction = (create: any) => [
    create,
    { type: 'add_comment', item_number: target, body: guard.dispatchMarker(target, key, '88', now) },
    { type: 'dispatch_workflow', workflow_name: guard.IMPLEMENT_WORKFLOW, inputs: {
      issue_number: target, request_origin: guard.RETRO_ORIGIN, retro_action_key: key,
    } },
  ];

  it('accepts real normalized output for report-only creation and create -> receipt -> dispatch', async () => {
    const [created] = await runtimeNormalizedItems([rawCreate()]);
    expect(created.data).toEqual(data);
    expect(created.body.match(/^Structured data:$/gm)).toHaveLength(1);
    expect(created.body).toContain(JSON.stringify(data, null, 2));
    expect(guard.materializeNewActionIssue(created)?.body).toBe(created.body);
    expect(await sender([created])).toMatchObject({ ok: true, violations: [] });
    expect(await sender(transaction(created), true)).toMatchObject({ ok: true, violations: [] });
    expect(await receiver(created)).toMatchObject({ ok: true, violations: [] });
    expect(reconcile(created)).toEqual([{ issue_number: 500, action_key: key, retry: false }]);
    expect(reconcile(created, true)).toEqual([{ issue_number: 500, action_key: key, retry: true }]);
  });

  it.each([
    ['wrong fingerprint', { ...data, fingerprint: otherKey }],
    ['wrong artifact', { ...data, squad_artifact: 'retro-report' }],
    ['wrong schema', { ...data, schema_version: '2' }],
  ])('rejects normalized %s at sender, receiver and reconciliation', async (_name, invalidData) => {
    const [created] = await runtimeNormalizedItems([rawCreate({ data: invalidData })]);
    expect((await sender([created])).violations).toContainEqual({ kind: 'new-action-provenance-invalid' });
    expect((await sender(transaction(created), true)).ok).toBe(false);
    expect((await receiver(created)).ok).toBe(false);
    expect(reconcile(created)).toEqual([]);
    expect(reconcile(created, true)).toEqual([]);
  });

  it('rejects body/data disagreement without manufacturing a duplicate envelope', async () => {
    const [created] = await runtimeNormalizedItems([rawCreate()]);
    expect(await sender([{ ...created, data: Object.fromEntries(Object.entries(data).reverse()) }]))
      .toMatchObject({ ok: true });
    for (const changedData of [
      { ...data, fingerprint: otherKey }, { ...data, squad_artifact: 'retro-report' },
      { ...data, retro_id: '89' }, { ...data, paths: [path] },
    ]) {
      expect((await sender([{ ...created, data: changedData }])).ok).toBe(false);
    }
    const [changedBody] = await runtimeNormalizedItems([rawCreate({ data: { ...data, fingerprint: otherKey } })]);
    expect((await sender([{ ...changedBody, data }])).ok).toBe(false);
    expect((await receiver(changedBody)).ok).toBe(false);
    expect(reconcile(changedBody)).toEqual([]);
  });

  it.each([undefined, '', 'not-a-run', '89'])('rejects a missing or incorrect creating run %s', async retro_id => {
    const [created] = await runtimeNormalizedItems([rawCreate({ data: { ...data, retro_id } })]);
    expect((await sender([created])).violations).toContainEqual({ kind: 'new-action-provenance-invalid' });
  });

  it('rejects missing, malformed and duplicate normalized envelopes but ignores nested examples', async () => {
    const [created] = await runtimeNormalizedItems([rawCreate()]);
    const envelope = created.body.slice(created.body.indexOf('Structured data:'));
    const invalidBodies = [
      rawCreate().body, `${created.body}\n\n${envelope}`,
      `${created.body}\n\nStructured data:\n\`\`\`json\n{`,
      created.body.replace(/\n```$/, ''), `${rawCreate().body}\n\nStructured data:\n\`\`\`json\n{\n\`\`\``,
    ];
    for (const body of invalidBodies) expect((await sender([{ ...created, body }])).ok).toBe(false);
    const [nested] = await runtimeNormalizedItems([rawCreate({
      body: `${rawCreate().body}\n\n\`\`\`\`markdown\nStructured data:\n\`\`\`json\n{"example":true}\n\`\`\`\n\`\`\`\``,
    })]);
    expect(await sender([nested])).toMatchObject({ ok: true });
    expect(await receiver(nested)).toMatchObject({ ok: true });
    expect(reconcile(nested)).toHaveLength(1);
  });

  const proposal = (overrides: Record<string, unknown> = {}) => rawCreate({
    labels: ['squad-retro-action', 'squad-retro-proposal', 'squad:booster'],
    body: `${rawCreate().body}\nProposed-Path: ${path}`, ...overrides,
  });
  it.each([path, '.github/workflows/squad-review.md'])('allows report-only proposals for %s without poisoning unrelated outputs', async proposedPath => {
    const items = await runtimeNormalizedItems([
      proposal({ body: `${rawCreate().body}\nProposed-Path: ${proposedPath}` }),
      rawCreate({
        temporary_id: 'aw_rfedcba1', body: `Action-Key: ${otherKey}`, data: { ...data, fingerprint: otherKey },
      }),
      { type: 'add_comment', item_number: '41', body: 'Retrospective report', data: { squad_artifact: 'retro-report' } },
      { type: 'upsert_retro_state', status: 'IDLE' },
    ]);
    expect(await sender(items)).toMatchObject({ ok: true, violations: [] });
    expect(await sender([
      ...items,
      { type: 'add_comment', item_number: '#aw_rfedcba1', body: guard.dispatchMarker('#aw_rfedcba1', otherKey, '88', now) },
      { type: 'dispatch_workflow', workflow_name: guard.IMPLEMENT_WORKFLOW, inputs: {
        issue_number: '#aw_rfedcba1', request_origin: guard.RETRO_ORIGIN, retro_action_key: otherKey,
      } },
    ], true)).toMatchObject({ ok: true, violations: [] });
    expect(guard.hasTrustedNewActionProvenance(items[0], key)).toBe(true);
    expect(guard.isTrustedActionIssue(published(items[0]), key)).toBe(false);
    expect((await sender(transaction(items[0]), true)).violations).toContainEqual({ kind: 'dispatch-target-is-proposal' });
    expect((await receiver(items[0])).ok).toBe(false);
    expect(reconcile(items[0])).toEqual([]);
    expect(reconcile(items[0], true)).toEqual([]);
    const improvement = await import('../workflows/shared/squad-improvement-gate.mjs');
    expect(improvement.evaluateImprovementApproval({ issue: published(items[0]) })).toMatchObject({
      authorized: false, reason: 'no-approval-comment',
    });
    const approved = improvement.evaluateImprovementApproval({
      issue: published(items[0]), actorPermission: 'write', lastEditedAt: null,
      approval: {
        id: 901, author: 'maintainer', user_type: 'User', created_at: now, updated_at: now,
        revision: improvement.proposalRevision(published(items[0])), paths: [proposedPath],
      },
    });
    expect(approved).toMatchObject(proposedPath === path
      ? { authorized: true, reason: 'approved', paths: [path] }
      : { authorized: false, reason: 'out-of-scope-paths' });
  });

  it.each([
    ['wrong artifact', { data: { ...data, squad_artifact: 'retro-report' } }],
    ['wrong fingerprint', { data: { ...data, fingerprint: otherKey } }],
    ['missing path', { body: rawCreate().body }],
    ['quoted path', { body: `${rawCreate().body}\n\`\`\`\nProposed-Path: ${path}\n\`\`\`` }],
    ['traversal path', { body: `${rawCreate().body}\nProposed-Path: .squad/skills/../../outside.md` }],
    ['absolute path', { body: `${rawCreate().body}\nProposed-Path: /outside.md` }],
    ['malformed extra path', { body: `${rawCreate().body}\nProposed-Path: ${path}\nProposed-Path: two files.md` }],
  ])('rejects a normalized proposal with %s', async (_name, overrides) => {
    const items = await runtimeNormalizedItems([proposal(overrides)]);
    expect((await sender(items)).ok).toBe(false);
  });
});

describe.each(RUNTIMES)('pinned gh-aw-actions $version runtime', ({ sha }) => {
  const key = 'fail:0123456789abcdef';
  const target = '#aw_f0123450';
  const batch = () => [
    {
      type: 'create_issue',
      temporary_id: target.slice(1),
      labels: ['squad-retro-action'],
      body: `Action-Key: ${key}`,
      data: { squad_artifact: 'retro-action', schema_version: '1', retro_id: '88', fingerprint: key },
    },
    { type: 'add_comment', item_number: target, body: guard.dispatchMarker(target, key, '88', '2026-09-07T00:00:00Z') },
    { type: 'dispatch_workflow', workflow_name: 'squad-implement-worker', inputs: { issue_number: target, request_origin: 'squad-retro', retro_action_key: key } },
  ];
  async function deliver(fail = '') {
    const runtime = await pinnedRuntime(sha);
    const ids = runtime.load('temporary_id.cjs');
    const dispatch = await runtime.load('dispatch_workflow.cjs').main({
      workflows: ['squad-implement-worker'], max: 3,
      workflow_files: { 'squad-implement-worker': '.lock.yml' },
      aw_context_workflows: ['squad-implement-worker'],
    });
    const receipts: string[] = [];
    const handlers = new Map([
      ['create_issue', async (item: any) => fail === 'create' ? { success: false, error: 'creation failed' } : {
        success: true, temporaryId: ids.getOrGenerateTemporaryId(item).temporaryId, repo: 'squad-test/example', number: 500,
      }],
      ['add_comment', async (item: any, resolved: any) => {
        if (fail === 'marker' || !Object.keys(resolved).length) return { success: false, error: 'receipt failed' };
        receipts.push(ids.replaceTemporaryIdReferences(item.body, ids.loadTemporaryIdMapFromResolved(resolved), 'squad-test/example'));
        return { success: true };
      }],
      ['dispatch_workflow', dispatch],
    ]);
    const items = await runtimeNormalizedItems(batch(), sha);
    const result = await runtime.load('safe_output_handler_manager.cjs').processMessages(handlers, items);
    return { ...runtime, result, receipts, items };
  }
  it('resolves the same quoted temporary ID through the real manager and dispatch handler', async () => {
    const delivered = await deliver();
    expect(delivered.sent).toHaveLength(1);
    expect(delivered.sent[0].inputs.issue_number).toBe('500');
    expect(delivered.sent[0].inputs.request_origin).toBe('squad-retro');
    expect(JSON.parse(delivered.sent[0].inputs.aw_context)).toMatchObject({
      workflow_id: `squad-test/example/${guard.RETRO_WORKFLOW_PATH}@refs/heads/dev`, run_id: '88',
    });
    expect(delivered.receipts[0]).toBe(guard.dispatchMarker(500, key, '88', '2026-09-07T00:00:00Z'));
    expect(delivered.result.results.map((result: any) => result.type)).toEqual(['create_issue', 'add_comment', 'dispatch_workflow']);
    expect(guard.evaluateRetroDispatchOutputs({ items: delivered.items, autoImplementEnabled: true }).ok).toBe(true);
  }, 120000);
  it('does not call an unresolved ID or missing receipt successful implementation delivery', async () => {
    const missing = await deliver('create');
    expect(missing.sent[0].inputs.issue_number).toBe(target);
    expect(missing.warnings.some(line => line.includes('Unresolved temporary ID'))).toBe(true);
    expect(guard.evaluateImplementDispatchInputs({ eventName: 'workflow_dispatch', issueNumber: missing.sent[0].inputs.issue_number }).ok).toBe(false);
    const markerFailed = await deliver('marker');
    expect(markerFailed.sent[0].inputs.issue_number).toBe('500');
    expect(markerFailed.receipts).toEqual([]);
    const refused = await guard.validateImplementOrigin({
      GITHUB_REPOSITORY: 'squad-test/example', GITHUB_ACTOR: 'github-actions[bot]', GITHUB_REF: 'refs/heads/dev',
      SQUAD_IMPLEMENT_EVENT_NAME: 'workflow_dispatch', SQUAD_IMPLEMENT_ISSUE_NUMBER: '500',
      SQUAD_IMPLEMENT_REQUEST_ORIGIN: 'squad-retro', SQUAD_IMPLEMENT_RETRO_ACTION_KEY: key,
      SQUAD_IMPLEMENT_AW_CONTEXT: markerFailed.sent[0].inputs.aw_context, SQUAD_IMPLEMENT_DEFAULT_BRANCH: 'dev',
    }, async route => {
      if (route.endsWith('/actions/runs/88')) return {
        id: 88, run_attempt: 1, path: guard.RETRO_WORKFLOW_PATH, head_branch: 'dev', event: 'schedule',
        repository: { full_name: 'squad-test/example' }, head_repository: { full_name: 'squad-test/example' },
      };
      if (route.endsWith('/comments')) return [];
      return { number: 500, state: 'open', user: { login: 'github-actions[bot]' }, labels: ['squad-retro-action'], body: `Action-Key: ${key}` };
    });
    expect(refused.violations.map(v => v.kind)).toContain('retro-dispatch-receipt-unproven');
    expect(guard.evaluateRetroDispatchOutputs({ items: [batch()[0], batch()[2], batch()[1]], autoImplementEnabled: true }).ok).toBe(false);
  }, 120000);
  it('round-trips visible provenance through the real sanitizer while bare HTML disappears', async () => {
    const runtime = await pinnedRuntime(sha);
    const sanitize = runtime.load('sanitize_content_core.cjs').sanitizeContentCore;
    const visible = `Closes #500\nAction-Key: ${key}\n${guard.retroActionPullMarker(500, key)}`;
    expect(guard.parseRetroActionPullMarker(sanitize(visible))).toEqual({ issue_number: 500, action_key: key });
    expect(sanitize(`Action-Key: ${key}\n<!-- squad:retro-action issue=500 action-key=${key} -->`)).not.toContain('squad:retro-action');
    for (const entry of deriveActionTemporaryIds(Array.from({ length: 5 }, (_, i) => `fail:0123456789abcde${i}`))) {
      expect(runtime.load('temporary_id.cjs').getOrGenerateTemporaryId({ temporary_id: entry.temporary_id }).temporaryId).toBe(entry.temporary_id);
    }
  }, 120000);
});