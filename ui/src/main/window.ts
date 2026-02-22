import { app, BrowserWindow } from 'electron';
import * as path from 'path';

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    center: true,
    show: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173').catch((err) => {
      console.error('Failed to load dev URL:', err);
      // Fallback: show error in window
      win.loadURL(`data:text/html,<h1 style="color:white;background:#1a1a2e;padding:40px;font-family:sans-serif">Failed to load dev server<br><small>${err.message}</small></h1>`);
    });
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`Window failed to load: ${errorCode} ${errorDescription}`);
  });

  return win;
}
