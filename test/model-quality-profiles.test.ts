/**
 * Quality-profile and live-catalog aware model selection (#1598).
 *
 * quality-first is the default; balanced and economy are explicit opt-in
 * profiles at session and persistent level. A runtime-supplied live model
 * catalog is authoritative for availability. Recommendations use only public
 * GA model ids.
 *
 * @module test/model-quality-profiles
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import {
  MODEL_CATALOG,
  DEFAULT_FALLBACK_CHAINS,
  ECONOMY_MODEL_MAP,
  DEFAULT_CONFIG,
  resolveModel as adapterResolveModel,
  readModelProfile,
  writeModelProfile,
} from '@bradygaster/squad-sdk/config';
import {
  resolveAgentModel,
  buildCatalogCategoryMap,
  AgentLifecycleManager,
  type ModelResolutionOptions,
  type TaskType,
} from '@bradygaster/squad-sdk/agents';
import { MODELS } from '@bradygaster/squad-sdk/runtime/constants';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';
import type { SquadClientWithPool } from '@bradygaster/squad-sdk/client';

const STALE_IDS = ['claude-opus-4.7', 'claude-opus-4.6', 'claude-sonnet-4.6', 'claude-sonnet-4.5', 'gemini-3.1-pro'];
const NEVER_RECOMMENDED = ['gpt-5.6-sol-fast', 'hydrafusion', 'hydrafusion-max'];

function resolveWith(options: ModelResolutionOptions) {
  const result = resolveAgentModel(options);
  return { result, label: `resolveAgentModel(${JSON.stringify(options)}) → ${JSON.stringify(result)}` };
}

describe('quality-first is the default profile (#1598)', () => {
  const premiumTasks: TaskType[] = ['architecture', 'research', 'verification', 'review', 'security', 'design', 'visual'];
  for (const taskType of premiumTasks) {
    it(`${taskType} work resolves to the premium chain head with no profile configured`, () => {
      const { result, label } = resolveWith({ taskType });
      expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.premium[0]);
      expect(result.tier, label).toBe('premium');
      expect(result.profile, label).toBe('quality-first');
      expect(result.rationale, label).toMatch(/quality-first/);
    });
  }

  for (const taskType of ['code', 'prompt', 'docs', 'writing', 'planning'] as TaskType[]) {
    it(`${taskType} work resolves to the standard chain head, never cost-first fast`, () => {
      const { result, label } = resolveWith({ taskType });
      expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.standard[0]);
      expect(result.tier, label).toBe('standard');
    });
  }

  it('mechanical work stays on the fast chain head', () => {
    const { result, label } = resolveWith({ taskType: 'mechanical' });
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.fast[0]);
    expect(result.tier, label).toBe('fast');
  });

  it('no task type falls to the standard default, not the fast cost-first default', () => {
    const { result, label } = resolveWith({});
    expect(result.source, label).toBe('default');
    expect(result.tier, label).toBe('standard');
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.standard[0]);
  });
});

describe('balanced and economy are explicit profiles (#1598)', () => {
  it('balanced keeps language-heavy docs on standard and planning on fast', () => {
    const docs = resolveWith({ taskType: 'docs', profile: 'balanced' });
    expect(docs.result.tier, docs.label).toBe('standard');
    expect(docs.result.profile, docs.label).toBe('balanced');
    const planning = resolveWith({ taskType: 'planning', profile: 'balanced' });
    expect(planning.result.tier, planning.label).toBe('fast');
    const arch = resolveWith({ taskType: 'architecture', profile: 'balanced' });
    expect(arch.result.tier, arch.label).toBe('premium');
  });

  it('economy profile is opt-in and visibly active in the rationale', () => {
    const { result, label } = resolveWith({ taskType: 'docs', profile: 'economy' });
    expect(result.model, label).toBe('gpt-5.6-luna');
    expect(result.profile, label).toBe('economy');
    expect(result.rationale, label).toMatch(/economy/);
  });

  it('legacy economyMode: true maps to the economy profile', () => {
    const { result, label } = resolveWith({ taskType: 'architecture', economyMode: true });
    expect(result.profile, label).toBe('economy');
    expect(result.tier, label).toBe('standard');
    expect(MODELS.FALLBACK_CHAINS.premium, label).not.toContain(result.model);
  });

  it('session profile beats the persistent profile and legacy economyMode', () => {
    const { result, label } = resolveWith({ taskType: 'research', profile: 'economy', economyMode: true, sessionProfile: 'quality-first' });
    expect(result.profile, label).toBe('quality-first');
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.premium[0]);
  });

  it('explicit layers are never altered by any profile (hydrafusion opt-in kept)', () => {
    for (const profile of ['economy', 'balanced', 'quality-first'] as const) {
      const user = resolveWith({ userOverride: 'hydrafusion-max', taskType: 'mechanical', profile });
      expect(user.result.model, user.label).toBe('hydrafusion-max');
      expect(user.result.source, user.label).toBe('user-override');
      const session = resolveWith({ sessionModel: 'hydrafusion', taskType: 'docs', profile });
      expect(session.result.model, session.label).toBe('hydrafusion');
      expect(session.result.source, session.label).toBe('session');
      const config = resolveWith({ configModel: 'claude-opus-4.6', taskType: 'docs', profile });
      expect(config.result.model, `${config.label}: arbitrary explicit ids must not be disallowed`).toBe('claude-opus-4.6');
    }
  });

  it('economy still honors the cost ceiling', () => {
    const catalog = buildCatalogCategoryMap();
    for (const taskType of ['architecture', 'code', 'docs'] as TaskType[]) {
      const { result, label } = resolveWith({ taskType, profile: 'economy', sessionCostPolicy: { maxCategory: 'lightweight' } });
      expect(catalog.get(result.model), label).toBe('lightweight');
    }
  });

  it('quality-first premium picks are downgraded under a versatile ceiling', () => {
    const catalog = buildCatalogCategoryMap();
    const { result, label } = resolveWith({ taskType: 'security', config: { costPolicy: { maxCategory: 'versatile' } } });
    expect(['lightweight', 'versatile'], label).toContain(catalog.get(result.model));
    expect(result.policy?.action, label).toBe('downgraded-to-ceiling');
  });
});

describe('live runtime catalog is authoritative for availability (#1598)', () => {
  it('skips a chain head absent from the live catalog with visible fallback provenance', () => {
    const live = MODELS.FALLBACK_CHAINS.premium.slice(1);
    const { result, label } = resolveWith({ taskType: 'architecture', availableModels: live });
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.premium[1]);
    expect(result.source, label).toBe('fallback');
    expect(result.fallbackFrom, label).toMatchObject({ model: MODELS.FALLBACK_CHAINS.premium[0], source: 'task-auto' });
  });

  it('stale ids in the live catalog never win over a current GA candidate', () => {
    const live = [...STALE_IDS, 'claude-opus-5'];
    const { result, label } = resolveWith({ taskType: 'review', availableModels: live });
    expect(result.model, label).toBe('claude-opus-5');
    expect(STALE_IDS, label).not.toContain(result.model);
  });

  it('omits the model when nothing in the chain is live (Unit A omission preserved)', () => {
    const { result, label } = resolveWith({ taskType: 'mechanical', availableModels: ['some-other-model'] });
    expect(result.omitModel, label).toBe(true);
    expect(result.model, label).toBe('');
  });

  it('an explicit model missing from the live catalog falls forward visibly, never silently', () => {
    const { result, label } = resolveWith({ sessionModel: 'hydrafusion', availableModels: MODELS.FALLBACK_CHAINS.standard });
    expect(result.source, label).toBe('fallback');
    expect(result.fallbackFrom, label).toEqual({ model: 'hydrafusion', source: 'session' });
    expect(result.rationale, label).toMatch(/hydrafusion/);
  });

  it('an explicit model present in the live catalog is kept', () => {
    const { result, label } = resolveWith({ sessionModel: 'hydrafusion', availableModels: ['hydrafusion'] });
    expect(result.model, label).toBe('hydrafusion');
    expect(result.source, label).toBe('session');
  });
});

describe('catalog, constants and config defaults agree on public GA ids (#1598)', () => {
  const surfaces: Record<string, string[]> = {
    'MODELS.FALLBACK_CHAINS': Object.values(MODELS.FALLBACK_CHAINS).flat(),
    DEFAULT_FALLBACK_CHAINS: Object.values(DEFAULT_FALLBACK_CHAINS).flat(),
    'DEFAULT_CONFIG.models.tiers': Object.values(DEFAULT_CONFIG.models.tiers).flat(),
    // Preview ids are allowed in the catalog only as opt-in entries (#2014).
    'MODEL_CATALOG (non-preview)': MODEL_CATALOG.filter((m) => m.preview !== true).map((m) => m.id),
    ECONOMY_MODEL_MAP: Object.entries(ECONOMY_MODEL_MAP).flat(),
    'MODELS defaults': [MODELS.DEFAULT, MODELS.SELECTOR_DEFAULT, MODELS.NUCLEAR_FALLBACK],
  };

  for (const [surface, ids] of Object.entries(surfaces)) {
    it(`${surface} carries no stale or non-public ids`, () => {
      for (const id of [...STALE_IDS, ...NEVER_RECOMMENDED]) {
        expect(ids, `${surface} contains '${id}'`).not.toContain(id);
      }
    });
  }

  it('preview catalog entries are only the opt-in HydraFusion ids and never internal ids', () => {
    const preview = MODEL_CATALOG.filter((m) => m.preview === true).map((m) => m.id);
    for (const id of preview) {
      expect(['hydrafusion', 'hydrafusion-max'], `MODEL_CATALOG preview entry '${id}' is not an approved opt-in id`).toContain(id);
    }
    expect(MODEL_CATALOG.map((m) => m.id), "MODEL_CATALOG contains internal id 'gpt-5.6-sol-fast'").not.toContain('gpt-5.6-sol-fast');
  });

  it('runtime and config fallback chains are identical', () => {
    expect(DEFAULT_FALLBACK_CHAINS, 'DEFAULT_FALLBACK_CHAINS vs MODELS.FALLBACK_CHAINS').toEqual(MODELS.FALLBACK_CHAINS);
    expect(DEFAULT_CONFIG.models.tiers, 'DEFAULT_CONFIG.models.tiers vs MODELS.FALLBACK_CHAINS').toEqual(MODELS.FALLBACK_CHAINS);
  });

  it('every chain id is in MODEL_CATALOG with the matching tier and a cost category', () => {
    for (const [tier, chain] of Object.entries(MODELS.FALLBACK_CHAINS)) {
      for (const id of chain) {
        const info = MODEL_CATALOG.find((m) => m.id === id);
        expect(info, `chain ${tier} id '${id}' missing from MODEL_CATALOG`).toBeDefined();
        expect(info?.tier, `chain ${tier} id '${id}' catalog tier`).toBe(tier);
        expect(info?.githubCategory, `chain ${tier} id '${id}' githubCategory`).toBeDefined();
      }
    }
  });
});

describe('persistent profile via the compatibility adapter (#1598)', () => {
  let squadDir: string;
  beforeEach(() => {
    squadDir = mkdtempSync(path.join(os.tmpdir(), 'squad-profile-'));
  });
  afterEach(() => {
    rmSync(squadDir, { recursive: true, force: true });
  });

  it('writeModelProfile merges and readModelProfile round-trips; null clears', () => {
    writeFileSync(path.join(squadDir, 'config.json'), JSON.stringify({ version: 1, defaultModel: 'keep-me' }));
    writeModelProfile(squadDir, 'balanced');
    const written = JSON.parse(readFileSync(path.join(squadDir, 'config.json'), 'utf-8'));
    expect(written, JSON.stringify(written)).toMatchObject({ defaultModel: 'keep-me', modelProfile: 'balanced' });
    expect(readModelProfile(squadDir)).toBe('balanced');
    writeModelProfile(squadDir, null);
    expect(readModelProfile(squadDir), 'cleared profile').toBeNull();
  });

  it('readModelProfile ignores unknown values', () => {
    writeFileSync(path.join(squadDir, 'config.json'), JSON.stringify({ version: 1, modelProfile: 'turbo' }));
    expect(readModelProfile(squadDir), "modelProfile 'turbo'").toBeNull();
  });

  it('adapter defaults to quality-first and honors persisted economy / balanced', () => {
    expect(adapterResolveModel({ squadDir }), 'no config').toBe(MODELS.FALLBACK_CHAINS.standard[0]);
    writeModelProfile(squadDir, 'economy');
    expect(adapterResolveModel({ squadDir }), "modelProfile 'economy'").toBe(MODELS.SELECTOR_DEFAULT);
    expect(adapterResolveModel({ squadDir, profile: 'quality-first' }), 'session profile beats persisted economy').toBe(
      MODELS.FALLBACK_CHAINS.standard[0],
    );
  });
});

describe('profiles wired into AgentLifecycleManager.spawnAgent (#1598)', () => {
  let tempDir: string;
  let squadDir: string;
  let sessionConfigs: Array<Record<string, unknown>>;
  let events: Array<Record<string, unknown>>;
  let manager: AgentLifecycleManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'squad-profile-spawn-'));
    squadDir = path.join(tempDir, '.squad');
    const agentDir = path.join(squadDir, 'agents', 'auto-agent');
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      path.join(agentDir, 'charter.md'),
      `# Auto Agent\n\n## Identity\n\n**Name:** Auto Agent\n**Role:** Test\n\n## Model\n\n**Preferred:** auto\n`,
      'utf-8',
    );
    sessionConfigs = [];
    const client = {
      async createSession(config: Record<string, unknown>) {
        sessionConfigs.push(config);
        return { sessionId: `s-${sessionConfigs.length}`, async sendMessage() {}, async close() {}, on() {}, off() {} };
      },
      async deleteSession() {},
    } as unknown as SquadClientWithPool;
    const eventBus = new EventBus();
    events = [];
    eventBus.subscribe('agent:milestone', (e) => {
      events.push(e.payload as Record<string, unknown>);
    });
    manager = new AgentLifecycleManager({ client, teamRoot: tempDir, defaultIdleTimeout: 60_000, eventBus });
  });

  afterEach(async () => {
    await manager.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await fs.writeFile(path.join(squadDir, 'config.json'), JSON.stringify({ version: 1, ...config }), 'utf-8');
  }

  it('research spawn defaults to a premium model and reports the profile', async () => {
    const handle = await manager.spawnAgent({ agentName: 'auto-agent', task: 'Verify claims', taskType: 'research' });
    expect(sessionConfigs[0]?.model, `createSession for research: ${JSON.stringify(sessionConfigs[0])}`).toBe(MODELS.FALLBACK_CHAINS.premium[0]);
    expect(handle.modelResolution?.profile, JSON.stringify(handle.modelResolution)).toBe('quality-first');
    const resolved = events.find((e) => e.event === 'model.resolved');
    expect(resolved, JSON.stringify(events)).toMatchObject({ profile: 'quality-first' });
  });

  it('persistent modelProfile economy applies; session profile overrides it', async () => {
    await writeConfig({ modelProfile: 'economy' });
    const economy = await manager.spawnAgent({ agentName: 'auto-agent', task: 'Docs', taskType: 'docs' });
    expect(sessionConfigs[0]?.model, `createSession with modelProfile economy: ${JSON.stringify(sessionConfigs[0])}`).toBe('gpt-5.6-luna');
    expect(economy.modelResolution?.profile).toBe('economy');

    const quality = await manager.spawnAgent({ agentName: 'auto-agent', task: 'Docs', taskType: 'docs', sessionProfile: 'quality-first' });
    expect(sessionConfigs[1]?.model, `createSession with sessionProfile quality-first: ${JSON.stringify(sessionConfigs[1])}`).toBe(
      MODELS.FALLBACK_CHAINS.standard[0],
    );
    expect(quality.modelResolution?.profile).toBe('quality-first');
  });

  it('legacy persistent economyMode still selects economy', async () => {
    await writeConfig({ economyMode: true });
    const handle = await manager.spawnAgent({ agentName: 'auto-agent', task: 'Docs', taskType: 'docs' });
    expect(sessionConfigs[0]?.model, `createSession with economyMode true: ${JSON.stringify(sessionConfigs[0])}`).toBe('gpt-5.6-luna');
    expect(handle.modelResolution?.profile).toBe('economy');
  });

  it('forwards the live catalog: an absent chain head is skipped before dispatch', async () => {
    const live = MODELS.FALLBACK_CHAINS.premium.slice(1);
    const handle = await manager.spawnAgent({ agentName: 'auto-agent', task: 'Review', taskType: 'review', availableModels: live });
    expect(sessionConfigs[0]?.model, `createSession with live catalog ${JSON.stringify(live)}: ${JSON.stringify(sessionConfigs[0])}`).toBe(live[0]);
    expect(handle.modelResolution?.fallbackFrom).toMatchObject({ model: MODELS.FALLBACK_CHAINS.premium[0] });
  });
});
