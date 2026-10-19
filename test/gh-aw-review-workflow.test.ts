import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractSafeOutputsConfigJson } from './helpers/gh-aw-lock.js';
import { parse } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEWER = read('workflows/squad-review.md');
const ROUTER = read('workflows/squad.md');
const GUIDE = read('docs/src/content/docs/guide/gh-aw.md');
const README = read('README.md');
const AGENT_GUIDE = read('.github/agents.md');
const DEMO = read('docs/demo-agentic-sdlc-walkthrough.md');
const SHARED_BOOTSTRAP = read('workflows/shared/squad.md');
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

function assertRelayHeadBinding(workflow: string): void {
  const relay = workflow.match(/## skill: `squad-review-relay`([\s\S]*?)(?=\n## skill:)/)?.[1] ?? '';
  const normalized = relay.replace(/\s+/g, ' ');
  expect(normalized).toContain("`head_sha` equals the pull request's exact base/workflow SHA");
  expect(normalized).toContain(
    "`pull_requests[].head.sha` equals the pull request's exact current head SHA",
  );
  expect(normalized).toContain(
    "review guard binds `workflow_sha` to the pull request's exact base SHA",
  );
  expect(normalized).toContain(
    '`pull_requests[].head.sha` binds the reviewed revision to the exact pull request head',
  );
}

function assertRelayRuntimeBinding(workflow: string): void {
  const frontmatter = workflow.split('---')[1] ?? '';
  const relayBindings = frontmatter.match(
    /SQUAD_REVIEW_PR:[\s\S]*?SQUAD_REVIEW_DEFAULT_BRANCH:/g,
  ) ?? [];
  expect(relayBindings).toHaveLength(2);
  for (const binding of relayBindings) {
    expect(binding).toContain(
      'SQUAD_REVIEW_WORKFLOW_SHA: ${{ github.event.pull_request.base.sha }}',
    );
  }
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
  expect(outputs).not.toMatch(/^\s+(create-issue|create-pull-request|update-pull-request):/m);
  expect(outputs).not.toMatch(/^\s+dispatch-workflow:/m);
  expect(listInBlock(submitReview, 'allowed-events')).toEqual(['COMMENT', 'REQUEST_CHANGES']);
  expect(submitReview).not.toContain('APPROVE');
  expect(concurrency).toContain('cancel-in-progress: true');
  expect(trigger).not.toMatch(/^\s+forks:/m);
  expect(trigger).not.toContain('workflow_dispatch:');
  expect(trigger).toMatch(/pull_request_target:/);
  expect(trigger).not.toMatch(/^\s+pull_request:/m);
  expect(yaml).toContain('checkout: false');
  expect(yaml).toContain('strict: false');
  expect(yaml).toContain('github.event.pull_request.head.repo.full_name == github.repository');
  expect(yaml).toContain('SQUAD_REVIEW_WORKFLOW_SHA: ${{ github.workflow_sha }}');
  expect(yaml).toContain('ref: ${{ github.event.pull_request.base.sha }}');
  expect(yaml).not.toContain('ref: ${{ github.workflow_sha }}');
  expect(yaml).not.toContain('github.event.inputs');
  expect(workflow).toContain('Squad-Review-Head: {40-character lowercase head SHA}');
  expect(rows).toEqual([
    '1:One validated durable worker marker:Squad-authored',
    '2:`squad/implement-*` head branch with no marker-like text:Squad-authored fallback',
    '3:Login `copilot-swe-agent[bot]` or `copilot/*` head branch with no marker-like text:Copilot-authored',
    '4:None of the above:Unattributed',
  ]);
  expect(workflow).toMatch(/invalid provenance\. Fail closed with\s+`noop`; do not fall back/);
  expect(workflow).toContain('Every same-repository PR (including');
  expect(workflow).toContain('inlined-imports: true');
  expect(workflow).toContain('await guard.enforceReviewOutputs');
  expect(workflow).toContain('await guard.assertClearingReview');
  expect(workflow).toContain('name: review');
  expect(workflow).not.toContain('Publish exact-head required check');
  expect(workflow).not.toMatch(/SQUAD_REVIEW_APP_|squad-review-authority|checks:\s*write/);
  expect(workflow).toContain('The workflow-installation PR is an explicit human trust boundary.');
  expect(workflow).toContain('Trusted review starts on the automatic post-merge Cast PR.');
  expect(workflow).toContain('Human approval remains mandatory.');
}

interface CompiledContract {
  lock: string;
  safeOutputs: Record<string, Record<string, unknown>>;
}

function compileReviewer(workflow = REVIEWER): CompiledContract {
  const workspace = mkdtempSync(resolve(ROOT, '.squad-review-contract-'));
  compileWorkspaces.push(workspace);
  const workflowDir = resolve(workspace, '.github', 'workflows');
  mkdirSync(workflowDir, { recursive: true });
  cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });
  writeFileSync(resolve(workflowDir, 'squad-review.md'), workflow);
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  execFileSync(
    'gh',
    ['aw', 'compile', 'squad-review', '--strict', '--no-check-update'],
    { cwd: workspace, encoding: 'utf8', stdio: 'pipe', timeout: 60000 },
  );

  const lock = readFileSync(resolve(workflowDir, 'squad-review.lock.yml'), 'utf8').replace(/\r\n/g, '\n');
  const jsonText = extractSafeOutputsConfigJson(lock);
  expect(jsonText, 'compiled reviewer must write a parseable safe-output config').toBeDefined();

  return {
    lock,
    safeOutputs: JSON.parse(jsonText!) as Record<string, Record<string, unknown>>,
  };
}

afterAll(() => {
  for (const workspace of compileWorkspaces) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function assertCompiledGate(lock: string): void {
  const workflow = parse(lock);
  const { jobs } = workflow;
  expect(workflow.on).toHaveProperty('pull_request_target');
  expect(workflow.on).not.toHaveProperty('pull_request');
  expect(workflow['run-name']).toBe('Squad review — PR #${{ github.event.pull_request.number }}');
  const review = jobs.review;
  expect(review.name).toBe('review');
  expect(review.if).toBe('always()');
  expect(JSON.stringify(review)).not.toContain(
    'github.event.pull_request.head.repo.full_name == github.repository',
  );
  expect(review.needs).toEqual(expect.arrayContaining(['agent', 'safe_outputs']));
  const execution = review.steps.find((step: { name: string }) => step.name === 'Require successful PR review execution');
  expect(execution.run).toContain('test "$AGENT_RESULT" = success');
  expect(execution.run).toContain('test "$OUTPUT_RESULT" = success');
  expect(review.steps.at(-1).with.script).toContain('await guard.assertClearingReview');
  expect(review.steps.at(-1).env.SQUAD_REVIEW_HEAD).toBe('${{ github.event.pull_request.head.sha }}');
  expect(review.steps.at(-1).env.SQUAD_REVIEW_WORKFLOW_SHA).toBe('${{ github.workflow_sha }}');
  const steps = jobs.safe_outputs.steps;
  const guard = steps.findIndex((step: { name: string }) => step.name === 'Bind review output to committed agent identities and current head');
  const process = steps.findIndex((step: { name: string }) => step.name === 'Process Safe Outputs');
  expect(guard).toBeGreaterThan(-1);
  expect(process).toBeGreaterThan(guard);
  expect(steps[guard].with.script).toContain('await guard.enforceReviewOutputs');
  expect(steps[guard].if).toBeUndefined();
  expect(steps[guard]['continue-on-error']).toBeUndefined();
  const baseCheckout = steps.find((step: { name: string }) =>
    step.name === 'Checkout base commit for review guard');
  expect(baseCheckout.with.ref).toBe('${{ github.event.pull_request.base.sha }}');
  expect(steps.some((step: { name: string }) =>
    step.name.includes('workflow commit'))).toBe(false);
  expect(steps[guard].with.script).toContain('!existsSync(baseGuard) || !existsSync(baseManifest)');
  expect(steps[guard].with.script).toContain('First-install manual boundary');
  expect(steps[guard].with.script).toContain('pathToFileURL(baseGuard)');
  expect(steps[guard].with.script).not.toContain('github.workflow_sha');
  expect(steps[guard].with.script).not.toContain('.squad-review-workflow');
  expect(steps[guard].with.script).not.toContain('Squad-Review-Verdict:');
  const finalGate = review.steps.find((step: { name: string }) =>
    step.name === 'Enforce independent current-head verdict');
  expect(finalGate.with.script).toContain('!existsSync(baseGuard) || !existsSync(baseManifest)');
  expect(finalGate.with.script).toContain('First-install manual boundary');
  expect(finalGate.with.script).toContain('pathToFileURL(baseGuard)');
  expect(finalGate.with.script).not.toContain('github.workflow_sha');
  expect(finalGate.with.script).not.toContain('.squad-review-workflow');
  expect(finalGate.with.script).not.toContain('Squad-Review-Verdict:');
  for (const step of review.steps) expect(step['continue-on-error']).toBeUndefined();
  expect(review['continue-on-error']).toBeUndefined();
  expect(jobs.publish).toBeUndefined();
  expect(lock).not.toMatch(/SQUAD_REVIEW_APP_|squad-review-authority/);
  expect(lock).not.toMatch(/checks:\s*write/);
  expect(lock).not.toContain('actions/create-github-app-token');
  expect(lock).not.toContain('github.rest.checks.');
  expect(lock).not.toContain('Checkout PR branch');
  expect(lock).not.toMatch(/uses:\s+\.\/\.github\/actions\//);
}

function compiledGuardScripts(lock: string): Array<{ name: string; script: string }> {
  const workflow = parse(lock);
  const safeOutputsStep = workflow.jobs.safe_outputs.steps.find((candidate: { name: string }) =>
    candidate.name === 'Bind review output to committed agent identities and current head');
  const finalGateStep = workflow.jobs.review.steps.find((candidate: { name: string }) =>
    candidate.name === 'Enforce independent current-head verdict');
  expect(safeOutputsStep, 'compiled safe_outputs guard step is missing').toBeDefined();
  expect(finalGateStep, 'compiled final verdict guard step is missing').toBeDefined();
  return [
    { name: 'safe outputs', script: safeOutputsStep.with.script },
    { name: 'final verdict', script: finalGateStep.with.script },
  ];
}

async function executeCompiledGuardLoader(
  script: string,
  {
    baseGuard,
    baseManifest = false,
    dispatchGuard,
    head = 'a'.repeat(40),
  }: { baseGuard?: string; baseManifest?: boolean; dispatchGuard?: string; head?: string },
): Promise<string> {
  const workspace = mkdtempSync(resolve(ROOT, '.squad-review-loader-'));
  compileWorkspaces.push(workspace);
  const output = resolve(workspace, 'loaded.txt');
  const guardPath = '.github/workflows/shared/squad-review-guard.mjs';
  if (baseGuard !== undefined) {
    const path = resolve(workspace, '.squad-review-base', guardPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, baseGuard);
  }
  if (baseManifest) {
    const path = resolve(
      workspace,
      '.squad-review-base',
      '.github/aw/squad-workflows.manifest.json',
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '{}\n');
  }
  if (dispatchGuard !== undefined) {
    const path = resolve(
      workspace,
      '.github',
      'workflows',
      'shared',
      'squad-review-guard.mjs',
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, dispatchGuard);
  }
  const previousWorkspace = process.env.GITHUB_WORKSPACE;
  const previousOutput = process.env.SQUAD_TEST_GUARD_OUTPUT;
  const previousHead = process.env.SQUAD_REVIEW_HEAD;
  process.env.GITHUB_WORKSPACE = workspace;
  process.env.SQUAD_TEST_GUARD_OUTPUT = output;
  process.env.SQUAD_REVIEW_HEAD = head;
  try {
    const runner = resolve(workspace, 'runner.mjs');
    writeFileSync(runner, `
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const github = { request: async () => ({ data: {} }) };
      ${script}
    `);
    await import(`${pathToFileURL(runner).href}?run=${Date.now()}`);
    return readFileSync(output, 'utf8');
  } finally {
    if (previousWorkspace === undefined) delete process.env.GITHUB_WORKSPACE;
    else process.env.GITHUB_WORKSPACE = previousWorkspace;
    if (previousOutput === undefined) delete process.env.SQUAD_TEST_GUARD_OUTPUT;
    else process.env.SQUAD_TEST_GUARD_OUTPUT = previousOutput;
    if (previousHead === undefined) delete process.env.SQUAD_REVIEW_HEAD;
    else process.env.SQUAD_REVIEW_HEAD = previousHead;
  }
}

describe('gh-aw enforcing Squad reviewer', () => {
  it('keeps review automatic and makes /squad review a non-dispatching rerun guide', () => {
    const routerDispatch = yamlBlock(ROUTER_FRONTMATTER, 'dispatch-workflow');
    const reviewTrigger = yamlBlock(REVIEWER_FRONTMATTER, 'on');
    const relay = ROUTER.match(/## skill: `squad-review-relay`([\s\S]*?)(?=\n## skill:)/)?.[1] ?? '';

    expect(listInBlock(routerDispatch, 'workflows')).not.toContain('squad-review');
    expect(ROUTER_FRONTMATTER).toContain('actions: read');
    expect(ROUTER).toContain('| `/squad review` | Review Relay |');
    expect(REVIEWER).not.toContain('slash_command:');
    expect(reviewTrigger).toMatch(/pull_request_target:\n\s+types: \[opened, reopened, ready_for_review, synchronize\]/);
    expect(reviewTrigger).not.toContain('workflow_dispatch:');
    expect(relay).toContain('.github/workflows/squad-review.lock.yml');
    expect(relay).toContain('exact current head');
    expect(relay).toMatch(/require exactly one job named `review`/);
    expect(relay).not.toContain('check runs');
    expect(relay).not.toContain('dispatch-workflow');
    expect(relay).toMatch(/command did not rerun it\./);
    expect(relay).toMatch(/no base-controlled automatic review run exists for\s+the exact head/);
    assertRelayHeadBinding(ROUTER);
    assertRelayHeadBinding(read('workflows/package/squad.md'));
    assertRelayRuntimeBinding(read('workflows/squad-implement-worker.md'));
    assertRelayRuntimeBinding(read('workflows/package/squad-implement-worker.md'));
  });

  it('rejects dispatcher source mutations conflating API run head and workflow source', () => {
    for (const mutation of [
      ROUTER.replace("`head_sha` equals the pull request's exact base/workflow SHA",
        "`head_sha` equals the pull request's exact current head SHA"),
      ROUTER.replace(
        "`pull_requests[].head.sha` equals the pull request's exact current head SHA",
        "`pull_requests[].head.sha` equals the pull request's exact base SHA",
      ),
      ROUTER.replace("review guard binds `workflow_sha` to the pull request's exact base",
        "review guard binds `workflow_sha` to the pull request's exact head"),
    ]) {
      expect(() => assertRelayHeadBinding(mutation)).toThrow();
    }
  });

  it('limits slash commands to issue and pull request conversation surfaces', () => {
    const slashCommand = yamlBlock(ROUTER_FRONTMATTER, 'slash_command');
    const guideSection = GUIDE.match(/## Slash commands[\s\S]*?(?=\n## Casting a team)/)?.[0] ?? '';

    expect(listInBlock(slashCommand, 'events')).toEqual([
      'issues',
      'issue_comment',
      'pull_request_comment',
    ]);
    expect(slashCommand).not.toContain('pull_request_review_comment');
    expect(ROUTER).toContain('PR conversation comment');
    expect(ROUTER).not.toMatch(/PR review comment|pull request review comment/i);
    expect(guideSection).toContain('PR conversation comment');
    expect(guideSection).toContain('Inline code-review threads do not trigger Squad commands.');
    expect(guideSection).not.toMatch(/PR review comment|pull request review comment/i);
  });

  it('declares the complete native package for the pinned compiler job', () => {
    const manifest = read('workflows/aw.yml');
    expect(manifest).toContain('min-version: v0.91.5');
    expect(manifest.match(/destination: \.github\/workflows\/squad(?:-[\w-]+)?\.md/g)).toHaveLength(8);
    expect(manifest.match(/source: package\/squad(?:-[\w-]+)?\.md/g)).toHaveLength(8);
    expect(manifest).toContain('  - skills/gh-aw-enlistment');
    expect(read('.github/workflows/squad-ci.yml')).toContain(
      'gh extension install --force --pin v0.91.5 github/gh-aw',
    );
  });

  it('detects a missing workflow_dispatch job discriminator during strict compilation', () => {
    const workspace = mkdtempSync(resolve(ROOT, '.squad-review-discriminator-mutation-'));
    compileWorkspaces.push(workspace);
    const workflowDir = resolve(workspace, '.github', 'workflows');
    mkdirSync(workflowDir, { recursive: true });
    cpSync(resolve(ROOT, 'workflows'), workflowDir, { recursive: true });

    const workerPath = resolve(workflowDir, 'squad-deps-worker.md');
    const worker = readFileSync(workerPath, 'utf8').replace(/\r\n/g, '\n');
    expect(worker).toContain('  job-discriminator: ${{ github.run_id }}\n');
    writeFileSync(workerPath, worker.replace('  job-discriminator: ${{ github.run_id }}\n', ''));
    execFileSync('git', ['init', '--quiet'], { cwd: workspace });

    const result = spawnSync(
      'gh',
      ['aw', 'compile', 'squad-deps-worker', '--strict', '--no-check-update', '--no-emit'],
      { cwd: workspace, encoding: 'utf8', stdio: 'pipe', timeout: 60000 },
    );
    const diagnostics = `${result.stdout}\n${result.stderr}`;
    expect(result.error, 'failed to launch gh aw for discriminator mutation').toBeUndefined();
    expect(result.status, `mutated workflow must remain compilable:\n${diagnostics}`).toBe(0);
    expect(diagnostics).toContain(
      'workflow_dispatch workflow has no concurrency.job-discriminator',
    );
  }, 20000);

  it('keeps all consumer install surfaces on the isolated native package', () => {
    for (const surface of [GUIDE, README, AGENT_GUIDE, SHARED_BOOTSTRAP]) {
      expect(surface).toContain('bradygaster/squad/workflows@${SQUAD_SHA}');
      expect(surface).not.toMatch(/gh aw add \\\n\s+bradygaster\/squad\/workflows\/squad\.md/);
    }
    expect(DEMO).toContain("gh-aw guide's install command");
    expect(DEMO).not.toContain('gh aw add bradygaster/squad/workflows/squad.md@latest');
  });

  it('documents enforcement, explicit override, and the independent human approval requirement', () => {
    expect(GUIDE).toContain('| Review | `/squad review` |');
    expect(GUIDE).not.toContain('/squad review fix');
    expect(GUIDE).not.toContain('Review lifecycle and current gaps');
    expect(GUIDE).not.toContain('There is no separate `/squad review` command');
    expect(GUIDE).toContain('`ready_for_review` and `synchronize`');
    expect(GUIDE).toContain('`Squad-Review-Head: <SHA>`');
    expect(GUIDE).toContain('`COMMENT`');
    expect(GUIDE).toContain('`REQUEST_CHANGES`');
    expect(GUIDE).toContain('no file-editing, issue-creation,');
    expect(GUIDE).toContain('Human approval remains mandatory.');
    expect(GUIDE).toContain('Squad Review / review');
    expect(GUIDE).toContain('Squad-Review-Override:');
    expect(GUIDE.replace(/\s+/g, ' ')).toContain('only after advisory soak');
    expect(GUIDE).toContain('This follow-up is only needed when the safe-update warning appears.');
    expect(README).toContain('`gh aw add` compiles the workflows automatically.');
    expect(README).toContain('run `gh aw compile --approve`');
  });

  it('enforces attribution priority and refuses malformed or unattributed automatic provenance', () => {
    expect(REVIEWER).toContain('Build its exact regular expression by concatenating');
    expect(REVIEWER).toContain(
      '`^<`, then\n`!-- squad:implement issue=([1-9][0-9]*) run=([1-9][0-9]*) --`, then `>$`',
    );
    expect(REVIEWER).not.toContain('^<!-- squad:implement');
    expect(REVIEWER).toContain('require exactly one marker-like occurrence');
    expect(REVIEWER).toContain('^squad/implement-{captured-issue}-');
    assertReviewerContract(REVIEWER);
  });

  it('keeps reviewer authority read-only with bounded non-approval verdicts', () => {
    const safeOutputs = yamlBlock(REVIEWER_FRONTMATTER, 'safe-outputs');
    const outputNames = [...safeOutputs.matchAll(/^  ([\w-]+):\s*$/gm)].map(match => match[1]);

    expect(outputNames).toEqual([
      'steps',
      'add-comment',
      'create-pull-request-review-comment',
      'submit-pull-request-review',
    ]);
    expect(REVIEWER).toContain('Never use `APPROVE`');
    assertReviewerContract(REVIEWER);
  });

  it('requires fresh attempt-bound evidence, cancels stale runs, and retains fork protection', () => {
    const concurrency = yamlBlock(REVIEWER_FRONTMATTER, 'concurrency');

    expect(concurrency).toContain(
      'group: "squad-review-${{ github.event.pull_request.number }}"',
    );
    expect(concurrency).toContain('cancel-in-progress: true');
    expect(REVIEWER_FRONTMATTER).not.toMatch(/^\s+forks:/m);
    expect(REVIEWER).toContain('Every workflow run attempt must submit exactly one fresh review.');
    expect(REVIEWER).toMatch(/Never use\s+`noop` to reuse or deduplicate/);
    expect(REVIEWER).toContain('rejects any pre-existing verdict evidence');
    expect(REVIEWER).toMatch(/a GitHub\s+Actions rerun receives an incremented attempt/);
    expect(REVIEWER).toMatch(/Re-fetch the pull request\s+immediately\s+before emitting/);
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

  it('strict-compiles to read-only agent permissions and an always-running final gate', () => {
    const { lock, safeOutputs } = compileReviewer();
    assertCompiledGate(lock);
    expect(lock).toContain('Build its exact regular expression by concatenating');
    expect(lock).toContain(
      '`^<`, then\\n`!-- squad:implement issue=([1-9][0-9]*) run=([1-9][0-9]*) --`, then `>$`',
    );
    expect(lock).not.toContain('body line matching\\n`^$`');
    const agentJob = lock.match(/^  agent:\n([\s\S]*?)(?=^  [\w-]+:\n)/m)?.[1] ?? '';
    const permissionBlock = yamlBlock(agentJob, 'permissions');
    const workflow = parse(lock);
    const safeOutputPermissions = workflow.jobs.safe_outputs.permissions;

    expect(permissionBlock).toContain('contents: read');
    expect(permissionBlock).toContain('issues: read');
    expect(permissionBlock).toContain('pull-requests: read');
    expect(permissionBlock).toContain('copilot-requests: write');
    expect(permissionBlock).not.toMatch(/^\s+(contents|issues|pull-requests): write$/m);
    expect(safeOutputPermissions).toEqual({
      actions: 'read',
      contents: 'read',
      issues: 'write',
      'pull-requests': 'write',
    });
    expect(workflow.jobs.review.permissions).toMatchObject({
      actions: 'read',
      contents: 'read',
      issues: 'read',
      'pull-requests': 'read',
    });
    expect(safeOutputs.add_comment).toMatchObject({ max: 1 });
    expect(safeOutputs.create_pull_request_review_comment).toMatchObject({ max: 10 });
    expect(safeOutputs.submit_pull_request_review).toMatchObject({
      max: 1,
      allowed_events: ['COMMENT', 'REQUEST_CHANGES'],
      commit_id: '${{ github.event.pull_request.head.sha }}',
    });
    expect(safeOutputs).not.toHaveProperty('dispatch_workflow');
    expect(safeOutputs).not.toHaveProperty('create_issue');
    expect(safeOutputs).not.toHaveProperty('create_pull_request');
    expect(lock).toContain('GH_AW_HEAD_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(lock).toContain('pull_request_target:');
    expect(lock).not.toContain('Checkout PR branch');
  }, 30000);

  it('loads review authority only from the base and makes first install a manual boundary', async () => {
    const { lock } = compileReviewer();
    const stub = (source: string) => `
      import { writeFileSync } from 'node:fs';
      export async function enforceReviewOutputs(env) {
        writeFileSync(process.env.SQUAD_TEST_GUARD_OUTPUT,
          JSON.stringify({ source: ${JSON.stringify(source)}, operation: 'safe outputs',
            head: env.SQUAD_REVIEW_HEAD }));
      }
      export async function assertClearingReview(env) {
        writeFileSync(process.env.SQUAD_TEST_GUARD_OUTPUT,
          JSON.stringify({ source: ${JSON.stringify(source)}, operation: 'final verdict',
            head: env.SQUAD_REVIEW_HEAD }));
      }
    `;

    for (const { name, script } of compiledGuardScripts(lock)) {
      const head = name === 'safe outputs'
        ? 'edd6fbf0f84334ff086ed2bc8bbfed5503fdd56f'
        : '9a898b5182ca432b62bef26dbf1f9022dd1d256b';
      await expect(executeCompiledGuardLoader(script, {
        dispatchGuard: stub('dispatch-ref'),
        head,
      })).rejects.toThrow('First-install manual boundary');

      await expect(executeCompiledGuardLoader(script, {
        baseGuard: stub('base'),
        baseManifest: true,
        dispatchGuard: stub('dispatch-ref'),
        head,
      })).resolves.toBe(JSON.stringify({
        source: 'base',
        operation: name,
        head,
      }));

      await expect(executeCompiledGuardLoader(script, {
        baseManifest: true,
        head,
      })).rejects.toThrow('First-install manual boundary');

      await expect(executeCompiledGuardLoader(script, {
        baseGuard: 'this is not valid JavaScript',
        baseManifest: true,
        head,
      })).rejects.toThrow();
    }
  }, 30000);

  it('does not embed a PR-controlled guard, verdict, or trusted fallback in emitted loaders', () => {
    const { lock } = compileReviewer();
    for (const { script } of compiledGuardScripts(lock)) {
      expect(script).toContain('pathToFileURL(baseGuard)');
      expect(script).not.toContain('.squad-review-workflow');
      expect(script).not.toContain('workflowGuard');
      expect(script).not.toContain('Squad-Review-Verdict:');
      expect(script).not.toContain('@squad/bootstrap-installation');
    }
  }, 30000);

  it('rejects compiled PR-head checkout, local action, and PR-trigger authority mutations', () => {
    const mutations = [
      REVIEWER.replace(
        'ref: ${{ github.event.pull_request.base.sha }}',
        'ref: ${{ github.event.pull_request.head.sha }}',
      ),
      REVIEWER.replace(
        "uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0",
        'uses: ./.github/actions/pr-controlled',
      ),
      REVIEWER.replace('pull_request_target:', 'pull_request:'),
    ];
    for (const [index, mutation] of mutations.entries()) {
      expect(mutation, `compiled adversarial mutation ${index} must change the source`)
        .not.toBe(REVIEWER);
      const { lock } = compileReviewer(mutation);
      expect(() => assertCompiledGate(lock), `compiled adversarial mutation ${index}`)
        .toThrow();
    }
  }, 60000);

  it('kills mutations of every important authority and provenance gate', () => {
    const mutations = [
      REVIEWER.replace('tools:\n  github:', 'tools:\n  edit:\n  github:'),
      REVIEWER.replace(
        'safe-outputs:\n',
        'safe-outputs:\n  dispatch-workflow:\n    workflows: [squad-retro]\n    max: 1\n',
      ),
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
      REVIEWER.replace('Every same-repository PR (including', 'Some PRs (including'),
      REVIEWER.replace('inlined-imports: true', 'inlined-imports: false'),
      REVIEWER.replace(
        'on:\n  pull_request_target:',
        'on:\n  workflow_dispatch:\n  pull_request_target:',
      ),
      REVIEWER.replace(
        'ref: ${{ github.event.pull_request.base.sha }}',
        'ref: ${{ github.workflow_sha }}',
      ),
      REVIEWER.replace('checkout: false', 'checkout: true'),
      REVIEWER.replace('pull_request_target:', 'pull_request:'),
      REVIEWER.replaceAll('Squad-Review-Head: {40-character lowercase head SHA}', 'Reviewed head SHA'),
    ];

    for (const [index, mutation] of mutations.entries()) {
      expect(() => assertReviewerContract(mutation), `source mutation ${index}`).toThrow();
    }
  });

  it('kills real source mutations after compilation, not just prompt-text mutations', () => {
    assertCompiledGate(compileReviewer().lock);
    const mutations = [
      REVIEWER.replace('await guard.enforceReviewOutputs', 'void guard.enforceReviewOutputs'),
      REVIEWER.replace('await guard.assertClearingReview', 'void guard.assertClearingReview'),
      REVIEWER.replace('    name: review', '    name: Other check'),
      REVIEWER.replace('pathToFileURL(baseGuard)', "pathToFileURL('.squad-review-workflow/guard.mjs')"),
      REVIEWER.replace('No trusted Squad verdict was emitted.', 'Squad-Review-Verdict: trusted'),
      REVIEWER.replace('    if: always()\n', '    if: success()\n'),
      REVIEWER.replace('    needs: [agent, safe_outputs]', '    needs: [agent]'),
      REVIEWER.replace(
        "uses: actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3 # v9.0.0",
        "uses: ./.github/actions/pr-controlled",
      ),
    ];
    for (const mutation of mutations) {
      expect(mutation).not.toBe(REVIEWER);
      const { lock } = compileReviewer(mutation);
      expect(() => assertCompiledGate(lock)).toThrow();
    }
  }, 60000);
});
