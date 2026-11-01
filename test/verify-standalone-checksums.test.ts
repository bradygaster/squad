import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXPECTED_TARGETS,
  verifyStandaloneChecksums,
} from '../scripts/release/verify-standalone-checksums.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const CLI_VERSION = '2.0.0-preview.3';
const NODE_VERSION = '22.23.4';
const roots: string[] = [];

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function archiveName(target: string) {
  return `squad-${target}.${target.startsWith('win32-') ? 'zip' : 'tar.gz'}`;
}

function fixture() {
  const root = mkdtempSync(path.join(process.cwd(), '.standalone-checksum-test-'));
  roots.push(root);
  const artifactsDir = path.join(root, 'artifacts');
  mkdirSync(artifactsDir);
  const lines: string[] = [];

  for (const target of EXPECTED_TARGETS) {
    const name = archiveName(target);
    const bytes = Buffer.from(`archive:${target}`);
    const digest = sha256(bytes);
    writeFileSync(path.join(artifactsDir, name), bytes);
    writeFileSync(
      path.join(artifactsDir, `squad-${target}-validation.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        execution: 'EXECUTED',
        target,
        sourceSha: SOURCE_SHA,
        processVersion: `v${NODE_VERSION}`,
        squadVersion: CLI_VERSION,
        archive: { name, sha256: digest },
      }, null, 2)}\n`,
    );
    lines.push(`${digest}  ${name}`);
  }

  const checksumsPath = path.join(artifactsDir, 'SHA256SUMS.txt');
  const outputPath = path.join(artifactsDir, 'standalone-checksum-binding.json');
  writeFileSync(checksumsPath, `${lines.join('\n')}\n`);
  return {
    artifactsDir,
    checksumsPath,
    outputPath,
    options: {
      artifactsDir,
      checksumsPath,
      expectedSourceSha: SOURCE_SHA,
      expectedCliVersion: CLI_VERSION,
      expectedNodeVersion: NODE_VERSION,
      outputPath,
    },
  };
}

function validationPath(artifactsDir: string, target: string) {
  return path.join(artifactsDir, `squad-${target}-validation.json`);
}

function updateValidation(
  artifactsDir: string,
  target: string,
  update: (record: Record<string, unknown>) => void,
) {
  const file = validationPath(artifactsDir, target);
  const record = JSON.parse(readFileSync(file, 'utf8'));
  update(record);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('standalone checksum binding', () => {
  it('binds all six archives to validation records and SHA256SUMS', async () => {
    const test = fixture();
    const report = await verifyStandaloneChecksums(test.options);

    expect(report).toMatchObject({
      status: 'VERIFIED',
      sourceSha: SOURCE_SHA,
      squadVersion: CLI_VERSION,
      nodeVersion: NODE_VERSION,
      nodeSecurityFloor: NODE_VERSION,
    });
    expect(report.targets.map((target) => target.target)).toEqual(EXPECTED_TARGETS);
    expect(JSON.parse(readFileSync(test.outputPath, 'utf8'))).toEqual(report);
  });

  it('rejects a mismatched archive hash', async () => {
    const test = fixture();
    writeFileSync(path.join(test.artifactsDir, archiveName('linux-x64')), 'tampered');
    await expect(verifyStandaloneChecksums(test.options)).rejects.toThrow('SHA-256 mismatch');
  });

  it('rejects a missing target', async () => {
    const test = fixture();
    unlinkSync(path.join(test.artifactsDir, archiveName('linux-arm64')));
    unlinkSync(validationPath(test.artifactsDir, 'linux-arm64'));
    await expect(verifyStandaloneChecksums(test.options)).rejects.toThrow(
      'archives must be exactly',
    );
  });

  it('rejects a duplicate SHA256SUMS line', async () => {
    const test = fixture();
    const lines = readFileSync(test.checksumsPath, 'utf8').trim().split(/\r?\n/);
    lines[5] = lines[0];
    writeFileSync(test.checksumsPath, `${lines.join('\n')}\n`);
    await expect(verifyStandaloneChecksums(test.options)).rejects.toThrow(
      'duplicate SHA256SUMS entry',
    );
  });

  it('rejects an extra archive', async () => {
    const test = fixture();
    writeFileSync(path.join(test.artifactsDir, 'squad-linux-riscv64.tar.gz'), 'extra');
    await expect(verifyStandaloneChecksums(test.options)).rejects.toThrow(
      'archives must be exactly',
    );
  });

  it('rejects malformed validation JSON', async () => {
    const test = fixture();
    writeFileSync(validationPath(test.artifactsDir, 'darwin-x64'), '{');
    await expect(verifyStandaloneChecksums(test.options)).rejects.toThrow('malformed JSON');
  });

  it('rejects the wrong source SHA', async () => {
    const test = fixture();
    updateValidation(test.artifactsDir, 'win32-x64', (record) => {
      record.sourceSha = 'b'.repeat(40);
    });
    await expect(verifyStandaloneChecksums(test.options)).rejects.toThrow(
      'does not match expected SHA',
    );
  });

  it('rejects an UNEXECUTED target', async () => {
    const test = fixture();
    updateValidation(test.artifactsDir, 'darwin-arm64', (record) => {
      record.execution = 'UNEXECUTED';
    });
    await expect(verifyStandaloneChecksums(test.options)).rejects.toThrow(
      'status is not EXECUTED',
    );
  });
});
