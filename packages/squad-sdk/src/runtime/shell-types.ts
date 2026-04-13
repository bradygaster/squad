/**
 * Shell-specific type definitions for the Squad interactive shell.
 * Pure interfaces with zero dependencies.
 */

export interface ShellState {
  status: 'initializing' | 'ready' | 'processing' | 'error';
  activeAgents: Map<string, AgentSession>;
  messageHistory: ShellMessage[];
}

export interface ShellMessage {
  role: 'user' | 'agent' | 'system';
  agentName?: string;
  content: string;
  timestamp: Date;
}

export interface AgentSession {
  name: string;
  role: string;
  status: 'idle' | 'working' | 'streaming' | 'error';
  startedAt: Date;
  activityHint?: string;
  model?: string;
}
