/**
 * Squad Remote Control — CLI Command
 *
 * `squad rc` or `squad remote-control`
 * Starts the RemoteBridge, creates a devtunnel, shows QR code.
 */

import path from 'node:path';
// createReadStream retained — streaming not in StorageProvider scope
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FSStorageProvider, RemoteBridge } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
import type { RemoteBridgeConfig } from '@bradygaster/squad-sdk';
import {
  isDevtunnelAvailable,
  createTunnel,
  destroyTunnel,
  getMachineId,
  getGitInfo,
} from './rc-tunnel.js';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

export interface RCOptions {
  tunnel: boolean;
  port: number;
  path?: string;
}

export async function runRC(cwd: string, options: RCOptions): Promise<void> {
  const { repo, branch } = getGitInfo(cwd);
  const machine = getMachineId();

  // Resolve squad directory
  const squadDir = storage.existsSync(path.join(cwd, '.squad'))
    ? path.join(cwd, '.squad')
    : storage.existsSync(path.join(cwd, '.ai-team'))
      ? path.join(cwd, '.ai-team')
      : '';

  console.log(`\n${BOLD}🎮 Squad Remote Control${RESET}\n`);
  console.log(`  ${DIM}Repo:${RESET}    ${repo}`);
  console.log(`  ${DIM}Branch:${RESET}  ${branch}`);
  console.log(`  ${DIM}Machine:${RESET} ${machine}`);
  console.log(`  ${DIM}Squad:${RESET}   ${squadDir || 'not found'}\n`);

  // Load team roster if squad dir exists
  const agents: Array<{name: string; role: string}> = [];
  if (squadDir) {
    try {
      const teamMd = storage.readSync(path.join(squadDir, 'team.md')) ?? '';
      const memberLines = teamMd.split('\n').filter(l => l.startsWith('|') && l.includes('Active'));
      for (const line of memberLines) {
        const cols = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cols.length >= 2 && cols[0] !== 'Name') {
          agents.push({ name: cols[0]!, role: cols[1]! });
        }
      }
      console.log(`  ${GREEN}✓${RESET} Loaded ${agents.length} agents from team.md\n`);
    } catch {
      console.log(`  ${YELLOW}⚠${RESET} Could not read team.md\n`);
    }
  }

  // Copilot passthrough will be set up after bridge starts
  const { spawn: spawnChild } = await import('node:child_process');
  const { createInterface: createRL } = await import('node:readline');
  let copilotReady = false;

  // Create bridge config (fallback when passthrough is NOT active)
  const config: RemoteBridgeConfig = {
    port: options.port || 0,
    maxHistory: 500,
    repo,
    branch,
    machine,
    squadDir,
    onPrompt: async (text) => {
      console.log(`  ${CYAN}←${RESET} ${DIM}Remote prompt:${RESET} ${text}`);
      bridge.addMessage('user', text);
      const agent = agents.length > 0 ? agents[0]! : { name: 'Assistant', role: 'General' };
      bridge.addMessage('agent', `[Copilot passthrough not active] Echo: ${text}`, agent.name);
    },
    onDirectMessage: async (agentName, text) => {
      console.log(`  ${CYAN}←${RESET} ${DIM}Remote @${agentName}:${RESET} ${text}`);
      bridge.addMessage('user', `@${agentName} ${text}`);
      bridge.addMessage('agent', `[Copilot passthrough not active] Echo: ${text}`, agentName);
    },
    onCommand: (name) => {
      console.log(`  ${CYAN}←${RESET} ${DIM}Remote /${name}${RESET}`);
      if (name === 'status') {
        bridge.addMessage('system', `Squad RC | Repo: ${repo} | Branch: ${branch} | Agents: ${agents.length} | Copilot: ${copilotReady ? 'passthrough' : 'off'} | Connections: ${bridge.getConnectionCount()}`);
      } else if (name === 'agents') {
        const list = agents.map(a => `• ${a.name} (${a.role})`).join('\n');
        bridge.addMessage('system', `Team Roster:\n${list || 'No agents loaded'}`);
      } else {
        bridge.addMessage('system', `Unknown command: /${name}`);
      }
    },
  };

  // Start bridge
  const bridge = new RemoteBridge(config);

  // Serve PWA static files
  bridge.setStaticHandler((req, res) => {
    const uiDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../remote-ui'
    );

    // #18: Guard against malformed URI encoding
    let decodedUrl: string;
    try {
      const parsed = new URL(req.url || '/', `http://${req.headers.host}`);
      decodedUrl = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400); res.end(); return;
    }
    if (decodedUrl.includes('..')) { res.writeHead(400); res.end(); return; }

    let filePath = path.join(uiDir, decodedUrl === '/' ? 'index.html' : decodedUrl.replace(/^\//, ''));

    // Security: prevent directory traversal
    if (!filePath.startsWith(uiDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // #2: EISDIR guard — check if path is a directory before createReadStream
    try {
      const stat = storage.statSync(filePath);
      if (stat?.isDirectory) {
        filePath = path.join(filePath, 'index.html');
        if (!storage.existsSync(filePath)) { res.writeHead(404); res.end(); return; }
      } else if (!stat) { res.writeHead(404); res.end(); return; }
    } catch { res.writeHead(404); res.end(); return; }

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };

    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    // #8: Handle createReadStream errors
    const stream = createReadStream(filePath);
    stream.on('error', () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
    stream.pipe(res);
  });

  const actualPort = await bridge.start();
  const localUrl = `http://localhost:${actualPort}`;

  // Initialize agent roster in bridge
  const allAgents = copilotReady
    ? [{ name: 'Copilot', role: 'AI Assistant', status: 'idle' as const }, ...agents.map(a => ({ name: a.name, role: a.role, status: 'idle' as const }))]
    : agents.map(a => ({ name: a.name, role: a.role, status: 'idle' as const }));
  if (allAgents.length > 0) {
    bridge.updateAgents(allAgents);
  }

  console.log(`  ${GREEN}✓${RESET} Bridge running on port ${BOLD}${actualPort}${RESET}`);
  console.log(`  ${DIM}Local:${RESET}   ${localUrl}\n`);

  // Spawn copilot --acp as transparent relay (dumb pipe)
  // Copilot needs ~20s to load MCP servers before accepting ACP requests
  // Try to find copilot in common locations, fall back to PATH
  let copilotCmd = 'copilot';
  
  // On Windows, try the global npm location first
  if (process.platform === 'win32') {
    const winPath = path.join(
      'C:', 'ProgramData', 'global-npm', 'node_modules', '@github', 'copilot',
      'node_modules', '@github', 'copilot-win32-x64', 'copilot.exe'
    );
    if (storage.existsSync(winPath)) {
      copilotCmd = winPath;
    }
  }

  console.log(`  ${DIM}Spawning copilot --acp (MCP servers loading ~15-20s)...${RESET}`);
  let copilotProc: ReturnType<typeof spawnChild> | null = null;
  try {
    copilotProc = spawnChild(copilotCmd, ['--acp'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    copilotProc.on('error', (err) => {
      console.log(`  ${YELLOW}⚠${RESET} Copilot error: ${err.message}`);
    });
    copilotProc.on('exit', (code) => {
      console.log(`  ${DIM}[copilot] exited with code ${code}${RESET}`);
      copilotReady = false;
    });
    copilotProc.stderr?.on('data', (d: Buffer) => {
      const text = d.toString().trim();
      if (text && !text.includes('[mcp server') && !text.includes('npm ')) {
        console.log(`  ${DIM}[copilot] ${text}${RESET}`);
      }
    });

    // copilot stdout → all WebSocket clients (raw JSON-RPC)
    const rl = createRL({ input: copilotProc.stdout!, terminal: false });
    rl.on('line', (line) => {
      if (line.trim()) {
        console.log(`  ${GREEN}→${RESET} ${DIM}ACP out: ${line.substring(0, 100)}${RESET}`);
        bridge.passthroughFromAgent(line);
      }
    });

    // WebSocket → copilot stdin (raw JSON-RPC)
    bridge.setPassthrough((msg) => {
      if (copilotProc?.stdin?.writable) {
        console.log(`  ${CYAN}←${RESET} ${DIM}ACP in: ${msg.substring(0, 100)}${RESET}`);
        copilotProc.stdin.write(msg.endsWith('\n') ? msg : msg + '\n');
      }
    });

    copilotReady = true;
    console.log(`  ${GREEN}✓${RESET} Copilot ACP passthrough active\n`);
  } catch (err) {
    console.log(`  ${YELLOW}⚠${RESET} Copilot not available: ${(err as Error).message}\n`);
  }

  // Tunnel setup
  if (options.tunnel) {
    if (!isDevtunnelAvailable()) {
      console.log(`  ${YELLOW}⚠${RESET} devtunnel CLI not found. Install with:`);
      console.log(`    winget install Microsoft.devtunnel`);
      console.log(`    ${DIM}Then: devtunnel user login${RESET}\n`);
      console.log(`  ${DIM}Running in local-only mode.${RESET}\n`);
    } else {
      console.log(`  ${DIM}Creating tunnel...${RESET}`);
      try {
        const tunnel = await createTunnel(actualPort, { repo, branch, machine });
        console.log(`  ${GREEN}✓${RESET} Tunnel active: ${BOLD}${tunnel.url}${RESET}\n`);

        // Show QR code
        try {
          // @ts-ignore - no type declarations for qrcode-terminal
          const qrcode = (await import('qrcode-terminal')) as any;
          qrcode.default.generate(tunnel.url, { small: true }, (code: string) => {
            console.log(code);
          });
        } catch {
          // qrcode-terminal not available, skip
        }

        console.log(`  ${DIM}Scan QR code or open URL on your phone.${RESET}`);
        console.log(`  ${DIM}Auth: private — only your MS/GitHub account can connect.${RESET}\n`);
      } catch (err) {
        console.log(`  ${YELLOW}⚠${RESET} Tunnel failed: ${(err as Error).message}`);
        console.log(`  ${DIM}Running in local-only mode.${RESET}\n`);
      }
    }
  } else {
    console.log(`  ${DIM}No tunnel (local only). Use --tunnel for remote access.${RESET}\n`);
  }

  console.log(`  ${DIM}Press Ctrl+C to stop.${RESET}\n`);

  // Clean shutdown
  const cleanup = async () => {
    console.log(`\n  ${DIM}Shutting down...${RESET}`);
    clearInterval(checkInterval);
    copilotProc?.kill();
    destroyTunnel();
    await bridge.stop();
    console.log(`  ${GREEN}✓${RESET} Stopped.\n`);
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Log connections
  const checkInterval = setInterval(() => {
    const count = bridge.getConnectionCount();
    if (count > 0) {
      process.stdout.write(`\r  ${GREEN}●${RESET} ${count} client(s) connected    `);
    }
  }, 5000);

  // Keep process alive
  await new Promise(() => {});
}
