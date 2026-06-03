/**
 * Phase 2 coverage for the .copilot/mcp-config.json → .mcp.json migration
 * helper. Exercises the SDK helper directly against real tempdirs (it uses
 * raw node:fs, so an in-memory storage provider would not exercise the
 * atomic temp+rename path).
 *
 * Locks in:
 *  1. No-legacy → no-op + no .mcp.json created
 *  2. Legacy present, no .mcp.json → migrated + file written
 *  3. Both present, disjoint servers → both kept
 *  4. Both present, equivalent entries → skipped (no conflict)
 *  5. Both present, conflicting entries → .mcp.json wins, warning emitted
 *  6. Malformed .mcp.json → refuses to overwrite, returns malformed-target
 *  7. Idempotence: a second run is a no-op
 *  8. ensureMcpServerPinned with createIfMissing:false on absent file → absent
 *  9. ensureMcpServerPinned updates a stale pin in an existing file
 * 10. atomicWriteJson leaves no .tmp leftovers on success
 *
 * @module test/upgrade-mcp-merge
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  migrateMcpConfig,
  ensureMcpServerPinned,
  atomicWriteJson,
} from '@bradygaster/squad-sdk';

function makeRepo(): string {
  return mkdtempSync(join(tmpdir(), 'squad-mcp-merge-'));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('migrateMcpConfig', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('no-op when neither file exists', () => {
    const result = migrateMcpConfig(repo);
    expect(result.status).toBe('no-legacy');
    expect(result.migrated).toBe(0);
    expect(existsSync(join(repo, '.mcp.json'))).toBe(false);
  });

  it('migrates legacy servers into a new .mcp.json', () => {
    writeJson(join(repo, '.copilot', 'mcp-config.json'), {
      mcpServers: {
        squad_state: { command: 'npx', args: ['-y', '@bradygaster/squad-cli', 'state-mcp'] },
        custom_thing: { command: 'node', args: ['./tool.js'] },
      },
    });

    const result = migrateMcpConfig(repo);
    expect(result.status).toBe('migrated');
    expect(result.migrated).toBe(2);
    expect(result.migratedKeys.sort()).toEqual(['custom_thing', 'squad_state']);

    const merged = readJson(join(repo, '.mcp.json'));
    expect(Object.keys(merged.mcpServers).sort()).toEqual(['custom_thing', 'squad_state']);
  });

  it('merges disjoint servers from legacy into existing .mcp.json', () => {
    writeJson(join(repo, '.mcp.json'), {
      mcpServers: { kept: { command: 'echo', args: ['hi'] } },
    });
    writeJson(join(repo, '.copilot', 'mcp-config.json'), {
      mcpServers: { added: { command: 'echo', args: ['bye'] } },
    });

    const result = migrateMcpConfig(repo);
    expect(result.status).toBe('migrated');
    expect(result.migratedKeys).toEqual(['added']);

    const merged = readJson(join(repo, '.mcp.json'));
    expect(Object.keys(merged.mcpServers).sort()).toEqual(['added', 'kept']);
  });

  it('skips entries that are equivalent between legacy and target', () => {
    const entry = { command: 'npx', args: ['-y', '@bradygaster/squad-cli', 'state-mcp'] };
    writeJson(join(repo, '.mcp.json'), { mcpServers: { squad_state: entry } });
    writeJson(join(repo, '.copilot', 'mcp-config.json'), { mcpServers: { squad_state: entry } });

    const result = migrateMcpConfig(repo);
    expect(result.status).toBe('no-op');
    expect(result.migrated).toBe(0);
    expect(result.skippedKeys).toEqual(['squad_state']);
    expect(result.conflicts).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps .mcp.json and warns on a conflict', () => {
    writeJson(join(repo, '.mcp.json'), {
      mcpServers: { squad_state: { command: 'npx', args: ['NEW'] } },
    });
    writeJson(join(repo, '.copilot', 'mcp-config.json'), {
      mcpServers: { squad_state: { command: 'npx', args: ['OLD'] } },
    });

    const result = migrateMcpConfig(repo);
    expect(result.status).toBe('no-op');
    expect(result.conflicts).toEqual(['squad_state']);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/squad_state/);

    const merged = readJson(join(repo, '.mcp.json'));
    expect(merged.mcpServers.squad_state.args).toEqual(['NEW']);
  });

  it('refuses to overwrite a malformed .mcp.json', () => {
    writeFileSync(join(repo, '.mcp.json'), '{ this is not json', 'utf8');
    writeJson(join(repo, '.copilot', 'mcp-config.json'), {
      mcpServers: { squad_state: { command: 'npx', args: [] } },
    });

    const result = migrateMcpConfig(repo);
    expect(result.status).toBe('malformed-target');
    expect(result.error).toBeTruthy();
    expect(readFileSync(join(repo, '.mcp.json'), 'utf8')).toBe('{ this is not json');
  });

  it('is idempotent — a second run is a no-op', () => {
    writeJson(join(repo, '.copilot', 'mcp-config.json'), {
      mcpServers: { squad_state: { command: 'npx', args: ['-y', 'x'] } },
    });

    const first = migrateMcpConfig(repo);
    expect(first.status).toBe('migrated');

    const second = migrateMcpConfig(repo);
    expect(second.status).toBe('no-op');
    expect(second.migrated).toBe(0);
  });

  it('treats an empty legacy mcpServers object as empty-legacy', () => {
    writeJson(join(repo, '.copilot', 'mcp-config.json'), { mcpServers: {} });
    const result = migrateMcpConfig(repo);
    expect(result.status).toBe('empty-legacy');
    expect(result.migrated).toBe(0);
  });
});

describe('ensureMcpServerPinned', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('returns absent when file is missing and createIfMissing is false', () => {
    const result = ensureMcpServerPinned(
      join(repo, '.copilot', 'mcp-config.json'),
      'squad_state',
      { command: 'npx', args: [] },
      { createIfMissing: false },
    );
    expect(result.status).toBe('absent');
    expect(existsSync(join(repo, '.copilot', 'mcp-config.json'))).toBe(false);
  });

  it('updates a stale pin in an existing file when overwriteOnConflict is set', () => {
    const filePath = join(repo, '.copilot', 'mcp-config.json');
    writeJson(filePath, {
      mcpServers: { squad_state: { command: 'npx', args: ['OLD'] } },
    });

    const result = ensureMcpServerPinned(
      filePath,
      'squad_state',
      { command: 'npx', args: ['NEW'] },
      { overwriteOnConflict: true },
    );
    expect(result.status).toBe('updated');

    const after = readJson(filePath);
    expect(after.mcpServers.squad_state.args).toEqual(['NEW']);
  });

  it('returns conflict (no write) when overwriteOnConflict is not set', () => {
    const filePath = join(repo, '.copilot', 'mcp-config.json');
    writeJson(filePath, {
      mcpServers: { squad_state: { command: 'npx', args: ['OLD'] } },
    });

    const result = ensureMcpServerPinned(
      filePath,
      'squad_state',
      { command: 'npx', args: ['NEW'] },
    );
    expect(result.status).toBe('conflict');
    const after = readJson(filePath);
    expect(after.mcpServers.squad_state.args).toEqual(['OLD']);
  });

  it('is a no-op when the existing entry already matches', () => {
    const filePath = join(repo, '.copilot', 'mcp-config.json');
    const entry = { command: 'npx', args: ['-y', 'x'] };
    writeJson(filePath, { mcpServers: { squad_state: entry } });

    const result = ensureMcpServerPinned(filePath, 'squad_state', entry);
    expect(result.status).toBe('no-op');
  });
});

describe('atomicWriteJson', () => {
  let repo: string;

  beforeEach(() => {
    repo = makeRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('leaves no .tmp leftovers on success', () => {
    const target = join(repo, '.mcp.json');
    atomicWriteJson(target, { mcpServers: { a: { command: 'echo', args: [] } } });

    expect(existsSync(target)).toBe(true);
    const leftovers = readdirSync(repo).filter(name => name.endsWith('.tmp') || name.includes('.tmp.'));
    expect(leftovers).toEqual([]);
  });

  it('throws before touching disk when the serialized payload fails JSON.parse (Worf Condition B)', () => {
    // Simulate any future regression where stringify produces non-JSON output
    // (e.g. a custom toJSON returning a partial-object fragment). The round-
    // trip parse must reject BEFORE any tempfile is created.
    const target = join(repo, '.mcp.json');
    const spy = vi.spyOn(JSON, 'stringify').mockReturnValueOnce('not valid json {{');
    try {
      expect(() => atomicWriteJson(target, { mcpServers: {} })).toThrow(SyntaxError);
      expect(existsSync(target)).toBe(false);
      const leftovers = readdirSync(repo).filter(name => name.endsWith('.tmp') || name.includes('.tmp.'));
      expect(leftovers).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
