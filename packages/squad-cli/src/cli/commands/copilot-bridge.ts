/**
 * Squad Remote Control — Copilot ACP Bridge
 *
 * Spawns `copilot --acp --stdio` and relays JSON-RPC messages
 * between the WebSocket clients and the Copilot CLI process.
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolveExecutionConfig, ExecutionConfigError } from '../core/execution-config.js';
import { buildSandboxCommand } from './sandbox-command.js';

export interface CopilotBridgeConfig {
  cwd: string;
  agent?: string;
}

export class CopilotBridge {
  private child: ChildProcess | null = null;
  private messageCallback: ((line: string) => void) | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private sessionId: string | null = null;
  private initialized = false;

  constructor(private config: CopilotBridgeConfig) {}

  /** Check if copilot CLI supports ACP stdio mode */
  static async checkCompatibility(): Promise<{ compatible: boolean; version: string; message: string }> {
    try {
      const version = execSync('copilot --version', { encoding: 'utf-8', timeout: 5000 }).trim();
      const versionMatch = version.match(/(\d+\.\d+\.\d+[-\w]*)/);
      const ver = versionMatch?.[1] || 'unknown';

      // Test if --acp --stdio actually produces output
      const testResult = await new Promise<boolean>((resolve) => {
        const cp = spawn('copilot', ['--acp', '--stdio'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let gotOutput = false;

        cp.stdout?.on('data', () => { gotOutput = true; });

        // Send initialize and wait briefly
        setTimeout(() => {
          const msg = JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params: { protocolVersion: '2025-03-26', clientCapabilities: {}, clientInfo: { name: 'squad-rc-check', version: '1.0.0' } }
          });
          try { cp.stdin?.write(msg + '\n'); } catch { /* ignore */ }
        }, 2000);

        setTimeout(() => {
          cp.kill();
          resolve(gotOutput);
        }, 8000);

        cp.on('error', () => resolve(false));
      });

      if (testResult) {
        return { compatible: true, version: ver, message: `Copilot CLI ${ver} supports ACP stdio` };
      } else {
        return { compatible: false, version: ver, message: `Copilot CLI ${ver} found but ACP stdio not responding. Version 0.0.420+ may be required.` };
      }
    } catch {
      return { compatible: false, version: 'not found', message: 'Copilot CLI not installed. Run: npm install -g @github/copilot' };
    }
  }

  /** Set callback for messages from Copilot */
  onMessage(cb: (line: string) => void): void {
    this.messageCallback = cb;
  }

  /** Spawn copilot --acp --stdio */
  async start(): Promise<void> {
    const args = ['--acp', '--stdio'];
    if (this.config.agent) {
      args.push('--agent', this.config.agent);
    }

    let execution;
    try {
      execution = resolveExecutionConfig({
        envSandbox: process.env['SQUAD_SANDBOX'],
        envPermissionProfile: process.env['SQUAD_PERMISSION_PROFILE'],
      });
    } catch (err) {
      if (err instanceof ExecutionConfigError) {
        throw new Error(`${err.code}: ${err.message}`);
      }
      throw err;
    }

    const sandboxCommand = buildSandboxCommand({
      sandbox: execution.sandbox,
      sandboxFlags: process.env['SQUAD_SANDBOX_FLAGS'],
      permissionProfile: execution.permissionProfile,
      teamRoot: this.config.cwd,
      baseArgs: args,
    });

    this.child = spawn(sandboxCommand.cmd, sandboxCommand.args, {
      cwd: this.config.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Read NDJSON from stdout
    const rl = createInterface({
      input: this.child.stdout!,
      terminal: false,
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;

      // Check if it's a response to a pending request
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            pending.resolve(msg.result);
          }
          return;
        }
      } catch {
        // not JSON, forward anyway
      }

      // Forward to callback (notifications, session/update, etc.)
      if (this.messageCallback) {
        this.messageCallback(line);
      }
    });

    this.child.stderr?.on('data', (data: Buffer) => {
      // Log stderr but don't crash
      const text = data.toString().trim();
      if (text) {
        console.error(`  [copilot stderr] ${text}`);
      }
    });

    this.child.on('exit', (code) => {
      console.log(`  [copilot] exited with code ${code}`);
      this.child = null;
      this.initialized = false;
      this.sessionId = null;
    });

    // Initialize ACP session
    await this.initialize();
  }

  /** Send raw NDJSON line to copilot stdin */
  send(message: string): void {
    if (!this.child?.stdin?.writable) return;
    const payload = message.endsWith('\n') ? message : message + '\n';
    this.child.stdin.write(payload);
  }

  /** Send JSON-RPC request and wait for response */
  private sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.send(msg);

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  /** Initialize ACP protocol + create session */
  private async initialize(): Promise<void> {
    // Step 1: initialize
    await this.sendRequest('initialize', {
      protocolVersion: '2025-01-01',
      clientCapabilities: {},
      clientInfo: { name: 'squad-rc', version: '1.0.0' },
    });

    // Step 2: session/new
    const result = await this.sendRequest<{ sessionId: string }>('session/new', {
      cwd: this.config.cwd,
      mcpServers: [],
    });

    this.sessionId = result.sessionId;
    this.initialized = true;
  }

  /** Send a prompt to Copilot (response comes via notifications) */
  sendPrompt(text: string): void {
    if (!this.initialized || !this.sessionId) {
      console.error('  [copilot] Not initialized, cannot send prompt');
      return;
    }

    const id = ++this.requestId;
    // Don't await — response is streamed via notifications
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'session/prompt',
      params: {
        sessionId: this.sessionId,
        prompt: text,
      },
    });
    this.send(msg);
  }

  /** Stop the copilot process */
  stop(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.initialized = false;
    this.sessionId = null;
  }

  isRunning(): boolean {
    return this.child !== null && this.initialized;
  }
}
