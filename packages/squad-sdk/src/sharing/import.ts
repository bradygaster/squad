/**
 * M5-2: Import command (squad import)
 * Imports a Squad configuration bundle into a target project.
 */

import { join } from 'node:path';
import type { ExportBundle, ExportRoutingRule } from './export.js';
import type { StorageProvider } from '../storage/storage-provider.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';

export interface ImportOptions {
  merge?: boolean;
  dryRun?: boolean;
  skipValidation?: boolean;
}

export interface ImportChange {
  type: 'added' | 'modified' | 'skipped';
  path: string;
  reason?: string;
}

export interface ImportResult {
  success: boolean;
  changes: ImportChange[];
  warnings: string[];
}

export interface BundleValidationError {
  field: string;
  message: string;
}

/**
 * Deserialize a bundle string (JSON or YAML-like) into an ExportBundle.
 */
export function deserializeBundle(content: string): ExportBundle {
  const trimmed = content.trim();
  // Try JSON first
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as ExportBundle;
  }
  // Minimal: only JSON is fully supported for import
  throw new Error('Only JSON format is supported for import');
}

/**
 * Validate an ExportBundle for structural correctness.
 */
export function validateBundle(bundle: ExportBundle): BundleValidationError[] {
  const errors: BundleValidationError[] = [];

  if (!bundle.metadata) {
    errors.push({ field: 'metadata', message: 'Missing metadata' });
  } else {
    if (!bundle.metadata.version) {
      errors.push({ field: 'metadata.version', message: 'Missing version in metadata' });
    }
    if (!bundle.metadata.timestamp) {
      errors.push({ field: 'metadata.timestamp', message: 'Missing timestamp in metadata' });
    }
  }

  if (!bundle.agents || !Array.isArray(bundle.agents)) {
    errors.push({ field: 'agents', message: 'Missing or invalid agents array' });
  } else {
    for (let i = 0; i < bundle.agents.length; i++) {
      const agent = bundle.agents[i]!;
      if (!agent.name) errors.push({ field: `agents[${i}].name`, message: 'Agent missing name' });
      if (!agent.content) errors.push({ field: `agents[${i}].content`, message: 'Agent missing content' });
    }
  }

  if (!bundle.routingRules || !Array.isArray(bundle.routingRules)) {
    errors.push({ field: 'routingRules', message: 'Missing or invalid routingRules array' });
  }

  if (bundle.config === undefined || bundle.config === null) {
    errors.push({ field: 'config', message: 'Missing config' });
  }

  return errors;
}

/**
 * Import a Squad configuration bundle into a target directory.
 */
export function importSquadConfig(
  bundlePath: string,
  targetDir: string,
  options?: ImportOptions,
  storage: StorageProvider = new FSStorageProvider(),
): ImportResult {
  const opts: Required<ImportOptions> = {
    merge: options?.merge ?? true,
    dryRun: options?.dryRun ?? false,
    skipValidation: options?.skipValidation ?? false,
  };

  const warnings: string[] = [];
  const changes: ImportChange[] = [];

  // Read and parse bundle
  if (!storage.existsSync(bundlePath)) {
    return { success: false, changes: [], warnings: [`Bundle file not found: ${bundlePath}`] };
  }

  let bundle: ExportBundle;
  try {
    const content = storage.readSync(bundlePath);
    if (content === undefined) {
      return { success: false, changes: [], warnings: [`Bundle file not found: ${bundlePath}`] };
    }
    bundle = deserializeBundle(content);
  } catch (err) {
    return { success: false, changes: [], warnings: [`Failed to parse bundle: ${(err as Error).message}`] };
  }

  // Validate
  if (!opts.skipValidation) {
    const validationErrors = validateBundle(bundle);
    if (validationErrors.length > 0) {
      return {
        success: false,
        changes: [],
        warnings: validationErrors.map(e => `${e.field}: ${e.message}`),
      };
    }
  }

  // Import agents
  const agentsDir = join(targetDir, '.github', 'agents');
  for (const agent of bundle.agents) {
    const agentPath = join(agentsDir, `${agent.name}.agent.md`);
    const relativePath = `.github/agents/${agent.name}.agent.md`;

    if (storage.existsSync(agentPath) && !opts.merge) {
      changes.push({ type: 'skipped', path: relativePath, reason: 'File exists and merge is disabled' });
      continue;
    }

    if (storage.existsSync(agentPath) && opts.merge) {
      if (!opts.dryRun) {
        storage.writeSync(agentPath, agent.content);
      }
      changes.push({ type: 'modified', path: relativePath });
    } else {
      if (!opts.dryRun) {
        storage.writeSync(agentPath, agent.content);
      }
      changes.push({ type: 'added', path: relativePath });
    }
  }

  // Import routing rules
  if (bundle.routingRules.length > 0) {
    const routingPath = join(targetDir, '.ai-team', 'routing.md');
    const relativePath = '.ai-team/routing.md';
    const routingContent = formatRoutingRules(bundle.routingRules);

    if (storage.existsSync(routingPath) && !opts.merge) {
      changes.push({ type: 'skipped', path: relativePath, reason: 'File exists and merge is disabled' });
    } else {
      if (!opts.dryRun) {
        storage.writeSync(routingPath, routingContent);
      }
      changes.push({ type: storage.existsSync(routingPath) ? 'modified' : 'added', path: relativePath });
    }
  }

  return { success: true, changes, warnings };
}

function formatRoutingRules(rules: ExportRoutingRule[]): string {
  const lines = ['# Routing Rules', ''];
  for (const rule of rules) {
    lines.push(`- \`${rule.pattern}\` → ${rule.agent}`);
  }
  lines.push('');
  return lines.join('\n');
}
