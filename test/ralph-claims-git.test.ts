/**
 * GitRefClaimProvider (ADR 002) — runs the shared WorkClaimProvider contract
 * against a REAL temporary bare repository, with one local repository per
 * executor identity (so contenders never share an object store or ref lock),
 * plus Git-specific checks and a mutation control proving the suite catches a
 * provider that pushes with plain `--force` instead of `--force-with-lease`.
 *
 * Spike notes (`git-ref-provider`, local only — no real remote was contacted):
 * - Verified here: CAS semantics of `--force-with-lease` against a local bare
 *   repo for create / fast-forward renew / takeover / delete, concurrent
 *   pushes from separate repositories, and the fallback namespace
 *   `refs/heads/squad-claims/`.
 * - NOT verified: whether GitHub repository rulesets (or push protection /
 *   "restrict pushes that create matching refs") accept pushes to the custom
 *   `refs/squad/claims/*` namespace, and whether Azure DevOps branch policies or
 *   Git namespace permissions accept them. GitHub has historically accepted
 *   arbitrary `refs/*` namespaces but hides them from the UI; ADO permission
 *   evaluation for non-`refs/heads|tags` refs is undocumented. Also unverified:
 *   server-side CAS atomicity under smart-HTTP load on those hosts (expected
 *   to match receive-pack's locked ref transaction), and whether workflow
 *   triggers fire on `refs/heads/squad-claims/**` when the fallback is used.
 * - The fallback namespace is supported through `refPrefix`
 *   (`FALLBACK_CLAIM_REF_PREFIX`); the provider never switches namespaces on
 *   its own, because executors on different namespaces would not exclude each
 *   other.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CLAIM_COMMITTER_EMAIL,
  DEFAULT_GIT_MAX_OUTPUT_BYTES,
  GitClaimUnavailableError,
  GitRefClaimProvider,
  FALLBACK_CLAIM_REF_PREFIX,
  DEFAULT_CLAIM_REF_PREFIX,
  MAX_CLAIM_COMMIT_BYTES,
  claimRefForKey,
  createExecFileGitTransport,
  decodeClaimRecord,
  encodeClaimRecord,
  type GitTransport,
} from '@bradygaster/squad-sdk/ralph/claims-git';
import type { ClaimRecord, ExecutorIdentity, WorkClaimProvider, WorkKey } from '@bradygaster/squad-sdk/ralph/claims';
import { describeClaimProviderContract, manualClock, testIdentity } from './helpers/claim-provider-contract.js';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const TIMEOUT = 60_000;
const ttlMs = 60_000;

function git(cwd: string, args: string[], input?: string): string {
  return execFileSync('git', args, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Run git against the harness's bare remote (explicit --git-dir; safe.bareRepository may be 'explicit'). */
function bareGit(h: { root: string; bare: string }, args: string[], input?: string): string {
  return git(h.root, ['--git-dir', h.bare, ...args], input);
}

/** Transport that replaces every `--force-with-lease=…` with plain `--force` (the bug under test). */
function forcePushTransport(inner: GitTransport = createExecFileGitTransport()): GitTransport {
  return {
    run: (args, opts) => inner.run(args.map((a) => (a.startsWith('--force-with-lease') ? '--force' : a)), opts),
  };
}

interface GitHarness {
  root: string;
  bare: string;
  clock: ReturnType<typeof manualClock>;
  skewMarginMs: number;
  warnings: string[];
  provider(identity: ExecutorIdentity, extra?: Partial<ConstructorParameters<typeof GitRefClaimProvider>[0]>): GitRefClaimProvider;
  advance(ms: number): void;
  plant(key: WorkKey, record: Omit<ClaimRecord, 'key' | 'handle'>): void;
  dispose(): Promise<void>;
}

// Spawning git is slow on Windows, so harnesses copy pre-initialized repositories.
let templateRoot: string | undefined;
function templates(): { bare: string; executor: string } {
  if (!templateRoot) {
    templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-claims-git-template-'));
    git(templateRoot, ['init', '--quiet', '--bare', '--template=', 'remote.git']);
    git(templateRoot, ['init', '--quiet', '--template=', 'executor']);
  }
  return { bare: path.join(templateRoot, 'remote.git'), executor: path.join(templateRoot, 'executor') };
}
afterAll(async () => {
  if (templateRoot) await fs.promises.rm(templateRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function createGitHarness(opts: { skewMarginMs?: number; transport?: GitTransport } = {}): GitHarness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-claims-git-'));
  const bare = path.join(root, 'remote.git');
  const tpl = templates();
  fs.cpSync(tpl.bare, bare, { recursive: true });
  const clock = manualClock();
  const skewMarginMs = opts.skewMarginMs ?? 0;
  const warnings: string[] = [];
  let n = 0;
  return {
    root,
    bare,
    clock,
    skewMarginMs,
    warnings,
    provider(identity, extra = {}) {
      const dir = path.join(root, `executor-${n++}`);
      fs.cpSync(tpl.executor, dir, { recursive: true });
      fs.appendFileSync(
        path.join(dir, '.git', 'config'),
        `[remote "origin"]\n\turl = ${bare.replace(/\\/g, '/')}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
      );
      return new GitRefClaimProvider({
        identity,
        now: clock.now,
        cwd: dir,
        skewMarginMs,
        transport: opts.transport,
        onWarning: (m) => warnings.push(m),
        ...extra,
      });
    },
    advance: clock.advance,
    plant(key, record) {
      plantCommit({ root, bare }, claimRefForKey(key), encodeClaimRecord({ ...record, key }));
    },
    dispose: () => fs.promises.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }),
  };
}

/** Write a commit straight into the bare remote and point `ref` at it (a forged or buggy holder). */
function plantCommit(
  h: { root: string; bare: string },
  ref: string,
  message: string,
  opts: { tree?: string; parents?: string[] } = {},
): string {
  const tree = opts.tree ?? bareGit(h, ['mktree'], '');
  const args = ['-c', 'user.name=x', '-c', 'user.email=x@x', 'commit-tree', tree];
  for (const p of opts.parents ?? []) args.push('-p', p);
  args.push('-F', '-');
  const sha = bareGit(h, args, message);
  bareGit(h, ['update-ref', ref, sha]);
  return sha;
}

let keySeq = 0;
function freshKey(): WorkKey {
  keySeq += 1;
  return { platform: 'github', repo: 'git-claims/test', id: `k${keySeq}` };
}

function acquired(result: Awaited<ReturnType<WorkClaimProvider['acquire']>>): ClaimRecord {
  if (result.status !== 'acquired') throw new Error(`expected acquired, got ${JSON.stringify(result)}`);
  return result.claim;
}

describe.skipIf(!hasGit)('GitRefClaimProvider', () => {
  describeClaimProviderContract('GitRefClaimProvider (local bare remote)', () => {
    const h = createGitHarness({ skewMarginMs: 30_000 });
    return {
      provider: (id) => h.provider(id),
      advance: h.advance,
      now: h.clock.now,
      plant: (key, record) => h.plant(key, record),
      skewMarginMs: h.skewMarginMs,
      dispose: h.dispose,
    };
  }, { ttlMs, contenders: 6, timeoutMs: TIMEOUT });

  describe('git specifics', () => {
    let h: GitHarness;
    beforeEach(() => { h = createGitHarness(); });
    afterEach(async () => { await h.dispose(); });

    it('declares distributed guarantees', () => {
      const p = h.provider(testIdentity(1));
      expect(p.name).toBe('git-ref');
      expect(p.guarantees).toEqual({ exclusion: 'distributed', leases: true, fencing: true });
    });

    it('separate repositories racing acquire on one key: exactly one acquired', async () => {
      const key = freshKey();
      const providers = Array.from({ length: 5 }, (_, i) => h.provider(testIdentity(10 + i)));
      const results = await Promise.all(providers.map((p) => p.acquire(key, { ttlMs })));
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 'acquired'), JSON.stringify(results)).toHaveLength(1);
      expect(statuses.filter((s) => s === 'held')).toHaveLength(4);
    }, TIMEOUT);

    it('writes the record as an empty-tree root commit at refs/squad/claims/<sha1(key)>', async () => {
      const key = { platform: 'GitHub', repo: 'Bradygaster/Squad', id: '123' };
      const claim = acquired(await h.provider(testIdentity(1)).acquire(key, { ttlMs }));
      const hex = createHash('sha1').update('github:bradygaster/squad#123').digest('hex');
      const ref = `${DEFAULT_CLAIM_REF_PREFIX}${hex}`;
      expect(claimRefForKey(key)).toBe(ref);
      expect(bareGit(h, ['rev-parse', ref])).toBe(claim.handle);
      expect(bareGit(h, ['ls-tree', claim.handle])).toBe('');
      expect(bareGit(h, ['rev-list', '--parents', '-n', '1', claim.handle])).toBe(claim.handle);
      const body = JSON.parse(bareGit(h, ['log', '-1', '--format=%B', claim.handle]));
      expect(body).toMatchObject({
        schema: 'squad.claim/v1',
        key: { platform: 'github', repo: 'bradygaster/squad', id: '123' },
        holder: testIdentity(1),
        epoch: 1,
      });
    }, TIMEOUT);

    it('renew and takeover are fast-forward children; old holder is fenced', async () => {
      const a = h.provider(testIdentity(1));
      const b = h.provider(testIdentity(2));
      const key = freshKey();
      const first = acquired(await a.acquire(key, { ttlMs }));
      const renewed = await a.renew(first, { ttlMs });
      if (renewed.status !== 'renewed') throw new Error(renewed.status);
      expect(bareGit(h, ['rev-parse', `${renewed.claim.handle}^`])).toBe(first.handle);

      h.advance(ttlMs + 1);
      const taken = acquired(await b.acquire(key, { ttlMs }));
      expect(taken.epoch).toBe(renewed.claim.epoch + 1);
      expect(bareGit(h, ['rev-parse', `${taken.handle}^`])).toBe(renewed.claim.handle);

      const stale = await a.renew(renewed.claim, { ttlMs });
      expect(stale).toEqual({ status: 'fenced', by: taken });
      expect(await a.release(renewed.claim, 'abandoned')).toEqual({ status: 'fenced' });
      expect(bareGit(h, ['rev-parse', a.refFor(key)])).toBe(taken.handle);
    }, TIMEOUT);

    it('release deletes the ref; re-acquire starts a new root claim at epoch 1', async () => {
      const a = h.provider(testIdentity(1));
      const b = h.provider(testIdentity(2));
      const key = freshKey();
      const first = acquired(await a.acquire(key, { ttlMs }));
      expect(await a.release(first, 'completed')).toEqual({ status: 'released' });
      expect(bareGit(h, ['for-each-ref', a.refFor(key)])).toBe('');
      const again = acquired(await b.acquire(key, { ttlMs }));
      expect(again.epoch).toBe(1);
      expect(again.handle).not.toBe(first.handle);
      expect(await b.inspect(key)).toEqual(again);
    }, TIMEOUT);

    it('a provider in another repository can renew a claim it did not write locally', async () => {
      const a = h.provider(testIdentity(1));
      const sameHolderElsewhere = h.provider(testIdentity(1));
      const claim = acquired(await a.acquire(freshKey(), { ttlMs }));
      const renewed = await sameHolderElsewhere.renew(claim, { ttlMs });
      expect(renewed.status).toBe('renewed');
    }, TIMEOUT);

    it('never touches HEAD, the index, or the working tree', async () => {
      const p = h.provider(testIdentity(1));
      const cwd = path.join(h.root, 'executor-0');
      fs.writeFileSync(path.join(cwd, 'file.txt'), 'hello\n');
      git(cwd, ['add', 'file.txt']);
      git(cwd, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-gpg-sign', '-m', 'init']);
      fs.writeFileSync(path.join(cwd, 'dirty.txt'), 'x\n');
      const head = git(cwd, ['rev-parse', 'HEAD']);
      const status = git(cwd, ['status', '--porcelain']);
      const key = freshKey();
      const claim = acquired(await p.acquire(key, { ttlMs }));
      await p.renew(claim, { ttlMs });
      expect(git(cwd, ['rev-parse', 'HEAD'])).toBe(head);
      expect(git(cwd, ['status', '--porcelain'])).toBe(status);
      expect(git(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads'])).not.toContain('squad');
    }, TIMEOUT);

    it('supports the fallback namespace refs/heads/squad-claims/', async () => {
      const a = h.provider(testIdentity(1), { refPrefix: FALLBACK_CLAIM_REF_PREFIX });
      const b = h.provider(testIdentity(2), { refPrefix: FALLBACK_CLAIM_REF_PREFIX });
      const key = freshKey();
      const claim = acquired(await a.acquire(key, { ttlMs }));
      expect(a.refFor(key).startsWith('refs/heads/squad-claims/')).toBe(true);
      expect(bareGit(h, ['rev-parse', a.refFor(key)])).toBe(claim.handle);
      expect((await b.acquire(key, { ttlMs })).status).toBe('held');
      expect((await a.release(claim, 'completed')).status).toBe('released');
    }, TIMEOUT);

    it('a corrupt record is unavailable to acquire and inspect, and fences renew', async () => {
      const a = h.provider(testIdentity(1));
      const b = h.provider(testIdentity(2));
      const key = freshKey();
      const claim = acquired(await a.acquire(key, { ttlMs }));
      const tree = bareGit(h, ['mktree'], '');
      const junk = bareGit(h, ['-c', 'user.name=x', '-c', 'user.email=x@x', 'commit-tree', tree, '-m', '{"not":"a claim"']);
      bareGit(h, ['update-ref', a.refFor(key), junk]);

      const result = await b.acquire(key, { ttlMs });
      expect(result.status).toBe('unavailable');
      if (result.status === 'unavailable') expect(result.reason).toMatch(/corrupt claim record/);
      await expect(b.inspect(key)).rejects.toBeInstanceOf(GitClaimUnavailableError);
      expect(await a.renew(claim, { ttlMs })).toEqual({ status: 'fenced' });
      expect(bareGit(h, ['rev-parse', a.refFor(key)])).toBe(junk);
    }, TIMEOUT);

    it('a well-formed record for a different key at this ref is treated as corrupt', async () => {
      const a = h.provider(testIdentity(1));
      const key = freshKey();
      const other = acquired(await a.acquire(freshKey(), { ttlMs }));
      bareGit(h, ['update-ref', a.refFor(key), other.handle]);
      const result = await h.provider(testIdentity(2)).acquire(key, { ttlMs });
      expect(result.status).toBe('unavailable');
    }, TIMEOUT);

    it('an unreachable remote: acquire is unavailable (no throw); renew/release/inspect throw', async () => {
      const a = h.provider(testIdentity(1));
      const claim = acquired(await a.acquire(freshKey(), { ttlMs }));
      const broken = h.provider(testIdentity(1), { remote: path.join(h.root, 'missing.git') });
      const result = await broken.acquire(freshKey(), { ttlMs });
      expect(result.status).toBe('unavailable');
      await expect(broken.renew(claim, { ttlMs })).rejects.toBeInstanceOf(GitClaimUnavailableError);
      await expect(broken.release(claim, 'abandoned')).rejects.toBeInstanceOf(GitClaimUnavailableError);
      await expect(broken.inspect(claim.key)).rejects.toBeInstanceOf(GitClaimUnavailableError);
    }, TIMEOUT);

    it('a transport that cannot start git yields unavailable', async () => {
      const p = new GitRefClaimProvider({
        identity: testIdentity(1),
        cwd: h.root,
        transport: createExecFileGitTransport({ gitPath: path.join(h.root, 'no-such-git') }),
      });
      expect((await p.acquire(freshKey(), { ttlMs })).status).toBe('unavailable');
    });

    it('passes argument vectors with "--" before the remote and leases on every push', async () => {
      const calls: string[][] = [];
      const inner = createExecFileGitTransport();
      const recording: GitTransport = { run: (args, o) => { calls.push([...args]); return inner.run(args, o); } };
      const a = h.provider(testIdentity(1), { transport: recording });
      const claim = acquired(await a.acquire(freshKey(), { ttlMs }));
      const renewed = await a.renew(claim, { ttlMs });
      if (renewed.status === 'renewed') await a.release(renewed.claim, 'completed');
      const pushes = calls.filter((c) => c.includes('push'));
      expect(pushes).toHaveLength(3);
      for (const push of pushes) {
        expect(push.some((x) => /^--force-with-lease=refs\/squad\/claims\/[0-9a-f]{40}:[0-9a-f]*$/.test(x))).toBe(true);
        expect(push).not.toContain('--force');
        expect(push.indexOf('--')).toBe(push.length - 3);
      }
    }, TIMEOUT);

    it('implausible record (expiresAt 1e308): taken over by CAS on the observed sha, with a WARN naming the ref', async () => {
      const b = h.provider(testIdentity(2));
      const key = freshKey();
      const ref = b.refFor(key);
      h.plant(key, { holder: testIdentity(9), epoch: 1, acquiredAt: h.clock.now(), expiresAt: 1e308 });
      const planted = bareGit(h, ['rev-parse', ref]);

      await expect(b.inspect(key)).rejects.toThrow(/implausible claim record/);
      const taken = acquired(await b.acquire(key, { ttlMs }));
      expect(taken.epoch).toBe(1);
      expect(bareGit(h, ['rev-parse', ref])).toBe(taken.handle);
      expect(bareGit(h, ['rev-parse', `${taken.handle}^`])).toBe(planted);
      expect(h.warnings.some((w) => w.includes(ref) && w.includes(planted) && /implausible/.test(w)), h.warnings.join('\n')).toBe(true);
    }, TIMEOUT);

    it('a claim commit whose tree is not the empty tree is implausible and taken over', async () => {
      const key = freshKey();
      const record = encodeClaimRecord({ key, holder: testIdentity(9), epoch: 1, acquiredAt: h.clock.now(), expiresAt: h.clock.now() + ttlMs });
      const blob = bareGit(h, ['hash-object', '-w', '--stdin'], 'payload');
      const tree = bareGit(h, ['mktree'], `100644 blob ${blob}\tpayload.txt\n`);
      plantCommit(h, claimRefForKey(key), record, { tree });
      const taken = acquired(await h.provider(testIdentity(2)).acquire(key, { ttlMs }));
      expect(taken.holder).toEqual(testIdentity(2));
      expect(h.warnings.join('\n')).toMatch(/not the empty tree/);
    }, TIMEOUT);

    it('a claim commit with more than one parent is implausible and taken over', async () => {
      const key = freshKey();
      const t = h.clock.now();
      const record = encodeClaimRecord({ key, holder: testIdentity(9), epoch: 2, acquiredAt: t, expiresAt: t + ttlMs });
      const p1 = plantCommit(h, 'refs/scratch/p1', 'one');
      const p2 = plantCommit(h, 'refs/scratch/p2', 'two');
      plantCommit(h, claimRefForKey(key), record, { parents: [p1, p2] });
      const taken = acquired(await h.provider(testIdentity(2)).acquire(key, { ttlMs }));
      expect(taken.holder).toEqual(testIdentity(2));
      expect(h.warnings.join('\n')).toMatch(/2 parents/);
    }, TIMEOUT);

    it('an oversized claim commit (> 64 KiB) is never fully read: implausible and taken over', async () => {
      const key = freshKey();
      const t = h.clock.now();
      // Valid, live record padded past the cap: only the size makes it implausible.
      const record = encodeClaimRecord({ key, holder: testIdentity(9), epoch: 1, acquiredAt: t, expiresAt: t + ttlMs });
      plantCommit(h, claimRefForKey(key), record + ' '.repeat(MAX_CLAIM_COMMIT_BYTES + 1));
      const result = await h.provider(testIdentity(2)).acquire(key, { ttlMs });
      expect(result.status, JSON.stringify(result)).toBe('acquired');
      expect(h.warnings.join('\n')).toMatch(/exceeds 65536 bytes/);
    }, TIMEOUT);

    it('the default transport caps stdout, kills git, and reports outputLimitExceeded instead of throwing', async () => {
      const transport = createExecFileGitTransport();
      const capped = await transport.run(['--version'], { cwd: h.root, maxOutputBytes: 4 });
      expect(capped).toMatchObject({ exitCode: -1, stdout: '', outputLimitExceeded: true });
      expect(capped.stderr).toMatch(/exceeded 4 bytes/);
      const full = await transport.run(['--version'], { cwd: h.root });
      expect(full.exitCode).toBe(0);
      expect(full.stdout).toMatch(/^git version/);
      expect(full.outputLimitExceeded).toBeUndefined();
      expect(DEFAULT_GIT_MAX_OUTPUT_BYTES).toBe(1024 * 1024);
    }, TIMEOUT);

    it('claim commits carry a fixed squad identity and a UTC date from the injected clock, never ambient git identity', async () => {
      const leaky = createExecFileGitTransport({
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Real Person',
          GIT_AUTHOR_EMAIL: 'real.person@corp.example',
          GIT_AUTHOR_DATE: '2001-01-01T00:00:00+05:30',
          GIT_COMMITTER_NAME: 'Real Person',
          GIT_COMMITTER_EMAIL: 'real.person@corp.example',
          GIT_COMMITTER_DATE: '2001-01-01T00:00:00+05:30',
          TZ: 'Asia/Kolkata',
        },
      });
      const p = h.provider(testIdentity(1), { transport: leaky });
      const claim = acquired(await p.acquire(freshKey(), { ttlMs }));
      const secs = Math.floor(h.clock.now() / 1000);
      expect(bareGit(h, ['log', '-1', '--date=raw', '--format=%an|%ae|%ad|%cn|%ce|%cd', claim.handle]))
        .toBe(`squad-claims|squad-claims@invalid|${secs} +0000|squad-claims|squad-claims@invalid|${secs} +0000`);
      expect(CLAIM_COMMITTER_EMAIL).toBe('squad-claims@invalid');
    }, TIMEOUT);

    it('rejects option-like or malformed remotes and ref prefixes', () => {
      for (const remote of ['--upload-pack=evil', '-x', '', 'origin\nmain']) {
        expect(() => new GitRefClaimProvider({ identity: testIdentity(1), remote })).toThrow(TypeError);
      }
      for (const refPrefix of ['-refs/x/', 'refs/x', 'heads/x/', 'refs/../x/', 'refs/a b/', 'refs/x:y/', 'refs/.x/', 'refs/x.lock/']) {
        expect(() => new GitRefClaimProvider({ identity: testIdentity(1), refPrefix })).toThrow(TypeError);
      }
      expect(() => new GitRefClaimProvider({ identity: testIdentity(1), refPrefix: 'refs/squad-claims-cache/' })).toThrow(TypeError);
      expect(() => new GitRefClaimProvider({ identity: testIdentity(1), skewMarginMs: -1 })).toThrow(RangeError);
      expect(() => new GitRefClaimProvider({ identity: testIdentity(1), skewMarginMs: 60 * 60 * 1000 + 1 })).toThrow(RangeError);
    });
  });

  describe('mutation control: plain --force instead of --force-with-lease', () => {
    let h: GitHarness;
    beforeEach(() => { h = createGitHarness({ transport: forcePushTransport() }); });
    afterEach(async () => { await h.dispose(); });

    it('the broken transport lets more than one contender acquire the same key', async () => {
      const key = freshKey();
      const providers = Array.from({ length: 4 }, (_, i) => h.provider(testIdentity(300 + i)));
      // Interleaving where each contender pushes after the previous push landed:
      // the correct provider returns 'held' for all but the first.
      const results = [];
      for (const p of providers) results.push(await p.acquire(key, { ttlMs }));
      const winners = results.filter((r) => r.status === 'acquired');
      expect(winners.length, JSON.stringify(results.map((r) => r.status))).toBeGreaterThan(1);
    }, TIMEOUT);

    it('the same interleaving with the real transport yields exactly one winner', async () => {
      const real = createGitHarness();
      try {
        const key = freshKey();
        const providers = Array.from({ length: 4 }, (_, i) => real.provider(testIdentity(400 + i)));
        const results = [];
        for (const p of providers) results.push(await p.acquire(key, { ttlMs }));
        expect(results.filter((r) => r.status === 'acquired')).toHaveLength(1);
      } finally {
        await real.dispose();
      }
    }, TIMEOUT);
  });
});

describe('claim record encoding', () => {
  const record: Omit<ClaimRecord, 'handle'> = {
    key: { platform: 'GitHub', repo: 'Org/Repo', id: '7' },
    holder: { machineId: 'm', instanceId: 'i', actor: 'octocat' },
    epoch: 3,
    acquiredAt: 1,
    expiresAt: 2,
  };
  const handle = 'a'.repeat(40);

  it('round-trips with a normalized key', () => {
    expect(encodeClaimRecord(record)).not.toBe(encodeClaimRecord(record));
    expect(decodeClaimRecord(encodeClaimRecord(record), handle)).toEqual({
      ...record,
      key: { platform: 'github', repo: 'org/repo', id: '7' },
      handle,
    });
  });

  it('returns null for malformed records instead of throwing', () => {
    const good = JSON.parse(encodeClaimRecord(record));
    const bad: unknown[] = [
      '', 'not json', 'null', '[]', '42',
      { ...good, schema: 'squad.claim/v2' },
      { ...good, key: { platform: 'github', repo: 'x' } },
      { ...good, key: { platform: 'a:b', repo: 'x', id: '1' } },
      { ...good, holder: { machineId: 'm' } },
      { ...good, holder: { ...good.holder, actor: 5 } },
      { ...good, epoch: 0 },
      { ...good, epoch: 1.5 },
      { ...good, expiresAt: 'soon' },
      { ...good, acquiredAt: null },
    ];
    for (const input of bad) {
      const text = typeof input === 'string' ? input : JSON.stringify(input);
      expect(decodeClaimRecord(text, handle), text).toBeNull();
    }
  });
});
