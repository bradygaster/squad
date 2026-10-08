/**
 * Preset application scaffolders.
 *
 * `applyPreset` copies agent charters into `.squad/agents/`, but to make the
 * resulting squad usable by the coordinator (and to satisfy the post-init
 * "Established Mode" mode-switch check) we must also wire the preset agents
 * into team.md, routing.md, and the casting state files. These helpers do
 * that in a merge-friendly way so calling `applyPreset` repeatedly is
 * idempotent and does not clobber pre-existing rows or entries.
 *
 * The cast command (`packages/squad-cli/src/cli/core/cast.ts`) has its own
 * fresh-write versions of these writers — see #1288 follow-up for a possible
 * future refactor that shares the logic. For now, the scope of #1288 is
 * focused on making preset apply produce a Coordinator-ready squad.
 *
 * @module presets/scaffold
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { reconcileAgentProvenanceRegistry } from '../casting/agent-provenance.js';
import {
  CastingCommitInDoubtError,
  _setCastingDurabilityHooksForTesting,
  acquireCastingRegistryLock,
  commitCastingRegistryPair,
  prepareCastingRegistryPairLocked,
  readCastingRegistryPair,
  recoverCastingRegistryTransaction,
  type CastingDurabilityBoundary,
  type CastingRecoveryPathState,
} from '../casting/durable-registry.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { PresetAgent } from './types.js';

const storage = new FSStorageProvider();

const MEMBERS_HEADER = '## Members';
const ROUTING_HEADER = '## Work Type → Agent';
const REGISTRY_UPDATE_MAX_ATTEMPTS = 8;
const DEFAULT_POLICY_RAW = JSON.stringify(
  { universe_allowlist: ['*'], max_capacity: 25 },
  null,
  2,
) + '\n';
let atomicWriteSequence = 0;

interface PresetRegistryTestHooks {
  afterSnapshot?: (context: { registryPath: string; attempt: number }) => void;
  beforeWrite?: (context: { filePath: string; stage: string }) => void;
  beforeRename?: (context: {
    registryPath: string;
    tempPath: string;
    attempt: number;
    filePath?: string;
    stage?: string;
  }) => void;
  now?: () => number;
  wait?: (milliseconds: number) => void;
  isProcessAlive?: (pid: number) => boolean | undefined;
  lockTimeoutMs?: number;
  staleLockAgeMs?: number;
  beforeRollback?: () => void;
  afterOutputMutation?: (context: {
    surface: 'agent-tree' | 'routing' | 'team' | 'managed-routing';
    path: string;
  }) => void;
  boundary?: (context: {
    boundary: CastingDurabilityBoundary;
    path: string;
    transactionId?: string;
  }) => void;
}

let presetRegistryTestHooks: PresetRegistryTestHooks | null = null;

/** @internal Test-only deterministic conflict/failure injection. */
export function _setPresetRegistryHooksForTesting(
  nextHooks: PresetRegistryTestHooks | null,
): void {
  presetRegistryTestHooks = nextHooks;
  _setCastingDurabilityHooksForTesting(nextHooks ? {
    now: nextHooks.now,
    wait: nextHooks.wait,
    isProcessAlive: nextHooks.isProcessAlive,
    lockTimeoutMs: nextHooks.lockTimeoutMs,
    staleLockAgeMs: nextHooks.staleLockAgeMs,
    boundary: (context) => {
      nextHooks.boundary?.(context);
      const [stage, operation] = context.boundary.split(':');
      if (operation === 'write') {
        nextHooks.beforeWrite?.({ filePath: context.path, stage: stage! });
      }
      if (operation === 'rename') {
        nextHooks.beforeRename?.({
          registryPath: context.path,
          tempPath: context.path,
          attempt: 0,
          filePath: context.path,
          stage,
        });
      }
    },
  } : null);
}

/** @internal Test-only deterministic external-writer injection. */
export function _afterPresetOutputMutationForTesting(
  surface: 'agent-tree' | 'routing' | 'team' | 'managed-routing',
  outputPath: string,
): void {
  presetRegistryTestHooks?.afterOutputMutation?.({ surface, path: outputPath });
}

interface ScaffoldOptions {
  /** Universe tag for the casting registry. Defaults to `preset:<name>`. */
  universe: string;
}

function nowMilliseconds(): number {
  return presetRegistryTestHooks?.now?.() ?? Date.now();
}

interface CastingHistory {
  assignment_cast_snapshots: Record<string, {
    created_at: string;
    agents: string[];
    universe: string;
  }>;
  universe_usage_history: Array<{ universe: string; used_at: string }>;
}

function readCastingHistoryRaw(raw: string | undefined): { raw: string | undefined; value: CastingHistory } {
  if (raw === undefined) {
    return {
      raw,
      value: { assignment_cast_snapshots: {}, universe_usage_history: [] },
    };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('history root must be an object');
    }
    const snapshots = parsed['assignment_cast_snapshots'];
    const usage = parsed['universe_usage_history'];
    if (
      snapshots !== undefined
      && (typeof snapshots !== 'object' || snapshots === null || Array.isArray(snapshots))
    ) {
      throw new Error('assignment_cast_snapshots must be an object');
    }
    if (usage !== undefined && !Array.isArray(usage)) {
      throw new Error('universe_usage_history must be an array');
    }
    return {
      raw,
      value: {
        assignment_cast_snapshots: (snapshots ?? {}) as CastingHistory['assignment_cast_snapshots'],
        universe_usage_history: (usage ?? []) as CastingHistory['universe_usage_history'],
      },
    };
  } catch (error) {
    throw new Error(
      `Cannot update malformed casting/history.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateCastingPolicy(policyPath: string): void {
  const raw = storage.readSync(policyPath);
  if (raw === undefined) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('policy root must be an object');
    }
  } catch (error) {
    throw new Error(
      `Cannot update malformed casting/policy.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validatePresetCastingInputs(castingDir: string): void {
  if (!storage.existsSync(castingDir)) return;
  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const journalPath = path.join(castingDir, 'registry-history.transaction.json');
  const manifestPath = path.join(castingDir, 'registry-history.commit.json');
  const registryExists = storage.existsSync(registryPath);
  const historyExists = storage.existsSync(historyPath);
  if (registryExists !== historyExists) {
    throw new Error(
      'Cannot update casting registry/history: exactly one authoritative file exists',
    );
  }
  if (
    registryExists
    || storage.existsSync(journalPath)
    || storage.existsSync(manifestPath)
  ) {
    const pair = readCastingRegistryPair(castingDir);
    readCastingHistoryRaw(pair.historyRaw);
  }
  validateCastingPolicy(path.join(castingDir, 'policy.json'));
}

function fileState(raw: string | undefined): string {
  if (raw === undefined) return 'missing';
  return `file:sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

function restoreFileIfUnchanged(
  filePath: string,
  original: string | undefined,
  written: string | undefined,
): CastingRecoveryPathState | undefined {
  let observed: string | undefined;
  try {
    observed = storage.readSync(filePath);
  } catch {
    return {
      path: filePath,
      originalState: fileState(original),
      transactionWrittenState: fileState(written),
      observedState: 'indeterminate',
      status: 'indeterminate',
    };
  }
  if (observed !== written) {
    return {
      path: filePath,
      originalState: fileState(original),
      transactionWrittenState: fileState(written),
      observedState: fileState(observed),
      status: 'diverged',
    };
  }
  try {
    if (original === undefined) storage.deleteSync(filePath);
    else storage.writeSync(filePath, original);
    return undefined;
  } catch {
    return {
      path: filePath,
      originalState: fileState(original),
      transactionWrittenState: fileState(written),
      observedState: 'rollback-failed',
      status: 'indeterminate',
    };
  }
}

function atomicWriteFile(
  filePath: string,
  content: string,
  stage: string,
  registryPath: string,
  attempt: number,
): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${nowMilliseconds()}-${attempt}-${atomicWriteSequence++}`;
  try {
    presetRegistryTestHooks?.beforeWrite?.({ filePath, stage });
    storage.writeSync(tempPath, content);
    presetRegistryTestHooks?.beforeRename?.({
      registryPath,
      tempPath,
      attempt,
      filePath,
      stage,
    });
    storage.renameSync(tempPath, filePath);
  } finally {
    storage.deleteSync(tempPath);
  }
}

/**
 * Map an agent's role to the Members-table Status cell.
 *
 * Mirrors the role-to-status mapping in `packages/squad-cli/src/cli/core/cast.ts:652-655`
 * so a team produced by `preset apply` looks identical to one produced by
 * a fresh cast — Scribe/Ralph/Rai/Fact-Checker each get their canonical
 * status label instead of all rows being '✅ Active'. Per-role rather
 * than per-name because presets may rename the agent but keep the role.
 */
function statusForRole(role: string): string {
  // Case-insensitive comparison so presets that lowercase "session logger"
  // still get the silent status.
  const r = role.toLowerCase();
  if (r === 'session logger' || r === 'scribe') return '📋 Silent';
  if (r === 'work monitor' || r === 'ralph') return '🔄 Monitor';
  if (r === 'rai reviewer' || r === 'rai') return '🛡️ RAI';
  if (r === 'fact checker' || r === 'fact-checker') return '🔍 Verifier';
  return '✅ Active';
}

/**
 * Build a single Members table row for a preset agent.
 */
function memberRow(agent: PresetAgent): string {
  const nameLower = agent.name.toLowerCase();
  return `| ${agent.name} | ${agent.role} | \`.squad/agents/${nameLower}/charter.md\` | ${statusForRole(agent.role)} |`;
}

/**
 * Build a single routing table row for a preset agent (work type = role).
 */
function routingRow(agent: PresetAgent): string {
  return `| ${agent.role} | ${agent.name} | — |`;
}

/**
 * Parse the existing Members table from team.md content (if any) and return
 * the set of names already present (case-insensitive comparison key).
 */
function existingMemberNames(teamContent: string): Set<string> {
  const names = new Set<string>();
  const idx = teamContent.indexOf(MEMBERS_HEADER);
  if (idx === -1) return names;
  const afterHeader = teamContent.slice(idx + MEMBERS_HEADER.length);
  const nextHeaderIdx = afterHeader.search(/\n## /);
  const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
  // Match table rows: "| Name | Role | Charter | Status |"
  // Skip header row and the separator row.
  const rowRe = /^\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(section)) !== null) {
    const first = match[1]!.trim();
    if (!first || first === 'Name' || /^-+$/.test(first)) continue;
    names.add(first.toLowerCase());
  }
  return names;
}

/**
 * Parse the existing routing table from routing.md content (if any) and
 * return the set of agent names already present.
 */
function existingRoutingAgents(routingContent: string): Set<string> {
  const names = new Set<string>();
  const idx = routingContent.indexOf(ROUTING_HEADER);
  if (idx === -1) return names;
  const afterHeader = routingContent.slice(idx + ROUTING_HEADER.length);
  const nextHeaderIdx = afterHeader.search(/\n## /);
  const section = nextHeaderIdx === -1 ? afterHeader : afterHeader.slice(0, nextHeaderIdx);
  // Routing rows: "| <Work Type> | <Primary> | <Secondary> |"
  // We want the Primary column (2nd cell).
  const rowRe = /^\|\s*[^|]+?\s*\|\s*([^|]+?)\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRe.exec(section)) !== null) {
    const primary = match[1]!.trim();
    if (!primary || primary === 'Primary' || /^-+$/.test(primary)) continue;
    names.add(primary.toLowerCase());
  }
  return names;
}

/**
 * Write or update `.squad/team.md` so its `## Members` table contains the
 * preset's agents. Existing members are preserved; only new names are added.
 * If team.md does not exist, a minimal one is created.
 */
function writeManagedScaffoldFile(
  filePath: string,
  content: string,
  surface: 'team' | 'managed-routing',
): string {
  storage.writeSync(filePath, content);
  _afterPresetOutputMutationForTesting(surface, filePath);
  return content;
}

function writeOrMergeTeamMembers(
  squadDir: string,
  agents: PresetAgent[],
  presetName: string,
): string {
  const teamPath = path.join(squadDir, 'team.md');
  const existing = storage.existsSync(teamPath) ? (storage.readSync(teamPath) ?? '') : '';

  if (!existing) {
    // Create from scratch (preset apply onto a bare .squad/ directory)
    const fresh = [
      '# Squad Team',
      '',
      `> Created by \`squad preset apply ${presetName}\``,
      '',
      '## Coordinator',
      '',
      '| Name | Role | Notes |',
      '|------|------|-------|',
      '| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |',
      '',
      MEMBERS_HEADER,
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      ...agents.map(memberRow),
      '',
      '## Project Context',
      '',
      `- **Preset:** ${presetName}`,
      `- **Created:** ${new Date().toISOString().split('T')[0]}`,
      '',
    ].join('\n');
    storage.mkdirSync(squadDir, { recursive: true });
    return writeManagedScaffoldFile(teamPath, fresh, 'team');
  }

  // team.md exists — merge into existing ## Members table
  const already = existingMemberNames(existing);
  const newRows = agents
    .filter(a => !already.has(a.name.toLowerCase()))
    .map(memberRow);
  if (newRows.length === 0) return existing; // nothing to do, all already present

  const membersIdx = existing.indexOf(MEMBERS_HEADER);
  if (membersIdx === -1) {
    // No Members section — append one
    const block = [
      '',
      MEMBERS_HEADER,
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      ...newRows,
      '',
    ].join('\n');
    return writeManagedScaffoldFile(
      teamPath,
      existing.trimEnd() + '\n' + block,
      'team',
    );
  }

  // Members section exists — find end of its table and insert rows there
  const afterHeader = existing.slice(membersIdx);
  const nextHeaderMatch = afterHeader.match(/\n## /);
  const sectionEnd = nextHeaderMatch
    ? membersIdx + (nextHeaderMatch.index ?? afterHeader.length)
    : existing.length;
  const section = existing.slice(membersIdx, sectionEnd);

  // Find the last table row in the section (line starting with `|`)
  const sectionLines = section.split('\n');
  let lastTableLineRel = -1;
  for (let i = sectionLines.length - 1; i >= 0; i--) {
    if (sectionLines[i]!.trimStart().startsWith('|')) { lastTableLineRel = i; break; }
  }

  if (lastTableLineRel === -1) {
    // Section has the header but no table — append a fresh table
    const headerLines = [
      '',
      '| Name | Role | Charter | Status |',
      '|------|------|---------|--------|',
      ...newRows,
      '',
    ];
    const newSection = MEMBERS_HEADER + '\n' + headerLines.join('\n') + '\n';
    const updated = existing.slice(0, membersIdx) + newSection + existing.slice(sectionEnd);
    return writeManagedScaffoldFile(teamPath, updated, 'team');
  }

  // Append new rows after the last existing table row
  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = before + '\n' + newRows.join('\n') + (after ? '\n' + after : '\n');
  const updated = existing.slice(0, membersIdx) + newSection + existing.slice(sectionEnd);
  return writeManagedScaffoldFile(teamPath, updated, 'team');
}

/**
 * Write or update `.squad/routing.md` so it includes a `## Work Type → Agent`
 * table with the preset's agents. Existing rows are preserved; only new
 * primary agents are added. If routing.md does not exist, a minimal one is
 * created.
 */
function writeOrMergeRouting(squadDir: string, agents: PresetAgent[]): string {
  const routingPath = path.join(squadDir, 'routing.md');
  const existing = storage.existsSync(routingPath) ? (storage.readSync(routingPath) ?? '') : '';

  if (!existing) {
    const fresh = [
      '# Squad Routing',
      '',
      ROUTING_HEADER,
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      ...agents.map(routingRow),
      '',
      '## Governance',
      '',
      '- Route based on work type and agent expertise',
      '- Update this file as team capabilities evolve',
      '',
    ].join('\n');
    storage.mkdirSync(squadDir, { recursive: true });
    return writeManagedScaffoldFile(routingPath, fresh, 'managed-routing');
  }

  const already = existingRoutingAgents(existing);
  const newRows = agents
    .filter(a => !already.has(a.name.toLowerCase()))
    .map(routingRow);
  if (newRows.length === 0) return existing;

  const headerIdx = existing.indexOf(ROUTING_HEADER);
  if (headerIdx === -1) {
    // Append a fresh routing block
    const block = [
      '',
      ROUTING_HEADER,
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      ...newRows,
      '',
    ].join('\n');
    return writeManagedScaffoldFile(
      routingPath,
      existing.trimEnd() + '\n' + block,
      'managed-routing',
    );
  }

  // Existing routing section — append new rows after its last table row
  const afterHeader = existing.slice(headerIdx);
  const nextHeaderMatch = afterHeader.match(/\n## /);
  const sectionEnd = nextHeaderMatch
    ? headerIdx + (nextHeaderMatch.index ?? afterHeader.length)
    : existing.length;
  const section = existing.slice(headerIdx, sectionEnd);
  const sectionLines = section.split('\n');
  let lastTableLineRel = -1;
  for (let i = sectionLines.length - 1; i >= 0; i--) {
    if (sectionLines[i]!.trimStart().startsWith('|')) { lastTableLineRel = i; break; }
  }
  if (lastTableLineRel === -1) {
    const headerLines = [
      '',
      '| Work Type | Primary | Secondary |',
      '|-----------|---------|----------|',
      ...newRows,
      '',
    ];
    const newSection = ROUTING_HEADER + '\n' + headerLines.join('\n') + '\n';
    const updated = existing.slice(0, headerIdx) + newSection + existing.slice(sectionEnd);
    return writeManagedScaffoldFile(routingPath, updated, 'managed-routing');
  }
  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = before + '\n' + newRows.join('\n') + (after ? '\n' + after : '\n');
  const updated = existing.slice(0, headerIdx) + newSection + existing.slice(sectionEnd);
  return writeManagedScaffoldFile(routingPath, updated, 'managed-routing');
}

/**
 * Write or update `.squad/casting/registry.json`, `history.json`, and
 * `policy.json` with entries for the preset's agents. Registry entries are
 * merged (new agents added, existing entries left untouched). A new
 * preset-apply snapshot is appended to history.json. policy.json is created
 * with sensible defaults only if missing.
 */
function writeOrMergeCastingState(
  squadDir: string,
  agents: PresetAgent[],
  options: ScaffoldOptions,
): void {
  const castingDir = path.join(squadDir, 'casting');
  storage.mkdirSync(castingDir, { recursive: true });
  const now = new Date().toISOString();

  // ---- registry.json ----
  const registryPath = path.join(castingDir, 'registry.json');
  const candidates = agents.map((agent) => ({
    id: agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    displayName: agent.name,
    role: agent.role,
    universe: options.universe,
  }));

  // ---- history.json ----
  const historyPath = path.join(castingDir, 'history.json');
  const policyPath = path.join(castingDir, 'policy.json');
  if (!storage.existsSync(policyPath)) {
    atomicWriteFile(policyPath, DEFAULT_POLICY_RAW, 'policy', policyPath, 0);
  }
  for (let attempt = 1; attempt <= REGISTRY_UPDATE_MAX_ATTEMPTS; attempt++) {
    const pairSnapshot = prepareCastingRegistryPairLocked(castingDir);
    const snapshot = pairSnapshot.registryRaw?.trim()
      ? { raw: pairSnapshot.registryRaw, value: pairSnapshot.registry }
      : { raw: pairSnapshot.registryRaw, value: undefined };
    const registry = reconcileAgentProvenanceRegistry(
      snapshot.value,
      candidates,
      { generatedAt: now, retireMissing: false },
    );
    const historySnapshot = readCastingHistoryRaw(pairSnapshot.historyRaw);
    const history = structuredClone(historySnapshot.value);
    const snapshotKey = `preset-${options.universe}-revision-${registry.revision}-${now}`;
    history.assignment_cast_snapshots[snapshotKey] = {
      created_at: now,
      agents: candidates.map(candidate => candidate.id),
      universe: options.universe,
    };
    history.universe_usage_history.push({ universe: options.universe, used_at: now });

    presetRegistryTestHooks?.afterSnapshot?.({ registryPath, attempt });
    if (storage.readSync(registryPath) !== snapshot.raw) {
      continue;
    }
    if (storage.readSync(historyPath) !== historySnapshot.raw) {
      continue;
    }
    commitCastingRegistryPair(
      castingDir,
      snapshot.raw,
      registry as unknown as Record<string, unknown>,
      historySnapshot.raw,
      history as unknown as Record<string, unknown>,
      registry.revision,
    );

    return;
  }
  throw new Error(
    `Casting registry changed during ${REGISTRY_UPDATE_MAX_ATTEMPTS} update attempts`,
  );
}

/**
 * Wire a preset's agents into team.md, routing.md, and casting state files.
 *
 * Call this after `applyPreset` has copied the agent charters. The function
 * is merge-friendly: it preserves existing rows, agents, and snapshots, and
 * only adds entries that aren't already present.
 */
export function scaffoldPresetIntoSquad(
  squadDir: string,
  agents: PresetAgent[],
  presetName: string,
  prepareOutputs?: () => PresetAgent[],
): void {
  const universe = `preset:${presetName}`;
  const castingDir = path.join(squadDir, 'casting');
  validatePresetCastingInputs(castingDir);
  storage.mkdirSync(castingDir, { recursive: true });
  const releaseLock = acquireCastingRegistryLock(castingDir, 'preset scaffold');
  const teamPath = path.join(squadDir, 'team.md');
  const routingPath = path.join(squadDir, 'routing.md');
  const policyPath = path.join(castingDir, 'policy.json');
  try {
    recoverCastingRegistryTransaction(castingDir);
    prepareCastingRegistryPairLocked(castingDir);
    validateCastingPolicy(path.join(castingDir, 'policy.json'));

    const wireableAgents = prepareOutputs?.() ?? agents;
    if (wireableAgents.length === 0) return;

    const originalTeam = storage.readSync(teamPath);
    const originalRouting = storage.readSync(routingPath);
    const originalPolicy = storage.readSync(policyPath);
    let writtenTeam = originalTeam;
    let writtenRouting = originalRouting;
    const writtenPolicy = originalPolicy ?? DEFAULT_POLICY_RAW;
    try {
      writtenTeam = writeOrMergeTeamMembers(squadDir, wireableAgents, presetName);
      writtenRouting = writeOrMergeRouting(squadDir, wireableAgents);
      writeOrMergeCastingState(squadDir, wireableAgents, { universe });
    } catch (error) {
      if (error instanceof CastingCommitInDoubtError) throw error;
      presetRegistryTestHooks?.beforeRollback?.();
      const affectedPaths = [
        restoreFileIfUnchanged(teamPath, originalTeam, writtenTeam),
        restoreFileIfUnchanged(routingPath, originalRouting, writtenRouting),
        restoreFileIfUnchanged(policyPath, originalPolicy, writtenPolicy),
      ].filter((entry): entry is CastingRecoveryPathState => entry !== undefined);
      if (affectedPaths.length > 0) {
        throw new CastingCommitInDoubtError(
          `Preset scaffold rollback is in doubt for ${affectedPaths.length} path(s)`,
          error,
          { affectedPaths },
        );
      }
      throw error;
    }
  } finally {
    releaseLock();
  }
}
