/**
 * Export command — port from beta CLI
 * Exports squad to squad-export.json
 */

import { statSync } from 'node:fs'; // TODO: statSync().isDirectory() not in StorageProvider
import path from 'node:path';
import { FSStorageProvider } from '@bradygaster/squad-sdk';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { success, warn } from '../core/output.js';
import { fatal } from '../core/errors.js';

interface ExportManifest {
  version: string;
  exported_at: string;
  squad_version: string;
  casting: Record<string, unknown>;
  agents: Record<string, { charter?: string; history?: string }>;
  skills: string[];
}

/**
 * Export squad to JSON
 */
export async function runExport(dest: string, outPath?: string): Promise<void> {
  const storage = new FSStorageProvider();
  const squadInfo = detectSquadDir(dest);
  const teamMd = path.join(squadInfo.path, 'team.md');
  
  if (!storage.existsSync(teamMd)) {
    fatal('No squad found — run init first');
  }

  const manifest: ExportManifest = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    squad_version: '0.6.0',
    casting: {},
    agents: {},
    skills: []
  };

  // Read casting state
  const castingDir = path.join(squadInfo.path, 'casting');
  for (const file of ['registry.json', 'policy.json', 'history.json']) {
    const filePath = path.join(castingDir, file);
    try {
      const raw = storage.readSync(filePath);
      if (raw !== undefined) {
        manifest.casting[file.replace('.json', '')] = JSON.parse(raw);
      }
    } catch (err) {
      console.error(`Warning: could not read casting/${file}: ${(err as Error).message}`);
    }
  }

  // Read agents
  const agentsDir = path.join(squadInfo.path, 'agents');
  try {
    if (storage.existsSync(agentsDir)) {
      for (const entry of storage.listSync(agentsDir)) {
        const agentDir = path.join(agentsDir, entry);
        // TODO: statSync().isDirectory() not in StorageProvider
        if (!statSync(agentDir).isDirectory()) continue;
        const agent: { charter?: string; history?: string } = {};
        const charterPath = path.join(agentDir, 'charter.md');
        const historyPath = path.join(agentDir, 'history.md');
        const charterContent = storage.readSync(charterPath);
        if (charterContent !== undefined) agent.charter = charterContent;
        const historyContent = storage.readSync(historyPath);
        if (historyContent !== undefined) agent.history = historyContent;
        manifest.agents[entry] = agent;
      }
    }
  } catch (err) {
    console.error(`Warning: could not read agents: ${(err as Error).message}`);
  }

  // Read skills
  const skillSources = [
    { dir: path.join(dest, '.copilot', 'skills'), layout: 'nested' as const },
    { dir: path.join(squadInfo.path, 'skills'), layout: 'nested' as const },
    { dir: path.join(dest, '.ai-team', 'skills'), layout: 'flat' as const },
  ];
  const skillsSource = skillSources.find(({ dir }) => storage.existsSync(dir));
  try {
    if (skillsSource) {
      for (const entry of storage.listSync(skillsSource.dir)) {
        const skillFile = skillsSource.layout === 'nested'
          ? path.join(skillsSource.dir, entry, 'SKILL.md')
          : path.join(skillsSource.dir, entry);
        const skillContent = storage.readSync(skillFile);
        if (skillContent !== undefined) {
          manifest.skills.push(skillContent);
        }
      }
    }
  } catch (err) {
    console.error(`Warning: could not read skills: ${(err as Error).message}`);
  }

  // Determine output path
  const finalOutPath = outPath || path.join(dest, 'squad-export.json');

  try {
    storage.writeSync(finalOutPath, JSON.stringify(manifest, null, 2) + '\n');
  } catch (err) {
    fatal(`Failed to write export file: ${(err as Error).message}`);
  }

  const displayPath = path.relative(dest, finalOutPath) || path.basename(finalOutPath);
  success(`Exported squad to ${displayPath}`);
  warn('Review agent histories before sharing — they may contain project-specific information');
}
