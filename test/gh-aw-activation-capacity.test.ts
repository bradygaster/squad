/**
 * Trusted activation capacity is enforced before creation and reconciled against
 * actual receipts. Native safe-output caps remain bounded for other commands.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { extractSafeOutputsConfigJson } from './helpers/gh-aw-lock.js';
import {
  ACTIVATION_RECEIPT_SCHEMA, digest, parseActivationPlan, validateReceiptSet,
} from '../workflows/shared/squad-activation.mjs';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-activation-capacity');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

const workflow = readText(join(WORKFLOWS_DIR, 'squad.md'));
const policy = readText(join(WORKFLOWS_DIR, 'shared', 'squad-planning-policy.md'));

function documentedMaxIssues(): number {
  const values = [...policy.matchAll(/max_issues[`|:\s]+(\d+)/g)].map(m => Number(m[1]));
  expect(values.length, 'squad-planning-policy.md must document max_issues values').toBeGreaterThan(0);
  return Math.max(...values);
}

function frontmatterMax(safeOutput: string): number {
  const frontmatter = workflow.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  expect(frontmatter, 'workflows/squad.md must have frontmatter').not.toBe('');
  const block = frontmatter.match(new RegExp(`\\n  ${safeOutput}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`))?.[1];
  expect(block, `frontmatter safe-outputs.${safeOutput} block must exist`).toBeDefined();
  const max = block?.match(/^\s*max:\s*(\d+)\s*$/m)?.[1];
  expect(max, `safe-outputs.${safeOutput} must declare an explicit max`).toBeDefined();
  return Number(max);
}

const MAX_LABELS_PER_ISSUE = 2;
const team = '## Members\n| Name | Role |\n|---|---|\n| Builder | Engineer |';
const registry = {
  schema: 'squad-agent-provenance/v1', schema_version: 1, revision: 1,
  agents: {
    builder: {
      status: 'active', display_name: 'Builder', persistent_name: 'Builder', role: 'Engineer',
      universe: 'descriptive', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    },
  },
};

function taskTable(count: number, kind = 'plan', start = 1, epic = 'epic1'): string {
  const implementation = kind === 'implementation';
  return [
    `| # | Title | ${implementation ? 'Agent' : 'Owner'} | Agent ID | Depends On |${implementation ? ' Epic |' : ''}`,
    `|---|---|---|---|---|${implementation ? '---|' : ''}`,
    ...Array.from({ length: count }, (_, i) =>
      `| ${start + i} | Task ${start + i} | Builder | builder | None |${implementation ? ` ${epic} |` : ''}`),
  ].join('\n');
}

describe('gh-aw: executable activation plan capacity', () => {
  it('derives the documented maximum from all planning profiles', () => {
    expect(documentedMaxIssues()).toBe(50);
  });

  it('accepts exactly 50 flat tasks without creating an extra origin epic', () => {
    const plan = parseActivationPlan(taskTable(50), 'plan', registry, team);
    expect(plan.tasks).toHaveLength(documentedMaxIssues());
    expect(plan.epics).toEqual([]);
    expect(plan.tasks.every(task => task.epic === 'origin')).toBe(true);
  });

  it('rejects 51 flat tasks before any write', () => {
    expect(() => parseActivationPlan(taskTable(51), 'plan', registry, team))
      .toThrow(/exceeds 50 issues/);
  });

  it('counts a phase parent toward the exact 50-issue boundary', () => {
    const plan = parseActivationPlan(`### Phase 1\n${taskTable(49)}`, 'plan', registry, team);
    expect(plan.tasks).toHaveLength(49);
    expect(plan.epics).toEqual(['phase-1']);
    expect(() => parseActivationPlan(`### Phase 1\n${taskTable(50)}`, 'plan', registry, team))
      .toThrow(/exceeds 50 issues/);
  });

  it('counts every distinct phase epic, not only tasks', () => {
    const body = `### Phase 1\n${taskTable(24)}\n### Phase 2\n${taskTable(24, 'plan', 25)}`;
    const plan = parseActivationPlan(body, 'plan', registry, team);
    expect(plan.tasks).toHaveLength(48);
    expect(plan.epics).toEqual(['phase-1', 'phase-2']);
    expect(() => parseActivationPlan(body +
      '\n| 49 | Task 49 | Builder | builder | None |', 'plan', registry, team))
      .toThrow(/exceeds 50 issues/);
  });

  it('counts each granular epic once even when several tasks share it', () => {
    const plan = parseActivationPlan(taskTable(49, 'implementation'), 'implementation', registry, team);
    expect(plan.tasks).toHaveLength(49);
    expect(plan.epics).toEqual(['epic1']);
    expect(() => parseActivationPlan(taskTable(50, 'implementation'), 'implementation', registry, team))
      .toThrow(/exceeds 50 issues/);
  });

  it('bounds the parser label contribution to one certified owner plus the base squad label', () => {
    const body = taskTable(1) + '\n| 2 | External task | @copilot | - | None |';
    const plan = parseActivationPlan(body, 'plan', registry, team);
    expect(plan.tasks.map(task => task.label)).toEqual(['squad:builder', 'squad:copilot']);
    for (const task of plan.tasks) {
      expect(['squad', ...(task.label ? [task.label] : [])].length).toBeLessThanOrEqual(MAX_LABELS_PER_ISSUE);
    }
    expect(() => parseActivationPlan(body.replace('| Builder | builder |', '| Builder, Visitor | builder |'),
      'plan', registry, team)).toThrow(/unknown non-roster owner/);
    expect(() => parseActivationPlan(`${body}\n| 3 | Unassigned task | Visitor | - | None |`,
      'plan', registry, team)).toThrow(/unknown non-roster owner/);
  });

  it.each(['1', '', '#aw_task1', 'task 2'])('rejects duplicate or malformed stable task ID %j', id => {
    const body = taskTable(1) + `\n| ${id} | Another task | Builder | builder | None |`;
    expect(() => parseActivationPlan(body, 'plan', registry, team))
      .toThrow(/stable task IDs are missing, malformed or duplicated/);
  });

  it('rejects stable-ID collisions across phase tables', () => {
    expect(() => parseActivationPlan(`### Phase 1\n${taskTable(1)}\n### Phase 2\n${taskTable(1)}`,
      'plan', registry, team)).toThrow(/duplicated/);
  });

  it('topologically sorts a DAG without requiring table order to match dependency order', () => {
    const body = taskTable(3).replace('| builder | None |', '| builder | 3 |');
    const plan = parseActivationPlan(body, 'plan', registry, team);
    expect(plan.tasks.map(task => task.id)).toEqual(['3', '1', '2']);
    expect(plan.tasks.find(task => task.id === '1')?.dependencies).toEqual(['3']);
  });

  it.each([
    ['1', /cyclic dependency/], ['99', /references missing task 99/],
    ['2, 2', /unique comma-separated/], ['#aw_task2', /unique comma-separated/],
  ])('rejects invalid dependency %s', (dependency, error) => {
    expect(() => parseActivationPlan(taskTable(2).replace('| builder | None |', `| builder | ${dependency} |`),
      'plan', registry, team)).toThrow(error);
  });

  it('rejects a multi-task cycle', () => {
    const body = taskTable(2).replace('| builder | None |', '| builder | 2 |')
      .replace('| builder | None |', '| builder | 1 |');
    expect(() => parseActivationPlan(body, 'plan', registry, team)).toThrow(/cyclic dependency/);
  });
});

describe('gh-aw: receipt sets account for every actual create operation', () => {
  const capture = {
    repository: 'example/project', run_id: 100, run_attempt: 1,
    operations: [{ id: 'epic:phase-1' }, { id: 'task:1' }, { id: 'task:2' }],
  };
  function journal() {
    return {
      schema: ACTIVATION_RECEIPT_SCHEMA, capture_sha256: digest(capture),
      repository: capture.repository, run_id: capture.run_id, run_attempt: capture.run_attempt,
      started: capture.operations.map(operation => operation.id),
      parent_fallbacks: [],
      receipts: capture.operations.map((operation, i) => ({
        operation_id: operation.id, repository: capture.repository,
        number: 42 + i, id: 1042 + i, node_id: `I_example_${42 + i}`,
        url: `https://github.com/example/project/issues/${42 + i}`,
      })),
    };
  }

  it('returns exact operation-to-issue mappings only for a complete journal', () => {
    expect([...validateReceiptSet(capture, journal())]).toEqual(
      journal().receipts.map(receipt => [receipt.operation_id, receipt]),
    );
  });

  it.each([[], ['epic:phase-1'], ['epic:phase-1', 'task:1', 'task:1'],
    ['task:1', 'epic:phase-1', 'task:2'], ['epic:phase-1', 'task:1', 'task:2', 'task:3']]
    .map(started => ({ started })))(
    'rejects absent, partial, duplicated, reordered or surplus operations: $started', ({ started }) => {
      expect(() => validateReceiptSet(capture, { ...journal(), started }))
        .toThrow(/operations are incomplete, duplicated or out of order/);
    },
  );

  it.each([0, 1, 2])('rejects %i receipts after all three writes were started without authorizing recreation', count => {
    const value = journal();
    value.receipts = value.receipts.slice(0, count);
    expect(() => validateReceiptSet(capture, value)).toThrow(/recreation is forbidden/);
  });

  it('rejects more receipts than operations', () => {
    const value = journal();
    value.receipts.push(value.receipts[0]);
    expect(() => validateReceiptSet(capture, value)).toThrow(/actual create receipts are missing/);
  });

  it.each([
    { schema: 'unknown' }, { capture_sha256: 'claimed' }, { repository: 'example/other' },
    { run_id: 101 }, { run_attempt: 2 },
  ])('rejects journal provenance mismatch: %j', mutation => {
    expect(() => validateReceiptSet(capture, { ...journal(), ...mutation }))
      .toThrow(/does not match the frozen capture/);
  });

  it.each([{ started: undefined }, { receipts: undefined }, { receipts: {} }])(
    'rejects malformed operation evidence: %j', mutation => {
      expect(() => validateReceiptSet(capture, { ...journal(), ...mutation })).toThrow(/journal is malformed/);
    },
  );

  it.each([
    { operation_id: 'task:99' }, { repository: 'example/other' },
  ])('rejects a receipt assigned to the wrong operation or repository: %j', mutation => {
    const value = journal();
    Object.assign(value.receipts[1], mutation);
    expect(() => validateReceiptSet(capture, value)).toThrow(/operation identity or repository mismatch/);
  });

  it('rejects colliding actual issue identities despite a complete count', () => {
    const value = journal();
    value.receipts[1] = { ...value.receipts[0], operation_id: 'task:1' };
    expect(() => validateReceiptSet(capture, value)).toThrow(/duplicate operation or actual issue identity/);
  });
});

describe('gh-aw: configured native caps cover both readings of max (#1961)', () => {
  const maxIssues = documentedMaxIssues();
  const createIssueMax = frontmatterMax('create-issue');
  const addLabelsMax = frontmatterMax('add-labels');

  it('preserves established caps without broadening the write budget', () => {
    expect(createIssueMax).toBe(75);
    expect(addLabelsMax).toBe(110);
  });
  it('create-issue covers one item per issue with bounded margin', () => {
    expect(createIssueMax).toBeGreaterThanOrEqual(maxIssues);
    expect(createIssueMax).toBeLessThanOrEqual(maxIssues * 3);
  });
  it('add-labels covers one call per issue and every label name', () => {
    expect(addLabelsMax).toBeGreaterThanOrEqual(maxIssues);
    expect(maxIssues * MAX_LABELS_PER_ISSUE).toBe(100);
    expect(addLabelsMax).toBeGreaterThanOrEqual(maxIssues * MAX_LABELS_PER_ISSUE);
  });
  it('retains bounded margin and never falls below the create-issue cap', () => {
    const worstCase = Math.max(maxIssues, maxIssues * MAX_LABELS_PER_ISSUE);
    expect(addLabelsMax).toBeGreaterThan(worstCase);
    expect(addLabelsMax).toBeLessThanOrEqual(worstCase * 2);
    expect(addLabelsMax).toBeGreaterThanOrEqual(createIssueMax);
  });
});

const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install --pin v0.91.5 github/gh-aw` (matches .github/workflows/squad-ci.yml). ' +
  'This gate fails closed rather than skipping: an unmeasured contract is ' +
  'indistinguishable from a violated one (#1834).';

describe('gh-aw: compiled runtime proves the capacity contract (#1961)', () => {
  let compiledLock: string | null = null;
  function lockText(): string {
    if (compiledLock !== null) return compiledLock;
    const compiler = process.env.SQUAD_GH_AW_BIN ?? 'gh';
    const prefix = process.env.SQUAD_GH_AW_BIN ? [] : ['aw'];
    const versionProbe = spawnSync(compiler, [...prefix, '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    expect(`${versionProbe.stdout}\n${versionProbe.stderr}`).toContain('v0.91.5');
    mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
    const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'capacity-'));
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });
    cpSync(WORKFLOWS_DIR, join(workspace, '.github', 'workflows'), { recursive: true });
    execFileSync(compiler, [...prefix, 'compile', '.github/workflows/squad.md', '--strict', '--no-check-update'], {
      cwd: workspace, encoding: 'utf8', stdio: 'pipe',
    });
    const lockPath = join(workspace, '.github', 'workflows', 'squad.lock.yml');
    if (!existsSync(lockPath)) {
      throw new Error(`gh aw compile produced no squad.lock.yml — the contract is unmeasured. ${GH_AW_INSTALL_HINT}`);
    }
    compiledLock = readText(lockPath);
    return compiledLock;
  }
  function safeOutputsConfig(): Record<string, Record<string, unknown>> {
    const json = extractSafeOutputsConfigJson(lockText());
    expect(json, 'compiled lock must carry the safe-outputs config').toBeDefined();
    return JSON.parse(json as string);
  }
  it('strict-compiles with the capacity configuration in place', () => {
    expect(lockText().length).toBeGreaterThan(0);
  });
  it('compiles the declared add_labels max into runtime config', () => {
    const config = safeOutputsConfig();
    expect(config['add_labels']).toBeDefined();
    expect(config['add_labels']['max']).toBe(frontmatterMax('add-labels'));
    expect(config['add_labels']['max'] as number).toBeGreaterThanOrEqual(
      documentedMaxIssues() * MAX_LABELS_PER_ISSUE,
    );
  });
  it('keeps create_issue capacity unchanged at its established value', () => {
    expect(safeOutputsConfig()['create_issue']['max']).toBe(75);
  });
  it('injects a tool constraint whose number matches the configured cap', () => {
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toContain(`CONSTRAINTS: Maximum ${frontmatterMax('add-labels')} add_labels call(s) allowed.`);
    expect(compiled).toContain('Maximum 10 label(s) per call.');
  });
  it('enables report_incomplete as a callable failure signal for non-activation commands', () => {
    expect(Object.prototype.hasOwnProperty.call(safeOutputsConfig(), 'report_incomplete')).toBe(true);
  });
  it('exposes add_labels and create_issue for non-activation commands', () => {
    expect(lockText()).toMatch(/"tools":\[[^\]]*"add_labels"[^\]]*\]/);
    expect(lockText()).toMatch(/"tools":\[[^\]]*"create_issue"[^\]]*\]/);
  });
  it('keeps write permissions out of the agent job', () => {
    const compiled = lockText();
    const agentJobAt = compiled.indexOf('\n  agent:\n');
    const safeOutputsJobAt = compiled.indexOf('\n  safe_outputs:\n');
    expect(agentJobAt, '"agent:" job missing from compiled lock').toBeGreaterThan(-1);
    expect(safeOutputsJobAt, '"safe_outputs:" job missing from compiled lock').toBeGreaterThan(agentJobAt);
    const permsBlock = compiled.slice(agentJobAt, safeOutputsJobAt).match(/permissions:\n((?:\s{6}\S.*\n)+)/)?.[1] ?? '';
    expect(permsBlock).toContain('issues: read');
    expect(permsBlock).not.toContain('issues: write');
  });
});
