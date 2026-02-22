/**
 * Agent subscription hook
 * Manages agent state synchronization via IPC events
 */

import { useEffect } from 'react';
import { useStore } from '../store/store';
import { useIPC } from './useIPC';
import { IPC_CHANNELS } from '../../shared/ipc-types';
import { Agent } from '../../shared/models';

export const useAgents = () => {
  const { agents, addAgent, updateAgent, removeAgent, addTerminalLine } = useStore();
  const { invoke, on, isAvailable } = useIPC();

  useEffect(() => {
    if (!isAvailable) return;

    // Fetch initial agent roster
    const loadAgents = async () => {
      try {
        const agentList = await invoke<Agent[]>(IPC_CHANNELS.AGENT_LIST);
        if (agentList) {
          agentList.forEach((agent) => addAgent(agent));
        }
      } catch (error) {
        console.error('Failed to load agents:', error);
      }
    };

    loadAgents();

    // Subscribe to agent events
    const unsubscribeUpdated = on(IPC_CHANNELS.AGENT_UPDATED, (payload: any) => {
      updateAgent(payload.agent.id, payload.agent);
    });

    const unsubscribeAdded = on(IPC_CHANNELS.AGENT_ADDED, (payload: any) => {
      addAgent(payload.agent);
    });

    const unsubscribeRemoved = on(IPC_CHANNELS.AGENT_REMOVED, (payload: any) => {
      removeAgent(payload.agentId);
    });

    return () => {
      unsubscribeUpdated();
      unsubscribeAdded();
      unsubscribeRemoved();
    };
  }, [isAvailable]);

  return Object.values(agents);
};
