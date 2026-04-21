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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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
