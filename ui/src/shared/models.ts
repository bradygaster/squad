/**
 * Shared data models for Squad Desktop UI
 * Used across main, renderer, and preload processes
 */

export interface Agent {
  id: string;              // e.g., "cobb"
  name: string;            // e.g., "Cobb"
  role: string;            // e.g., "Lead / Architect"
  emoji: string;           // e.g., "🏗️"
  status: AgentStatus;
  currentTask?: string;
  output: string[];        // last 50 lines of stdout
  createdAt: number;
  updatedAt: number;
}

export enum AgentStatus {
  Idle = 'idle',
  Busy = 'busy',
  Blocked = 'blocked',
  Offline = 'offline',
}

export interface Command {
  id: string;
  text: string;
  targetAgentId?: string;  // undefined = broadcast to all
  createdAt: number;
}

export interface QueueItem {
  id: string;
  command: Command;
  status: QueueStatus;
  assignedAgentId?: string;
  startedAt?: number;
  completedAt?: number;
  result?: string;
}

export enum QueueStatus {
  Pending = 'pending',
  Running = 'running',
  Done = 'done',
  Cancelled = 'cancelled',
}
