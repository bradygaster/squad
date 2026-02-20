# PRD 9: BYOK & Multi-Provider

**Owner:** Kujan (Copilot SDK Expert)
**Status:** Draft
**Created:** 2026-02-20
**Phase:** 1 (v0.6.0 — SDK adapter exposes provider config) / Phase 2 (v0.7.0 — fallback chains)
**Dependencies:** PRD 1 (SDK Integration Core)

## Problem Statement

Squad currently requires a GitHub Copilot subscription and can only use models available through GitHub's model catalog. Enterprise customers with existing Azure AI Foundry, OpenAI, or Anthropic contracts cannot use Squad without a separate Copilot license. There's no fallback when a provider has an outage — Squad is completely dependent on GitHub Copilot's availability. This limits adoption in enterprises and makes Squad fragile in production.

## Goals

1. Enterprise users bring their own API keys and use Squad with their existing LLM contracts
2. Multi-provider fallback chains for resilience (Copilot → Azure → OpenAI → Anthropic → local)
3. Provider configuration is simple, secure, and team-sharable
4. Squad's 4-layer model selection (user override → charter → registry → auto-select) works with BYOK
5. Cost optimization: route cheap tasks to cheap models, expensive tasks to capable models — across providers
6. Local development mode via Ollama (zero cloud dependency for iteration)

## Non-Goals

- Building a provider abstraction layer that hides model differences (providers have real capability differences)
- Supporting every LLM provider (start with SDK-supported: OpenAI, Azure, Anthropic, Ollama)
- Fine-tuned model hosting (BYOK means existing model endpoints, not training)
- Token-level billing integration with enterprise cost centers (export data; let finance tools consume it)

## Background

The SDK's `ProviderConfig` (verified in `nodejs/src/types.ts:772-809`) supports:

```typescript
interface ProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  wireApi?: "completions" | "responses";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;  // Takes precedence over apiKey
  azure?: {
    apiVersion?: string;  // Default: "2024-10-21"
  };
}
```

Key facts from SDK source:
- **Provider config is per-session** (`SessionConfig.provider`). No client-level default. Squad must pass provider on every `createSession()` call.
- **`apiKey` is optional** — supports keyless providers like Ollama (localhost, no auth).
- **`bearerToken` takes precedence** over `apiKey` — useful for enterprise token-based auth (Okta, Entra ID tokens obtained externally).
- **`type` determines wire format** — `"openai"` uses OpenAI chat completions, `"azure"` uses Azure-specific endpoints, `"anthropic"` uses Anthropic's Messages API.
- **`wireApi`** selects between `"completions"` (legacy) and `"responses"` (newer OpenAI Responses API). Only relevant for OpenAI/Azure types.
- **No managed identity support** — no Entra ID, no Azure Managed Identity, no IAM roles. Tokens must be obtained externally and passed as `apiKey` or `bearerToken`.
- **`model` is required with BYOK** — SDK doesn't default to provider's default model. Squad must always specify model name.

## Proposed Solution

### 1. Configuration Format

Squad provider config lives in `.squad/providers.json` (team-sharable, committed) with secrets in environment variables:

```json
{
  "providers": {
    "copilot": {
      "type": "copilot",
      "priority": 1,
      "description": "GitHub Copilot (default)"
    },
    "azure-prod": {
      "type": "azure",
      "baseUrl": "https://myorg.openai.azure.com/openai/v1/",
      "apiKey": "${AZURE_OPENAI_API_KEY}",
      "azure": { "apiVersion": "2024-10-21" },
      "priority": 2,
      "models": ["gpt-5.2", "gpt-4.1"],
      "description": "Azure AI Foundry (production)"
    },
    "anthropic": {
      "type": "anthropic",
      "baseUrl": "https://api.anthropic.com/v1/",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "priority": 3,
      "models": ["claude-sonnet-4", "claude-haiku-4"],
      "description": "Anthropic (fallback)"
    },
    "local": {
      "type": "openai",
      "baseUrl": "http://localhost:11434/v1/",
      "priority": 99,
      "models": ["llama3.2"],
      "description": "Ollama (local dev)"
    }
  },
  "defaultProvider": "copilot",
  "fallbackChain": ["copilot", "azure-prod", "anthropic"],
  "costOptimization": {
    "cheapTasks": { "provider": "local", "models": ["llama3.2"] },
    "standardTasks": { "provider": "copilot" },
    "premiumTasks": { "provider": "azure-prod", "models": ["gpt-5.2"] }
  }
}
```

**Key design choice:** `${VAR}` syntax for secrets (consistent with team security policy — MCP configs already use this pattern per Baer's security decision). Squad resolves `${VAR}` references at runtime from `process.env`. The file is safe to commit.

### 2. Provider Resolution

When the coordinator spawns an agent, provider resolution follows this chain:

```
1. User override (--provider=azure-prod)
2. Agent charter (charter.md frontmatter: provider: azure-prod)
3. Task complexity routing (costOptimization config)
4. Default provider (providers.json defaultProvider)
5. Fallback chain (if selected provider fails)
```

This extends Squad's existing 4-layer model selection. Provider selection is a new layer that wraps model selection:

```typescript
function resolveProviderAndModel(agent: TeamMember, task: TaskInfo): { provider: ProviderConfig; model: string } {
  // Layer 1: User override
  if (task.providerOverride) return lookupProvider(task.providerOverride, agent.model);

  // Layer 2: Charter config
  if (agent.charter.provider) return lookupProvider(agent.charter.provider, agent.model);

  // Layer 3: Cost optimization
  const tier = classifyTaskComplexity(task);  // 'cheap' | 'standard' | 'premium'
  const costConfig = config.costOptimization[`${tier}Tasks`];
  if (costConfig) return lookupProvider(costConfig.provider, costConfig.models[0] || agent.model);

  // Layer 4: Default
  return lookupProvider(config.defaultProvider, agent.model);
}
```

### 3. Fallback Chains

When a provider fails (network error, 429 rate limit, 5xx server error), Squad retries with the next provider in the chain:

```typescript
async function spawnWithFallback(agent: TeamMember, task: string): Promise<CopilotSession> {
  const chain = config.fallbackChain;
  const errors: Error[] = [];

  for (const providerName of chain) {
    try {
      const { provider, model } = resolveProviderAndModel(agent, task, providerName);
      const session = await client.createSession({
        sessionId: `squad-${agent.name}-${Date.now()}`,
        model,
        provider: providerName === 'copilot' ? undefined : provider,  // undefined = use Copilot default
        // ... rest of session config
      });
      return session;
    } catch (error) {
      errors.push(error);
      logger.warn(`Provider ${providerName} failed for ${agent.name}: ${error.message}. Trying next...`);
    }
  }

  throw new AggregateError(errors, `All providers failed for ${agent.name}`);
}
```

**Critical SDK detail:** When `provider` is `undefined` in `SessionConfig`, the SDK uses GitHub Copilot authentication (via `githubToken` or `useLoggedInUser`). Setting `provider` switches to BYOK mode. Squad treats "copilot" as a special provider that passes `undefined` for the provider config.

### 4. Model Selection with BYOK

Squad's 4-layer model selection still works, with a provider-awareness addition:

- **User override:** `--model gpt-5.2 --provider azure-prod` → explicit model on explicit provider
- **Charter config:** `model: claude-sonnet-4` in charter frontmatter → resolved against provider's model list
- **Registry default:** `team.md` model mapping (Lead→Sonnet, Tester→Haiku) → validated against available models
- **Auto-select:** `client.listModels()` returns available models. With BYOK, this returns provider-specific models.

**Model name mapping challenge:** The same conceptual model has different names across providers (e.g., `gpt-4o` on OpenAI, `gpt-4o` on Azure but with deployment name). Squad maintains a model alias map in `providers.json`:

```json
{
  "modelAliases": {
    "fast": { "copilot": "gpt-5-mini", "azure-prod": "gpt-4.1", "anthropic": "claude-haiku-4" },
    "standard": { "copilot": "claude-sonnet-4", "azure-prod": "gpt-5.2", "anthropic": "claude-sonnet-4" },
    "premium": { "copilot": "claude-opus-4", "azure-prod": "gpt-5.2-codex", "anthropic": "claude-opus-4" }
  }
}
```

Charters and registry use tier names (`fast`, `standard`, `premium`) instead of model names. Squad resolves to provider-specific model at spawn time.

### 5. Enterprise Onboarding

Enterprise setup flow:

```
$ npx create-squad --provider azure
? Azure OpenAI endpoint: https://myorg.openai.azure.com/openai/v1/
? API key env var name: AZURE_OPENAI_API_KEY
? Available models (comma-separated): gpt-5.2, gpt-4.1
? Set as default provider? Yes

✅ Created .squad/providers.json
⚠️  Set AZURE_OPENAI_API_KEY in your environment before running Squad.
⚠️  API key is NOT stored in any file — only the env var name.
```

For enterprises using Entra ID / SSO tokens:

```json
{
  "azure-prod": {
    "type": "azure",
    "baseUrl": "https://myorg.openai.azure.com/openai/v1/",
    "bearerToken": "${AZURE_AD_TOKEN}",
    "azure": { "apiVersion": "2024-10-21" }
  }
}
```

Token refresh is the enterprise's responsibility (via CI pipeline, token refresh script, or IDE plugin). Squad reads `${AZURE_AD_TOKEN}` on each `createSession()` call — if the token is refreshed in the environment between calls, the new token is used automatically.

### 6. Security

| Concern | Mitigation |
|---------|------------|
| Keys in git | `${VAR}` syntax only — actual keys never in files. `.squad/providers.json` is safe to commit. |
| Key rotation | Keys are env vars — rotate by updating environment, no code/config changes. |
| Key exposure in logs | Squad adapter never logs `apiKey` or `bearerToken` values. Logged as `[REDACTED]`. |
| Shared config, private keys | `providers.json` is team-shared (committed). Each developer sets their own env vars. Enterprise can use vault (HashiCorp Vault, Azure Key Vault) to inject env vars. |
| Provider endpoint validation | Squad validates `baseUrl` is HTTPS (except localhost for Ollama). Warn on HTTP endpoints. |

## Key Decisions

| Decision | Status | Rationale |
|----------|--------|-----------|
| `${VAR}` syntax for secrets in config files | ✅ Decided | Consistent with MCP config pattern (Baer's security decision). No new patterns. |
| Tier-based model aliases (`fast`/`standard`/`premium`) | ✅ Decided | Decouples charter from provider. Same charter works on Copilot, Azure, or Anthropic. |
| `copilot` as special provider (undefined in SDK config) | ✅ Decided | SDK uses Copilot auth when no provider specified. Clean separation. |
| Provider config in `.squad/providers.json` (not env vars) | ✅ Decided | Team-sharable. Env vars for secrets only. |
| No managed identity support in v1 | ✅ Decided | SDK limitation (no Entra ID, no IAM). Accept `bearerToken` from external token refresh. |
| Fallback chain is config-driven, not automatic | 🔄 Pending | Should Squad auto-detect provider failures and retry, or require explicit chain config? |

## Implementation Notes

### SDK Provider Config Translation

```typescript
function toSdkProvider(squadProvider: SquadProviderConfig): ProviderConfig | undefined {
  if (squadProvider.type === 'copilot') return undefined;  // Use default Copilot auth

  const resolved: ProviderConfig = {
    type: squadProvider.type as 'openai' | 'azure' | 'anthropic',
    baseUrl: squadProvider.baseUrl,
  };

  // Resolve ${VAR} references
  if (squadProvider.apiKey) {
    resolved.apiKey = resolveEnvVar(squadProvider.apiKey);
  }
  if (squadProvider.bearerToken) {
    resolved.bearerToken = resolveEnvVar(squadProvider.bearerToken);
  }
  if (squadProvider.azure) {
    resolved.azure = squadProvider.azure;
  }
  if (squadProvider.wireApi) {
    resolved.wireApi = squadProvider.wireApi;
  }

  return resolved;
}

function resolveEnvVar(value: string): string {
  const match = value.match(/^\$\{(\w+)\}$/);
  if (!match) return value;
  const envValue = process.env[match[1]];
  if (!envValue) throw new Error(`Environment variable ${match[1]} is not set`);
  return envValue;
}
```

### Ollama Local Mode

Ollama exposes an OpenAI-compatible API at `http://localhost:11434/v1/`. No API key needed:

```json
{
  "local": {
    "type": "openai",
    "baseUrl": "http://localhost:11434/v1/",
    "priority": 99,
    "models": ["llama3.2", "codellama"]
  }
}
```

SDK handles this natively — `apiKey` is optional in `ProviderConfig`. Squad detects Ollama availability by attempting `GET http://localhost:11434/api/tags` during init.

### Error Detection for Fallback

The SDK's `onErrorOccurred` hook provides:
```typescript
interface ErrorOccurredHookInput {
  error: string;
  errorContext: "model_call" | "tool_execution" | "system" | "user_input";
  recoverable: boolean;
}
```

When `errorContext === "model_call"` and the error suggests provider failure (network error, 429, 5xx), Squad triggers fallback. The hook can return `{ errorHandling: "retry" }` to tell the SDK to retry — but with a different provider, Squad needs to create a new session.

### Provider Health Cache

To avoid repeatedly failing on a down provider:

```typescript
const providerHealth = new Map<string, { healthy: boolean; lastCheck: number; consecutiveFailures: number }>();

function isProviderHealthy(name: string): boolean {
  const health = providerHealth.get(name);
  if (!health) return true;  // Assume healthy until proven otherwise
  if (!health.healthy && Date.now() - health.lastCheck > 60_000) {
    return true;  // Re-check after 60s cooldown
  }
  return health.healthy;
}
```

Skip unhealthy providers in the fallback chain (but re-check every 60s).

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Provider-specific model name fragmentation | Medium | Tier aliases (`fast`/`standard`/`premium`) abstract away names. Provider-specific names in alias map only. |
| BYOK token expiry mid-session | High | SDK doesn't auto-refresh. Detect 401 errors via `onErrorOccurred` hook (`errorContext: "model_call"`), log actionable message: "Token expired. Refresh ${VAR_NAME} and retry." |
| Capability differences across providers (vision, reasoning effort, tool use) | Medium | Squad's `listModels()` check validates capabilities per model. If model lacks required capability, skip and warn. |
| Ollama model quality insufficient for complex tasks | Low | Ollama is local-dev only (priority 99). Never in fallback chain for production work unless user explicitly configures. |
| Provider config drift (team member uses different provider than team) | Low | `providers.json` is committed. Provider selection is deterministic from config. Only env vars differ per developer. |
| SDK `ProviderConfig.type` doesn't support all providers (e.g., Google Gemini) | Medium | Use `"openai"` type with OpenAI-compatible proxy endpoints (LiteLLM, etc.). Document as workaround. |

## Success Metrics

1. **Enterprise setup:** New BYOK provider configured in <5 minutes with `create-squad --provider`
2. **Fallback resilience:** Squad continues operating when primary provider is down (auto-fallback in <5s)
3. **Zero key exposure:** No API keys in any committed file (CI check validates `${VAR}` pattern only)
4. **Model selection parity:** Tier aliases resolve correctly across all configured providers
5. **Ollama adoption:** Local dev mode works without any cloud credentials configured
6. **Cost reduction:** Enterprise users report lower costs by routing to their own contracts vs. Copilot quota

## Open Questions

1. **Per-agent provider override:** Should individual agents (e.g., Designer uses Anthropic for better creative writing) have per-agent provider config in their charter? Likely yes — but adds complexity.
2. **Provider-specific tool support:** Some providers may not support all SDK tools (e.g., Ollama models may not do tool calling reliably). How does Squad detect and degrade?
3. **Quota-aware routing:** `assistant.usage` events include `quotaSnapshots` with `remainingPercentage`. Should Squad auto-switch provider when quota is low (e.g., <10% Copilot quota → switch to Azure)?
4. **Multi-provider in single batch:** Should different agents in the same batch use different providers? (e.g., Tester on cheap local model, Lead on premium Azure model). The SDK supports this — each session has its own provider config.
5. **Config migration from `.ai-team/` to `.squad/`:** The canonical directory rename decision means `providers.json` goes in `.squad/`. Backward-compat fallback needed during transition.
