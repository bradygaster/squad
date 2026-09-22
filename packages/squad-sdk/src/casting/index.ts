/**
 * Casting System (PRD 11 + M3-2)
 *
 * Runtime casting engine that generates agent personas from universe themes.
 * Typed config replaces static markdown definitions.
 *
 * v1 API (M3-2):  CastingEngine.castTeam(config) → CastMember[]
 * Legacy API:     CastingRegistry (filesystem-backed, stub)
 */

import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import * as path from 'node:path';
import { readCastingRegistryPair } from './durable-registry.js';

const storage = new FSStorageProvider();

export {
  CastingEngine,
  type CastMember,
  type CastingConfig,
  type AgentRole,
  type UniverseId,
} from './casting-engine.js';

// Re-export casting history (M3-10)
export {
  CastingHistory,
  type CastingRecord,
  type CastingRecordMember,
  type SerializedCastingHistory,
} from './casting-history.js';

export {
  AGENT_PROVENANCE_SCHEMA,
  AGENT_PROVENANCE_VERSION,
  WORK_AGENT_BINDING_SCHEMA,
  WORK_AGENT_BINDING_VERSION,
  AgentProvenanceError,
  parseAgentProvenanceRegistry,
  parseWorkAgentBindings,
  reconcileAgentProvenanceRegistry,
  type AgentAvatarReference,
  type AgentProvenanceCandidate,
  type AgentProvenanceDiagnostic,
  type AgentProvenanceParseResult,
  type AgentProvenanceRecord,
  type AgentProvenanceRegistry,
  type AgentProvenanceStatus,
  type ReconcileAgentProvenanceOptions,
  type WorkAgentBinding,
  type WorkAgentBindingContext,
} from './agent-provenance.js';

export {
  CastingCommitInDoubtError,
  acquireCastingRegistryLock,
  acquireCastingRegistryLockAsync,
  commitCastingRegistryPair,
  ensureCastingRegistryPair,
  ensureCastingRegistryPairLocked,
  prepareCastingRegistryPairLocked,
  readCastingRegistryPair,
  recoverCastingRegistryTransaction,
  validateCastingRegistryPairRaw,
  _setCastingDurabilityHooksForTesting,
  type CastingDurabilityBoundary,
  type CastingDurabilityHooks,
  type EnsureCastingPairResult,
  type CastingPairSnapshot,
} from './durable-registry.js';

// --- Legacy Types (kept for backward compat) ---

export interface CastingUniverse {
  /** Universe name (e.g., 'The Wire', 'Seinfeld') */
  name: string;
  /** Available character names */
  characters: string[];
  /** Universe-specific constraints */
  constraints?: string[];
}

export interface CastingEntry {
  /** Agent role name (e.g., 'core-dev', 'lead') */
  role: string;
  /** Cast character name */
  characterName: string;
  /** Universe the character is from */
  universe: string;
  /** Display name (e.g., 'Fenster — Core Dev') */
  displayName: string;
}

export interface CastingRegistryConfig {
  /** Path to .squad/casting/ directory */
  castingDir: string;
  /** Active universe name */
  activeUniverse?: string;
}

// --- Legacy Casting Registry ---

export class CastingRegistry {
  private entries: Map<string, CastingEntry> = new Map();
  private config: CastingRegistryConfig;

  constructor(config: CastingRegistryConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
    const registryPath = path.join(this.config.castingDir, 'registry.json');
    if (!storage.existsSync(registryPath)) return;

    const registry = readCastingRegistryPair(this.config.castingDir).registry;
    const agents = registry?.['agents'] as Record<string, Record<string, unknown>>;
    for (const record of Object.values(agents)) {
      if (record['status'] !== 'active') continue;
      const role = record['role'] as string;
      const characterName = record['display_name'] as string;
      this.entries.set(role, {
        role,
        characterName,
        universe: record['universe'] as string,
        displayName: `${characterName} — ${role}`,
      });
    }
  }

  getByRole(role: string): CastingEntry | undefined {
    return this.entries.get(role);
  }

  getAllEntries(): CastingEntry[] {
    return Array.from(this.entries.values());
  }

  async cast(role: string, _universe?: string): Promise<CastingEntry> {
    throw new Error('Not implemented');
  }

  async recast(_universe: string): Promise<CastingEntry[]> {
    throw new Error('Not implemented');
  }
}
