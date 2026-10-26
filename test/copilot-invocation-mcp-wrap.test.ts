/**
 * Tests for the centralized copilot invocation helper that injects
 * `--additional-mcp-config @<path>` so Copilot CLI loads a project's `.mcp.json`
 * when spawning non-interactive sessions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  buildAdditionalMcpConfigArgs,
  withAdditionalMcpConfig,
} from '../packages/squad-cli/src/cli/core/copilot-invocation.js';

describe('copilot-invocation: --additional-mcp-config wrapping', () => {
  let workdir: string;

  beforeEach(() => {
    workdir = path.join(tmpdir(), `squad-copilot-invocation-${randomBytes(4).toString('hex')}`);
    mkdirSync(workdir, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('returns no extra args when cmd is not `copilot`', () => {
    mkdirSync(path.join(workdir, '.copilot'), { recursive: true });
    writeFileSync(path.join(workdir, '.copilot', 'mcp-config.json'), '{}');
    const args = buildAdditionalMcpConfigArgs('claude', workdir);
    expect(args).toEqual([]);
  });

  it('returns no extra args when teamRoot is undefined', () => {
    const args = buildAdditionalMcpConfigArgs('copilot', undefined);
    expect(args).toEqual([]);
  });

  it('returns no extra args when the project mcp-config.json does not exist', () => {
    const args = buildAdditionalMcpConfigArgs('copilot', workdir);
    expect(args).toEqual([]);
  });

  it('returns `--additional-mcp-config @<absolute path>` when config exists', () => {
    const cfg = path.join(workdir, '.mcp.json');
    writeFileSync(cfg, '{"mcpServers":{}}');
    const args = buildAdditionalMcpConfigArgs('copilot', workdir);
    expect(args).toEqual(['--additional-mcp-config', `@${cfg}`]);
  });

  it('withAdditionalMcpConfig prepends the MCP config and preserves caller args', () => {
    const cfg = path.join(workdir, '.mcp.json');
    writeFileSync(cfg, '{}');
    const callerArgs = ['--deny-tool', 'shell(git push)', '-p', 'hi'];
    const result = withAdditionalMcpConfig('copilot', callerArgs, workdir);
    expect(result).toEqual(['--additional-mcp-config', `@${cfg}`, ...callerArgs]);
  });

  it('does not remove an explicitly supplied --yolo flag', () => {
    const cfg = path.join(workdir, '.mcp.json');
    writeFileSync(cfg, '{}');
    const result = withAdditionalMcpConfig('copilot', ['--yolo', '-p', 'hi'], workdir);
    expect(result).toEqual(['--additional-mcp-config', `@${cfg}`, '--yolo', '-p', 'hi']);
  });

  it('withAdditionalMcpConfig is a no-op when injection is not applicable', () => {
    const result = withAdditionalMcpConfig('copilot', ['-p', 'hi'], workdir);
    expect(result).toEqual(['-p', 'hi']);
  });
});
