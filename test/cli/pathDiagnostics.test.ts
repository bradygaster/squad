import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const TEST_ROOT = join(process.cwd(), `.test-path-diagnostics-${randomBytes(4).toString('hex')}`);

function scaffoldLocalSquad(root: string): void {
  mkdirSync(join(root, '.squad', 'agents'), { recursive: true });
  writeFileSync(join(root, '.squad', 'team.md'), '# Team\n\n## Members\n\n- Copilot\n');
  writeFileSync(join(root, '.squad', 'routing.md'), '# Routing\n');
}

describe('CLI: pathDiagnostics command', () => {
  beforeEach(() => {
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('collects the main resolved paths for the current directory', async () => {
    scaffoldLocalSquad(TEST_ROOT);
    const { collectPathDiagnostics } = await import('@bradygaster/squad-cli/commands/pathDiagnostics');

    const report = collectPathDiagnostics(TEST_ROOT, { verbose: false });

    expect(report.startDir).toBe(TEST_ROOT);
    expect(report.items.some((item) => item.label === 'resolveSquadInDir(startDir)' && String(item.value).includes('.squad'))).toBe(true);
    expect(report.items.some((item) => item.label === 'resolveSquadPaths(startDir).mode' && item.value === 'local')).toBe(true);
    expect(report.items.some((item) => item.label === 'resolveGlobalSquadPath()')).toBe(true);
  });

  it('includes trace analysis when verbose is enabled', async () => {
    scaffoldLocalSquad(TEST_ROOT);
    const { collectPathDiagnostics } = await import('@bradygaster/squad-cli/commands/pathDiagnostics');

    const report = collectPathDiagnostics(TEST_ROOT, { verbose: true });

    expect(report.traces.length).toBeGreaterThan(0);
    expect(report.traces.some((trace) => trace.method === 'resolveSquadInDir')).toBe(true);
    expect(report.traces.find((trace) => trace.method === 'resolveSquadInDir')?.steps.join('\n')).toContain('checked');
  });

  it('prints summary and verbose analysis to stdout', async () => {
    scaffoldLocalSquad(TEST_ROOT);
    const { pathDiagnosticsCommand } = await import('@bradygaster/squad-cli/commands/pathDiagnostics');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    pathDiagnosticsCommand(TEST_ROOT, { verbose: true });

    const output = log.mock.calls.flat().join('\n');
    expect(output).toContain('Path Diagnostics');
    expect(output).toContain('resolveSquadInDir(startDir)');
    expect(output).toContain('Verbose analysis');
  });
});
