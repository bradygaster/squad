/**
 * Tests for SQUAD_HOME resolution and preset system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { resolveSquadHome, ensureSquadHome, resolvePresetsDir } from '@bradygaster/squad-sdk/resolution';
import {
  listPresets,
  loadPreset,
  applyPreset,
  savePreset,
  seedBuiltinPresets,
} from '@bradygaster/squad-sdk/presets';
import {
  parseAgentProvenanceRegistry,
  reconcileAgentProvenanceRegistry,
} from '@bradygaster/squad-sdk/casting';
import {
  _setPresetRegistryHooksForTesting,
  readConsistentCastingState,
  scaffoldPresetIntoSquad,
} from '../packages/squad-sdk/src/presets/scaffold.js';
import { applyPreset as applyPresetSource } from '../packages/squad-sdk/src/presets/index.js';

const TMP = join(process.cwd(), `.test-presets-${randomBytes(4).toString('hex')}`);

function scaffold(...dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(TMP, d), { recursive: true });
  }
}

function writeFile(relativePath: string, content: string): void {
  const fullPath = join(TMP, relativePath);
  mkdirSync(join(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content);
}

function castingLockMetadata(
  pid: number,
  createdAt: string,
  ownerToken = `test-owner-${pid}`,
): string {
  return JSON.stringify({
    version: 1,
    pid,
    hostname: hostname(),
    created_at: createdAt,
    owner_token: ownerToken,
  }) + '\n';
}

// ============================================================================
// resolveSquadHome()
// ============================================================================

describe('resolveSquadHome()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    _setPresetRegistryHooksForTesting(null);
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('returns null when SQUAD_HOME points to a nonexistent path', () => {
    // Point SQUAD_HOME to a nonexistent path
    process.env['SQUAD_HOME'] = join(TMP, 'nonexistent');
    expect(resolveSquadHome()).toBeNull();
  });

  it('returns the directory when SQUAD_HOME points to an existing dir', () => {
    const homeDir = join(TMP, 'my-squad-home');
    mkdirSync(homeDir, { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    expect(resolveSquadHome()).toBe(homeDir);
  });

  it('creates directory when create=true and SQUAD_HOME is set', () => {
    const homeDir = join(TMP, 'new-squad-home');
    process.env['SQUAD_HOME'] = homeDir;

    expect(existsSync(homeDir)).toBe(false);
    const result = resolveSquadHome(true);
    expect(result).toBe(homeDir);
    expect(existsSync(homeDir)).toBe(true);
  });
});

// ============================================================================
// ensureSquadHome()
// ============================================================================

describe('ensureSquadHome()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    _setPresetRegistryHooksForTesting(null);
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('creates agents/ and presets/ subdirectories', () => {
    const homeDir = join(TMP, 'ensure-home');
    process.env['SQUAD_HOME'] = homeDir;

    const result = ensureSquadHome();
    expect(result).toBe(homeDir);
    expect(existsSync(join(homeDir, 'agents'))).toBe(true);
    expect(existsSync(join(homeDir, 'presets'))).toBe(true);
  });

  it('is idempotent', () => {
    const homeDir = join(TMP, 'idempotent-home');
    process.env['SQUAD_HOME'] = homeDir;

    ensureSquadHome();
    ensureSquadHome(); // should not throw
    expect(existsSync(join(homeDir, 'agents'))).toBe(true);
  });
});

// ============================================================================
// Preset loading
// ============================================================================

describe('listPresets()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('returns empty array when no presets directory exists', () => {
    process.env['SQUAD_HOME'] = join(TMP, 'no-presets');
    expect(listPresets()).toEqual([]);
  });

  it('returns empty array when presets directory is empty', () => {
    const homeDir = join(TMP, 'empty-presets');
    mkdirSync(join(homeDir, 'presets'), { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    expect(listPresets()).toEqual([]);
  });

  it('lists presets with valid manifest', () => {
    const homeDir = join(TMP, 'has-presets');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('has-presets/presets/my-team/agents/dev');
    writeFile('has-presets/presets/my-team/preset.json', JSON.stringify({
      name: 'my-team',
      version: '1.0.0',
      description: 'Test preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));

    const presets = listPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]!.name).toBe('my-team');
    expect(presets[0]!.agents).toHaveLength(1);
  });

  it('skips directories without valid preset.json', () => {
    const homeDir = join(TMP, 'mixed-presets');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('mixed-presets/presets/valid/agents/dev');
    scaffold('mixed-presets/presets/invalid');
    writeFile('mixed-presets/presets/valid/preset.json', JSON.stringify({
      name: 'valid',
      version: '1.0.0',
      description: 'Valid preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('mixed-presets/presets/invalid/preset.json', '{ broken json');

    const presets = listPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]!.name).toBe('valid');
  });
});

// ============================================================================
// loadPreset()
// ============================================================================

describe('loadPreset()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('returns null for nonexistent preset', () => {
    const homeDir = join(TMP, 'load-preset');
    mkdirSync(join(homeDir, 'presets'), { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    expect(loadPreset('nope')).toBeNull();
  });

  it('loads a valid preset', () => {
    const homeDir = join(TMP, 'load-valid');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('load-valid/presets/test-preset/agents/alpha');
    writeFile('load-valid/presets/test-preset/preset.json', JSON.stringify({
      name: 'test-preset',
      version: '2.0.0',
      description: 'A test',
      agents: [
        { name: 'alpha', role: 'lead', description: 'The lead' },
      ],
    }));

    const preset = loadPreset('test-preset');
    expect(preset).not.toBeNull();
    expect(preset!.version).toBe('2.0.0');
    expect(preset!.agents[0]!.name).toBe('alpha');
  });
});

// ============================================================================
// applyPreset()
// ============================================================================

describe('applyPreset()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    _setPresetRegistryHooksForTesting(null);
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('installs preset agents into target directory', () => {
    const homeDir = join(TMP, 'apply-home');
    process.env['SQUAD_HOME'] = homeDir;

    // Create preset
    scaffold('apply-home/presets/starter/agents/dev');
    writeFile('apply-home/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-home/presets/starter/agents/dev/charter.md', '# Dev Agent');

    // Create target
    const targetDir = join(TMP, 'target-squad', 'agents');
    mkdirSync(targetDir, { recursive: true });

    const results = applyPreset('starter', targetDir);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe('installed');
    expect(existsSync(join(targetDir, 'dev', 'charter.md'))).toBe(true);
    expect(readFileSync(join(targetDir, 'dev', 'charter.md'), 'utf-8')).toBe('# Dev Agent');
  });

  it('skips existing agents by default', () => {
    const homeDir = join(TMP, 'apply-skip');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-skip/presets/starter/agents/dev');
    writeFile('apply-skip/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-skip/presets/starter/agents/dev/charter.md', '# New Charter');

    // Pre-existing agent
    const targetDir = join(TMP, 'target-skip', 'agents');
    mkdirSync(join(targetDir, 'dev'), { recursive: true });
    writeFileSync(join(targetDir, 'dev', 'charter.md'), '# Old Charter');

    const results = applyPreset('starter', targetDir);
    expect(results[0]!.status).toBe('skipped');
    expect(readFileSync(join(targetDir, 'dev', 'charter.md'), 'utf-8')).toBe('# Old Charter');
  });

  it('overwrites existing agents with --force', () => {
    const homeDir = join(TMP, 'apply-force');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-force/presets/starter/agents/dev');
    writeFile('apply-force/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-force/presets/starter/agents/dev/charter.md', '# New Charter');

    const targetDir = join(TMP, 'target-force', 'agents');
    mkdirSync(join(targetDir, 'dev'), { recursive: true });
    writeFileSync(join(targetDir, 'dev', 'charter.md'), '# Old Charter');

    const results = applyPreset('starter', targetDir, { force: true });
    expect(results[0]!.status).toBe('installed');
    expect(readFileSync(join(targetDir, 'dev', 'charter.md'), 'utf-8')).toBe('# New Charter');
  });

  it('returns error for nonexistent preset', () => {
    const homeDir = join(TMP, 'apply-missing');
    mkdirSync(join(homeDir, 'presets'), { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    const results = applyPreset('nope', '/tmp/anywhere');
    expect(results[0]!.status).toBe('error');
  });

  // Regression tests for bradygaster/squad#1288 — applyPreset must wire the
  // preset agents into team.md, routing.md, and the casting state files so
  // the coordinator's mode-switch check sees a populated ## Members table
  // and skips Init Mode.

  it('wires preset agents into team.md ## Members (#1288)', () => {
    const homeDir = join(TMP, 'apply-team');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-team/presets/starter/agents/dev', 'apply-team/presets/starter/agents/qa');
    writeFile('apply-team/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [
        { name: 'dev', role: 'developer' },
        { name: 'qa', role: 'reviewer' },
      ],
    }));
    writeFile('apply-team/presets/starter/agents/dev/charter.md', '# Dev');
    writeFile('apply-team/presets/starter/agents/qa/charter.md', '# QA');

    const squadDir = join(TMP, 'target-team');
    const agentsDir = join(squadDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    applyPreset('starter', agentsDir);

    const teamMd = readFileSync(join(squadDir, 'team.md'), 'utf-8');
    expect(teamMd).toContain('## Members');
    expect(teamMd).toContain('| dev | developer |');
    expect(teamMd).toContain('| qa | reviewer |');
    expect(teamMd).toContain('`.squad/agents/dev/charter.md`');
    expect(teamMd).toContain('`.squad/agents/qa/charter.md`');
  });

  it('merges preset agents into an existing team.md without duplicating rows (#1288)', () => {
    const homeDir = join(TMP, 'apply-team-merge');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-team-merge/presets/starter/agents/qa');
    writeFile('apply-team-merge/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'qa', role: 'reviewer' }],
    }));
    writeFile('apply-team-merge/presets/starter/agents/qa/charter.md', '# QA');

    const squadDir = join(TMP, 'target-team-merge');
    const agentsDir = join(squadDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });
    // Pre-existing team.md from a prior squad init/cast with one member
    writeFileSync(join(squadDir, 'team.md'), [
      '# Squad Team',
      '',
      '## Coordinator',
      '',
      '| Name | Role | Notes |',
      '|------|------|-------|',
      '| Squad | Coordinator | Routes work. |',
      '',
      '## Members',
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      '| Picard | Lead | `.squad/agents/picard/charter.md` | ✅ Active |',
      '',
      '## Project Context',
      '',
      '- **Project:** Existing',
      '',
    ].join('\n'));

    applyPreset('starter', agentsDir);

    const teamMd = readFileSync(join(squadDir, 'team.md'), 'utf-8');
    expect(teamMd).toContain('| Picard | Lead |');
    expect(teamMd).toContain('| qa | reviewer |');
    expect(teamMd).toContain('## Project Context'); // section after Members preserved

    // Idempotency: a second apply must not duplicate the qa row
    applyPreset('starter', agentsDir);
    const teamMdAfter = readFileSync(join(squadDir, 'team.md'), 'utf-8');
    const qaCount = (teamMdAfter.match(/\| qa \| reviewer \|/g) ?? []).length;
    expect(qaCount).toBe(1);
  });

  it('writes casting registry.json, history.json, and policy.json (#1288)', () => {
    const homeDir = join(TMP, 'apply-casting');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-casting/presets/starter/agents/dev');
    writeFile('apply-casting/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-casting/presets/starter/agents/dev/charter.md', '# Dev');

    const squadDir = join(TMP, 'target-casting');
    const agentsDir = join(squadDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    applyPreset('starter', agentsDir);

    const registry = JSON.parse(readFileSync(join(squadDir, 'casting', 'registry.json'), 'utf-8'));
    expect(parseAgentProvenanceRegistry(registry)).toMatchObject({
      completeness: 'complete',
      registry: {
        schema: 'squad-agent-provenance/v1',
        schema_version: 1,
      },
    });
    expect(registry.agents).toHaveProperty('dev');
    expect(registry.agents.dev.persistent_name).toBe('dev');
    expect(registry.agents.dev.universe).toBe('preset:starter');
    expect(registry.agents.dev.status).toBe('active');

    const history = JSON.parse(readFileSync(join(squadDir, 'casting', 'history.json'), 'utf-8'));
    expect(Object.keys(history.assignment_cast_snapshots).length).toBeGreaterThan(0);
    const firstSnapshot = Object.values<{ agents: string[]; universe: string }>(
      history.assignment_cast_snapshots,
    )[0]!;
    expect(firstSnapshot.agents).toContain('dev');
    expect(firstSnapshot.universe).toBe('preset:starter');
    expect(history.universe_usage_history.length).toBeGreaterThan(0);

    const policy = JSON.parse(readFileSync(join(squadDir, 'casting', 'policy.json'), 'utf-8'));
    expect(policy.universe_allowlist).toContain('*');
    expect(policy.max_capacity).toBeGreaterThan(0);
  });

  it('retries a concurrent registry change without losing either update', () => {
    const squadDir = join(TMP, 'target-casting-concurrent');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(castingDir, { recursive: true });
    const registryPath = join(castingDir, 'registry.json');
    const initial = reconcileAgentProvenanceRegistry(undefined, [{
      id: 'existing',
      displayName: 'Existing',
      role: 'Lead',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-20T20:00:00.000Z' });
    writeFileSync(registryPath, JSON.stringify(initial, null, 2) + '\n');

    _setPresetRegistryHooksForTesting({
      afterSnapshot: ({ attempt }) => {
        if (attempt !== 1) return;
        const current = JSON.parse(readFileSync(registryPath, 'utf8')) as unknown;
        const concurrent = reconcileAgentProvenanceRegistry(current, [{
          id: 'concurrent',
          displayName: 'Concurrent',
          role: 'Reviewer',
          universe: 'descriptive',
        }], {
          generatedAt: '2026-09-21T20:00:00.000Z',
          retireMissing: false,
        });
        writeFileSync(registryPath, JSON.stringify(concurrent, null, 2) + '\n');
      },
    });

    scaffoldPresetIntoSquad(
      squadDir,
      [{ name: 'dev', role: 'developer' }],
      'starter',
    );

    const finalRegistry = parseAgentProvenanceRegistry(
      JSON.parse(readFileSync(registryPath, 'utf8')),
    );
    expect(finalRegistry.completeness).toBe('complete');
    expect(Object.keys(finalRegistry.registry.agents).sort())
      .toEqual(['concurrent', 'dev', 'existing']);
    expect(finalRegistry.registry.revision).toBe(3);
    expect(existsSync(join(castingDir, 'registry.lock'))).toBe(false);
  });

  it('leaves the prior registry intact when the atomic commit fails', () => {
    const squadDir = join(TMP, 'target-casting-failure');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(castingDir, { recursive: true });
    const registryPath = join(castingDir, 'registry.json');
    const initial = reconcileAgentProvenanceRegistry(undefined, [{
      id: 'existing',
      displayName: 'Existing',
      role: 'Lead',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-20T20:00:00.000Z' });
    const originalRegistry = JSON.stringify(initial, null, 2) + '\n';
    writeFileSync(registryPath, originalRegistry);

    _setPresetRegistryHooksForTesting({
      beforeRename: () => {
        throw new Error('injected atomic rename failure');
      },
    });

    expect(() => scaffoldPresetIntoSquad(
      squadDir,
      [{ name: 'dev', role: 'developer' }],
      'starter',
    )).toThrow(/injected atomic rename failure/);
    expect(readFileSync(registryPath, 'utf8')).toBe(originalRegistry);
    expect(readdirSync(castingDir).filter(name => name.startsWith('registry.json.tmp-')))
      .toEqual([]);
    expect(existsSync(join(castingDir, 'registry.lock'))).toBe(false);
    expect(parseAgentProvenanceRegistry(JSON.parse(originalRegistry)).completeness)
      .toBe('complete');
  });

  it('times out without removing a live owner lock', () => {
      const squadDir = join(TMP, 'target-live-lock');
      const castingDir = join(squadDir, 'casting');
      mkdirSync(castingDir, { recursive: true });
      const lockPath = join(castingDir, 'registry.lock');
      let now = Date.parse('2026-09-21T22:00:00.000Z');
      const lock = castingLockMetadata(4242, new Date(now - 60_000).toISOString());
      writeFileSync(lockPath, lock);
      _setPresetRegistryHooksForTesting({
        now: () => now,
        wait: milliseconds => { now += milliseconds; },
        isProcessAlive: () => true,
        lockTimeoutMs: 50,
        staleLockAgeMs: 10,
      });

      expect(() => scaffoldPresetIntoSquad(
        squadDir,
        [{ name: 'dev', role: 'developer' }],
        'starter',
      )).toThrow(/Timed out waiting/);
      expect(readFileSync(lockPath, 'utf8')).toBe(lock);
  });

  it('recovers a sufficiently old lock only when the same-host owner is proven dead', () => {
      const squadDir = join(TMP, 'target-stale-lock');
      const castingDir = join(squadDir, 'casting');
      mkdirSync(castingDir, { recursive: true });
      const lockPath = join(castingDir, 'registry.lock');
      const now = Date.parse('2026-09-21T22:00:00.000Z');
      writeFileSync(
        lockPath,
        castingLockMetadata(4242, new Date(now - 60_000).toISOString()),
      );
      _setPresetRegistryHooksForTesting({
        now: () => now,
        isProcessAlive: () => false,
        staleLockAgeMs: 10,
      });

      scaffoldPresetIntoSquad(
        squadDir,
        [{ name: 'dev', role: 'developer' }],
        'starter',
      );

      expect(existsSync(lockPath)).toBe(false);
      expect(readdirSync(castingDir).filter(name => name.includes('.stale-'))).toEqual([]);
      expect(JSON.parse(readFileSync(join(castingDir, 'registry.json'), 'utf8')))
        .toHaveProperty('agents.dev');
  });

  it('does not remove a live replacement lock during stale-lock ABA recovery', () => {
      const squadDir = join(TMP, 'target-stale-lock-aba');
      const castingDir = join(squadDir, 'casting');
      mkdirSync(castingDir, { recursive: true });
      const lockPath = join(castingDir, 'registry.lock');
      let now = Date.parse('2026-09-21T22:00:00.000Z');
      const staleLock = castingLockMetadata(
        4242,
        new Date(now - 60_000).toISOString(),
        'stale-owner',
      );
      const replacementLock = castingLockMetadata(
        5252,
        new Date(now).toISOString(),
        'replacement-owner',
      );
      writeFileSync(lockPath, staleLock);
      let replaced = false;
      _setPresetRegistryHooksForTesting({
        now: () => now,
        wait: milliseconds => { now += milliseconds; },
        isProcessAlive: pid => pid === 5252,
        lockTimeoutMs: 50,
        staleLockAgeMs: 10,
        afterStaleLockSnapshot: () => {
          if (replaced) return;
          replaced = true;
          unlinkSync(lockPath);
          writeFileSync(lockPath, replacementLock);
        },
      });

      expect(() => scaffoldPresetIntoSquad(
        squadDir,
        [{ name: 'dev', role: 'developer' }],
        'starter',
      )).toThrow(/Timed out waiting/);
      expect(readFileSync(lockPath, 'utf8')).toBe(replacementLock);
      expect(readdirSync(castingDir).filter(name => name.includes('.stale-'))).toEqual([]);
  });

  it('fails safely on malformed lock metadata', () => {
      const squadDir = join(TMP, 'target-malformed-lock');
      const castingDir = join(squadDir, 'casting');
      mkdirSync(castingDir, { recursive: true });
      const lockPath = join(castingDir, 'registry.lock');
      let now = Date.parse('2026-09-21T22:00:00.000Z');
      writeFileSync(lockPath, '{"pid":"not-a-number"}\n');
      _setPresetRegistryHooksForTesting({
        now: () => now,
        wait: milliseconds => { now += milliseconds; },
        lockTimeoutMs: 50,
        staleLockAgeMs: 10,
      });

      expect(() => scaffoldPresetIntoSquad(
        squadDir,
        [{ name: 'dev', role: 'developer' }],
        'starter',
      )).toThrow(/Timed out waiting/);
      expect(readFileSync(lockPath, 'utf8')).toBe('{"pid":"not-a-number"}\n');
  });

  it.each([
      ['journal write', 'beforeWrite', 'journal'],
      ['journal file fsync', 'beforeFileFsync', 'journal'],
      ['journal directory fsync', 'beforeDirectoryFsync', 'journal'],
      ['journal rename', 'beforeRename', 'journal'],
      ['history write', 'beforeWrite', 'history'],
      ['history file fsync', 'beforeFileFsync', 'history'],
      ['history directory fsync', 'beforeDirectoryFsync', 'history'],
      ['history rename', 'beforeRename', 'history'],
      ['registry write', 'beforeWrite', 'registry'],
      ['registry file fsync', 'beforeFileFsync', 'registry'],
      ['registry directory fsync', 'beforeDirectoryFsync', 'registry'],
      ['registry rename', 'beforeRename', 'registry'],
      ['journal delete directory fsync', 'beforeDirectoryFsync', 'journal-delete'],
    ] as const)('rolls back the registry/history pair after an injected %s failure', (
      _label,
      boundary,
      stage,
    ) => {
      const squadDir = join(TMP, `target-transaction-${boundary}-${stage}`);
      const castingDir = join(squadDir, 'casting');
      mkdirSync(castingDir, { recursive: true });
      const registryPath = join(castingDir, 'registry.json');
      const historyPath = join(castingDir, 'history.json');
      const policyPath = join(castingDir, 'policy.json');
      const initial = reconcileAgentProvenanceRegistry(undefined, [{
        id: 'existing',
        displayName: 'Existing',
        role: 'Lead',
        universe: 'descriptive',
      }], { generatedAt: '2026-09-20T20:00:00.000Z' });
      const originalRegistry = JSON.stringify(initial, null, 2) + '\n';
      const originalHistory = JSON.stringify({
        assignment_cast_snapshots: {},
        universe_usage_history: [],
      }, null, 2) + '\n';
      writeFileSync(registryPath, originalRegistry);
      writeFileSync(historyPath, originalHistory);
      writeFileSync(policyPath, '{"universe_allowlist":["*"],"max_capacity":25}\n');
      let injected = false;
      _setPresetRegistryHooksForTesting({
        beforeWrite: boundary === 'beforeWrite' ? (context) => {
          if (!injected && context.stage === stage) {
            injected = true;
            throw new Error(`injected ${stage} ${boundary} failure`);
          }
        } : undefined,
        beforeRename: boundary === 'beforeRename' ? (context) => {
          if (!injected && context.stage === stage) {
            injected = true;
            throw new Error(`injected ${stage} ${boundary} failure`);
          }
        } : undefined,
        beforeFsync: boundary === 'beforeFileFsync' || boundary === 'beforeDirectoryFsync'
          ? (context) => {
              const expectedTarget = boundary === 'beforeFileFsync' ? 'file' : 'directory';
              if (!injected && context.stage === stage && context.target === expectedTarget) {
                injected = true;
                throw new Error(`injected ${stage} ${boundary} failure`);
              }
            }
          : undefined,
      });

      expect(() => scaffoldPresetIntoSquad(
        squadDir,
        [{ name: 'dev', role: 'developer' }],
        'starter',
      )).toThrow(new RegExp(`injected ${stage} ${boundary} failure`));
      expect(readFileSync(registryPath, 'utf8')).toBe(originalRegistry);
      expect(readFileSync(historyPath, 'utf8')).toBe(originalHistory);
      expect(readdirSync(castingDir).filter(name =>
        name.includes('.tmp-')
        || name.includes('.transaction.')
        || name === 'registry.lock'
      )).toEqual([]);
  });

  it.each([
    ['journal file fsync', 'journal', 'file-fsync'],
    ['journal rename', 'journal', 'rename'],
    ['journal directory fsync', 'journal', 'directory-fsync'],
    ['history file fsync', 'history', 'file-fsync'],
    ['history rename', 'history', 'rename'],
    ['history directory fsync', 'history', 'directory-fsync'],
    ['registry file fsync', 'registry', 'file-fsync'],
    ['registry rename', 'registry', 'rename'],
    ['registry directory fsync', 'registry', 'directory-fsync'],
    ['journal delete', 'journal-delete', 'unlink'],
    ['journal delete directory fsync', 'journal-delete', 'directory-fsync'],
  ] as const)('keeps readers on a complete generation and recovers after a crash at %s', (
    _label,
    stage,
    boundary,
  ) => {
    const squadDir = join(TMP, `target-crash-${stage}-${boundary}`);
    const castingDir = join(squadDir, 'casting');
    mkdirSync(castingDir, { recursive: true });
    const registryPath = join(castingDir, 'registry.json');
    const historyPath = join(castingDir, 'history.json');
    const journalPath = join(castingDir, 'registry-history.transaction.json');
    const initial = reconcileAgentProvenanceRegistry(undefined, [{
      id: 'existing',
      displayName: 'Existing',
      role: 'Lead',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-20T20:00:00.000Z' });
    const originalRegistry = JSON.stringify(initial, null, 2) + '\n';
    const originalHistory = JSON.stringify({
      assignment_cast_snapshots: {},
      universe_usage_history: [],
    }, null, 2) + '\n';
    writeFileSync(registryPath, originalRegistry);
    writeFileSync(historyPath, originalHistory);
    writeFileSync(
      join(castingDir, 'policy.json'),
      '{"universe_allowlist":["*"],"max_capacity":25}\n',
    );

    let observed: ReturnType<typeof readConsistentCastingState> | undefined;
    let injected = false;
    _setPresetRegistryHooksForTesting({
      afterDurabilityBoundary: (context) => {
        if (injected || context.stage !== stage || context.boundary !== boundary) return;
        injected = true;
        observed = readConsistentCastingState(castingDir);
        throw new Error(`simulated crash after ${stage} ${boundary}`);
      },
    });

    expect(() => scaffoldPresetIntoSquad(
      squadDir,
      [{ name: 'dev', role: 'developer' }],
      'starter',
    )).toThrow(new RegExp(`simulated crash after ${stage} ${boundary}`));
    expect(injected).toBe(true);
    expect(observed).toBeDefined();

    const observedRegistry = JSON.parse(observed!.registryRaw!) as {
      revision: number;
      agents: Record<string, unknown>;
    };
    const observedHistory = JSON.parse(observed!.historyRaw!) as {
      assignment_cast_snapshots: Record<string, unknown>;
      universe_usage_history: unknown[];
    };
    const readerSawNext = Object.hasOwn(observedRegistry.agents, 'dev');
    expect(Object.keys(observedHistory.assignment_cast_snapshots)).toHaveLength(
      readerSawNext ? 1 : 0,
    );
    expect(observedHistory.universe_usage_history).toHaveLength(readerSawNext ? 1 : 0);

    _setPresetRegistryHooksForTesting(null);
    scaffoldPresetIntoSquad(
      squadDir,
      [{ name: 'dev', role: 'developer' }],
      'starter',
    );

    const recovered = readConsistentCastingState(castingDir);
    const recoveredRegistry = JSON.parse(recovered.registryRaw!) as {
      agents: Record<string, unknown>;
    };
    const recoveredHistory = JSON.parse(recovered.historyRaw!) as {
      assignment_cast_snapshots: Record<string, unknown>;
      universe_usage_history: unknown[];
    };
    expect(recoveredRegistry.agents).toHaveProperty('dev');
    expect(Object.keys(recoveredHistory.assignment_cast_snapshots).length)
      .toBeGreaterThanOrEqual(1);
    expect(recoveredHistory.universe_usage_history.length).toBeGreaterThanOrEqual(1);
    expect(existsSync(journalPath)).toBe(false);
    expect(readdirSync(castingDir).filter(name => name.includes('.tmp-'))).toEqual([]);
  });

  it('recovers a journaled half-commit and preserves monotonic revisions on retry', () => {
    const squadDir = join(TMP, 'target-transaction-recovery');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(castingDir, { recursive: true });
    const registryPath = join(castingDir, 'registry.json');
    const historyPath = join(castingDir, 'history.json');
    const journalPath = join(castingDir, 'registry-history.transaction.json');
    const originalRegistryValue = reconcileAgentProvenanceRegistry(undefined, [{
      id: 'existing',
      displayName: 'Existing',
      role: 'Lead',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-20T20:00:00.000Z' });
    const nextRegistryValue = reconcileAgentProvenanceRegistry(originalRegistryValue, [{
      id: 'recovered',
      displayName: 'Recovered',
      role: 'Reviewer',
      universe: 'descriptive',
    }], {
      generatedAt: '2026-09-21T20:00:00.000Z',
      retireMissing: false,
    });
    const originalRegistry = JSON.stringify(originalRegistryValue, null, 2) + '\n';
    const nextRegistry = JSON.stringify(nextRegistryValue, null, 2) + '\n';
    const originalHistory = JSON.stringify({
      assignment_cast_snapshots: {},
      universe_usage_history: [],
    }, null, 2) + '\n';
    const nextHistory = JSON.stringify({
      assignment_cast_snapshots: {
        'recovered-revision-2': {
          created_at: '2026-09-21T20:00:00.000Z',
          agents: ['recovered'],
          universe: 'descriptive',
        },
      },
      universe_usage_history: [{
        universe: 'descriptive',
        used_at: '2026-09-21T20:00:00.000Z',
      }],
    }, null, 2) + '\n';
    writeFileSync(registryPath, originalRegistry);
    writeFileSync(historyPath, nextHistory);
    writeFileSync(journalPath, JSON.stringify({
      version: 2,
      generation: 'recovery-generation',
      registry: { previous: originalRegistry, next: nextRegistry },
      history: { previous: originalHistory, next: nextHistory },
    }, null, 2) + '\n');

    scaffoldPresetIntoSquad(
      squadDir,
      [{ name: 'dev', role: 'developer' }],
      'starter',
    );

    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      revision: number;
      agents: Record<string, unknown>;
    };
    const history = JSON.parse(readFileSync(historyPath, 'utf8')) as {
      assignment_cast_snapshots: Record<string, unknown>;
    };
    expect(registry.revision).toBe(3);
    expect(Object.keys(registry.agents).sort()).toEqual(['dev', 'existing', 'recovered']);
    expect(Object.keys(history.assignment_cast_snapshots)).toHaveLength(2);
    expect(existsSync(journalPath)).toBe(false);
  });

  it('rolls back copied charters and scaffold files when the history commit fails', () => {
    const homeDir = join(TMP, 'apply-history-failure');
    process.env['SQUAD_HOME'] = homeDir;
    scaffold('apply-history-failure/presets/starter/agents/dev');
    writeFile('apply-history-failure/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-history-failure/presets/starter/agents/dev/charter.md', '# Replacement');
    writeFile('apply-history-failure/presets/starter/routing.md', '# Replacement routing\n');

    const squadDir = join(TMP, 'target-history-failure');
    const agentsDir = join(squadDir, 'agents');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(join(agentsDir, 'dev'), { recursive: true });
    mkdirSync(castingDir, { recursive: true });
    const originals = {
      charter: '# Original charter\n',
      team: '# Original team\n',
      routing: '# Original routing\n',
      registry: JSON.stringify(reconcileAgentProvenanceRegistry(undefined, [{
        id: 'existing',
        displayName: 'Existing',
        role: 'Lead',
        universe: 'descriptive',
      }], { generatedAt: '2026-09-20T20:00:00.000Z' }), null, 2) + '\n',
      history: JSON.stringify({
        assignment_cast_snapshots: {},
        universe_usage_history: [],
      }, null, 2) + '\n',
      policy: '{"universe_allowlist":["*"],"max_capacity":25}\n',
    };
    writeFileSync(join(agentsDir, 'dev', 'charter.md'), originals.charter);
    writeFileSync(join(squadDir, 'team.md'), originals.team);
    writeFileSync(join(squadDir, 'routing.md'), originals.routing);
    writeFileSync(join(castingDir, 'registry.json'), originals.registry);
    writeFileSync(join(castingDir, 'history.json'), originals.history);
    writeFileSync(join(castingDir, 'policy.json'), originals.policy);
    let injected = false;
    _setPresetRegistryHooksForTesting({
      beforeRename: ({ stage }) => {
        if (!injected && stage === 'history') {
          injected = true;
          throw new Error('forced history rename failure');
        }
      },
    });

    expect(applyPresetSource('starter', agentsDir, { force: true, overwriteRouting: true }))
      .toContainEqual(expect.objectContaining({
        agent: '<scaffold>',
        status: 'error',
        reason: expect.stringContaining('forced history rename failure'),
      }));
    expect(readFileSync(join(agentsDir, 'dev', 'charter.md'), 'utf8')).toBe(originals.charter);
    expect(readFileSync(join(squadDir, 'team.md'), 'utf8')).toBe(originals.team);
    expect(readFileSync(join(squadDir, 'routing.md'), 'utf8')).toBe(originals.routing);
    expect(readFileSync(join(castingDir, 'registry.json'), 'utf8')).toBe(originals.registry);
    expect(readFileSync(join(castingDir, 'history.json'), 'utf8')).toBe(originals.history);
    expect(readFileSync(join(castingDir, 'policy.json'), 'utf8')).toBe(originals.policy);
    expect(readdirSync(castingDir).filter(name =>
      name.includes('.tmp-')
      || name.includes('.transaction.')
      || name === 'registry.lock'
    )).toEqual([]);
  });

  it('preserves concurrent preset file and directory changes during history-failure rollback', () => {
    const homeDir = join(TMP, 'apply-history-concurrent');
    process.env['SQUAD_HOME'] = homeDir;
    for (const agent of ['dev', 'tester', 'blocked']) {
      scaffold(`apply-history-concurrent/presets/starter/agents/${agent}`);
      writeFile(
        `apply-history-concurrent/presets/starter/agents/${agent}/charter.md`,
        `# Replacement ${agent}\n`,
      );
    }
    writeFile('apply-history-concurrent/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [
        { name: 'dev', role: 'developer' },
        { name: 'tester', role: 'tester' },
        { name: 'blocked', role: 'reviewer' },
      ],
    }));
    writeFile('apply-history-concurrent/presets/starter/routing.md', '# Preset routing\n');

    const squadDir = join(TMP, 'target-history-concurrent');
    const agentsDir = join(squadDir, 'agents');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(join(agentsDir, 'dev'), { recursive: true });
    mkdirSync(castingDir, { recursive: true });
    writeFileSync(join(agentsDir, 'dev', 'charter.md'), '# Original charter\n');
    writeFileSync(join(agentsDir, 'dev', 'original-only.md'), 'original\n');
    writeFileSync(join(agentsDir, 'blocked'), 'original path bytes\n');
    writeFileSync(join(squadDir, 'routing.md'), '# Original routing\n');
    const originalRegistry = JSON.stringify(reconcileAgentProvenanceRegistry(undefined, [{
      id: 'existing',
      displayName: 'Existing',
      role: 'Lead',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-20T20:00:00.000Z' }), null, 2) + '\n';
    const originalHistory = JSON.stringify({
      assignment_cast_snapshots: {},
      universe_usage_history: [],
    }, null, 2) + '\n';
    writeFileSync(join(castingDir, 'registry.json'), originalRegistry);
    writeFileSync(join(castingDir, 'history.json'), originalHistory);

    const externalCharter = '# Concurrent charter\n';
    const externalTeam = '# Concurrent team\n';
    const externalRouting = '# Concurrent routing\n';
    let injected = false;
    _setPresetRegistryHooksForTesting({
      beforeRename: ({ stage }) => {
        if (injected || stage !== 'history') return;
        injected = true;
        writeFileSync(join(agentsDir, 'dev', 'charter.md'), externalCharter);
        writeFileSync(join(agentsDir, 'dev', 'external-only.md'), 'external tree bytes\n');
        writeFileSync(join(squadDir, 'team.md'), externalTeam);
        writeFileSync(join(squadDir, 'routing.md'), externalRouting);
        throw new Error('forced history rename failure after external writes');
      },
    });

    const result = applyPresetSource('starter', agentsDir, {
      force: true,
      overwriteRouting: true,
    });

    expect(result).toContainEqual(expect.objectContaining({
      agent: '<scaffold>',
      status: 'error',
      reason: expect.stringMatching(/rollback requires recovery.*(team\.md|routing\.md|agents\/dev)/),
    }));
    expect(readFileSync(join(agentsDir, 'dev', 'charter.md'), 'utf8')).toBe(externalCharter);
    expect(readFileSync(join(agentsDir, 'dev', 'external-only.md'), 'utf8'))
      .toBe('external tree bytes\n');
    expect(existsSync(join(agentsDir, 'dev', 'original-only.md'))).toBe(false);
    expect(readFileSync(join(squadDir, 'team.md'), 'utf8')).toBe(externalTeam);
    expect(readFileSync(join(squadDir, 'routing.md'), 'utf8')).toBe(externalRouting);
    expect(existsSync(join(agentsDir, 'tester'))).toBe(false);
    expect(readFileSync(join(agentsDir, 'blocked'), 'utf8')).toBe('original path bytes\n');
    expect(existsSync(join(castingDir, 'policy.json'))).toBe(false);
    expect(readFileSync(join(castingDir, 'registry.json'), 'utf8')).toBe(originalRegistry);
    expect(readFileSync(join(castingDir, 'history.json'), 'utf8')).toBe(originalHistory);
    expect(readdirSync(castingDir).filter(name =>
      name.includes('.tmp-')
      || name === 'registry-history.transaction.json'
      || name === 'registry.lock'
    )).toEqual([]);
  });

  it('retains the casting journal when an external write prevents CAS rollback', () => {
    const squadDir = join(TMP, 'target-casting-rollback-conflict');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(castingDir, { recursive: true });
    const registryPath = join(castingDir, 'registry.json');
    const historyPath = join(castingDir, 'history.json');
    const journalPath = join(castingDir, 'registry-history.transaction.json');
    const originalRegistry = JSON.stringify(reconcileAgentProvenanceRegistry(undefined, [{
      id: 'existing',
      displayName: 'Existing',
      role: 'Lead',
      universe: 'descriptive',
    }], { generatedAt: '2026-09-20T20:00:00.000Z' }), null, 2) + '\n';
    const originalHistory = JSON.stringify({
      assignment_cast_snapshots: {},
      universe_usage_history: [],
    }, null, 2) + '\n';
    const externalHistory = '{"external":"history"}\n';
    writeFileSync(registryPath, originalRegistry);
    writeFileSync(historyPath, originalHistory);
    let injected = false;
    _setPresetRegistryHooksForTesting({
      beforeRename: ({ stage }) => {
        if (injected || stage !== 'registry') return;
        injected = true;
        writeFileSync(historyPath, externalHistory);
        throw new Error('forced registry rename failure after external history write');
      },
    });

    expect(() => scaffoldPresetIntoSquad(
      squadDir,
      [{ name: 'dev', role: 'developer' }],
      'starter',
    )).toThrow(/rollback requires recovery.*history\.json changed outside/);
    expect(readFileSync(historyPath, 'utf8')).toBe(externalHistory);
    expect(readFileSync(registryPath, 'utf8')).toBe(originalRegistry);
    expect(existsSync(journalPath)).toBe(true);
    expect(existsSync(join(castingDir, 'registry.lock'))).toBe(false);
    expect(readdirSync(castingDir).filter(name => name.includes('.tmp-'))).toEqual([]);
  });

  it('serializes a competing preset registry writer without losing revisions or history', async () => {
    const homeDir = join(TMP, 'apply-concurrent');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-concurrent/presets/starter/agents/dev');
    writeFile('apply-concurrent/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-concurrent/presets/starter/agents/dev/charter.md', '# Dev');

    const squadDir = join(TMP, 'target-concurrent');
    const agentsDir = join(squadDir, 'agents');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(castingDir, { recursive: true });

    const holder = spawn(process.execPath, [
      '--input-type=module',
      '-e',
      `
        import {
          closeSync, mkdirSync, openSync, unlinkSync, writeFileSync,
        } from 'node:fs';
        import { hostname } from 'node:os';
        import { join } from 'node:path';
        const castingDir = process.argv[1];
        mkdirSync(castingDir, { recursive: true });
        const lockPath = join(castingDir, 'registry.lock');
        const descriptor = openSync(lockPath, 'wx');
        const ownerToken = 'competitor-owner';
        writeFileSync(descriptor, JSON.stringify({
          version: 1,
          pid: process.pid,
          hostname: hostname(),
          created_at: new Date().toISOString(),
          owner_token: ownerToken,
        }) + '\\n');
        process.stdout.write('locked\\n');
        setTimeout(() => {
          const now = '2026-09-21T22:00:00.000Z';
          writeFileSync(join(castingDir, 'registry.json'), JSON.stringify({
            schema: 'squad-agent-provenance/v1',
            schema_version: 1,
            revision: 1,
            generated_at: now,
            agents: {
              competitor: {
                display_name: 'competitor',
                persistent_name: 'competitor',
                role: 'reviewer',
                universe: 'preset:competitor',
                status: 'active',
                created_at: now,
                updated_at: now,
              },
            },
          }, null, 2) + '\\n');
          writeFileSync(join(castingDir, 'history.json'), JSON.stringify({
            assignment_cast_snapshots: {
              'preset-competitor-revision-1': {
                created_at: now,
                agents: ['competitor'],
                universe: 'preset:competitor',
              },
            },
            universe_usage_history: [{
              universe: 'preset:competitor',
              used_at: now,
            }],
          }, null, 2) + '\\n');
          closeSync(descriptor);
          unlinkSync(lockPath);
        }, 200);
      `,
      castingDir,
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    const holderExit = new Promise<void>((resolve, reject) => {
      holder.once('error', reject);
      holder.once('exit', (code) => code === 0
        ? resolve()
        : reject(new Error(`competing writer exited with ${code}`)));
    });

    await new Promise<void>((resolve, reject) => {
      holder.once('error', reject);
      holder.stdout.once('data', (chunk) => {
        if (String(chunk).includes('locked')) resolve();
      });
    });

    applyPreset('starter', agentsDir);
    await holderExit;

    const registry = JSON.parse(
      readFileSync(join(castingDir, 'registry.json'), 'utf-8'),
    ) as { revision: number; agents: Record<string, unknown> };
    expect(registry.revision).toBe(2);
    expect(Object.keys(registry.agents).sort()).toEqual(['competitor', 'dev']);

    const history = JSON.parse(
      readFileSync(join(castingDir, 'history.json'), 'utf-8'),
    ) as {
      assignment_cast_snapshots: Record<string, unknown>;
      universe_usage_history: unknown[];
    };
    expect(Object.keys(history.assignment_cast_snapshots)).toHaveLength(2);
    expect(history.universe_usage_history).toHaveLength(2);
    expect(existsSync(join(castingDir, 'registry.lock'))).toBe(false);
    expect(readdirSync(castingDir).filter((name) => name.includes('.tmp-'))).toEqual([]);
  });

  it('keeps repeated preset revisions and history snapshots monotonic', () => {
    const homeDir = join(TMP, 'apply-repeated');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-repeated/presets/starter/agents/dev');
    writeFile('apply-repeated/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-repeated/presets/starter/agents/dev/charter.md', '# Dev');

    const squadDir = join(TMP, 'target-repeated');
    const agentsDir = join(squadDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    applyPreset('starter', agentsDir);
    applyPreset('starter', agentsDir);
    applyPreset('starter', agentsDir);

    const castingDir = join(squadDir, 'casting');
    const registry = JSON.parse(
      readFileSync(join(castingDir, 'registry.json'), 'utf-8'),
    ) as { revision: number };
    const history = JSON.parse(
      readFileSync(join(castingDir, 'history.json'), 'utf-8'),
    ) as { assignment_cast_snapshots: Record<string, unknown> };
    expect(registry.revision).toBe(3);
    expect(Object.keys(history.assignment_cast_snapshots)).toHaveLength(3);
    expect(
      readFileSync(join(castingDir, 'registry.json'), 'utf-8').endsWith('\n'),
    ).toBe(true);
    expect(
      readFileSync(join(castingDir, 'history.json'), 'utf-8').endsWith('\n'),
    ).toBe(true);
  });

  it('fails closed on malformed history before advancing the registry revision', () => {
    const homeDir = join(TMP, 'apply-malformed-history');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-malformed-history/presets/starter/agents/dev');
    writeFile('apply-malformed-history/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-malformed-history/presets/starter/agents/dev/charter.md', '# Dev');

    const squadDir = join(TMP, 'target-malformed-history');
    const agentsDir = join(squadDir, 'agents');
    const castingDir = join(squadDir, 'casting');
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(castingDir, { recursive: true });
    const originalRegistry = JSON.stringify({
      schema: 'squad-agent-provenance/v1',
      schema_version: 1,
      revision: 1,
      generated_at: '2026-09-21T22:00:00.000Z',
      agents: {},
    }, null, 2) + '\n';
    writeFileSync(join(castingDir, 'registry.json'), originalRegistry);
    writeFileSync(join(castingDir, 'history.json'), '{"assignment_cast_snapshots": []}\n');
    const originalHistory = readFileSync(join(castingDir, 'history.json'), 'utf8');
    const originalPolicy = '{"universe_allowlist":["existing"],"max_capacity":7}\n';
    const originalTeam = '# Existing team\n\n## Members\n\n| Name | Role | Charter | Status |\n|---|---|---|---|\n| old | lead | old | active |\n';
    const originalRouting = '# Existing routing\n';
    const originalCharter = '# Existing Dev\n';
    writeFileSync(join(castingDir, 'policy.json'), originalPolicy);
    writeFileSync(join(squadDir, 'team.md'), originalTeam);
    writeFileSync(join(squadDir, 'routing.md'), originalRouting);
    mkdirSync(join(agentsDir, 'dev'), { recursive: true });
    writeFileSync(join(agentsDir, 'dev', 'charter.md'), originalCharter);

    expect(applyPreset('starter', agentsDir, { force: true, overwriteRouting: true }))
      .toContainEqual(expect.objectContaining({
      agent: '<scaffold>',
      status: 'error',
      reason: expect.stringContaining('assignment_cast_snapshots must be an object'),
    }));
    expect(readFileSync(join(castingDir, 'registry.json'), 'utf-8')).toBe(originalRegistry);
    expect(readFileSync(join(castingDir, 'history.json'), 'utf-8')).toBe(originalHistory);
    expect(readFileSync(join(castingDir, 'policy.json'), 'utf-8')).toBe(originalPolicy);
    expect(readFileSync(join(squadDir, 'team.md'), 'utf-8')).toBe(originalTeam);
    expect(readFileSync(join(squadDir, 'routing.md'), 'utf-8')).toBe(originalRouting);
    expect(readFileSync(join(agentsDir, 'dev', 'charter.md'), 'utf-8')).toBe(originalCharter);
    expect(existsSync(join(castingDir, 'registry.lock'))).toBe(false);
    expect(readdirSync(castingDir).filter(name => name.includes('.tmp-'))).toEqual([]);
  });

  it('preserves built-in role status labels in team.md (Scribe/Ralph/Rai/Fact Checker) — review on #1293', () => {
    // A preset that happens to ship one of the always-on built-ins (Scribe,
    // Ralph, Rai, Fact Checker) must produce the same Status cell that a
    // fresh `squad init` cast would — '📋 Silent', '🔄 Monitor', '🛡️ RAI',
    // '🔍 Verifier' respectively — NOT '✅ Active'. Pre-fix, memberRow()
    // hardcoded '✅ Active' for every preset agent, which made
    // preset-scaffolded teams visually disagree with cast-scaffolded teams
    // for the same roster.
    const homeDir = join(TMP, 'apply-status-roles');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold(
      'apply-status-roles/presets/builtins/agents/scribe',
      'apply-status-roles/presets/builtins/agents/ralph',
      'apply-status-roles/presets/builtins/agents/rai',
      'apply-status-roles/presets/builtins/agents/fact-checker',
      'apply-status-roles/presets/builtins/agents/dev',
    );
    writeFile('apply-status-roles/presets/builtins/preset.json', JSON.stringify({
      name: 'builtins',
      version: '1.0.0',
      description: 'Preset that ships built-in roles',
      agents: [
        { name: 'scribe', role: 'Session Logger' },
        { name: 'ralph', role: 'Work Monitor' },
        { name: 'rai', role: 'RAI Reviewer' },
        { name: 'fact-checker', role: 'Fact Checker' },
        { name: 'dev', role: 'developer' },
      ],
    }));
    for (const a of ['scribe', 'ralph', 'rai', 'fact-checker', 'dev']) {
      writeFile(`apply-status-roles/presets/builtins/agents/${a}/charter.md`, `# ${a}`);
    }

    const squadDir = join(TMP, 'target-status-roles');
    const agentsDir = join(squadDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    applyPreset('builtins', agentsDir);

    const teamMd = readFileSync(join(squadDir, 'team.md'), 'utf-8');
    expect(teamMd).toContain('| scribe | Session Logger | `.squad/agents/scribe/charter.md` | 📋 Silent |');
    expect(teamMd).toContain('| ralph | Work Monitor | `.squad/agents/ralph/charter.md` | 🔄 Monitor |');
    expect(teamMd).toContain('| rai | RAI Reviewer | `.squad/agents/rai/charter.md` | 🛡️ RAI |');
    expect(teamMd).toContain('| fact-checker | Fact Checker | `.squad/agents/fact-checker/charter.md` | 🔍 Verifier |');
    // Regular agent still gets ✅ Active.
    expect(teamMd).toContain('| dev | developer | `.squad/agents/dev/charter.md` | ✅ Active |');
  });

  it('appends routing rows for preset agents to routing.md (#1288)', () => {
    const homeDir = join(TMP, 'apply-routing');
    process.env['SQUAD_HOME'] = homeDir;

    scaffold('apply-routing/presets/starter/agents/dev');
    writeFile('apply-routing/presets/starter/preset.json', JSON.stringify({
      name: 'starter',
      version: '1.0.0',
      description: 'Starter preset',
      agents: [{ name: 'dev', role: 'developer' }],
    }));
    writeFile('apply-routing/presets/starter/agents/dev/charter.md', '# Dev');

    const squadDir = join(TMP, 'target-routing');
    const agentsDir = join(squadDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    applyPreset('starter', agentsDir);

    const routing = readFileSync(join(squadDir, 'routing.md'), 'utf-8');
    expect(routing).toContain('## Work Type → Agent');
    expect(routing).toContain('| developer | dev |');
  });
});

// ============================================================================
// seedBuiltinPresets()
// ============================================================================

describe('seedBuiltinPresets()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('seeds the default preset into squad home', () => {
    const homeDir = join(TMP, 'seed-home');
    process.env['SQUAD_HOME'] = homeDir;

    const seeded = seedBuiltinPresets();
    expect(seeded).toContain('default');

    // Verify preset was copied
    expect(existsSync(join(homeDir, 'presets', 'default', 'preset.json'))).toBe(true);
    expect(existsSync(join(homeDir, 'presets', 'default', 'agents', 'lead', 'charter.md'))).toBe(true);
  });

  it('does not overwrite existing presets', () => {
    const homeDir = join(TMP, 'seed-existing');
    process.env['SQUAD_HOME'] = homeDir;

    // Create a custom default preset
    mkdirSync(join(homeDir, 'presets', 'default'), { recursive: true });
    writeFileSync(join(homeDir, 'presets', 'default', 'custom-marker.txt'), 'mine');

    const seeded = seedBuiltinPresets();
    expect(seeded).not.toContain('default');
    expect(existsSync(join(homeDir, 'presets', 'default', 'custom-marker.txt'))).toBe(true);
  });
});

// ============================================================================
// resolvePresetsDir()
// ============================================================================

describe('resolvePresetsDir()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('returns null when squad home does not exist', () => {
    process.env['SQUAD_HOME'] = join(TMP, 'nonexistent');
    expect(resolvePresetsDir()).toBeNull();
  });

  it('returns null when presets/ does not exist', () => {
    const homeDir = join(TMP, 'no-presets-dir');
    mkdirSync(homeDir, { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    expect(resolvePresetsDir()).toBeNull();
  });

  it('returns presets/ path when it exists', () => {
    const homeDir = join(TMP, 'with-presets');
    mkdirSync(join(homeDir, 'presets'), { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    expect(resolvePresetsDir()).toBe(join(homeDir, 'presets'));
  });
});

// ============================================================================
// savePreset()
// ============================================================================

describe('savePreset()', () => {
  const originalEnv = process.env['SQUAD_HOME'];

  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    if (originalEnv !== undefined) {
      process.env['SQUAD_HOME'] = originalEnv;
    } else {
      delete process.env['SQUAD_HOME'];
    }
  });

  it('saves current project agents as a named preset', () => {
    const homeDir = join(TMP, 'save-home');
    mkdirSync(homeDir, { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    // Create a fake project squad with agents
    const squadDir = join(TMP, 'project', '.squad');
    const agentsDir = join(squadDir, 'agents');
    mkdirSync(join(agentsDir, 'helper'), { recursive: true });
    writeFileSync(join(agentsDir, 'helper', 'charter.md'), '## Helper — Utility Agent\nHelps with misc tasks.');

    const destDir = savePreset('my-team', squadDir);

    expect(existsSync(destDir)).toBe(true);
    expect(existsSync(join(destDir, 'preset.json'))).toBe(true);
    expect(existsSync(join(destDir, 'agents', 'helper', 'charter.md'))).toBe(true);

    // Verify manifest
    const manifest = JSON.parse(readFileSync(join(destDir, 'preset.json'), 'utf-8'));
    expect(manifest.name).toBe('my-team');
    expect(manifest.agents).toHaveLength(1);
    expect(manifest.agents[0].name).toBe('helper');
  });

  it('throws if preset already exists without --force', () => {
    const homeDir = join(TMP, 'save-dup');
    mkdirSync(join(homeDir, 'presets', 'existing'), { recursive: true });
    writeFileSync(join(homeDir, 'presets', 'existing', 'preset.json'), '{}');
    process.env['SQUAD_HOME'] = homeDir;

    const squadDir = join(TMP, 'proj', '.squad');
    mkdirSync(join(squadDir, 'agents', 'a1'), { recursive: true });
    writeFileSync(join(squadDir, 'agents', 'a1', 'charter.md'), '# Agent');

    expect(() => savePreset('existing', squadDir)).toThrow(/already exists/);
  });

  it('overwrites existing preset with force', () => {
    const homeDir = join(TMP, 'save-force');
    mkdirSync(join(homeDir, 'presets', 'team'), { recursive: true });
    writeFileSync(join(homeDir, 'presets', 'team', 'preset.json'), '{}');
    process.env['SQUAD_HOME'] = homeDir;

    const squadDir = join(TMP, 'proj2', '.squad');
    mkdirSync(join(squadDir, 'agents', 'bot'), { recursive: true });
    writeFileSync(join(squadDir, 'agents', 'bot', 'charter.md'), '# Bot');

    const destDir = savePreset('team', squadDir, { force: true });
    expect(existsSync(join(destDir, 'agents', 'bot', 'charter.md'))).toBe(true);
  });

  it('round-trips: save then apply to a new project', () => {
    const homeDir = join(TMP, 'roundtrip');
    mkdirSync(homeDir, { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    // Create source project with 2 agents
    const srcSquad = join(TMP, 'src-proj', '.squad');
    mkdirSync(join(srcSquad, 'agents', 'alpha'), { recursive: true });
    mkdirSync(join(srcSquad, 'agents', 'beta'), { recursive: true });
    writeFileSync(join(srcSquad, 'agents', 'alpha', 'charter.md'), '## Alpha — Lead\nLeads the team.');
    writeFileSync(join(srcSquad, 'agents', 'beta', 'charter.md'), '## Beta — Reviewer\nReviews code.');

    // Save as preset
    savePreset('my-squad', srcSquad, { description: 'My custom squad' });

    // Apply to new project
    const destAgents = join(TMP, 'dest-proj', '.squad', 'agents');
    mkdirSync(destAgents, { recursive: true });

    const results = applyPreset('my-squad', destAgents);
    expect(results.filter(r => r.status === 'installed')).toHaveLength(2);
    expect(readFileSync(join(destAgents, 'alpha', 'charter.md'), 'utf-8')).toContain('Alpha');
    expect(readFileSync(join(destAgents, 'beta', 'charter.md'), 'utf-8')).toContain('Beta');
  });

  it('round-trips routing.md with custom rules (#1412)', () => {
    const homeDir = join(TMP, 'roundtrip-routing');
    mkdirSync(homeDir, { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    // Create source project with agents and a custom routing.md
    const srcSquad = join(TMP, 'src-routing', '.squad');
    mkdirSync(join(srcSquad, 'agents', 'alpha'), { recursive: true });
    mkdirSync(join(srcSquad, 'agents', 'beta'), { recursive: true });
    writeFileSync(join(srcSquad, 'agents', 'alpha', 'charter.md'), '## Alpha — Lead\nLeads the team.');
    writeFileSync(join(srcSquad, 'agents', 'beta', 'charter.md'), '## Beta — Reviewer\nReviews code.');

    const customRouting = [
      '# Squad Routing',
      '',
      '## Work Type → Agent',
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      '| architecture | Alpha | Beta |',
      '| code-review | Beta | Alpha |',
      '',
      '## Label Routing',
      '',
      '| Label | Agent | Priority |',
      '|-------|-------|----------|',
      '| bug | Beta | high |',
      '| feature | Alpha | normal |',
      '',
      '## Module Ownership',
      '',
      '| Path Pattern | Owner |',
      '|-------------|-------|',
      '| src/core/** | Alpha |',
      '| src/tests/** | Beta |',
      '',
    ].join('\n');
    writeFileSync(join(srcSquad, 'routing.md'), customRouting);

    // Save as preset
    savePreset('routed-squad', srcSquad, { description: 'Squad with routing' });

    // Verify routing.md was captured in the preset
    const presetDir = join(homeDir, 'presets', 'routed-squad');
    expect(existsSync(join(presetDir, 'routing.md'))).toBe(true);
    expect(readFileSync(join(presetDir, 'routing.md'), 'utf-8')).toBe(customRouting);

    // Apply to a new project
    const destSquad = join(TMP, 'dest-routing', '.squad');
    const destAgentsDir = join(destSquad, 'agents');
    mkdirSync(destAgentsDir, { recursive: true });

    const results = applyPreset('routed-squad', destAgentsDir);
    expect(results.filter(r => r.status === 'installed')).toHaveLength(2);

    // Verify routing.md was faithfully restored (not regenerated from template)
    const restoredRouting = readFileSync(join(destSquad, 'routing.md'), 'utf-8');
    expect(restoredRouting).toContain('## Label Routing');
    expect(restoredRouting).toContain('## Module Ownership');
    expect(restoredRouting).toContain('src/core/**');
    expect(restoredRouting).toContain('| bug | Beta | high |');
  });

  it('restores preset routing.md over existing skeleton when overwriteRouting is set (#1412)', () => {
    const homeDir = join(TMP, 'overwrite-routing');
    mkdirSync(homeDir, { recursive: true });
    process.env['SQUAD_HOME'] = homeDir;

    // Create source project with agents and a custom routing.md
    const srcSquad = join(TMP, 'src-overwrite', '.squad');
    mkdirSync(join(srcSquad, 'agents', 'alpha'), { recursive: true });
    writeFileSync(join(srcSquad, 'agents', 'alpha', 'charter.md'), '## Alpha — Lead\nLeads the team.');

    const customRouting = [
      '# Squad Routing',
      '',
      '## Work Type → Agent',
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      '| architecture | Alpha | — |',
      '',
      '## Module Ownership',
      '',
      '| Path Pattern | Owner |',
      '|-------------|-------|',
      '| src/core/** | Alpha |',
      '',
    ].join('\n');
    writeFileSync(join(srcSquad, 'routing.md'), customRouting);

    // Save as preset
    savePreset('overwrite-test', srcSquad, { description: 'Test overwrite' });

    // Simulate squad init having already created a skeleton routing.md
    const destSquad = join(TMP, 'dest-overwrite', '.squad');
    const destAgentsDir = join(destSquad, 'agents');
    mkdirSync(destAgentsDir, { recursive: true });
    writeFileSync(join(destSquad, 'routing.md'), '# Squad Routing\n\n## Work Type → Agent\n\n| Work Type | Primary | Secondary |\n|-----------|---------|----------|\n');

    // Apply with overwriteRouting
    const results = applyPreset('overwrite-test', destAgentsDir, { overwriteRouting: true });
    expect(results.filter(r => r.status === 'installed')).toHaveLength(1);

    // Verify the preset's routing was used, not the skeleton
    const restoredRouting = readFileSync(join(destSquad, 'routing.md'), 'utf-8');
    expect(restoredRouting).toContain('## Module Ownership');
    expect(restoredRouting).toContain('src/core/**');
  });
});

// ============================================================================
// installPresetFromSource() — new in PR #1225, regression tests added per
// review feedback (#1225 comment #3369713129: 'add focused tests')
// ============================================================================
//
// These tests cover the LOCAL path branch (single-preset, collection,
// --force overwrite, --name rename + manifest stamping, plus the validation
// guards that came out of the review). Remote (URL) branch is exercised by
// the same code path via resolveInstallSource — splitting the git clone
// into a small helper so it can be stubbed is a separate follow-up.

import { installPresetFromSource } from '@bradygaster/squad-sdk/presets';

describe('installPresetFromSource() — local paths', () => {
  const originalEnv = process.env['SQUAD_HOME'];
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env['SQUAD_HOME'];
    else process.env['SQUAD_HOME'] = originalEnv;
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it('installs a single-preset local source (startDir/preset.json present)', () => {
    const homeDir = join(TMP, 'home-single');
    process.env['SQUAD_HOME'] = homeDir;
    const src = join(TMP, 'source-single');
    mkdirSync(join(src, 'agents', 'a1'), { recursive: true });
    writeFileSync(join(src, 'preset.json'), JSON.stringify({ name: 'starter', version: '1.0.0', description: 'demo', agents: [{ name: 'a1', role: 'lead' }] }));
    writeFileSync(join(src, 'agents', 'a1', 'charter.md'), '# A1');

    const result = installPresetFromSource(src);
    expect(result.installedName).toBe('starter');
    expect(existsSync(join(result.installedDir, 'preset.json'))).toBe(true);
    expect(existsSync(join(result.installedDir, 'agents', 'a1', 'charter.md'))).toBe(true);
  });

  it('selects a preset from a collection via --name', () => {
    const homeDir = join(TMP, 'home-collection');
    process.env['SQUAD_HOME'] = homeDir;
    const src = join(TMP, 'source-collection');
    for (const name of ['alpha', 'beta']) {
      mkdirSync(join(src, 'presets', name, 'agents', 'lead'), { recursive: true });
      writeFileSync(join(src, 'presets', name, 'preset.json'), JSON.stringify({ name, version: '1.0.0', description: name, agents: [{ name: 'lead', role: 'lead' }] }));
      writeFileSync(join(src, 'presets', name, 'agents', 'lead', 'charter.md'), `# ${name} lead`);
    }

    const result = installPresetFromSource(src, { name: 'beta' });
    expect(result.installedName).toBe('beta');
    expect(readFileSync(join(result.installedDir, 'agents', 'lead', 'charter.md'), 'utf-8')).toContain('beta lead');
  });

  it('throws on collection source without --name (instead of silently grabbing one)', () => {
    const homeDir = join(TMP, 'home-collection-nopick');
    process.env['SQUAD_HOME'] = homeDir;
    const src = join(TMP, 'source-collection-nopick');
    for (const name of ['alpha', 'beta']) {
      mkdirSync(join(src, 'presets', name, 'agents', 'lead'), { recursive: true });
      writeFileSync(join(src, 'presets', name, 'preset.json'), JSON.stringify({ name, version: '1.0.0', description: name, agents: [{ name: 'lead', role: 'lead' }] }));
      writeFileSync(join(src, 'presets', name, 'agents', 'lead', 'charter.md'), `# ${name}`);
    }
    expect(() => installPresetFromSource(src)).toThrow(/multiple presets/i);
  });

  it('--force overwrites an existing preset of the same name', () => {
    const homeDir = join(TMP, 'home-force');
    process.env['SQUAD_HOME'] = homeDir;
    const src = join(TMP, 'source-force');
    mkdirSync(join(src, 'agents', 'a1'), { recursive: true });
    writeFileSync(join(src, 'preset.json'), JSON.stringify({ name: 'collision', version: '1.0.0', description: 'v1', agents: [{ name: 'a1', role: 'lead' }] }));
    writeFileSync(join(src, 'agents', 'a1', 'charter.md'), '# v1');

    installPresetFromSource(src);
    // Mutate source to v2
    writeFileSync(join(src, 'preset.json'), JSON.stringify({ name: 'collision', version: '2.0.0', description: 'v2', agents: [{ name: 'a1', role: 'lead' }] }));
    writeFileSync(join(src, 'agents', 'a1', 'charter.md'), '# v2');

    expect(() => installPresetFromSource(src)).toThrow(/already exists.*--force/);

    const result = installPresetFromSource(src, { force: true });
    expect(JSON.parse(readFileSync(join(result.installedDir, 'preset.json'), 'utf-8')).description).toBe('v2');
    expect(readFileSync(join(result.installedDir, 'agents', 'a1', 'charter.md'), 'utf-8')).toContain('v2');
  });

  it('--name renames the preset AND stamps manifest.name with the new name', () => {
    const homeDir = join(TMP, 'home-rename');
    process.env['SQUAD_HOME'] = homeDir;
    const src = join(TMP, 'source-rename');
    mkdirSync(join(src, 'agents', 'a1'), { recursive: true });
    writeFileSync(join(src, 'preset.json'), JSON.stringify({ name: 'upstream-name', version: '1.0.0', description: 'demo', agents: [{ name: 'a1', role: 'lead' }] }));
    writeFileSync(join(src, 'agents', 'a1', 'charter.md'), '# A1');

    const result = installPresetFromSource(src, { name: 'my-renamed' });
    expect(result.installedName).toBe('my-renamed');
    // Manifest must be stamped so list/show stay consistent
    const stamped = JSON.parse(readFileSync(join(result.installedDir, 'preset.json'), 'utf-8'));
    expect(stamped.name).toBe('my-renamed');
    // Other manifest fields must be preserved
    expect(stamped.version).toBe('1.0.0');
    expect(stamped.description).toBe('demo');
    expect(stamped.agents).toHaveLength(1);
  });

  it('rejects --name containing path separators (defends against ../escape)', () => {
    const homeDir = join(TMP, 'home-reject-name');
    process.env['SQUAD_HOME'] = homeDir;
    const src = join(TMP, 'source-reject-name');
    mkdirSync(join(src, 'agents', 'a1'), { recursive: true });
    writeFileSync(join(src, 'preset.json'), JSON.stringify({ name: 'demo', version: '1.0.0', description: 'demo', agents: [{ name: 'a1', role: 'lead' }] }));
    writeFileSync(join(src, 'agents', 'a1', 'charter.md'), '# A1');

    for (const bad of ['../escape', 'a/b', 'a\\b', '..', '.', 'foo\0bar']) {
      expect(() => installPresetFromSource(src, { name: bad }), `must reject '${bad}'`).toThrow();
    }
  });

  it('throws on empty source', () => {
    expect(() => installPresetFromSource('')).toThrow(/required/i);
  });
});
