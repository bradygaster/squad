/**
 * Google Vertex AI API Adapter
 *
 * Extends GoogleApi to route requests through Google Cloud Vertex AI
 * instead of the public Google AI API. Uses Google Cloud ADC for auth.
 *
 * @module adapter/providers/google-vertex-api
 */

import { GoogleApi } from './google-api.js';
import type { LLMRequest, LLMChunk } from '../agentic-loop.js';

export interface GoogleVertexApiOptions {
  projectId: string;
  location: string;
}

export class GoogleVertexApi extends GoogleApi {
  private projectId: string;
  private location: string;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(options: GoogleVertexApiOptions) {
    // Parent requires an apiKey but Vertex uses ADC tokens instead
    super({ apiKey: 'vertex-ai' });
    this.projectId = options.projectId;
    this.location = options.location;
  }

  protected getEndpoint(model: string): string {
    return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:streamGenerateContent?alt=sse`;
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
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

  async *call(request: LLMRequest): AsyncIterable<LLMChunk> {
    const body = this.buildRequestBody(request);
    const headers = this.getHeaders();
    const endpoint = this.getEndpoint(request.model);
    const accessToken = await this.getAccessToken();
    headers['Authorization'] = `Bearer ${accessToken}`;

    // Vertex AI doesn't use the API key in the URL
    const cleanEndpoint = endpoint.replace(/[?&]key=[^&]+/, '');

    const response = await fetch(cleanEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Vertex AI error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Google Vertex AI returned no response body');
    }

    yield* this.parseSSEStream(response.body, request.model);
  }
}
