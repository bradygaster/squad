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
import os from 'node:os';
import { readdirSync, statSync, lstatSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import { resolvePresetsDir, ensureSquadHome } from '../resolution.js';
import type { PresetManifest, PresetApplyResult, PresetAgent } from './types.js';
import { scaffoldPresetIntoSquad } from './scaffold.js';

export type { PresetManifest, PresetAgent, PresetApplyResult } from './types.js';

const storage = new FSStorageProvider();

function isDirSync(p: string): boolean {
  try { return lstatSync(p).isDirectory(); } catch { return false; }
}

/** Validate a preset or agent name — must be a safe basename (no path separators, no ..) */
function validateName(name: string, label: string): void {
  if (!name || name !== path.basename(name) || name === '..' || name === '.') {
    throw new Error(`Invalid ${label} name: '${name}'. Must be a simple directory name.`);
  }
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
  options: { force?: boolean; overwriteRouting?: boolean } = {},
): PresetApplyResult[] {
  try { validateName(presetName, 'preset'); } catch (err) {
    return [{ agent: presetName, status: 'error', reason: String(err) }];
  }

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
    try { validateName(agent.name, 'agent'); } catch {
      results.push({ agent: agent.name, status: 'error', reason: `Invalid agent name: '${agent.name}'` });
      continue;
    }

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
      // When forcing, remove dest first so renamed/deleted files don't linger
      if (options.force && storage.existsSync(destDir)) {
        rmSync(destDir, { recursive: true, force: true });
      }
      copyDirRecursive(sourceDir, destDir);
      results.push({ agent: agent.name, status: 'installed' });
    } catch (err) {
      results.push({ agent: agent.name, status: 'error', reason: String(err) });
    }
  }

  // Restore saved routing.md from the preset if present (#1412). This must
  // happen before scaffolding so that writeOrMergeRouting sees the full custom
  // routing content and only appends any missing agent rows rather than
  // regenerating a skeleton.
  const savedRoutingPath = path.join(presetDir, 'routing.md');
  if (storage.existsSync(savedRoutingPath)) {
    const squadDir = path.dirname(targetDir);
    const destRoutingPath = path.join(squadDir, 'routing.md');
    // Only overwrite if explicitly requested or routing.md doesn't exist yet
    if (options.force || options.overwriteRouting || !storage.existsSync(destRoutingPath)) {
      const content = storage.readSync(savedRoutingPath);
      if (content !== undefined) {
        storage.mkdirSync(squadDir, { recursive: true });
        storage.writeSync(destRoutingPath, content);
      }
    }
  }

  // After copying charters, wire the preset agents into team.md, routing.md,
  // and the casting state files (registry/history/policy). Without this, the
  // coordinator's mode-switch check sees an empty ## Members table and
  // treats every session as Init Mode — see bradygaster/squad#1288. We only
  // include agents that did not error out (installed + skipped-because-
  // already-present) so the scaffolded team reflects the user's intent.
  const wireableAgents: PresetAgent[] = manifest.agents.filter(a =>
    results.some(r => r.agent === a.name && r.status !== 'error'),
  );
  if (wireableAgents.length > 0) {
    const squadDir = path.dirname(targetDir);
    try {
      scaffoldPresetIntoSquad(squadDir, wireableAgents, presetName);
    } catch (err) {
      // Scaffolding failed but charters were copied — surface as a single
      // synthetic error result so the CLI can warn but does not mask the
      // per-agent install results.
      //
      // Use a clearly non-agent sentinel for the `agent` field (`<scaffold>`,
      // wrapped in angle brackets which validateName rejects) instead of the
      // preset name. The preset name is a legal agent name, and if a preset
      // happens to ship an agent that shares the preset's name (`squad
      // preset apply geektime` where the preset includes an agent literally
      // called `geektime`), the consumer of the results could not tell the
      // synthetic scaffold-failure row apart from a real per-agent error.
      results.push({
        agent: '<scaffold>',
        status: 'error',
        reason: `Charters copied (see per-agent rows above), but failed to wire team.md/routing.md/casting state for preset '${presetName}': ${String(err)}`,
      });
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
  validateName(name, 'preset');

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

  // Capture routing.md so custom routing configuration round-trips (#1412)
  const routingPath = path.join(squadDir, 'routing.md');
  if (storage.existsSync(routingPath)) {
    const routingContent = storage.readSync(routingPath);
    if (routingContent !== undefined) {
      storage.writeSync(path.join(destDir, 'routing.md'), routingContent);
    }
  }

  return destDir;
}

/**
 * Source descriptor for `installPresetFromSource`.
 *
 * A source is either:
 * - A local filesystem path to either a single preset dir (contains `preset.json`)
 *   OR a `presets/` collection dir (contains multiple preset subdirs).
 * - A GitHub URL in one of these shapes (all shallow-cloned to a temp dir):
 *     https://github.com/owner/repo[.git]
 *     https://github.com/owner/repo[.git]#preset-name           — install only this subdir under <repo>/presets/
 *     https://github.com/owner/repo/tree/<branch>/path/to/preset — install only this subpath
 *     git@github.com:owner/repo.git
 */
export interface InstallPresetOptions {
  /** Optional override for the installed preset name. Defaults to the source's preset name. */
  name?: string;
  /** Overwrite existing preset if it exists. */
  force?: boolean;
}

export interface InstallPresetResult {
  /** The name the preset was installed under. */
  installedName: string;
  /** Absolute path of the installed preset dir under SQUAD_HOME. */
  installedDir: string;
  /** Source the preset was installed from (verbatim from caller). */
  source: string;
}

/**
 * Install a preset from a remote git source or local path into `$SQUAD_HOME/presets/<name>/`.
 *
 * For git URLs, shallow-clones to an OS temp dir then copies the resolved preset.
 * For local paths, copies directly. Cleans up the temp clone whether success or failure.
 *
 * Resolution rules for finding the preset within the source:
 * 1. If the source dir/subdir contains `preset.json` → install that as a single preset
 * 2. Else if it contains a `presets/` subdir (multi-preset collection) → require `options.name`
 *    to pick which subdir to install
 * 3. Else error — source is not a recognizable preset
 *
 * @throws Error on any validation failure, manifest invalidity, or destination collision.
 */
/**
 * Validate a name fragment that will be used as a path segment. Same
 * shape as preset names (validateName rules) — must not contain path
 * separators, `..`, null bytes, or other escape vectors. Throws on
 * any rejected input.
 */
function validatePathSegment(name: string, label: string): void {
  if (!name || typeof name !== 'string') {
    throw new Error(`${label} is required.`);
  }
  // Reject path separators, dot-dot, and any character that would let a
  // user escape the parent directory via path.join.
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name === '.' ||
    name === '..' ||
    name.includes('\0')
  ) {
    throw new Error(`Invalid ${label}: '${name}' must not contain path separators, '..', or null bytes.`);
  }
}

/**
 * Validate a source-derived subPath. Must be relative, must not contain
 * `..` segments, and must not be absolute — otherwise an attacker who
 * controls the source string can make us read from anywhere on disk.
 */
function validateSubPath(subPath: string): void {
  if (path.isAbsolute(subPath)) {
    throw new Error(`Invalid subPath '${subPath}': must be a relative path inside the source.`);
  }
  // Reject any segment equal to '..' — this is the canonical escape vector.
  const segs = subPath.split(/[\\/]+/).filter(s => s.length > 0);
  if (segs.some(s => s === '..')) {
    throw new Error(`Invalid subPath '${subPath}': '..' segments are not allowed.`);
  }
  if (subPath.includes('\0')) {
    throw new Error(`Invalid subPath '${subPath}': null bytes are not allowed.`);
  }
}

export function installPresetFromSource(source: string, options: InstallPresetOptions = {}): InstallPresetResult {
  if (!source || typeof source !== 'string') {
    throw new Error('Source is required.');
  }

  // Resolve the source into a local working directory + optional sub-path inside it.
  // Returns { workDir, subPath, cleanup } — caller must call cleanup() in a finally.
  const { workDir, subPath, nameHint, cleanup } = resolveInstallSource(source);

  try {
    // Locate the actual preset directory inside workDir
    if (subPath) {
      validateSubPath(subPath);
    }
    const startDir = subPath ? path.join(workDir, subPath) : workDir;
    if (!storage.existsSync(startDir) || !isDirSync(startDir)) {
      throw new Error(`Source path does not exist or is not a directory: ${startDir}`);
    }

    // Effective preset-name hint resolution priority:
    //   1. Explicit --name option (highest)
    //   2. Fragment-derived nameHint from the source URL (e.g. `repo#starter`)
    // Whichever is selected must validate as a safe basename before we
    // let path.join touch it.
    const effectiveNameHint = options.name ?? nameHint ?? undefined;
    if (effectiveNameHint) {
      validatePathSegment(effectiveNameHint, 'preset name');
    }

    const { presetDir, defaultName } = locatePresetWithinSource(startDir, effectiveNameHint);

    // Validate manifest before doing anything destructive
    const manifest = loadPresetManifest(presetDir);
    if (!manifest) {
      throw new Error(`No valid preset.json found at ${presetDir}. Expected fields: name, agents[].`);
    }

    // Verify agents/ dir exists (preset is useless without it)
    const sourceAgentsDir = path.join(presetDir, 'agents');
    if (!storage.existsSync(sourceAgentsDir) || !isDirSync(sourceAgentsDir)) {
      throw new Error(`Preset is missing agents/ directory at ${sourceAgentsDir}`);
    }

    // Decide installed name: caller override > manifest.name > defaultName from path
    // Prefer manifest.name when the user didn't specify --name because that's the preset's
    // declared identity (e.g. a temp clone dir's basename shouldn't become the preset name).
    const installedName = options.name ?? manifest.name ?? defaultName;
    validateName(installedName, 'preset');

    const homeDir = ensureSquadHome();
    const destDir = path.join(homeDir, 'presets', installedName);

    if (storage.existsSync(destDir)) {
      if (!options.force) {
        throw new Error(`Preset '${installedName}' already exists at ${destDir}. Use --force to overwrite.`);
      }
      rmSync(destDir, { recursive: true, force: true });
    }

    // Copy the preset (preset.json + agents/)
    storage.mkdirSync(destDir, { recursive: true });

    // Stamp manifest.name with the installed name if it was renamed (so list/show stay consistent)
    const finalManifest: PresetManifest = options.name && options.name !== manifest.name
      ? { ...manifest, name: installedName }
      : manifest;
    storage.writeSync(path.join(destDir, 'preset.json'), JSON.stringify(finalManifest, null, 2));
    copyDirRecursive(sourceAgentsDir, path.join(destDir, 'agents'));

    return { installedName, installedDir: destDir, source };
  } finally {
    cleanup();
  }
}

/**
 * Resolve `source` to a working directory on disk. Handles:
 *  - Local absolute/relative paths (no clone needed; cleanup is a no-op)
 *  - GitHub HTTPS URLs (https://github.com/owner/repo[#fragment][/tree/branch/path])
 *  - GitHub SSH URLs (git@github.com:owner/repo.git)
 *  - Any other git-cloneable URL (treated as plain git URL)
 *
 * Fragment handling (post-review on bradygaster/squad#1225):
 *  - `repo#some/path`  → fragment WITH `/` is treated as a literal subPath
 *    inside the cloned working directory (e.g. `repo#packs/team-a` looks
 *    at `<clone>/packs/team-a`).
 *  - `repo#some-name`  → fragment WITHOUT `/` is treated as a PRESET-NAME
 *    HINT, NOT a subpath. The hint is plumbed through to
 *    `locatePresetWithinSource` so `repo#my-team` correctly resolves to
 *    the common `<clone>/presets/my-team/` layout (or `<clone>/my-team/`
 *    if the repo IS the preset). Earlier behaviour treated bare fragments
 *    as subPaths and broke the documented `repo#preset-name` shape.
 *
 * Returns { workDir, subPath, nameHint, cleanup }:
 *  - workDir  = the local dir containing the cloned/referenced content
 *  - subPath  = optional relative path inside workDir to descend into
 *               before searching for a preset (only set when the URL
 *               fragment contained `/`, or via /tree/<branch>/<path>)
 *  - nameHint = optional preset-name hint derived from a bare URL fragment;
 *               forwarded to locatePresetWithinSource without being used
 *               as a path segment itself
 *  - cleanup  = function to call when done (rm -rf temp clones)
 */
function resolveInstallSource(source: string): { workDir: string; subPath: string | null; nameHint: string | null; cleanup: () => void } {
  const looksLikeUrl = /^(https?:\/\/|git@)/i.test(source);

  if (!looksLikeUrl) {
    // Local path: pass-through, no cleanup needed, no fragment handling
    const resolved = path.resolve(source);
    return { workDir: resolved, subPath: null, nameHint: null, cleanup: () => {} };
  }

  let cloneUrl = source;
  let ref: string | null = null;
  let subPath: string | null = null;
  let nameHint: string | null = null;

  // Extract fragment (#...) — split into subPath (when it contains `/`) vs.
  // nameHint (bare name; resolved later by locatePresetWithinSource).
  const fragmentIdx = source.indexOf('#');
  if (fragmentIdx >= 0) {
    const frag = source.substring(fragmentIdx + 1);
    cloneUrl = source.substring(0, fragmentIdx);
    if (frag.includes('/')) {
      subPath = frag;
    } else if (frag.length > 0) {
      // Bare fragment = preset-name hint, NOT a subpath. The collection-
      // layout case (`<clone>/presets/<frag>/`) needs locatePresetWithinSource
      // to receive this as a `nameHint`, not as a path.
      nameHint = frag;
    }
  }

  // Extract /tree/<branch>/<sub-path> if present
  const treeMatch = cloneUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/tree\/([^/]+)(?:\/(.+))?$/);
  if (treeMatch) {
    cloneUrl = treeMatch[1]!;
    ref = treeMatch[2]!;
    if (treeMatch[3]) subPath = treeMatch[3]!;
  }

  // Normalize: ensure .git suffix on cloneUrl for portability (gh clone accepts both)
  if (!/\.git$/i.test(cloneUrl) && /^https?:\/\/github\.com\//i.test(cloneUrl)) {
    cloneUrl = cloneUrl + '.git';
  }

  // Shallow clone to a temp dir
  const tmpBase = path.join(os.tmpdir(), `squad-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  storage.mkdirSync(tmpBase, { recursive: true });

  try {
    // Use execFileSync with an argument array (no shell). Earlier shape used
    // execSync with a constructed command string + ad-hoc escaping — that
    // permitted shell injection when `source` (or a ref) contained `;`, `&&`,
    // `|`, backticks, `$()`, etc. Per the review on bradygaster/squad#1225,
    // switch to spawning git directly so the args can't be interpreted by a
    // shell.
    const args = ['clone', '--depth', '1'];
    if (ref) {
      args.push('--branch', ref);
    }
    args.push(cloneUrl, tmpBase);
    execFileSync('git', args, { stdio: 'pipe' });
  } catch (err) {
    // Clean up partial clone before rethrowing
    try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone ${cloneUrl}${ref ? ` (ref ${ref})` : ''}: ${msg}`);
  }

  const cleanup = () => {
    try { rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore — temp dir, best effort */ }
  };
  return { workDir: tmpBase, subPath, nameHint, cleanup };
}

/**
 * Locate the preset directory within a resolved source. Behavior:
 *  1. If `startDir/preset.json` exists → that IS the preset dir (single-preset source).
 *     Returns { presetDir: startDir, defaultName: basename(startDir) }.
 *  2. Else if `startDir/presets/` exists (multi-preset collection):
 *     - If `nameHint` is provided AND `startDir/presets/<nameHint>` exists → use that.
 *     - Else throw — caller must pass `--name` to disambiguate.
 *  3. Else if startDir's basename is `presets` and contains one subdir → use that subdir.
 *  4. Else throw — startDir doesn't look like a preset or preset collection.
 */
function locatePresetWithinSource(startDir: string, nameHint?: string): { presetDir: string; defaultName: string } {
  // Defense in depth: if a nameHint is passed, re-validate it as a safe
  // basename here too. The public installPresetFromSource() entry already
  // validates, but this function is exported in case future callers go
  // direct — re-checking prevents path-escape via `../something`.
  if (nameHint !== undefined) {
    validatePathSegment(nameHint, 'preset name');
  }

  // Case 1: startDir IS a preset
  if (storage.existsSync(path.join(startDir, 'preset.json'))) {
    return { presetDir: startDir, defaultName: path.basename(startDir) };
  }

  // Case 2: startDir contains a presets/ collection
  const presetsSubDir = path.join(startDir, 'presets');
  if (storage.existsSync(presetsSubDir) && isDirSync(presetsSubDir)) {
    if (nameHint) {
      const candidate = path.join(presetsSubDir, nameHint);
      if (storage.existsSync(path.join(candidate, 'preset.json'))) {
        return { presetDir: candidate, defaultName: nameHint };
      }
      throw new Error(`Preset '${nameHint}' not found in ${presetsSubDir}.`);
    }
    // No hint — list available presets and ask user to pick
    const available = readdirSync(presetsSubDir, { encoding: 'utf-8' })
      .filter(e => isDirSync(path.join(presetsSubDir, e)))
      .filter(e => storage.existsSync(path.join(presetsSubDir, e, 'preset.json')));
    throw new Error(
      `Source contains multiple presets — specify one with --name <preset-name> or #<preset-name> URL fragment. ` +
      `Available: ${available.length > 0 ? available.join(', ') : '(none with valid preset.json)'}`,
    );
  }

  // Case 3: startDir IS the presets/ dir itself (e.g. user pointed directly at it)
  if (path.basename(startDir) === 'presets') {
    if (nameHint) {
      const candidate = path.join(startDir, nameHint);
      if (storage.existsSync(path.join(candidate, 'preset.json'))) {
        return { presetDir: candidate, defaultName: nameHint };
      }
      throw new Error(`Preset '${nameHint}' not found in ${startDir}.`);
    }
    const available = readdirSync(startDir, { encoding: 'utf-8' })
      .filter(e => isDirSync(path.join(startDir, e)))
      .filter(e => storage.existsSync(path.join(startDir, e, 'preset.json')));
    if (available.length === 1) {
      const only = available[0]!;
      return { presetDir: path.join(startDir, only), defaultName: only };
    }
    throw new Error(
      `Source contains multiple presets — specify one with --name <preset-name>. Available: ${available.join(', ')}`,
    );
  }

  throw new Error(`No preset found at ${startDir}. Expected either a preset.json or a presets/ directory.`);
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
    const stat = lstatSync(srcPath);

    // Skip symlinks — don't follow them into unintended locations
    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
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
