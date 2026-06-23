/**
 * Import command — port from beta CLI
 * Imports squad from squad-export.json (local file or GitHub repo)
 */

import path from 'node:path';
import { FSStorageProvider, importFromRepo, parseRepoString } from '@bradygaster/squad-sdk';
import type { RepoSpec } from '@bradygaster/squad-sdk';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { success, warn, info } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { splitHistory } from '../core/history-split.js';
import { ghAvailable, ghAuthenticated } from '../core/gh-cli.js';

interface ImportManifest {
  version: string;
  exported_at?: string;
  squad_version?: string;
  team_md?: string;
  decisions_md?: string;
  routing_md?: string;
  casting: Record<string, unknown>;
  agents: Record<string, { charter?: string; history?: string }>;
  skills: string[];
  decisions?: string;
  team?: string;
}

export interface ImportRepoOptions {
  repo: string;
  branch?: string;
}

/** Validate that a name is a safe slug (no path traversal or special characters). */
function isSafeSlug(name: string): boolean {
  if (!name) return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  if (name.startsWith('.') || name.startsWith('-')) return false;
  // Only allow alphanumeric, hyphens, underscores, and dots (not leading)
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/** Validate that a resolved path is under the expected parent directory. */
function assertPathUnder(resolvedPath: string, parentDir: string): void {
  const normalizedChild = path.resolve(resolvedPath);
  const normalizedParent = path.resolve(parentDir);
  if (!normalizedChild.startsWith(normalizedParent + path.sep) && normalizedChild !== normalizedParent) {
    throw new Error(`Path traversal detected: "${resolvedPath}" escapes "${parentDir}"`);
  }
}

/**
 * Apply an import manifest to a target directory.
 */
function applyManifest(
  manifest: ImportManifest,
  dest: string,
  sourceLabel: string,
  force: boolean,
  storage: FSStorageProvider,
): void {
  const squadInfo = detectSquadDir(dest);
  const squadDir = squadInfo.path;

  // Conflict detection
  if (storage.existsSync(squadDir)) {
    if (!force) {
      fatal('A squad already exists here. Use --force to replace (current squad will be archived).');
    }
    // Archive existing squad
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const archiveDir = path.join(dest, `${squadInfo.name}-archive-${ts}`);
    storage.renameSync(squadDir, archiveDir);
    info(`Archived existing squad to ${path.basename(archiveDir)}`);
  }

  // Create directory structure
  storage.mkdirSync(path.join(squadDir, 'casting'), { recursive: true });
  storage.mkdirSync(path.join(squadDir, 'decisions', 'inbox'), { recursive: true });
  storage.mkdirSync(path.join(squadDir, 'orchestration-log'), { recursive: true });
  storage.mkdirSync(path.join(squadDir, 'log'), { recursive: true });
  storage.mkdirSync(path.join(dest, '.copilot', 'skills'), { recursive: true });

  if (manifest.decisions_md !== undefined && typeof manifest.decisions_md !== 'string') {
    fatal('Invalid export file: "decisions_md" field must be a string');
  }
  if (manifest.team_md !== undefined && typeof manifest.team_md !== 'string') {
    fatal('Invalid export file: "team_md" field must be a string');
  }
  if (manifest.routing_md !== undefined && typeof manifest.routing_md !== 'string') {
    fatal('Invalid export file: "routing_md" field must be a string');
  }
  if (manifest.decisions !== undefined && typeof manifest.decisions !== 'string') {
    fatal('Invalid export file: "decisions" field must be a string');
  }
  if (manifest.team !== undefined && typeof manifest.team !== 'string') {
    fatal('Invalid export file: "team" field must be a string');
  }

  const decisionsContent = manifest.decisions_md ?? manifest.decisions ?? '';
  const teamContent = manifest.team_md ?? manifest.team ?? '';

  // Write top-level squad files
  storage.writeSync(path.join(squadDir, 'decisions.md'), decisionsContent);
  storage.writeSync(path.join(squadDir, 'team.md'), teamContent);
  if (manifest.routing_md !== undefined) {
    storage.writeSync(path.join(squadDir, 'routing.md'), manifest.routing_md);
  }

  // Write casting state
  for (const [key, value] of Object.entries(manifest.casting)) {
    storage.writeSync(
      path.join(squadDir, 'casting', `${key}.json`),
      JSON.stringify(value, null, 2) + '\n'
    );
  }

  // Determine source project name
  const importDate = new Date().toISOString();

  // Write agents
  const agentNames = Object.keys(manifest.agents);
  for (const name of agentNames) {
    if (!isSafeSlug(name)) {
      fatal(`Invalid agent name "${name}": must be a safe slug (alphanumeric, hyphens, underscores)`);
    }
    const agent = manifest.agents[name]!;
    const agentDir = path.join(squadDir, 'agents', name);
    assertPathUnder(agentDir, path.join(squadDir, 'agents'));

    if (agent.charter) {
      storage.writeSync(path.join(agentDir, 'charter.md'), agent.charter);
    }

    // History split: separate portable knowledge from project learnings
    let historyContent = '';
    if (agent.history) {
      historyContent = splitHistory(agent.history, sourceLabel);
    }
    historyContent = `📌 Imported from ${sourceLabel} on ${importDate}. Portable knowledge carried over; project learnings from previous project preserved below.\n\n` + historyContent;
    storage.writeSync(path.join(agentDir, 'history.md'), historyContent);
  }

  // Write skills
  for (const skillContent of manifest.skills) {
    const nameMatch = skillContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    let skillName = nameMatch
      ? nameMatch[1]!.trim().toLowerCase().replace(/\s+/g, '-')
      : `skill-${manifest.skills.indexOf(skillContent)}`;
    // Sanitize skill name to prevent path traversal
    skillName = skillName.replace(/[^a-z0-9._-]/g, '-').replace(/^[.-]+/, '');
    if (!skillName || !isSafeSlug(skillName)) {
      skillName = `skill-${manifest.skills.indexOf(skillContent)}`;
    }
    const skillDir = path.join(dest, '.copilot', 'skills', skillName);
    assertPathUnder(skillDir, path.join(dest, '.copilot', 'skills'));
    storage.writeSync(path.join(skillDir, 'SKILL.md'), skillContent);
  }

  // Determine universe for messaging
  let universe = 'unknown';
  if (manifest.casting.policy && typeof manifest.casting.policy === 'object') {
    const policy = manifest.casting.policy as Record<string, unknown>;
    if (policy.universe) {
      universe = String(policy.universe);
    }
  }

  // Output
  success(`Imported squad from ${sourceLabel}`);
  info(`  ${agentNames.length} agents: ${agentNames.join(', ')}`);
  info(`  ${manifest.skills.length} skills imported`);
  info(`  Casting: ${universe} universe preserved`);
  console.log();
  warn('Project-specific learnings are marked in agent histories — review if needed');
  console.log();
  info('Next steps:');
  info('  1. Open Copilot and select Squad');
  info('  2. Tell the team about this project — they\'ll adapt');
  console.log();
}

/**
 * Import squad from JSON (local file or GitHub repo)
 */
export async function runImport(dest: string, importPath: string, force: boolean, repoOptions?: ImportRepoOptions): Promise<void> {
  const storage = new FSStorageProvider();

  // Import from GitHub repo if --repo is specified
  if (repoOptions?.repo) {
    if (!(await ghAvailable())) {
      fatal('GitHub CLI (gh) is required for repo import. Install from https://cli.github.com');
    }
    if (!(await ghAuthenticated())) {
      fatal('GitHub CLI is not authenticated. Run: gh auth login');
    }

    const parsed = parseRepoString(repoOptions.repo);
    const repoSpec: RepoSpec = {
      owner: parsed.owner,
      repo: parsed.repo,
      branch: repoOptions.branch,
    };

    let manifest: ImportManifest;
    try {
      const result = await importFromRepo(repoSpec, {
        branch: repoOptions.branch,
      });
      manifest = JSON.parse(result.content);
    } catch (err) {
      fatal(`Failed to import from repo: ${(err as Error).message}`);
    }

    // Validate manifest
    if (manifest.version !== '1.0') {
      fatal(`Unsupported export version: ${manifest.version || 'missing'} (expected 1.0)`);
    }
    if (!manifest.agents || typeof manifest.agents !== 'object') {
      fatal('Invalid export file: missing or invalid "agents" field');
    }
    if (!manifest.casting || typeof manifest.casting !== 'object') {
      fatal('Invalid export file: missing or invalid "casting" field');
    }
    if (!Array.isArray(manifest.skills)) {
      fatal('Invalid export file: missing or invalid "skills" field');
    }

    const sourceLabel = `${repoSpec.owner}/${repoSpec.repo}`;
    applyManifest(manifest, dest, sourceLabel, force, storage);
    return;
  }

  // Local file import (existing behavior)
  const resolvedPath = path.resolve(importPath);
  
  if (!storage.existsSync(resolvedPath)) {
    fatal(`Import file not found: ${importPath}`);
  }

  let manifest: ImportManifest;
  try {
    const raw = storage.readSync(resolvedPath);
    if (raw === undefined) {
      fatal(`Import file not found: ${importPath}`);
    }
    manifest = JSON.parse(raw);
  } catch (err) {
    fatal(`Invalid JSON in import file: ${(err as Error).message}`);
  }

  // Validate manifest
  if (manifest.version !== '1.0') {
    fatal(`Unsupported export version: ${manifest.version || 'missing'} (expected 1.0)`);
  }
  if (!manifest.agents || typeof manifest.agents !== 'object') {
    fatal('Invalid export file: missing or invalid "agents" field');
  }
  if (!manifest.casting || typeof manifest.casting !== 'object') {
    fatal('Invalid export file: missing or invalid "casting" field');
  }
  if (!Array.isArray(manifest.skills)) {
    fatal('Invalid export file: missing or invalid "skills" field');
  }

  const sourceLabel = path.basename(resolvedPath, '.json');
  applyManifest(manifest, dest, sourceLabel, force, storage);
}
