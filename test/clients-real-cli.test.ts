import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-real-cli-'));
  run('git', ['init', '-q'], root);
  const squad = path.join(root, '.squad');
  fs.mkdirSync(squad);
  fs.writeFileSync(path.join(squad, 'team.md'), '| Name | Role | Charter | Status |\n|---|---|---|---|\n| Data | Expert | c | ok |\n');
  const results = installClients(['claude', 'opencode', 'kiro', 'codex', 'antigravity', 'cursor'], {
    root,
    mcp: { command: 'node', args: ['-e', '0'] },
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

  it.skipIf(!has(CODEX))('codex loads the project config (trusted) and sees the squad_state server', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const key = fs.realpathSync.native(root).replace(/\\/g, '\\\\');
    fs.writeFileSync(path.join(home, 'config.toml'), `[projects."${key}"]\ntrust_level = "trusted"\n`);
    try {
      const r = run(CODEX!, ['mcp', 'get', 'squad_state'], root, { ...process.env, CODEX_HOME: home });
      expect(r.stdout).toMatch(/enabled: true/);
      expect(r.stdout).toMatch(/transport: stdio/);
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