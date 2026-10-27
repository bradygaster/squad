import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade } from '@bradygaster/squad-cli/core/upgrade';
import { getPackageVersion } from '@bradygaster/squad-cli/core/version';
import { _setCastingDurabilityHooksForTesting, readCastingRegistryPair } from '@bradygaster/squad-sdk/casting';

const registryRaw = readFileSync(join(process.cwd(), 'test', 'fixtures', 'casting-legacy', 'registry.json'), 'utf8');
const historyRaw = readFileSync(join(process.cwd(), 'test', 'fixtures', 'casting-legacy', 'history.json'), 'utf8');
let root: string;
let home: string;
let casting: string;

function tree(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      result[entry.name + '/'] = '';
      for (const [key, value] of Object.entries(tree(join(dir, entry.name)))) {
        result[entry.name + '/' + key] = value;
      }
    } else {
      result[entry.name] = readFileSync(join(dir, entry.name)).toString('base64');
    }
  }
  return result;
}

function version(value: string): void {
  const file = join(root, '.github', 'agents', 'squad.agent.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(/<!-- version: [^>]+ -->/, `<!-- version: ${value} -->`));
}

describe('upgrade preflights legacy casting before managed writes', () => {
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'squad-legacy-upgrade-'));
    home = mkdtempSync(join(tmpdir(), 'squad-legacy-home-'));
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    process.env.SQUAD_HOME_DIR_OVERRIDE = home;
    await runInit(root);
    casting = join(root, '.squad', 'casting');
    rmSync(casting, { recursive: true });
    mkdirSync(casting);
    writeFileSync(join(casting, 'registry.json'), registryRaw);
    writeFileSync(join(casting, 'history.json'), historyRaw);
    mkdirSync(join(root, '.squad', 'agents', 'beta'), { recursive: true });
    writeFileSync(join(root, '.squad', 'agents', 'beta', 'history.md'), 'Preserve this agent history.\n');
  });

  afterEach(() => {
    _setCastingDurabilityHooksForTesting(null);
    delete process.env.SQUAD_HOME_DIR_OVERRIDE;
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it.each(['0.13.0', 'current'])('migrates %s state before refreshing templates, then stays idempotent', async installed => {
    version(installed === 'current' ? getPackageVersion() : installed);
    await runUpgrade(root);
    const first = readCastingRegistryPair(casting);
    expect(first.registry).toMatchObject({
      revision: 1,
      agents: { beta: { created_at: '2026-05-18T17:43:49.438+02:00' } },
    });
    const archive = readdirSync(casting).find(name => name.startsWith('legacy-archive-'))!;
    expect(readFileSync(join(casting, archive, 'registry.json'), 'utf8')).toBe(registryRaw);
    expect(readFileSync(join(casting, archive, 'history.json'), 'utf8')).toBe(historyRaw);
    expect(readFileSync(join(root, '.squad', 'agents', 'beta', 'history.md'), 'utf8')).toBe('Preserve this agent history.\n');
    await runUpgrade(root);
    expect(readCastingRegistryPair(casting)).toEqual(first);
  });

  it.each(['0.13.0', 'current'])('dry run on %s previews without changing any files', async installed => {
    version(installed === 'current' ? getPackageVersion() : installed);
    const before = tree(root);
    const homeBefore = tree(home);
    await runUpgrade(root, { dryRun: true });
    expect(tree(root)).toEqual(before);
    expect(tree(home)).toEqual(homeBefore);
  });

  it('upgrades assigned_at producer state, archives exact bytes, and leaves casting unchanged on repeat', async () => {
    version('0.11.0');
    const originals = Object.fromEntries(['registry.json', 'history.json'].map(file => [
      file, readFileSync(join(process.cwd(), 'test', 'fixtures', 'casting-assigned-at', file)),
    ]));
    for (const [file, bytes] of Object.entries(originals)) writeFileSync(join(casting, file), bytes);
    const before = tree(root);
    const homeBefore = tree(home);
    await runUpgrade(root, { dryRun: true });
    expect(tree(root)).toEqual(before);
    expect(tree(home)).toEqual(homeBefore);
    await runUpgrade(root);
    const first = readCastingRegistryPair(casting);
    expect(first.history).toMatchObject({
      assignment_cast_snapshots: {
        'descriptive-2026-08-08T01:16:24.000Z': {
          created_at: '2026-08-08T01:16:24.000Z',
          agents: ['analyst', 'designer', 'planner', 'tester', 'reviewer', 'critic', 'recorder'],
        },
      },
      universe_usage_history: [{ used_at: '2026-08-08T01:16:24.000Z' }],
    });
    const archive = readdirSync(casting).find(name => name.startsWith('legacy-archive-'))!;
    for (const [file, bytes] of Object.entries(originals)) expect(readFileSync(join(casting, archive, file))).toEqual(bytes);
    await runUpgrade(root);
    expect(readCastingRegistryPair(casting)).toEqual(first);
  });

  it('upgrades native-shaped entries with explicit folder identities and historical membership, then preserves bytes on repeat', async () => {
    version('0.9.6-insider.2');
    const fixtureDir = join(process.cwd(), 'test', 'fixtures', 'casting-entries');
    const originals = Object.fromEntries(['registry.json', 'history.json'].map(file => [
      file, readFileSync(join(fixtureDir, file)),
    ]));
    const identities: Record<string, string> = JSON.parse(readFileSync(join(fixtureDir, 'identities.json'), 'utf8'));
    for (const [file, bytes] of Object.entries(originals)) writeFileSync(join(casting, file), bytes);
    for (const [id, charter] of Object.entries(identities)) {
      const folder = join(root, '.squad', 'agents', id);
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, 'charter.md'), charter);
    }
    const before = tree(root), homeBefore = tree(home);
    await runUpgrade(root, { dryRun: true });
    expect(tree(root)).toEqual(before);
    expect(tree(home)).toEqual(homeBefore);
    await runUpgrade(root);
    const first = readCastingRegistryPair(casting);
    expect(Object.keys(first.registry!.agents as object)).toEqual(Object.keys(identities));
    expect(first.history).toMatchObject({
      assignment_cast_snapshots: {
        'example-onboarding-001': {
          agents: Object.keys(identities).slice(0, 12),
          created_at: '2024-02-03', universe: 'descriptive',
        },
      },
      universe_usage_history: [{ used_at: '2024-02-03', universe: 'descriptive' }],
    });
    const archive = readdirSync(casting).find(name => name.startsWith('legacy-archive-'))!;
    for (const [file, bytes] of Object.entries(originals)) expect(readFileSync(join(casting, archive, file))).toEqual(bytes);
    const castingBeforeRepeat = tree(casting);
    await runUpgrade(root);
    expect(tree(casting)).toEqual(castingBeforeRepeat);
    expect(readCastingRegistryPair(casting)).toEqual(first);
    for (const [id, charter] of Object.entries(identities)) {
      expect(readFileSync(join(root, '.squad', 'agents', id, 'charter.md'), 'utf8')).toBe(charter);
    }
  });

  it('refuses the unchanged native-shaped incomplete-universe fixture before all managed writes, including custom MCP', async () => {
    version('0.10.0');
    const fixtureDir = join(process.cwd(), 'test', 'fixtures', 'casting-incomplete-universe');
    for (const file of ['registry.json', 'history.json']) writeFileSync(join(casting, file), readFileSync(join(fixtureDir, file)));
    writeFileSync(join(root, '.mcp.json'), '{"mcpServers":{"custom":{"command":"node","args":["custom.mjs"]}}}\n');
    const before = tree(root), homeBefore = tree(home);
    for (const options of [{ dryRun: true }, {}, {}]) {
      await expect(runUpgrade(root, options)).rejects.toThrow(/authoritative universe evidence.*No universe or historical usage will be invented/);
      expect(tree(root)).toEqual(before);
      expect(tree(home)).toEqual(homeBefore);
    }
  });

  it.each(['missing-universe', 'entries'] as const)('refuses %s provenance before managed upgrade writes', async kind => {
    version('0.10.0');
    const registry = JSON.parse(registryRaw);
    const history = JSON.parse(historyRaw);
    if (kind === 'missing-universe') {
      for (const agent of Object.values(registry.agents) as Record<string, unknown>[]) delete agent.universe;
      history.assignment_cast_snapshots['initial-assignment'].universe = null;
      history.universe_usage_history = [];
    }
    writeFileSync(join(casting, 'registry.json'), JSON.stringify(kind === 'entries' ? { entries: Object.values(registry.agents) } : registry));
    writeFileSync(join(casting, 'history.json'), JSON.stringify(kind === 'entries' ? { assignments: [] } : history));
    const before = tree(root);
    const homeBefore = tree(home);
    for (const options of [{ dryRun: true }, {}, {}]) {
      await expect(runUpgrade(root, options)).rejects.toThrow(/Incomplete legacy provenance/);
      expect(tree(root)).toEqual(before);
      expect(tree(home)).toEqual(homeBefore);
    }
  });

  it.each(['0.13.0', 'current'])('invalid casting on %s fails before any upgrade writes', async installed => {
    version(installed === 'current' ? getPackageVersion() : installed);
    const malformed = JSON.parse(registryRaw);
    malformed.schema = 'unsupported/v99';
    writeFileSync(join(casting, 'registry.json'), JSON.stringify(malformed));
    const before = tree(root);
    await expect(runUpgrade(root)).rejects.toThrow();
    expect(tree(root)).toEqual(before);
  });

  it.each(['archive:write', 'payload:registry-write'] as const)('%s failure leaves managed files unchanged', async failure => {
    version('0.13.0');
    const managedTree = () => Object.fromEntries(Object.entries(tree(root))
      .filter(([file]) => !file.startsWith('.squad/casting/')));
    const before = managedTree();
    _setCastingDurabilityHooksForTesting({
      boundary: ({ boundary }) => { if (boundary === failure) throw new Error('preflight failed'); },
    });
    await expect(runUpgrade(root)).rejects.toThrow('preflight failed');
    expect(managedTree()).toEqual(before);
    expect(readFileSync(join(casting, 'registry.json'), 'utf8')).toBe(registryRaw);
    expect(readFileSync(join(casting, 'history.json'), 'utf8')).toBe(historyRaw);
  });
});
