import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { getSquadStateUserConfigKeys } from './mcp-root.js';

const storage = new FSStorageProvider();

export interface ConfiguredSquadStateMcp {
  command: string;
  args: string[];
  configPath: string;
  key: string;
  precedence: 'project' | 'user';
}

export interface SquadStateProbeResult {
  version: string;
  tools: string[];
  healthText: string;
  stderr: string;
}

export function resolveConfiguredSquadStateMcp(
  cwd: string,
  homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '',
): ConfiguredSquadStateMcp | undefined {
  const projectPath = path.join(cwd, '.mcp.json');
  const project = readConfigEntry(projectPath, 'squad_state');
  if (project) return { ...project, configPath: projectPath, key: 'squad_state', precedence: 'project' };

  if (!homeDir) return undefined;
  const userPath = path.join(homeDir, '.copilot', 'mcp-config.json');
  for (const key of getSquadStateUserConfigKeys(cwd)) {
    const user = readConfigEntry(userPath, key);
    if (user) return { ...user, configPath: userPath, key, precedence: 'user' };
  }
  return undefined;
}

function readConfigEntry(filePath: string, key: string): { command: string; args: string[] } | undefined {
  if (!storage.existsSync(filePath)) return undefined;
  try {
    const parsed = JSON.parse(storage.readSync(filePath) ?? '{}') as {
      mcpServers?: Record<string, { command?: unknown; args?: unknown }>;
    };
    const entry = parsed.mcpServers?.[key];
    if (
      !entry ||
      typeof entry.command !== 'string' ||
      !Array.isArray(entry.args) ||
      !entry.args.every(arg => typeof arg === 'string')
    ) {
      return undefined;
    }
    return { command: entry.command, args: entry.args as string[] };
  } catch {
    return undefined;
  }
}

export async function probeSquadStateBridge(
  cwd: string,
  spec: Pick<ConfiguredSquadStateMcp, 'command' | 'args'>,
  timeoutMs = 30_000,
): Promise<SquadStateProbeResult> {
  return await new Promise<SquadStateProbeResult>((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnForProbe(spec.command, spec.args, cwd);
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let stderr = '';
    let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let version = '';
    let tools: string[] = [];

    const finishError = (message: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.pid && child.exitCode === null) child.kill();
      reject(new Error(`${message}${stderr.trim() ? `\n${stderr.trim()}` : ''}`));
    };

    const finish = (healthText: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = { version, tools, healthText, stderr: stderr.trim() };
      const exitTimer = setTimeout(() => {
        if (child.pid && child.exitCode === null) child.kill();
      }, 1_000);
      const resolveAfterExit = (): void => {
        clearTimeout(exitTimer);
        resolve(result);
      };
      child.once('exit', resolveAfterExit);
      child.stdin.end();
      if (child.exitCode !== null) resolveAfterExit();
    };

    const handleMessage = (message: unknown): void => {
      if (!message || typeof message !== 'object') return;
      const record = message as Record<string, unknown>;
      if (record['id'] === 1) {
        const result = asRecord(record['result']);
        const serverInfo = asRecord(result['serverInfo']);
        version = typeof serverInfo['version'] === 'string' ? serverInfo['version'] : '';
        writeJson(child, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
        writeJson(child, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
      } else if (record['id'] === 2) {
        const result = asRecord(record['result']);
        const listed = Array.isArray(result['tools']) ? result['tools'] : [];
        tools = listed
          .map(tool => asRecord(tool)['name'])
          .filter((name): name is string => typeof name === 'string');
        if (!tools.includes('squad_state_health')) {
          finish('');
          return;
        }
        writeJson(child, {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'squad_state_health', arguments: {} },
        });
      } else if (record['id'] === 3) {
        const result = asRecord(record['result']);
        const content = Array.isArray(result['content']) ? result['content'] : [];
        const healthText = content
          .map(item => asRecord(item)['text'])
          .filter((text): text is string => typeof text === 'string')
          .join('\n');
        finish(healthText);
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      buffer = consumeMessages(buffer, handleMessage);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', error => finishError(`Could not start squad_state: ${error.message}`));
    child.on('exit', code => {
      if (!settled) finishError(`squad_state exited before completing the probe (exit ${code ?? 'unknown'})`);
    });

    const timer = setTimeout(() => finishError(`squad_state did not respond within ${timeoutMs}ms`), timeoutMs);
    writeJson(child, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'squad-doctor', version: '1' },
      },
    });
  });
}

function spawnForProbe(command: string, args: string[], cwd: string): ChildProcessWithoutNullStreams {
  if (
    process.platform === 'win32' &&
    (/\.(?:cmd|bat)$/i.test(command) || /^(?:npx|npm|pnpm|yarn)$/i.test(command))
  ) {
    const comspec = process.env.ComSpec ?? 'cmd.exe';
    const commandLine = [command, ...args].map(quoteWindowsArg).join(' ');
    return spawn(comspec, ['/d', '/s', '/c', commandLine], {
      cwd,
      detached: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
  return spawn(command, args, {
    cwd,
    detached: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function quoteWindowsArg(value: string): string {
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

function writeJson(child: ChildProcessWithoutNullStreams, message: unknown): void {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function consumeMessages(buffer: Buffer, onMessage: (message: unknown) => void): Buffer {
  while (buffer.length > 0) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd >= 0 && buffer.subarray(0, headerEnd).toString('utf8').toLowerCase().includes('content-length:')) {
      const header = buffer.subarray(0, headerEnd).toString('utf8');
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) return buffer;
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + length) return buffer;
      parseMessage(buffer.subarray(bodyStart, bodyStart + length).toString('utf8'), onMessage);
      buffer = buffer.subarray(bodyStart + length);
      continue;
    }

    const newline = buffer.indexOf(0x0a);
    if (newline < 0) return buffer;
    const line = buffer.subarray(0, newline).toString('utf8').trim();
    buffer = buffer.subarray(newline + 1);
    if (line) parseMessage(line, onMessage);
  }
  return buffer;
}

function parseMessage(text: string, onMessage: (message: unknown) => void): void {
  try {
    onMessage(JSON.parse(text));
  } catch {
    // Ignore non-protocol stdout and continue until the timeout.
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
