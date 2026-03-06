/**
 * Squad Interactive Shell — entry point
 *
 * Renders the Ink-based shell UI with AgentPanel, MessageStream, and InputPrompt.
 * Manages CopilotSDK sessions and routes messages to agents/coordinator.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import React from 'react';
import { render } from 'ink';
import { App } from './components/App.js';
import type { ShellApi } from './components/App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { SessionRegistry } from './sessions.js';
import { ShellRenderer } from './render.js';
import { StreamBridge } from './stream-bridge.js';
import { ShellLifecycle, loadWelcomeData } from './lifecycle.js';
import { SquadClient } from '@bradygaster/squad-sdk/client';
import type { SquadSession } from '@bradygaster/squad-sdk/client';
import type { SquadPermissionHandler } from '@bradygaster/squad-sdk/client';
import type { ShellMessage } from './types.js';
import { initSquadTelemetry, TIMEOUTS, StreamingPipeline, recordAgentSpawn, recordAgentDuration, recordAgentError, recordAgentDestroy, RuntimeEventBus, resolveSquad, resolveGlobalSquadPath } from '@bradygaster/squad-sdk';
import type { UsageEvent } from '@bradygaster/squad-sdk';
import { enableShellMetrics, recordShellSessionDuration, recordAgentResponseLatency, recordShellError } from './shell-metrics.js';
import { buildCoordinatorPrompt, buildInitModePrompt, parseCoordinatorResponse, hasRosterEntries } from './coordinator.js';
import { loadAgentCharter, buildAgentPrompt } from './spawn.js';
import { createSession, saveSession, loadLatestSession, type SessionData } from './session-store.js';
import { parseDispatchTargets, type ParsedInput } from './router.js';
import { agentSessionGuidance, genericGuidance, formatGuidance } from './error-messages.js';
import { parseCastResponse, createTeam, formatCastSummary, type CastProposal } from '../core/cast.js';

export { SessionRegistry } from './sessions.js';
export { StreamBridge } from './stream-bridge.js';
export type { StreamBridgeOptions } from './stream-bridge.js';
export { ShellRenderer } from './render.js';
export { ShellLifecycle } from './lifecycle.js';
export type { LifecycleOptions, DiscoveredAgent } from './lifecycle.js';
export { spawnAgent, loadAgentCharter, buildAgentPrompt } from './spawn.js';
export type { SpawnOptions, SpawnResult, ToolDefinition } from './spawn.js';
export { buildCoordinatorPrompt, buildInitModePrompt, parseCoordinatorResponse, formatConversationContext, hasRosterEntries } from './coordinator.js';
export type { CoordinatorConfig, RoutingDecision } from './coordinator.js';
export { parseInput, parseDispatchTargets } from './router.js';
export type { MessageType, ParsedInput, DispatchTargets } from './router.js';
export { executeCommand } from './commands.js';
export type { CommandContext, CommandResult } from './commands.js';
export { MemoryManager, DEFAULT_LIMITS } from './memory.js';
export type { MemoryLimits } from './memory.js';
export { detectTerminal, safeChar, boxChars } from './terminal.js';
export type { TerminalCapabilities } from './terminal.js';
export { createCompleter } from './autocomplete.js';
export type { CompleterFunction, CompleterResult } from './autocomplete.js';
export { createSession, saveSession, loadLatestSession, listSessions, loadSessionById } from './session-store.js';
export type { SessionData, SessionSummary } from './session-store.js';
export { App } from './components/App.js';
export type { ShellApi, AppProps } from './components/App.js';
export { ErrorBoundary } from './components/ErrorBoundary.js';
export {
  sdkDisconnectGuidance,
  teamConfigGuidance,
  agentSessionGuidance,
  genericGuidance,
  formatGuidance,
} from './error-messages.js';
export type { ErrorGuidance } from './error-messages.js';
export {
  enableShellMetrics,
  recordShellSessionDuration,
  recordAgentResponseLatency,
  recordShellError,
  isShellTelemetryEnabled,
  _resetShellMetrics,
} from './shell-metrics.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { version: string };

/**
 * Approve all permission requests. CLI runs locally with user trust,
 * so no interactive confirmation is needed.
 */
const approveAllPermissions: SquadPermissionHandler = () => ({ kind: 'approved' });

/** Debug logger — writes to stderr only when SQUAD_DEBUG=1. */
function debugLog(...args: unknown[]): void {
  if (process.env['SQUAD_DEBUG'] === '1') {
    console.error('[SQUAD_DEBUG]', ...args);
  }
}

/** Options for ghost response retry. */
export interface GhostRetryOptions {
  maxRetries?: number;
  backoffMs?: readonly number[];
  onRetry?: (attempt: number, maxRetries: number) => void;
  onExhausted?: (maxRetries: number) => void;
  debugLog?: (...args: unknown[]) => void;
  promptPreview?: string;
}

/**
 * Retry a send function when the response is empty (ghost response).
 * Ghost responses occur when session.idle fires before assistant.message,
 * causing sendAndWait() to return undefined or empty content.
 */
export async function withGhostRetry(
  sendFn: () => Promise<string>,
  options: GhostRetryOptions = {},
): Promise<string> {
  const maxRetries = options.maxRetries ?? 3;
  const backoffMs = options.backoffMs ?? [1000, 2000, 4000];
  const log = options.debugLog ?? (() => {});
  const preview = options.promptPreview ?? '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      log('ghost response detected', {
        timestamp: new Date().toISOString(),
        attempt,
        promptPreview: preview.slice(0, 80),
      });
      options.onRetry?.(attempt, maxRetries);
      const delay = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 4000;
      await new Promise<void>(r => setTimeout(r, delay));
    }
    const result = await sendFn();
    if (result) return result;
  }

  log('ghost response: all retries exhausted', {
    timestamp: new Date().toISOString(),
    promptPreview: preview.slice(0, 80),
  });
  options.onExhausted?.(maxRetries);
  return '';
}

export async function runShell(): Promise<void> {
  // First-run check: before requiring a TTY, detect if no .squad/ exists locally.
  // In that case, output a plain-text welcome and init hint so non-interactive
  // contexts (pipes, tests, CI) see useful guidance rather than a TTY error.
  const cwd = process.cwd();
  const localSquad = resolveSquad(cwd);
  const globalSquadDir = join(resolveGlobalSquadPath(), '.squad');
  const hasAnySquad = !!localSquad || existsSync(globalSquadDir);

  if (!hasAnySquad && !process.stdin.isTTY) {
    console.log('Welcome to Squad\n');
    console.log('Get started by initializing your squad:');
    console.log('  squad init "describe what you want to build"\n');
    console.log('Or run: squad help');
    process.exit(0);
  }

  // Ink requires a TTY for raw mode input — bail out early when piped (#576)
  if (!process.stdin.isTTY) {
    console.error('✗ Squad shell requires an interactive terminal (TTY).');
    console.error('  Piped or redirected stdin is not supported.');
    console.error("  Tip: Run 'squad --preview' for non-interactive usage.");
    process.exit(1);
  }

  // Show immediate feedback — users need to see something within 100ms
  console.error('◆ Loading Squad shell...');

  // Configurable REPL timeout: SQUAD_REPL_TIMEOUT (seconds) > TIMEOUTS.SESSION_RESPONSE_MS (ms)
  const replTimeoutMs = (() => {
    const envSeconds = process.env['SQUAD_REPL_TIMEOUT'];
    if (envSeconds) {
      const parsed = parseInt(envSeconds, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed * 1000;
    }
    return TIMEOUTS.SESSION_RESPONSE_MS;
  })();
  debugLog('REPL timeout:', replTimeoutMs, 'ms');

  const sessionStart = Date.now();
  let messageCount = 0;

  const registry = new SessionRegistry();
  const renderer = new ShellRenderer();

  // Resolve teamRoot: local .squad/ → global squad → cwd (init mode)
  const teamRoot = (() => {
    const cwd = process.cwd();
    // 1. Walk up from cwd looking for a local .squad/
    const localSquad = resolveSquad(cwd);
    if (localSquad) {
      return pathResolve(localSquad, '..');
    }
    // 2. Fall back to global (personal) squad path
    const globalPath = resolveGlobalSquadPath();
    const globalSquadDir = join(globalPath, '.squad');
    if (existsSync(globalSquadDir)) {
      return globalPath;
    }
    // 3. No squad found — use cwd (triggers init mode)
    return cwd;
  })();

  // Session persistence — create or resume a previous session
  // Skip resume on first run (no team.md or .first-run marker present)
  const hasTeam = existsSync(join(teamRoot, '.squad', 'team.md'));
  const isFirstRun = existsSync(join(teamRoot, '.squad', '.first-run'));
  let persistedSession: SessionData = createSession();
  const recentSession = (hasTeam && !isFirstRun) ? loadLatestSession(teamRoot) : null;
  if (recentSession) {
    persistedSession = recentSession;
    debugLog('resuming recent session', persistedSession.id);
  }

  // Initialize OpenTelemetry if endpoint is configured (e.g. Aspire dashboard)
  const eventBus = new RuntimeEventBus();
  const telemetry = initSquadTelemetry({ serviceName: 'squad-cli', mode: 'cli', eventBus });
  if (telemetry.tracing || telemetry.metrics) {
    debugLog('🔭 Telemetry active — exporting to ' + process.env['OTEL_EXPORTER_OTLP_ENDPOINT']);
  }

  // Streaming pipeline for token usage and response latency metrics
  const streamingPipeline = new StreamingPipeline();

  // Shell-level observability metrics (auto-enabled when OTel is configured)
  const shellMetricsActive = enableShellMetrics();
  if (shellMetricsActive) {
    debugLog('shell observability metrics enabled');
  }

  // Initialize lifecycle — discover team agents
  const lifecycle = new ShellLifecycle({ teamRoot, renderer, registry });
  try {
    await lifecycle.initialize();
  } catch (err) {
    debugLog('lifecycle.initialize() failed:', err);
    // Non-fatal: shell works without discovered agents
  }

  // Create SDK client (auto-connects on first session creation)
  const client = new SquadClient({ cwd: teamRoot });

  let shellApi: ShellApi | undefined;
  let origAddMessage: ((msg: ShellMessage) => void) | undefined;
  const agentSessions = new Map<string, SquadSession>();
  let coordinatorSession: SquadSession | null = null;
  let activeInitSession: SquadSession | null = null;
  let pendingCastConfirmation: { proposal: CastProposal; parsed: ParsedInput } | null = null;

  // Eager SDK warm-up — start coordinator session before user's first message
  // This runs in background so UI renders immediately
  (async () => {
    try {
      debugLog('eager warm-up: creating coordinator session');
      const systemPrompt = buildCoordinatorPrompt({ teamRoot });
      coordinatorSession = await client.createSession({
        streaming: true,
        systemMessage: { mode: 'append', content: systemPrompt },
        workingDirectory: teamRoot,
        onPermissionRequest: approveAllPermissions,
      });
      debugLog('eager warm-up: coordinator session ready');
    } catch (err) {
      debugLog('eager warm-up failed (non-fatal, will retry on first dispatch):', err);
      // Non-fatal — first dispatch will create the session as before
    }
  })();

  const streamBuffers = new Map<string, string>();

  // StreamBridge wires streaming pipeline events into Ink component state.
  const _bridge = new StreamBridge(registry, {
    onContent: (agentName: string, delta: string) => {
      const existing = streamBuffers.get(agentName) ?? '';
      const accumulated = existing + delta;
      streamBuffers.set(agentName, accumulated);
      shellApi?.setStreamingContent({ agentName, content: accumulated });
      shellApi?.refreshAgents();
    },
    onComplete: (message) => {
      if (message.agentName) streamBuffers.delete(message.agentName);
      shellApi?.addMessage(message);
      shellApi?.refreshAgents();
    },
    onError: (agentName: string, error: Error) => {
      debugLog(`StreamBridge error for ${agentName}:`, error);
      streamBuffers.delete(agentName);
      const friendly = error.message.replace(/^Error:\s*/i, '');
      const guidance = agentSessionGuidance(agentName, friendly);
      shellApi?.addMessage({
        role: 'system',
        content: formatGuidance(guidance),
        timestamp: new Date(),
      });
    },
  });

  /** Extract text delta from an SDK session event. */
  function extractDelta(event: { type: string; [key: string]: unknown }): string {
    const val = event['deltaContent'] ?? event['delta'] ?? event['content'];
    const result = typeof val === 'string' ? val : '';
    debugLog('extractDelta', { type: event['type'], keys: Object.keys(event), hasDeltaContent: 'deltaContent' in event, result: result.slice(0, 80) });
    return result;
  }

  /**
   * Send a prompt and wait for the full streamed response.
   * Prefers sendAndWait (blocks until idle); falls back to sendMessage + turn_end event.
   * Returns the full response content from sendAndWait as a fallback string.
   */
  async function awaitStreamedResponse(session: SquadSession, prompt: string): Promise<string> {
    if (session.sendAndWait) {
      debugLog('awaitStreamedResponse: using sendAndWait');
      
      // ThinkingIndicator already shows elapsed time via its own timer;
      // no need to override the current activity hint with generic text.
      const result = await session.sendAndWait({ prompt }, replTimeoutMs);
      debugLog('awaitStreamedResponse: sendAndWait returned', {
        type: typeof result,
        keys: result ? Object.keys(result as Record<string, unknown>) : [],
        hasData: !!(result as Record<string, unknown> | undefined)?.['data'],
      });
      // Return full response content as fallback for when deltas weren't captured
      const data = (result as Record<string, unknown> | undefined)?.['data'] as Record<string, unknown> | undefined;
      const content = typeof data?.['content'] === 'string' ? data['content'] as string : '';
      debugLog('awaitStreamedResponse: fallback content length', content.length);
      return content;
    } else {
      const done = new Promise<void>((resolve) => {
        const onEnd = (): void => {
          try { session.off('turn_end', onEnd); } catch { /* ignore */ }
          try { session.off('idle', onEnd); } catch { /* ignore */ }
          resolve();
        };
        session.on('turn_end', onEnd);
        session.on('idle', onEnd);
      });
      await session.sendMessage({ prompt });
      await done;
      return '';
    }
  }

  /** Convenience wrapper for withGhostRetry with shell UI integration. */
  function ghostRetry(
    sendFn: () => Promise<string>,
    promptPreview: string,
  ): Promise<string> {
    return withGhostRetry(sendFn, {
      debugLog,
      promptPreview,
      onRetry: (attempt, max) => {
        const totalAttempts = max + 1; // max is retry count, +1 for initial attempt
        const currentAttempt = attempt + 1; // attempt is retry number, +1 for total attempt number
        shellApi?.addMessage({
          role: 'system',
          content: `⚠ Empty response detected. Retrying... (attempt ${currentAttempt}/${totalAttempts})`,
          timestamp: new Date(),
        });
      },
      onExhausted: (max) => {
        const totalAttempts = max + 1;
        shellApi?.addMessage({
          role: 'system',
          content: `❌ Agent did not respond after ${totalAttempts} attempts. Try again or run \`squad doctor\`.`,
          timestamp: new Date(),
        });
      },
    });
  }

  /**
   * Send a message to an agent session and stream the response.
   * 
   * **Streaming architecture:**
   * 1. Register `message_delta` listener BEFORE sending message (ensures we catch all deltas)
   * 2. Call `awaitStreamedResponse` which uses `sendAndWait` (blocks until session idle)
   * 3. Accumulate deltas into `accumulated` via the `onDelta` handler
   * 4. Fallback to `sendAndWait` result if no deltas were captured (ghost response handling)
   * 5. Remove listener in finally block to prevent memory leaks
   * 
   * Both agent and coordinator dispatch use identical event wiring patterns.
   */
  async function dispatchToAgent(agentName: string, message: string): Promise<void> {
    debugLog('dispatchToAgent:', agentName, message.slice(0, 120));
    const dispatchStartMs = Date.now();
    let firstTokenRecorded = false;
    let dispatchError = false;
    let session = agentSessions.get(agentName);
    if (!session) {
      shellApi?.setActivityHint(`Connecting to ${agentName}...`);
      shellApi?.setAgentActivity(agentName, 'connecting...');
      // Give React a tick to render the connection hint before blocking on SDK
      await new Promise(resolve => setImmediate(resolve));
      const charter = loadAgentCharter(agentName, teamRoot);
      const systemPrompt = buildAgentPrompt(charter);

      if (!registry.get(agentName)) {
        const roleMatch = charter.match(/^#\s+\w+\s+—\s+(.+)$/m);
        registry.register(agentName, roleMatch?.[1] ?? 'Agent');
      }

      session = await client.createSession({
        streaming: true,
        systemMessage: { mode: 'append', content: systemPrompt },
        workingDirectory: teamRoot,
        onPermissionRequest: approveAllPermissions,
      });
      agentSessions.set(agentName, session);
    }

    // Record agent spawn metric
    recordAgentSpawn(agentName, 'direct');
    // Attach streaming pipeline for token/latency metrics
    const sid = session.sessionId ?? `agent-${agentName}-${Date.now()}`;
    if (!streamingPipeline.isAttached(sid)) streamingPipeline.attachToSession(sid);
    streamingPipeline.markMessageStart(sid);

    registry.updateStatus(agentName, 'streaming');
    shellApi?.refreshAgents();
    shellApi?.setActivityHint(`${agentName} is thinking...`);
    shellApi?.setAgentActivity(agentName, 'thinking...');

    let accumulated = '';
    let deltaIndex = 0;
    const onDelta = (event: { type: string; [key: string]: unknown }): void => {
      debugLog('agent onDelta fired', agentName, { eventType: event['type'] });
      const delta = extractDelta(event);
      if (!delta) return;
      if (!firstTokenRecorded) {
        firstTokenRecorded = true;
        recordAgentResponseLatency(agentName, Date.now() - dispatchStartMs, 'direct');
      }
      // Feed delta to streaming pipeline for TTFT/latency metrics
      streamingPipeline.processEvent({
        type: 'message_delta',
        sessionId: sid,
        agentName,
        content: delta,
        index: deltaIndex++,
        timestamp: new Date(),
      });
      accumulated += delta;
      shellApi?.setStreamingContent({ agentName, content: accumulated });
      shellApi?.setActivityHint(undefined); // Clear hint once content is flowing
    };

    // Listen for usage events to record token metrics and capture model name
    const onUsage = (event: { type: string; [key: string]: unknown }): void => {
      const inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
      const outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
      const model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
      const estimatedCost = typeof event['estimatedCost'] === 'number' ? event['estimatedCost'] : 0;
      // Update model display in agent panel
      registry.updateModel(agentName, model);
      shellApi?.refreshAgents();
      // Feed usage to streaming pipeline for token/duration metrics
      streamingPipeline.processEvent({
        type: 'usage',
        sessionId: sid,
        agentName,
        model,
        inputTokens,
        outputTokens,
        estimatedCost,
        timestamp: new Date(),
      } as UsageEvent);
    };

    session.on('message_delta', onDelta);
    try { session.on('usage', onUsage); } catch { /* event may not exist */ }
    // Listen for tool/activity events to show Copilot-style hints
    const onToolCall = (event: { type: string; [key: string]: unknown }): void => {
      const toolName = event['toolName'] ?? event['name'] ?? event['tool'];
      if (typeof toolName === 'string') {
        const hintMap: Record<string, string> = {
          'read_file': 'Reading file...',
          'write_file': 'Writing file...',
          'edit_file': 'Editing file...',
          'run_command': 'Running command...',
          'search': 'Searching codebase...',
          'spawn_agent': `Spawning specialist...`,
          'analyze': 'Analyzing dependencies...',
        };
        const hint = hintMap[toolName] ?? `Using ${toolName}...`;
        shellApi?.setActivityHint(hint);
        registry.updateActivityHint(agentName, hint.replace(/\.\.\.$/, ''));
        shellApi?.setAgentActivity(agentName, hint.replace(/\.\.\.$/, '').toLowerCase());
        shellApi?.refreshAgents();
      }
    };
    try { session.on('tool_call', onToolCall); } catch { /* event may not exist */ }
    try {
      accumulated = await ghostRetry(async () => {
        accumulated = '';
        deltaIndex = 0;
        const fallback = await awaitStreamedResponse(session, message);
        debugLog('agent dispatch:', agentName, 'accumulated length', accumulated.length, 'fallback length', fallback.length);
        if (!accumulated && fallback) accumulated = fallback;
        return accumulated;
      }, message);
    } catch (err) {
      dispatchError = true;
      // Evict dead session so next attempt creates a fresh one
      debugLog('dispatchToAgent: evicting dead session for', agentName, err);
      recordShellError('agent_dispatch', agentName);
      recordAgentError(agentName, 'dispatch_failure');
      agentSessions.delete(agentName);
      streamBuffers.delete(agentName);
      throw err;
    } finally {
      try { session.off('message_delta', onDelta); } catch { /* session may not support off */ }
      try { session.off('usage', onUsage); } catch { /* ignore */ }
      try { session.off('tool_call', onToolCall); } catch { /* ignore */ }
      // Record agent duration and destroy metrics
      const durationMs = Date.now() - dispatchStartMs;
      recordAgentDuration(agentName, durationMs, dispatchError ? 'error' : 'success');
      recordAgentDestroy(agentName);
      streamingPipeline.detachFromSession(sid);
      shellApi?.clearAgentStream(agentName);
      shellApi?.setActivityHint(undefined);
      shellApi?.setAgentActivity(agentName, undefined);
      if (accumulated) {
        shellApi?.addMessage({
          role: 'agent',
          agentName,
          content: accumulated,
          timestamp: new Date(),
        });
      }
      registry.updateStatus(agentName, 'idle');
      shellApi?.refreshAgents();
    }
  }

  /**
   * Send a message through the coordinator and route based on response.
   * 
   * **Streaming architecture:**
   * 1. Create coordinator session with `streaming: true` config
   * 2. Register `message_delta` listener BEFORE sending message (ensures we catch all deltas)
   * 3. Call `awaitStreamedResponse` which uses `sendAndWait` (blocks until session idle)
   * 4. Accumulate deltas into `accumulated` via the `onDelta` handler
   * 5. Fallback to `sendAndWait` result if no deltas were captured (ghost response handling)
   * 6. Remove listener in finally block to prevent memory leaks
   * 7. Parse accumulated response and route to agents or show direct answer
   * 
   * Event wiring is identical to `dispatchToAgent` — both use the same `message_delta` pattern.
   */

  /** Extract a meaningful activity description from coordinator text near an agent name mention. */
  function extractAgentHint(text: string, agentName: string): string {
    const lower = text.toLowerCase();
    const nameIdx = lower.lastIndexOf(agentName.toLowerCase());
    if (nameIdx === -1) return 'working...';
    const afterName = text.slice(nameIdx + agentName.length, nameIdx + agentName.length + 120);
    const patterns = [
      /^\s*(?:is|will|should|can)\s+(\w[\w\s,'-]{3,50}?)(?:[.\n;]|$)/i,
      /^\s*[:\-→—]+\s*(\w[\w\s,'-]{3,50}?)(?:[.\n;]|$)/i,
      /^\s+(?:to|for)\s+(\w[\w\s,'-]{3,50}?)(?:[.\n;]|$)/i,
    ];
    for (const pattern of patterns) {
      const match = afterName.match(pattern);
      if (match?.[1]) {
        let hint = match[1].trim().replace(/[.…,;:\-]+$/, '').trim();
        if (hint.length > 45) hint = hint.slice(0, 42) + '...';
        return hint.charAt(0).toUpperCase() + hint.slice(1);
      }
    }
    return 'working...';
  }

  async function dispatchToCoordinator(message: string): Promise<void> {
    debugLog('dispatchToCoordinator: sending message', message.slice(0, 120));
    const coordStartMs = Date.now();
    let coordFirstToken = false;
    let coordError = false;
    if (!coordinatorSession) {
      shellApi?.setActivityHint('Connecting to SDK...');
      // Give React a tick to render the connection hint before blocking on SDK
      await new Promise(resolve => setImmediate(resolve));
      const systemPrompt = buildCoordinatorPrompt({ teamRoot });
      coordinatorSession = await client.createSession({
        streaming: true,
        systemMessage: { mode: 'append', content: systemPrompt },
        workingDirectory: teamRoot,
        onPermissionRequest: approveAllPermissions,
      });
      debugLog('coordinator session created:', {
        sessionId: coordinatorSession.sessionId,
        hasOn: typeof coordinatorSession.on === 'function',
        hasSendAndWait: typeof coordinatorSession.sendAndWait === 'function',
      });
    }
    shellApi?.setActivityHint('Coordinator is thinking...');

    // Record coordinator spawn metric
    recordAgentSpawn('coordinator', 'coordinator');
    const coordSid = coordinatorSession.sessionId ?? `coordinator-${Date.now()}`;
    if (!streamingPipeline.isAttached(coordSid)) streamingPipeline.attachToSession(coordSid);
    streamingPipeline.markMessageStart(coordSid);

    // Build a set of known agent names for detecting mentions in coordinator text
    const knownAgentNames = registry.getAll().map(a => a.name.toLowerCase());

    let accumulated = '';
    let coordDeltaIndex = 0;
    const onDelta = (event: { type: string; [key: string]: unknown }): void => {
      debugLog('coordinator onDelta fired', { eventType: event['type'] });
      const delta = extractDelta(event);
      if (!delta) return;
      if (!coordFirstToken) {
        coordFirstToken = true;
        recordAgentResponseLatency('coordinator', Date.now() - coordStartMs, 'coordinator');
      }
      // Feed delta to streaming pipeline for TTFT/latency metrics
      streamingPipeline.processEvent({
        type: 'message_delta',
        sessionId: coordSid,
        agentName: 'coordinator',
        content: delta,
        index: coordDeltaIndex++,
        timestamp: new Date(),
      });
      accumulated += delta;
      // Don't push coordinator routing text to streamingContent — it's internal
      // routing instructions, not user-facing content. Keeping streamingContent
      // empty lets the ThinkingIndicator stay visible with the "Routing..." hint.

      // Parse streaming text for agent name mentions → update AgentPanel
      for (const name of knownAgentNames) {
        if (delta.toLowerCase().includes(name)) {
          const displayName = registry.get(name)?.name ?? name;
          registry.updateStatus(name, 'working');
          // Extract task description from accumulated coordinator text
          const hint = extractAgentHint(accumulated, name);
          registry.updateActivityHint(name, hint);
          shellApi?.setActivityHint(`${displayName} — ${hint}`);
          shellApi?.setAgentActivity(name, hint);
          shellApi?.refreshAgents();
        }
      }
    };

    // Listen for usage events to record token metrics
    const onCoordUsage = (event: { type: string; [key: string]: unknown }): void => {
      const inputTokens = typeof event['inputTokens'] === 'number' ? event['inputTokens'] : 0;
      const outputTokens = typeof event['outputTokens'] === 'number' ? event['outputTokens'] : 0;
      const model = typeof event['model'] === 'string' ? event['model'] : 'unknown';
      const estimatedCost = typeof event['estimatedCost'] === 'number' ? event['estimatedCost'] : 0;
      streamingPipeline.processEvent({
        type: 'usage',
        sessionId: coordSid,
        agentName: 'coordinator',
        model,
        inputTokens,
        outputTokens,
        estimatedCost,
        timestamp: new Date(),
      } as UsageEvent);
    };

    // Listen for tool/activity events (same pattern as dispatchToAgent)
    const onToolCall = (event: { type: string; [key: string]: unknown }): void => {
      const toolName = event['toolName'] ?? event['name'] ?? event['tool'];
      if (typeof toolName === 'string') {
        const hintMap: Record<string, string> = {
          'read_file': 'Reading file...',
          'write_file': 'Writing file...',
          'edit_file': 'Editing file...',
          'run_command': 'Running command...',
          'search': 'Searching codebase...',
          'spawn_agent': 'Spawning agent...',
          'task': 'Dispatching to agent...',
          'analyze': 'Analyzing dependencies...',
        };
        // Try to extract agent name from task description (e.g., "🔧 Morpheus: Building effects")
        const desc = typeof event['description'] === 'string' ? event['description'] as string : '';
        const agentMatch = desc.match(/^\S*\s*(\w+):/);
        const matchedAgent = agentMatch?.[1]?.toLowerCase();
        if (matchedAgent && knownAgentNames.includes(matchedAgent)) {
          registry.updateStatus(matchedAgent, 'working');
          const taskSummary = desc.replace(/^\S*\s*\w+:\s*/, '').slice(0, 60);
          registry.updateActivityHint(matchedAgent, taskSummary || 'working...');
          shellApi?.setActivityHint(`${registry.get(matchedAgent)?.name ?? matchedAgent} — ${taskSummary || 'working'}...`);
          shellApi?.setAgentActivity(matchedAgent, taskSummary || 'working...');
          shellApi?.refreshAgents();
        } else {
          const hint = hintMap[toolName] ?? `Using ${toolName}...`;
          shellApi?.setActivityHint(hint);
        }
      }
    };

    const activeCoordSession = coordinatorSession;
    // Wire event listeners BEFORE sending the message to ensure we catch all events
    activeCoordSession.on('message_delta', onDelta);
    try { activeCoordSession.on('usage', onCoordUsage); } catch { /* event may not exist */ }
    try { activeCoordSession.on('tool_call', onToolCall); } catch { /* event may not exist */ }
    debugLog('coordinator message_delta + usage + tool_call listeners registered');
    try {
      accumulated = await ghostRetry(async () => {
        accumulated = '';
        coordDeltaIndex = 0;
        debugLog('coordinator: starting awaitStreamedResponse');
        const fallback = await awaitStreamedResponse(activeCoordSession, message);
        debugLog('coordinator dispatch: accumulated length', accumulated.length, 'fallback length', fallback.length);
        if (!accumulated && fallback) {
          debugLog('coordinator: using sendAndWait fallback content');
          accumulated = fallback;
        }
        return accumulated;
      }, message);
      debugLog('coordinator: final accumulated length', accumulated.length);
    } catch (err) {
      coordError = true;
      // Evict dead coordinator session so next attempt creates a fresh one
      debugLog('dispatchToCoordinator: evicting dead coordinator session', err);
      recordShellError('coordinator_dispatch');
      recordAgentError('coordinator', 'dispatch_failure');
      coordinatorSession = null;
      streamBuffers.delete('coordinator');
      throw err;
    } finally {
      try { 
        activeCoordSession.off('message_delta', onDelta); 
        debugLog('coordinator message_delta listener removed');
      } catch { /* session may not support off */ }
      try { activeCoordSession.off('usage', onCoordUsage); } catch { /* ignore */ }
      try { activeCoordSession.off('tool_call', onToolCall); } catch { /* ignore */ }
      // Record coordinator duration and destroy metrics
      const coordDurationMs = Date.now() - coordStartMs;
      recordAgentDuration('coordinator', coordDurationMs, coordError ? 'error' : 'success');
      recordAgentDestroy('coordinator');
      streamingPipeline.detachFromSession(coordSid);
      shellApi?.clearAgentStream('coordinator');
      // Reset any agents that were marked working during coordinator dispatch
      for (const name of knownAgentNames) {
        const agent = registry.get(name);
        if (agent && (agent.status === 'working' || agent.status === 'streaming')) {
          registry.updateStatus(name, 'idle');
          shellApi?.setAgentActivity(name, undefined);
        }
      }
      // Re-sync registry from team.md for any new agents added by coordinator
      const freshRoster = loadWelcomeData(teamRoot);
      if (freshRoster) {
        for (const agent of freshRoster.agents) {
          const lname = agent.name.toLowerCase();
          if (!registry.get(lname)) {
            registry.register(agent.name, agent.role);
          }
        }
      }
      shellApi?.refreshWelcome();
      shellApi?.refreshAgents();
    }

    // Parse routing decision from coordinator response
    debugLog('coordinator accumulated (first 200 chars)', accumulated.slice(0, 200));
    const decision = parseCoordinatorResponse(accumulated);
    debugLog('coordinator decision', { type: decision.type, hasRoutes: !!(decision.routes?.length), hasDirectAnswer: !!decision.directAnswer });

    if (decision.type === 'route' && decision.routes?.length) {
      for (const route of decision.routes) {
        shellApi?.addMessage({
          role: 'system',
          content: `📌 Routing to ${route.agent}: ${route.task}`,
          timestamp: new Date(),
        });
        const taskMsg = route.context ? `${route.task}\n\nContext: ${route.context}` : route.task;
        await dispatchToAgent(route.agent, taskMsg);
      }
    } else if (decision.type === 'multi' && decision.routes?.length) {
      for (const route of decision.routes) {
        shellApi?.addMessage({
          role: 'system',
          content: `📌 Routing to ${route.agent}: ${route.task}`,
          timestamp: new Date(),
        });
      }
      await Promise.allSettled(
        decision.routes.map(r => dispatchToAgent(r.agent, r.task))
      );
    } else {
      // Direct answer or fallback — show coordinator response
      shellApi?.addMessage({
        role: 'agent',
        agentName: 'coordinator',
        content: decision.directAnswer ?? accumulated,
        timestamp: new Date(),
      });
    }
  }

  /** Cancel all active operations (called on Ctrl+C during processing). */
  async function handleCancel(): Promise<void> {
    debugLog('handleCancel: aborting active sessions');

    // Abort init session if active
    if (activeInitSession) {
      try { await activeInitSession.abort?.(); debugLog('aborted init session'); } catch (err) { debugLog('abort init failed:', err); }
      activeInitSession = null;
    }

    // Clear pending cast confirmation
    pendingCastConfirmation = null;

    // Abort coordinator session
    if (coordinatorSession) {
      try { await coordinatorSession.abort?.(); } catch (err) { debugLog('abort coordinator failed:', err); }
    }

    // Abort all agent sessions
    for (const [name, session] of agentSessions) {
      try { await session.abort?.(); debugLog(`aborted session: ${name}`); } catch (err) { debugLog(`abort ${name} failed:`, err); }
    }

    // Clear streaming state
    streamBuffers.clear();
    shellApi?.setStreamingContent(null);
    shellApi?.setActivityHint(undefined);
    shellApi?.addMessage({
      role: 'system',
      content: 'Operation cancelled.',
      timestamp: new Date(),
    });
  }

  /**
   * Init Mode — cast a team when the roster is empty.
   * Creates a temporary coordinator session with Init Mode instructions,
   * sends the user's message, parses the team proposal, creates files,
   * and then re-dispatches the original message to the now-populated team.
   */
  async function handleInitCast(parsed: ParsedInput, skipConfirmation?: boolean): Promise<void> {
    debugLog('handleInitCast: entering Init Mode');
    shellApi?.setProcessing(true);

    // Check for a stored init prompt (from `squad init "prompt"`)
    const initPromptFile = join(teamRoot, '.squad', '.init-prompt');
    let castPrompt = parsed.raw;
    if (existsSync(initPromptFile)) {
      const storedPrompt = readFileSync(initPromptFile, 'utf-8').trim();
      if (storedPrompt) {
        debugLog('handleInitCast: using stored init prompt', storedPrompt.slice(0, 100));
        castPrompt = storedPrompt;
      }
    }

    shellApi?.addMessage({
      role: 'system',
      content: '🏗️ No team yet — casting one based on your project...',
      timestamp: new Date(),
    });
    shellApi?.setActivityHint('Casting your team...');

    // Create a temporary Init Mode coordinator session
    let initSession: SquadSession | null = null;
    try {
      const initSysPrompt = buildInitModePrompt({ teamRoot });
      initSession = await client.createSession({
        streaming: true,
        systemMessage: { mode: 'append', content: initSysPrompt },
        workingDirectory: teamRoot,
        onPermissionRequest: approveAllPermissions,
      });
      activeInitSession = initSession;
      debugLog('handleInitCast: init session created');

      // Send the prompt and collect the response
      let accumulated = '';
      const onDelta = (event: { type: string; [key: string]: unknown }): void => {
        const delta = extractDelta(event);
        if (delta) accumulated += delta;
      };

      initSession.on('message_delta', onDelta);
      try {
        accumulated = await ghostRetry(async () => {
          accumulated = '';
          const fallback = await awaitStreamedResponse(initSession!, castPrompt);
          if (!accumulated && fallback) accumulated = fallback;
          return accumulated;
        }, castPrompt);
      } finally {
        try { initSession.off('message_delta', onDelta); } catch { /* ignore */ }
      }

      debugLog('handleInitCast: response length', accumulated.length);
      debugLog('handleInitCast: response preview', accumulated.slice(0, 500));

      // Parse the team proposal
      const proposal = parseCastResponse(accumulated);
      if (!proposal) {
        debugLog('handleInitCast: failed to parse team from response');
        debugLog('handleInitCast: full response:', accumulated);
        shellApi?.addMessage({
          role: 'system',
          content: [
            '⚠ Could not parse a team proposal from the model response.',
            '',
            'Try again, or run: squad init "describe your project"',
          ].join('\n'),
          timestamp: new Date(),
        });
        return;
      }

      // Show the proposed team
      shellApi?.addMessage({
        role: 'agent',
        agentName: 'coordinator',
        content: `Team proposed:\n\n${formatCastSummary(proposal)}\n\nUniverse: ${proposal.universe}`,
        timestamp: new Date(),
      });

      // Close the init session — it's no longer needed after parsing the proposal
      try { await initSession.close?.(); } catch { /* ignore */ }
      initSession = null;
      activeInitSession = null;

      // P2: Cast confirmation — require user approval for freeform REPL casts
      if (!skipConfirmation) {
        shellApi?.addMessage({
          role: 'system',
          content: 'Look good? Type **y** to confirm or **n** to cancel.',
          timestamp: new Date(),
        });
        pendingCastConfirmation = { proposal, parsed };
        shellApi?.setActivityHint(undefined);
        shellApi?.setProcessing(false);
        return;
      }

      // Auto-confirmed path (auto-cast or /init command) — create team immediately
      await finalizeCast(proposal, parsed);

    } catch (err) {
      debugLog('handleInitCast error:', err);
      recordShellError('init_cast', err instanceof Error ? err.constructor.name : 'unknown');
      shellApi?.addMessage({
        role: 'system',
        content: `⚠ Team casting failed: ${err instanceof Error ? err.message : String(err)}\nTry again or edit .squad/team.md directly.`,
        timestamp: new Date(),
      });
    } finally {
      if (initSession) {
        try { await initSession.close?.(); } catch { /* ignore */ }
      }
      activeInitSession = null;
      shellApi?.setActivityHint(undefined);
      shellApi?.setProcessing(false);
    }
  }

  /**
   * Finalize a confirmed cast — create team files, register agents, re-dispatch.
   * Shared by the auto-confirmed path and the pending-confirmation accept path.
   */
  async function finalizeCast(proposal: CastProposal, parsed: ParsedInput): Promise<void> {
    shellApi?.setActivityHint('Creating team files...');

    const result = await createTeam(teamRoot, proposal);
    debugLog('finalizeCast: team created', {
      members: result.membersCreated.length,
      files: result.filesCreated.length,
    });

    shellApi?.addMessage({
      role: 'system',
      content: `✅ Team hired! ${result.membersCreated.length} members created.`,
      timestamp: new Date(),
    });

    // Clean up stored init prompt (it's been consumed)
    const initPromptFile = join(teamRoot, '.squad', '.init-prompt');
    if (existsSync(initPromptFile)) {
      try { unlinkSync(initPromptFile); } catch { /* ignore */ }
    }

    // Invalidate the old coordinator session so the next dispatch builds one
    // with the real team roster
    if (coordinatorSession) {
      try { await coordinatorSession.abort?.(); } catch { /* ignore */ }
      coordinatorSession = null;
      streamBuffers.delete('coordinator');
    }

    // Register the new agents in the session registry
    for (const member of proposal.members) {
      const roleName = member.role || 'Agent';
      registry.register(member.name, roleName);
    }

    // Refresh the header box to show new team roster
    shellApi?.refreshWelcome();
    shellApi?.setActivityHint('Routing your message to the team...');

    // Re-dispatch the original message — now with a populated roster
    shellApi?.addMessage({
      role: 'system',
      content: '📌 Routing your message to the team now...',
      timestamp: new Date(),
    });
    await dispatchToCoordinator(parsed.content ?? parsed.raw);
    shellApi?.setActivityHint(undefined);
  }

  /** Handle dispatching parsed input to agents or coordinator. */
  async function handleDispatch(parsed: ParsedInput): Promise<void> {
    // P2: Handle pending cast confirmation before any other dispatch
    if (pendingCastConfirmation) {
      const input = parsed.raw.trim().toLowerCase();
      const { proposal, parsed: originalParsed } = pendingCastConfirmation;
      pendingCastConfirmation = null;
      if (input === 'y' || input === 'yes') {
        try {
          await finalizeCast(proposal, originalParsed);
        } catch (err) {
          debugLog('finalizeCast error:', err);
          recordShellError('init_cast', err instanceof Error ? err.constructor.name : 'unknown');
          shellApi?.addMessage({
            role: 'system',
            content: `⚠ Team casting failed: ${err instanceof Error ? err.message : String(err)}\nTry again or edit .squad/team.md directly.`,
            timestamp: new Date(),
          });
        }
      } else {
        shellApi?.addMessage({
          role: 'system',
          content: 'Cast cancelled. Describe what you\'re building to try again.',
          timestamp: new Date(),
        });
      }
      return;
    }

    // Guard: require a Squad team before processing work requests
    const teamFile = join(teamRoot, '.squad', 'team.md');
    if (!existsSync(teamFile)) {
      shellApi?.addMessage({
        role: 'system',
        content: '\u26A0 No Squad team found. Run /init to create your team first.',
        timestamp: new Date(),
      });
      return;
    }

    // Check if roster is actually populated — if not, enter Init Mode (cast a team)
    const teamContent = readFileSync(teamFile, 'utf-8');
    if (!hasRosterEntries(teamContent)) {
      await handleInitCast(parsed, parsed.skipCastConfirmation);
      return;
    }

    messageCount++;
    try {
      // Check for multiple @agent mentions for parallel dispatch
      const knownAgents = registry.getAll().map(s => s.name);
      const targets = parseDispatchTargets(parsed.raw, knownAgents);

      if (targets.agents.length > 1) {
        debugLog('handleDispatch: multi-agent dispatch detected', {
          agents: targets.agents,
          contentPreview: targets.content.slice(0, 80),
        });
        for (const agent of targets.agents) {
          shellApi?.addMessage({
            role: 'system',
            content: `📌 Dispatching to ${agent} (parallel)`,
            timestamp: new Date(),
          });
        }
        const results = await Promise.allSettled(
          targets.agents.map(agent => dispatchToAgent(agent, targets.content || parsed.raw))
        );
        for (let i = 0; i < results.length; i++) {
          const r = results[i]!;
          if (r.status === 'rejected') {
            debugLog('handleDispatch: parallel agent failed', targets.agents[i], r.reason);
            shellApi?.addMessage({
              role: 'system',
              content: `⚠ ${targets.agents[i]} failed: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`,
              timestamp: new Date(),
            });
          }
        }
      } else if (parsed.type === 'direct_agent' && parsed.agentName) {
        debugLog('handleDispatch: single agent dispatch', { agent: parsed.agentName });
        await dispatchToAgent(parsed.agentName, parsed.content ?? parsed.raw);
      } else if (parsed.type === 'coordinator') {
        debugLog('handleDispatch: routing through coordinator');
        await dispatchToCoordinator(parsed.content ?? parsed.raw);
      }
    } catch (err) {
      debugLog('handleDispatch error:', err);
      recordShellError('dispatch', err instanceof Error ? err.constructor.name : 'unknown');
      const errorMsg = err instanceof Error ? err.message : String(err);
      const friendly = errorMsg.replace(/^Error:\s*/i, '');
      // Only show raw error detail when SQUAD_DEBUG=1; otherwise keep it generic
      const detail = process.env['SQUAD_DEBUG'] === '1' ? friendly : 'Something went wrong processing your message.';
      if (shellApi) {
        const guidance = genericGuidance(detail);
        shellApi.addMessage({
          role: 'system',
          content: formatGuidance(guidance),
          timestamp: new Date(),
        });
      }
    }
  }

  /** Auto-save session when messages change. */
  let shellMessages: ShellMessage[] = [];
  function autoSave(): void {
    persistedSession.messages = shellMessages;
    try { saveSession(teamRoot, persistedSession); } catch (err) { debugLog('autoSave failed:', err); }
  }

  /** Callback for /resume command — replaces current messages with restored session. */
  function onRestoreSession(session: SessionData): void {
    persistedSession = session;
    // Clear old messages and terminal to prevent content bleed-through
    shellApi?.clearMessages();
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    // Use unwrapped addMessage to avoid per-message autoSave and duplicate pushes
    for (const msg of session.messages) {
      origAddMessage?.(msg);
    }
    shellMessages = [...session.messages];
    autoSave();
  }

  // Clear terminal and scrollback — prevents old scaffold output from
  // bleeding through above the header box in extended sessions.
  process.stdout.write('\x1b[2J\x1b[3J\x1b[H');

  const { waitUntilExit } = render(
    React.createElement(ErrorBoundary, null,
      React.createElement(App, {
        registry,
        renderer,
        teamRoot,
        version: pkg.version,
        onReady: (api: ShellApi) => {
          // Wrap addMessage to auto-save on every message
          const origAdd = api.addMessage;
          origAddMessage = origAdd;
          api.addMessage = (msg: ShellMessage) => {
            origAdd(msg);
            shellMessages.push(msg);
            autoSave();
          };
          shellApi = api;

          // Restore messages from resumed session
          if (recentSession && recentSession.messages.length > 0) {
            for (const msg of recentSession.messages) {
              origAdd(msg);
            }
            shellMessages = [...recentSession.messages];
            origAdd({
              role: 'system',
              content: `✓ Resumed session ${recentSession.id.slice(0, 8)} (${recentSession.messages.length} messages)`,
              timestamp: new Date(),
            });
          }

          // Bug fix #3: Clean up orphan .init-prompt if team already exists
          const initPromptPath = join(teamRoot, '.squad', '.init-prompt');
          const teamFilePath = join(teamRoot, '.squad', 'team.md');
          if (existsSync(teamFilePath)) {
            const tc = readFileSync(teamFilePath, 'utf-8');
            if (hasRosterEntries(tc) && existsSync(initPromptPath)) {
              debugLog('Cleaning up orphan .init-prompt (team already exists)');
              try { unlinkSync(initPromptPath); } catch { /* ignore */ }
            }
          }

          // Bug fix #1: Auto-cast after shellApi is guaranteed to be set (no race condition)
          if (existsSync(initPromptPath) && existsSync(teamFilePath)) {
            const tc = readFileSync(teamFilePath, 'utf-8');
            if (!hasRosterEntries(tc)) {
              const storedPrompt = readFileSync(initPromptPath, 'utf-8').trim();
              if (storedPrompt) {
                debugLog('Auto-cast: .init-prompt found with empty roster, triggering cast');
                // Trigger cast after Ink settles, but now shellApi is guaranteed to be set
                setTimeout(() => {
                  handleInitCast({ type: 'coordinator', raw: storedPrompt, content: storedPrompt }, true).catch(err => {
                    debugLog('Auto-cast error:', err);
                  });
                }, 100);
              }
            }
          }
        },
        onDispatch: handleDispatch,
        onCancel: handleCancel,
        onRestoreSession,
      }),
    ),
    { exitOnCtrlC: false, patchConsole: false },
  );

  // Clear the loading message now that Ink is rendering
  process.stderr.write('\r\x1b[K');

  await waitUntilExit();

  // Record shell session duration before cleanup
  recordShellSessionDuration(Date.now() - sessionStart);

  // Final session save before cleanup
  autoSave();

  // Consult mode reminder: prompt user to extract learnings before exiting
  try {
    const squadDir = pathResolve(process.cwd(), '.squad');
    const configPath = join(squadDir, 'config.json');
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && (parsed as { consult?: boolean }).consult === true) {
        const nc = process.env['NO_COLOR'] != null && process.env['NO_COLOR'] !== '';
        const highlight = nc ? '' : '\x1b[33m';
        const reset = nc ? '' : '\x1b[0m';
        console.log('');
        console.log(`${highlight}📤 You're in consult mode.${reset}`);
        console.log(`   Run ${highlight}squad extract${reset} to bring learnings home.`);
        console.log(`   Run ${highlight}squad extract --clean${reset} to extract and remove project .squad/`);
        console.log('');
      }
    }
  } catch {
    // Silently ignore — consult mode check is optional
  }

  // Cleanup: close all sessions and disconnect
  for (const [name, session] of agentSessions) {
    try { await session.close(); } catch (err) { debugLog(`Failed to close session for ${name}:`, err); }
  }
  // coordinatorSession is assigned inside dispatchToCoordinator closure;
  // TS control flow can't see the mutation, so assert the type.
  const coordSession = coordinatorSession as SquadSession | null;
  if (coordSession) {
    try { await coordSession.close(); } catch (err) { debugLog('Failed to close coordinator session:', err); }
  }
  try { await client.disconnect(); } catch (err) { debugLog('Failed to disconnect client:', err); }
  try { await lifecycle.shutdown(); } catch (err) { debugLog('Failed to shutdown lifecycle:', err); }
  try { await telemetry.shutdown(); } catch (err) { debugLog('Failed to shutdown telemetry:', err); }

  // NO_COLOR-aware exit message with session summary
  const nc = process.env['NO_COLOR'] != null && process.env['NO_COLOR'] !== '';
  const prefix = nc ? '-- ' : '\x1b[36m--\x1b[0m ';

  if (messageCount > 0) {
    const elapsedMs = Date.now() - sessionStart;
    const mins = Math.round(elapsedMs / 60000);
    const durationStr = mins >= 1 ? `${mins} min` : '<1 min';
    const agentNames = [...agentSessions.keys()];
    const agentStr = agentNames.length > 0 ? ` with ${agentNames.join(', ')}.` : '';
    console.log(`${prefix}Squad out. ${durationStr}${agentStr} ${messageCount} message${messageCount === 1 ? '' : 's'}.`);
  } else {
    console.log(`${prefix}Squad out.`);
  }
}
