import { afterAll, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';
import {
  DESCRIPTOR, RUNTIME_ROOT, RUNTIME_ENTRY, RUNTIME_FILES, POLICY, MAX_AGE_MS, digest, readProvider,
  runContext, validateBundle, provenance, unpackArtifact, evidenceMode, policyDigests,
  invokeProvider, verifyProviderBundle, prepareEvidence, validatePublication, restoreReference,
} from '../workflows/shared/squad-evidence-provider.mjs';

const roots: string[] = [];
const now = Date.parse('2026-10-14T21:03:08Z');
const context = {
  control_repository: 'octo/control', workflow_revision: 'a'.repeat(40),
  issue_number: 42, run_id: '100', run_attempt: '1',
};
afterAll(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'squad-evidence-test-'));
  roots.push(root);
  return root;
}

function put(root: string, name: string, bytes: string) {
  const path = join(root, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
}

function provider(code = '// immutable fixture\n') {
  const root = scratch();
  const runtime_files = Object.fromEntries(RUNTIME_FILES.map(name => {
    const content = name === RUNTIME_ENTRY ? code : '// immutable fixture\n';
    put(root, name, content);
    return [name, digest(content)];
  }));
  const descriptor = {
    schema: 'squad-evidence-provider/v1', kind: 'cao-farm-v1', runtime: RUNTIME_ENTRY, runtime_files,
  };
  put(root, DESCRIPTOR, JSON.stringify(descriptor));
  return { root, descriptor };
}

function bundle() {
  const root = scratch();
  const documents = {
    'farm/INDEX.md': digest('index\n'), 'farm/evidence.json': digest('{}\n'),
    'farm/octo/backend/SNAPSHOT.md': digest('source\n'),
  };
  put(root, 'farm/INDEX.md', 'index\n');
  put(root, 'farm/evidence.json', '{}\n');
  put(root, 'farm/octo/backend/SNAPSHOT.md', 'source\n');
  const manifest = {
    schema: 'cao-squad-wave-evidence/v1', ...context,
    policy_sha256: 'b'.repeat(64), enrollment_sha256: 'c'.repeat(64),
    captured_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now - 1000 + MAX_AGE_MS).toISOString(),
    repositories: [{
      repository: 'octo/backend', revision: 'd'.repeat(40), destination: 'farm/octo/backend/SNAPSHOT.md',
      files: [{ path: 'README.md', truncated: false }], total_files: 1, tree_paths_shown: 1,
    }],
    documents,
  };
  put(root, 'manifest.json', JSON.stringify(manifest));
  return { root, manifest };
}

describe('trusted CAO evidence provider descriptor', () => {
  it('preserves vanilla Squad exactly when no provider exists', () => {
    expect(readProvider(scratch())).toBeNull();
  });

  it('validates every byte of the runtime closure before any execution', () => {
    const { root } = provider();
    expect(readProvider(root)?.kind).toBe('cao-farm-v1');
    put(root, `${RUNTIME_ROOT}/activity/authentication.mjs`, 'tampered');
    expect(() => readProvider(root)).toThrow('hash mismatch');
  });

  it.each(['runtime', 'kind', 'schema', 'runtime_files'])('fails closed on malformed %s', field => {
    const { root, descriptor } = provider();
    put(root, DESCRIPTOR, JSON.stringify({ ...descriptor, [field]: 'untrusted' }));
    expect(() => readProvider(root)).toThrow();
  });

  it('rejects commands/URLs and unpinned extra files', () => {
    const { root, descriptor } = provider();
    put(root, DESCRIPTOR, JSON.stringify({ ...descriptor, command: 'curl https://untrusted.invalid' }));
    expect(() => readProvider(root)).toThrow('unsupported or missing fields');
    put(root, DESCRIPTOR, JSON.stringify(descriptor));
    put(root, `${RUNTIME_ROOT}/activity/extra.mjs`, 'bad');
    expect(() => readProvider(root)).toThrow('unpinned files');
  });

  it('rejects broken descriptor links rather than treating them as absent', () => {
    const root = scratch();
    mkdirSync(join(root, '.squad'));
    symlinkSync(join(root, 'missing.json'), join(root, DESCRIPTOR));
    expect(() => readProvider(root)).toThrow('symbolic links');
  });

  it('never substitutes the event head SHA for the executing workflow SHA', () => {
    const env = {
      GITHUB_REPOSITORY: context.control_repository, SQUAD_WORKFLOW_SHA: context.workflow_revision,
      SQUAD_ISSUE_NUMBER: '42', GITHUB_RUN_ID: '100', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_SHA: 'e'.repeat(40),
    };
    expect(runContext(env)).toEqual(context);
    expect(() => runContext({ ...env, SQUAD_WORKFLOW_SHA: undefined })).toThrow();
  });
});

describe('run-bound complete evidence bundle', () => {
  it.each(['src/app/[slug]/page.tsx', 'docs/Getting Started.md'])('accepts ordinary source path %s', path => {
    const { root, manifest } = bundle();
    manifest.repositories[0].files = [{ path, truncated: false }];
    put(root, 'manifest.json', JSON.stringify(manifest));
    expect(validateBundle(root, context, now).manifest.repositories[0].files[0].path).toBe(path);
  });

  it.each(['../escape', '/absolute', 'src/../escape', 'src/./file', 'src//file',
    'src/file\0.md', 'C:/absolute', 'src\\..\\escape'])('rejects unsafe source path %s', path => {
    const { root, manifest } = bundle();
    manifest.repositories[0].files = [{ path, truncated: false }];
    put(root, 'manifest.json', JSON.stringify(manifest));
    expect(() => validateBundle(root, context, now), `source path ${JSON.stringify(path)}`).toThrow('unsafe');
  });

  it('authors provenance from verified bytes, not model data', () => {
    const { root, manifest } = bundle();
    const checked = validateBundle(root, context, now);
    expect(provenance(checked)).toMatchObject({
      provider: 'cao-farm-v1', artifact: 'squad-cao-evidence-100-1',
      manifest_sha256: digest(readFileSync(join(root, 'manifest.json'))),
      workflow_revision: manifest.workflow_revision,
    });
  });
});

    function zip(files: Record<string, string>, unixMode = 0x81a4) {
      const locals: Buffer[] = [];
      const directory: Buffer[] = [];
      let offset = 0;
      for (const [name, text] of Object.entries(files)) {
        const filename = Buffer.from(name);
        const content = Buffer.from(text);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50);
        local.writeUInt32LE(content.length, 18);
        local.writeUInt32LE(content.length, 22);
        local.writeUInt16LE(filename.length, 26);
        locals.push(local, filename, content);
        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50);
        entry.writeUInt32LE(content.length, 20);
        entry.writeUInt32LE(content.length, 24);
        entry.writeUInt16LE(filename.length, 28);
        entry.writeUInt32LE((unixMode * 0x10000) >>> 0, 38);
        entry.writeUInt32LE(offset, 42);
        directory.push(entry, filename);
        offset += local.length + filename.length + content.length;
      }
      const central = Buffer.concat(directory);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50);
      end.writeUInt16LE(Object.keys(files).length, 8);
      end.writeUInt16LE(Object.keys(files).length, 10);
      end.writeUInt32LE(central.length, 12);
      end.writeUInt32LE(offset, 16);
      return Buffer.concat([...locals, central, end]);
    }

    describe('bounded referenced artifact restore', () => {
      function restoreFixture(runOverrides = {}) {
        const { root, manifest } = bundle();
        const reference = provenance(validateBundle(root, context, now));
        const files = Object.fromEntries(['manifest.json', ...Object.keys(manifest.documents)]
          .map(name => [name, readFileSync(join(root, name), 'utf8')]));
        const attemptCalls: unknown[] = [];
        let downloads = 0;
        const github = { rest: { actions: {
          // A later rerun failed, but the referenced producer attempt succeeded.
          getWorkflowRun: async () => ({ data: {
            id: 100, run_attempt: 2, conclusion: 'failure',
            repository: { full_name: context.control_repository }, path: '.github/workflows/squad.lock.yml',
          } }),
          getWorkflowRunAttempt: async (params: unknown) => {
            attemptCalls.push(params);
            return { data: {
              id: 100, run_attempt: 1, conclusion: 'success',
              repository: { full_name: context.control_repository }, path: '.github/workflows/squad.lock.yml',
              ...runOverrides,
            } };
          },
          listWorkflowRunArtifacts: async () => ({ data: {
            total_count: 1, artifacts: [{ id: 10, name: reference.artifact, expired: false, size_in_bytes: 100 }],
          } }),
          downloadArtifact: async () => {
            downloads++;
            return { data: zip(files) };
          },
        } } };
        return { github, reference, attemptCalls, downloads: () => downloads };
      }

      it('restores the successful producer attempt even after a failed rerun', async () => {
        const fixture = restoreFixture();
        const directory = join(scratch(), 'bundle');
        await restoreReference(fixture.github, fixture.reference, directory);
        expect(fixture.attemptCalls).toEqual([{
          owner: 'octo', repo: 'control', run_id: '100', attempt_number: '1',
        }]);
        expect(provenance(validateBundle(directory, context, now))).toEqual(fixture.reference);
      });

      it.each([{ id: 101 }, { run_attempt: 2 }, { conclusion: 'failure' }])(
        'rejects the wrong or unsuccessful producer %j', async run => {
          const fixture = restoreFixture(run);
          await expect(restoreReference(fixture.github, fixture.reference, join(scratch(), 'bundle')))
            .rejects.toThrow('successful native Squad workflow');
          expect(fixture.downloads()).toBe(0);
        },
      );

      it('extracts only regular evidence files', () => {
        const destination = join(scratch(), 'bundle');
        unpackArtifact(zip({ 'manifest.json': '{}', 'farm/evidence.json': '{}' }), destination);
        expect(readFileSync(join(destination, 'farm/evidence.json'), 'utf8')).toBe('{}');
      });

      it.each(['../escape', '/absolute', 'farm/../../escape', 'not-farm/file'])('rejects ZIP path %s', name => {
        expect(() => unpackArtifact(zip({ [name]: 'bad' }), join(scratch(), 'bundle'))).toThrow();
      });

      it('rejects archive symlinks before writing any files', () => {
        const destination = join(scratch(), 'bundle');
        expect(() => unpackArtifact(zip({ 'farm/link': '../outside' }, 0xa1ff), destination)).toThrow('linked');
      });
    });

    function compile(source: string) {
      const root = scratch();
      const directory = join(root, '.github/workflows');
      mkdirSync(directory, { recursive: true });
      cpSync(resolve('workflows/shared'), join(directory, 'shared'), { recursive: true });
      // Dispatch targets must exist for strict compile; only squad.md is compiled.
      for (const name of readdirSync(resolve('workflows')).filter(name => /^squad-.*\.md$/.test(name))) {
        cpSync(resolve('workflows', name), join(directory, name));
      }
      writeFileSync(join(directory, 'squad.md'), source);
      execFileSync('git', ['init', '--quiet'], { cwd: root });
      execFileSync('gh', [
        'aw', 'compile', 'squad', '--strict', '--no-check-update', '--schedule-seed', 'githubnext/gh-aw-cao',
      ], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
      return parse(readFileSync(join(directory, 'squad.lock.yml'), 'utf8'));
    }

    function compiledContract(lock: any) {
      const steps = Object.values(lock.jobs).flatMap((job: any) => job.steps || []);
      const gate = steps.find((step: any) => step.name === 'Prepare trusted current research evidence');
      expect(gate?.env.SQUAD_WORKFLOW_SHA).toBe('${{ github.workflow_sha }}');
      const upload = steps.find((step: any) => step.name === 'Retain verified current research evidence before the agent');
      expect(upload?.with.path).toBe('/tmp/gh-aw/agent/cao-farm/');
      expect(upload?.with['retention-days']).toBe("${{ vars.GH_AW_DEFAULT_ARTIFACT_RETENTION_DAYS || '1' }}");
      expect(upload?.if, 'upload must run only after a verified collect/restore').toContain("steps.squad-evidence-collect.outputs.enabled == 'true'");
      expect(upload?.with.overwrite).toBe(false);
      const publication = steps.find((step: any) =>
        step.name === 'Reject missing, stale or tampered evidence before any successful output');
      expect(publication, 'compiled safe_outputs must contain step "Reject missing, stale or tampered evidence before any successful output"').toBeDefined();
      expect(publication?.with.script).toContain('evidence.validatePublication');
      expect(publication?.env.SQUAD_WORKFLOW_SHA).toBe('${{ github.workflow_sha }}');
      const writer = steps.find((step: any) => step.name === 'Upsert Squad research artifact');
      expect(writer?.with.script).toContain('evidence.verifyProviderBundle');
      expect(writer?.with.script).toContain('evidence.provenance(wave)');
    }

    describe('compiled live research evidence contract', () => {
      it('retains the trusted pre-agent, immutable artifact and pre-publication gates', () => {
        compiledContract(compile(readFileSync(resolve('workflows/squad.md'), 'utf8')));
      }, 120_000);

      it('fails the same gate after realistic deletion of the live publication check', () => {
        const source = readFileSync(resolve('workflows/squad.md'), 'utf8');
        const mutated = source.replace(
          /    - name: Reject missing, stale or tampered evidence before any successful output\n[\s\S]*?(?=  messages:)/,
          '',
        );
        expect(mutated).not.toBe(source);
        const lock = compile(mutated);
        expect(() => compiledContract(lock), 'deleting the publication gate must fail the compiled contract')
          .toThrow(/Reject missing, stale or tampered evidence/);
      }, 120_000);
    });

describe('evidence mutation checks', () => {
  it.each(Object.keys(context))('rejects a mismatched %s', field => {
    const { root } = bundle();
    expect(() => validateBundle(root, { ...context, [field]: 'other' }, now)).toThrow('mismatch');
  });

  describe('confirmed runtime invocation contract', () => {
    const env = {
      PATH: process.env.PATH,
      GH_AW_GITHUB_AUTH_MODE: 'app', GH_AW_GITHUB_READ_APP_ID: '123',
      GH_AW_GITHUB_READ_APP_PRIVATE_KEY: 'fixture-private-key',
      NODE_OPTIONS: '--require /untrusted/module.js',
      GH_AW_GITHUB_READ_PAT_SECRETS: '{"forbidden":"token"}',
    };

    it('supports only the six approved restoration modes and research collection', () => {
      const { root } = provider();
      for (const mode of ['research', 'triage', 'triage revise change', 'plan', 'plan revise change',
        'plan program', 'plan program revise change']) {
        expect(evidenceMode(root, { inputs: { command: mode } }, 'workflow_dispatch')).toBeTruthy();
      }
      for (const mode of ['plan implementation', 'plan validate', 'plan accept', 'activate', 'cast', 'status']) {
        expect(evidenceMode(root, { inputs: { command: mode } }, 'workflow_dispatch')).toBeNull();
      }
    });

    it('hashes raw policy bytes and exactly serialized current scope', () => {
      const { root } = provider();
      const scope = { repositories: ['octo/backend'] };
      const raw = JSON.stringify({ 'control-plane': { scope } }, null, 2) + '\n';
      put(root, POLICY, raw);
      expect(policyDigests(root)).toEqual({
        policy_sha256: digest(raw), enrollment_sha256: digest(JSON.stringify(scope)),
      });
    });

    it('rejects unsupported authentication before executing trusted code', () => {
      const { root } = provider('import {writeFileSync} from "node:fs"; writeFileSync("executed", "bad");');
      expect(() => invokeProvider(root, context, { collect: true, env: { ...env, GH_AW_GITHUB_AUTH_MODE: 'pat' } }))
        .toThrow('unsupported in v1');
      expect(existsSync(join(root, 'executed'))).toBe(false);
    });

    it('uses no collect arguments, trusted cwd, explicit workflow revision and App-only env', () => {
      const { root } = provider(`
        import assert from 'node:assert/strict';
        import {writeFileSync} from 'node:fs';
        assert.equal(process.argv.length, 2);
        assert.equal(process.env.SQUAD_WORKFLOW_SHA, '${context.workflow_revision}');
        assert.equal(process.env.GH_AW_GITHUB_AUTH_MODE, 'app');
        assert.equal(process.env.GH_AW_GITHUB_READ_APP_ID, '123');
        assert.equal(process.env.GH_AW_GITHUB_READ_PAT_SECRETS, undefined);
        assert.equal(process.env.NODE_OPTIONS, undefined);
        assert.equal(process.env.GITHUB_SHA, undefined);
        writeFileSync('executed', 'collect');
      `);
      invokeProvider(root, context, { collect: true, env });
      expect(readFileSync(join(root, 'executed'), 'utf8')).toBe('collect');
    });

    it('validates referenced old-run identity using current enrollment with no credentials', () => {
      const { root } = provider(`
        import assert from 'node:assert/strict';
        import {writeFileSync} from 'node:fs';
        assert.deepEqual(process.argv.slice(2), ['--validate-bundle']);
        assert.equal(process.env.GITHUB_RUN_ID, '200', 'provider must receive the current run, not the referenced wave run');
        assert.equal(process.env.GITHUB_RUN_ATTEMPT, '3', 'consumer attempt must not replace the producer binding');
        assert.equal(process.env.GH_AW_GITHUB_READ_APP_PRIVATE_KEY, undefined);
        assert.equal(process.env.GH_AW_GITHUB_AUTH_MODE, undefined);
        assert.ok(process.env.SQUAD_EVIDENCE_BUNDLE);
        writeFileSync('executed', 'validate');
      `);
      put(root, POLICY, JSON.stringify({ 'control-plane': { scope: { repositories: ['octo/backend'] } } }));
      const { root: directory, manifest } = bundle();
      put(directory, 'manifest.json', JSON.stringify({ ...manifest, ...policyDigests(root) }));
      const verified = validateBundle(directory, context, now);
      const currentEnv = {
        PATH: process.env.PATH, GITHUB_REPOSITORY: context.control_repository,
        SQUAD_WORKFLOW_SHA: 'e'.repeat(40), SQUAD_ISSUE_NUMBER: String(context.issue_number),
        GITHUB_RUN_ID: '200', GITHUB_RUN_ATTEMPT: '3',
      };
      expect(verifyProviderBundle(root, directory, provenance(verified), now, currentEnv)).toEqual(verified);
      expect(readFileSync(join(root, 'executed'), 'utf8')).toBe('validate');
      put(root, POLICY, JSON.stringify({ 'control-plane': { scope: { repositories: ['octo/other'] } } }));
      expect(() => verifyProviderBundle(root, directory, provenance(verified), now, currentEnv)).toThrow('changed');
    });

    it('does no provider work for vanilla commands, even without runtime context', async () => {
      const root = scratch();
      const core = { setOutput: () => {} };
      await expect(prepareEvidence({
        root, github: {}, payload: { inputs: { command: 'research' } }, core,
        env: { SQUAD_EVENT_NAME: 'workflow_dispatch' },
      })).resolves.toBeUndefined();
      await expect(validatePublication({
        root, directory: '/missing/unused', github: {}, payload: { inputs: { command: 'research' } },
        env: { SQUAD_EVENT_NAME: 'workflow_dispatch' },
      })).resolves.toBeNull();
    });
  });

  it.each([
    ['stale', -MAX_AGE_MS - 1, 1],
    ['future', 1, MAX_AGE_MS],
    ['expired', -1000, -1],
    ['overlong', -1000, MAX_AGE_MS],
  ])('rejects %s evidence', (_label, captureOffset, expiryOffset) => {
    const { root, manifest } = bundle();
    put(root, 'manifest.json', JSON.stringify({
      ...manifest, captured_at: new Date(now + captureOffset).toISOString(),
      expires_at: new Date(now + expiryOffset).toISOString(),
    }));
    expect(() => validateBundle(root, context, now)).toThrow();
  });

  it('rejects tampering, missing files, unknown files and traversal', () => {
    const { root, manifest } = bundle();
    put(root, 'farm/octo/backend/SNAPSHOT.md', 'tampered\n');
    expect(() => validateBundle(root, context, now)).toThrow('hash mismatch');
    put(root, 'farm/octo/backend/SNAPSHOT.md', 'source\n');
    rmSync(join(root, 'farm/evidence.json'));
    expect(() => validateBundle(root, context, now)).toThrow('missing');
    put(root, 'farm/evidence.json', '{}\n');
    put(root, 'farm/extra', 'unlisted');
    expect(() => validateBundle(root, context, now)).toThrow('unlisted');
    put(root, 'manifest.json', JSON.stringify({
      ...manifest, documents: { ...manifest.documents, 'farm/../../escape': 'a'.repeat(64) },
    }));
    expect(() => validateBundle(root, context, now)).toThrow('unsafe');
  });

  it('rejects symlink documents and changed current enrollment', () => {
    const { root } = bundle();
    expect(() => validateBundle(root, { ...context, enrollment_sha256: 'e'.repeat(64) }, now))
      .toThrow('changed');
    rmSync(join(root, 'farm/octo/backend/SNAPSHOT.md'));
    symlinkSync(join(root, 'farm/evidence.json'), join(root, 'farm/octo/backend/SNAPSHOT.md'));
    expect(() => validateBundle(root, context, now)).toThrow('symbolic links');
  });

  it('accepts the agreed CAO destination and rejects any other repository destination', () => {
    const { root, manifest } = bundle();
    expect(validateBundle(root, context, now).manifest.repositories[0].destination,
      'farm/{owner}/{repo}/SNAPSHOT.md is the agreed CAO collector destination').toBe('farm/octo/backend/SNAPSHOT.md');
    for (const destination of ['farm/octo/backend', 'farm/octo/other/SNAPSHOT.md']) {
      put(root, 'manifest.json', JSON.stringify({
        ...manifest, repositories: [{ ...manifest.repositories[0], destination }],
      }));
      expect(() => validateBundle(root, context, now), `destination ${destination} must be rejected`)
        .toThrow('invalid repository destination');
    }
  });

  it.each([
    ['control_repository', 'octo/elsewhere'],
    ['workflow_revision', 'f'.repeat(40)],
    ['issue_number', 43],
    ['run_id', '101'],
    ['run_attempt', '2'],
  ])('rejects a bundle whose %s differs from the current run', (field, value) => {
    const { root } = bundle();
    expect(() => validateBundle(root, { ...context, [field]: value }, now), `${field}=${value} must be rejected`)
      .toThrow(`bundle ${field} mismatch`);
  });
});
