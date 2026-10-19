import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _setCastingDurabilityHooksForTesting,
  backfillCastingRegistryFromTeam,
  ensureCastingRegistryPair,
  normalizeHandwrittenCastingRegistry,
  parseAgentProvenanceRegistry,
  parseTeamRoster,
  readCastingRegistryPair,
  repairHandwrittenCastingRegistry,
} from '@bradygaster/squad-sdk/casting';
import { isInteractiveSession, runInit } from '@bradygaster/squad-cli/core/init';
import { ensureCastingDefaults, runUpgrade } from '@bradygaster/squad-cli/core/upgrade';

const MANIFEST = 'registry-history.commit.json';

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

describe('Layer 2: Handwritten casting registry repair & backfill', () => {
  const shapes: Record<string, unknown> = {
    'role-keyed entries without a wrapper': {
      lead: { name: 'Avery', status: 'active' },
      backend: { name: 'Nova', role: 'Backend Developer' },
      tester: 'Quinn',
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
    const reg = normalizeHandwrittenCastingRegistry(shapes[name], '2026-10-18T00:00:00.000Z')!;
    expect(reg).toBeDefined();
    const parsed = parseAgentProvenanceRegistry(reg);
    expect(parsed.completeness).toBe('complete');
    for (const [id, rec] of Object.entries(reg.agents)) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(rec.persistent_name).toBe(rec.display_name);
      expect(['active', 'inactive', 'retired']).toContain(rec.status);
    }
  });

  it('maps role keys and names to canonical ids, roles, and statuses', () => {
    const reg = normalizeHandwrittenCastingRegistry(shapes['role-keyed entries without a wrapper'])!;
    expect(Object.keys(reg.agents).sort()).toEqual(['avery', 'nova', 'quinn']);
    expect(reg.agents['avery']).toMatchObject({ display_name: 'Avery', role: 'lead', status: 'active' });
    expect(reg.agents['nova']).toMatchObject({ role: 'Backend Developer' });
    expect(reg.agents['quinn']).toMatchObject({ display_name: 'Quinn', role: 'tester' });
    const belanna = normalizeHandwrittenCastingRegistry(shapes['agents as an array'])!;
    expect(Object.keys(belanna.agents)).toEqual(['data', 'b-elanna']);
    expect(belanna.agents['b-elanna']!.status).toBe('active');
    expect(
      normalizeHandwrittenCastingRegistry(shapes['simplified object with version and name/role/status'])!.agents['nova']!.status,
    ).toBe('active');
  });

  it.each(Object.keys(shapes))(
    'repairs on disk without leaving .handwritten.bak clutter by default: %s',
    (name) => {
      write('registry.json', shapes[name]);
      const result = repairHandwrittenCastingRegistry(castingDir);
      expect(result).toMatchObject({
        repaired: true,
        files: ['registry.json', 'history.json', MANIFEST],
      });
      expect(fs.existsSync(path.join(castingDir, 'registry.json.handwritten.bak'))).toBe(false);
      expect(fs.existsSync(path.join(castingDir, 'history.json.handwritten.bak'))).toBe(false);
      expect(fs.existsSync(path.join(castingDir, `${MANIFEST}.handwritten.bak`))).toBe(false);
      expect(fs.readdirSync(castingDir).filter((f) => f.endsWith('.bak'))).toEqual([]);

      const pair = readCastingRegistryPair(castingDir);
      expect(Object.keys(pair.registry!.agents as object).length).toBeGreaterThan(0);
      expect(repairHandwrittenCastingRegistry(castingDir)).toEqual({ repaired: false, files: [] });
    },
  );

  it('writes .handwritten.bak files only when options.keepBackup === true is explicitly passed', () => {
    initEmptyCanonicalPair();
    write('registry.json', shapes['role-keyed entries without a wrapper']);
    const originalRegistry = fs.readFileSync(path.join(castingDir, 'registry.json'), 'utf8');
    const originalManifest = fs.readFileSync(path.join(castingDir, MANIFEST), 'utf8');

    const result = repairHandwrittenCastingRegistry(castingDir, { keepBackup: true });
    expect(result).toMatchObject({
      repaired: true,
      files: ['registry.json', 'history.json', MANIFEST],
    });
    expect(fs.readFileSync(path.join(castingDir, 'registry.json.handwritten.bak'), 'utf8')).toBe(originalRegistry);
    expect(fs.readFileSync(path.join(castingDir, `${MANIFEST}.handwritten.bak`), 'utf8')).toBe(originalManifest);
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
    it.each(['payload:registry-write', 'registry:write'] as const)(
      'restores original bytes and rethrows when commitCastingRegistryPair fails at %s',
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
        expect(fs.readdirSync(castingDir).filter((f) => f.endsWith('.bak'))).toEqual([]);
      },
    );

    it('never falls back to writing a fresh cast when recommitting a manifest-mismatched canonical pair fails', () => {
      write('registry.json', shapes['agents as an array']);
      repairHandwrittenCastingRegistry(castingDir);
      const committed = readCastingRegistryPair(castingDir);

      // Reformat registry.json so it is canonical but disagrees with the commit manifest bytes
      fs.writeFileSync(path.join(castingDir, 'registry.json'), JSON.stringify(committed.registry));
      const beforeTree = snapshotTree(castingDir);

      _setCastingDurabilityHooksForTesting({
        boundary: ({ boundary }) => {
          if (boundary === 'registry:write') {
            throw new Error('simulated recommit failure');
          }
        },
      });

      expect(() => repairHandwrittenCastingRegistry(castingDir)).toThrow(/simulated recommit failure/);
      expect(snapshotTree(castingDir)).toEqual(beforeTree);
    });

    it('restores original bytes and rethrows when backfillCastingRegistryFromTeam fails during commit', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-backfill-rollback-'));
      try {
        const squadDir = path.join(dest, '.squad');
        const dir = path.join(squadDir, 'casting');
        fs.mkdirSync(dir, { recursive: true });
        initEmptyCanonicalPair(dir);
        const teamMdPath = path.join(squadDir, 'team.md');
        fs.writeFileSync(
          teamMdPath,
          ['# Team', '', '**Universe:** Matrix', '', '## Members', '', '| Name | Role |', '|---|---|', '| Neo | Lead |'].join('\n'),
        );
        const beforeTree = snapshotTree(dir);

        _setCastingDurabilityHooksForTesting({
          boundary: ({ boundary }) => {
            if (boundary === 'registry:write') {
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

      const canonical = normalizeHandwrittenCastingRegistry(shapes['bare array'])!;
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
      expect(fs.existsSync(path.join(castingDir, 'registry.json.handwritten.bak'))).toBe(false);
    });

    it('refuses to overwrite a non-canonical registry when history.json already has cast history', () => {
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
        reason: expect.stringMatching(/cast history/),
      });
      expect(snapshotTree(castingDir)).toEqual(beforeTree);
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

    it('ensureCastingDefaults backfills an empty registry from team.md without leaving .bak files', () => {
      const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-backfill-defaults-'));
      try {
        fs.mkdirSync(path.join(dest, '.squad'), { recursive: true });
        const team = [
          '# Squad Team',
          '',
          '**Universe:** Star Trek',
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
        fs.writeFileSync(path.join(dest, '.squad', 'team.md'), team);
        expect(parseTeamRoster(team)).toEqual({
          universe: 'Star Trek',
          members: [
            { name: 'Data', role: 'Framework Expert' },
            { name: "B'Elanna", role: 'Durable Systems' },
          ],
        });

        const created = ensureCastingDefaults(dest);
        expect(created).toEqual(expect.arrayContaining(['.squad/casting/registry.json', '.squad/casting/history.json']));
        const dir = path.join(dest, '.squad', 'casting');
        const pair = readCastingRegistryPair(dir);
        expect(Object.keys(pair.registry!.agents as object).sort()).toEqual(['b-elanna', 'data']);
        expect(fs.readdirSync(dir).filter((f) => f.endsWith('.bak'))).toEqual([]);
        expect(ensureCastingDefaults(dest)).toEqual([]);
      } finally {
        fs.rmSync(dest, { recursive: true, force: true });
      }
    });

    it('isInteractiveSession requires TTYs on stdin/stdout and no CI or SQUAD_NONINTERACTIVE opt-out', () => {
      expect(isInteractiveSession({}, { isTTY: true }, { isTTY: true })).toBe(true);
      expect(isInteractiveSession({}, { isTTY: undefined }, { isTTY: true })).toBe(false);
      expect(isInteractiveSession({}, { isTTY: true }, { isTTY: undefined })).toBe(false);
      expect(isInteractiveSession({ CI: 'true' }, { isTTY: true }, { isTTY: true })).toBe(false);
      expect(isInteractiveSession({ CI: '0' }, { isTTY: true }, { isTTY: true })).toBe(true);
      expect(isInteractiveSession({ SQUAD_NONINTERACTIVE: '1' }, { isTTY: true }, { isTTY: true })).toBe(false);
    });
  });
});
