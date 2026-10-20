import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _setCastingDurabilityHooksForTesting,
  CastingCommitInDoubtError,
  backfillCastingRegistryFromTeam,
  ensureCastingRegistryPair,
  hasExistingCastHistory,
  normalizeHandwrittenCastingRegistry,
  parseAgentProvenanceRegistry,
  parseTeamRoster,
  readCastingRegistryPair,
  repairHandwrittenCastingRegistry,
} from '@bradygaster/squad-sdk/casting';
import { isInteractiveSession, runInit } from '@bradygaster/squad-cli/core/init';
import { ensureCastingDefaults, runUpgrade } from '@bradygaster/squad-cli/core/upgrade';

const MANIFEST = 'registry-history.commit.json';
const JOURNAL = 'registry-history.transaction.json';
const ARCHIVE_RE = /^handwritten-archive-[0-9a-f]{64}$/;

function snapshotTree(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result[`${entry.name}/`] = '';
      for (const [k, v] of Object.entries(snapshotTree(full))) {
        result[`${entry.name}/${k}`] = v;
      }
    } else {
      result[entry.name] = fs.readFileSync(full).toString('base64');
    }
  }
  return result;
}

function writeCharter(squadDir: string, id: string, name: string, role = 'Specialist'): void {
  const folder = path.join(squadDir, 'agents', id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'charter.md'), `# ${name}\n\n## Identity\n\n- **Name:** ${name}\n- **Role:** ${role}\n\n## Scope\n\nStuff.\n`);
}

describe('Layer 2: Handwritten casting registry repair & backfill', () => {
  const shapes: Record<string, unknown> = {
    'role-keyed entries without a wrapper': {
      lead: { name: 'Avery', status: 'active' },
      backend: { name: 'Nova', role: 'Backend Developer' },
      tester: { name: 'Quinn' },
    },
    'agents as an array': {
      universe: 'Star Trek',
      agents: [
        { name: 'Data', role: 'Expert' },
        { name: "B'Elanna", role: 'Engineer', status: 'ACTIVE' },
      ],
    },
    'simplified object with version and name/role/status': {
      version: 1,
      universe: 'Squad',
      agents: {
        avery: { name: 'Avery', role: 'Lead', status: 'active' },
        nova: { name: 'Nova', role: 'Dev', status: 'weird' },
      },
    },
    'bare array': [
      { name: 'Ada', role: 'Core' },
      { name: 'Linus', role: 'CLI' },
    ],
  };

  let castingDir: string;

  beforeEach(() => {
    castingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-casting-repair-'));
  });

  afterEach(() => {
    _setCastingDurabilityHooksForTesting(null);
    vi.restoreAllMocks();
    fs.rmSync(castingDir, { recursive: true, force: true });
  });

  const write = (name: string, body: unknown): void => {
    fs.writeFileSync(
      path.join(castingDir, name),
      typeof body === 'string' ? body : JSON.stringify(body, null, 2),
    );
  };

  const initEmptyCanonicalPair = (dir = castingDir): void => {
    const reg = JSON.stringify({
      schema: 'squad-agent-provenance/v1',
      schema_version: 1,
      revision: 1,
      generated_at: '1970-01-01T00:00:00.000Z',
      agents: {},
    });
    const hist = JSON.stringify({
      universe_usage_history: [],
      assignment_cast_snapshots: {},
    });
    ensureCastingRegistryPair(dir, reg, hist, 'test init');
  };

  it.each(Object.keys(shapes))('normalizes handwritten shape: %s', (name) => {
    const { registry: reg, dropped } = normalizeHandwrittenCastingRegistry(shapes[name], '2026-10-18T00:00:00.000Z');
    expect(dropped).toEqual([]);
    expect(reg).toBeDefined();
    const parsed = parseAgentProvenanceRegistry(reg);
    expect(parsed.completeness).toBe('complete');
    for (const [id, rec] of Object.entries(reg!.agents)) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(rec.persistent_name).toBe(rec.display_name);
      expect(['active', 'inactive', 'retired']).toContain(rec.status);
    }
  });

  it('maps role keys and names to canonical ids, roles, and statuses', () => {
    const reg = normalizeHandwrittenCastingRegistry(shapes['role-keyed entries without a wrapper']).registry!;
    expect(Object.keys(reg.agents).sort()).toEqual(['avery', 'nova', 'quinn']);
    expect(reg.agents['avery']).toMatchObject({ display_name: 'Avery', role: 'lead', status: 'active' });
    expect(reg.agents['nova']).toMatchObject({ role: 'Backend Developer' });
    expect(reg.agents['quinn']).toMatchObject({ display_name: 'Quinn', role: 'tester' });
    const belanna = normalizeHandwrittenCastingRegistry(shapes['agents as an array']).registry!;
    expect(Object.keys(belanna.agents)).toEqual(['data', 'b-elanna']);
    expect(belanna.agents['b-elanna']!.status).toBe('active');
    expect(
      normalizeHandwrittenCastingRegistry(shapes['simplified object with version and name/role/status']).registry!.agents['nova']!.status,
    ).toBe('active');
  });

  describe('per-record normalization (H3)', () => {
    const valid = {
      display_name: 'Data',
      persistent_name: 'Data',
      role: 'Android',
      universe: 'Star Trek',
      status: 'active',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-02-01T00:00:00.000Z',
      github_handle: 'data-bot',
      legacy_named: true,
      avatar: { kind: 'repository-path', path: '.squad/agents/data/avatar.png' },
    };

    it('preserves already-valid records verbatim and only completes incomplete ones', () => {
      const result = normalizeHandwrittenCastingRegistry({
        schema: 'squad-agent-provenance/v1',
        schema_version: 1,
        revision: 4,
        generated_at: '2025-03-01T00:00:00.000Z',
        agents: {
          data: valid,
          tuvok: { name: 'Tuvok', role: 'Security', universe: 'Voyager', created_at: '2025-01-05T00:00:00.000Z', status: 'retired' },
        },
      }, '2026-10-18T00:00:00.000Z');
      expect(result.dropped).toEqual([]);
      const reg = result.registry!;
      expect(reg.agents['data']).toEqual(valid);
      expect(reg.agents['tuvok']).toMatchObject({
        name: 'Tuvok',
        display_name: 'Tuvok',
        persistent_name: 'Tuvok',
        role: 'Security',
        universe: 'Voyager',
        status: 'retired',
        created_at: '2025-01-05T00:00:00.000Z',
        updated_at: '2026-10-18T00:00:00.000Z',
        retired_at: '2026-10-18T00:00:00.000Z',
      });
      expect(reg.revision).toBe(5);
      expect(reg.generated_at).toBe('2026-10-18T00:00:00.000Z');
      expect(parseAgentProvenanceRegistry(reg).completeness).toBe('complete');
    });

    it('starts at revision 1 when the handwritten registry carries no revision', () => {
      expect(normalizeHandwrittenCastingRegistry(shapes['bare array']).registry!.revision).toBe(1);
    });
  });

  describe('fail-closed heuristics (M8)', () => {
    it('does not treat bare-string or non-agent top-level values as agents', () => {
      const meta = normalizeHandwrittenCastingRegistry({ team_name: 'Alpha', notes: 'wip', owner: 'me' });
      expect(meta.registry).toBeUndefined();
      expect(meta.dropped.map((d) => d.name).sort()).toEqual(['notes', 'owner', 'team_name']);
      expect(meta.reason).toMatch(/could not be normalized/);

      const bare = normalizeHandwrittenCastingRegistry({ avery: 'Lead / Architect' });
      expect(bare.registry).toBeUndefined();
      expect(bare.dropped).toEqual([{ name: 'avery', reason: expect.stringMatching(/ambiguous/) }]);

      const noIdentity = normalizeHandwrittenCastingRegistry({ settings: { verbose: true } });
      expect(noIdentity.registry).toBeUndefined();
      expect(noIdentity.dropped).toEqual([{ name: 'settings', reason: expect.stringMatching(/none of name/) }]);
    });

    it('fails closed instead of silently dropping unmappable, duplicate, or colliding records', () => {
      const nonLatin = normalizeHandwrittenCastingRegistry({ agents: [{ name: 'Data', role: 'x' }, { name: '数据', role: 'y' }] });
      expect(nonLatin.registry).toBeUndefined();
      expect(nonLatin.dropped).toEqual([{ name: '数据', reason: expect.stringMatching(/kebab-case agent id/) }]);

      const duplicate = normalizeHandwrittenCastingRegistry({ agents: [{ name: 'Data', role: 'x' }, { name: 'data', role: 'y' }] });
      expect(duplicate.registry).toBeUndefined();
      expect(duplicate.dropped).toHaveLength(1);

      const collision = normalizeHandwrittenCastingRegistry({ agents: { nova: { name: 'Nova', role: 'a' }, other: { id: 'nova', name: 'Other', role: 'b' } } });
      expect(collision.registry).toBeUndefined();
      expect(collision.dropped).toEqual([{ name: 'Other', reason: expect.stringMatching(/collides/) }]);
    });

    it('repair reports the dropped entries and leaves disk untouched', () => {
      write('registry.json', { lead: { name: 'Avery' }, tester: 'Quinn' });
      const beforeTree = snapshotTree(castingDir);
      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(result).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/could not be normalized/),
        dropped: [{ name: 'tester', reason: expect.stringMatching(/ambiguous/) }],
      });
      expect(snapshotTree(castingDir)).toEqual(beforeTree);
    });
  });

  it.each(Object.keys(shapes))(
    'repairs on disk and archives the originals under handwritten-archive-<sha> by default: %s',
    (name) => {
      write('registry.json', shapes[name]);
      const original = fs.readFileSync(path.join(castingDir, 'registry.json'));
      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(result).toMatchObject({
        repaired: true,
        files: ['registry.json', 'history.json', MANIFEST],
        backupPath: expect.stringMatching(ARCHIVE_RE),
      });
      expect(fs.readdirSync(castingDir).filter((f) => f.endsWith('.bak'))).toEqual([]);
      expect(fs.readFileSync(path.join(castingDir, result.backupPath!, 'registry.json')).equals(original)).toBe(true);
      expect(fs.existsSync(path.join(castingDir, result.backupPath!, 'history.json'))).toBe(false);

      const pair = readCastingRegistryPair(castingDir);
      expect(Object.keys(pair.registry!.agents as object).length).toBeGreaterThan(0);
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
    },
  );

  it('skips the archive only when options.keepBackup === false is explicitly passed', () => {
    initEmptyCanonicalPair();
    write('registry.json', shapes['role-keyed entries without a wrapper']);
    const originalRegistry = fs.readFileSync(path.join(castingDir, 'registry.json'), 'utf8');
    const originalManifest = fs.readFileSync(path.join(castingDir, MANIFEST), 'utf8');

    const archived = repairHandwrittenCastingRegistry(castingDir, { keepBackup: true });
    expect(archived.backupPath).toMatch(ARCHIVE_RE);
    expect(fs.readFileSync(path.join(castingDir, archived.backupPath!, 'registry.json'), 'utf8')).toBe(originalRegistry);
    expect(fs.readFileSync(path.join(castingDir, archived.backupPath!, MANIFEST), 'utf8')).toBe(originalManifest);
    expect(fs.existsSync(path.join(castingDir, archived.backupPath!, 'history.json'))).toBe(true);

    fs.rmSync(path.join(castingDir, archived.backupPath!), { recursive: true, force: true });
    fs.rmSync(path.join(castingDir, 'history.json'));
    fs.rmSync(path.join(castingDir, MANIFEST));
    write('registry.json', shapes['agents as an array']);
    const bare = repairHandwrittenCastingRegistry(castingDir, { keepBackup: false });
    expect(bare.repaired).toBe(true);
    expect(bare.backupPath).toBeUndefined();
    expect(fs.readdirSync(castingDir).filter((f) => ARCHIVE_RE.test(f))).toEqual([]);
  });

  it('strips a UTF-8 BOM before parsing registry.json', () => {
    fs.writeFileSync(path.join(castingDir, 'registry.json'), '\uFEFF' + JSON.stringify(shapes['bare array']));
    expect(repairHandwrittenCastingRegistry(castingDir).repaired).toBe(true);
    expect(Object.keys(readCastingRegistryPair(castingDir).registry!.agents as object).sort()).toEqual(['ada', 'linus']);
  });

  it('preserves retired and inactive agents and commits a canonical manifest', () => {
    write('registry.json', {
      universe: 'Star Trek',
      agents: [
        { name: 'Data', role: 'Expert', status: 'active' },
        { name: 'Tuvok', role: 'Security', status: 'retired' },
        { name: 'Neelix', role: 'Morale', status: 'inactive' },
      ],
    });
    const result = repairHandwrittenCastingRegistry(castingDir);
    expect(result).toMatchObject({
      repaired: true,
      files: ['registry.json', 'history.json', MANIFEST],
    });
    const pair = readCastingRegistryPair(castingDir);
    const agents = pair.registry!.agents as Record<string, Record<string, unknown>>;
    expect(agents['tuvok']!['status']).toBe('retired');
    expect(typeof agents['tuvok']!['retired_at']).toBe('string');
    expect(agents['neelix']!['status']).toBe('inactive');
    expect(agents['data']!['status']).toBe('active');
  });

  describe('Lock acquisition before reading registry or staging repair', () => {
    it('acquires registry.lock BEFORE reading registry.json, history.json, or commit manifest', () => {
      initEmptyCanonicalPair();
      write('registry.json', {
        universe: 'Star Trek',
        agents: [{ name: 'Data', role: 'Expert' }],
      });

      let lockHeldAtBeforePublish = false;
      let lockHeldDuringRead = false;
      // If a concurrent writer updates registry.json right before our lock publishes,
      // repairHandwrittenCastingRegistry must read the post-lock bytes rather than stale pre-lock bytes.
      _setCastingDurabilityHooksForTesting({
        boundary: ({ boundary }) => {
          if (boundary === 'lock:before-publish') {
            lockHeldAtBeforePublish = true;
            write('registry.json', {
              universe: 'Star Trek',
              agents: [
                { name: 'Data', role: 'Expert' },
                { name: 'Seven', role: 'Astrometrics' },
              ],
            });
          }
          if (boundary === 'lock:after-publish') {
            lockHeldDuringRead = fs.existsSync(path.join(castingDir, 'registry.lock'));
          }
        },
      });

      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(lockHeldAtBeforePublish).toBe(true);
      expect(lockHeldDuringRead).toBe(true);
      expect(result.repaired).toBe(true);
      const pair = readCastingRegistryPair(castingDir);
      expect(Object.keys(pair.registry!.agents as object).sort()).toEqual(['data', 'seven']);
    });

    it('backfillCastingRegistryFromTeam acquires registry.lock BEFORE reading registry.json', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-backfill-lock-'));
      try {
        const squadDir = path.join(dest, '.squad');
        const dir = path.join(squadDir, 'casting');
        fs.mkdirSync(dir, { recursive: true });
        initEmptyCanonicalPair(dir);
        writeCharter(squadDir, 'neo', 'Neo', 'Lead');
        const teamMdPath = path.join(squadDir, 'team.md');
        fs.writeFileSync(
          teamMdPath,
          ['# Team', '', '**Universe:** Matrix', '', '## Members', '', '| Name | Role |', '|---|---|', '| Neo | Lead |'].join('\n'),
        );

        const origReadFileSync = fs.readFileSync.bind(fs);
        const lockStatesOnRegistryRead: boolean[] = [];
        vi.spyOn(fs, 'readFileSync').mockImplementation(((p: fs.PathOrFileDescriptor, ...args: unknown[]) => {
          if (typeof p === 'string' && path.basename(p) === 'registry.json') {
            lockStatesOnRegistryRead.push(fs.existsSync(path.join(dir, 'registry.lock')));
          }
          return (origReadFileSync as (...a: unknown[]) => unknown)(p, ...args);
        }) as typeof fs.readFileSync);

        const res = backfillCastingRegistryFromTeam(dir, teamMdPath);
        expect(res.repaired).toBe(true);
        expect(lockStatesOnRegistryRead.length).toBeGreaterThan(0);
        expect(lockStatesOnRegistryRead[0]).toBe(true);
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });
  });

  describe('Rollback on commitCastingRegistryPair failure (no fresh-cast fallback)', () => {
    it.each(['payload:registry-write', 'journal:write'] as const)(
      'restores original bytes and rethrows when commitCastingRegistryPair fails before the journal is durable at %s',
      (failingBoundary) => {
        initEmptyCanonicalPair();
        write('registry.json', shapes['role-keyed entries without a wrapper']);
        const beforeTree = snapshotTree(castingDir);

        _setCastingDurabilityHooksForTesting({
          boundary: ({ boundary }) => {
            if (boundary === failingBoundary) {
              throw new Error(`simulated ${failingBoundary} failure`);
            }
          },
        });

        expect(() => repairHandwrittenCastingRegistry(castingDir)).toThrow(
          new RegExp(`simulated ${failingBoundary} failure`),
        );
        expect(snapshotTree(castingDir)).toEqual(beforeTree);
        expect(fs.existsSync(path.join(castingDir, MANIFEST))).toBe(true);
        expect(fs.readdirSync(castingDir).filter((f) => f.endsWith('.bak') || ARCHIVE_RE.test(f))).toEqual([]);
      },
    );

    it('does NOT restore previous bytes once the journal is durable (in-doubt commit), and rolls forward on the next run', () => {
      initEmptyCanonicalPair();
      write('registry.json', shapes['role-keyed entries without a wrapper']);
      const handwritten = fs.readFileSync(path.join(castingDir, 'registry.json'));
      const historyBefore = fs.readFileSync(path.join(castingDir, 'history.json'));

      // history is replaced after the journal is durable; failing the later registry write (and its recovery)
      // leaves the transaction in doubt
      _setCastingDurabilityHooksForTesting({
        boundary: ({ boundary }) => {
          if (boundary === 'registry:write') throw new Error('simulated registry:write failure');
        },
      });
      let thrown: unknown;
      try {
        repairHandwrittenCastingRegistry(castingDir);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(CastingCommitInDoubtError);
      expect(fs.existsSync(path.join(castingDir, JOURNAL))).toBe(true);
      expect(fs.readFileSync(path.join(castingDir, 'registry.json')).equals(handwritten)).toBe(true);
      expect(fs.readFileSync(path.join(castingDir, 'history.json')).equals(historyBefore)).toBe(false);
      expect(fs.readdirSync(castingDir).filter((f) => ARCHIVE_RE.test(f))).toHaveLength(1);

      _setCastingDurabilityHooksForTesting(null);
      const next = repairHandwrittenCastingRegistry(castingDir);
      expect(next).toEqual({ repaired: false, files: [] });
      expect(fs.existsSync(path.join(castingDir, JOURNAL))).toBe(false);
      const pair = readCastingRegistryPair(castingDir);
      expect(Object.keys(pair.registry!.agents as object).sort()).toEqual(['avery', 'nova', 'quinn']);
    });

    it('rolls a pending journal forward before taking the repair snapshot', () => {
      initEmptyCanonicalPair();
      write('registry.json', shapes['agents as an array']);
      _setCastingDurabilityHooksForTesting({
        boundary: ({ boundary }) => {
          if (boundary === 'manifest:write') throw new Error('simulated manifest:write failure');
        },
      });
      expect(() => repairHandwrittenCastingRegistry(castingDir)).toThrow(CastingCommitInDoubtError);
      expect(fs.existsSync(path.join(castingDir, JOURNAL))).toBe(true);
      expect(() => readCastingRegistryPair(castingDir, 1)).toThrow(/roll-forward/);

      _setCastingDurabilityHooksForTesting(null);
      const recoveredAt: string[] = [];
      _setCastingDurabilityHooksForTesting({
        boundary: ({ boundary }) => { if (boundary === 'cleanup:journal-unlink') recoveredAt.push(boundary); },
      });
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
      expect(recoveredAt).toEqual(['cleanup:journal-unlink']);
      expect(Object.keys(readCastingRegistryPair(castingDir).registry!.agents as object)).toEqual(['data', 'b-elanna']);
    });

    it('never falls back to writing a fresh cast when recommitting a manifest-mismatched canonical pair fails', () => {
      write('registry.json', shapes['agents as an array']);
      repairHandwrittenCastingRegistry(castingDir);
      const committed = readCastingRegistryPair(castingDir);

      // Reformat registry.json so it is canonical but disagrees with the commit manifest bytes
      fs.writeFileSync(path.join(castingDir, 'registry.json'), JSON.stringify(committed.registry));
      const beforeTree = snapshotTree(castingDir);

      _setCastingDurabilityHooksForTesting({
        boundary: ({ boundary }) => {
          if (boundary === 'payload:history-write') {
            throw new Error('simulated recommit failure');
          }
        },
      });

      expect(() => repairHandwrittenCastingRegistry(castingDir)).toThrow(/simulated recommit failure/);
      expect(snapshotTree(castingDir)).toEqual(beforeTree);
    });

    it('recommits a manifest-mismatched canonical pair at the next revision', () => {
      write('registry.json', shapes['agents as an array']);
      repairHandwrittenCastingRegistry(castingDir);
      const committed = readCastingRegistryPair(castingDir);
      fs.writeFileSync(path.join(castingDir, 'registry.json'), JSON.stringify(committed.registry));

      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(result).toMatchObject({ repaired: true, backupPath: expect.stringMatching(ARCHIVE_RE) });
      const recommitted = readCastingRegistryPair(castingDir);
      expect(recommitted.registry!['revision']).toBe((committed.registry!['revision'] as number) + 1);
      expect(recommitted.history!['assignment_cast_snapshots']).toEqual(committed.history!['assignment_cast_snapshots']);
    });

    it('restores original bytes and rethrows when backfillCastingRegistryFromTeam fails during commit', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-backfill-rollback-'));
      try {
        const squadDir = path.join(dest, '.squad');
        const dir = path.join(squadDir, 'casting');
        fs.mkdirSync(dir, { recursive: true });
        initEmptyCanonicalPair(dir);
        writeCharter(squadDir, 'neo', 'Neo', 'Lead');
        const teamMdPath = path.join(squadDir, 'team.md');
        fs.writeFileSync(
          teamMdPath,
          ['# Team', '', '**Universe:** Matrix', '', '## Members', '', '| Name | Role |', '|---|---|', '| Neo | Lead |'].join('\n'),
        );
        const beforeTree = snapshotTree(dir);

        _setCastingDurabilityHooksForTesting({
          boundary: ({ boundary }) => {
            if (boundary === 'payload:registry-write') {
              throw new Error('backfill commit failed');
            }
          },
        });

        expect(() => backfillCastingRegistryFromTeam(dir, teamMdPath)).toThrow(/backfill commit failed/);
        expect(snapshotTree(dir)).toEqual(beforeTree);
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });
  });

  describe('Canonical and historical registries are never overwritten', () => {
    it('leaves canonical registries, absent registries, and unrecoverable content untouched', () => {
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });

      initEmptyCanonicalPair();
      const emptyCanonicalTree = snapshotTree(castingDir);
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
      expect(snapshotTree(castingDir)).toEqual(emptyCanonicalTree);

      const canonical = normalizeHandwrittenCastingRegistry(shapes['bare array']).registry!;
      fs.rmSync(path.join(castingDir, MANIFEST), { force: true });
      write('registry.json', canonical);
      write('history.json', { universe_usage_history: [], assignment_cast_snapshots: {} });
      const before = fs.readFileSync(path.join(castingDir, 'registry.json'), 'utf8');
      expect(repairHandwrittenCastingRegistry(castingDir).repaired).toBe(false);
      expect(fs.readFileSync(path.join(castingDir, 'registry.json'), 'utf8')).toBe(before);

      write('registry.json', '{ not json');
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/not valid JSON/),
      });
      write('registry.json', { agents: {}, note: 'empty' });
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/no recoverable agents/),
      });
      expect(fs.readdirSync(castingDir).filter((f) => ARCHIVE_RE.test(f))).toEqual([]);
    });

    it('refuses to overwrite a non-canonical registry when history.json has cast history for other agents', () => {
      write('registry.json', shapes['role-keyed entries without a wrapper']);
      write('history.json', {
        universe_usage_history: [{ universe: 'Original', used_at: '2026-01-01T00:00:00.000Z' }],
        assignment_cast_snapshots: {
          'init-cast': {
            universe: 'Original',
            created_at: '2026-01-01T00:00:00.000Z',
            agents: ['alpha'],
          },
        },
      });
      const beforeTree = snapshotTree(castingDir);
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/cast history.*unknown agent "alpha"/),
      });
      expect(snapshotTree(castingDir)).toEqual(beforeTree);

      write('history.json', {
        assignment_cast_snapshots: { a: { agents: ['avery'] }, b: { agents: ['nova'] } },
        universe_usage_history: [],
      });
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/2 snapshots/),
      });
    });

    it('normalizes a single Init Mode snapshot that is consistent with the handwritten registry (M9)', () => {
      write('registry.json', {
        universe: 'Star Trek',
        agents: { lead: { name: 'Data', role: 'Lead' }, security: { name: 'Tuvok', role: 'Security' } },
      });
      write('history.json', {
        universe_usage_history: [{ universe: 'Star Trek', assignment_id: 'init-2026', used_at: '2026-01-01T00:00:00.000Z' }],
        assignment_cast_snapshots: {
          'init-2026': {
            universe: 'Star Trek',
            agents: { lead: 'Data', security: 'Tuvok' },
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
      });
      expect(hasExistingCastHistory(fs.readFileSync(path.join(castingDir, 'history.json'), 'utf8'))).toBe(true);
      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(result.repaired).toBe(true);
      const pair = readCastingRegistryPair(castingDir);
      expect(Object.keys(pair.registry!.agents as object).sort()).toEqual(['data', 'tuvok']);
      expect(pair.history!['assignment_cast_snapshots']).toEqual({
        'init-2026': { universe: 'Star Trek', created_at: '2026-01-01T00:00:00.000Z', agents: ['data', 'tuvok'] },
      });
      expect(pair.history!['universe_usage_history']).toEqual([{ universe: 'Star Trek', used_at: '2026-01-01T00:00:00.000Z' }]);
    });

    it('hasExistingCastHistory treats empty arrays and objects as no history', () => {
      expect(hasExistingCastHistory(undefined)).toBe(false);
      expect(hasExistingCastHistory(JSON.stringify({ assignments: [], universe_usage_history: [], assignment_cast_snapshots: {} }))).toBe(false);
      expect(hasExistingCastHistory('\uFEFF' + JSON.stringify({ assignment_cast_snapshots: {} }))).toBe(false);
      expect(hasExistingCastHistory(JSON.stringify({ assignments: [{ assignment_id: 'x' }] }))).toBe(true);
      expect(hasExistingCastHistory(JSON.stringify({ universe_usage_history: [{ universe: 'u' }] }))).toBe(true);
      expect(hasExistingCastHistory('{ nope')).toBe(true);
      expect(hasExistingCastHistory('[]')).toBe(true);

      write('registry.json', shapes['bare array']);
      write('history.json', { assignments: [], universe_usage_history: [], assignment_cast_snapshots: {} });
      expect(repairHandwrittenCastingRegistry(castingDir).repaired).toBe(true);
    });
  });

  describe('squad upgrade and --dry-run integration', () => {
    it('runUpgrade(..., { dryRun: true }) succeeds on a handwritten registry without mutating any file on disk, then normal runUpgrade repairs it', async () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-dryrun-hw-'));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-dryrun-home-'));
      const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const savedStdin = process.stdin.isTTY;
      process.env.SQUAD_HOME_DIR_OVERRIDE = home;
      try {
        (process.stdin as { isTTY?: boolean }).isTTY = undefined;
        await runInit(dest, { includeWorkflows: false } as never);
        const dir = path.join(dest, '.squad', 'casting');
        fs.writeFileSync(
          path.join(dir, 'registry.json'),
          JSON.stringify({
            universe: 'Star Trek',
            agents: [
              { name: 'Data', role: 'Expert' },
              { name: 'Tuvok', role: 'Security', status: 'retired' },
            ],
          }),
        );

        const beforeDryRun = snapshotTree(dest);
        await expect(runUpgrade(dest, { dryRun: true })).resolves.toBeDefined();
        expect(snapshotTree(dest)).toEqual(beforeDryRun);

        await runUpgrade(dest, { force: true });
        const pair = readCastingRegistryPair(dir);
        const agents = pair.registry!.agents as Record<string, Record<string, unknown>>;
        expect(Object.keys(agents).sort()).toEqual(['data', 'tuvok']);
        expect(agents['tuvok']!['status']).toBe('retired');
        expect(fs.readdirSync(dir).filter((f) => f.endsWith('.bak'))).toEqual([]);
      } finally {
        delete process.env.SQUAD_HOME_DIR_OVERRIDE;
        (process.stdin as { isTTY?: boolean }).isTTY = savedStdin;
        quiet.mockRestore();
        writeSpy.mockRestore();
        fs.rmSync(dest, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }
    }, 120_000);

    it('runUpgrade(..., { dryRun: true }) still fails closed on unrepairable/corrupt registries', async () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-dryrun-corrupt-'));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-dryrun-home2-'));
      const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const savedStdin = process.stdin.isTTY;
      process.env.SQUAD_HOME_DIR_OVERRIDE = home;
      try {
        (process.stdin as { isTTY?: boolean }).isTTY = undefined;
        await runInit(dest, { includeWorkflows: false } as never);
        const dir = path.join(dest, '.squad', 'casting');
        fs.writeFileSync(path.join(dir, 'registry.json'), '{ malformed json');
        const beforeTree = snapshotTree(dest);

        await expect(runUpgrade(dest, { dryRun: true })).rejects.toThrow();
        expect(snapshotTree(dest)).toEqual(beforeTree);
      } finally {
        delete process.env.SQUAD_HOME_DIR_OVERRIDE;
        (process.stdin as { isTTY?: boolean }).isTTY = savedStdin;
        quiet.mockRestore();
        writeSpy.mockRestore();
        fs.rmSync(dest, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }
    }, 120_000);

    it('ensureCastingDefaults backfills an empty registry from team.md using the charter folder as the agent id', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-backfill-defaults-'));
      try {
        const squadDir = path.join(dest, '.squad');
        fs.mkdirSync(squadDir, { recursive: true });
        writeCharter(squadDir, 'data', 'Data', 'Framework Expert');
        writeCharter(squadDir, 'belanna', "B'Elanna", 'Durable Systems');
        const team = [
          '# Squad Team',
          '',
          '**Universe:** Star Trek',
          '',
          'Notes: the universe: see casting. line above is the only declaration.',
          '',
          '## Coordinator',
          '| Name | Role |',
          '|---|---|',
          '| Squad | Coordinator |',
          '',
          '## Members',
          '',
          '| Name | Role | Charter | Status |',
          '|------|------|---------|--------|',
          '| Data | Framework Expert | .squad/agents/data/charter.md | ✅ Active |',
          "| B'Elanna | Durable Systems | .squad/agents/belanna/charter.md | ✅ Active |",
          '| Pat | Human reviewer | - | human |',
        ].join('\n');
        fs.writeFileSync(path.join(squadDir, 'team.md'), team);
        expect(parseTeamRoster(team)).toEqual({
          universe: 'Star Trek',
          members: [
            { name: 'Data', role: 'Framework Expert', charterId: 'data' },
            { name: "B'Elanna", role: 'Durable Systems', charterId: 'belanna' },
          ],
        });

        const created = ensureCastingDefaults(dest);
        expect(created).toEqual(expect.arrayContaining(['.squad/casting/registry.json', '.squad/casting/history.json']));
        const dir = path.join(squadDir, 'casting');
        const pair = readCastingRegistryPair(dir);
        expect(Object.keys(pair.registry!.agents as object).sort()).toEqual(['belanna', 'data']);
        expect((pair.registry!.agents as Record<string, Record<string, unknown>>)['belanna']).toMatchObject({
          display_name: "B'Elanna",
          role: 'Durable Systems',
          universe: 'Star Trek',
        });
        expect(fs.readdirSync(dir).filter((f) => f.endsWith('.bak'))).toEqual([]);
        expect(ensureCastingDefaults(dest)).toEqual([]);
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });

    it('backfill resolves ids via charter Identity when the Charter column is absent, and fails closed when no folder can be proven', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-backfill-identity-'));
      const warnings: string[] = [];
      const quiet = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { warnings.push(args.map(String).join(' ')); });
      try {
        const squadDir = path.join(dest, '.squad');
        const dir = path.join(squadDir, 'casting');
        fs.mkdirSync(dir, { recursive: true });
        initEmptyCanonicalPair(dir);
        writeCharter(squadDir, 'belanna', "B'Elanna", 'Engineer');
        const teamMdPath = path.join(squadDir, 'team.md');
        const header = ['# Team', '', '**Universe:** Star Trek', '', '## Members', '', '| Name | Role |', '|---|---|'];
        fs.writeFileSync(teamMdPath, [...header, "| B'Elanna | Engineer |", '| Seven | Astrometrics |'].join('\n'));

        const beforeTree = snapshotTree(dir);
        const blocked = backfillCastingRegistryFromTeam(dir, teamMdPath);
        expect(blocked).toMatchObject({
          repaired: false,
          reason: expect.stringMatching(/could not be mapped to an agent folder/),
          dropped: [{ name: 'Seven', reason: expect.stringMatching(/cannot be proven/) }],
        });
        expect(snapshotTree(dir)).toEqual(beforeTree);
        expect(fs.readdirSync(dir).filter((f) => ARCHIVE_RE.test(f))).toEqual([]);

        expect(ensureCastingDefaults(dest)).toEqual(expect.not.arrayContaining(['.squad/casting/registry.json']));
        expect(warnings.join('\n')).toMatch(/Could not backfill[\s\S]*Seven: .*cannot be proven/);

        writeCharter(squadDir, 'seven', 'Seven', 'Astrometrics');
        const ok = backfillCastingRegistryFromTeam(dir, teamMdPath);
        expect(ok.repaired).toBe(true);
        expect(Object.keys(readCastingRegistryPair(dir).registry!.agents as object).sort()).toEqual(['belanna', 'seven']);
      } finally {
        quiet.mockRestore();
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });

    it('backfill does not invent a universe when team.md does not declare one', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-backfill-universe-'));
      try {
        const squadDir = path.join(dest, '.squad');
        const dir = path.join(squadDir, 'casting');
        fs.mkdirSync(dir, { recursive: true });
        initEmptyCanonicalPair(dir);
        writeCharter(squadDir, 'neo', 'Neo', 'Lead');
        const teamMdPath = path.join(squadDir, 'team.md');
        fs.writeFileSync(teamMdPath, ['# Team', '', 'Our universe: see casting.', '', '## Members', '', '| Name | Role |', '|---|---|', '| Neo | Lead |'].join('\n'));
        expect(parseTeamRoster(fs.readFileSync(teamMdPath, 'utf8')).universe).toBeUndefined();
        expect(backfillCastingRegistryFromTeam(dir, teamMdPath)).toMatchObject({
          repaired: false,
          reason: expect.stringMatching(/does not declare a universe/),
        });
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });

    it('runUpgrade(..., { dryRun: true }) previews the team.md backfill without writing', async () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-dryrun-backfill-'));
      const home = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upgrade-dryrun-home3-'));
      const logged: string[] = [];
      const quiet = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const savedStdin = process.stdin.isTTY;
      process.env.SQUAD_HOME_DIR_OVERRIDE = home;
      try {
        (process.stdin as { isTTY?: boolean }).isTTY = undefined;
        await runInit(dest, { includeWorkflows: false } as never);
        const squadDir = path.join(dest, '.squad');
        writeCharter(squadDir, 'neo', 'Neo', 'Lead');
        fs.writeFileSync(
          path.join(squadDir, 'team.md'),
          ['# Team', '', '**Universe:** Matrix', '', '## Members', '', '| Name | Role | Charter |', '|---|---|---|', '| Neo | Lead | .squad/agents/neo/charter.md |'].join('\n'),
        );
        const beforeDryRun = snapshotTree(dest);
        await runUpgrade(dest, { dryRun: true });
        expect(snapshotTree(dest)).toEqual(beforeDryRun);
        expect(logged.join('\n')).toMatch(/Would backfill \.squad\/casting\/registry\.json from \.squad\/team\.md/);

        await runUpgrade(dest, { force: true });
        expect(Object.keys(readCastingRegistryPair(path.join(squadDir, 'casting')).registry!.agents as object)).toEqual(['neo']);
      } finally {
        delete process.env.SQUAD_HOME_DIR_OVERRIDE;
        (process.stdin as { isTTY?: boolean }).isTTY = savedStdin;
        quiet.mockRestore();
        writeSpy.mockRestore();
        fs.rmSync(dest, { recursive: true, force: true });
        fs.rmSync(home, { recursive: true, force: true });
      }
    }, 120_000);

    it('isInteractiveSession requires TTYs on stdin/stdout and no CI or SQUAD_NONINTERACTIVE opt-out', () => {
      expect(isInteractiveSession({}, { isTTY: true }, { isTTY: true })).toBe(true);
      expect(isInteractiveSession({}, { isTTY: undefined }, { isTTY: true })).toBe(false);
      expect(isInteractiveSession({}, { isTTY: true }, { isTTY: undefined })).toBe(false);
      expect(isInteractiveSession({ CI: 'true' }, { isTTY: true }, { isTTY: true })).toBe(false);
      expect(isInteractiveSession({ CI: '0' }, { isTTY: true }, { isTTY: true })).toBe(true);
      expect(isInteractiveSession({ SQUAD_NONINTERACTIVE: '1' }, { isTTY: true }, { isTTY: true })).toBe(false);
    });
  });

  describe('PR #2252 review thread regressions', () => {
    it('Thread 1: preserves existing valid map keys (e.g. agents.belanna named B\'Elanna with avatar) when repairing sibling entries', () => {
      const belannaValid = {
        display_name: "B'Elanna",
        persistent_name: "B'Elanna",
        role: 'Engineer',
        universe: 'Star Trek',
        status: 'active',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-02-01T00:00:00.000Z',
        avatar: { kind: 'repository-path', path: '.squad/agents/belanna/avatar.png' },
      };
      const result = normalizeHandwrittenCastingRegistry({
        universe: 'Star Trek',
        agents: {
          belanna: belannaValid,
          data: { name: 'Data', role: 'Expert' },
        },
      }, '2026-10-20T00:00:00.000Z');
      expect(result.dropped).toEqual([]);
      expect(result.registry).toBeDefined();
      expect(Object.keys(result.registry!.agents).sort()).toEqual(['belanna', 'data']);
      expect(result.registry!.agents['belanna']).toEqual(belannaValid);

      // Also preserves `belanna` when the record itself is incomplete and carries an avatar under `.squad/agents/belanna/`
      const incompleteBelanna = normalizeHandwrittenCastingRegistry({
        universe: 'Star Trek',
        agents: {
          belanna: {
            name: "B'Elanna",
            role: 'Engineer',
            avatar: { kind: 'repository-path', path: '.squad/agents/belanna/avatar.png' },
          },
        },
      }, '2026-10-20T00:00:00.000Z');
      expect(incompleteBelanna.dropped).toEqual([]);
      expect(Object.keys(incompleteBelanna.registry!.agents)).toEqual(['belanna']);
    });

    it('Thread 2: normalizes legacy-shaped retired records missing or having invalid retired_at instead of early-exiting', () => {
      write('registry.json', {
        agents: {
          tuvok: {
            persistent_name: 'Tuvok',
            role: 'Security',
            universe: 'Star Trek',
            created_at: '2025-01-01T00:00:00.000Z',
            status: 'retired',
          },
        },
      });
      const result = repairHandwrittenCastingRegistry(castingDir, '2026-10-20T00:00:00.000Z');
      expect(result.repaired).toBe(true);
      const pair = readCastingRegistryPair(castingDir);
      const tuvok = (pair.registry!.agents as Record<string, Record<string, unknown>>)['tuvok']!;
      expect(tuvok['status']).toBe('retired');
      expect(tuvok['retired_at']).toBe('2026-10-20T00:00:00.000Z');
    });

    it('Thread 3: rejects snapshot agent maps where the value is unknown or disagrees with a recognized ID key', () => {
      write('registry.json', {
        universe: 'Star Trek',
        agents: {
          data: { name: 'Data', role: 'Lead' },
          tuvok: { name: 'Tuvok', role: 'Security' },
        },
      });
      write('history.json', {
        universe_usage_history: [],
        assignment_cast_snapshots: {
          'init-2026': {
            universe: 'Star Trek',
            agents: { data: 'Unknown Agent' },
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
      });
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/unknown agent "Unknown Agent"/),
      });

      write('history.json', {
        universe_usage_history: [],
        assignment_cast_snapshots: {
          'init-2026': {
            universe: 'Star Trek',
            agents: { data: 'Tuvok' },
            created_at: '2026-01-01T00:00:00.000Z',
          },
        },
      });
      expect(repairHandwrittenCastingRegistry(castingDir)).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/snapshot key "data" disagrees with agent "Tuvok"/),
      });
    });

    it('Thread 4: refuses to recommit a mixed-generation pair when registry, history, and manifest metadata disagree', () => {
      write('registry.json', shapes['agents as an array']);
      expect(repairHandwrittenCastingRegistry(castingDir).repaired).toBe(true);
      const gen1 = readCastingRegistryPair(castingDir);

      // Reformat to trigger a legitimate recommit to revision 2
      fs.writeFileSync(path.join(castingDir, 'registry.json'), JSON.stringify(gen1.registry));
      expect(repairHandwrittenCastingRegistry(castingDir).repaired).toBe(true);
      const gen2 = readCastingRegistryPair(castingDir);
      expect(gen2.registry!['revision']).toBe(2);

      // Overwrite history.json with generation 1 while registry.json and manifest are at generation 2
      fs.writeFileSync(path.join(castingDir, 'history.json'), gen1.historyRaw!);
      const mixedTree = snapshotTree(castingDir);

      const attempt = repairHandwrittenCastingRegistry(castingDir);
      expect(attempt).toMatchObject({
        repaired: false,
        reason: expect.stringMatching(/generation metadata do not agree/),
      });
      expect(snapshotTree(castingDir)).toEqual(mixedTree);
    });

    it('Thread 5: rejects a symlinked handwritten-archive-<sha256> directory before creating or writing archive files', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-outside-archive-'));
      try {
        write('registry.json', shapes['bare array']);
        // Discover the deterministic archive directory name via a dry inspection or temp run
        const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-probe-archive-'));
        let archiveName: string;
        try {
          fs.copyFileSync(path.join(castingDir, 'registry.json'), path.join(probeDir, 'registry.json'));
          archiveName = repairHandwrittenCastingRegistry(probeDir).backupPath!;
        } finally {
          fs.rmSync(probeDir, { recursive: true, force: true });
        }
        expect(archiveName).toMatch(ARCHIVE_RE);

        const archivePath = path.join(castingDir, archiveName);
        try {
          fs.symlinkSync(outsideDir, archivePath, process.platform === 'win32' ? 'junction' : 'dir');
        } catch {
          return;
        }

        expect(() => repairHandwrittenCastingRegistry(castingDir)).toThrow(/symlinked casting path/);
        expect(fs.readdirSync(outsideDir)).toEqual([]);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
