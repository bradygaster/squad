/**
 * Main Ink shell application — composes AgentPanel, MessageStream, and InputPrompt.
 *
 * Exposes a ShellApi callback so the parent (runShell) can wire
 * StreamBridge events into React state.
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import { AgentPanel } from './AgentPanel.js';
import { MessageStream, renderMarkdownInline, formatDuration } from './MessageStream.js';
import { InputPrompt } from './InputPrompt.js';
import { parseInput, type ParsedInput } from '../router.js';
import { executeCommand } from '../commands.js';
import { loadWelcomeData, getRoleEmoji } from '../lifecycle.js';
import { isNoColor, useTerminalWidth, detectTerminal, boxChars } from '../terminal.js';
import type { WelcomeData } from '../lifecycle.js';
import type { SessionRegistry } from '../sessions.js';
import type { ShellRenderer } from '../render.js';
import type { ShellMessage, AgentSession } from '../types.js';
import { MemoryManager } from '../memory.js';
import type { SessionData } from '../session-store.js';
import type { ThinkingPhase } from './ThinkingIndicator.js';

/** Methods exposed to the host so StreamBridge can push data into React state. */
export interface ShellApi {
  addMessage: (msg: ShellMessage) => void;
  clearMessages: () => void;
  setStreamingContent: (content: { agentName: string; content: string } | null) => void;
  clearAgentStream: (agentName: string) => void;
  setActivityHint: (hint: string | undefined) => void;
  setAgentActivity: (agentName: string, activity: string | undefined) => void;
  setProcessing: (processing: boolean) => void;
  refreshAgents: () => void;
}

export interface AppProps {
  registry: SessionRegistry;
  renderer: ShellRenderer;
  teamRoot: string;
  version: string;
  /** Max messages to keep in visible history (default: 200). Older messages are archived. */
  maxMessages?: number;
  onReady?: (api: ShellApi) => void;
  onDispatch?: (parsed: ParsedInput) => Promise<void>;
  onCancel?: () => void;
  onRestoreSession?: (session: SessionData) => void;
}

const EXIT_WORDS = new Set(['exit', 'quit', 'q']);

export const App: React.FC<AppProps> = ({ registry, renderer, teamRoot, version, maxMessages, onReady, onDispatch, onCancel, onRestoreSession }) => {
  const { exit } = useApp();
  // Session-scoped ID ensures Static keys are unique across session boundaries,
  // preventing Ink from confusing items when sessions are restored.
  const sessionId = useMemo(() => Date.now().toString(36), []);
  const memoryManager = useMemo(() => new MemoryManager(maxMessages != null ? { maxMessages } : undefined), [maxMessages]);
  const [messages, setMessages] = useState<ShellMessage[]>([]);
  const [archivedMessages, setArchivedMessages] = useState<ShellMessage[]>([]);
  const [agents, setAgents] = useState<AgentSession[]>(registry.getAll());
  const [streamingContent, setStreamingContent] = useState<Map<string, string>>(new Map());
  const [processing, setProcessing] = useState(false);
  const [activityHint, setActivityHint] = useState<string | undefined>(undefined);
  const [agentActivities, setAgentActivities] = useState<Map<string, string>>(new Map());
  const [welcome, setWelcome] = useState<WelcomeData | null>(() => loadWelcomeData(teamRoot));
  const messagesRef = useRef<ShellMessage[]>([]);
  const ctrlCRef = useRef(0);
  const ctrlCTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Append messages and enforce the history cap, archiving overflow
  const appendMessages = useCallback((updater: (prev: ShellMessage[]) => ShellMessage[]) => {
    setMessages(prev => {
      const next = updater(prev);
      const { kept, archived } = memoryManager.trimWithArchival(next);
      if (archived.length > 0) {
        setArchivedMessages(old => [...old, ...archived]);
      }
      return kept;
    });
  }, [memoryManager]);

  // Keep ref in sync so command handlers see latest history
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Expose API for external callers (StreamBridge, coordinator)
  useEffect(() => {
    onReady?.({
      addMessage: (msg: ShellMessage) => {
        appendMessages(prev => [...prev, msg]);
        if (msg.agentName) {
          setStreamingContent(prev => {
            const next = new Map(prev);
            next.delete(msg.agentName!);
            return next;
          });
        }
        setActivityHint(undefined);
      },
      clearMessages: () => {
        setMessages([]);
        setArchivedMessages([]);
      },
      setStreamingContent: (content) => {
        if (content === null) {
          setStreamingContent(new Map());
        } else {
          setStreamingContent(prev => {
            const next = new Map(prev);
            next.set(content.agentName, content.content);
            return next;
          });
        }
      },
      clearAgentStream: (agentName: string) => {
        setStreamingContent(prev => {
          const next = new Map(prev);
          next.delete(agentName);
          return next;
        });
      },
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
      setProcessing,
      refreshAgents: () => {
        setAgents([...registry.getAll()]);
      },
    });
  }, [onReady, registry, appendMessages]);

  // Ctrl+C: cancel operation when processing, double-tap to exit when idle
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (processing && onCancel) {
        // First Ctrl+C while processing → cancel operation and return to prompt
        onCancel();
        setProcessing(false);
        return;
      }
      // Not processing, or no cancel handler → increment double-tap counter
      ctrlCRef.current++;
      if (ctrlCTimerRef.current) clearTimeout(ctrlCTimerRef.current);
      if (ctrlCRef.current >= 2) {
        exit();
        return;
      }
      // Single Ctrl+C when idle — show hint, reset after 1s
      ctrlCTimerRef.current = setTimeout(() => { ctrlCRef.current = 0; }, 1000);
      if (!processing) {
        appendMessages(prev => [...prev, {
          role: 'system' as const,
          content: 'Press Ctrl+C again to exit.',
          timestamp: new Date(),
        }]);
      }
    }
  });

  const handleSubmit = useCallback((input: string) => {
    // Bare "exit" exits the shell
    if (EXIT_WORDS.has(input.toLowerCase())) {
      exit();
      return;
    }

    const userMsg: ShellMessage = { role: 'user', content: input, timestamp: new Date() };
    appendMessages(prev => [...prev, userMsg]);

    const knownAgents = registry.getAll().map(a => a.name);
    const parsed = parseInput(input, knownAgents);

    if (parsed.type === 'slash_command') {
      const result = executeCommand(parsed.command!, parsed.args ?? [], {
        registry,
        renderer,
        messageHistory: [...messagesRef.current, userMsg],
        teamRoot,
        version,
        onRestoreSession,
      });

      if (result.exit) {
        exit();
        return;
      }

      if (result.clear) {
        setMessages([]);
        setArchivedMessages([]);
        return;
      }

      if (result.triggerInitCast && onDispatch) {
        // /init command returned a cast trigger — dispatch it as a coordinator message
        const castParsed: ParsedInput = {
          type: 'coordinator',
          raw: result.triggerInitCast.prompt,
          content: result.triggerInitCast.prompt,
          skipCastConfirmation: true,
        };
        setProcessing(true);
        onDispatch(castParsed).finally(() => {
          setProcessing(false);
          setAgents([...registry.getAll()]);
        });
        return;
      }

      if (result.output) {
        appendMessages(prev => [...prev, {
          role: 'system' as const,
          content: result.output!,
          timestamp: new Date(),
        }]);
      }
    } else if (parsed.type === 'direct_agent' || parsed.type === 'coordinator') {
      if (!onDispatch) {
        appendMessages(prev => [...prev, {
          role: 'system' as const,
          content: 'SDK not connected. Try: (1) squad doctor to check setup, (2) check your internet connection, (3) restart the shell to reconnect.',
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
  }, [registry, renderer, teamRoot, exit, onDispatch, appendMessages]);

  const rosterAgents = welcome?.agents ?? [];

  const agentCount = welcome?.agents.length ?? 0;
  const activeCount = agents.filter(a => a.status === 'streaming' || a.status === 'working').length;

  const noColor = isNoColor();
  const width = useTerminalWidth();
  const compact = width <= 60;
  const wide = width >= 100;

  // Welcome banner: instant display (no typewriter blocking)
  const titleRevealed = welcome ? '◆ SQUAD' : '';
  const bannerReady = true;
  const bannerDim = false;

  // Prefer lead/coordinator for first-run hint, fall back to first agent
  const leadAgent = welcome?.agents.find(a =>
    a.role?.toLowerCase().includes('lead') ||
    a.role?.toLowerCase().includes('coordinator') ||
    a.role?.toLowerCase().includes('architect')
  )?.name ?? welcome?.agents[0]?.name;

  // Determine ThinkingIndicator phase based on SDK connection state
  const thinkingPhase: ThinkingPhase = !onDispatch ? 'connecting' : 'routing';

  // Derive @mention hint from last user message (needed because MessageStream
  // receives messages=[] after the Static scrollback refactor).
  const mentionHint = useMemo(() => {
    if (!processing) return undefined;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      const atMatch = lastUser.content.match(/^@(\w+)/);
      if (atMatch?.[1]) return `${atMatch[1]} is thinking...`;
    }
    return undefined;
  }, [messages, processing]);

  // Combine archived + current messages for Static rendering.
  // This array only grows — archival moves items between the two source arrays
  // but the combined list stays stable, which is required by Ink's Static tracking.
  const staticMessages = useMemo(
    () => [...archivedMessages, ...messages],
    [archivedMessages, messages],
  );
  const roleMap = useMemo(() => new Map((agents ?? []).map(a => [a.name, a.role])), [agents]);
  const caps = detectTerminal();
  const box = boxChars(caps);
  const sepWidth = Math.min(width, 120) - 2;

  // Memoize the header box so it doesn't re-layout on every state change (P1).
  // Dependencies are all derived from welcome data (stable) + width (resize only).
  const headerElement = useMemo(() => (
    <Box flexDirection="column" borderStyle="round" borderColor={noColor ? undefined : 'cyan'} paddingX={1}>
      <Box gap={1}>
        <Text bold color={noColor ? undefined : 'cyan'}>{welcome ? titleRevealed : '◆ SQUAD'}</Text>
        {bannerReady && <Text dimColor>v{version}</Text>}
        {bannerReady && welcome?.description ? (
          <>
            <Text dimColor>-</Text>
            <Text dimColor wrap="wrap">{welcome.description}</Text>
          </>
        ) : null}
      </Box>
      {bannerReady && <Text>{' '}</Text>}
      {bannerReady && rosterAgents.length > 0 ? (
        <>
          <Box flexWrap="wrap" columnGap={1}>
            {rosterAgents.map((a, i) => (
              <Box key={a.name}><Text dimColor={bannerDim}>{a.name}{i < rosterAgents.length - 1 ? ' -' : ''}</Text></Box>
            ))}
          </Box>
          <Text dimColor>  {agentCount} agent{agentCount !== 1 ? 's' : ''} ready - {activeCount} active</Text>
        </>
      ) : bannerReady && rosterAgents.length === 0 ? (
        <Text dimColor>{"  Describe what you're building to cast your team"}</Text>
      ) : null}
      {bannerReady && wide && welcome?.focus ? <Text dimColor>Focus: {welcome.focus}</Text> : null}
      {bannerReady && <Text dimColor>Type naturally · @Agent to direct · /help · Ctrl+C to exit</Text>}
    </Box>
  ), [noColor, welcome, titleRevealed, bannerReady, version, rosterAgents, bannerDim, agentCount, activeCount, wide]);

  const firstRunElement = useMemo(() => {
    if (!bannerReady || !welcome?.isFirstRun) return null;
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {rosterAgents.length > 0 ? (
          <>
            <Text color={noColor ? undefined : 'green'} bold>Your squad is assembled.</Text>
            <Text> </Text>
            <Text>Try: <Text bold color={noColor ? undefined : 'cyan'}>What should we build first?</Text></Text>
            <Text dimColor>Squad automatically routes your message to the best agent.</Text>
            <Text dimColor>Or use <Text bold>@{leadAgent}</Text> to message an agent directly.</Text>
          </>
        ) : null}
      </Box>
    );
  }, [bannerReady, welcome?.isFirstRun, rosterAgents, noColor, leadAgent]);

  return (
    <Box flexDirection="column">
      {headerElement}
      {firstRunElement}

      {/* Completed messages — rendered once to the terminal scroll buffer via Ink Static */}
      <Static items={staticMessages}>
        {(msg, i) => {
          const isNewTurn = msg.role === 'user' && i > 0;
          const agentRole = msg.agentName ? roleMap.get(msg.agentName) : undefined;
          const emoji = agentRole ? getRoleEmoji(agentRole) : '';
          // Compute response duration for agent messages: time since preceding user message
          let duration: string | null = null;
          if (msg.role === 'agent') {
            for (let j = i - 1; j >= 0; j--) {
              if (staticMessages[j]?.role === 'user') {
                duration = formatDuration(staticMessages[j]!.timestamp, msg.timestamp);
                break;
              }
            }
          }
          return (
            <Box key={`${sessionId}-${i}`} flexDirection="column">
              {isNewTurn && <Text dimColor>{box.h.repeat(sepWidth)}</Text>}
              <Box gap={1} paddingLeft={msg.role === 'user' ? 0 : 2}>
                {msg.role === 'user' ? (
                  <Box flexDirection="column">
                    <Box gap={1}>
                      <Text color={noColor ? undefined : 'cyan'} bold>❯</Text>
                      <Text color={noColor ? undefined : 'cyan'} wrap="wrap">{msg.content.split('\n')[0] ?? ''}</Text>
                    </Box>
                    {msg.content.split('\n').slice(1).map((line, li) => (
                      <Box key={li} paddingLeft={2}>
                        <Text color={noColor ? undefined : 'cyan'} wrap="wrap">{line}</Text>
                      </Box>
                    ))}
                  </Box>
                ) : msg.role === 'system' ? (
                  <>
                    <Text dimColor>[system]</Text>
                    <Text dimColor wrap="wrap">{msg.content}</Text>
                  </>
                ) : (
                  <>
                    <Text color={noColor ? undefined : 'green'} bold>{emoji ? `${emoji} ` : ''}{(msg.agentName === 'coordinator' ? 'Squad' : msg.agentName) ?? 'agent'}:</Text>
                    <Text wrap="wrap">{renderMarkdownInline(msg.content)}</Text>
                    {duration && <Text dimColor>({duration})</Text>}
                  </>
                )}
              </Box>
            </Box>
          );
        }}
      </Static>

      <AgentPanel agents={agents} streamingContent={streamingContent} />
      <MessageStream messages={[]} agents={agents} streamingContent={streamingContent} processing={processing} activityHint={activityHint || mentionHint} agentActivities={agentActivities} thinkingPhase={thinkingPhase} />
      <InputPrompt onSubmit={handleSubmit} disabled={processing} agentNames={agents.map(a => a.name)} messageCount={messages.length} />
    </Box>
  );
};
