import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: TMP, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function initSquad(stateBackend: 'orphan' | 'two-layer'): void {
  process.env['GIT_AUTHOR_NAME'] = 'Test';
  process.env['GIT_AUTHOR_EMAIL'] = 'test';
  process.env['GIT_COMMITTER_NAME'] = 'Test';
  process.env['GIT_COMMITTER_EMAIL'] = 'test';
  mkdirSync(join(TMP, '.squad'), { recursive: true });
  writeFileSync(join(TMP, '.squad', 'config.json'), JSON.stringify({ stateBackend }, null, 2));
  writeFileSync(join(TMP, 'README.md'), '# state mcp test\n');
  git(['init']);
  git(['add', 'README.md', '.squad/config.json']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test', 'commit', '-m', 'init']);
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
  });

  afterEach(() => {
    clearResolveSquadCache();
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('reports the installed CLI package version during initialization', async () => {
    initSquad('two-layer');
    const messages: JsonRpcMessage[] = [];
    const session = createStateMcpSession(TMP, message => messages.push(message as JsonRpcMessage));
    const cliPackage = JSON.parse(
      readFileSync(join(process.cwd(), 'packages/squad-cli/package.json'), 'utf8'),
    ) as { version: string };

    await session.handleRequest({ jsonrpc: '2.0', id: 'initialize', method: 'initialize' });

    const result = resultAsRecord(messages[0]!);
    expect(result['serverInfo']).toEqual({
      name: 'squad-state',
      version: cliPackage.version,
    });
  });

  it('lists Squad state tools for MCP clients', async () => {
    initSquad('two-layer');
    const messages: JsonRpcMessage[] = [];
    const session = createStateMcpSession(TMP, message => messages.push(message as JsonRpcMessage));

    await session.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    const tools = resultAsRecord(messages[0]!)['tools'] as Array<{ name: string; inputSchema: Record<string, unknown> }>;
    const names = tools.map(tool => tool.name);
    expect(names).toContain('squad_decide');
    expect(names).toContain('squad_state_write');
    expect(names).toContain('squad_state_append');
    expect(names).toContain('squad_state_create_if_absent');
    expect(tools.find(tool => tool.name === 'squad_state_write')?.inputSchema.required).toEqual(['key', 'content']);
    expect(tools.find(tool => tool.name === 'squad_state_create_if_absent')?.inputSchema.required)
      .toEqual(['key', 'content']);
  });

  it.each(['orphan', 'two-layer'] as const)(
    'exposes squad_state_create_if_absent so exactly one caller creates a canonical key through the %s backend',
    async (stateBackend) => {
      initSquad(stateBackend);
      const messages: JsonRpcMessage[] = [];
      const session = createStateMcpSession(TMP, message => messages.push(message as JsonRpcMessage));
      const key = 'log/2026-08-29T00-00-00Z-retrospective.md';

      async function createIfAbsent(id: string, content: string): Promise<Record<string, unknown>> {
        const index = messages.length;
        await session.handleRequest({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: { name: 'squad_state_create_if_absent', arguments: { key, content } },
        });
        return resultAsRecord(messages[index]!);
      }

      const first = await createIfAbsent('create-1', '# Canonical retro\n');
      const second = await createIfAbsent('create-2', '# Duplicate retro\n');

      // Exactly one creator wins; the loser is surfaced as an MCP error result.
      expect(first['isError']).not.toBe(true);
      expect(second['isError']).toBe(true);
      const loserText = (second['content'] as Array<{ text: string }>)[0]!.text;
      expect(loserText).toMatch(/already exists/i);

      // The winner's content is preserved verbatim — never overwritten.
      const readIndex = messages.length;
      await session.handleRequest({
        jsonrpc: '2.0',
        id: 'read-canonical',
        method: 'tools/call',
        params: { name: 'squad_state_read', arguments: { key } },
      });
      expect(resultAsRecord(messages[readIndex]!)['content'])
        .toEqual([{ type: 'text', text: '# Canonical retro\n' }]);

      // Mutable state never leaks into the worktree for git-native backends.
      expect(existsSync(join(TMP, '.squad', 'log', '2026-08-29T00-00-00Z-retrospective.md'))).toBe(false);
    },
  );

  it('writes and reads two-layer state without mutating the worktree .squad files', async () => {
    initSquad('two-layer');
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

  it.each(['rai/audit-trail.md', 'fact-checker/audit-trail.md'])(
    'appends local audit evidence through MCP but rejects replacement and deletion: %s',
    async (key) => {
      mkdirSync(join(TMP, '.squad'), { recursive: true });
      writeFileSync(join(TMP, '.squad', 'config.json'), JSON.stringify({ stateBackend: 'local' }));
      const messages: JsonRpcMessage[] = [];
      const session = createStateMcpSession(TMP, message => messages.push(message as JsonRpcMessage));

      for (const [name, content, rejected] of [
        ['squad_state_append', 'first\n', false],
        ['squad_state_append', 'second\n', false],
        ['squad_state_write', 'replacement\n', true],
        ['squad_state_delete', '', true],
      ] as const) {
        await session.handleRequest({
          jsonrpc: '2.0',
          id: messages.length,
          method: 'tools/call',
          params: { name, arguments: { key, content } },
        });
        expect(resultAsRecord(messages[messages.length - 1]!)['isError']).toBe(rejected);
      }
      expect(readFileSync(join(TMP, '.squad', key), 'utf8')).toBe('first\nsecond\n');
    },
  );

  it.each(['orphan', 'two-layer'] as const)(
    'writes casting policy but rejects individual casting pair writes through the %s backend',
    async (stateBackend) => {
      initSquad(stateBackend);
      const messages: JsonRpcMessage[] = [];
      const session = createStateMcpSession(TMP, message => messages.push(message as JsonRpcMessage));
      const castingState = [
        ['casting/policy.json', '{"mode":"auto"}\n', false],
        ['casting/registry.json', '{"agents":{}}\n', true],
        ['casting/history.json', '{"events":[]}\n', true],
      ] as const;

      for (const [key, content, rejected] of castingState) {
        const writeIndex = messages.length;
        await session.handleRequest({
          jsonrpc: '2.0',
          id: `write-${key}`,
          method: 'tools/call',
          params: {
            name: 'squad_state_write',
            arguments: { key, content },
          },
        });
        expect(resultAsRecord(messages[writeIndex]!)['isError']).toBe(rejected);

        const readIndex = messages.length;
        await session.handleRequest({
          jsonrpc: '2.0',
          id: `read-${key}`,
          method: 'tools/call',
          params: {
            name: 'squad_state_read',
            arguments: { key },
          },
        });
        if (rejected) {
          expect(resultAsRecord(messages[readIndex]!)['isError']).toBe(true);
        } else {
          expect(resultAsRecord(messages[readIndex]!)['content']).toEqual([{ type: 'text', text: content }]);
        }
        expect(existsSync(join(TMP, '.squad', ...key.split('/')))).toBe(false);
      }

      expect(git(['status', '--porcelain'])).toBe('');
    },
    30_000,
  );

  it("writes linked-team decisions inside the team's .squad dir when teamRoot names the team repo (#2107)", async () => {
    const projectSquad = join(TMP, 'project', '.squad');
    const teamSquad = join(TMP, 'team', '.squad');
    mkdirSync(projectSquad, { recursive: true });
    mkdirSync(teamSquad, { recursive: true });
    writeFileSync(join(projectSquad, 'config.json'), JSON.stringify({ version: 1, teamRoot: '../team' }));
    writeFileSync(join(teamSquad, 'team.md'), '# Team\n');

    const messages: JsonRpcMessage[] = [];
    const session = createStateMcpSession(join(TMP, 'project'), message => messages.push(message as JsonRpcMessage));
    await session.handleRequest({
      jsonrpc: '2.0',
      id: 'decide',
      method: 'tools/call',
      params: {
        name: 'squad_decide',
        arguments: { author: 'test-agent', summary: 'Linked team decision', body: 'Written through state-mcp.' },
      },
    });

    expect(resultAsRecord(messages[0]!)['isError'], 'teamRoot=../team').not.toBe(true);
    const inbox = join(teamSquad, 'decisions', 'inbox');
    expect(existsSync(inbox) ? readdirSync(inbox).length : 0, `teamRoot=../team: no decision in ${inbox}`).toBeGreaterThan(0);
    expect(existsSync(join(TMP, 'team', 'decisions')), 'teamRoot=../team: decision written outside .squad').toBe(false);
  });
});
