/**
 * Squad Registry — v2 schema validator (W1)
 *
 * Exports: parseRegistry, validateRegistry, registerEntry, writeRegistry,
 *          loadRegistryFromDisk, Registry, RegistryEntry.
 *
 * W1 scope: pure parse/validate + register-time warn helper + disk I/O.
 * No resolution logic (W2), no CLI command wiring (W3).
 *
 * Four-layer stale-path policy (Q5, Flight):
 *   read=tolerate | register=warn | resolve=error | doctor=surface
 */

import * as nodePath from 'node:path';
import * as nodeOs from 'node:os';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { SquadError, ErrorSeverity, ErrorCategory } from './adapter/errors.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RegistryEntry {
  callsign?: string;
  path: string;
  origins?: string[];
  clones?: string[];
}

export interface Registry {
  version: number;
  squads: RegistryEntry[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeError(message: string): SquadError {
  return new SquadError(
    message,
    ErrorSeverity.ERROR,
    ErrorCategory.VALIDATION,
    { timestamp: new Date() },
    false,
  );
}

/** Returns true when the string (un-resolved) contains a '..' path segment. */
function containsPathTraversal(s: string): boolean {
  return s.split(/[\\/]/).some((seg) => seg === '..');
}

/** Returns true when the path (trailing separators stripped) ends with '.squad'. */
function endsWithSquadSentinel(p: string): boolean {
  const clean = p.replace(/[/\\]+$/, '');
  return nodePath.basename(clean) === '.squad';
}

/**
 * Normalise a path for cross-entry duplicate detection.
 * Case-insensitive on win32 and darwin; case-sensitive on linux.
 */
function normalisedPathKey(p: string): string {
  const resolved = nodePath.resolve(p);
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return resolved.toLowerCase();
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Per-entry validator (called from validateRegistry and registerEntry)
// ---------------------------------------------------------------------------

function validateEntry(entry: unknown, idx: number): RegistryEntry {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw makeError(`squads[${idx}] must be an object.`);
  }

  const e = entry as Record<string, unknown>;

  // S3: `path` required
  if (!('path' in e) || typeof e['path'] !== 'string') {
    throw makeError(
      `squads[${idx}]: "path" field is required. ` +
        'Each entry must have an absolute path ending in ".squad".',
    );
  }
  const entryPath = e['path'] as string;

  // S5: must be absolute
  if (!nodePath.isAbsolute(entryPath)) {
    throw makeError(
      `squads[${idx}].path must be an absolute path. Relative paths are not allowed. Got: "${entryPath}"`,
    );
  }

  // S4: must end in .squad
  if (!endsWithSquadSentinel(entryPath)) {
    throw makeError(
      `squads[${idx}].path must end with ".squad". Got: "${entryPath}"`,
    );
  }

  // S16: no path-traversal segments in path
  if (containsPathTraversal(entryPath)) {
    throw makeError(
      `squads[${idx}].path contains path-traversal segments (".."). Got: "${entryPath}"`,
    );
  }

  // callsign (optional)
  let callsign: string | undefined;
  if ('callsign' in e) {
    if (typeof e['callsign'] !== 'string') {
      throw makeError(`squads[${idx}].callsign must be a string.`);
    }
    callsign = e['callsign'] as string;

    // S16: no path-traversal segments in callsign
    if (containsPathTraversal(callsign)) {
      throw makeError(
        `squads[${idx}].callsign contains path-traversal segments (".."). Got: "${callsign}"`,
      );
    }
    // S15: slashes in callsign ARE allowed (scoped names like "acme/api")
  }

  // origins (optional — S6: absent and empty array are both valid)
  let origins: string[] | undefined;
  if ('origins' in e) {
    if (!Array.isArray(e['origins'])) {
      throw makeError(`squads[${idx}].origins must be an array.`);
    }
    const rawOrigins = e['origins'] as unknown[];
    for (let i = 0; i < rawOrigins.length; i++) {
      if (typeof rawOrigins[i] !== 'string') {
        throw makeError(`squads[${idx}].origins[${i}] must be a string.`);
      }
    }
    origins = rawOrigins as string[];
  }

  // clones (optional)
  let clones: string[] | undefined;
  if ('clones' in e) {
    if (!Array.isArray(e['clones'])) {
      throw makeError(`squads[${idx}].clones must be an array.`);
    }
    const rawClones = e['clones'] as unknown[];
    clones = rawClones.map((clone, ci) => {
      if (typeof clone !== 'string') {
        throw makeError(`squads[${idx}].clones[${ci}] must be a string.`);
      }
      // S7: clone paths must be absolute
      if (!nodePath.isAbsolute(clone)) {
        throw makeError(
          `squads[${idx}].clones[${ci}] must be an absolute path. Got: "${clone}"`,
        );
      }
      // S16: no path-traversal in clone paths
      if (containsPathTraversal(clone)) {
        throw makeError(
          `squads[${idx}].clones[${ci}] contains path-traversal segments (".."). Got: "${clone}"`,
        );
      }
      return clone;
    });
  }

  // Assemble the typed entry, preserving `origins` key presence distinction (S6)
  const result: RegistryEntry = { path: entryPath };
  if (callsign !== undefined) result.callsign = callsign;
  if ('origins' in e) result.origins = origins ?? [];
  if (clones !== undefined) result.clones = clones;
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an already-parsed object as a Registry.
 * Throws SquadError with a remediation message on any violation.
 * Does NOT touch the filesystem — S14a: stale paths are tolerated silently.
 */
export function validateRegistry(obj: unknown): Registry {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw makeError(
      'registry.json must be a JSON object (not an array or primitive).',
    );
  }

  const raw = obj as Record<string, unknown>;

  // S10: version field required
  if (!('version' in raw)) {
    throw makeError(
      '"version" field is required in registry.json. ' +
        'Add "version": 1 to your registry.json.',
    );
  }

  if (typeof raw['version'] !== 'number') {
    throw makeError('"version" must be a number. Got: ' + typeof raw['version']);
  }

  const version = raw['version'] as number;

  // S11: version 0 — old squad-repos.json format
  if (version === 0) {
    throw makeError(
      'Registry version 0 is not supported. ' +
        'This file appears to be a squad-repos.json from an earlier version of Squad. ' +
        'Run `squad register --callsign <name> --path <path>` to create a v1 registry.json. ' +
        'No auto-migration is performed.',
    );
  }

  // S12: unknown future version
  const SUPPORTED_VERSION = 1;
  if (version !== SUPPORTED_VERSION) {
    throw makeError(
      `Unknown registry version ${version} — not supported by this version of the squad CLI. ` +
        'Run `npm update @bradygaster/squad-cli` (or your package manager equivalent) to upgrade.',
    );
  }

  // S13: squads must be present and an array
  if (!('squads' in raw)) {
    throw makeError(
      'registry.json is missing required field "squads". ' +
        'Add "squads": [] to your registry.json.',
    );
  }
  if (!Array.isArray(raw['squads'])) {
    throw makeError(
      '"squads" must be an array. Got: ' + typeof raw['squads'],
    );
  }

  const squads: RegistryEntry[] = (raw['squads'] as unknown[]).map(
    (entry, i) => validateEntry(entry, i),
  );

  // S8: duplicate callsigns across registry
  const seenCallsigns = new Map<string, number>();
  for (let i = 0; i < squads.length; i++) {
    const entry = squads[i];
    if (entry === undefined) continue;
    if (entry.callsign === undefined) continue;
    const cs = entry.callsign;
    if (seenCallsigns.has(cs)) {
      const prev = seenCallsigns.get(cs) ?? -1;
      throw makeError(
        `Registry contains duplicate callsign "${cs}" at squads[${prev}] and squads[${i}]. ` +
          'Callsigns must be unique within the registry.',
      );
    }
    seenCallsigns.set(cs, i);
  }

  // S9: duplicate paths (case-insensitive on win32 + darwin)
  const seenPaths = new Map<string, number>();
  for (let i = 0; i < squads.length; i++) {
    const entry = squads[i];
    if (entry === undefined) continue;
    const key = normalisedPathKey(entry.path);
    if (seenPaths.has(key)) {
      const prev = seenPaths.get(key) ?? -1;
      throw makeError(
        `Registry contains duplicate path "${entry.path}" at squads[${prev}] and squads[${i}]. ` +
          'Each squad must have a unique path.',
      );
    }
    seenPaths.set(key, i);
  }

  return { version, squads };
}

/**
 * Parse registry.json text and validate the schema.
 *
 * S14a: Tolerates stale paths — does NOT check whether paths exist on disk.
 * S18: Throws on empty input.
 * S19: Throws on malformed JSON.
 */
export function parseRegistry(jsonText: string): Registry {
  // S18: empty file
  if (!jsonText || !jsonText.trim()) {
    throw makeError(
      'registry.json is empty. This is not a valid registry. ' +
        'Run `squad register --callsign <name> --path <path>` to create a registry.',
    );
  }

  // S19: malformed JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw makeError(
      'registry.json is malformed JSON. ' +
        'Fix the syntax error or delete the file and run `squad register` to recreate it.',
    );
  }

  // S14a: validateRegistry does NOT check disk existence — read-time tolerates stale paths
  return validateRegistry(parsed);
}

/**
 * Register-time entry validator (S14b).
 *
 * Validates the entry structure (throws SquadError on invalid).
 * Emits a warning via `opts.onWarn` (or `console.warn`) if the path does not
 * exist on disk — but does NOT throw. Register-time policy: warn, not block.
 *
 * Returns the validated entry.
 */
export function registerEntry(
  entry: RegistryEntry,
  opts?: { onWarn?: (msg: string) => void },
): RegistryEntry {
  // Validate structure (may throw)
  const validated = validateEntry(entry, 0);

  // S14b: warn when path missing at register time
  if (!existsSync(validated.path)) {
    const msg =
      `[squad] register: path does not exist on disk: "${validated.path}". ` +
      'Registration succeeded. Run `squad doctor` if the path should already exist.';
    const warn = opts?.onWarn ?? ((m: string) => console.warn(m));
    warn(msg);
  }

  return validated;
}

/**
 * Write a validated registry to disk.
 * S20: Throws a helpful SquadError when the file is read-only or not writable.
 */
export function writeRegistry(filePath: string, registry: Registry): void {
  // Validate before writing (guard against calling with an invalid object)
  validateRegistry(registry);

  try {
    writeFileSync(filePath, JSON.stringify(registry, null, 2) + '\n', {
      encoding: 'utf8',
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EROFS' || code === 'EPERM') {
      throw makeError(
        `registry.json at "${filePath}" is read-only or not writable. ` +
          'Check file permissions. On Unix: `chmod 644 ~/.squad/registry.json`.',
      );
    }
    throw err;
  }
}

/**
 * Load registry from disk, handling v0/v1 coexistence (SC1, SC2).
 *
 * SC1: registry.json wins when both registry.json and squad-repos.json are present.
 * SC2: only squad-repos.json present → emit warning, return null (no auto-migration).
 *
 * Returns { registry: Registry | null, warnings: string[] }.
 */
export function loadRegistryFromDisk(opts?: {
  registryPath?: string;
  legacyPath?: string;
  onWarn?: (msg: string) => void;
}): { registry: Registry | null; warnings: string[] } {
  const homedir = nodeOs.homedir();
  const registryPath =
    opts?.registryPath ?? nodePath.join(homedir, '.squad', 'registry.json');
  const legacyPath =
    opts?.legacyPath ?? nodePath.join(homedir, '.squad', 'squad-repos.json');

  const warnings: string[] = [];

  const regExists = existsSync(registryPath);
  const legacyExists = existsSync(legacyPath);

  // SC1: registry.json wins (even when squad-repos.json is also present)
  if (regExists) {
    const text = readFileSync(registryPath, 'utf8');
    const registry = parseRegistry(text);
    return { registry, warnings };
  }

  // SC2: only squad-repos.json → warn, return null (no migration)
  if (legacyExists) {
    const msg =
      '[squad] squad-repos.json is ignored — no registry.json found. ' +
      'squad-repos.json is not auto-migrated in v2. ' +
      'Run `squad register --callsign <name> --path <path>` to create a v1 registry.json.';
    const warn = opts?.onWarn ?? ((m: string) => console.warn(m));
    warn(msg);
    warnings.push(msg);
    return { registry: null, warnings };
  }

  return { registry: null, warnings };
}
