/**
 * Tests for shared-squad.ts — repo key validation, write path validation,
 * journal filename sanitization, and repo registry CRUD.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join, resolve, sep } from 'node:path';
import { mkdirSync, rmSync, existsSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  validateRepoKey,
  validateWritePath,
  sanitizeJournalFilenameComponent,
} from '@bradygaster/squad-sdk/shared-squad';

// ============================================================================
// validateRepoKey()
// ============================================================================

describe('validateRepoKey()', () => {
  // ── Valid keys ──────────────────────────────────────────────────────────
  describe('accepts valid keys', () => {
    it('2-segment GitHub key', () => {
      expect(() => validateRepoKey('microsoft/vscode')).not.toThrow();
    });

    it('3-segment ADO key', () => {
      expect(() => validateRepoKey('microsoft/os/os.2020')).not.toThrow();
    });

    it('keys with dots, underscores, and hyphens', () => {
      expect(() => validateRepoKey('my-org/my_repo.v2')).not.toThrow();
    });

    it('single-character segments', () => {
      expect(() => validateRepoKey('a/b')).not.toThrow();
    });

    it('numeric segments', () => {
      expect(() => validateRepoKey('org123/repo456')).not.toThrow();
    });
  });

  // ── Path traversal ─────────────────────────────────────────────────────
  describe('rejects path traversal', () => {
    it('.. as a segment', () => {
      expect(() => validateRepoKey('../etc/passwd')).toThrow(/path traversal/);
    });

    it('.. in the middle', () => {
      expect(() => validateRepoKey('microsoft/../../../etc')).toThrow(/path traversal/);
    });

    it('.. at the end', () => {
      expect(() => validateRepoKey('owner/repo/..')).toThrow(/path traversal/);
    });
  });

  // ── Absolute paths ─────────────────────────────────────────────────────
  describe('rejects absolute paths', () => {
    it('Unix absolute path', () => {
      expect(() => validateRepoKey('/etc/passwd')).toThrow(/absolute paths/);
    });

    it('Windows drive letter', () => {
      expect(() => validateRepoKey('C:\\Windows\\System32')).toThrow(/(absolute paths|illegal characters)/);
    });

    it('UNC path', () => {
      expect(() => validateRepoKey('\\\\server\\share')).toThrow(/(absolute paths|illegal characters)/);
    });
  });

  // ── Null bytes ─────────────────────────────────────────────────────────
  describe('rejects null bytes', () => {
    it('null byte in segment', () => {
      expect(() => validateRepoKey('owner/re\0po')).toThrow(/null byte/);
    });
  });

  // ── Windows-illegal characters ─────────────────────────────────────────
  describe('rejects Windows-illegal filename characters', () => {
    for (const char of ['<', '>', ':', '"', '|', '?', '*', '\\']) {
      it(`rejects "${char}"`, () => {
        expect(() => validateRepoKey(`owner/repo${char}name`)).toThrow(/illegal characters/);
      });
    }
  });

  // ── Empty / malformed ──────────────────────────────────────────────────
  describe('rejects empty or malformed keys', () => {
    it('empty string', () => {
      expect(() => validateRepoKey('')).toThrow(/empty string/);
    });

    it('single segment', () => {
      expect(() => validateRepoKey('onlyone')).toThrow(/2-3 segments/);
    });

    it('four segments', () => {
      expect(() => validateRepoKey('a/b/c/d')).toThrow(/2-3 segments/);
    });

    it('empty segment (double slash)', () => {
      expect(() => validateRepoKey('microsoft//os.2020')).toThrow(/empty segment/);
    });

    it('leading slash creating empty segment', () => {
      expect(() => validateRepoKey('/os/os.2020')).toThrow(/absolute paths/);
    });

    it('trailing slash creating empty segment', () => {
      expect(() => validateRepoKey('os/os.2020/')).toThrow(/empty segment/);
    });
  });

  // ── Segment length ─────────────────────────────────────────────────────
  describe('rejects oversized segments', () => {
    it('segment exceeding 128 characters', () => {
      const long = 'a'.repeat(129);
      expect(() => validateRepoKey(`owner/${long}`)).toThrow(/exceeds 128/);
    });

    it('accepts segment at exactly 128 characters', () => {
      const exact = 'a'.repeat(128);
      expect(() => validateRepoKey(`owner/${exact}`)).not.toThrow();
    });
  });

  // ── Character whitelist ────────────────────────────────────────────────
  describe('rejects characters outside whitelist', () => {
    it('uppercase letters', () => {
      expect(() => validateRepoKey('Microsoft/VSCode')).toThrow(/invalid characters/);
    });

    it('spaces', () => {
      expect(() => validateRepoKey('my org/my repo')).toThrow(/invalid characters/);
    });

    it('@ symbol', () => {
      expect(() => validateRepoKey('owner/@scoped-repo')).toThrow(/invalid characters/);
    });
  });
});

// ============================================================================
// validateWritePath()
// ============================================================================

describe('validateWritePath()', () => {
  const TMP = join(process.cwd(), `.test-write-path-${randomBytes(4).toString('hex')}`);
  const ROOT = join(TMP, 'repos');

  function setup() {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(join(ROOT, 'microsoft', 'vscode'), { recursive: true });
  }

  function teardown() {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  }

  describe('accepts paths inside root', () => {
    it('existing directory', () => {
      setup();
      try {
        expect(() =>
          validateWritePath(join(ROOT, 'microsoft', 'vscode'), ROOT)
        ).not.toThrow();
      } finally {
        teardown();
      }
    });

    it('file that does not exist yet (parent exists)', () => {
      setup();
      try {
        expect(() =>
          validateWritePath(join(ROOT, 'microsoft', 'vscode', 'new-file.md'), ROOT)
        ).not.toThrow();
      } finally {
        teardown();
      }
    });

    it('deeply nested path where intermediate dirs do not exist', () => {
      setup();
      try {
        expect(() =>
          validateWritePath(join(ROOT, 'microsoft', 'vscode', 'deep', 'nested', 'file.md'), ROOT)
        ).not.toThrow();
      } finally {
        teardown();
      }
    });
  });

  describe('rejects paths outside root', () => {
    it('path outside expected root via ..', () => {
      setup();
      try {
        expect(() =>
          validateWritePath(join(ROOT, '..', 'escape.txt'), ROOT)
        ).toThrow(/escapes expected root/);
      } finally {
        teardown();
      }
    });

    it('completely unrelated path', () => {
      setup();
      try {
        // Use a path clearly outside the test root
        const outsidePath = resolve(TMP, '..', 'somewhere-else', 'file.txt');
        expect(() => validateWritePath(outsidePath, ROOT)).toThrow(/escapes expected root/);
      } finally {
        teardown();
      }
    });
  });

  describe('rejects when expectedRoot does not exist', () => {
    it('throws for non-existent root', () => {
      expect(() =>
        validateWritePath('/some/file.txt', '/nonexistent/root')
      ).toThrow(/does not exist/);
    });
  });

  // Symlink test — only run on platforms that support symlinks without admin
  const canSymlink = process.platform !== 'win32';
  (canSymlink ? describe : describe.skip)('symlink escape detection', () => {
    it('rejects path through symlink that escapes root', () => {
      setup();
      const outsideDir = join(TMP, 'outside-target');
      mkdirSync(outsideDir, { recursive: true });
      const linkPath = join(ROOT, 'microsoft', 'evil-link');
      try {
        symlinkSync(outsideDir, linkPath, 'dir');
        expect(() =>
          validateWritePath(join(linkPath, 'file.txt'), ROOT)
        ).toThrow(/escapes expected root/);
      } finally {
        teardown();
      }
    });
  });
});

// ============================================================================
// sanitizeJournalFilenameComponent()
// ============================================================================

describe('sanitizeJournalFilenameComponent()', () => {
  it('passes through clean names', () => {
    expect(sanitizeJournalFilenameComponent('retro')).toBe('retro');
    expect(sanitizeJournalFilenameComponent('flight-2')).toBe('flight-2');
    expect(sanitizeJournalFilenameComponent('Agent_1')).toBe('Agent_1');
  });

  it('replaces dots', () => {
    expect(sanitizeJournalFilenameComponent('agent.v2')).toBe('agent_v2');
  });

  it('replaces path separators', () => {
    expect(sanitizeJournalFilenameComponent('../../../etc/passwd')).toBe(
      '_________etc_passwd'
    );
    expect(sanitizeJournalFilenameComponent('agents\\evil')).toBe('agents_evil');
  });

  it('replaces spaces and special characters', () => {
    expect(sanitizeJournalFilenameComponent('my agent (v2)')).toBe('my_agent__v2_');
  });

  it('handles empty string', () => {
    expect(sanitizeJournalFilenameComponent('')).toBe('');
  });

  it('replaces null bytes', () => {
    expect(sanitizeJournalFilenameComponent('agent\0name')).toBe('agent_name');
  });

  it('preserves uppercase letters', () => {
    expect(sanitizeJournalFilenameComponent('RETRO')).toBe('RETRO');
  });
});

// ============================================================================
// Registry CRUD Tests
// ============================================================================

const REGISTRY_TMP = join(process.cwd(), `.test-registry-${randomBytes(4).toString('hex')}`);
const CLONE_TMP = join(process.cwd(), `.test-clone-${randomBytes(4).toString('hex')}`);

/**
 * Dynamically import shared-squad module to pick up env stubs.
 */
async function loadSharedSquadModule() {
  return await import('@bradygaster/squad-sdk/shared-squad');
}

describe('Repo Registry CRUD', () => {
  let fakeAppData: string;
  let fakeLocalAppData: string;

  beforeEach(() => {
    // Clean up
    if (existsSync(REGISTRY_TMP)) rmSync(REGISTRY_TMP, { recursive: true, force: true });
    if (existsSync(CLONE_TMP)) rmSync(CLONE_TMP, { recursive: true, force: true });
    mkdirSync(REGISTRY_TMP, { recursive: true });
    mkdirSync(CLONE_TMP, { recursive: true });

    fakeAppData = join(REGISTRY_TMP, 'appdata');
    fakeLocalAppData = join(REGISTRY_TMP, 'local-appdata');
    mkdirSync(fakeAppData, { recursive: true });
    mkdirSync(fakeLocalAppData, { recursive: true });

    // Stub APPDATA so resolveGlobalSquadPath() uses our temp dir
    vi.stubEnv('APPDATA', fakeAppData);
    vi.stubEnv('LOCALAPPDATA', fakeLocalAppData);
    // Linux/macOS fallback
    vi.stubEnv('XDG_CONFIG_HOME', fakeAppData);
    vi.stubEnv('XDG_DATA_HOME', fakeLocalAppData);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (existsSync(REGISTRY_TMP)) rmSync(REGISTRY_TMP, { recursive: true, force: true });
    if (existsSync(CLONE_TMP)) rmSync(CLONE_TMP, { recursive: true, force: true });
  });

  // ── loadRepoRegistry ────────────────────────────────────────────────────

  describe('loadRepoRegistry()', () => {
    it('returns null when repos.json does not exist', async () => {
      const { loadRepoRegistry } = await loadSharedSquadModule();
      expect(loadRepoRegistry()).toBeNull();
    });

    it('returns null for malformed JSON', async () => {
      const { loadRepoRegistry, saveRepoRegistry } = await loadSharedSquadModule();
      // First create the squad dir, then write garbage
      const { resolveGlobalSquadPath } = await import('@bradygaster/squad-sdk/resolution');
      const globalDir = resolveGlobalSquadPath();
      writeFileSync(join(globalDir, 'repos.json'), '{ invalid json !!!');
      expect(loadRepoRegistry()).toBeNull();
    });

    it('returns null for valid JSON with wrong shape', async () => {
      const { loadRepoRegistry } = await loadSharedSquadModule();
      const { resolveGlobalSquadPath } = await import('@bradygaster/squad-sdk/resolution');
      const globalDir = resolveGlobalSquadPath();
      writeFileSync(join(globalDir, 'repos.json'), JSON.stringify({ foo: 'bar' }));
      expect(loadRepoRegistry()).toBeNull();
    });

    it('loads a valid registry', async () => {
      const { loadRepoRegistry } = await loadSharedSquadModule();
      const { resolveGlobalSquadPath } = await import('@bradygaster/squad-sdk/resolution');
      const globalDir = resolveGlobalSquadPath();
      const registry = {
        version: 1,
        repos: [{ key: 'owner/repo', urlPatterns: ['github.com/owner/repo'], created_at: '2025-01-01T00:00:00Z' }],
      };
      writeFileSync(join(globalDir, 'repos.json'), JSON.stringify(registry));
      const result = loadRepoRegistry();
      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.repos).toHaveLength(1);
      expect(result!.repos[0]!.key).toBe('owner/repo');
    });
  });

  // ── saveRepoRegistry ────────────────────────────────────────────────────

  describe('saveRepoRegistry()', () => {
    it('writes repos.json', async () => {
      const { saveRepoRegistry, loadRepoRegistry } = await loadSharedSquadModule();
      const registry = {
        version: 1 as const,
        repos: [{ key: 'owner/repo', urlPatterns: ['github.com/owner/repo'], created_at: '2025-01-01T00:00:00Z' }],
      };
      saveRepoRegistry(registry);
      const loaded = loadRepoRegistry();
      expect(loaded).not.toBeNull();
      expect(loaded!.repos[0]!.key).toBe('owner/repo');
    });
  });

  // ── createSharedSquad ───────────────────────────────────────────────────

  describe('createSharedSquad()', () => {
    it('creates team directory and registers in repos.json', async () => {
      const { createSharedSquad, loadRepoRegistry } = await loadSharedSquadModule();
      const teamDir = createSharedSquad('owner/repo', ['github.com/owner/repo']);
      expect(existsSync(teamDir)).toBe(true);
      expect(existsSync(join(teamDir, 'manifest.json'))).toBe(true);

      const registry = loadRepoRegistry();
      expect(registry).not.toBeNull();
      expect(registry!.repos).toHaveLength(1);
      expect(registry!.repos[0]!.key).toBe('owner/repo');
    });

    it('creates 3-segment nested directories for ADO repos', async () => {
      const { createSharedSquad } = await loadSharedSquadModule();
      const teamDir = createSharedSquad('microsoft/os/os.2020', ['dev.azure.com/microsoft/os/_git/os.2020']);
      expect(existsSync(teamDir)).toBe(true);
      // Verify nested structure
      expect(teamDir).toContain(join('repos', 'microsoft', 'os', 'os.2020'));
    });

    it('writes manifest.json with correct content', async () => {
      const { createSharedSquad } = await loadSharedSquadModule();
      const teamDir = createSharedSquad('owner/repo', ['github.com/owner/repo']);
      const manifest = JSON.parse(readFileSync(join(teamDir, 'manifest.json'), 'utf-8'));
      expect(manifest.version).toBe(1);
      expect(manifest.repoKey).toBe('owner/repo');
      expect(manifest.urlPatterns).toEqual(['github.com/owner/repo']);
      expect(manifest.created_at).toBeTruthy();
    });

    it('throws for invalid repo key', async () => {
      const { createSharedSquad } = await loadSharedSquadModule();
      expect(() => createSharedSquad('Invalid/Key', ['github.com/invalid/key']))
        .toThrow(/invalid characters/);
    });

    it('throws for duplicate repo key', async () => {
      const { createSharedSquad } = await loadSharedSquadModule();
      createSharedSquad('owner/repo', ['github.com/owner/repo']);
      expect(() => createSharedSquad('owner/repo', ['github.com/owner/repo']))
        .toThrow(/already exists/);
    });
  });

  // ── lookupByUrl ─────────────────────────────────────────────────────────

  describe('lookupByUrl()', () => {
    it('returns null when registry is empty', async () => {
      const { lookupByUrl } = await loadSharedSquadModule();
      expect(lookupByUrl('github.com/owner/repo')).toBeNull();
    });

    it('finds entry by matching URL pattern', async () => {
      const { createSharedSquad, lookupByUrl } = await loadSharedSquadModule();
      createSharedSquad('owner/repo', ['github.com/owner/repo']);
      const result = lookupByUrl('github.com/owner/repo');
      expect(result).not.toBeNull();
      expect(result!.key).toBe('owner/repo');
    });

    it('matches case-insensitively', async () => {
      const { createSharedSquad, lookupByUrl } = await loadSharedSquadModule();
      createSharedSquad('owner/repo', ['github.com/owner/repo']);
      const result = lookupByUrl('GitHub.com/Owner/Repo');
      expect(result).not.toBeNull();
      expect(result!.key).toBe('owner/repo');
    });

    it('returns null for non-matching URL', async () => {
      const { createSharedSquad, lookupByUrl } = await loadSharedSquadModule();
      createSharedSquad('owner/repo', ['github.com/owner/repo']);
      expect(lookupByUrl('github.com/other/project')).toBeNull();
    });

    it('matches against multiple URL patterns', async () => {
      const { createSharedSquad, lookupByUrl } = await loadSharedSquadModule();
      createSharedSquad('microsoft/os/os.2020', [
        'microsoft.visualstudio.com/os/_git/os.2020',
        'dev.azure.com/microsoft/os/_git/os.2020',
      ]);
      expect(lookupByUrl('dev.azure.com/microsoft/os/_git/os.2020')).not.toBeNull();
      expect(lookupByUrl('microsoft.visualstudio.com/os/_git/os.2020')).not.toBeNull();
    });
  });

  // ── addUrlPattern ───────────────────────────────────────────────────────

  describe('addUrlPattern()', () => {
    it('adds a new URL pattern to an existing entry', async () => {
      const { createSharedSquad, addUrlPattern, loadRepoRegistry } = await loadSharedSquadModule();
      createSharedSquad('microsoft/os/os.2020', ['microsoft.visualstudio.com/os/_git/os.2020']);
      // Add a different normalized form (dev.azure.com variant)
      addUrlPattern('microsoft/os/os.2020', 'https://dev.azure.com/microsoft/os/_git/os.2020');
      const registry = loadRepoRegistry();
      expect(registry!.repos[0]!.urlPatterns).toHaveLength(2);
      expect(registry!.repos[0]!.urlPatterns).toContain('dev.azure.com/microsoft/os/_git/os.2020');
    });

    it('does not add duplicate patterns', async () => {
      const { createSharedSquad, addUrlPattern, loadRepoRegistry } = await loadSharedSquadModule();
      createSharedSquad('owner/repo', ['github.com/owner/repo']);
      addUrlPattern('owner/repo', 'https://github.com/owner/repo');
      const registry = loadRepoRegistry();
      // Should stay at 1 since normalized form matches
      expect(registry!.repos[0]!.urlPatterns).toHaveLength(1);
    });

    it('throws when registry does not exist', async () => {
      const { addUrlPattern } = await loadSharedSquadModule();
      expect(() => addUrlPattern('owner/repo', 'github.com/owner/repo'))
        .toThrow(/No repo registry found/);
    });

    it('throws when repo key is not found', async () => {
      const { createSharedSquad, addUrlPattern } = await loadSharedSquadModule();
      createSharedSquad('owner/repo', ['github.com/owner/repo']);
      expect(() => addUrlPattern('other/repo', 'github.com/other/repo'))
        .toThrow(/not found in registry/);
    });

    it('also updates manifest.json', async () => {
      const { createSharedSquad, addUrlPattern } = await loadSharedSquadModule();
      const teamDir = createSharedSquad('microsoft/os/os.2020', ['microsoft.visualstudio.com/os/_git/os.2020']);
      addUrlPattern('microsoft/os/os.2020', 'https://dev.azure.com/microsoft/os/_git/os.2020');
      const manifest = JSON.parse(readFileSync(join(teamDir, 'manifest.json'), 'utf-8'));
      expect(manifest.urlPatterns).toHaveLength(2);
    });
  });

  // ── resolveSharedSquad ──────────────────────────────────────────────────

  describe('resolveSharedSquad()', () => {
    it('returns null when no origin remote exists', async () => {
      const { resolveSharedSquad } = await loadSharedSquadModule();
      // A temp dir with no git repo
      const noGitDir = join(REGISTRY_TMP, 'no-git');
      mkdirSync(noGitDir, { recursive: true });
      expect(resolveSharedSquad(noGitDir)).toBeNull();
    });

    it('returns null when origin URL has no registry match', async () => {
      const { resolveSharedSquad, createSharedSquad } = await loadSharedSquadModule();
      createSharedSquad('owner/repo', ['github.com/owner/repo']);

      // Create a fake git repo with a different origin
      const fakeRepo = join(CLONE_TMP, 'fake-repo');
      mkdirSync(join(fakeRepo, '.git'), { recursive: true });
      // We can't easily fake `git remote get-url origin` without a real repo,
      // so this will return null from getRemoteUrl (no git config)
      expect(resolveSharedSquad(fakeRepo)).toBeNull();
    });
  });
});
