export const AGENT_PROVENANCE_SCHEMA = 'squad-agent-provenance/v1' as const;
export const AGENT_PROVENANCE_VERSION = 1 as const;

export type AgentProvenanceStatus = 'active' | 'inactive' | 'retired';

export interface AgentAvatarReference {
  kind: 'repository-path';
  path: string;
}

export interface AgentProvenanceRecord {
  display_name: string;
  /** Compatibility alias for older Squad consumers. */
  persistent_name: string;
  role: string;
  universe: string;
  status: AgentProvenanceStatus;
  created_at: string;
  updated_at: string;
  retired_at?: string;
  avatar?: AgentAvatarReference;
  legacy_named?: boolean;
}

export interface AgentProvenanceRegistry {
  schema: typeof AGENT_PROVENANCE_SCHEMA;
  schema_version: typeof AGENT_PROVENANCE_VERSION;
  revision: number;
  generated_at: string;
  agents: Record<string, AgentProvenanceRecord>;
}

export interface AgentProvenanceCandidate {
  id: string;
  displayName: string;
  role: string;
  universe: string;
  avatar?: AgentAvatarReference;
  legacyNamed?: boolean;
}

export interface AgentProvenanceDiagnostic {
  path: string;
  message: string;
}

export interface AgentProvenanceParseResult {
  registry: AgentProvenanceRegistry;
  completeness: 'complete' | 'partial';
  diagnostics: AgentProvenanceDiagnostic[];
}

export interface ReconcileAgentProvenanceOptions {
  generatedAt?: string;
  retireMissing?: boolean;
}

export class AgentProvenanceError extends Error {
  readonly diagnostics: AgentProvenanceDiagnostic[];

  constructor(message: string, diagnostics: AgentProvenanceDiagnostic[] = []) {
    super(message);
    this.name = 'AgentProvenanceError';
    this.diagnostics = diagnostics;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function normalizedDisplayName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function validateId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(id);
}

function validateAvatar(
  value: unknown,
  path: string,
  diagnostics: AgentProvenanceDiagnostic[],
): AgentAvatarReference | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.kind !== 'repository-path' || typeof value.path !== 'string') {
    diagnostics.push({ path, message: 'avatar must be a repository-path reference' });
    return undefined;
  }
  if (
    !value.path.startsWith('.squad/agents/')
    || value.path.startsWith('/')
    || value.path.includes('..')
    || value.path.includes('\\')
  ) {
    diagnostics.push({
      path: `${path}.path`,
      message: 'avatar path must stay under .squad/agents/',
    });
    return undefined;
  }
  return { kind: 'repository-path', path: value.path };
}

function parseRecord(
  id: string,
  value: unknown,
  path: string,
  diagnostics: AgentProvenanceDiagnostic[],
): AgentProvenanceRecord | undefined {
  if (!validateId(id)) {
    diagnostics.push({ path, message: 'agent id must be lowercase kebab-case' });
    return undefined;
  }
  if (!isRecord(value)) {
    diagnostics.push({ path, message: 'agent record must be an object' });
    return undefined;
  }

  const displayName = typeof value.display_name === 'string'
    ? value.display_name.trim()
    : typeof value.persistent_name === 'string'
      ? value.persistent_name.trim()
      : '';
  const persistentName = typeof value.persistent_name === 'string'
    ? value.persistent_name.trim()
    : displayName;
  const role = typeof value.role === 'string' ? value.role.trim() : '';
  const universe = typeof value.universe === 'string' ? value.universe.trim() : '';
  const status = value.status;
  const createdAt = value.created_at;
  const updatedAt = value.updated_at ?? value.created_at;

  if (!displayName) diagnostics.push({ path: `${path}.display_name`, message: 'display name is required' });
  if (!persistentName) diagnostics.push({ path: `${path}.persistent_name`, message: 'persistent_name compatibility alias is required' });
  if (persistentName && displayName && persistentName !== displayName) {
    diagnostics.push({ path: `${path}.persistent_name`, message: 'persistent_name must equal display_name' });
  }
  if (!role) diagnostics.push({ path: `${path}.role`, message: 'role is required' });
  if (!universe) diagnostics.push({ path: `${path}.universe`, message: 'universe is required' });
  if (!['active', 'inactive', 'retired'].includes(String(status))) {
    diagnostics.push({ path: `${path}.status`, message: 'status must be active, inactive, or retired' });
  }
  if (!isTimestamp(createdAt)) {
    diagnostics.push({ path: `${path}.created_at`, message: 'created_at must be an ISO-8601 timestamp' });
  }
  if (!isTimestamp(updatedAt)) {
    diagnostics.push({ path: `${path}.updated_at`, message: 'updated_at must be an ISO-8601 timestamp' });
  }
  if (status === 'retired' && !isTimestamp(value.retired_at)) {
    diagnostics.push({ path: `${path}.retired_at`, message: 'retired records require retired_at' });
  }

  const avatar = validateAvatar(value.avatar, `${path}.avatar`, diagnostics);
  const recordDiagnostics = diagnostics.filter((diagnostic) =>
    diagnostic.path === path || diagnostic.path.startsWith(`${path}.`),
  );
  if (recordDiagnostics.length > 0) return undefined;

  return {
    display_name: displayName,
    persistent_name: persistentName,
    role,
    universe,
    status: status as AgentProvenanceStatus,
    created_at: createdAt as string,
    updated_at: updatedAt as string,
    ...(status === 'retired' ? { retired_at: value.retired_at as string } : {}),
    ...(avatar ? { avatar } : {}),
    ...(typeof value.legacy_named === 'boolean' ? { legacy_named: value.legacy_named } : {}),
  };
}

/**
 * Parse a producer-owned registry. Invalid individual records are excluded and
 * reported as partial; invalid or unsupported roots fail closed.
 */
export function parseAgentProvenanceRegistry(value: unknown): AgentProvenanceParseResult {
  if (!isRecord(value)) {
    throw new AgentProvenanceError('Agent provenance registry root must be an object');
  }
  if (value.schema !== AGENT_PROVENANCE_SCHEMA || value.schema_version !== AGENT_PROVENANCE_VERSION) {
    throw new AgentProvenanceError(
      `Unsupported agent provenance schema; expected ${AGENT_PROVENANCE_SCHEMA}`,
    );
  }
  if (!Number.isInteger(value.revision) || Number(value.revision) < 1) {
    throw new AgentProvenanceError('Agent provenance revision must be a positive integer');
  }
  if (!isTimestamp(value.generated_at)) {
    throw new AgentProvenanceError('Agent provenance generated_at must be an ISO-8601 timestamp');
  }
  if (!isRecord(value.agents)) {
    throw new AgentProvenanceError('Agent provenance agents must be an object');
  }

  const diagnostics: AgentProvenanceDiagnostic[] = [];
  const agents: Record<string, AgentProvenanceRecord> = {};
  const displayNames = new Map<string, string>();
  for (const [id, rawRecord] of Object.entries(value.agents)) {
    const record = parseRecord(id, rawRecord, `agents.${id}`, diagnostics);
    if (!record) continue;
    const normalizedName = normalizedDisplayName(record.display_name);
    const duplicate = displayNames.get(normalizedName);
    if (duplicate) {
      diagnostics.push({
        path: `agents.${id}.display_name`,
        message: `display name collides with agent ${duplicate}`,
      });
      delete agents[duplicate];
      continue;
    }
    displayNames.set(normalizedName, id);
    agents[id] = record;
  }

  return {
    registry: {
      schema: AGENT_PROVENANCE_SCHEMA,
      schema_version: AGENT_PROVENANCE_VERSION,
      revision: value.revision as number,
      generated_at: value.generated_at as string,
      agents,
    },
    completeness: diagnostics.length === 0 ? 'complete' : 'partial',
    diagnostics,
  };
}

function readLegacyRegistry(value: unknown, generatedAt: string): AgentProvenanceRegistry {
  if (!isRecord(value) || !isRecord(value.agents)) {
    return {
      schema: AGENT_PROVENANCE_SCHEMA,
      schema_version: AGENT_PROVENANCE_VERSION,
      revision: 0,
      generated_at: generatedAt,
      agents: {},
    };
  }
  const agents: Record<string, AgentProvenanceRecord> = {};
  for (const [id, rawRecord] of Object.entries(value.agents)) {
    if (!validateId(id) || !isRecord(rawRecord)) continue;
    const displayName = typeof rawRecord.persistent_name === 'string'
      ? rawRecord.persistent_name.trim()
      : '';
    const createdAt = isTimestamp(rawRecord.created_at) ? rawRecord.created_at : generatedAt;
    const status = ['active', 'inactive', 'retired'].includes(String(rawRecord.status))
      ? rawRecord.status as AgentProvenanceStatus
      : 'active';
    if (!displayName) continue;
    agents[id] = {
      display_name: displayName,
      persistent_name: displayName,
      role: typeof rawRecord.role === 'string' && rawRecord.role.trim()
        ? rawRecord.role.trim()
        : id,
      universe: typeof rawRecord.universe === 'string' && rawRecord.universe.trim()
        ? rawRecord.universe.trim()
        : 'descriptive',
      status,
      created_at: createdAt,
      updated_at: isTimestamp(rawRecord.updated_at) ? rawRecord.updated_at : createdAt,
      ...(status === 'retired'
        ? { retired_at: isTimestamp(rawRecord.retired_at) ? rawRecord.retired_at : generatedAt }
        : {}),
      ...(typeof rawRecord.legacy_named === 'boolean'
        ? { legacy_named: rawRecord.legacy_named }
        : {}),
    };
  }
  return {
    schema: AGENT_PROVENANCE_SCHEMA,
    schema_version: AGENT_PROVENANCE_VERSION,
    revision: 0,
    generated_at: generatedAt,
    agents,
  };
}

function loadExistingRegistry(value: unknown, generatedAt: string): AgentProvenanceRegistry {
  if (isRecord(value) && value.schema !== undefined) {
    const parsed = parseAgentProvenanceRegistry(value);
    if (parsed.completeness === 'partial') {
      throw new AgentProvenanceError(
        'Cannot reconcile a partial agent provenance registry',
        parsed.diagnostics,
      );
    }
    return parsed.registry;
  }
  return readLegacyRegistry(value, generatedAt);
}

/**
 * Reconcile producer candidates with a prior registry.
 *
 * Identity match order is immutable id, then exact display name, then a unique
 * active role. Renames therefore retain the registry key. Missing members are
 * tombstoned when retireMissing is true, and ids are never reused.
 */
export function reconcileAgentProvenanceRegistry(
  existingValue: unknown,
  candidates: readonly AgentProvenanceCandidate[],
  options: ReconcileAgentProvenanceOptions = {},
): AgentProvenanceRegistry {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const existing = loadExistingRegistry(existingValue, generatedAt);
  const nextAgents: Record<string, AgentProvenanceRecord> = { ...existing.agents };
  const claimedIds = new Set<string>();
  const candidateIds = new Set<string>();
  const candidateNames = new Set<string>();

  for (const candidate of candidates) {
    if (!validateId(candidate.id)) {
      throw new AgentProvenanceError(`Invalid agent id "${candidate.id}"`);
    }
    const displayName = candidate.displayName.trim();
    const role = candidate.role.trim();
    if (!displayName || !role || !candidate.universe.trim()) {
      throw new AgentProvenanceError('Agent id, display name, role, and universe are required');
    }
    const normalizedName = normalizedDisplayName(displayName);
    if (candidateIds.has(candidate.id)) {
      throw new AgentProvenanceError(`Duplicate candidate agent id "${candidate.id}"`);
    }
    if (candidateNames.has(normalizedName)) {
      throw new AgentProvenanceError(`Duplicate candidate display name "${displayName}"`);
    }
    candidateIds.add(candidate.id);
    candidateNames.add(normalizedName);

    let matchedId = existing.agents[candidate.id] ? candidate.id : undefined;
    if (!matchedId) {
      matchedId = Object.entries(existing.agents).find(([, record]) =>
        normalizedDisplayName(record.display_name) === normalizedName,
      )?.[0];
    }
    if (!matchedId) {
      const roleMatches = Object.entries(existing.agents).filter(([, record]) =>
        record.status !== 'retired' && record.role === role,
      );
      if (roleMatches.length === 1) matchedId = roleMatches[0]![0];
      if (roleMatches.length > 1) {
        throw new AgentProvenanceError(`Agent role "${role}" is ambiguous in the existing registry`);
      }
    }

    const id = matchedId ?? candidate.id;
    if (claimedIds.has(id)) {
      throw new AgentProvenanceError(`Multiple candidates resolve to agent id "${id}"`);
    }
    if (!matchedId && existing.agents[id]) {
      throw new AgentProvenanceError(`Agent id "${id}" cannot be reused`);
    }
    claimedIds.add(id);
    const previous = existing.agents[id];
    if (previous?.status === 'retired' && previous.role !== role) {
      throw new AgentProvenanceError(
        `Retired agent id "${id}" cannot be reassigned from role "${previous.role}" to "${role}"`,
      );
    }
    nextAgents[id] = {
      display_name: displayName,
      persistent_name: displayName,
      role,
      universe: candidate.universe.trim(),
      status: 'active',
      created_at: previous?.created_at ?? generatedAt,
      updated_at: generatedAt,
      ...(candidate.avatar ? { avatar: candidate.avatar } : {}),
      ...(candidate.legacyNamed !== undefined
        ? { legacy_named: candidate.legacyNamed }
        : previous?.legacy_named !== undefined
          ? { legacy_named: previous.legacy_named }
          : {}),
    };
  }

  if (options.retireMissing) {
    for (const [id, record] of Object.entries(existing.agents)) {
      if (claimedIds.has(id) || record.status === 'retired') continue;
      nextAgents[id] = {
        ...record,
        status: 'retired',
        updated_at: generatedAt,
        retired_at: generatedAt,
      };
    }
  }

  const result: AgentProvenanceRegistry = {
    schema: AGENT_PROVENANCE_SCHEMA,
    schema_version: AGENT_PROVENANCE_VERSION,
    revision: existing.revision + 1,
    generated_at: generatedAt,
    agents: nextAgents,
  };
  const parsed = parseAgentProvenanceRegistry(result);
  if (parsed.completeness !== 'complete') {
    throw new AgentProvenanceError('Generated agent provenance registry is invalid', parsed.diagnostics);
  }
  return result;
}
