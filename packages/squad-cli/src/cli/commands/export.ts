/**
 * Export command — port from beta CLI
 * Exports squad to squad-export.json (local or GitHub repo)
 */

import path from 'node:path';
import { FSStorageProvider, exportToRepo, parseRepoString } from '@bradygaster/squad-sdk';
import type { RepoSpec } from '@bradygaster/squad-sdk';
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { success, warn, info } from '../core/output.js';
import { fatal } from '../core/errors.js';
import { getPackageVersion } from '../core/version.js';
import { ghAvailable, ghAuthenticated } from '../core/gh-cli.js';

interface ExportManifest {
  version: string;
  exported_at: string;
  squad_version: string;
  team_md?: string;
  decisions_md?: string;
  routing_md?: string;
  casting: Record<string, unknown>;
  agents: Record<string, { charter?: string; history?: string }>;
  skills: string[];
  decisions?: string;
  team?: string;
}

export interface ExportRepoOptions {
  repo: string;
  branch?: string;
}

/**
 * Build the export manifest from a local squad directory.
 */
function buildManifest(dest: string, storage: FSStorageProvider, squadInfo: { path: string }): ExportManifest {
  const manifest: ExportManifest = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    squad_version: getPackageVersion(),
    casting: {},
    agents: {},
    skills: [],
  };

  // Read top-level squad files (team.md, decisions.md, routing.md)
  const teamMdPath = path.join(squadInfo.path, 'team.md');
  const teamMdContent = storage.readSync(teamMdPath);
  if (teamMdContent !== undefined) {
    manifest.team_md = teamMdContent;
    manifest.team = teamMdContent;
  }

  const decisionsMdPath = path.join(squadInfo.path, 'decisions.md');
  const decisionsMdContent = storage.readSync(decisionsMdPath);
  if (decisionsMdContent !== undefined) {
    manifest.decisions_md = decisionsMdContent;
    manifest.decisions = decisionsMdContent;
  }

  const routingMdPath = path.join(squadInfo.path, 'routing.md');
  const routingMdContent = storage.readSync(routingMdPath);
  if (routingMdContent !== undefined) manifest.routing_md = routingMdContent;

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
        if (!storage.isDirectorySync(agentDir)) continue;
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

  return manifest;
}

/**
 * Export squad to JSON (local file or GitHub repo)
 */
export async function runExport(dest: string, outPath?: string, repoOptions?: ExportRepoOptions): Promise<void> {
  const storage = new FSStorageProvider();
  const squadInfo = detectSquadDir(dest);
  const teamMd = path.join(squadInfo.path, 'team.md');
  
  if (!storage.existsSync(teamMd)) {
    fatal('No squad found — run init first');
  }

  const manifest = buildManifest(dest, storage, squadInfo);
  const bundleJson = JSON.stringify(manifest, null, 2) + '\n';

  // Export to GitHub repo if --repo is specified
  if (repoOptions?.repo) {
    if (!(await ghAvailable())) {
      fatal('GitHub CLI (gh) is required for repo export. Install from https://cli.github.com');
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

    try {
      const result = await exportToRepo(bundleJson, repoSpec, {
        branch: repoOptions.branch,
      });
      success(result.message);
    } catch (err) {
      fatal(`Failed to export to repo: ${(err as Error).message}`);
    }

    warn('Review agent histories, decisions, and team content before sharing — they may contain project-specific information');
    return;
  }

  // Local file export (existing behavior)
  const finalOutPath = outPath || path.join(dest, 'squad-export.json');

  try {
    storage.writeSync(finalOutPath, bundleJson);
  } catch (err) {
    fatal(`Failed to write export file: ${(err as Error).message}`);
  }

  const displayPath = path.relative(dest, finalOutPath) || path.basename(finalOutPath);
  success(`Exported squad to ${displayPath}`);
  warn('Review agent histories, decisions, and team content before sharing — they may contain project-specific information');
}
