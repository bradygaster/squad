/**
 * Anthropic Provider
 *
 * SquadProvider implementation for Claude via the Anthropic Messages API.
 * Uses native fetch() — no Anthropic SDK dependency.
 *
 * @module adapter/providers/anthropic-provider
 */

import type { SquadProvider } from '../provider.js';
import type {
  SquadSessionConfig,
  SquadSession,
  SquadProviderConfig,
} from '../types.js';
import { AnthropicApi } from './anthropic-api.js';
import { DirectApiSession } from '../direct-session.js';

export class AnthropicProvider implements SquadProvider {
  readonly name = 'anthropic' as const;

  private apiKey: string;
  private baseUrl: string;
  private connected = false;

  constructor(providerConfig?: SquadProviderConfig) {
    this.apiKey = providerConfig?.apiKey ?? process.env['ANTHROPIC_API_KEY'] ?? '';
    this.baseUrl = providerConfig?.baseUrl ?? 'https://api.anthropic.com';
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or pass apiKey in provider config.',
      );
    }
    this.connected = true;
  }

  async disconnect(): Promise<Error[]> {
    this.connected = false;
    return [];
  }

  async createSession(config: SquadSessionConfig): Promise<SquadSession> {
    const adapter = new AnthropicApi({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    });

    return new DirectApiSession({
      adapter,
      model: config.model ?? 'claude-sonnet-4-5-20250514',
      tools: config.tools ?? [],
      systemMessage: config.systemMessage,
      sessionId: config.sessionId,
      reasoningEffort: config.reasoningEffort,
      hooks: config.hooks,
    });
  }
}
