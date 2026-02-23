/**
 * Main Ink shell application — composes AgentPanel, MessageStream, and InputPrompt.
 *
 * Exposes a ShellApi callback so the parent (runShell) can wire
 * StreamBridge events into React state.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { AgentPanel } from './AgentPanel.js';
import { MessageStream } from './MessageStream.js';
import { InputPrompt } from './InputPrompt.js';
import { parseInput, type ParsedInput } from '../router.js';
import { executeCommand } from '../commands.js';
import { loadWelcomeData } from '../lifecycle.js';
import { isNoColor, useTerminalWidth } from '../terminal.js';
import { useTypewriter, useFadeIn } from '../useAnimation.js';
import type { WelcomeData } from '../lifecycle.js';
import type { SessionRegistry } from '../sessions.js';
import type { ShellRenderer } from '../render.js';
import type { ShellMessage, AgentSession } from '../types.js';

/** Methods exposed to the host so StreamBridge can push data into React state. */
export interface ShellApi {
  addMessage: (msg: ShellMessage) => void;
  setStreamingContent: (content: { agentName: string; content: string } | null) => void;
  setActivityHint: (hint: string | undefined) => void;
  setAgentActivity: (agentName: string, activity: string | undefined) => void;
  refreshAgents: () => void;
}

export interface AppProps {
  registry: SessionRegistry;
  renderer: ShellRenderer;
  teamRoot: string;
  version: string;
  onReady?: (api: ShellApi) => void;
  onDispatch?: (parsed: ParsedInput) => Promise<void>;
}

const EXIT_WORDS = new Set(['exit']);

export const App: React.FC<AppProps> = ({ registry, renderer, teamRoot, version, onReady, onDispatch }) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<ShellMessage[]>([]);
  const [agents, setAgents] = useState<AgentSession[]>(registry.getAll());
  const [streamingContent, setStreamingContent] = useState<{ agentName: string; content: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activityHint, setActivityHint] = useState<string | undefined>(undefined);
  const [agentActivities, setAgentActivities] = useState<Map<string, string>>(new Map());
  const [welcome, setWelcome] = useState<WelcomeData | null>(null);
  const messagesRef = useRef<ShellMessage[]>([]);

  // Keep ref in sync so command handlers see latest history
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Load welcome data from .squad/ directory on mount
  useEffect(() => {
    const data = loadWelcomeData(teamRoot);
    if (data) setWelcome(data);
  }, [teamRoot]);

  // Expose API for external callers (StreamBridge, coordinator)
  useEffect(() => {
    onReady?.({
      addMessage: (msg: ShellMessage) => {
        setMessages(prev => [...prev, msg]);
        setStreamingContent(null);
        setActivityHint(undefined);
      },
      setStreamingContent,
      setActivityHint,
      setAgentActivity: (agentName: string, activity: string | undefined) => {
        setAgentActivities(prev => {
          const next = new Map(prev);
          if (activity) {
            next.set(agentName, activity);
          } else {
            next.delete(agentName);
          }
          return next;
        });
      },
      refreshAgents: () => {
        setAgents([...registry.getAll()]);
      },
    });
  }, [onReady, registry]);

  // Graceful Ctrl+C
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      exit();
    }
  });

  const handleSubmit = useCallback((input: string) => {
    // Bare "exit" exits the shell
    if (EXIT_WORDS.has(input.toLowerCase())) {
      exit();
      return;
    }

    const userMsg: ShellMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    const knownAgents = registry.getAll().map(a => a.name);
    const parsed = parseInput(input, knownAgents);

    if (parsed.type === 'slash_command') {
      const result = executeCommand(parsed.command!, parsed.args ?? [], {
        registry,
        renderer,
        messageHistory: [...messagesRef.current, userMsg],
        teamRoot,
      });

      if (result.exit) {
        exit();
        return;
      }

      if (result.output) {
        setMessages(prev => [...prev, {
          role: 'system' as const,
          content: result.output!,
          timestamp: new Date(),
        }]);
      }
    } else if (parsed.type === 'direct_agent' || parsed.type === 'coordinator') {
      if (!onDispatch) {
        setMessages(prev => [...prev, {
          role: 'system' as const,
          content: '🔌 SDK not connected. Check your setup.',
          timestamp: new Date(),
        }]);
        return;
      }
      setProcessing(true);
      onDispatch(parsed).finally(() => {
        setProcessing(false);
        setAgents([...registry.getAll()]);
      });
    }

    setAgents([...registry.getAll()]);
  }, [registry, renderer, teamRoot, exit, onDispatch]);

  const rosterText = welcome?.agents
    .map((a, i) => `${a.emoji} ${a.name}${i < (welcome?.agents.length ?? 0) - 1 ? ' · ' : ''}`)
    .join('') ?? '';

  const agentCount = welcome?.agents.length ?? 0;
  const activeCount = agents.filter(a => a.status === 'streaming' || a.status === 'working').length;

  const noColor = isNoColor();
  const width = useTerminalWidth();
  const compact = width <= 60;
  const wide = width >= 100;

  // Welcome animation: typewriter on title, fade-in on rest of banner
  const titleRevealed = useTypewriter(welcome ? '◆ SQUAD' : '', 500);
  const bannerReady = titleRevealed.length >= 7; // '◆ SQUAD'.length
  const bannerDim = useFadeIn(bannerReady, 300);

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor={noColor ? undefined : 'cyan'} paddingX={1}>
        <Box gap={1}>
          <Text bold color={noColor ? undefined : 'cyan'}>{welcome ? titleRevealed : '◆ SQUAD'}</Text>
          {bannerReady && <Text dimColor>v{version}</Text>}
          {!compact && welcome?.description ? (
            <>
              <Text dimColor>—</Text>
              <Text dimColor wrap="wrap">{welcome.description}</Text>
            </>
          ) : null}
        </Box>
        {!compact && <Text>{' '}</Text>}
        {!compact && rosterText ? (
          <>
            <Text wrap="wrap">{rosterText}</Text>
            <Text dimColor>  {agentCount} agent{agentCount !== 1 ? 's' : ''} ready · {activeCount} active</Text>
          </>
        ) : compact && agentCount > 0 ? (
          <Text dimColor>{agentCount} agent{agentCount !== 1 ? 's' : ''} · {activeCount} active</Text>
        ) : !rosterText ? (
          <Text dimColor>{"  Run 'squad init' to get started"}</Text>
        ) : null}
        {!compact && <Text>{' '}</Text>}
        {wide && welcome?.focus ? <Text dimColor>📍 {welcome.focus}</Text> : null}
        <Text dimColor>{compact ? '/help · Ctrl+C exit' : '↑↓ history · @Agent to direct · /help · Ctrl+C exit'}</Text>
      </Box>

      <AgentPanel agents={agents} streamingContent={streamingContent} />
      <MessageStream messages={messages} agents={agents} streamingContent={streamingContent} processing={processing} activityHint={activityHint} agentActivities={agentActivities} />
      <InputPrompt onSubmit={handleSubmit} disabled={processing} />
    </Box>
  );
};
