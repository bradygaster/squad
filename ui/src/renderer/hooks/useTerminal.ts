/**
 * Terminal subscription hook — called once in App to avoid duplicates
 */

import { useEffect } from 'react';
import { useStore } from '../store/store';
import { useIPC } from './useIPC';
import { IPC_CHANNELS } from '../../shared/ipc-types';

export const useTerminal = () => {
  const { addTerminalLine } = useStore();
  const { on, isAvailable } = useIPC();

  useEffect(() => {
    if (!isAvailable) return;

    const unsubscribe = on(IPC_CHANNELS.CLI_OUTPUT, (payload: any) => {
      addTerminalLine({
        timestamp: payload.timestamp,
        text: payload.line,
      });
    });

    return () => {
      unsubscribe();
    };
  }, [isAvailable]);
};
