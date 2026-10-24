import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT = process.cwd();
const TMP = path.join(ROOT, `.test-state-mcp-lifecycle-${randomBytes(4).toString('hex')}`);
const CLI_ENTRY = path.join(ROOT, 'packages', 'squad-cli', 'dist', 'cli-entry.js');
const activeChildren = new Set<ChildProcessWithoutNullStreams>();

describe('state-mcp stdio lifecycle', () => {
  beforeEach(() => {
    mkdirSync(path.join(TMP, '.squad'), { recursive: true });
    writeFileSync(path.join(TMP, '.squad', 'config.json'), JSON.stringify({ stateBackend: 'local' }));
    writeFileSync(path.join(TMP, '.squad', 'team.md'), '# Team\n');
  });

  afterEach(async () => {
    for (const child of activeChildren) {
      if (child.pid && isPidAlive(child.pid)) child.kill();
    }
    await Promise.allSettled([...activeChildren].map(child => waitForExit(child, 2_000)));
    activeChildren.clear();
    for (let attempt = 0; attempt < 10 && existsSync(TMP); attempt++) {
      try {
        rmSync(TMP, { recursive: true, force: true });
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  });

  it('returns the host node-process count to baseline after ten transports close', async () => {
    const marker = `squad-lifecycle-${randomBytes(8).toString('hex')}`;
    const baseline = 0;
    expect(existsSync(CLI_ENTRY), 'build packages/squad-cli before running lifecycle tests').toBe(true);
    const children = Array.from({ length: 10 }, (_, i) => startServer(`${marker}-${i}`));
    const pids = children.map(child => child.pid).filter((pid): pid is number => pid !== undefined);

    await Promise.all(children.map(initialize));
    expect(pids.filter(isPidAlive)).toHaveLength(children.length);
    for (const child of children) child.stdin.end();
    await Promise.all(children.map(child => waitForExit(child, 2_500)));

    const deadline = Date.now() + 3_000;
    let count = pids.filter(isPidAlive).length;
    while (count !== baseline && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      count = pids.filter(isPidAlive).length;
    }

    expect(count).toBe(baseline);
  }, 60_000);
});

function startServer(marker: string): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, [CLI_ENTRY, 'state-mcp', marker], {
    cwd: TMP,
    detached: false,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  activeChildren.add(child);
  child.once('exit', () => activeChildren.delete(child));
  return child;
}

async function initialize(child: ChildProcessWithoutNullStreams): Promise<void> {
  let buffer = '';
  let stderr = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`initialize timed out: ${stderr.slice(-2000)}`)), 20_000);
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line) as { id?: number; result?: { serverInfo?: { name?: string } } };
          if (message.id === 1 && message.result?.serverInfo?.name === 'squad-state') {
            clearTimeout(timer);
            child.stdout.off('data', onData);
            resolve();
          }
        } catch {
          // Ignore loader diagnostics or incomplete non-protocol output.
        }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`state-mcp exited during initialize (${code}): ${stderr.slice(-2000)}`)));
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'lifecycle-test', version: '1' },
      },
    })}\n`);
  });
}

async function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`PID ${child.pid} did not exit after stdin EOF`)), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function isPidAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
