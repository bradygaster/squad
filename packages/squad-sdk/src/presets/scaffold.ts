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

import { closeSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { reconcileAgentProvenanceRegistry } from '../casting/agent-provenance.js';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { PresetAgent } from './types.js';

const storage = new FSStorageProvider();

const MEMBERS_HEADER = '## Members';
const ROUTING_HEADER = '## Work Type → Agent';
const REGISTRY_UPDATE_MAX_ATTEMPTS = 8;
const REGISTRY_LOCK_TIMEOUT_MS = 30_000;
const REGISTRY_LOCK_RETRY_MS = 25;
const REGISTRY_LOCK_STALE_MS = 5_000;
const LOCK_METADATA_VERSION = 1;
const CASTING_TRANSACTION_VERSION = 1;
const syncWaitBuffer = new Int32Array(new SharedArrayBuffer(4));
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
}

let presetRegistryTestHooks: PresetRegistryTestHooks | null = null;

/** @internal Test-only deterministic conflict/failure injection. */
export function _setPresetRegistryHooksForTesting(
  hooks: PresetRegistryTestHooks | null,
): void {
  presetRegistryTestHooks = hooks;
}

interface ScaffoldOptions {
  /** Universe tag for the casting registry. Defaults to `preset:<name>`. */
  universe: string;
}

function waitSync(milliseconds: number): void {
  if (presetRegistryTestHooks?.wait) {
    presetRegistryTestHooks.wait(milliseconds);
    return;
  }
  Atomics.wait(syncWaitBuffer, 0, 0, milliseconds);
}

interface CastingLockMetadata {
  version: 1;
  pid: number;
  hostname: string;
  created_at: string;
  owner_token: string;
}

function nowMilliseconds(): number {
  return presetRegistryTestHooks?.now?.() ?? Date.now();
}

function createOwnerToken(): string {
  return `${process.pid}-${nowMilliseconds()}-${Math.random().toString(16).slice(2)}`;
}

function parseCastingLockMetadata(raw: string | undefined): CastingLockMetadata | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CastingLockMetadata>;
    if (
      value.version !== LOCK_METADATA_VERSION
      || !Number.isSafeInteger(value.pid)
      || (value.pid ?? 0) <= 0
      || typeof value.hostname !== 'string'
      || value.hostname.length === 0
      || typeof value.created_at !== 'string'
      || !Number.isFinite(Date.parse(value.created_at))
      || typeof value.owner_token !== 'string'
      || value.owner_token.length === 0
    ) {
      return null;
    }
    return value as CastingLockMetadata;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean | undefined {
  if (presetRegistryTestHooks?.isProcessAlive) {
    return presetRegistryTestHooks.isProcessAlive(pid);
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return undefined;
  }
}

function tryRecoverStaleCastingLock(lockPath: string): boolean {
  const raw = storage.readSync(lockPath);
  const metadata = parseCastingLockMetadata(raw);
  if (!metadata || metadata.hostname !== hostname()) return false;

  const age = nowMilliseconds() - Date.parse(metadata.created_at);
  const staleAge = presetRegistryTestHooks?.staleLockAgeMs ?? REGISTRY_LOCK_STALE_MS;
  if (age < staleAge || isProcessAlive(metadata.pid) !== false) return false;

  if (storage.readSync(lockPath) !== raw) return false;
  const stalePath = `${lockPath}.stale-${createOwnerToken()}`;
  try {
    renameSync(lockPath, stalePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }

  const recoveredRaw = storage.readSync(stalePath);
  if (recoveredRaw !== raw) {
    if (!storage.existsSync(lockPath)) {
      renameSync(stalePath, lockPath);
    }
    return false;
  }
  storage.deleteSync(stalePath);
  return true;
}

function acquireCastingLock(lockPath: string): () => void {
  const ownerToken = createOwnerToken();
  const deadline = nowMilliseconds()
    + (presetRegistryTestHooks?.lockTimeoutMs ?? REGISTRY_LOCK_TIMEOUT_MS);
  while (true) {
    try {
      const descriptor = openSync(lockPath, 'wx');
      try {
        const metadata: CastingLockMetadata = {
          version: LOCK_METADATA_VERSION,
          pid: process.pid,
          hostname: hostname(),
          created_at: new Date(nowMilliseconds()).toISOString(),
          owner_token: ownerToken,
        };
        writeSync(descriptor, JSON.stringify(metadata) + '\n', undefined, 'utf8');
      } catch (error) {
        closeSync(descriptor);
        unlinkSync(lockPath);
        throw error;
      }
      return () => {
        try {
          closeSync(descriptor);
        } finally {
          const current = parseCastingLockMetadata(storage.readSync(lockPath));
          if (current?.owner_token !== ownerToken) return;
          try {
            unlinkSync(lockPath);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (tryRecoverStaleCastingLock(lockPath)) continue;
      if (nowMilliseconds() >= deadline) {
        throw new Error(`Timed out waiting for concurrent preset scaffold lock: ${lockPath}`);
      }
      waitSync(REGISTRY_LOCK_RETRY_MS);
    }
  }
}

interface CastingHistory {
  assignment_cast_snapshots: Record<string, {
    created_at: string;
    agents: string[];
    universe: string;
  }>;
  universe_usage_history: Array<{ universe: string; used_at: string }>;
}

function readCastingHistory(historyPath: string): { raw: string | undefined; value: CastingHistory } {
  const raw = storage.readSync(historyPath);
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

function readRegistrySnapshot(
  registryPath: string,
): { raw: string | undefined; value: unknown } {
  const raw = storage.readSync(registryPath);
  if (!raw?.trim()) return { raw, value: undefined };
  try {
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    throw new Error(
      `Cannot update malformed casting/registry.json: ${error instanceof Error ? error.message : String(error)}`,
    );
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

function atomicWriteJson(filePath: string, value: unknown): void {
  atomicWriteFile(
    filePath,
    JSON.stringify(value, null, 2) + '\n',
    'policy',
    filePath,
    0,
  );
}

interface CastingTransactionJournal {
  version: 1;
  registry: { previous: string | null; next: string };
  history: { previous: string | null; next: string };
}

function parseCastingTransactionJournal(
  journalPath: string,
): CastingTransactionJournal | null {
  const raw = storage.readSync(journalPath);
  if (raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw) as CastingTransactionJournal;
    if (
      parsed.version !== CASTING_TRANSACTION_VERSION
      || !parsed.registry
      || !parsed.history
      || (parsed.registry.previous !== null && typeof parsed.registry.previous !== 'string')
      || typeof parsed.registry.next !== 'string'
      || (parsed.history.previous !== null && typeof parsed.history.previous !== 'string')
      || typeof parsed.history.next !== 'string'
    ) {
      throw new Error('invalid transaction journal shape');
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Cannot recover malformed casting transaction journal: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function restoreTransactionFile(
  filePath: string,
  content: string | null,
  registryPath: string,
  stage: string,
): void {
  if (content === null) {
    storage.deleteSync(filePath);
    return;
  }
  atomicWriteFile(filePath, content, stage, registryPath, 0);
}

function recoverCastingTransaction(castingDir: string): void {
  const journalPath = path.join(castingDir, 'registry-history.transaction.json');
  const journal = parseCastingTransactionJournal(journalPath);
  if (!journal) return;

  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const registryRaw = storage.readSync(registryPath) ?? null;
  const historyRaw = storage.readSync(historyPath) ?? null;
  const isPrevious = registryRaw === journal.registry.previous
    && historyRaw === journal.history.previous;
  const isNext = registryRaw === journal.registry.next
    && historyRaw === journal.history.next;

  if (isPrevious || isNext) {
    storage.deleteSync(journalPath);
    return;
  }

  const registryKnown = registryRaw === journal.registry.previous
    || registryRaw === journal.registry.next;
  const historyKnown = historyRaw === journal.history.previous
    || historyRaw === journal.history.next;
  if (!registryKnown || !historyKnown) {
    throw new Error('Cannot recover casting transaction because a file changed outside the journal');
  }

  restoreTransactionFile(
    historyPath,
    journal.history.next,
    registryPath,
    'recovery-history',
  );
  restoreTransactionFile(
    registryPath,
    journal.registry.next,
    registryPath,
    'recovery-registry',
  );
  storage.deleteSync(journalPath);
}

function commitRegistryAndHistory(
  castingDir: string,
  registryRaw: string | undefined,
  nextRegistryRaw: string,
  historyRaw: string | undefined,
  nextHistoryRaw: string,
  attempt: number,
): void {
  const registryPath = path.join(castingDir, 'registry.json');
  const historyPath = path.join(castingDir, 'history.json');
  const journalPath = path.join(castingDir, 'registry-history.transaction.json');
  const journal: CastingTransactionJournal = {
    version: CASTING_TRANSACTION_VERSION,
    registry: { previous: registryRaw ?? null, next: nextRegistryRaw },
    history: { previous: historyRaw ?? null, next: nextHistoryRaw },
  };

  atomicWriteFile(
    journalPath,
    JSON.stringify(journal, null, 2) + '\n',
    'journal',
    registryPath,
    attempt,
  );
  try {
    atomicWriteFile(historyPath, nextHistoryRaw, 'history', registryPath, attempt);
    atomicWriteFile(registryPath, nextRegistryRaw, 'registry', registryPath, attempt);
    storage.deleteSync(journalPath);
  } catch (error) {
    try {
      restoreTransactionFile(
        historyPath,
        journal.history.previous,
        registryPath,
        'rollback-history',
      );
      restoreTransactionFile(
        registryPath,
        journal.registry.previous,
        registryPath,
        'rollback-registry',
      );
      storage.deleteSync(journalPath);
    } catch (rollbackError) {
      throw new Error(
        `Casting transaction failed (${String(error)}) and rollback requires recovery: ${String(rollbackError)}`,
      );
    }
    throw error;
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
function writeOrMergeTeamMembers(squadDir: string, agents: PresetAgent[], presetName: string): void {
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
    storage.writeSync(teamPath, fresh);
    return;
  }

  // team.md exists — merge into existing ## Members table
  const already = existingMemberNames(existing);
  const newRows = agents
    .filter(a => !already.has(a.name.toLowerCase()))
    .map(memberRow);
  if (newRows.length === 0) return; // nothing to do, all already present

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
    storage.writeSync(teamPath, existing.trimEnd() + '\n' + block);
    return;
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
    storage.writeSync(teamPath, updated);
    return;
  }

  // Append new rows after the last existing table row
  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = before + '\n' + newRows.join('\n') + (after ? '\n' + after : '\n');
  const updated = existing.slice(0, membersIdx) + newSection + existing.slice(sectionEnd);
  storage.writeSync(teamPath, updated);
}

/**
 * Write or update `.squad/routing.md` so it includes a `## Work Type → Agent`
 * table with the preset's agents. Existing rows are preserved; only new
 * primary agents are added. If routing.md does not exist, a minimal one is
 * created.
 */
function writeOrMergeRouting(squadDir: string, agents: PresetAgent[]): void {
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
    storage.writeSync(routingPath, fresh);
    return;
  }

  const already = existingRoutingAgents(existing);
  const newRows = agents
    .filter(a => !already.has(a.name.toLowerCase()))
    .map(routingRow);
  if (newRows.length === 0) return;

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
    storage.writeSync(routingPath, existing.trimEnd() + '\n' + block);
    return;
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
    storage.writeSync(routingPath, updated);
    return;
  }
  const before = sectionLines.slice(0, lastTableLineRel + 1).join('\n');
  const after = sectionLines.slice(lastTableLineRel + 1).join('\n');
  const newSection = before + '\n' + newRows.join('\n') + (after ? '\n' + after : '\n');
  const updated = existing.slice(0, headerIdx) + newSection + existing.slice(sectionEnd);
  storage.writeSync(routingPath, updated);
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
    atomicWriteJson(policyPath, { universe_allowlist: ['*'], max_capacity: 25 });
  }
  for (let attempt = 1; attempt <= REGISTRY_UPDATE_MAX_ATTEMPTS; attempt++) {
    const snapshot = readRegistrySnapshot(registryPath);
    const registry = reconcileAgentProvenanceRegistry(
      snapshot.value,
      candidates,
      { generatedAt: now, retireMissing: false },
    );
    const historySnapshot = readCastingHistory(historyPath);
    const history = structuredClone(historySnapshot.value);
    const snapshotKey = `preset-${options.universe}-revision-${registry.revision}-${now}`;
    history.assignment_cast_snapshots[snapshotKey] = {
      created_at: now,
      agents: agents.map(a => a.name.toLowerCase()),
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
    commitRegistryAndHistory(
      castingDir,
      snapshot.raw,
      JSON.stringify(registry, null, 2) + '\n',
      historySnapshot.raw,
      JSON.stringify(history, null, 2) + '\n',
      attempt,
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
  storage.mkdirSync(castingDir, { recursive: true });
  const releaseLock = acquireCastingLock(path.join(castingDir, 'registry.lock'));
  const teamPath = path.join(squadDir, 'team.md');
  const routingPath = path.join(squadDir, 'routing.md');
  const policyPath = path.join(castingDir, 'policy.json');
  try {
    recoverCastingTransaction(castingDir);
    readRegistrySnapshot(path.join(castingDir, 'registry.json'));
    readCastingHistory(path.join(castingDir, 'history.json'));
    validateCastingPolicy(path.join(castingDir, 'policy.json'));

    const wireableAgents = prepareOutputs?.() ?? agents;
    if (wireableAgents.length === 0) return;

    const originalTeam = storage.readSync(teamPath);
    const originalRouting = storage.readSync(routingPath);
    const originalPolicy = storage.readSync(policyPath);
    try {
      writeOrMergeTeamMembers(squadDir, wireableAgents, presetName);
      writeOrMergeRouting(squadDir, wireableAgents);
      writeOrMergeCastingState(squadDir, wireableAgents, { universe });
    } catch (error) {
      if (originalTeam === undefined) storage.deleteSync(teamPath);
      else storage.writeSync(teamPath, originalTeam);
      if (originalRouting === undefined) storage.deleteSync(routingPath);
      else storage.writeSync(routingPath, originalRouting);
      if (originalPolicy === undefined) storage.deleteSync(policyPath);
      else storage.writeSync(policyPath, originalPolicy);
      throw error;
    }
  } finally {
    releaseLock();
  }
}
