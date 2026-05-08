/**
 * Direct API Session
 *
 * Implements SquadSession for providers that call LLM APIs directly
 * (Anthropic, Google) rather than delegating to an SDK that manages
 * the agentic loop internally (Copilot SDK).
 *
 * Manages in-memory conversation history and drives the AgenticLoop.
 *
 * @module adapter/direct-session
 */

import { randomUUID } from 'node:crypto';
import type {
  SquadSession,
  SquadSessionEvent,
  SquadSessionEventHandler,
  SquadSessionEventType,
  SquadMessageOptions,
  SquadTool,
  SquadSessionHooks,
  SquadSystemMessageConfig,
} from './types.js';
import {
  runAgenticLoop,
  type LLMApiAdapter,
  type LLMMessage,
  type LLMContentBlock,
} from './agentic-loop.js';

// ---------------------------------------------------------------------------
// DirectApiSession
// ---------------------------------------------------------------------------

export interface DirectApiSessionOptions {
  adapter: LLMApiAdapter;
  model: string;
  tools: SquadTool<any>[];
  systemMessage?: SquadSystemMessageConfig;
  sessionId?: string;
  maxIterations?: number;
  maxTokens?: number;
  reasoningEffort?: string;
  hooks?: SquadSessionHooks;
}

export class DirectApiSession implements SquadSession {
  readonly sessionId: string;

  private adapter: LLMApiAdapter;
  private model: string;
  private tools: SquadTool<any>[];
  private systemPrompt: string | undefined;
  private maxIterations: number;
  private maxTokens: number | undefined;
  private reasoningEffort: string | undefined;
  private hooks: SquadSessionHooks | undefined;
  private messages: LLMMessage[] = [];
  private abortController: AbortController | null = null;
  private listeners = new Map<string, Set<SquadSessionEventHandler>>();
  private closed = false;

  constructor(options: DirectApiSessionOptions) {
    this.sessionId = options.sessionId ?? randomUUID();
    this.adapter = options.adapter;
    this.model = options.model;
    this.tools = options.tools;
    this.maxIterations = options.maxIterations ?? 25;
    this.maxTokens = options.maxTokens;
    this.reasoningEffort = options.reasoningEffort;
    this.hooks = options.hooks;

    if (options.systemMessage) {
      if (options.systemMessage.mode === 'replace') {
        this.systemPrompt = options.systemMessage.content;
      } else {
        this.systemPrompt = options.systemMessage.content;
      }
    }
  }

  async sendMessage(options: SquadMessageOptions): Promise<void> {
    if (this.closed) throw new Error('Session is closed');

    this.abortController = new AbortController();

    // Build user message content
    let userContent = options.prompt;
    if (options.attachments?.length) {
      const attachmentText = options.attachments
        .map((a) => {
          if (a.type === 'selection' && a.text) {
            return `\n[Selection from ${a.filePath}${a.displayName ? ` (${a.displayName})` : ''}]:\n${a.text}`;
          }
          if (a.type === 'file' || a.type === 'directory') {
            return `\n[Attached ${a.type}: ${a.path}]`;
          }
          return '';
        })
        .join('');
      userContent += attachmentText;
    }

    // Append user message to conversation
    this.messages.push({
      role: 'user',
      content: [{ type: 'text', text: userContent }],
    });

    const result = await runAgenticLoop(
      {
        adapter: this.adapter,
        tools: this.tools,
        model: this.model,
        systemPrompt: this.systemPrompt,
        maxIterations: this.maxIterations,
        maxTokens: this.maxTokens,
        reasoningEffort: this.reasoningEffort,
        hooks: this.hooks,
        sessionId: this.sessionId,
        signal: this.abortController.signal,
      },
      (event) => this.emit(event),
    );

    // Replace local messages with the full conversation from the loop
    // (includes the user message we pushed plus all assistant/tool turns)
    this.messages = result.messages;
    this.abortController = null;

    this.emit({ type: 'idle' });
  }

  async sendAndWait(options: SquadMessageOptions, timeout?: number): Promise<unknown> {
    const timeoutMs = timeout ?? 60000;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`sendAndWait timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      let lastMessage = '';

      const messageHandler: SquadSessionEventHandler = (event) => {
        if (event.type === 'message' && typeof event['content'] === 'string') {
          lastMessage = event['content'];
        }
      };

      const idleHandler: SquadSessionEventHandler = () => {
        clearTimeout(timer);
        this.off('message', messageHandler);
        this.off('idle', idleHandler);
        resolve(lastMessage || undefined);
      };

      this.on('message', messageHandler);
      this.on('idle', idleHandler);

      this.sendMessage(options).catch((err) => {
        clearTimeout(timer);
        this.off('message', messageHandler);
        this.off('idle', idleHandler);
        reject(err);
      });
    });
  }

  async abort(): Promise<void> {
    this.abortController?.abort();
  }

  async getMessages(): Promise<unknown[]> {
    return this.messages;
  }

  on(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);
  }

  off(eventType: SquadSessionEventType, handler: SquadSessionEventHandler): void {
    this.listeners.get(eventType)?.delete(handler);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.abortController?.abort();
    this.listeners.clear();
    this.messages = [];
  }

  private emit(event: SquadSessionEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // swallow handler errors
        }
      }
    }
  }
}
