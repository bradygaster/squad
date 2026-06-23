/**
 * External capability loader — scans .squad/capabilities/ for user-defined
 * WatchCapability modules and registers them alongside built-in capabilities.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CapabilityRegistry } from './registry.js';
import type { WatchCapability } from './types.js';
import { GREEN, YELLOW, RED, BOLD, DIM, RESET } from '../../core/output.js';

/** Required fields on a valid WatchCapability. */
const REQUIRED_FIELDS: ReadonlyArray<keyof WatchCapability> = [
  'name',
  'description',
  'configShape',
  'requires',
  'phase',
  'preflight',
  'execute',
];

/**
 * Load external WatchCapability modules from `{teamRoot}/.squad/capabilities/`.
 *
 * - Skips silently when the directory does not exist.
 * - Logs a warning and continues when a file fails to load.
 * - Returns the count of successfully loaded capabilities.
 */
export async function loadExternalCapabilities(
  teamRoot: string,
  registry: CapabilityRegistry,
): Promise<number> {
  const capDir = join(teamRoot, '.squad', 'capabilities');

  if (!existsSync(capDir)) {
    return 0;
  }

  const entries = await readdir(capDir);
  const jsFiles = entries.filter(f => f.endsWith('.js')).sort();

  if (jsFiles.length === 0) {
    return 0;
  }

  // Security: warn user before executing external code
  console.log(
    `\n${YELLOW}${BOLD}⚠️  SECURITY: Loading ${jsFiles.length} external capability file(s) from .squad/capabilities/${RESET}`,
  );
  for (const f of jsFiles) {
    console.log(`${DIM}    • ${f}${RESET}`);
  }
  console.log(
    `${YELLOW}    External capabilities execute with FULL process permissions (file system, network, credentials).${RESET}`,
  );
  console.log(
    `${YELLOW}    Review these files if you did not author them.${RESET}\n`,
  );

  let loaded = 0;

  for (const filename of jsFiles) {
    const filePath = join(capDir, filename);
    try {
      const mod = await import(pathToFileURL(filePath).href);
      let cap: WatchCapability = mod.default ?? mod;

      // Support class-based capabilities with a no-arg constructor
      if (typeof cap === 'function') {
        cap = new (cap as new () => WatchCapability)();
      }

      // Validate required fields
      const missing = REQUIRED_FIELDS.filter(f => !(f in cap));
      if (missing.length > 0) {
        console.log(
          `${YELLOW}⚠️ Failed to load capability from ${filename}: missing fields: ${missing.join(', ')}${RESET}`,
        );
        continue;
      }

      // Validate field types
      if (typeof cap.preflight !== 'function' || typeof cap.execute !== 'function') {
        console.log(
          `${YELLOW}⚠️ Failed to load capability from ${filename}: preflight and execute must be functions${RESET}`,
        );
        continue;
      }
      const validPhases = ['pre-scan', 'post-triage', 'post-execute', 'housekeeping'];
      if (!validPhases.includes(cap.phase)) {
        console.log(
          `${YELLOW}⚠️ Failed to load capability from ${filename}: invalid phase '${cap.phase}' (must be one of: ${validPhases.join(', ')})${RESET}`,
        );
        continue;
      }

      // Security: block hijacking of built-in capabilities
      if (registry.get(cap.name)) {
        console.log(
          `${YELLOW}⚠️ External capability "${cap.name}" conflicts with built-in — skipped (potential hijack)${RESET}`,
        );
        continue;
      }

      registry.register(cap);
      console.log(
        `${GREEN}✅ Loaded external capability: ${cap.name} (phase: ${cap.phase})${RESET}`,
      );
      loaded++;
    } catch (err) {
      console.log(
        `${YELLOW}⚠️ Failed to load capability from ${filename}: ${err instanceof Error ? err.message : String(err)}${RESET}`,
      );
    }
  }

  return loaded;
}
