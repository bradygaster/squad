import type { ClientCapabilities, ClientId } from './types.js';

/** Declared (not probed) host capabilities; keep conservative. */
export const CAPABILITIES: Record<ClientId, ClientCapabilities> = {
  copilot: { supportsSubagents: true, supportsMcpTransport: true, supportsNativeHooks: true, supportsSteeringFiles: true, transportModes: ['mcp-bridge', 'http-backend', 'in-process'] },
  claude: { supportsSubagents: true, supportsMcpTransport: true, supportsNativeHooks: true, supportsSteeringFiles: true, transportModes: ['mcp-bridge', 'http-backend'] },
  kiro: { supportsSubagents: true, supportsMcpTransport: true, supportsNativeHooks: true, supportsSteeringFiles: true, transportModes: ['mcp-bridge', 'http-backend'] },
  opencode: { supportsSubagents: true, supportsMcpTransport: true, supportsNativeHooks: true, supportsSteeringFiles: false, transportModes: ['mcp-bridge', 'http-backend'] },
  cursor: { supportsSubagents: true, supportsMcpTransport: true, supportsNativeHooks: false, supportsSteeringFiles: true, transportModes: ['mcp-bridge', 'http-backend'] },
  codex: { supportsSubagents: true, supportsMcpTransport: true, supportsNativeHooks: true, supportsSteeringFiles: true, transportModes: ['mcp-bridge', 'http-backend'] },
  antigravity: { supportsSubagents: true, supportsMcpTransport: true, supportsNativeHooks: false, supportsSteeringFiles: true, transportModes: ['mcp-bridge', 'http-backend'] },};

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
