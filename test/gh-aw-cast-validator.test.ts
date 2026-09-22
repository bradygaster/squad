import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compileFunction, constants as vmConstants } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { requirePosixShell } from './posix-shell';
import { readCastingRegistryPair } from '../packages/squad-sdk/src/casting/durable-registry.js';
import { validateCastingPairFiles } from '../scripts/check-agent-binding.mjs';

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

interface RegistryFixture {
  revision: number;
  agents: Record<string, {
    status: string;
    role: string;
    created_at: string;
    retired_at?: string;
  }>;
}

/** Byte-for-byte canonical content of a built-in charter, as shipped with the workflow. */
function builtinCanonicalContent(id: string): Buffer {
  return readFileSync(join(process.cwd(), 'workflows', 'shared', 'builtins', `${id}-charter.md`));
}

const builtinCanonicalRelativePath = '.github/workflows/shared/builtins';

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

function write(root: string, path: string, content: string | Buffer): void {
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
  const legacyRegistry = {
    agents: Object.fromEntries(active.map(({ id, name }) => [
      id,
      {
        persistent_name: name,
        role: active.find(member => member.id === id)?.role,
        status: 'active',
        universe: 'descriptive',
        created_at: '2026-09-20T00:00:00.000Z',
      },
    ])),
  };
  write(root, '.squad/casting/registry.json', JSON.stringify(legacyRegistry));
  write(root, '.squad/casting/history.json', JSON.stringify({
    assignment_cast_snapshots: {},
    universe_usage_history: [],
  }));
  write(root, '.squad/casting/policy.json', '{}\n');
  for (const member of active) {
    write(root, `.squad/agents/${member.id}/charter.md`, `# ${member.name} — ${member.role}\n`);
  }
  for (const builtin of builtins) {
    const canonical = builtinCanonicalContent(builtin.id);
    // Mirrors the gh-aw resource materialization: the canonical charter is
    // installed under .github/workflows/shared/builtins/, then copied
    // verbatim to .squad/agents/{id}/charter.md by a deterministic step.
    write(root, `${builtinCanonicalRelativePath}/${builtin.id}-charter.md`, canonical);
    write(root, `.squad/agents/${builtin.id}/charter.md`, canonical);
  }
  write(root, '.github/agents/squad.agent.md', coordinatorMarkdown());
  write(root, 'meet-the-squad.md', '# Meet the Squad\n');
  const payload = join(root, '.github', 'workflows', 'squad-cast-payload.json');
  mkdirSync(dirname(payload), { recursive: true });
  writeFileSync(payload, JSON.stringify(corePayload), 'utf8');
  expect(spawnSync('git', ['init', '-q'], { cwd: root }).status).toBe(0);
  expect(spawnSync('git', ['config', 'user.email', 'cast-validator@example.com'], { cwd: root }).status).toBe(0);
  expect(spawnSync('git', ['config', 'user.name', 'Cast Validator'], { cwd: root }).status).toBe(0);
  expect(spawnSync('git', ['add', '.'], { cwd: root }).status).toBe(0);
  expect(spawnSync('git', ['commit', '-qm', 'base cast'], { cwd: root }).status).toBe(0);
  write(root, '.squad/casting/registry.json', JSON.stringify({
    schema: 'squad-agent-provenance/v1',
    schema_version: 1,
    revision: 1,
    generated_at: '2026-09-21T00:00:00.000Z',
    agents: Object.fromEntries(active.map(({ id, name, role }) => [
      id,
      {
        display_name: name,
        persistent_name: name,
        role,
        status: 'active',
        universe: 'descriptive',
        created_at: '2026-09-20T00:00:00.000Z',
        updated_at: '2026-09-21T00:00:00.000Z',
      },
    ])),
  }));
  write(root, '.squad/casting/history.json', JSON.stringify({
    assignment_cast_snapshots: {
      'cast-r1-2026-09-21T00:00:00.000Z': {
        created_at: '2026-09-21T00:00:00.000Z',
        agents: [],
        universe: 'descriptive',
      },
    },
    universe_usage_history: [
      { universe: 'descriptive', used_at: '2026-09-21T00:00:00.000Z' },
    ],
  }));
  return { root, payload, runnerTemp };
}

function validate(root: string, payload: string) {
  return spawnSync(process.execPath, [validator, '--root', root, '--payload', payload], {
    encoding: 'utf8',
  });
}

function validateWorkflowResource(root: string, payload: string) {
  return spawnSync(process.execPath, [resourcePath, '--root', root, '--payload', payload], {
    encoding: 'utf8',
  });
}

function writeCanonicalGenesisPair(root: string): void {
  const createdAt = '2026-09-20T00:00:00.000Z';
  const historyCreatedAt = '2026-09-19T17:00:00.000-07:00';
  write(root, '.squad/casting/registry.json', JSON.stringify({
    schema: 'squad-agent-provenance/v1',
    schema_version: 1,
    revision: 1,
    generated_at: '2026-09-21T00:00:00.000Z',
    agents: Object.fromEntries(active.map(({ id, name, role }) => [
      id,
      {
        display_name: name,
        persistent_name: name,
        role,
        status: 'active',
        universe: 'descriptive',
        created_at: createdAt,
        updated_at: '2026-09-21T00:00:00.000Z',
      },
    ])),
  }));
  write(root, '.squad/casting/history.json', JSON.stringify({
    assignment_cast_snapshots: {
      'active-team-reset-2026-09-20': {
        created_at: historyCreatedAt,
        agents: active.map(({ id }) => id),
        universe: 'descriptive',
      },
    },
    universe_usage_history: [
      { universe: 'descriptive', used_at: historyCreatedAt },
    ],
  }));
}

function readRegistry(root: string): RegistryFixture {
  return JSON.parse(
    readFileSync(join(root, '.squad', 'casting', 'registry.json'), 'utf8'),
  ) as RegistryFixture;
}

function writeRegistry(root: string, registry: RegistryFixture): void {
  write(root, '.squad/casting/registry.json', JSON.stringify(registry));
}

function commitRegistry(root: string): void {
  expect(spawnSync('git', [
    'add',
    '.squad/casting/registry.json',
    '.squad/casting/history.json',
  ], { cwd: root }).status).toBe(0);
  expect(spawnSync('git', ['commit', '-qm', 'versioned registry'], { cwd: root }).status).toBe(0);
}

function advanceHistory(root: string, revision: number, generatedAt: string): void {
  const historyPath = join(root, '.squad', 'casting', 'history.json');
  const history = JSON.parse(readFileSync(historyPath, 'utf8'));
  history.assignment_cast_snapshots[`cast-r${revision}-${generatedAt}`] = {
    created_at: generatedAt,
    agents: [],
    universe: 'descriptive',
  };
  history.universe_usage_history.push({
    universe: 'descriptive',
    used_at: generatedAt,
  });
  write(root, '.squad/casting/history.json', JSON.stringify(history));
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

  it.each([
    {
      name: 'missing casting pair',
      mutate: (root: string) => {
        rmSync(join(root, '.squad', 'casting', 'registry.json'));
        rmSync(join(root, '.squad', 'casting', 'history.json'));
      },
      expected: /complete registry\/history pair is required/,
    },
    {
      name: 'one-sided casting pair',
      mutate: (root: string) => rmSync(join(root, '.squad', 'casting', 'history.json')),
      expected: /complete registry\/history pair is required/,
    },
    {
      name: 'mixed-generation casting pair',
      mutate: (root: string) => {
        const registry = readRegistry(root);
        registry.revision = 2;
        registry.generated_at = '2026-09-21T00:01:00.000Z';
        writeRegistry(root, registry);
      },
      expected: /mixed-generation/,
    },
    {
      name: 'malformed casting history',
      mutate: (root: string) => write(root, '.squad/casting/history.json', JSON.stringify({
        assignment_cast_snapshots: [],
        universe_usage_history: [],
      })),
      expected: /history shape is malformed/,
    },
    {
      name: 'casting history with an unknown field',
      mutate: (root: string) => {
        const historyPath = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(historyPath, 'utf8'));
        history.unexpected = true;
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
      expected: /unknown top-level field "unexpected"/,
    },
  ])('rejects a $name', ({ mutate, expected }) => {
    const fixture = createFixture();
    mutate(fixture.root);
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(expected);
  });

  it('matches SDK and activation-checker acceptance for canonical legacy genesis', async () => {
    const fixture = createFixture();
    writeCanonicalGenesisPair(fixture.root);
    const castingDir = join(fixture.root, '.squad', 'casting');
    const registryFile = join(castingDir, 'registry.json');

    expect(readCastingRegistryPair(castingDir, 1).registry?.revision).toBe(1);
    await expect(validateCastingPairFiles(registryFile)).resolves.toMatchObject({ revision: 1 });
    const result = validateWorkflowResource(fixture.root, fixture.payload);
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    {
      name: 'revision-2 registry with unrelated empty history',
      mutate: (root: string) => {
        const registryPath = join(root, '.squad', 'casting', 'registry.json');
        const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
        registry.revision = 2;
        write(root, '.squad/casting/registry.json', JSON.stringify(registry));
        write(root, '.squad/casting/history.json', JSON.stringify({
          assignment_cast_snapshots: {},
          universe_usage_history: [],
        }));
      },
    },
    {
      name: 'multiple snapshots',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        history.assignment_cast_snapshots.second = {
          ...Object.values(history.assignment_cast_snapshots)[0],
        };
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'multiple usage records',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        history.universe_usage_history.push({ ...history.universe_usage_history[0] });
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'empty snapshot entry',
      mutate: (root: string) => {
        write(root, '.squad/casting/history.json', JSON.stringify({
          assignment_cast_snapshots: { empty: {} },
          universe_usage_history: [
            { universe: 'descriptive', used_at: '2026-09-20T00:00:00.000Z' },
          ],
        }));
      },
    },
    {
      name: 'empty usage entry',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        history.universe_usage_history = [{}];
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'revision-bearing snapshot key mismatch',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        const snapshot = Object.values(history.assignment_cast_snapshots)[0];
        history.assignment_cast_snapshots = { 'active-team-revision-2-reset': snapshot };
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'missing active-agent coverage',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        Object.values(history.assignment_cast_snapshots)[0].agents.pop();
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'duplicate active-agent coverage',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        const agents = Object.values(history.assignment_cast_snapshots)[0].agents;
        agents.push(agents[0]);
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'inactive agent coverage',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'registry.json');
        const registry = JSON.parse(readFileSync(path, 'utf8'));
        registry.agents[active[0].id].status = 'inactive';
        write(root, '.squad/casting/registry.json', JSON.stringify(registry));
      },
    },
    {
      name: 'universe mismatch',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        history.universe_usage_history[0].universe = 'functional';
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'creation timestamp mismatch',
      mutate: (root: string) => {
        const path = join(root, '.squad', 'casting', 'history.json');
        const history = JSON.parse(readFileSync(path, 'utf8'));
        const snapshot = Object.values(history.assignment_cast_snapshots)[0];
        snapshot.created_at = '2026-09-20T00:01:00.000Z';
        history.universe_usage_history[0].used_at = snapshot.created_at;
        write(root, '.squad/casting/history.json', JSON.stringify(history));
      },
    },
    {
      name: 'malformed history',
      mutate: (root: string) => {
        write(root, '.squad/casting/history.json', JSON.stringify({
          assignment_cast_snapshots: [],
          universe_usage_history: [],
        }));
      },
    },
    {
      name: 'one-sided pair',
      mutate: (root: string) => {
        rmSync(join(root, '.squad', 'casting', 'history.json'));
      },
    },
  ])('matches SDK and activation-checker rejection for $name', async ({ mutate }) => {
    const fixture = createFixture();
    writeCanonicalGenesisPair(fixture.root);
    mutate(fixture.root);
    const castingDir = join(fixture.root, '.squad', 'casting');
    const registryFile = join(castingDir, 'registry.json');

    expect(() => readCastingRegistryPair(castingDir, 1)).toThrow();
    await expect(validateCastingPairFiles(registryFile)).rejects.toThrow();
    const result = validateWorkflowResource(fixture.root, fixture.payload);
    expect(result.status).not.toBe(0);
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
      /Cast validator SHA-256 mismatch: expected ca7c6744b8ce8c479a9ae4d1a844787a1927d02f2b5ceff0efda35ced2b1adf4, got [a-f0-9]{64}\./,
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

  it('rejects a non-monotonic registry revision', () => {
    const fixture = createFixture();
    commitRegistry(fixture.root);
    const registry = readRegistry(fixture.root);
    writeRegistry(fixture.root, registry);
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/revision 1 must be greater than committed revision 1/);
  });

  it('rejects deletion of a committed stable id or tombstone', () => {
    const fixture = createFixture();
    const registry = readRegistry(fixture.root);
    registry.agents.tester!.status = 'retired';
    registry.agents.tester!.retired_at = '2026-09-21T00:00:00.000Z';
    writeRegistry(fixture.root, registry);
    commitRegistry(fixture.root);
    const next = readRegistry(fixture.root);
    next.revision = 2;
    next.generated_at = '2026-09-21T00:01:00.000Z';
    delete next.agents.tester;
    writeRegistry(fixture.root, next);
    advanceHistory(fixture.root, 2, next.generated_at);
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/committed agent id "tester" was deleted/);
  });

  it('rejects mutation of immutable role and creation time', () => {
    const fixture = createFixture();
    commitRegistry(fixture.root);
    const registry = readRegistry(fixture.root);
    registry.revision = 2;
    registry.generated_at = '2026-09-21T00:01:00.000Z';
    registry.agents.lead!.role = 'Replacement';
    registry.agents.lead!.created_at = '2026-09-22T00:00:00.000Z';
    writeRegistry(fixture.root, registry);
    advanceHistory(fixture.root, 2, registry.generated_at);
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/changed immutable role/);
    expect(result.stderr).toMatch(/changed immutable created_at/);
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

  it('rejects a built-in charter that has been regenerated or edited (byte mismatch vs. canonical resource)', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.squad/agents/ralph/charter.md',
      `${builtinCanonicalContent('ralph').toString('utf8')}\n<!-- reinterpreted by the Cast agent -->\n`,
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /builtin: \.squad\/agents\/ralph\/charter\.md is not byte-identical to the canonical resource \.github\/workflows\/shared\/builtins\/ralph-charter\.md/i,
    );
  });

  it('rejects a built-in charter with a trivial byte-level divergence (trailing newline) from the canonical resource', () => {
    const fixture = createFixture();
    write(fixture.root, '.squad/agents/scribe/charter.md', `${builtinCanonicalContent('scribe').toString('utf8')}\n`);
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/builtin: \.squad\/agents\/scribe\/charter\.md is not byte-identical/i);
  });

  it('rejects a Cast tree whose canonical built-in resource is missing from .github/workflows/shared/builtins', () => {
    const fixture = createFixture();
    rmSync(join(fixture.root, builtinCanonicalRelativePath, 'fact-checker-charter.md'), { force: true });
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /builtin: canonical resource \.github\/workflows\/shared\/builtins\/fact-checker-charter\.md for "fact-checker" is missing or unreadable/i,
    );
  });

  it('accepts a built-in charter that is byte-identical to the canonical resource for all four built-ins', () => {
    const fixture = createFixture();
    const result = validate(fixture.root, fixture.payload);
    expect(result.status, result.stderr).toBe(0);
    for (const builtin of builtins) {
      expect(
        readFileSync(join(fixture.root, '.squad', 'agents', builtin.id, 'charter.md')),
      ).toEqual(builtinCanonicalContent(builtin.id));
    }
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
