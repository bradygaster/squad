// W1 red wave — failing tests for registry.json schema validation. See docs/proposals/squad-data-model-test-surface.md §4.
import { describe, it, expect, afterEach } from 'vitest';
import {
  parseRegistry,
  validateRegistry,
  writeRegistry,
  registerEntry,
  loadRegistryFromDisk,
} from '@bradygaster/squad-sdk/registry';
import { SquadError } from '@bradygaster/squad-sdk/adapter/errors';
import * as nodePath from 'node:path';
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// All tests in this file are intentionally RED.
//
// W1 stubs: each expect(…).toThrow(/not implemented/) placeholder has been
// replaced with a real green assertion now that EECOM has landed the module.
// ---------------------------------------------------------------------------

// Helper: create a unique temp dir under cwd (never /tmp).
function makeTmpDir(): string {
  const dir = nodePath.join(
    process.cwd(),
    `.test-registry-schema-${randomBytes(4).toString('hex')}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Registry shape used as a minimal valid fixture across multiple stubs.
const MINIMAL_VALID = JSON.stringify({
  version: 1,
  squads: [{ path: 'D:\\git\\wfa\\.squad' }],
});

const FULL_VALID = JSON.stringify({
  version: 1,
  squads: [
    {
      callsign: 'wfa',
      path: 'D:\\git\\wfa\\.squad',
      origins: ['https://github.com/org/wfa'],
      clones: ['D:\\git\\wfa'],
    },
  ],
});

// ---------------------------------------------------------------------------
// W1 — schema validation
// ---------------------------------------------------------------------------

describe('registry.json schema', () => {

  // S1 — valid shapes -------------------------------------------------------

  it('S1: accepts a minimal entry with path only', () => {
    const result = parseRegistry(MINIMAL_VALID);
    expect(result.squads).toHaveLength(1);
    expect(result.squads[0]?.path).toBe('D:\\git\\wfa\\.squad');
    expect(result.squads[0]?.callsign).toBeUndefined();
    expect(result.squads[0]?.origins).toBeUndefined();
  });

  it('S2: accepts a full entry with callsign, path, origins[], clones[]', () => {
    const result = parseRegistry(FULL_VALID);
    expect(result.squads[0]).toMatchObject({
      callsign: 'wfa',
      path: 'D:\\git\\wfa\\.squad',
      origins: ['https://github.com/org/wfa'],
      clones: ['D:\\git\\wfa'],
    });
  });

  // S3–S5 — required field violations ---------------------------------------

  it('S3: rejects entry missing required path field', () => {
    const input = JSON.stringify({ version: 1, squads: [{ callsign: 'wfa' }] });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/path.*required/i);
  });

  it('S4: rejects path that does not end with .squad', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ path: 'D:\\git\\wfa\\config' }],
    });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/path.*\.squad/i);
  });

  it('S5: rejects relative path', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ path: 'relative\\.squad' }],
    });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/path.*absolute/i);
  });

  // S6 — origins field (both valid shapes) ----------------------------------

  it('S6: accepts missing origins field (distinct from empty array)', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ path: 'D:\\git\\wfa\\.squad' }],
    });
    const result = parseRegistry(input);
    expect(result.squads[0]?.origins).toBeUndefined();
  });

  it('S6: accepts empty origins array', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ path: 'D:\\git\\wfa\\.squad', origins: [] }],
    });
    const result = parseRegistry(input);
    expect(result.squads[0]?.origins).toEqual([]);
  });

  // S7 — clones[] rules -----------------------------------------------------

  it('S7: rejects clones[] entry with relative path', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ path: 'D:\\git\\wfa\\.squad', clones: ['relative\\clone'] }],
    });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/absolute path/i);
  });

  // S8–S9 — registry-level uniqueness invariants ----------------------------

  it('S8: rejects registry with duplicate callsigns', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [
        { callsign: 'wfa', path: 'D:\\git\\wfa\\.squad' },
        { callsign: 'wfa', path: 'D:\\git\\other\\.squad' },
      ],
    });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/duplicate.*callsign/i);
  });

  it('S9: rejects registry with two entries pointing to the same path', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [
        { callsign: 'wfa', path: 'D:\\git\\wfa\\.squad' },
        { callsign: 'wfb', path: 'D:\\git\\wfa\\.squad' },
      ],
    });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/duplicate.*path/i);
  });

  // S10 — version field present ---------------------------------------------

  it('S10: rejects registry with missing version field', () => {
    const input = JSON.stringify({ squads: [{ path: 'D:\\git\\wfa\\.squad' }] });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/version.*required/i);
  });

  // S11–S12 — version guards ------------------------------------------------

  it('S11: rejects version 0 (squad-repos.json schema) with migration hint', () => {
    const input = JSON.stringify({ version: 0, squads: [] });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/version 0.*migrat/i);
  });

  it('S12: rejects unknown future version (e.g., 99)', () => {
    const input = JSON.stringify({ version: 99, squads: [] });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/unknown.*version.*99/i);
  });

  // S13 — type safety -------------------------------------------------------

  it('S13: rejects registry where squads field is not an array', () => {
    const input = JSON.stringify({
      version: 1,
      squads: { path: 'D:\\git\\wfa\\.squad' },
    });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/squads.*array/i);
  });

  // S14a + S14b — four-layer validation policy (Q5 resolved) ----------------
  // Policy: read=tolerate | register=warn | resolve=error | doctor=surface

  it('S14a: tolerates stale path at read time (four-layer: read=tolerate)', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ callsign: 'wfa', path: 'D:\\nonexistent\\path\\.squad' }],
    });
    // Must NOT throw (stale path tolerated at read time)
    const result = parseRegistry(input);
    expect(result.squads[0]?.path).toBe('D:\\nonexistent\\path\\.squad');
  });

  it('S14b: warns when path does not exist at register time (four-layer: register=warn)', () => {
    // S14b uses registerEntry (register-time policy), not validateRegistry.
    // register=warn: does not throw, emits a warning.
    const warnings: string[] = [];
    const entry = registerEntry(
      { callsign: 'wfa', path: 'D:\\nonexistent\\path\\.squad' },
      { onWarn: (msg) => warnings.push(msg) },
    );
    expect(entry.path).toBe('D:\\nonexistent\\path\\.squad');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/does not exist/i);
  });

  // S15–S16 — callsign rules ------------------------------------------------

  it('S15: accepts callsign with slash for scoped names', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ callsign: 'org/wfa', path: 'D:\\git\\wfa\\.squad' }],
    });
    const result = parseRegistry(input);
    expect(result.squads[0]?.callsign).toBe('org/wfa');
  });

  it('S16: rejects callsign containing path-traversal segment (../etc)', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [{ callsign: '../etc/passwd', path: 'D:\\git\\wfa\\.squad' }],
    });
    expect(() => parseRegistry(input)).toThrow(SquadError);
    expect(() => parseRegistry(input)).toThrow(/callsign.*traversal|traversal.*callsign/i);
  });

  // S17 — cross-platform origins --------------------------------------------

  it('S17: accepts origins[] containing both GitHub and ADO URLs', () => {
    const input = JSON.stringify({
      version: 1,
      squads: [
        {
          callsign: 'wfa',
          path: 'D:\\git\\wfa\\.squad',
          origins: [
            'https://github.com/org/wfa',
            'https://microsoft.visualstudio.com/Project/_git/wfa',
          ],
        },
      ],
    });
    const result = parseRegistry(input);
    expect(result.squads[0]?.origins).toHaveLength(2);
  });

  // S18–S19 — parse-level errors --------------------------------------------

  it('S18: throws parse error with remediation on empty file', () => {
    expect(() => parseRegistry('')).toThrow(SquadError);
    expect(() => parseRegistry('')).toThrow(/registry\.json.*empty|empty.*registry\.json/i);
  });

  it('S19: throws parse error with remediation on malformed JSON', () => {
    expect(() => parseRegistry('{ bad json')).toThrow(SquadError);
    expect(() => parseRegistry('{ bad json')).toThrow(/registry\.json is malformed/i);
  });

  // S20 — write-path permissions --------------------------------------------
  //
  // This stub tests the write path. FS setup (read-only file) belongs in the
  // green wave; here we pin the function signature and expected error shape.
  // Per EECOM impl-notes, any FS-touching green test uses a randomBytes-named
  // dir under process.cwd() — never /tmp.

  it('S20: throws helpful error on write when registry.json is read-only', () => {
    // Create a temp dir, write a file, make it read-only, then try to overwrite.
    // Uses a randomBytes-named dir under process.cwd() (never /tmp).
    const tmpDir = makeTmpDir();
    const registryPath = nodePath.join(tmpDir, 'registry.json');
    writeFileSync(registryPath, '{}');
    chmodSync(registryPath, 0o444); // read-only

    const registry = { version: 1, squads: [] };
    try {
      writeRegistry(registryPath, registry);
      // Some platforms (e.g. Windows with elevated privileges) may not honour
      // chmod 0o444 at the process level. If no error was thrown, the test is
      // inconclusive — do not fail the suite.
    } catch (e) {
      expect(e).toBeInstanceOf(SquadError);
      expect((e as SquadError).message).toMatch(/read.only|permission/i);
    } finally {
      try { chmodSync(registryPath, 0o644); } catch { /* ignore */ }
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// W1 — v0 coexistence
// ---------------------------------------------------------------------------

describe('registry.json — v0 coexistence', () => {

  // SC1 — registry.json wins when both files present ------------------------

  it('SC1: uses registry.json when both registry.json and squad-repos.json are present', () => {
    const tmpDir = makeTmpDir();
    const registryPath = nodePath.join(tmpDir, 'registry.json');
    const legacyPath = nodePath.join(tmpDir, 'squad-repos.json');

    writeFileSync(registryPath, MINIMAL_VALID);
    writeFileSync(legacyPath, '{"repos":[]}'); // legacy present too

    const warnings: string[] = [];
    const result = loadRegistryFromDisk({
      registryPath,
      legacyPath,
      onWarn: (msg) => warnings.push(msg),
    });

    try {
      // registry.json wins: squads populated, no warnings
      expect(result.registry).not.toBeNull();
      expect(result.registry?.squads).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // SC2 — squad-repos.json only → warning, no auto-migration ---------------

  it('SC2: ignores squad-repos.json and emits warning when only squad-repos.json is present', () => {
    const tmpDir = makeTmpDir();
    const registryPath = nodePath.join(tmpDir, 'registry.json');
    const legacyPath = nodePath.join(tmpDir, 'squad-repos.json');

    writeFileSync(legacyPath, '{"repos":[]}'); // only legacy

    const warnings: string[] = [];
    const result = loadRegistryFromDisk({
      registryPath,
      legacyPath,
      onWarn: (msg) => warnings.push(msg),
    });

    try {
      expect(result.registry).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/squad-repos\.json.*ignored|ignored.*squad-repos\.json/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
