/**
 * Watch work-claim wiring (ADR-002): execute and fleet-dispatch claim before
 * dispatch, renew while the agent runs, kill the agent when fenced, release
 * in finally, and never dispatch an issue twice in one round.
 *
 * Execute tests spawn a real stub agent (`node record.cjs ...`) so the
 * dispatched issue set is observed exactly as the agent receives it.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import {
  InMemoryClaimProvider,
  InMemoryClaimStore,
  NoopClaimProvider,
  type ClaimRecord,
  type ExecutorIdentity,
  type FinishOutcome,
  type WorkClaimProvider,
  type WorkKey,
} from '@bradygaster/squad-sdk/ralph/claims';
import { ExecuteCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/execute.js';
import { FleetDispatchCapability } from '../../packages/squad-cli/src/cli/commands/watch/capabilities/fleet-dispatch.js';
import type { WatchContext } from '../../packages/squad-cli/src/cli/commands/watch/types.js';
import {
  loadWatchConfig,
  mergeWatchClaimsConfig,
  parseWatchClaimsConfig,
  WatchConfigError,
} from '../../packages/squad-cli/src/cli/commands/watch/config.js';
import {
  acquireClaims,
  createWatchClaimProvider,
  describeClaimProvider,
  holdClaimsWhile,
  workKeyFor,
} from '../../packages/squad-cli/src/cli/commands/watch/claims.js';
import {
  agentProcessGroupOptions,
  killProcessTree,
  spawnAgent,
} from '../../packages/squad-cli/src/cli/commands/watch/agent-spawn.js';

const ROOT = path.resolve('.evidence-tmp', `watch-claims-${randomUUID().slice(0, 8)}`);
const RECORD_SCRIPT = path.join(ROOT, 'record.cjs');
const SLEEP_SCRIPT = path.join(ROOT, 'sleep.cjs');
const TREE_PARENT_SCRIPT = path.join(ROOT, 'tree-parent.cjs');

const fwd = (p: string): string => p.replace(/\\/g, '/');

beforeAll(() => {
  fs.mkdirSync(ROOT, { recursive: true });
  // Records the issue numbers in the prompt it received (following the
  // Windows prompt-file spill) to `<recordFile>`, then lingers briefly so
  // concurrent executors overlap in time.
  fs.writeFileSync(RECORD_SCRIPT, [
    "const fs = require('fs');",
    'const [recordFile, tag, ...rest] = process.argv.slice(2);',
    "let prompt = rest.join(' ');",
    "const spill = prompt.match(/instructions are in the file (\\S+?) - read/);",
    "if (spill) { try { prompt = fs.readFileSync(spill[1], 'utf8'); } catch {} }",
    'const nums = [...prompt.matchAll(/- #(\\d+):/g)].map(m => Number(m[1]));',
    "const claimedContract = prompt.includes('CLAIMED WORK:');",
    "fs.appendFileSync(recordFile, JSON.stringify({ tag, nums, claimedContract }) + '\\n');",
    'setTimeout(() => {}, 300);',
  ].join('\n'));
  // Writes its pid, then sleeps long enough that only a kill ends it in time.
  fs.writeFileSync(SLEEP_SCRIPT, [
    "const fs = require('fs');",
    'fs.writeFileSync(process.argv[2], String(process.pid));',
    'setTimeout(() => {}, 30000);',
  ].join('\n'));
  fs.writeFileSync(TREE_PARENT_SCRIPT, [
    "const { spawn } = require('child_process');",
    'const heartbeat = process.argv[2];',
    "const childCode = \"const fs=require('fs');const p=process.argv[1];setInterval(()=>fs.appendFileSync(p,'x'),10);\";",
    "spawn(process.execPath, ['-e', childCode, heartbeat], { stdio: 'ignore' });",
    'setInterval(() => {}, 1000);',
  ].join('\n'));
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

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

function fakeAdapter(items: Array<Record<string, unknown>>): WatchContext['adapter'] {
  return {
    type: 'github',
    listWorkItems: vi.fn(async () => items),
  } as unknown as WatchContext['adapter'];
}

function teamDir(name: string): string {
  const dir = path.join(ROOT, name);
  fs.mkdirSync(path.join(dir, '.squad'), { recursive: true });
  return dir;
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

/** Whether each recorded prompt for `tag` carried the claimed-work contract. */
function readContractFlags(recordFile: string, tag: string): boolean[] {
  if (!fs.existsSync(recordFile)) return [];
  return fs.readFileSync(recordFile, 'utf8').split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as { tag: string; claimedContract: boolean })
    .filter(r => r.tag === tag)
    .map(r => r.claimedContract);
}

const identity = (machineId: string): ExecutorIdentity => ({ machineId, instanceId: `${machineId}-instance` });

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

async function runTwoExecutors(
  name: string,
  providerFor: (id: ExecutorIdentity) => WorkClaimProvider,
): Promise<{ a: number[]; b: number[] }> {
  const root = teamDir(name);
  const recordFile = path.join(root, 'dispatched.jsonl');
  const adapter = fakeAdapter(ISSUES);
  const mk = (tag: string): WatchContext => {
    const executor = identity(`machine-${tag}`);
    return makeContext(root, {
      adapter,
      executor,
      claims: providerFor(executor),
      agentCmd: recorderCmd(recordFile, tag),
    });
  };
  const results = await Promise.all([
    new ExecuteCapability().execute(mk('A')),
    new ExecuteCapability().execute(mk('B')),
  ]);
  for (const r of results) expect(r.success, r.summary).toBe(true);
  const records = readRecords(recordFile);
  return { a: records.get('A') ?? [], b: records.get('B') ?? [] };
}

describe('watch claims: execute double-pick', () => {
  it('two executors sharing an in-memory claim store dispatch disjoint issue sets', async () => {
    const store = new InMemoryClaimStore();
    const { a, b } = await runTwoExecutors('disjoint', id => new InMemoryClaimProvider({ identity: id, store }));

    const overlap = a.filter(n => b.includes(n));
    expect(overlap).toEqual([]);
    expect([...a, ...b].sort()).toEqual([1, 2, 3, 4]);
    expect(store.size).toBe(0); // every claim released in finally
  }, 30_000);

  it('baseline control: with NoopClaimProvider both executors dispatch the same issues', async () => {
    const { a, b } = await runTwoExecutors('overlap', id => new NoopClaimProvider({ identity: id }));

    expect(a.sort()).toEqual([1, 2, 3, 4]);
    expect(b.sort()).toEqual([1, 2, 3, 4]);
  }, 30_000);

  it('default (no provider configured) dispatches every eligible issue as before', async () => {
    const root = teamDir('default');
    const recordFile = path.join(root, 'dispatched.jsonl');
    const result = await new ExecuteCapability().execute(
      makeContext(root, { agentCmd: recorderCmd(recordFile, 'solo') }),
    );
    expect(result.success).toBe(true);
    expect(result.summary).toContain('agent dispatched with 4 issues');
    expect(result.data?.['claims']).toMatchObject({ provider: 'none', acquired: 4, held: 0, unavailable: 0 });
    expect(readRecords(recordFile).get('solo')?.sort()).toEqual([1, 2, 3, 4]);
  }, 30_000);

  it('skips issues held by another executor and dispatches only the won ones', async () => {
    const root = teamDir('held');
    const recordFile = path.join(root, 'dispatched.jsonl');
    const store = new InMemoryClaimStore();
    const other = new InMemoryClaimProvider({ identity: identity('other'), store });
    await other.acquire({ platform: 'github', repo: 'acme/widgets', id: '2' }, { ttlMs: 60_000 });

    const executor = identity('me');
    const result = await new ExecuteCapability().execute(makeContext(root, {
      executor,
      claims: new InMemoryClaimProvider({ identity: executor, store }),
      agentCmd: recorderCmd(recordFile, 'me'),
    }));

    expect(result.success).toBe(true);
    expect(result.data?.['claims']).toMatchObject({ acquired: 3, held: 1 });
    expect(readRecords(recordFile).get('me')?.sort()).toEqual([1, 3, 4]);
  }, 30_000);

  it('fails closed when the provider is unavailable: nothing is dispatched', async () => {
    const root = teamDir('unavailable');
    const recordFile = path.join(root, 'dispatched.jsonl');
    const warn = vi.spyOn(console, 'log').mockImplementation(() => {});
    const unavailable: WorkClaimProvider = {
      name: 'git-ref',
      guarantees: { exclusion: 'distributed', leases: true, fencing: true },
      acquire: async () => ({ status: 'unavailable', reason: 'remote unreachable' }),
      renew: async () => ({ status: 'fenced' }),
      release: async () => ({ status: 'released' }),
    };
    try {
      const result = await new ExecuteCapability().execute(makeContext(root, {
        claims: unavailable,
        agentCmd: recorderCmd(recordFile, 'x'),
      }));
      expect(result.success).toBe(true);
      expect(result.summary).toContain('no claimable issues');
      expect(result.data?.['claims']).toMatchObject({ acquired: 0, unavailable: 4 });
      expect(fs.existsSync(recordFile)).toBe(false);
      expect(warn.mock.calls.flat().join('\n')).toContain('remote unreachable');
    } finally {
      warn.mockRestore();
    }
  }, 30_000);
});

describe('watch claims: fencing kills the agent', () => {
  function sleeperContext(name: string, claims: WorkClaimProvider, ttlMs: number, extra: Partial<WatchContext> = {}) {
    const root = teamDir(name);
    const pidFile = path.join(root, 'agent.pid');
    const ctx = makeContext(root, {
      adapter: fakeAdapter([ISSUES[0]!]),
      claims,
      claimTiming: { ttlMs, skewMarginMs: 0 },
      agentCmd: `node ${fwd(SLEEP_SCRIPT)} ${fwd(pidFile)} {prompt}`,
      ...extra,
    });
    return { ctx, pidFile };
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
    throw new Error('stub agent never started');
  }

  it('takeover by another executor fences the holder on renew; agent is killed and release attempted', async () => {
    let clock = 1_000_000;
    const now = () => clock;
    const store = new InMemoryClaimStore();
    const mine = new InMemoryClaimProvider({ identity: identity('A'), store, now });
    const releaseSpy = vi.spyOn(mine, 'release');
    const { ctx, pidFile } = sleeperContext('fence-takeover', mine, 600, { claimTiming: { ttlMs: 600, skewMarginMs: 0, now } });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const started = Date.now();
      const run = new ExecuteCapability().execute(ctx);
      const pid = await waitForPid(pidFile);

      // A's lease lapses; B takes the issue over.
      clock += 10_000;
      const other = new InMemoryClaimProvider({ identity: identity('B'), store, now });
      const takeover = await other.acquire({ platform: 'github', repo: 'acme/widgets', id: '1' }, { ttlMs: 60_000 });
      expect(takeover.status).toBe('acquired');

      const result = await run;
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('fenced');
      expect(await waitForDeath(pid)).toBe(true);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(releaseSpy.mock.calls[0]![1]).toBe('cancelled');
      // B's claim is untouched by A's release attempt.
      expect(store.get('github:acme/widgets#1')?.holder.machineId).toBe('B');
    } finally {
      log.mockRestore();
    }
  }, 30_000);

  it('self-fences when renewals keep failing until expiresAt - skew', async () => {
    const released: FinishOutcome[] = [];
    let renewCalls = 0;
    const ttlMs = 3000;
    const flaky: WorkClaimProvider = {
      name: 'git-ref',
      guarantees: { exclusion: 'distributed', leases: true, fencing: true },
      acquire: async (key: WorkKey, o) => ({
        status: 'acquired',
        claim: {
          key,
          handle: 'h1',
          holder: identity('A'),
          epoch: 1,
          acquiredAt: Date.now(),
          expiresAt: Date.now() + o.ttlMs,
        } satisfies ClaimRecord,
      }),
      renew: async () => {
        renewCalls++;
        throw new Error('network down');
      },
      release: async (_c, outcome) => {
        released.push(outcome);
        throw new Error('network down');
      },
    };
    const { ctx, pidFile } = sleeperContext('fence-unavailable', flaky, ttlMs, {
      claimTiming: { ttlMs, skewMarginMs: 1000 },
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const run = new ExecuteCapability().execute(ctx);
      const pid = await waitForPid(pidFile);
      const result = await run;

      expect(result.success).toBe(false);
      expect(result.summary).toContain('could not be renewed before expiry');
      expect(renewCalls).toBeGreaterThanOrEqual(1);
      expect(await waitForDeath(pid)).toBe(true);
      // Release was attempted; its failure did not escape the capability.
      expect(released).toEqual(['cancelled']);
    } finally {
      log.mockRestore();
    }
  }, 30_000);

  it('keeps the self-fence deadline armed while a renewal is pending', async () => {
    const ttlMs = 180;
    const skewMarginMs = 30;
    const released: FinishOutcome[] = [];
    let renewStarted = false;
    const claim: ClaimRecord = {
      key: { platform: 'github', repo: 'acme/widgets', id: '1' },
      handle: 'pending-renewal',
      holder: identity('A'),
      epoch: 1,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    const provider: WorkClaimProvider = {
      name: 'git-ref',
      guarantees: { exclusion: 'distributed', leases: true, fencing: true },
      acquire: async () => ({ status: 'acquired', claim }),
      renew: async () => {
        renewStarted = true;
        return new Promise(() => {});
      },
      release: async (_claim, outcome) => {
        released.push(outcome);
        return { status: 'released' };
      },
    };
    const ctx = makeContext(teamDir('pending-renewal-deadline'), {
      claims: provider,
      claimTiming: { ttlMs, skewMarginMs },
    });
    const started = Date.now();
    const held = await holdClaimsWhile(
      ctx,
      [claim],
      signal => new Promise<string>(resolve => signal.addEventListener('abort', () => resolve('stopped'), { once: true })),
      (_result, fenced) => fenced ? 'cancelled' : 'completed',
      { debug: () => {}, warn: () => {} },
    );

    expect(renewStarted).toBe(true);
    expect(held.fencedReason).toContain('could not be renewed before expiry');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(released).toEqual(['cancelled']);
  });

  it('releases a remotely applied renewal whose response is still delayed', async () => {
    const ttlMs = 300;
    let live: ClaimRecord | null = {
      key: { platform: 'github', repo: 'acme/widgets', id: '1' },
      handle: 'old',
      holder: identity('A'),
      epoch: 1,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };
    let acknowledgeRenewal!: () => void;
    const renewalAcknowledged = new Promise<void>(resolve => {
      acknowledgeRenewal = resolve;
    });
    let renewalApplied!: () => void;
    const applied = new Promise<void>(resolve => {
      renewalApplied = resolve;
    });
    const releases: string[] = [];
    const provider: WorkClaimProvider = {
      name: 'git-ref',
      guarantees: { exclusion: 'distributed', leases: true, fencing: true },
      acquire: async () => ({ status: 'acquired', claim: live! }),
      renew: async (claim) => {
        const renewed: ClaimRecord = {
          ...claim,
          handle: 'new',
          epoch: claim.epoch + 1,
          expiresAt: Date.now() + ttlMs,
        };
        live = renewed;
        renewalApplied();
        await renewalAcknowledged;
        return { status: 'renewed', claim: renewed };
      },
      release: async (claim) => {
        releases.push(claim.handle);
        if (!live) return { status: 'already-released' };
        if (live.handle !== claim.handle) return { status: 'fenced' };
        live = null;
        return { status: 'released' };
      },
      inspect: async () => live,
    };
    const ctx = makeContext(teamDir('delayed-renewal-release'), {
      claims: provider,
      claimTiming: { ttlMs, skewMarginMs: 0 },
    });

    const held = await holdClaimsWhile(
      ctx,
      [live],
      async () => {
        await applied;
        return 'done';
      },
      () => 'completed',
      { debug: () => {}, warn: () => {} },
    );

    expect(held.result).toBe('done');
    expect(releases).toEqual(['old', 'new']);
    expect(live).toBeNull();

    acknowledgeRenewal();
    await renewalAcknowledged;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(live).toBeNull();
  });

  it('releases with "completed" when the agent exits 0 and "abandoned" when it fails', async () => {
    const outcomes: FinishOutcome[] = [];
    const recording = (): WorkClaimProvider => {
      const inner = new InMemoryClaimProvider({ identity: identity('A') });
      return {
        name: inner.name,
        guarantees: inner.guarantees,
        acquire: (k, o) => inner.acquire(k, o),
        renew: (c, o) => inner.renew(c, o),
        release: async (c, outcome) => {
          outcomes.push(outcome);
          return inner.release(c, outcome);
        },
      };
    };
    const okRoot = teamDir('outcome-ok');
    await new ExecuteCapability().execute(makeContext(okRoot, {
      adapter: fakeAdapter([ISSUES[0]!]),
      claims: recording(),
      agentCmd: recorderCmd(path.join(okRoot, 'r.jsonl'), 'ok'),
    }));
    const failRoot = teamDir('outcome-fail');
    await new ExecuteCapability().execute(makeContext(failRoot, {
      adapter: fakeAdapter([ISSUES[0]!]),
      claims: recording(),
      agentCmd: 'node -e process.exit(3) {prompt}',
    }));
    expect(outcomes).toEqual(['completed', 'abandoned']);
  }, 30_000);
});

describe('watch claims: hybrid same-round dedupe', () => {
  const HYBRID = [
    issue(10, 'Research auth flow'),
    issue(11, 'Fix auth redirect bug'),
    issue(12, 'Review PR comments'),
  ];

  function fleetRecorder(): { cap: FleetDispatchCapability; dispatched: number[] } {
    const dispatched: number[] = [];
    const cap = new FleetDispatchCapability({
      invoke: async (prompt) => {
        dispatched.push(...[...prompt.matchAll(/Issue #(\d+):/g)].map(m => Number(m[1])));
        return { success: true };
      },
    });
    return { cap, dispatched };
  }

  it('execute then fleet-dispatch in one round never dispatch the same issue', async () => {
    const root = teamDir('hybrid');
    const recordFile = path.join(root, 'dispatched.jsonl');
    const round: WatchContext = makeContext(root, {
      adapter: fakeAdapter(HYBRID),
      agentCmd: recorderCmd(recordFile, 'exec'),
      dispatchedThisRound: new Set<number>(),
      config: { timeout: 1, dispatchMode: 'hybrid' },
    });
    const { cap: fleet, dispatched: fleetIssues } = fleetRecorder();

    // Same order and shared round state as runPhase('post-execute', ...)
    const execResult = await new ExecuteCapability().execute({ ...round });
    const fleetResult = await fleet.execute({ ...round });

    const execIssues = readRecords(recordFile).get('exec') ?? [];
    expect(execResult.success).toBe(true);
    expect(fleetResult.success).toBe(true);
    expect(execIssues.sort()).toEqual([10, 11, 12]);
    expect(fleetIssues.filter(n => execIssues.includes(n))).toEqual([]);
  }, 30_000);

  it('fleet-dispatch still batches read-heavy issues nobody dispatched this round', async () => {
    const root = teamDir('hybrid-fleet-only');
    const round: WatchContext = makeContext(root, {
      adapter: fakeAdapter(HYBRID),
      dispatchedThisRound: new Set<number>([11]),
      config: { timeout: 1, dispatchMode: 'hybrid' },
    });
    const { cap: fleet, dispatched } = fleetRecorder();
    const result = await fleet.execute(round);
    expect(result.success).toBe(true);
    expect(dispatched.sort()).toEqual([10, 12]);
    expect([...round.dispatchedThisRound!].sort()).toEqual([10, 11, 12]);
  });

  it('fleet-dispatch claims each issue and releases after the session', async () => {
    const root = teamDir('fleet-claims');
    const store = new InMemoryClaimStore();
    const other = new InMemoryClaimProvider({ identity: identity('other'), store });
    await other.acquire({ platform: 'github', repo: 'acme/widgets', id: '12' }, { ttlMs: 60_000 });
    const me = new InMemoryClaimProvider({ identity: identity('me'), store });
    const { cap, dispatched } = fleetRecorder();
    const result = await cap.execute(makeContext(root, {
      adapter: fakeAdapter(HYBRID),
      claims: me,
      config: { timeout: 1, dispatchMode: 'hybrid' },
    }));
    expect(result.success).toBe(true);
    expect(dispatched).toEqual([10]);
    expect(result.data?.['claims']).toMatchObject({ acquired: 1, held: 1 });
    expect(store.size).toBe(1); // only other's claim on #12 remains
  });

  it('fleet-dispatch kills the session when its claim is fenced', async () => {
    const root = teamDir('fleet-fence');
    let aborted = false;
    const cap = new FleetDispatchCapability({
      invoke: (_prompt, _cwd, _timeout, signal) => new Promise(resolve => {
        signal?.addEventListener('abort', () => {
          aborted = true;
          resolve({ success: false, cancelled: true, error: 'cancelled' });
        });
      }),
    });
    const outcomes: FinishOutcome[] = [];
    const fencing: WorkClaimProvider = {
      name: 'fake',
      guarantees: { exclusion: 'distributed', leases: true, fencing: true },
      acquire: async (key) => ({
        status: 'acquired',
        claim: { key, handle: 'h', holder: identity('A'), epoch: 1, acquiredAt: 0, expiresAt: Date.now() + 60_000 },
      }),
      renew: async () => ({ status: 'fenced' }),
      release: async (_c, outcome) => {
        outcomes.push(outcome);
        return { status: 'fenced' };
      },
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await cap.execute(makeContext(root, {
        adapter: fakeAdapter([HYBRID[0]!]),
        claims: fencing,
        claimTiming: { ttlMs: 90, skewMarginMs: 0 },
        config: { timeout: 1, dispatchMode: 'hybrid' },
      }));
      expect(aborted).toBe(true);
      expect(result.success).toBe(false);
      expect(result.summary).toContain('fenced');
      expect(outcomes).toEqual(['cancelled']);
    } finally {
      log.mockRestore();
    }
  });
});

describe('watch claims: claimed-work prompt contract', () => {
  async function executePrompt(name: string, claims?: WorkClaimProvider): Promise<boolean[]> {
    const root = teamDir(name);
    const recordFile = path.join(root, 'dispatched.jsonl');
    const executor = identity(`machine-${name}`);
    const result = await new ExecuteCapability().execute(makeContext(root, {
      executor,
      ...(claims ? { claims } : {}),
      agentCmd: recorderCmd(recordFile, 'p'),
    }));
    expect(result.success, result.summary).toBe(true);
    return readContractFlags(recordFile, 'p');
  }

  async function fleetPrompt(name: string, claims?: WorkClaimProvider): Promise<string> {
    const prompts: string[] = [];
    const cap = new FleetDispatchCapability({
      invoke: async (prompt) => {
        prompts.push(prompt);
        return { success: true };
      },
    });
    const result = await cap.execute(makeContext(teamDir(name), {
      adapter: fakeAdapter([issue(20, 'Research auth flow')]),
      ...(claims ? { claims } : {}),
      config: { timeout: 1, dispatchMode: 'hybrid' },
    }));
    expect(result.success, result.summary).toBe(true);
    expect(prompts).toHaveLength(1);
    return prompts[0]!;
  }

  it('execute tells the agent to work only its claimed issues under an exclusive provider', async () => {
    const provider = new InMemoryClaimProvider({ identity: identity('contract'), store: new InMemoryClaimStore() });
    expect(await executePrompt('contract-exclusive', provider)).toEqual([true]);
  }, 30_000);

  it('execute keeps today\'s prompt with no provider or the none provider', async () => {
    expect(await executePrompt('contract-default')).toEqual([false]);
    expect(await executePrompt('contract-noop', new NoopClaimProvider({ identity: identity('noop') }))).toEqual([false]);
  }, 30_000);

  it('fleet-dispatch adds the claimed-work rule only under an exclusive provider', async () => {
    const provider = new InMemoryClaimProvider({ identity: identity('fleet-contract'), store: new InMemoryClaimStore() });
    const claimed = await fleetPrompt('fleet-contract-exclusive', provider);
    expect(claimed).toContain('Claimed work: these issues are claimed for this session. Analyze ONLY these issues');
    expect(claimed).toContain('do not pick up, self-assign, or take over any other issue');

    const legacy = await fleetPrompt('fleet-contract-default');
    expect(legacy).not.toContain('Claimed work');
    expect(legacy.trimEnd().endsWith('Rules: All tracks READ-ONLY. Write findings as issue comments. Run in parallel.')).toBe(true);
  });
});

describe('watch claims: config and flag precedence', () => {
  function withConfig(name: string, watch: Record<string, unknown>): string {
    const root = teamDir(name);
    fs.writeFileSync(path.join(root, '.squad', 'config.json'), JSON.stringify({ watch }));
    return root;
  }

  it('defaults to no claims provider (none)', () => {
    expect(loadWatchConfig(teamDir('cfg-default'), {}).claims).toBeUndefined();
  });

  it('accepts a provider name string', () => {
    const root = withConfig('cfg-string', { claims: 'git-ref' });
    expect(loadWatchConfig(root, {}).claims).toEqual({ provider: 'git-ref' });
  });

  it('accepts the object form with tuning options', () => {
    const claims = { provider: 'git-ref', ttlMs: 600_000, skewMarginMs: 60_000, remote: 'upstream', refPrefix: 'refs/heads/squad-claims/' };
    const root = withConfig('cfg-object', { claims });
    expect(loadWatchConfig(root, {}).claims).toEqual(claims);
  });

  it('--claims overrides the config provider and keeps file tuning options', () => {
    const root = withConfig('cfg-override', { claims: { provider: 'git-ref', remote: 'upstream', ttlMs: 600_000 } });
    expect(loadWatchConfig(root, { claims: { provider: 'none' } }).claims)
      .toEqual({ provider: 'none', remote: 'upstream', ttlMs: 600_000 });
    const plain = teamDir('cfg-flag-only');
    expect(loadWatchConfig(plain, { claims: { provider: 'git-ref' } }).claims).toEqual({ provider: 'git-ref' });
  });

  it('treats claims as a reserved key, not a capability', () => {
    const root = withConfig('cfg-reserved', { claims: { provider: 'none' }, board: true });
    const config = loadWatchConfig(root, {});
    expect(config.capabilities).toEqual({ board: true });
    expect(config.capabilities).not.toHaveProperty('claims');
  });

  it('rejects invalid values instead of silently running without claims', () => {
    for (const bad of ['gitref', { provider: 'redis' }, { provider: 'git-ref', ttlMs: 0 }, { provider: 'git-ref', remote: '' }, 42]) {
      const root = withConfig(`cfg-bad-${randomUUID().slice(0, 6)}`, { claims: bad });
      expect(() => loadWatchConfig(root, {})).toThrow(WatchConfigError);
    }
  });

  it('rejects lease timing that would turn renewals into a push loop', () => {
    const HOUR = 60 * 60_000;
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ ttlMs: 60_000, skewMarginMs: 30_000 }, /greater than twice/],
      [{ ttlMs: 200_000 }, /greater than twice/], // default skew 2m
      [{ ttlMs: 10_000, skewMarginMs: 0 }, /at least 30000/],
      [{ ttlMs: 25 * HOUR }, /at most 86400000/],
      [{ ttlMs: 3 * 2 ** 31 }, /at most 86400000/], // ttl/3 would overflow setTimeout
      [{ ttlMs: 24 * HOUR, skewMarginMs: 2 * HOUR }, /skewMarginMs must be at most/],
    ];
    for (const [tuning, why] of bad) {
      const root = withConfig(`cfg-timing-${randomUUID().slice(0, 6)}`, { claims: { provider: 'git-ref', ...tuning } });
      expect(() => loadWatchConfig(root, {}), JSON.stringify(tuning)).toThrow(why);
    }
    const ok = withConfig('cfg-timing-ok', { claims: { provider: 'git-ref', ttlMs: 30_000, skewMarginMs: 10_000 } });
    expect(loadWatchConfig(ok, {}).claims).toEqual({ provider: 'git-ref', ttlMs: 30_000, skewMarginMs: 10_000 });
  });

  it('fails closed when .squad/config.json exists but is not valid JSON', () => {
    const root = teamDir('cfg-malformed');
    fs.writeFileSync(path.join(root, '.squad', 'config.json'), '{ "watch": { "claims": "git-ref", } ');
    expect(() => loadWatchConfig(root, {})).toThrow(WatchConfigError);
    expect(() => loadWatchConfig(root, {})).toThrow(/not valid JSON/);
    const bom = teamDir('cfg-bom');
    fs.writeFileSync(path.join(bom, '.squad', 'config.json'), `\uFEFF${JSON.stringify({ watch: { claims: 'git-ref' } })}`);
    expect(loadWatchConfig(bom, {}).claims).toEqual({ provider: 'git-ref' });
  });

  it('fails closed for empty or unreadable config; only absence selects defaults', () => {
    const empty = teamDir('cfg-empty');
    fs.writeFileSync(path.join(empty, '.squad', 'config.json'), '');
    expect(() => loadWatchConfig(empty, {})).toThrow(WatchConfigError);
    expect(() => loadWatchConfig(empty, {})).toThrow(/not valid JSON/);

    const unreadable = teamDir('cfg-unreadable');
    const configPath = path.join(unreadable, '.squad', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ watch: { claims: 'git-ref' } }));
    const read = vi.spyOn(FSStorageProvider.prototype, 'readSync').mockImplementation((filePath) => {
      if (filePath === configPath) throw new Error('permission denied');
      return undefined;
    });
    try {
      expect(() => loadWatchConfig(unreadable, {})).toThrow(/Could not read .*permission denied/);
    } finally {
      read.mockRestore();
    }

    expect(loadWatchConfig(teamDir('cfg-absent'), {}).claims).toBeUndefined();
  });

  it('warns about unknown watch.claims keys and keeps the known ones', () => {
    const root = withConfig('cfg-unknown-key', { claims: { provider: 'git-ref', ttl: 600_000, remote: 'upstream' } });
    const warnings: string[] = [];
    const config = loadWatchConfig(root, {}, { warn: m => warnings.push(m) });
    expect(config.claims).toEqual({ provider: 'git-ref', remote: 'upstream' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/watch\.claims: unknown key "ttl" ignored/);
    expect(parseWatchClaimsConfig({ provider: 'none' }).warnings).toBeUndefined();
  });

  it('parse and merge helpers', () => {
    expect(parseWatchClaimsConfig(undefined)).toEqual({});
    expect(parseWatchClaimsConfig('none')).toEqual({ config: { provider: 'none' } });
    expect(parseWatchClaimsConfig('nope').error).toContain('unknown provider');
    expect(mergeWatchClaimsConfig(undefined, undefined)).toBeUndefined();
    expect(mergeWatchClaimsConfig({ provider: 'git-ref', remote: 'r' }, undefined)).toEqual({ provider: 'git-ref', remote: 'r' });
  });

  it('builds the selected provider and describes its guarantees', async () => {
    const id = identity('m');
    const timing = { ttlMs: 15 * 60_000, skewMarginMs: 2 * 60_000 };
    const none = await createWatchClaimProvider(undefined, { teamRoot: ROOT, identity: id });
    expect(none.name).toBe('none');
    expect(describeClaimProvider(none, timing)).toContain('no cross-process exclusion');

    const git = await createWatchClaimProvider({ provider: 'git-ref', remote: 'upstream' }, { teamRoot: ROOT, identity: id });
    expect(git.name).toBe('git-ref');
    expect((git as unknown as { remote: string }).remote).toBe('upstream');
    expect(describeClaimProvider(git, timing, { remote: 'upstream' }))
      .toBe('Claims: git-ref — distributed exclusion, leases on, fencing on (ttl 15m, renew every 5m, skew 2m, remote upstream)');

    await expect(createWatchClaimProvider({ provider: 'git-ref', refPrefix: 'not-a-ref' }, { teamRoot: ROOT, identity: id }))
      .rejects.toThrow();
  });

  it('derives work keys from the issue URL, falling back to the work repo', () => {
    const ctx = makeContext(ROOT, { workRepo: 'Fallback/Repo' });
    expect(workKeyFor(ctx, { number: 7, url: 'https://github.com/Acme/Widgets/issues/7' }))
      .toEqual({ platform: 'github', repo: 'Acme/Widgets', id: '7' });
    expect(workKeyFor(ctx, { number: 8 })).toEqual({ platform: 'github', repo: 'Fallback/Repo', id: '8' });
    expect(workKeyFor({ ...ctx, workRepo: undefined }, { number: 9 })).toBeNull();
  });
});

describe('watch claims: unsafe lease timing never reaches the renew timer', () => {
  const key: WorkKey = { platform: 'github', repo: 'acme/widgets', id: '1' };
  const silent = { debug: () => {}, warn: () => {} };

  for (const [label, timing] of [
    ['ttlMs <= 2 * skewMarginMs', { ttlMs: 1_000, skewMarginMs: 1_000 }],
    ['ttlMs beyond 24h (setTimeout overflow)', { ttlMs: 30 * 24 * 60 * 60_000, skewMarginMs: 0 }],
  ] as const) {
    it(`holdClaimsWhile refuses ${label}: no work, no renewals, claims released`, async () => {
      const provider = new InMemoryClaimProvider({ identity: identity('A') });
      const acquired = await provider.acquire(key, { ttlMs: 1_000 });
      if (acquired.status !== 'acquired') throw new Error(acquired.status);
      const renew = vi.spyOn(provider, 'renew');
      const release = vi.spyOn(provider, 'release');
      const work = vi.fn(() => new Promise<string>(r => setTimeout(() => r('done'), 200)));
      const ctx = makeContext(ROOT, { claims: provider, claimTiming: { ...timing } });

      await expect(holdClaimsWhile(ctx, [acquired.claim], work, () => 'completed', silent))
        .rejects.toThrow(/invalid claim timing/);
      expect(work).not.toHaveBeenCalled();
      expect(renew).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledWith(expect.objectContaining({ handle: acquired.claim.handle }), 'cancelled');
      expect(provider.store.size).toBe(0);
    });
  }

  it('acquireClaims reports every item unavailable under unsafe timing (fail closed)', async () => {
    const provider = new InMemoryClaimProvider({ identity: identity('A') });
    const acquire = vi.spyOn(provider, 'acquire');
    const warns: string[] = [];
    const ctx = makeContext(ROOT, { claims: provider, claimTiming: { ttlMs: 1_000, skewMarginMs: 1_000 } });
    const result = await acquireClaims(ctx, [{ number: 1 }, { number: 2 }], { debug: () => {}, warn: m => warns.push(m) });
    expect(result.won).toEqual([]);
    expect(result.unavailable.map(u => u.item.number)).toEqual([1, 2]);
    expect(acquire).not.toHaveBeenCalled();
    expect(warns.join('\n')).toMatch(/invalid claim timing/);
  });
});

describe('watch claims: acquisition that outlasts a lease never dispatches on a stale claim', () => {
  const ttlMs = 30_000;
  const skewMarginMs = 5_000;

  /**
   * A and B share one store and one clock. A's acquire of every issue after
   * #1 takes `stall` ms (a slow remote), so by the time A's batch is complete
   * its claim on #1 is past `expiresAt - skewMarginMs`; when `takeover` is
   * set, B legitimately takes #1 over once it is past `expiresAt + skewMarginMs`.
   */
  function slowAcquisition(opts: { stall: number; takeover: boolean }) {
    let t = 1_000_000;
    const now = (): number => t;
    const store = new InMemoryClaimStore();
    const a = new InMemoryClaimProvider({ identity: identity('slow-A'), store, now, skewMarginMs });
    const b = new InMemoryClaimProvider({ identity: identity('fast-B'), store, now, skewMarginMs });
    const acquire = a.acquire.bind(a);
    const bTook: string[] = [];
    vi.spyOn(a, 'acquire').mockImplementation(async (key, o) => {
      if (key.id !== '1') {
        t += opts.stall;
        if (opts.takeover && bTook.length === 0) {
          const r = await b.acquire({ platform: 'github', repo: 'acme/widgets', id: '1' }, { ttlMs });
          bTook.push(r.status);
        }
      }
      return acquire(key, o);
    });
    const ctx = (root: string, extra: Partial<WatchContext> = {}): WatchContext => makeContext(root, {
      executor: identity('slow-A'),
      claims: a,
      claimTiming: { ttlMs, skewMarginMs, now },
      ...extra,
    });
    return { a, b, bTook, ctx, now };
  }

  it('drops a claim another executor took over during acquisition, so its issue is never dispatched', async () => {
    const { b, bTook, ctx } = slowAcquisition({ stall: ttlMs + skewMarginMs + 1, takeover: true });
    const recordFile = path.join(ROOT, 'stale-takeover.jsonl');
    const warns: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((m: unknown) => { warns.push(String(m)); });
    try {
      const result = await new ExecuteCapability().execute(ctx(teamDir('stale-takeover'), {
        adapter: fakeAdapter(ISSUES.slice(0, 2)),
        agentCmd: recorderCmd(recordFile, 'A'),
      }));
      expect(bTook, 'B takeover of #1 while A was still acquiring').toEqual(['acquired']);
      expect(readRecords(recordFile).get('A'), `A dispatched issues: ${result.summary}`).toEqual([2]);
      expect(result.success, result.summary).toBe(true);
      expect(warns.join('\n')).toMatch(/claim #1 fenced by fast-B\/fast-B-instance before dispatch/);
      expect((await b.inspect({ platform: 'github', repo: 'acme/widgets', id: '1' }))?.holder.machineId).toBe('fast-B');
    } finally {
      log.mockRestore();
    }
  });

  it('renews a claim that reached its renew deadline during acquisition and keeps it', async () => {
    const { a, ctx, now } = slowAcquisition({ stall: ttlMs - skewMarginMs, takeover: false });
    const renew = vi.spyOn(a, 'renew');
    const result = await acquireClaims(ctx(ROOT), [{ number: 1 }, { number: 2 }], { debug: () => {}, warn: () => {} });
    expect(result.won.map(w => w.item.number)).toEqual([1, 2]);
    expect(renew).toHaveBeenCalledTimes(1);
    const one = result.won[0]!.claim;
    expect(one.epoch).toBe(2);
    expect(one.expiresAt).toBe(now() + ttlMs);
  });

  it('reports the claim unavailable (lost) when that renewal fails', async () => {
    const { a, ctx } = slowAcquisition({ stall: ttlMs - skewMarginMs, takeover: false });
    vi.spyOn(a, 'renew').mockRejectedValue(new Error('remote unreachable'));
    const result = await acquireClaims(ctx(ROOT), [{ number: 1 }, { number: 2 }], { debug: () => {}, warn: () => {} });
    expect(result.won.map(w => w.item.number)).toEqual([2]);
    expect(result.unavailable.map(u => [u.item.number, u.reason])).toEqual([
      [1, 'claim expired during acquisition and could not be renewed: remote unreachable'],
    ]);
  });

  it('does a final handoff check after parallel renewals, so an earlier claim cannot re-stale', async () => {
    let t = 1_000_000;
    const now = (): number => t;
    const store = new InMemoryClaimStore();
    const mine = new InMemoryClaimProvider({ identity: identity('slow-A'), store, now, skewMarginMs });
    const other = new InMemoryClaimProvider({ identity: identity('fast-B'), store, now, skewMarginMs });
    const acquire = mine.acquire.bind(mine);
    vi.spyOn(mine, 'acquire').mockImplementation(async (key, opts) => {
      if (key.id === '3') t += ttlMs - skewMarginMs;
      return acquire(key, opts);
    });
    const renew = mine.renew.bind(mine);
    vi.spyOn(mine, 'renew').mockImplementation(async (claim, opts) => {
      if (claim.key.id === '2') {
        t += ttlMs + skewMarginMs + 1;
        const takeover = await other.acquire(
          { platform: 'github', repo: 'acme/widgets', id: '1' },
          { ttlMs },
        );
        expect(takeover.status).toBe('acquired');
      }
      return renew(claim, opts);
    });
    const root = teamDir('final-handoff');
    const recordFile = path.join(root, 'dispatch.jsonl');
    const result = await new ExecuteCapability().execute(makeContext(root, {
      adapter: fakeAdapter(ISSUES.slice(0, 3)),
      executor: identity('slow-A'),
      claims: mine,
      claimTiming: { ttlMs, skewMarginMs, now },
      agentCmd: recorderCmd(recordFile, 'A'),
    }));

    expect(result.success, result.summary).toBe(true);
    expect(readRecords(recordFile).get('A')).toEqual([2, 3]);
    expect((await other.inspect({ platform: 'github', repo: 'acme/widgets', id: '1' }))?.holder.machineId)
      .toBe('fast-B');
  });
});

describe('watch claims: fence kill reaches the whole process tree', () => {
  const fakeChild = (patch: Record<string, unknown> = {}) => ({
    pid: 424242,
    exitCode: null as number | null,
    signalCode: null as string | null,
    kill: vi.fn(() => true),
    ...patch,
  });

  it('POSIX agents are spawned as process-group leaders', () => {
    expect(agentProcessGroupOptions('linux')).toEqual({ detached: true });
    expect(agentProcessGroupOptions('darwin')).toEqual({ detached: true });
    expect(agentProcessGroupOptions('win32')).toEqual({ detached: false });
  });

  it('POSIX: kills the process group (-pid), not just the direct child', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation((() => true) as typeof process.kill);
    try {
      const child = fakeChild();
      killProcessTree(child, 'linux');
      expect(kill).toHaveBeenCalledWith(-424242, 'SIGKILL');
      expect(child.kill).not.toHaveBeenCalled();
    } finally {
      kill.mockRestore();
    }
  });

  it('POSIX: falls back to the direct child when it does not lead a group (ESRCH)', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation((() => {
      throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' });
    }) as typeof process.kill);
    try {
      const child = fakeChild();
      killProcessTree(child, 'linux');
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    } finally {
      kill.mockRestore();
    }
  });

  it('does nothing once the child has exited (its PID may already be reused)', () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation((() => true) as typeof process.kill);
    try {
      for (const exited of [fakeChild({ exitCode: 0 }), fakeChild({ signalCode: 'SIGTERM' })]) {
        killProcessTree(exited, 'linux');
        expect(exited.kill).not.toHaveBeenCalled();
      }
      expect(kill).not.toHaveBeenCalled();
    } finally {
      kill.mockRestore();
    }
  });

  it('does not release a claim on timeout until the agent process tree has stopped', async () => {
    const root = teamDir(`timeout-tree-${process.platform}`);
    const heartbeat = path.join(root, 'heartbeat.txt');
    const inner = new InMemoryClaimProvider({ identity: identity('timeout-A') });
    const acquired = await inner.acquire(
      { platform: 'github', repo: 'acme/widgets', id: '1' },
      { ttlMs: 30_000 },
    );
    if (acquired.status !== 'acquired') throw new Error(acquired.status);
    let treeStoppedBeforeRelease = false;
    const provider: WorkClaimProvider = {
      name: inner.name,
      guarantees: inner.guarantees,
      acquire: (key, opts) => inner.acquire(key, opts),
      renew: (claim, opts) => inner.renew(claim, opts),
      release: async (claim, outcome) => {
        const before = fs.existsSync(heartbeat) ? fs.statSync(heartbeat).size : 0;
        await new Promise(resolve => setTimeout(resolve, 100));
        const after = fs.existsSync(heartbeat) ? fs.statSync(heartbeat).size : 0;
        treeStoppedBeforeRelease = before > 0 && after === before;
        return inner.release(claim, outcome);
      },
    };
    const held = await holdClaimsWhile(
      makeContext(root, {
        claims: provider,
        claimTiming: { ttlMs: 30_000, skewMarginMs: 0 },
      }),
      [acquired.claim],
      signal => spawnAgent('node', [TREE_PARENT_SCRIPT, heartbeat], root, 400, undefined, undefined, signal),
      result => result?.success ? 'completed' : 'abandoned',
      { debug: () => {}, warn: () => {} },
    );

    expect(held.result.timedOut).toBe(true);
    expect(treeStoppedBeforeRelease, `descendant still wrote after release began on ${process.platform}`).toBe(true);
  }, 15_000);

  it.skipIf(process.platform === 'win32')('abort kills a grandchild the agent forked (real process group)', async () => {
    const dir = teamDir('group-kill');
    const heartbeat = path.join(dir, 'heartbeat.txt');
    const controller = new AbortController();
    const run = spawnAgent('node', [TREE_PARENT_SCRIPT, heartbeat], dir, 20_000, undefined, undefined, controller.signal);
    const deadline = Date.now() + 10_000;
    while (!fs.existsSync(heartbeat) || fs.statSync(heartbeat).size === 0) {
      if (Date.now() > deadline) throw new Error('grandchild heartbeat never started');
      await new Promise(r => setTimeout(r, 25));
    }
    controller.abort(new Error('claim fenced'));
    const result = await run;
    const stoppedAt = fs.statSync(heartbeat).size;
    await new Promise(r => setTimeout(r, 100));
    expect(result.cancelled).toBe(true);
    expect(fs.statSync(heartbeat).size).toBe(stoppedAt);
  }, 30_000);
});
