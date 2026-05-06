import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { StorageProvider } from '../storage/index.js';
import { derivePluginRoles, type PluginComponentKind, type PluginFileDeployment, type SquadPluginManifest } from './plugin-manifest.js';

export const PLUGIN_STATE_DIR = 'plugins';
export const INSTALLED_PLUGINS_FILE = join(PLUGIN_STATE_DIR, 'installed.json');
export const PLUGIN_LOCK_FILE = join(PLUGIN_STATE_DIR, 'lock.json');
export const PLUGIN_RUNTIME_FILE = join(PLUGIN_STATE_DIR, 'runtime.json');
export const PLUGIN_AUDIT_FILE = join(PLUGIN_STATE_DIR, 'audit.jsonl');

export interface InstalledPluginFile extends PluginFileDeployment {
  sha256: string;
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  source: string;
  installed_at: string;
  roles: PluginComponentKind[];
  files: InstalledPluginFile[];
}

export interface InstalledPluginsState {
  plugins: InstalledPlugin[];
}

export interface PluginLockEntry {
  id: string;
  version: string;
  source: string;
  manifest_sha256: string;
  files: InstalledPluginFile[];
  installed_at: string;
}

export interface PluginLockState {
  plugins: Record<string, PluginLockEntry>;
}

export interface PluginRuntimeEntry {
  enabled: boolean;
  active_version: string;
  updated_at: string;
}

export interface PluginRuntimeState {
  plugins: Record<string, PluginRuntimeEntry>;
  active: Partial<Record<PluginComponentKind, string>>;
}

export type PluginAuditEventType =
  | 'install'
  | 'enable'
  | 'disable'
  | 'switch'
  | 'uninstall'
  | 'verify';

export interface PluginAuditEvent {
  type: PluginAuditEventType;
  plugin_id: string;
  version: string;
  timestamp: string;
  message: string;
}

export interface PluginAuditState {
  events: PluginAuditEvent[];
}

export interface PluginStates {
  installed: InstalledPluginsState;
  lock: PluginLockState;
  runtime: PluginRuntimeState;
  audit: PluginAuditState;
}

export async function readPluginStates(storage: StorageProvider, stateRoot = ''): Promise<PluginStates> {
  const [installed, lock, runtime, audit] = await Promise.all([
    readJsonState<InstalledPluginsState>(storage, join(stateRoot, INSTALLED_PLUGINS_FILE), { plugins: [] }),
    readJsonState<PluginLockState>(storage, join(stateRoot, PLUGIN_LOCK_FILE), { plugins: {} }),
    readJsonState<PluginRuntimeState>(storage, join(stateRoot, PLUGIN_RUNTIME_FILE), { plugins: {}, active: {} }),
    readAuditState(storage, join(stateRoot, PLUGIN_AUDIT_FILE)),
  ]);
  runtime.active ??= {};

  return { installed, lock, runtime, audit };
}

export async function writePluginStates(storage: StorageProvider, states: PluginStates, stateRoot = ''): Promise<void> {
  await storage.mkdir(join(stateRoot, PLUGIN_STATE_DIR), { recursive: true });
  await Promise.all([
    writeJsonState(storage, join(stateRoot, INSTALLED_PLUGINS_FILE), states.installed),
    writeJsonState(storage, join(stateRoot, PLUGIN_LOCK_FILE), states.lock),
    writeJsonState(storage, join(stateRoot, PLUGIN_RUNTIME_FILE), states.runtime),
    writeAuditState(storage, join(stateRoot, PLUGIN_AUDIT_FILE), states.audit),
  ]);
}

export function upsertInstalledPlugin(
  states: PluginStates,
  manifest: SquadPluginManifest,
  options: {
    source: string;
    manifestContent: string;
    files: InstalledPluginFile[];
    now?: string;
  },
): InstalledPlugin {
  const now = options.now ?? new Date().toISOString();
  const existing = states.installed.plugins.find((plugin) => plugin.id === manifest.id);
  const enabled = existing?.enabled ?? false;
  const installed: InstalledPlugin = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    enabled,
    source: options.source,
    installed_at: now,
    roles: derivePluginRoles(manifest),
    files: options.files,
  };

  states.installed.plugins = [
    ...states.installed.plugins.filter((plugin) => plugin.id !== manifest.id),
    installed,
  ].sort((a, b) => a.id.localeCompare(b.id));

  states.lock.plugins[manifest.id] = {
    id: manifest.id,
    version: manifest.version,
    source: options.source,
    manifest_sha256: sha256(options.manifestContent),
    files: options.files,
    installed_at: now,
  };

  states.runtime.plugins[manifest.id] = {
    enabled,
    active_version: manifest.version,
    updated_at: now,
  };

  appendAuditEvent(states.audit, {
    type: 'install',
    plugin_id: manifest.id,
    version: manifest.version,
    timestamp: now,
    message: `Installed ${manifest.id}@${manifest.version}`,
  });

  return installed;
}

export function setPluginEnabled(
  states: PluginStates,
  pluginId: string,
  enabled: boolean,
  now = new Date().toISOString(),
): InstalledPlugin {
  const plugin = states.installed.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    throw new Error(`Plugin "${pluginId}" is not installed`);
  }

  plugin.enabled = enabled;
  states.runtime.plugins[plugin.id] = {
    enabled,
    active_version: plugin.version,
    updated_at: now,
  };
  if (!enabled) {
    for (const [role, activePluginId] of Object.entries(states.runtime.active)) {
      if (activePluginId === plugin.id) {
        delete states.runtime.active[role as PluginComponentKind];
      }
    }
  } else {
    for (const role of plugin.roles) {
      const activePluginId = states.runtime.active[role];
      if (activePluginId && activePluginId !== plugin.id) {
        throw new Error(`Role "${role}" is already active for plugin "${activePluginId}"`);
      }
      states.runtime.active[role] = plugin.id;
    }
  }
  appendAuditEvent(states.audit, {
    type: enabled ? 'enable' : 'disable',
    plugin_id: plugin.id,
    version: plugin.version,
    timestamp: now,
    message: `${enabled ? 'Enabled' : 'Disabled'} ${plugin.id}@${plugin.version}`,
  });
  return plugin;
}

export function switchActivePlugin(
  states: PluginStates,
  role: PluginComponentKind,
  pluginId: string,
  now = new Date().toISOString(),
): InstalledPlugin {
  const plugin = states.installed.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    throw new Error(`Plugin "${pluginId}" is not installed`);
  }
  if (!plugin.roles.includes(role)) {
    throw new Error(`Plugin "${pluginId}" does not declare role "${role}"`);
  }
  plugin.enabled = true;
  states.runtime.active[role] = plugin.id;
  states.runtime.plugins[plugin.id] = {
    enabled: true,
    active_version: plugin.version,
    updated_at: now,
  };
  appendAuditEvent(states.audit, {
    type: 'switch',
    plugin_id: plugin.id,
    version: plugin.version,
    timestamp: now,
    message: `Switched ${role} to ${plugin.id}@${plugin.version}`,
  });
  return plugin;
}

export function removeInstalledPlugin(states: PluginStates, pluginId: string, now = new Date().toISOString()): InstalledPlugin {
  const plugin = states.installed.plugins.find((candidate) => candidate.id === pluginId);
  if (!plugin) {
    throw new Error(`Plugin "${pluginId}" is not installed`);
  }
  states.installed.plugins = states.installed.plugins.filter((candidate) => candidate.id !== pluginId);
  delete states.lock.plugins[pluginId];
  delete states.runtime.plugins[pluginId];
  for (const [role, activePluginId] of Object.entries(states.runtime.active)) {
    if (activePluginId === pluginId) {
      delete states.runtime.active[role as PluginComponentKind];
    }
  }
  appendAuditEvent(states.audit, {
    type: 'uninstall',
    plugin_id: plugin.id,
    version: plugin.version,
    timestamp: now,
    message: `Uninstalled ${plugin.id}@${plugin.version}`,
  });
  return plugin;
}

export function appendAuditEvent(audit: PluginAuditState, event: PluginAuditEvent): void {
  audit.events = [...audit.events, event];
}

export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

async function readJsonState<T>(storage: StorageProvider, filePath: string, fallback: T): Promise<T> {
  const content = await storage.read(filePath);
  if (content === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(content) as T;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse ${filePath}: ${message}`);
  }
}

async function writeJsonState(storage: StorageProvider, filePath: string, data: unknown): Promise<void> {
  await storage.write(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function readAuditState(storage: StorageProvider, filePath: string): Promise<PluginAuditState> {
  const content = await storage.read(filePath);
  if (content === undefined || content.trim() === '') {
    return { events: [] };
  }
  const events = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as PluginAuditEvent);
  return { events };
}

async function writeAuditState(storage: StorageProvider, filePath: string, audit: PluginAuditState): Promise<void> {
  const content = audit.events.map((event) => JSON.stringify(event)).join('\n');
  await storage.write(filePath, content.length > 0 ? `${content}\n` : '');
}
