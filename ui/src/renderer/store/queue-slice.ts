/**
 * Zustand slice for command queue state management
 */

import { QueueItem } from '../../shared/models';

export interface QueueSlice {
  queue: QueueItem[];
  cliConnected: boolean;
  cliError: string | undefined;
  setQueue: (queue: QueueItem[]) => void;
  setCliStatus: (connected: boolean, error?: string) => void;
  updateQueueItem: (commandId: string, updates: Partial<QueueItem>) => void;
  removeQueueItem: (commandId: string) => void;
}

export const createQueueSlice = (set: any): QueueSlice => ({
  queue: [],
  cliConnected: false,
  cliError: undefined,

  setQueue: (queue: QueueItem[]) =>
    set(() => ({
      queue,
    })),

  setCliStatus: (connected: boolean, error?: string) =>
    set(() => ({
      cliConnected: connected,
      cliError: error,
    })),

  updateQueueItem: (commandId: string, updates: Partial<QueueItem>) =>
    set((state: QueueSlice) => ({
      queue: state.queue.map((item) =>
        item.id === commandId ? { ...item, ...updates } : item
      ),
    })),

  removeQueueItem: (commandId: string) =>
    set((state: QueueSlice) => ({
      queue: state.queue.filter((item) => item.id !== commandId),
    })),
});
