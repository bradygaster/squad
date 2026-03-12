/**
 * ThinkingIndicator — clean feedback during agent operations.
 *
 * Shows spinner + activity context + elapsed time.
 * Default label: "Routing to agent..." (covers SDK connection, initial routing).
 * Activity hints from SDK events or @Agent mentions override the default.
 *
 * Owned by Cheritto (TUI Engineer). Design approved by Marquez.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { isNoColor } from '../terminal.js';

export type ThinkingPhase = 'connecting' | 'routing' | 'thinking';

export interface ThinkingIndicatorProps {
  isThinking: boolean;
  elapsedMs: number;
  activityHint?: string;
  phase?: ThinkingPhase;
  /** When true, cycles conversation-aware phrases instead of generic ones. */
  hasConversation?: boolean;
}

/** Rotating thinking phrases — cycled every few seconds to keep the UI alive. */
export const THINKING_PHRASES = [
  'Routing to agent',
  'Analyzing your request',
  'Reviewing project context',
  'Consulting the team',
  'Evaluating options',
  'Gathering context',
  'Synthesizing a response',
  'Reading the codebase',
  'Considering approaches',
  'Mapping dependencies',
  'Checking project structure',
  'Weighing trade-offs',
  'Crafting a plan',
  'Connecting the dots',
  'Exploring possibilities',
];

/** Context-aware phrases shown when conversation history exists. */
export const CONVERSATION_PHRASES = [
  'Reviewing conversation context',
  'Connecting to previous work',
  'Analyzing how this relates',
  'Checking conversation thread',
  'Considering prior context',
  'Building on earlier discussion',
  'Mapping to your session',
  'Evaluating options',
  'Consulting the team',
  'Synthesizing a response',
  'Weighing trade-offs',
  'Gathering context',
  'Crafting a plan',
  'Connecting the dots',
  'Reading the codebase',
];

/** Map phase to its default label. */
function phaseLabel(phase: ThinkingPhase): string {
  switch (phase) {
    case 'connecting': return 'Connecting to GitHub Copilot...';
    case 'routing': return 'Routing to agent...';
    case 'thinking': return 'Thinking...';
  }
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Color cycles through as time passes — feels alive. */
function indicatorColor(elapsedSec: number): string {
  if (elapsedSec < 5) return 'cyan';
  if (elapsedSec < 15) return 'yellow';
  return 'magenta';
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 1) return '';
  return `${sec}s`;
}

/** Static dots for NO_COLOR mode (no animation). */
const STATIC_SPINNER = '...';

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  isThinking,
  elapsedMs,
  activityHint,
  phase = 'routing',
  hasConversation = false,
}) => {
  const noColor = isNoColor();
  const [frame, setFrame] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);

  // Spinner animation — 120ms per frame to reduce re-renders (#206)
  useEffect(() => {
    if (!isThinking || noColor) return;
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 120);
    return () => clearInterval(timer);
  }, [isThinking, noColor]);

  const phrases = hasConversation ? CONVERSATION_PHRASES : THINKING_PHRASES;

  // Rotate thinking phrases every 3 seconds
  useEffect(() => {
    if (!isThinking) { setPhraseIndex(0); return; }
    const timer = setInterval(() => {
      setPhraseIndex(i => (i + 1) % phrases.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [isThinking, phrases]);

  // Reset frame when thinking starts
  useEffect(() => {
    if (isThinking) { setFrame(0); setPhraseIndex(0); }
  }, [isThinking]);

  if (!isThinking) return null;

  const elapsedSec = Math.floor(elapsedMs / 1000);
  const elapsedStr = formatElapsed(elapsedMs);
  const spinnerChar = noColor ? STATIC_SPINNER : (SPINNER_FRAMES[frame] ?? '⠋');

  // Resolve the display label: activity hint > rotating phrase > phase label
  const displayLabel = activityHint ?? (
    phase === 'connecting' ? phaseLabel(phase) : `${phrases[phraseIndex]}...`
  );

  // NO_COLOR: no color props, use text labels
  if (noColor) {
    return (
      <Box gap={1}>
        <Text>{spinnerChar}</Text>
        <Text>{displayLabel}</Text>
        {elapsedStr ? <Text>({elapsedStr})</Text> : null}
      </Box>
    );
  }

  const color = indicatorColor(elapsedSec);

  return (
    <Box gap={1}>
      <Text color={color}>{spinnerChar}</Text>
      <Text color={color} italic>{displayLabel}</Text>
      {elapsedStr ? <Text dimColor>({elapsedStr})</Text> : null}
    </Box>
  );
};
