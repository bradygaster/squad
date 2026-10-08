/**
 * Separator — shared horizontal rule component.
 *
 * Consolidates all inline separator rendering (AgentPanel, MessageStream, App.tsx)
 * into a single reusable component. Uses box-drawing chars that degrade to ASCII.
 *
 * Maintained by the TUI engineering owner.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { detectTerminal, boxChars, getTerminalWidth } from '../terminal.js';

export interface SeparatorProps {
  /** Explicit character width. Defaults to min(terminalWidth, 80) - 2. */
  width?: number;
  marginTop?: number;
  marginBottom?: number;
}

export const Separator: React.FC<SeparatorProps> = ({ width, marginTop = 0, marginBottom = 0 }) => {
  const caps = detectTerminal();
  const box = boxChars(caps);
  const w = width ?? Math.min(getTerminalWidth(), 80) - 2;
  return (
    <Box marginTop={marginTop} marginBottom={marginBottom}>
      <Text dimColor>{box.h.repeat(Math.max(w, 0))}</Text>
    </Box>
  );
};
