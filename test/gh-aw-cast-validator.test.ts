import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

const validator = join(process.cwd(), 'scripts', 'validate-gh-aw-cast.mjs');
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

function createFixture(): { root: string; payload: string } {
  const root = mkdtempSync(join(tmpdir(), 'gh-aw-cast-validator-'));
  workspaces.push(root);
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
  const payload = join(root, 'payload.json');
  writeFileSync(payload, JSON.stringify(corePayload), 'utf8');
  return { root, payload };
}

function validate(root: string, payload: string) {
  return spawnSync(process.execPath, [validator, '--root', root, '--payload', payload], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

describe('GH-AW Cast final-tree validator', () => {
  it('ships the reviewed validator byte-for-byte in the imported workflow helper', () => {
    const helper = readFileSync(
      join(process.cwd(), 'workflows', 'shared', 'squad-cast-validator.md'),
      'utf8',
    );
    const encoded = helper.match(
      /\n([A-Za-z0-9+/\r\n=]+)\r?\nSQUAD_CAST_VALIDATOR_B64/,
    )?.[1];
    expect(encoded, 'embedded validator payload must remain extractable').toBeDefined();
    const embedded = gunzipSync(Buffer.from((encoded as string).replace(/\s/g, ''), 'base64'));
    const normalizeLf = (value: string) => value.replace(/\r\n/g, '\n');
    expect(normalizeLf(embedded.toString('utf8'))).toBe(
      normalizeLf(readFileSync(validator, 'utf8')),
    );
    expect(helper).toContain('node "${RUNNER_TEMP:?}/validate-gh-aw-cast.mjs"');
    expect(helper).toContain('--payload "${RUNNER_TEMP:?}/squad-cast-payload.json"');
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
    const result = validate(fixture.root, fixture.payload);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/inactive\/support roles|scribe\/charter\.md/i);
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
