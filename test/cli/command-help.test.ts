/**
 * CLI Help — Per-Command --help Tests (Bug #1201)
 *
 * Previously `squad <cmd> --help` / `-h` was silently ignored and the
 * command would execute for real (e.g. `squad init --help` scaffolded
 * files; `squad triage --help` started a polling loop).
 *
 * These tests pin down the new behavior:
 *   1) `printCommandHelp(cmd, version)` returns true and prints when the
 *      command is registered, false (with no output) otherwise.
 *   2) The end-to-end CLI does not execute the command when --help/-h is
 *      passed after a known subcommand. Verified by spawning the built
 *      CLI in an empty temp dir and asserting:
 *        - exit code 0
 *        - no .squad/ or .github/ scaffolded by init
 *        - help banner contains the expected command name
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  printCommandHelp,
  printGenericCommandHelp,
  commandsWithHelp,
  normalizeCommandAlias,
} from '../../packages/squad-cli/src/cli/core/command-help.js';

const execFileAsync = promisify(execFile);

// ── Unit tests for the help registry ─────────────────────────────────

describe('printCommandHelp', () => {
  const logs: string[] = [];
  const originalLog = console.log;

  beforeAll(() => {
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
  });

  afterAll(() => {
    console.log = originalLog;
  });

  afterEach(() => {
    logs.length = 0;
  });

  it('returns true and prints help for known commands', () => {
    const result = printCommandHelp('init', '9.9.9-test');
    expect(result).toBe(true);
    const blob = logs.join('\n');
    expect(blob).toContain('squad init');
    expect(blob).toContain('9.9.9-test');
    expect(blob).toContain('Usage:');
  });

  it('returns false and prints nothing for unknown commands', () => {
    const result = printCommandHelp('definitely-not-a-real-command', '0.0.0');
    expect(result).toBe(false);
    expect(logs).toEqual([]);
  });

  it('normalizes subsquads aliases ("streams", "workstreams") to the canonical help block', () => {
    // Regression guard for PR #1202 review nit: cli-entry.ts routes
    // `squad streams` and `squad workstreams` to the subsquads command,
    // but the help registry is keyed by canonical name only. Without
    // alias normalization both `--help` invocations would fall through
    // to the generic fallback.
    for (const alias of ['streams', 'workstreams']) {
      logs.length = 0;
      const result = printCommandHelp(alias, '9.9.9-test');
      expect(result, `printCommandHelp('${alias}') should resolve via alias`).toBe(true);
      const blob = logs.join('\n');
      expect(blob, `'${alias}' --help should print subsquads block`).toContain('squad subsquads');
      expect(blob).toContain('9.9.9-test');
    }
  });

  it('normalizeCommandAlias maps known aliases and leaves others untouched', () => {
    expect(normalizeCommandAlias('list')).toBe('projects');
    expect(normalizeCommandAlias('streams')).toBe('subsquads');
    expect(normalizeCommandAlias('workstreams')).toBe('subsquads');
    expect(normalizeCommandAlias('subsquads')).toBe('subsquads');
    expect(normalizeCommandAlias('init')).toBe('init');
    expect(normalizeCommandAlias('made-up')).toBe('made-up');
  });

  it('covers every documented subcommand with a dedicated help block', () => {
    // Guard against regression: when a new command is added to the CLI
    // router, this list must grow too — otherwise `<new-cmd> --help` will
    // fall through to the generic fallback instead of helpful text.
    const expected = [
      'aspire',
      'build',
      'cast',
      'config',
      'consult',
      'copilot',
      'copilot-bridge',
      'cost',
      'delegate',
      'discover',
      'doctor',
      'economy',
      'export',
      'externalize',
      'extract',
      'hire',
      'import',
      'init',
      'init-remote',
      'internalize',
      'link',
      'loop',
      'memory',
      'migrate',
      'nap',
      'open',
      'personal',
      'pick',
      'plugin',
      'preset',
      'projects',
      'rc',
      'rc-tunnel',
      'remote-control',
      'roles',
      'schedule',
      'scrub-emails',
      'start',
      'state-mcp',
      'status',
      'subsquads',
      'triage',
      'upgrade',
      'upstream',
      'watch',
    ];
    expect(commandsWithHelp()).toEqual(expected);
  });
});

describe('printGenericCommandHelp', () => {
  const logs: string[] = [];
  const originalLog = console.log;

  beforeAll(() => {
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
  });

  afterAll(() => {
    console.log = originalLog;
  });

  afterEach(() => {
    logs.length = 0;
  });

  it('mentions the command name and points at squad help', () => {
    printGenericCommandHelp('made-up-cmd');
    const blob = logs.join('\n');
    expect(blob).toContain('made-up-cmd');
    expect(blob).toContain('squad help');
  });
});

// ── End-to-end: spawn the built CLI in an isolated temp dir ──────────

const cliEntry = resolve(
  process.cwd(),
  'packages/squad-cli/dist/cli-entry.js',
);

const cliBuilt = existsSync(cliEntry);

const runSquad = async (args: string[], cwd: string) => {
  return execFileAsync('node', [cliEntry, ...args], {
    cwd,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
};

describe.skipIf(!cliBuilt)('squad <cmd> --help end-to-end', () => {
  let tempDir = '';

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'squad-help-bug-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('init --help prints help and does NOT scaffold files', async () => {
    const { stdout, stderr } = await runSquad(['init', '--help'], tempDir);
    const out = stdout + stderr;
    expect(out).toContain('squad init');
    expect(out).toContain('Usage:');
    // The smoking gun: previously this call wrote .squad/, .github/, etc.
    expect(existsSync(join(tempDir, '.squad'))).toBe(false);
    expect(existsSync(join(tempDir, '.github'))).toBe(false);
    expect(existsSync(join(tempDir, '.gitignore'))).toBe(false);
  });

  it('init -h short flag also prints help and does NOT scaffold', async () => {
    const { stdout, stderr } = await runSquad(['init', '-h'], tempDir);
    const out = stdout + stderr;
    expect(out).toContain('squad init');
    expect(existsSync(join(tempDir, '.squad'))).toBe(false);
  });

  it('triage --help prints help and does NOT start a polling loop', async () => {
    // Previously this would hang on a 10-minute polling loop. The timeout
    // on runSquad is 20s — if help isn't intercepted, this assertion fails
    // with ETIMEDOUT before the body runs.
    const { stdout, stderr } = await runSquad(['triage', '--help'], tempDir);
    const out = stdout + stderr;
    expect(out).toContain('squad triage');
    expect(out).toContain('Usage:');
    expect(out).toContain('--execute');
  });

  it('watch --help prints help (alias of triage)', async () => {
    const { stdout, stderr } = await runSquad(['watch', '--help'], tempDir);
    const out = stdout + stderr;
    expect(out).toContain('squad watch');
    expect(out).toContain('Usage:');
  });

  it('doctor --help prints help instead of running the doctor', async () => {
    const { stdout, stderr } = await runSquad(['doctor', '--help'], tempDir);
    const out = stdout + stderr;
    expect(out).toContain('squad doctor');
    expect(out).toContain('Usage:');
    // The real doctor prints this banner; help must NOT.
    expect(out).not.toContain('🩺 Squad Doctor');
  });

  it('status --help prints help and does NOT print active squad path', async () => {
    const { stdout, stderr } = await runSquad(['status', '--help'], tempDir);
    const out = stdout + stderr;
    expect(out).toContain('squad status');
    expect(out).toContain('Usage:');
    expect(out).not.toMatch(/Active squad:/);
  });

  it('discover --help prints discover-specific help (not the generic fallback)', async () => {
    const { stdout, stderr } = await runSquad(['discover', '--help'], tempDir);
    const out = stdout + stderr;
    // discover IS registered, so verify it prints command-specific help.
    expect(out).toContain('squad discover');
  });

  it('falls back to a generic help message for unknown commands', async () => {
    // Use a name guaranteed not to be in COMMAND_HELP nor routed by
    // cli-entry.ts. The early --help intercept (cli-entry.ts ~L290) must
    // still kick in and dispatch to printGenericCommandHelp, which
    // mentions the cmd verbatim and points users at `squad help`.
    const bogus = 'this-command-does-not-exist-xyz';
    const { stdout, stderr } = await runSquad([bogus, '--help'], tempDir);
    const out = stdout + stderr;
    expect(out).toContain(bogus);
    expect(out).toContain('squad help');
    // Ensure no scaffolding / side effects from an unknown command.
    expect(existsSync(join(tempDir, '.squad'))).toBe(false);
  });
});
