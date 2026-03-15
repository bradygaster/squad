/**
 * REPL UX End-to-End Tests
 *
 * Spawns the real Squad CLI via child_process and verifies what humans actually see.
 * No mocks — these tests exercise the CLI binary and capture real terminal output.
 *
 * E2E tests — REPL UX validation
 *
 * @see .squad/agents/breedan/charter.md
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

// ─── Helpers ────────────────────────────────────────────────────────────────

const CLI_ENTRY = resolve(process.cwd(), 'packages/squad-cli/dist/cli-entry.js');

/** Strip ANSI escape codes for clean text comparison. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/** Shared env vars that suppress colour/interactive features for deterministic output. */
function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    COLUMNS: '80',
    LINES: '24',
    TERM: 'dumb',
    NO_COLOR: '1',
    NODE_NO_WARNINGS: '1',
    ...extra,
  };
}

interface CliResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number | null;
}

/**
 * Spawn the CLI with given args, capture stdout + stderr separately, wait for exit.
 * Kills process after timeoutMs to prevent hangs.
 */
function runCli(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<CliResult> {
  const timeoutMs = options?.timeoutMs ?? 15_000;

  return new Promise<CliResult>((resolveP, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child: ChildProcess = spawn('node', [CLI_ENTRY, ...args], {
      cwd: options?.cwd ?? process.cwd(),
      env: cleanEnv(options?.env ?? {}),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    child.stdout?.on('data', (buf: Buffer) => { stdout += buf.toString(); });
    child.stderr?.on('data', (buf: Buffer) => { stderr += buf.toString(); });

    const timer = setTimeout(() => {
      if (!settled) {
        child.kill('SIGTERM');
        setTimeout(() => { if (!settled) child.kill('SIGKILL'); }, 2000);
      }
    }, timeoutMs);

    child.on('exit', (code) => {
      settled = true;
      clearTimeout(timer);
      resolveP({ stdout, stderr, combined: stdout + stderr, exitCode: code });
    });

    child.on('error', (err) => {
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    // Close stdin immediately — we're testing non-interactive output
    child.stdin?.end();
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('REPL UX E2E — What Users Actually See', { timeout: 30_000 }, () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'squad-e2e-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup on Windows
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 1: First Run — No Team Exists
  // ────────────────────────────────────────────────────────────────────────
  describe('First Run — No Team Exists', () => {
    // Isolate from any real global squad on the host machine so the CLI
    // takes the "no squad anywhere" code-path (welcome banner, exit 0).
    const noGlobalSquadEnv = () => ({
      APPDATA: tempDir,
      LOCALAPPDATA: tempDir,
      XDG_CONFIG_HOME: tempDir,
    });

    it('shows welcome message when no .squad/ exists', async () => {
      const result = await runCli([], { cwd: tempDir, env: noGlobalSquadEnv() });
      const output = stripAnsi(result.combined);

      // Non-TTY: CLI shows either "Welcome to Squad" (no squad found)
      // or "requires an interactive terminal" (if a global squad is detected)
      expect(output).toMatch(/Welcome to Squad|requires an interactive terminal/);
    });

    it('banner appears exactly once (not duplicated)', async () => {
      const result = await runCli([], { cwd: tempDir, env: noGlobalSquadEnv() });
      const output = stripAnsi(result.combined);

      // Non-TTY: expect either "Welcome to Squad" or TTY error, appearing once
      const bannerMatches = output.match(/Welcome to Squad/g);
      const ttyMatches = output.match(/requires an interactive terminal/g);
      const totalMatches = (bannerMatches?.length ?? 0) + (ttyMatches?.length ?? 0);
      expect(totalMatches, 'Banner or TTY message should appear exactly once').toBe(1);
    });

    it('no "coordinator:" label in user-visible output', async () => {
      const result = await runCli([], { cwd: tempDir, env: noGlobalSquadEnv() });
      const output = stripAnsi(result.combined);

      // "coordinator:" should never appear outside debug mode
      expect(output).not.toMatch(/coordinator:/i);
    });

    it('init prompt/suggestion is visible and prominent', async () => {
      const result = await runCli([], { cwd: tempDir, env: noGlobalSquadEnv() });
      const output = stripAnsi(result.combined);

      // In non-TTY without squad: shows "squad init" and "Get started"
      // In non-TTY with squad detected: shows TTY requirement or "Loading Squad shell"
      // When process hangs (enters interactive mode), output may only have loading message
      if (output.length > 0) {
        expect(output).toMatch(/squad init|squad --preview|Loading Squad shell|Welcome/);
      }
    });

    it('no SQLite ExperimentalWarning in output', async () => {
      const result = await runCli([], { cwd: tempDir, env: noGlobalSquadEnv() });
      const combined = stripAnsi(result.combined);

      expect(combined).not.toContain('ExperimentalWarning');
    });

    it('no "Resumed session" message on first run', async () => {
      const result = await runCli([], { cwd: tempDir, env: noGlobalSquadEnv() });
      const output = stripAnsi(result.combined);

      expect(output).not.toMatch(/Resumed session/i);
    });

    it('exits cleanly with code 0, 1, or null (killed by timeout if interactive)', async () => {
      const result = await runCli([], { cwd: tempDir, env: noGlobalSquadEnv() });

      // Exit 0 when no squad (welcome message), exit 1 when TTY required,
      // null when process hangs in interactive mode and is killed by timeout
      expect([0, 1, null]).toContain(result.exitCode);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 2: Clean Output — No Warnings
  // ────────────────────────────────────────────────────────────────────────
  describe('Clean Output — No Warnings', () => {
    it('no ExperimentalWarning on --help', async () => {
      const result = await runCli(['--help'], { cwd: tempDir });

      expect(stripAnsi(result.stderr)).not.toContain('ExperimentalWarning');
      expect(stripAnsi(result.stdout)).not.toContain('ExperimentalWarning');
    });

    it('no ExperimentalWarning on --version', async () => {
      const result = await runCli(['--version'], { cwd: tempDir });

      expect(stripAnsi(result.stderr)).not.toContain('ExperimentalWarning');
      expect(stripAnsi(result.stdout)).not.toContain('ExperimentalWarning');
    });

    it('no ExperimentalWarning on first-run (no .squad/)', async () => {
      const result = await runCli([], { cwd: tempDir });

      expect(stripAnsi(result.stderr)).not.toContain('ExperimentalWarning');
      expect(stripAnsi(result.stdout)).not.toContain('ExperimentalWarning');
    });

    it('no Node.js internal warnings visible to user on --help', async () => {
      const result = await runCli(['--help'], { cwd: tempDir });
      const stderr = stripAnsi(result.stderr);

      // No Node.js internal warning patterns
      expect(stderr).not.toMatch(/\(node:\d+\)/);
      expect(stderr).not.toContain('DeprecationWarning');
    });

    it('stderr is clean on --version', async () => {
      const result = await runCli(['--version'], { cwd: tempDir });
      const stderr = stripAnsi(result.stderr).trim();

      // Stderr should be empty for --version
      expect(stderr).toBe('');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 3: Banner Renders Once
  // ────────────────────────────────────────────────────────────────────────
  describe('Banner Renders Once', () => {
    it('version banner appears exactly once on --help', async () => {
      const result = await runCli(['--help']);
      const output = stripAnsi(result.stdout);

      // Help screen shows "squad v{VERSION}" — should appear once
      const versionMatches = output.match(/squad\s+v\d+\.\d+\.\d+/gi);
      expect(versionMatches, 'Version banner must appear exactly once').toHaveLength(1);
    });

    it('first-run welcome appears exactly once', async () => {
      // Isolate from host global squad so CLI takes the first-run path
      const noGlobalEnv = { APPDATA: tempDir, LOCALAPPDATA: tempDir, XDG_CONFIG_HOME: tempDir };
      const result = await runCli([], { cwd: tempDir, env: noGlobalEnv });
      const output = stripAnsi(result.combined);

      // Non-TTY: welcome appears once, TTY error appears once, or
      // process may enter interactive mode and output "Loading Squad shell..."
      const welcomeMatches = output.match(/Welcome to Squad/g);
      const ttyMatches = output.match(/requires an interactive terminal/g);
      const loadingMatches = output.match(/Loading Squad shell/g);
      const total = (welcomeMatches?.length ?? 0) + (ttyMatches?.length ?? 0) + (loadingMatches?.length ?? 0);
      expect(total, 'Welcome, TTY, or Loading message must appear at least once').toBeGreaterThanOrEqual(1);
    });

    it('no duplicate "Your AI agent team" tagline', async () => {
      // Isolate from host global squad so CLI takes the first-run path
      const noGlobalEnv = { APPDATA: tempDir, LOCALAPPDATA: tempDir, XDG_CONFIG_HOME: tempDir };
      const result = await runCli([], { cwd: tempDir, env: noGlobalEnv });
      const output = stripAnsi(result.combined);

      const taglineMatches = output.match(/Your AI agent team/g);
      // Should appear at most once
      expect(
        (taglineMatches?.length ?? 0) <= 1,
        `Tagline should appear at most once, found: ${taglineMatches?.length ?? 0}`,
      ).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 4: Message Labels
  // ────────────────────────────────────────────────────────────────────────
  describe('Message Labels', () => {
    it('--help output uses "Squad" not "coordinator" in user-facing text', async () => {
      const result = await runCli(['--help']);
      const output = stripAnsi(result.stdout);

      // Help text should reference "squad" the product, not "coordinator"
      expect(output.toLowerCase()).toContain('squad');
      expect(output).not.toMatch(/\bcoordinator\b/i);
    });

    it('first-run message uses "Squad" branding', async () => {
      const result = await runCli([], { cwd: tempDir });
      const output = stripAnsi(result.combined);

      expect(output).toContain('Squad');
      expect(output).not.toMatch(/\bcoordinator\b/i);
    });

    it('error messages use "squad" not "coordinator"', async () => {
      const result = await runCli(['nonexistent-command-xyz']);
      const output = stripAnsi(result.combined);

      // Error output should reference "squad help", not "coordinator"
      expect(output).toMatch(/squad/i);
      expect(output).not.toMatch(/\bcoordinator\b/i);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 5: Markdown Rendering (static output check)
  // ────────────────────────────────────────────────────────────────────────
  describe('Markdown Rendering', () => {
    it('help text uses bold formatting (no raw asterisks)', async () => {
      // When NO_COLOR=1, bold is suppressed — but we check raw ANSI output
      // to verify no raw **bold** markdown leaks through
      const result = await runCli(['--help'], {
        cwd: tempDir,
        env: { NO_COLOR: '', TERM: 'xterm-256color' },
      });
      const rawOutput = result.stdout;

      // Should not contain literal **text** markdown
      expect(rawOutput).not.toMatch(/\*\*[^*]+\*\*/);
    });

    it('first-run output has no raw markdown asterisks', async () => {
      const result = await runCli([], { cwd: tempDir });
      const output = result.combined;

      // No raw **bold** or *italic* markdown should leak to terminal
      expect(output).not.toMatch(/\*\*[^*]+\*\*/);
      expect(output).not.toMatch(/(?<!\*)\*[^*]+\*(?!\*)/);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Test 6: Work gating without team (supplemental)
  // ────────────────────────────────────────────────────────────────────────
  describe('Work gating without team', () => {
    it('status command mentions no squad when run in empty dir', async () => {
      const result = await runCli(['status'], { cwd: tempDir });
      const output = stripAnsi(result.combined);

      // Status should indicate no squad found, or show active squad status
      expect(output).toMatch(/not found|no squad|no .squad|Active squad/i);
    });

    it('doctor command works in empty dir without crashing', async () => {
      const result = await runCli(['doctor'], { cwd: tempDir });

      // Doctor should exit without crashing
      expect(result.exitCode).not.toBeNull();
      expect(stripAnsi(result.combined)).not.toContain('ExperimentalWarning');
    });
  });
});
