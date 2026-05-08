/**
 * Google Vertex AI Provider
 *
 * SquadProvider implementation for Gemini via Google Cloud Vertex AI.
 * Uses Google Cloud ADC for authentication.
 *
 * @module adapter/providers/google-vertex-provider
 */

import type { SquadProvider } from '../provider.js';
import type {
  SquadSessionConfig,
  SquadSession,
  SquadProviderConfig,
} from '../types.js';
import { GoogleVertexApi } from './google-vertex-api.js';
import { DirectApiSession } from '../direct-session.js';

export class GoogleVertexProvider implements SquadProvider {
  readonly name = 'google-vertex' as const;

  private projectId: string;
  private location: string;
  private connected = false;

  constructor(providerConfig?: SquadProviderConfig) {
    this.projectId =
      providerConfig?.google?.projectId ??
      process.env['GOOGLE_CLOUD_PROJECT'] ??
      '';
    this.location =
      providerConfig?.google?.location ??
      process.env['GOOGLE_CLOUD_REGION'] ??
      'us-central1';
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (!this.projectId) {
      throw new Error(
        'Google Cloud project ID not found. Set GOOGLE_CLOUD_PROJECT environment variable ' +
        'or pass projectId in provider.google config.',
      );
    }
    this.connected = true;
  }

  async disconnect(): Promise<Error[]> {
    this.connected = false;
    return [];
  }

  async createSession(config: SquadSessionConfig): Promise<SquadSession> {
    const adapter = new GoogleVertexApi({
      projectId: this.projectId,
      location: this.location,
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
