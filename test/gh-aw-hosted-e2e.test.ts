import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = resolve(ROOT, 'scripts/gh-aw-hosted-e2e.mjs');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/squad-gh-aw-hosted-e2e.yml'), 'utf8');
const workspaces: string[] = [];

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function write(root: string, path: string, content: string): void {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture() {
  const source = mkdtempSync(resolve(tmpdir(), 'gh-aw-hosted-source-'));
  const consumer = mkdtempSync(resolve(tmpdir(), 'gh-aw-hosted-consumer-'));
  workspaces.push(source, consumer);

  write(source, 'workflows/alpha.md', 'alpha source\n');
  write(source, 'workflows/alpha.lock.yml', 'alpha lock\n');
  write(source, 'workflows/shared/runtime.mjs', 'export const runtime = true;\n');
  write(source, 'workflows/shared/squad-install-verifier.mjs', 'export const verifier = true;\n');
  const manifest = `${JSON.stringify({
    schema_version: 1,
    workflows: [{
      name: 'alpha',
      source: 'alpha.md',
      lock: 'alpha.lock.yml',
      source_sha256: sha256(resolve(source, 'workflows/alpha.md')),
    }],
    shared_runtime: [{
      path: 'shared/runtime.mjs',
      destination: 'shared/installed-runtime.mjs',
      owner: 'alpha',
      sha256: sha256(resolve(source, 'workflows/shared/runtime.mjs')),
    }, {
      path: 'shared/squad-install-verifier.mjs',
      sha256: sha256(resolve(source, 'workflows/shared/squad-install-verifier.mjs')),
    }],
    bootstrap: { trigger_probe: 'shared/squad-install-verifier.mjs' },
  }, null, 2)}\n`;
  write(source, 'workflows/squad-workflows.manifest.json', manifest);

  write(consumer, '.github/workflows/alpha.md', 'alpha source\n');
  write(consumer, '.github/workflows/alpha.lock.yml', 'alpha lock\n');
  write(consumer, '.github/workflows/shared/installed-runtime.mjs', 'export const runtime = true;\n');
  write(consumer, '.github/workflows/shared/squad-install-verifier.mjs', 'export const verifier = true;\n');
  write(consumer, '.github/aw/squad-workflows.manifest.json', manifest);
  return { source, consumer };
}

afterAll(() => {
  for (const workspace of workspaces) rmSync(workspace, { recursive: true, force: true });
});

describe('Squad gh-aw hosted E2E harness', () => {
  it('is manual, environment-gated, least-privileged, and retains evidence', () => {
    const parsed = parse(WORKFLOW);
    expect(parsed.jobs['hosted-e2e'].environment).toBe('squad-gh-aw-e2e');
    expect(WORKFLOW).toContain('workflow_dispatch:');
    expect(WORKFLOW).not.toMatch(/\npush:|\npull_request:/);
    expect(WORKFLOW).toContain('environment: squad-gh-aw-e2e');
    expect(WORKFLOW).toContain('permissions:\n  contents: read');
    expect(WORKFLOW).toContain('SQUAD_GH_AW_E2E_TOKEN');
    expect(WORKFLOW).toContain('confirm_repository');
    expect(WORKFLOW).toContain('squad-gh-aw-e2e-*');
    expect(WORKFLOW).toContain('if: always()');
    expect(WORKFLOW).toContain('retention-days: 30');
  });

  it('does not auto-merge generated Squad work', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    expect(script).toContain("head', 'squad/bootstrap-cast'");
    expect(script).toContain('castPrs[0].isDraft');
    expect(script).toContain('generated_work_merged: false');
    expect(script).not.toMatch(/pr', 'merge'[\s\S]{0,200}squad\/bootstrap-cast/);
  });

  it('diagnoses incomplete and stale installs, then recovers from canonical sources', () => {
    const { source, consumer } = fixture();
    rmSync(resolve(consumer, '.github/workflows/alpha.lock.yml'));
    writeFileSync(
      resolve(consumer, '.github/workflows/shared/installed-runtime.mjs'),
      'export const runtime = false;\n',
    );

    const failed = spawnSync('node', [
      SCRIPT,
      'diagnose',
      '--root', consumer,
      '--contract-root', source,
    ], { encoding: 'utf8' });
    expect(failed.status).toBe(1);
    const diagnosis = JSON.parse(failed.stdout);
    expect(diagnosis.valid).toBe(false);
    expect(diagnosis.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing', path: '.github/workflows/alpha.lock.yml' }),
      expect.objectContaining({ code: 'stale', path: '.github/workflows/shared/installed-runtime.mjs' }),
    ]));

    const repaired = execFileSync('node', [
      SCRIPT,
      'repair',
      '--root', consumer,
      '--source-root', source,
      '--contract-root', source,
    ], { encoding: 'utf8' });
    expect(JSON.parse(repaired).valid).toBe(true);
    expect(readFileSync(resolve(consumer, '.github/aw/squad-workflows.manifest.json'), 'utf8'))
      .toBe(readFileSync(resolve(source, 'workflows/squad-workflows.manifest.json'), 'utf8'));
  });

  it('loads the native installed manifest and honors runtime destinations', async () => {
    const { consumer } = fixture();
    const contract = await import('../scripts/gh-aw-hosted-e2e-contract.mjs');
    const loaded = contract.loadInstalledBundleContract(consumer);
    expect(loaded.source).toBe('.github/aw/squad-workflows.manifest.json');
    expect(loaded.runtime[0]).toMatchObject({
      path: 'shared/runtime.mjs',
      destination: 'shared/installed-runtime.mjs',
      owner: 'alpha',
    });
    expect(loaded.triggerProbe).toBe('shared/squad-install-verifier.mjs');
  });

  it('keeps the seven-workflow fallback in one adapter', async () => {
    const contract = await import('../scripts/gh-aw-hosted-e2e-contract.mjs');
    const loaded = contract.loadBundleContract(ROOT);
    expect(loaded.workflows.map((workflow: { name: string }) => workflow.name)).toEqual([
      'squad',
      'squad-implement-worker',
      'squad-review',
      'squad-deps-worker',
      'squad-retro',
      'squad-improvement-worker',
      'squad-bootstrap',
    ]);
    expect(loaded.triggerProbe).toBe('shared/squad-install-verifier.mjs');
    expect(readFileSync(SCRIPT, 'utf8')).not.toContain("'squad-improvement-worker'");
  });
});
