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
import { runDoctor, getDoctorMode, checkNodeVersion, looksLikeGlobalInstall } from '@bradygaster/squad-cli/commands/doctor';
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
  // Copilot agent discovery file (#533)
  await mkdir(join(root, '.github', 'agents'), { recursive: true });
  await writeFile(join(root, '.github', 'agents', 'squad.agent.md'), '# Squad Agent\n');
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
    // When .squad/ is missing the file checks are skipped — .squad/ + squad.agent.md + Node version + 2 ESM checks
    expect(checks.length).toBe(5);
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

  it('reports node:sqlite check as pass on current Node version', async () => {
    const checks = await runDoctor(TEST_ROOT);
    const nodeCheck = checks.find((c: DoctorCheck) => c.name.includes('node:sqlite'));
    expect(nodeCheck).toBeDefined();
    // Tests run on Node >= 22.5.0 — should always pass in CI
    expect(nodeCheck?.status).toBe('pass');
  });

  it('checkNodeVersion returns fail for Node <22.5.0', () => {
    const result = checkNodeVersion('20.18.0');
    expect(result.status).toBe('fail');
    expect(result.message).toContain('22.5.0');
    expect(result.message).toContain('nodejs.org');
  });

  it('checkNodeVersion returns fail for Node 22.4.x', () => {
    const result = checkNodeVersion('22.4.0');
    expect(result.status).toBe('fail');
    expect(result.message).toContain('22.5.0');
  });

  it('checkNodeVersion returns pass for Node 22.5.0', () => {
    const result = checkNodeVersion('22.5.0');
    expect(result.status).toBe('pass');
    expect(result.message).toContain('22.5.0');
  });

  it('checkNodeVersion returns pass for Node 24.x', () => {
    const result = checkNodeVersion('24.0.0');
    expect(result.status).toBe('pass');
  });

  it('warns when a recent rate limit status file exists', async () => {
    await scaffold(TEST_ROOT);
    const status = {
      timestamp: new Date().toISOString(),
      retryAfter: 7200,
      model: 'claude-sonnet-4.5',
      message: 'Rate limit exceeded',
    };
    await writeFile(
      join(TEST_ROOT, '.squad', 'rate-limit-status.json'),
      JSON.stringify(status),
    );

    const checks = await runDoctor(TEST_ROOT);
    const rlCheck = checks.find((c: DoctorCheck) => c.name === 'rate limit status');
    expect(rlCheck).toBeDefined();
    expect(rlCheck?.status).toBe('warn');
    expect(rlCheck?.message).toContain('claude-sonnet-4.5');
    expect(rlCheck?.message).toContain('squad economy on');
  });

  it('passes rate limit status as stale when timestamp is old', async () => {
    await scaffold(TEST_ROOT);
    const oldTs = new Date(Date.now() - 5 * 3600 * 1000).toISOString(); // 5h ago
    await writeFile(
      join(TEST_ROOT, '.squad', 'rate-limit-status.json'),
      JSON.stringify({ timestamp: oldTs, retryAfter: 7200, model: null, message: 'old' }),
    );

    const checks = await runDoctor(TEST_ROOT);
    const rlCheck = checks.find((c: DoctorCheck) => c.name === 'rate limit status');
    expect(rlCheck?.status).toBe('pass');
    expect(rlCheck?.message).toContain('appears resolved');
  });

  it('does not include rate limit status check when file is absent', async () => {
    await scaffold(TEST_ROOT);
    const checks = await runDoctor(TEST_ROOT);
    const rlCheck = checks.find((c: DoctorCheck) => c.name === 'rate limit status');
    expect(rlCheck).toBeUndefined();
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

  // ── #565 — Actionable resolution hints in warnings ────────────────

  it('vscode-jsonrpc info says "Expected for global CLI installs" when not in node_modules', async () => {
    await scaffold(TEST_ROOT);

    const checks = await runDoctor(TEST_ROOT);
    const jsonrpcCheck = checks.find((c: DoctorCheck) => c.name === 'vscode-jsonrpc exports field');
    expect(jsonrpcCheck).toBeDefined();
    expect(jsonrpcCheck?.status).toBe('warn');
    expect(jsonrpcCheck?.severity).toBe('info');
    expect(jsonrpcCheck?.message).toContain('Expected for global CLI installs');
    expect(jsonrpcCheck?.message).toContain('ESM patches applied at package install time');
  });

  it('copilot-sdk info says "Expected for global CLI installs" when not in node_modules', async () => {
    await scaffold(TEST_ROOT);

    const checks = await runDoctor(TEST_ROOT);
    const sdkCheck = checks.find((c: DoctorCheck) => c.name === 'copilot-sdk session.js ESM patch');
    expect(sdkCheck).toBeDefined();
    expect(sdkCheck?.status).toBe('warn');
    expect(sdkCheck?.severity).toBe('info');
    expect(sdkCheck?.message).toContain('Expected for global CLI installs');
    expect(sdkCheck?.message).toContain('ESM patches applied at package install time');
  });

  it('absolute teamRoot warning includes "Edit .squad/config.json"', async () => {
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
    expect(absWarn?.message).toContain('Edit .squad/config.json');
  });

  // ── #533 — squad.agent.md check ──────────────────────────────────

  it('reports FAIL when .github/agents/squad.agent.md is missing', async () => {
    await scaffold(TEST_ROOT);
    // Remove the file that scaffold created so the check reports fail
    await rm(join(TEST_ROOT, '.github'), { recursive: true, force: true });

    const checks = await runDoctor(TEST_ROOT);
    const agentMdCheck = checks.find((c: DoctorCheck) => c.name.includes('squad.agent.md'));
    expect(agentMdCheck).toBeDefined();
    expect(agentMdCheck?.status).toBe('fail');
  });

  it('reports PASS when .github/agents/squad.agent.md exists and is non-empty', async () => {
    await scaffold(TEST_ROOT);
    // scaffold already creates .github/agents/squad.agent.md with content

    const checks = await runDoctor(TEST_ROOT);
    const agentMdCheck = checks.find((c: DoctorCheck) => c.name.includes('squad.agent.md'));
    expect(agentMdCheck).toBeDefined();
    expect(agentMdCheck?.status).toBe('pass');
  });

  it('reports WARN when .github/agents/squad.agent.md exists but is empty', async () => {
    await scaffold(TEST_ROOT);
    // Overwrite with empty content
    await writeFile(join(TEST_ROOT, '.github', 'agents', 'squad.agent.md'), '');

    const checks = await runDoctor(TEST_ROOT);
    const agentMdCheck = checks.find((c: DoctorCheck) => c.name.includes('squad.agent.md'));
    expect(agentMdCheck).toBeDefined();
    expect(agentMdCheck?.status).toBe('warn');
  });

  it('squad.agent.md fail message includes "squad upgrade" as resolution step', async () => {
    await scaffold(TEST_ROOT);
    await rm(join(TEST_ROOT, '.github'), { recursive: true, force: true });

    const checks = await runDoctor(TEST_ROOT);
    const agentMdCheck = checks.find((c: DoctorCheck) => c.name.includes('squad.agent.md'));
    expect(agentMdCheck).toBeDefined();
    expect(agentMdCheck?.status).toBe('fail');
    expect(agentMdCheck?.message).toContain('squad upgrade');
  });

  // ── #817 — Global install detection ──────────────────────────────

  it('looksLikeGlobalInstall returns true when no node_modules exists', async () => {
    await scaffold(TEST_ROOT);
    // TEST_ROOT has no node_modules — should detect as global
    expect(looksLikeGlobalInstall(TEST_ROOT)).toBe(true);
  });

  it('looksLikeGlobalInstall returns false when node_modules exists', async () => {
    await scaffold(TEST_ROOT);
    await mkdir(join(TEST_ROOT, 'node_modules'), { recursive: true });
    expect(looksLikeGlobalInstall(TEST_ROOT)).toBe(false);
  });

  it('ESM checks show warn (not info) when node_modules exists but packages missing', async () => {
    await scaffold(TEST_ROOT);
    // Create node_modules to simulate local install where packages are missing
    await mkdir(join(TEST_ROOT, 'node_modules'), { recursive: true });

    const checks = await runDoctor(TEST_ROOT);
    const jsonrpcCheck = checks.find((c: DoctorCheck) => c.name === 'vscode-jsonrpc exports field');
    expect(jsonrpcCheck).toBeDefined();
    expect(jsonrpcCheck?.status).toBe('warn');
    expect(jsonrpcCheck?.severity).toBeUndefined();
    expect(jsonrpcCheck?.message).toContain('run npm install');
  });
});
