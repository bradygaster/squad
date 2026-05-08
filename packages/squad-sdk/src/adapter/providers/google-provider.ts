/**
 * Google AI Provider
 *
 * SquadProvider implementation for Gemini via the Google Generative
 * Language API. Uses native fetch() — no Google SDK dependency.
 *
 * @module adapter/providers/google-provider
 */

import type { SquadProvider } from '../provider.js';
import type {
  SquadSessionConfig,
  SquadSession,
  SquadProviderConfig,
} from '../types.js';
import { GoogleApi } from './google-api.js';
import { DirectApiSession } from '../direct-session.js';

export class GoogleProvider implements SquadProvider {
  readonly name = 'google' as const;

  private apiKey: string;
  private baseUrl: string;
  private connected = false;

  constructor(providerConfig?: SquadProviderConfig) {
    this.apiKey = providerConfig?.apiKey ?? process.env['GOOGLE_AI_API_KEY'] ?? '';
    this.baseUrl = providerConfig?.baseUrl ?? 'https://generativelanguage.googleapis.com';
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        'Google AI API key not found. Set GOOGLE_AI_API_KEY environment variable or pass apiKey in provider config.',
      );
    }
    this.connected = true;
  }

  async disconnect(): Promise<Error[]> {
    this.connected = false;
    return [];
  }

  async createSession(config: SquadSessionConfig): Promise<SquadSession> {
    const adapter = new GoogleApi({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
    });

    return new DirectApiSession({
      adapter,
      model: config.model ?? 'gemini-2.5-pro',
      tools: config.tools ?? [],
      systemMessage: config.systemMessage,
      sessionId: config.sessionId,
      reasoningEffort: config.reasoningEffort,
      hooks: config.hooks,
    });
  }
}
