/**
 * HydraFusion opt-in support (#2014).
 *
 * `hydrafusion` and `hydrafusion-max` are research-preview model ids. Squad
 * knows them (premium tier, catalog entries marked preview) but never picks
 * them implicitly: they appear in no default chain and no GA profile. The
 * opt-in `hydrafusion` profile puts `hydrafusion` first for quality-sensitive
 * work and falls through to the quality-first premium chain. `hydrafusion-max`
 * is used only when named explicitly.
 *
 * @module test/model-hydrafusion
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import {
  MODEL_CATALOG,
  DEFAULT_FALLBACK_CHAINS,
  DEFAULT_CONFIG,
  ECONOMY_MODEL_MAP,
  ModelRegistry,
  readModelProfile,
  writeModelProfile,
  resolveModel as adapterResolveModel,
} from '@bradygaster/squad-sdk/config';
import {
  resolveAgentModel,
  buildCatalogCategoryMap,
  isModelSelectionProfile,
  MODEL_SELECTION_PROFILES,
  AgentLifecycleManager,
  type ModelResolutionOptions,
  type TaskType,
} from '@bradygaster/squad-sdk/agents';
import { MODELS } from '@bradygaster/squad-sdk/runtime/constants';
import type { SquadClientWithPool } from '@bradygaster/squad-sdk/client';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';

const HF = 'hydrafusion';
const HF_MAX = 'hydrafusion-max';
const PREVIEW_IDS = [HF, HF_MAX];
const ALL_TASKS: TaskType[] = [
  'code', 'prompt', 'docs', 'visual', 'planning', 'mechanical', 'architecture',
  'research', 'verification', 'review', 'security', 'design', 'writing',
];
const HF_TASKS: TaskType[] = ['architecture', 'research', 'verification', 'review', 'security', 'design'];
const GA_PROFILES = ['quality-first', 'balanced', 'economy'] as const;
const CEILINGS = [undefined, 'powerful', 'versatile', 'lightweight'] as const;

function resolveWith(options: ModelResolutionOptions) {
  const result = resolveAgentModel(options);
  return { result, label: `resolveAgentModel(${JSON.stringify(options)}) → ${JSON.stringify(result)}` };
}

function withCeiling(options: ModelResolutionOptions, ceiling: (typeof CEILINGS)[number]): ModelResolutionOptions {
  return ceiling ? { ...options, sessionCostPolicy: { maxCategory: ceiling } } : options;
}

describe('HydraFusion catalog entries are preview / opt-in (#2014)', () => {
  for (const id of PREVIEW_IDS) {
    it(`MODEL_CATALOG lists '${id}' as a premium, preview-only entry`, () => {
      const info = MODEL_CATALOG.find((m) => m.id === id) as (Record<string, unknown> | undefined);
      expect(info, `MODEL_CATALOG entry for '${id}'`).toBeDefined();
      expect(info?.tier, `MODEL_CATALOG '${id}' tier`).toBe('premium');
      expect(info?.preview, `MODEL_CATALOG '${id}' must be marked preview (opt-in)`).toBe(true);
      expect(info?.githubCategory, `MODEL_CATALOG '${id}' needs a cost category so ceilings apply`).toBe('powerful');
    });

    it(`an explicit '${id}' is inferred as premium tier with the premium fallback chain`, () => {
      const { result, label } = resolveWith({ sessionModel: id });
      expect(result.tier, label).toBe('premium');
      expect(result.fallbackChain, label).toEqual(MODELS.FALLBACK_CHAINS.premium);
    });
  }

  it('the only preview catalog entries are the HydraFusion opt-in ids', () => {
    const preview = MODEL_CATALOG.filter((m) => (m as { preview?: boolean }).preview === true).map((m) => m.id);
    expect(preview.sort(), `preview MODEL_CATALOG ids ${JSON.stringify(preview)}`).toEqual([...PREVIEW_IDS].sort());
  });

  const defaultSurfaces: Record<string, string[]> = {
    'MODELS.FALLBACK_CHAINS': Object.values(MODELS.FALLBACK_CHAINS).flat(),
    DEFAULT_FALLBACK_CHAINS: Object.values(DEFAULT_FALLBACK_CHAINS).flat(),
    'DEFAULT_CONFIG.models.tiers': Object.values(DEFAULT_CONFIG.models.tiers).flat(),
    'DEFAULT_CONFIG.models.default': [DEFAULT_CONFIG.models.default],
    ECONOMY_MODEL_MAP: Object.entries(ECONOMY_MODEL_MAP).flat(),
    'MODELS defaults': [MODELS.DEFAULT, MODELS.SELECTOR_DEFAULT, MODELS.NUCLEAR_FALLBACK],
  };
  for (const [surface, ids] of Object.entries(defaultSurfaces)) {
    it(`${surface} contains no preview id`, () => {
      for (const id of PREVIEW_IDS) expect(ids, `${surface} contains '${id}'`).not.toContain(id);
    });
  }
});

describe('ModelRegistry recommendations never include preview ids (#2014)', () => {
  const registry = new ModelRegistry();
  const useCases = [...new Set(MODEL_CATALOG.flatMap((m) => m.useCases ?? []))];
  for (const useCase of useCases) {
    it(`getRecommendedModels('${useCase}') contains no preview id`, () => {
      const ids = registry.getRecommendedModels(useCase).map((m) => m.id);
      expect(ids.filter((id) => PREVIEW_IDS.includes(id)), `getRecommendedModels('${useCase}') → ${JSON.stringify(ids)}`).toEqual([]);
      const premium = registry.getRecommendedModels(useCase, 'premium').map((m) => m.id);
      expect(premium.filter((id) => PREVIEW_IDS.includes(id)), `getRecommendedModels('${useCase}', 'premium') → ${JSON.stringify(premium)}`).toEqual([]);
    });
  }

  it('preview ids stay available through explicit catalog lookup', () => {
    for (const id of PREVIEW_IDS) {
      expect(registry.getModelInfo(id)?.preview, `getModelInfo('${id}')`).toBe(true);
    }
  });
});

describe('HydraFusion is never auto-selected under GA profiles (#2014)', () => {
  for (const profile of GA_PROFILES) {
    for (const ceiling of CEILINGS) {
      it(`${profile} profile${ceiling ? ` with ${ceiling} ceiling` : ''} never resolves or chains a preview id`, () => {
        for (const taskType of [...ALL_TASKS, undefined]) {
          const { result, label } = resolveWith(withCeiling({ taskType, profile }, ceiling));
          for (const id of PREVIEW_IDS) {
            expect(result.model, label).not.toBe(id);
            expect(result.fallbackChain, label).not.toContain(id);
          }
        }
      });
    }
  }
});

describe('opt-in hydrafusion profile (#2014)', () => {
  it("'hydrafusion' is a supported profile", () => {
    expect(isModelSelectionProfile(HF), `isModelSelectionProfile('${HF}')`).toBe(true);
    expect(MODEL_SELECTION_PROFILES, 'MODEL_SELECTION_PROFILES').toContain(HF);
  });

  for (const taskType of HF_TASKS) {
    it(`${taskType} work picks hydrafusion first, then the quality-first premium chain`, () => {
      const { result, label } = resolveWith({ taskType, profile: HF });
      expect(result.model, label).toBe(HF);
      expect(result.tier, label).toBe('premium');
      expect(result.source, label).toBe('task-auto');
      expect(result.profile, label).toBe(HF);
      expect(result.fallbackChain, label).toEqual([HF, ...MODELS.FALLBACK_CHAINS.premium]);
      expect(result.rationale, label).toMatch(/hydrafusion/);
    });
  }

  it('session profile hydrafusion beats a persistent GA profile', () => {
    const { result, label } = resolveWith({ taskType: 'review', profile: 'economy', sessionProfile: HF });
    expect(result.model, label).toBe(HF);
  });

  it('Scribe / mechanical work stays on the fast chain head', () => {
    const { result, label } = resolveWith({ taskType: 'mechanical', profile: HF, agentRole: 'scribe' });
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.fast[0]);
    expect(result.tier, label).toBe('fast');
    expect(result.fallbackChain, label).not.toContain(HF);
  });

  for (const taskType of ['code', 'prompt', 'docs', 'writing', 'planning', 'visual'] as TaskType[]) {
    it(`${taskType} work follows quality-first unchanged`, () => {
      const hf = resolveWith({ taskType, profile: HF });
      const qf = resolveWith({ taskType, profile: 'quality-first' });
      expect(hf.result.model, `${hf.label} vs ${qf.label}`).toBe(qf.result.model);
      expect(hf.result.fallbackChain, hf.label).not.toContain(HF);
    });
  }

  it('no task type falls to the standard default', () => {
    const { result, label } = resolveWith({ profile: HF });
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.standard[0]);
  });

  it('explicit layers still win over the hydrafusion profile', () => {
    const { result, label } = resolveWith({ taskType: 'architecture', profile: HF, configModel: 'claude-opus-5' });
    expect(result.model, label).toBe('claude-opus-5');
    expect(result.source, label).toBe('config');
  });
});

describe('hydrafusion-max is only used when named explicitly (#2014)', () => {
  for (const profile of [...GA_PROFILES, HF] as const) {
    for (const ceiling of CEILINGS) {
      it(`${profile} profile${ceiling ? ` with ${ceiling} ceiling` : ''} never picks hydrafusion-max implicitly`, () => {
        for (const taskType of [...ALL_TASKS, undefined]) {
          const { result, label } = resolveWith(withCeiling({ taskType, profile }, ceiling));
          expect(result.model, label).not.toBe(HF_MAX);
          expect(result.fallbackChain, label).not.toContain(HF_MAX);
        }
      });
    }
  }

  for (const layer of ['userOverride', 'configModel', 'sessionModel'] as const) {
    it(`an explicit ${layer} of hydrafusion-max is honored under the hydrafusion profile`, () => {
      const { result, label } = resolveWith({ [layer]: HF_MAX, taskType: 'architecture', profile: HF });
      expect(result.model, label).toBe(HF_MAX);
      expect(result.tier, label).toBe('premium');
      expect(result.source, label).not.toBe('task-auto');
    });
  }
});

describe('hydrafusion unavailable: forward-only fallback within the cost ceiling (#2014)', () => {
  it('missing from the live catalog → quality-first premium chain head, visibly', () => {
    const live = [...MODELS.FALLBACK_CHAINS.premium];
    const { result, label } = resolveWith({ taskType: 'security', profile: HF, availableModels: live });
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.premium[0]);
    expect(result.source, label).toBe('fallback');
    expect(result.fallbackFrom, label).toEqual({ model: HF, source: 'task-auto' });
    expect(result.rationale, label).toMatch(/hydrafusion/);
  });

  it('keeps moving forward along the premium chain, never back to hydrafusion', () => {
    const unavailable = [HF, MODELS.FALLBACK_CHAINS.premium[0], MODELS.FALLBACK_CHAINS.premium[1]];
    const { result, label } = resolveWith({ taskType: 'architecture', profile: HF, unavailableModels: unavailable });
    expect(result.model, label).toBe(MODELS.FALLBACK_CHAINS.premium[2]);
    expect(result.fallbackFrom, label).toEqual({ model: HF, source: 'task-auto' });
    expect(result.fallbackChain, label).toEqual(MODELS.FALLBACK_CHAINS.premium.slice(2));
    expect(result.fallbackChain, label).not.toContain(HF);
  });

  it('never falls over the cost ceiling: versatile ceiling downgrades the implicit pick', () => {
    const catalog = buildCatalogCategoryMap();
    for (const taskType of HF_TASKS) {
      const { result, label } = resolveWith({ taskType, profile: HF, sessionCostPolicy: { maxCategory: 'versatile' } });
      expect(result.model, label).not.toBe(HF);
      expect(['lightweight', 'versatile'], label).toContain(catalog.get(result.model));
    }
  });

  it('an explicit hydrafusion over a versatile ceiling falls forward only within the ceiling', () => {
    const catalog = buildCatalogCategoryMap();
    const { result, label } = resolveWith({
      sessionModel: HF,
      unavailableModels: [HF],
      sessionCostPolicy: { maxCategory: 'versatile' },
    });
    expect(result.policy?.action, label).toBe('warn-allow-explicit');
    if (!result.omitModel) {
      expect(['lightweight', 'versatile'], label).toContain(catalog.get(result.model));
    }
    expect(result.model, label).not.toBe(HF);
  });

  it('no candidate left → model omitted', () => {
    const { result, label } = resolveWith({ taskType: 'review', profile: HF, availableModels: ['some-other-model'] });
    expect(result.omitModel, label).toBe(true);
    expect(result.model, label).toBe('');
  });
});

describe('persistent hydrafusion profile via config (#2014)', () => {
  let squadDir: string;
  beforeEach(() => {
    squadDir = mkdtempSync(path.join(os.tmpdir(), 'squad-hf-profile-'));
  });
  afterEach(() => {
    rmSync(squadDir, { recursive: true, force: true });
  });

  it("modelProfile 'hydrafusion' round-trips through config.json", () => {
    writeFileSync(path.join(squadDir, 'config.json'), JSON.stringify({ version: 1 }));
    expect(() => writeModelProfile(squadDir, HF as never), `writeModelProfile('${HF}')`).not.toThrow();
    expect(readModelProfile(squadDir), `readModelProfile after writing '${HF}'`).toBe(HF);
    expect(adapterResolveModel({ squadDir }), 'adapter default under hydrafusion profile').toBe(MODELS.FALLBACK_CHAINS.standard[0]);
  });
});

describe('spawns through AgentLifecycleManager.createSession (#2014)', () => {
  let tempDir: string;
  let squadDir: string;
  let sessionConfigs: Array<Record<string, unknown>>;
  let manager: AgentLifecycleManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'squad-hf-spawn-'));
    squadDir = path.join(tempDir, '.squad');
    for (const agent of ['auto-agent', 'scribe']) {
      const agentDir = path.join(squadDir, 'agents', agent);
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(
        path.join(agentDir, 'charter.md'),
        `# ${agent}\n\n## Identity\n\n**Name:** ${agent}\n**Role:** Test\n\n## Model\n\n**Preferred:** auto\n`,
        'utf-8',
      );
    }
    sessionConfigs = [];
    const client = {
      async createSession(config: Record<string, unknown>) {
        sessionConfigs.push(config);
        return { sessionId: `s-${sessionConfigs.length}`, async sendMessage() {}, async close() {}, on() {}, off() {} };
      },
      async deleteSession() {},
    } as unknown as SquadClientWithPool;
    manager = new AgentLifecycleManager({ client, teamRoot: tempDir, defaultIdleTimeout: 60_000 });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await manager.shutdown();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('hydrafusion profile but hydrafusion not available to the user (org policy / preview off)', () => {
    const premiumNext = MODELS.FALLBACK_CHAINS.premium[0];
    let warnings: string[];
    let notices: Array<Record<string, unknown>>;

    function rejectingClient(rejected: string): SquadClientWithPool {
      return {
        async createSession(config: Record<string, unknown>) {
          sessionConfigs.push(config);
          if (config.model === rejected) throw new Error(`Model '${rejected}' is not enabled by your organization's policy`);
          return { sessionId: `s-${sessionConfigs.length}`, async sendMessage() {}, async close() {}, on() {}, off() {} };
        },
        async deleteSession() {},
      } as unknown as SquadClientWithPool;
    }

    beforeEach(async () => {
      warnings = [];
      notices = [];
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warnings.push(args.map(String).join(' ')); });
      await fs.writeFile(path.join(squadDir, 'config.json'), JSON.stringify({ version: 1, modelProfile: HF }), 'utf-8');
    });

    async function managerWith(client: SquadClientWithPool): Promise<AgentLifecycleManager> {
      await manager.shutdown();
      const eventBus = new EventBus();
      eventBus.subscribe('agent:milestone', (event) => {
        if ((event.payload as Record<string, unknown>)?.event === 'model.unavailable') notices.push(event.payload as Record<string, unknown>);
      });
      manager = new AgentLifecycleManager({ client, teamRoot: tempDir, defaultIdleTimeout: 60_000, eventBus });
      return manager;
    }

    it('createSession rejecting hydrafusion: spawn succeeds on the next premium-chain model, user told once', async () => {
      const m = await managerWith(rejectingClient(HF));
      const first = await m.spawnAgent({ agentName: 'auto-agent', task: 'Review', taskType: 'review' });
      const second = await m.spawnAgent({ agentName: 'auto-agent', task: 'Audit', taskType: 'security' });
      const label = `createSession calls ${JSON.stringify(sessionConfigs.map((c) => c.model))}; warnings ${JSON.stringify(warnings)}`;
      expect(sessionConfigs.map((c) => c.model), label).toEqual([HF, premiumNext, HF, premiumNext]);
      expect(first.model, label).toBe(premiumNext);
      expect(second.model, label).toBe(premiumNext);
      expect(first.modelResolution?.fallbackFrom, label).toEqual({ model: HF, source: 'task-auto' });
      expect(warnings.filter((w) => w.includes(HF)), label).toHaveLength(1);
      expect(warnings.find((w) => w.includes(HF)), label).toContain(premiumNext);
      expect(notices, label).toHaveLength(1);
      expect(notices[0], label).toMatchObject({ model: HF, replacement: premiumNext });
    });

    it('hydrafusion missing from the live model list: next premium-chain model, user told once', async () => {
      const m = await managerWith(rejectingClient(HF));
      const live = [...MODELS.FALLBACK_CHAINS.premium, ...MODELS.FALLBACK_CHAINS.fast];
      await m.spawnAgent({ agentName: 'auto-agent', task: 'Review', taskType: 'review', availableModels: live });
      await m.spawnAgent({ agentName: 'auto-agent', task: 'Design', taskType: 'design', availableModels: live });
      const label = `createSession calls ${JSON.stringify(sessionConfigs.map((c) => c.model))}; warnings ${JSON.stringify(warnings)}`;
      expect(sessionConfigs.map((c) => c.model), label).toEqual([premiumNext, premiumNext]);
      expect(warnings.filter((w) => w.includes(HF)), label).toHaveLength(1);
      expect(notices, label).toHaveLength(1);
    });

    it('an explicit model rejected by createSession still fails the spawn (no silent swap)', async () => {
      const m = await managerWith(rejectingClient(HF_MAX));
      await expect(
        m.spawnAgent({ agentName: 'auto-agent', task: 'Review', taskType: 'review', modelOverride: HF_MAX }),
        `explicit modelOverride '${HF_MAX}' rejected by createSession`,
      ).rejects.toThrow(HF_MAX);
      expect(sessionConfigs.map((c) => c.model)).toEqual([HF_MAX]);
    });
  });

  it('a session model of hydrafusion is inherited by every spawn, including Scribe', async () => {
    const lead = await manager.spawnAgent({ agentName: 'auto-agent', task: 'Review', taskType: 'review', sessionModel: HF });
    const scribe = await manager.spawnAgent({ agentName: 'scribe', task: 'Log', taskType: 'mechanical', sessionModel: HF });
    expect(sessionConfigs[0]?.model, `createSession for review with sessionModel '${HF}': ${JSON.stringify(sessionConfigs[0])}`).toBe(HF);
    expect(lead.modelResolution?.source, JSON.stringify(lead.modelResolution)).toBe('session');
    expect(sessionConfigs[1]?.model, `createSession for scribe with sessionModel '${HF}': ${JSON.stringify(sessionConfigs[1])}`).toBe(HF);
    expect(scribe.modelResolution?.source, JSON.stringify(scribe.modelResolution)).toBe('session');
  });

  it("persistent modelProfile 'hydrafusion' sends reviews to hydrafusion and keeps Scribe on fast", async () => {
    await fs.writeFile(path.join(squadDir, 'config.json'), JSON.stringify({ version: 1, modelProfile: HF }), 'utf-8');
    await manager.spawnAgent({ agentName: 'auto-agent', task: 'Review', taskType: 'review' });
    await manager.spawnAgent({ agentName: 'scribe', task: 'Log', taskType: 'mechanical' });
    expect(sessionConfigs[0]?.model, `createSession for review with modelProfile '${HF}': ${JSON.stringify(sessionConfigs[0])}`).toBe(HF);
    expect(sessionConfigs[1]?.model, `createSession for scribe with modelProfile '${HF}': ${JSON.stringify(sessionConfigs[1])}`).toBe(
      MODELS.FALLBACK_CHAINS.fast[0],
    );
  });

  it('session profile hydrafusion with hydrafusion absent from the live catalog dispatches the premium chain head', async () => {
    const live = [...MODELS.FALLBACK_CHAINS.premium];
    const handle = await manager.spawnAgent({
      agentName: 'auto-agent', task: 'Architect', taskType: 'architecture', sessionProfile: HF as never, availableModels: live,
    });
    expect(sessionConfigs[0]?.model, `createSession with live ${JSON.stringify(live)}: ${JSON.stringify(sessionConfigs[0])}`).toBe(live[0]);
    expect(handle.modelResolution?.fallbackFrom, JSON.stringify(handle.modelResolution)).toEqual({ model: HF, source: 'task-auto' });
  });
});
