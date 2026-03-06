import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { getRoleEmoji } from '../lifecycle.js';
import { isNoColor, useLayoutTier } from '../terminal.js';
import { Separator } from './Separator.js';
import { useCompletionFlash } from '../useAnimation.js';
import { getStatusTag } from '../agent-status.js';
import type { AgentSession } from '../types.js';

interface AgentPanelProps {
  agents: AgentSession[];
  streamingContent?: Map<string, string>;
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
  const tier = useLayoutTier();

  // Tick every second to update elapsed times
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasActive = agents.some(a => a.status === 'working' || a.status === 'streaming');
    if (!hasActive) return;
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [agents]);

  // Completion flash: brief "✓ Done" when agent finishes work
  const completionFlash = useCompletionFlash(agents);

  if (agents.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text dimColor>No agents active.</Text>
        <Text><Text bold>Send a message</Text><Text dimColor> to start. </Text><Text bold>/help</Text><Text dimColor> for commands.</Text></Text>
      </Box>
    );
  }

  const activeAgents = agents.filter(a => a.status === 'streaming' || a.status === 'working');

  // Narrow layout: minimal single-line per agent, no hints
  if (tier === 'narrow') {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {agents.map((agent) => {
          const active = agent.status === 'streaming' || agent.status === 'working';
          const errored = agent.status === 'error';
          const statusLabel = getStatusTag(agent.status);
          return (
            <Box key={agent.name} gap={0}>
              <Text
                dimColor={!active && !errored}
                bold={active}
                color={noColor ? undefined : active ? 'green' : errored ? 'red' : undefined}
              >
                {getRoleEmoji(agent.role)} {agent.name}
              </Text>
              {active && <><Text> </Text><PulsingDot /></>}
              {errored && <Text color={noColor ? undefined : 'red'} bold> ERR</Text>}
              {completionFlash.has(agent.name) && (
                noColor
                  ? <Text bold> ✓ Done</Text>
                  : <Text color="green" bold> ✓ Done</Text>
              )}
              {!active && !errored && !completionFlash.has(agent.name) && <Text dimColor> {statusLabel}</Text>}
            </Box>
          );
        })}
        <Separator marginTop={1} />
      </Box>
    );
  }

  // Normal layout: compact, abbreviated hints
  if (tier === 'normal') {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {agents.map((agent) => {
          const active = agent.status === 'streaming' || agent.status === 'working';
          const errored = agent.status === 'error';
          const statusLabel = getStatusTag(agent.status);
          return (
            <Box key={agent.name} gap={0}>
              <Text
                dimColor={!active && !errored}
                bold={active}
                color={noColor ? undefined : active ? 'green' : errored ? 'red' : undefined}
              >
                {getRoleEmoji(agent.role)} {agent.name}
              </Text>
              {active && <><Text> </Text><PulsingDot />{agent.activityHint && <Text bold> {agent.activityHint.slice(0, 30)}</Text>}</>}
              {errored && <Text color={noColor ? undefined : 'red'} bold> {statusLabel}</Text>}
              {completionFlash.has(agent.name) && <Text color={noColor ? undefined : 'green'} bold> ✓ Done</Text>}
              {!active && !errored && !completionFlash.has(agent.name) && <Text dimColor> {statusLabel}</Text>}
            </Box>
          );
        })}
        {/* Show simple status line for active agents at normal width */}
        {activeAgents.length > 0 && (
          <Box flexDirection="column">
            {activeAgents.map(a => {
              const sec = agentElapsedSec(a);
              const elapsed = formatElapsed(sec);
              const hint = a.activityHint ?? 'working';
              return (
                <Text key={a.name} color={noColor ? undefined : 'yellow'} dimColor>
                  {' '}{hint.slice(0, 40)}{elapsed ? ` (${elapsed})` : ''}
                </Text>
              );
            })}
          </Box>
        )}
        <Separator marginTop={1} />
      </Box>
    );
  }

  // Wide layout: full detail with models, full hints
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
                  {agent.activityHint && <Text color={noColor ? undefined : 'green'}> {agent.activityHint}</Text>}
                  {agent.model && <Text dimColor> ({agent.model})</Text>}
                </Box>
              )}
              {errored && (
                <Text color={noColor ? undefined : 'red'} bold> [ERR]</Text>
              )}
              {completionFlash.has(agent.name) && (
                noColor
                  ? <Text bold> ✓ Done</Text>
                  : <Text color="green" bold> ✓ Done</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Status line — rich progress for active agents */}
      {activeAgents.length > 0 ? (
        <Box flexDirection="column">
          {activeAgents.length > 1 && (
            <Text dimColor> {activeAgents.length} agents working in parallel</Text>
          )}
          {activeAgents.map(a => {
            const sec = agentElapsedSec(a);
            const elapsed = formatElapsed(sec);
            const hint = a.activityHint ?? 'working';
            return (
              <Text key={a.name} color={noColor ? undefined : 'yellow'}>
                {' '}{getRoleEmoji(a.role)} {a.name} — {hint}{elapsed ? ` (${elapsed})` : ''}{a.model ? ` [${a.model}]` : ''}
              </Text>
            );
          })}
        </Box>
      ) : (
        <Text dimColor>{' '}{agents.length} agent{agents.length !== 1 ? 's' : ''} ready</Text>
      )}

      {/* Separator between panel and message stream */}
      <Separator marginTop={1} />
    </Box>
  );
};
