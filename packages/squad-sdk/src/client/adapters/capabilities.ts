import type { ClientCapabilities, ClientId, TransportMode } from './types.js';

/**
 * Canonical capability tokens (client-harness-adapters/v0.2). The token array is
 * authoritative; {@link ClientCapabilities} boolean flags are a derived view.
 * `native-hooks` and `steering-files` are projection-level tokens.
 */
export const CAPABILITY_TOKENS = [
  'approvals',
  'background-runs',
  'cancel-run',
  'cursor-reconnect',
  'mcp-bridge',
  'subagents',
  'typed-content-parts',
  'native-hooks',
  'steering-files',
] as const;
export type ClientCapabilityToken = (typeof CAPABILITY_TOKENS)[number];

const FLAG_TOKENS = {
  supportsSubagents: 'subagents',
  supportsMcpTransport: 'mcp-bridge',
  supportsNativeHooks: 'native-hooks',
  supportsSteeringFiles: 'steering-files',
} as const satisfies Record<Exclude<keyof ClientCapabilities, 'transportModes'>, ClientCapabilityToken>;

/** Derive the boolean flag view from canonical tokens. */
export function capabilityFlagsFromTokens(
  tokens: readonly string[],
  transportModes: readonly TransportMode[] = ['mcp-bridge', 'http-backend'],
): ClientCapabilities {
  const has = (t: string) => tokens.includes(t);
  return {
    supportsSubagents: has('subagents'),
    supportsMcpTransport: has('mcp-bridge'),
    supportsNativeHooks: has('native-hooks'),
    supportsSteeringFiles: has('steering-files'),
    transportModes: transportModes.filter((m) => m !== 'mcp-bridge' || has('mcp-bridge')),
  };
}

/** Token view of a flag set (inverse of {@link capabilityFlagsFromTokens}, without runtime-only tokens). */
export function capabilityTokensFromFlags(flags: Partial<ClientCapabilities>): ClientCapabilityToken[] {
  return (Object.entries(FLAG_TOKENS) as Array<[keyof typeof FLAG_TOKENS, ClientCapabilityToken]>)
    .filter(([k]) => flags[k] === true)
    .map(([, token]) => token);
}

/** Reject callers that pass both a token array and boolean flags that disagree. */
export function assertConsistentCapabilities(tokens: readonly string[], flags: Partial<ClientCapabilities>): void {
  for (const [k, token] of Object.entries(FLAG_TOKENS) as Array<[keyof typeof FLAG_TOKENS, ClientCapabilityToken]>) {
    if (flags[k] !== undefined && flags[k] !== tokens.includes(token)) {
      throw new Error(`Conflicting capabilities: ${k}=${flags[k]} but token "${token}" is ${tokens.includes(token) ? 'present' : 'absent'}`);
    }
  }
}

/**
 * The runtime/transport baseline every host declares, 1:1 with
 * `test-fixtures/spec/suite-v0.2/capability-matrix.json` (`clientCapabilities`). The negotiated set is the
 * intersection of this with the backend grant and policy, so omitting a token here silently negotiates the
 * feature away (resume, typed parts, cancellation).
 */
const RUNTIME_TOKENS: Record<ClientId, readonly ClientCapabilityToken[]> = {
  copilot: ['approvals', 'background-runs', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts'],
  claude: ['approvals', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts'],
  kiro: ['approvals', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts'],
  opencode: ['approvals', 'background-runs', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts'],
  cursor: ['approvals', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts'],
  codex: ['approvals', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts'],
  antigravity: ['approvals', 'cancel-run', 'cursor-reconnect', 'mcp-bridge', 'subagents', 'typed-content-parts'],
};

/** Projection-level tokens (what the host can be given as files), additional to the runtime baseline. */
const PROJECTION_TOKENS: Record<ClientId, readonly ClientCapabilityToken[]> = {
  copilot: ['native-hooks', 'steering-files'],
  claude: ['native-hooks', 'steering-files'],
  kiro: ['native-hooks', 'steering-files'],
  opencode: ['native-hooks'],
  cursor: ['steering-files'],
  codex: ['native-hooks', 'steering-files'],
  antigravity: ['steering-files'],
};

/** Declared (not probed) host capability tokens: runtime baseline plus projection tokens. Advertised, not negotiated. */
export const CAPABILITY_TOKENS_BY_HOST: Record<ClientId, readonly ClientCapabilityToken[]> = Object.fromEntries(
  (Object.keys(RUNTIME_TOKENS) as ClientId[]).map((id) => [id, [...RUNTIME_TOKENS[id], ...PROJECTION_TOKENS[id]]]),
) as unknown as Record<ClientId, readonly ClientCapabilityToken[]>;
const TRANSPORTS: Record<ClientId, TransportMode[]> = {
  copilot: ['mcp-bridge', 'http-backend', 'in-process'],
  claude: ['mcp-bridge', 'http-backend'],
  kiro: ['mcp-bridge', 'http-backend'],
  opencode: ['mcp-bridge', 'http-backend'],
  cursor: ['mcp-bridge', 'http-backend'],
  codex: ['mcp-bridge', 'http-backend'],
  antigravity: ['mcp-bridge', 'http-backend'],
};

/** Derived boolean view of {@link CAPABILITY_TOKENS_BY_HOST}. */
export const CAPABILITIES: Record<ClientId, ClientCapabilities> = Object.fromEntries(
  (Object.keys(CAPABILITY_TOKENS_BY_HOST) as ClientId[]).map((id) => [id, capabilityFlagsFromTokens(CAPABILITY_TOKENS_BY_HOST[id], TRANSPORTS[id])]),
) as Record<ClientId, ClientCapabilities>;

/**
 * Strict intersection of advertised client tokens, backend grant and policy.
 * An omitted `backend`/`policy` means "no restriction from that party". The
 * result is the negotiated `effectiveCapabilities`, never the advertised set.
 */
export function resolveEffectiveCapabilityTokens(
  client: readonly string[],
  backend?: readonly string[],
  policy?: readonly string[],
): string[] {
  return client.filter((t) => (!backend || backend.includes(t)) && (!policy || policy.includes(t)));
}
type CapabilityKey = Exclude<keyof ClientCapabilities, 'transportModes'>;
const FLAGS: CapabilityKey[] = ['supportsSubagents', 'supportsMcpTransport', 'supportsNativeHooks', 'supportsSteeringFiles'];

/**
 * Strict intersection of client declaration, backend grant and policy.
 * An omitted key in `backend`/`policy` means "no restriction from that party";
 * a present `false` (or `transportModes` list) restricts. The client's own
 * declaration never widens what backend or policy allow.
 */
export function resolveEffectiveCapabilities(
  client: ClientCapabilities,
  backend: Partial<ClientCapabilities> = {},
  policy: Partial<ClientCapabilities> = {},
): ClientCapabilities {
  const out = { transportModes: [...client.transportModes] } as ClientCapabilities;
  for (const k of FLAGS) {
    out[k] = client[k] === true && backend[k] !== false && policy[k] !== false;
  }
  for (const limit of [backend.transportModes, policy.transportModes]) {
    if (limit) out.transportModes = out.transportModes.filter((m) => limit.includes(m));
  }
  if (!out.supportsMcpTransport) out.transportModes = out.transportModes.filter((m) => m !== 'mcp-bridge');
  return out;
}
