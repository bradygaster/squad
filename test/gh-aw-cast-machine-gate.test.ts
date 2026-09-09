import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

const ROOT = resolve(import.meta.dirname, '..');
const WORKFLOWS_DIR = resolve(ROOT, 'workflows');
const TEST_WORKSPACES_DIR = resolve(ROOT, '.squad-gh-aw-machine-gate');
const GH_AW_INSTALL_HINT =
  '`gh aw` is required to compile the workflow locks this gate inspects. Install it with ' +
  '`gh extension install --pin v0.87.10 github/gh-aw` (matches .github/workflows/squad-ci.yml).';

afterAll(() => {
  rmSync(TEST_WORKSPACES_DIR, { recursive: true, force: true });
});

function temporaryWorkspace(prefix: string): string {
  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  return mkdtempSync(join(TEST_WORKSPACES_DIR, prefix));
}

interface PostStep {
  name?: string;
  if?: string;
  shell?: string;
  run?: string;
  env?: Record<string, string>;
}

function frontmatter(relativePath: string): Record<string, unknown> {
  const source = readFileSync(resolve(ROOT, relativePath), 'utf8');
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match, `${relativePath} must start with YAML frontmatter`).toBeTruthy();
  return parse(match![1]) as Record<string, unknown>;
}

function postStep(relativePath: string, namePrefix: string): PostStep {
  const steps = frontmatter(relativePath)['post-steps'] as PostStep[] | undefined;
  expect(Array.isArray(steps), `${relativePath} must declare post-steps`).toBe(true);
  const step = steps!.find((candidate) => (candidate.name ?? '').startsWith(namePrefix));
  expect(step, `${relativePath} must declare a "${namePrefix}" post-step`).toBeTruthy();
  return step!;
}

interface GateRun {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute the gate's `run:` body exactly as authored, with the step `env:`
 * block applied and then overridden by the sandbox values. This is real
 * execution of the shipped script — not an assertion about prose — but it
 * proves only the script's own logic. Whether GitHub Actions schedules the
 * step where the compiler places it is proven separately by lock ordering
 * assertions, and end-to-end behavior still needs a live pilot run.
 */
function runGate(step: PostStep, overrides: Record<string, string>): GateRun {
  const scriptPath = join(temporaryWorkspace('script-'), 'gate.sh');
  writeFileSync(scriptPath, step.run ?? '');
  const env = { ...process.env, ...(step.env ?? {}), ...overrides };
  try {
    const stdout = execFileSync('bash', [scriptPath], { env, encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    };
  }
}

interface CastSandbox {
  overrides: Record<string, string>;
  agentOutput: string;
  safeOutputs: string;
  patchDir: string;
  patchFile: string;
}

function castSandbox(items: unknown[], validatorBody: string | null): CastSandbox {
  const base = temporaryWorkspace('cast-');
  const workspace = join(base, 'workspace');
  const patchDir = join(base, 'gh-aw');
  const runnerTemp = join(base, 'runner-temp');
  mkdirSync(join(workspace, '.github/workflows'), { recursive: true });
  mkdirSync(patchDir, { recursive: true });
  mkdirSync(runnerTemp, { recursive: true });

  const agentOutput = join(patchDir, 'agent_output.json');
  const safeOutputs = join(patchDir, 'safeoutputs.jsonl');
  writeFileSync(agentOutput, JSON.stringify({ items }));
  writeFileSync(safeOutputs, items.map((item) => JSON.stringify(item)).join('\n') + '\n');

  const patchFile = join(patchDir, 'aw-cast.patch');
  writeFileSync(patchFile, 'diff --git a/.squad/team.md b/.squad/team.md\n');

  if (validatorBody !== null) {
    const runner = join(workspace, '.github/workflows/run-squad-cast-validator');
    writeFileSync(runner, validatorBody);
    chmodSync(runner, 0o755);
  }

  return {
    overrides: {
      GITHUB_WORKSPACE: workspace,
      RUNNER_TEMP: runnerTemp,
      GITHUB_STEP_SUMMARY: join(base, 'summary.md'),
      GH_AW_CAST_AGENT_OUTPUT: agentOutput,
      GH_AW_CAST_SAFE_OUTPUTS: safeOutputs,
      GH_AW_CAST_PATCH_DIR: patchDir,
    },
    agentOutput,
    safeOutputs,
    patchDir,
    patchFile,
  };
}

function itemTypes(path: string): string[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { items?: { type?: string }[] };
  return (parsed.items ?? []).map((item) => item.type ?? '');
}

function jsonlItemTypes(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => (JSON.parse(line) as { type?: string }).type ?? '');
}

const CREATE_PR_ITEM = {
  type: 'create_pull_request',
  title: '[Squad] Cast: roster',
  body: 'Squad-Cast-Marker: squad-gh-aw/v1',
};

const PASSING_VALIDATOR = "#!/usr/bin/env bash\nprintf 'Cast validation passed.\\n'\n";

describe('Cast validation is enforced by the runner, not by the prompt', () => {
  const gate = postStep('workflows/squad-cast.md', 'Machine-enforced Cast validation gate');

  it('is a post-step that always runs, so it cannot be skipped by a failed agent', () => {
    expect(gate.if).toBe('always()');
    expect(gate.shell).toBe('bash');
  });

  it('authorizes pull-request outputs only on the exact validator authorization string', () => {
    const sandbox = castSandbox([CREATE_PR_ITEM], PASSING_VALIDATOR);
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(0);
    expect(itemTypes(sandbox.agentOutput)).toEqual(['create_pull_request']);
    expect(existsSync(sandbox.patchFile)).toBe(true);
  });

  it('strips pull-request outputs and the patch when the validator is missing', () => {
    const sandbox = castSandbox([CREATE_PR_ITEM], null);
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(1);
    expect(itemTypes(sandbox.agentOutput)).toEqual([]);
    expect(readFileSync(sandbox.safeOutputs, 'utf8')).toBe('');
    expect(existsSync(sandbox.patchFile)).toBe(false);
  });

  it('rejects a near-miss authorization string that is not byte-exact', () => {
    const sandbox = castSandbox(
      [CREATE_PR_ITEM],
      "#!/usr/bin/env bash\nprintf 'Cast validation passed\\n'\n",
    );
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(1);
    expect(itemTypes(sandbox.agentOutput)).toEqual([]);
  });

  it('rejects a validator that prints the authorization string but exits non-zero', () => {
    const sandbox = castSandbox(
      [CREATE_PR_ITEM],
      "#!/usr/bin/env bash\nprintf 'Cast validation passed.\\n'\nexit 3\n",
    );
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(1);
    expect(itemTypes(sandbox.agentOutput)).toEqual([]);
  });

  it('gates update_pull_request as well, so an unvalidated tree cannot refresh a Cast PR', () => {
    const sandbox = castSandbox(
      [{ type: 'update_pull_request', body: 'Squad-Cast-Marker: squad-gh-aw/v1' }],
      null,
    );
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(1);
    expect(itemTypes(sandbox.agentOutput)).toEqual([]);
  });

  it('leaves a guarded noop run untouched and green', () => {
    const sandbox = castSandbox([{ type: 'noop', reason: 'not a bootstrap merge' }], null);
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(0);
    expect(itemTypes(sandbox.agentOutput)).toEqual(['noop']);
  });

  it('fails closed when the agent output cannot be parsed at all', () => {
    const sandbox = castSandbox([CREATE_PR_ITEM], null);
    writeFileSync(sandbox.agentOutput, 'not json');
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(1);
    expect(itemTypes(sandbox.agentOutput)).toEqual([]);
  });

  it('provisions the validator resource and runner the standalone workflow needs', () => {
    const front = frontmatter('workflows/squad-cast.md');
    expect(front.resources).toContain('shared/squad-cast-validator.mjs');
    expect(front.env).toEqual({
      SQUAD_CAST_TRUSTED_SHA: '${{ github.event.pull_request.merge_commit_sha }}',
    });
    for (const id of ['scribe', 'ralph', 'rai', 'fact-checker']) {
      expect(front.resources).toContain(`shared/builtins/${id}-charter.md`);
    }
    const preSteps = (front['pre-agent-steps'] ?? []) as { name?: string }[];
    const names = preSteps.map((step) => step.name ?? '');
    expect(names).toContain('Materialize canonical built-in support agents');
    expect(names).toContain('Prepare deterministic Cast validator runner');
  });
});

interface OnboardingSandbox {
  overrides: Record<string, string>;
  agentOutput: string;
  safeOutputs: string;
}

function onboardingSandbox(items: unknown[], ghIssuesJson: string | null): OnboardingSandbox {
  const base = temporaryWorkspace('onboarding-');
  const binDir = join(base, 'bin');
  const runnerTemp = join(base, 'runner-temp');
  mkdirSync(binDir, { recursive: true });
  mkdirSync(runnerTemp, { recursive: true });

  const agentOutput = join(base, 'agent_output.json');
  const safeOutputs = join(base, 'safeoutputs.jsonl');
  writeFileSync(agentOutput, JSON.stringify({ items }));
  writeFileSync(safeOutputs, items.map((item) => JSON.stringify(item)).join('\n') + '\n');

  // Stub `gh` so the gate's all-state issue enumeration is deterministic.
  const ghStub = join(binDir, 'gh');
  writeFileSync(
    ghStub,
    ghIssuesJson === null
      ? '#!/usr/bin/env bash\necho "simulated API failure" >&2\nexit 1\n'
      : `#!/usr/bin/env bash\ncat <<'STUB_JSON'\n${ghIssuesJson}\nSTUB_JSON\n`,
  );
  chmodSync(ghStub, 0o755);

  return {
    overrides: {
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      RUNNER_TEMP: runnerTemp,
      GITHUB_REPOSITORY: 'octodemo/example',
      GITHUB_STEP_SUMMARY: join(base, 'summary.md'),
      GH_AW_ONBOARDING_AGENT_OUTPUT: agentOutput,
      GH_AW_ONBOARDING_SAFE_OUTPUTS: safeOutputs,
    },
    agentOutput,
    safeOutputs,
  };
}

const ONBOARDING_TITLE = '[Squad] Your repository team is ready';
const ONBOARDING_MARKER = 'Squad-Onboarding-Marker: squad-gh-aw/v1';
const CREATE_ISSUE_ITEM = { type: 'create_issue', title: ONBOARDING_TITLE, body: ONBOARDING_MARKER };
const UPDATE_ISSUE_ITEM = { type: 'update_issue', issue_number: 7, body: ONBOARDING_MARKER };

describe('onboarding dedup covers every issue state', () => {
  const gate = postStep('workflows/squad-onboarding.md', 'Machine-enforced onboarding dedup gate');

  function expectNoCreationOutputs(sandbox: OnboardingSandbox, remaining: string[] = []): void {
    expect(itemTypes(sandbox.agentOutput)).toEqual(remaining);
    expect(jsonlItemTypes(sandbox.safeOutputs)).toEqual(remaining);
  }

  it('is a post-step that always runs', () => {
    expect(gate.if).toBe('always()');
    expect(gate.shell).toBe('bash');
  });

  it('enumerates all issue states rather than open issues only', () => {
    expect(gate.run).toContain('state=all');
    expect(gate.run).toContain('--paginate');
    expect(gate.run).not.toContain('state=open');
  });

  it('blocks a replacement issue when the marked onboarding issue is CLOSED', () => {
    const sandbox = onboardingSandbox(
      [CREATE_ISSUE_ITEM, UPDATE_ISSUE_ITEM],
      JSON.stringify([{ number: 7, state: 'closed', title: ONBOARDING_TITLE, body: ONBOARDING_MARKER }]),
    );
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(0);
    expectNoCreationOutputs(sandbox, ['update_issue']);
  });

  it('recognizes the canonical issue by body marker even when the title drifted', () => {
    const sandbox = onboardingSandbox(
      [CREATE_ISSUE_ITEM],
      JSON.stringify([{ number: 11, state: 'open', title: '[Squad] Team (renamed)', body: `x\n${ONBOARDING_MARKER}\ny` }]),
    );
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(0);
    expect(itemTypes(sandbox.agentOutput)).toEqual([]);
  });

  it('ignores pull requests that share the onboarding title', () => {
    const sandbox = onboardingSandbox(
      [CREATE_ISSUE_ITEM],
      JSON.stringify([
        { number: 4, state: 'open', title: ONBOARDING_TITLE, body: '', pull_request: { url: 'x' } },
      ]),
    );
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(0);
    expect(itemTypes(sandbox.agentOutput)).toEqual(['create_issue']);
  });

  it('reuses the lowest-numbered marked issue across paginated pages', () => {
    const sandbox = onboardingSandbox(
      [CREATE_ISSUE_ITEM],
      `${JSON.stringify([{ number: 42, state: 'closed', title: ONBOARDING_TITLE, body: ONBOARDING_MARKER }])}\n`
      + `${JSON.stringify([{ number: 9, state: 'closed', title: ONBOARDING_TITLE, body: ONBOARDING_MARKER }])}`,
    );
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(0);
    const summary = readFileSync(sandbox.overrides.GITHUB_STEP_SUMMARY, 'utf8');
    expect(summary).toContain('#9');
    expect(itemTypes(sandbox.agentOutput)).toEqual([]);
  });

  it('allows creation only when no marked issue exists in any state', () => {
    const sandbox = onboardingSandbox([CREATE_ISSUE_ITEM], JSON.stringify([]));
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(0);
    expect(itemTypes(sandbox.agentOutput)).toEqual(['create_issue']);
  });

  it('fails closed and drops creation when the issue lookup itself fails', () => {
    const sandbox = onboardingSandbox([CREATE_ISSUE_ITEM, UPDATE_ISSUE_ITEM], null);
    const result = runGate(gate, sandbox.overrides);
    expect(result.status).toBe(1);
    expectNoCreationOutputs(sandbox, ['update_issue']);
  });

  it.each([
    ['malformed', 'not-json'],
    ['empty', ''],
  ])(
    'fails closed and drops creation from both artifacts when the issue-list response is %s',
    (_label, response) => {
      const sandbox = onboardingSandbox([CREATE_ISSUE_ITEM, UPDATE_ISSUE_ITEM], response);
      const result = runGate(gate, sandbox.overrides);
      expect(result.status).toBe(1);
      expectNoCreationOutputs(sandbox, ['update_issue']);
    },
  );

  it('does not use the unsupported update-issue state field', () => {
    const source = readFileSync(resolve(ROOT, 'workflows/squad-onboarding.md'), 'utf8');
    const safeOutputs = frontmatter('workflows/squad-onboarding.md')['safe-outputs'] as {
      'update-issue'?: Record<string, unknown>;
    };
    expect(safeOutputs['update-issue']).toBeTruthy();
    expect(Object.keys(safeOutputs['update-issue']!)).not.toContain('state');
    expect(source).toContain('does not support');
    expect(source).toContain('safe-outputs.update-issue.state');
  });
});

interface CompiledStep {
  name?: string;
  if?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface CompiledJob {
  if?: string;
  steps?: CompiledStep[];
}

interface CompiledLock {
  jobs?: Record<string, CompiledJob>;
}

let compiledLocks: Record<string, CompiledLock> | null = null;

function compileMachineGateLocks(): Record<string, CompiledLock> {
  if (compiledLocks !== null) return compiledLocks;

  const versionProbe = spawnSync('gh', ['aw', '--version'], { encoding: 'utf8' });
  expect(versionProbe.error, GH_AW_INSTALL_HINT).toBeUndefined();
  expect(versionProbe.status, `gh aw --version failed. ${GH_AW_INSTALL_HINT}`).toBe(0);

  mkdirSync(TEST_WORKSPACES_DIR, { recursive: true });
  const workspace = mkdtempSync(join(TEST_WORKSPACES_DIR, 'locks-'));
  const workflowDir = join(workspace, '.github', 'workflows');
  mkdirSync(join(workspace, '.github'), { recursive: true });
  cpSync(WORKFLOWS_DIR, workflowDir, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: workspace });
  execFileSync(
    'gh',
    [
      'aw',
      'compile',
      '.github/workflows/squad-cast.md',
      '.github/workflows/squad-onboarding.md',
      '--strict',
      '--approve',
      '--no-check-update',
    ],
    { cwd: workspace, encoding: 'utf8', stdio: 'pipe', timeout: 120000 },
  );

  compiledLocks = Object.fromEntries(
    ['squad-cast', 'squad-onboarding'].map((workflowId) => {
      const lockPath = join(workflowDir, `${workflowId}.lock.yml`);
      expect(
        existsSync(lockPath),
        `gh aw compile produced no ${workflowId}.lock.yml. ${GH_AW_INSTALL_HINT}`,
      ).toBe(true);
      return [workflowId, parse(readFileSync(lockPath, 'utf8')) as CompiledLock];
    }),
  );
  return compiledLocks;
}

function stepIndex(steps: CompiledStep[], name: string): number {
  const index = steps.findIndex((step) => step.name === name);
  expect(index, `compiled agent job must contain "${name}"`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('compiled machine-gate scheduling', () => {
  it('gives Cast agent and safe-output materialization checkouts full history', () => {
    const lock = compileMachineGateLocks()['squad-cast'];
    const repositoryCheckouts = Object.entries(lock.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? [])
        .filter(
          (step) =>
            step.name === 'Checkout repository'
            && step.uses?.startsWith('actions/checkout@'),
        )
        .map((step) => ({ jobName, step })),
    );

    expect(repositoryCheckouts.map(({ jobName }) => jobName)).toEqual(
      expect.arrayContaining(['agent', 'safe_outputs']),
    );
    for (const { jobName, step } of repositoryCheckouts) {
      expect(step.with?.['fetch-depth'], `${jobName} checkout fetch-depth`).toBe(0);
    }
  });

  it.each([
    ['squad-cast', 'Machine-enforced Cast validation gate'],
    ['squad-onboarding', 'Machine-enforced onboarding dedup gate'],
  ])('%s gates finalized output before every artifact upload', (workflowId, gateName) => {
    const lock = compileMachineGateLocks()[workflowId];
    const agentJob = lock?.jobs?.agent;
    expect(agentJob, `${workflowId} lock must contain the agent job`).toBeTruthy();
    const steps = agentJob?.steps ?? [];

    const executionIndex = stepIndex(steps, 'Execute GitHub Copilot CLI');
    const finalizationNames = [
      'Copy Safe Outputs',
      'Ingest agent output',
      'Write agent output placeholder if missing',
    ];
    const finalizationIndexes = finalizationNames.map((name) => stepIndex(steps, name));
    const gateIndex = stepIndex(steps, gateName);
    const fallbackUploadIndex = stepIndex(steps, 'Upload agent output fallback artifact');
    const artifactUploadIndex = stepIndex(steps, 'Upload agent artifacts');

    expect(executionIndex).toBeLessThan(Math.min(...finalizationIndexes));
    expect(gateIndex).toBeGreaterThan(Math.max(...finalizationIndexes));
    expect(gateIndex).toBeLessThan(fallbackUploadIndex);
    expect(gateIndex).toBeLessThan(artifactUploadIndex);

    for (const name of [...finalizationNames, gateName, 'Upload agent output fallback artifact', 'Upload agent artifacts']) {
      expect(steps[stepIndex(steps, name)]?.if, `${workflowId}: ${name}`).toBe('always()');
    }

    expect(lock?.jobs?.detection?.if).toBe("always() && needs.agent.result != 'skipped'");
    expect(lock?.jobs?.safe_outputs?.if).toBe(
      "(!cancelled()) && needs.agent.result != 'skipped' && needs.detection.result == 'success'",
    );
  });
});

describe('eight-workflow install verification is executable everywhere it is claimed', () => {
  const EXPECTED = [
    'squad',
    'squad-implement-worker',
    'squad-review',
    'squad-deps-worker',
    'squad-retro',
    'squad-improvement-worker',
    'squad-cast',
    'squad-onboarding',
  ];

  const SURFACES: Record<string, string> = {
    'agent guide': '.github/agents.md',
    'gh-aw guide': 'docs/src/content/docs/guide/gh-aw.md',
    'enlistment skill': '.squad/skills/gh-aw-enlistment/SKILL.md',
    'CLI skill template': 'packages/squad-cli/templates/skills/gh-aw-enlistment/SKILL.md',
    'SDK skill template': 'packages/squad-sdk/templates/skills/gh-aw-enlistment/SKILL.md',
  };

  for (const [label, relativePath] of Object.entries(SURFACES)) {
    it(`${label} ships an executable loop that names all eight workflows`, () => {
      const source = readFileSync(resolve(ROOT, relativePath), 'utf8');
      const loops = [...source.matchAll(/for workflow in ([^;]+); do/g)];
      expect(loops.length, `${relativePath} must contain a verification loop`).toBeGreaterThan(0);
      for (const loop of loops) {
        const names = loop[1].replace(/\\/g, ' ').trim().split(/\s+/);
        expect(names, `${relativePath} verification loop`).toEqual(EXPECTED);
      }
      for (const workflow of ['squad-cast', 'squad-onboarding']) {
        expect(source, `${relativePath} install command`).toContain(
          `bradygaster/squad/workflows/${workflow}.md@dev`,
        );
      }
    });
  }

  it('CI compiles and lock-verifies all eight workflows', () => {
    const ci = readFileSync(resolve(ROOT, '.github/workflows/squad-ci.yml'), 'utf8');
    const compileLoop = ci.match(/for WF in ([^\n;]+); do/);
    expect(compileLoop, 'squad-ci.yml must compile the workflow set').toBeTruthy();
    expect(compileLoop![1].trim().split(/\s+/)).toEqual(EXPECTED);

    const lockLoop = ci.match(/for LOCK in ([^\n;]+); do/);
    expect(lockLoop, 'squad-ci.yml must verify emitted lock files').toBeTruthy();
    expect(lockLoop![1].trim().split(/\s+/)).toEqual(EXPECTED.map((name) => `${name}.lock.yml`));
    expect(ci).not.toContain('all six workflows');
  });

  it('no shipped surface still claims a six-workflow install', () => {
    for (const relativePath of [...Object.values(SURFACES), 'README.md']) {
      const source = readFileSync(resolve(ROOT, relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(/\b(?:six|twelve)\b[^.\n]*workflow/i);
      expect(source, relativePath).not.toMatch(/all six source/i);
    }
  });
});
