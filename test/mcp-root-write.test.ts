/**
 * iter-8 tests for the repo-root `.mcp.json` squad_state writer + the
 * `.copilot/mcp-config.json` tombstone helper.
 *
 * Validates:
 *   - Missing `.mcp.json` is created with valid JSON containing exactly
 *     the desired squad_state entry.
 *   - Existing user `mcpServers.*` entries are preserved byte-for-byte.
 *   - Tombstone removes only `squad_state` from `.copilot/mcp-config.json`
 *     and preserves siblings.
 *   - Malformed `.mcp.json` is refused (throws) rather than overwritten.
 *   - Idempotency: re-writing the same spec is a no-op (written === false).
 *   - User-supplied `env` on the squad_state entry survives re-runs
 *     (bradygaster/squad#1893).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ensureSquadStateMcpInRoot,
  tombstoneStaleSquadStateInProjectMcp,
  getProjectMcpJsonPath,
} from '../packages/squad-cli/src/cli/core/mcp-root.js';
import type { SquadStateMcpSpec } from '../packages/squad-cli/src/cli/core/mcp-spec.js';

const PINNED_SPEC: SquadStateMcpSpec = {
  source: 'pinned',
  command: 'npx',
  args: ['-y', '@bradygaster/squad-cli@0.9.6-preview.14', 'state-mcp'],
};

describe('iter-8 mcp-root: repo-root .mcp.json writer + project tombstone', () => {
  let tmpProject: string;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-proj-'));
  });

  afterEach(() => {
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it('creates .mcp.json with the squad_state entry when missing', () => {
    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);
    expect(result.key).toBe('squad_state');
    expect(result.path).toBe(getProjectMcpJsonPath(tmpProject));

    const parsed = JSON.parse(fs.readFileSync(result.path, 'utf8'));
    expect(parsed.mcpServers.squad_state.command).toBe('npx');
    expect(parsed.mcpServers.squad_state.args).toEqual(PINNED_SPEC.args);
    expect(parsed.mcpServers.squad_state.tools).toEqual(['*']);
    expect(parsed.mcpServers.squad_state.env).toEqual({});
  });

  it('preserves existing user mcpServers entries', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            github: { command: 'gh-mcp', args: ['--stdio'] },
            'custom-tool': { command: 'node', args: ['./tool.js'] },
          },
        },
        null,
        2,
      ),
    );

    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(parsed.mcpServers.github).toEqual({ command: 'gh-mcp', args: ['--stdio'] });
    expect(parsed.mcpServers['custom-tool']).toEqual({ command: 'node', args: ['./tool.js'] });
    expect(parsed.mcpServers.squad_state.command).toBe('npx');
  });

  it('refuses to overwrite malformed .mcp.json', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(cfgPath, '{ this is : not json');
    expect(() =>
      ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC),
    ).toThrow(/Refusing to overwrite malformed/);

    // Original content untouched.
    expect(fs.readFileSync(cfgPath, 'utf8')).toBe('{ this is : not json');
  });

  it('is idempotent — second call with same spec returns written=false', () => {
    const first = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(first.written).toBe(true);

    const second = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(second.written).toBe(false);
  });

  it('preserves user-supplied env on the squad_state entry (#1893)', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            squad_state: {
              command: 'npx',
              args: ['-y', '@bradygaster/squad-cli@0.0.1-old', 'state-mcp'],
              env: {
                npm_config_registry: 'https://internal-proxy.example/npm/',
                npm_config_allow_remote: 'all',
              },
              tools: ['*'],
            },
          },
        },
        null,
        2,
      ),
    );

    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);

    const entry = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).mcpServers.squad_state;
    // env is user territory — carried forward verbatim.
    expect(entry.env).toEqual({
      npm_config_registry: 'https://internal-proxy.example/npm/',
      npm_config_allow_remote: 'all',
    });
    // command/args are Squad-managed — refreshed to the new pin.
    expect(entry.args).toEqual(PINNED_SPEC.args);
    expect(entry.tools).toEqual(['*']);
  });

  it('is idempotent when the entry carries a user env — no rewrite churn (#1893)', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);

    const withEnv = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    withEnv.mcpServers.squad_state.env = { npm_config_registry: 'https://internal-proxy.example/npm/' };
    fs.writeFileSync(cfgPath, JSON.stringify(withEnv, null, 2) + '\n');

    const second = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(second.written).toBe(false);

    // Untouched on disk.
    const entry = JSON.parse(fs.readFileSync(cfgPath, 'utf8')).mcpServers.squad_state;
    expect(entry.env).toEqual({ npm_config_registry: 'https://internal-proxy.example/npm/' });
  });

  it('normalizes a malformed env on the squad_state entry to an empty object', () => {
    const cfgPath = getProjectMcpJsonPath(tmpProject);
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        mcpServers: {
          squad_state: { command: 'npx', args: [...PINNED_SPEC.args], env: 'nope', tools: ['*'] },
        },
      }),
    );

    const result = ensureSquadStateMcpInRoot(tmpProject, '0.9.6-preview.14', PINNED_SPEC);
    expect(result.written).toBe(true);
    expect(JSON.parse(fs.readFileSync(cfgPath, 'utf8')).mcpServers.squad_state.env).toEqual({});
  });

  it('tombstone removes squad_state from .copilot/mcp-config.json while preserving siblings', () => {
    const copilotDir = path.join(tmpProject, '.copilot');
    fs.mkdirSync(copilotDir, { recursive: true });
    const cfgPath = path.join(copilotDir, 'mcp-config.json');
    fs.writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          mcpServers: {
            squad_state: { command: 'old-stale', args: [] },
            github: { command: 'gh-mcp', args: ['--stdio'] },
          },
        },
        null,
        2,
      ),
    );

    const result = tombstoneStaleSquadStateInProjectMcp(tmpProject);
    expect(result.removed).toBe(true);
    expect(result.path).toBe(cfgPath);

    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(parsed.mcpServers.squad_state).toBeUndefined();
    expect(parsed.mcpServers.github).toEqual({ command: 'gh-mcp', args: ['--stdio'] });
  });

  it('tombstone is a no-op when project mcp-config.json has no squad_state or is missing', () => {
    // missing file
    const r1 = tombstoneStaleSquadStateInProjectMcp(tmpProject);
    expect(r1.removed).toBe(false);

    // present without squad_state
    const copilotDir = path.join(tmpProject, '.copilot');
    fs.mkdirSync(copilotDir, { recursive: true });
    const cfgPath = path.join(copilotDir, 'mcp-config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({ mcpServers: { github: { command: 'gh' } } }));

    const r2 = tombstoneStaleSquadStateInProjectMcp(tmpProject);
    expect(r2.removed).toBe(false);

    const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    expect(parsed.mcpServers.github).toEqual({ command: 'gh' });
  });
});
