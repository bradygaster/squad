/**
 * Tests for bidirectional upstream sync + auto-propagation (#357).
 *
 * Covers:
 *   Phase 1 — watcher: polling, change detection, hash diffing, config parsing
 *   Phase 2 — proposer: file collection, scope filtering, proposal packaging
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  hashFile,
  collectFileHashes,
  diffHashes,
  resolveUpstreamSquadPath,
  createWatchState,
  checkUpstreamForChanges,
  runWatchCycle,
  parseSyncConfig,
} from '../packages/squad-sdk/src/upstream/watcher.js';

import {
  collectProposalFiles,
  buildProposalSummary,
  packageProposal,
  parseProposeConfig,
} from '../packages/squad-sdk/src/upstream/proposer.js';

import {
  DEFAULT_SYNC_CONFIG,
  DEFAULT_PROPOSE_CONFIG,
} from '../packages/squad-sdk/src/upstream/sync-types.js';

import type { UpstreamSource } from '../packages/squad-sdk/src/upstream/types.js';

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function clean(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

// ─── Phase 1: Watcher / Change Detection ───────────────────────────

describe('upstream watcher — hash utilities', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = tmp('squad-hash-');
    fs.writeFileSync(path.join(tempDir, 'a.txt'), 'hello');
    fs.writeFileSync(path.join(tempDir, 'b.txt'), 'world');
    fs.mkdirSync(path.join(tempDir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'sub', 'c.txt'), 'nested');
  });

  afterAll(() => clean(tempDir));

  it('hashFile returns deterministic 12-char hash', () => {
    const h1 = hashFile(path.join(tempDir, 'a.txt'));
    const h2 = hashFile(path.join(tempDir, 'a.txt'));
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(12);
  });

  it('different content produces different hash', () => {
    const h1 = hashFile(path.join(tempDir, 'a.txt'));
    const h2 = hashFile(path.join(tempDir, 'b.txt'));
    expect(h1).not.toBe(h2);
  });

  it('collectFileHashes walks directory recursively', () => {
    const hashes = collectFileHashes(tempDir);
    expect(hashes.size).toBe(3);
    expect(hashes.has('a.txt')).toBe(true);
    expect(hashes.has('b.txt')).toBe(true);
    expect(hashes.has('sub/c.txt')).toBe(true);
  });

  it('collectFileHashes returns empty map for non-existent dir', () => {
    const hashes = collectFileHashes('/nonexistent/path');
    expect(hashes.size).toBe(0);
  });

  it('collectFileHashes skips _upstream_repos directories', () => {
    const dir = tmp('squad-skip-');
    try {
      fs.writeFileSync(path.join(dir, 'top.txt'), 'top');
      fs.mkdirSync(path.join(dir, '_upstream_repos', 'repo'), { recursive: true });
      fs.writeFileSync(path.join(dir, '_upstream_repos', 'repo', 'hidden.txt'), 'hidden');

      const hashes = collectFileHashes(dir);
      expect(hashes.size).toBe(1);
      expect(hashes.has('top.txt')).toBe(true);
    } finally {
      clean(dir);
    }
  });
});

describe('upstream watcher — diffHashes', () => {
  it('detects added files', () => {
    const prev = new Map([['a.txt', 'aaa']]);
    const curr = new Map([['a.txt', 'aaa'], ['b.txt', 'bbb']]);
    expect(diffHashes(prev, curr)).toEqual(['b.txt']);
  });

  it('detects modified files', () => {
    const prev = new Map([['a.txt', 'aaa']]);
    const curr = new Map([['a.txt', 'bbb']]);
    expect(diffHashes(prev, curr)).toEqual(['a.txt']);
  });

  it('detects removed files', () => {
    const prev = new Map([['a.txt', 'aaa'], ['b.txt', 'bbb']]);
    const curr = new Map([['a.txt', 'aaa']]);
    expect(diffHashes(prev, curr)).toEqual(['b.txt']);
  });

  it('returns empty array for identical hashes', () => {
    const prev = new Map([['a.txt', 'aaa']]);
    const curr = new Map([['a.txt', 'aaa']]);
    expect(diffHashes(prev, curr)).toEqual([]);
  });

  it('detects multiple changes sorted', () => {
    const prev = new Map([['b.txt', 'old'], ['c.txt', 'old']]);
    const curr = new Map([['a.txt', 'new'], ['b.txt', 'new']]);
    const diff = diffHashes(prev, curr);
    expect(diff).toContain('a.txt'); // added
    expect(diff).toContain('b.txt'); // modified
    expect(diff).toContain('c.txt'); // removed
    // Should be sorted
    expect(diff).toEqual([...diff].sort());
  });
});

describe('upstream watcher — resolveUpstreamSquadPath', () => {
  let parentDir: string;
  let childSquadDir: string;

  beforeAll(() => {
    parentDir = tmp('squad-resolve-parent-');
    fs.mkdirSync(path.join(parentDir, '.squad'), { recursive: true });
    fs.writeFileSync(path.join(parentDir, '.squad', 'decisions.md'), '# Decisions');

    childSquadDir = tmp('squad-resolve-child-');
    fs.mkdirSync(path.join(childSquadDir, '.squad'), { recursive: true });
  });

  afterAll(() => {
    clean(parentDir);
    clean(childSquadDir);
  });

  it('resolves local upstream .squad/ path', () => {
    const upstream: UpstreamSource = {
      name: 'parent',
      type: 'local',
      source: parentDir,
      added_at: new Date().toISOString(),
      last_synced: null,
    };
    const result = resolveUpstreamSquadPath(upstream, childSquadDir);
    expect(result).toBe(path.join(parentDir, '.squad'));
  });

  it('returns null for non-existent local upstream', () => {
    const upstream: UpstreamSource = {
      name: 'ghost',
      type: 'local',
      source: '/nonexistent/path',
      added_at: new Date().toISOString(),
      last_synced: null,
    };
    expect(resolveUpstreamSquadPath(upstream, childSquadDir)).toBeNull();
  });

  it('returns null for git upstream without cached clone', () => {
    const upstream: UpstreamSource = {
      name: 'remote',
      type: 'git',
      source: 'https://example.com/repo.git',
      added_at: new Date().toISOString(),
      last_synced: null,
    };
    expect(resolveUpstreamSquadPath(upstream, childSquadDir)).toBeNull();
  });
});

describe('upstream watcher — watch cycle', () => {
  let parentDir: string;
  let childDir: string;

  beforeAll(() => {
    parentDir = tmp('squad-watch-parent-');
    const parentSquad = path.join(parentDir, '.squad');
    fs.mkdirSync(parentSquad, { recursive: true });
    fs.writeFileSync(path.join(parentSquad, 'decisions.md'), '# Decisions v1');

    childDir = tmp('squad-watch-child-');
    const childSquad = path.join(childDir, '.squad');
    fs.mkdirSync(childSquad, { recursive: true });
    fs.writeFileSync(path.join(childSquad, 'upstream.json'), JSON.stringify({
      upstreams: [
        { name: 'parent', type: 'local', source: parentDir, added_at: new Date().toISOString(), last_synced: null },
      ],
    }, null, 2));
  });

  afterAll(() => {
    clean(parentDir);
    clean(childDir);
  });

  it('first cycle captures snapshot (no changes)', () => {
    const state = createWatchState();
    const result = runWatchCycle(path.join(childDir, '.squad'), state);
    expect(result.detections).toHaveLength(1);
    // First cycle has no previous snapshot to compare against, so everything is "new"
    // But after first cycle, state should have the snapshot
    expect(state.snapshots.has('parent')).toBe(true);
  });

  it('second cycle with no changes reports no changes', () => {
    const state = createWatchState();
    runWatchCycle(path.join(childDir, '.squad'), state);
    const result = runWatchCycle(path.join(childDir, '.squad'), state);
    expect(result.hasAnyChanges).toBe(false);
    expect(result.detections[0].changedFiles).toHaveLength(0);
  });

  it('detects file modification between cycles', () => {
    const state = createWatchState();
    runWatchCycle(path.join(childDir, '.squad'), state);

    // Modify parent content
    fs.writeFileSync(path.join(parentDir, '.squad', 'decisions.md'), '# Decisions v2');

    const result = runWatchCycle(path.join(childDir, '.squad'), state);
    expect(result.hasAnyChanges).toBe(true);
    expect(result.detections[0].changedFiles).toContain('decisions.md');
  });

  it('detects new file between cycles', () => {
    const state = createWatchState();
    runWatchCycle(path.join(childDir, '.squad'), state);

    // Add new file to parent
    fs.writeFileSync(path.join(parentDir, '.squad', 'routing.md'), '# Routing');

    const result = runWatchCycle(path.join(childDir, '.squad'), state);
    expect(result.hasAnyChanges).toBe(true);
    expect(result.detections[0].changedFiles).toContain('routing.md');
  });

  it('returns empty detections for missing upstream.json', () => {
    const emptyDir = tmp('squad-watch-empty-');
    try {
      fs.mkdirSync(path.join(emptyDir, '.squad'), { recursive: true });
      const state = createWatchState();
      const result = runWatchCycle(path.join(emptyDir, '.squad'), state);
      expect(result.detections).toHaveLength(0);
      expect(result.hasAnyChanges).toBe(false);
    } finally {
      clean(emptyDir);
    }
  });
});

describe('upstream watcher — parseSyncConfig', () => {
  it('returns defaults when no upstream-config.json exists', () => {
    const dir = tmp('squad-sync-cfg-');
    try {
      const config = parseSyncConfig(dir);
      expect(config.interval).toBe(DEFAULT_SYNC_CONFIG.interval);
      expect(config.autoPr).toBe(DEFAULT_SYNC_CONFIG.autoPr);
      expect(config.branchPrefix).toBe(DEFAULT_SYNC_CONFIG.branchPrefix);
    } finally {
      clean(dir);
    }
  });

  it('reads custom sync config from upstream-config.json', () => {
    const dir = tmp('squad-sync-cfg2-');
    try {
      fs.writeFileSync(path.join(dir, 'upstream-config.json'), JSON.stringify({
        sync: { interval: 300, autoPr: true, branchPrefix: 'custom/sync' },
      }));
      const config = parseSyncConfig(dir);
      expect(config.interval).toBe(300);
      expect(config.autoPr).toBe(true);
      expect(config.branchPrefix).toBe('custom/sync');
    } finally {
      clean(dir);
    }
  });

  it('merges partial config with defaults', () => {
    const dir = tmp('squad-sync-cfg3-');
    try {
      fs.writeFileSync(path.join(dir, 'upstream-config.json'), JSON.stringify({
        sync: { interval: 120 },
      }));
      const config = parseSyncConfig(dir);
      expect(config.interval).toBe(120);
      expect(config.autoPr).toBe(DEFAULT_SYNC_CONFIG.autoPr);
      expect(config.branchPrefix).toBe(DEFAULT_SYNC_CONFIG.branchPrefix);
    } finally {
      clean(dir);
    }
  });
});

// ─── Phase 2: Proposer ─────────────────────────────────────────────

describe('upstream proposer — collectProposalFiles', () => {
  let squadDir: string;

  beforeAll(() => {
    squadDir = tmp('squad-propose-');
    const sq = squadDir;

    // Skills
    fs.mkdirSync(path.join(sq, 'skills', 'my-skill'), { recursive: true });
    fs.writeFileSync(path.join(sq, 'skills', 'my-skill', 'SKILL.md'), '# My Skill');
    fs.mkdirSync(path.join(sq, 'skills', 'other-skill'), { recursive: true });
    fs.writeFileSync(path.join(sq, 'skills', 'other-skill', 'SKILL.md'), '# Other');

    // Decisions
    fs.writeFileSync(path.join(sq, 'decisions.md'), '# Decisions');

    // Governance
    fs.writeFileSync(path.join(sq, 'routing.md'), '# Routing');
    fs.mkdirSync(path.join(sq, 'casting'), { recursive: true });
    fs.writeFileSync(path.join(sq, 'casting', 'policy.json'), '{}');
  });

  afterAll(() => clean(squadDir));

  it('collects skills when skills=true', () => {
    const files = collectProposalFiles(squadDir, { skills: true, decisions: false, governance: false });
    expect(files).toHaveLength(2);
    expect(files.map(f => f.path)).toContain('skills/my-skill/SKILL.md');
    expect(files.map(f => f.path)).toContain('skills/other-skill/SKILL.md');
  });

  it('collects decisions when decisions=true', () => {
    const files = collectProposalFiles(squadDir, { skills: false, decisions: true, governance: false });
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('decisions.md');
    expect(files[0].content).toBe('# Decisions');
  });

  it('collects governance when governance=true', () => {
    const files = collectProposalFiles(squadDir, { skills: false, decisions: false, governance: true });
    expect(files).toHaveLength(2);
    expect(files.map(f => f.path)).toContain('routing.md');
    expect(files.map(f => f.path)).toContain('casting/policy.json');
  });

  it('collects all when all flags true', () => {
    const files = collectProposalFiles(squadDir, { skills: true, decisions: true, governance: true });
    expect(files).toHaveLength(5); // 2 skills + 1 decisions + 2 governance
  });

  it('returns empty array when all flags false', () => {
    const files = collectProposalFiles(squadDir, { skills: false, decisions: false, governance: false });
    expect(files).toHaveLength(0);
  });
});

describe('upstream proposer — buildProposalSummary', () => {
  it('summarizes skills', () => {
    const files = [{ path: 'skills/a/SKILL.md', content: '' }];
    expect(buildProposalSummary(files)).toBe('Proposing: 1 skill');
  });

  it('pluralizes multiple skills', () => {
    const files = [
      { path: 'skills/a/SKILL.md', content: '' },
      { path: 'skills/b/SKILL.md', content: '' },
    ];
    expect(buildProposalSummary(files)).toContain('2 skills');
  });

  it('summarizes decisions', () => {
    const files = [{ path: 'decisions.md', content: '' }];
    expect(buildProposalSummary(files)).toBe('Proposing: decisions');
  });

  it('summarizes governance', () => {
    const files = [{ path: 'routing.md', content: '' }];
    expect(buildProposalSummary(files)).toContain('governance');
  });

  it('summarizes mixed content', () => {
    const files = [
      { path: 'skills/a/SKILL.md', content: '' },
      { path: 'decisions.md', content: '' },
      { path: 'routing.md', content: '' },
    ];
    const summary = buildProposalSummary(files);
    expect(summary).toContain('1 skill');
    expect(summary).toContain('decisions');
    expect(summary).toContain('governance');
  });

  it('returns "No files" message for empty array', () => {
    expect(buildProposalSummary([])).toBe('No files to propose');
  });
});

describe('upstream proposer — packageProposal', () => {
  let squadDir: string;
  let parentDir: string;

  beforeAll(() => {
    parentDir = tmp('squad-pkg-parent-');
    fs.mkdirSync(path.join(parentDir, '.squad'), { recursive: true });

    squadDir = tmp('squad-pkg-child-');
    const sq = squadDir;

    // Child content
    fs.mkdirSync(path.join(sq, 'skills', 'child-skill'), { recursive: true });
    fs.writeFileSync(path.join(sq, 'skills', 'child-skill', 'SKILL.md'), '# Child Skill');
    fs.writeFileSync(path.join(sq, 'decisions.md'), '# Child Decisions');

    // Upstream config pointing to parent
    fs.writeFileSync(path.join(sq, 'upstream.json'), JSON.stringify({
      upstreams: [
        { name: 'parent', type: 'local', source: parentDir, added_at: new Date().toISOString(), last_synced: null },
      ],
    }, null, 2));
  });

  afterAll(() => {
    clean(squadDir);
    clean(parentDir);
  });

  it('packages proposal for known upstream', () => {
    const pkg = packageProposal(squadDir, 'parent', { skills: true, decisions: true, governance: false });
    expect(pkg).not.toBeNull();
    expect(pkg!.upstreamName).toBe('parent');
    expect(pkg!.files.length).toBeGreaterThan(0);
    expect(pkg!.branchName).toContain(DEFAULT_PROPOSE_CONFIG.branchPrefix);
    expect(pkg!.summary).toContain('skill');
  });

  it('returns null for unknown upstream', () => {
    expect(packageProposal(squadDir, 'nonexistent', { skills: true, decisions: true, governance: false })).toBeNull();
  });

  it('returns null when no files match scope', () => {
    expect(packageProposal(squadDir, 'parent', { skills: false, decisions: false, governance: false })).toBeNull();
  });

  it('respects scope flags', () => {
    const skillsOnly = packageProposal(squadDir, 'parent', { skills: true, decisions: false, governance: false });
    expect(skillsOnly).not.toBeNull();
    expect(skillsOnly!.files.every(f => f.path.startsWith('skills/'))).toBe(true);

    const decisionsOnly = packageProposal(squadDir, 'parent', { skills: false, decisions: true, governance: false });
    expect(decisionsOnly).not.toBeNull();
    expect(decisionsOnly!.files.every(f => f.path === 'decisions.md')).toBe(true);
  });
});

describe('upstream proposer — parseProposeConfig', () => {
  it('returns defaults when no config file', () => {
    const dir = tmp('squad-pcfg-');
    try {
      const config = parseProposeConfig(dir);
      expect(config.scope.skills).toBe(true);
      expect(config.scope.decisions).toBe(true);
      expect(config.scope.governance).toBe(false);
      expect(config.targetBranch).toBe('main');
    } finally {
      clean(dir);
    }
  });

  it('reads custom propose config', () => {
    const dir = tmp('squad-pcfg2-');
    try {
      fs.writeFileSync(path.join(dir, 'upstream-config.json'), JSON.stringify({
        propose: {
          scope: { skills: false, decisions: true, governance: true },
          targetBranch: 'develop',
          branchPrefix: 'custom/propose',
        },
      }));
      const config = parseProposeConfig(dir);
      expect(config.scope.skills).toBe(false);
      expect(config.scope.governance).toBe(true);
      expect(config.targetBranch).toBe('develop');
      expect(config.branchPrefix).toBe('custom/propose');
    } finally {
      clean(dir);
    }
  });
});

// ─── Defaults validation ────────────────────────────────────────────

describe('sync-types defaults', () => {
  it('DEFAULT_SYNC_CONFIG has expected values', () => {
    expect(DEFAULT_SYNC_CONFIG.interval).toBe(600);
    expect(DEFAULT_SYNC_CONFIG.autoPr).toBe(false);
    expect(DEFAULT_SYNC_CONFIG.branchPrefix).toBe('squad/upstream-sync');
  });

  it('DEFAULT_PROPOSE_CONFIG has expected values', () => {
    expect(DEFAULT_PROPOSE_CONFIG.scope.skills).toBe(true);
    expect(DEFAULT_PROPOSE_CONFIG.scope.decisions).toBe(true);
    expect(DEFAULT_PROPOSE_CONFIG.scope.governance).toBe(false);
    expect(DEFAULT_PROPOSE_CONFIG.targetBranch).toBe('main');
    expect(DEFAULT_PROPOSE_CONFIG.branchPrefix).toBe('squad/child-propose');
  });
});
