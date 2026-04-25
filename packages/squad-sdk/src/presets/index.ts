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
    return [{ agent: presetName, status: 'error', reason: 'No presets directory found. Run `squad preset init` first.' }];
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
