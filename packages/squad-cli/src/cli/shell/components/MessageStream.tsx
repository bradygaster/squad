import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { getRoleEmoji } from '../lifecycle.js';
import { isNoColor, useTerminalWidth } from '../terminal.js';
import { ThinkingIndicator } from './ThinkingIndicator.js';
import type { ShellMessage, AgentSession } from '../types.js';

interface MessageStreamProps {
  messages: ShellMessage[];
  agents?: AgentSession[];
  streamingContent?: { agentName: string; content: string } | null;
  processing?: boolean;
  activityHint?: string;
  agentActivities?: Map<string, string>;
  maxVisible?: number;
}

/** Format elapsed seconds for response timestamps. */
function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const MessageStream: React.FC<MessageStreamProps> = ({
  messages,
  agents,
  streamingContent,
  processing = false,
  activityHint,
  agentActivities,
  maxVisible = 50,
}) => {
  const visible = messages.slice(-maxVisible);
  const roleMap = new Map((agents ?? []).map(a => [a.name, a.role]));

  // Elapsed time tracking for the ThinkingIndicator
  const [elapsedMs, setElapsedMs] = useState(0);
  const processingStartRef = useRef<number>(Date.now());

  useEffect(() => {
    if (processing) {
      processingStartRef.current = Date.now();
      setElapsedMs(0);
      const timer = setInterval(() => {
        setElapsedMs(Date.now() - processingStartRef.current);
      }, 200);
      return () => clearInterval(timer);
    } else {
      setElapsedMs(0);
    }
  }, [processing]);

  // Build activity hint: prefer explicit hint, then infer from agent @mention
  const resolvedHint = (() => {
    if (activityHint) return activityHint;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      const atMatch = lastUser.content.match(/^@(\w+)/);
      if (atMatch?.[1]) return `${atMatch[1]} is thinking...`;
    }
    return undefined;
  })();

  // Compute response duration: time from previous user message to this agent message
  const getResponseDuration = (index: number): string | null => {
    const msg = visible[index];
    if (!msg || msg.role !== 'agent') return null;
    // Walk backward to find the preceding user message
    for (let j = index - 1; j >= 0; j--) {
      if (visible[j]?.role === 'user') {
        return formatDuration(visible[j]!.timestamp, msg.timestamp);
      }
    }
    return null;
  };

  const noColor = isNoColor();
  const width = useTerminalWidth();
  const sepWidth = Math.min(width, 120) - 2;

  return (
    <Box flexDirection="column" flexGrow={1} marginTop={1}>
      {visible.map((msg, i) => {
        const isNewTurn = msg.role === 'user' && i > 0;
        const agentRole = msg.agentName ? roleMap.get(msg.agentName) : undefined;
        const emoji = agentRole ? getRoleEmoji(agentRole) : '';
        const duration = getResponseDuration(i);

        return (
          <React.Fragment key={i}>
            {isNewTurn && <Text dimColor>{'─'.repeat(sepWidth)}</Text>}
            <Box gap={1}>
              {msg.role === 'user' ? (
                <>
                  <Text color={noColor ? undefined : 'cyan'} bold>❯ you:</Text>
                  <Text color={noColor ? undefined : 'cyan'} wrap="wrap">{msg.content}</Text>
                </>
              ) : msg.role === 'system' ? (
                <>
                  <Text dimColor>▸ system:</Text>
                  <Text dimColor wrap="wrap">{msg.content}</Text>
                </>
              ) : (
                <>
                  <Text color={noColor ? undefined : 'green'} bold>{emoji ? `${emoji} ` : ''}{msg.agentName ?? 'agent'}:</Text>
                  <Text wrap="wrap">{msg.content}</Text>
                  {duration && <Text dimColor>({duration})</Text>}
                </>
              )}
            </Box>
          </React.Fragment>
        );
      })}

      {/* Streaming content with live cursor */}
      {streamingContent && streamingContent.content && (
        <Box gap={1}>
          <Text color={noColor ? undefined : 'green'} bold>
            {roleMap.has(streamingContent.agentName)
              ? `${getRoleEmoji(roleMap.get(streamingContent.agentName)!)} `
              : ''}
            {streamingContent.agentName}:
          </Text>
          <Text wrap="wrap">{streamingContent.content}</Text>
          <Text color={noColor ? undefined : 'cyan'}>▌</Text>
        </Box>
      )}

      {/* Agent activity feed — real-time lines showing what agents are doing */}
      {agentActivities && agentActivities.size > 0 && (
        <Box flexDirection="column">
          {Array.from(agentActivities.entries()).map(([name, activity]) => (
            <Text key={name} dimColor>📋 {name} is {activity}</Text>
          ))}
        </Box>
      )}

      {/* Thinking indicator — shown when processing but no content yet */}
      {processing && !streamingContent?.content && (
        <ThinkingIndicator
          isThinking={true}
          elapsedMs={elapsedMs}
          activityHint={resolvedHint}
        />
      )}

      {/* Streaming status — shows elapsed while content flows */}
      {processing && streamingContent?.content && (
        <ThinkingIndicator
          isThinking={true}
          elapsedMs={elapsedMs}
          activityHint={`${streamingContent.agentName} streaming`}
        />
      )}
    </Box>
  );
};
