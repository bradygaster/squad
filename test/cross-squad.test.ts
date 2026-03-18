/**
 * Tests for cross-squad orchestration — manifest parsing, discovery,
 * delegation args, status parsing, and display formatting.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  validateManifest,
  readManifest,
  discoverSquads,
  discoverFromUpstreams,
  discoverFromRegistry,
  buildDelegationArgs,
  buildStatusCheckArgs,
  parseIssueStatus,
  formatDiscoveryTable,
  findSquadByName,
} from '../packages/squad-sdk/src/runtime/cross-squad.js';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writeManifest(repoDir: string, manifest: Record<string, unknown>): void {
  const squadDir = path.join(repoDir, '.squad');
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(path.join(squadDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ============================================================================
// Manifest Validation
// ============================================================================

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(validateManifest({
      name: 'platform-squad',
      capabilities: ['kubernetes', 'helm'],
      contact: { repo: 'org/platform' },
      accepts: ['issues'],
    })).toBe(true);
  });

  it('accepts a full manifest with all optional fields', () => {
    expect(validateManifest({
      name: 'platform-squad',
      version: '1.0.0',
      description: 'Platform infrastructure team',
      capabilities: ['kubernetes', 'helm', 'monitoring'],
      contact: { repo: 'org/platform', labels: ['squad:platform'] },
      accepts: ['issues', 'prs'],
      skills: ['helm-developer', 'operator-developer'],
    })).toBe(true);
  });

  it('rejects null', () => {
    expect(validateManifest(null)).toBe(false);
  });

  it('rejects empty name', () => {
    expect(validateManifest({
      name: '',
      capabilities: ['k8s'],
      contact: { repo: 'org/r' },
      accepts: ['issues'],
    })).toBe(false);
  });

  it('rejects missing capabilities', () => {
    expect(validateManifest({
      name: 'squad',
      contact: { repo: 'org/r' },
      accepts: ['issues'],
    })).toBe(false);
  });

  it('rejects missing contact.repo', () => {
    expect(validateManifest({
      name: 'squad',
      capabilities: ['k8s'],
      contact: {},
      accepts: ['issues'],
    })).toBe(false);
  });

  it('rejects invalid accepts values', () => {
    expect(validateManifest({
      name: 'squad',
      capabilities: ['k8s'],
      contact: { repo: 'org/r' },
      accepts: ['emails'],
    })).toBe(false);
  });
});

// ============================================================================
// readManifest
// ============================================================================

describe('readManifest', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = makeTempDir('squad-manifest-read-');
  });

  afterAll(() => {
    cleanDir(tempDir);
  });

  it('reads a valid manifest file', () => {
    writeManifest(tempDir, {
      name: 'test-squad',
      capabilities: ['testing'],
      contact: { repo: 'org/test' },
      accepts: ['issues'],
    });
    const m = readManifest(tempDir);
    expect(m).not.toBeNull();
    expect(m!.name).toBe('test-squad');
    expect(m!.capabilities).toEqual(['testing']);
  });

  it('returns null for missing manifest', () => {
    const emptyDir = makeTempDir('squad-manifest-empty-');
    try {
      expect(readManifest(emptyDir)).toBeNull();
    } finally {
      cleanDir(emptyDir);
    }
  });

  it('returns null for invalid JSON', () => {
    const badDir = makeTempDir('squad-manifest-bad-');
    try {
      fs.mkdirSync(path.join(badDir, '.squad'), { recursive: true });
      fs.writeFileSync(path.join(badDir, '.squad', 'manifest.json'), 'not-json{{{');
      expect(readManifest(badDir)).toBeNull();
    } finally {
      cleanDir(badDir);
    }
  });

  it('returns null for manifest missing required fields', () => {
    const incompleteDir = makeTempDir('squad-manifest-incomplete-');
    try {
      fs.mkdirSync(path.join(incompleteDir, '.squad'), { recursive: true });
      fs.writeFileSync(
        path.join(incompleteDir, '.squad', 'manifest.json'),
        JSON.stringify({ name: 'oops' }),
      );
      expect(readManifest(incompleteDir)).toBeNull();
    } finally {
      cleanDir(incompleteDir);
    }
  });
});

// ============================================================================
// Discovery
// ============================================================================

describe('discoverSquads', () => {
  let repoDir: string;
  let platformDir: string;
  let frontendDir: string;

  beforeAll(() => {
    // Set up repo with upstream.json pointing to two squads
    repoDir = makeTempDir('squad-discover-repo-');
    platformDir = makeTempDir('squad-discover-platform-');
    frontendDir = makeTempDir('squad-discover-frontend-');

    writeManifest(platformDir, {
      name: 'platform-squad',
      description: 'Platform infrastructure',
      capabilities: ['kubernetes', 'helm', 'monitoring'],
      contact: { repo: 'org/platform', labels: ['squad:platform'] },
      accepts: ['issues', 'prs'],
      skills: ['helm-developer'],
    });

    writeManifest(frontendDir, {
      name: 'frontend-squad',
      capabilities: ['react', 'nextjs'],
      contact: { repo: 'org/frontend' },
      accepts: ['issues'],
    });

    const squadDir = path.join(repoDir, '.squad');
    fs.mkdirSync(squadDir, { recursive: true });
    fs.writeFileSync(path.join(squadDir, 'upstream.json'), JSON.stringify({
      upstreams: [
        { name: 'platform', type: 'local', source: platformDir, added_at: new Date().toISOString(), last_synced: null },
        { name: 'frontend', type: 'local', source: frontendDir, added_at: new Date().toISOString(), last_synced: null },
      ],
    }, null, 2));
  });

  afterAll(() => {
    cleanDir(repoDir);
    cleanDir(platformDir);
    cleanDir(frontendDir);
  });

  it('discovers both squads from upstreams', () => {
    const squads = discoverSquads(path.join(repoDir, '.squad'));
    expect(squads).toHaveLength(2);
    expect(squads.map(s => s.manifest.name)).toContain('platform-squad');
    expect(squads.map(s => s.manifest.name)).toContain('frontend-squad');
  });

  it('includes capabilities in discovered manifests', () => {
    const squads = discoverSquads(path.join(repoDir, '.squad'));
    const platform = squads.find(s => s.manifest.name === 'platform-squad')!;
    expect(platform.manifest.capabilities).toContain('kubernetes');
    expect(platform.manifest.capabilities).toContain('helm');
  });

  it('records source as upstream', () => {
    const squads = discoverSquads(path.join(repoDir, '.squad'));
    for (const s of squads) {
      expect(s.source).toBe('upstream');
    }
  });

  it('returns empty array when no upstream.json', () => {
    const emptyDir = makeTempDir('squad-discover-empty-');
    try {
      fs.mkdirSync(path.join(emptyDir, '.squad'), { recursive: true });
      const squads = discoverSquads(path.join(emptyDir, '.squad'));
      expect(squads).toEqual([]);
    } finally {
      cleanDir(emptyDir);
    }
  });

  it('skips upstreams without manifests', () => {
    const noManifestDir = makeTempDir('squad-discover-nomanifest-');
    const mixedRepo = makeTempDir('squad-discover-mixed-');
    try {
      fs.mkdirSync(path.join(noManifestDir, '.squad'), { recursive: true });
      // no manifest.json written

      const squadDir = path.join(mixedRepo, '.squad');
      fs.mkdirSync(squadDir, { recursive: true });
      fs.writeFileSync(path.join(squadDir, 'upstream.json'), JSON.stringify({
        upstreams: [
          { name: 'has-manifest', type: 'local', source: platformDir, added_at: new Date().toISOString(), last_synced: null },
          { name: 'no-manifest', type: 'local', source: noManifestDir, added_at: new Date().toISOString(), last_synced: null },
        ],
      }));

      const squads = discoverSquads(squadDir);
      expect(squads).toHaveLength(1);
      expect(squads[0]!.manifest.name).toBe('platform-squad');
    } finally {
      cleanDir(noManifestDir);
      cleanDir(mixedRepo);
    }
  });
});

// ============================================================================
// Registry Discovery
// ============================================================================

describe('discoverFromRegistry', () => {
  let registryDir: string;
  let squadADir: string;

  beforeAll(() => {
    registryDir = makeTempDir('squad-registry-');
    squadADir = makeTempDir('squad-registry-a-');

    writeManifest(squadADir, {
      name: 'registry-squad-a',
      capabilities: ['go', 'rust'],
      contact: { repo: 'org/services' },
      accepts: ['issues'],
    });
  });

  afterAll(() => {
    cleanDir(registryDir);
    cleanDir(squadADir);
  });

  it('discovers squads from a registry file', () => {
    const registryPath = path.join(registryDir, 'registry.json');
    fs.writeFileSync(registryPath, JSON.stringify([
      { name: 'squad-a', path: squadADir },
    ]));

    const squads = discoverFromRegistry(registryPath);
    expect(squads).toHaveLength(1);
    expect(squads[0]!.manifest.name).toBe('registry-squad-a');
    expect(squads[0]!.source).toBe('registry');
  });

  it('returns empty for missing registry file', () => {
    expect(discoverFromRegistry('/nonexistent/path')).toEqual([]);
  });

  it('returns empty for invalid JSON', () => {
    const badPath = path.join(registryDir, 'bad.json');
    fs.writeFileSync(badPath, 'nope');
    expect(discoverFromRegistry(badPath)).toEqual([]);
  });
});

// ============================================================================
// Delegation
// ============================================================================

describe('buildDelegationArgs', () => {
  it('builds correct gh cli args', () => {
    const args = buildDelegationArgs({
      targetRepo: 'org/platform',
      title: 'Add metrics endpoint',
      body: 'Need Prometheus metrics.',
      labels: ['squad:platform'],
    });

    expect(args).toContain('issue');
    expect(args).toContain('create');
    expect(args).toContain('--repo');
    expect(args).toContain('org/platform');
    expect(args).toContain('--title');
    expect(args).toContain('[cross-squad] Add metrics endpoint');
    expect(args).toContain('--body');
    expect(args).toContain('Need Prometheus metrics.');
    expect(args).toContain('--label');
    expect(args).toContain('squad:cross-squad');
    expect(args).toContain('squad:platform');
  });

  it('does not double-prefix [cross-squad] in title', () => {
    const args = buildDelegationArgs({
      targetRepo: 'org/platform',
      title: '[cross-squad] Already prefixed',
      body: 'test',
    });

    const titleIdx = args.indexOf('--title');
    expect(args[titleIdx + 1]).toBe('[cross-squad] Already prefixed');
  });

  it('adds squad:cross-squad label even when none provided', () => {
    const args = buildDelegationArgs({
      targetRepo: 'org/platform',
      title: 'test',
      body: 'test',
    });

    const labelIndices = args.reduce<number[]>((acc, a, i) => a === '--label' ? [...acc, i] : acc, []);
    const labels = labelIndices.map(i => args[i + 1]);
    expect(labels).toContain('squad:cross-squad');
  });
});

// ============================================================================
// Status Tracking
// ============================================================================

describe('buildStatusCheckArgs', () => {
  it('parses a valid GitHub issue URL', () => {
    const args = buildStatusCheckArgs('https://github.com/org/platform/issues/42');
    expect(args).not.toBeNull();
    expect(args).toContain('--repo');
    expect(args).toContain('org/platform');
    expect(args).toContain('42');
  });

  it('returns null for invalid URL', () => {
    expect(buildStatusCheckArgs('not-a-url')).toBeNull();
    expect(buildStatusCheckArgs('https://gitlab.com/org/repo/issues/1')).toBeNull();
  });
});

describe('parseIssueStatus', () => {
  it('parses open status', () => {
    const result = parseIssueStatus(
      JSON.stringify({ state: 'OPEN', title: 'Test issue' }),
      'https://github.com/org/repo/issues/1',
    );
    expect(result.state).toBe('open');
    expect(result.title).toBe('Test issue');
    expect(result.url).toBe('https://github.com/org/repo/issues/1');
  });

  it('parses closed status', () => {
    const result = parseIssueStatus(
      JSON.stringify({ state: 'CLOSED', title: 'Done' }),
      'https://github.com/org/repo/issues/2',
    );
    expect(result.state).toBe('closed');
  });

  it('handles unparseable JSON', () => {
    const result = parseIssueStatus('bad-json', 'https://github.com/org/repo/issues/3');
    expect(result.state).toBe('unknown');
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Display
// ============================================================================

describe('formatDiscoveryTable', () => {
  it('shows message when no squads found', () => {
    const output = formatDiscoveryTable([]);
    expect(output).toContain('No squads discovered');
  });

  it('formats discovered squads', () => {
    const output = formatDiscoveryTable([
      {
        manifest: {
          name: 'platform-squad',
          description: 'Platform team',
          capabilities: ['kubernetes', 'helm'],
          contact: { repo: 'org/platform' },
          accepts: ['issues', 'prs'],
        },
        source: 'upstream',
        sourceRef: 'platform',
      },
    ]);
    expect(output).toContain('platform-squad');
    expect(output).toContain('org/platform');
    expect(output).toContain('kubernetes');
    expect(output).toContain('Platform team');
  });

  it('truncates long capability lists', () => {
    const output = formatDiscoveryTable([
      {
        manifest: {
          name: 'big-squad',
          capabilities: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          contact: { repo: 'org/big' },
          accepts: ['issues'],
        },
        source: 'upstream',
        sourceRef: 'big',
      },
    ]);
    expect(output).toContain('+2 more');
  });
});

// ============================================================================
// findSquadByName
// ============================================================================

describe('findSquadByName', () => {
  const squads = [
    {
      manifest: {
        name: 'alpha',
        capabilities: ['a'],
        contact: { repo: 'org/alpha' } as const,
        accepts: ['issues' as const],
      },
      source: 'upstream' as const,
      sourceRef: 'alpha',
    },
    {
      manifest: {
        name: 'beta',
        capabilities: ['b'],
        contact: { repo: 'org/beta' } as const,
        accepts: ['issues' as const],
      },
      source: 'upstream' as const,
      sourceRef: 'beta',
    },
  ];

  it('finds squad by exact name', () => {
    expect(findSquadByName(squads, 'alpha')?.manifest.name).toBe('alpha');
    expect(findSquadByName(squads, 'beta')?.manifest.name).toBe('beta');
  });

  it('returns undefined for unknown name', () => {
    expect(findSquadByName(squads, 'gamma')).toBeUndefined();
  });
});
