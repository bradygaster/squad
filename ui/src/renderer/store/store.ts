/**
 * Zustand store setup
 * Combines agents and queue slices into a single store
 */

import { create } from 'zustand';
import { AgentsSlice, createAgentsSlice } from './agents-slice';
import { QueueSlice, createQueueSlice } from './queue-slice';
import { TerminalSlice, createTerminalSlice } from './terminal-slice';

export type StoreState = AgentsSlice & QueueSlice & TerminalSlice;

export const useStore = create<StoreState>()((set) => ({
  ...createAgentsSlice(set),
  ...createQueueSlice(set),
  ...createTerminalSlice(set),
}));
