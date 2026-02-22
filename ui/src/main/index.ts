import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { createWindow } from './window';
import { CopilotProcess } from './cli/copilot-process';
import { StreamParser } from './cli/stream-parser';
import { Protocol } from './cli/protocol';
import { IPCHandlers } from './ipc/handlers';

let mainWindow: BrowserWindow | null = null;
let copilotProcess: CopilotProcess | null = null;
let streamParser: StreamParser | null = null;
let protocol: Protocol | null = null;
let ipcHandlers: IPCHandlers | null = null;

app.whenReady().then(() => {
  mainWindow = createWindow();

  // Initialize CLI integration layer
  copilotProcess = new CopilotProcess({
    autoRestart: true,
    restartDelay: 2000,
    maxRestartAttempts: 1,
  });

  streamParser = new StreamParser(new Map());
  protocol = new Protocol(copilotProcess);
  ipcHandlers = new IPCHandlers(protocol, streamParser);

  // Set up IPC handlers
  ipcHandlers.setMainWindow(mainWindow);
  ipcHandlers.registerHandlers();
  ipcHandlers.initializeSampleAgents();

  // Connect CopilotProcess output to StreamParser
  copilotProcess.on('line', (line: string) => {
    const event = streamParser!.parseLine(line);
    ipcHandlers!.handleParsedEvent(event);
  });

  copilotProcess.on('started', () => {
    console.log('CopilotProcess: CLI connected');
    ipcHandlers!.setCliConnected(true);
  });

  // Required: suppress unhandled 'error' events (Node crashes without this)
  copilotProcess.on('error', () => {});

  copilotProcess.on('exit', (_code: number | null, _signal: string | null) => {
    ipcHandlers!.setCliConnected(false);
  });

  // When CLI is unavailable, app runs in standalone mode (local command processor)
  copilotProcess.on('max-retries', () => {
    console.log('CopilotProcess: CLI not found, running in standalone mode');
  });

  // Try to connect to CLI (silently falls back to standalone)
  setTimeout(() => {
    copilotProcess!.start();
  }, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      if (ipcHandlers) {
        ipcHandlers.setMainWindow(mainWindow);
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Clean up CLI process on app quit
  if (copilotProcess) {
    await copilotProcess.stop();
  }
});
