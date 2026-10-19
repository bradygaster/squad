/**
 * Spec-level client adapter contract (squad-client-harness-adapters/v0.2).
 *
 * {@link ClientAdapter} is a thin composition facade: workspace projection and
 * capability description come from a pure {@link HostProjection}; runtime
 * operations (`submit`, `subscribe`, `cancel`, `respondApproval`) delegate to a
 * bound harness/backend and fail with {@link AdapterUnboundError} when none is bound.
 *
 * @module client/adapter-contract
 */

import {
  CAPABILITY_TOKENS_BY_HOST,
  assertConsistentCapabilities,
  resolveEffectiveCapabilityTokens,
} from './adapters/capabilities.js';
import { getHostProjection } from './adapters/adapters.js';
import type { ClientContext, ClientId, HostProjection } from './adapters/types.js';

export type { ClientCapabilityToken } from './adapters/capabilities.js';

export type AdapterHostKind =
  | 'github-copilot'
  | 'claude-code'
  | 'kiro'
  | 'opencode'
  | 'cursor'
  | 'codex'
  | 'antigravity';

export interface AdapterDescription {
  adapterId: string;
  hostKind: AdapterHostKind;
  hostVariant?: string;
  displayName: string;
  /** Advertised (not negotiated) capabilities as booleans, derived from the canonical tokens. */
  capabilities: {
    approvals: boolean;
    backgroundRuns: boolean;
    mcpConfig: boolean;
    subagents: boolean;
  };
  projectedFiles: string[];
}

export interface AdapterCapabilityProjection {
  clientCapabilities: string[];
  backendCapabilities: string[];
  policyCapabilities: string[];
  effectiveCapabilities: string[];
}

export interface ProjectWorkspaceProjection {
  repoRoot: string;
  workingDirectory: string;
  workspaceKind: 'repository' | 'folder' | 'multi-root' | 'cloud';
  branch?: string;
  squadAgentPath: string;
  mcpConfigPath?: string;
  supportFiles: string[];
}

export interface AdapterSubmission {
  conversationId: string;
  prompt: string;
  metadata?: Record<string, unknown>;
}

export interface AdapterSubscription {
  conversationId: string;
  cursor?: string;
}

export interface ApprovalResponse {
  approvalId: string;
  requestHash: string;
  decision: 'approved' | 'rejected' | 'cancelled';
  responseText?: string;
}

export interface ClientAdapter {
  submit(input: AdapterSubmission): Promise<{ admissionId: string; runId: string }>;
  subscribe(
    input: AdapterSubscription,
    onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  ): Promise<() => Promise<void>>;
  cancel(conversationId: string, runId: string, reason?: string): Promise<void>;
  respondApproval(conversationId: string, response: ApprovalResponse): Promise<void>;
  getCapabilities(conversationId?: string): Promise<AdapterCapabilityProjection>;
  describe(): Promise<AdapterDescription>;
  projectWorkspace(): Promise<ProjectWorkspaceProjection>;
}

/** Runtime delegate: a bound `HarnessAdapter` or `SquadBackend` client. */
export interface RuntimeBinding {
  submit(input: AdapterSubmission): Promise<{ admissionId: string; runId: string }>;
  subscribe(
    input: AdapterSubscription,
    onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  ): Promise<() => Promise<void>>;
  cancel(conversationId: string, runId: string, reason?: string): Promise<void>;
  respondApproval(conversationId: string, response: ApprovalResponse): Promise<void>;
  /** Canonical capability tokens granted by the backend for this conversation. */
  backendCapabilities?(conversationId?: string): string[] | Promise<string[]>;
  /** Canonical capability tokens allowed by authorization policy for this conversation. */
  policyCapabilities?(conversationId?: string): string[] | Promise<string[]>;
}

export class AdapterUnboundError extends Error {
  constructor(operation: string, host: string) {
    super(`${host}: "${operation}" needs a bound runtime (HarnessAdapter/SquadBackend); only workspace projection is available.`);
    this.name = 'AdapterUnboundError';
  }
}

const HOST_KIND: Record<ClientId, AdapterHostKind> = {
  copilot: 'github-copilot',
  claude: 'claude-code',
  kiro: 'kiro',
  opencode: 'opencode',
  cursor: 'cursor',
  codex: 'codex',
  antigravity: 'antigravity',
};

/** Authoritative agent anchor and MCP config path per host. */
const ANCHORS: Record<ClientId, { agent: string; mcp?: string }> = {
  copilot: { agent: '.github/agents/squad.agent.md', mcp: '.mcp.json' },
  claude: { agent: '.claude/agents/squad.md', mcp: '.mcp.json' },
  kiro: { agent: '.kiro/steering/squad.md', mcp: '.kiro/settings/mcp.json' },
  opencode: { agent: '.opencode/agent/squad.md', mcp: 'opencode.json' },
  cursor: { agent: '.cursor/agents/squad.md', mcp: '.cursor/mcp.json' },
  codex: { agent: '.codex/agents/squad.toml', mcp: '.codex/config.toml' },
  antigravity: { agent: '.agents/agents/squad.md' },
};

export interface CreateClientAdapterOptions {
  host: ClientId | HostProjection;
  ctx: ClientContext;
  runtime?: RuntimeBinding;
  /**
   * Optional boolean flags from a caller that also holds the token view; a
   * disagreement with the host's canonical tokens throws.
   */
  declaredFlags?: Parameters<typeof assertConsistentCapabilities>[1];
}

export function createClientAdapter(options: CreateClientAdapterOptions): ClientAdapter {
  const projection = typeof options.host === 'string' ? getHostProjection(options.host) : options.host;
  const tokens = CAPABILITY_TOKENS_BY_HOST[projection.id];
  if (options.declaredFlags) assertConsistentCapabilities(tokens, options.declaredFlags);
  const { ctx, runtime } = options;
  // OpenCode may target `opencode.jsonc`; the projected JSON file is authoritative.
  const anchors = ((): { agent: string; mcp?: string } => {
    const base = ANCHORS[projection.id];
    if (projection.id !== 'opencode') return base;
    const json = projection.project(ctx).find((f) => f.kind === 'json');
    return json ? { ...base, mcp: json.path } : base;
  })();
  const requireRuntime = (op: string): RuntimeBinding => {
    if (!runtime) throw new AdapterUnboundError(op, projection.label);
    return runtime;
  };
  const files = () => [...new Set(projection.project(ctx).map((f) => f.path))];

  return {
    submit: async (input) => requireRuntime('submit').submit(input),
    subscribe: async (input, onEvent) => requireRuntime('subscribe').subscribe(input, onEvent),
    cancel: async (conversationId, runId, reason) => requireRuntime('cancel').cancel(conversationId, runId, reason),
    respondApproval: async (conversationId, response) => requireRuntime('respondApproval').respondApproval(conversationId, response),
    async getCapabilities(conversationId) {
      const backend = runtime?.backendCapabilities ? await runtime.backendCapabilities(conversationId) : undefined;
      const policy = runtime?.policyCapabilities ? await runtime.policyCapabilities(conversationId) : undefined;
      return {
        clientCapabilities: [...tokens],
        backendCapabilities: backend ? [...backend] : [],
        policyCapabilities: policy ? [...policy] : [],
        effectiveCapabilities: resolveEffectiveCapabilityTokens(tokens, backend, policy),
      };
    },
    async describe() {
      return {
        adapterId: `squad-${projection.id}`,
        hostKind: HOST_KIND[projection.id],
        displayName: projection.label,
        capabilities: {
          approvals: tokens.includes('approvals'),
          backgroundRuns: tokens.includes('background-runs'),
          mcpConfig: tokens.includes('mcp-bridge'),
          subagents: tokens.includes('subagents'),
        },
        projectedFiles: files(),
      };
    },
    async projectWorkspace() {
      const all = files();
      return {
        repoRoot: ctx.root,
        workingDirectory: ctx.root,
        workspaceKind: 'repository',
        squadAgentPath: anchors.agent,
        ...(anchors.mcp ? { mcpConfigPath: anchors.mcp } : {}),
        supportFiles: all.filter((p) => p !== anchors.agent && p !== anchors.mcp),
      };
    },
  };
}
