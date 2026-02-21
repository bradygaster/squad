import { platform } from 'node:os';

export interface TerminalCapabilities {
  supportsColor: boolean;
  supportsUnicode: boolean;
  columns: number;
  rows: number;
  platform: NodeJS.Platform;
  isWindows: boolean;
  isTTY: boolean;
}

/**
 * Detect terminal capabilities for cross-platform compatibility.
 */
export function detectTerminal(): TerminalCapabilities {
  const plat = platform();
  const isTTY = Boolean(process.stdout.isTTY);

  return {
    supportsColor: isTTY && (process.env['FORCE_COLOR'] !== '0'),
    supportsUnicode: plat !== 'win32' || Boolean(process.env['WT_SESSION']), // Windows Terminal supports unicode
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    platform: plat,
    isWindows: plat === 'win32',
    isTTY,
  };
}

/**
 * Get a safe character for the platform.
 * Falls back to ASCII on terminals that don't support unicode.
 */
export function safeChar(unicode: string, ascii: string, caps: TerminalCapabilities): string {
  return caps.supportsUnicode ? unicode : ascii;
}

/**
 * Box-drawing characters that degrade gracefully.
 */
export function boxChars(caps: TerminalCapabilities) {
  if (caps.supportsUnicode) {
    return { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };
  }
  return { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' };
}
