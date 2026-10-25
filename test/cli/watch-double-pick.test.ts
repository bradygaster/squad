/**
 * Double-pick regression suite (ADR-002), end to end against REAL Git.
 *
 * Complements watch-claims.test.ts (in-memory / none executors, injected-clock
 * fencing, default-provider hybrid round) and ralph-claims-git.test.ts
 * (provider contract, plain `--force` mutation control) with the gaps the
 * plan called out:
 * - 8 clones of one bare repository racing `acquire` on one key through the
 *   same factory `squad watch --claims git-ref` uses;
 * - two ExecuteCapability executors in separate clones (git-ref) dispatching
 *   disjoint issue sets, with a `none` baseline control in the same clones;
 * - fencing across clones: A's lease lapses on an injected clock, B takes
 *   over from its own clone, A's renewal is fenced and A's agent is killed;
 * - hybrid execute + fleet-dispatch in one round never sharing an issue under
 *   `none`, in-memory, and git-ref claims.
 *
 * Pre-fix reference (75b15cf4, no claims): two executors both dispatched
 * [1,2,3,4]; a hybrid round dispatched [10,11,12] to execute and [10,12] to
 * fleet-dispatch.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  InMemoryClaimProvider,
  InMemoryClaimStore,
  type ExecutorIdentity,
  type WorkClaimProvider,
} from '@bradygaster/squad-sdk/ralph/claims';
import { GitRefClaimProvider } from '@bradygaster/squad-sdk/ralph/claims-git';
import { ExecuteCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/execute.js';
import { FleetDispatchCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/fleet-dispatch.js';
import type { WatchContext } from '../../packages/squad-cli/src/cli/commands/watch/types.js';
import { createWatchClaimProvider } from '../../packages/squad-cli/src/cli/commands/watch/claims.js';

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const ROOT = path.resolve('.evidence-tmp', `watch-double-pick-${randomUUID().slice(0, 8)}`);
const RECORD_SCRIPT = path.join(ROOT, 'record.cjs');
const SLEEP_SCRIPT = path.join(ROOT, 'sleep.cjs');
const TIMEOUT = 60_000;

const fwd = (p: string): string => p.replace(/\\/g, '/');

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

beforeAll(() => {
  fs.mkdirSync(ROOT, { recursive: true });
  // Records the issue numbers in the prompt it received (following the
  // Windows prompt-file spill), then lingers so concurrent executors overlap.
  fs.writeFileSync(RECORD_SCRIPT, [
    "const fs = require('fs');",
    'const [recordFile, tag, ...rest] = process.argv.slice(2);',
    "let prompt = rest.join(' ');",
    "const spill = prompt.match(/instructions are in the file (\\S+?) - read/);",
    "if (spill) { try { prompt = fs.readFileSync(spill[1], 'utf8'); } catch {} }",
    'const nums = [...prompt.matchAll(/- #(\\d+):/g)].map(m => Number(m[1]));',
    "fs.appendFileSync(recordFile, JSON.stringify({ tag, nums }) + '\\n');",
    'setTimeout(() => {}, 300);',
  ].join('\n'));
  fs.writeFileSync(SLEEP_SCRIPT, [
    "const fs = require('fs');",
    'fs.writeFileSync(process.argv[2], String(process.pid));',
    'setTimeout(() => {}, 30000);',
  ].join('\n'));
});

afterAll(async () => {
  await fs.promises.rm(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

let cloneSeq = 0;
/** A fresh bare repository standing in for the shared remote (one per test, so claims never leak between tests). */
function newRemote(name: string): string {
  const bare = path.join(ROOT, `${name}-${cloneSeq++}.git`);
  git(ROOT, ['init', '--quiet', '--bare', '--template=', bare]);
  return bare;
}

/** A team root that is a real clone of `bare` (origin = bare). */
function clone(bare: string, name: string): string {
  const dir = path.join(ROOT, `${name}-${cloneSeq++}`);
  git(ROOT, ['clone', '--quiet', '--template=', fwd(bare), dir]);
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  return dir;
}

function plainTeamDir(name: string): string {
  const dir = path.join(ROOT, `${name}-${cloneSeq++}`);
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  return dir;
}

function claimRefs(bare: string): string[] {
  return git(ROOT, ['--git-dir', bare, 'for-each-ref', '--format=%(refname)', 'refs/squad/claims/'])
    .split('\n')
    .filter(Boolean);
}

const identity = (machineId: string): ExecutorIdentity => ({ machineId, instanceId: `${machineId}-instance` });

/** The provider `squad watch --claims git-ref` builds for a team root. */
const gitRef = (teamRoot: string, id: ExecutorIdentity): Promise<WorkClaimProvider> =>
  createWatchClaimProvider({ provider: 'git-ref' }, { teamRoot, identity: id });

const none = (teamRoot: string, id: ExecutorIdentity): Promise<WorkClaimProvider> =>
  createWatchClaimProvider({ provider: 'none' }, { teamRoot, identity: id });

function issue(id: number, title: string): Record<string, unknown> {
  return {
    id,
    title,
    state: 'open',
    tags: ['squad', 'squad:eecom'],
    url: `https://github.com/acme/widgets/issues/${id}`,
  };
}

const ISSUES = [
  issue(1, 'Fix login redirect'),
  issue(2, 'Implement rate limiter'),
  issue(3, 'Add retry logic'),
  issue(4, 'Build webhook relay'),
];

const HYBRID = [
  issue(10, 'Research auth flow'),
  issue(11, 'Fix auth redirect bug'),
  issue(12, 'Review PR comments'),
];

function fakeAdapter(items: Array<Record<string, unknown>>): WatchContext['adapter'] {
  return { type: 'github', listWorkItems: vi.fn(async () => items) } as unknown as WatchContext['adapter'];
}

function makeContext(teamRoot: string, overrides: Partial<WatchContext> = {}): WatchContext {
  return {
    teamRoot,
    stateRoot: path.join(teamRoot, '.squad'),
    adapter: fakeAdapter(ISSUES),
    round: 1,
    roster: [{ name: 'EECOM', label: 'squad:eecom', expertise: [] }],
    config: { timeout: 1 },
    workRepo: 'acme/widgets',
    ...overrides,
  };
}

function recorderCmd(recordFile: string, tag: string): string {
  return `node ${fwd(RECORD_SCRIPT)} ${fwd(recordFile)} ${tag} {prompt}`;
}

function readRecords(recordFile: string): Map<string, number[]> {
  const byTag = new Map<string, number[]>();
  if (!fs.existsSync(recordFile)) return byTag;
  for (const line of fs.readFileSync(recordFile, 'utf8').split('\n').filter(Boolean)) {
    const { tag, nums } = JSON.parse(line) as { tag: string; nums: number[] };
    byTag.set(tag, [...(byTag.get(tag) ?? []), ...nums]);
  }
  return byTag;
}

const sorted = (xs: number[]): number[] => [...xs].sort((x, y) => x - y);

/** Two ExecuteCapability executors, each in its own clone, racing one round over ISSUES. */
async function raceTwoExecutors(
  name: string,
  providerFor: (teamRoot: string, id: ExecutorIdentity) => Promise<WorkClaimProvider>,
): Promise<{ a: number[]; b: number[]; summaries: string[]; bare: string }> {
  const bare = newRemote(name);
  const recordFile = path.join(ROOT, `${name}-dispatched.jsonl`);
  const adapter = fakeAdapter(ISSUES);
  const mk = async (tag: string): Promise<WatchContext> => {
    const root = clone(bare, `${name}-${tag}`);
    const executor = identity(`${name}-${tag}`);
    return makeContext(root, {
      adapter,
      executor,
      claims: await providerFor(root, executor),
      agentCmd: recorderCmd(recordFile, tag),
    });
  };
  const [ctxA, ctxB] = await Promise.all([mk('A'), mk('B')]);
  const results = await Promise.all([
    new ExecuteCapability().execute(ctxA),
    new ExecuteCapability().execute(ctxB),
  ]);
  const summaries = results.map((r, i) => `${i === 0 ? 'A' : 'B'}: ${r.summary}`);
  for (const r of results) expect(r.success, summaries.join(' | ')).toBe(true);
  const records = readRecords(recordFile);
  return { a: sorted(records.get('A') ?? []), b: sorted(records.get('B') ?? []), summaries, bare };
}

describe.skipIf(!hasGit)('double-pick: git-ref claims across real clones of one bare repository', () => {
  it('8 clones racing acquire on one key: exactly one acquired, 7 held, and every late retry held', async () => {
    const key = { platform: 'github', repo: 'acme/widgets', id: `race-${randomUUID().slice(0, 8)}` };
    const bare = newRemote('race');
    const providers = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const root = clone(bare, `race-${i}`);
        return gitRef(root, identity(`racer-${i}`));
      }),
    );
    const results = await Promise.all(providers.map(p => p.acquire(key, { ttlMs: 60_000 })));
    const statuses = results.map((r, i) => `racer-${i}=${r.status}${r.status === 'unavailable' ? `(${r.reason})` : ''}`);

    expect(results.filter(r => r.status === 'acquired'), `key ${key.id}: ${statuses.join(', ')}`).toHaveLength(1);
    expect(results.filter(r => r.status === 'held'), `key ${key.id}: ${statuses.join(', ')}`).toHaveLength(7);

    // Late arrivals: every clone retries after the burst settled (the next
    // watch round). A CAS that does not lease on "must not exist" would let
    // these overwrite the winner; a ref-lock collision cannot mask it here.
    const late: string[] = [];
    for (const [i, p] of providers.entries()) {
      const r = await p.acquire(key, { ttlMs: 60_000 });
      late.push(`racer-${i}=${r.status}`);
    }
    expect(late.filter(s => !s.endsWith('=held')), `late acquires on key ${key.id}: ${late.join(', ')}`).toEqual([]);
  }, TIMEOUT);

  it('two ExecuteCapability executors in separate clones dispatch disjoint issue sets', async () => {
    const { a, b, summaries, bare } = await raceTwoExecutors('exec-gitref', gitRef);
    const detail = `A dispatched [${a}], B dispatched [${b}] (${summaries.join(' | ')})`;

    expect(a.filter(n => b.includes(n)), `issues dispatched by both executors — ${detail}`).toEqual([]);
    expect(sorted([...a, ...b]), `every issue dispatched exactly once — ${detail}`).toEqual([1, 2, 3, 4]);
    expect(claimRefs(bare), `claim refs left on the remote after both rounds — ${detail}`).toEqual([]);
  }, TIMEOUT);

  it('baseline control in the same setup: provider none lets both executors dispatch every issue', async () => {
    const { a, b, summaries } = await raceTwoExecutors('exec-none', none);
    const detail = `A dispatched [${a}], B dispatched [${b}] (${summaries.join(' | ')})`;

    expect(a, detail).toEqual([1, 2, 3, 4]);
    expect(b, detail).toEqual([1, 2, 3, 4]);
  }, TIMEOUT);

  it('fencing: A lapses on an injected clock, B takes over from its clone, A renew is fenced and its agent killed', async () => {
    // A's clock stands still; B's runs 10 s ahead, so from B's view A's 3 s
    // lease has lapsed however often A renews it.
    const base = 1_000_000;
    const nowA = (): number => base;
    const nowB = (): number => base + 10_000;
    const bare = newRemote('fence');
    const rootA = clone(bare, 'fence-A');
    const rootB = clone(bare, 'fence-B');
    const pidFile = path.join(rootA, 'agent.pid');
    const ttlMs = 3_000;
    const key = { platform: 'github', repo: 'acme/widgets', id: '1' };
    const a = new GitRefClaimProvider({ identity: identity('fence-A'), cwd: rootA, now: nowA, skewMarginMs: 0 });
    const b = new GitRefClaimProvider({ identity: identity('fence-B'), cwd: rootB, now: nowB, skewMarginMs: 0 });
    const releaseSpy = vi.spyOn(a, 'release');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let pid = 0;

    try {
      const started = Date.now();
      const run = new ExecuteCapability().execute(makeContext(rootA, {
        adapter: fakeAdapter([ISSUES[0]!]),
        executor: identity('fence-A'),
        claims: a,
        claimTiming: { ttlMs, skewMarginMs: 0, now: nowA },
        agentCmd: `node ${fwd(SLEEP_SCRIPT)} ${fwd(pidFile)} {prompt}`,
      }));
      pid = await waitForPid(pidFile);

      // B's CAS can lose to one of A's concurrent renewals; B simply retries
      // the next "round", and every retry still sees A's lease as lapsed.
      const attempts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await b.acquire(key, { ttlMs: 60_000 });
        attempts.push(r.status === 'held' ? `held(epoch ${r.by.epoch})` : r.status);
        if (r.status === 'acquired') break;
      }
      expect(attempts.at(-1), `B takeover attempts on #1: ${attempts.join(', ')}`).toBe('acquired');

      const result = await run;
      expect(Date.now() - started, `A's agent outlived the fence: ${result.summary}`).toBeLessThan(15_000);
      expect(result.success, `A's round should fail when fenced: ${result.summary}`).toBe(false);
      expect(result.summary).toContain('claim #1 fenced by fence-B/fence-B-instance');
      expect(await waitForDeath(pid), `A's agent pid ${pid} still alive after the fence`).toBe(true);
      expect(releaseSpy.mock.calls.map(c => c[1]), 'A release outcomes').toEqual(['cancelled']);

      // A's cancelled release did not delete B's claim on the remote.
      const inspected = await b.inspect(key);
      expect(inspected?.holder.machineId, `holder of #1 after A's release: ${JSON.stringify(inspected)}`).toBe('fence-B');
    } finally {
      log.mockRestore();
      if (pid && isAlive(pid)) process.kill(pid);
    }
  }, TIMEOUT);
});

describe('double-pick: hybrid execute + fleet-dispatch never share an issue in one round', () => {
  const providers: Array<[string, boolean, (root: string, id: ExecutorIdentity) => Promise<WorkClaimProvider>]> = [
    ['none', false, none],
    ['in-memory', false, async (_root, id) => new InMemoryClaimProvider({ identity: id, store: new InMemoryClaimStore() })],
    ['git-ref', !hasGit, gitRef],
  ];

  for (const [name, skip, providerFor] of providers) {
    it.skipIf(skip)(`provider ${name}: execute then fleet-dispatch dispatch disjoint issues`, async () => {
      const root = name === 'git-ref' ? clone(newRemote(`hybrid-${name}`), `hybrid-${name}`) : plainTeamDir(`hybrid-${name}`);
      const recordFile = path.join(root, 'dispatched.jsonl');
      const executor = identity(`hybrid-${name}`);
      const round: WatchContext = makeContext(root, {
        adapter: fakeAdapter(HYBRID),
        executor,
        claims: await providerFor(root, executor),
        agentCmd: recorderCmd(recordFile, 'exec'),
        dispatchedThisRound: new Set<number>(),
        config: { timeout: 1, dispatchMode: 'hybrid' },
      });
      const fleetIssues: number[] = [];
      const fleet = new FleetDispatchCapability({
        invoke: async (prompt) => {
          fleetIssues.push(...[...prompt.matchAll(/Issue #(\d+):/g)].map(m => Number(m[1])));
          return { success: true };
        },
      });

      // Same order and shared round state as runPhase('post-execute', ...).
      const execResult = await new ExecuteCapability().execute({ ...round });
      const fleetResult = await fleet.execute({ ...round });

      const execIssues = sorted(readRecords(recordFile).get('exec') ?? []);
      const detail = `execute dispatched [${execIssues}] (${execResult.summary}); `
        + `fleet-dispatch dispatched [${sorted(fleetIssues)}] (${fleetResult.summary})`;
      expect(execResult.success, detail).toBe(true);
      expect(fleetResult.success, detail).toBe(true);
      expect(execIssues, detail).toEqual([10, 11, 12]);
      expect(fleetIssues.filter(n => execIssues.includes(n)), `issues dispatched twice this round — ${detail}`).toEqual([]);
      expect(sorted([...round.dispatchedThisRound!]), detail).toEqual([10, 11, 12]);
    }, TIMEOUT);
  }
});

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForDeath(pid: number, ms = 5000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return !isAlive(pid);
}

async function waitForPid(pidFile: string): Promise<number> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8'));
      if (pid > 0) return pid;
    }
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`stub agent never wrote ${pidFile}`);
}
