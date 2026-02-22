/**
 * Generic IPC wrapper hook
 * Provides typed helpers for Electron IPC communication
 */

import { ElectronAPI } from '../../shared/ipc-types';

export const useIPC = () => {
  const electronAPI: ElectronAPI | undefined =
    typeof window !== 'undefined' ? window.electronAPI : undefined;

  const invoke = async <T = any>(channel: string, args?: any): Promise<T> => {
    if (!electronAPI) {
      console.warn(`IPC not available: ${channel}`);
      return Promise.resolve(null as T);
    }
    // Cast to bypass TypeScript's strict overload checking
    return (electronAPI.invoke as any)(channel, args);
  };

  const on = (channel: string, callback: (payload: any) => void): (() => void) => {
    if (!electronAPI) {
      console.warn(`IPC not available: ${channel}`);
      return () => {};
    }
    // Cast to bypass TypeScript's strict overload checking
    return (electronAPI.on as any)(channel, callback);
  };

  const isAvailable = !!electronAPI;

  return {
    invoke,
    on,
    isAvailable,
  };
};
