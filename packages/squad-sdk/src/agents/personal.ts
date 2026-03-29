/**
 * Personal Squad Agent Resolution
 * 
 * Discovers and merges personal agents from the user's personal squad directory
 * into project session casts. Personal agents are ambient — they're automatically
 * available in all project contexts with ghost protocol enforced.
 * 
 * @module agents/personal
 */

import path from 'node:path';
import { resolvePersonalSquadDir } from '../resolution.js';
import { AgentManifest } from '../config/agent-source.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { StorageProvider } from '../storage/storage-provider.js';

/** Metadata tag for personal agents in a session cast */
export interface PersonalAgentMeta {
  /** Always 'personal' for personal squad agents */
  origin: 'personal';
  /** Absolute path to the personal agent's directory */
  sourceDir: string;
  /** Whether ghost protocol is enforced (always true in project context) */
  ghostProtocol: boolean;
}

/** A project agent manifest augmented with personal origin info */
export type PersonalAgentManifest = AgentManifest & {
  personal: PersonalAgentMeta;
};

/**
 * Discover personal agents from the user's personal squad directory.
 * Returns empty array if personal squad is disabled or doesn't exist.
 */
export async function resolvePersonalAgents(
  storage: StorageProvider = new FSStorageProvider(),
): Promise<PersonalAgentManifest[]> {
  const personalDir = resolvePersonalSquadDir();
  if (!personalDir) return [];
  
  const agentsDir = path.join(personalDir, 'agents');
  const entries = await storage.list(agentsDir);
  const agents: PersonalAgentManifest[] = [];
  
  for (const name of entries) {
    const entryPath = path.join(agentsDir, name);
    if (!(await storage.isDirectory(entryPath))) continue;
    const charterPath = path.join(entryPath, 'charter.md');
    const charterContent = await storage.read(charterPath);
    if (!charterContent) continue;
    
    const meta = parseCharterMetadataBasic(charterContent);
    
    agents.push({
      name,
      role: meta.role || 'personal',
      source: 'personal',
      personal: {
        origin: 'personal',
        sourceDir: path.join(agentsDir, name),
        ghostProtocol: true,
      },
    });
  }
  
  return agents;
}

/** Basic charter metadata parser for personal agents */
function parseCharterMetadataBasic(content: string): { role?: string; name?: string } {
  const roleMatch = content.match(/\*\*Role:\*\*\s*(.+)/);
  const nameMatch = content.match(/\*\*Name:\*\*\s*(.+)/);
  return {
    role: roleMatch?.[1]?.trim(),
    name: nameMatch?.[1]?.trim(),
  };
}

/**
 * Merge personal agents into a project session cast.
 * Personal agents are tagged with origin: 'personal' and ghost protocol is enforced.
 * Duplicate names: project agents take precedence over personal agents.
 */
export function mergeSessionCast(
  projectAgents: AgentManifest[],
  personalAgents: PersonalAgentManifest[]
): (AgentManifest | PersonalAgentManifest)[] {
  const projectNames = new Set(projectAgents.map(a => a.name.toLowerCase()));
  
  // Filter out personal agents that conflict with project agent names
  const uniquePersonal = personalAgents.filter(
    a => !projectNames.has(a.name.toLowerCase())
  );
  
  return [...projectAgents, ...uniquePersonal];
}
