/**
 * IPC channel definitions and typed payloads
 * Defines the contract between main and renderer processes
 */

import { Agent, Command, QueueItem } from './models';

// Channel name constants
export const IPC_CHANNELS = {
  // Main → Renderer (Events)
  AGENT_UPDATED: 'agent:updated',
  AGENT_ADDED: 'agent:added',
  AGENT_REMOVED: 'agent:removed',
  COMMAND_STARTED: 'command:started',
  COMMAND_COMPLETED: 'command:completed',
  QUEUE_UPDATED: 'queue:updated',
  CLI_OUTPUT: 'cli:output',
  CLI_STATUS_CHANGED: 'cli:status-changed',

  // Renderer → Main (Invocations)
  AGENT_LIST: 'agent:list',
  AGENT_ADD: 'agent:add',
  AGENT_REMOVE: 'agent:remove',
  COMMAND_SEND: 'command:send',
  QUEUE_LIST: 'queue:list',
  QUEUE_REORDER: 'queue:reorder',
  QUEUE_CANCEL: 'queue:cancel',
  CLI_STATUS: 'cli:status',
} as const;

// Main → Renderer event payloads
export interface AgentUpdatedPayload {
  agent: Agent;
}

export interface AgentAddedPayload {
  agent: Agent;
}

export interface AgentRemovedPayload {
  agentId: string;
}

export interface CommandStartedPayload {
  commandId: string;
  agentId: string;
}

export interface CommandCompletedPayload {
  commandId: string;
  result: string;
}

export interface QueueUpdatedPayload {
  queue: QueueItem[];
}

export interface CliOutputPayload {
  line: string;
  timestamp: number;
}

export interface CliStatusPayload {
  connected: boolean;
  error?: string;
}

// Renderer → Main invocation arguments and return types
export interface AgentAddArgs {
  name: string;
  role: string;
  emoji: string;
}

export interface AgentRemoveArgs {
  agentId: string;
}

export interface CommandSendArgs {
  command: string;
  targetAgentId?: string;
}

export interface CommandSendResult {
  commandId: string;
}

export interface QueueReorderArgs {
  commandId: string;
  newPosition: number;
}

export interface QueueCancelArgs {
  commandId: string;
}

// ElectronAPI interface exposed by preload script
export interface ElectronAPI {
  // Event listeners (main → renderer)
  on(
    channel: typeof IPC_CHANNELS.AGENT_UPDATED,
    callback: (payload: AgentUpdatedPayload) => void
  ): () => void;
  on(
    channel: typeof IPC_CHANNELS.AGENT_ADDED,
    callback: (payload: AgentAddedPayload) => void
  ): () => void;
  on(
    channel: typeof IPC_CHANNELS.AGENT_REMOVED,
    callback: (payload: AgentRemovedPayload) => void
  ): () => void;
  on(
    channel: typeof IPC_CHANNELS.COMMAND_STARTED,
    callback: (payload: CommandStartedPayload) => void
  ): () => void;
  on(
    channel: typeof IPC_CHANNELS.COMMAND_COMPLETED,
    callback: (payload: CommandCompletedPayload) => void
  ): () => void;
  on(
    channel: typeof IPC_CHANNELS.QUEUE_UPDATED,
    callback: (payload: QueueUpdatedPayload) => void
  ): () => void;
  on(
    channel: typeof IPC_CHANNELS.CLI_OUTPUT,
    callback: (payload: CliOutputPayload) => void
  ): () => void;
  on(
    channel: typeof IPC_CHANNELS.CLI_STATUS_CHANGED,
    callback: (payload: CliStatusPayload) => void
  ): () => void;

  // IPC invocations (renderer → main)
  invoke(channel: typeof IPC_CHANNELS.AGENT_LIST): Promise<Agent[]>;
  invoke(
    channel: typeof IPC_CHANNELS.AGENT_ADD,
    args: AgentAddArgs
  ): Promise<Agent>;
  invoke(
    channel: typeof IPC_CHANNELS.AGENT_REMOVE,
    args: AgentRemoveArgs
  ): Promise<void>;
  invoke(
    channel: typeof IPC_CHANNELS.COMMAND_SEND,
    args: CommandSendArgs
  ): Promise<CommandSendResult>;
  invoke(channel: typeof IPC_CHANNELS.QUEUE_LIST): Promise<QueueItem[]>;
  invoke(
    channel: typeof IPC_CHANNELS.QUEUE_REORDER,
    args: QueueReorderArgs
  ): Promise<void>;
  invoke(
    channel: typeof IPC_CHANNELS.QUEUE_CANCEL,
    args: QueueCancelArgs
  ): Promise<void>;
  invoke(channel: typeof IPC_CHANNELS.CLI_STATUS): Promise<CliStatusPayload>;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
