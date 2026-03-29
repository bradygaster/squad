/**
 * Import command — port from beta CLI
 * Imports squad from squad-export.json
 */

import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { success, warn, info } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { splitHistory } from '../core/history-split.js';

interface ImportManifest {
  version: string;
  exported_at?: string;
  squad_version?: string;
  casting: Record<string, unknown>;
  agents: Record<string, { charter?: string; history?: string }>;
  skills: string[];
}

/**
 * Import squad from JSON
 */
export async function runImport(dest: string, importPath: string, force: boolean): Promise<void> {
  const storage = new FSStorageProvider();
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

  // Write empty project-specific files
  storage.writeSync(path.join(squadDir, 'decisions.md'), '');
  storage.writeSync(path.join(squadDir, 'team.md'), '');

  // Write casting state
  for (const [key, value] of Object.entries(manifest.casting)) {
    storage.writeSync(
      path.join(squadDir, 'casting', `${key}.json`),
      JSON.stringify(value, null, 2) + '\n'
    );
  }

  // Determine source project name from filename
  const sourceProject = path.basename(resolvedPath, '.json');
  const importDate = new Date().toISOString();

  // Write agents
  const agentNames = Object.keys(manifest.agents);
  for (const name of agentNames) {
    const agent = manifest.agents[name]!;
    const agentDir = path.join(squadDir, 'agents', name);

    if (agent.charter) {
      storage.writeSync(path.join(agentDir, 'charter.md'), agent.charter);
    }

    // History split: separate portable knowledge from project learnings
    let historyContent = '';
    if (agent.history) {
      historyContent = splitHistory(agent.history, sourceProject);
    }
    historyContent = `📌 Imported from ${sourceProject} on ${importDate}. Portable knowledge carried over; project learnings from previous project preserved below.\n\n` + historyContent;
    storage.writeSync(path.join(agentDir, 'history.md'), historyContent);
  }

  // Write skills
  for (const skillContent of manifest.skills) {
    const nameMatch = skillContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    const skillName = nameMatch
      ? nameMatch[1]!.trim().toLowerCase().replace(/\s+/g, '-')
      : `skill-${manifest.skills.indexOf(skillContent)}`;
    const skillDir = path.join(dest, '.copilot', 'skills', skillName);
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
  success(`Imported squad from ${path.basename(resolvedPath)}`);
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
