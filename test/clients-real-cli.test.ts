import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installClients } from '../packages/squad-sdk/src/clients/index.js';

vi.setConfig({ testTimeout: 120_000 });

// Real-binary checks: each block is skipped when the CLI is not installed.
const KIRO_DIR = path.join(process.env['LOCALAPPDATA'] ?? '', 'Kiro-Cli');
const withKiro = { ...process.env, PATH: `${process.env['PATH']}${path.delimiter}${KIRO_DIR}` };

function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  return spawnSync(cmd, args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000 });
}
const CODEX = path.join(process.env['ProgramData'] ?? '', 'global-npm', 'node_modules', '@openai', 'codex', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
const hasCodex = fs.existsSync(CODEX);
const has = (cmd: string, env: NodeJS.ProcessEnv = process.env) => run(cmd, ['--version'], os.tmpdir(), env).status === 0;

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

describe('real CLIs load Squad projections', () => {
  it.skipIf(!has('claude'))('claude discovers the squad subagents and parses .mcp.json', () => {
    const agents = run('claude', ['-p', '--agent', 'nonexistent-zzz', 'hi'], root);
    const text = `${agents.stdout}${agents.stderr}`;
    expect(text).toMatch(/Available agents:.*\bsquad\b/);
    const mcp = run('claude', ['mcp', 'get', 'squad_state'], root);
    expect(mcp.stdout).toMatch(/Type: stdio/);
  });

  it.skipIf(!has('opencode'))('opencode loads squad as a primary agent and connects the MCP server', () => {
    const list = run('opencode', ['agent', 'list'], root);
    expect(list.stdout).toMatch(/^squad \(primary\)/m);
    const cfg = run('opencode', ['debug', 'config'], root);
    expect(JSON.parse(cfg.stdout).agent.squad.mode).toBe('primary');
  });

  it.skipIf(!has('kiro-cli', withKiro))('kiro validates and lists the squad agent', () => {
    const v = run('kiro-cli', ['agent', 'validate', '--path', path.join('.kiro', 'agents', 'squad.json')], root, withKiro);
    expect(v.status).toBe(0);
    expect(`${v.stdout}${v.stderr}`).not.toMatch(/invalid/i);
    const list = run('kiro-cli', ['agent', 'list'], root, withKiro);
    const out = `${list.stdout}${list.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
    expect(out).toMatch(/squad\s+Workspace/);
  });
  it.skipIf(!hasCodex)('codex loads the project config (trusted) and sees the squad_state server', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    const key = fs.realpathSync.native(root).replace(/\\/g, '\\\\');
    fs.writeFileSync(path.join(home, 'config.toml'), `[projects."${key}"]\ntrust_level = "trusted"\n`);
    try {
      const r = run(`"${CODEX}"`, ['mcp', 'get', 'squad_state'], root, { ...process.env, CODEX_HOME: home });
      expect(r.stdout).toMatch(/enabled: true/);
      expect(r.stdout).toMatch(/transport: stdio/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it.skipIf(!has('agy'))('antigravity discovers the squad agent', () => {
    const r = run('agy', ['--agent', 'nonexistent-zzz', '-p', 'hi'], root);
    expect(`${r.stdout}${r.stderr}`).toMatch(/available:.*\bsquad\b/);
  });

  it.skipIf(!has('cursor-agent'))('cursor-agent loads .cursor/mcp.json and starts the squad_state server', () => {
    run('cursor-agent', ['mcp', 'enable', 'squad_state'], root);
    const list = run('cursor-agent', ['mcp', 'list'], root);
    expect(`${list.stdout}${list.stderr}`).toMatch(/squad_state/);
  });
});
