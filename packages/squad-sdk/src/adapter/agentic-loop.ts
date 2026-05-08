/**
 * Agentic Tool-Use Loop Engine
 *
 * Implements the think → tool-call → execute → feed-result loop that the
 * Copilot SDK handles internally. All direct API providers (Anthropic,
 * Google) share this engine via their LLMApiAdapter implementations.
 *
 * @module adapter/agentic-loop
 */

import type {
  SquadTool,
  SquadToolResultObject,
  SquadSessionEvent,
  SquadSessionHooks,
} from './types.js';

// ---------------------------------------------------------------------------
// LLM API Adapter — provider-specific API surface
// ---------------------------------------------------------------------------

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: LLMContentBlock[];
}

export type LLMContentBlock =
  | LLMTextBlock
  | LLMToolUseBlock
  | LLMToolResultBlock
  | LLMReasoningBlock;

export interface LLMTextBlock {
  type: 'text';
  text: string;
}

export interface LLMToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface LLMReasoningBlock {
  type: 'reasoning';
  text: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMRequest {
  model: string;
  systemPrompt?: string;
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
  stream: boolean;
  maxTokens?: number;
  reasoningEffort?: string;
}

export type LLMChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; partialJson: string }
  | { type: 'tool_use_end'; id: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number; model: string }
  | { type: 'end'; stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop' };

/**
 * Adapter interface that provider-specific API implementations must fulfill.
 * Each provider converts its native streaming format to the normalized
 * LLMChunk stream consumed by the AgenticLoop.
 */
export interface LLMApiAdapter {
  call(request: LLMRequest): AsyncIterable<LLMChunk>;
}

// ---------------------------------------------------------------------------
// AgenticLoop
// ---------------------------------------------------------------------------

export interface AgenticLoopOptions {
  adapter: LLMApiAdapter;
  tools: SquadTool<any>[];
  model: string;
  systemPrompt?: string;
  maxIterations?: number;
  maxTokens?: number;
  reasoningEffort?: string;
  hooks?: SquadSessionHooks;
  sessionId?: string;
  signal?: AbortSignal;
}

export interface AgenticLoopResult {
  messages: LLMMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  iterations: number;
}

/**
 * Convert SquadTool[] to the LLM tool definition format.
 */
function toToolDefinitions(tools: SquadTool<any>[]): LLMToolDefinition[] {
  return tools.map((t) => {
    let inputSchema: Record<string, unknown>;
    if (t.parameters && 'toJSONSchema' in t.parameters && typeof t.parameters.toJSONSchema === 'function') {
      inputSchema = t.parameters.toJSONSchema() as Record<string, unknown>;
    } else {
      inputSchema = (t.parameters as Record<string, unknown>) ?? { type: 'object', properties: {} };
    }
    return {
      name: t.name,
      description: t.description ?? '',
      input_schema: inputSchema,
    };
  });
}

/**
 * Execute a tool and return a normalized result.
 */
async function executeTool(
  tool: SquadTool<any>,
  args: Record<string, unknown>,
  toolCallId: string,
  sessionId: string,
  hooks?: SquadSessionHooks,
): Promise<{ content: string; isError: boolean }> {
  // Pre-tool-use hook
  let finalArgs = args;
  if (hooks?.onPreToolUse) {
    const hookResult = await hooks.onPreToolUse(
      { timestamp: Date.now(), cwd: process.cwd(), toolName: tool.name, toolArgs: args },
      { sessionId },
    );
    if (hookResult?.permissionDecision === 'deny') {
      return {
        content: hookResult.permissionDecisionReason ?? 'Tool execution denied by hook',
        isError: true,
      };
    }
    if (hookResult?.modifiedArgs) {
      finalArgs = hookResult.modifiedArgs as Record<string, unknown>;
    }
  }

  try {
    const raw = await tool.handler(finalArgs, {
      sessionId,
      toolCallId,
      toolName: tool.name,
      arguments: finalArgs,
    });

    let resultObj: SquadToolResultObject;
    if (typeof raw === 'string') {
      resultObj = { textResultForLlm: raw, resultType: 'success' };
    } else if (raw && typeof raw === 'object' && 'textResultForLlm' in raw) {
      resultObj = raw as SquadToolResultObject;
    } else {
      resultObj = { textResultForLlm: JSON.stringify(raw), resultType: 'success' };
    }

    // Post-tool-use hook
    if (hooks?.onPostToolUse) {
      const postResult = await hooks.onPostToolUse(
        { timestamp: Date.now(), cwd: process.cwd(), toolName: tool.name, toolArgs: finalArgs, toolResult: resultObj },
        { sessionId },
      );
      if (postResult?.modifiedResult) {
        resultObj = postResult.modifiedResult;
      }
    }

    return {
      content: resultObj.textResultForLlm,
      isError: resultObj.resultType === 'failure',
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { content: `Tool error: ${errorMsg}`, isError: true };
  }
}

/**
 * Run the agentic tool-use loop.
 *
 * Streams LLM responses, detects tool_use blocks, executes tools, feeds
 * results back, and repeats until the LLM produces a final text response
 * (stopReason !== 'tool_use') or the iteration limit is reached.
 */
export async function runAgenticLoop(
  options: AgenticLoopOptions,
  emit: (event: SquadSessionEvent) => void,
): Promise<AgenticLoopResult> {
  const {
    adapter,
    tools,
    model,
    systemPrompt,
    maxIterations = 25,
    maxTokens,
    reasoningEffort,
    hooks,
    sessionId = 'direct-session',
    signal,
  } = options;

  const toolDefs = toToolDefinitions(tools);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const messages: LLMMessage[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iterations = 0;

  // The caller is responsible for pushing the initial user message into
  // `messages` before calling this function — see DirectApiSession.

  for (let i = 0; i < maxIterations; i++) {
    if (signal?.aborted) {
      throw new Error('Agentic loop aborted');
    }

    iterations++;
    emit({ type: 'turn_start', iteration: i + 1 });

    const request: LLMRequest = {
      model,
      systemPrompt,
      messages,
      tools: toolDefs,
      stream: true,
      maxTokens,
      reasoningEffort,
    };

    // Collect the assistant's response from the streamed chunks
    const contentBlocks: LLMContentBlock[] = [];
    let currentText = '';
    let currentReasoning = '';
    const pendingToolUses = new Map<string, { name: string; jsonParts: string[] }>();
    let stopReason: string = 'end_turn';

    for await (const chunk of adapter.call(request)) {
      if (signal?.aborted) {
        throw new Error('Agentic loop aborted');
      }

      switch (chunk.type) {
        case 'text_delta':
          currentText += chunk.text;
          emit({ type: 'message_delta', content: chunk.text });
          break;

        case 'reasoning_delta':
          currentReasoning += chunk.text;
          emit({ type: 'reasoning_delta', content: chunk.text });
          break;

        case 'tool_use_start':
          // Flush accumulated text before tool use
          if (currentText) {
            contentBlocks.push({ type: 'text', text: currentText });
            currentText = '';
          }
          if (currentReasoning) {
            contentBlocks.push({ type: 'reasoning', text: currentReasoning });
            currentReasoning = '';
          }
          pendingToolUses.set(chunk.id, { name: chunk.name, jsonParts: [] });
          break;

        case 'tool_use_delta':
          pendingToolUses.get(chunk.id)?.jsonParts.push(chunk.partialJson);
          break;

        case 'tool_use_end': {
          const pending = pendingToolUses.get(chunk.id);
          if (pending) {
            let input: Record<string, unknown> = {};
            try {
              const jsonStr = pending.jsonParts.join('');
              if (jsonStr) {
                input = JSON.parse(jsonStr);
              }
            } catch {
              input = {};
            }
            contentBlocks.push({
              type: 'tool_use',
              id: chunk.id,
              name: pending.name,
              input,
            });
            pendingToolUses.delete(chunk.id);
          }
          break;
        }

        case 'usage':
          totalInputTokens += chunk.inputTokens;
          totalOutputTokens += chunk.outputTokens;
          emit({
            type: 'usage',
            inputTokens: chunk.inputTokens,
            outputTokens: chunk.outputTokens,
            model: chunk.model,
          });
          break;

        case 'end':
          stopReason = chunk.stopReason;
          break;
      }
    }

    // Flush remaining text/reasoning
    if (currentText) {
      contentBlocks.push({ type: 'text', text: currentText });
    }
    if (currentReasoning) {
      contentBlocks.push({ type: 'reasoning', text: currentReasoning });
    }

    // Add the assistant's response to the conversation
    messages.push({ role: 'assistant', content: contentBlocks });

    // Emit the full message
    const fullText = contentBlocks
      .filter((b): b is LLMTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (fullText) {
      emit({ type: 'message', content: fullText, role: 'assistant' });
    }

    const fullReasoning = contentBlocks
      .filter((b): b is LLMReasoningBlock => b.type === 'reasoning')
      .map((b) => b.text)
      .join('');
    if (fullReasoning) {
      emit({ type: 'reasoning', content: fullReasoning });
    }

    // If the LLM didn't request tool use, we're done
    const toolUseBlocks = contentBlocks.filter(
      (b): b is LLMToolUseBlock => b.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0 || stopReason !== 'tool_use') {
      emit({ type: 'turn_end', iteration: i + 1, reason: stopReason });
      break;
    }

    // Execute all requested tools
    const toolResults: LLMContentBlock[] = [];
    for (const toolUse of toolUseBlocks) {
      const tool = toolMap.get(toolUse.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Unknown tool: ${toolUse.name}`,
          is_error: true,
        });
        continue;
      }

      const result = await executeTool(
        tool,
        toolUse.input,
        toolUse.id,
        sessionId,
        hooks,
      );

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.isError,
      });
    }

    // Add tool results as the next user message
    messages.push({ role: 'user', content: toolResults });

    emit({ type: 'turn_end', iteration: i + 1, reason: 'tool_use' });
  }

  return { messages, totalInputTokens, totalOutputTokens, iterations };
}
