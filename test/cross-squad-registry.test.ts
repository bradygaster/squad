/**
 * Tests for the registry CRUD helpers and the dual-path readManifest fix.
 *
 * Covers:
 * - readManifest accepts both repo-root and repo-root/.squad paths
 * - readSquadRegistry / writeSquadRegistry round-trip
 * - addRegistryEntry: success, duplicate-name rejection, invalid-manifest rejection
 * - removeRegistryEntry: returns true/false correctly
 * - Entries written by addRegistryEntry are picked up by discoverSquads
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readManifest,
  readSquadRegistry,
  writeSquadRegistry,
  addRegistryEntry,
  removeRegistryEntry,
  discoverSquads,
} from '../packages/squad-sdk/src/runtime/cross-squad.js';

const VALID_MANIFEST = {
  name: 'peer-squad',
  capabilities: ['kubernetes'],
  contact: { repo: 'org/peer' },
  accepts: ['issues'],
} as const;

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanDir(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function writePeerManifest(repoDir: string, manifest: object = VALID_MANIFEST): void {
  const squadDir = path.join(repoDir, '.squad');
  fs.mkdirSync(squadDir, { recursive: true });
  fs.writeFileSync(path.join(squadDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ============================================================================
// readManifest dual-path
// ============================================================================

describe('readManifest — dual-path acceptance', () => {
  let peer: string;

  beforeEach(() => {
    peer = makeTempDir('peer-');
    writePeerManifest(peer);
  });

  afterEach(() => cleanDir(peer));

  it('accepts the repo root path', () => {
    const m = readManifest(peer);
    expect(m).not.toBeNull();
    expect(m!.name).toBe('peer-squad');
  });

  it('accepts a path with trailing .squad', () => {
    const m = readManifest(path.join(peer, '.squad'));
    expect(m).not.toBeNull();
    expect(m!.name).toBe('peer-squad');
  });

  it('accepts a path with trailing .squad/', () => {
    const m = readManifest(path.join(peer, '.squad') + path.sep);
    expect(m).not.toBeNull();
  });

  it('returns null when no manifest is present', () => {
    const empty = makeTempDir('empty-');
    try {
      expect(readManifest(empty)).toBeNull();
    } finally {
      cleanDir(empty);
    }
  });
});

// ============================================================================
// Registry CRUD
// ============================================================================

describe('readSquadRegistry / writeSquadRegistry', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir('me-');
    fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  });

  afterEach(() => cleanDir(dir));

  it('returns empty array when no registry file exists', () => {
    expect(readSquadRegistry(path.join(dir, '.squad'))).toEqual([]);
  });

  it('round-trips entries', () => {
    const entries = [
      { name: 'a', path: '/tmp/a' },
      { name: 'b', path: '/tmp/b' },
    ];
    writeSquadRegistry(path.join(dir, '.squad'), entries);
    expect(readSquadRegistry(path.join(dir, '.squad'))).toEqual(entries);
  });

  it('returns empty on malformed JSON', () => {
    const reg = path.join(dir, '.squad', 'squad-registry.json');
    fs.writeFileSync(reg, '{ not json');
    expect(readSquadRegistry(path.join(dir, '.squad'))).toEqual([]);
  });

  it('returns empty when JSON is not an array', () => {
    const reg = path.join(dir, '.squad', 'squad-registry.json');
    fs.writeFileSync(reg, '{"name":"a","path":"/tmp"}');
    expect(readSquadRegistry(path.join(dir, '.squad'))).toEqual([]);
  });

  it('filters out malformed entries', () => {
    const reg = path.join(dir, '.squad', 'squad-registry.json');
    fs.writeFileSync(reg, JSON.stringify([
      { name: 'good', path: '/tmp/g' },
      { name: 42, path: '/tmp/bad' },
      { name: 'no-path' },
      null,
      { name: 'ok', path: '/tmp/ok' },
    ]));
    const entries = readSquadRegistry(path.join(dir, '.squad'));
    expect(entries.map(e => e.name).sort()).toEqual(['good', 'ok']);
  });

  it('creates .squad dir on write if missing', () => {
    const fresh = makeTempDir('fresh-');
    try {
      const squadDir = path.join(fresh, '.squad');
      writeSquadRegistry(squadDir, [{ name: 'x', path: '/tmp/x' }]);
      expect(fs.existsSync(path.join(squadDir, 'squad-registry.json'))).toBe(true);
    } finally {
      cleanDir(fresh);
    }
  });
});

describe('addRegistryEntry', () => {
  let me: string;
  let peer: string;
  let mySquadDir: string;

  beforeEach(() => {
    me = makeTempDir('me-');
    peer = makeTempDir('peer-');
    mySquadDir = path.join(me, '.squad');
    fs.mkdirSync(mySquadDir, { recursive: true });
    writePeerManifest(peer);
  });

  afterEach(() => {
    cleanDir(me);
    cleanDir(peer);
  });

  it('writes the entry on success', () => {
    const result = addRegistryEntry(mySquadDir, 'friend', peer);
    expect(result.added).toBe(true);
    expect(result.manifest?.name).toBe('peer-squad');
    expect(readSquadRegistry(mySquadDir)).toEqual([{ name: 'friend', path: peer }]);
  });

  it('refuses on duplicate name', () => {
    addRegistryEntry(mySquadDir, 'friend', peer);
    const second = addRegistryEntry(mySquadDir, 'friend', peer);
    expect(second.added).toBe(false);
    expect(second.reason).toBe('duplicate-name');
    expect(readSquadRegistry(mySquadDir).length).toBe(1);
  });

  it('refuses when path has no manifest', () => {
    const noManifest = makeTempDir('no-manifest-');
    try {
      const result = addRegistryEntry(mySquadDir, 'broken', noManifest);
      expect(result.added).toBe(false);
      expect(result.reason).toBe('invalid-manifest');
      expect(readSquadRegistry(mySquadDir)).toEqual([]);
    } finally {
      cleanDir(noManifest);
    }
  });

  it('accepts .squad-suffixed paths', () => {
    const result = addRegistryEntry(mySquadDir, 'friend', path.join(peer, '.squad'));
    expect(result.added).toBe(true);
  });
});

describe('removeRegistryEntry', () => {
  let me: string;
  let mySquadDir: string;

  beforeEach(() => {
    me = makeTempDir('me-');
    mySquadDir = path.join(me, '.squad');
    fs.mkdirSync(mySquadDir, { recursive: true });
    writeSquadRegistry(mySquadDir, [
      { name: 'a', path: '/tmp/a' },
      { name: 'b', path: '/tmp/b' },
    ]);
  });

  afterEach(() => cleanDir(me));

  it('returns true and removes when name exists', () => {
    expect(removeRegistryEntry(mySquadDir, 'a')).toBe(true);
    expect(readSquadRegistry(mySquadDir)).toEqual([{ name: 'b', path: '/tmp/b' }]);
  });

  it('returns false when name does not exist', () => {
    expect(removeRegistryEntry(mySquadDir, 'missing')).toBe(false);
    expect(readSquadRegistry(mySquadDir).length).toBe(2);
  });
});

// ============================================================================
// End-to-end — addRegistryEntry feeds discoverSquads
// ============================================================================

describe('registry → discoverSquads integration', () => {
  let me: string;
  let peer: string;
  let mySquadDir: string;

  beforeEach(() => {
    me = makeTempDir('me-');
    peer = makeTempDir('peer-');
    mySquadDir = path.join(me, '.squad');
    fs.mkdirSync(mySquadDir, { recursive: true });
    writePeerManifest(peer);
  });

  afterEach(() => {
    cleanDir(me);
    cleanDir(peer);
  });

  it('addRegistryEntry makes the peer discoverable', () => {
    addRegistryEntry(mySquadDir, 'friend', peer);
    const discovered = discoverSquads(mySquadDir);
    expect(discovered.length).toBe(1);
    expect(discovered[0]?.manifest.name).toBe('peer-squad');
    expect(discovered[0]?.source).toBe('registry');
    expect(discovered[0]?.sourceRef).toBe('friend');
  });

  it('removeRegistryEntry makes the peer un-discoverable', () => {
    addRegistryEntry(mySquadDir, 'friend', peer);
    expect(discoverSquads(mySquadDir).length).toBe(1);
    removeRegistryEntry(mySquadDir, 'friend');
    expect(discoverSquads(mySquadDir).length).toBe(0);
  });
});
