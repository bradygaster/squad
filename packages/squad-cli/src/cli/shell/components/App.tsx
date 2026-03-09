import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Text, Static, useApp, useInput, useStdout } from 'ink';
import { AgentPanel } from './AgentPanel.js';
import { MessageStream, renderMarkdownInline, formatDuration } from './MessageStream.js';
import { InputPrompt } from './InputPrompt.js';
import { parseInput, type ParsedInput } from '../router.js';
import { executeCommand } from '../commands.js';
import { loadWelcomeData, getRoleEmoji } from '../lifecycle.js';
import { isNoColor, useTerminalWidth, useTerminalHeight, useLayoutTier } from '../terminal.js';
import { Separator } from './Separator.js';
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
  refreshWelcome: () => void;
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
  /**
   * True after a no-args `/init` so the next user message is treated as a
   * team-cast request (equivalent to `/init <message>`).
   */
  const [awaitingInitPrompt, setAwaitingInitPrompt] = useState(false);
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
      refreshWelcome: () => {
        const data = loadWelcomeData(teamRoot);
        if (data) setWelcome(data);
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

    // If we're awaiting an init prompt and the user sent a non-slash message,
    // treat it as an inline /init <prompt> cast request.
    if (awaitingInitPrompt && parsed.type !== 'slash_command') {
      setAwaitingInitPrompt(false);
      if (!onDispatch) {
        appendMessages(prev => [...prev, {
          role: 'system' as const,
          content: 'SDK not connected. Try: (1) squad doctor to check setup, (2) check your internet connection, (3) restart the shell to reconnect.',
          timestamp: new Date(),
        }]);
        return;
      }
      const castParsed: ParsedInput = {
        type: 'coordinator',
        raw: input,
        content: input,
        skipCastConfirmation: false, // show confirmation, same as freeform cast
      };
      setProcessing(true);
      onDispatch(castParsed).finally(() => {
        setProcessing(false);
        setAgents([...registry.getAll()]);
      });
      return;
    }

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

      if (result.awaitInitPrompt) {
        // No-args /init: show the guidance and wait for the user's next message
        setAwaitingInitPrompt(true);
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
  }, [registry, renderer, teamRoot, exit, onDispatch, appendMessages, awaitingInitPrompt]);

  const rosterAgents = welcome?.agents ?? [];

  const noColor = isNoColor();
  const width = useTerminalWidth();
  const tier = useLayoutTier();
  const terminalHeight = useTerminalHeight();
  // Cap contentWidth at Ink's stdout columns to prevent text overflow/clipping.
  // In tests, Ink renders at 100 columns while process.stdout.columns may differ.
  const { stdout: inkStdout } = useStdout();
  const renderWidth = inkStdout && 'columns' in inkStdout
    ? (inkStdout as { columns?: number }).columns ?? width
    : width;
  const contentWidth = Math.min(
    tier === 'wide' ? Math.min(width, 120) : tier === 'normal' ? Math.min(width, 80) : width,
    renderWidth,
  );

  // Prefer lead/coordinator for first-run hint, fall back to first agent
  const leadAgent = welcome?.agents.find(a =>
    a.role?.toLowerCase().includes('lead') ||
    a.role?.toLowerCase().includes('coordinator') ||
    a.role?.toLowerCase().includes('architect')
  )?.name ?? welcome?.agents[0]?.name;

  // Determine ThinkingIndicator phase based on SDK connection state
  const thinkingPhase: ThinkingPhase = !onDispatch ? 'connecting' : 'routing';

  // Derive @mention hint from last user message.
  const mentionHint = useMemo(() => {
    if (!processing) return undefined;
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      const atMatch = lastUser.content.match(/^@(\w+)/);
      if (atMatch?.[1]) return `${atMatch[1]} is thinking...`;
    }
    return undefined;
  }, [messages, processing]);

  // Only archived (overflow) messages go to Static scrollback.
  // Current messages stay in the live region so the user can always see
  // the recent conversation without scrolling. This prevents the
  // "conversation vanishes" problem where every re-render forced the
  // viewport to the bottom, hiding Static scrollback content.
  const staticMessages = archivedMessages;
  const roleMap = useMemo(() => new Map((agents ?? []).map(a => [a.name, a.role])), [agents]);

  // Memoize the header box — rendered once into Static scroll buffer at the top.
  const headerElement = useMemo(() => {
    // Narrow: minimal header, no border
    if (tier === 'narrow') {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold color={noColor ? undefined : 'cyan'}>SQUAD</Text>
          <Text dimColor>v{version}</Text>
          <Text color={noColor ? undefined : 'yellow'} dimColor>⚠️  Experimental</Text>
        </Box>
      );
    }

    // Normal: abbreviated header
    if (tier === 'normal') {
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={noColor ? undefined : 'cyan'} paddingX={1}>
          <Text bold color={noColor ? undefined : 'cyan'}>SQUAD v{version}</Text>
          <Text dimColor>Type naturally · <Text bold>@Agent</Text> · <Text bold>/help</Text></Text>
          <Text color={noColor ? undefined : 'yellow'} dimColor>⚠️  Experimental preview</Text>
        </Box>
      );
    }

    // Wide: full ASCII art header
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={noColor ? undefined : 'cyan'} paddingX={1}>
        <Text bold color={noColor ? undefined : 'cyan'}>{'  ___  ___  _   _  _   ___\n / __|/ _ \\| | | |/_\\ |   \\\n \\__ \\ (_) | |_| / _ \\| |) |\n |___/\\__\\_\\\\___/_/ \\_\\___/'}</Text>
        <Text>{' '}</Text>
        <Text dimColor>v{version} · Type naturally · <Text bold>@Agent</Text> to direct · <Text bold>/help</Text></Text>
        <Text color={noColor ? undefined : 'yellow'} dimColor>⚠️  Experimental preview — file issues at github.com/bradygaster/squad</Text>
      </Box>
    );
  }, [noColor, version, tier]);

  const firstRunElement = useMemo(() => {
    if (!welcome?.isFirstRun) return null;
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {rosterAgents.length > 0 ? (
          <>
            <Text color={noColor ? undefined : 'green'} bold>Your squad is assembled.</Text>
            <Text> </Text>
            <Text bold>Try: <Text bold color={noColor ? undefined : 'cyan'}>What should we build first?</Text></Text>
            <Text dimColor>Squad automatically routes your message to the best agent.</Text>
            <Text dimColor>Or use <Text bold>@{leadAgent}</Text> to message an agent directly.</Text>
          </>
        ) : null}
      </Box>
    );
  }, [welcome?.isFirstRun, rosterAgents, noColor, leadAgent]);

  // Static items: header rendered once at top of scroll buffer, then messages below.
  // Ink's Static renders each keyed item exactly once — header stays at the top.
  type StaticItem =
    | { kind: 'header'; key: string }
    | { kind: 'msg'; key: string; msg: ShellMessage; idx: number };

  const allStaticItems = useMemo((): StaticItem[] => {
    const items: StaticItem[] = [{ kind: 'header', key: 'welcome-header' }];
    for (let i = 0; i < staticMessages.length; i++) {
      // Use timestamp + index-at-creation for stable keys that don't shift
      // when new messages are added (array only grows via append)
      const msg = staticMessages[i]!;
      const stableKey = `${sessionId}-${msg.timestamp.getTime()}-${i}`;
      items.push({ kind: 'msg', key: stableKey, msg, idx: i });
    }
    return items;
  }, [staticMessages, sessionId]);

  // Fill the entire viewport. Ink's fullscreen clearTerminal path and
  // trailing-newline behavior have been patched out of ink.js, so we can
  // safely use the full terminal height without triggering scroll-to-top.
  // logUpdate tracks exactly rootHeight lines and erases/rewrites them
  // on each render cycle without cursor drift.
  const rootHeight = Math.max(terminalHeight, 8);

  // Derive maxVisible from terminal height so taller terminals show more
  // conversation context. Reserve ~8 rows for header/input/agent-panel chrome.
  const maxVisible = Math.max(Math.floor((terminalHeight - 8) / 3), 3);

  return (
    <Box flexDirection="column" height={rootHeight}>
      {/* Static block: header first (stays at top of scroll buffer), then messages */}
      <Static items={allStaticItems}>
        {(item) => {
          if (item.kind === 'header') {
            return (
              <Box key={item.key} flexDirection="column" marginBottom={1}>
                {headerElement}
                {firstRunElement}
              </Box>
            );
          }
          const { msg, idx: i } = item;
          const isNewTurn = msg.role === 'user' && i > 0;
          const agentRole = msg.agentName ? roleMap.get(msg.agentName) : undefined;
          const emoji = agentRole ? getRoleEmoji(agentRole) : '';
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
            <Box key={item.key} flexDirection="column" width={contentWidth}>
              {isNewTurn && tier !== 'narrow' && <Separator marginTop={1} />}
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
                  <Text dimColor wrap="wrap">{msg.content}</Text>
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

      {/* Live region: always height-constrained to prevent layout shift flicker
          when processing state toggles. InputPrompt stays pinned at bottom.
          Messages are kept here (not in Static) so the user can always see the
          recent conversation without scrolling. maxVisible caps the message
          count to prevent overflow into the InputPrompt area. */}
      <Box flexDirection="column" flexGrow={1}>
        <AgentPanel agents={agents} streamingContent={streamingContent} />
        <MessageStream messages={messages} agents={agents} streamingContent={streamingContent} processing={processing} activityHint={activityHint || mentionHint} agentActivities={agentActivities} thinkingPhase={thinkingPhase} maxVisible={maxVisible} />
      </Box>
      {/* Fixed input box at bottom — Copilot/Claude style */}
      <Box marginTop={1} borderStyle={noColor ? undefined : 'round'} borderColor={noColor ? undefined : 'cyan'} paddingX={1}>
        <InputPrompt onSubmit={handleSubmit} disabled={processing} agentNames={agents.map(a => a.name)} messageCount={messages.length} />
      </Box>
      {/* version is shown in the Static header — no footer duplicate needed */}
    </Box>
  );
};
