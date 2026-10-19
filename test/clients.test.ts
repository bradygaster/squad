import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CLIENT_IDS,
  CLIENT_ADAPTERS,
  CAPABILITIES,
  CANONICAL_COORDINATOR_AGENT_PATH,
  CANONICAL_COORDINATOR_HEADINGS,
  extractCanonicalCoordinatorHeadings,
  resolveEffectiveCapabilities,
  normalizeClientIds,
  assertPortableClients,
  applyProjection,
  buildCoordinatorInstructions,
  installClients,
  parseClients,
  projectClients,
  removeBlock,
  resolveInsideRoot,
  upsertBlock,
  upsertTomlTable,
  BLOCK_BEGIN,
  type ClientContext,
} from '../packages/squad-sdk/src/client/index.js';
import {
  persistClients,
  readClientFlag,
  readConfiguredClients,
  syncClients,
} from '../packages/squad-cli/src/cli/core/clients.js';
import { ensureGitignore } from '../packages/squad-cli/src/cli/core/upgrade.js';

import * as canonical from '../packages/squad-sdk/src/client/adapters/index.js';
import * as deprecatedClients from '../packages/squad-sdk/src/clients/index.js';
import {
  AdapterUnboundError,
  createClientAdapter,
  type RuntimeBinding,
} from '../packages/squad-sdk/src/client/adapter-contract.js';

import { removeTomlTable, uninstallClients } from '../packages/squad-sdk/src/client/adapters/index.js';

let root: string;
const mcp = { command: 'squad', args: ['state-mcp'] };
const ctx = (over: Partial<ClientContext> = {}): ClientContext => ({ root, mcp, ...over });
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const readJson = (p: string) => JSON.parse(read(p));
const exists = (p: string) => fs.existsSync(path.join(root, p));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-clients-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('parseClients', () => {
  it('parses comma lists in canonical order, deduped', () => {
    expect(parseClients('cursor, claude,claude')).toEqual(['claude', 'cursor']);
  });
  it('expands all', () => {
    expect(parseClients('all')).toEqual([...CLIENT_IDS]);
  });
  it('rejects unknown and empty values', () => {
    expect(() => parseClients('vim')).toThrow(/Unknown client "vim"/);
    expect(() => parseClients(' , ')).toThrow(/No client/);
  });
});

describe('coordinator instructions', () => {
  it.each(CLIENT_IDS)('%s includes core protocol and its own dispatch section only', (id) => {
    const text = buildCoordinatorInstructions(id);
    expect(text).toContain('Core protocol (host-agnostic)');
    expect(text).toContain('squad_state');
    expect(text).toContain(CLIENT_ADAPTERS[id].dispatch.section);
    for (const other of CLIENT_IDS.filter((c) => c !== id)) {
      expect(text).not.toContain(CLIENT_ADAPTERS[other].dispatch.section);
    }
  });
  it('mentions the host-specific spawn primitive', () => {
    expect(buildCoordinatorInstructions('copilot')).toMatch(/runSubagent/);
    expect(buildCoordinatorInstructions('claude')).toMatch(/`Task`/);
    expect(buildCoordinatorInstructions('opencode')).toMatch(/`general` subagent/);
  });
});

describe('client capabilities', () => {
  it.each(CLIENT_IDS)('%s declares complete capabilities', (id) => {
    const caps = CLIENT_ADAPTERS[id].capabilities;
    expect(caps).toBe(CAPABILITIES[id]);
    for (const k of ['supportsSubagents', 'supportsMcpTransport', 'supportsNativeHooks', 'supportsSteeringFiles'] as const) {
      expect(typeof caps[k]).toBe('boolean');
    }
    expect(caps.transportModes.length).toBeGreaterThan(0);
    for (const m of caps.transportModes) expect(['mcp-bridge', 'http-backend', 'in-process']).toContain(m);
    expect(new Set(caps.transportModes).size).toBe(caps.transportModes.length);
  });
  it('every MCP-capable host offers mcp-bridge and a direct http-backend path', () => {
    for (const id of CLIENT_IDS) {
      const caps = CLIENT_ADAPTERS[id].capabilities;
      if (caps.supportsMcpTransport) expect(caps.transportModes).toContain('mcp-bridge');
      expect(caps.transportModes).toContain('http-backend');
    }
  });
  it.each(CLIENT_IDS)('%s prompt frames MCP as a transport bridge over the backend contract', (id) => {
    const text = buildCoordinatorInstructions(id);
    expect(text).toMatch(/Backend contract vs\. transport/);
    expect(text).toMatch(/SquadBackend/);
    expect(text).toMatch(/transport bridge/);
    expect(text).toContain('connects to the backend via: ' + CLIENT_ADAPTERS[id].capabilities.transportModes.join(', '));
  });
});

describe('codex adapter', () => {
  it('projects .codex/agents/squad.md, short AGENTS.md pointer block, and .codex/config.toml mcp server', () => {
    installClients(['codex'], ctx());
    const agent = read('.codex/agents/squad.md');
    expect(agent).toMatch(/^---\nname: squad\n/);
    expect(agent).toContain('## Core protocol (host-agnostic)');
    expect(agent).toContain('## Dispatch adapter: OpenAI Codex');
    const agents = read('AGENTS.md');
    expect(agents).toContain('<!-- squad:begin:codex');
    expect(agents).toContain('.codex/agents/squad.md');
    expect(agents).toContain('.codex/config.toml');
    // Root AGENTS.md must NOT embed the full coordinator protocol (prevents hijacking every session)
    expect(agents).not.toContain('## Core protocol (host-agnostic)');
    const toml = read('.codex/config.toml');
    expect(toml).toContain('[mcp_servers.squad_state]');
    expect(toml).toContain('command = "squad"');
    expect(toml).toContain('args = ["state-mcp"]');
    expect(toml).toContain('startup_timeout_sec = 60');
  });
  it('preserves user AGENTS.md text and TOML settings on refresh', () => {
    fs.mkdirSync(path.join(root, '.codex'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Mine\n');
    fs.writeFileSync(
      path.join(root, '.codex/config.toml'),
      'model = "x"\n\n[mcp_servers.other]\ncommand = "o"\n\n[mcp_servers.squad_state]\ncommand = "old"\nargs = ["old"]\nstartup_timeout_sec = 30\n\n[mcp_servers.squad_state.env]\nHTTP_PROXY = "p"\n',
    );
    installClients(['codex'], ctx());
    const again = installClients(['codex'], ctx());
    expect(again.every((r) => r.action === 'unchanged')).toBe(true);
    expect(read('AGENTS.md').startsWith('# Mine\n')).toBe(true);
    const toml = read('.codex/config.toml');
    expect(toml).toContain('model = "x"');
    expect(toml).toContain('[mcp_servers.other]');
    expect(toml).toContain('startup_timeout_sec = 30');
    expect(toml).toContain('HTTP_PROXY = "p"');
    expect(toml).toContain('command = "squad"');
    expect(toml).not.toContain('"old"');
  });
});

describe('antigravity adapter', () => {
  it('projects the main agent and GEMINI.md block', () => {
    installClients(['antigravity'], ctx());
    const main = read('.agents/agents/squad.md');
    expect(main).toMatch(/^---\nname: squad\n/);
    expect(main).toContain('mainAgent: true');
    expect(main).toContain('subagent: false');
    expect(main).toContain('mcpServers:');
    expect(main).toContain('invoke_subagent');
    expect(main).toMatch(/^tools: \[.*run_command.*\]$/m);
    expect(fs.readdirSync(path.join(root, '.agents/agents'))).toEqual(['squad.md']);
    expect(read('GEMINI.md')).toContain('<!-- squad:begin:antigravity');
  });
});

describe('shared files and TOML helper', () => {
  it('independent block ids coexist in one file', () => {
    let t = upsertBlock('', 'one', 'a');
    t = upsertBlock(t, 'two', 'b');
    t = upsertBlock(t, 'one-v2', 'a');
    expect(t).toContain('one-v2');
    expect(t).toContain('two');
    expect(t).not.toContain('\none\n');
  });
  it('upsertTomlTable creates, updates and keeps neighbors', () => {
    expect(upsertTomlTable('', 't.x', { a: '"1"' })).toBe('[t.x]\na = "1"\n');
    const out = upsertTomlTable('k = 1\n[t.x]\na = "0"\nz = 2\n[t.y]\nq = 3\n', 't.x', { a: '"1"', b: '[]' });
    expect(out).toBe('k = 1\n[t.x]\na = "1"\nz = 2\nb = []\n[t.y]\nq = 3\n'.replace(/\n$/, '\n'));
  });
  it('all expands to every client including codex and antigravity', () => {
    expect(parseClients('all')).toEqual(expect.arrayContaining(['codex', 'antigravity']));
    expect(parseClients('codex,antigravity')).toEqual(['codex', 'antigravity']);
  });
});

describe('coordinator Ralph mode', () => {
  it('coordinator prompt includes host-agnostic Ralph mode driven by the coordinator', () => {
    for (const id of CLIENT_IDS) {
      const t = buildCoordinatorInstructions(id);
      expect(t).toMatch(/Ralph mode/);
      expect(t).toMatch(/squad:<member>/);
      expect(t).toMatch(/subagents cannot spawn subagents/);
    }
  });
});

describe('coordinator behavioral-contract parity', () => {
  const sections: Array<[string, RegExp[]]> = [
    ['Response Mode', [/Response Mode Selection/, /\*\*Direct\*\*/, /\*\*Lightweight\*\*/, /\*\*Standard\*\*/, /\*\*Full\*\*/]],
    ['Scribe', [/Scribe spawn protocol and drop-box/, /decisions\/inbox\//, /orchestration-log\//, /\/log\//, /squad_state_health/]],
    ['Reviewer Rejection', [/Reviewer rejection protocol and strict lockout/, /locked out/, /may not self-revise/]],
    ['Rai', [/Rai \(RAI Reviewer\)/, /🟢 Green/, /🟡 Yellow/, /🔴 Red/, /blocks shipping/]],
    ['Fact Checker', [/Fact Checker \(verification and devil's advocate\)/, /✅/, /⚠️/, /❌/, /🔍/, /steelmans/, /pre-mortem/]],
    ['Ceremonies', [/Ceremonies\./, /ceremonies\.md/, /`before`/, /`after`/]],
    ['Skill-Aware Routing', [/Skill-aware routing/, /\.squad\/skills\//, /\.copilot\/skills\//, /\.github\/skills\//, /\.claude\/skills\//, /\.agents\/skills\//]],
    ['Memory/state handshake', [/Memory governance and state-backend handshake/, /squad_state_health/, /squad_decide/, /memory\.\*/]],
    ['GitHub Issues + PRD Mode', [/GitHub Issues mode/, /gh issue list/, /squad\/\{issue-number\}-\{slug\}/, /PRD mode/, /decompose/]],
    ['Cross-Squad', [/Cross-squad delegation/, /peer Squad install/, /ad-hoc subagent/]],
    ['Human + @copilot', [/Human members and the @copilot coding agent/, /Coding Agent/]],
    ['Process safety', [/Never kill processes by image name/]],
    ['Tool naming + dirs', [/Tool names are host-prefixed/, /squad_state_squad_state_read/, /EISDIR/, /for a directory/]],
    ['Explicit fallback', [/Unknown or missing member/, /never silently swap owners/, /Built-in members/]],
    ['Ralph', [/Ralph mode/, /squad:<member>/, /board clear/]],
    ['Init Mode guards', [/NEVER with glob\/grep\/search tools/, /Auto-confirm \(default\)/, /npx squad cast --name/, /NEVER hand-write or edit anything under/, /checksummed pair/, /\.squad\/scratch\//, /never write outside the workspace/, /STOP and report the roster/]],
  ];
  for (const id of CLIENT_IDS) {
    it(`${id} prompt carries the full coordinator contract`, () => {
      const text = buildCoordinatorInstructions(id);
      for (const [name, pats] of sections) {
        for (const p of pats) expect(text, `${id}: ${name} ${p}`).toMatch(p);
      }
    });
  }
  it('stays under Antigravity\'s 24 KB per-rule-file limit', () => {
    for (const id of CLIENT_IDS) expect(Buffer.byteLength(buildCoordinatorInstructions(id), 'utf8')).toBeLessThan(24_000);
  });
  it('honors a custom squad dir in every referenced path', () => {
    const t = buildCoordinatorInstructions('claude', '.team');
    expect(t).toContain('.team/skills/');
    expect(t).toContain('.team/casting/');
    expect(t).not.toContain('.squad/skills/');
  });
});

describe('copilot adapter', () => {
  it('projects only .mcp.json with squad_state', () => {
    installClients(['copilot'], ctx());
    expect(readJson('.mcp.json').mcpServers.squad_state).toEqual({
      command: 'squad', args: ['state-mcp'], env: {}, tools: ['*'],
    });
    expect(exists('.github/agents/squad.agent.md')).toBe(false);
  });
});

describe('claude adapter', () => {
  it('projects only the coordinator agent, .mcp.json and CLAUDE.md block', () => {
    installClients(['claude'], ctx());
    const agent = read('.claude/agents/squad.md');
    expect(agent).toMatch(/^---\nname: squad\ndescription: ".*"\ntools: .*Task.*mcp__squad_state\n---/);
    expect(fs.readdirSync(path.join(root, '.claude/agents'))).toEqual(['squad.md']);
    expect(readJson('.mcp.json').mcpServers.squad_state.command).toBe('squad');
    expect(read('CLAUDE.md')).toContain(BLOCK_BEGIN);
    expect(read('.gitignore')).toContain('.claude/worktrees/');
    expect(read('CLAUDE.md')).toContain('--mcp-config .mcp.json');
  });
  it('preserves user CLAUDE.md content and replaces the block in place', () => {
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Mine\n\nrules\n');
    installClients(['claude'], ctx());
    installClients(['claude'], ctx({ squadDir: '.team' }));
    const md = read('CLAUDE.md');
    expect(md.startsWith('# Mine\n\nrules\n')).toBe(true);
    expect(md.match(/squad:begin/g)).toHaveLength(1);
    expect(md).toContain('.team/team.md');
  });
});

describe('kiro adapter', () => {
  it('projects manual steering, agent json and settings/mcp.json', () => {
    installClients(['kiro'], ctx());
    expect(read('.kiro/steering/squad.md')).toMatch(/^---\ninclusion: manual\n---/);
    const agent = readJson('.kiro/agents/squad.json');
    expect(agent.name).toBe('squad');
    expect(agent.includeMcpJson).toBe(true);
    // Kiro resolves resources against the workspace root but prompt against the config file.
    expect(agent.prompt).toBe('file://../steering/squad.md');
    expect(agent.resources).toEqual(['file://.squad/team.md', 'file://.squad/routing.md']);
    expect(readJson('.kiro/settings/mcp.json').mcpServers.squad_state).toMatchObject({
      command: 'squad', args: ['state-mcp'], disabled: false,
    });
  });
});

describe('opencode adapter', () => {
  it('projects primary agent and opencode.json mcp entry', () => {
    installClients(['opencode'], ctx());
    expect(read('.opencode/agent/squad.md')).toMatch(/mode: primary/);
    const cfg = readJson('opencode.json');
    expect(cfg.$schema).toBe('https://opencode.ai/config.json');
    expect(cfg.mcp.squad_state).toEqual({ type: 'local', command: ['squad', 'state-mcp'], enabled: true });
  });
});

describe('cursor adapter', () => {
  it('projects manual rule (alwaysApply: false), agent and mcp.json', () => {
    installClients(['cursor'], ctx());
    expect(read('.cursor/rules/squad.mdc')).toMatch(/alwaysApply: false/);
    expect(read('.cursor/agents/squad.md')).toMatch(/name: squad/);
    expect(readJson('.cursor/mcp.json').mcpServers.squad_state.command).toBe('squad');
  });
});

describe('config merging', () => {
  it('preserves user servers, env and custom fields; refreshes launch spec', () => {
    const file = path.join(root, '.kiro/settings/mcp.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      other: 1,
      mcpServers: {
        mine: { command: 'x' },
        squad_state: { command: 'old', args: ['old'], env: { HTTP_PROXY: 'p' }, autoApprove: ['squad_state_read'] },
      },
    }));
    installClients(['kiro'], ctx());
    const cfg = readJson('.kiro/settings/mcp.json');
    expect(cfg.other).toBe(1);
    expect(cfg.mcpServers.mine).toEqual({ command: 'x' });
    expect(cfg.mcpServers.squad_state).toMatchObject({
      command: 'squad', args: ['state-mcp'], env: { HTTP_PROXY: 'p' }, autoApprove: ['squad_state_read'],
    });
  });

  it('keeps existing opencode.json settings', () => {
    fs.writeFileSync(path.join(root, 'opencode.json'), JSON.stringify({ model: 'm', mcp: { mine: { type: 'remote', url: 'u' } } }));
    installClients(['opencode'], ctx());
    const cfg = readJson('opencode.json');
    expect(cfg.model).toBe('m');
    expect(cfg.mcp.mine).toEqual({ type: 'remote', url: 'u' });
    expect(cfg.mcp.squad_state.type).toBe('local');
  });

  it('shares .mcp.json between copilot and claude without duplicating', () => {
    installClients(['copilot', 'claude'], ctx());
    expect(Object.keys(readJson('.mcp.json').mcpServers)).toEqual(['squad_state']);
  });

  it('is idempotent', () => {
    installClients([...CLIENT_IDS], ctx());
    const second = installClients([...CLIENT_IDS], ctx());
    expect(second.every((r) => r.action === 'unchanged')).toBe(true);
  });

  it('refuses malformed JSON, leaves it intact, and still writes other files', () => {
    fs.writeFileSync(path.join(root, '.cursor-bad'), '');
    fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
    fs.writeFileSync(path.join(root, '.cursor/mcp.json'), '{ // comment');
    const results = installClients(['cursor'], ctx());
    expect(results.find((r) => r.path === '.cursor/mcp.json')?.action).toBe('error');
    expect(read('.cursor/mcp.json')).toBe('{ // comment');
    expect(exists('.cursor/rules/squad.mdc')).toBe(true);
  });

  it('upsertBlock appends with spacing', () => {
    expect(upsertBlock('a', 'x')).toBe(`a\n\n${BLOCK_BEGIN}\nx\n<!-- squad:end -->\n`);
  });

  it('applyProjection reports created then updated', () => {
    const files = projectClients(['cursor'], ctx());
    expect(applyProjection(root, files).every((r) => r.action === 'created')).toBe(true);
    fs.writeFileSync(path.join(root, '.cursor/rules/squad.mdc'), 'edited');
    const again = applyProjection(root, files);
    expect(again.find((r) => r.path === '.cursor/rules/squad.mdc')?.action).toBe('updated');
  });
});

describe('CLI --client handling', () => {
  it('reads --client forms', () => {
    expect(readClientFlag(['init'])).toBeUndefined();
    expect(readClientFlag(['init', '--client', 'claude,kiro'])).toEqual(['claude', 'kiro']);
    expect(readClientFlag(['init', '--client=all'])).toEqual([...CLIENT_IDS]);
    expect(() => readClientFlag(['init', '--client'])).toThrow(/requires a value/);
    expect(() => readClientFlag(['init', '--client', '--force'])).toThrow(/requires a value/);
    expect(() => readClientFlag(['init', '--client', 'nope'])).toThrow(/Unknown client/);
  });

  it('persists clients in config.json preserving other keys', () => {
    const sq = path.join(root, '.squad');
    fs.mkdirSync(sq);
    fs.writeFileSync(path.join(sq, 'config.json'), JSON.stringify({ stateBackend: 'local' }));
    persistClients(sq, ['claude', 'cursor']);
    expect(JSON.parse(fs.readFileSync(path.join(sq, 'config.json'), 'utf8'))).toEqual({
      stateBackend: 'local', clients: ['claude', 'cursor'],
    });
    expect(readConfiguredClients(sq)).toEqual(['claude', 'cursor']);
  });

  it('syncClients adds requested clients to configured set and refreshes all', async () => {
    const sq = path.join(root, '.squad');
    fs.mkdirSync(sq);
    fs.writeFileSync(path.join(sq, 'team.md'), '| Name | Role |\n|---|---|\n| Data | Expert |\n');
    const prev = process.env['SQUAD_STANDALONE_HOME'];
    delete process.env['SQUAD_STANDALONE_HOME'];
    try {
      const first = await syncClients(root, sq, { clients: ['claude'], version: '0.0.0' });
      expect(first.clients).toEqual(['claude']);
      const second = await syncClients(root, sq, { clients: ['kiro'], version: '0.0.0' });
      expect(second.clients).toEqual(['claude', 'kiro']);
      expect(readConfiguredClients(sq)).toEqual(['claude', 'kiro']);
      expect(exists('.claude/agents/squad.md')).toBe(true);
      expect(exists('.kiro/steering/squad.md')).toBe(true);
      const bare = await syncClients(root, sq, { version: '0.0.0' });
      expect(bare.clients).toEqual(['claude', 'kiro']);
      expect(readJson('.mcp.json').mcpServers.squad_state.args.at(-1)).toBe('state-mcp');
    } finally {
      if (prev !== undefined) process.env['SQUAD_STANDALONE_HOME'] = prev;
    }
  });

  it('syncClients is a no-op with nothing configured', async () => {
    const sq = path.join(root, '.squad');
    fs.mkdirSync(sq);
    expect(await syncClients(root, sq)).toEqual({ clients: [], results: [] });
  });
});

describe('resolveEffectiveCapabilities', () => {
  const client = CAPABILITIES.copilot;
  it('returns the client declaration when backend and policy are silent', () => {
    expect(resolveEffectiveCapabilities(client)).toEqual(client);
    expect(resolveEffectiveCapabilities(client)).not.toBe(client);
  });
  it('backend or policy false removes a flag; neither can grant beyond the client', () => {
    const eff = resolveEffectiveCapabilities(client, { supportsSubagents: false }, { supportsNativeHooks: false });
    expect(eff.supportsSubagents).toBe(false);
    expect(eff.supportsNativeHooks).toBe(false);
    expect(eff.supportsSteeringFiles).toBe(true);
    const cursor = CAPABILITIES.cursor;
    expect(resolveEffectiveCapabilities(cursor, { supportsNativeHooks: true }, { supportsNativeHooks: true }).supportsNativeHooks).toBe(false);
  });
  it('intersects transport modes from client, backend and policy', () => {
    const eff = resolveEffectiveCapabilities(client, { transportModes: ['mcp-bridge', 'http-backend'] }, { transportModes: ['http-backend', 'in-process'] });
    expect(eff.transportModes).toEqual(['http-backend']);
    expect(resolveEffectiveCapabilities(CAPABILITIES.claude, { transportModes: ['in-process'] }).transportModes).toEqual([]);
  });
  it('drops mcp-bridge when MCP transport is not effectively supported', () => {
    const eff = resolveEffectiveCapabilities(client, { supportsMcpTransport: false });
    expect(eff.supportsMcpTransport).toBe(false);
    expect(eff.transportModes).not.toContain('mcp-bridge');
    expect(eff.transportModes).toContain('http-backend');
  });
  it('does not mutate inputs', () => {
    const before = JSON.stringify(client);
    resolveEffectiveCapabilities(client, { transportModes: [] });
    expect(JSON.stringify(client)).toBe(before);
  });
});

describe('portable clients[] hygiene', () => {
  it('keeps canonical ids in canonical order, deduped and case-normalized', () => {
    expect(normalizeClientIds(['Cursor', 'claude', 'claude']).clients).toEqual(['claude', 'cursor']);
  });
  it('strips and classifies credentials, paths, thread ids, leases and checkpoints without echoing them', () => {
    const bad = [
      'ghp_token=abc123', 'C:\\Users\\me\\repo', '/home/me/.claude', 'https://x/y', 'thread_19:abc@thread.v2',
      'lease-42', 'checkpoint-7', 'a@b.com', 42, { k: 1 }, 'vim',
    ];
    const { clients, rejected } = normalizeClientIds(['kiro', ...bad]);
    expect(clients).toEqual(['kiro']);
    expect(rejected).toHaveLength(bad.length);
    expect(JSON.stringify(rejected)).not.toMatch(/ghp_|abc123|Users|thread_19|lease-42|a@b/);
    expect(rejected.find((r) => r.value === 'vim')?.reason).toBe('unknown');
    expect(rejected.filter((r) => r.reason === 'sensitive').length).toBeGreaterThanOrEqual(7);
  });
  it('treats non-arrays as empty', () => {
    expect(normalizeClientIds('claude').clients).toEqual([]);
    expect(normalizeClientIds(undefined).clients).toEqual([]);
  });
  it('assertPortableClients rejects anything non-canonical without leaking values', () => {
    expect(assertPortableClients(['claude', 'kiro'])).toEqual(['claude', 'kiro']);
    expect(() => assertPortableClients(['claude', 'claude'])).toThrow(/canonical/);
    expect(() => assertPortableClients(['C:\\secret\\token'])).toThrow(/rejected 1/);
    try { assertPortableClients(['sk-secret-token']); } catch (e) { expect(String(e)).not.toContain('sk-secret'); }
    expect(() => assertPortableClients('claude')).toThrow(/array/);
  });
  it('config persistence/reading drops non-portable entries', () => {
    const sq = path.join(root, '.squad');
    fs.mkdirSync(sq);
    fs.writeFileSync(path.join(sq, 'config.json'), JSON.stringify({ clients: ['cursor', 'C:\\x', 'token=1', 'claude'] }));
    expect(readConfiguredClients(sq)).toEqual(['claude', 'cursor']);
    persistClients(sq, ['kiro', '/etc/passwd' as never, 'lease-1' as never]);
    expect(JSON.parse(fs.readFileSync(path.join(sq, 'config.json'), 'utf8')).clients).toEqual(['kiro']);
  });
});

describe('HostProjection / ClientAdapter facade (spec v0.2)', () => {
  it('deprecated ./clients re-exports the exact same symbols as client/adapters', () => {
    for (const k of Object.keys(canonical)) expect((deprecatedClients as Record<string, unknown>)[k]).toBe((canonical as Record<string, unknown>)[k]);
    expect(canonical.CLIENT_ADAPTERS).toBe(canonical.HOST_PROJECTIONS);
    expect(canonical.getClientAdapter).toBe(canonical.getHostProjection);
  });

  it('capability tokens are authoritative; boolean flags are a derived view', () => {
    for (const id of CLIENT_IDS) {
      const tokens = canonical.CAPABILITY_TOKENS_BY_HOST[id];
      expect(canonical.CAPABILITIES[id]).toEqual(canonical.capabilityFlagsFromTokens(tokens, canonical.CAPABILITIES[id].transportModes));
    }
    expect(canonical.capabilityTokensFromFlags({ supportsSubagents: true, supportsMcpTransport: false })).toEqual(['subagents']);
  });

  it('rejects conflicting token array and boolean flags', () => {
    expect(() => createClientAdapter({ host: 'claude', ctx: ctx(), declaredFlags: { supportsSubagents: false } })).toThrow(/Conflicting capabilities/);
    expect(() => createClientAdapter({ host: 'claude', ctx: ctx(), declaredFlags: { supportsSubagents: true } })).not.toThrow();
  });

  it('describe and projectWorkspace report spec anchors for every host', async () => {
    const anchors: Record<string, [string, string | undefined]> = {
      copilot: ['.github/agents/squad.agent.md', '.mcp.json'],
      claude: ['.claude/agents/squad.md', '.mcp.json'],
      kiro: ['.kiro/steering/squad.md', '.kiro/settings/mcp.json'],
      opencode: ['.opencode/agent/squad.md', 'opencode.json'],
      cursor: ['.cursor/agents/squad.md', '.cursor/mcp.json'],
    };
    for (const [id, [agent, mcp]] of Object.entries(anchors)) {
      const a = createClientAdapter({ host: id as never, ctx: ctx() });
      const ws = await a.projectWorkspace();
      expect(ws.squadAgentPath).toBe(agent);
      expect(ws.mcpConfigPath).toBe(mcp);
      const d = await a.describe();
      expect(d.capabilities.mcpConfig).toBe(true);
      expect(d.projectedFiles).toContain(mcp);
    }
    const cursorWs = await createClientAdapter({ host: 'cursor', ctx: ctx() }).projectWorkspace();
    expect(cursorWs.supportFiles).toContain('.cursor/rules/squad.mdc');
    expect((await createClientAdapter({ host: 'claude', ctx: ctx() }).projectWorkspace()).supportFiles).toContain('CLAUDE.md');
    expect((await createClientAdapter({ host: 'claude', ctx: ctx() }).describe()).hostKind).toBe('claude-code');
  });

  it('runtime calls need a bound runtime; with one they delegate and effective capabilities are the intersection', async () => {
    const unbound = createClientAdapter({ host: 'opencode', ctx: ctx() });
    await expect(unbound.submit({ conversationId: 'c', prompt: 'p' })).rejects.toBeInstanceOf(AdapterUnboundError);
    expect((await unbound.getCapabilities()).effectiveCapabilities).toEqual(canonical.CAPABILITY_TOKENS_BY_HOST.opencode);

    const calls: string[] = [];
    const runtime: RuntimeBinding = {
      submit: async (i) => (calls.push('submit:' + i.prompt), { admissionId: 'a', runId: 'r' }),
      subscribe: async () => async () => undefined,
      cancel: async (_c, runId) => void calls.push('cancel:' + runId),
      respondApproval: async (_c, r) => void calls.push('approve:' + r.decision),
      backendCapabilities: () => ['subagents', 'mcp-bridge', 'approvals'],
      policyCapabilities: async () => ['subagents', 'mcp-bridge'],
    };
    const a = createClientAdapter({ host: 'opencode', ctx: ctx(), runtime });
    expect(await a.submit({ conversationId: 'c', prompt: 'hi' })).toEqual({ admissionId: 'a', runId: 'r' });
    await a.cancel('c', 'r');
    await a.respondApproval('c', { approvalId: 'x', requestHash: 'h', decision: 'approved' });
    expect(calls).toEqual(['submit:hi', 'cancel:r', 'approve:approved']);
    const caps = await a.getCapabilities('c');
    expect(caps.effectiveCapabilities).toEqual(['mcp-bridge', 'subagents']);
    expect(caps.clientCapabilities).toContain('native-hooks');
  });
});

describe('review hardening (Copilot review on #2238)', () => {
  it('rejects ../ and symlinked path components instead of writing outside the workspace', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-outside-'));
    try {
      const esc = applyProjection(root, [{ kind: 'managed', path: '../escape.txt', content: 'x' }]);
      expect(esc[0]!.action).toBe('error');
      expect(fs.existsSync(path.join(path.dirname(root), 'escape.txt'))).toBe(false);
      fs.symlinkSync(outside, path.join(root, '.cursor'), 'junction');
      const res = installClients(['cursor'], ctx());
      expect(res.filter((r) => r.path.startsWith('.cursor/')).every((r) => r.action === 'error')).toBe(true);
      expect(fs.readdirSync(outside)).toEqual([]);
      const un = uninstallClients(['cursor'], ctx());
      expect(un.filter((r) => r.path.startsWith('.cursor/')).every((r) => r.action !== 'removed')).toBe(true);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses wrong-typed MCP containers and squad_state entries per file', () => {
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: [] }));
    const res = installClients(['claude'], ctx());
    expect(res.find((r) => r.path === '.mcp.json')!.action).toBe('error');
    expect(readJson('.mcp.json')).toEqual({ mcpServers: [] });
    fs.writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { squad_state: 'x' } }));
    expect(installClients(['claude'], ctx()).find((r) => r.path === '.mcp.json')!.action).toBe('error');
  });

  it('TOML: replaces multiline arrays whole, tolerates header spacing, removes child tables', () => {
    const src = '[ mcp_servers . squad_state ]\ncommand = "old"\nargs = [\n  "a",\n  "b",\n]\n\n[mcp_servers.squad_state.env]\nK = "v"\n\n[other]\nx = 1\n';
    const out = upsertTomlTable(src, 'mcp_servers.squad_state', { command: '"squad"', args: '["state-mcp"]' });
    expect(out).toContain('command = "squad"');
    expect(out).toContain('args = ["state-mcp"]');
    expect(out).not.toContain('"a"');
    expect(out).not.toContain('"b"');
    expect(out).toContain('[other]');
    const gone = removeTomlTable(out, 'mcp_servers.squad_state');
    expect(gone).not.toContain('squad_state');
    expect(gone).not.toContain('K = "v"');
    expect(gone).toContain('[other]');
  });

  it('uninstalling one host keeps the shared .mcp.json entry while another host still uses it', () => {
    installClients(['copilot', 'claude'], ctx());
    uninstallClients(['claude'], ctx(), ['copilot']);
    expect(readJson('.mcp.json').mcpServers.squad_state).toBeDefined();
    uninstallClients(['copilot'], ctx());
    expect(exists('.mcp.json')).toBe(false);
  });

  it('applies a custom squadDir to the dispatch section too', () => {
    const text = buildCoordinatorInstructions('claude', '.team');
    expect(text).toContain('.team/agents/<member>/charter.md');
    expect(text).not.toContain('.squad/agents');
  });

  it('persistClients refuses to overwrite a malformed config.json', () => {
    const sq = path.join(root, '.squad');
    fs.mkdirSync(sq);
    fs.writeFileSync(path.join(sq, 'config.json'), '{ not json');
    expect(() => persistClients(sq, ['claude'])).toThrow(/Refusing to overwrite malformed/);
    expect(fs.readFileSync(path.join(sq, 'config.json'), 'utf8')).toBe('{ not json');
  });
});

describe('TOML array-of-tables and quoted keys (PR review round 3)', () => {
  const doc = [
    '[mcp_servers.squad_state]',
    '"command" = "old"',
    "'cwd' = \"/x\"",
    'args = ["a"]',
    '',
    '[[skills.config]]',
    'path = "/skills/one"',
    '',
    '[[skills.config]]',
    'path = "/skills/two"',
    '',
  ].join('\n');

  it('upsertTomlTable stops at [[array_table]] and rewrites quoted managed keys in place', () => {
    const out = upsertTomlTable(doc, 'mcp_servers.squad_state', { command: '"squad"', args: '["state-mcp"]' });
    expect(out.match(/command\s*=/g)).toHaveLength(1);
    expect(out).toContain('command = "squad"');
    expect(out).toContain("'cwd' = \"/x\"");
    expect(out).toContain('args = ["state-mcp"]');
    expect(out.match(/\[\[skills\.config\]\]/g)).toHaveLength(2);
    expect(out).toContain('path = "/skills/one"');
    expect(out).toContain('path = "/skills/two"');
    // the managed block did not swallow the array tables: they still follow it
    expect(out.indexOf('[[skills.config]]')).toBeGreaterThan(out.indexOf('args = ["state-mcp"]'));
  });

  it('inserts a missing key before the next [[array_table]], not after it', () => {
    const out = upsertTomlTable('[t]\nk = 1\n\n[[arr]]\nv = 2\n', 't', { added: '"x"' });
    expect(out.indexOf('added = "x"')).toBeLessThan(out.indexOf('[[arr]]'));
    expect(out).toContain('[[arr]]\nv = 2');
  });

  it('removeTomlTable removes only the managed table and keeps the array tables', () => {
    const out = removeTomlTable(doc, 'mcp_servers.squad_state');
    expect(out).not.toContain('squad_state');
    expect(out.match(/\[\[skills\.config\]\]/g)).toHaveLength(2);
    expect(out).toContain('path = "/skills/two"');
  });
});

describe('Layer 1 review recommendations & hardening', () => {
  it('Blocker #2: plain ensureGitignore and unconfigured syncClients make zero multi-client or .gitignore changes', async () => {
    const sq = path.join(root, '.squad');
    fs.mkdirSync(sq);
    fs.writeFileSync(path.join(sq, 'config.json'), JSON.stringify({ stateBackend: 'local' }));
    ensureGitignore(root);
    const gitignore = read('.gitignore');
    expect(gitignore).not.toContain('.claude/worktrees/');
    expect(gitignore.split(/\r?\n/).map((l) => l.trim())).not.toContain('NUL');

    const synced = await syncClients(root, sq);
    expect(synced).toEqual({ clients: [], results: [] });
    expect(exists('.mcp.json')).toBe(false);
    expect(exists('.claude')).toBe(false);
    expect(exists('AGENTS.md')).toBe(false);
    expect(read('.gitignore')).toBe(gitignore);
  });

  it('Blocker #3: coordinator.ts stays synchronized with .github/agents/squad.agent.md core protocol headings', () => {
    const repoRoot = path.resolve(__dirname, '..');
    const canonicalAgentFile = fs.readFileSync(path.join(repoRoot, CANONICAL_COORDINATOR_AGENT_PATH), 'utf8');
    const actualHeadings = extractCanonicalCoordinatorHeadings(canonicalAgentFile);
    for (const heading of CANONICAL_COORDINATOR_HEADINGS) {
      expect(actualHeadings, `Missing canonical heading "${heading}" in ${CANONICAL_COORDINATOR_AGENT_PATH}`).toContain(heading);
    }

    // Verify projected coordinator prompt references .github/agents/squad.agent.md and derives version when present
    const ghAgentsDir = path.join(root, '.github', 'agents');
    fs.mkdirSync(ghAgentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(ghAgentsDir, 'squad.agent.md'),
      '<!-- version: 1.2.3-test -->\n\n### Coordinator Identity\n\n## Init Mode\n\n## Team Mode\n',
    );
    installClients(['claude'], ctx());
    const projected = read('.claude/agents/squad.md');
    expect(projected).toContain(CANONICAL_COORDINATOR_AGENT_PATH);
    expect(projected).toContain('1.2.3-test');
    expect(projected).toContain('Authoritative specification (single source of truth)');
  });

  it('apply.ts: upsertBlock and removeBlock throw on unclosed or inverted markers instead of losing user content', () => {
    const unclosed = '# User Header\n<!-- squad:begin (managed by Squad; do not edit between markers) -->\nImportant user notes after broken marker\n';
    expect(() => upsertBlock(unclosed, 'replacement')).toThrow(
      /Unclosed Squad managed block marker in file; refusing to overwrite user content after marker/,
    );
    expect(() => removeBlock(unclosed)).toThrow(
      /Unclosed Squad managed block marker in file; refusing to overwrite user content after marker/,
    );

    const inverted = '<!-- squad:end -->\nUser text\n<!-- squad:begin (managed by Squad; do not edit between markers) -->\nMore user text\n';
    expect(() => upsertBlock(inverted, 'replacement')).toThrow(
      /Unclosed Squad managed block marker in file; refusing to overwrite user content after marker/,
    );
    expect(() => removeBlock(inverted)).toThrow(
      /Unclosed Squad managed block marker in file; refusing to overwrite user content after marker/,
    );

    // Verify applyProjection reports error and leaves the file on disk untouched
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), unclosed);
    const res = installClients(['claude'], ctx());
    expect(res.find((r) => r.path === 'CLAUDE.md')?.action).toBe('error');
    expect(read('CLAUDE.md')).toBe(unclosed);
  });

  it('apply.ts: upsertTomlTable and removeTomlTable handle inline and dotted squad_state definitions without duplicates', () => {
    const inlineParent = [
      'model = "o3"',
      '',
      '[mcp_servers]',
      'other = { command = "other-mcp" }',
      'squad_state = { command = "old", args = ["old"], startup_timeout_sec = 45, custom_flag = true }',
      '',
    ].join('\n');

    const upserted = upsertTomlTable(
      inlineParent,
      'mcp_servers.squad_state',
      { command: '"squad"', args: '["state-mcp"]' },
      { startup_timeout_sec: '60' },
    );
    expect(upserted).toContain('[mcp_servers]');
    expect(upserted).toContain('other = { command = "other-mcp" }');
    expect(upserted).not.toMatch(/squad_state\s*=\s*\{/);
    expect(upserted.match(/\[mcp_servers\.squad_state\]/g)).toHaveLength(1);
    expect(upserted).toContain('command = "squad"');
    expect(upserted).toContain('args = ["state-mcp"]');
    expect(upserted).toContain('startup_timeout_sec = 45');
    expect(upserted).toContain('custom_flag = true');

    const dottedTopLevel = [
      'mcp_servers.squad_state.command = "old"',
      'mcp_servers.squad_state.args = ["old"]',
      'mcp_servers.squad_state.custom = "preserved"',
      '',
    ].join('\n');
    const upsertedDotted = upsertTomlTable(
      dottedTopLevel,
      'mcp_servers.squad_state',
      { command: '"squad"', args: '["state-mcp"]' },
      { startup_timeout_sec: '60' },
    );
    expect(upsertedDotted).not.toContain('mcp_servers.squad_state.command');
    expect(upsertedDotted.match(/\[mcp_servers\.squad_state\]/g)).toHaveLength(1);
    expect(upsertedDotted).toContain('custom = "preserved"');
    expect(upsertedDotted).toContain('startup_timeout_sec = 60');

    expect(removeTomlTable('[mcp_servers]\nsquad_state = { command = "squad" }\n', 'mcp_servers.squad_state')).toBe('');
    expect(removeTomlTable(dottedTopLevel, 'mcp_servers.squad_state')).toBe('');
  });

  it('clients.ts: imports from @bradygaster/squad-sdk/client, merges repeated --client flags, preserves unknown IDs, and rejects symlinked .squad', async () => {
    const cliClientsSource = fs.readFileSync(
      path.resolve(__dirname, '../packages/squad-cli/src/cli/core/clients.ts'),
      'utf8',
    );
    expect(cliClientsSource).toContain("from '@bradygaster/squad-sdk/client'");
    expect(cliClientsSource).not.toContain("from '@bradygaster/squad-sdk/clients'");

    // Repeated --client flags are merged
    expect(readClientFlag(['init', '--client', 'claude', '--client', 'opencode'])).toEqual(['claude', 'opencode']);
    expect(readClientFlag(['upgrade', '--client=cursor', '--clients', 'claude,codex'])).toEqual(['claude', 'cursor', 'codex']);

    // Unknown portable client IDs in config.json are warned about and preserved while non-portable values are dropped
    const sq = path.join(root, '.squad');
    fs.mkdirSync(sq);
    fs.writeFileSync(
      path.join(sq, 'config.json'),
      JSON.stringify({ clients: ['claude', 'future-host', 'C:\\secret\\path', 'token=xyz'] }),
    );
    const warnings: string[] = [];
    const prev = process.env['SQUAD_STANDALONE_HOME'];
    delete process.env['SQUAD_STANDALONE_HOME'];
    try {
      await syncClients(root, sq, {
        clients: ['kiro'],
        version: '0.0.0',
        warn: (m) => warnings.push(m),
      });
    } finally {
      if (prev !== undefined) process.env['SQUAD_STANDALONE_HOME'] = prev;
    }
    expect(warnings.some((w) => w.includes('future-host'))).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(path.join(sq, 'config.json'), 'utf8')) as { clients: string[] };
    expect(persisted.clients).toEqual(['claude', 'kiro', 'future-host']);

    // Symlinked .squad directory itself is rejected
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-outside-sq-'));
    const symRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'squad-symroot-'));
    try {
      const symSquad = path.join(symRoot, '.squad');
      fs.symlinkSync(outside, symSquad, 'junction');
      expect(() => resolveInsideRoot(symSquad, 'config.json')).toThrow(/Refusing symlinked path component/);
      expect(() => persistClients(symSquad, ['claude'])).toThrow(/Refusing symlinked path component/);
      await expect(syncClients(symRoot, symSquad, { clients: ['claude'] })).rejects.toThrow(/Refusing symlinked path component/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
      fs.rmSync(symRoot, { recursive: true, force: true });
    }
  });
});
