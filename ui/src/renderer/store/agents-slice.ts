/**
 * Zustand slice for agent state management
 */

import { Agent } from '../../shared/models';

export interface AgentsSlice {
  agents: Record<string, Agent>;
  addAgent: (agent: Agent) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  removeAgent: (agentId: string) => void;
  appendOutput: (agentId: string, line: string) => void;
}

export const createAgentsSlice = (set: any): AgentsSlice => ({
  agents: {},

  addAgent: (agent: Agent) =>
    set((state: AgentsSlice) => ({
      agents: {
        ...state.agents,
        [agent.id]: agent,
      },
    })),

  updateAgent: (agentId: string, updates: Partial<Agent>) =>
    set((state: AgentsSlice) => ({
      agents: {
        ...state.agents,
        [agentId]: {
          ...state.agents[agentId],
          ...updates,
          updatedAt: Date.now(),
        },
      },
    })),

  removeAgent: (agentId: string) =>
    set((state: AgentsSlice) => {
      const { [agentId]: removed, ...rest } = state.agents;
      return { agents: rest };
    }),

  appendOutput: (agentId: string, line: string) =>
    set((state: AgentsSlice) => {
      const agent = state.agents[agentId];
      if (!agent) return state;

      const newOutput = [...agent.output, line];
      // Keep only last 50 lines
      const trimmedOutput = newOutput.slice(-50);

      return {
        agents: {
          ...state.agents,
          [agentId]: {
            ...agent,
            output: trimmedOutput,
            updatedAt: Date.now(),
          },
        },
      };
    }),
});
