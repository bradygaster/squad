/**
 * Zustand slice for terminal output state
 */

export interface TerminalLine {
  timestamp: number;
  text: string;
  agentName?: string;
}

export interface TerminalSlice {
  terminalLines: TerminalLine[];
  addTerminalLine: (line: TerminalLine) => void;
  clearTerminal: () => void;
}

export const createTerminalSlice = (set: any): TerminalSlice => ({
  terminalLines: [],

  addTerminalLine: (line: TerminalLine) =>
    set((state: TerminalSlice) => ({
      terminalLines: [...state.terminalLines, line].slice(-200),
    })),

  clearTerminal: () =>
    set(() => ({
      terminalLines: [],
    })),
});
