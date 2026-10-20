import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// `activated` / `phases-activated` come from the granular `/squad plan activate` path
// (`squad-plan-activate`); `plan-accepted` / `phases-accepted` come from the recommended
// `/squad activate` fast path (`squad-plan-accept`). Both paths create or recognize issues
// and apply labels the same way, so both carry the same mandatory `Activation bindings:`
// contract — see workflows/shared/squad-planning-ontology.md and the E4 preflight package A
// fast-path artifact-integrity fix.
const ACTIVATION_ARTIFACTS = new Set(['activated', 'phases-activated', 'plan-accepted', 'phases-accepted', 'activation-reconciled']);
const ACTIVATION_ARTIFACT_PATTERN = new RegExp(
  `"squad_artifact"\\s*:\\s*"?(?:${[...ACTIVATION_ARTIFACTS].join('|')})`,
  'i',
);
const VALID_OMISSIONS = new Set(['multi-owner', 'non-roster', 'origin']);
const TEMPORARY_ID = /^#?aw_[A-Za-z0-9_]{3,12}$/i;
const RESOLVED_REFERENCE = /^#?(\d+)$/;
const AGENT_PROVENANCE_SCHEMA = 'squad-agent-provenance/v1';
const WORK_AGENT_BINDING_SCHEMA = 'squad-work-agent-binding/v1';
const CASTING_HISTORY_FIELDS = new Set([
  'assignment_cast_snapshots',
  'universe_usage_history',
  'transaction_id',
  'registry_revision',
]);

function parseCastingObject(raw, label) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} root is malformed`);
  }
  return value;
}

function validateCastingHistory(history, registry) {
  const unknownField = Object.keys(history).find(key => !CASTING_HISTORY_FIELDS.has(key));
  if (unknownField !== undefined) {
    throw new Error(`casting history contains unknown top-level field "${unknownField}"`);
  }
  if (!history.assignment_cast_snapshots
    || typeof history.assignment_cast_snapshots !== 'object'
    || Array.isArray(history.assignment_cast_snapshots)
    || !Array.isArray(history.universe_usage_history)) {
    throw new Error('casting history shape is malformed');
  }
  for (const [key, snapshot] of Object.entries(history.assignment_cast_snapshots)) {
    if (!key || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || typeof snapshot.created_at !== 'string'
      || !Number.isFinite(Date.parse(snapshot.created_at))
      || !Array.isArray(snapshot.agents)
      || snapshot.agents.some(agent => typeof agent !== 'string' || !(agent in registry.agents))
      || typeof snapshot.universe !== 'string' || !snapshot.universe) {
      throw new Error('casting history snapshot is malformed or references unknown agents');
    }
  }
  for (const usage of history.universe_usage_history) {
    if (!usage || typeof usage !== 'object' || Array.isArray(usage)
      || typeof usage.universe !== 'string' || !usage.universe
      || typeof usage.used_at !== 'string'
      || !Number.isFinite(Date.parse(usage.used_at))) {
      throw new Error('casting universe usage history is malformed');
    }
  }
}

function isCanonicalLegacyGenesis(registry, history) {
  const agents = registry.agents;
  const agentIds = Object.keys(agents);
  const snapshots = Object.entries(history.assignment_cast_snapshots);
  const usage = history.universe_usage_history;
  if (agentIds.length === 0 || snapshots.length !== 1 || usage.length !== 1) {
    return false;
  }

  const snapshotEntry = snapshots[0];
  if (!snapshotEntry) return false;
  const [snapshotKey, rawSnapshot] = snapshotEntry;
  const rawUsage = usage[0];
  if (hasRevisionToken(snapshotKey)
    || !rawSnapshot
    || typeof rawSnapshot !== 'object'
    || Array.isArray(rawSnapshot)
    || !rawUsage
    || typeof rawUsage !== 'object'
    || Array.isArray(rawUsage)) {
    return false;
  }
  const snapshot = rawSnapshot;
  const usageRecord = rawUsage;
  const snapshotAgents = snapshot.agents;
  const snapshotCreatedAt = Date.parse(snapshot.created_at);
  const generatedAt = Date.parse(registry.generated_at);
  if (!Array.isArray(snapshotAgents)
    || snapshotAgents.some(agentId => typeof agentId !== 'string')
    || new Set(snapshotAgents).size !== snapshotAgents.length
    || snapshotAgents.length !== agentIds.length
    || snapshotAgents.some(agentId => !Object.hasOwn(agents, agentId))
    || typeof snapshot.universe !== 'string'
    || snapshot.universe.length === 0
    || !Number.isFinite(snapshotCreatedAt)
    || snapshotCreatedAt > generatedAt
    || usageRecord.universe !== snapshot.universe
    || Date.parse(usageRecord.used_at) !== snapshotCreatedAt) {
    return false;
  }

  return Object.values(agents).every(agent =>
    agent.status === 'active'
    && agent.universe === snapshot.universe
    && Date.parse(agent.created_at) === snapshotCreatedAt);
}

const REVISION_TOKEN_PATTERN = /(?:^|[-_])(?:revision[-_]*\d+|r\d+)(?=[-_]|$)/i;

function hasRevisionToken(snapshotKey) {
  return REVISION_TOKEN_PATTERN.test(snapshotKey);
}

function validateLegacyCastingGeneration(registry, history) {
  if (registry.transaction_id !== undefined
    || history.transaction_id !== undefined
    || history.registry_revision !== undefined) {
    throw new Error('casting generation metadata exists without a commit manifest');
  }
  const snapshots = Object.entries(history.assignment_cast_snapshots);
  if (registry.revision === 1 && Object.keys(registry.agents).length === 0
    && snapshots.length === 0 && history.universe_usage_history.length === 0) {
    return;
  }
  if (registry.revision === 1 && isCanonicalLegacyGenesis(registry, history)) {
    return;
  }
  const revisions = new Set();
  let currentGeneration = false;
  const generatedAt = Date.parse(registry.generated_at);
  const snapshotEvidence = new Map();
  for (const [key, snapshot] of snapshots) {
    const match = key.match(/(?:^|[-_])(?:revision-|r)(\d+)(?:[-_]|$)/i);
    if (!match) throw new Error('casting history snapshot lacks generation evidence');
    const revision = Number(match[1]);
    if (!Number.isSafeInteger(revision) || revision < 1 || revision > registry.revision
      || revisions.has(revision) || Date.parse(snapshot.created_at) > generatedAt) {
      throw new Error('casting registry/history pair is mixed-generation');
    }
    revisions.add(revision);
    if (revision === registry.revision && Date.parse(snapshot.created_at) === generatedAt) {
      currentGeneration = true;
    }
    const evidence = `${snapshot.universe}\u0000${snapshot.created_at}`;
    snapshotEvidence.set(evidence, (snapshotEvidence.get(evidence) ?? 0) + 1);
  }
  const usageEvidence = new Map();
  for (const usage of history.universe_usage_history) {
    if (Date.parse(usage.used_at) > generatedAt) {
      throw new Error('casting registry/history pair is mixed-generation');
    }
    const evidence = `${usage.universe}\u0000${usage.used_at}`;
    usageEvidence.set(evidence, (usageEvidence.get(evidence) ?? 0) + 1);
  }
  const complete = Array.from({ length: registry.revision }, (_, index) => index + 1);
  const implicitGenesis = registry.revision === 1 ? complete : complete.slice(1);
  const revisionEvidence = [complete, implicitGenesis].some(expected =>
    expected.length === revisions.size && expected.every(revision => revisions.has(revision)));
  const matchingEvidence = snapshotEvidence.size === usageEvidence.size
    && [...snapshotEvidence].every(([key, count]) => usageEvidence.get(key) === count);
  if (!revisionEvidence || !currentGeneration || !matchingEvidence) {
    throw new Error('casting registry/history pair is mixed-generation');
  }
}

async function readOptionalFile(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function validateCastingPairFiles(registryFile) {
  const castingDir = dirname(registryFile);
  const [registryRaw, historyRaw, journalRaw, manifestRaw] = await Promise.all([
    readOptionalFile(registryFile),
    readOptionalFile(join(castingDir, 'history.json')),
    readOptionalFile(join(castingDir, 'registry-history.transaction.json')),
    readOptionalFile(join(castingDir, 'registry-history.commit.json')),
  ]);
  if (registryRaw === undefined || historyRaw === undefined) {
    throw new Error('complete casting registry/history pair is required');
  }
  if (journalRaw !== undefined) {
    throw new Error('casting transaction is awaiting roll-forward');
  }
  const registry = parseCastingObject(registryRaw, 'casting registry');
  const history = parseCastingObject(historyRaw, 'casting history');
  parseAgentRegistry(registry);
  validateCastingHistory(history, registry);
  if (manifestRaw === undefined) {
    validateLegacyCastingGeneration(registry, history);
    return registry;
  }
  const manifest = parseCastingObject(manifestRaw, 'casting commit manifest');
  const digest = raw => createHash('sha256').update(raw).digest('hex');
  if (typeof manifest.transaction_id !== 'string'
    || !Number.isSafeInteger(manifest.registry_revision)
    || manifest.registry_revision < 1
    || registry.transaction_id !== manifest.transaction_id
    || history.transaction_id !== manifest.transaction_id
    || history.registry_revision !== manifest.registry_revision
    || registry.revision !== manifest.registry_revision
    || digest(registryRaw) !== manifest.registry_sha256
    || digest(historyRaw) !== manifest.history_sha256) {
    throw new Error('casting registry/history pair does not match the stable commit manifest');
  }
  return registry;
}

// Standalone certainty claims a label-operation report may never make: safe outputs like
// `add_labels` are applied in a post-agent job, so an activation/acceptance run only ever
// knows a call was *accepted for a specific target* — never that GitHub applied it. Word
// boundaries keep this from matching substrings ("unverified", "prechecked").
const FORBIDDEN_LABEL_CLAIM_WORDS = ['applied', 'received', 'landed', 'verified', 'confirmed', 'checked'];
// A clause is treated as a compliant, honest non-claim (never flagged) when it explicitly
// negates the outcome — e.g. "not verified", "never confirmed" — since that is the accurate,
// honest statement the contract requires, not an over-claim.
const NEGATION_NEARBY = /\b(never|not|no|n't|without|cannot|can't|won't|isn't|wasn't|doesn't|didn't|nor)\b/i;
// Scope the forbidden-word scan to clauses that are actually reporting a label operation —
// mentioning "label"/"labels" or a `squad:*` token — rather than scanning the whole comment.
// A blanket scan would false-positive on an unrelated quoted task title like "Verified Email
// Addresses" sitting in the created-issues table.
const LABEL_OPERATION_CONTEXT = /\blabels?\b|\bsquad:[a-z0-9_.-]+\b/i;
// Protects a `squad:{agent}` token's colon from being mistaken for a clause boundary while
// splitting a line into clauses. Requires each embedded `.` to be followed by another name
// character (e.g. `squad:kint.jones`), so a sentence-ending period right after an agent name
// (`squad:kint.`) is left alone as a real delimiter, not swallowed into the token.
const SQUAD_TOKEN = /\bsquad:([a-z0-9_-]+(?:\.[a-z0-9_-]+)*)/gi;
// Placeholder standing in for a protected token's colon while clauses are split; chosen to
// never collide with real comment text.
const SQUAD_COLON_PLACEHOLDER = '\u0000';

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function parseAgentRegistry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('agent provenance registry root is malformed');
  }
  if (value.schema !== AGENT_PROVENANCE_SCHEMA || value.schema_version !== 1) {
    throw new Error(`agent provenance registry must use ${AGENT_PROVENANCE_SCHEMA}`);
  }
  if (!Number.isInteger(value.revision) || value.revision < 1) {
    throw new Error('agent provenance registry revision must be a positive integer');
  }
  if (!value.agents || typeof value.agents !== 'object' || Array.isArray(value.agents)) {
    throw new Error('agent provenance registry agents map is malformed');
  }
  const agents = new Map();
  const displayNames = new Set();
  for (const [id, record] of Object.entries(value.agents)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !record || typeof record !== 'object') {
      throw new Error(`agent provenance registry entry "${id}" is malformed`);
    }
    if (!['active', 'inactive', 'retired'].includes(record.status)) {
      throw new Error(`agent provenance registry entry "${id}" has invalid status`);
    }
    const displayName = typeof record.display_name === 'string' ? record.display_name.trim() : '';
    if (!displayName || record.persistent_name !== displayName ||
        typeof record.role !== 'string' || !record.role.trim() ||
        typeof record.universe !== 'string' || !record.universe.trim() ||
        !Number.isFinite(Date.parse(record.created_at)) ||
        !Number.isFinite(Date.parse(record.updated_at)) ||
        (record.status === 'retired' && !Number.isFinite(Date.parse(record.retired_at)))) {
      throw new Error(`agent provenance registry entry "${id}" is incomplete`);
    }
    const normalizedName = normalize(displayName);
    if (displayNames.has(normalizedName)) {
      throw new Error(`agent provenance registry display name "${displayName}" is duplicated`);
    }
    displayNames.add(normalizedName);
    if (record.avatar !== undefined) {
      const expectedPrefix = `.squad/agents/${id}/`;
      const avatarPath = record.avatar?.path;
      if (record.avatar?.kind !== 'repository-path'
        || typeof avatarPath !== 'string'
        || !avatarPath.startsWith(expectedPrefix)
        || avatarPath.length === expectedPrefix.length
        || avatarPath.includes('\\')
        || avatarPath.split('/').some(segment => segment === '.' || segment === '..')) {
        throw new Error(`agent provenance registry entry "${id}" has invalid avatar path`);
      }
    }
    agents.set(id, record);
  }
  return { revision: value.revision, agents };
}

/**
 * Resolve a binding issue reference to a real issue number.
 *
 * Activation writes these as quoted `#`-prefixed strings so gh-aw's temporary-ID
 * substitution — a plain text replacement that does not skip fenced code blocks and keeps
 * the `#` — yields valid JSON. A reference the runtime resolved arrives as `"#42"`; one it
 * could not resolve arrives verbatim as `"#aw_task3"`, which means that `create-issue`
 * never landed. Fail closed on the latter rather than skipping the binding. Bare integers
 * stay accepted so artifacts written before this contract still validate.
 */
function resolveIssueReference(value, description, invalidMessage) {
  if (Number.isSafeInteger(value)) {
    if (value < 1) throw new Error(invalidMessage);
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (TEMPORARY_ID.test(trimmed)) {
      throw new Error(
        `${description} "${trimmed}" is an unresolved temporary ID — the referenced issue was never created`,
      );
    }
    const resolved = RESOLVED_REFERENCE.exec(trimmed);
    if (resolved && Number.isSafeInteger(Number(resolved[1])) && Number(resolved[1]) >= 1) return Number(resolved[1]);
  }
  throw new Error(invalidMessage);
}

/**
 * Best-effort issue number extraction for label prefetching. Unlike
 * `resolveIssueReference()`, this never throws: an unresolved/malformed
 * reference is simply skipped here so `validateTaskBinding()` can report the
 * real error (e.g. an unresolved temporary ID) instead of a misleading
 * "labels could not be resolved" failure.
 */
export function extractIssueNumber(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const resolved = RESOLVED_REFERENCE.exec(value.trim());
    if (resolved) return Number(resolved[1]);
  }
  return undefined;
}

export function parseStructuredData(comment, { envelopeOnly = false } = {}) {
  const blocks = [...comment.matchAll(/Structured data:\s*```json\s*([\s\S]*?)```/gi)];
  if (blocks.length === 0) {
    if (/Structured data:/i.test(comment) && ACTIVATION_ARTIFACT_PATTERN.test(comment)) {
      throw new Error('activation structured data block could not be parsed');
    }
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(blocks.at(-1)[1]);
  } catch (error) {
    throw new Error(`activation structured data is invalid JSON: ${error.message}`);
  }
  if (!envelopeOnly && ACTIVATION_ARTIFACTS.has(parsed.squad_artifact)) {
    const bindingBlock = /Activation bindings:\s*```json\s*([\s\S]*?)```/i.exec(comment);
    if (!bindingBlock) return parsed;
    try {
      parsed.bindings = JSON.parse(bindingBlock[1]);
    } catch (error) {
      throw new Error(`activation bindings are invalid JSON: ${error.message}`);
    }
  }
  return parsed;
}

/**
 * Strip content a forbidden-word scan must never see as a claim: fenced/inline code and
 * quoted strings. A quoted work-item title ("Verified Email Addresses") or a JSON fragment
 * inside backticks is data being described, not a certainty claim about a label operation.
 */
function stripQuotedAndCode(line) {
  return line
    .replace(/`[^`]*`/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/'[^']*'/g, ' ');
}

/**
 * Split a line into clauses on clause/sentence-ending punctuation (`.`, `,`, `;`, `:`) so a
 * negation and a certainty claim are only ever treated as connected when they actually share
 * the same clause. Without this, "No issues were skipped: Label squad:kint was verified for
 * #42." would let the unrelated negation on "skipped" blanket-suppress the real, separate
 * claim that follows the colon — and a claim about a *different* subject sharing a line with
 * a label mention (e.g. "Reported squad:kint for issue #123, its verified real number") would
 * wrongly inherit label-operation context from a clause it isn't part of.
 *
 * `squad:{agent}` tokens are protected first so the colon inside them is never itself treated
 * as a clause boundary.
 */
function splitClauses(line) {
  const guarded = line.replace(SQUAD_TOKEN, (_match, agent) => `squad${SQUAD_COLON_PLACEHOLDER}${agent}`);
  return guarded
    .split(/[.,;:]+/)
    .map(clause => clause.replaceAll(SQUAD_COLON_PLACEHOLDER, ':'))
    .filter(clause => clause.trim().length > 0);
}

/**
 * Reject standalone certainty claims ("applied", "received", "landed", "verified",
 * "confirmed", "checked") in an activation/acceptance comment's label-operation reporting.
 * `add_labels` is a safe output applied in a post-agent job — the run only ever knows a call
 * was *accepted* for a target, never that GitHub actually applied it. A summary claiming more
 * than that is over-claiming an outcome nothing here observed.
 *
 * Deliberately scoped, not a blanket whole-comment or whole-line scan:
 *   - Markdown table rows (`| ... |`) are skipped — that's where quoted work-item titles live.
 *   - Fenced code blocks, inline code, and quoted strings are stripped before matching, so a
 *     quoted title or JSON fragment containing a forbidden word never counts.
 *   - Each line is split into clauses (see `splitClauses`), and label-operation context
 *     (`label`/`labels`/`squad:*`), the forbidden word, and any negation must all be found
 *     within the *same* clause. This is what lets a genuinely unrelated negation elsewhere on
 *     the line ("No issues were skipped: ... was verified ...") fail to suppress a real claim,
 *     while a forbidden word describing an unrelated subject in a different clause on the same
 *     line as a label mention ("Reported squad:kint for issue #123, its verified real number")
 *     is correctly out of scope — its clause carries no label-operation context at all.
 *   - A clause that explicitly negates the claim ("was not verified", "never confirmed") is
 *     the honest, compliant statement the contract requires, so it is never flagged.
 *
 * No-op for artifact types outside the activation contract (fast-path `plan-accepted` /
 * `phases-accepted` and granular `activated` / `phases-activated`).
 */
export function assertAcceptedOnlyLabelWording(commentBody, artifactType) {
  if (!ACTIVATION_ARTIFACTS.has(artifactType)) return { skipped: true };
  const body = typeof commentBody === 'string' ? commentBody : '';
  const withoutFences = body.replace(/```[\s\S]*?```/g, ' ');
  for (const rawLine of withoutFences.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('|')) continue;
    const scrubbed = stripQuotedAndCode(trimmed);
    for (const clause of splitClauses(scrubbed)) {
      if (!LABEL_OPERATION_CONTEXT.test(clause)) continue;
      if (NEGATION_NEARBY.test(clause)) continue;
      for (const word of FORBIDDEN_LABEL_CLAIM_WORDS) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(clause)) {
          throw new Error(
            `label-operation report uses forbidden certainty claim "${word}" — report label ` +
              `operations as accepted only, never applied/received/landed/verified/confirmed/` +
              `checked: "${trimmed}"`,
          );
        }
      }
    }
  }
  return { skipped: false };
}

export function parseRoster(teamMarkdown) {
  const lines = teamMarkdown.replace(/\r/g, '').split('\n');
  const section = lines.findIndex(line => /^##\s+Members\s*$/.test(line.trim()));
  if (section < 0) throw new Error('roster has no ## Members section');

  const nextSection = lines.findIndex((line, index) => index > section && /^##\s/.test(line));
  const table = lines.slice(section + 1, nextSection < 0 ? undefined : nextSection)
    .filter(line => line.trim().startsWith('|'));
  if (table.length < 3) throw new Error('roster Members table is missing or empty');

  const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
  const header = cells(table[0]);
  const nameIndex = header.findIndex(cell => normalize(cell) === 'name');
  if (nameIndex < 0) throw new Error('roster Members table has no Name column');

  const names = table.slice(2)
    .map(line => normalize(cells(line)[nameIndex]))
    .filter(Boolean);
  if (names.length === 0) throw new Error('roster Members table has no members');

  const namesBySlug = new Map();
  for (const name of names) {
    const slug = slugify(name);
    const existing = namesBySlug.get(slug);
    if (existing) {
      throw new Error(`roster member label slug "${slug}" is ambiguous: "${existing}" and "${name}"`);
    }
    namesBySlug.set(slug, name);
  }
  return new Set(names);
}

function expectedLabel(agent, roster) {
  if (agent === '@copilot') return { label: 'squad:copilot', omission: null };
  if (roster.has(agent)) return { label: `squad:${slugify(agent)}`, omission: null };
  return { label: null, omission: 'non-roster' };
}

function validateReportedOutcome(binding, prefix, expected) {
  const labelKey = prefix ? `${prefix}_label` : 'label';
  const omissionKey = prefix ? `${prefix}_omission_reason` : 'omission_reason';
  if (binding[labelKey] !== expected.label && !(expected.label === null && binding[labelKey] === undefined)) {
    throw new Error(
      `issue #${binding.issue}: reported ${labelKey} ${binding[labelKey] ?? '(none)'} does not match ${expected.label ?? 'bare squad'}`,
    );
  }
  if (binding[omissionKey] !== expected.omission && !(expected.omission === null && binding[omissionKey] === undefined)) {
    throw new Error(
      `issue #${binding.issue}: ${omissionKey} must be ${expected.omission ?? 'absent'}`,
    );
  }
  if (binding[omissionKey] && !VALID_OMISSIONS.has(binding[omissionKey])) {
    throw new Error(`issue #${binding.issue}: invalid ${omissionKey}`);
  }
}

function validateBindingAuthority(binding, issue, artifact, authority) {
  if (!authority) return { epicAgentIds: [] };
  if (binding.binding_schema !== WORK_AGENT_BINDING_SCHEMA || binding.binding_version !== 1) {
    throw new Error(`issue #${issue}: binding must use ${WORK_AGENT_BINDING_SCHEMA}`);
  }
  if (binding.producer !== 'squad') {
    throw new Error(`issue #${issue}: binding producer must be squad`);
  }
  if (binding.repository !== authority.repository) {
    throw new Error(`issue #${issue}: binding repository does not match ${authority.repository}`);
  }
  if (binding.origin_issue !== artifact.origin_issue || binding.artifact !== artifact.squad_artifact) {
    throw new Error(`issue #${issue}: binding origin or artifact identity does not match its comment`);
  }
  if (binding.registry_schema !== AGENT_PROVENANCE_SCHEMA) {
    throw new Error(`issue #${issue}: binding registry schema is unsupported`);
  }
  if (!Number.isInteger(binding.registry_revision) || binding.registry_revision < 1) {
    throw new Error(`issue #${issue}: binding registry revision is invalid`);
  }
  if (binding.registry_revision > authority.registry.revision) {
    throw new Error(`issue #${issue}: binding registry revision is newer than the available registry`);
  }
  if (binding.agent_id === null) {
    if (!['external-agent', 'non-roster', 'legacy-plan-missing-id'].includes(binding.identity_omission_reason)) {
      throw new Error(`issue #${issue}: null agent_id requires an explicit identity omission reason`);
    }
  } else {
    if (binding.identity_omission_reason !== undefined) {
      throw new Error(`issue #${issue}: identity omission reason conflicts with agent_id`);
    }
    if (typeof binding.agent_id !== 'string' || !authority.registry.agents.has(binding.agent_id)) {
      throw new Error(`issue #${issue}: agent_id is absent from the producer registry`);
    }
  }
  if (!Array.isArray(binding.epic_agent_ids)) {
    throw new Error(`issue #${issue}: epic_agent_ids must be an array`);
  }
  const epicAgentIds = [...new Set(binding.epic_agent_ids)];
  if (
    epicAgentIds.length !== binding.epic_agent_ids.length ||
    (binding.agent_id !== null && !epicAgentIds.includes(binding.agent_id))
  ) {
    throw new Error(`issue #${issue}: epic_agent_ids are duplicated or exclude agent_id`);
  }
  for (const agentId of epicAgentIds) {
    if (typeof agentId !== 'string' || !authority.registry.agents.has(agentId)) {
      throw new Error(`issue #${issue}: epic_agent_ids references an unknown producer id`);
    }
  }
  if (binding.epic_identity_omission_reason !== undefined &&
      binding.epic_identity_omission_reason !== 'partial') {
    throw new Error(`issue #${issue}: invalid epic identity omission reason`);
  }
  return { epicAgentIds: epicAgentIds.sort() };
}

function validateTaskBinding(binding, roster, artifact, authority) {
  if (!binding || typeof binding !== 'object') {
    throw new Error('binding has no valid issue number');
  }
  const issue = resolveIssueReference(binding.issue, 'binding issue', 'binding has no valid issue number');
  const epicIssue = resolveIssueReference(
    binding.epic_issue,
    `issue #${issue}: epic_issue`,
    `issue #${issue}: missing epic issue linkage`,
  );
  if (!normalize(binding.task)) throw new Error(`issue #${issue}: binding has no plan task number`);
  if (!normalize(binding.epic)) throw new Error(`issue #${issue}: missing epic linkage`);
  const agent = normalize(binding.agent);
  if (!agent) throw new Error(`issue #${issue}: binding has no agent`);
  if (!Array.isArray(binding.epic_agents) || binding.epic_agents.length === 0) {
    throw new Error(`issue #${issue}: epic_agents must be a non-empty array`);
  }
  const epicAgents = [...new Set(binding.epic_agents.map(normalize).filter(Boolean))].sort();
  if (epicAgents.length !== binding.epic_agents.length || !epicAgents.includes(agent)) {
    throw new Error(`issue #${issue}: epic_agents are empty, duplicated, or exclude the task agent`);
  }
  const { epicAgentIds } = validateBindingAuthority(binding, issue, artifact, authority);
  const expected = expectedLabel(agent, roster);
  validateReportedOutcome({ ...binding, issue }, '', expected);
  return { issue, epicIssue, epicAgents, epicAgentIds, expected };
}

function validateActualLabels(issue, labels, expected) {
  if (!labels) throw new Error(`issue #${issue}: labels could not be resolved`);
  if (!labels.has('squad')) throw new Error(`issue #${issue}: missing squad label`);
  const actualAgentLabels = [...labels].filter(label => label.startsWith('squad:'));
  const expectedAgentLabels = expected.label ? [expected.label] : [];
  if (actualAgentLabels.length !== expectedAgentLabels.length || actualAgentLabels[0] !== expectedAgentLabels[0]) {
    throw new Error(
      `issue #${issue}: expected ${expected.label ?? 'bare squad'}, found ${actualAgentLabels.join(', ') || 'bare squad'}`,
    );
  }
}

export function validateBindings(artifact, roster, labelsByIssue) {
  return validateActivation(artifact, roster, labelsByIssue);
}

export function validateActivation(artifact, roster, labelsByIssue, expectedOrigin, authority) {
  if (!artifact || !ACTIVATION_ARTIFACTS.has(artifact.squad_artifact)) return { skipped: true };
  if (artifact.schema_version !== '1') throw new Error('activation artifact schema_version must be 1');
  if (!Number.isInteger(artifact.origin_issue) || artifact.origin_issue < 1) {
    throw new Error('activation artifact origin_issue is invalid');
  }
  if (expectedOrigin !== undefined && artifact.origin_issue !== expectedOrigin) {
    throw new Error(`activation artifact origin_issue ${artifact.origin_issue} does not match comment issue ${expectedOrigin}`);
  }
  if (!Array.isArray(artifact.phases) || artifact.phases.some(phase => !Number.isSafeInteger(phase) || phase < 1) ||
    new Set(artifact.phases).size !== artifact.phases.length) {
    throw new Error('activation artifact phases are invalid');
  }
  if (!Array.isArray(artifact.bindings) || artifact.bindings.length === 0) {
    throw new Error('activation artifact bindings are missing or empty');
  }

  const seen = new Set();
  const seenTasks = new Set();
  const epics = new Map();
  const epicIssuesByIdentifier = new Map();
  const assignments = authority?.epicAssignments;
  if (assignments !== undefined) {
    if (!Array.isArray(assignments) || assignments.length === 0) throw new Error('frozen epic assignments are missing');
    const tasks = new Set();
    for (const assignment of assignments) {
      if (!assignment || typeof assignment.task !== 'string' || !assignment.task.trim() ||
        typeof assignment.epic !== 'string' || !assignment.epic.trim() ||
        typeof assignment.agent !== 'string' || !assignment.agent.trim() || tasks.has(assignment.task)) {
        throw new Error('frozen epic assignments contain malformed or duplicate tasks');
      }
      tasks.add(assignment.task);
      if (assignment.agentId !== null) {
        const agent = authority.registry.agents.get(assignment.agentId);
        if (!agent || agent.status !== 'active' || normalize(agent.display_name) !== normalize(assignment.agent)) {
          throw new Error('frozen epic assignment agent identity mismatch');
        }
      } else if (roster.has(normalize(assignment.agent))) {
        throw new Error('frozen roster assignment cannot omit its agent identity');
      }
    }
  }
  let expectedRegistryRevision;
  for (const rawBinding of artifact.bindings) {
    const { issue, epicIssue, epicAgents, epicAgentIds, expected } =
      validateTaskBinding(rawBinding, roster, artifact, authority);
    const binding = { ...rawBinding, issue, epic_issue: epicIssue };
    if (issue === artifact.origin_issue || (epicIssue === artifact.origin_issue && normalize(binding.epic) !== 'origin')) {
      throw new Error(`issue #${issue}: task/epic role collides with the origin issue`);
    }
    if (assignments) {
      const assignment = assignments.find(assignment => assignment.task === binding.task);
      if (!assignment || assignment.epic !== binding.epic || assignment.agentId !== binding.agent_id ||
        normalize(assignment.agent) !== normalize(binding.agent)) throw new Error('binding conflicts with frozen epic assignment');
    }
    if (seen.has(issue)) throw new Error(`issue #${issue}: duplicate binding`);
    seen.add(issue);
    if (authority) {
      if (seenTasks.has(binding.task)) throw new Error(`task ${binding.task}: duplicate binding`);
      seenTasks.add(binding.task);
      expectedRegistryRevision ??= binding.registry_revision;
      if (binding.registry_revision !== expectedRegistryRevision) {
        throw new Error(`issue #${issue}: registry_revision conflicts with other bindings`);
      }
    }
    if (!authority?.structuralOnly) validateActualLabels(issue, labelsByIssue.get(issue), expected);

    const epicIdentifier = normalize(binding.epic);
    const priorEpicIssue = epicIssuesByIdentifier.get(epicIdentifier);
    if (priorEpicIssue !== undefined && priorEpicIssue !== epicIssue) {
      throw new Error(`epic ${epicIdentifier}: maps to multiple epic issue numbers`);
    }
    epicIssuesByIdentifier.set(epicIdentifier, epicIssue);

    const epic = epics.get(epicIssue) ?? {
      epic: epicIdentifier,
      agents: epicAgents,
      agentIds: epicAgentIds,
      bindings: [],
    };
    if (epic.epic !== epicIdentifier) {
      throw new Error(`epic issue #${epicIssue}: conflicting epic identifiers`);
    }
    if (epic.agents.join('\0') !== epicAgents.join('\0')) {
      throw new Error(`epic issue #${epicIssue}: inconsistent epic_agents sets`);
    }
    if (authority && epic.agentIds.join('\0') !== epicAgentIds.join('\0')) {
      throw new Error(`epic issue #${epicIssue}: inconsistent epic_agent_ids sets`);
    }
    epic.bindings.push(binding);
    epics.set(epicIssue, epic);
  }

  for (const [epicIssue, epic] of epics) {
    if (seen.has(epicIssue)) throw new Error(`epic issue #${epicIssue}: also used as a task issue`);
    if (authority) {
      const peers = assignments
        ? assignments.filter(assignment => normalize(assignment.epic) === epic.epic)
          .map(assignment => ({ agent: assignment.agent, agent_id: assignment.agentId }))
        : epic.bindings;
      const expectedAgentIds = [...new Set(peers.map(binding => binding.agent_id).filter(agentId => agentId !== null))].sort();
      const hasIdentityOmission = peers.some(binding => binding.agent_id === null);
      if (assignments && [...new Set(peers.map(binding => normalize(binding.agent)))].sort().join('\0') !== epic.agents.join('\0')) {
        throw new Error(`epic issue #${epicIssue}: epic_agents conflict with the frozen plan`);
      }
      for (const binding of epic.bindings) {
        const actualAgentIds = [...binding.epic_agent_ids].sort();
        if (actualAgentIds.join('\0') !== expectedAgentIds.join('\0')) {
          throw new Error(`epic issue #${epicIssue}: epic_agent_ids do not match the complete epic task-agent set`);
        }
        if (hasIdentityOmission && binding.epic_identity_omission_reason !== 'partial') {
          throw new Error(`epic issue #${epicIssue}: every binding requires partial omission when an epic task omits agent_id`);
        }
        if (!hasIdentityOmission && binding.epic_identity_omission_reason !== undefined) {
          throw new Error(`epic issue #${epicIssue}: partial omission conflicts with a complete epic agent set`);
        }
      }
    }
    const originParent = epicIssue === artifact.origin_issue && epic.epic === 'origin';
    const expected = originParent
      ? { label: null, omission: 'origin' }
      : epic.agents.length > 1
      ? { label: null, omission: 'multi-owner' }
      : expectedLabel(epic.agents[0], roster);
    for (const binding of epic.bindings) validateReportedOutcome(binding, 'epic', expected);
    if (!originParent && !authority?.structuralOnly) validateActualLabels(epicIssue, labelsByIssue.get(epicIssue), expected);
  }
  return { skipped: false, checked: seen.size, epics: epics.size };
}

export function parsePendingReservation(body, repository, originIssue) {
  const blocks = [...String(body).matchAll(/```json\s*([\s\S]*?)```/g)];
  if (blocks.length !== 1) throw new Error('Pending source requires one reservation JSON block');
  const value = JSON.parse(blocks[0][1]);
  const keys = ['schema', 'repository', 'origin_issue', 'run_id', 'run_attempt', 'capture_sha256',
    'capture_artifact_id', 'plan_comment_id', 'plan_sha256', 'registry_sha256', 'phases',
    ...(Object.hasOwn(value, 'prior') ? ['prior'] : [])];
  if (Object.keys(value).sort().join('\0') !== keys.sort().join('\0') ||
    value.schema !== 'squad-activation-pending/v1' || value.repository !== repository || value.origin_issue !== originIssue ||
    ![value.origin_issue, value.run_id, value.run_attempt, value.capture_artifact_id, value.plan_comment_id]
      .every(id => Number.isSafeInteger(id) && id > 0) ||
    ![value.capture_sha256, value.plan_sha256, value.registry_sha256].every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)) ||
    !Array.isArray(value.phases) || value.phases.some((phase, index) =>
      !Number.isSafeInteger(phase) || phase < 1 || (index > 0 && value.phases[index - 1] >= phase))) {
    throw new Error('Pending source has malformed repository/origin/frozen snapshot metadata');
  }
  return value;
}

function classifyActivationHistory(record, context) {
  const blocks = [...record.body.matchAll(/Structured data:\s*```json\s*([\s\S]*?)```/g)];
  if (blocks.length === 0 && record.body.includes('squad-activation-pending/v1')) {
    const pending = parsePendingReservation(record.body, context.repository, context.originIssue);
    return { ...record, pending, artifact: { squad_artifact: 'activation-pending',
      schema_version: '1', origin_issue: pending.origin_issue, phases: pending.phases } };
  }
  const reconciliationMarker = /Activation reconciliation:|activation-reconciled/.test(record.body);
  const activationMarker = reconciliationMarker || /Activation bindings:/.test(record.body);
  if (!/Structured data:/.test(record.body) && !activationMarker) return undefined;
  let artifact;
  try {
    if (blocks.length !== 1) throw new Error('exactly one structured envelope is required');
    artifact = JSON.parse(blocks[0][1]);
  } catch (error) {
    if (activationMarker || /activated|plan-accepted|phases-accepted/.test(record.body)) throw error;
    return undefined;
  }
  const knownArtifact = ACTIVATION_ARTIFACTS.has(artifact?.squad_artifact);
  if (!knownArtifact && !activationMarker) return undefined;
  if (!reconciliationMarker && knownArtifact && artifact.squad_artifact !== 'activation-reconciled' &&
    Number.isSafeInteger(artifact.origin_issue) && artifact.origin_issue > 0 &&
    artifact.origin_issue !== context.originIssue) return undefined;
  if (!knownArtifact) throw new Error('Activation selection refused: unknown activation artifact');
  if (artifact.origin_issue !== context.originIssue || artifact.schema_version !== '1') {
    throw new Error('Activation selection refused: artifact origin/schema mismatch');
  }
  if (reconciliationMarker && artifact.squad_artifact !== 'activation-reconciled') {
    throw new Error('Activation selection refused: reconciliation requires activation-reconciled artifact');
  }
  return { ...record, artifact };
}

/** Evidence must come from the trusted API verifier, never from the artifact being selected. */
function selectActivationPair(records, registryValue, context) {
  const fail = message => { throw new Error(`Activation selection refused: ${message}`); };
  const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
  const ids = new Set();
  const parsed = records.map(record => {
    if (!Number.isSafeInteger(record.id) || record.id < 1 || ids.has(record.id) || typeof record.body !== 'string') {
      fail('duplicate or malformed comment identity');
    }
    ids.add(record.id);
    return classifyActivationHistory(record, context);
  }).filter(Boolean);
  const reconciled = parsed.filter(record => record.artifact.squad_artifact === 'activation-reconciled');
  if (reconciled.length > 1) fail('competing reconciliations');
  let selected;
  if (reconciled.length) {
    selected = reconciled[0];
    const blocks = [...selected.body.matchAll(/Activation reconciliation:\s*```json\s*([\s\S]*?)```/g)];
    if (blocks.length !== 1) fail('reconciliation record is missing or duplicated');
    const value = JSON.parse(blocks[0][1]);
    const keys = ['schema', 'basis', 'request_comment_id', 'request_sha256', 'actor_id',
      'supersedes_comment_id', 'supersedes_sha256', 'plan_sha256', 'registry_sha256', 'bindings_sha256',
      ...(Object.hasOwn(value, 'supersedes_kind') ? ['supersedes_kind'] : [])];
    if (!value || Object.keys(value).sort().join('\0') !== keys.sort().join('\0') ||
      value.schema !== 'squad-activation-reconciliation/v1' || value.basis !== 'current-state-authorized') fail('invalid reconciliation schema/basis');
    const evidence = (context.reconciliations ?? []).filter(item =>
      item.requestCommentId === value.request_comment_id && item.requestSha256 === value.request_sha256 &&
      item.actorId === value.actor_id && item.sourceCommentId === value.supersedes_comment_id &&
      item.sourceSha256 === value.supersedes_sha256 && item.planSha256 === value.plan_sha256 &&
      item.registrySha256 === value.registry_sha256 && item.bindingsSha256 === value.bindings_sha256 &&
      (item.sourceKind ?? 'activation') === (value.supersedes_kind ?? 'activation'));
    if (evidence.length !== 1) fail('independently verified reconciliation evidence is missing or ambiguous');
    const phases = evidence[0].phases ?? [];
    if (!Array.isArray(phases) || phases.some((phase, index) =>
      !Number.isSafeInteger(phase) || phase < 1 || (index > 0 && phases[index - 1] >= phase)) ||
      !Array.isArray(selected.artifact.phases) ||
      JSON.stringify(selected.artifact.phases) !== JSON.stringify(phases)) fail('authorized phase coverage mismatch');
    if (![value.request_comment_id, value.actor_id, value.supersedes_comment_id].every(id => Number.isSafeInteger(id) && id > 0) ||
      ![value.request_sha256, value.supersedes_sha256, value.plan_sha256, value.registry_sha256, value.bindings_sha256]
        .every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) fail('malformed reconciliation identities/hashes');
    const source = parsed.find(record => record.id === value.supersedes_comment_id);
    if (!source || source.artifact.squad_artifact === 'activation-reconciled' ||
      hash(source.body) !== value.supersedes_sha256 || hash(registryValue) !== value.registry_sha256) fail('superseded source or frozen registry mismatch');
    if (source.pending) {
      if (value.supersedes_kind !== 'pending' || source.pending.plan_sha256 !== value.plan_sha256 ||
        source.pending.registry_sha256 !== value.registry_sha256 ||
        JSON.stringify(source.pending.phases) !== JSON.stringify(phases)) fail('pending source lacks exact authorized frozen coverage');
    } else {
      if (value.supersedes_kind !== undefined) fail('source kind does not match the original activation');
      if (JSON.stringify(source.artifact.phases) !== JSON.stringify(phases)) fail('activation source phase coverage mismatch');
    }
    if (parsed.length !== 2) fail('ambiguous unsuperseded activation record');
    const bindings = [...selected.body.matchAll(/Activation bindings:\s*```json\s*([\s\S]*?)```/g)];
    if (bindings.length !== 1 || hash(JSON.parse(bindings[0][1])) !== value.bindings_sha256) fail('binding digest mismatch');
  } else {
    if ((context.reconciliations ?? []).length > 0) fail('verifier evidence has no matching reconciliation');
    if (parsed.length > 1) fail('ambiguous original activation records');
    selected = parsed[0];
    if (selected?.pending) fail('pending reservation alone is not activation authority');
  }
  if (!selected) return undefined;
  const blocks = [...selected.body.matchAll(/Activation bindings:\s*```json\s*([\s\S]*?)```/g)];
  if (blocks.length !== 1) fail('bindings are missing or duplicated');
  const bindings = JSON.parse(blocks[0][1]);
  const registry = parseAgentRegistry(registryValue);
  const roster = new Set([...registry.agents.values()].filter(agent => agent.status === 'active')
    .map(agent => normalize(agent.display_name)));
  validateActivation({ ...selected.artifact, bindings }, roster, new Map(), context.originIssue, {
    repository: context.repository, registry, structuralOnly: true, epicAssignments: context.epicAssignments,
  });
  return { id: selected.id, artifact: selected.artifact.squad_artifact, bindings };
}

function readChainSection(body, label) {
  const labels = body.match(new RegExp(`^${label}:[ \\t]*\\r?$`, 'gm')) ?? [];
  const blocks = [...body.matchAll(new RegExp(
    `^${label}:[ \\t]*\\r?\\n\\s*\`\`\`json[ \\t]*\\r?\\n([\\s\\S]*?)^\`\`\`[ \\t]*\\r?$`, 'gm',
  ))];
  if (labels.length !== 1 || blocks.length !== 1) throw new Error(`Activation chain: exactly one ${label} section is required`);
  return JSON.parse(blocks[0][1]);
}

/** Scoped pairs remain supported; complete histories require independent proof for every node. */
export function selectActivationRecord(records, registryValue, context) {
  const nodes = records.flatMap(record => {
    try {
      const envelope = readChainSection(record.body, 'Structured data');
      return envelope && envelope.squad_artifact === 'activation-reconciled' ? [{ record, envelope }] : [];
    } catch {
      return [];
    }
  });
  if (nodes.length <= 1 && (context.reconciliations ?? []).length <= 1) {
    return selectActivationPair(records, registryValue, context);
  }
  const fail = message => { throw new Error(`Activation chain: ${message}`); };
  const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
  const positive = value => Number.isSafeInteger(value) && value > 0;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const issueKey = value => value.replace(/^#/, '');
  if (nodes.length < 2 || nodes.length !== context.reconciliations.length) fail('missing or extra verifier proofs');
  const byId = new Map();
  for (const record of records) {
    if (!positive(record.id) || typeof record.body !== 'string' || byId.has(record.id)) {
      fail('duplicate or malformed record identity');
    }
    byId.set(record.id, record);
  }
  const usedRecords = new Set();
  const usedProofs = new Set();
  const usedRequests = new Set();
  const validated = new Map();
  for (const { record } of nodes) {
    const metadata = readChainSection(record.body, 'Activation reconciliation');
    const proofs = context.reconciliations.filter(proof =>
      proof.requestCommentId === metadata.request_comment_id && proof.requestSha256 === metadata.request_sha256 &&
      proof.actorId === metadata.actor_id && proof.sourceCommentId === metadata.supersedes_comment_id &&
      proof.sourceSha256 === metadata.supersedes_sha256 && proof.planSha256 === metadata.plan_sha256 &&
      proof.registrySha256 === metadata.registry_sha256 && proof.bindingsSha256 === metadata.bindings_sha256 &&
      (proof.sourceKind ?? 'activation') === (metadata.supersedes_kind ?? 'activation'));
    if (proofs.length !== 1) fail('missing or duplicate matching verifier proof');
    const proof = proofs[0];
    const source = byId.get(proof.sourceCommentId) ?? fail('missing source');
    if (usedProofs.has(proof) || usedRequests.has(proof.requestCommentId) ||
      usedRecords.has(source.id) || usedRecords.has(record.id)) fail('missing source or competing reconciliation');
    const selected = selectActivationPair([source, record], registryValue, { ...context, reconciliations: [proof] });
    if (!selected || selected.id !== record.id) fail('invalid reconciliation node');
    const first = validated.values().next().value;
    if (first && (proof.planSha256 !== first.proof.planSha256 ||
      proof.registrySha256 !== first.proof.registrySha256)) fail('inconsistent frozen plan or registry');
    let carrier;
    if (proof.sourceKind === 'pending') {
      carrier = parsePendingReservation(source.body, context.repository, context.originIssue);
    } else if (source.body.includes('Activation evidence:')) {
      carrier = readChainSection(source.body, 'Activation evidence');
      if (!object(carrier) || carrier.schema !== 'squad-activation-finalization/v1' ||
        carrier.basis !== 'current-trusted-execution' || carrier.plan_sha256 !== proof.planSha256 ||
        carrier.registry_sha256 !== proof.registrySha256) fail('invalid finalization source link carrier');
    }
    usedRecords.add(source.id);
    usedRecords.add(record.id);
    usedProofs.add(proof);
    usedRequests.add(proof.requestCommentId);
    validated.set(record.id, { selected, source, proof, prior: carrier?.prior });
  }
  if (records.some(record => !usedRecords.has(record.id) && classifyActivationHistory(record, context) !== undefined) ||
    usedProofs.size !== context.reconciliations.length) {
    fail('unconsumed history records or verifier proofs');
  }
  const parents = new Map();
  const children = new Set();
  for (const [id, node] of validated) {
    if (node.prior === undefined) continue;
    const link = node.prior;
    const keys = ['source_comment_id', 'source_sha256', 'reconciliation_comment_id', 'reconciliation_sha256'];
    if (!object(link) || Object.keys(link).sort().join() !== [...keys].sort().join() ||
      !positive(link.source_comment_id) || !positive(link.reconciliation_comment_id) ||
      ![link.source_sha256, link.reconciliation_sha256].every(value =>
        typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) fail('malformed prior link');
    const parentId = link.reconciliation_comment_id;
    const parent = validated.get(parentId);
    if (!parent || parent.source.id !== link.source_comment_id ||
      hash(parent.source.body) !== link.source_sha256 ||
      hash(byId.get(parentId).body) !== link.reconciliation_sha256) fail('unknown, missing, or changed ancestor');
    if (children.has(parentId)) fail('forked phase history');
    const before = parent.proof.phases ?? [];
    const after = node.proof.phases ?? [];
    if (before.length === 0 || before.length >= after.length || !before.every((phase, index) => after[index] === phase)) {
      fail('phase coverage must strictly expand');
    }
    const current = new Map(node.selected.bindings.map(binding => [binding.task, binding]));
    for (const priorBinding of parent.selected.bindings) {
      const next = current.get(priorBinding.task);
      if (!next || issueKey(next.issue) !== issueKey(priorBinding.issue) || next.epic !== priorBinding.epic ||
        issueKey(next.epic_issue) !== issueKey(priorBinding.epic_issue) || next.agent_id !== priorBinding.agent_id ||
        next.registry_revision !== priorBinding.registry_revision ||
        [...next.epic_agent_ids].sort().join() !== [...priorBinding.epic_agent_ids].sort().join() ||
        next.identity_omission_reason !== priorBinding.identity_omission_reason ||
        next.epic_identity_omission_reason !== priorBinding.epic_identity_omission_reason) {
        fail('prior task or epic bindings changed');
      }
    }
    parents.set(id, parentId);
    children.add(parentId);
  }
  const heads = [...validated.keys()].filter(id => !children.has(id));
  if (heads.length !== 1) fail('competing heads or cyclic history');
  const visited = new Set();
  let id = heads[0];
  while (id !== undefined) {
    if (visited.has(id)) fail('cyclic history');
    visited.add(id);
    id = parents.get(id);
  }
  if (visited.size !== validated.size) fail('disconnected or cyclic history');
  return validated.get(heads[0]).selected;
}

const AUTOMATIC_AUDIT_LIMITS = Object.freeze({ requests: 250, discoveryPages: 5, origins: 5, originPages: 10 });

function incompleteAudit(reason) {
  throw new Error(`Historical audit incomplete: ${reason}; run the manual full-history audit`);
}

/** Timestamps select historical candidates only; they never attest current-run output. */
export async function collectHistoricalActivationRecords({ github, context }) {
  const automatic = context.eventName === 'workflow_run';
  if (!automatic && context.eventName !== 'workflow_dispatch') incompleteAudit('unsupported audit event');
  let requestsUsed = 0;
  const readPages = async (method, params, limit = Infinity) => {
    const all = [];
    for (let page = 1; ; page++) {
      if (page > limit) incompleteAudit('comment pagination limit exhausted');
      if (automatic && requestsUsed >= AUTOMATIC_AUDIT_LIMITS.requests) incompleteAudit('API request budget exhausted');
      requestsUsed++;
      const response = await method({ ...params, per_page: 100, page });
      if (!Array.isArray(response.data) || response.data.length > 100 ||
        response.data.some(comment => !comment || typeof comment.body !== 'string')) {
        incompleteAudit('comment discovery returned malformed records');
      }
      all.push(...response.data);
      const next = /<[^>]+>;\s*rel="next"/.test(response.headers?.link ?? '');
      if (!next && (response.headers !== undefined || response.data.length < 100)) return all;
    }
  };
  let since;
  if (automatic) {
    const completed = Date.parse(context.payload.workflow_run?.updated_at);
    if (!Number.isFinite(completed)) incompleteAudit('trigger completion timestamp is missing');
    since = new Date(completed - 24 * 60 * 60 * 1000).toISOString();
  }
  const discovered = await readPages(github.rest.issues.listCommentsForRepo, {
    ...context.repo, sort: 'updated', direction: 'asc', ...(automatic ? { since } : {}),
  }, automatic ? AUTOMATIC_AUDIT_LIMITS.discoveryPages : Infinity);
  const candidate = comment => /"squad_artifact"\s*:\s*"?(?:phases-activated|activated|phases-accepted|plan-accepted|activation-reconciled)|squad-activation-pending\/v1/i
    .test(comment.body ?? '');
  const originFor = comment => {
    const prefix = `https://api.github.com/repos/${context.repo.owner}/${context.repo.repo}/issues/`;
    const value = String(comment.issue_url ?? '');
    const number = value.startsWith(prefix) ? Number(value.slice(prefix.length)) : NaN;
    if (!Number.isSafeInteger(number) || number <= 0) incompleteAudit('candidate origin identity is missing');
    return number;
  };
  const origins = [...new Set(discovered.filter(candidate).map(originFor))];
  if (automatic && origins.length > AUTOMATIC_AUDIT_LIMITS.origins) incompleteAudit('candidate origin limit exhausted');
  const comments = [];
  for (const origin of origins) {
    // Always fetch the complete origin, including predecessors older than discovery.
    const history = await readPages(github.rest.issues.listComments, {
      ...context.repo, issue_number: origin,
    }, automatic ? AUTOMATIC_AUDIT_LIMITS.originPages : Infinity);
    const records = history.filter(candidate).map(comment => {
      if (originFor(comment) !== origin || !Number.isSafeInteger(comment.id) || comment.id <= 0) {
        incompleteAudit('origin history identity changed');
      }
      return { id: comment.id, body: comment.body, issue: origin };
    });
    if (!records.some(record => ACTIVATION_ARTIFACT_PATTERN.test(record.body))) {
      incompleteAudit(`origin #${origin} has no activation evidence`);
    }
    comments.push(...records.filter(record => ACTIVATION_ARTIFACT_PATTERN.test(record.body)));
  }
  return {
    schema: 'squad-historical-audit/v1', scope: automatic ? 'recent-candidates' : 'full-history',
    ...(automatic ? { since } : {}), requestsUsed, origins, comments,
  };
}

function readOnlyGithub(repo, token, requestBudget = Infinity) {
  let requests = 0;
  const request = async (path, page) => {
    if (requests >= requestBudget) incompleteAudit('API request budget exhausted during complete-chain verification');
    requests++;
    const response = await fetch(`https://api.github.com/repos/${repo}/${path}${page ? `?per_page=100&page=${page}` : ''}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw Object.assign(new Error(`Reconciliation evidence API returned ${response.status}`),
      { status: response.status });
    return { data: await response.json(), headers: { link: response.headers.get('link') ?? '' } };
  };
  const rest = {
    issues: {
      get: ({ issue_number }) => request(`issues/${issue_number}`),
      getComment: ({ comment_id }) => request(`issues/comments/${comment_id}`),
      getParent: ({ issue_number }) => request(`issues/${issue_number}/parent`),
      listComments: ({ issue_number, page }) => request(`issues/${issue_number}/comments`, page),
    },
    repos: { getCollaboratorPermissionLevel: ({ username }) =>
      request(`collaborators/${encodeURIComponent(username)}/permission`) },
  };
  return { rest, paginate: async (method, params) => {
    const all = [];
    for (let page = 1; ; page++) {
      const { data, headers } = await method({ ...params, page });
      if (!Array.isArray(data)) throw new Error('Evidence pagination returned a non-array');
      all.push(...data);
      if (!/<[^>]+>;\s*rel="next"/.test(headers?.link ?? '') &&
        (headers !== undefined || data.length < 100)) return all;
    }
  } };
}

async function fetchLabels(github, repo, issues) {
  const labels = new Map();
  const [owner, name] = repo.split('/');
  for (const issue of issues) {
    const { data: body } = await github.rest.issues.get({ owner, repo: name, issue_number: issue });
    labels.set(issue, new Set(body.labels.map(label => normalize(typeof label === 'string' ? label : label.name))));
  }
  return labels;
}

/**
 * The caller must hold the response of its own synchronous createComment call.
 * Neither a disk manifest nor a comment's claimed run IDs can supply this receipt.
 */
export async function checkActivationPublication({ github, context, root, receipt, expectedBody }) {
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const origin = Number(context.payload.inputs?.issue_number ?? context.payload.issue?.number);
  const checkIdentity = comment => {
    if (!Number.isSafeInteger(comment?.id) || comment.id <= 0 ||
      comment.user?.id !== 41898282 || comment.user?.login !== 'github-actions[bot]' ||
      comment.user?.type !== 'Bot' ||
      comment.issue_url !== `https://api.github.com/repos/${repository}/issues/${origin}` ||
      comment.html_url !== `https://github.com/${repository}/issues/${origin}#issuecomment-${comment.id}` ||
      comment.body !== expectedBody) {
      throw new Error('Activation publication receipt is missing or differs from the exact trusted write');
    }
  };
  checkIdentity(receipt);
  const current = (await github.rest.issues.getComment({ ...context.repo, comment_id: receipt.id })).data;
  checkIdentity(current);
  if (current.id !== receipt.id) throw new Error('Activation publication readback changed comment identity');
  const artifact = parseStructuredData(current.body);
  if (!ACTIVATION_ARTIFACTS.has(artifact?.squad_artifact) || artifact.origin_issue !== origin) {
    throw new Error('Activation publication has no matching activation envelope');
  }
  const { verifyPublishedActivation, verifyReconciliationRequest, selectionEvidence,
    frozenAssignments, activationHistoryHead } = await import('./squad-activation.mjs');
  let registry;
  let assignments;
  if (artifact.squad_artifact === 'activation-reconciled') {
    const metadata = readChainSection(current.body, 'Activation reconciliation');
    const verified = await verifyReconciliationRequest({
      github, context, root,
      requestCommentId: metadata.request_comment_id, requestSha256: metadata.request_sha256,
    });
    if (verified.snapshots.some(snapshot => snapshot.body !== snapshot.after)) {
      throw new Error('Activation publication dependencies are not corrected');
    }
    registry = verified.registry;
    assignments = frozenAssignments(verified.fullPlan);
    const selected = selectActivationRecord([verified.original, current], registry, {
      repository, originIssue: origin, reconciliations: [selectionEvidence(verified)], epicAssignments: assignments,
    });
    if (selected?.id !== current.id) throw new Error('Activation publication is not the verified reconciliation');
  } else {
    const verified = await verifyPublishedActivation({ github, context, root, comment: current });
    registry = verified.registry;
    assignments = verified.assignments;
  }
  const labels = new Map();
  for (const issue of new Set(artifact.bindings.flatMap(binding =>
    [extractIssueNumber(binding.issue), extractIssueNumber(binding.epic_issue)]))) {
    const actual = (await github.rest.issues.get({ ...context.repo, issue_number: issue })).data;
    if (actual.pull_request || actual.number !== issue ||
      actual.url !== `https://api.github.com/repos/${repository}/issues/${issue}`) {
      throw new Error('Activation publication references an invalid current issue');
    }
    labels.set(issue, new Set(actual.labels.map(label => normalize(typeof label === 'string' ? label : label.name))));
  }
  assertAcceptedOnlyLabelWording(current.body, artifact.squad_artifact);
  validateActivation(artifact, parseRoster(await readFile(join(root, '.squad/team.md'), 'utf8')),
    labels, origin, { repository, registry: parseAgentRegistry(registry), epicAssignments: assignments });
  const history = await github.paginate(github.rest.issues.listComments, {
    ...context.repo, issue_number: origin, per_page: 100,
  });
  if (activationHistoryHead(history, origin, repository) !== current.id) {
    throw new Error('Activation publication is not the sole current history head');
  }
  return current;
}

export async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }));
  if ((!args['comment-file'] && !args['comments-file']) || !args['team-file'] || !args.repo) {
    throw new Error('usage: check-agent-binding.mjs --comment-file=PATH|--comments-file=PATH --team-file=PATH --repo=OWNER/REPO');
  }

  const roster = parseRoster(await readFile(args['team-file'], 'utf8'));
  const registryFile = args['registry-file'] ?? join(dirname(args['team-file']), 'casting', 'registry.json');
  const registry = parseAgentRegistry(await validateCastingPairFiles(registryFile));
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required for activation binding checks');

  const input = args['comments-file']
    ? JSON.parse(await readFile(args['comments-file'], 'utf8'))
    : [{ body: await readFile(args['comment-file'], 'utf8') }];
  let requestBudget = Infinity;
  let auditScope;
  let comments = input;
  if (!Array.isArray(input)) {
    if (input?.schema !== 'squad-historical-audit/v1' ||
      !['recent-candidates', 'full-history'].includes(input.scope) ||
      !Number.isSafeInteger(input.requestsUsed) || input.requestsUsed < 0 ||
      !Array.isArray(input.origins) || input.origins.some(origin => !Number.isSafeInteger(origin) || origin <= 0) ||
      new Set(input.origins).size !== input.origins.length || !Array.isArray(input.comments)) {
      incompleteAudit('collector result is missing or malformed');
    }
    auditScope = input.scope;
    comments = input.comments;
    if (auditScope === 'recent-candidates') {
      if (!Number.isFinite(Date.parse(input.since)) || input.origins.length > AUTOMATIC_AUDIT_LIMITS.origins ||
        input.requestsUsed > AUTOMATIC_AUDIT_LIMITS.requests) incompleteAudit('invalid automatic discovery scope or budget');
      requestBudget = AUTOMATIC_AUDIT_LIMITS.requests - input.requestsUsed;
    }
    if (comments.some(comment => !input.origins.includes(comment.issue)) ||
      input.origins.some(origin => !comments.some(comment => comment.issue === origin))) {
      incompleteAudit('collector candidate evidence is missing');
    }
  }
  if (!Array.isArray(comments)) throw new Error('comments file must contain an array');

  const github = readOnlyGithub(args.repo, token, requestBudget);
  const [owner, repo] = args.repo.split('/');
  const root = dirname(dirname(args['team-file']));
  const { verifyReconciliationRequest, selectionEvidence, frozenAssignments, verifyPublishedActivation, activationHistoryHead } =
    await import('./squad-activation.mjs');
  const superseded = new Set();
  const assignments = new Map();
  const historyOrigins = new Set();
  const verifiedIds = new Set();
  for (const comment of comments) {
    const artifact = parseStructuredData(comment.body ?? '', { envelopeOnly: true });
    if (artifact?.squad_artifact !== 'activation-reconciled') continue;
    const records = [...comment.body.matchAll(/Activation reconciliation:\s*```json\s*([\s\S]*?)```/g)];
    if (records.length !== 1) throw new Error('Reconciliation metadata is missing or duplicated');
    const metadata = JSON.parse(records[0][1]);
    const verified = await verifyReconciliationRequest({
      github, context: { repo: { owner, repo }, payload: { issue: { number: artifact.origin_issue } } },
      root, requestCommentId: metadata.request_comment_id, requestSha256: metadata.request_sha256,
    });
    if (verified.snapshots.some(snapshot => snapshot.body !== snapshot.after)) throw new Error('Dependency corrections are incomplete');
    const supplements = verified.comments.filter(item => {
      if (parseStructuredData(item.body ?? '', { envelopeOnly: true })?.squad_artifact !== 'activation-reconciled') return false;
      const value = [...item.body.matchAll(/Activation reconciliation:\s*```json\s*([\s\S]*?)```/g)];
      if (value.length !== 1) throw new Error('Reconciliation metadata is missing or duplicated');
      return JSON.parse(value[0][1]).supersedes_comment_id === verified.original.id;
    });
    const selected = selectActivationRecord([verified.original, ...supplements], verified.registry, {
      repository: args.repo, originIssue: artifact.origin_issue,
      reconciliations: [selectionEvidence(verified)], epicAssignments: frozenAssignments(verified.fullPlan),
    });
    if (!supplements.some(item => item.id === selected.id && item.body === comment.body)) {
      throw new Error('Reconciliation input differs from the independently selected API record');
    }
    superseded.add(verified.original.id);
    assignments.set(comment, frozenAssignments(verified.fullPlan));
    historyOrigins.add(artifact.origin_issue);
    verifiedIds.add(selected.id);
  }
  let checked = 0;
  const auditedOrigins = new Set();
  for (const comment of comments) {
    if (superseded.has(comment.id)) continue;
    const artifact = parseStructuredData(comment.body ?? '');
    if (!artifact || !ACTIVATION_ARTIFACTS.has(artifact.squad_artifact)) continue;
    if (comment.body.includes('Activation evidence:')) {
      if (!Number.isSafeInteger(comment.id) || comment.id <= 0) {
        throw new Error('Published activation requires its collected API comment ID');
      }
      const actual = (await github.rest.issues.getComment({ owner, repo, comment_id: comment.id })).data;
      if (actual?.id !== comment.id || actual.body !== comment.body) {
        throw new Error('Published activation input differs from its current API record');
      }
      const verified = await verifyPublishedActivation({
        github, context: { repo: { owner, repo }, payload: { issue: { number: artifact.origin_issue } } },
        root, comment: actual,
      });
      assignments.set(comment, verified.assignments);
      historyOrigins.add(artifact.origin_issue);
      verifiedIds.add(actual.id);
    }
    assertAcceptedOnlyLabelWording(comment.body ?? '', artifact.squad_artifact);
    const issues = Array.isArray(artifact.bindings)
      ? artifact.bindings.flatMap(binding => [extractIssueNumber(binding?.issue), extractIssueNumber(binding?.epic_issue)]).filter(Number.isInteger)
      : [];
    const labels = await fetchLabels(github, args.repo, [...new Set(issues)]);
    const result = validateActivation(artifact, roster, labels, comment.issue, {
      repository: args.repo,
      registry,
      epicAssignments: assignments.get(comment),
    });
    checked += result.checked;
    auditedOrigins.add(artifact.origin_issue);
  }
  for (const origin of historyOrigins) {
    const current = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number: origin, per_page: 100,
    });
    const head = activationHistoryHead(current, origin, args.repo);
    if (!verifiedIds.has(head)) throw new Error('Current activation head was not independently verified from the collected input');
  }
  if (auditScope && input.origins.some(origin => !auditedOrigins.has(origin))) {
    incompleteAudit('a candidate origin has no validated activation evidence');
  }
  if (auditScope) console.log(`Historical audit scope: ${auditScope}; no current-run completion or repository-wide coverage outside that scope is asserted.`);
  console.log(checked === 0 ? 'No historical activation artifact found; no current-run completion is asserted.'
    : `Validated ${checked} activation bindings.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Agent binding check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
