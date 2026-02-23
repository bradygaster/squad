import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { getRoleEmoji } from '../lifecycle.js';
import { isNoColor, useTerminalWidth } from '../terminal.js';
import type { AgentSession } from '../types.js';

interface AgentPanelProps {
  agents: AgentSession[];
  streamingContent?: { agentName: string; content: string } | null;
}

const PULSE_FRAMES = ['●', '◉', '○', '◉'];

/** Pulsing dot for active agents — draws the eye. Static in NO_COLOR mode. */
const PulsingDot: React.FC = () => {
  const noColor = isNoColor();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (noColor) return;
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % PULSE_FRAMES.length);
    }, 300);
    return () => clearInterval(timer);
  }, [noColor]);

  if (noColor) return <Text>●</Text>;
  return <Text color="green">{PULSE_FRAMES[frame]}</Text>;
};

/** Elapsed seconds since agent started working. */
function agentElapsedSec(agent: AgentSession): number {
  const active = agent.status === 'streaming' || agent.status === 'working';
  if (!active) return 0;
  return Math.floor((Date.now() - agent.startedAt.getTime()) / 1000);
}

/** Format elapsed time for display. */
function formatElapsed(seconds: number): string {
  if (seconds < 1) return '';
  return `${seconds}s`;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents, streamingContent }) => {
  const noColor = isNoColor();
  const width = useTerminalWidth();
  const compact = width <= 60;

  if (agents.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text dimColor>No agents active. Send a message to start. /help for commands.</Text>
      </Box>
    );
  }

  // Tick every second to update elapsed times
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasActive = agents.some(a => a.status === 'working' || a.status === 'streaming');
    if (!hasActive) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [agents]);

  const activeAgents = agents.filter(a => a.status === 'streaming' || a.status === 'working');
  const sepWidth = Math.min(width, 120) - 2;

  // Compact layout (≤60 cols): single-line per agent, no detail
  if (compact) {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {agents.map((agent) => {
          const active = agent.status === 'streaming' || agent.status === 'working';
          const errored = agent.status === 'error';
          const statusLabel = active ? (agent.status === 'streaming' ? 'streaming' : 'working') : errored ? 'error' : '';
          return (
            <Box key={agent.name} gap={0}>
              <Text
                dimColor={!active && !errored}
                bold={active}
                color={noColor ? undefined : active ? 'green' : errored ? 'red' : undefined}
              >
                {getRoleEmoji(agent.role)} {agent.name}
              </Text>
              {active && <><Text> </Text><PulsingDot /><Text> {statusLabel}</Text></>}
              {errored && <Text color={noColor ? undefined : 'red'}> ✖</Text>}
            </Box>
          );
        })}
        <Box marginTop={0}>
          <Text dimColor>{'┄'.repeat(sepWidth)}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      {/* Agent roster */}
      <Box flexWrap="wrap" gap={1}>
        {agents.map((agent) => {
          const active = agent.status === 'streaming' || agent.status === 'working';
          const errored = agent.status === 'error';
          return (
            <Box key={agent.name} gap={0}>
              <Text
                dimColor={!active && !errored}
                bold={active}
                color={noColor ? undefined : active ? 'green' : errored ? 'red' : undefined}
              >
                {getRoleEmoji(agent.role)} {agent.name}
              </Text>
              {active && (
                <Box marginLeft={0}>
                  <Text> </Text>
                  <PulsingDot />
                  {noColor
                    ? <Text bold> [Active]</Text>
                    : <Text color="green" bold> ▶ Active</Text>}
                </Box>
              )}
              {errored && (
                noColor
                  ? <Text bold> [Error] ✖</Text>
                  : <Text color="red"> ✖</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Status line — rich progress for active agents */}
      {activeAgents.length > 0 ? (
        <Box flexDirection="column">
          {activeAgents.map(a => {
            const sec = agentElapsedSec(a);
            const elapsed = formatElapsed(sec);
            const statusLabel = a.status === 'streaming' ? 'streaming' : 'working';
            const hint = a.activityHint;
            // At ≥100 cols show full hint; otherwise truncate to fit
            const maxHintLen = width >= 100 ? Infinity : width - 30;
            const displayHint = hint && hint.length > maxHintLen ? hint.slice(0, maxHintLen - 1) + '…' : hint;
            return (
              <Text key={a.name} color={noColor ? undefined : 'yellow'}>
                {'  '}{getRoleEmoji(a.role)} {a.name} ({statusLabel}{elapsed ? `, ${elapsed}` : ''}){displayHint ? ` — ${displayHint}` : ''}
              </Text>
            );
          })}
        </Box>
      ) : (
        <Text dimColor>{'  '}{agents.length} agent{agents.length !== 1 ? 's' : ''} ready</Text>
      )}

      {/* Separator between panel and message stream */}
      <Box marginTop={0}>
        <Text dimColor>{'┄'.repeat(sepWidth)}</Text>
      </Box>
    </Box>
  );
};
