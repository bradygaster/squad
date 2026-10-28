import { describe, expect, it } from 'vitest';
import { runProcessTreeCommand } from '../../packages/squad-cli/src/cli/commands/watch/agent-spawn.js';

describe('watch process-tree command', () => {
  it('reaps a timed-out shell command and its child process', async () => {
    const childScript = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {stdio: 'ignore'}); setTimeout(() => {}, 30000)";
    const startedAt = Date.now();
    const result = await runProcessTreeCommand(process.execPath, ['-e', childScript], {
      cwd: process.cwd(),
      timeoutMs: 1_000,
      maxBuffer: 1024,
      shell: false,
    });

    expect(result.timedOut).toBe(true);
    expect(result.error).toBeDefined();
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  }, 10_000);
});
