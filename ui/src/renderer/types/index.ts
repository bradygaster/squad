/**
 * Renderer type re-exports
 * Convenience file for importing shared types in renderer components
 */

export type {
  Agent,
  Command,
  QueueItem,
  ElectronAPI,
  AgentAddArgs,
  AgentRemoveArgs,
  CommandSendArgs,
  CommandSendResult,
  QueueReorderArgs,
  QueueCancelArgs,
  AgentUpdatedPayload,
  AgentAddedPayload,
  AgentRemovedPayload,
  CommandStartedPayload,
  CommandCompletedPayload,
  QueueUpdatedPayload,
  CliOutputPayload,
} from '../../shared/ipc-types';

export { AgentStatus, QueueStatus } from '../../shared/models';
export { IPC_CHANNELS } from '../../shared/ipc-types';
