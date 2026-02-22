import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';

export interface CopilotProcessOptions {
  cliPath?: string;
  autoRestart?: boolean;
  restartDelay?: number;
  maxRestartAttempts?: number;
  gracefulShutdownTimeout?: number;
}

export class CopilotProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private running: boolean = false;
  private options: Required<CopilotProcessOptions>;
  private restartTimer: NodeJS.Timeout | null = null;
  private restartCount: number = 0;

  constructor(options: CopilotProcessOptions = {}) {
    super();
    this.options = {
      cliPath: options.cliPath || 'copilot',
      autoRestart: options.autoRestart ?? true,
      restartDelay: options.restartDelay ?? 3000,
      maxRestartAttempts: options.maxRestartAttempts ?? 5,
      gracefulShutdownTimeout: options.gracefulShutdownTimeout ?? 5000,
    };
  }

  start(manual: boolean = true): void {
    if (this.running) {
      console.warn('CopilotProcess: already running');
      return;
    }

    if (manual) {
      this.restartCount = 0;
    }

    try {
      this.process = spawn(this.options.cliPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true,
      });

      if (!this.process.stdin || !this.process.stdout || !this.process.stderr) {
        throw new Error('Failed to create stdio streams');
      }

      this.running = true;
      this.emit('started');

      // Set up readline interface for line-by-line stdout parsing
      this.rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      this.rl.on('line', (line: string) => {
        this.emit('line', line);
      });

      // Capture stderr for error reporting
      this.process.stderr.on('data', (data: Buffer) => {
        const errorText = data.toString();
        this.emit('error', errorText);
      });

      // Handle process exit
      this.process.on('exit', (code: number | null, signal: string | null) => {
        this.running = false;
        this.cleanup();
        this.emit('exit', code, signal);

        if (this.options.autoRestart && code !== 0) {
          this.restartCount++;
          if (this.restartCount > this.options.maxRestartAttempts) {
            console.log(`CopilotProcess: max restart attempts (${this.options.maxRestartAttempts}) reached, giving up`);
            this.emit('max-retries');
            return;
          }
          console.log(`CopilotProcess: crashed with code ${code}, restarting in ${this.options.restartDelay}ms (attempt ${this.restartCount}/${this.options.maxRestartAttempts})`);
          this.restartTimer = setTimeout(() => {
            this.start(false);
          }, this.options.restartDelay);
        }
      });

      this.process.on('error', (err: Error) => {
        this.emit('error', `Process error: ${err.message}`);
      });

    } catch (error: any) {
      this.running = false;
      const errorMsg = error.code === 'ENOENT' 
        ? `Copilot CLI not found at path: ${this.options.cliPath}. Please ensure it is installed.`
        : `Failed to start Copilot CLI: ${error.message}`;
      this.emit('error', errorMsg);
    }
  }

  send(text: string): void {
    if (!this.running || !this.process || !this.process.stdin) {
      console.warn('CopilotProcess: cannot send, process not running');
      return;
    }

    try {
      this.process.stdin.write(text + '\n');
    } catch (error: any) {
      this.emit('error', `Failed to write to stdin: ${error.message}`);
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.running || !this.process) {
        resolve();
        return;
      }

      // Clear any pending restart timer
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }

      // Try graceful shutdown first (SIGTERM)
      const timeout = setTimeout(() => {
        if (this.process) {
          console.log('CopilotProcess: graceful shutdown timeout, forcing SIGKILL');
          this.process.kill('SIGKILL');
        }
      }, this.options.gracefulShutdownTimeout);

      this.process.once('exit', () => {
        clearTimeout(timeout);
        this.running = false;
        this.cleanup();
        this.emit('stopped');
        resolve();
      });

      this.process.kill('SIGTERM');
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.start();
  }

  isRunning(): boolean {
    return this.running;
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.process = null;
  }
}
