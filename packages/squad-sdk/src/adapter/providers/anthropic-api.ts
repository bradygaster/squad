/**
 * Anthropic Messages API Adapter
 *
 * Implements LLMApiAdapter for the Anthropic Messages API using native
 * fetch(). No SDK dependency — only requires an API key.
 *
 * @module adapter/providers/anthropic-api
 */

import type {
  LLMApiAdapter,
  LLMRequest,
  LLMChunk,
  LLMMessage,
  LLMToolDefinition,
} from '../agentic-loop.js';

// ---------------------------------------------------------------------------
// Types for the Anthropic Messages API request/response
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'thinking'; thinking: string };

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// AnthropicApi
// ---------------------------------------------------------------------------

export interface AnthropicApiOptions {
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
}

export class AnthropicApi implements LLMApiAdapter {
  protected apiKey: string;
  protected baseUrl: string;
  protected apiVersion: string;

  constructor(options: AnthropicApiOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
    this.apiVersion = options.apiVersion ?? '2023-06-01';
  }

  protected getEndpoint(): string {
    return `${this.baseUrl}/v1/messages`;
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
    };
  }

  async *call(request: LLMRequest): AsyncIterable<LLMChunk> {
    const body = this.buildRequestBody(request);
    const headers = this.getHeaders();
    const endpoint = this.getEndpoint();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Anthropic API returned no response body');
    }

    yield* this.parseSSEStream(response.body, request.model);
  }

  protected buildRequestBody(request: LLMRequest): Record<string, unknown> {
    const messages = this.convertMessages(request.messages);
    const tools = this.convertTools(request.tools);

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? 8192,
      stream: true,
    };

    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }

    if (tools.length > 0) {
      body.tools = tools;
    }

    if (request.reasoningEffort) {
      body.thinking = {
        type: 'enabled',
        budget_tokens: this.reasoningEffortToBudget(request.reasoningEffort),
      };
    }

    return body;
  }

  private reasoningEffortToBudget(effort: string): number {
    switch (effort) {
      case 'low': return 2048;
      case 'medium': return 8192;
      case 'high': return 16384;
      case 'xhigh': return 32768;
      default: return 8192;
    }
  }

  private convertMessages(messages: LLMMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'tool' ? 'user' : msg.role;
      const content: AnthropicContentBlock[] = [];

      for (const block of msg.content) {
        switch (block.type) {
          case 'text':
            content.push({ type: 'text', text: block.text });
            break;
          case 'tool_use':
            content.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
            });
            break;
          case 'tool_result':
            content.push({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              content: block.content,
              is_error: block.is_error,
            });
            break;
          case 'reasoning':
            content.push({ type: 'thinking', thinking: block.text });
            break;
        }
      }

      if (content.length > 0) {
        result.push({ role: role as 'user' | 'assistant', content });
      }
    }

    return result;
  }

  private convertTools(tools: LLMToolDefinition[]): AnthropicTool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
  }

  protected async *parseSSEStream(
    body: ReadableStream<Uint8Array>,
    model: string,
  ): AsyncIterable<LLMChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolId = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          let event: any;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          yield* this.handleSSEEvent(event, model, currentToolId, (id) => {
            currentToolId = id;
          });
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private *handleSSEEvent(
    event: any,
    model: string,
    currentToolId: string,
    setToolId: (id: string) => void,
  ): Iterable<LLMChunk> {
    switch (event.type) {
      case 'content_block_start': {
        const block = event.content_block;
        if (block?.type === 'tool_use') {
          setToolId(block.id);
          yield { type: 'tool_use_start', id: block.id, name: block.name };
        }
        break;
      }

      case 'content_block_delta': {
        const delta = event.delta;
        if (delta?.type === 'text_delta') {
          yield { type: 'text_delta', text: delta.text };
        } else if (delta?.type === 'input_json_delta') {
          yield { type: 'tool_use_delta', id: currentToolId, partialJson: delta.partial_json };
        } else if (delta?.type === 'thinking_delta') {
          yield { type: 'reasoning_delta', text: delta.thinking };
        }
        break;
      }

      case 'content_block_stop': {
        if (currentToolId) {
          yield { type: 'tool_use_end', id: currentToolId };
          setToolId('');
        }
        break;
      }

      case 'message_delta': {
        const stopReason = event.delta?.stop_reason;
        if (stopReason) {
          const mapped = stopReason === 'tool_use' ? 'tool_use' : stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn';
          yield { type: 'end', stopReason: mapped as LLMChunk & { type: 'end' } extends { stopReason: infer R } ? R : never };
        }
        if (event.usage) {
          yield {
            type: 'usage',
            inputTokens: event.usage.input_tokens ?? 0,
            outputTokens: event.usage.output_tokens ?? 0,
            model,
          };
        }
        break;
      }

      case 'message_start': {
        if (event.message?.usage) {
          yield {
            type: 'usage',
            inputTokens: event.message.usage.input_tokens ?? 0,
            outputTokens: event.message.usage.output_tokens ?? 0,
            model: event.message.model ?? model,
          };
        }
        break;
      }
    }
  }
}
