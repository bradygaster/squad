import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

const validator = join(process.cwd(), 'scripts', 'validate-gh-aw-cast.mjs');
const helperPath = join(process.cwd(), 'workflows', 'shared', 'squad-cast-validator.md');
const workflowPath = join(process.cwd(), 'workflows', 'squad.md');
const workspaces: string[] = [];

const active = [
  { id: 'lead', name: 'Lead', role: 'Technical Lead' },
  { id: 'builder', name: 'Builder', role: 'Application Engineer' },
  { id: 'tester', name: 'Tester', role: 'Quality Engineer' },
];

const corePayload = [
  '.squad/team.md',
  '.squad/routing.md',
  '.squad/casting/registry.json',
  '.squad/casting/history.json',
  '.squad/casting/policy.json',
  ...active.map(({ id }) => `.squad/agents/${id}/charter.md`),
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

Load only the selected charter for the member receiving work:
${active.map(({ id, name }) => `- ${name}: \`.squad/agents/${id}/charter.md\``).join('\n')}

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
  const runnerTemp = join(root, 'runner-temp');
  mkdirSync(runnerTemp, { recursive: true });
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
  write(root, '.github/agents/squad.agent.md', coordinatorMarkdown());
  write(root, 'meet-the-squad.md', '# Meet the Squad\n');
  const payload = join(runnerTemp, 'squad-cast-payload.json');
  writeFileSync(payload, JSON.stringify(corePayload), 'utf8');
  return { root, payload, runnerTemp };
}

function validate(root: string, payload: string) {
  return spawnSync(process.execPath, [validator, '--root', root, '--payload', payload], {
    encoding: 'utf8',
  });
}

function helperSource(): string {
  return readFileSync(helperPath, 'utf8');
}

function materializedSkillSource(): string {
  return helperSource().replace(/^## skill: `squad-cast-validator`\r?\n/, '');
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

function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function replaceValidatorPayload(source: string, program: string): string {
  const encoded = gzipSync(Buffer.from(program)).toString('base64');
  return source.replace(
    /(?<=<!-- SQUAD_CAST_VALIDATOR_B64_BEGIN -->\r?\n)[A-Za-z0-9+/\r\n=]+(?=\r?\n<!-- SQUAD_CAST_VALIDATOR_B64_END -->)/,
    encoded,
  );
}

function materializeSkill(
  root: string,
  path = '.github/skills/squad-cast-validator/SKILL.md',
  content = materializedSkillSource(),
): void {
  write(root, path, content);
}

function runValidatorCommand(
  fixture: ReturnType<typeof createFixture>,
  cwd = fixture.root,
) {
  return spawnSync('bash', ['-c', validatorCommand()], {
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

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('GH-AW Cast final-tree validator', () => {
  it('ships the reviewed validator byte-for-byte in the materialized inline skill', () => {
    const helper = helperSource();
    const encoded = helper.match(
      /<!-- SQUAD_CAST_VALIDATOR_B64_BEGIN -->\r?\n([A-Za-z0-9+/\r\n=]+)\r?\n<!-- SQUAD_CAST_VALIDATOR_B64_END -->/,
    )?.[1];
    expect(encoded, 'embedded validator payload must remain extractable').toBeDefined();
    const embedded = gunzipSync(Buffer.from((encoded as string).replace(/\s/g, ''), 'base64'));
    const canonical = readFileSync(validator);
    const normalizedEmbedded = Buffer.from(embedded.toString('utf8').replace(/\r\n/g, '\n'));
    expect(normalizedEmbedded).toEqual(canonical);

    const commandDigest = validatorCommand().match(
      /validator_expected_sha256="([a-f0-9]{64})"/,
    )?.[1];
    expect(commandDigest, 'runtime command must pin the canonical validator digest').toBeDefined();
    expect(commandDigest).toBe(sha256(canonical));
  });

  it('keeps validator bytes and transcription instructions out of the agent command', () => {
    const command = validatorCommand();
    const workflow = readFileSync(workflowPath, 'utf8');
    expect(command.length).toBeLessThan(3_000);
    expect(command).not.toMatch(/[A-Za-z0-9+/]{256}/);
    expect(command).not.toMatch(/cat\s+<<|SQUAD_CAST_VALIDATOR_B64'\s*\\/);
    expect(command).not.toContain('H4sI');
    expect(helperSource()).not.toMatch(/cat\s+<</);
    expect(workflow).not.toContain('invoke the `skill` tool on');
    expect(workflow).toContain('Do not\ninvoke or load `squad-cast-validator` into model context');
    expect(command.indexOf('validator_expected_sha256=')).toBeLessThan(
      command.indexOf('node --check "$validator_script"'),
    );
    expect(command.indexOf('node --check "$validator_script"')).toBeLessThan(
      command.indexOf('validator_output="$('),
    );
  });

  it('finds the materialized skill and runs the exact validator successfully', () => {
    const fixture = createFixture();
    materializeSkill(fixture.root);
    const invocationDirectory = join(fixture.root, 'nested', 'invocation-directory');
    mkdirSync(invocationDirectory, { recursive: true });
    const result = runValidatorCommand(fixture, invocationDirectory);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('Cast validation passed.\n');
    expect(authorizesPullRequest(result)).toBe(true);
    const normalizeLf = (value: string) => value.replace(/\r\n/g, '\n');
    expect(
      normalizeLf(readFileSync(join(fixture.runnerTemp, 'validate-gh-aw-cast.mjs'), 'utf8')),
    ).toBe(normalizeLf(readFileSync(validator, 'utf8')));
  });

  it('fails clearly when the materialized validator skill is missing', () => {
    const fixture = createFixture();
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Cast validator skill not found under GITHUB_WORKSPACE.');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('fails clearly when multiple materialized validator skills match', () => {
    const fixture = createFixture();
    materializeSkill(fixture.root);
    materializeSkill(fixture.root, '.claude/skills/squad-cast-validator/SKILL.md');
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Expected exactly one Cast validator skill, found 2:');
    expect(result.stderr).toContain('.github/skills/squad-cast-validator/SKILL.md');
    expect(result.stderr).toContain('.claude/skills/squad-cast-validator/SKILL.md');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('fails integrity checks when the materialized payload is corrupt', () => {
    const fixture = createFixture();
    const corrupt = materializedSkillSource().replace(
      /(<!-- SQUAD_CAST_VALIDATOR_B64_BEGIN -->\r?\n)H/,
      '$1!',
    );
    materializeSkill(fixture.root, undefined, corrupt);
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/base64|gzip|invalid|error/i);
    expect(result.stderr).toContain('Cast validator payload extraction failed');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('fails clearly when the materialized payload markers are malformed', () => {
    const fixture = createFixture();
    const corrupt = materializedSkillSource().replace(
      '<!-- SQUAD_CAST_VALIDATOR_B64_BEGIN -->',
      '<!-- BROKEN_CAST_VALIDATOR_B64_BEGIN -->',
    );
    materializeSkill(fixture.root, undefined, corrupt);
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'Cast validator payload extraction failed; expected one marker pair with valid base64+gzip data.',
    );
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('rejects a syntactically corrupt validator at the digest boundary before execution', () => {
    const fixture = createFixture();
    const corrupt = replaceValidatorPayload(materializedSkillSource(), 'const = ;\n');
    materializeSkill(fixture.root, undefined, corrupt);
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Cast validator SHA-256 mismatch');
    expect(result.stdout).not.toContain('Cast validation passed.');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('rejects a syntactically valid impostor that prints the exact success sentinel', () => {
    const fixture = createFixture();
    const impostor = replaceValidatorPayload(
      materializedSkillSource(),
      "console.log('Cast validation passed.');\n",
    );
    materializeSkill(fixture.root, undefined, impostor);
    const result = runValidatorCommand(fixture);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(
      /Cast validator SHA-256 mismatch: expected 82aa5620d81e26513658fbde210b0f8d2ac3bc7572e672b421aaa17a2832e8cc, got [a-f0-9]{64}\./,
    );
    expect(result.stdout).not.toContain('Cast validation passed.');
    expect(authorizesPullRequest(result)).toBe(false);
  });

  it('preserves validator failures and cannot authorize an invalid Cast tree', () => {
    const fixture = createFixture();
    materializeSkill(fixture.root);
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

  it('accepts a self-contained descriptive Cast tree', () => {
    const fixture = createFixture();
    const result = validate(fixture.root, fixture.payload);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Cast validation passed');
  });

  it('rejects missing inactive-role charters even when routing and capability markers pass', () => {
    const fixture = createFixture();
    write(
      fixture.root,
      '.squad/team.md',
      `${teamMarkdown()}\n| Scribe | Session Logger | \`.squad/agents/scribe/charter.md\` | Silent |\n`,
    );
    write(
      fixture.root,
      '.github/agents/squad.agent.md',
      `${coordinatorMarkdown()}\nScribe records each delegated task.\n`,
    );
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/inactive\/support roles|scribe\/charter\.md/i);
    expect(result.stderr).toContain(
      'coordinator: inactive/support roles are forbidden in GH-AW Cast output',
    );
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
