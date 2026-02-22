import { Agent, AgentStatus } from '../../shared/models';

export type ParsedEvent = AgentEvent | CommandEvent | RawOutput;

export interface AgentEvent {
  type: 'agent';
  agentId: string;
  agentName?: string;
  status?: AgentStatus;
  task?: string;
  output?: string;
}

export interface CommandEvent {
  type: 'command';
  commandId?: string;
  event: 'started' | 'completed' | 'failed';
  agentId?: string;
  result?: string;
}

export interface RawOutput {
  type: 'raw';
  text: string;
  agentId?: string;
}

export class StreamParser {
  private currentAgent: string | null = null;
  private agentNames: Map<string, string> = new Map(); // id -> name mapping

  constructor(private agents: Map<string, Agent>) {
    // Initialize agent name mapping
    for (const [id, agent] of agents.entries()) {
      this.agentNames.set(id, agent.name.toLowerCase());
      this.agentNames.set(agent.name.toLowerCase(), id);
    }
  }

  updateAgents(agents: Map<string, Agent>): void {
    this.agents = agents;
    this.agentNames.clear();
    for (const [id, agent] of agents.entries()) {
      this.agentNames.set(id, agent.name.toLowerCase());
      this.agentNames.set(agent.name.toLowerCase(), id);
    }
  }

  parseLine(line: string): ParsedEvent {
    // Check for agent activity patterns
    const agentEvent = this.parseAgentActivity(line);
    if (agentEvent) {
      return agentEvent;
    }

    // Check for command execution markers
    const commandEvent = this.parseCommandEvent(line);
    if (commandEvent) {
      return commandEvent;
    }

    // Default: treat as raw output from current agent
    return {
      type: 'raw',
      text: line,
      agentId: this.currentAgent || undefined,
    };
  }

  private parseAgentActivity(line: string): AgentEvent | null {
    const lowerLine = line.toLowerCase();

    // Detect agent name mentions
    for (const [key, value] of this.agentNames.entries()) {
      const isId = !key.includes(' ');
      const searchTerm = isId ? key : value;
      
      if (lowerLine.includes(searchTerm)) {
        const agentId = isId ? key : value;
        const agentName = isId ? value : key;
        
        // Update current agent context
        this.currentAgent = agentId;

        // Try to extract task description (common patterns)
        const taskMatch = line.match(/(?:working on|task:|doing|executing)\s+(.+?)(?:\.|$)/i);
        const task = taskMatch ? taskMatch[1].trim() : undefined;

        // Detect status indicators
        const status = this.detectStatus(line);

        return {
          type: 'agent',
          agentId,
          agentName,
          status,
          task,
          output: line,
        };
      }
    }

    return null;
  }

  private parseCommandEvent(line: string): CommandEvent | null {
    // Detect command start patterns
    if (line.includes('✅') || /\bstarted\b|\bbegin\b|\bstarting\b/i.test(line)) {
      const commandIdMatch = line.match(/(?:cmd|command)[-_]?(\w+)/i);
      return {
        type: 'command',
        commandId: commandIdMatch ? commandIdMatch[0] : undefined,
        event: 'started',
        agentId: this.currentAgent || undefined,
      };
    }

    // Detect command completion patterns
    if (line.includes('✅') || /\bcompleted?\b|\bdone\b|\bfinished\b|\bsuccess/i.test(line)) {
      const commandIdMatch = line.match(/(?:cmd|command)[-_]?(\w+)/i);
      return {
        type: 'command',
        commandId: commandIdMatch ? commandIdMatch[0] : undefined,
        event: 'completed',
        agentId: this.currentAgent || undefined,
        result: line,
      };
    }

    // Detect command failure patterns
    if (line.includes('❌') || line.includes('⚠️') || /\bfailed?\b|\berror\b|\bfail/i.test(line)) {
      const commandIdMatch = line.match(/(?:cmd|command)[-_]?(\w+)/i);
      return {
        type: 'command',
        commandId: commandIdMatch ? commandIdMatch[0] : undefined,
        event: 'failed',
        agentId: this.currentAgent || undefined,
        result: line,
      };
    }

    return null;
  }

  private detectStatus(line: string): AgentStatus | undefined {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.includes('busy') || lowerLine.includes('working')) {
      return AgentStatus.Busy;
    }
    if (lowerLine.includes('idle') || lowerLine.includes('waiting')) {
      return AgentStatus.Idle;
    }
    if (lowerLine.includes('blocked') || lowerLine.includes('stuck')) {
      return AgentStatus.Blocked;
    }
    if (lowerLine.includes('offline') || lowerLine.includes('stopped')) {
      return AgentStatus.Offline;
    }

    return undefined;
  }

  getCurrentAgent(): string | null {
    return this.currentAgent;
  }
}
