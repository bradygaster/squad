/**
 * Repo Sync tests — export/import Squad configuration to/from GitHub repos
 */

import { describe, it, expect, vi } from 'vitest';
import {
  exportToRepo,
  importFromRepo,
  parseRepoString,
  validateRepoPath,
} from '@bradygaster/squad-sdk/sharing';
import type { RepoSyncOperations } from '@bradygaster/squad-sdk/sharing';

// ── Mock operations ────────────────────────────────────────────────

function createMockOps(files: Record<string, { content: string; sha: string }> = {}): RepoSyncOperations {
  return {
    async getFile(owner, repo, path, _branch) {
      const key = `${owner}/${repo}/${path}`;
      return files[key] ?? null;
    },
    async putFile(owner, repo, path, content, _message, _sha, _branch) {
      const key = `${owner}/${repo}/${path}`;
      const newSha = 'abc123newsha';
      files[key] = { content, sha: newSha };
      return { sha: newSha };
    },
    async getDefaultBranch(_owner, _repo) {
      return 'main';
    },
  };
}

// ── parseRepoString ────────────────────────────────────────────────

describe('parseRepoString', () => {
  it('parses owner/repo format', () => {
    expect(parseRepoString('octocat/hello-world')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('strips github.com URL prefix', () => {
    expect(parseRepoString('https://github.com/octocat/hello-world')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('strips .git suffix', () => {
    expect(parseRepoString('octocat/hello-world.git')).toEqual({
      owner: 'octocat',
      repo: 'hello-world',
    });
  });

  it('throws on invalid format', () => {
    expect(() => parseRepoString('just-a-name')).toThrow('Invalid repo format');
    expect(() => parseRepoString('a/b/c')).toThrow('Invalid repo format');
    expect(() => parseRepoString('')).toThrow('Invalid repo format');
  });
});

// ── validateRepoPath ───────────────────────────────────────────────

describe('validateRepoPath', () => {
  it('accepts relative paths', () => {
    expect(() => validateRepoPath('.squad/squad-export.json')).not.toThrow();
    expect(() => validateRepoPath('configs/squad.json')).not.toThrow();
  });

  it('rejects absolute paths', () => {
    expect(() => validateRepoPath('/etc/passwd')).toThrow('Invalid repo path');
  });

  it('rejects path traversal', () => {
    expect(() => validateRepoPath('../escape.json')).toThrow('Invalid repo path');
    expect(() => validateRepoPath('a/../b')).toThrow('Invalid repo path');
  });

  it('rejects empty path', () => {
    expect(() => validateRepoPath('')).toThrow('Invalid repo path');
  });
});

// ── exportToRepo ───────────────────────────────────────────────────

describe('exportToRepo', () => {
  it('creates a new file when none exists', async () => {
    const files: Record<string, { content: string; sha: string }> = {};
    const ops = createMockOps(files);
    const bundle = JSON.stringify({ version: '1.0', agents: {} });

    const result = await exportToRepo(bundle, { owner: 'myorg', repo: 'config' }, { ops });

    expect(result.success).toBe(true);
    expect(result.message).toContain('myorg/config');
    expect(files['myorg/config/.squad/squad-export.json']).toBeDefined();
    expect(files['myorg/config/.squad/squad-export.json']!.content).toBe(bundle);
  });

  it('updates existing file (uses SHA)', async () => {
    const files: Record<string, { content: string; sha: string }> = {
      'myorg/config/.squad/squad-export.json': { content: '{"old": true}', sha: 'oldsha123' },
    };
    const ops = createMockOps(files);
    const putSpy = vi.spyOn(ops, 'putFile');
    const bundle = JSON.stringify({ version: '1.0', agents: {} });

    await exportToRepo(bundle, { owner: 'myorg', repo: 'config' }, { ops });

    expect(putSpy).toHaveBeenCalledWith(
      'myorg', 'config', '.squad/squad-export.json',
      bundle, expect.any(String), 'oldsha123', undefined,
    );
  });

  it('respects branch option', async () => {
    const ops = createMockOps();
    const putSpy = vi.spyOn(ops, 'putFile');
    const bundle = '{}';

    await exportToRepo(bundle, { owner: 'a', repo: 'b', branch: 'dev' }, { ops });

    expect(putSpy).toHaveBeenCalledWith(
      'a', 'b', '.squad/squad-export.json',
      bundle, expect.any(String), undefined, 'dev',
    );
  });

  it('respects custom path in repoSpec', async () => {
    const files: Record<string, { content: string; sha: string }> = {};
    const ops = createMockOps(files);
    const bundle = '{}';

    await exportToRepo(bundle, { owner: 'a', repo: 'b', path: 'custom/path.json' }, { ops });

    expect(files['a/b/custom/path.json']).toBeDefined();
  });
});

// ── importFromRepo ─────────────────────────────────────────────────

describe('importFromRepo', () => {
  it('fetches bundle from default path', async () => {
    const bundleData = JSON.stringify({ version: '1.0', agents: {}, casting: {}, skills: [] });
    const files = {
      'myorg/config/.squad/squad-export.json': { content: bundleData, sha: 'sha456' },
    };
    const ops = createMockOps(files);

    const result = await importFromRepo({ owner: 'myorg', repo: 'config' }, { ops });

    expect(result.content).toBe(bundleData);
    expect(result.sha).toBe('sha456');
  });

  it('throws when file not found', async () => {
    const ops = createMockOps({});

    await expect(
      importFromRepo({ owner: 'myorg', repo: 'config' }, { ops })
    ).rejects.toThrow('No Squad export found');
  });

  it('respects branch option', async () => {
    const ops = createMockOps();
    const getSpy = vi.spyOn(ops, 'getFile');

    try {
      await importFromRepo({ owner: 'a', repo: 'b', branch: 'feat' }, { ops });
    } catch { /* expected not found */ }

    expect(getSpy).toHaveBeenCalledWith('a', 'b', '.squad/squad-export.json', 'feat');
  });

  it('respects custom path', async () => {
    const bundleData = '{"version":"1.0"}';
    const files = {
      'a/b/my/export.json': { content: bundleData, sha: 'sha789' },
    };
    const ops = createMockOps(files);

    const result = await importFromRepo({ owner: 'a', repo: 'b', path: 'my/export.json' }, { ops });

    expect(result.content).toBe(bundleData);
  });
});
