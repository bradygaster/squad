/**
 * Identity Module — Credential storage
 *
 * Reads and writes identity configuration and app registrations
 * from the `.squad/identity/` directory tree:
 *
 *   .squad/identity/
 *     config.json          — top-level identity config
 *     apps/{key}.json      — per-app registration
 *     keys/{key}.pem       — private keys (checked for existence only)
 *
 * All functions are synchronous — identity is read during startup
 * before any async work begins. Uses node:fs and node:path only.
 *
 * @module identity/storage
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IdentityConfig, AppRegistration } from './types.js';

/**
 * Load the top-level identity config from `.squad/identity/config.json`.
 *
 * @param projectRoot - Project root directory (parent of `.squad/`)
 * @returns The parsed config, or null if the file doesn't exist
 */
export function loadIdentityConfig(projectRoot: string): IdentityConfig | null {
  const configPath = join(projectRoot, '.squad', 'identity', 'config.json');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as IdentityConfig;
  } catch {
    return null;
  }
}

/**
 * Save the top-level identity config to `.squad/identity/config.json`.
 *
 * @param projectRoot - Project root directory (parent of `.squad/`)
 */
export function saveIdentityConfig(projectRoot: string, config: IdentityConfig): void {
  const dir = join(projectRoot, '.squad', 'identity');
  mkdirSync(dir, { recursive: true });
  const configPath = join(dir, 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Load an app registration from `.squad/identity/apps/{key}.json`.
 *
 * @param projectRoot - Project root directory (parent of `.squad/`)
 * @param key - Registration key (role slug or 'shared')
 * @returns The parsed registration, or null if the file doesn't exist
 */
export function loadAppRegistration(projectRoot: string, key: string): AppRegistration | null {
  const regPath = join(projectRoot, '.squad', 'identity', 'apps', `${key}.json`);
  try {
    const raw = readFileSync(regPath, 'utf-8');
    return JSON.parse(raw) as AppRegistration;
  } catch {
    return null;
  }
}

/**
 * Save an app registration to `.squad/identity/apps/{key}.json`.
 *
 * @param projectRoot - Project root directory (parent of `.squad/`)
 */
export function saveAppRegistration(projectRoot: string, key: string, reg: AppRegistration): void {
  const dir = join(projectRoot, '.squad', 'identity', 'apps');
  mkdirSync(dir, { recursive: true });
  const regPath = join(dir, `${key}.json`);
  writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n', 'utf-8');
}

/**
 * Check whether a private key file exists at `.squad/identity/keys/{key}.pem`.
 *
 * @param projectRoot - Project root directory (parent of `.squad/`)
 */
export function hasPrivateKey(projectRoot: string, key: string): boolean {
  const keyPath = join(projectRoot, '.squad', 'identity', 'keys', `${key}.pem`);
  return existsSync(keyPath);
}

/**
 * Return the age of a private key file in whole days (UTC floor of mtime diff).
 *
 * H-14: Surfaced in `squad identity status` (inline per role) and in
 * `squad identity doctor` (warn at 60d, fail at 90d). Used to nudge operators
 * toward rotating long-lived keys.
 *
 * Silently returns `null` when:
 *   - The PEM file does not exist
 *   - `statSync` throws (e.g. unreadable mounted volume — don't warn or fail
 *     for inaccessible mounts; treat missing mtime as "unknown")
 *
 * @param projectRoot - Project root directory (parent of `.squad/`)
 * @param key - Registration key (role slug or 'shared')
 * @returns Integer age in days, or null if stat is unavailable
 */
export function getKeyAgeDays(projectRoot: string, key: string): number | null {
  const keyPath = join(projectRoot, '.squad', 'identity', 'keys', `${key}.pem`);
  if (!existsSync(keyPath)) return null;
  try {
    const stat = statSync(keyPath);
    const ageMs = Date.now() - stat.mtime.getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0) return 0;
    return Math.floor(ageMs / (24 * 60 * 60 * 1000));
  } catch {
    // Silently skip — mounted/locked volumes, permission errors, etc.
    return null;
  }
}
