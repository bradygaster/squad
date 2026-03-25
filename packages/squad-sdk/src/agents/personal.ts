/**
 * Personal Squad Agent Resolution
 * 
 * Discovers and merges personal agents from the user's personal squad directory
 * into project session casts. Personal agents are ambient — they're automatically
 * available in all project contexts with ghost protocol enforced.
 * 
 * @module agents/personal
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolvePersonalSquadDir } from '../resolution.js';
import { AgentManifest } from '../config/agent-source.js';

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
export async function resolvePersonalAgents(): Promise<PersonalAgentManifest[]> {
  const personalDir = resolvePersonalSquadDir();
  if (!personalDir) return [];
  
  const agentsDir = path.join(personalDir, 'agents');
  if (!fs.existsSync(agentsDir)) return [];
  
  const entries = await fs.promises.readdir(agentsDir, { withFileTypes: true });
  const agents: PersonalAgentManifest[] = [];
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const charterPath = path.join(agentsDir, entry.name, 'charter.md');
    if (!fs.existsSync(charterPath)) continue;
    
    const charterContent = await fs.promises.readFile(charterPath, 'utf-8');
    const meta = parseCharterMetadataBasic(charterContent);
    
    agents.push({
      name: entry.name,
      role: meta.role || 'personal',
      source: 'personal',
      personal: {
        origin: 'personal',
        sourceDir: path.join(agentsDir, entry.name),
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
