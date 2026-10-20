import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { installClients } from '../packages/squad-sdk/src/client/index.js';

vi.setConfig({ testTimeout: 120_000 });

// Real-binary checks: opt in with SQUAD_REAL_CLI_TESTS=1; each block is also skipped when the CLI is not on PATH.
const ENABLED = process.env['SQUAD_REAL_CLI_TESTS'] === '1';

/** First PATH entry that holds `cmd` (with PATHEXT on Windows); never probes hardcoded install dirs. */
function which(cmd: string): string | undefined {
  const exts = process.platform === 'win32' ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext.toLowerCase());
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  }
  return undefined;
}

function run(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  // .cmd/.bat shims cannot be spawned directly without a shell; route them through cmd.exe explicitly.
  const viaCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  const file = viaCmd ? (process.env['ComSpec'] ?? 'cmd.exe') : bin;
  const argv = viaCmd ? ['/d', '/s', '/c', [bin, ...args].map((a) => `"${a}"`).join(' ')] : args;
  return spawnSync(file, argv, { cwd, env, encoding: 'utf8', shell: false, timeout: 120_000, windowsVerbatimArguments: viaCmd });
}
const bin = (cmd: string) => (ENABLED ? which(cmd) : undefined);
const has = (b: string | undefined) => !!b && run(b, ['--version'], os.tmpdir()).status === 0;

const CLAUDE = bin('claude');
const OPENCODE = bin('opencode');
const KIRO = bin('kiro-cli');
const CODEX = bin('codex');
const AGY = bin('agy');
const CURSOR = bin('cursor-agent');

const MCP_STDIO_STUB =
  'process.stdin.on("data",d=>{for(const l of String(d).split(/\\r?\\n/).filter(Boolean)){try{const j=JSON.parse(l);if(j.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:j.id,result:{protocolVersion:"2024-11-05",capabilities:{tools:{}},serverInfo:{name:"squad_state",version:"1.0.0"},tools:[]}})+"\\n")}catch{}}})';

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-real-cli-'));
  run('git', ['init', '-q'], root);
  const squad = path.join(root, '.squad');
  fs.mkdirSync(squad);
  fs.writeFileSync(path.join(squad, 'team.md'), '| Name | Role | Charter | Status |\n|---|---|---|---|\n| Data | Expert | c | ok |\n');
  const results = installClients(['claude', 'opencode', 'kiro', 'codex', 'antigravity', 'cursor'], {
    root,
    mcp: { command: 'node', args: ['-e', MCP_STDIO_STUB] },
  });
  expect(results.filter((r) => r.action === 'error')).toEqual([]);
});
afterAll(() => {
  // real CLIs (e.g. opencode's background server) can still hold the cwd on Windows: retry, then ignore
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // best-effort cleanup of an OS temp dir
  }
});

describe.skipIf(!ENABLED)('real CLIs load Squad projections', () => {
  it.skipIf(!has(CLAUDE))('claude discovers the squad subagents and parses .mcp.json', () => {
    const agents = run(CLAUDE!, ['-p', '--agent', 'nonexistent-zzz', 'hi'], root);
    const text = `${agents.stdout}${agents.stderr}`;
    expect(text).toMatch(/Available agents:.*\bsquad\b/);
    const mcp = run(CLAUDE!, ['mcp', 'get', 'squad_state'], root);
    expect(mcp.stdout).toMatch(/Type: stdio/);
  });

  it.skipIf(!has(OPENCODE))('opencode loads squad as a primary agent and connects the MCP server', () => {
    const list = run(OPENCODE!, ['agent', 'list'], root);
    expect(list.stdout).toMatch(/^squad \(primary\)/m);
    const cfg = run(OPENCODE!, ['debug', 'config'], root);
    expect(JSON.parse(cfg.stdout).agent.squad.mode).toBe('primary');
  });

  it.skipIf(!has(KIRO))('kiro validates and lists the squad agent', () => {
    const v = run(KIRO!, ['agent', 'validate', '--path', path.join('.kiro', 'agents', 'squad.json')], root);
    expect(v.status).toBe(0);
    expect(`${v.stdout}${v.stderr}`).not.toMatch(/invalid/i);
    const list = run(KIRO!, ['agent', 'list'], root);
    const out = `${list.stdout}${list.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
    expect(out).toMatch(/squad\s+Workspace/);
  });

  it.skipIf(!has(CODEX))('codex loads the project config (trusted), sees squad_state MCP, discovers the squad TOML role, and activates coordinator instructions on spawn', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const key = fs.realpathSync.native(root).replace(/\\/g, '\\\\');
    fs.writeFileSync(path.join(home, 'config.toml'), `[projects."${key}"]\ntrust_level = "trusted"\n`);
    try {
      const r = run(CODEX!, ['mcp', 'get', 'squad_state'], root, { ...process.env, CODEX_HOME: home });
      expect(r.stdout).toMatch(/enabled: true/);
      expect(r.stdout).toMatch(/transport: stdio/);

      // Verify Codex discovers .codex/agents/squad.toml as a custom role (without hijacking the root session)
      // and activates its developer_instructions when `spawn_agent` spawns `agent_type: "squad"`.
      const turns: Array<{ hasRole: boolean; hasCoordinatorPrompt: boolean }> = [];
      let turnCount = 0;
      const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          turnCount++;
          turns.push({
            hasRole: body.includes('Available roles:\\nsquad:'),
            hasCoordinatorPrompt: body.includes('## Dispatch adapter: OpenAI Codex'),
          });
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          if (turnCount === 1) {
            const callItem = {
              id: 'fc_1',
              type: 'function_call',
              call_id: 'call_1',
              name: 'spawn_agent',
              namespace: 'multi_agent_v1',
              arguments: JSON.stringify({ agent_type: 'squad', message: 'route task' }),
            };
            res.end(
              [
                'data: {"type":"response.created","response":{"id":"r1"}}',
                `data: ${JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: callItem })}`,
                `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: callItem })}`,
                `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'r1', output: [callItem] } })}`,
                '',
              ].join('\n\n'),
            );
          } else if (turnCount === 2 && !body.includes('## Dispatch adapter: OpenAI Codex')) {
            const agentIdMatch = /\\"agent_id\\":\\"([^\\"]+)\\"/.exec(body);
            const waitItem = {
              id: 'fc_2',
              type: 'function_call',
              call_id: 'call_2',
              name: 'wait_agent',
              namespace: 'multi_agent_v1',
              arguments: JSON.stringify({
                targets: agentIdMatch ? [agentIdMatch[1]!] : [],
                timeout_ms: 10000,
              }),
            };
            res.end(
              [
                'data: {"type":"response.created","response":{"id":"r2"}}',
                `data: ${JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: waitItem })}`,
                `data: ${JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: waitItem })}`,
                `data: ${JSON.stringify({ type: 'response.completed', response: { id: 'r2', output: [waitItem] } })}`,
                '',
              ].join('\n\n'),
            );
          } else {
            res.end(
              `data: {"type":"response.created","response":{"id":"r${turnCount}"}}\n\ndata: {"type":"response.completed","response":{"id":"r${turnCount}","output":[]}}\n\n`,
            );
          }
        });
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      try {
        const addr = server.address() as { port: number };
        const viaCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(CODEX!);
        const file = viaCmd ? (process.env['ComSpec'] ?? 'cmd.exe') : CODEX!;
        const codexArgs = [
          'exec',
          '--skip-git-repo-check',
          '-m',
          'gpt-4.1',
          '-c',
          'mcp_servers.squad_state.enabled=false',
          '-c',
          `model_providers.mock={ name = "mock", base_url = "http://127.0.0.1:${addr.port}/v1", wire_api = "responses" }`,
          '-c',
          'model_provider="mock"',
          'hello',
        ];
        const argv = viaCmd ? ['/d', '/s', '/c', [CODEX!, ...codexArgs].map((a) => `"${a}"`).join(' ')] : codexArgs;
        await new Promise<void>((resolve, reject) => {
          const child = spawn(file, argv, {
            cwd: root,
            env: { ...process.env, CODEX_HOME: home },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsVerbatimArguments: viaCmd,
          });
          child.on('error', reject);
          child.on('close', () => resolve());
        });
      } finally {
        server.close();
      }
      expect(turns[0]?.hasRole).toBe(true);
      expect(turns[0]?.hasCoordinatorPrompt).toBe(false);
      expect(turns.some((t) => t.hasCoordinatorPrompt)).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it.skipIf(!has(AGY))('antigravity discovers the squad agent', () => {
    const r = run(AGY!, ['--agent', 'nonexistent-zzz', '-p', 'hi'], root);
    expect(`${r.stdout}${r.stderr}`).toMatch(/available:.*\bsquad\b/);
  });

  it.skipIf(!has(CURSOR))('cursor-agent lists the squad_state server from .cursor/mcp.json (read-only)', () => {
    const list = run(CURSOR!, ['mcp', 'list'], root);
    expect(`${list.stdout}${list.stderr}`).toMatch(/squad_state/);
  });
});