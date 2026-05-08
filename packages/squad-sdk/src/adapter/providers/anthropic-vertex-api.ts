/**
 * Anthropic Vertex AI API Adapter
 *
 * Extends AnthropicApi to route requests through Google Cloud Vertex AI
 * instead of the Anthropic API directly. Uses Google Cloud ADC for auth.
 *
 * @module adapter/providers/anthropic-vertex-api
 */

import { AnthropicApi } from './anthropic-api.js';
import type { LLMRequest } from '../agentic-loop.js';

export interface AnthropicVertexApiOptions {
  projectId: string;
  region: string;
}

export class AnthropicVertexApi extends AnthropicApi {
  private projectId: string;
  private region: string;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(options: AnthropicVertexApiOptions) {
    // Parent requires an apiKey but Vertex uses ADC tokens instead
    super({ apiKey: 'vertex-ai' });
    this.projectId = options.projectId;
    this.region = options.region;
  }

  protected getEndpoint(): string {
    // Vertex AI does not use the /v1/messages path — the model is in the URL
    // and we override buildRequestBody to set the model there.
    // We'll construct the full URL in call() instead.
    return '';
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'anthropic-version': this.apiVersion,
    };
  }

  private getModelEndpoint(model: string): string {
    return `https://${this.region}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.region}/publishers/anthropic/models/${model}:streamRawPredict`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    // Try google-auth-library first
    try {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse.token;
      if (token) {
        this.cachedToken = { token, expiresAt: Date.now() + 3300_000 };
        return token;
      }
    } catch {
      // google-auth-library not installed — fall through to gcloud CLI
    }

    // Fallback: gcloud CLI
    try {
      const { execSync } = await import('node:child_process');
      const token = execSync('gcloud auth application-default print-access-token', {
        encoding: 'utf-8',
        timeout: 10_000,
      }).trim();
      if (token) {
        this.cachedToken = { token, expiresAt: Date.now() + 3300_000 };
        return token;
      }
    } catch {
      // gcloud not available
    }

    throw new Error(
      'Could not obtain Google Cloud access token. Install google-auth-library, ' +
      'run "gcloud auth application-default login", or set GOOGLE_APPLICATION_CREDENTIALS.',
    );
  }

  async *call(request: LLMRequest): AsyncIterable<import('../agentic-loop.js').LLMChunk> {
    const body = this.buildRequestBody(request);
    const headers = this.getHeaders();
    const endpoint = this.getModelEndpoint(request.model);
    const accessToken = await this.getAccessToken();
    headers['Authorization'] = `Bearer ${accessToken}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic Vertex AI error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Anthropic Vertex AI returned no response body');
    }

    yield* this.parseSSEStream(response.body, request.model);
  }
}
