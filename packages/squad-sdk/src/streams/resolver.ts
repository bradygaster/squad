/**
 * Workstream Resolver — Resolves which workstream is active.
 *
 * Resolution order:
 *   1. SQUAD_TEAM env var → look up in workstreams config
 *   2. .squad-workstream file (gitignored) → contains workstream name
 *   3. If exactly one workstream is defined in the config, auto-select that workstream
 *   4. null (no active workstream — single-squad mode / no workstreams)
 *
 * @module streams/resolver
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { WorkstreamConfig, WorkstreamDefinition, ResolvedWorkstream } from './types.js';

/**
 * Load workstreams configuration from .squad/workstreams.json.
 *
 * @param squadRoot - Root directory of the project (where .squad/ lives)
 * @returns Parsed WorkstreamConfig or null if not found / invalid
 */
export function loadWorkstreamsConfig(squadRoot: string): WorkstreamConfig | null {
  const configPath = join(squadRoot, '.squad', 'workstreams.json');
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
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

    const workstreams: WorkstreamDefinition[] = workstreamsRaw
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

        return normalized as unknown as WorkstreamDefinition;
      })
      .filter((s): s is WorkstreamDefinition => s !== null);

    if (workstreams.length === 0) {
      return null;
    }

    return { defaultWorkflow, workstreams };
  } catch {
    return null;
  }
}

/** @deprecated Use loadWorkstreamsConfig instead */
export const loadStreamsConfig = loadWorkstreamsConfig;

/**
 * Find a workstream definition by name in a config.
 */
function findWorkstream(config: WorkstreamConfig, name: string): WorkstreamDefinition | undefined {
  return config.workstreams.find(s => s.name === name);
}

/**
 * Resolve which workstream is active for the current environment.
 *
 * @param squadRoot - Root directory of the project
 * @returns ResolvedWorkstream or null if no workstream is active
 */
export function resolveWorkstream(squadRoot: string): ResolvedWorkstream | null {
  const config = loadWorkstreamsConfig(squadRoot);

  // 1. SQUAD_TEAM env var
  const envTeam = process.env.SQUAD_TEAM;
  if (envTeam) {
    if (config) {
      const def = findWorkstream(config, envTeam);
      if (def) {
        return { name: envTeam, definition: def, source: 'env' };
      }
    }
    // Env var set but no matching workstream config — synthesize a minimal definition
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
  if (existsSync(workstreamFilePath)) {
    try {
      const workstreamName = readFileSync(workstreamFilePath, 'utf-8').trim();
      if (workstreamName) {
        if (config) {
          const def = findWorkstream(config, workstreamName);
          if (def) {
            return { name: workstreamName, definition: def, source: 'file' };
          }
        }
        // File exists but no config — synthesize
        return {
          name: workstreamName,
          definition: {
            name: workstreamName,
            labelFilter: `team:${workstreamName}`,
          },
          source: 'file',
        };
      }
    } catch {
      // Ignore read errors
    }
  }

  // 3. If exactly one workstream is defined, auto-select it
  if (config && config.workstreams.length === 1) {
    const def = config.workstreams[0]!;
    return { name: def.name, definition: def, source: 'config' };
  }

  // 4. No workstream detected
  return null;
}

/** @deprecated Use resolveWorkstream instead */
export const resolveStream = resolveWorkstream;

/**
 * Get the GitHub label filter string for a resolved workstream.
 *
 * @param workstream - The resolved workstream
 * @returns Label filter string (e.g., "team:ui")
 */
export function getWorkstreamLabelFilter(workstream: ResolvedWorkstream): string {
  return workstream.definition.labelFilter;
}

/** @deprecated Use getWorkstreamLabelFilter instead */
export const getStreamLabelFilter = getWorkstreamLabelFilter;
