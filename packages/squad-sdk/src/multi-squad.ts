/**
 * Multi-squad resolution, configuration, and migration.
 *
 * Supports multiple personal squads via a global config directory:
 *   - Windows: %APPDATA%/squad/
 *   - macOS:   ~/Library/Application Support/squad/
 *   - Linux:   $XDG_CONFIG_HOME/squad/ (default ~/.config/squad/)
 *
 * Each squad is registered in squads.json and has its own directory
 * under squads/{name}/ in the global config root.
 *
 * Resolution chain for resolveSquadPath():
 *   explicit name → SQUAD_NAME env var → active in squads.json → "default" → legacy fallback
 *
 * @module multi-squad
 */

import path from 'node:path';
import { FSStorageProvider } from './storage/fs-storage-provider.js';
import { resolveGlobalSquadPath } from './resolution.js';

const storage = new FSStorageProvider();

// ============================================================================
// Types
// ============================================================================

/** A single squad entry in squads.json. */
export interface SquadEntry {
  /** Human-readable squad name (kebab-case recommended). */
  name: string;
  /** Absolute path to the squad's .squad/ state directory. */
  path: string;
  /** ISO-8601 timestamp when this squad was created. */
  created_at: string;
}

/** Schema for the global squads.json config file. */
export interface MultiSquadConfig {
  /** All registered squads. */
  squads: SquadEntry[];
  /** Name of the currently active squad. */
  active: string;
}

/** Information returned by listSquads(). */
export interface SquadInfo {
  name: string;
  path: string;
  active: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SQUADS_JSON = 'squads.json';
const SQUADS_DIR = 'squads';
const DEFAULT_SQUAD = 'default';
const LEGACY_DIR = '.squad';

// ============================================================================
// Internal helpers
// ============================================================================

/** Path to squads.json inside the global config root. */
function squadsJsonPath(): string {
  return path.join(resolveGlobalSquadPath(), SQUADS_JSON);
}

/** Read and parse squads.json, returning null if missing or malformed. */
function loadSquadsConfig(): MultiSquadConfig | null {
  const configPath = squadsJsonPath();
  if (!storage.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'squads' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).squads) &&
      'active' in parsed &&
      typeof (parsed as Record<string, unknown>).active === 'string'
    ) {
      return parsed as MultiSquadConfig;
    }
    return null;
  } catch {
    return null;
  }
}

/** Write squads.json atomically. */
function saveSquadsConfig(config: MultiSquadConfig): void {
  const configPath = squadsJsonPath();
  storage.writeSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/** Validate a squad name: non-empty, no slashes, no dots-only. */
function validateName(name: string): void {
  if (!name || /[/\\]/.test(name) || /^\.+$/.test(name)) {
    throw new Error(`Invalid squad name: "${name}". Names must be non-empty and cannot contain slashes.`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns the platform-appropriate global config directory for squads.
 * Delegates to resolveGlobalSquadPath() which handles Windows/macOS/Linux.
 */
export function getSquadRoot(): string {
  return resolveGlobalSquadPath();
}

/**
 * Resolve the filesystem path for a named squad's state directory.
 *
 * Resolution chain:
 *  1. Explicit `name` parameter
 *  2. SQUAD_NAME environment variable
 *  3. `active` field in squads.json
 *  4. "default"
 *  5. Legacy ~/.squad fallback (if no squads.json exists)
 *
 * Triggers auto-migration on first call if a legacy layout is detected.
 */
export function resolveSquadPath(name?: string): string {
  // Auto-migrate legacy layout if needed
  migrateIfNeeded();

  const resolved =
    name ??
    process.env['SQUAD_NAME'] ??
    loadSquadsConfig()?.active ??
    DEFAULT_SQUAD;

  const config = loadSquadsConfig();

  // Look up registered path
  if (config) {
    const entry = config.squads.find((s) => s.name === resolved);
    if (entry) {
      return entry.path;
    }
  }

  // Fallback: derive path inside global config dir
  const root = getSquadRoot();
  return path.join(root, SQUADS_DIR, resolved);
}

/**
 * List all registered squads with their active status.
 */
export function listSquads(): SquadInfo[] {
  const config = loadSquadsConfig();
  if (!config) {
    return [];
  }
  return config.squads.map((s) => ({
    name: s.name,
    path: s.path,
    active: s.name === config.active,
  }));
}

/**
 * Create a new squad directory and register it in squads.json.
 * Returns the absolute path to the new squad's state directory.
 *
 * @throws If a squad with the given name already exists.
 */
export function createSquad(name: string): string {
  validateName(name);

  // Ensure squads.json exists (migrate or bootstrap)
  migrateIfNeeded();
  let config = loadSquadsConfig();
  if (!config) {
    config = { squads: [], active: DEFAULT_SQUAD };
  }

  if (config.squads.some((s) => s.name === name)) {
    throw new Error(`Squad "${name}" already exists.`);
  }

  const squadDir = path.join(getSquadRoot(), SQUADS_DIR, name);
  storage.mkdirSync(squadDir, { recursive: true });

  config.squads.push({
    name,
    path: squadDir,
    created_at: new Date().toISOString(),
  });
  saveSquadsConfig(config);

  return squadDir;
}

/**
 * Delete a squad by name. Removes its directory and unregisters it.
 *
 * @throws If the squad is the currently active one, or if it doesn't exist.
 */
export function deleteSquad(name: string): void {
  validateName(name);

  const config = loadSquadsConfig();
  if (!config) {
    throw new Error(`Squad "${name}" not found.`);
  }

  if (config.active === name) {
    throw new Error(`Cannot delete the active squad "${name}". Switch to another squad first.`);
  }

  const idx = config.squads.findIndex((s) => s.name === name);
  if (idx === -1) {
    throw new Error(`Squad "${name}" not found.`);
  }

  const entry = config.squads[idx];
  if (entry && storage.existsSync(entry.path)) {
    storage.deleteDirSync(entry.path);
  }

  config.squads.splice(idx, 1);
  saveSquadsConfig(config);
}

/**
 * Set the active squad in squads.json.
 *
 * @throws If the named squad is not registered.
 */
export function switchSquad(name: string): void {
  validateName(name);

  const config = loadSquadsConfig();
  if (!config) {
    throw new Error(`No squads configured. Cannot switch to "${name}".`);
  }

  if (!config.squads.some((s) => s.name === name)) {
    throw new Error(`Squad "${name}" not found. Register it first with createSquad().`);
  }

  config.active = name;
  saveSquadsConfig(config);
}

/**
 * Detect legacy ~/.squad layout and register it as "default" in squads.json.
 *
 * Migration is **non-destructive**: files are NOT moved. The existing path
 * is simply registered in squads.json so the new resolution chain finds it.
 *
 * @returns `true` if migration was performed, `false` if not needed.
 */
export function migrateIfNeeded(): boolean {
  const root = getSquadRoot();
  const configPath = path.join(root, SQUADS_JSON);

  // If squads.json already exists, no migration needed
  if (storage.existsSync(configPath)) {
    return false;
  }

  // Check for legacy ~/.squad directory
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  const legacyDir = path.join(home, LEGACY_DIR);

  if (!home || !storage.existsSync(legacyDir) || !storage.isDirectorySync(legacyDir)) {
    // No legacy layout — bootstrap empty config
    const config: MultiSquadConfig = {
      squads: [],
      active: DEFAULT_SQUAD,
    };
    saveSquadsConfig(config);
    return false;
  }

  // Legacy layout detected — register it as "default" without moving files
  const config: MultiSquadConfig = {
    squads: [
      {
        name: DEFAULT_SQUAD,
        path: legacyDir,
        created_at: new Date().toISOString(),
      },
    ],
    active: DEFAULT_SQUAD,
  };
  saveSquadsConfig(config);
  return true;
}
