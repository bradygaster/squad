/**
 * Runtime upstream inheritance (Squad 2.0, finding F1).
 *
 * `resolveUpstreams()` is what the coordinator (via `squad_state_upstreams`), `squad doctor`
 * and `squad status` call at session start. These tests pin the contract the coordinator
 * relies on: deterministic precedence, provenance on every inherited item, a depth limit,
 * cycle detection, soft failure for missing/stale/unavailable sources, and no network I/O.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_UPSTREAM_MAX_DEPTH,
  buildEffectiveUpstreamContext,
  formatUpstreamReport,
  resolveUpstreams,
  upstreamProvenance,
} from '../packages/squad-sdk/src/upstream/index.js';
import { ToolRegistry } from '../packages/squad-sdk/src/tools/index.js';
import { createStateMcpSession } from '../packages/squad-cli/src/cli/commands/state-mcp.js';
import { checkUpstreams } from '../packages/squad-cli/src/cli/commands/doctor.js';
import { clearResolveSquadCache } from '../packages/squad-sdk/src/resolution.js';

let tmp: string;

function squad(dir: string, opts: { skills?: Record<string, string>; decisions?: string; routing?: string; policy?: object; upstreams?: object[] } = {}): string {
  const sq = path.join(dir, '.squad');
  fs.mkdirSync(sq, { recursive: true });
  fs.writeFileSync(path.join(sq, 'team.md'), `# ${path.basename(dir)}\n`);
  for (const [name, body] of Object.entries(opts.skills ?? {})) {
    fs.mkdirSync(path.join(sq, 'skills', name), { recursive: true });
    fs.writeFileSync(path.join(sq, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\n${body}\n`);
  }
  if (opts.decisions) fs.writeFileSync(path.join(sq, 'decisions.md'), opts.decisions);
  if (opts.routing) fs.writeFileSync(path.join(sq, 'routing.md'), opts.routing);
  if (opts.policy) {
    fs.mkdirSync(path.join(sq, 'casting'), { recursive: true });
    fs.writeFileSync(path.join(sq, 'casting', 'policy.json'), JSON.stringify(opts.policy));
  }
  if (opts.upstreams) fs.writeFileSync(path.join(sq, 'upstream.json'), JSON.stringify({ upstreams: opts.upstreams }, null, 2));
  return sq;
}

const local = (name: string, source: string, extra: object = {}) => ({ name, type: 'local', source, added_at: '2026-01-01T00:00:00.000Z', last_synced: null, ...extra });

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-upstream-rt-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

describe('resolveUpstreams: precedence and provenance', () => {
  it('orders upstreams by declaration, then depth-first into their own upstreams, and tags every item with upstream:<name>@<ref>', () => {
    const grand = squad(path.join(tmp, 'grand'), { decisions: '# grand\n' });
    const org = squad(path.join(tmp, 'org'), { decisions: '# org\n', upstreams: [local('grand', path.dirname(grand))] });
    const team = squad(path.join(tmp, 'team'), { decisions: '# team\n' });
    const repo = squad(path.join(tmp, 'repo'), { upstreams: [local('org', path.dirname(org)), local('team', path.dirname(team))] });

    const res = resolveUpstreams(repo)!;
    expect(res.upstreams.map((u) => `${u.name}@${u.depth}`), 'declared order, each followed by its own upstreams').toEqual(['org@1', 'grand@2', 'team@1']);
    expect(res.upstreams.map((u) => u.provenance)).toEqual(['upstream:org@local', 'upstream:grand@local', 'upstream:team@local']);
    expect(res.upstreams[1]!.via, 'transitive entries record the chain they were reached through').toEqual(['org']);
    expect(res.diagnostics).toEqual([]);
    expect(upstreamProvenance('platform', 'git', 'release/2.0')).toBe('upstream:platform@release/2.0');
    expect(upstreamProvenance('platform', 'git')).toBe('upstream:platform@main');
  });

  it('local .squad/ wins skill-name conflicts, then the earliest upstream; losers are kept with overriddenBy', () => {
    const org = squad(path.join(tmp, 'org'), { skills: { logging: 'org logging', 'api-style': 'org api' }, policy: { universe_allowlist: ['org'] } });
    const team = squad(path.join(tmp, 'team'), { skills: { logging: 'team logging', testing: 'team testing' }, policy: { universe_allowlist: ['team'] } });
    const repo = squad(path.join(tmp, 'repo'), { skills: { 'api-style': 'repo api' }, upstreams: [local('org', path.dirname(org)), local('team', path.dirname(team))] });

    const effective = buildEffectiveUpstreamContext(resolveUpstreams(repo), ['api-style'], false);
    const byName = (n: string) => effective.skills.filter((s) => s.name === n);
    expect(byName('api-style')[0]!.overriddenBy, 'local skill wins over org').toBe('local');
    expect(byName('logging').map((s) => [s.provenance, s.overriddenBy])).toEqual([
      ['upstream:org@local', null],
      ['upstream:team@local', 'upstream:org@local'],
    ]);
    expect(byName('testing')[0]!.overriddenBy).toBeNull();
    expect(effective.castingPolicy?.provenance, 'first casting policy in precedence order wins').toBe('upstream:org@local');
    expect(buildEffectiveUpstreamContext(resolveUpstreams(repo), [], true).castingPolicy, 'local casting policy wins when present').toBeNull();
  });

  it('a diamond (repo -> org, repo -> team -> org) inherits org once, from its earliest position', () => {
    const org = squad(path.join(tmp, 'org'), { decisions: '# org\n' });
    const team = squad(path.join(tmp, 'team'), { decisions: '# team\n', upstreams: [local('org', path.dirname(org))] });
    const repo = squad(path.join(tmp, 'repo'), { upstreams: [local('org', path.dirname(org)), local('team', path.dirname(team))] });
    const res = resolveUpstreams(repo)!;
    expect(res.upstreams.map((u) => `${u.name}@${u.depth}`)).toEqual(['org@1', 'team@1']);
    expect(res.diagnostics).toEqual([]);
  });

  it('accepts a source that already points at the .squad directory (the documented `squad upstream add ../org/.squad` form)', () => {
    const org = squad(path.join(tmp, 'org'), { decisions: '# org decisions\n' });
    const repo = squad(path.join(tmp, 'repo'), { upstreams: [local('org', org)] });
    const [u] = resolveUpstreams(repo)!.upstreams;
    expect(u!.status, `source ${org} should resolve as a squad dir, got ${u!.diagnostic}`).toBe('ok');
    expect(u!.decisions).toContain('org decisions');
  });
});

describe('resolveUpstreams: depth limit and cycles', () => {
  it('stops at the depth limit and reports what it did not read', () => {
    const d4 = squad(path.join(tmp, 'd4'), { decisions: 'd4' });
    const d3 = squad(path.join(tmp, 'd3'), { decisions: 'd3', upstreams: [local('d4', path.dirname(d4))] });
    const d2 = squad(path.join(tmp, 'd2'), { decisions: 'd2', upstreams: [local('d3', path.dirname(d3))] });
    const d1 = squad(path.join(tmp, 'd1'), { decisions: 'd1', upstreams: [local('d2', path.dirname(d2))] });
    const repo = squad(path.join(tmp, 'repo'), { upstreams: [local('d1', path.dirname(d1))] });

    expect(DEFAULT_UPSTREAM_MAX_DEPTH).toBe(3);
    const res = resolveUpstreams(repo)!;
    expect(res.upstreams.map((u) => `${u.name}:${u.status}`)).toEqual(['d1:ok', 'd2:ok', 'd3:ok', 'd4:depth-exceeded']);
    expect(res.upstreams[3]!.decisions, 'content beyond the limit is not read').toBeNull();
    expect(res.diagnostics[0]).toMatch(/d4: declared by d3 at depth 4, beyond the limit of 3; not read/);

    const shallow = resolveUpstreams(repo, undefined, { maxDepth: 1 })!;
    expect(shallow.upstreams.map((u) => `${u.name}:${u.status}`)).toEqual(['d1:ok', 'd2:depth-exceeded']);
  });

  it('detects cycles back to the root and between upstreams without recursing forever', () => {
    const repoDir = path.join(tmp, 'repo');
    const aDir = path.join(tmp, 'a');
    const bDir = path.join(tmp, 'b');
    squad(aDir, { decisions: 'a', upstreams: [local('b', bDir)] });
    squad(bDir, { decisions: 'b', upstreams: [local('a', aDir), local('repo-again', repoDir)] });
    const repo = squad(repoDir, { upstreams: [local('a', aDir)] });

    const res = resolveUpstreams(repo)!;
    expect(res.upstreams.map((u) => `${u.name}:${u.status}`)).toEqual(['a:ok', 'b:ok', 'a:cycle', 'repo-again:cycle']);
    const cycles = res.upstreams.filter((u) => u.status === 'cycle');
    expect(cycles[0]!.diagnostic).toMatch(/a: cycle detected \(a -> b -> a resolves back to .*\); not read/);
    expect(cycles[1]!.diagnostic).toMatch(/repo-again: cycle detected \(a -> b -> repo-again resolves back to .*\); not read/);
    expect(cycles.every((u) => u.decisions === null && u.skills.length === 0), 'cycle entries carry no content').toBe(true);
  });
});

describe('resolveUpstreams: soft failures and no implicit fetch', () => {
  it('reports missing local paths, unsynced git clones, stale clones and invalid entries with actionable diagnostics, and still reads the rest', () => {
    const good = squad(path.join(tmp, 'good'), { decisions: '# good\n' });
    const repo = squad(path.join(tmp, 'repo'), {
      upstreams: [
        local('gone', path.join(tmp, 'does-not-exist')),
        { name: 'platform', type: 'git', source: 'https://example.invalid/platform.git', ref: 'main', added_at: '2026-01-01T00:00:00.000Z', last_synced: null },
        { name: 'old', type: 'git', source: 'https://example.invalid/old.git', ref: 'v1', added_at: '2026-01-01T00:00:00.000Z', last_synced: '2025-01-01T00:00:00.000Z' },
        { name: 'broken', type: 'export', source: path.join(tmp, 'broken.json'), added_at: '2026-01-01T00:00:00.000Z', last_synced: null },
        { type: 'local', source: '/nope' },
        local('good', path.dirname(good)),
      ],
    });
    // "old" was synced by `squad upstream sync` long ago: materialize its clone so it is readable but stale.
    squad(path.join(repo, '_upstream_repos', 'old'), { decisions: '# old decisions\n' });
    fs.writeFileSync(path.join(tmp, 'broken.json'), '{ not json');

    const res = resolveUpstreams(repo, undefined, { now: new Date('2026-10-22T00:00:00Z') })!;
    const status = Object.fromEntries(res.upstreams.map((u) => [u.name, u.status]));
    expect(status).toEqual({ gone: 'missing', platform: 'unavailable', old: 'stale', broken: 'invalid', '(unnamed)': 'invalid', good: 'ok' });

    const diag = res.diagnostics.join('\n');
    expect(diag).toMatch(/gone: local source not found \(.*does-not-exist\); fix the path or run "squad upstream remove gone"/);
    expect(diag).toMatch(/platform: git upstream is not materialized locally \(.*_upstream_repos.*platform missing\); run "squad upstream sync platform" — session start never fetches/);
    expect(diag).toMatch(/old: using the local clone but it may be out of date \(last synced \d+ days ago\); run "squad upstream sync old" to refresh/);
    expect(diag).toMatch(/broken: export file is not valid JSON/);
    expect(diag).toMatch(/\(unnamed\): malformed upstream.json entry/);

    expect(res.upstreams.find((u) => u.name === 'old')!.decisions, 'stale clones are still read').toContain('old decisions');
    expect(res.upstreams.find((u) => u.name === 'good')!.decisions, 'healthy upstreams after failures are still read').toContain('good');
    expect(fs.existsSync(path.join(repo, '_upstream_repos', 'platform')), 'resolution must not clone anything').toBe(false);
  });

  it('formatUpstreamReport names provenance, status, diagnostics and the effective skills; detail appends inherited bodies', () => {
    const org = squad(path.join(tmp, 'org'), { skills: { logging: 'use structured logs' }, decisions: '# org decisions\n\n### Use pino\n', routing: '| Security | SecLead |\n' });
    const repo = squad(path.join(tmp, 'repo'), { upstreams: [local('org', path.dirname(org)), local('ghost', path.join(tmp, 'ghost'))] });
    const res = resolveUpstreams(repo);
    const effective = buildEffectiveUpstreamContext(res, []);

    const summary = formatUpstreamReport(res, effective);
    expect(summary).toContain('local .squad/ wins');
    expect(summary).toContain('nothing is fetched at session start');
    expect(summary).toMatch(/- org \[upstream:org@local\] local: .* — ok — 1 skill, decisions, routing/);
    expect(summary).toMatch(/- ghost \[upstream:ghost@local\] local: .* — missing/);
    expect(summary).toMatch(/! ghost: local source not found/);
    expect(summary).toContain('- logging — upstream:org@local — active');
    expect(summary).toContain('Inherited decisions: upstream:org@local');
    expect(summary).not.toContain('Use pino');

    const detail = formatUpstreamReport(res, effective, { detail: true });
    expect(detail).toContain('--- decisions from upstream:org@local ---');
    expect(detail).toContain('### Use pino');
    expect(detail).toContain('--- skill logging from upstream:org@local ---');
    expect(detail).toContain('use structured logs');

    expect(formatUpstreamReport(null, buildEffectiveUpstreamContext(null))).toMatch(/No upstream.json/);
  });
});

describe('squad_state_upstreams: the bridge hosts call at session start', () => {
  it('ToolRegistry exposes squad_state_upstreams and it reports inherited context with provenance', async () => {
    const org = squad(path.join(tmp, 'org'), { skills: { 'org-logging': 'log as JSON' }, decisions: '# org\n\n### Every service emits traces\n' });
    const repo = squad(path.join(tmp, 'repo'), { skills: { 'org-logging': 'repo override' }, upstreams: [local('org', path.dirname(org))] });
    const registry = new ToolRegistry(repo);
    const tool = registry.getTool('squad_state_upstreams');
    expect(tool, 'squad_state_upstreams must be a registered runtime tool').toBeDefined();

    const summary = await tool!.handler({}, { toolName: 'squad_state_upstreams', toolCallId: 't1', arguments: {}, sessionId: 'test' });
    const text = typeof summary === 'string' ? summary : summary.textResultForLlm!;
    expect(text).toContain('upstream:org@local');
    expect(text, 'local skill of the same name wins').toContain('- org-logging — upstream:org@local — overridden by local');
    expect(text).toContain('Inherited decisions: upstream:org@local');

    const detailed = await tool!.handler({ detail: true }, { toolName: 'squad_state_upstreams', toolCallId: 't2', arguments: { detail: true }, sessionId: 'test' });
    expect((detailed as { textResultForLlm: string }).textResultForLlm).toContain('Every service emits traces');
  });

  it('state-mcp (stdio bridge used by all 7 hosts) lists squad_state_upstreams and serves inherited skills and decisions', async () => {
    const org = squad(path.join(tmp, 'org'), { skills: { 'org-logging': 'log as JSON' }, decisions: '# org\n\n### Every service emits traces\n' });
    const repo = path.join(tmp, 'repo');
    squad(repo, { decisions: '# repo\n', upstreams: [local('org', path.dirname(org)), { name: 'platform', type: 'git', source: 'https://example.invalid/p.git', ref: 'main', added_at: '2026-01-01T00:00:00.000Z', last_synced: null }] });
    fs.writeFileSync(path.join(repo, '.squad', 'config.json', ), JSON.stringify({ version: 1 }));
    clearResolveSquadCache();

    const out: Array<{ id: unknown; result?: any; error?: unknown }> = [];
    const session = createStateMcpSession(repo, (m) => out.push(m as never));
    await session.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names = out[0]!.result.tools.map((t: { name: string }) => t.name);
    expect(names, 'tools/list must advertise squad_state_upstreams').toContain('squad_state_upstreams');

    await session.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'squad_state_upstreams', arguments: { detail: true } } });
    const call = out.find((m) => m.id === 2)!;
    expect(call.error).toBeUndefined();
    expect(call.result.isError, JSON.stringify(call.result)).not.toBe(true);
    const text: string = call.result.content[0].text;
    expect(text, 'inherited skill visible over the bridge').toContain('- org-logging — upstream:org@local — active');
    expect(text, 'inherited decision body visible over the bridge').toContain('Every service emits traces');
    expect(text, 'unsynced git upstream fails soft with a sync hint').toMatch(/platform .* unavailable \(not synced\)/);
    expect(text).toContain('run "squad upstream sync platform"');
    expect(fs.existsSync(path.join(repo, '.squad', '_upstream_repos')), 'the bridge must not fetch').toBe(false);
    clearResolveSquadCache();
  });
});

describe('squad doctor: upstream inheritance check', () => {
  it('passes when every upstream resolves, warns on stale, fails with the diagnostics when one cannot be read, and is absent without upstream.json', () => {
    const org = squad(path.join(tmp, 'org'), { decisions: '# org\n' });
    const plain = squad(path.join(tmp, 'plain'));
    expect(checkUpstreams(plain)).toBeUndefined();

    const healthy = squad(path.join(tmp, 'healthy'), { upstreams: [local('org', path.dirname(org))] });
    expect(checkUpstreams(healthy)).toMatchObject({ name: 'upstream inheritance', status: 'pass', message: expect.stringContaining('1/1 upstream(s) readable: org=ok') });

    const broken = squad(path.join(tmp, 'broken'), { upstreams: [local('org', path.dirname(org)), local('gone', path.join(tmp, 'nope'))] });
    const check = checkUpstreams(broken)!;
    expect(check.status).toBe('fail');
    expect(check.message).toContain('1/2 upstream(s) readable: org=ok, gone=missing');
    expect(check.message).toMatch(/gone: local source not found/);
  });
});
