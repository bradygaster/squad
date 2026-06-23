import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

async function loadHarness() {
  return import('../scripts/real-cli-ab.js');
}

const roots: string[] = [];

function testRoot(prefix: string): string {
  const root = path.join(process.cwd(), `.test-${prefix}-${randomUUID()}`);
  roots.push(root);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('real Copilot CLI A/B harness', () => {
  it('builds per-repo/per-variant isolated COPILOT_HOME paths', async () => {
    const { buildRunPlan, slugifyPath } = await loadHarness();
    const repo = testRoot('real-cli-ab-repo');
    const outDir = testRoot('real-cli-ab-out');

    const plan = buildRunPlan({
      repos: [repo],
      variants: ['baseline', 'memory-governance'],
      outDir,
      productCli: path.join(process.cwd(), 'cli.js'),
    });

    expect(plan).toHaveLength(2);
    expect(plan[0].copilotHome).toContain(path.join(outDir, 'copilot-home', slugifyPath(repo), 'baseline'));
    expect(plan[1].copilotHome).toContain(path.join(outDir, 'copilot-home', slugifyPath(repo), 'memory-governance'));
    expect(plan[0].copilotHome).not.toBe(plan[1].copilotHome);
  });

  it('parses diagnostics from stdio without logging raw memory content requirements', async () => {
    const { extractMemoryDiagnostics } = await loadHarness();
    const events = extractMemoryDiagnostics([
      '[memory:info] command.start command=classify projectRoot=C:\\repo',
      '[memory:debug] classify.request contentLength=42 requestedClass=LOCAL',
      '[memory:info] classify.complete class=LOCAL allowed=true elapsedMs=3',
    ].join('\n'));

    expect(events).toEqual([
      expect.objectContaining({ level: 'info', message: expect.stringContaining('command.start') }),
      expect.objectContaining({ level: 'debug', message: expect.stringContaining('contentLength=42') }),
      expect.objectContaining({ level: 'info', message: expect.stringContaining('classify.complete') }),
    ]);
  });

  it('writes command, stdio, diagnostics, and summary artifacts using an injected executor', async () => {
    const { parseArgs, runExperiment } = await loadHarness();
    const repo = testRoot('real-cli-ab-repo');
    const outDir = testRoot('real-cli-ab-out');
    const productCli = path.join(repo, 'cli.js');
    fs.writeFileSync(productCli, '#!/usr/bin/env node\n');

    const { summary } = await runExperiment({
      ...parseArgs([
        '--repo', repo,
        '--out-dir', outDir,
        '--product-cli', productCli,
        '--variants', 'memory-governance',
      ]),
      copilotBin: 'fake-copilot',
    }, async (_command, _args, childOptions) => ({
      exitCode: 0,
      signal: null,
      durationMs: 25,
      stdoutText: 'ran node cli.js memory provider\n',
      stderrText: `[memory:info] command.start command=provider projectRoot=${childOptions.cwd}\n[memory:info] provider.status.complete defaultProvider=local elapsedMs=2\n`,
    }));

    const result = summary.results[0];
    expect(result.copilotHome).toContain(path.join(outDir, 'copilot-home'));
    expect(result.memoryCommandMentioned).toBe(true);
    expect(result.memoryDiagnosticEventCount).toBe(2);
    expect(fs.existsSync(result.commandPath)).toBe(true);
    expect(fs.existsSync(result.stdoutPath)).toBe(true);
    expect(fs.existsSync(result.stderrPath)).toBe(true);
    expect(fs.existsSync(result.diagnosticsPath)).toBe(true);
    expect(fs.existsSync(path.join(outDir, 'summary.json'))).toBe(true);
  });

  it('records a measured limitation when no memory diagnostics are captured', async () => {
    const { collectDiagnostics } = await loadHarness();
    const run = {
      logDir: testRoot('real-cli-ab-logs'),
    };

    const diagnostics = collectDiagnostics(run, 'ordinary Copilot response', '');
    expect(diagnostics.memoryDiagnosticEventCount).toBe(0);
    expect(diagnostics.limitation).toContain('No [memory:*] diagnostics were captured');
  });

  it('does not count prompt-only memory command mentions as executed commands', async () => {
    const { collectDiagnostics } = await loadHarness();
    const run = {
      logDir: testRoot('real-cli-ab-logs'),
    };

    const diagnostics = collectDiagnostics(
      run,
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Do not run `squad memory` in this baseline turn.' },
      }),
      '',
    );

    expect(diagnostics.memoryCommandMentioned).toBe(false);
  });
});
