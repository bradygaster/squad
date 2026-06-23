/**
 * SubSquad Resolver — Resolves which SubSquad is active.
 *
 * Resolution order:
 *   1. SQUAD_TEAM env var → look up in SubSquads config
 *   2. .squad-workstream file (gitignored) → contains SubSquad name
 *   3. If exactly one SubSquad is defined in the config, auto-select that SubSquad
 *   4. null (no active SubSquad — single-squad mode / no SubSquads)
 *
 * @module streams/resolver
 */

import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import { join } from 'path';
import type { SubSquadConfig, SubSquadDefinition, ResolvedSubSquad } from './types.js';

const storage = new FSStorageProvider();

/**
 * Load SubSquads configuration from .squad/workstreams.json.
 *
 * @param squadRoot - Root directory of the project (where .squad/ lives)
 * @returns Parsed SubSquadConfig or null if not found / invalid
 */
export function loadSubSquadsConfig(squadRoot: string): SubSquadConfig | null {
  const configPath = join(squadRoot, '.squad', 'workstreams.json');
  if (!storage.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = storage.readSync(configPath) ?? '';
    const rawConfig = JSON.parse(raw) as unknown;

    if (!rawConfig || typeof rawConfig !== 'object') {
      return null;
    }

    const configLike = rawConfig as { defaultWorkflow?: unknown; workstreams?: unknown };

    // Derive a sane defaultWorkflow value
    const validWorkflows = ['branch-per-issue', 'direct'] as const;
    const rawWorkflow =
      typeof configLike.defaultWorkflow === 'string' && configLike.defaultWorkflow.trim() !== ''
        ? configLike.defaultWorkflow
        : 'branch-per-issue';
    const defaultWorkflow: 'branch-per-issue' | 'direct' =
      validWorkflows.includes(rawWorkflow as typeof validWorkflows[number])
        ? (rawWorkflow as 'branch-per-issue' | 'direct')
        : 'branch-per-issue';

    const workstreamsRaw = configLike.workstreams;
    if (!Array.isArray(workstreamsRaw)) {
      return null;
    }

    const workstreams: SubSquadDefinition[] = workstreamsRaw
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => {
        const e = entry as {
          name?: unknown;
          labelFilter?: unknown;
          folderScope?: unknown;
          workflow?: unknown;
          description?: unknown;
        };

        if (typeof e.name !== 'string' || typeof e.labelFilter !== 'string') {
          return null;
        }

        const normalized: Record<string, unknown> = {
          name: e.name,
          labelFilter: e.labelFilter,
        };

        if (Array.isArray(e.folderScope) && e.folderScope.every(item => typeof item === 'string')) {
          normalized.folderScope = e.folderScope;
        }

        if (typeof e.workflow === 'string' && e.workflow.trim() !== '') {
          normalized.workflow = e.workflow;
        } else {
          normalized.workflow = defaultWorkflow;
        }

        if (typeof e.description === 'string') {
          normalized.description = e.description;
        }

        return normalized as unknown as SubSquadDefinition;
      })
      .filter((s): s is SubSquadDefinition => s !== null);

    if (workstreams.length === 0) {
      return null;
    }

    return { defaultWorkflow, workstreams };
  } catch {
    return null;
  }
}

/** @deprecated Use loadSubSquadsConfig instead */
export const loadWorkstreamsConfig = loadSubSquadsConfig;

/** @deprecated Use loadSubSquadsConfig instead */
export const loadStreamsConfig = loadSubSquadsConfig;

/**
 * Find a SubSquad definition by name in a config.
 */
function findSubSquad(config: SubSquadConfig, name: string): SubSquadDefinition | undefined {
  return config.workstreams.find(s => s.name === name);
}

/**
 * Resolve which SubSquad is active for the current environment.
 *
 * @param squadRoot - Root directory of the project
 * @returns ResolvedSubSquad or null if no SubSquad is active
 */
export function resolveSubSquad(squadRoot: string): ResolvedSubSquad | null {
  const config = loadSubSquadsConfig(squadRoot);

  // 1. SQUAD_TEAM env var
  const envTeam = process.env.SQUAD_TEAM;
  if (envTeam) {
    if (config) {
      const def = findSubSquad(config, envTeam);
      if (def) {
        return { name: envTeam, definition: def, source: 'env' };
      }
    }
    // Env var set but no matching SubSquad config — synthesize a minimal definition
    return {
      name: envTeam,
      definition: {
        name: envTeam,
        labelFilter: `team:${envTeam}`,
      },
      source: 'env',
    };
  }

  // 2. .squad-workstream file
  const workstreamFilePath = join(squadRoot, '.squad-workstream');
  if (storage.existsSync(workstreamFilePath)) {
    try {
      const subsquadName = (storage.readSync(workstreamFilePath) ?? '').trim();
      if (subsquadName) {
        if (config) {
          const def = findSubSquad(config, subsquadName);
          if (def) {
            return { name: subsquadName, definition: def, source: 'file' };
          }
        }
        // File exists but no config — synthesize
        return {
          name: subsquadName,
          definition: {
            name: subsquadName,
            labelFilter: `team:${subsquadName}`,
          },
          source: 'file',
        };
      }
    } catch {
      // Ignore read errors
    }
  }

  // 3. If exactly one SubSquad is defined, auto-select it
  if (config && config.workstreams.length === 1) {
    const def = config.workstreams[0]!;
    return { name: def.name, definition: def, source: 'config' };
  }

  // 4. No SubSquad detected
  return null;
}

/** @deprecated Use resolveSubSquad instead */
export const resolveWorkstream = resolveSubSquad;

/** @deprecated Use resolveSubSquad instead */
export const resolveStream = resolveSubSquad;

/**
 * Get the GitHub label filter string for a resolved SubSquad.
 *
 * @param subsquad - The resolved SubSquad
 * @returns Label filter string (e.g., "team:ui")
 */
export function getSubSquadLabelFilter(subsquad: ResolvedSubSquad): string {
  return subsquad.definition.labelFilter;
}

/** @deprecated Use getSubSquadLabelFilter instead */
export const getWorkstreamLabelFilter = getSubSquadLabelFilter;

/** @deprecated Use getSubSquadLabelFilter instead */
export const getStreamLabelFilter = getSubSquadLabelFilter;
