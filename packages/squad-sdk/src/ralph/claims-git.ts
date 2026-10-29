/**
 * Git-ref work claims — `GitRefClaimProvider` (ADR 002, "Primitive: Git ref
 * compare-and-swap").
 *
 * Each claim is one ref on a shared remote:
 *   `<refPrefix><sha1-hex(workKeyToString(key))>` (default prefix
 *   `refs/squad/claims/`, fallback `refs/heads/squad-claims/`).
 * The ref points at a commit whose tree is the empty tree and whose message is
 * the JSON claim record. The commit SHA is the claim `handle`. Every state
 * change is a `git push --force-with-lease=<ref>:<expected>`, so the remote's
 * atomic ref update decides every race; the local clock only decides when a
 * takeover may be attempted.
 *
 * No working tree or index is touched: commits are built with `git mktree` and
 * `git commit-tree`, and remote claims are fetched into a private local
 * namespace (`refs/squad-claims-cache/` by default).
 *
 * All git invocations go through an injectable {@link GitTransport}. The
 * default transport spawns `git` directly with an argument array — never a
 * shell — so no claim data is ever interpreted by a shell.
 */

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  DEFAULT_CLAIM_SKEW_MARGIN_MS,
  MAX_CLAIM_SKEW_MARGIN_MS,
  assertClaimTtl,
  claimRecordImplausibility,
  normalizeWorkKey,
  resolveExecutorIdentity,
  workKeyToString,
  type AcquireResult,
  type ClaimOptions,
  type ClaimProviderGuarantees,
  type ClaimProviderOptions,
  type ClaimRecord,
  type ExecutorIdentity,
  type FinishOutcome,
  type ReleaseResult,
  type RenewResult,
  type WorkClaimProvider,
  type WorkKey,
} from './claims.js';

// --- Constants ---

/** Default claim ref namespace (ADR 002). */
export const DEFAULT_CLAIM_REF_PREFIX = 'refs/squad/claims/';

/**
 * Fallback namespace for hosts or rulesets that reject `refs/squad/*`.
 * Repositories using it must exclude `squad-claims/**` from workflow triggers
 * and branch rules. Every executor contending for the same work must use the
 * same prefix, so the provider never switches namespaces on its own.
 */
export const FALLBACK_CLAIM_REF_PREFIX = 'refs/heads/squad-claims/';

/** Default private local namespace that remote claim commits are fetched into. */
export const DEFAULT_CLAIM_CACHE_REF_PREFIX = 'refs/squad-claims-cache/';

/** `schema` field of the JSON claim record stored in the commit message. */
export const CLAIM_RECORD_SCHEMA = 'squad.claim/v1';

/**
 * Fixed author and committer of every claim commit, so no local git identity,
 * `GIT_AUTHOR_*` / `GIT_COMMITTER_*` value, or time zone leaks into the shared remote.
 */
export const CLAIM_COMMITTER_NAME = 'squad-claims';
export const CLAIM_COMMITTER_EMAIL = 'squad-claims@invalid';
const MAX_ATTEMPTS = 3;

/** Default cap on a git command's captured stdout: 1 MiB. */
export const DEFAULT_GIT_MAX_OUTPUT_BYTES = 1024 * 1024;

/** Largest claim commit (headers plus message) a provider reads: 64 KiB. Larger commits are implausible. */
export const MAX_CLAIM_COMMIT_BYTES = 64 * 1024;

const MAX_STDERR_BYTES = 64 * 1024;

// --- Transport ---

export interface GitRunOptions {
  /** Working directory (the local repository). */
  cwd: string;
  /** Written to the child's stdin, then stdin is closed. */
  input?: string;
  /** Extra environment variables, layered over the transport's base environment. */
  env?: Record<string, string>;
  /**
   * Kill git and report `outputLimitExceeded` once stdout exceeds this many
   * bytes. Default: the transport's limit ({@link DEFAULT_GIT_MAX_OUTPUT_BYTES}).
   */
  maxOutputBytes?: number;
}

export interface GitRunResult {
  /** Process exit code; `-1` when git could not be started or was killed. */
  exitCode: number;
  stdout: string;
  stderr: string;
  /** True when git was killed because its stdout exceeded the output limit; `stdout` is then empty. */
  outputLimitExceeded?: boolean;
}

/**
 * Runs one git command. Implementations must pass `args` as an argument
 * vector (no shell) and must resolve — not reject — on non-zero exit.
 */
export interface GitTransport {
  run(args: readonly string[], options: GitRunOptions): Promise<GitRunResult>;
}

export interface ExecFileGitTransportOptions {
  /** git executable; default `git` from `PATH`. */
  gitPath?: string;
  /** Kill a git process after this many ms. Default 60 000. */
  timeoutMs?: number;
  /** Base environment; default `process.env`. `GIT_TERMINAL_PROMPT=0` is always set. */
  env?: NodeJS.ProcessEnv;
  /** Default stdout cap per command. Default {@link DEFAULT_GIT_MAX_OUTPUT_BYTES}. */
  maxOutputBytes?: number;
}

/**
 * Default transport: spawns `git` with an argument array (no shell), disables
 * interactive credential prompts, caps captured output (claim refs are
 * untrusted remote content), and never rejects.
 */
export function createExecFileGitTransport(opts: ExecFileGitTransportOptions = {}): GitTransport {
  const gitPath = opts.gitPath ?? 'git';
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const defaultMaxOutput = opts.maxOutputBytes ?? DEFAULT_GIT_MAX_OUTPUT_BYTES;
  return {
    run(args, { cwd, input, env, maxOutputBytes }) {
      const maxOut = maxOutputBytes ?? defaultMaxOutput;
      return new Promise<GitRunResult>((resolve) => {
        let settled = false;
        const finish = (result: GitRunResult) => {
          if (!settled) {
            settled = true;
            resolve(result);
          }
        };
        let child;
        try {
          child = spawn(gitPath, [...args], {
            cwd,
            env: { ...(opts.env ?? process.env), ...(env ?? {}), GIT_TERMINAL_PROMPT: '0' },
            shell: false,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (err) {
          finish({ exitCode: -1, stdout: '', stderr: (err as Error).message });
          return;
        }
        const out: Buffer[] = [];
        const errOut: Buffer[] = [];
        let outBytes = 0;
        let errBytes = 0;
        const kill = () => {
          try { child.kill(); } catch { /* already gone */ }
        };
        const timer = setTimeout(() => {
          kill();
          finish({ exitCode: -1, stdout: '', stderr: `git ${args[0] ?? ''} timed out after ${timeoutMs} ms` });
        }, timeoutMs);
        child.stdout.on('data', (chunk: Buffer) => {
          if (settled) return;
          outBytes += chunk.length;
          if (outBytes > maxOut) {
            out.length = 0;
            clearTimeout(timer);
            kill();
            finish({
              exitCode: -1,
              stdout: '',
              stderr: `git ${args[0] ?? ''} output exceeded ${maxOut} bytes`,
              outputLimitExceeded: true,
            });
            return;
          }
          out.push(chunk);
        });
        child.stderr.on('data', (chunk: Buffer) => {
          if (errBytes >= MAX_STDERR_BYTES) return;
          errBytes += chunk.length;
          errOut.push(chunk);
        });
        child.on('error', (err) => {
          clearTimeout(timer);
          finish({ exitCode: -1, stdout: '', stderr: err.message });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (settled) return;
          try {
            finish({
              exitCode: code ?? -1,
              stdout: Buffer.concat(out).toString('utf8'),
              stderr: Buffer.concat(errOut).toString('utf8').slice(0, MAX_STDERR_BYTES),
            });
          } catch (err) {
            finish({ exitCode: -1, stdout: '', stderr: `could not decode git output: ${(err as Error).message}` });
          }
        });
        child.stdin.on('error', () => { /* reported through close/exit */ });
        child.stdin.end(input ?? '');
      });
    },
  };
}

// --- Validation ---

/**
 * Validate a ref namespace prefix: must start with `refs/`, end with `/`, and
 * satisfy `git check-ref-format` component rules. Rejects anything that could
 * be parsed as an option or refspec syntax.
 */
export function assertValidRefPrefix(prefix: string, field = 'refPrefix'): void {
  const fail = (why: string): never => {
    throw new TypeError(`${field} ${JSON.stringify(prefix)} is invalid: ${why}`);
  };
  if (typeof prefix !== 'string') fail('must be a string');
  if (!prefix.startsWith('refs/')) fail('must start with "refs/"');
  if (!prefix.endsWith('/')) fail('must end with "/"');
  if (/[\x00-\x20\x7f~^:?*[\\]/.test(prefix)) fail('contains a character git forbids in ref names');
  if (prefix.includes('..') || prefix.includes('@{') || prefix.includes('//')) fail('contains "..", "@{" or "//"');
  for (const part of prefix.slice(0, -1).split('/')) {
    if (part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock')) {
      fail(`component "${part}" is not a valid ref component`);
    }
  }
}

function assertValidRemote(remote: string): void {
  if (typeof remote !== 'string' || remote.trim() === '' || remote.startsWith('-') || /[\x00-\x1f\x7f]/.test(remote)) {
    throw new TypeError(`remote ${JSON.stringify(remote)} is invalid: must be a non-empty name or URL not starting with "-"`);
  }
}

const SHA_RE = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

function isSha(value: unknown): value is string {
  return typeof value === 'string' && SHA_RE.test(value);
}

// --- Record encoding ---

/** Claim ref for `key` under `prefix`: `<prefix><sha1-hex(workKeyToString(key))>`. */
export function claimRefForKey(key: WorkKey, prefix: string = DEFAULT_CLAIM_REF_PREFIX): string {
  assertValidRefPrefix(prefix);
  return prefix + createHash('sha1').update(workKeyToString(key), 'utf8').digest('hex');
}

/**
 * JSON commit message for `record` (the `handle` is the commit SHA, so it is not
 * stored). `nonce` makes every claim commit unique, so a holder's second write
 * at the same instant never produces the SHA of its first and mistakes it for a win.
 */
export function encodeClaimRecord(record: Omit<ClaimRecord, 'handle'>, nonce: string = randomUUID()): string {
  const holder: ExecutorIdentity = { machineId: record.holder.machineId, instanceId: record.holder.instanceId };
  if (record.holder.actor) holder.actor = record.holder.actor;
  return `${JSON.stringify({
    schema: CLAIM_RECORD_SCHEMA,
    key: normalizeWorkKey(record.key),
    holder,
    epoch: record.epoch,
    acquiredAt: record.acquiredAt,
    expiresAt: record.expiresAt,
    nonce,
  }, null, 2)}\n`;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const finiteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Parse a claim commit message. Returns `null` — never throws — when the
 * message is not a well-formed `squad.claim/v1` record.
 */
export function decodeClaimRecord(message: string, handle: string): ClaimRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(message);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.schema !== CLAIM_RECORD_SCHEMA) return null;
  const key = r.key as Record<string, unknown> | null;
  const holder = r.holder as Record<string, unknown> | null;
  if (!key || typeof key !== 'object' || !nonEmpty(key.platform) || !nonEmpty(key.repo) || !nonEmpty(key.id)) return null;
  if (!holder || typeof holder !== 'object' || !nonEmpty(holder.machineId) || !nonEmpty(holder.instanceId)) return null;
  if (holder.actor !== undefined && typeof holder.actor !== 'string') return null;
  if (!Number.isSafeInteger(r.epoch) || (r.epoch as number) < 1) return null;
  if (!finiteNumber(r.acquiredAt) || !finiteNumber(r.expiresAt)) return null;
  let normalized: WorkKey;
  try {
    normalized = normalizeWorkKey({ platform: key.platform, repo: key.repo, id: key.id });
  } catch {
    return null;
  }
  const decodedHolder: ExecutorIdentity = { machineId: holder.machineId, instanceId: holder.instanceId };
  if (nonEmpty(holder.actor)) decodedHolder.actor = holder.actor;
  return {
    key: normalized,
    handle,
    holder: decodedHolder,
    epoch: r.epoch as number,
    acquiredAt: r.acquiredAt,
    expiresAt: r.expiresAt,
  };
}

// --- Errors ---

/**
 * Thrown by `renew`, `release`, and `inspect` when the remote cannot be read
 * or written for reasons other than a compare-and-swap conflict (network,
 * authentication, host policy, or an undecodable record). `acquire` reports
 * the same conditions as `{ status: 'unavailable' }` instead.
 */
export class GitClaimUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitClaimUnavailableError';
  }
}

// --- Provider ---

export interface GitRefClaimProviderOptions extends ClaimProviderOptions {
  /** Local repository the provider runs git in. Default `process.cwd()`. */
  cwd?: string;
  /** Remote name or URL every contending executor shares. Default `origin`. */
  remote?: string;
  /** Claim ref namespace. Default {@link DEFAULT_CLAIM_REF_PREFIX}; see {@link FALLBACK_CLAIM_REF_PREFIX}. */
  refPrefix?: string;
  /** Private local namespace for fetched claim commits. Default {@link DEFAULT_CLAIM_CACHE_REF_PREFIX}. */
  cacheRefPrefix?: string;
  /** Takeover is allowed only once `expiresAt + skewMarginMs < now`. Default {@link DEFAULT_CLAIM_SKEW_MARGIN_MS}. */
  skewMarginMs?: number;
  /** git runner. Default {@link createExecFileGitTransport}(). */
  transport?: GitTransport;
  /**
   * Receives operator-visible warnings, such as an implausible claim record
   * being taken over. Default `console.warn`.
   */
  onWarning?: (message: string) => void;
}

interface RemoteClaim {
  sha: string;
  /** `null` when the commit is not a valid, plausible claim record. */
  record: ClaimRecord | null;
  /**
   * Set when the commit is structurally a claim commit gone wrong (oversized,
   * non-empty tree, merge commit, or an impossible epoch or time). Such claims
   * are taken over as if expired; `record` is then `null`.
   */
  implausible?: string;
}

type ReadResult = { ok: true; claim: RemoteClaim | null } | { ok: false; reason: string };

interface LocalCommit {
  sha: string;
  tree: string;
  parents: number;
  message: string;
}

function describeFailure(op: string, result: GitRunResult): string {
  const detail = (result.stderr.trim() || result.stdout.trim()).split(/\r?\n/).slice(-3).join(' | ');
  return `git ${op} failed (exit ${result.exitCode})${detail ? `: ${detail}` : ''}`;
}

/**
 * Distributed claim provider backed by Git ref compare-and-swap (ADR 002).
 * Requires push rights to the claim namespace on the shared remote.
 */
export class GitRefClaimProvider implements WorkClaimProvider {
  readonly name = 'git-ref';
  readonly guarantees: ClaimProviderGuarantees = Object.freeze({
    exclusion: 'distributed',
    leases: true,
    fencing: true,
  });

  readonly remote: string;
  readonly refPrefix: string;
  readonly cacheRefPrefix: string;
  readonly skewMarginMs: number;
  private readonly cwd: string;
  private readonly identity: ExecutorIdentity;
  private readonly now: () => number;
  private readonly transport: GitTransport;
  private readonly warn: (message: string) => void;
  private emptyTree: string | undefined;

  constructor(opts: GitRefClaimProviderOptions = {}) {
    this.identity = { ...(opts.identity ?? resolveExecutorIdentity()) };
    this.now = opts.now ?? Date.now;
    this.cwd = opts.cwd ?? process.cwd();
    this.remote = opts.remote ?? 'origin';
    assertValidRemote(this.remote);
    this.refPrefix = opts.refPrefix ?? DEFAULT_CLAIM_REF_PREFIX;
    assertValidRefPrefix(this.refPrefix);
    this.cacheRefPrefix = opts.cacheRefPrefix ?? DEFAULT_CLAIM_CACHE_REF_PREFIX;
    assertValidRefPrefix(this.cacheRefPrefix, 'cacheRefPrefix');
    if (this.cacheRefPrefix === this.refPrefix) {
      throw new TypeError('cacheRefPrefix must differ from refPrefix');
    }
    const skew = opts.skewMarginMs ?? DEFAULT_CLAIM_SKEW_MARGIN_MS;
    if (!Number.isFinite(skew) || skew < 0 || skew > MAX_CLAIM_SKEW_MARGIN_MS) {
      throw new RangeError(`skewMarginMs must be a finite number in [0, ${MAX_CLAIM_SKEW_MARGIN_MS}]`);
    }
    this.skewMarginMs = skew;
    this.transport = opts.transport ?? createExecFileGitTransport();
    this.warn = opts.onWarning ?? ((message) => console.warn(message));
  }

  /** Remote ref that holds the claim for `key`. */
  refFor(key: WorkKey): string {
    return claimRefForKey(key, this.refPrefix);
  }

  async acquire(key: WorkKey, o: ClaimOptions): Promise<AcquireResult> {
    assertClaimTtl(o);
    const normalized = normalizeWorkKey(key);
    const ref = this.refFor(normalized);
    try {
      // `observed` is the remote claim we compare-and-swap against; null means
      // "expected absent" (create a root claim).
      let observed: RemoteClaim | null = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (observed && !observed.record && !observed.implausible) {
          return { status: 'unavailable', reason: `corrupt claim record at ${ref} (${observed.sha})` };
        }
        if (observed?.implausible) {
          this.warn(`claim ${ref} (${observed.sha}) is implausible: ${observed.implausible} — taking it over as expired`);
        }
        if (observed?.record && observed.record.expiresAt + this.skewMarginMs >= this.now()) {
          return { status: 'held', by: observed.record };
        }
        const now = this.now();
        const record: Omit<ClaimRecord, 'handle'> = {
          key: normalized,
          holder: { ...this.identity },
          epoch: observed?.record ? observed.record.epoch + 1 : 1,
          acquiredAt: now,
          expiresAt: now + o.ttlMs,
        };
        const sha = await this.writeCommit(record, observed?.sha);
        const push = await this.push(sha, ref, observed?.sha ?? '');
        if (push.exitCode === 0) return { status: 'acquired', claim: { ...record, handle: sha } };

        const read = await this.readRemote(ref, normalized);
        if (!read.ok) return { status: 'unavailable', reason: read.reason };
        if (read.claim?.sha === sha) return { status: 'acquired', claim: { ...record, handle: sha } };
        if ((read.claim?.sha ?? null) === (observed?.sha ?? null)) {
          // The ref is where we expected it, so the push failed for a reason
          // other than a lost race (network, auth, host policy).
          return { status: 'unavailable', reason: describeFailure('push', push) };
        }
        observed = read.claim;
      }
      return { status: 'unavailable', reason: `claim ${ref} kept changing; gave up after ${MAX_ATTEMPTS} attempts` };
    } catch (err) {
      return { status: 'unavailable', reason: (err as Error).message };
    }
  }

  async renew(c: ClaimRecord, o: ClaimOptions): Promise<RenewResult> {
    assertClaimTtl(o);
    const key = normalizeWorkKey(c.key);
    const ref = this.refFor(key);
    if (!isSha(c.handle)) return this.fencedByCurrent(ref, key);
    const next: Omit<ClaimRecord, 'handle'> = {
      key,
      holder: { ...c.holder },
      epoch: c.epoch + 1,
      acquiredAt: c.acquiredAt,
      expiresAt: this.now() + o.ttlMs,
    };
    let sha: string;
    try {
      sha = await this.writeCommit(next, c.handle);
    } catch {
      // Parent not in the local object store: the claim was written elsewhere.
      const current = await this.readOrThrow(ref, key);
      if (!current || current.sha !== c.handle) return fenced(current);
      try {
        sha = await this.writeCommit(next, c.handle);
      } catch (err) {
        throw new GitClaimUnavailableError(`renew of ${ref}: ${(err as Error).message}`);
      }
    }
    const push = await this.push(sha, ref, c.handle);
    if (push.exitCode === 0) return { status: 'renewed', claim: { ...next, handle: sha } };
    const current = await this.readOrThrow(ref, key);
    if (current?.sha === sha) return { status: 'renewed', claim: { ...next, handle: sha } };
    if (current?.sha === c.handle) {
      throw new GitClaimUnavailableError(`renew of ${ref}: ${describeFailure('push', push)}`);
    }
    return fenced(current);
  }

  async release(c: ClaimRecord, _outcome: FinishOutcome): Promise<ReleaseResult> {
    const key = normalizeWorkKey(c.key);
    const ref = this.refFor(key);
    if (isSha(c.handle)) {
      const push = await this.pushDelete(ref, c.handle);
      if (push.exitCode === 0) {
        await this.git(['update-ref', '-d', this.cacheRefFor(ref)]);
        return { status: 'released' };
      }
      const current = await this.lsRemote(ref);
      if (!current.ok) throw new GitClaimUnavailableError(current.reason);
      if (current.sha === null) return { status: 'already-released' };
      if (current.sha === c.handle) {
        throw new GitClaimUnavailableError(`release of ${ref}: ${describeFailure('push', push)}`);
      }
      return { status: 'fenced' };
    }
    const current = await this.lsRemote(ref);
    if (!current.ok) throw new GitClaimUnavailableError(current.reason);
    return { status: current.sha === null ? 'already-released' : 'fenced' };
  }

  /**
   * Current remote claim for `key`, or `null` when none exists.
   *
   * @throws GitClaimUnavailableError when the remote cannot be read or the
   *   claim commit is not a valid record.
   */
  async inspect(key: WorkKey): Promise<ClaimRecord | null> {
    const normalized = normalizeWorkKey(key);
    const ref = this.refFor(normalized);
    const current = await this.readOrThrow(ref, normalized);
    if (!current) return null;
    if (!current.record) {
      throw new GitClaimUnavailableError(current.implausible
        ? `implausible claim record at ${ref} (${current.sha}): ${current.implausible}`
        : `corrupt claim record at ${ref} (${current.sha})`);
    }
    return current.record;
  }

  // --- git plumbing ---
  //
  // Typical cost in git invocations (network round trips in parentheses):
  //   acquire free key: commit-tree + push (1); contended: + fetch + cat-file (2)
  //   renew: commit-tree + push (1); release: push (1) + local cache-ref delete

  private git(args: readonly string[], input?: string, extra: Pick<GitRunOptions, 'env' | 'maxOutputBytes'> = {}): Promise<GitRunResult> {
    return this.transport.run(args, { cwd: this.cwd, input, ...extra });
  }

  private async emptyTreeSha(): Promise<string> {
    if (this.emptyTree) return this.emptyTree;
    const result = await this.git(['mktree'], '');
    const sha = result.stdout.trim();
    if (result.exitCode !== 0 || !isSha(sha)) throw new Error(describeFailure('mktree', result));
    this.emptyTree = sha;
    return sha;
  }

  /** Fixed author/committer identity and a UTC date from the injected clock. */
  private commitEnv(): Record<string, string> {
    const date = `@${Math.max(0, Math.floor(this.now() / 1000))} +0000`;
    return {
      GIT_AUTHOR_NAME: CLAIM_COMMITTER_NAME,
      GIT_AUTHOR_EMAIL: CLAIM_COMMITTER_EMAIL,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: CLAIM_COMMITTER_NAME,
      GIT_COMMITTER_EMAIL: CLAIM_COMMITTER_EMAIL,
      GIT_COMMITTER_DATE: date,
    };
  }

  private async writeCommit(record: Omit<ClaimRecord, 'handle'>, parent: string | undefined): Promise<string> {
    const tree = await this.emptyTreeSha();
    const args = ['commit-tree', '--no-gpg-sign', tree];
    if (parent !== undefined) {
      if (!isSha(parent)) throw new Error(`invalid parent ${JSON.stringify(parent)}`);
      args.push('-p', parent);
    }
    args.push('-F', '-');
    const result = await this.git(args, encodeClaimRecord(record), { env: this.commitEnv() });
    const sha = result.stdout.trim();
    if (result.exitCode !== 0 || !isSha(sha)) throw new Error(describeFailure('commit-tree', result));
    return sha;
  }

  /** CAS push of `sha` to `ref`; `expected` is the old SHA, or `''` for "must not exist". */
  private push(sha: string, ref: string, expected: string): Promise<GitRunResult> {
    return this.git([
      'push', '--porcelain', '--no-verify', '--quiet',
      `--force-with-lease=${ref}:${expected}`,
      '--', this.remote, `${sha}:${ref}`,
    ]);
  }

  /** CAS delete of `ref`, expected to point at `expected`. */
  private pushDelete(ref: string, expected: string): Promise<GitRunResult> {
    return this.git([
      'push', '--porcelain', '--no-verify', '--quiet',
      `--force-with-lease=${ref}:${expected}`,
      '--', this.remote, `:${ref}`,
    ]);
  }

  private async lsRemote(ref: string): Promise<{ ok: true; sha: string | null } | { ok: false; reason: string }> {
    const result = await this.git(['ls-remote', '--', this.remote, ref]);
    if (result.exitCode !== 0) return { ok: false, reason: describeFailure('ls-remote', result) };
    for (const line of result.stdout.split(/\r?\n/)) {
      const [sha, name] = line.split('\t');
      if (name === ref && isSha(sha)) return { ok: true, sha };
    }
    return { ok: true, sha: null };
  }

  private cacheRefFor(ref: string): string {
    return this.cacheRefPrefix + ref.slice(this.refPrefix.length);
  }

  /**
   * Resolve `rev` locally to its SHA, tree, parent count, and message with one
   * capped `cat-file --batch` call. `'oversized'` when the commit exceeds
   * {@link MAX_CLAIM_COMMIT_BYTES}.
   */
  private async readLocalCommit(rev: string): Promise<LocalCommit | 'oversized' | null> {
    const result = await this.git(['cat-file', '--batch'], `${rev}\n`, { maxOutputBytes: MAX_CLAIM_COMMIT_BYTES });
    if (result.outputLimitExceeded) return 'oversized';
    if (result.exitCode !== 0) return null;
    const newline = result.stdout.indexOf('\n');
    if (newline === -1) return null;
    const [sha, type] = result.stdout.slice(0, newline).split(' ');
    if (type !== 'commit' || !isSha(sha)) return null;
    const body = result.stdout.slice(newline + 1);
    const split = body.indexOf('\n\n');
    const headers = (split === -1 ? body : body.slice(0, split)).split('\n');
    const tree = headers.find((h) => h.startsWith('tree '))?.slice(5) ?? '';
    const parents = headers.filter((h) => h.startsWith('parent ')).length;
    return { sha, tree, parents, message: split === -1 ? '' : body.slice(split + 2) };
  }

  /** Classify a fetched claim commit: valid record, implausible (takeover-eligible), or corrupt. */
  private async classifyCommit(commit: LocalCommit, key: WorkKey): Promise<RemoteClaim> {
    if (commit.tree !== await this.emptyTreeSha()) {
      return { sha: commit.sha, record: null, implausible: 'claim commit tree is not the empty tree' };
    }
    if (commit.parents > 1) {
      return { sha: commit.sha, record: null, implausible: `claim commit has ${commit.parents} parents` };
    }
    const record = decodeClaimRecord(commit.message, commit.sha);
    if (record === null || workKeyToString(record.key) !== workKeyToString(key)) {
      return { sha: commit.sha, record: null };
    }
    const implausible = claimRecordImplausibility(record, this.now());
    return implausible ? { sha: commit.sha, record: null, implausible } : { sha: commit.sha, record };
  }

  /**
   * Fetch the claim ref into the private cache namespace and decode it.
   * `claim: null` means the remote ref does not exist.
   */
  private async readRemote(ref: string, key: WorkKey): Promise<ReadResult> {
    const cacheRef = this.cacheRefFor(ref);
    let lastReason = `could not read claim commit for ${ref}`;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const fetch = await this.git([
        '-c', 'gc.auto=0', '-c', 'maintenance.auto=false',
        'fetch', '--quiet', '--no-tags', '--no-recurse-submodules', '--refmap=',
        '--', this.remote, `+${ref}:${cacheRef}`,
      ]);
      if (fetch.exitCode !== 0) {
        // Missing remote ref, transport failure, or a lost local lock: ls-remote tells them apart.
        lastReason = describeFailure('fetch', fetch);
        const ls = await this.lsRemote(ref);
        if (!ls.ok) return ls;
        if (ls.sha === null) return { ok: true, claim: null };
        continue;
      }
      const commit = await this.readLocalCommit(cacheRef);
      if (commit === 'oversized') {
        const resolved = await this.git(['rev-parse', '--verify', '--quiet', `${cacheRef}^{commit}`]);
        const sha = resolved.stdout.trim();
        if (resolved.exitCode !== 0 || !isSha(sha)) continue;
        return {
          ok: true,
          claim: { sha, record: null, implausible: `claim commit exceeds ${MAX_CLAIM_COMMIT_BYTES} bytes` },
        };
      }
      if (!commit) continue;
      try {
        return { ok: true, claim: await this.classifyCommit(commit, key) };
      } catch (err) {
        return { ok: false, reason: (err as Error).message };
      }
    }
    return { ok: false, reason: lastReason };
  }
  private async readOrThrow(ref: string, key: WorkKey): Promise<RemoteClaim | null> {
    const read = await this.readRemote(ref, key);
    if (!read.ok) throw new GitClaimUnavailableError(read.reason);
    return read.claim;
  }

  private async fencedByCurrent(ref: string, key: WorkKey): Promise<RenewResult> {
    return fenced(await this.readOrThrow(ref, key));
  }
}

function fenced(current: RemoteClaim | null): RenewResult {
  return current?.record ? { status: 'fenced', by: current.record } : { status: 'fenced' };
}
