/**
 * squad doctor — setup validation tests
 *
 * Verifies the diagnostic command reports correct status
 * for healthy, empty, and remote-mode squad directories.
 * Doctor command inspired by @spboyer (Shayne Boyer)'s PR bradygaster/squad#131.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { runDoctor, getDoctorMode } from '@bradygaster/squad-cli/commands/doctor';
import type { DoctorCheck } from '@bradygaster/squad-cli/commands/doctor';

const TEST_ROOT = join(process.cwd(), `.test-doctor-${randomBytes(4).toString('hex')}`);

async function scaffold(root: string): Promise<void> {
  const sq = join(root, '.squad');
  await mkdir(join(sq, 'agents', 'edie'), { recursive: true });
  await mkdir(join(sq, 'casting'), { recursive: true });
  await writeFile(join(sq, 'team.md'), '# Team\n\n## Members\n\n- Edie\n');
  await writeFile(join(sq, 'routing.md'), '# Routing\n');
  await writeFile(join(sq, 'decisions.md'), '# Decisions\n');
  await writeFile(
    join(sq, 'casting', 'registry.json'),
    JSON.stringify({ agents: [] }, null, 2),
  );
}

describe('squad doctor', () => {
  beforeEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
    await mkdir(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_ROOT)) {
      await rm(TEST_ROOT, { recursive: true, force: true });
    }
  });

  it('reports all green on a healthy local setup', async () => {
    await scaffold(TEST_ROOT);

    const checks = await runDoctor(TEST_ROOT);

    const failed = checks.filter((c: DoctorCheck) => c.status === 'fail');
    expect(failed).toEqual([]);
    expect(checks.some((c: DoctorCheck) => c.name === '.squad/ directory exists' && c.status === 'pass')).toBe(true);
    expect(checks.some((c: DoctorCheck) => c.name === 'team.md found with ## Members header' && c.status === 'pass')).toBe(true);
    expect(checks.some((c: DoctorCheck) => c.name === 'agents/ directory exists' && c.status === 'pass')).toBe(true);
    expect(checks.some((c: DoctorCheck) => c.name === 'casting/registry.json exists' && c.status === 'pass')).toBe(true);
    expect(checks.some((c: DoctorCheck) => c.name === 'decisions.md exists' && c.status === 'pass')).toBe(true);
    // ESM checks return 'warn' (not fail) when node_modules absent from test dir
    expect(checks.some((c: DoctorCheck) => c.name === 'vscode-jsonrpc exports field')).toBe(true);
    expect(checks.some((c: DoctorCheck) => c.name === 'copilot-sdk session.js ESM patch')).toBe(true);
  });

  it('reports failures on an empty directory', async () => {
    const checks = await runDoctor(TEST_ROOT);

    const squadDirCheck = checks.find((c: DoctorCheck) => c.name === '.squad/ directory exists');
    expect(squadDirCheck?.status).toBe('fail');
    // When .squad/ is missing the file checks are skipped — only .squad/ + 2 ESM checks
    expect(checks.length).toBe(3);
  });

  it('detects remote mode from config.json with teamRoot', async () => {
    await scaffold(TEST_ROOT);
    const configPath = join(TEST_ROOT, '.squad', 'config.json');
    await writeFile(configPath, JSON.stringify({ teamRoot: '../shared-squad' }));

    const mode = getDoctorMode(TEST_ROOT);
    expect(mode).toBe('remote');

    const checks = await runDoctor(TEST_ROOT);
    const rootCheck = checks.find((c: DoctorCheck) => c.name === 'team root resolves');
    expect(rootCheck).toBeDefined();
    // The sibling dir doesn't exist in the test environment → should fail
    expect(rootCheck?.status).toBe('fail');
  });

  it('detects hub mode from squad-hub.json', async () => {
    await writeFile(join(TEST_ROOT, 'squad-hub.json'), JSON.stringify({ squads: [] }));
    await mkdir(join(TEST_ROOT, '.squad'), { recursive: true });

    const mode = getDoctorMode(TEST_ROOT);
    expect(mode).toBe('hub');
  });

  it('detects local mode by default', async () => {
    await scaffold(TEST_ROOT);
    const mode = getDoctorMode(TEST_ROOT);
    expect(mode).toBe('local');
  });

  it('warns on absolute teamRoot', async () => {
    await scaffold(TEST_ROOT);
    const abs = process.platform === 'win32' ? 'C:\\some\\absolute\\path' : '/some/absolute/path';
    await writeFile(
      join(TEST_ROOT, '.squad', 'config.json'),
      JSON.stringify({ teamRoot: abs }),
    );

    const checks = await runDoctor(TEST_ROOT);
    const absWarn = checks.find((c: DoctorCheck) => c.name === 'absolute path warning');
    expect(absWarn).toBeDefined();
    expect(absWarn?.status).toBe('warn');
  });

  it('warns when team.md is missing ## Members header', async () => {
    await scaffold(TEST_ROOT);
    await writeFile(join(TEST_ROOT, '.squad', 'team.md'), '# Team\n\nNo members section here.\n');

    const checks = await runDoctor(TEST_ROOT);
    const teamCheck = checks.find((c: DoctorCheck) => c.name === 'team.md found with ## Members header');
    expect(teamCheck?.status).toBe('warn');
  });

  it('fails on invalid config.json', async () => {
    await scaffold(TEST_ROOT);
    await writeFile(join(TEST_ROOT, '.squad', 'config.json'), 'NOT JSON');

    const checks = await runDoctor(TEST_ROOT);
    const configCheck = checks.find((c: DoctorCheck) => c.name === 'config.json valid');
    expect(configCheck).toBeDefined();
    expect(configCheck?.status).toBe('fail');
  });
});
