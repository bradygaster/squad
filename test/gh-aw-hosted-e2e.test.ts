import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  authorizeTarget,
  sanitizedEnvironment,
  sourcePreflight,
} from '../scripts/gh-aw-hosted-e2e.mjs';
import {
  assertInstalledManifestIdentity,
  loadBundleContract,
  loadInstalledBundleContract,
} from '../scripts/gh-aw-hosted-e2e-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(resolve(ROOT, 'scripts/gh-aw-hosted-e2e.mjs'), 'utf8');
const WORKFLOW = readFileSync(resolve(ROOT, '.github/workflows/squad-gh-aw-hosted-e2e.yml'), 'utf8');
const SOURCE_SHA = 'a'.repeat(40);

function sourceArgs(overrides: Record<string, string> = {}) {
  return {
    source_repository: 'bradygaster/squad',
    source_repository_id: '1151205052',
    source_ref: 'refs/heads/dev',
    source_sha: SOURCE_SHA,
    ...overrides,
  };
}

function sourceApi(args: string[]) {
  const path = args[1];
  if (path === 'repos/bradygaster/squad') {
    return {
      id: 1151205052,
      full_name: 'bradygaster/squad',
      default_branch: 'dev',
      owner: { login: 'bradygaster', id: 41929050 },
      private: false,
      archived: false,
      disabled: false,
      is_template: false,
    };
  }
  if (path === 'repos/bradygaster/squad/branches/dev') {
    return { protected: true, sha: SOURCE_SHA };
  }
  throw new Error(`unexpected API call: ${args.join(' ')}`);
}

function sourceCommand(_command: string, args: string[]) {
  if (args[0] === 'rev-parse') return SOURCE_SHA;
  if (args[0] === 'status') return '';
  if (args[0] === 'remote') return 'https://github.com/bradygaster/squad.git';
  throw new Error(`unexpected command: ${args.join(' ')}`);
}

function targetArgs(overrides: Record<string, string> = {}) {
  return {
    target: 'bradygaster/squad-gh-aw-e2e-fixture',
    target_repository_id: '1234',
    target_owner_id: '41929050',
    target_default_sha: 'b'.repeat(40),
    pat_actor_login: 'bradygaster',
    pat_actor_id: '41929050',
    ...overrides,
  };
}

function targetApi(overrides: { tree?: string[]; repo?: Record<string, unknown> } = {}) {
  return (args: string[]) => {
    const path = args[1];
    if (path === 'user') return { login: 'bradygaster', id: 41929050 };
    if (path === 'repos/bradygaster/squad-gh-aw-e2e-fixture') {
      return {
        id: 1234,
        full_name: 'bradygaster/squad-gh-aw-e2e-fixture',
        default_branch: 'main',
        owner: { login: 'bradygaster', id: 41929050 },
        fork: false,
        is_template: false,
        archived: false,
        disabled: false,
        private: false,
        visibility: 'public',
        has_issues: true,
        allow_merge_commit: true,
        permissions: { push: true },
        ...overrides.repo,
      };
    }
    if (path === 'repos/bradygaster/squad-gh-aw-e2e-fixture/actions/permissions/workflow') {
      return { default_workflow_permissions: 'read', can_approve_pull_request_reviews: true };
    }
    if (path === 'repos/bradygaster/squad-gh-aw-e2e-fixture/branches/main') {
      return { sha: 'b'.repeat(40) };
    }
    if (path?.startsWith('repos/bradygaster/squad-gh-aw-e2e-fixture/git/trees/')) {
      return { truncated: false, tree: (overrides.tree ?? ['README.md']).map(path => ({ path })) };
    }
    if (args[0] === 'pr') return [];
    if (args[0] === 'issue') return [];
    if (path === 'repos/bradygaster/squad-gh-aw-e2e-fixture/actions/artifacts') {
      return { artifacts: [] };
    }
    throw new Error(`unexpected API call: ${args.join(' ')}`);
  };
}

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

  it('binds the controller to the trusted repository, protected default ref, head, and origin', () => {
    expect(sourcePreflight(sourceArgs(), ROOT, {
      ghJson: sourceApi,
      runChild: sourceCommand,
    })).toMatchObject({ id: 1151205052, sha: SOURCE_SHA });
    expect(() => sourcePreflight(sourceArgs({ source_ref: 'refs/heads/feature' }), ROOT, {
      ghJson: sourceApi,
      runChild: sourceCommand,
    })).toThrow(/default branch ref/);
    expect(() => sourcePreflight(sourceArgs({ source_repository_id: '9' }), ROOT, {
      ghJson: sourceApi,
      runChild: sourceCommand,
    })).toThrow(/trusted Squad repository/);
  });

  it('authorizes immutable target and actor identities and a complete pristine tree', () => {
    const contract = loadBundleContract(ROOT);
    const source = { id: 1151205052, full_name: 'bradygaster/squad' };
    expect(authorizeTarget(targetArgs(), source, contract, {
      ghJson: targetApi(),
    })).toMatchObject({ target: 'bradygaster/squad-gh-aw-e2e-fixture', defaultSha: 'b'.repeat(40) });

    expect(() => authorizeTarget(targetArgs({ target_repository_id: '999' }), source, contract, {
      ghJson: targetApi(),
    })).toThrow(/numeric identity/);
    expect(() => authorizeTarget(targetArgs({ target_default_sha: 'c'.repeat(40) }), source, contract, {
      ghJson: targetApi(),
    })).toThrow(/configured pristine SHA/);
    expect(() => authorizeTarget(targetArgs(), source, contract, {
      ghJson: targetApi({ repo: { fork: true } }),
    })).toThrow(/non-fork/);
    expect(() => authorizeTarget(targetArgs(), source, contract, {
      ghJson: targetApi({ tree: ['.github/aw/packages/stale.json'] }),
    })).toThrow(/not pristine/);
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

  it('bounds polling, verifies merge heads, rejects duplicates, and cleans recovery branches', () => {
    expect(SCRIPT).toContain('Date.now() + 20 * 60 * 1000');
    expect(SCRIPT).toContain('Date.now() + 5 * 60 * 1000');
    expect(SCRIPT).toContain('Expected exactly one bootstrap run');
    expect(SCRIPT).toContain('Bootstrap created duplicate pull requests or issues');
    expect(SCRIPT).toContain('does not equal merge SHA');
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
