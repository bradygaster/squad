import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI } from '../shared/ipc-types';

// Expose IPC API to renderer process via contextBridge
const electronAPI: ElectronAPI = {
  // Listener methods (main -> renderer)
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  // Invoke methods (renderer -> main)
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
