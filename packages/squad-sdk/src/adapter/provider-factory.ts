/**
 * Provider Factory
 *
 * Resolves the correct SquadProvider implementation based on configuration,
 * environment variables, or model name heuristics.
 *
 * @module adapter/provider-factory
 */

import type { SquadProviderConfig } from './types.js';
import type { SquadProvider, ProviderType } from './provider.js';
import type { SquadClientOptions } from './client.js';

/**
 * Resolve which provider type to use.
 *
 * Priority:
 *  1. Explicit `config.type`
 *  2. `SQUAD_PROVIDER` environment variable
 *  3. Presence of provider-specific API key env vars
 *  4. Model name prefix heuristic
 *  5. Default to 'copilot'
 */
export function resolveProviderType(
  config?: SquadProviderConfig,
  model?: string,
): ProviderType {
  if (config?.type) {
    const mapped = mapConfigType(config.type);
    if (mapped) return mapped;
  }

  const envProvider = process.env['SQUAD_PROVIDER'];
  if (envProvider) {
    const mapped = mapConfigType(envProvider);
    if (mapped) return mapped;
  }

  if (process.env['ANTHROPIC_API_KEY']) return 'anthropic';
  if (process.env['GOOGLE_AI_API_KEY']) return 'google';

  if (model) {
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.startsWith('gemini-')) return 'google';
  }

  return 'copilot';
}

function mapConfigType(raw: string): ProviderType | undefined {
  const normalized = raw.toLowerCase().trim();
  const valid: ProviderType[] = [
    'copilot',
    'anthropic',
    'anthropic-vertex',
    'google',
    'google-vertex',
  ];
  if (valid.includes(normalized as ProviderType)) {
    return normalized as ProviderType;
  }
  return undefined;
}

/**
 * Create a SquadProvider for the given configuration.
 *
 * Provider modules are loaded lazily so that unused SDKs are never imported.
 */
export async function createProvider(
  providerType: ProviderType,
  providerConfig?: SquadProviderConfig,
  clientOptions?: SquadClientOptions,
): Promise<SquadProvider> {
  switch (providerType) {
    case 'copilot': {
      const { CopilotProvider } = await import('./providers/copilot-provider.js');
      return new CopilotProvider(clientOptions);
    }
    case 'anthropic': {
      const { AnthropicProvider } = await import('./providers/anthropic-provider.js');
      return new AnthropicProvider(providerConfig);
    }
    case 'anthropic-vertex': {
      const { AnthropicVertexProvider } = await import('./providers/anthropic-vertex-provider.js');
      return new AnthropicVertexProvider(providerConfig);
    }
    case 'google': {
      const { GoogleProvider } = await import('./providers/google-provider.js');
      return new GoogleProvider(providerConfig);
    }
    case 'google-vertex': {
      const { GoogleVertexProvider } = await import('./providers/google-vertex-provider.js');
      return new GoogleVertexProvider(providerConfig);
    }
    default: {
      const _exhaustive: never = providerType;
      throw new Error(`Unknown provider type: ${_exhaustive}`);
    }
  }
}
