/**
 * `squad memory` must open the same governed store as the squad_state memory.* tools.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createStateMcpToolRegistry } from '../packages/squad-cli/src/cli/commands/state-mcp.js';
import { runMemoryCommand } from '../packages/squad-cli/src/cli/commands/memory.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function squadRepo(config?: Record<string, unknown>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'squad-memory-store-')));
  roots.push(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'test');
  fs.mkdirSync(path.join(root, '.squad'));
  fs.writeFileSync(path.join(root, '.squad', 'team.md'), '# Team\n');
  if (config) fs.writeFileSync(path.join(root, '.squad', 'config.json'), `${JSON.stringify(config)}\n`);
  return root;
}

type ToolRegistry = ReturnType<typeof createStateMcpToolRegistry>;

/** The registry `squad state-mcp` serves, built by the same function. */
function stateMcpRegistry(startDir: string): ToolRegistry {
  return createStateMcpToolRegistry(startDir);
}

async function callTool(registry: ToolRegistry, name: string, args: Record<string, unknown>): Promise<string> {
  const tool = registry.getTools().find(candidate => candidate.name === name)!;
  const result = await tool.handler(args, { toolName: name, toolCallId: name, arguments: args, sessionId: 'mcp' }) as { textResultForLlm: string };
  return result.textResultForLlm;
}

async function cliJson(startDir: string, args: string[]): Promise<any> {
  const output: string[] = [];
  const originalLog = console.log;
  console.log = (value?: unknown) => { output.push(String(value)); };
  try {
    await runMemoryCommand(startDir, args);
  } finally {
    console.log = originalLog;
  }
  return JSON.parse(output.join('\n'));
}

describe('squad memory uses the squad_state store', () => {
  // Real git-backed orphan writes; each one is a commit on squad-state, which is slow on Windows.
  it('orphan backend: CLI and memory.* read and write the squad-state branch', { timeout: 30_000 }, async () => {
    const root = squadRepo({ version: 1, teamRoot: '.', stateBackend: 'orphan' });
    const registry = stateMcpRegistry(root);
    await callTool(registry, 'memory.write', { content: 'Use Vitest for SDK regression tests', class: 'DECISION', title: 'Vitest for SDK tests' });

    const results = await cliJson(root, ['search', '--query', 'Vitest']);
    expect(results.map((result: { title: string }) => result.title)).toContain('Vitest for SDK tests');

    await cliJson(root, ['write', '--content', 'Prefer pnpm over npm for installs', '--class', 'LOCAL']);
    expect(await callTool(registry, 'memory.search', { query: 'pnpm' })).toContain('Prefer pnpm');
    expect(fs.existsSync(path.join(root, '.squad', 'memory'))).toBe(false);
  });

  it('resolves from a subdirectory without creating a stray .squad', async () => {
    const root = squadRepo();
    const sub = path.join(root, 'packages', 'app');
    fs.mkdirSync(sub, { recursive: true });
    await callTool(stateMcpRegistry(sub), 'memory.write', { content: 'Use Vitest for SDK regression tests', class: 'DECISION' });

    expect(await cliJson(sub, ['search', '--query', 'Vitest'])).toHaveLength(1);
    expect(fs.existsSync(path.join(sub, '.squad'))).toBe(false);
  });

  it('fails clearly outside a squad instead of creating one', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'squad-memory-none-')));
    roots.push(root);
    git(root, 'init', '-q');
    await expect(runMemoryCommand(root, ['search', '--query', 'x'])).rejects.toThrow('No .squad directory found');
    expect(fs.existsSync(path.join(root, '.squad'))).toBe(false);
  });
});
