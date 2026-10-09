import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
