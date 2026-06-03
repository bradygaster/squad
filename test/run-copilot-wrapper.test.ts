/**
 * Tests for `squad run-copilot` wrapper subcommand (iter-5).
 *
 * The wrapper exists because Copilot CLI 1.0.58 ignores project-level
 * `.copilot/mcp-config.json`. Without it the canonical end-user invocation
 * leaves the `squad_state` MCP server unwired. See
 * `.squad/files/validation/ALIAS-EXPERIMENT-VERDICT.md`.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import {
  buildRunCopilotArgs,
  buildSpawnInvocation,
  quoteWindowsArg,
  runRunCopilot,
} from '../packages/squad-cli/src/cli/commands/run-copilot.js';

function makeTempProject(withMcpConfig: boolean): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'squad-runcopilot-'));
  if (withMcpConfig) {
    mkdirSync(path.join(root, '.copilot'), { recursive: true });
    writeFileSync(
      path.join(root, '.copilot', 'mcp-config.json'),
      JSON.stringify({ mcpServers: {} }),
    );
  }
  return root;
}

describe('buildRunCopilotArgs (iter-5: project mcp-config injection)', () => {
  it('injects --additional-mcp-config when .copilot/mcp-config.json exists', () => {
    const root = makeTempProject(true);
    try {
      const args = buildRunCopilotArgs(root, ['--yolo', '--agent', 'squad', '-p', 'hello']);
      expect(args[0]).toBe('--additional-mcp-config');
      expect(args[1]).toBe(`@${path.join(root, '.copilot', 'mcp-config.json')}`);
      // user args preserved in order after the injection
      expect(args.slice(2)).toEqual(['--yolo', '--agent', 'squad', '-p', 'hello']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes user args through unchanged when project mcp-config is missing', () => {
    const root = makeTempProject(false);
    try {
      const userArgs = ['--yolo', '-p', 'noop'];
      const args = buildRunCopilotArgs(root, userArgs);
      expect(args).toEqual(userArgs);
      // ensure no injection sneaks in
      expect(args).not.toContain('--additional-mcp-config');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('handles empty user args gracefully when config exists', () => {
    const root = makeTempProject(true);
    try {
      const args = buildRunCopilotArgs(root, []);
      expect(args).toEqual([
        '--additional-mcp-config',
        `@${path.join(root, '.copilot', 'mcp-config.json')}`,
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('runRunCopilot (iter-5: subprocess wiring)', () => {
  it('spawns copilot with the augmented argv and resolves with the exit code', async () => {
    const root = makeTempProject(true);
    try {
      let capturedArgs: string[] | undefined;
      let capturedCmd: string | undefined;
      const fakeChild = new EventEmitter() as EventEmitter & { kill?: () => void };
      const spawnImpl = vi.fn((cmd: string, args: string[]) => {
        capturedCmd = cmd;
        capturedArgs = args;
        // emit exit asynchronously to mimic spawn semantics
        setImmediate(() => fakeChild.emit('exit', 0, null));
        return fakeChild as never;
      });

      const code = await runRunCopilot(root, ['--yolo'], {
        spawnImpl: spawnImpl as never,
        copilotBin: 'copilot',
        copilotResolver: () => 'copilot',
        platformOverride: 'linux',
      });

      expect(code).toBe(0);
      expect(capturedCmd).toBe('copilot');
      expect(capturedArgs?.[0]).toBe('--additional-mcp-config');
      expect(capturedArgs?.[capturedArgs.length - 1]).toBe('--yolo');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('propagates non-zero exit codes from the child copilot process', async () => {
    const root = makeTempProject(false);
    try {
      const fakeChild = new EventEmitter();
      const spawnImpl = vi.fn(() => {
        setImmediate(() => fakeChild.emit('exit', 42, null));
        return fakeChild as never;
      });

      const code = await runRunCopilot(root, ['--noop'], {
        spawnImpl: spawnImpl as never,
        copilotBin: 'copilot',
      });

      expect(code).toBe(42);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('runRunCopilot (iter-6: Windows quoting regression — DEP0190)', () => {
  it('uses shell:false so Node does NOT mangle inner quotes (DEP0190)', async () => {
    const root = makeTempProject(false);
    try {
      let capturedOpts: { shell?: boolean | string } | undefined;
      const fakeChild = new EventEmitter();
      const spawnImpl = vi.fn((_cmd: string, _args: string[], opts: { shell?: boolean | string }) => {
        capturedOpts = opts;
        setImmediate(() => fakeChild.emit('exit', 0, null));
        return fakeChild as never;
      });

      await runRunCopilot(root, ['--yolo'], {
        spawnImpl: spawnImpl as never,
        copilotBin: 'copilot',
        // Force the non-Windows code path so we directly assert shell:false
        // on the wrapped argv. The Windows branch is asserted separately.
        platformOverride: 'linux',
      });

      expect(capturedOpts?.shell).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('preserves a multi-word -p value as a single argv element on Unix-like platforms', async () => {
    const root = makeTempProject(true);
    try {
      let capturedArgs: string[] | undefined;
      const fakeChild = new EventEmitter();
      const spawnImpl = vi.fn((_cmd: string, args: string[]) => {
        capturedArgs = args;
        setImmediate(() => fakeChild.emit('exit', 0, null));
        return fakeChild as never;
      });

      await runRunCopilot(
        root,
        ['--yolo', '--autopilot', '--agent', 'squad', '-p', 'hello world this is multiword'],
        {
          spawnImpl: spawnImpl as never,
          copilotBin: 'copilot',
          copilotResolver: () => 'copilot', // pretend resolution returned the bare name
          platformOverride: 'linux',
        },
      );

      // The multi-word -p value MUST survive as a single argv element. Pre-fix
      // shell:true would have split / re-quoted this, breaking copilot's
      // argv parsing.
      expect(capturedArgs).toBeDefined();
      const pIdx = capturedArgs!.indexOf('-p');
      expect(pIdx).toBeGreaterThanOrEqual(0);
      expect(capturedArgs![pIdx + 1]).toBe('hello world this is multiword');
      // And no surrounding quotes should have been added by us:
      expect(capturedArgs![pIdx + 1]).not.toContain('"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('on Windows .cmd shims, invokes cmd.exe with windowsVerbatimArguments and quoted multi-word args', () => {
    const root = makeTempProject(true);
    try {
      const fakeCmdShim = 'C:\\Users\\test\\AppData\\Roaming\\npm\\copilot.cmd';
      const invocation = buildSpawnInvocation(
        root,
        ['--yolo', '-p', 'hello world this is multiword'],
        {
          copilotBin: 'copilot',
          copilotResolver: () => fakeCmdShim,
          platformOverride: 'win32',
        },
      );

      // Must shim through cmd.exe (or %ComSpec%) — bare spawn(.cmd) requires
      // shell:true which is what we are deliberately avoiding.
      expect(invocation.cmd.toLowerCase()).toMatch(/cmd\.exe$/);
      expect(invocation.args[0]).toBe('/d');
      expect(invocation.args[1]).toBe('/s');
      expect(invocation.args[2]).toBe('/c');

      // Must set windowsVerbatimArguments so Node does NOT re-quote our line.
      const opts = invocation.opts as { shell?: boolean; windowsVerbatimArguments?: boolean };
      expect(opts.shell).toBe(false);
      expect(opts.windowsVerbatimArguments).toBe(true);

      // Multi-word -p value must appear as a SINGLE quoted token in the
      // command line. Pre-fix (shell:true) it was dropped to bare words.
      const commandLine = invocation.args[3] ?? '';
      expect(commandLine).toContain('"hello world this is multiword"');
      expect(commandLine).toContain('--additional-mcp-config');
      // The cmd-shim path itself must be quoted (it contains spaces in
      // C:\Users\test\AppData\Roaming — no spaces in this test path but
      // verify the quoter at minimum wrapped the path either bare or quoted):
      expect(commandLine.startsWith(`"${fakeCmdShim}"`) || commandLine.startsWith(fakeCmdShim)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('on non-Windows platforms, does NOT shim through cmd.exe even when bin name looks .cmd-ish', () => {
    const root = makeTempProject(false);
    try {
      const invocation = buildSpawnInvocation(root, ['--yolo'], {
        copilotBin: 'copilot',
        copilotResolver: () => '/usr/local/bin/copilot',
        platformOverride: 'linux',
      });
      expect(invocation.cmd).toBe('/usr/local/bin/copilot');
      expect(invocation.args).toEqual(['--yolo']);
      const opts = invocation.opts as { shell?: boolean; windowsVerbatimArguments?: boolean };
      expect(opts.shell).toBe(false);
      expect(opts.windowsVerbatimArguments).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('quoteWindowsArg (MSVCRT-style escaping)', () => {
  it('passes simple args through bare (no whitespace, no quotes)', () => {
    expect(quoteWindowsArg('--yolo')).toBe('--yolo');
    expect(quoteWindowsArg('copilot')).toBe('copilot');
  });

  it('wraps multi-word values in double quotes', () => {
    expect(quoteWindowsArg('hello world')).toBe('"hello world"');
  });

  it('escapes inner double quotes as \\"', () => {
    expect(quoteWindowsArg('he said "hi"')).toBe('"he said \\"hi\\""');
  });

  it('doubles trailing backslashes before the closing quote (only when quoting is needed)', () => {
    // Arg with a trailing backslash AND whitespace: must quote AND double the slash.
    expect(quoteWindowsArg('foo bar\\')).toBe('"foo bar\\\\"');
    // No whitespace/quotes → no quoting needed; leave the trailing slash alone.
    expect(quoteWindowsArg('path\\')).toBe('path\\');
  });

  it('doubles backslashes that immediately precede a literal quote', () => {
    expect(quoteWindowsArg('a\\"b')).toBe('"a\\\\\\"b"');
  });

  it('handles empty string by wrapping it in quotes (zero-length argv element)', () => {
    expect(quoteWindowsArg('')).toBe('""');
  });
});
