/**
 * #730: squad.agent.md resilience — silent deletion prevention
 *
 * These tests prove three bugs in the current code:
 *
 *   Bug 1 (upgrade.ts ~line 497-504): The "version-current" code path
 *     silently skips refreshing the agent file when the CLI template source
 *     (`squad.agent.md.template`) is missing — no error, no warning.
 *
 *   Bug 2 (SDK init.ts ~line 1032-1038): `initSquad` silently skips
 *     creating `.github/agents/squad.agent.md` when the template is missing.
 *     There is no else clause and no fallback.
 *
 *   Bug 3 (upgrade.ts + doctor.ts): A nearly-empty agent file (just the
 *     version stamp) is not auto-recovered by upgrade when the template is
 *     unavailable, AND doctor under-reports the severity of an empty file.
 *
 * @see https://github.com/bradygaster/squad/issues/730
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, readFileSync, renameSync } from 'fs';
import { randomBytes } from 'crypto';
import { runInit } from '@bradygaster/squad-cli/core/init';
import { runUpgrade } from '@bradygaster/squad-cli/core/upgrade';
import { getPackageVersion } from '@bradygaster/squad-cli/core/version';
// Not exported via package.json — import from source directly
import { getTemplatesDir } from '../../packages/squad-cli/src/cli/core/templates.js';
import { runDoctor } from '@bradygaster/squad-cli/commands/doctor';
import type { DoctorCheck } from '@bradygaster/squad-cli/commands/doctor';
import { initSquad } from '../../packages/squad-sdk/src/config/init.js';
import type { InitOptions } from '../../packages/squad-sdk/src/config/init.js';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const TEST_ROOT = join(process.cwd(), `.test-730-agent-file-${randomBytes(4).toString('hex')}`);

// ---------------------------------------------------------------------------
// Helper: scaffold a minimal squad directory (mirrors doctor.test.ts)
// ---------------------------------------------------------------------------
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
  await mkdir(join(root, '.github', 'agents'), { recursive: true });
  await writeFile(join(root, '.github', 'agents', 'squad.agent.md'), '# Squad Agent\n');
}

// ---------------------------------------------------------------------------
// Helper: temporarily hide a template file so the code under test can't find
// it. Returns a restore function to call in `finally`.
// ---------------------------------------------------------------------------
function hideTemplate(templatePath: string): () => void {
  if (!existsSync(templatePath)) {
    throw new Error(
      `Test setup error: template file not found at "${templatePath}" — cannot hide template.`,
    );
  }
  const backup = templatePath + '.bak-730';
  // NOTE: renaming the real template can cause flakiness if vitest runs other
  // test files in parallel that depend on it.  Both call-sites wrap the
  // rename in a try/finally so the file is always restored, but if parallel
  // isolation becomes a problem consider mocking `getTemplatesDir` instead.
  renameSync(templatePath, backup);
  return () => {
    if (existsSync(backup)) {
      renameSync(backup, templatePath);
    }
  };
}

// ---------------------------------------------------------------------------
// Custom StorageProvider that pretends squad.agent.md.template doesn't exist.
// Used to simulate a corrupted / missing template without touching the real
// filesystem — lets us exercise the SDK init code path safely.
// ---------------------------------------------------------------------------
class MissingAgentTemplateStorage extends FSStorageProvider {
  override existsSync(p: string): boolean {
    if (p.endsWith('squad.agent.md.template')) return false;
    return super.existsSync(p);
  }

  override readSync(p: string): string | undefined {
    if (p.endsWith('squad.agent.md.template')) return undefined;
    return super.readSync(p);
  }
}

describe('#730: squad.agent.md resilience — silent deletion prevention', () => {
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

  // ── Test 1 — Baseline ─────────────────────────────────────────────────
  // (Should PASS — validates that the version-current path refreshes the
  // agent file when the template IS present.)

  it('upgrade (version-current) should still include squad.agent.md in filesUpdated even when already current', async () => {
    await runInit(TEST_ROOT);
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');

    // First upgrade — version is already current
    const first = await runUpgrade(TEST_ROOT);
    expect(first.fromVersion).toBe(first.toVersion);

    // Second upgrade — still current
    const second = await runUpgrade(TEST_ROOT);
    expect(second.fromVersion).toBe(second.toVersion);

    // Even on the second pass, squad.agent.md should have been refreshed
    expect(second.filesUpdated).toContain('squad.agent.md');

    // And the file must be non-empty with valid content
    const content = await readFile(agentPath, 'utf-8');
    expect(content.trim().length).toBeGreaterThan(0);
    expect(content).toContain('Squad');
  });

  // ── Test 2 — Empty file + upgrade (template present) ──────────────────
  // (Should PASS — the empty file makes readInstalledVersion return '0.0.0'
  // which routes through the FULL upgrade path, not version-current.)

  it('upgrade (full path after empty file) should not leave squad.agent.md empty', async () => {
    await runInit(TEST_ROOT);
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');

    // Corrupt the file
    await writeFile(agentPath, '');
    expect(readFileSync(agentPath, 'utf-8')).toBe('');

    // Upgrade (full path, since version is unreadable → 0.0.0)
    const result = await runUpgrade(TEST_ROOT);

    const after = await readFile(agentPath, 'utf-8');
    expect(after.trim().length).toBeGreaterThan(0);
    expect(after).toContain('Squad');
    expect(result.filesUpdated).toContain('squad.agent.md');
  });

  // ── Test 3 — Bug 1: version-current path silently skips ───────────────
  it('upgrade should warn or error when template source is missing', async () => {
    await runInit(TEST_ROOT);
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const currentVersion = getPackageVersion();

    // Sanity: file has current version
    const before = await readFile(agentPath, 'utf-8');
    expect(before).toContain(`<!-- version: ${currentVersion} -->`);

    // Hide the CLI package template so the version-current path can't find it
    const cliTemplatesDir = getTemplatesDir();
    const templateFile = join(cliTemplatesDir, 'squad.agent.md.template');
    const restore = hideTemplate(templateFile);

    try {
      // Upgrade — version is current → enters version-current branch
      const result = await runUpgrade(TEST_ROOT);

      // BUG: the version-current path silently skips when template is
      // missing. After a fix either filesUpdated would list squad.agent.md
      // or runUpgrade would throw/warn. Currently neither happens.
      expect(result.filesUpdated).toContain('squad.agent.md');
    } finally {
      restore();
    }
  });

  // ── Test 4 — Bug 2: SDK init never creates agent file ─────────────────
  it('init should create non-empty squad.agent.md even when template dir is empty', async () => {
    const options: InitOptions = {
      teamRoot: TEST_ROOT,
      projectName: 'test-730',
      agents: [{ name: 'edie', role: 'Engineer' }],
      configFormat: 'markdown',
      version: getPackageVersion(),
    };

    // Pass a custom storage that pretends the template doesn't exist
    await initSquad(options, new MissingAgentTemplateStorage());

    const agentFile = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');

    // The agent file MUST exist after init — Copilot uses it for discovery.
    // BUG: without the template the file is silently never created.
    expect(existsSync(agentFile)).toBe(true);

    if (existsSync(agentFile)) {
      const content = await readFile(agentFile, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  // ── Test 5 — Bug 3: nearly-empty file not recovered (template missing) ─
  it('upgrade should restore empty squad.agent.md', async () => {
    await runInit(TEST_ROOT);
    const agentPath = join(TEST_ROOT, '.github', 'agents', 'squad.agent.md');
    const currentVersion = getPackageVersion();

    // Write just the version stamp — enough to fool readInstalledVersion
    // into returning the current version, triggering the version-current path
    await writeFile(agentPath, `<!-- version: ${currentVersion} -->\n`);

    // Sanity: content is minimal
    const stamp = readFileSync(agentPath, 'utf-8');
    expect(stamp).toContain(`<!-- version: ${currentVersion} -->`);
    expect(stamp.trim().length).toBeLessThan(100);

    // Hide the CLI template
    const cliTemplatesDir = getTemplatesDir();
    const templateFile = join(cliTemplatesDir, 'squad.agent.md.template');
    const restore = hideTemplate(templateFile);

    try {
      await runUpgrade(TEST_ROOT);

      // After upgrade the file should contain real coordinator content,
      // not just the bare version stamp.
      const content = await readFile(agentPath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
      expect(content).toContain('# ');
    } finally {
      restore();
    }
  });

  // ── Test 6 — Doctor severity: empty ⇒ fail, not warn ──────────────────
  it('doctor should report fail (not just warn) for empty squad.agent.md with recovery hint', async () => {
    await scaffold(TEST_ROOT);
    await writeFile(join(TEST_ROOT, '.github', 'agents', 'squad.agent.md'), '');

    const checks = await runDoctor(TEST_ROOT);
    const agentCheck = checks.find((c: DoctorCheck) => c.name.includes('squad.agent.md'));

    expect(agentCheck).toBeDefined();
    // An empty coordinator file is a critical issue, not a soft warning.
    expect(agentCheck?.status).toBe('fail');
    expect(agentCheck?.message).toContain('squad upgrade');
  });
});
