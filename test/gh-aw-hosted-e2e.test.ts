import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { sanitizedEnvironment } from '../scripts/gh-aw-hosted-e2e.mjs';
import {
  assertInstalledManifestIdentity,
  loadBundleContract,
  loadInstalledBundleContract,
} from '../scripts/gh-aw-hosted-e2e-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts/gh-aw-hosted-e2e.mjs'), 'utf8');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/squad-gh-aw-hosted-e2e.yml'), 'utf8');
describe('Squad gh-aw hosted E2E controller', () => {
  it('uses only a default-branch repository_dispatch controller and one PAT step', () => {
    const parsed = parse(WORKFLOW);
    expect(parsed.on.repository_dispatch.types).toEqual(['squad-gh-aw-hosted-e2e']);
    expect(parsed.on.workflow_dispatch).toBeUndefined();
    expect(WORKFLOW).not.toContain('inputs.source_ref');
    expect(WORKFLOW).toContain("github.ref_name == github.event.repository.default_branch");
    expect(WORKFLOW).toContain('protected `dev` branch');
    expect(WORKFLOW.match(/SQUAD_GH_AW_E2E_TOKEN/g)).toHaveLength(2);
    expect(parsed.jobs['hosted-e2e'].environment).toBe('squad-gh-aw-e2e');
    expect(parsed.permissions).toEqual({ contents: 'read' });
  });

  it('removes credentials from candidate child process environments', () => {
    process.env.GH_TOKEN = 'secret';
    process.env.SQUAD_GH_AW_E2E_TOKEN = 'secret';
    process.env.OTHER_CREDENTIAL = 'secret';
    process.env.ARBITRARY_UNTRUSTED_VALUE = 'secret';
    const env = sanitizedEnvironment({ SAFE_VALUE: 'ok' });
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.SQUAD_GH_AW_E2E_TOKEN).toBeUndefined();
    expect(env.OTHER_CREDENTIAL).toBeUndefined();
    expect(env.ARBITRARY_UNTRUSTED_VALUE).toBeUndefined();
    expect(env.SAFE_VALUE).toBe('ok');
    delete process.env.GH_TOKEN;
    delete process.env.SQUAD_GH_AW_E2E_TOKEN;
    delete process.env.OTHER_CREDENTIAL;
    delete process.env.ARBITRARY_UNTRUSTED_VALUE;
  });

  it('binds source and target identities without caller-selected privileged code', () => {
    expect(SCRIPT).toContain("repository: 'bradygaster/squad'");
    expect(SCRIPT).toContain('repositoryId: 1151205052');
    expect(SCRIPT).toContain('sourceRef !== `refs/heads/${info.default_branch}`');
    expect(SCRIPT).toContain('branch.protected !== true || branch.sha !== sourceSha');
    expect(SCRIPT).toContain('info.full_name !== target');
    expect(SCRIPT).toContain('info.id !== expectedRepositoryId || info.owner.id !== expectedOwnerId');
    expect(SCRIPT).toContain('actor.login !== expectedActorLogin || actor.id !== expectedActorId');
  });

  it('loads only the exact canonical manifest and has no fallback contract', () => {
    const contract = loadBundleContract(ROOT);
    expect(contract.package).toBe('bradygaster/squad/workflows');
    expect(contract.workflows).toHaveLength(7);
    expect(contract.runtime).toHaveLength(15);
    expect(contract.skills).toHaveLength(1);
    expect(contract.triggerProbe).toBe('shared/squad-bootstrap-trigger-probe.json');
    expect(() => loadInstalledBundleContract(resolve(ROOT, 'does-not-exist'))).toThrow(/missing or invalid/);
    expect(() => assertInstalledManifestIdentity(resolve(ROOT, 'packages'), ROOT)).toThrow(
      /Required file is missing/,
    );
    expect(readFileSync(
      resolve(ROOT, 'scripts/gh-aw-hosted-e2e-contract.mjs'),
      'utf8',
    )).not.toContain('FALLBACK_');
  });

  it('uses the non-executable unowned sentinel with exact staged diff and retained bytes', () => {
    expect(SCRIPT).toContain("kind: 'squad-bootstrap-trigger-probe'");
    expect(SCRIPT).toContain('trusted_source_sha: sourceSha');
    expect(SCRIPT).toContain('hosted_run_id:');
    expect(SCRIPT).toContain('install_merge_sha:');
    expect(SCRIPT).toContain('default_branch_sha:');
    expect(SCRIPT).toContain('assertExactStagedDiff(checkout, new Set([TRIGGER_PROBE_DESTINATION]))');
    expect(SCRIPT).not.toContain('appendFileSync');
    expect(SCRIPT).not.toContain("contract.runtime.find(({ path }) => path === contract.triggerProbe)");
  });

  it('bounds bootstrap polling and cleans temporary branches', () => {
    expect(SCRIPT).toContain('Date.now() + 20 * 60 * 1000');
    expect(SCRIPT).toContain('Date.now() + 5 * 60 * 1000');
    expect(SCRIPT).toContain('Expected exactly one bootstrap run');
    expect(SCRIPT).toContain("['pr', 'close'");
    expect(SCRIPT).toContain("['api', '--method', 'DELETE'");
    expect(SCRIPT).toContain('rmSync(checkout, { recursive: true, force: true })');
  });

  it('never executes candidate package or installed verifier with inherited credentials', () => {
    expect(SCRIPT).toContain('env: sanitizedEnvironment(options.env)');
    expect(SCRIPT).toContain("runChild('gh', ['aw', 'add'");
    expect(SCRIPT).toContain('env: { GH_TOKEN: sourceReadToken }');
    expect(SCRIPT).toContain("runChild('node', ['.github/workflows/shared/squad-install-verifier.mjs'");
    expect(SCRIPT).not.toMatch(/privileged\('node'/);
    expect(SCRIPT).not.toMatch(/privileged\('gh', \['aw'/);
  });
});
