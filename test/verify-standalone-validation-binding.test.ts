import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STANDALONE_TARGETS,
  validationFileName,
  verifyStandaloneValidationBinding,
} from '../scripts/release/verify-standalone-validation-binding.mjs';

const CACHE = path.resolve(__dirname, '..', 'node_modules', '.cache');
const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'release', 'verify-standalone-validation-binding.mjs');
const SOURCE_SHA = 'a'.repeat(40);
const CLI_VERSION = '2.0.0-preview.3';
const NODE_VERSION = '22.23.4';
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
const roots: string[] = [];

type Report = Record<string, any>;

function fixture(mutate: (reports: Map<string, Report>) => void = () => {}) {
  mkdirSync(CACHE, { recursive: true });
  const root = mkdtempSync(path.join(CACHE, 'standalone-validation-binding-'));
  roots.push(root);
  const reports = new Map<string, Report>();
  const checksumLines: string[] = [];
  for (const { target, platform, arch, asset } of STANDALONE_TARGETS) {
    const content = Buffer.from(`archive:${asset}`);
    writeFileSync(path.join(root, asset), content);
    checksumLines.push(`${sha256(content)}  ${asset}`);
    reports.set(target, {
      schemaVersion: 1,
      execution: 'EXECUTED',
      target,
      runner: { platform, arch },
      sourceSha: SOURCE_SHA,
      processVersion: `v${NODE_VERSION}`,
      squadVersion: CLI_VERSION,
      archive: { name: asset, sha256: sha256(content) },
      lifecycle: { toolsListed: true, teardownWithinGrace: true },
      rootDeleteRejection: 'EXECUTED',
    });
  }
  mutate(reports);
  for (const [target, report] of reports) {
    writeFileSync(path.join(root, validationFileName(target)), JSON.stringify(report));
  }
  const checksumsPath = path.join(root, 'SHA256SUMS.txt');
  writeFileSync(checksumsPath, `${checksumLines.join('\n')}\n`);
  return { root, checksumsPath };
}

function verify(root: string, checksumsPath: string, overrides: Record<string, string> = {}) {
  return verifyStandaloneValidationBinding({
    artifactsDir: root,
    checksumsPath,
    sourceSha: SOURCE_SHA,
    cliVersion: CLI_VERSION,
    nodeVersion: NODE_VERSION,
    ...overrides,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('standalone validation binding', () => {
  it('binds all six archives to their executed validation records and SHA256SUMS entries', () => {
    const { root, checksumsPath } = fixture();
    const { bindings } = verify(root, checksumsPath);
    expect(bindings.map((binding: { target: string }) => binding.target))
      .toEqual(['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64', 'win32-arm64']);
  });

  it('accepts a v-prefixed expected Node version', () => {
    const { root, checksumsPath } = fixture();
    expect(() => verify(root, checksumsPath, { nodeVersion: `v${NODE_VERSION}` })).not.toThrow();
  });

  it('fails when an archive differs from its executed validation record', () => {
    const { root, checksumsPath } = fixture();
    const asset = STANDALONE_TARGETS[0].asset;
    const tampered = Buffer.from('rebuilt bytes');
    writeFileSync(path.join(root, asset), tampered);
    writeFileSync(
      checksumsPath,
      STANDALONE_TARGETS.map(({ asset: name }) =>
        `${name === asset ? sha256(tampered) : sha256(`archive:${name}`)}  ${name}`).join('\n') + '\n',
    );
    expect(() => verify(root, checksumsPath)).toThrow(/differs from executed validation record/);
  });

  it('fails when SHA256SUMS.txt disagrees with the archive and validation record', () => {
    const { root, checksumsPath } = fixture();
    const asset = STANDALONE_TARGETS[2].asset;
    writeFileSync(
      checksumsPath,
      STANDALONE_TARGETS.map(({ asset: name }) =>
        `${name === asset ? 'f'.repeat(64) : sha256(`archive:${name}`)}  ${name}`).join('\n') + '\n',
    );
    expect(() => verify(root, checksumsPath)).toThrow(/differs from SHA256SUMS\.txt entry/);
  });

  it('fails on missing, extra, or duplicate checksum entries', () => {
    const { root, checksumsPath } = fixture();
    const lines = STANDALONE_TARGETS.map(({ asset }) => `${sha256(`archive:${asset}`)}  ${asset}`);
    writeFileSync(checksumsPath, `${lines.slice(1).join('\n')}\n`);
    expect(() => verify(root, checksumsPath)).toThrow(/missing=squad-linux-x64\.tar\.gz/);
    writeFileSync(checksumsPath, `${[...lines, `${'0'.repeat(64)}  extra.zip`].join('\n')}\n`);
    expect(() => verify(root, checksumsPath)).toThrow(/extra=extra\.zip/);
    writeFileSync(checksumsPath, `${[...lines, lines[0]].join('\n')}\n`);
    expect(() => verify(root, checksumsPath)).toThrow(/Duplicate checksum entry/);
    writeFileSync(checksumsPath, `${[...lines.slice(1), 'not a checksum line'].join('\n')}\n`);
    expect(() => verify(root, checksumsPath)).toThrow(/Malformed checksum entry/);
  });

  it('fails on a missing or extra validation record', () => {
    const missing = fixture((reports) => reports.delete('darwin-arm64'));
    expect(() => verify(missing.root, missing.checksumsPath))
      .toThrow(/missing=squad-darwin-arm64-validation\.json/);

    const extra = fixture();
    writeFileSync(path.join(extra.root, 'squad-freebsd-x64-validation.json'), '{}');
    expect(() => verify(extra.root, extra.checksumsPath))
      .toThrow(/extra=squad-freebsd-x64-validation\.json/);
  });

  it('fails on a missing archive or a malformed validation record', () => {
    const missingArchive = fixture();
    rmSync(path.join(missingArchive.root, STANDALONE_TARGETS[4].asset));
    expect(() => verify(missingArchive.root, missingArchive.checksumsPath))
      .toThrow(/squad-win32-x64\.zip is missing/);

    const malformed = fixture();
    writeFileSync(path.join(malformed.root, validationFileName('linux-arm64')), '{not json');
    expect(() => verify(malformed.root, malformed.checksumsPath))
      .toThrow(/squad-linux-arm64-validation\.json is malformed/);
  });

  it.each([
    ['schemaVersion', (r: Report) => { r.schemaVersion = 2; }, /unsupported schemaVersion/],
    ['execution', (r: Report) => { r.execution = 'UNEXECUTED'; }, /execution is "UNEXECUTED"/],
    ['target', (r: Report) => { r.target = 'linux-arm64'; }, /target is "linux-arm64"/],
    ['runner', (r: Report) => { r.runner = { platform: 'linux', arch: 'arm64' }; }, /runner is/],
    ['candidate SHA', (r: Report) => { r.sourceSha = 'b'.repeat(40); }, /sourceSha is/],
    ['CLI version', (r: Report) => { r.squadVersion = '2.0.0-preview.2'; }, /squadVersion is/],
    ['embedded Node version', (r: Report) => { r.processVersion = 'v22.23.3'; }, /processVersion is/],
    ['lifecycle smoke', (r: Report) => { r.lifecycle.toolsListed = false; }, /lifecycle smoke did not pass/],
    ['archive name', (r: Report) => { r.archive.name = 'squad-linux-x64.zip'; }, /archive\.name is/],
    ['archive hash shape', (r: Report) => { r.archive.sha256 = 'XYZ'; }, /archive\.sha256 is malformed/],
  ])('fails when the validation record %s does not match', (_label, mutate, pattern) => {
    const { root, checksumsPath } = fixture((reports) => mutate(reports.get('linux-x64')!));
    expect(() => verify(root, checksumsPath)).toThrow(pattern);
  });

  it('rejects invalid expectations', () => {
    const { root, checksumsPath } = fixture();
    expect(() => verify(root, checksumsPath, { sourceSha: 'abc' })).toThrow(/Invalid source SHA/);
    expect(() => verify(root, checksumsPath, { cliVersion: '' })).toThrow(/Missing expected CLI version/);
    expect(() => verify(root, checksumsPath, { nodeVersion: '22' })).toThrow(/Invalid expected Node version/);
  });

  it('exits non-zero from the CLI on mismatch and reads the CLI version from package.json', () => {
    const { root, checksumsPath } = fixture();
    const packageJson = path.join(root, 'package.json');
    writeFileSync(packageJson, JSON.stringify({ version: CLI_VERSION }));
    const args = [
      SCRIPT,
      '--artifacts-dir', root,
      '--checksums', checksumsPath,
      '--source-sha', SOURCE_SHA,
      '--node-version', NODE_VERSION,
    ];
    const ok = spawnSync(process.execPath, [...args, '--cli-package-json', packageJson], { encoding: 'utf8' });
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('Verified 6 standalone archives');

    const bad = spawnSync(process.execPath, [...args, '--cli-version', '9.9.9'], { encoding: 'utf8' });
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).toMatch(/squadVersion is/);
  });
});
