import { platform } from 'node:os';
import { useState, useEffect } from 'react';

export interface TerminalCapabilities {
  supportsColor: boolean;
  supportsUnicode: boolean;
  columns: number;
  rows: number;
  platform: NodeJS.Platform;
  isWindows: boolean;
  isTTY: boolean;
  /** True when NO_COLOR=1, TERM=dumb, or color is otherwise suppressed. */
  noColor: boolean;
}

/** Current terminal width, clamped to a minimum of 40. */
export function getTerminalWidth(): number {
  return Math.max(process.stdout.columns || 80, 40);
}

/** React hook — returns live terminal width, updates on resize. */
export function useTerminalWidth(): number {
  const [width, setWidth] = useState(getTerminalWidth());

  useEffect(() => {
    const onResize = () => setWidth(getTerminalWidth());
    // Avoid MaxListenersExceededWarning in test environments with many renders
    const prev = process.stdout.getMaxListeners?.() ?? 10;
    if (prev <= 20) process.stdout.setMaxListeners?.(prev + 10);
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return width;
}

/**
 * Detect terminal capabilities for cross-platform compatibility.
 */
/**
 * Returns true when the environment requests no color output.
 * Respects the NO_COLOR standard (https://no-color.org/) and TERM=dumb.
 */
export function isNoColor(): boolean {
  return (
    process.env['NO_COLOR'] != null && process.env['NO_COLOR'] !== '' ||
    process.env['TERM'] === 'dumb'
  );
}

export function detectTerminal(): TerminalCapabilities {
  const plat = platform();
  const isTTY = Boolean(process.stdout.isTTY);
  const noColor = isNoColor();

  return {
    supportsColor: !noColor && isTTY && (process.env['FORCE_COLOR'] !== '0'),
    supportsUnicode: plat !== 'win32' || Boolean(process.env['WT_SESSION']),
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    platform: plat,
    isWindows: plat === 'win32',
    isTTY,
    noColor,
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
