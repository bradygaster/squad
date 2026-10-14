/**
 * Activation identity comes from synchronous createIssue API returns, never model
 * mappings. Native safe outputs retain temporary-ID enforcement for other commands.
 */
import { afterAll, describe, it, expect } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { activationRequest, validateCreateReceipt } from '../workflows/shared/squad-activation.mjs';

const WORKFLOWS_DIR = join(process.cwd(), 'workflows');
const TEST_WORKSPACES_DIR = join(process.cwd(), '.test-workspaces-temporary-ids');

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

function readText(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

describe('gh-aw: activation accepts only one exact plan-comment request', () => {
  it('accepts a numeric comment ID encoded as a string', () => {
    expect(activationRequest([{ type: 'activate_plan', plan_comment_id: '123' }])).toBe(123);
  });

  it.each([
    undefined, null, {}, [], [{ plan_comment_id: '123' }],
    [{ type: 'activate_plan', plan_comment_id: '123' }, { type: 'activate_plan', plan_comment_id: '123' }],
    [{ type: 'create_issue', temporary_id: 'aw_task1', title: 'Task' }],
    [{ type: 'add_labels', item_number: '#aw_task1', labels: ['squad'] }],
    [{ type: 'add_comment', body: 'Accepted', data: { squad_artifact: 'activated' } }],
    [{ type: 'upsert_lifecycle_state', body: 'Activated' }],
  ].map(items => ({ items })))('rejects missing, duplicate and native activation outputs: $items', ({ items }) => {
    expect(() => activationRequest(items)).toThrow(/exactly one activate_plan request/);
  });

  it.each(['create_issue', 'add_labels', 'add_comment', 'upsert_lifecycle_state'])(
    'rejects a valid request mixed with %s',
    type => {
      expect(() => activationRequest([
        { type: 'activate_plan', plan_comment_id: '123' }, { type },
      ])).toThrow(/native creates, acceptance and lifecycle outputs are forbidden/);
    },
  );

  it.each([undefined, null, 123, '', '0', '-1', '01', '1.0', '1e2', ' 123', '123 ', '#123',
    'aw_task1', '#aw_task1', '9007199254740992'])('rejects malformed comment identity %j', id => {
    expect(() => activationRequest([{ type: 'activate_plan', plan_comment_id: id }]))
      .toThrow(/exact numeric plan_comment_id/);
  });

  it.each([
    { issue: 42 }, { bindings: [{ task: '1', issue: 42 }] },
    { repository: 'example/project' }, { accepted: true },
  ])('rejects model-provided authority alongside the comment ID: %j', extra => {
    expect(() => activationRequest([{ type: 'activate_plan', plan_comment_id: '123', ...extra }]))
      .toThrow(/exact numeric plan_comment_id/);
  });
});

describe('gh-aw: create receipts require actual API-return identities', () => {
  const capture = { repository: 'example/project' };
  const operation = { id: 'task:1' };
  const issue = () => ({
    number: 42, id: 1042, node_id: 'I_example_42',
    html_url: 'https://github.com/example/project/issues/42',
    url: 'https://api.github.com/repos/example/project/issues/42',
  });
  const result = () => ({ staged: false, issue: issue() });

  it('preserves the exact number, database ID, node ID and repository from a synchronous result', () => {
    expect(validateCreateReceipt(result(), operation, capture)).toEqual({
      operation_id: 'task:1', repository: 'example/project',
      number: 42, id: 1042, node_id: 'I_example_42',
      url: 'https://github.com/example/project/issues/42',
    });
  });

  it.each([
    null, {}, { success: true }, { staged: true, issue: issue() }, { issue: issue() },
    { staged: false, number: 42 }, { staged: false, issue: { ...issue(), pull_request: {} } },
    { staged: false, temporary_id: 'aw_task1', issue_number: 42 },
  ])('rejects acknowledgements, staged results and claimed mappings: %j', returned => {
    expect(() => validateCreateReceipt(returned, operation, capture))
      .toThrow(/did not return an actual issue/);
  });

  it.each([
    { number: undefined }, { number: 0 }, { number: 1.5 }, { number: '42' },
    { number: 'aw_task1' }, { number: '#aw_task1' }, { number: Number.MAX_SAFE_INTEGER + 1 },
    { id: undefined }, { id: 0 }, { id: '1042' }, { id: Number.MAX_SAFE_INTEGER + 1 },
    { node_id: undefined }, { node_id: '' }, { node_id: 1042 },
  ])('rejects missing or non-API issue identities: %j', mutation => {
    expect(() => validateCreateReceipt({ staged: false, issue: { ...issue(), ...mutation } }, operation, capture))
      .toThrow(/actual issue identities are missing or malformed/);
  });

  it.each([
    { html_url: 'https://github.com/example/other/issues/42' },
    { url: 'https://api.github.com/repos/example/other/issues/42' },
    { html_url: 'https://github.com/example/project/issues/43' },
    { url: 'https://api.github.com/repos/example/project/issues/43' },
    { html_url: 'https://github.com/example/project/pull/42' },
    { html_url: 'https://github.com/example/project/issues/42?claimed=true' },
    { html_url: undefined }, { url: undefined },
  ])('rejects repository, resource and exact URL mismatches: %j', mutation => {
    expect(() => validateCreateReceipt({ staged: false, issue: { ...issue(), ...mutation } }, operation, capture))
      .toThrow(/repository or URL does not match/);
  });

  it.each([
    { operation_id: 'task:1' }, { number: 42 }, { id: 1042 }, { node_id: 'I_example_42' },
  ])('rejects collisions in each independent identity: %j', collision => {
    const previous = {
      operation_id: 'task:2', repository: capture.repository,
      number: 43, id: 1043, node_id: 'I_example_43', ...collision,
    };
    expect(() => validateCreateReceipt(result(), operation, capture, [previous]))
      .toThrow(/duplicate operation or actual issue identity/);
  });

  it('accepts distinct real identities regardless of matching titles', () => {
    const previous = validateCreateReceipt(
      { staged: false, issue: { ...issue(), title: 'Same title' } }, operation, capture,
    );
    const next = {
      number: 43, id: 1043, node_id: 'I_example_43', title: 'Same title',
      html_url: 'https://github.com/example/project/issues/43',
      url: 'https://api.github.com/repos/example/project/issues/43',
    };
    expect(validateCreateReceipt({ staged: false, issue: next }, { id: 'task:2' }, capture, [previous]))
      .toMatchObject({ operation_id: 'task:2', number: 43, id: 1043 });
  });
});

// Native safe-output constraints still apply to non-activation commands.
const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow this gate inspects. Install it with ' +
  '`gh extension install --pin v0.91.5 github/gh-aw` (matches .github/workflows/squad-ci.yml). ' +
  'This gate fails closed rather than skipping: an unmeasured contract is ' +
  'indistinguishable from a violated one (#1834).';

describe('gh-aw: require-temporary-id compiles into the real safe-output config (#1962)', () => {
  let compiledLock: string | null = null;

  function lockText(): string {
    if (compiledLock !== null) return compiledLock;
    const compiler = process.env.SQUAD_GH_AW_BIN ?? 'gh';
    const prefix = process.env.SQUAD_GH_AW_BIN ? [] : ['aw'];
    const versionProbe = spawnSync(compiler, [...prefix, '--version'], { encoding: 'utf8' });
    if (versionProbe.status !== 0) throw new Error(`gh aw --version failed. ${GH_AW_INSTALL_HINT}`);
    expect(`${versionProbe.stdout}\n${versionProbe.stderr}`).toContain('v0.91.5');
    mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
    const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'temp-ids-'));
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

  it('strict-compiles with require-temporary-id declared', () => {
    expect(lockText().length).toBeGreaterThan(0);
  });

  it('wires require_temporary_id: true into the create_issue handler config', () => {
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"create_issue":\{[^}]*"require_temporary_id":true/);
  });

  it('adds temporary_id to create_issue\'s required fields', () => {
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(
      /"required_field_additions":\s*\{\s*"create_issue":\s*\[\s*"temporary_id"\s*\]/,
    );
  });

  it('tells the agent, in its own tool constraints, that temporary_id is required', () => {
    const compiled = lockText().replace(/\\"/g, '"');
    expect(compiled).toMatch(/"create_issue":\s*"\s*CONSTRAINTS:[\s\S]{0,300}?temporary_id is required/);
  });
});
