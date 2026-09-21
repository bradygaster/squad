export const AGENT_PROVENANCE_SCHEMA = 'squad-agent-provenance/v1' as const;
export const AGENT_PROVENANCE_VERSION = 1 as const;
export const WORK_AGENT_BINDING_SCHEMA = 'squad-work-agent-binding/v1' as const;
export const WORK_AGENT_BINDING_VERSION = 1 as const;

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
  /** Omit to preserve the current avatar; use null to clear it explicitly. */
  avatar?: AgentAvatarReference | null;
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

export interface WorkAgentBinding {
  binding_schema: typeof WORK_AGENT_BINDING_SCHEMA;
  binding_version: typeof WORK_AGENT_BINDING_VERSION;
  producer: 'squad';
  repository: string;
  origin_issue: number;
  artifact: 'activated' | 'phases-activated' | 'plan-accepted' | 'phases-accepted';
  registry_schema: typeof AGENT_PROVENANCE_SCHEMA;
  registry_revision: number;
  task: string;
  issue: string;
  epic: string;
  epic_issue: string;
  agent_id: string | null;
  epic_agent_ids: string[];
  identity_omission_reason?: 'external-agent' | 'non-roster' | 'legacy-plan-missing-id';
  epic_identity_omission_reason?: 'partial';
}

export interface WorkAgentBindingContext {
  repository: string;
  originIssue: number;
  artifact: WorkAgentBinding['artifact'];
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
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

function requiredString(
  value: unknown,
  path: string,
  diagnostics: AgentProvenanceDiagnostic[],
): string {
  if (typeof value !== 'string' || !value.trim()) {
    diagnostics.push({ path, message: 'non-empty string is required' });
    return '';
  }
  return value.trim();
}

function validateAvatar(
  value: unknown,
  agentId: string,
  path: string,
  diagnostics: AgentProvenanceDiagnostic[],
): AgentAvatarReference | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.kind !== 'repository-path' || typeof value.path !== 'string') {
    diagnostics.push({ path, message: 'avatar must be a repository-path reference' });
    return undefined;
  }
  const expectedPrefix = `.squad/agents/${agentId}/`;
  const segments = value.path.split('/');
  if (!value.path.startsWith(expectedPrefix)
    || value.path.length === expectedPrefix.length
    || value.path.startsWith('/')
    || value.path.includes('\\')
    || segments.includes('..')
    || segments.includes('.')
  ) {
    diagnostics.push({
      path: `${path}.path`,
      message: `avatar path must stay under ${expectedPrefix}`,
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

  const displayName = typeof value.display_name === 'string' ? value.display_name.trim() : '';
  const persistentName = typeof value.persistent_name === 'string'
    ? value.persistent_name.trim()
    : '';
  const role = typeof value.role === 'string' ? value.role.trim() : '';
  const universe = typeof value.universe === 'string' ? value.universe.trim() : '';
  const status = value.status;
  const createdAt = value.created_at;
  const updatedAt = value.updated_at;

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

  const avatar = validateAvatar(value.avatar, id, `${path}.avatar`, diagnostics);
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
 * Parse authoritative work-to-agent bindings and verify them against the
 * producer registry. The entire array fails closed if any row is invalid.
 */
export function parseWorkAgentBindings(
  value: unknown,
  registryResult: AgentProvenanceParseResult,
  context: WorkAgentBindingContext,
): WorkAgentBinding[] {
  if (registryResult.completeness !== 'complete') {
    throw new AgentProvenanceError(
      'Work-agent bindings cannot resolve against a partial registry',
      registryResult.diagnostics,
    );
  }
  const registry = registryResult.registry;
  if (!Array.isArray(value) || value.length === 0) {
    throw new AgentProvenanceError('Work-agent bindings must be a non-empty array');
  }
  const diagnostics: AgentProvenanceDiagnostic[] = [];
  const bindings: WorkAgentBinding[] = [];
  const issues = new Set<string>();
  const tasks = new Set<string>();
  for (const [index, rawBinding] of value.entries()) {
    const path = `bindings.${index}`;
    if (!isRecord(rawBinding)) {
      diagnostics.push({ path, message: 'binding must be an object' });
      continue;
    }
    const bindingSchema = rawBinding.binding_schema;
    const bindingVersion = rawBinding.binding_version;
    const producer = rawBinding.producer;
    const repository = requiredString(rawBinding.repository, `${path}.repository`, diagnostics);
    const originIssue = rawBinding.origin_issue;
    const artifact = rawBinding.artifact;
    const registrySchema = rawBinding.registry_schema;
    const registryRevision = rawBinding.registry_revision;
    const task = requiredString(rawBinding.task, `${path}.task`, diagnostics);
    const issue = requiredString(rawBinding.issue, `${path}.issue`, diagnostics);
    const epic = requiredString(rawBinding.epic, `${path}.epic`, diagnostics);
    const epicIssue = requiredString(rawBinding.epic_issue, `${path}.epic_issue`, diagnostics);
    const agentId = rawBinding.agent_id === null
      ? null
      : requiredString(rawBinding.agent_id, `${path}.agent_id`, diagnostics);
    const identityOmissionReason = rawBinding.identity_omission_reason;
    const epicIdentityOmissionReason = rawBinding.epic_identity_omission_reason;
    const epicAgentIds = Array.isArray(rawBinding.epic_agent_ids)
      ? rawBinding.epic_agent_ids.map((value, agentIndex) =>
        requiredString(value, `${path}.epic_agent_ids.${agentIndex}`, diagnostics))
      : [];

    if (bindingSchema !== WORK_AGENT_BINDING_SCHEMA) {
      diagnostics.push({ path: `${path}.binding_schema`, message: `must be ${WORK_AGENT_BINDING_SCHEMA}` });
    }
    if (bindingVersion !== WORK_AGENT_BINDING_VERSION) {
      diagnostics.push({ path: `${path}.binding_version`, message: 'must be 1' });
    }
    if (producer !== 'squad') {
      diagnostics.push({ path: `${path}.producer`, message: 'must be squad' });
    }
    if (repository !== context.repository) {
      diagnostics.push({ path: `${path}.repository`, message: 'does not match the artifact repository' });
    }
    if (!Number.isInteger(originIssue) || originIssue !== context.originIssue) {
      diagnostics.push({ path: `${path}.origin_issue`, message: 'does not match the artifact origin issue' });
    }
    if (artifact !== context.artifact) {
      diagnostics.push({ path: `${path}.artifact`, message: 'does not match the artifact kind' });
    }
    if (registrySchema !== AGENT_PROVENANCE_SCHEMA) {
      diagnostics.push({ path: `${path}.registry_schema`, message: `must be ${AGENT_PROVENANCE_SCHEMA}` });
    }
    if (!Number.isInteger(registryRevision) || Number(registryRevision) < 1) {
      diagnostics.push({ path: `${path}.registry_revision`, message: 'must be a positive integer' });
    } else if (Number(registryRevision) > registry.revision) {
      diagnostics.push({ path: `${path}.registry_revision`, message: 'is newer than the available registry' });
    }
    if (agentId === null) {
      if (!['external-agent', 'non-roster', 'legacy-plan-missing-id'].includes(
        identityOmissionReason as string,
      )) {
        diagnostics.push({
          path: `${path}.identity_omission_reason`,
          message: 'is required when agent_id is null',
        });
      }
    } else {
      if (identityOmissionReason !== undefined) {
        diagnostics.push({
          path: `${path}.identity_omission_reason`,
          message: 'must be absent when agent_id is present',
        });
      }
      if (!validateId(agentId)) {
        diagnostics.push({ path: `${path}.agent_id`, message: 'must be a lowercase kebab-case agent id' });
      } else if (!registry.agents[agentId]) {
        diagnostics.push({ path: `${path}.agent_id`, message: 'is absent from the producer registry' });
      }
    }
    if (!Array.isArray(rawBinding.epic_agent_ids)) {
      diagnostics.push({ path: `${path}.epic_agent_ids`, message: 'must be an array' });
    } else {
      const uniqueIds = new Set(epicAgentIds);
      if (uniqueIds.size !== epicAgentIds.length || (agentId !== null && !uniqueIds.has(agentId))) {
        diagnostics.push({
          path: `${path}.epic_agent_ids`,
          message: 'must contain unique ids and include a non-null agent_id',
        });
      }
      for (const [agentIndex, epicAgentId] of epicAgentIds.entries()) {
        if (!validateId(epicAgentId) || !registry.agents[epicAgentId]) {
          diagnostics.push({
            path: `${path}.epic_agent_ids.${agentIndex}`,
            message: 'must reference an id in the producer registry',
          });
        }
      }
      if (epicIdentityOmissionReason !== undefined && epicIdentityOmissionReason !== 'partial') {
        diagnostics.push({
          path: `${path}.epic_identity_omission_reason`,
          message: 'must be partial when present',
        });
      }
    }
    if (issue && issues.has(issue)) {
      diagnostics.push({ path: `${path}.issue`, message: 'duplicates another work binding' });
    }
    if (issue) issues.add(issue);
    if (task && tasks.has(task)) {
      diagnostics.push({ path: `${path}.task`, message: 'duplicates another work binding' });
    }
    if (task) tasks.add(task);

    if (!diagnostics.some((diagnostic) =>
      diagnostic.path === path || diagnostic.path.startsWith(`${path}.`),
    )) {
      bindings.push({
        binding_schema: WORK_AGENT_BINDING_SCHEMA,
        binding_version: WORK_AGENT_BINDING_VERSION,
        producer: 'squad',
        repository,
        origin_issue: originIssue as number,
        artifact: artifact as WorkAgentBinding['artifact'],
        registry_schema: AGENT_PROVENANCE_SCHEMA,
        registry_revision: registryRevision as number,
        task,
        issue,
        epic,
        epic_issue: epicIssue,
        agent_id: agentId,
        epic_agent_ids: [...epicAgentIds].sort(),
        ...(identityOmissionReason
          ? { identity_omission_reason: identityOmissionReason as WorkAgentBinding['identity_omission_reason'] }
          : {}),
        ...(epicIdentityOmissionReason
          ? { epic_identity_omission_reason: 'partial' as const }
          : {}),
      });
    }
  }
  if (diagnostics.length > 0) {
    throw new AgentProvenanceError('Work-agent bindings are malformed or partial', diagnostics);
  }

  const expectedRegistryRevision = bindings[0]!.registry_revision;
  const epicIssueByIdentifier = new Map<string, string>();
  const epicIdentifierByIssue = new Map<string, string>();
  const bindingsByEpicIssue = new Map<string, Array<{ binding: WorkAgentBinding; index: number }>>();

  for (const [index, binding] of bindings.entries()) {
    const path = `bindings.${index}`;
    if (binding.registry_revision !== expectedRegistryRevision) {
      diagnostics.push({
        path: `${path}.registry_revision`,
        message: `must match the document registry revision ${expectedRegistryRevision}`,
      });
    }

    const priorEpicIssue = epicIssueByIdentifier.get(binding.epic);
    if (priorEpicIssue !== undefined && priorEpicIssue !== binding.epic_issue) {
      diagnostics.push({
        path: `${path}.epic_issue`,
        message: `epic ${binding.epic} maps to multiple epic issues`,
      });
    } else {
      epicIssueByIdentifier.set(binding.epic, binding.epic_issue);
    }

    const priorEpicIdentifier = epicIdentifierByIssue.get(binding.epic_issue);
    if (priorEpicIdentifier !== undefined && priorEpicIdentifier !== binding.epic) {
      diagnostics.push({
        path: `${path}.epic`,
        message: `epic issue ${binding.epic_issue} maps to multiple epic identifiers`,
      });
    } else {
      epicIdentifierByIssue.set(binding.epic_issue, binding.epic);
    }

    const epicBindings = bindingsByEpicIssue.get(binding.epic_issue) ?? [];
    epicBindings.push({ binding, index });
    bindingsByEpicIssue.set(binding.epic_issue, epicBindings);
  }

  for (const epicBindings of bindingsByEpicIssue.values()) {
    const expectedAgentIds = [...new Set(
      epicBindings
        .map(({ binding }) => binding.agent_id)
        .filter((agentId): agentId is string => agentId !== null),
    )].sort();
    const hasIdentityOmission = epicBindings.some(({ binding }) => binding.agent_id === null);

    for (const { binding, index } of epicBindings) {
      const path = `bindings.${index}`;
      if (binding.epic_agent_ids.join('\0') !== expectedAgentIds.join('\0')) {
        diagnostics.push({
          path: `${path}.epic_agent_ids`,
          message: `must equal the complete agent id set for epic ${binding.epic}`,
        });
      }
      if (hasIdentityOmission && binding.epic_identity_omission_reason !== 'partial') {
        diagnostics.push({
          path: `${path}.epic_identity_omission_reason`,
          message: 'must be partial on every binding when any epic task omits agent_id',
        });
      }
      if (!hasIdentityOmission && binding.epic_identity_omission_reason !== undefined) {
        diagnostics.push({
          path: `${path}.epic_identity_omission_reason`,
          message: 'must be absent when every epic task has agent_id',
        });
      }
    }
  }

  if (diagnostics.length > 0) {
    throw new AgentProvenanceError('Work-agent bindings are malformed or partial', diagnostics);
  }
  return bindings;
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
  if (value === undefined) {
    return {
      schema: AGENT_PROVENANCE_SCHEMA,
      schema_version: AGENT_PROVENANCE_VERSION,
      revision: 0,
      generated_at: generatedAt,
      agents: {},
    };
  }
  if (!isRecord(value) || !isRecord(value.agents)) {
    throw new AgentProvenanceError('Legacy agent provenance registry must contain an agents object');
  }
  const agents: Record<string, AgentProvenanceRecord> = {};
  for (const [id, rawRecord] of Object.entries(value.agents)) {
    if (!validateId(id) || !isRecord(rawRecord)) {
      throw new AgentProvenanceError(`Malformed legacy agent provenance record "${id}"`);
    }
    const displayName = typeof rawRecord.persistent_name === 'string'
      ? rawRecord.persistent_name.trim()
      : '';
    if (!displayName || !isTimestamp(rawRecord.created_at)
      || !['active', 'inactive', 'retired'].includes(String(rawRecord.status))
      || typeof rawRecord.universe !== 'string' || !rawRecord.universe.trim()
      || (rawRecord.status === 'retired' && !isTimestamp(rawRecord.retired_at))
    ) {
      throw new AgentProvenanceError(`Incomplete legacy agent provenance record "${id}"`);
    }
    const createdAt = rawRecord.created_at;
    const status = rawRecord.status as AgentProvenanceStatus;
    agents[id] = {
      display_name: displayName,
      persistent_name: displayName,
      role: typeof rawRecord.role === 'string' && rawRecord.role.trim()
        ? rawRecord.role.trim()
        : id,
      universe: rawRecord.universe.trim(),
      status,
      created_at: createdAt,
      updated_at: isTimestamp(rawRecord.updated_at) ? rawRecord.updated_at : createdAt,
      ...(status === 'retired'
        ? { retired_at: rawRecord.retired_at as string }
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
 * Candidates bind only through their explicit immutable id. Display name,
 * role, labels, paths, and other incidental signals never establish identity.
 * A rename therefore supplies the existing id with a new displayName. Missing
 * members are tombstoned when retireMissing is true, and ids are never reused.
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

    const id = candidate.id;
    if (claimedIds.has(id)) {
      throw new AgentProvenanceError(`Multiple candidates resolve to agent id "${id}"`);
    }
    claimedIds.add(id);
    const previous = existing.agents[id];
    const displayCollision = Object.entries(existing.agents).find(([existingId, record]) =>
      existingId !== id && normalizedDisplayName(record.display_name) === normalizedName,
    );
    if (displayCollision) {
      throw new AgentProvenanceError(
        `Display name "${displayName}" belongs to agent id "${displayCollision[0]}"`,
      );
    }
    if (!previous) {
      const roleHints = Object.entries(existing.agents)
        .filter(([, record]) => record.status !== 'retired' && record.role === role)
        .map(([existingId]) => existingId);
      if (roleHints.length > 0) {
        throw new AgentProvenanceError(
          `New agent id "${id}" ambiguously resembles existing role owner(s) `
          + `${roleHints.join(', ')}; supply the existing stable id for a rename`,
        );
      }
    }
    if (previous && previous.role !== role) {
      throw new AgentProvenanceError(
        `Agent id "${id}" cannot change role from "${previous.role}" to "${role}"`,
      );
    }
    const candidateDiagnostics: AgentProvenanceDiagnostic[] = [];
    const avatar = candidate.avatar === null
      ? undefined
      : candidate.avatar === undefined
        ? previous?.avatar
        : validateAvatar(candidate.avatar, id, `candidates.${id}.avatar`, candidateDiagnostics);
    if (candidateDiagnostics.length > 0) {
      throw new AgentProvenanceError(`Invalid avatar for agent id "${id}"`, candidateDiagnostics);
    }
    nextAgents[id] = {
      display_name: displayName,
      persistent_name: displayName,
      role,
      universe: candidate.universe.trim(),
      status: 'active',
      created_at: previous?.created_at ?? generatedAt,
      updated_at: generatedAt,
      ...(avatar ? { avatar } : {}),
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
