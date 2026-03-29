/**
 * SquadState SDK Wiring Tests — Phase 2
 *
 * Verifies that SDK modules (CharterCompiler, LocalAgentSource, onboardAgent,
 * ToolRegistry) correctly use SquadState typed collections when wired.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorageProvider } from '../../packages/squad-sdk/src/storage/in-memory-storage-provider.js';
import { SquadState } from '../../packages/squad-sdk/src/state/squad-state.js';
import { CharterCompiler } from '../../packages/squad-sdk/src/agents/index.js';
import { LocalAgentSource } from '../../packages/squad-sdk/src/config/agent-source.js';
import { onboardAgent } from '../../packages/squad-sdk/src/agents/onboarding.js';
import { ToolRegistry } from '../../packages/squad-sdk/src/tools/index.js';

// ── Sample data ────────────────────────────────────────────────────────────

const ROOT = '/project';

const CHARTER_EECOM = `# EECOM — Core Dev

> Practical, thorough, makes it work then makes it right.

## Identity

- **Name:** EECOM
- **Role:** Core Dev
- **Expertise:** Runtime implementation, spawning
- **Style:** Practical, thorough, makes it work then makes it right.
`;

const CHARTER_RETRO = `# RETRO — Docs Lead

> Precise, structured, docs-first.

## Identity

- **Name:** RETRO
- **Role:** Docs Lead
- **Expertise:** Documentation, API references
- **Style:** Precise, structured, docs-first.
`;

const HISTORY_EECOM = `# EECOM

## Learnings

### 2026-07-24

Built the IO layer for state module.

## Context

Project uses TypeScript with vitest for testing.
`;

const TEAM_MD = `# Project Squad

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| eecom | Core Dev | \`.squad/agents/eecom/charter.md\` | ✅ Active |
| retro | Docs Lead | \`.squad/agents/retro/charter.md\` | ✅ Active |
`;

// ── Helper ─────────────────────────────────────────────────────────────────

function seedStorage(): InMemoryStorageProvider {
  const sp = new InMemoryStorageProvider();
  sp.writeSync(`${ROOT}/.squad/agents/eecom/charter.md`, CHARTER_EECOM);
  sp.writeSync(`${ROOT}/.squad/agents/eecom/history.md`, HISTORY_EECOM);
  sp.writeSync(`${ROOT}/.squad/agents/retro/charter.md`, CHARTER_RETRO);
  sp.writeSync(`${ROOT}/.squad/team.md`, TEAM_MD);
  sp.writeSync(`${ROOT}/.squad/decisions.md`, '# Decisions\n');
  sp.writeSync(`${ROOT}/.squad/routing.md`, '# Routing\n');
  sp.writeSync(`${ROOT}/.squad/config.json`, '{}');
  return sp;
}

// ── SquadState.fromStorage ─────────────────────────────────────────────────

describe('SquadState.fromStorage', () => {
  it('creates SquadState synchronously without validation', () => {
    const sp = new InMemoryStorageProvider();
    // No .squad/ dir seeded — fromStorage should NOT throw
    const state = SquadState.fromStorage(sp, '/empty');
    expect(state).toBeDefined();
    expect(state.root).toBe('/empty');
    expect(state.provider).toBe(sp);
  });

  it('exposes root and provider getters', () => {
    const sp = seedStorage();
    const state = SquadState.fromStorage(sp, ROOT);
    expect(state.root).toBe(ROOT);
    expect(state.provider).toBe(sp);
  });
});

// ── CharterCompiler with SquadState ────────────────────────────────────────

describe('CharterCompiler with SquadState', () => {
  let sp: InMemoryStorageProvider;
  let state: SquadState;

  beforeEach(() => {
    sp = seedStorage();
    state = SquadState.fromStorage(sp, ROOT);
  });

  it('compileAll uses state.agents when SquadState provided', async () => {
    const compiler = new CharterCompiler(sp, state);
    const charters = await compiler.compileAll(ROOT);

    expect(charters.length).toBe(2);
    const names = charters.map(c => c.name).sort();
    expect(names).toEqual(['eecom', 'retro']);
  });

  it('compileAll skips scribe and _ prefixed agents', async () => {
    sp.writeSync(`${ROOT}/.squad/agents/scribe/charter.md`, '# Scribe\n## Identity\n- **Name:** Scribe\n');
    sp.writeSync(`${ROOT}/.squad/agents/_alumni/charter.md`, '# Alumni\n');
    const compiler = new CharterCompiler(sp, state);
    const charters = await compiler.compileAll(ROOT);

    const names = charters.map(c => c.name);
    expect(names).not.toContain('scribe');
    expect(names).not.toContain('_alumni');
  });

  it('compileByName returns typed charter for known agent', async () => {
    const compiler = new CharterCompiler(sp, state);
    const charter = await compiler.compileByName('eecom');

    expect(charter.name).toBe('eecom');
    expect(charter.role).toBe('Core Dev');
    expect(charter.prompt).toContain('Practical, thorough');
  });

  it('compileByName throws for unknown agent', async () => {
    const compiler = new CharterCompiler(sp, state);
    await expect(compiler.compileByName('ghost')).rejects.toThrow();
  });

  it('compileByName throws if no SquadState provided', async () => {
    const compiler = new CharterCompiler(sp); // no state
    await expect(compiler.compileByName('eecom')).rejects.toThrow(
      /compileByName requires SquadState/,
    );
  });

  it('compileAll falls back to StorageProvider when no state', async () => {
    const compiler = new CharterCompiler(sp); // no state
    const charters = await compiler.compileAll(ROOT);

    expect(charters.length).toBe(2);
    const names = charters.map(c => c.name).sort();
    expect(names).toEqual(['eecom', 'retro']);
  });
});

// ── LocalAgentSource with SquadState ───────────────────────────────────────

describe('LocalAgentSource with SquadState', () => {
  let sp: InMemoryStorageProvider;
  let state: SquadState;

  beforeEach(() => {
    sp = seedStorage();
    state = SquadState.fromStorage(sp, ROOT);
  });

  it('listAgents returns manifests via SquadState', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const agents = await source.listAgents();

    expect(agents.length).toBe(2);
    const names = agents.map(a => a.name).sort();
    expect(names).toEqual(['EECOM', 'RETRO']);
  });

  it('getAgent returns full definition via SquadState', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const agent = await source.getAgent('eecom');

    expect(agent).not.toBeNull();
    expect(agent!.charter).toContain('Core Dev');
    expect(agent!.source).toBe('local');
  });

  it('getCharter returns charter content via SquadState', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const charter = await source.getCharter('eecom');

    expect(charter).not.toBeNull();
    expect(charter).toContain('EECOM');
  });

  it('getCharter returns null for unknown agent', async () => {
    const source = new LocalAgentSource(ROOT, sp, state);
    const charter = await source.getCharter('ghost');

    expect(charter).toBeNull();
  });

  it('listAgents falls back to StorageProvider when no state', async () => {
    const source = new LocalAgentSource(ROOT, sp); // no state
    const agents = await source.listAgents();

    expect(agents.length).toBe(2);
  });
});

// ── onboardAgent with SquadState ───────────────────────────────────────────

describe('onboardAgent with SquadState', () => {
  let sp: InMemoryStorageProvider;
  let state: SquadState;

  beforeEach(() => {
    sp = seedStorage();
    state = SquadState.fromStorage(sp, ROOT);
  });

  it('creates agent files via SquadState', async () => {
    const result = await onboardAgent(
      { teamRoot: ROOT, agentName: 'new-agent', role: 'tester' },
      sp,
      state,
    );

    expect(result.createdFiles.length).toBe(2);

    // Verify charter exists via SquadState
    const charter = await state.agents.get('new-agent').charter();
    expect(charter).toContain('New Agent');

    // Verify history was written (overwritten from generic SquadState template)
    const history = sp.readSync(`${ROOT}/.squad/agents/new-agent/history.md`);
    expect(history).toBeDefined();
  });

  it('creates agent files without SquadState (backward compat)', async () => {
    const result = await onboardAgent(
      { teamRoot: ROOT, agentName: 'plain-agent', role: 'developer' },
      sp,
    );

    expect(result.createdFiles.length).toBe(2);
    const charter = sp.readSync(result.charterPath);
    expect(charter).toBeDefined();
  });

  it('rejects duplicate agent', async () => {
    await expect(
      onboardAgent(
        { teamRoot: ROOT, agentName: 'eecom', role: 'developer' },
        sp,
        state,
      ),
    ).rejects.toThrow(/already exists/);
  });
});

// ── ToolRegistry with SquadState ───────────────────────────────────────────

describe('ToolRegistry with SquadState', () => {
  let sp: InMemoryStorageProvider;
  let state: SquadState;

  beforeEach(() => {
    sp = seedStorage();
    state = SquadState.fromStorage(sp, ROOT);
  });

  it('constructs with SquadState parameter', () => {
    const registry = new ToolRegistry(`${ROOT}/.squad`, undefined, sp, state);
    expect(registry.getTools().length).toBeGreaterThan(0);
  });

  it('constructs without SquadState (backward compat)', () => {
    const registry = new ToolRegistry(`${ROOT}/.squad`, undefined, sp);
    expect(registry.getTools().length).toBeGreaterThan(0);
  });

  it('squad_memory appends via SquadState when available', async () => {
    const registry = new ToolRegistry(`${ROOT}/.squad`, undefined, sp, state);
    const memoryTool = registry.getTool('squad_memory');
    expect(memoryTool).toBeDefined();

    const result = await memoryTool!.handler({
      agent: 'eecom',
      section: 'learnings',
      content: 'Wired SquadState into tools module.',
    });

    expect(result.resultType).toBe('success');
    expect(result.textResultForLlm).toContain('Appended to eecom');

    // Verify content was written
    const history = sp.readSync(`${ROOT}/.squad/agents/eecom/history.md`);
    expect(history).toContain('Wired SquadState into tools module.');
  });

  it('squad_memory returns failure for unknown agent via SquadState', async () => {
    const registry = new ToolRegistry(`${ROOT}/.squad`, undefined, sp, state);
    const memoryTool = registry.getTool('squad_memory');

    const result = await memoryTool!.handler({
      agent: 'ghost',
      section: 'learnings',
      content: 'This should fail.',
    });

    expect(result.resultType).toBe('failure');
    expect(result.textResultForLlm).toContain('not found');
  });
});
