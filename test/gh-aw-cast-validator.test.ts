import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileFunction, constants as vmConstants } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { requirePosixShell } from './posix-shell';

const validator = join(process.cwd(), 'scripts', 'validate-gh-aw-cast.mjs');
const resourcePath = join(process.cwd(), 'workflows', 'shared', 'squad-cast-validator.mjs');
const installedResourceRelativePath = '.github/workflows/shared/squad-cast-validator.mjs';
const workflowPath = join(process.cwd(), 'workflows', 'squad.md');
const workspaces: string[] = [];

const active = [
  { id: 'lead', name: 'Lead', role: 'Technical Lead' },
  { id: 'builder', name: 'Builder', role: 'Application Engineer' },
  { id: 'tester', name: 'Tester', role: 'Quality Engineer' },
];

const builtins = [
  { id: 'scribe', name: 'Scribe' },
  { id: 'ralph', name: 'Ralph' },
  { id: 'rai', name: 'Rai' },
  { id: 'fact-checker', name: 'Fact Checker' },
];

const corePayload = [
  '.squad/team.md',
  '.squad/routing.md',
  '.squad/casting/registry.json',
  '.squad/casting/history.json',
  '.squad/casting/policy.json',
  ...active.map(({ id }) => `.squad/agents/${id}/charter.md`),
  ...builtins.map(({ id }) => `.squad/agents/${id}/charter.md`),
  '.github/agents/squad.agent.md',
  'meet-the-squad.md',
];

function write(root: string, path: string, content: string): void {
  const fullPath = join(root, ...path.split('/'));
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, 'utf8');
}

function teamMarkdown(): string {
  return `# Project Squad

## Coordinator

| Name | Role | Status |
| --- | --- | --- |
| Squad | Coordinator | Active |

## Members

| Name | Role | Charter | Status |
| --- | --- | --- | --- |
${active.map(({ id, name, role }) => `| ${name} | ${role} | \`.squad/agents/${id}/charter.md\` | Active |`).join('\n')}

## Built-in Support Agents

Mandatory support agents. Not Cast specialists and not routing destinations.

| Name | Role | Charter |
| --- | --- | --- |
${builtins.map(({ id, name }) => `| ${name} | Built-in | \`.squad/agents/${id}/charter.md\` |`).join('\n')}

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Status |
| --- | --- | --- |
| @copilot | Coding Agent | Available |
`;
}

function routingMarkdown(): string {
  return `# Routing

## Routing Table

| Work Type | Route To | Examples |
| --- | --- | --- |
| Architecture | Lead | Design and technical direction |
| Implementation | Builder | Product code and integration |
| Quality | Tester | Tests and release confidence |
`;
}

function coordinatorMarkdown(): string {
  return `---
name: Squad
description: "Route repository work to the active GH-AW Cast."
tools: ["*"]
---

# Squad Coordinator

Use \`.squad/team.md\` and \`.squad/routing.md\` as the human-readable roster and routing contract.
Confirm identities in \`.squad/casting/registry.json\`; use \`.squad/casting/history.json\` and
\`.squad/casting/policy.json\` only for Cast metadata. Introduce the team from \`meet-the-squad.md\`.

## Cast sources

- \`.squad/team.md\`
- \`.squad/routing.md\`
- \`.squad/casting/registry.json\`
- \`.squad/casting/history.json\`
- \`.squad/casting/policy.json\`
- \`meet-the-squad.md\`
${active.map(({ id, name }) => `- ${name}: \`.squad/agents/${id}/charter.md\``).join('\n')}
${builtins.map(({ id, name }) => `- ${name}: \`.squad/agents/${id}/charter.md\``).join('\n')}

## Routing work

Read the routing table, select only active registry members, load only the selected member's
charter, delegate through the platform's available agent mechanism, and synthesize the result.

## Built-in Support Agents

Scribe, Ralph, Rai, and Fact Checker are mandatory always-on support agents, separate from
selected Cast specialists. They are never selectable domain specialists and never routing-table
destinations.

<!-- SQUAD:TEAM-CAPABILITIES:BEGIN -->
## Team Capabilities (generated)

<!-- squad:capabilities schema=1 specialists=3 taskTypes=3 hints=3 -->
Generated from the final Cast roster, routing table, registry, and active charters.

### Available specialists

| Agent | Role | Authority | Focus |
| --- | --- | --- | --- |
${active.map(({ name, role }) => `| ${name} | ${role} | Assigned domain | ${role} |`).join('\n')}

### Supported task types

Architecture, Implementation, Quality

### Routing hints

| Domain | Route to |
| --- | --- |
| Architecture | Lead |
| Implementation | Builder |
| Quality | Tester |
<!-- SQUAD:TEAM-CAPABILITIES:END -->
`;
}

function createFixture(): { root: string; payload: string; runnerTemp: string } {
  const root = mkdtempSync(join(tmpdir(), 'gh-aw-cast-validator-'));
  workspaces.push(root);
  const runnerTemp = mkdtempSync(join(tmpdir(), 'gh-aw-cast-runner-temp-'));
  workspaces.push(runnerTemp);
  write(root, '.squad/team.md', teamMarkdown());
  write(root, '.squad/routing.md', routingMarkdown());
  write(root, '.squad/casting/registry.json', JSON.stringify({
    agents: Object.fromEntries(active.map(({ id, name }) => [
      id,
      { persistent_name: name, status: 'active', universe: 'descriptive' },
    ])),
  }));
  write(root, '.squad/casting/history.json', '{}\n');
  write(root, '.squad/casting/policy.json', '{}\n');
  for (const member of active) {
    write(root, `.squad/agents/${member.id}/charter.md`, `# ${member.name} — ${member.role}\n`);
  }
  for (const builtin of builtins) {
    write(root, `.squad/agents/${builtin.id}/charter.md`, `# ${builtin.name}\n`);
  }
  write(root, '.github/agents/squad.agent.md', coordinatorMarkdown());
  write(root, 'meet-the-squad.md', '# Meet the Squad\n');
  const payload = join(root, '.github', 'workflows', 'squad-cast-payload.json');
  mkdirSync(dirname(payload), { recursive: true });
  writeFileSync(payload, JSON.stringify(corePayload), 'utf8');
  return { root, payload, runnerTemp };
}

function validate(root: string, payload: string) {
  return spawnSync(process.execPath, [validator, '--root', root, '--payload', payload], {
    encoding: 'utf8',
  });
}

function resourceSource(): string {
  return readFileSync(resourcePath, 'utf8');
}

function validatorCommand(): string {
  const workflow = readFileSync(workflowPath, 'utf8');
  const command = workflow.match(
    /<!-- SQUAD:CAST-VALIDATOR-COMMAND:BEGIN -->\r?\n```bash\r?\n([\s\S]*?)\r?\n```\r?\n<!-- SQUAD:CAST-VALIDATOR-COMMAND:END -->/,
  )?.[1];
  if (!command) {
    throw new Error('Cast validator command markers or fenced command are missing');
  }
  return command;
}

function validatorRunnerSource(): string {
  const workflow = readFileSync(workflowPath, 'utf8');
  const runner = workflow.match(
    /cat > "\$validator_runner" <<'SQUAD_CAST_VALIDATOR_RUNNER'\r?\n([\s\S]*?)\r?\n      SQUAD_CAST_VALIDATOR_RUNNER/,
  )?.[1];
  if (!runner) {
    throw new Error('Prepared Cast validator runner is missing');
  }
  return runner
    .split(/\r?\n/)
    .map(line => line.startsWith('      ') ? line.slice(6) : line)
    .join('\n');
}

function castFailureScript(): string {
  const lines = readFileSync(workflowPath, 'utf8').split(/\r?\n/);
  const step = lines.findIndex(line => line.includes('- name: Fail Cast terminal outcome'));
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

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Install the validator resource at its fixed installed location under the fixture workspace. */
function installResource(
  root: string,
  content = resourceSource(),
  path = installedResourceRelativePath,
): void {
  write(root, path, content);
}

function materializeRunner(
  fixture: ReturnType<typeof createFixture>,
  source = validatorRunnerSource(),
): string {
  const runner = join(fixture.root, '.github', 'workflows', 'run-squad-cast-validator');
  writeFileSync(runner, source, 'utf8');
  chmodSync(runner, 0o500);
  return runner;
}

function runValidatorCommand(
  fixture: ReturnType<typeof createFixture>,
  cwd = fixture.root,
  runnerSource = validatorRunnerSource(),
) {
  const shell = process.platform === 'win32' ? requirePosixShell() : 'bash';
  return spawnSync(shell, [materializeRunner(fixture, runnerSource)], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_WORKSPACE: fixture.root,
      RUNNER_TEMP: fixture.runnerTemp,
    },
  });
}

function authorizesPullRequest(result: ReturnType<typeof runValidatorCommand>): boolean {
  return result.status === 0 && result.stdout === 'Cast validation passed.\n';
}

function failureRecord(result: ReturnType<typeof runValidatorCommand>): {
  outcome: string;
  stage: string;
  command_category: string;
  exit_status: string;
  stderr: string;
} {
  expect(result.status).not.toBe(0);
  return JSON.parse(result.stdout) as ReturnType<typeof failureRecord>;
}

async function runCastFailureJobOutput(outputContent: string): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'gh-aw-cast-failure-job-'));
  workspaces.push(root);
  const output = join(root, 'agent-output.json');
  writeFileSync(output, outputContent);
  const failures: string[] = [];
  const previousOutput = process.env.GH_AW_AGENT_OUTPUT;
  process.env.GH_AW_AGENT_OUTPUT = output;

  try {
    const compiled = compileFunction(
      `return (async () => {\n${castFailureScript()}\n})();`,
      ['core'],
      { importModuleDynamically: vmConstants.USE_MAIN_CONTEXT_DEFAULT_LOADER },
    ) as (core: { setFailed: (message: string) => void }) => Promise<unknown>;
    await compiled({ setFailed: message => failures.push(message) });
  } finally {
    if (previousOutput === undefined) delete process.env.GH_AW_AGENT_OUTPUT;
    else process.env.GH_AW_AGENT_OUTPUT = previousOutput;
  }
  return failures;
}

async function runCastFailureJob(item: Record<string, unknown>): Promise<string[]> {
  return runCastFailureJobOutput(JSON.stringify({ items: [{ type: 'cast_failure', ...item }] }));
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('GH-AW Cast final-tree validator', () => {
  it('ships the reviewed validator byte-for-byte as the installed plaintext resource', () => {
    const canonical = readFileSync(validator);
    const installed = readFileSync(resourcePath);
    expect(installed).toEqual(canonical);

    const commandDigest = validatorRunnerSource().match(
      /validator_expected_sha256="([a-f0-9]{64})"/,
    )?.[1];
    expect(commandDigest, 'runtime command must pin the canonical validator digest').toBeDefined();
    expect(commandDigest).toBe(sha256(canonical));
  });

  it('declares the validator as a top-level gh-aw resource, not an imported skill', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const resourcesBlock = workflow.match(/^resources:\n((?:  - .+\n)+)/m)?.[1] ?? '';
    expect(resourcesBlock).toContain('shared/squad-cast-validator.mjs');
    const importsBlock = workflow.match(/^imports:\n((?:  - .+\n)+)/m)?.[1] ?? '';
    expect(importsBlock).not.toContain('squad-cast-validator');
  });

  it('keeps validator bytes out of the agent command', () => {
    const command = validatorCommand();
    const runner = validatorRunnerSource();
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(command.trim()).toBe(
      '"${GITHUB_WORKSPACE:?}/.github/workflows/run-squad-cast-validator"',
    );
    expect(command).not.toMatch(/[A-Za-z0-9+/]{256}/);
    expect(command).not.toMatch(/cat\s+<<|base64|gzip|awk|validator_expected_sha256/);
    expect(command).not.toContain('H4sI');
    expect(workflow).not.toContain('invoke the `skill` tool on');
    expect(workflow).toMatch(/do not invoke or\s+load `squad-cast-validator` into model context/);
    expect(workflow).toContain('Do not transcribe validator bytes');
    expect(runner).not.toMatch(/base64|gzip|awk|SKILL\.md/);
    expect(runner).toContain(
      'validator_script="${GITHUB_WORKSPACE:?}/.github/workflows/shared/squad-cast-validator.mjs"',
    );
    expect(runner).not.toContain('RUNNER_TEMP');
    expect(runner.indexOf('validator_expected_sha256=')).toBeLessThan(
      runner.indexOf('node --check "$validator_script"'),
    );
    expect(runner.indexOf('node --check "$validator_script"')).toBeLessThan(
      runner.indexOf('node "$validator_script"'),
    );
  });

  it('finds the installed validator resource and runs it directly from GITHUB_WORKSPACE', () => {
    const fixture = createFixture();
    installResource(fixture.root);
    const invocationDirectory = join(fixture.root, 'nested', 'invocation-directory');
    mkdirSync(invocationDirectory, { recursive: true });
    const result = runValidatorCommand(fixture, invocationDirectory);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('Cast validation passed.\n');
    expect(authorizesPullRequest(result)).toBe(true);
    expect(fixture.payload.startsWith(fixture.root)).toBe(true);
    expect(fixture.payload.startsWith(fixture.runnerTemp)).toBe(false);
    // Never copied or extracted into $RUNNER_TEMP -- executed in place from $GITHUB_WORKSPACE.
    expect(existsSync(join(fixture.runnerTemp, 'validate-gh-aw-cast.mjs'))).toBe(false);
    expect(existsSync(join(fixture.runnerTemp, 'run-squad-cast-validator'))).toBe(false);
  });

  it('fails clearly when the installed validator resource is missing', () => {
    const fixture = createFixture();
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Cast validator resource is missing');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it.skipIf(
    process.platform === 'win32' ||
    typeof process.getuid !== 'function' ||
    process.getuid() === 0,
  )('fails clearly when the installed validator resource is unreadable', () => {
    const fixture = createFixture();
    installResource(fixture.root);
    const installedPath = join(fixture.root, installedResourceRelativePath);
    try {
      chmodSync(installedPath, 0o000);
      const result = runValidatorCommand(fixture);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Cast validator resource is not readable');
      expect(authorizesPullRequest(result)).toBe(false);
    } finally {
      chmodSync(installedPath, 0o600);
    }
  });

  it('fails integrity checks when the installed resource is modified', () => {
    const fixture = createFixture();
    installResource(fixture.root, "console.log('Cast validation passed.');\n");
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /Cast validator SHA-256 mismatch: expected 53f6e8ed254bc1fe3a49a5964297562803f6190a06b7547b31e26108b17ef09b, got [a-f0-9]{64}\./,
    );
    expect(result.stdout).not.toContain('Cast validation passed.');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('rejects authenticated validator bytes that fail node --check', () => {
    const fixture = createFixture();
    const invalidProgram = 'const = ;\n';
    installResource(fixture.root, invalidProgram);
    const authenticatedInvalidRunner = validatorRunnerSource().replace(
      /validator_expected_sha256="[a-f0-9]{64}"/,
      `validator_expected_sha256="${sha256(invalidProgram)}"`,
    );

    const result = runValidatorCommand(fixture, fixture.root, authenticatedInvalidRunner);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SyntaxError');
    expect(result.stderr).toContain('squad-cast-validator.mjs');
    expect(result.stdout).not.toContain('Cast validation passed.');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('preserves validator failures and cannot authorize an invalid Cast tree', () => {
    const fixture = createFixture();
    installResource(fixture.root);
    write(
      fixture.root,
      '.github/agents/squad.agent.md',
      `${coordinatorMarkdown()}\nRead \`packages/squad-cli/src/internal.ts\` before dispatching.\n`,
    );
    const result = runValidatorCommand(fixture);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/internal source/i);
    expect(result.stdout).not.toContain('Cast validation passed.');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('surfaces bounded failure stages with the captured exit status and complete stderr', async () => {
    const missing = createFixture();
    const missingResult = runValidatorCommand(missing);

    const integrity = createFixture();
    installResource(integrity.root, "console.log('Cast validation passed.');\n");
    const integrityResult = runValidatorCommand(integrity);

    const syntax = createFixture();
    const invalidProgram = 'const = ;\n';
    installResource(syntax.root, invalidProgram);
    const syntaxResult = runValidatorCommand(
      syntax,
      syntax.root,
      validatorRunnerSource().replace(
        /validator_expected_sha256="[a-f0-9]{64}"/,
        `validator_expected_sha256="${sha256(invalidProgram)}"`,
      ),
    );

    const validation = createFixture();
    installResource(validation.root);
    write(
      validation.root,
      '.github/agents/squad.agent.md',
      `${coordinatorMarkdown()}\nRead \`packages/squad-cli/src/internal.ts\` before dispatching.\n`,
    );
    const validationResult = runValidatorCommand(validation);

    for (const { stage, commandCategory, result } of [
      { stage: 'discovery', commandCategory: 'validator resource discovery', result: missingResult },
      { stage: 'integrity', commandCategory: 'SHA-256 authentication', result: integrityResult },
      { stage: 'syntax', commandCategory: 'node --check', result: syntaxResult },
      { stage: 'validation', commandCategory: 'validator execution', result: validationResult },
    ]) {
      expect(authorizesPullRequest(result)).toBe(false);
      expect(result.status).not.toBeNull();
      expect(result.stderr).not.toBe('');
      const record = failureRecord(result);
      expect(record).toEqual({
        outcome: 'cast_failure',
        stage,
        command_category: commandCategory,
        exit_status: String(result.status),
        stderr: result.stderr,
      });
      const failures = await runCastFailureJob({
        stage: record.stage,
        command_category: record.command_category,
        exit_status: record.exit_status,
        stderr: record.stderr,
      });
      expect(failures).toEqual([
        [
          'Cast did not complete.',
          `Stage: ${stage}`,
          `Command category: ${commandCategory}`,
          `Exit status: ${result.status}`,
          'Stderr:',
          result.stderr,
        ].join('\n'),
      ]);
    }
  });

  it('preserves empty stderr when a validator command is unavailable', async () => {
    const failures = await runCastFailureJob({
      stage: 'discovery',
      command_category: 'validator resource discovery',
      exit_status: 'unavailable',
      stderr: '',
    });
    expect(failures).toEqual([
      [
        'Cast did not complete.',
        'Stage: discovery',
        'Command category: validator resource discovery',
        'Exit status: unavailable',
        'Stderr:',
        '',
      ].join('\n'),
    ]);
  });

  it('fails malformed agent output with a deterministic diagnostic', async () => {
    const failures = await runCastFailureJobOutput('{not-json');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/^Unable to read Cast failure output: /);
  });

  it('fails non-object output items with a deterministic diagnostic', async () => {
    const failures = await runCastFailureJobOutput(JSON.stringify({
      items: [null, { type: 'cast_failure' }],
    }));
    expect(failures).toEqual(['Cast failure output item 0 is not an object.']);
  });

  it('diagnoses conflicting failure and pull-request outputs without claiming prevention', async () => {
    const failures = await runCastFailureJobOutput(JSON.stringify({
      items: [
        {
          type: 'cast_failure',
          stage: 'validation',
          command_category: 'validator execution',
          exit_status: '1',
          stderr: 'Cast validation failed.',
        },
        { type: 'create_pull_request' },
      ],
    }));
    expect(failures).toEqual([
      [
        'Conflicting Cast terminal outputs: found 1 create_pull_request item(s) with cast_failure.',
        'This post-agent diagnostic cannot prevent a concurrently materialized pull request.',
      ].join('\n'),
    ]);
  });

  it('accepts a self-contained descriptive Cast tree', () => {
    const fixture = createFixture();
    const result = validate(fixture.root, fixture.payload);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Cast validation passed');
  });

  it('rejects a built-in placed inside the specialist Members roster', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.squad/team.md',
      teamMarkdown().replace(
        '## Built-in Support Agents',
        '| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | Silent |\n\n## Built-in Support Agents',
      ),
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/must not list built-in agents as specialists/i);
    expect(result.stderr).toContain('Scribe');
  });

  it('rejects a Cast tree missing a required built-in charter (materialized directory + payload)', () => {
    const fixture = createFixture();
    rmSync(join(fixture.root, '.squad', 'agents', 'rai'), { recursive: true, force: true });
    const payloadWithoutRai = JSON.parse(readFileSync(fixture.payload, 'utf8')) as string[];
    writeFileSync(
      fixture.payload,
      JSON.stringify(payloadWithoutRai.filter((path) => path !== '.squad/agents/rai/charter.md')),
      'utf8',
    );
    write(
      fixture.root,
      '.squad/team.md',
      teamMarkdown().replace('| Rai | Built-in | `.squad/agents/rai/charter.md` |\n', ''),
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/materialized agent directories must exactly match/i);
    expect(result.stderr).toMatch(/must reference exactly the four required built-in charters/i);
  });

  it('rejects a Cast tree with an extra support agent beyond the four required built-ins', () => {
    const fixture = createFixture();
    write(fixture.root, '.squad/agents/watcher/charter.md', '# Watcher\n');
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/materialized agent directories must exactly match/i);
    expect(result.stderr).toContain('watcher');
  });

  it('rejects a built-in registered as an active specialist in the casting registry', () => {
    const fixture = createFixture();
    write(fixture.root, '.squad/casting/registry.json', JSON.stringify({
      agents: {
        ...Object.fromEntries(active.map(({ id, name }) => [
          id,
          { persistent_name: name, status: 'active', universe: 'descriptive' },
        ])),
        rai: { persistent_name: 'Rai', status: 'active', universe: 'descriptive' },
      },
    }));
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/built-in id "rai" must not be an active specialist registry entry/i);
  });

  it('rejects a built-in routed to as a specialist routing destination', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.squad/routing.md',
      `${routingMarkdown()}| Memory | Scribe | Session logging |\n`,
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/target "Scribe" is not an active registry persistent_name/i);
  });

  it('rejects a built-in listed as a specialist in the Team Capabilities block', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.github/agents/squad.agent.md',
      coordinatorMarkdown().replace(
        '### Available specialists\n\n| Agent | Role | Authority | Focus |\n| --- | --- | --- | --- |\n',
        '### Available specialists\n\n| Agent | Role | Authority | Focus |\n| --- | --- | --- | --- |\n| Scribe | Session Logger | Assigned domain | Session Logger |\n',
      ),
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/capability block must not list built-in "scribe" as a specialist/i);
  });

  it('rejects a payload missing one of the four required built-in charter paths', () => {
    const fixture = createFixture();
    const payloadWithoutFactChecker = JSON.parse(readFileSync(fixture.payload, 'utf8')) as string[];
    writeFileSync(
      fixture.payload,
      JSON.stringify(payloadWithoutFactChecker.filter((path) => path !== '.squad/agents/fact-checker/charter.md')),
      'utf8',
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('payload: missing active Cast path .squad/agents/fact-checker/charter.md');
  });

  it('rejects standalone template references absent from the final payload', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.github/agents/squad.agent.md',
      `${coordinatorMarkdown()}\nRead \`.squad/templates/after-agent-reference.md\` before returning.\n`,
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/standalone template|absent from the explicit final payload/i);
  });

  it('rejects a payload path whose casing differs from the final tree', () => {
    const fixture = createFixture();
    const wrongCasePayload = corePayload.map((path) =>
      path === '.squad/team.md' ? '.squad/Team.md' : path
    );
    writeFileSync(fixture.payload, JSON.stringify(wrongCasePayload), 'utf8');
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/exact Linux casing|unexpected path \.squad\/Team\.md/i);
  });

  it('rejects non-GH-AW client and internal source references', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.github/agents/squad.agent.md',
      `${coordinatorMarkdown()}\nAlso load \`.claude/agents/lead.md\` and \`packages/squad-cli/src/cli/core/coordinator.ts\`.\n`,
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/non-GH-AW client|internal source/i);
  });

  it('rejects legacy fictional examples when structural checks otherwise pass', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.github/agents/squad.agent.md',
      `${coordinatorMarkdown()}\nExample: route an auth issue with the label squad:ripley.\n`,
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/fictional or inactive sample label squad:ripley/i);
  });
});
