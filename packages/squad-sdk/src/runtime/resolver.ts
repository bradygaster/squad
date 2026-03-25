/**
 * Runtime Resolver
 *
 * Resolves the active RuntimeProvider based on configuration.
 * Defaults to 'copilot' for backward compatibility.
 */

import type { RuntimeProvider, RuntimeProviderName } from './provider.js';
import { ClaudeCodeRuntimeProvider } from './providers/claude-code-provider.js';
import { CopilotRuntimeProvider } from './providers/copilot-provider.js';
import type { SquadClientFactory } from './providers/copilot-provider.js';

export interface RuntimeResolverConfig {
  /** Which runtime to use. Defaults to 'copilot'. */
  runtime?: RuntimeProviderName;
  /** Options passed to the Claude Code provider. */
  claudeCode?: {
    claudeBin?: string;
    sessionTimeout?: number;
  };
  /** Options passed to the Copilot provider. */
  copilot?: {
    /** A SquadClient instance or factory function. Required when runtime is 'copilot'. */
    client?: SquadClientFactory;
  };
}

const DEFAULT_RUNTIME: RuntimeProviderName = 'copilot';

/**
 * Registry of known provider factories.
 */
const providerFactories: Record<
  RuntimeProviderName,
  (config: RuntimeResolverConfig) => RuntimeProvider
> = {
  'copilot': (config) => {
    const clientFactory = config.copilot?.client;
    if (!clientFactory) {
      throw new Error(
        'Copilot runtime provider requires a SquadClient. ' +
        'Pass { copilot: { client: squadClientInstance } } in your RuntimeResolverConfig.',
      );
    }
    return new CopilotRuntimeProvider({ client: clientFactory });
  },
  'claude-code': (config) => {
    return new ClaudeCodeRuntimeProvider({
      claudeBin: config.claudeCode?.claudeBin,
      sessionTimeout: config.claudeCode?.sessionTimeout,
    });
  },
};

/**
 * Resolve and instantiate the configured RuntimeProvider.
 */
export function resolveRuntime(config?: RuntimeResolverConfig): RuntimeProvider {
  const name = config?.runtime ?? DEFAULT_RUNTIME;

  const factory = providerFactories[name];
  if (!factory) {
    throw new Error(
      `Unknown runtime provider: "${name}". ` +
      `Available: ${Object.keys(providerFactories).join(', ')}`,
    );
  }

  return factory(config ?? {});
}

/**
 * Check if a runtime provider name is valid.
 */
export function isValidRuntime(name: string): name is RuntimeProviderName {
  return name in providerFactories;
}

/**
 * List available runtime provider names.
 */
export function listRuntimes(): RuntimeProviderName[] {
  return Object.keys(providerFactories) as RuntimeProviderName[];
}
