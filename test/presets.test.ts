/**
 * Tests for SQUAD_HOME resolution and preset system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveSquadHome, ensureSquadHome, resolvePresetsDir } from '@bradygaster/squad-sdk/resolution';
import { listPresets, loadPreset, applyPreset, savePreset, seedBuiltinPresets } from '@bradygaster/squad-sdk/presets';

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
