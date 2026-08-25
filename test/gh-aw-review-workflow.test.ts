import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWER = read('workflows/squad-review.md');
const ROUTER = read('workflows/squad.md');
const REVIEWER_FRONTMATTER = frontmatter(REVIEWER);
const ROUTER_FRONTMATTER = frontmatter(ROUTER);
const compileWorkspaces: string[] = [];

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function frontmatter(markdown: string): string {
  return markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
}

function yamlBlock(yaml: string, key: string): string {
  const lines = yaml.split('\n');
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyPattern = new RegExp(`^(\\s*)${escapedKey}:\\s*(.*)$`);
  const start = lines.findIndex(line => keyPattern.test(line));
  if (start === -1) return '';

  const indent = lines[start].match(keyPattern)![1].length;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    block.push(line);
  }
  return block.join('\n');
}

function listInBlock(block: string, key: string): string[] {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inline = block.match(new RegExp(`^\\s*${escapedKey}:\\s*\\[(.*)\\]\\s*$`, 'm'));
  if (inline) {
    return inline[1]
      .split(',')
      .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  const lines = block.split('\n');
  const keyPattern = new RegExp(`^(\\s*)${escapedKey}:\\s*$`);
  const start = lines.findIndex(line => keyPattern.test(line));
  if (start === -1) return [];

  const indent = lines[start].match(keyPattern)![1].length;
  const items: string[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    const item = line.match(/^\s+-\s+(.+)$/)?.[1];
    if (item) items.push(item.trim().replace(/^['"]|['"]$/g, ''));
  }
  return items;
}

function provenanceRows(workflow: string): string[] {
  const section = workflow.match(/## Provenance decision tree\n([\s\S]*?)(?=\n## )/)?.[1] ?? '';
  return [...section.matchAll(/^\|\s*([1-4])\s*\|\s*([^|]+)\|\s*([^|]+)\|$/gm)]
    .map(match => `${match[1]}:${match[2].trim()}:${match[3].trim()}`);
}

function assertReviewerContract(workflow: string): void {
  const yaml = frontmatter(workflow);
  const tools = yamlBlock(yaml, 'tools');
  const outputs = yamlBlock(yaml, 'safe-outputs');
  const submitReview = yamlBlock(outputs, 'submit-pull-request-review');
  const concurrency = yamlBlock(yaml, 'concurrency');
  const trigger = yamlBlock(yaml, 'on');
  const rows = provenanceRows(workflow);

  expect(tools).not.toMatch(/^\s+edit:/m);
  expect(outputs).not.toMatch(/^\s+(dispatch-workflow|create-issue|create-pull-request|update-pull-request):/m);
  expect(listInBlock(submitReview, 'allowed-events')).toEqual(['COMMENT', 'REQUEST_CHANGES']);
  expect(submitReview).not.toContain('APPROVE');
  expect(concurrency).toContain('cancel-in-progress: true');
  expect(trigger).not.toMatch(/^\s+forks:/m);
  expect(yaml).toContain('github.event.pull_request.head.repo.full_name == github.repository');
  expect(workflow).toContain('Squad-Review-Head: {40-character lowercase head SHA}');
  expect(rows).toEqual([
    '1:One validated durable worker marker:Squad-authored',
    '2:`squad/implement-*` head branch with no marker-like text:Squad-authored fallback',
    '3:Login `copilot-swe-agent[bot]` or `copilot/*` head branch with no marker-like text:Copilot-authored',
    '4:None of the above:Unattributed',
  ]);
  expect(workflow).toMatch(/invalid provenance\. Fail closed with\s+`noop`; do not fall back/);
  expect(workflow).toMatch(/`Unattributed` is an automatic-review\s+refusal/);
  expect(workflow).toContain('Human approval remains mandatory.');
}

interface CompiledContract {
  lock: string;
  safeOutputs: Record<string, Record<string, unknown>>;
}

function compileReviewer(): CompiledContract {
  const workspace = mkdtempSync(resolve(tmpdir(), 'squad-review-contract-'));
  compileWorkspaces.push(workspace);
  const workflowDir = resolve(workspace, '.github', 'workflows');
  mkdirSync(workflowDir, { recursive: true });
  cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  execFileSync(
    'gh',
    ['aw', 'compile', 'squad-review', '--strict', '--no-check-update'],
    { cwd: workspace, encoding: 'utf8', stdio: 'pipe' },
  );

  const lock = readFileSync(resolve(workflowDir, 'squad-review.lock.yml'), 'utf8').replace(/\r\n/g, '\n');
  const lines = lock.split('\n');
  const configStart = lines.findIndex(line => line.includes('/safeoutputs/config.json') && line.includes('<<'));
  const delimiter = lines[configStart]?.match(/<< '([^']+)'/)?.[1];
  const configEnd = delimiter
    ? lines.findIndex((line, index) => index > configStart && line.trim() === delimiter)
    : -1;

  expect(configStart, 'compiled reviewer must write safe-output config').toBeGreaterThanOrEqual(0);
  expect(delimiter, 'safe-output config must use a parseable heredoc').toBeDefined();
  expect(configEnd, 'safe-output config heredoc must terminate').toBeGreaterThan(configStart);

  return {
    lock,
    safeOutputs: JSON.parse(lines.slice(configStart + 1, configEnd).join('\n')) as Record<
      string,
      Record<string, unknown>
    >,
  };
}

afterAll(() => {
  for (const workspace of compileWorkspaces) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('gh-aw advisory Squad reviewer', () => {
  it('routes /squad review to the isolated workflow and supports automatic PR events', () => {
    const routerDispatch = yamlBlock(ROUTER_FRONTMATTER, 'dispatch-workflow');
    const reviewTrigger = yamlBlock(REVIEWER_FRONTMATTER, 'on');
    const relay = ROUTER.match(/## skill: `squad-review-relay`([\s\S]*?)(?=\n## skill:)/)?.[1] ?? '';
    const relayPayload = JSON.parse(relay.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? '{}') as {
      workflow_name?: string;
      inputs?: Record<string, string>;
      issue_number?: string;
    };

    expect(listInBlock(routerDispatch, 'workflows')).toContain('squad-review');
    expect(ROUTER).toContain('| `/squad review` | Review Relay |');
    expect(ROUTER_FRONTMATTER).toContain('- pull_request_comment');
    expect(REVIEWER).not.toContain('slash_command:');
    expect(reviewTrigger).toMatch(/workflow_dispatch:\n\s+inputs:/);
    expect(reviewTrigger).toMatch(/pull_request:\n\s+types: \[ready_for_review, synchronize\]/);
    expect(relayPayload).toEqual({
      workflow_name: 'squad-review',
      inputs: {
        issue_number: '{pull-request-number}',
        expected_head_sha: '{current-head-sha}',
        request_origin: 'manual',
      },
    });
    expect(relayPayload.issue_number).toBeUndefined();
    expect(relay).not.toContain('"pr_number"');
    expect(relay).toContain('Never call the generic');
  });

  it('enforces attribution priority and refuses malformed or unattributed automatic provenance', () => {
    expect(REVIEWER).toContain(
      '^<!-- squad:implement issue=([1-9][0-9]*) run=([1-9][0-9]*) -->$',
    );
    expect(REVIEWER).toContain('require exactly one marker-like occurrence');
    expect(REVIEWER).toContain('^squad/implement-{captured-issue}-');
    assertReviewerContract(REVIEWER);
  });

  it('keeps reviewer authority advisory-only with bounded verdicts', () => {
    const safeOutputs = yamlBlock(REVIEWER_FRONTMATTER, 'safe-outputs');
    const outputNames = [...safeOutputs.matchAll(/^  ([\w-]+):\s*$/gm)].map(match => match[1]);

    expect(outputNames).toEqual([
      'add-comment',
      'create-pull-request-review-comment',
      'submit-pull-request-review',
    ]);
    expect(REVIEWER).toContain('Never use `APPROVE`');
    assertReviewerContract(REVIEWER);
  });

  it('deduplicates by head SHA, cancels stale runs, and retains fork protection', () => {
    const concurrency = yamlBlock(REVIEWER_FRONTMATTER, 'concurrency');

    expect(concurrency).toContain(
      'group: "squad-review-${{ github.event.inputs.issue_number || github.event.pull_request.number || github.run_id }}"',
    );
    expect(concurrency).toContain('cancel-in-progress: true');
    expect(REVIEWER_FRONTMATTER).not.toMatch(/^\s+forks:/m);
    expect(REVIEWER).toContain('If an existing review body contains the exact marker');
    expect(REVIEWER).toContain('Never re-review an unchanged head');
    expect(REVIEWER).toContain('Re-fetch the pull request immediately before emitting');
  });

  it('covers acceptance, routing, protected files, tests, and changesets', () => {
    for (const requirement of [
      'acceptance criteria',
      '.squad/routing.md',
      'charter named by any `squad:{member}` issue label',
      'protected-file and implementation allowlist policy',
      'changed behavior has focused tests',
      'packages/*/src/',
      '.changeset/*.md',
    ]) {
      expect(REVIEWER).toContain(requirement);
    }
  });

  it('strict-compiles to read-only agent permissions and only advisory write handlers', () => {
    const { lock, safeOutputs } = compileReviewer();
    const agentJob = lock.match(/^  agent:\n([\s\S]*?)(?=^  [\w-]+:\n)/m)?.[1] ?? '';
    const permissionBlock = yamlBlock(agentJob, 'permissions');

    expect(permissionBlock).toContain('contents: read');
    expect(permissionBlock).toContain('issues: read');
    expect(permissionBlock).toContain('pull-requests: read');
    expect(permissionBlock).toContain('copilot-requests: write');
    expect(permissionBlock).not.toMatch(/^\s+(contents|issues|pull-requests): write$/m);
    expect(safeOutputs.add_comment).toMatchObject({ max: 1 });
    expect(safeOutputs.create_pull_request_review_comment).toMatchObject({ max: 10 });
    expect(safeOutputs.submit_pull_request_review).toMatchObject({
      max: 1,
      allowed_events: ['COMMENT', 'REQUEST_CHANGES'],
    });
    expect(safeOutputs).not.toHaveProperty('dispatch_workflow');
    expect(safeOutputs).not.toHaveProperty('create_issue');
    expect(safeOutputs).not.toHaveProperty('create_pull_request');
    expect(lock).toContain('GH_AW_HEAD_SHA: ${{ github.event.pull_request.head.sha }}');
  }, 30000);

  it('kills mutations of every important authority and provenance gate', () => {
    const mutations = [
      REVIEWER.replace('tools:\n  bash:', 'tools:\n  edit:\n  bash:'),
      REVIEWER.replace('safe-outputs:\n  add-comment:', 'safe-outputs:\n  dispatch-workflow:\n    max: 1\n  add-comment:'),
      REVIEWER.replace('allowed-events: [COMMENT, REQUEST_CHANGES]', 'allowed-events: [COMMENT, APPROVE]'),
      REVIEWER.replace('cancel-in-progress: true', 'cancel-in-progress: false'),
      REVIEWER.replace(
        'github.event.pull_request.head.repo.full_name == github.repository',
        'github.event.pull_request.head.repo.full_name != github.repository',
      ),
      REVIEWER.replace(
        '| 1 | One validated durable worker marker | Squad-authored |',
        '| 1 | `squad/implement-*` head branch with no marker-like text | Squad-authored fallback |',
      ),
      REVIEWER.replace('invalid provenance. Fail closed with', 'invalid provenance. Continue with'),
      REVIEWER.replace('`Unattributed` is an automatic-review', '`Unattributed` is an automatic'),
      REVIEWER.replaceAll('Squad-Review-Head: {40-character lowercase head SHA}', 'Reviewed head SHA'),
    ];

    for (const mutation of mutations) {
      expect(() => assertReviewerContract(mutation)).toThrow();
    }
  });
});
