import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { mockResolveStateBackend, mockVerifyStateBackend } = vi.hoisted(() => ({
  mockResolveStateBackend: vi.fn(),
  mockVerifyStateBackend: vi.fn(),
}));

vi.mock('@bradygaster/squad-sdk', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@bradygaster/squad-sdk')>();
  return {
    ...actual,
    resolveStateBackend: mockResolveStateBackend,
    verifyStateBackend: mockVerifyStateBackend,
  };
});

import {
  runHealthCommand,
  runSquadHealth,
  type HealthCheckId,
  type HealthCheckItem,
  type HealthReport,
} from '../../packages/squad-cli/src/cli/commands/health.js';

const TEAM = `# Test Team

## Members

| Name | Role | Skills | Status |
|------|------|--------|--------|
| Alpha | Developer | TypeScript | Active |
`;

const MULTI_TABLE_TEAM = `# Test Team

## Coordinator

| Name | Role | Status |
|------|------|--------|
| Squad | Coordinator | Active |

## Members

| Name | Role | Skills | Status |
|------|------|--------|--------|
| Alpha | Developer | TypeScript | Active |
`;

const ROUTING = `# Routing

## Work Type \u2192 Agent

| Work Type | Agent | Examples |
|-----------|-------|----------|
| feature | Alpha | New work |
`;

const CHARTER = `# Alpha

## Identity

**Name:** Alpha
**Role:** Developer
`;

let repoRoot: string;
let squadDir: string;
const savedEnvironment = new Map<string, string | undefined>();

function write(relativePath: string, content: string): void {
  const filePath = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

function writeSquad(relativePath: string, content: string): void {
  write(path.join('.squad', relativePath), content);
}

function createHealthyState(): void {
  writeSquad('team.md', TEAM);
  writeSquad(
    path.join('casting', 'registry.json'),
    JSON.stringify({
      agents: {
        alpha: {
          created_at: '2026-01-01T00:00:00.000Z',
          persistent_name: 'Alpha',
          status: 'active',
        },
      },
    }),
  );
  writeSquad(path.join('agents', 'alpha', 'charter.md'), CHARTER);
  writeSquad('routing.md', ROUTING);
  writeSquad('config.json', JSON.stringify({ version: 1 }));
}

function check(report: HealthReport, id: HealthCheckId): HealthCheckItem {
  const result = report.checks.find((item) => item.id === id);
  if (!result) throw new Error(`missing health check ${id}`);
  return result;
}

function setEnvironment(name: string, value: string | undefined): void {
  if (!savedEnvironment.has(name)) {
    savedEnvironment.set(name, process.env[name]);
  }
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  repoRoot = mkdtempSync(path.join(tmpdir(), 'squad-health-'));
  squadDir = path.join(repoRoot, '.squad');
  createHealthyState();
  mockResolveStateBackend.mockReturnValue({ name: 'local' });
  mockVerifyStateBackend.mockReturnValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(repoRoot, { recursive: true, force: true });
  for (const [name, value] of savedEnvironment) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  savedEnvironment.clear();
});

describe('health report contract', () => {
  it('emits the stable schema and deterministic check order', () => {
    const report = runSquadHealth(squadDir, repoRoot);

    expect(report).toEqual({
      schema: 'squad-health/v1',
      status: 'pass',
      checks: expect.any(Array),
    });
    expect(report.checks.map((item) => item.id)).toEqual([
      'team',
      'registry-charters',
      'routing',
      'state-backend',
      'env-vars',
    ]);
    expect(report.checks.map((item) => item.status)).toEqual([
      'pass',
      'pass',
      'pass',
      'skip',
      'skip',
    ]);
  });

  it('keeps evaluating after a failure and makes the overall result fail', () => {
    unlinkSync(path.join(squadDir, 'team.md'));

    const report = runSquadHealth(squadDir, repoRoot);

    expect(report.status).toBe('fail');
    expect(report.checks).toHaveLength(5);
    expect(check(report, 'team').status).toBe('fail');
  });
});

describe('team readiness', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['malformed', '# Team without a roster'],
  ])('fails for a %s team file', (_caseName, content) => {
    const teamPath = path.join(squadDir, 'team.md');
    if (content === undefined) {
      unlinkSync(teamPath);
    } else {
      writeFileSync(teamPath, content, 'utf8');
    }

    expect(check(runSquadHealth(squadDir, repoRoot), 'team').status).toBe(
      'fail',
    );
  });

  it('fails on duplicate parsed agent names', () => {
    writeSquad(
      'team.md',
      TEAM.replace(
        '| Alpha | Developer | TypeScript | Active |',
        '| Alpha | Developer | TypeScript | Active |\n| alpha | Tester | Vitest | Active |',
      ),
    );

    const result = check(runSquadHealth(squadDir, repoRoot), 'team');

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual(['duplicate: alpha']);
  });

  it('parses multiple roster tables with their own column contracts', () => {
    writeSquad('team.md', MULTI_TABLE_TEAM);

    const result = check(runSquadHealth(squadDir, repoRoot), 'team');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('2 members');
  });
});

describe('registry and charter readiness', () => {
  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['invalid JSON', '{'],
    ['missing agents', '{}'],
    ['empty agents', '{"agents":{}}'],
  ])('fails for a %s casting registry', (_caseName, content) => {
    const registryPath = path.join(squadDir, 'casting', 'registry.json');
    if (content === undefined) {
      unlinkSync(registryPath);
    } else {
      writeFileSync(registryPath, content, 'utf8');
    }

    expect(
      check(runSquadHealth(squadDir, repoRoot), 'registry-charters').status,
    ).toBe('fail');
  });

  it('validates retired charters from the alumni directory', () => {
    writeSquad(
      path.join('casting', 'registry.json'),
      JSON.stringify({
        agents: {
          alpha: { persistent_name: 'Alpha', status: 'retired' },
        },
      }),
    );
    unlinkSync(path.join(squadDir, 'agents', 'alpha', 'charter.md'));
    writeSquad(
      path.join('agents', '_alumni', 'alpha', 'charter.md'),
      '# Alpha — Developer\n\n## Role\nReviews CLI behavior.\n',
    );

    expect(
      check(runSquadHealth(squadDir, repoRoot), 'registry-charters').status,
    ).toBe('pass');
  });

  it('fails for a malformed registry entry instead of throwing', () => {
    writeSquad(
      path.join('casting', 'registry.json'),
      '{"agents":{"alpha":null}}',
    );

    const result = check(
      runSquadHealth(squadDir, repoRoot),
      'registry-charters',
    );

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual([
      'alpha: registry entry must be an object',
    ]);
  });

  it('fails for an unsupported registry status', () => {
    writeSquad(
      path.join('casting', 'registry.json'),
      '{"agents":{"alpha":{"persistent_name":"Alpha","status":"unknown"}}}',
    );

    const result = check(
      runSquadHealth(squadDir, repoRoot),
      'registry-charters',
    );

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual([
      'alpha: registry entry has invalid status',
    ]);
  });

  it('requires a charter for every registry entry, including retired entries', () => {
    writeSquad(
      path.join('casting', 'registry.json'),
      JSON.stringify({
        agents: {
          alpha: { persistent_name: 'Alpha', status: 'retired' },
        },
      }),
    );
    unlinkSync(path.join(squadDir, 'agents', 'alpha', 'charter.md'));

    expect(
      check(runSquadHealth(squadDir, repoRoot), 'registry-charters').status,
    ).toBe('fail');
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    [
      'invalid',
      '## Identity\n\n**Name:** Different\n**Role:** Developer\n',
    ],
  ])('fails for a %s charter', (_caseName, content) => {
    const charterPath = path.join(
      squadDir,
      'agents',
      'alpha',
      'charter.md',
    );
    if (content === undefined) {
      unlinkSync(charterPath);
    } else {
      writeFileSync(charterPath, content, 'utf8');
    }

    expect(
      check(runSquadHealth(squadDir, repoRoot), 'registry-charters').status,
    ).toBe('fail');
  });
});

describe('routing readiness', () => {
  it('passes the initialized template after preset routes are appended', () => {
    const template = readFileSync(
      path.join(
        process.cwd(),
        'packages',
        'squad-sdk',
        'templates',
        'routing.md',
      ),
      'utf8',
    );
    writeSquad('routing.md', `${template}\n${ROUTING}`);

    expect(check(runSquadHealth(squadDir, repoRoot), 'routing').status).toBe(
      'pass',
    );
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['malformed', '# Routing without a table'],
  ])('fails for a %s routing file', (_caseName, content) => {
    const routingPath = path.join(squadDir, 'routing.md');
    if (content === undefined) {
      unlinkSync(routingPath);
    } else {
      writeFileSync(routingPath, content, 'utf8');
    }

    expect(check(runSquadHealth(squadDir, repoRoot), 'routing').status).toBe(
      'fail',
    );
  });

  it('fails closed when the registry cannot be used for cross-reference', () => {
    writeSquad(path.join('casting', 'registry.json'), '{');

    const result = check(runSquadHealth(squadDir, repoRoot), 'routing');

    expect(result.status).toBe('fail');
    expect(result.message).toContain('registry is invalid');
  });

  it('reports unknown agents deterministically', () => {
    writeSquad(
      'routing.md',
      ROUTING.replace(
        '| feature | Alpha | New work |',
        '| feature | Zulu, Missing | New work |',
      ),
    );

    const result = check(runSquadHealth(squadDir, repoRoot), 'routing');

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual([
      'unknown agent: Missing',
      'unknown agent: Zulu',
    ]);
  });

  it('rejects duplicate work types', () => {
    writeSquad(
      'routing.md',
      ROUTING.replace(
        '| feature | Alpha | New work |',
        '| feature | Alpha | New work |\n| Feature | Alpha | More work |',
      ),
    );

    const result = check(runSquadHealth(squadDir, repoRoot), 'routing');

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual(['duplicate work type: Feature']);
  });

  it('validates agent references in module ownership', () => {
    writeSquad(
      'routing.md',
      `${ROUTING}
## Module Ownership

| Module | Primary | Secondary |
|--------|---------|-----------|
| src/cli | Alpha | Ghost |
`,
    );

    const result = check(runSquadHealth(squadDir, repoRoot), 'routing');

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual(['unknown agent: Ghost']);
  });

  it('validates secondary agents in the work-type routing table', () => {
    writeSquad(
      'routing.md',
      `## Routing Table

| Work Type | Primary | Secondary |
|-----------|---------|-----------|
| feature | Alpha | Ghost |
`,
    );

    const result = check(runSquadHealth(squadDir, repoRoot), 'routing');

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual(['unknown agent: Ghost']);
  });
});

describe('state backend readiness', () => {
  it('skips when no backend is configured', () => {
    expect(
      check(runSquadHealth(squadDir, repoRoot), 'state-backend').status,
    ).toBe('skip');
    expect(mockResolveStateBackend).not.toHaveBeenCalled();
  });

  it.each([
    ['empty config', ''],
    ['invalid config', '{'],
    ['non-string backend', '{"stateBackend":42}'],
    ['empty backend', '{"stateBackend":""}'],
    ['unknown backend', '{"stateBackend":"unknown"}'],
  ])('fails closed for %s', (_caseName, config) => {
    writeSquad('config.json', config);

    expect(
      check(runSquadHealth(squadDir, repoRoot), 'state-backend').status,
    ).toBe('fail');
  });

  it('checks a configured local backend through the SDK primitives', () => {
    writeSquad('config.json', '{"stateBackend":"local"}');

    const result = check(
      runSquadHealth(squadDir, repoRoot),
      'state-backend',
    );

    expect(result.status).toBe('pass');
    expect(mockResolveStateBackend).toHaveBeenCalledWith(
      squadDir,
      repoRoot,
      'local',
    );
    expect(mockVerifyStateBackend).toHaveBeenCalledWith({ name: 'local' });
  });

  it('fails when configured backend resolution falls back', () => {
    writeSquad('config.json', '{"stateBackend":"orphan"}');
    mockResolveStateBackend.mockReturnValue({ name: 'local' });

    const result = check(
      runSquadHealth(squadDir, repoRoot),
      'state-backend',
    );

    expect(result.status).toBe('fail');
    expect(result.message).toContain('could not be initialized');
  });

  it('fails when a configured backend is unreachable without leaking errors', () => {
    writeSquad('config.json', '{"stateBackend":"orphan"}');
    mockResolveStateBackend.mockReturnValue({ name: 'orphan' });
    mockVerifyStateBackend.mockReturnValue({
      ok: false,
      error: 'https://secret-token@example.invalid/private/state',
    });

    const report = runSquadHealth(squadDir, repoRoot);
    const serialized = JSON.stringify(report);

    expect(check(report, 'state-backend').status).toBe('fail');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('example.invalid');
  });

  it('fails closed when an explicitly configured backend cannot be checked', () => {
    writeSquad('config.json', '{"stateBackend":"external-stub"}');
    mockResolveStateBackend.mockReturnValue({ name: 'local' });

    expect(
      check(runSquadHealth(squadDir, repoRoot), 'state-backend').status,
    ).toBe('fail');
  });
});

describe('environment readiness', () => {
  it('skips when repository configuration declares no required variables', () => {
    expect(check(runSquadHealth(squadDir, repoRoot), 'env-vars').status).toBe(
      'skip',
    );
  });

  it('ignores disabled example MCP server declarations', () => {
    setEnvironment('HEALTH_EXAMPLE_TOKEN', undefined);
    write(
      path.join('.copilot', 'mcp-config.json'),
      JSON.stringify({
        mcpServers: {
          'EXAMPLE-service': {
            env: { TOKEN: '${HEALTH_EXAMPLE_TOKEN}' },
          },
        },
      }),
    );

    expect(check(runSquadHealth(squadDir, repoRoot), 'env-vars').status).toBe(
      'skip',
    );
  });

  it('reports only sorted missing variable names from MCP declarations', () => {
    setEnvironment('HEALTH_ALPHA_TOKEN', undefined);
    setEnvironment('HEALTH_ZULU_TOKEN', undefined);
    write(
      path.join('.copilot', 'mcp-config.json'),
      JSON.stringify({
        mcpServers: {
          service: {
            env: {
              TOKEN_Z: '${HEALTH_ZULU_TOKEN}',
              TOKEN_A: '${HEALTH_ALPHA_TOKEN}',
            },
          },
        },
      }),
    );

    const result = check(runSquadHealth(squadDir, repoRoot), 'env-vars');

    expect(result.status).toBe('fail');
    expect(result.diagnostics).toEqual([
      'missing: HEALTH_ALPHA_TOKEN',
      'missing: HEALTH_ZULU_TOKEN',
    ]);
  });

  it('passes when declared variables are set and never emits their values', () => {
    const secret = 'health-secret-value-1605';
    setEnvironment('HEALTH_REQUIRED_TOKEN', secret);
    write(
      '.mcp.json',
      JSON.stringify({
        mcpServers: {
          service: {
            env: { TOKEN: '${HEALTH_REQUIRED_TOKEN}' },
          },
        },
      }),
    );

    const report = runSquadHealth(squadDir, repoRoot);

    expect(check(report, 'env-vars').status).toBe('pass');
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it('supports VS Code env declarations and fails malformed configuration', () => {
    setEnvironment('HEALTH_VSCODE_TOKEN', undefined);
    write(
      path.join('.vscode', 'mcp.json'),
      JSON.stringify({
        servers: {
          service: { env: { TOKEN: '${env:HEALTH_VSCODE_TOKEN}' } },
        },
      }),
    );

    expect(check(runSquadHealth(squadDir, repoRoot), 'env-vars')).toMatchObject({
      status: 'fail',
      diagnostics: ['missing: HEALTH_VSCODE_TOKEN'],
    });

    write(path.join('.vscode', 'mcp.json'), '{');
    expect(check(runSquadHealth(squadDir, repoRoot), 'env-vars')).toMatchObject({
      status: 'fail',
      message: 'Environment configuration declarations are invalid',
    });
  });
});

describe('CLI output and exit semantics', () => {
  it('emits deterministic JSON and returns zero for a healthy state', async () => {
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    const exitCode = await runHealthCommand(repoRoot, ['--json']);
    const report = JSON.parse(logs.join('\n')) as HealthReport;

    expect(exitCode).toBe(0);
    expect(report.schema).toBe('squad-health/v1');
    expect(report.status).toBe('pass');
  });

  it('returns one and keeps JSON structured when any check fails', async () => {
    unlinkSync(path.join(squadDir, 'team.md'));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    const exitCode = await runHealthCommand(repoRoot, ['--json']);
    const report = JSON.parse(logs.join('\n')) as HealthReport;

    expect(exitCode).toBe(1);
    expect(report.status).toBe('fail');
    expect(report.checks).toHaveLength(5);
  });

  it('keeps human output useful and secret-free', async () => {
    const secret = 'human-output-secret-1605';
    setEnvironment('HEALTH_HUMAN_TOKEN', secret);
    write(
      '.mcp.json',
      JSON.stringify({
        mcpServers: {
          service: { env: { TOKEN: '${HEALTH_HUMAN_TOKEN}' } },
        },
      }),
    );
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line));
    });

    expect(await runHealthCommand(repoRoot, [])).toBe(0);
    const output = logs.join('\n');
    expect(output).toContain('squad health: PASS');
    expect(output).toContain('[PASS] team:');
    expect(output).not.toContain(secret);
  });
});
