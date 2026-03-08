import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';

/**
 * Terminal harness for E2E testing the Squad CLI.
 * Uses child_process.spawn with pipes as a pragmatic cross-platform solution.
 */
export class TerminalHarness extends EventEmitter {
  private process: ChildProcess | null = null;
  private outputBuffer = '';
  private exitCode: number | null = null;
  private closed = false;

  private constructor(
    private readonly command: string,
    private readonly args: string[],
    private readonly options: { cols?: number; rows?: number; env?: Record<string, string>; cwd?: string }
  ) {
    super();
  }

  /**
   * Spawn CLI with specific arguments (for non-interactive commands).
   */
  static async spawnWithArgs(
    args: string[],
    options?: { cols?: number; rows?: number; env?: Record<string, string>; cwd?: string }
  ): Promise<TerminalHarness> {
    const cols = options?.cols ?? 80;
    const rows = options?.rows ?? 24;
    const env = {
      ...process.env,
      COLUMNS: String(cols),
      LINES: String(rows),
      TERM: 'dumb',
      NO_COLOR: '1',
      // Suppress Node.js ExperimentalWarning (e.g. SQLite) — the CLI sets
      // NODE_NO_WARNINGS at runtime, but ESM import hoisting defeats it.
      NODE_NO_WARNINGS: '1',
      ...options?.env,
    };

    const cliEntry = resolve(process.cwd(), 'packages/squad-cli/dist/cli-entry.js');

    const harness = new TerminalHarness(
      'node',
      [cliEntry, ...args],
      { cols, rows, env, cwd: options?.cwd }
    );

    await harness.start();
    return harness;
  }

  private async start(): Promise<void> {
    this.process = spawn(this.command, this.args, {
      cwd: this.options.cwd || process.cwd(),
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.outputBuffer += text;
      this.emit('data', text);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      this.outputBuffer += text;
      this.emit('data', text);
    });

    this.process.on('exit', (code) => {
      this.exitCode = code ?? 0;
      this.emit('exit', code);
    });

    this.process.on('error', (err) => {
      this.emit('error', err);
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  /**
   * Wait for specific text or regex to appear in output, with timeout.
   */
  async waitForText(pattern: string | RegExp, timeoutMs = 10000): Promise<string> {
    const startTime = Date.now();
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;

    while (Date.now() - startTime < timeoutMs) {
      if (regex.test(this.outputBuffer)) {
        return this.outputBuffer;
      }
      if (this.exitCode !== null) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error(
      `Timeout waiting for pattern: ${pattern}\nCurrent output:\n${this.outputBuffer}`
    );
  }

  /**
   * Wait for process to exit with optional timeout.
   */
  async waitForExit(timeoutMs = 15000): Promise<number> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.exitCode !== null) {
        return this.exitCode;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('Timeout waiting for process to exit');
  }

  /**
   * Capture current terminal frame (ANSI-stripped).
   */
  captureFrame(): string {
    return this.stripAnsi(this.outputBuffer);
  }

  /**
   * Get all accumulated output.
   */
  getOutput(): string {
    return this.outputBuffer;
  }

  /**
   * Get exit code (null if still running).
   */
  getExitCode(): number | null {
    return this.exitCode;
  }

  /**
   * Close/kill the process.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    if (this.process) {
      this.process.kill('SIGTERM');

      const killTimeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 2000);

      await new Promise<void>((resolve) => {
        if (this.exitCode !== null) {
          clearTimeout(killTimeout);
          resolve();
          return;
        }
        this.once('exit', () => {
          clearTimeout(killTimeout);
          resolve();
        });
      });
    }
  }

  private stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }
}
