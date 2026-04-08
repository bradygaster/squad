/**
 * squad cast — show current session cast (project + personal agents merged)
 *
 * Displays the merged session cast with project agents and personal agents,
 * highlighting which agents come from the personal squad.
 *
 * @module cli/commands/cast
 */

import { LocalAgentSource } from '@bradygaster/squad-sdk/config/agent-source';
import { resolvePersonalAgents, mergeSessionCast } from '@bradygaster/squad-sdk/agents/personal';
import { resolveSquadPaths } from '@bradygaster/squad-sdk/resolution';
import { BOLD, RESET, DIM, GREEN, YELLOW } from '../core/output.js';
import { fatal } from '../core/errors.js';

/**
 * Run the cast command — show merged session cast.
 */
export async function runCast(cwd: string): Promise<void> {
  // Resolve squad paths
  const paths = resolveSquadPaths(cwd);
  if (!paths) {
    fatal('No squad found. Run "squad init" first.');
  }
  
  // Discover project agents
  const projectSource = new LocalAgentSource(cwd);
  const projectAgents = await projectSource.listAgents();
  
  // Discover personal agents
  const personalAgents = await resolvePersonalAgents();
  
  // Merge session cast
  const cast = mergeSessionCast(projectAgents, personalAgents);
  
  if (cast.length === 0) {
    console.log('\nNo agents found in current session cast.\n');
    return;
  }
  
  // Count project vs personal
  const projectCount = projectAgents.length;
  const personalCount = personalAgents.filter(
    pa => !projectAgents.some(pra => pra.name.toLowerCase() === pa.name.toLowerCase())
  ).length;
  
  console.log(`\n${BOLD}Session Cast${RESET} (${cast.length} agents):\n`);
  
  if (projectCount > 0) {
    console.log(`  Project agents:  ${projectCount}`);
  }
  if (personalCount > 0) {
    console.log(`  Personal agents: ${personalCount} ${YELLOW}(ambient)${RESET}`);
  }
  console.log();
  
  // Calculate column widths
  const maxNameLen = Math.max(...cast.map(a => a.name.length), 4);
  const maxRoleLen = Math.max(...cast.map(a => a.role.length), 4);
  
  // Header
  console.log(
    `  ${'Name'.padEnd(maxNameLen)}  ` +
    `${'Role'.padEnd(maxRoleLen)}  ` +
    `Origin        Ghost Protocol`
  );
  console.log(
    `  ${'─'.repeat(maxNameLen)}  ` +
    `${'─'.repeat(maxRoleLen)}  ` +
    `${'─'.repeat(13)} ${'─'.repeat(14)}`
  );
  
  // Rows
  for (const agent of cast) {
    const isPersonal = 'personal' in agent;
    const nameDisplay = isPersonal
      ? `👤 ${agent.name}`.padEnd(maxNameLen + 3) // +3 for emoji width
      : agent.name.padEnd(maxNameLen);
    
    const origin = isPersonal ? `${YELLOW}personal${RESET}` : 'project';
    const originPadded = isPersonal ? origin + ' '.repeat(6) : origin.padEnd(13);
    
    const ghostProtocol = isPersonal && agent.personal.ghostProtocol
      ? `${GREEN}✓ enforced${RESET}`
      : '–';
    
    console.log(
      `  ${nameDisplay}  ` +
      `${agent.role.padEnd(maxRoleLen)}  ` +
      `${originPadded} ${ghostProtocol}`
    );
  }
  
  console.log();
  
  // Legend
  if (personalCount > 0) {
    console.log(`${DIM}👤 = Personal agent (ambient, Ghost Protocol enforced in projects)${RESET}`);
    console.log();
  }
}
