/**
 * Google Gemini API Adapter
 *
 * Implements LLMApiAdapter for the Google Generative Language API using
 * native fetch(). No SDK dependency — only requires an API key.
 *
 * @module adapter/providers/google-api
 */

import type {
  LLMApiAdapter,
  LLMRequest,
  LLMChunk,
  LLMMessage,
  LLMToolDefinition,
} from '../agentic-loop.js';

// ---------------------------------------------------------------------------
// Types for the Gemini API request/response
// ---------------------------------------------------------------------------

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: string } } };

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// GoogleApi
// ---------------------------------------------------------------------------

export interface GoogleApiOptions {
  apiKey: string;
  baseUrl?: string;
}

export class GoogleApi implements LLMApiAdapter {
  protected apiKey: string;
  protected baseUrl: string;

  constructor(options: GoogleApiOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://generativelanguage.googleapis.com';
  }

  protected getEndpoint(model: string): string {
    return `${this.baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async *call(request: LLMRequest): AsyncIterable<LLMChunk> {
    const body = this.buildRequestBody(request);
    const headers = this.getHeaders();
    const endpoint = this.getEndpoint(request.model);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google AI API error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Google AI API returned no response body');
    }

    yield* this.parseSSEStream(response.body, request.model);
  }

  protected buildRequestBody(request: LLMRequest): Record<string, unknown> {
    const contents = this.convertMessages(request.messages);
    const tools = this.convertTools(request.tools);

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 8192,
      },
    };

    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    if (tools.length > 0) {
      body.tools = [{ functionDeclarations: tools }];
    }

    if (request.reasoningEffort) {
      (body.generationConfig as Record<string, unknown>).thinkingConfig = {
        thinkingBudget: this.reasoningEffortToBudget(request.reasoningEffort),
      };
    }

    return body;
  }

  private reasoningEffortToBudget(effort: string): number {
    switch (effort) {
      case 'low': return 1024;
      case 'medium': return 8192;
      case 'high': return 16384;
      case 'xhigh': return 32768;
      default: return 8192;
    }
  }

  private convertMessages(messages: LLMMessage[]): GeminiContent[] {
    const result: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue;

      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
      const parts: GeminiPart[] = [];

      for (const block of msg.content) {
        switch (block.type) {
          case 'text':
            parts.push({ text: block.text });
            break;
          case 'tool_use':
            parts.push({
              functionCall: { name: block.name, args: block.input },
            });
            break;
          case 'tool_result':
            parts.push({
              functionResponse: {
                name: this.findToolName(messages, block.tool_use_id),
                response: { content: block.content },
              },
            });
            break;
          case 'reasoning':
            parts.push({ text: block.text });
            break;
        }
      }

      if (parts.length > 0) {
        result.push({ role, parts });
      }
    }

    return result;
  }

  private findToolName(messages: LLMMessage[], toolUseId: string): string {
    for (const msg of messages) {
      for (const block of msg.content) {
        if (block.type === 'tool_use' && block.id === toolUseId) {
          return block.name;
        }
      }
    }
    return 'unknown_tool';
  }

  private convertTools(tools: LLMToolDefinition[]): GeminiFunctionDeclaration[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: this.convertToOpenApiSchema(t.input_schema),
    }));
  }

  private convertToOpenApiSchema(schema: Record<string, unknown>): Record<string, unknown> {
    // Gemini expects OpenAPI-style schemas without JSON Schema extensions
    // like $schema, additionalProperties, etc. Strip those.
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (key === '$schema' || key === 'additionalProperties') continue;
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        const props: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(value as Record<string, unknown>)) {
          if (typeof pv === 'object' && pv !== null) {
            props[pk] = this.convertToOpenApiSchema(pv as Record<string, unknown>);
          } else {
            props[pk] = pv;
          }
        }
        result[key] = props;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  protected async *parseSSEStream(
    body: ReadableStream<Uint8Array>,
    model: string,
  ): AsyncIterable<LLMChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let toolCallCounter = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

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
          if (!data || data === '[DONE]') continue;

          let chunk: any;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }

          // Track usage from usageMetadata
          if (chunk.usageMetadata) {
            const inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
            const outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
            if (inputTokens > totalInputTokens || outputTokens > totalOutputTokens) {
              totalInputTokens = inputTokens;
              totalOutputTokens = outputTokens;
            }
          }

          const candidate = chunk.candidates?.[0];
          if (!candidate?.content?.parts) continue;

          let hasToolUse = false;

          for (const part of candidate.content.parts) {
            if (part.text !== undefined) {
              yield { type: 'text_delta', text: part.text };
            }

            if (part.functionCall) {
              hasToolUse = true;
              const toolId = `tool_${++toolCallCounter}`;
              yield { type: 'tool_use_start', id: toolId, name: part.functionCall.name };
              const argsJson = JSON.stringify(part.functionCall.args ?? {});
              yield { type: 'tool_use_delta', id: toolId, partialJson: argsJson };
              yield { type: 'tool_use_end', id: toolId };
            }
          }

          // Check finish reason
          if (candidate.finishReason) {
            yield {
              type: 'usage',
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              model,
            };

            const stopReason = hasToolUse || candidate.finishReason === 'TOOL_CALLS'
              ? 'tool_use'
              : candidate.finishReason === 'MAX_TOKENS'
                ? 'max_tokens'
                : 'end_turn';
            yield { type: 'end', stopReason: stopReason as any };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
