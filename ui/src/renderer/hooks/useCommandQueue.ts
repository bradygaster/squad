/**
 * Command queue hook
 * Manages queue state synchronization via IPC events
 */

import { useEffect } from 'react';
import { useStore } from '../store/store';
import { useIPC } from './useIPC';
import { IPC_CHANNELS } from '../../shared/ipc-types';
import {
  QueueItem,
  CommandSendArgs,
  QueueReorderArgs,
  QueueCancelArgs,
} from '../../shared/ipc-types';

export const useCommandQueue = () => {
  const { queue, cliConnected, cliError, setQueue, setCliStatus, updateQueueItem, removeQueueItem } = useStore();
  const { invoke, on, isAvailable } = useIPC();

  useEffect(() => {
    if (!isAvailable) return;

    // Fetch initial queue
    const loadQueue = async () => {
      try {
        const queueList = await invoke<QueueItem[]>(IPC_CHANNELS.QUEUE_LIST);
        if (queueList) {
          setQueue(queueList);
        }
      } catch (error) {
        console.error('Failed to load queue:', error);
      }
    };

    // Fetch initial CLI status
    const loadCliStatus = async () => {
      try {
        const status = await invoke<{ connected: boolean; error?: string }>(
          IPC_CHANNELS.CLI_STATUS
        );
        if (status) {
          setCliStatus(status.connected, status.error);
        }
      } catch (error) {
        console.error('Failed to load CLI status:', error);
      }
    };

    loadQueue();
    loadCliStatus();

    // Subscribe to queue events
    const unsubscribeQueueUpdated = on(
      IPC_CHANNELS.QUEUE_UPDATED,
      (payload: any) => {
        setQueue(payload.queue);
      }
    );

    const unsubscribeCommandStarted = on(
      IPC_CHANNELS.COMMAND_STARTED,
      (payload: any) => {
        updateQueueItem(payload.commandId, {
          status: 'running' as any,
          assignedAgentId: payload.agentId,
          startedAt: Date.now(),
        });
      }
    );

    const unsubscribeCommandCompleted = on(
      IPC_CHANNELS.COMMAND_COMPLETED,
      (payload: any) => {
        updateQueueItem(payload.commandId, {
          status: 'done' as any,
          completedAt: Date.now(),
          result: payload.result,
        });
      }
    );

    const unsubscribeCliStatus = on(
      IPC_CHANNELS.CLI_STATUS_CHANGED,
      (payload: any) => {
        setCliStatus(payload.connected, payload.error);
      }
    );

    // Cleanup subscriptions on unmount
    return () => {
      unsubscribeQueueUpdated();
      unsubscribeCommandStarted();
      unsubscribeCommandCompleted();
      unsubscribeCliStatus();
    };
  }, [isAvailable]);

  const sendCommand = async (text: string, targetAgentId?: string) => {
    if (!isAvailable) {
      console.warn('IPC not available, cannot send command');
      return;
    }

    try {
      const args: CommandSendArgs = {
        command: text,
        targetAgentId,
      };
      await invoke(IPC_CHANNELS.COMMAND_SEND, args);
    } catch (error) {
      console.error('Failed to send command:', error);
    }
  };

  const reorderCommand = async (commandId: string, newPosition: number) => {
    if (!isAvailable) {
      console.warn('IPC not available, cannot reorder command');
      return;
    }

    try {
      const args: QueueReorderArgs = {
        commandId,
        newPosition,
      };
      await invoke(IPC_CHANNELS.QUEUE_REORDER, args);
    } catch (error) {
      console.error('Failed to reorder command:', error);
    }
  };

  const cancelCommand = async (commandId: string) => {
    if (!isAvailable) {
      console.warn('IPC not available, cannot cancel command');
      return;
    }

    try {
      const args: QueueCancelArgs = {
        commandId,
      };
      await invoke(IPC_CHANNELS.QUEUE_CANCEL, args);
    } catch (error) {
      console.error('Failed to cancel command:', error);
    }
  };

  return {
    queue,
    sendCommand,
    reorderCommand,
    cancelCommand,
    isConnected: isAvailable,
    cliConnected,
    cliError,
  };
};
