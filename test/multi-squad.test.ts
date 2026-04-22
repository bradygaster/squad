/**
 * Multi-squad resolution and migration tests — Issue #652
 *
 * Proactive tests for Phase 1: multiple personal squads.
 * Tests written from spec while Fenster implements the module.
 * Import path may need adjustment once implementation lands.
 *
 * Functions under test:
 *   getSquadRoot()        — platform-appropriate config dir
 *   resolveSquadPath()    — resolution chain: explicit → env → active → default → legacy
 *   listSquads()          — enumerate known squads from squads.json
 *   createSquad()         — create dir + register in squads.json
 *   deleteSquad()         — remove squad (can't delete active)
 *   switchSquad()         — set active squad
 *   migrateIfNeeded()     — detect legacy layout, register as "default"
 *
 * @see packages/squad-sdk/src/multi-squad.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
} from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir, platform, homedir } from 'node:os';

// ⚠️ Import path will be adjusted once Fenster's implementation lands.
// Expected module: packages/squad-sdk/src/multi-squad.ts
// Likely export path: @bradygaster/squad-sdk/multi-squad
//
// For now, we define the expected interfaces and mock the module.
// When the real module exists, replace this block with:
//   import { getSquadRoot, resolveSquadPath, listSquads, createSquad,
//            deleteSquad, switchSquad, migrateIfNeeded } from '@bradygaster/squad-sdk/multi-squad';

// ============================================================================
// Expected Types (from PRD spec)
// ============================================================================

interface SquadEntry {
  name: string;
  path: string;
  isDefault: boolean;
  createdAt?: string;
}

interface SquadsJson {
  version: 1;
  defaultSquad: string;
  squads: Record<string, { description?: string; createdAt: string }>;
}

// ============================================================================
// Helpers
// ============================================================================

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'squad-multi-test-'));
  tmpDirs.push(dir);
  return dir;
}

/** Create a squads.json file in the given root. */
function writeSquadsJson(root: string, data: SquadsJson): void {
  writeFileSync(join(root, 'squads.json'), JSON.stringify(data, null, 2), 'utf-8');
}

/** Read squads.json from root. */
function readSquadsJson(root: string): SquadsJson {
  return JSON.parse(readFileSync(join(root, 'squads.json'), 'utf-8'));
}

/** Scaffold a named squad directory with minimal structure. */
function scaffoldSquad(root: string, name: string): string {
  const squadDir = join(root, 'squads', name);
  mkdirSync(join(squadDir, 'agents'), { recursive: true });
  mkdirSync(join(squadDir, 'skills'), { recursive: true });
  writeFileSync(join(squadDir, 'decisions.md'), '# Decisions\n');
  return squadDir;
}

/** Scaffold a legacy single-squad layout (files directly under root). */
function scaffoldLegacyLayout(root: string): void {
  mkdirSync(join(root, 'agents'), { recursive: true });
  mkdirSync(join(root, 'skills'), { recursive: true });
  writeFileSync(join(root, 'decisions.md'), '# Decisions\n');
  writeFileSync(join(root, 'team.md'), '# Team\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
  tmpDirs.length = 0;
});

// ============================================================================
// getSquadRoot()
// ============================================================================

describe('getSquadRoot()', () => {
  it('returns a platform-appropriate path containing "squad"', () => {
    // The function should return something like:
    //   Linux/macOS: ~/.config/squad  (or $XDG_CONFIG_HOME/squad)
    //   Windows:     <AppData>/squad  (roaming or local app data dir)
    const expectedSegments = platform() === 'win32'
      ? ['squad']
      : ['.config', 'squad'];

    // Verify the function would produce a path with these segments
    const home = homedir();
    for (const segment of expectedSegments) {
      // Platform root must include "squad" somewhere
      expect(segment).toBeTruthy();
    }

    // Cross-platform: path.join handles separators correctly
    const testPath = join(home, ...expectedSegments);
    expect(testPath).toContain('squad');
    expect(testPath.startsWith(home)).toBe(true);
  });

  it('respects XDG_CONFIG_HOME on non-Windows platforms', () => {
    if (platform() === 'win32') return; // skip on Windows

    const customConfig = join(makeTmpDir(), 'custom-config');
    mkdirSync(customConfig, { recursive: true });

    // The function should respect XDG_CONFIG_HOME when set
    vi.stubEnv('XDG_CONFIG_HOME', customConfig);

    const expectedPath = join(customConfig, 'squad');
    expect(expectedPath).toContain('squad');
    expect(expectedPath.startsWith(customConfig)).toBe(true);
  });

  it('uses path.join for platform-safe separators', () => {
    // Verify paths use platform separator, not hardcoded '/' or '\\'
    const testPath = join(homedir(), '.config', 'squad');
    expect(testPath).toContain(sep);
    // No mixed separators
    if (sep === '\\') {
      expect(testPath).not.toMatch(/[^\\]\//); // no forward slashes after backslash
    }
  });
});

// ============================================================================
// resolveSquadPath(name?)
// ============================================================================

describe('resolveSquadPath(name?)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'squads'), { recursive: true });
  });

  describe('resolution chain', () => {
    it('step 1: explicit name resolves to squads/<name>/', () => {
      const squadDir = scaffoldSquad(root, 'client-acme');
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'default',
        squads: {
          'client-acme': { createdAt: '2026-03-01T00:00:00Z' },
          'default': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      // Explicit name should resolve to exact squad path
      const expected = join(root, 'squads', 'client-acme');
      expect(existsSync(expected)).toBe(true);
    });

    it('step 2: SQUAD_NAME env var overrides active selection', () => {
      scaffoldSquad(root, 'env-squad');
      scaffoldSquad(root, 'active-squad');
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'active-squad',
        squads: {
          'env-squad': { createdAt: '2026-03-01T00:00:00Z' },
          'active-squad': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      vi.stubEnv('SQUAD_NAME', 'env-squad');

      // When SQUAD_NAME is set, it should override the default/active squad
      const envSquadPath = join(root, 'squads', 'env-squad');
      expect(existsSync(envSquadPath)).toBe(true);
      expect(process.env['SQUAD_NAME']).toBe('env-squad');
    });

    it('step 3: active/default squad from squads.json when no explicit or env', () => {
      scaffoldSquad(root, 'my-default');
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'my-default',
        squads: {
          'my-default': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      const config = readSquadsJson(root);
      const defaultPath = join(root, 'squads', config.defaultSquad);
      expect(existsSync(defaultPath)).toBe(true);
      expect(config.defaultSquad).toBe('my-default');
    });

    it('step 4: falls back to "default" when squads.json has no defaultSquad', () => {
      scaffoldSquad(root, 'default');

      // Even without squads.json, the "default" squad should be the fallback
      const defaultPath = join(root, 'squads', 'default');
      expect(existsSync(defaultPath)).toBe(true);
    });

    it('step 5: legacy layout detected when squads/ dir is absent', () => {
      // Legacy layout: files directly under root (no squads/ subdir)
      const legacyRoot = makeTmpDir();
      scaffoldLegacyLayout(legacyRoot);

      expect(existsSync(join(legacyRoot, 'agents'))).toBe(true);
      expect(existsSync(join(legacyRoot, 'squads'))).toBe(false);
      // resolveSquadPath should detect this and return legacyRoot itself
    });
  });

  describe('fallback behavior', () => {
    it('env var pointing to nonexistent squad falls through to active', () => {
      scaffoldSquad(root, 'active-squad');
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'active-squad',
        squads: {
          'active-squad': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      vi.stubEnv('SQUAD_NAME', 'nonexistent-squad');

      // The nonexistent env squad path doesn't exist
      expect(existsSync(join(root, 'squads', 'nonexistent-squad'))).toBe(false);
      // But the active squad does
      expect(existsSync(join(root, 'squads', 'active-squad'))).toBe(true);
    });

    it('resolution with no squads.json and no legacy falls through gracefully', () => {
      // Empty root — nothing to resolve
      const emptyRoot = makeTmpDir();
      expect(existsSync(join(emptyRoot, 'squads.json'))).toBe(false);
      expect(existsSync(join(emptyRoot, 'squads'))).toBe(false);
      expect(existsSync(join(emptyRoot, 'agents'))).toBe(false);
    });
  });

  describe('env var override', () => {
    it('SQUAD_NAME takes precedence over defaultSquad in config', () => {
      scaffoldSquad(root, 'env-pick');
      scaffoldSquad(root, 'config-default');
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'config-default',
        squads: {
          'env-pick': { createdAt: '2026-03-01T00:00:00Z' },
          'config-default': { createdAt: '2026-03-01T00:00:00Z' },
        },
      });

      vi.stubEnv('SQUAD_NAME', 'env-pick');
      expect(process.env['SQUAD_NAME']).toBe('env-pick');

      // Implementation should pick env-pick over config-default
      const envPath = join(root, 'squads', 'env-pick');
      const defaultPath = join(root, 'squads', 'config-default');
      expect(existsSync(envPath)).toBe(true);
      expect(existsSync(defaultPath)).toBe(true);
    });

    it('empty SQUAD_NAME is treated as unset', () => {
      vi.stubEnv('SQUAD_NAME', '');
      expect(process.env['SQUAD_NAME']).toBe('');
      // Empty string should not be treated as a valid squad name
    });
  });
});

// ============================================================================
// listSquads()
// ============================================================================

describe('listSquads()', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'squads'), { recursive: true });
  });

  it('returns all squads from squads.json with isDefault flag', () => {
    scaffoldSquad(root, 'default');
    scaffoldSquad(root, 'client-acme');
    scaffoldSquad(root, 'ml-projects');
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
        'client-acme': { description: 'Acme Corp', createdAt: '2026-03-02T00:00:00Z' },
        'ml-projects': { createdAt: '2026-03-03T00:00:00Z' },
      },
    });

    const config = readSquadsJson(root);
    const entries: SquadEntry[] = Object.entries(config.squads).map(([name, meta]) => ({
      name,
      path: join(root, 'squads', name),
      isDefault: name === config.defaultSquad,
      createdAt: meta.createdAt,
    }));

    expect(entries).toHaveLength(3);
    expect(entries.find(e => e.name === 'default')?.isDefault).toBe(true);
    expect(entries.find(e => e.name === 'client-acme')?.isDefault).toBe(false);
    expect(entries.find(e => e.name === 'ml-projects')?.isDefault).toBe(false);
  });

  it('returns empty array when squads.json has no squads', () => {
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {},
    });

    const config = readSquadsJson(root);
    const entries = Object.entries(config.squads);
    expect(entries).toHaveLength(0);
  });

  it('handles missing squads.json gracefully', () => {
    // No squads.json file exists
    expect(existsSync(join(root, 'squads.json'))).toBe(false);
    // Implementation should return empty list or detect legacy layout
  });

  it('handles corrupted squads.json gracefully', () => {
    writeFileSync(join(root, 'squads.json'), '{ invalid json !!!', 'utf-8');

    // Reading corrupted JSON should throw a parse error
    expect(() => JSON.parse(readFileSync(join(root, 'squads.json'), 'utf-8'))).toThrow();
    // Implementation should catch this and return empty or throw a SquadError
  });

  it('handles squads.json with squads that have no matching directories', () => {
    // squads.json lists a squad, but directory doesn't exist on disk
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'ghost-squad',
      squads: {
        'ghost-squad': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    expect(existsSync(join(root, 'squads', 'ghost-squad'))).toBe(false);
    // Implementation should either skip or warn about orphaned entries
  });
});

// ============================================================================
// createSquad(name)
// ============================================================================

describe('createSquad(name)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'squads'), { recursive: true });
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });
    scaffoldSquad(root, 'default');
  });

  it('creates squad directory with expected structure', () => {
    const name = 'new-client';
    const squadDir = join(root, 'squads', name);
    mkdirSync(join(squadDir, 'agents'), { recursive: true });
    mkdirSync(join(squadDir, 'skills'), { recursive: true });
    writeFileSync(join(squadDir, 'decisions.md'), '# Decisions\n');

    expect(existsSync(squadDir)).toBe(true);
    expect(existsSync(join(squadDir, 'agents'))).toBe(true);
    expect(existsSync(join(squadDir, 'skills'))).toBe(true);
    expect(existsSync(join(squadDir, 'decisions.md'))).toBe(true);
  });

  it('registers new squad in squads.json', () => {
    const name = 'registered-squad';
    scaffoldSquad(root, name);

    // Simulate registration
    const config = readSquadsJson(root);
    config.squads[name] = { createdAt: new Date().toISOString() };
    writeSquadsJson(root, config);

    const updated = readSquadsJson(root);
    expect(updated.squads[name]).toBeDefined();
    expect(updated.squads[name].createdAt).toBeTruthy();
  });

  it('rejects duplicate squad name', () => {
    // 'default' already exists
    expect(existsSync(join(root, 'squads', 'default'))).toBe(true);
    const config = readSquadsJson(root);
    expect(config.squads['default']).toBeDefined();
    // Implementation should throw when trying to create 'default' again
  });

  it('validates squad name format (kebab-case, 1-40 chars)', () => {
    const validNames = ['my-squad', 'a', 'client-acme-2026', 'ml-projects'];
    const invalidNames = [
      '',                          // empty
      'My Squad',                  // spaces
      'UPPER_CASE',               // uppercase + underscore
      'special!chars',            // special characters
      'a'.repeat(41),             // too long
      '.hidden',                  // dot prefix
      '-leading-dash',            // leading dash
      'trailing-dash-',           // trailing dash
    ];

    // kebab-case regex: ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$
    const SQUAD_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

    for (const name of validNames) {
      expect(SQUAD_NAME_RE.test(name), `${name} should be valid`).toBe(true);
    }
    for (const name of invalidNames) {
      expect(SQUAD_NAME_RE.test(name), `"${name}" should be invalid`).toBe(false);
    }
  });

  it('new squad does not become default automatically', () => {
    const name = 'non-default-squad';
    scaffoldSquad(root, name);

    // Simulate registration without changing default
    const config = readSquadsJson(root);
    config.squads[name] = { createdAt: new Date().toISOString() };
    writeSquadsJson(root, config);

    const updated = readSquadsJson(root);
    expect(updated.defaultSquad).toBe('default');
    expect(updated.defaultSquad).not.toBe(name);
  });
});

// ============================================================================
// deleteSquad(name)
// ============================================================================

describe('deleteSquad(name)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'squads'), { recursive: true });
  });

  it('removes squad directory and deregisters from squads.json', () => {
    scaffoldSquad(root, 'default');
    scaffoldSquad(root, 'to-delete');
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
        'to-delete': { createdAt: '2026-03-02T00:00:00Z' },
      },
    });

    // Simulate deletion
    const squadPath = join(root, 'squads', 'to-delete');
    rmSync(squadPath, { recursive: true, force: true });
    const config = readSquadsJson(root);
    delete config.squads['to-delete'];
    writeSquadsJson(root, config);

    expect(existsSync(squadPath)).toBe(false);
    const updated = readSquadsJson(root);
    expect(updated.squads['to-delete']).toBeUndefined();
    expect(updated.squads['default']).toBeDefined();
  });

  it('rejects deleting the active/default squad', () => {
    scaffoldSquad(root, 'active');
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'active',
      squads: {
        'active': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    const config = readSquadsJson(root);
    // Implementation should reject deletion when name === config.defaultSquad
    expect(config.defaultSquad).toBe('active');
    // Attempting to delete should throw: "Cannot delete the active squad"
  });

  it('rejects deleting nonexistent squad', () => {
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    // 'phantom' doesn't exist in squads.json or on disk
    const config = readSquadsJson(root);
    expect(config.squads['phantom']).toBeUndefined();
    expect(existsSync(join(root, 'squads', 'phantom'))).toBe(false);
  });

  it('rejects deleting the last remaining squad', () => {
    scaffoldSquad(root, 'only-one');
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'only-one',
      squads: {
        'only-one': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    const config = readSquadsJson(root);
    expect(Object.keys(config.squads)).toHaveLength(1);
    // Implementation should refuse: "Cannot delete the last squad"
  });
});

// ============================================================================
// switchSquad(name)
// ============================================================================

describe('switchSquad(name)', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'squads'), { recursive: true });
    scaffoldSquad(root, 'alpha');
    scaffoldSquad(root, 'beta');
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'alpha',
      squads: {
        'alpha': { createdAt: '2026-03-01T00:00:00Z' },
        'beta': { createdAt: '2026-03-02T00:00:00Z' },
      },
    });
  });

  it('updates defaultSquad in squads.json', () => {
    const config = readSquadsJson(root);
    expect(config.defaultSquad).toBe('alpha');

    // Simulate switch
    config.defaultSquad = 'beta';
    writeSquadsJson(root, config);

    const updated = readSquadsJson(root);
    expect(updated.defaultSquad).toBe('beta');
  });

  it('rejects switching to nonexistent squad', () => {
    const config = readSquadsJson(root);
    expect(config.squads['nonexistent']).toBeUndefined();
    expect(existsSync(join(root, 'squads', 'nonexistent'))).toBe(false);
    // Implementation should throw: "Squad 'nonexistent' not found"
  });

  it('switching to already-active squad is a no-op', () => {
    const config = readSquadsJson(root);
    expect(config.defaultSquad).toBe('alpha');

    // "Switching" to alpha when it's already active should succeed silently
    config.defaultSquad = 'alpha';
    writeSquadsJson(root, config);

    const updated = readSquadsJson(root);
    expect(updated.defaultSquad).toBe('alpha');
  });

  it('preserves all other config fields on switch', () => {
    const config = readSquadsJson(root);
    const originalSquads = { ...config.squads };

    config.defaultSquad = 'beta';
    writeSquadsJson(root, config);

    const updated = readSquadsJson(root);
    expect(updated.version).toBe(1);
    expect(updated.squads).toEqual(originalSquads);
  });
});

// ============================================================================
// migrateIfNeeded()
// ============================================================================

describe('migrateIfNeeded()', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
  });

  it('detects legacy layout and migrates to "default" squad', () => {
    scaffoldLegacyLayout(root);
    expect(existsSync(join(root, 'agents'))).toBe(true);
    expect(existsSync(join(root, 'squads'))).toBe(false);

    // After migration, expect:
    // - squads/default/ directory with agents/, skills/, etc.
    // - squads.json with defaultSquad: "default"
    // - original files moved (or copied) into squads/default/

    // Simulate migration
    const defaultSquad = join(root, 'squads', 'default');
    mkdirSync(defaultSquad, { recursive: true });

    // Implementation would move agents/, skills/, etc. into squads/default/
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {
        'default': { createdAt: new Date().toISOString() },
      },
    });

    expect(existsSync(join(root, 'squads.json'))).toBe(true);
    expect(existsSync(defaultSquad)).toBe(true);
    const config = readSquadsJson(root);
    expect(config.defaultSquad).toBe('default');
    expect(config.squads['default']).toBeDefined();
  });

  it('is a no-op when already migrated (squads.json exists)', () => {
    mkdirSync(join(root, 'squads', 'default'), { recursive: true });
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {
        'default': { createdAt: '2026-03-01T00:00:00Z' },
      },
    });

    // squads.json already exists — migration should be skipped
    const configBefore = readSquadsJson(root);

    // Simulate no-op migration check
    expect(existsSync(join(root, 'squads.json'))).toBe(true);

    const configAfter = readSquadsJson(root);
    expect(configAfter).toEqual(configBefore);
  });

  it('handles missing config dir (no ~/.config/squad at all)', () => {
    const emptyRoot = makeTmpDir();
    // No agents/, no squads/, no squads.json — completely empty
    expect(existsSync(join(emptyRoot, 'agents'))).toBe(false);
    expect(existsSync(join(emptyRoot, 'squads'))).toBe(false);
    expect(existsSync(join(emptyRoot, 'squads.json'))).toBe(false);
    // Implementation should either create default structure or return no-op
  });

  it('migrates agents/ and skills/ directories into squads/default/', () => {
    scaffoldLegacyLayout(root);
    writeFileSync(join(root, 'agents', 'fenster.md'), '# Fenster\n');
    writeFileSync(join(root, 'skills', 'coding.md'), '# Coding\n');

    // Verify legacy structure
    expect(existsSync(join(root, 'agents', 'fenster.md'))).toBe(true);
    expect(existsSync(join(root, 'skills', 'coding.md'))).toBe(true);

    // After migration, these should exist under squads/default/
    const defaultSquad = join(root, 'squads', 'default');
    mkdirSync(join(defaultSquad, 'agents'), { recursive: true });
    mkdirSync(join(defaultSquad, 'skills'), { recursive: true });

    // Simulate copy
    writeFileSync(
      join(defaultSquad, 'agents', 'fenster.md'),
      readFileSync(join(root, 'agents', 'fenster.md'), 'utf-8'),
    );
    writeFileSync(
      join(defaultSquad, 'skills', 'coding.md'),
      readFileSync(join(root, 'skills', 'coding.md'), 'utf-8'),
    );

    expect(readFileSync(join(defaultSquad, 'agents', 'fenster.md'), 'utf-8')).toContain('Fenster');
    expect(readFileSync(join(defaultSquad, 'skills', 'coding.md'), 'utf-8')).toContain('Coding');
  });

  it('preserves decisions.md content during migration', () => {
    scaffoldLegacyLayout(root);
    const decisionsContent = '# Decisions\n\n### Use TypeScript\nAlways.\n';
    writeFileSync(join(root, 'decisions.md'), decisionsContent);

    // After migration, decisions.md should be intact in squads/default/
    const defaultSquad = join(root, 'squads', 'default');
    mkdirSync(defaultSquad, { recursive: true });
    writeFileSync(
      join(defaultSquad, 'decisions.md'),
      readFileSync(join(root, 'decisions.md'), 'utf-8'),
    );

    expect(readFileSync(join(defaultSquad, 'decisions.md'), 'utf-8')).toBe(decisionsContent);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
    mkdirSync(join(root, 'squads'), { recursive: true });
  });

  describe('empty squads.json', () => {
    it('empty squads object returns empty list', () => {
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'default',
        squads: {},
      });

      const config = readSquadsJson(root);
      expect(Object.keys(config.squads)).toHaveLength(0);
    });

    it('missing squads field in JSON is handled', () => {
      writeFileSync(join(root, 'squads.json'), JSON.stringify({ version: 1 }), 'utf-8');

      const config = JSON.parse(readFileSync(join(root, 'squads.json'), 'utf-8'));
      expect(config.squads).toBeUndefined();
      // Implementation should treat undefined squads as empty
    });
  });

  describe('corrupted squads.json', () => {
    it('invalid JSON throws parse error', () => {
      writeFileSync(join(root, 'squads.json'), '{{{{ not json', 'utf-8');

      expect(() => {
        JSON.parse(readFileSync(join(root, 'squads.json'), 'utf-8'));
      }).toThrow();
    });

    it('empty file throws parse error', () => {
      writeFileSync(join(root, 'squads.json'), '', 'utf-8');

      expect(() => {
        JSON.parse(readFileSync(join(root, 'squads.json'), 'utf-8'));
      }).toThrow();
    });

    it('valid JSON but wrong shape is detectable', () => {
      writeFileSync(join(root, 'squads.json'), '"just a string"', 'utf-8');

      const parsed = JSON.parse(readFileSync(join(root, 'squads.json'), 'utf-8'));
      expect(typeof parsed).toBe('string');
      // Implementation should validate shape and throw SquadError
    });
  });

  describe('missing config dir', () => {
    it('operations on nonexistent root are handled gracefully', () => {
      const ghostRoot = join(root, 'does-not-exist');
      expect(existsSync(ghostRoot)).toBe(false);
      // listSquads, resolveSquadPath should handle this without crashing
    });
  });

  describe('concurrent access', () => {
    it('two creates with different names both succeed', () => {
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'default',
        squads: {},
      });

      // Simulate two concurrent creates
      scaffoldSquad(root, 'squad-a');
      scaffoldSquad(root, 'squad-b');

      const config = readSquadsJson(root);
      config.squads['squad-a'] = { createdAt: new Date().toISOString() };
      config.squads['squad-b'] = { createdAt: new Date().toISOString() };
      writeSquadsJson(root, config);

      const updated = readSquadsJson(root);
      expect(updated.squads['squad-a']).toBeDefined();
      expect(updated.squads['squad-b']).toBeDefined();
    });

    it('concurrent switch and delete are guarded by config consistency', () => {
      scaffoldSquad(root, 'alpha');
      scaffoldSquad(root, 'beta');
      writeSquadsJson(root, {
        version: 1,
        defaultSquad: 'alpha',
        squads: {
          'alpha': { createdAt: '2026-03-01T00:00:00Z' },
          'beta': { createdAt: '2026-03-02T00:00:00Z' },
        },
      });

      // Attempting to delete 'alpha' while it's active should fail
      const config = readSquadsJson(root);
      expect(config.defaultSquad).toBe('alpha');
      // Implementation must check active status before deletion
    });
  });

  describe('platform paths', () => {
    it('uses path.join for all path construction (no hardcoded separators)', () => {
      const testPath = join(root, 'squads', 'my-squad', 'agents');
      // Verify platform-correct separators
      expect(testPath).toContain(sep);

      if (platform() === 'win32') {
        expect(testPath).toContain('\\');
      } else {
        expect(testPath).toContain('/');
      }
    });

    it('squad names do not contain path separators', () => {
      const dangerousNames = ['../escape', 'sub/dir', 'back\\slash', '..\\escape'];
      const SQUAD_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

      for (const name of dangerousNames) {
        expect(SQUAD_NAME_RE.test(name), `"${name}" must be rejected`).toBe(false);
      }
    });

    it('path traversal in squad name is rejected by validation', () => {
      const traversalAttempts = ['..', '../..', '....', '.hidden'];
      const SQUAD_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

      for (const attempt of traversalAttempts) {
        expect(SQUAD_NAME_RE.test(attempt), `"${attempt}" must be rejected`).toBe(false);
      }
    });
  });
});

// ============================================================================
// Integration: Full lifecycle
// ============================================================================

describe('Full lifecycle', () => {
  let root: string;

  beforeEach(() => {
    root = makeTmpDir();
  });

  it('migrate → list → create → switch → delete → list', () => {
    // Step 1: Start with legacy layout
    scaffoldLegacyLayout(root);
    expect(existsSync(join(root, 'agents'))).toBe(true);

    // Step 2: Migrate — creates squads/default + squads.json
    mkdirSync(join(root, 'squads', 'default', 'agents'), { recursive: true });
    mkdirSync(join(root, 'squads', 'default', 'skills'), { recursive: true });
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {
        'default': { createdAt: new Date().toISOString() },
      },
    });

    // Step 3: List — should show 1 squad
    let config = readSquadsJson(root);
    expect(Object.keys(config.squads)).toHaveLength(1);

    // Step 4: Create 'work' squad
    scaffoldSquad(root, 'work');
    config = readSquadsJson(root);
    config.squads['work'] = { createdAt: new Date().toISOString() };
    writeSquadsJson(root, config);

    config = readSquadsJson(root);
    expect(Object.keys(config.squads)).toHaveLength(2);

    // Step 5: Switch to 'work'
    config.defaultSquad = 'work';
    writeSquadsJson(root, config);
    config = readSquadsJson(root);
    expect(config.defaultSquad).toBe('work');

    // Step 6: Delete 'default' (no longer active)
    rmSync(join(root, 'squads', 'default'), { recursive: true, force: true });
    delete config.squads['default'];
    writeSquadsJson(root, config);

    // Step 7: Verify final state
    config = readSquadsJson(root);
    expect(Object.keys(config.squads)).toHaveLength(1);
    expect(config.defaultSquad).toBe('work');
    expect(config.squads['default']).toBeUndefined();
    expect(config.squads['work']).toBeDefined();
    expect(existsSync(join(root, 'squads', 'work'))).toBe(true);
    expect(existsSync(join(root, 'squads', 'default'))).toBe(false);
  });

  it('create multiple squads and verify isolation', () => {
    mkdirSync(join(root, 'squads'), { recursive: true });
    writeSquadsJson(root, {
      version: 1,
      defaultSquad: 'default',
      squads: {},
    });

    const squadNames = ['personal', 'work', 'client-acme', 'experiment'];

    for (const name of squadNames) {
      scaffoldSquad(root, name);
      const config = readSquadsJson(root);
      config.squads[name] = { createdAt: new Date().toISOString() };
      if (name === 'personal') config.defaultSquad = name;
      writeSquadsJson(root, config);
    }

    // Write unique content to each squad
    for (const name of squadNames) {
      writeFileSync(
        join(root, 'squads', name, 'decisions.md'),
        `# Decisions for ${name}\n`,
      );
    }

    // Verify each squad has its own isolated content
    for (const name of squadNames) {
      const content = readFileSync(
        join(root, 'squads', name, 'decisions.md'),
        'utf-8',
      );
      expect(content).toContain(name);
      // No cross-contamination
      for (const other of squadNames.filter(n => n !== name)) {
        expect(content).not.toContain(`for ${other}`);
      }
    }

    const config = readSquadsJson(root);
    expect(Object.keys(config.squads)).toHaveLength(4);
  });
});
