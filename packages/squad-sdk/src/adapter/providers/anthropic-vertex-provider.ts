/**
 * Anthropic Vertex AI Provider
 *
 * SquadProvider implementation for Claude via Google Cloud Vertex AI.
 * Uses Google Cloud ADC for authentication.
 *
 * @module adapter/providers/anthropic-vertex-provider
 */

import type { SquadProvider } from '../provider.js';
import type {
  SquadSessionConfig,
  SquadSession,
  SquadProviderConfig,
} from '../types.js';
import { AnthropicVertexApi } from './anthropic-vertex-api.js';
import { DirectApiSession } from '../direct-session.js';

export class AnthropicVertexProvider implements SquadProvider {
  readonly name = 'anthropic-vertex' as const;

  private projectId: string;
  private region: string;
  private connected = false;

  constructor(providerConfig?: SquadProviderConfig) {
    this.projectId =
      providerConfig?.anthropicVertex?.projectId ??
      process.env['GOOGLE_CLOUD_PROJECT'] ??
      '';
    this.region =
      providerConfig?.anthropicVertex?.region ??
      process.env['GOOGLE_CLOUD_REGION'] ??
      'us-east5';
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (!this.projectId) {
      throw new Error(
        'Google Cloud project ID not found. Set GOOGLE_CLOUD_PROJECT environment variable ' +
        'or pass projectId in provider.anthropicVertex config.',
      );
    }
    this.connected = true;
  }

  async disconnect(): Promise<Error[]> {
    this.connected = false;
    return [];
  }

  async createSession(config: SquadSessionConfig): Promise<SquadSession> {
    const adapter = new AnthropicVertexApi({
      projectId: this.projectId,
      region: this.region,
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
