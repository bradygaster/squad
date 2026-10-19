import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const TEST_ROOT = join(tmpdir(), `.test-cli-cost-${randomBytes(4).toString('hex')}`);
const TEAM_ROOT = join(TEST_ROOT, 'team');
const ORCH_DIR = join(TEAM_ROOT, '.squad', 'orchestration-log');
const LOG_DIR = join(TEAM_ROOT, '.squad', 'log');
const USAGE_LEDGER = join(LOG_DIR, 'usage.jsonl');

function writeOrchestrationLog(fileName: string, agent: string, inputTokens: string, outputTokens: string, cost: string): void {
  writeFileSync(
    join(ORCH_DIR, fileName),
    [
      '# Orchestration Log Entry',
      '',
      '| Field | Value |',
      '|-------|-------|',
      `| **Agent routed** | ${agent} (Specialist) |`,
      `| **Token usage** | ${inputTokens} in / ${outputTokens} out — $${cost} |`,
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeUsageLedger(records: Array<Record<string, unknown>>): void {
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(USAGE_LEDGER, `${records.map(record => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}

describe('CLI: cost command', () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(ORCH_DIR, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('module exports runCost function', async () => {
    const mod = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    expect(typeof mod.runCost).toBe('function');
  });

  it('aggregates all orchestration log usage with --all', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    writeOrchestrationLog('2026-03-18T10-00-00Z-flight.md', 'Flight', '12,450', '3,200', '0.0234');
    writeOrchestrationLog('2026-03-18T10-01-00Z-control.md', 'Control', '8,100', '2,800', '0.0156');
    writeOrchestrationLog('2026-03-18T10-02-00Z-flight.md', 'Flight', '550', '100', '0.0010');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost(['--all'], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('💰 Squad Cost Summary');
    expect(output).toContain('Flight');
    expect(output).toContain('13,000');
    expect(output).toContain('3,300');
    expect(output).toContain('$0.0244');
    expect(output).toContain('Control');
    expect(output).toContain('21,100');
    expect(output).toContain('6,100');
    expect(output).toContain('$0.0400');
    expect(output).toContain('2 agents across 3 turns');
    expect(output).toContain('legacy self-reported orchestration logs');
  });

  it('defaults to entries newer than the latest session log', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(join(LOG_DIR, '2026-03-18T10-01-30Z-session.md'), '# session\n', 'utf8');
    writeOrchestrationLog('2026-03-18T10-01-00Z-flight.md', 'Flight', '500', '100', '0.0010');
    writeOrchestrationLog('2026-03-18T10-02-00Z-booster.md', 'Booster', '900', '200', '0.0025');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost([], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('Booster');
    expect(output).not.toContain('Flight');
    expect(output).toContain('1 agent across 1 turn');
  });

  it('filters results by agent name', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    writeOrchestrationLog('2026-03-18T10-00-00Z-flight.md', 'Flight', '100', '50', '0.0010');
    writeOrchestrationLog('2026-03-18T10-01-00Z-control.md', 'Control', '200', '70', '0.0020');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost(['--all', '--agent', 'control'], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('Control');
    expect(output).not.toContain('Flight');
    expect(output).toContain('1 agent across 1 turn in 1 session for control');
  });

  it('prints the no-data message when orchestration log directory is missing', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    rmSync(ORCH_DIR, { recursive: true, force: true });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost([], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('No token usage data found.');
  });

  it('uses the structured usage ledger instead of self-reported markdown', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    writeOrchestrationLog('2026-09-15T17-00-00Z-flight.md', 'Wrong Agent', '999,999', '999,999', '99.9999');
    writeUsageLedger([
      {
        version: 1,
        kind: 'turn-start',
        turnId: 'turn-1',
        sessionId: 'session-1',
        agentName: 'Flight',
        timestamp: '2026-09-15T16:59:59.000Z',
      },
      {
        version: 1,
        kind: 'usage',
        turnId: 'turn-1',
        sessionId: 'session-1',
        agentName: 'Flight',
        model: 'claude-sonnet-5',
        inputTokens: 1200,
        outputTokens: 300,
        estimatedCost: 0.0125,
        timestamp: '2026-09-15T17:00:00.000Z',
      },
      {
        version: 1,
        kind: 'turn-start',
        turnId: 'turn-2',
        sessionId: 'session-1',
        agentName: 'Flight',
        timestamp: '2026-09-15T17:00:59.000Z',
      },
      {
        version: 1,
        kind: 'usage',
        turnId: 'turn-2',
        sessionId: 'session-1',
        agentName: 'Flight',
        model: 'claude-sonnet-5',
        inputTokens: 800,
        outputTokens: 200,
        estimatedCost: 0.0075,
        timestamp: '2026-09-15T17:01:00.000Z',
      },
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost(['--all'], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('Flight');
    expect(output).toContain('2,000');
    expect(output).toContain('$0.0200');
    expect(output).toContain('claude-sonnet-5 (2 turns, $0.0200)');
    expect(output).toContain('structured runtime usage ledger');
    expect(output).toContain('Coverage: 2 of 2 turn attempts with recorded usage (100.0%)');
    expect(output).not.toContain('Wrong Agent');
    expect(output).not.toContain('999,999');
  });

  it('reports invalid ledger records while retaining valid usage', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(
      USAGE_LEDGER,
      [
        JSON.stringify({
          version: 1,
          kind: 'usage',
          sessionId: 'session-1',
          agentName: 'Control',
          model: 'gpt-5.6-sol',
          inputTokens: 500,
          outputTokens: 100,
          estimatedCost: 0.005,
          timestamp: '2026-09-15T17:00:00.000Z',
        }),
        '{broken-json',
      ].join('\n'),
      'utf8',
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost(['--all'], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('Control');
    expect(output).toContain('Skipped 1 invalid usage ledger record');
  });

  it('filters structured usage and coverage to the current session', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(join(LOG_DIR, '2026-09-15T17-01-30Z-session.md'), '# session\n', 'utf8');
    writeUsageLedger([
      {
        version: 1,
        kind: 'turn-start',
        turnId: 'old-turn',
        sessionId: 'old-session',
        agentName: 'Flight',
        timestamp: '2026-09-15T17:00:00.000Z',
      },
      {
        version: 1,
        kind: 'usage',
        turnId: 'old-turn',
        sessionId: 'old-session',
        agentName: 'Flight',
        model: 'claude-sonnet-5',
        inputTokens: 900,
        outputTokens: 100,
        estimatedCost: 0.009,
        timestamp: '2026-09-15T17:01:00.000Z',
      },
      {
        version: 1,
        kind: 'turn-start',
        turnId: 'current-turn',
        sessionId: 'current-session',
        agentName: 'Control',
        timestamp: '2026-09-15T17:02:00.000Z',
      },
      {
        version: 1,
        kind: 'usage',
        turnId: 'current-turn',
        sessionId: 'current-session',
        agentName: 'Control',
        model: 'gpt-5.6-sol',
        inputTokens: 500,
        outputTokens: 100,
        estimatedCost: 0.005,
        timestamp: '2026-09-15T17:03:00.000Z',
      },
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost([], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('Control');
    expect(output).not.toContain('Flight');
    expect(output).toContain('Coverage: 1 of 1 turn attempt with recorded usage (100.0%)');
  });

  it('reports turn attempts that did not emit usage instead of falling back to markdown', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    writeOrchestrationLog('2026-09-15T17-00-00Z-flight.md', 'Legacy Agent', '999', '999', '9.9999');
    writeUsageLedger([
      {
        version: 1,
        kind: 'turn-start',
        turnId: 'turn-1',
        sessionId: 'session-1',
        agentName: 'Control',
        timestamp: '2026-09-15T17:00:00.000Z',
      },
      {
        version: 1,
        kind: 'usage',
        turnId: 'turn-1',
        sessionId: 'session-1',
        agentName: 'Control',
        model: 'gpt-5.6-sol',
        inputTokens: 500,
        outputTokens: 100,
        estimatedCost: 0.005,
        timestamp: '2026-09-15T17:01:00.000Z',
      },
      {
        version: 1,
        kind: 'turn-start',
        turnId: 'turn-2',
        sessionId: 'session-1',
        agentName: 'Control',
        timestamp: '2026-09-15T17:02:00.000Z',
      },
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost(['--all'], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('Control');
    expect(output).toContain('Coverage: 1 of 2 turn attempts with recorded usage (50.0%)');
    expect(output).not.toContain('Legacy Agent');
  });

  it('reports zero coverage when structured turn attempts have no usage', async () => {
    const { runCost } = await import('../../packages/squad-cli/src/cli/commands/cost.ts');
    writeOrchestrationLog('2026-09-15T17-00-00Z-flight.md', 'Legacy Agent', '999', '999', '9.9999');
    writeUsageLedger([
      {
        version: 1,
        kind: 'turn-start',
        turnId: 'turn-1',
        sessionId: 'session-1',
        agentName: 'Control',
        timestamp: '2026-09-15T17:00:00.000Z',
      },
    ]);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runCost(['--all'], TEAM_ROOT);

    const output = logSpy.mock.calls.map(call => call.join(' ')).join('\n');
    expect(output).toContain('No token usage data found.');
    expect(output).toContain('Coverage: 0 of 1 turn attempt with recorded usage (0.0%)');
    expect(output).not.toContain('Legacy Agent');
  });
});
