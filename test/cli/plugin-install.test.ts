/**
 * Tests for `squad plugin install <repo>` command
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { randomBytes } from 'crypto';
import { execFile } from 'node:child_process';

// Module-level mocks (hoisted by vitest)
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Import after mocks are set up
import {
  parseRepoRef,
  collectMdFiles,
  runPluginInstall,
} from '../../packages/squad-cli/src/cli/commands/plugin.js';

const TEST_ROOT = join(process.cwd(), `.test-plugin-install-${randomBytes(4).toString('hex')}`);

// --- parseRepoRef tests ---

describe('parseRepoRef', () => {
  it('should parse "owner/repo" format', () => {
    const result = parseRepoRef('my-org/my-extension');
    expect(result).toEqual({ owner: 'my-org', repo: 'my-extension' });
  });

  it('should parse "github/owner/repo" format (case-insensitive prefix)', () => {
    const result = parseRepoRef('github/my-org/my-extension');
    expect(result).toEqual({ owner: 'my-org', repo: 'my-extension' });
  });

  it('should parse "GitHub/owner/repo" with capital G', () => {
    const result = parseRepoRef('GitHub/acme/tools');
    expect(result).toEqual({ owner: 'acme', repo: 'tools' });
  });

  it('should throw for single-segment input', () => {
    expect(() => parseRepoRef('just-a-name')).toThrow('Invalid repo reference');
  });

  it('should throw for empty string', () => {
    expect(() => parseRepoRef('')).toThrow('Invalid repo reference');
  });

  it('should throw for too many segments (non-github prefix)', () => {
    expect(() => parseRepoRef('a/b/c/d')).toThrow('Invalid repo reference');
  });

  it('should handle three-segment with non-github prefix as invalid', () => {
    expect(() => parseRepoRef('gitlab/owner/repo')).toThrow('Invalid repo reference');
  });
});

// --- collectMdFiles tests ---

describe('collectMdFiles', () => {
  const collectDir = join(TEST_ROOT, 'collect-test');

  beforeEach(async () => {
    await mkdir(collectDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('should return empty array for non-existent directory', () => {
    const result = collectMdFiles(join(TEST_ROOT, 'does-not-exist'));
    expect(result).toEqual([]);
  });

  it('should return empty array for directory with no .md files', () => {
    writeFileSync(join(collectDir, 'readme.txt'), 'hello');
    writeFileSync(join(collectDir, 'config.json'), '{}');
    const result = collectMdFiles(collectDir);
    expect(result).toEqual([]);
  });

  it('should return only .md files', () => {
    writeFileSync(join(collectDir, 'skill-a.md'), '# Skill A');
    writeFileSync(join(collectDir, 'skill-b.md'), '# Skill B');
    writeFileSync(join(collectDir, 'readme.txt'), 'not a skill');
    const result = collectMdFiles(collectDir);
    expect(result).toHaveLength(2);
    expect(result.sort()).toEqual(['skill-a.md', 'skill-b.md']);
  });
});

// --- runPluginInstall integration tests ---

describe('runPluginInstall', () => {
  const projectDir = join(TEST_ROOT, 'project');
  const squadDir = join(projectDir, '.squad');

  /**
   * Helper: configure the execFile mock to simulate a successful git clone
   * by creating the specified directory structure.
   */
  function mockCloneWith(
    structure: Record<string, Record<string, string>>,
    opts?: { captureUrl?: (url: string) => void },
  ) {
    const mock = vi.mocked(execFile);
    mock.mockImplementation(
      ((_cmd: unknown, args: unknown, _opts: unknown, cb: unknown) => {
        const argList = args as string[];
        const cloneDir = argList[argList.length - 1]!;
        const url = argList[3];
        if (opts?.captureUrl && url) opts.captureUrl(url);

        // Create the fake extension structure
        for (const [dir, files] of Object.entries(structure)) {
          const dirPath = join(cloneDir, dir);
          mkdirSync(dirPath, { recursive: true });
          for (const [name, content] of Object.entries(files)) {
            writeFileSync(join(dirPath, name), content);
          }
        }

        // Call the callback
        const callback = cb as (err: Error | null, stdout: string, stderr: string) => void;
        callback(null, '', '');
        return {} as ReturnType<typeof execFile>;
      }) as typeof execFile,
    );
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(squadDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('should fail when .squad/ directory does not exist', async () => {
    const noSquadDir = join(TEST_ROOT, 'empty-project');
    await mkdir(noSquadDir, { recursive: true });
    await expect(runPluginInstall(noSquadDir, 'owner/repo')).rejects.toThrow('.squad/ directory not found');
  });

  it('should fail with invalid repo reference', async () => {
    await expect(runPluginInstall(projectDir, 'just-a-name')).rejects.toThrow('Invalid repo reference');
  });

  it('should copy .md files from skills/, ceremonies/, directives/ and track in installed.json', async () => {
    mockCloneWith({
      skills: {
        'debugging.md': '# Debugging Skill',
        'testing.md': '# Testing Skill',
      },
      ceremonies: {
        'standup.md': '# Daily Standup',
      },
      directives: {
        'code-style.md': '# Code Style',
      },
    });

    await runPluginInstall(projectDir, 'my-org/my-extension');

    // Verify files were copied
    expect(existsSync(join(squadDir, 'skills', 'debugging.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'skills', 'testing.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'ceremonies', 'standup.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'directives', 'code-style.md'))).toBe(true);

    // Verify file contents preserved
    const debugContent = await readFile(join(squadDir, 'skills', 'debugging.md'), 'utf-8');
    expect(debugContent).toBe('# Debugging Skill');

    // Verify installed.json was created
    const installedJsonPath = join(squadDir, 'plugins', 'installed.json');
    expect(existsSync(installedJsonPath)).toBe(true);

    const registry = JSON.parse(await readFile(installedJsonPath, 'utf-8'));
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0].name).toBe('my-extension');
    expect(registry.plugins[0].repo).toBe('my-org/my-extension');
    expect(registry.plugins[0].files).toHaveLength(4);
    expect(registry.plugins[0].installed_at).toBeTruthy();

    // Verify clone directory was cleaned up
    const cloneDirs = readdirSync(projectDir)
      .filter((f: string) => f.startsWith('.squad-plugin-clone-'));
    expect(cloneDirs).toHaveLength(0);
  });

  it('should warn when repo has no extension directories', async () => {
    // Clone produces a dir with just a README — no skills/ceremonies/directives
    mockCloneWith({});

    // Should complete without throwing (just warns)
    await runPluginInstall(projectDir, 'owner/empty-repo');

    // No installed.json should be created
    const installedJsonPath = join(squadDir, 'plugins', 'installed.json');
    expect(existsSync(installedJsonPath)).toBe(false);
  });

  it('should handle reinstall by replacing existing entry', async () => {
    // Pre-seed installed.json with an older entry
    const pluginsDir = join(squadDir, 'plugins');
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(join(pluginsDir, 'installed.json'), JSON.stringify({
      plugins: [{
        name: 'my-extension',
        repo: 'my-org/my-extension',
        installed_at: '2025-01-01T00:00:00.000Z',
        files: [{ source: 'skills/old.md', dest: '/old/path' }],
      }],
    }, null, 2) + '\n');

    mockCloneWith({
      skills: { 'new-skill.md': '# New Skill' },
    });

    await runPluginInstall(projectDir, 'my-org/my-extension');

    const registry = JSON.parse(await readFile(join(pluginsDir, 'installed.json'), 'utf-8'));
    // Should have exactly 1 entry (old one replaced)
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0].files).toHaveLength(1);
    expect(registry.plugins[0].files[0].source).toBe('skills/new-skill.md');
    // installed_at should be updated
    expect(registry.plugins[0].installed_at).not.toBe('2025-01-01T00:00:00.000Z');
  });

  it('should handle github/owner/repo format', async () => {
    let capturedUrl = '';
    mockCloneWith(
      { skills: { 'a.md': '# A' } },
      { captureUrl: (url) => { capturedUrl = url; } },
    );

    await runPluginInstall(projectDir, 'github/acme/tools');

    expect(capturedUrl).toBe('https://github.com/acme/tools.git');
    expect(existsSync(join(squadDir, 'skills', 'a.md'))).toBe(true);
  });

  it('should only copy .md files, ignoring other file types', async () => {
    mockCloneWith({
      skills: {
        'good-skill.md': '# Good',
        'config.json': '{}',
        'script.ts': 'export {}',
      },
    });

    await runPluginInstall(projectDir, 'owner/mixed-files');

    expect(existsSync(join(squadDir, 'skills', 'good-skill.md'))).toBe(true);
    expect(existsSync(join(squadDir, 'skills', 'config.json'))).toBe(false);
    expect(existsSync(join(squadDir, 'skills', 'script.ts'))).toBe(false);
  });
});
