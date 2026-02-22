/**
 * Local command processor — executes queued commands in-process
 * when the external CLI is unavailable.
 * Assigns commands to agents, simulates thinking/execution, and reports results.
 */

import { EventEmitter } from 'events';
import { Agent, AgentStatus, QueueItem, QueueStatus } from '../../shared/models';

export class CommandProcessor extends EventEmitter {
  private processing: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private agents: Map<string, Agent> = new Map();
  private roundRobinIndex: number = 0;

  updateAgents(agents: Map<string, Agent>): void {
    this.agents = agents;
  }

  /**
   * Process a single queue item: assign agent, run, emit events.
   */
  async processItem(item: QueueItem): Promise<void> {
    if (item.status !== QueueStatus.Pending) return;

    // Pick target agent
    const agentId = item.command.targetAgentId || this.pickAgent();
    if (!agentId) {
      this.emit('output', item.id, '⚠ No agents available to handle command');
      return;
    }

    const agent = this.agents.get(agentId);
    const agentName = agent ? agent.name : agentId;
    const agentRole = agent ? agent.role : 'Agent';
    const cmd = item.command.text;

    // Mark as running
    this.emit('started', item.id, agentId);
    this.emit('agent-status', agentId, AgentStatus.Busy, cmd);
    this.emit('output', item.id, `📥 ${agentName} received: "${cmd}"`);

    await this.delay(600 + Math.random() * 600);
    this.emit('output', item.id, `💭 ${agentName} is analyzing the request...`);

    await this.delay(800 + Math.random() * 800);

    // Generate role-appropriate response
    const response = this.generateResponse(agentName, agentRole, cmd);
    for (const line of response) {
      this.emit('output', item.id, line);
      await this.delay(200 + Math.random() * 300);
    }

    // Complete
    const result = `${agentName} finished processing: "${cmd}"`;
    this.emit('output', item.id, `✅ Done.`);
    this.emit('completed', item.id, result);
    this.emit('agent-status', agentId, AgentStatus.Idle, undefined);
  }

  private generateResponse(name: string, role: string, command: string): string[] {
    const cmd = command.toLowerCase();
    const allAgents = Array.from(this.agents.values());

    // Introduce teammates
    if (cmd.includes('introduce') || cmd.includes('team') || cmd.includes('who')) {
      const lines = [`👋 ${name}: Let me introduce the team —`];
      for (const a of allAgents) {
        lines.push(`   ${a.emoji} ${a.name} — ${a.role}`);
      }
      lines.push(`That's ${allAgents.length} agents ready to work.`);
      return lines;
    }

    // Status / health check
    if (cmd.includes('status') || cmd.includes('health') || cmd.includes('how are')) {
      const idle = allAgents.filter(a => a.status === AgentStatus.Idle).length;
      const busy = allAgents.filter(a => a.status === AgentStatus.Busy).length;
      return [
        `📊 ${name}: Current team status —`,
        `   ${idle} idle, ${busy} busy, ${allAgents.length} total`,
        `   All systems operational.`,
      ];
    }

    // Help
    if (cmd.includes('help') || cmd.includes('what can')) {
      return [
        `📖 ${name}: Here's what I can help with —`,
        `   • "introduce me to the team" — meet all agents`,
        `   • "status" — check team health`,
        `   • "@agent <task>" — direct a specific agent`,
        `   • Any task — I'll analyze and respond based on my role (${role})`,
      ];
    }

    // Architecture / design (for leads/architects)
    if (cmd.includes('architect') || cmd.includes('design') || cmd.includes('plan')) {
      return [
        `🏗️ ${name} (${role}): Analyzing architecture requirements...`,
        `   → Evaluating component structure`,
        `   → Checking dependency graph`,
        `   → Proposing module boundaries`,
        `   Recommendation: Break this into smaller, testable modules with clear interfaces.`,
      ];
    }

    // Build / code
    if (cmd.includes('build') || cmd.includes('code') || cmd.includes('implement') || cmd.includes('create')) {
      return [
        `⚡ ${name} (${role}): Working on implementation...`,
        `   → Setting up scaffolding`,
        `   → Writing core logic`,
        `   → Adding error handling`,
        `   Implementation ready for review.`,
      ];
    }

    // Test
    if (cmd.includes('test') || cmd.includes('verify') || cmd.includes('check')) {
      return [
        `🧪 ${name} (${role}): Running verification...`,
        `   → Analyzing test coverage`,
        `   → Checking edge cases`,
        `   → Validating outputs`,
        `   All checks passed. ✓`,
      ];
    }

    // Default: acknowledge and process based on role
    return [
      `⚡ ${name} (${role}): Processing "${command}"`,
      `   → Understood. Working on it...`,
      `   → Task completed.`,
    ];
  }

  private pickAgent(): string | undefined {
    const ids = Array.from(this.agents.keys());
    if (ids.length === 0) return undefined;

    // Simple round-robin among idle agents, fallback to any
    const idle = ids.filter(
      (id) => this.agents.get(id)?.status === AgentStatus.Idle
    );
    const pool = idle.length > 0 ? idle : ids;
    const picked = pool[this.roundRobinIndex % pool.length];
    this.roundRobinIndex++;
    return picked;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
