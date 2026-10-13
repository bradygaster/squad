import { createHash } from 'node:crypto';

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
  artifact: 'activated' | 'phases-activated' | 'plan-accepted' | 'phases-accepted' | 'activation-reconciled';
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
  /** Full frozen-plan assignments supplied independently by the trusted verifier. */
  epicAssignments?: readonly EpicAssignment[];
}

/**
 * One task's epic and agent assignment from the full frozen plan.
 * Supply independently verified assignments when validating epic owner sets.
 */
export interface EpicAssignment {
  task: string;
  epic: string;
  agent: string;
  agentId: string | null;
}

/**
 * A comment ID and exact body supplied to activation selection, including any
 * required source or predecessor. These fields alone do not authenticate its author.
 */
export interface ActivationRecord {
  id: number;
  body: string;
}

/**
 * Evidence supplied independently by a trusted API verifier, never derived from
 * artifact claims or an `authorized` boolean. The verifier authenticates the
 * request actor and authorization and freezes the current plan and registry.
 * This reader does not authenticate authors or attest historical correctness.
 */
export interface ReconciliationEvidence {
  requestCommentId: number;
  requestSha256: string;
  actorId: number;
  sourceCommentId: number;
  sourceSha256: string;
  planSha256: string;
  registrySha256: string;
  bindingsSha256: string;
  /** Ascending, unique positive safe phase IDs; omitted means whole-plan ([]). */
  phases?: readonly number[];
  /** Independently verified source kind; omission preserves legacy activation sources. */
  sourceKind?: 'activation' | 'pending';
}

/**
 * Repository and origin scope plus independently verified reconciliation evidence.
 * Supply one proof per reconciliation in a complete chain; caller-populated
 * fields and frozen-plan assignments are not themselves authorization.
 */
export interface ActivationSelectionContext {
  repository: string;
  originIssue: number;
  reconciliations: readonly ReconciliationEvidence[];
  /** Full frozen-plan assignments, never authorization claimed by an artifact. */
  epicAssignments?: readonly EpicAssignment[];
}

/**
 * The selected comment's ID, artifact kind and validated work-agent bindings.
 * Selection checks consistency against supplied inputs, not API authorship or
 * historical publication; callers must establish those trust boundaries separately.
 */
export interface SelectedActivationRecord {
  id: number;
  artifact: WorkAgentBinding['artifact'];
  bindings: WorkAgentBinding[];
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

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function numericIssueReference(
  value: unknown,
  path: string,
  diagnostics: AgentProvenanceDiagnostic[],
): string {
  if (typeof value !== 'string' || !/^#?[1-9]\d*$/.test(value)
    || !isPositiveSafeInteger(Number(value.replace(/^#/, '')))) {
    diagnostics.push({ path, message: 'must be a positive safe integer issue reference' });
    return '';
  }
  return value;
}

function issueReferenceKey(value: string): string {
  return value.replace(/^#/, '');
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
  const assignmentsByTask = new Map<string, EpicAssignment>();
  const assignmentsByEpic = new Map<string, EpicAssignment[]>();
  if (context.epicAssignments !== undefined) {
    if (!Array.isArray(context.epicAssignments) || context.epicAssignments.length === 0) {
      throw new AgentProvenanceError('Verifier epic assignments must be a non-empty array');
    }
    for (const assignment of context.epicAssignments) {
      if (!isRecord(assignment)
        || typeof assignment.task !== 'string' || !assignment.task || /\s/.test(assignment.task)
        || typeof assignment.epic !== 'string' || !assignment.epic || /\s/.test(assignment.epic)
        || typeof assignment.agent !== 'string' || !assignment.agent.trim()
        || assignmentsByTask.has(assignment.task)) {
        throw new AgentProvenanceError('Verifier epic assignments require unique stable task IDs and complete identities');
      }
      const agentName = normalizedDisplayName(assignment.agent);
      if (assignment.agentId === null) {
        if (Object.values(registry.agents).some((agent) =>
          normalizedDisplayName(agent.display_name) === normalizedDisplayName(agentName))) {
          throw new AgentProvenanceError('Verifier epic assignment omits a registered agent identity');
        }
      } else if (typeof assignment.agentId !== 'string' || !validateId(assignment.agentId)
        || !registry.agents[assignment.agentId]
        || normalizedDisplayName(registry.agents[assignment.agentId]!.display_name) !== agentName) {
        throw new AgentProvenanceError('Verifier epic assignment agent and display identity do not match the registry');
      }
      const validatedAssignment: EpicAssignment = {
        task: assignment.task,
        epic: assignment.epic,
        agent: agentName,
        agentId: assignment.agentId as string | null,
      };
      assignmentsByTask.set(assignment.task, validatedAssignment);
      const epicAssignments = assignmentsByEpic.get(assignment.epic) ?? [];
      epicAssignments.push(validatedAssignment);
      assignmentsByEpic.set(assignment.epic, epicAssignments);
    }
  }
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
    const issue = numericIssueReference(rawBinding.issue, `${path}.issue`, diagnostics);
    const epic = requiredString(rawBinding.epic, `${path}.epic`, diagnostics);
    const epicIssue = numericIssueReference(rawBinding.epic_issue, `${path}.epic_issue`, diagnostics);
    const agentId = rawBinding.agent_id === null
      ? null
      : requiredString(rawBinding.agent_id, `${path}.agent_id`, diagnostics);
    const identityOmissionReason = rawBinding.identity_omission_reason;
    const epicIdentityOmissionReason = rawBinding.epic_identity_omission_reason;
    const epicAgentIds = Array.isArray(rawBinding.epic_agent_ids)
      ? rawBinding.epic_agent_ids.map((value, agentIndex) =>
        requiredString(value, `${path}.epic_agent_ids.${agentIndex}`, diagnostics))
      : [];

    if (context.epicAssignments !== undefined) {
      const assignment = assignmentsByTask.get(task);
      if (!assignment || rawBinding.task !== assignment.task || rawBinding.epic !== assignment.epic
        || rawBinding.agent_id !== assignment.agentId
        || (rawBinding.agent !== undefined && (typeof rawBinding.agent !== 'string'
          || normalizedDisplayName(rawBinding.agent) !== assignment.agent))) {
        diagnostics.push({
          path, message: 'must exactly match a task, epic, and agent in the verifier frozen-plan assignments',
        });
      }
      if (rawBinding.epic_agents !== undefined) {
        const expectedNames = [...new Set(
          (assignmentsByEpic.get(epic) ?? []).map((entry) => entry.agent),
        )].sort();
        if (!Array.isArray(rawBinding.epic_agents)
          || rawBinding.epic_agents.some((name) => typeof name !== 'string')
          || JSON.stringify(rawBinding.epic_agents.map(normalizedDisplayName).sort()) !== JSON.stringify(expectedNames)) {
          diagnostics.push({
            path: `${path}.epic_agents`,
            message: 'must equal the complete agent name set in the verifier frozen-plan assignments',
          });
        }
      }
    }

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
    if (!isPositiveSafeInteger(originIssue) || originIssue !== context.originIssue) {
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
    if (issue && issues.has(issueReferenceKey(issue))) {
      diagnostics.push({ path: `${path}.issue`, message: 'duplicates another work binding' });
    }
    if (issue) issues.add(issueReferenceKey(issue));
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

  const epicIssueKeys = new Set(bindings.map((binding) => issueReferenceKey(binding.epic_issue)));
  for (const [index, binding] of bindings.entries()) {
    const taskIssueKey = issueReferenceKey(binding.issue);
    if (taskIssueKey === String(context.originIssue) || epicIssueKeys.has(taskIssueKey)) {
      diagnostics.push({
        path: `bindings.${index}.issue`,
        message: 'task issue must not be the origin issue or any epic issue',
      });
    }
    if (binding.epic !== 'origin' && issueReferenceKey(binding.epic_issue) === String(context.originIssue)) {
      diagnostics.push({
        path: `bindings.${index}.epic_issue`,
        message: 'only the origin epic may reference the origin issue',
      });
    }
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

    const epicIssueKey = issueReferenceKey(binding.epic_issue);
    const priorEpicIssue = epicIssueByIdentifier.get(binding.epic);
    if (priorEpicIssue !== undefined && priorEpicIssue !== epicIssueKey) {
      diagnostics.push({
        path: `${path}.epic_issue`,
        message: `epic ${binding.epic} maps to multiple epic issues`,
      });
    } else {
      epicIssueByIdentifier.set(binding.epic, epicIssueKey);
    }

    const priorEpicIdentifier = epicIdentifierByIssue.get(epicIssueKey);
    if (priorEpicIdentifier !== undefined && priorEpicIdentifier !== binding.epic) {
      diagnostics.push({
        path: `${path}.epic`,
        message: `epic issue ${binding.epic_issue} maps to multiple epic identifiers`,
      });
    } else {
      epicIdentifierByIssue.set(epicIssueKey, binding.epic);
    }

    const epicBindings = bindingsByEpicIssue.get(epicIssueKey) ?? [];
    epicBindings.push({ binding, index });
    bindingsByEpicIssue.set(epicIssueKey, epicBindings);
  }

  for (const epicBindings of bindingsByEpicIssue.values()) {
    const completeAgentIds = context.epicAssignments === undefined
      ? epicBindings.map(({ binding }) => binding.agent_id)
      : assignmentsByEpic.get(epicBindings[0]!.binding.epic)!.map((assignment) => assignment.agentId);
    const expectedAgentIds = [...new Set(
      completeAgentIds.filter((agentId): agentId is string => agentId !== null),
    )].sort();
    const hasIdentityOmission = completeAgentIds.some((agentId) => agentId === null);

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

const ACTIVATION_ARTIFACTS: readonly WorkAgentBinding['artifact'][] = [
  'activated', 'phases-activated', 'plan-accepted', 'phases-accepted', 'activation-reconciled',
];

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function readActivationSection(body: string, label: string): unknown {
  const labels = body.match(new RegExp(`^${label}:[ \\t]*\\r?$`, 'gm')) ?? [];
  const blocks = [...body.matchAll(new RegExp(
    `^${label}:[ \\t]*\\r?\\n\\s*\`\`\`json[ \\t]*\\r?\\n([\\s\\S]*?)^\`\`\`[ \\t]*\\r?$`,
    'gm',
  ))];
  if (labels.length !== 1 || blocks.length !== 1) {
    throw new AgentProvenanceError(`Activation record requires exactly one ${label} JSON section`);
  }
  try {
    return JSON.parse(blocks[0]![1]!);
  } catch {
    throw new AgentProvenanceError(`Malformed ${label} JSON section`);
  }
}

function activationEnvelope(value: unknown, originIssue: number): WorkAgentBinding['artifact'] {
  if (!isRecord(value)
    || !ACTIVATION_ARTIFACTS.includes(value.squad_artifact as WorkAgentBinding['artifact'])
    || value.schema_version !== '1'
    || !isPositiveSafeInteger(value.origin_issue)
    || value.origin_issue !== originIssue
    || !Array.isArray(value.phases)) {
    throw new AgentProvenanceError('Unknown, malformed, or cross-origin activation envelope');
  }
  if (!value.phases.every(isPositiveSafeInteger) || new Set(value.phases).size !== value.phases.length) {
    throw new AgentProvenanceError('Malformed activation phase scope: expected unique positive safe integers');
  }
  return value.squad_artifact as WorkAgentBinding['artifact'];
}

function isCanonicalPhases(value: unknown): value is number[] {
  return Array.isArray(value) && Array.from(value).every((phase, index, phases) =>
    isPositiveSafeInteger(phase) && (index === 0 || phase > phases[index - 1]));
}

function readPendingSourceBody(body: string): unknown {
  const fences = body.match(/^```[^\r\n]*\r?$/gm) ?? [];
  const blocks = [...body.matchAll(/^```json[ \t]*\r?\n([\s\S]*?)^```[ \t]*\r?$/gm)];
  if (/Structured data:|Activation bindings:|Activation reconciliation:/.test(body)
    || fences.length !== 2 || blocks.length !== 1) {
    throw new AgentProvenanceError('Pending source requires exactly one bare JSON fence');
  }
  try {
    return JSON.parse(blocks[0]![1]!);
  } catch {
    throw new AgentProvenanceError('Malformed pending source JSON');
  }
}

function classifyActivationHistory(
  record: ActivationRecord,
  originIssue: number,
): WorkAgentBinding['artifact'] | 'activation-pending' | undefined {
  // Pending reservations belong to history but are never acceptance candidates.
  try {
    const pending = readPendingSourceBody(record.body);
    if (isRecord(pending) && pending.schema === 'squad-activation-pending/v1') return 'activation-pending';
  } catch (error) {
    if (record.body.includes('squad-activation-pending/v1')) throw error;
  }
  const reconciliationMarker = /Activation reconciliation:|activation-reconciled/.test(record.body);
  const activationMarker = reconciliationMarker || /Activation bindings:/.test(record.body);
  if (!/Structured data:/.test(record.body) && !activationMarker) return undefined;
  let envelope: unknown;
  try {
    envelope = readActivationSection(record.body, 'Structured data');
  } catch (error) {
    if (activationMarker || /activated|plan-accepted|phases-accepted/.test(record.body)) throw error;
    return undefined;
  }
  const knownArtifact = isRecord(envelope)
    && ACTIVATION_ARTIFACTS.includes(envelope.squad_artifact as WorkAgentBinding['artifact']);
  if (!knownArtifact && !activationMarker) return undefined;
  if (!reconciliationMarker && isRecord(envelope) && knownArtifact
    && envelope.squad_artifact !== 'activation-reconciled'
    && isPositiveSafeInteger(envelope.origin_issue) && envelope.origin_issue !== originIssue) {
    return undefined;
  }
  const artifact = activationEnvelope(envelope, originIssue);
  if (reconciliationMarker && artifact !== 'activation-reconciled') {
    throw new AgentProvenanceError('Reconciliation requires activation-reconciled artifact');
  }
  return artifact;
}

/**
 * Select a unique activation using independently verified current-state evidence.
 * Digests use SHA-256 over UTF-8: source bodies are hashed verbatim, registry is
 * JSON.stringify(registry), and bindings are JSON.stringify(the full parsed JSON
 * array), before binding validation normalizes or drops any fields.
 * Historical invalid bindings are tolerated only in an explicitly superseded
 * old record; malformed reconciliation never falls back to older activation.
 */
function selectActivationPair(
  records: readonly ActivationRecord[],
  registry: AgentProvenanceRegistry,
  context: ActivationSelectionContext,
): SelectedActivationRecord | undefined {
  if (!isPositiveSafeInteger(context.originIssue) || !context.repository
    || !Array.isArray(context.reconciliations)) {
    throw new AgentProvenanceError('Invalid activation selection context');
  }
  const evidenceFields = {
    request_comment_id: 'requestCommentId',
    request_sha256: 'requestSha256',
    actor_id: 'actorId',
    supersedes_comment_id: 'sourceCommentId',
    supersedes_sha256: 'sourceSha256',
    plan_sha256: 'planSha256',
    registry_sha256: 'registrySha256',
    bindings_sha256: 'bindingsSha256',
  } as const;
  const validEvidenceValue = (field: string, value: unknown): boolean =>
    field.endsWith('_id') ? isPositiveSafeInteger(value)
      : typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  for (const evidence of context.reconciliations) {
    if (!isRecord(evidence) || Object.entries(evidenceFields).some(([field, key]) =>
      !validEvidenceValue(field, evidence[key]))) {
      throw new AgentProvenanceError('Malformed verifier reconciliation evidence');
    }
    if (evidence.phases !== undefined && !isCanonicalPhases(evidence.phases)) {
      throw new AgentProvenanceError('Malformed verifier reconciliation phase scope');
    }
    if (evidence.sourceKind !== undefined
      && evidence.sourceKind !== 'activation' && evidence.sourceKind !== 'pending') {
      throw new AgentProvenanceError('Malformed verifier reconciliation source kind');
    }
  }
  const byId = new Map<number, ActivationRecord>();
  const candidates: Array<{ record: ActivationRecord; artifact: WorkAgentBinding['artifact'] }> = [];
  for (const record of records) {
    if (!isPositiveSafeInteger(record.id) || typeof record.body !== 'string' || byId.has(record.id)) {
      throw new AgentProvenanceError('Invalid or duplicate activation record id');
    }
    byId.set(record.id, record);
    const artifact = classifyActivationHistory(record, context.originIssue);
    if (artifact === undefined || artifact === 'activation-pending') continue;
    candidates.push({ record, artifact });
  }
  const reconciled = candidates.filter(({ artifact }) => artifact === 'activation-reconciled');
  if (reconciled.length > 1) {
    throw new AgentProvenanceError('Competing activation reconciliations');
  }
  const reconciliation = reconciled[0];
  if (reconciliation) {
    const { record, artifact } = reconciliation;
    const metadata = readActivationSection(record.body, 'Activation reconciliation');
    if (!isRecord(metadata)
      || metadata.schema !== 'squad-activation-reconciliation/v1'
      || metadata.basis !== 'current-state-authorized'
      || (metadata.supersedes_kind !== undefined && metadata.supersedes_kind !== 'pending')
      || Object.keys(metadata).length !== Object.keys(evidenceFields).length
        + (metadata.supersedes_kind === 'pending' ? 3 : 2)
      || Object.keys(evidenceFields).some((field) => !validEvidenceValue(field, metadata[field]))) {
      throw new AgentProvenanceError('Malformed activation reconciliation metadata');
    }
    const matchingEvidence = context.reconciliations.filter((entry) =>
      (entry.sourceKind ?? 'activation') === (metadata.supersedes_kind ?? 'activation')
      && Object.entries(evidenceFields).every(([field, key]) => metadata[field] === entry[key]));
    if (matchingEvidence.length !== 1) {
      throw new AgentProvenanceError('Activation reconciliation requires exactly one matching verifier evidence record');
    }
    const evidence = matchingEvidence[0]!;
    const envelope = readActivationSection(record.body, 'Structured data') as Record<string, unknown>;
    if (JSON.stringify(envelope.phases) !== JSON.stringify(evidence.phases ?? [])) {
      throw new AgentProvenanceError('Activation reconciliation phase scope does not match verifier evidence');
    }
    const source = byId.get(evidence.sourceCommentId);
    if (!source || sha256(source.body) !== evidence.sourceSha256) {
      throw new AgentProvenanceError('Activation reconciliation source body digest mismatch');
    }
    if (evidence.sourceKind === 'pending') {
      const pending = readPendingSourceBody(source.body);
      if (!isRecord(pending) || pending.schema !== 'squad-activation-pending/v1'
        || pending.repository !== context.repository
        || !isPositiveSafeInteger(pending.origin_issue) || pending.origin_issue !== context.originIssue
        || ['run_id', 'run_attempt', 'capture_artifact_id', 'plan_comment_id']
          .some((field) => !isPositiveSafeInteger(pending[field]))
        || ['capture_sha256', 'plan_sha256', 'registry_sha256']
          .some((field) => typeof pending[field] !== 'string' || !/^[0-9a-f]{64}$/.test(pending[field]))
        || !isCanonicalPhases(pending.phases)
        || pending.plan_sha256 !== evidence.planSha256
        || pending.registry_sha256 !== evidence.registrySha256
        || JSON.stringify(pending.phases) !== JSON.stringify(evidence.phases ?? [])) {
        throw new AgentProvenanceError('Malformed pending source or mismatched verifier plan, registry, or phase scope');
      }
    } else {
      const sourceEnvelope = readActivationSection(source.body, 'Structured data');
      const sourceArtifact = activationEnvelope(sourceEnvelope, context.originIssue);
      if (JSON.stringify((sourceEnvelope as Record<string, unknown>).phases)
        !== JSON.stringify(evidence.phases ?? [])) {
        throw new AgentProvenanceError('Activation reconciliation source phase scope does not match verifier evidence');
      }
      if (sourceArtifact === 'activation-reconciled' || /Activation reconciliation:/.test(source.body)) {
        throw new AgentProvenanceError('Activation reconciliation cannot supersede a reconciliation');
      }
    }
    if (candidates.some((candidate) => candidate.record.id !== record.id
      && candidate.record.id !== source.id)) {
      throw new AgentProvenanceError('Ambiguous unsuperseded activation records');
    }
    const rawBindings = readActivationSection(record.body, 'Activation bindings');
    if (sha256(JSON.stringify(registry)) !== evidence.registrySha256
      || sha256(JSON.stringify(rawBindings)) !== evidence.bindingsSha256) {
      throw new AgentProvenanceError('Activation reconciliation registry or bindings digest mismatch');
    }
    return {
      id: record.id,
      artifact,
      bindings: parseWorkAgentBindings(rawBindings, parseAgentProvenanceRegistry(registry), {
        ...context, artifact,
      }),
    };
  }
  if (context.reconciliations.length > 0) {
    throw new AgentProvenanceError('Verifier reconciliation evidence has no matching activation record');
  }
  if (candidates.length > 1) {
    throw new AgentProvenanceError('Ambiguous activation records');
  }
  const candidate = candidates[0];
  if (!candidate) return undefined;
  return {
    id: candidate.record.id,
    artifact: candidate.artifact,
    bindings: parseWorkAgentBindings(
      readActivationSection(candidate.record.body, 'Activation bindings'),
      parseAgentProvenanceRegistry(registry),
      { ...context, artifact: candidate.artifact },
    ),
  };
}

/**
 * Select one scoped pair or one complete, independently authorized phase chain.
 * Full histories require one verifier proof per reconciliation; links in source
 * bodies provide only hash-bound ancestry data, never authorization or recency.
 */
export function selectActivationRecord(
  records: readonly ActivationRecord[],
  registry: AgentProvenanceRegistry,
  context: ActivationSelectionContext,
): SelectedActivationRecord | undefined {
  const nodes = records.flatMap((record) => {
    try {
      const envelope = readActivationSection(record.body, 'Structured data');
      return isRecord(envelope) && envelope.squad_artifact === 'activation-reconciled'
        ? [{ record, envelope }] : [];
    } catch {
      return [];
    }
  });
  if (nodes.length <= 1 && context.reconciliations.length <= 1) {
    return selectActivationPair(records, registry, context);
  }
  const fail = (message: string): never => {
    throw new AgentProvenanceError(`Activation chain: ${message}`);
  };
  if (nodes.length < 2 || nodes.length !== context.reconciliations.length) {
    fail('missing or extra verifier proofs');
  }
  const byId = new Map<number, ActivationRecord>();
  for (const record of records) {
    if (!isPositiveSafeInteger(record.id) || typeof record.body !== 'string' || byId.has(record.id)) {
      fail('duplicate or malformed record identity');
    }
    byId.set(record.id, record);
  }
  const usedRecords = new Set<number>();
  const usedProofs = new Set<ReconciliationEvidence>();
  const usedRequests = new Set<number>();
  const validated = new Map<number, {
    selected: SelectedActivationRecord;
    source: ActivationRecord;
    proof: ReconciliationEvidence;
    prior: unknown;
  }>();
  for (const { record } of nodes) {
    const metadata = readActivationSection(record.body, 'Activation reconciliation') as Record<string, unknown>;
    const proofs = context.reconciliations.filter((proof) =>
      proof.requestCommentId === metadata.request_comment_id && proof.requestSha256 === metadata.request_sha256
      && proof.actorId === metadata.actor_id && proof.sourceCommentId === metadata.supersedes_comment_id
      && proof.sourceSha256 === metadata.supersedes_sha256 && proof.planSha256 === metadata.plan_sha256
      && proof.registrySha256 === metadata.registry_sha256 && proof.bindingsSha256 === metadata.bindings_sha256
      && (proof.sourceKind ?? 'activation') === (metadata.supersedes_kind ?? 'activation'));
    if (proofs.length !== 1) fail('missing or duplicate matching verifier proof');
    const proof = proofs[0]!;
    const source = byId.get(proof.sourceCommentId) ?? fail('missing source');
    if (usedProofs.has(proof) || usedRequests.has(proof.requestCommentId)
      || usedRecords.has(source.id) || usedRecords.has(record.id)) {
      fail('missing source or competing reconciliation');
    }
    const selected = selectActivationPair([source, record], registry, {
      ...context, reconciliations: [proof],
    });
    if (!selected || selected.id !== record.id) fail('invalid reconciliation node');
    const first = validated.values().next().value;
    if (first && (proof.planSha256 !== first.proof.planSha256
      || proof.registrySha256 !== first.proof.registrySha256)) fail('inconsistent frozen plan or registry');
    let carrier: Record<string, unknown> | undefined;
    if (proof.sourceKind === 'pending') {
      carrier = readPendingSourceBody(source.body) as Record<string, unknown>;
    } else if (source.body.includes('Activation evidence:')) {
      const evidence = readActivationSection(source.body, 'Activation evidence');
      if (!isRecord(evidence) || evidence.schema !== 'squad-activation-finalization/v1'
        || evidence.basis !== 'current-trusted-execution'
        || evidence.plan_sha256 !== proof.planSha256 || evidence.registry_sha256 !== proof.registrySha256) {
        fail('invalid finalization source link carrier');
      }
      carrier = evidence as Record<string, unknown>;
    }
    usedRecords.add(source.id);
    usedRecords.add(record.id);
    usedProofs.add(proof);
    usedRequests.add(proof.requestCommentId);
    validated.set(record.id, { selected: selected!, source, proof, prior: carrier?.prior });
  }
  if (records.some(record => !usedRecords.has(record.id)
    && classifyActivationHistory(record, context.originIssue) !== undefined)
    || usedProofs.size !== context.reconciliations.length) {
    fail('unconsumed history records or verifier proofs');
  }
  const parents = new Map<number, number>();
  const children = new Set<number>();
  for (const [id, node] of validated) {
    if (node.prior === undefined) continue;
    const link = node.prior;
    const keys = ['source_comment_id', 'source_sha256', 'reconciliation_comment_id', 'reconciliation_sha256'];
    if (!isRecord(link) || Object.keys(link).sort().join() !== [...keys].sort().join()
      || !isPositiveSafeInteger(link.source_comment_id) || !isPositiveSafeInteger(link.reconciliation_comment_id)
      || ![link.source_sha256, link.reconciliation_sha256].every((hash) =>
        typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))) fail('malformed prior link');
    const reference = link as Record<string, unknown>;
    const parentId = reference.reconciliation_comment_id as number;
    const parent = validated.get(parentId);
    if (!parent || parent.source.id !== reference.source_comment_id
      || sha256(parent.source.body) !== reference.source_sha256
      || sha256(byId.get(parentId)!.body) !== reference.reconciliation_sha256) {
      fail('unknown, missing, or changed ancestor');
    }
    if (children.has(parentId)) fail('forked phase history');
    const before = parent!.proof.phases ?? [];
    const after = node.proof.phases ?? [];
    if (before.length === 0 || before.length >= after.length || !before.every((phase, index) => after[index] === phase)) {
      fail('phase coverage must strictly expand');
    }
    const current = new Map(node.selected.bindings.map((binding) => [binding.task, binding]));
    for (const priorBinding of parent!.selected.bindings) {
      const next = current.get(priorBinding.task);
      if (!next || issueReferenceKey(next.issue) !== issueReferenceKey(priorBinding.issue)
        || next.epic !== priorBinding.epic
        || issueReferenceKey(next.epic_issue) !== issueReferenceKey(priorBinding.epic_issue)
        || next.agent_id !== priorBinding.agent_id
        || next.registry_revision !== priorBinding.registry_revision
        || [...next.epic_agent_ids].sort().join() !== [...priorBinding.epic_agent_ids].sort().join()
        || next.identity_omission_reason !== priorBinding.identity_omission_reason
        || next.epic_identity_omission_reason !== priorBinding.epic_identity_omission_reason) {
        fail('prior task or epic bindings changed');
      }
    }
    parents.set(id, parentId);
    children.add(parentId);
  }
  const heads = [...validated.keys()].filter((id) => !children.has(id));
  if (heads.length !== 1) fail('competing heads or cyclic history');
  const visited = new Set<number>();
  let id: number | undefined = heads[0];
  while (id !== undefined) {
    if (visited.has(id)) fail('cyclic history');
    visited.add(id);
    id = parents.get(id);
  }
  if (visited.size !== validated.size) fail('disconnected or cyclic history');
  return validated.get(heads[0]!)!.selected;
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
