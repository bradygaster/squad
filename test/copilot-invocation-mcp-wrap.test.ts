/**
 * Tests for the centralized copilot invocation helper that injects
 * `--additional-mcp-config @<path>` so that Copilot CLI 1.0.58 actually loads
 * a project's `.copilot/mcp-config.json` (it ignores that file by default).
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
    expect(args).toEqual(['--yolo', '--additional-mcp-config', `@${cfg}`]);
  });

  it('withAdditionalMcpConfig prepends the flag to user args when applicable', () => {
    const cfg = path.join(workdir, '.mcp.json');
    writeFileSync(cfg, '{}');
    const result = withAdditionalMcpConfig('copilot', ['-p', 'hi'], workdir);
    expect(result[0]).toBe('--yolo');
    expect(result[1]).toBe('--additional-mcp-config');
    expect(result[2]).toBe(`@${cfg}`);
    expect(result.slice(3)).toEqual(['-p', 'hi']);
  });

  it('withAdditionalMcpConfig is a no-op when injection is not applicable', () => {
    const result = withAdditionalMcpConfig('copilot', ['-p', 'hi'], workdir);
    expect(result).toEqual(['-p', 'hi']);
  });
});
