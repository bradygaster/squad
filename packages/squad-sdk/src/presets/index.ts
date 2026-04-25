/**
 * Preset loading and application logic.
 *
 * Presets are curated agent collections stored in `<squad-home>/presets/<name>/`.
 * Each preset directory contains:
 * - `preset.json` — manifest with metadata and agent list
 * - `agents/<name>/charter.md` — agent charter files
 *
 * @module presets
 */

import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import { resolvePresetsDir, ensureSquadHome } from '../resolution.js';
import type { PresetManifest, PresetApplyResult } from './types.js';

export type { PresetManifest, PresetAgent, PresetApplyResult } from './types.js';

const storage = new FSStorageProvider();

function isDirSync(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}


/**
 * List all available presets from the squad home presets directory.
 *
 * @returns Array of preset manifests, or empty array if no presets found.
 */
export function listPresets(): PresetManifest[] {
  const presetsDir = resolvePresetsDir();
  if (!presetsDir) return [];

  const entries = readdirSync(presetsDir, { encoding: 'utf-8' });
  const presets: PresetManifest[] = [];

  for (const entry of entries) {
    const presetDir = path.join(presetsDir, entry);
    if (!isDirSync(presetDir)) continue;

    const manifest = loadPresetManifest(presetDir);
    if (manifest) presets.push(manifest);
  }

  return presets;
}

/**
 * Load a specific preset by name.
 *
 * @param name - Preset name (directory name under presets/).
 * @returns The preset manifest, or null if not found.
 */
export function loadPreset(name: string): PresetManifest | null {
  const presetsDir = resolvePresetsDir();
  if (!presetsDir) return null;

  const presetDir = path.join(presetsDir, name);
  if (!storage.existsSync(presetDir) || !isDirSync(presetDir)) {
    return null;
  }

  return loadPresetManifest(presetDir);
}

/**
 * Apply a preset — copy its agents into a target squad directory.
 *
 * By default, existing agents are skipped (not overwritten).
 * Pass `force: true` to overwrite existing agents.
 *
 * @param presetName - Name of the preset to apply.
 * @param targetDir  - Target directory to install agents into (e.g. `.squad/agents/`).
 * @param options    - Options for applying the preset.
 * @returns Array of results for each agent in the preset.
 */
export function applyPreset(
  presetName: string,
  targetDir: string,
  options: { force?: boolean } = {},
): PresetApplyResult[] {
  const presetsDir = resolvePresetsDir();
  if (!presetsDir) {
    return [{ agent: presetName, status: 'error', reason: 'No presets directory found. Run `squad preset init --remote` to set up, or `squad preset init` for local-only.' }];
  }

  const presetDir = path.join(presetsDir, presetName);
  const manifest = loadPresetManifest(presetDir);
  if (!manifest) {
    return [{ agent: presetName, status: 'error', reason: `Preset '${presetName}' not found` }];
  }

  const presetAgentsDir = path.join(presetDir, 'agents');
  const results: PresetApplyResult[] = [];

  for (const agent of manifest.agents) {
    const sourceDir = path.join(presetAgentsDir, agent.name);
    const destDir = path.join(targetDir, agent.name);

    if (!storage.existsSync(sourceDir)) {
      results.push({ agent: agent.name, status: 'error', reason: 'Source agent directory missing in preset' });
      continue;
    }

    if (storage.existsSync(destDir) && !options.force) {
      results.push({ agent: agent.name, status: 'skipped', reason: 'Already exists (use --force to overwrite)' });
      continue;
    }

    try {
      copyDirRecursive(sourceDir, destDir);
      results.push({ agent: agent.name, status: 'installed' });
    } catch (err) {
      results.push({ agent: agent.name, status: 'error', reason: String(err) });
    }
  }

  return results;
}

/**
 * Install a preset into squad home from an external source directory.
 * Copies the preset directory into `<squad-home>/presets/<name>/`.
 *
 * @param sourceDir - Source directory containing preset.json and agents/.
 * @param name      - Preset name (used as destination directory name).
 * @returns Path to the installed preset.
 */
export function installPreset(sourceDir: string, name: string): string {
  const homeDir = ensureSquadHome();
  const destDir = path.join(homeDir, 'presets', name);

  copyDirRecursive(sourceDir, destDir);
  return destDir;
}

/**
 * Save the current project's squad agents as a reusable preset.
 *
 * Reads agents from the given squad directory (e.g. `.squad/agents/`),
 * generates a `preset.json` manifest, and copies everything into
 * `<squad-home>/presets/<name>/`.
 *
 * @param name      - Name for the new preset.
 * @param squadDir  - Path to the project's .squad/ directory containing agents/.
 * @param options   - force: overwrite existing preset; description: preset description.
 * @returns Path to the saved preset directory.
 */
export function savePreset(
  name: string,
  squadDir: string,
  options: { force?: boolean; description?: string } = {},
): string {
  const agentsDir = path.join(squadDir, 'agents');
  if (!storage.existsSync(agentsDir) || !isDirSync(agentsDir)) {
    throw new Error(`No agents/ directory found in ${squadDir}`);
  }

  const homeDir = ensureSquadHome();
  const destDir = path.join(homeDir, 'presets', name);

  if (storage.existsSync(destDir) && !options.force) {
    throw new Error(`Preset '${name}' already exists. Use --force to overwrite.`);
  }

  // Discover agents
  const agentEntries = readdirSync(agentsDir, { encoding: 'utf-8' });
  const agents: { name: string; role: string; description: string }[] = [];

  for (const entry of agentEntries) {
    const agentDir = path.join(agentsDir, entry);
    if (!isDirSync(agentDir)) continue;

    // Try to extract role from charter.md front matter
    let role = entry;
    let description = '';
    const charterPath = path.join(agentDir, 'charter.md');
    if (storage.existsSync(charterPath)) {
      const content = storage.readSync(charterPath);
      if (content) {
        const roleMatch = content.match(/^##?\s+.*?[-–—]\s*(.+)/m);
        if (roleMatch) role = roleMatch[1]!.trim();
        // First non-empty, non-heading line as description
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
            description = trimmed.slice(0, 120);
            break;
          }
        }
      }
    }

    agents.push({ name: entry, role, description });
  }

  if (agents.length === 0) {
    throw new Error(`No agents found in ${agentsDir}`);
  }

  // Build manifest
  const manifest: PresetManifest = {
    name,
    version: '1.0.0',
    description: options.description ?? `Custom preset '${name}'`,
    agents: agents.map(a => ({ name: a.name, role: a.role, description: a.description })),
  };

  // Write preset directory
  storage.mkdirSync(destDir, { recursive: true });
  storage.writeSync(path.join(destDir, 'preset.json'), JSON.stringify(manifest, null, 2));
  copyDirRecursive(agentsDir, path.join(destDir, 'agents'));

  return destDir;
}

// ============================================================================
// Internal helpers
// ============================================================================

function loadPresetManifest(presetDir: string): PresetManifest | null {
  const manifestPath = path.join(presetDir, 'preset.json');
  if (!storage.existsSync(manifestPath)) return null;

  try {
    const content = storage.readSync(manifestPath);
    if (!content) return null;
    const manifest = JSON.parse(content) as PresetManifest;
    if (!manifest.name || !manifest.agents || !Array.isArray(manifest.agents)) {
      return null;
    }
    return manifest;
  } catch {
    return null;
  }
}

function copyDirRecursive(src: string, dest: string): void {
  storage.mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { encoding: 'utf-8' });

  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);

    if (isDirSync(srcPath)) {
      copyDirRecursive(srcPath, destPath);
    } else {
      const content = storage.readSync(srcPath);
      if (content !== undefined) {
        storage.writeSync(destPath, content);
      }
    }
  }
}

/**
 * Get the path to the built-in presets that ship with the SDK.
 * These are bundled in the package under `presets/builtin/`.
 */
export function getBuiltinPresetsDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return path.join(path.dirname(thisFile), 'builtin');
}

/**
 * Seed squad home with built-in presets if they don't already exist.
 * Only copies presets that are missing — never overwrites user presets.
 *
 * @returns Names of presets that were seeded.
 */
export function seedBuiltinPresets(): string[] {
  const homeDir = ensureSquadHome();
  const builtinDir = getBuiltinPresetsDir();
  const targetPresetsDir = path.join(homeDir, 'presets');
  const seeded: string[] = [];

  if (!storage.existsSync(builtinDir)) return seeded;

  const entries = readdirSync(builtinDir, { encoding: 'utf-8' });
  for (const entry of entries) {
    const srcDir = path.join(builtinDir, entry);
    const destDir = path.join(targetPresetsDir, entry);

    if (!isDirSync(srcDir)) continue;
    if (storage.existsSync(destDir)) continue;

    copyDirRecursive(srcDir, destDir);
    seeded.push(entry);
  }

  return seeded;
}
