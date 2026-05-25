import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createStateMcpSession } from '../../packages/squad-cli/src/cli/commands/state-mcp.js';
import { clearResolveSquadCache } from '../../packages/squad-sdk/src/resolution.js';

const TMP = join(process.cwd(), `.test-state-mcp-${randomBytes(4).toString('hex')}`);

type JsonRpcMessage = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

function git(args: string): string {
  return execSync(`git ${args}`, { cwd: TMP, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function initTwoLayerSquad(): void {
  mkdirSync(join(TMP, '.squad'), { recursive: true });
  writeFileSync(join(TMP, '.squad', 'config.json'), JSON.stringify({ stateBackend: 'two-layer' }, null, 2));
  writeFileSync(join(TMP, 'README.md'), '# state mcp test\n');
  git('init');
  git('config user.email "test@test.com"');
  git('config user.name "Test"');
  git('add .');
  git('commit -m "init"');
}

function resultAsRecord(message: JsonRpcMessage): Record<string, unknown> {
  expect(message.error).toBeUndefined();
  expect(message.result).toBeDefined();
  return message.result as Record<string, unknown>;
}

describe('state-mcp bridge', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    initTwoLayerSquad();
  });

  afterEach(() => {
    clearResolveSquadCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('lists Squad state tools for MCP clients', async () => {
    const messages: JsonRpcMessage[] = [];
    const session = createStateMcpSession(TMP, message => messages.push(message as JsonRpcMessage));

    await session.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    const tools = resultAsRecord(messages[0]!)['tools'] as Array<{ name: string; inputSchema: Record<string, unknown> }>;
    const names = tools.map(tool => tool.name);
    expect(names).toContain('squad_decide');
    expect(names).toContain('squad_state_write');
    expect(names).toContain('squad_state_append');
    expect(tools.find(tool => tool.name === 'squad_state_write')?.inputSchema.required).toEqual(['key', 'content']);
  });

  it('writes and reads two-layer state without mutating the worktree .squad files', async () => {
    const messages: JsonRpcMessage[] = [];
    const session = createStateMcpSession(TMP, message => messages.push(message as JsonRpcMessage));

    await session.handleRequest({
      jsonrpc: '2.0',
      id: 'write',
      method: 'tools/call',
      params: {
        name: 'squad_state_write',
        arguments: { key: 'decisions/inbox/mcp-proof.md', content: '# MCP proof\n' },
      },
    });
    await session.handleRequest({
      jsonrpc: '2.0',
      id: 'read',
      method: 'tools/call',
      params: {
        name: 'squad_state_read',
        arguments: { key: 'decisions/inbox/mcp-proof.md' },
      },
    });

    const writeResult = resultAsRecord(messages[0]!);
    const readResult = resultAsRecord(messages[1]!);
    expect(writeResult['isError']).not.toBe(true);
    expect(readResult['content']).toEqual([{ type: 'text', text: '# MCP proof\n' }]);
    expect(existsSync(join(TMP, '.squad', 'decisions', 'inbox', 'mcp-proof.md'))).toBe(false);
    expect(readFileSync(join(TMP, '.squad', 'config.json'), 'utf8')).toContain('two-layer');
  });
});
