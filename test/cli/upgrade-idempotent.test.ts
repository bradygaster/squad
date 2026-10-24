/**
 * `squad upgrade` idempotency, verified backups, dry-run zero-write guarantee and EOL safety.
 *
 * Covers #2297 (template overwrite safety / idempotence), #2266 (false `.local-backup`
 * warnings on immediate re-upgrade, CRLF checkouts), #2232 / #2047 (stale `.copilot/skills`
 * copies and retired squad-owned files) and the `--self --dry-run` part of #2295.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { runInit } from '@bradygaster/squad-cli/core/init';
import {
  runUpgrade,
  ensureGitignore,
  ensureGitattributes,
  dominantEol,
  selfUpgradeCli,
  detectSelfUpgradeTag,
  planUpgradeFiles,
} from '@bradygaster/squad-cli/core/upgrade';
import { getTemplatesDir } from '../../packages/squad-cli/src/cli/core/templates.js';
import { getPackageVersion } from '@bradygaster/squad-cli/core/version';
import {
  readShippedManifest,
  writeVerifiedBackup,
  contentHash,
  SHIPPED_MANIFEST_RELATIVE_PATH,
} from '../../packages/squad-cli/src/cli/core/squad-owned-files.js';

const TEST_ROOT = join(tmpdir(), `.test-upgrade-idem-${randomBytes(4).toString('hex')}`);
const TEST_HOME = join(tmpdir(), `.test-upgrade-idem-home-${randomBytes(4).toString('hex')}`);

/** path → sha256 of bytes for every file under root (excluding .git). Order-independent. */
function snapshot(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === '.git') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(relative(root, full).split(sep).join('/'), createHash('sha256').update(readFileSync(full)).digest('hex'));
    }
  };
  walk(root);
  return out;
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>): string[] {
  const changed: string[] = [];
  for (const [p, h] of after) if (before.get(p) !== h) changed.push(p);
  for (const p of before.keys()) if (!after.has(p)) changed.push(`${p} (deleted)`);
  return changed.sort();
}

function toCrlf(file: string): void {
  const text = readFileSync(file, 'utf8');
  if (text.includes('\0')) return;
  writeFileSync(file, text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'));
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function backups(root: string): string[] {
  return [...snapshot(root).keys()].filter(p => p.endsWith('.local-backup')).sort();
}

const quiet = () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
};

describe('squad upgrade: idempotent, backed up, dry-run writes nothing (#2297, #2266)', () => {
  beforeEach(async () => {
    for (const dir of [TEST_ROOT, TEST_HOME]) {
      if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
    }
    process.env.SQUAD_HOME_DIR_OVERRIDE = TEST_HOME;
    quiet();
    await runInit(TEST_ROOT);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.SQUAD_HOME_DIR_OVERRIDE;
    for (const dir of [TEST_ROOT, TEST_HOME]) {
      if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    }
  });

  it('init records a shipped-files manifest covering skills, workflows and the templates mirror', () => {
    const manifest = readShippedManifest(TEST_ROOT);
    expect(manifest).not.toBeNull();
    expect(manifest!.version).toBe(getPackageVersion());
    const keys = Object.keys(manifest!.files);
    expect(keys.some(k => k.startsWith('.github/skills/'))).toBe(true);
    expect(keys.some(k => k.startsWith('.github/workflows/squad-'))).toBe(true);
    expect(keys.some(k => k.startsWith('.squad/templates/skills/'))).toBe(true);
    expect(keys.some(k => k.startsWith('.squad/templates/workflows/'))).toBe(true);
    expect(keys).not.toContain(SHIPPED_MANIFEST_RELATIVE_PATH);
  });

  it('a second upgrade right after an upgrade writes nothing, creates no backups, and dry-run reports nothing to overwrite', async () => {
    await runUpgrade(TEST_ROOT);
    expect(backups(TEST_ROOT)).toEqual([]);

    const before = snapshot(TEST_ROOT);
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });

    const dry = await runUpgrade(TEST_ROOT, { dryRun: true });
    expect(dry.filesUpdated).toEqual([]);
    expect(diffSnapshots(before, snapshot(TEST_ROOT)), 'dry-run must not touch the filesystem').toEqual([]);
    const text = logs.join('\n');
    expect(text).toMatch(/All \d+ squad-owned file\(s\) are up to date — nothing to overwrite/);
    expect(text).not.toMatch(/Would write/);
    expect(text).not.toMatch(/undefined/);
    expect(text).toMatch(/squad.agent.md is up to date/);

    // And a real second upgrade is a no-op on content: only the manifest may be rewritten (same bytes).
    await runUpgrade(TEST_ROOT);
    expect(diffSnapshots(before, snapshot(TEST_ROOT))).toEqual([]);
    expect(backups(TEST_ROOT)).toEqual([]);
  });

  it('a CRLF checkout (Windows autocrlf) is not treated as customized: zero overwrites, zero backups (#2266)', async () => {
    await runUpgrade(TEST_ROOT);
    const lfPlan = planUpgradeFiles(TEST_ROOT, join(TEST_ROOT, '.squad'), getTemplatesDir());
    expect(lfPlan.changed.map(f => f.relPath), 'Linux-style LF checkout must already be a no-op').toEqual([]);

    for (const dir of ['.squad/templates', '.github/skills', '.github/workflows']) {
      for (const f of walkFiles(join(TEST_ROOT, dir))) toCrlf(f);
    }
    toCrlf(join(TEST_ROOT, '.gitignore'));
    toCrlf(join(TEST_ROOT, '.squad', 'casting-registry.json'));

    const plan = planUpgradeFiles(TEST_ROOT, join(TEST_ROOT, '.squad'), getTemplatesDir());
    expect(plan.changed.map(f => f.relPath)).toEqual([]);
    const compoundExample = plan.files.find((file) => file.relPath.endsWith('mesh.json.example'));
    expect(compoundExample).toMatchObject({ action: 'unchanged' });
    expect(compoundExample?.content, 'compound .example templates must be classified as text').not.toBeNull();
    const compoundBytes = readFileSync(compoundExample!.absPath);
    expect(compoundBytes.toString('utf8')).toContain('\r\n');

    const before = snapshot(TEST_ROOT);
    await runUpgrade(TEST_ROOT);
    const changed = diffSnapshots(before, snapshot(TEST_ROOT));
    expect(changed.filter(p => p.endsWith('.local-backup'))).toEqual([]);
    // Nothing squad-owned is rewritten just because of line endings.
    expect(changed.filter(p => p.startsWith('.squad/templates/') || p.startsWith('.github/skills/') || p.startsWith('.github/workflows/'))).toEqual([]);
    expect(readFileSync(compoundExample!.absPath)).toEqual(compoundBytes);
    expect(readFileSync(join(TEST_ROOT, '.gitignore'), 'utf8')).toContain('\r\n');
  });

  it('a user-customized template is backed up (byte-exact, verified) before being overwritten; an unmodified shipped file is not', async () => {
    const custom = join(TEST_ROOT, '.squad', 'templates', 'model-selection-reference.md');
    const customized = '# Model Selection Reference\n\n## Active Policy\n\nmodelPolicy.allowedModels is fail-closed.\r\n';
    writeFileSync(custom, customized);

    // Simulate a template revision for a file the user never touched: the file on disk differs
    // from the new template, but its hash is exactly what the manifest says Squad shipped.
    const untouched = join(TEST_ROOT, '.squad', 'templates', 'charter.md');
    const previousShipped = readFileSync(untouched, 'utf8') + '\n<!-- previous release -->\n';
    writeFileSync(untouched, previousShipped);
    const manifestPath = join(TEST_ROOT, ...SHIPPED_MANIFEST_RELATIVE_PATH.split('/'));
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files['.squad/templates/charter.md'] = contentHash(previousShipped);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const dryBefore = snapshot(TEST_ROOT);
    await runUpgrade(TEST_ROOT, { dryRun: true });
    expect(diffSnapshots(dryBefore, snapshot(TEST_ROOT))).toEqual([]);
    const dryText = logs.join('\n');
    expect(dryText).toMatch(/overwrite\s+\.squad\/templates\/model-selection-reference\.md\s+\(customized → model-selection-reference\.md\.local-backup\)/);
    expect(dryText).toMatch(/overwrite\s+\.squad\/templates\/charter\.md\n/);
    expect(dryText).not.toMatch(/charter\.md\s+\(customized/);

    await runUpgrade(TEST_ROOT);
    expect(readFileSync(custom + '.local-backup')).toEqual(Buffer.from(customized));
    expect(readFileSync(custom, 'utf8')).not.toContain('Active Policy');
    expect(existsSync(untouched + '.local-backup')).toBe(false);
    expect(readFileSync(untouched, 'utf8')).not.toContain('previous release');
    expect(backups(TEST_ROOT)).toEqual(['.squad/templates/model-selection-reference.md.local-backup']);
  });

  it('a customized .github/skills file whose only "prior" is the .squad/templates snapshot is backed up; an untouched one is not', async () => {
    rmSync(join(TEST_ROOT, ...SHIPPED_MANIFEST_RELATIVE_PATH.split('/')));
    const live = join(TEST_ROOT, '.github', 'skills', 'git-workflow', 'SKILL.md');
    const snap = join(TEST_ROOT, '.squad', 'templates', 'skills', 'git-workflow', 'SKILL.md');
    // Snapshot and live file carry the same OLD shipped content → not customized.
    const old = readFileSync(live, 'utf8') + '\n<!-- older template -->\n';
    writeFileSync(live, old);
    writeFileSync(snap, old);
    // A second skill edited by the user.
    const edited = join(TEST_ROOT, '.github', 'skills', 'reflect', 'SKILL.md');
    writeFileSync(edited, readFileSync(edited, 'utf8') + '\nMy local rule.\n');

    await runUpgrade(TEST_ROOT);
    expect(existsSync(live + '.local-backup')).toBe(false);
    expect(readFileSync(live, 'utf8')).not.toContain('older template');
    expect(readFileSync(edited + '.local-backup', 'utf8')).toContain('My local rule.');
    expect(readFileSync(edited, 'utf8')).not.toContain('My local rule.');
  });

  it('uses provenance-neutral wording when a first upgrade cannot prove whether a differing file was customized', async () => {
    rmSync(join(TEST_ROOT, ...SHIPPED_MANIFEST_RELATIVE_PATH.split('/')));
    const file = join(TEST_ROOT, '.squad', 'templates', 'model-selection-reference.md');
    writeFileSync(file, readFileSync(file, 'utf8') + '\nunknown prior source\n');
    const output: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => output.push(args.map(String).join(' ')));

    await runUpgrade(TEST_ROOT);

    const warning = output.find((line) => line.includes('model-selection-reference.md') && line.includes('provenance')) ?? '';
    expect(warning).toContain('prior provenance unavailable');
    expect(warning).not.toContain('has local customizations');
    expect(existsSync(file + '.local-backup')).toBe(true);
  });

  it('writeVerifiedBackup keeps an identical existing backup and holds the original bytes', () => {
    const file = join(TEST_ROOT, 'x.md');
    writeFileSync(file, 'one\r\ntwo');
    const backup = writeVerifiedBackup(file);
    expect(readFileSync(backup)).toEqual(Buffer.from('one\r\ntwo'));
    const stamp = statSync(backup).mtimeMs;
    expect(writeVerifiedBackup(file)).toBe(backup);
    expect(statSync(backup).mtimeMs).toBe(stamp);
  });

  it('retired squad-owned files recorded in the manifest are removed when unmodified and kept when modified (#2232)', async () => {
    const manifestPath = join(TEST_ROOT, ...SHIPPED_MANIFEST_RELATIVE_PATH.split('/'));
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const retiredDir = join(TEST_ROOT, '.squad', 'templates', 'retired-dir');
    mkdirSync(retiredDir, { recursive: true });
    writeFileSync(join(retiredDir, 'old.md'), 'shipped once\n');
    writeFileSync(join(TEST_ROOT, '.squad', 'templates', 'edited-old.md'), 'shipped once, then edited\n');
    manifest.files['.squad/templates/retired-dir/old.md'] = contentHash('shipped once\n');
    manifest.files['.squad/templates/edited-old.md'] = contentHash('shipped once\n');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await runUpgrade(TEST_ROOT);
    expect(existsSync(join(retiredDir, 'old.md'))).toBe(false);
    expect(existsSync(retiredDir)).toBe(false);
    expect(existsSync(join(TEST_ROOT, '.squad', 'templates', 'edited-old.md'))).toBe(true);
    expect(result.filesUpdated).toContain('.squad/templates/retired-dir/old.md (removed)');
    const after = readShippedManifest(TEST_ROOT)!;
    expect(after.files['.squad/templates/retired-dir/old.md']).toBeUndefined();
  });

  it('removes stale .copilot/skills copies that are provably Squad-shipped and keeps user skills (#2047, #2232)', async () => {
    const legacy = join(TEST_ROOT, '.copilot', 'skills');
    // A shipped-but-not-manifest skill copied verbatim from the templates mirror → stale Squad copy.
    const shipped = readdirSync(join(getTemplatesDir(), 'skills')).find(n => !existsSync(join(TEST_ROOT, '.github', 'skills', n)))!;
    mkdirSync(join(legacy, shipped), { recursive: true });
    writeFileSync(join(legacy, shipped, 'SKILL.md'), readFileSync(join(getTemplatesDir(), 'skills', shipped, 'SKILL.md'), 'utf8').replace(/\r?\n/g, '\r\n'));
    // A user skill with the same name shape but different content → preserved.
    mkdirSync(join(legacy, 'my-team-skill'), { recursive: true });
    writeFileSync(join(legacy, 'my-team-skill', 'SKILL.md'), '# Mine\n');
    // An edited copy of a shipped skill → preserved (content no longer provably Squad's).
    const editedName = readdirSync(join(getTemplatesDir(), 'skills')).find(n => n !== shipped && !existsSync(join(TEST_ROOT, '.github', 'skills', n)))!;
    mkdirSync(join(legacy, editedName), { recursive: true });
    writeFileSync(join(legacy, editedName, 'SKILL.md'), readFileSync(join(getTemplatesDir(), 'skills', editedName, 'SKILL.md'), 'utf8') + '\nlocal tweak\n');

    await runUpgrade(TEST_ROOT);
    expect(existsSync(join(legacy, shipped))).toBe(false);
    expect(existsSync(join(legacy, 'my-team-skill', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(legacy, editedName, 'SKILL.md'))).toBe(true);
  });
});

describe('ensureGitignore / ensureGitattributes append in the file\'s own EOL and never rewrite (#2297)', () => {
  const dir = join(tmpdir(), `.test-gitignore-eol-${randomBytes(4).toString('hex')}`);
  beforeEach(() => { mkdirSync(dir, { recursive: true }); quiet(); });
  afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

  it('dominantEol picks the majority style and CRLF on ties', () => {
    expect(dominantEol('a\nb\n')).toBe('\n');
    expect(dominantEol('a\r\nb\r\n')).toBe('\r\n');
    expect(dominantEol('a\r\nb\nc\n')).toBe('\n');
    expect(dominantEol('a\r\nb\n')).toBe('\r\n');
    expect(dominantEol('')).toBe('\n');
  });

  it.each([
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ])('%s .gitignore keeps every existing byte and appends with the same EOL', (_label, eol) => {
    const original = `node_modules/${eol}dist/${eol}# comment${eol}`;
    writeFileSync(join(dir, '.gitignore'), original);
    const added = ensureGitignore(dir);
    expect(added.length).toBeGreaterThan(0);
    const after = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(after.startsWith(original)).toBe(true);
    expect(after).toBe(original + added.join(eol) + eol);
    expect(ensureGitignore(dir)).toEqual([]);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(after);
  });

  it('a mixed-EOL file is left as-is and the new lines follow the dominant style', () => {
    const original = 'a\r\nb\r\nc\n';
    writeFileSync(join(dir, '.gitignore'), original);
    ensureGitignore(dir);
    const after = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(after.startsWith(original)).toBe(true);
    expect(after.slice(original.length)).toMatch(/^(\S+\r\n)+$/);
  });

  it('a file without a trailing newline gets one bridge EOL before the appended lines', () => {
    writeFileSync(join(dir, '.gitattributes'), '*.md text');
    const added = ensureGitattributes(dir);
    const after = readFileSync(join(dir, '.gitattributes'), 'utf8');
    expect(after).toBe('*.md text\n' + added.join('\n') + '\n');
  });

  it('dryRun reports the missing entries and writes nothing', () => {
    writeFileSync(join(dir, '.gitignore'), 'x\n');
    const added = ensureGitignore(dir, { dryRun: true });
    expect(added.length).toBeGreaterThan(0);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('x\n');
    expect(existsSync(join(dir, '.gitattributes'))).toBe(false);
    expect(ensureGitattributes(dir, { dryRun: true }).length).toBeGreaterThan(0);
    expect(existsSync(join(dir, '.gitattributes'))).toBe(false);
  });
});

describe('squad upgrade --self: dry-run installs nothing, follows the installed channel, never silently downgrades (#2295)', () => {
  beforeEach(() => quiet());
  afterEach(() => vi.restoreAllMocks());

  it('detects the channel from the running version', () => {
    expect(detectSelfUpgradeTag('2.0.0-preview.1')).toBe('insider');
    expect(detectSelfUpgradeTag('1.2.0-insider.3')).toBe('insider');
    expect(detectSelfUpgradeTag('1.1.0')).toBe('latest');
    expect(detectSelfUpgradeTag('2.0.0-rc.1')).toBe('latest');
  });

  it('--dry-run prints the exact command and performs ZERO execs', async () => {
    const exec = vi.fn();
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const result = await selfUpgradeCli({
      dryRun: true, packageManager: 'npm', exec,
      currentVersion: '2.0.0-preview.1',
      resolveTagVersion: async () => '2.0.0-preview.2',
    });
    expect(exec).not.toHaveBeenCalled();
    expect(result.performed).toBe(false);
    expect(result.tag).toBe('insider');
    expect(result.command).toBe('npm install -g @bradygaster/squad-cli@insider');
    expect(logs.join('\n')).toContain('npm install -g @bradygaster/squad-cli@insider');
    expect(logs.join('\n')).toMatch(/Nothing was installed/);
  });

  it('a preview install follows @insider, not @latest (no --insider needed)', async () => {
    const exec = vi.fn();
    const result = await selfUpgradeCli({
      packageManager: 'npm', exec, currentVersion: '2.0.0-preview.1',
      resolveTagVersion: async (tag) => (tag === 'insider' ? '2.0.0-preview.2' : '1.1.0'),
    });
    expect(result.tag).toBe('insider');
    expect(exec).toHaveBeenCalledWith('npm install -g @bradygaster/squad-cli@insider', { stdio: 'inherit' });
    expect(exec).not.toHaveBeenCalledWith(expect.stringContaining('@latest'), expect.anything());
  });

  it('a stable install follows @latest and upgrades when latest is newer', async () => {
    const exec = vi.fn();
    const result = await selfUpgradeCli({ packageManager: 'pnpm', exec, currentVersion: '1.0.1', resolveTagVersion: async () => '1.1.0' });
    expect(result.tag).toBe('latest');
    expect(result.targetVersion).toBe('1.1.0');
    expect(exec).toHaveBeenCalledWith('pnpm add -g @bradygaster/squad-cli@latest', { stdio: 'inherit' });
  });

  it('refuses a downgrade (resolved target older than installed) and runs nothing', async () => {
    const exec = vi.fn();
    await expect(selfUpgradeCli({
      packageManager: 'npm', exec, currentVersion: '2.0.0-preview.1', insider: false,
      // Force the stable tag by pretending --insider is off AND the channel detector says insider;
      // emulate a user whose preview is newer than what the tag resolves to.
      resolveTagVersion: async () => '2.0.0-preview.0',
    })).rejects.toThrow(/Refusing to downgrade: @insider currently resolves to 2\.0\.0-preview\.0, older than the installed 2\.0\.0-preview\.1/);
    expect(exec).not.toHaveBeenCalled();
  });

  it('a preview install never silently lands on an older @latest even when --insider is not given and latest is stale', async () => {
    // detectSelfUpgradeTag keeps it on insider; if someone disables that, the downgrade guard still fires.
    const exec = vi.fn();
    const result = await selfUpgradeCli({ packageManager: 'npm', exec, currentVersion: '2.0.0-preview.1', resolveTagVersion: async () => '2.0.0-preview.1' });
    expect(result.command).not.toContain('@latest');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('--force allows the downgrade with an explicit message', async () => {
    const exec = vi.fn();
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const result = await selfUpgradeCli({ packageManager: 'npm', exec, force: true, currentVersion: '1.1.0', resolveTagVersion: async () => '1.0.1' });
    expect(result.performed).toBe(true);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toMatch(/Downgrading on --force/);
  });

  it('an unreachable registry does not block the upgrade but is reported', async () => {
    const exec = vi.fn();
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const result = await selfUpgradeCli({ packageManager: 'yarn', exec, currentVersion: '1.1.0', resolveTagVersion: async () => null });
    expect(result.targetVersion).toBeNull();
    expect(exec).toHaveBeenCalledTimes(1);
    expect(logs.join('\n')).toMatch(/registry not reachable/);
  });
});
