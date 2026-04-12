/**
 * Watch command — Ralph's standalone polling process.
 *
 * Thin orchestrator that delegates opt-in features to capabilities.
 * Core triage logic (runCheck, checkPRs) remains inline because it
 * always runs — it is not an opt-in capability.
 */

import path from 'node:path';
import fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
const execFileAsync = promisify(execFile);

import { detectSquadDir } from '../../core/detect-squad-dir.js';
import { fatal } from '../../core/errors.js';
import { GREEN, RED, DIM, BOLD, RESET, YELLOW } from '../../core/output.js';
import {
  parseRoutingRules,
  parseModuleOwnership,
  parseRoster,
  triageIssue,
  type TriageIssue,
} from '@bradygaster/squad-sdk/ralph/triage';
import { RalphMonitor } from '@bradygaster/squad-sdk/ralph';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';
import { ghAvailable, ghAuthenticated, ghRateLimitCheck, isRateLimitError } from '../../core/gh-cli.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';
import {
  PredictiveCircuitBreaker,
  getTrafficLight,
} from '@bradygaster/squad-sdk/ralph/rate-limiting';
import { createPlatformAdapter } from '@bradygaster/squad-sdk/platform';
import type { PlatformAdapter, WorkItem, PullRequest as SdkPullRequest } from '@bradygaster/squad-sdk/platform';

import type { WatchConfig } from './config.js';
import type { WatchCapability, WatchContext, WatchPhase, CapabilityResult } from './types.js';
import { CapabilityRegistry } from './registry.js';
import { createDefaultRegistry } from './capabilities/index.js';
import { createVerboseLogger, type VerboseLogger } from './verbose.js';

// ── Re-exports for backward compatibility ────────────────────────

export type { WatchConfig } from './config.js';
export { loadWatchConfig } from './config.js';
export type { WatchCapability, WatchContext, WatchPhase, PreflightResult, CapabilityResult } from './types.js';
export { CapabilityRegistry } from './registry.js';
export { createDefaultRegistry } from './capabilities/index.js';
export { createVerboseLogger, type VerboseLogger } from './verbose.js';
export { loadExternalCapabilities } from './external-loader.js';
export { PidTracker, type TrackedProcess } from './pid-tracker.js';
export { getWatchHealth, writePidFile, removePidFile, getPidPath, isProcessAlive, type WatchPidInfo } from './health.js';

// ── Watch Platform Abstraction ───────────────────────────────────

/** Normalized work item for watch operations. */
export interface WatchWorkItem {
  number: number;
  title: string;
  body?: string;
  labels: Array<{ name: string }>;
  assignees: Array<{ login: string }>;
}

/** Normalized pull request for watch operations. */
export interface WatchPullRequest {
  number: number;
  title: string;
  author: { login: string };
  labels: Array<{ name: string }>;
  isDraft: boolean;
  reviewDecision: string;
  state: string;
  headRefName: string;
  statusCheckRollup: Array<{ state: string; name: string }>;
}

// ── SDK Mapping Helpers ──────────────────────────────────────────

function toWatchWorkItem(wi: WorkItem): WatchWorkItem {
  return {
    number: wi.id,
    title: wi.title,
    labels: wi.tags.map(t => ({ name: t })),
    assignees: wi.assignedTo ? [{ login: wi.assignedTo }] : [],
  };
}

function toWatchPullRequest(pr: SdkPullRequest): WatchPullRequest {
  return {
    number: pr.id,
    title: pr.title,
    author: { login: pr.author },
    labels: [],
    isDraft: pr.status === 'draft',
    reviewDecision: pr.reviewStatus === 'approved' ? 'APPROVED'
      : pr.reviewStatus === 'changes-requested' ? 'CHANGES_REQUESTED'
      : pr.reviewStatus === 'pending' ? 'REVIEW_REQUIRED' : '',
    state: pr.status === 'active' ? 'OPEN'
      : pr.status === 'completed' ? 'MERGED'
      : pr.status === 'abandoned' ? 'CLOSED' : 'OPEN',
    headRefName: pr.sourceBranch,
    statusCheckRollup: [],
  };
}

async function listWatchWorkItems(
  adapter: PlatformAdapter,
  options: { label?: string; state?: string; limit?: number },
): Promise<WatchWorkItem[]> {
  const tags = options.label ? [options.label] : undefined;
  const items = await adapter.listWorkItems({ tags, state: options.state, limit: options.limit });
  return items.map(toWatchWorkItem);
}

async function listWatchPullRequests(
  adapter: PlatformAdapter,
  options: { state?: string; limit?: number },
): Promise<WatchPullRequest[]> {
  let status: string | undefined;
  if (options.state === 'open') status = 'active';
  else if (options.state === 'closed') status = 'abandoned';
  else if (options.state === 'merged') status = 'completed';
  else status = options.state;
  const prs = await adapter.listPullRequests({ status, limit: options.limit });
  return prs.map(toWatchPullRequest);
}

async function editWorkItem(
  adapter: PlatformAdapter,
  id: number,
  options: { addLabel?: string; removeLabel?: string; addAssignee?: string; removeAssignee?: string },
): Promise<void> {
  if (options.addLabel) await adapter.addTag(id, options.addLabel);
  if (options.removeLabel) await adapter.removeTag(id, options.removeLabel);
  if (options.addAssignee) {
    if (adapter.type === 'github') {
      try {
        await execFileAsync('gh', ['issue', 'edit', String(id), '--add-assignee', options.addAssignee]);
      } catch { /* best-effort */ }
    } else if (adapter.type === 'azure-devops') {
      const assignee = options.addAssignee === '@me' ? '' : options.addAssignee;
      if (assignee) {
        try {
          execFileSync('az', [
            'boards', 'work-item', 'update',
            '--id', String(id),
            '--fields', `System.AssignedTo=${assignee}`,
            '--output', 'json',
          ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch { /* best-effort */ }
      }
    }
  }
}

// ── Board State ──────────────────────────────────────────────────

export interface BoardState {
  untriaged: number;
  assigned: number;
  drafts: number;
  needsReview: number;
  changesRequested: number;
  ciFailures: number;
  readyToMerge: number;
  executed: number;
}

/** Outcome of a runCheck call — wraps BoardState with scan status. */
export type RunCheckStatus = 'ok' | 'rate-limited' | 'error';

export interface RunCheckResult {
  state: BoardState;
  status: RunCheckStatus;
}

export interface ReportBoardOptions {
  notifyLevel?: 'all' | 'important' | 'none';
  machineName?: string;
  repoName?: string;
  /** When set, overrides the "Board is clear" message for failed scans. */
  scanStatus?: RunCheckStatus;
}

export function reportBoard(state: BoardState, round: number, options?: ReportBoardOptions): void {
  const level = options?.notifyLevel ?? 'all';
  const total = Object.values(state).reduce((a, b) => a + b, 0);
  const scanStatus = options?.scanStatus ?? 'ok';

  // Rate-limit / error warnings always print (bypass notifyLevel suppression)
  if (total === 0 && scanStatus === 'rate-limited') {
    console.log(`${YELLOW}⚠ API rate limited — skipping this round (retry in next interval)${RESET}`);
    return;
  }
  if (total === 0 && scanStatus === 'error') {
    console.log(`${YELLOW}⚠ Board scan failed — skipping this round (retry in next interval)${RESET}`);
    return;
  }

  if (level === 'none') return;
  if (level === 'important' && total === 0) return;

  if (total === 0) {
    console.log(`${DIM}📋 Board is clear — Ralph is idling${RESET}`);
    return;
  }
  const suffix = options?.machineName || options?.repoName
    ? ` (${[options.machineName, options.repoName].filter(Boolean).join(' · ')})`
    : '';
  console.log(`\n${BOLD}🔄 Ralph — Round ${round}${suffix}${RESET}`);
  console.log('━'.repeat(30));
  if (state.untriaged > 0) console.log(`  🔴 Untriaged:         ${state.untriaged}`);
  if (state.assigned > 0) console.log(`  🟡 Assigned:          ${state.assigned}`);
  if (state.drafts > 0) console.log(`  🟡 Draft PRs:         ${state.drafts}`);
  if (state.changesRequested > 0) console.log(`  ⚠️  Changes requested: ${state.changesRequested}`);
  if (state.ciFailures > 0) console.log(`  ❌ CI failures:       ${state.ciFailures}`);
  if (state.needsReview > 0) console.log(`  🔵 Needs review:      ${state.needsReview}`);
  if (state.readyToMerge > 0) console.log(`  🟢 Ready to merge:    ${state.readyToMerge}`);
  if (state.executed > 0) console.log(`  🚀 Executed:          ${state.executed}`);
  console.log();
}

function emptyBoardState(): BoardState {
  return { untriaged: 0, assigned: 0, drafts: 0, needsReview: 0, changesRequested: 0, ciFailures: 0, readyToMerge: 0, executed: 0 };
}

// ── PR Checking ──────────────────────────────────────────────────

type PRBoardState = Pick<BoardState, 'drafts' | 'needsReview' | 'changesRequested' | 'ciFailures' | 'readyToMerge'> & {
  totalOpen: number;
};

async function checkPRs(roster: ReturnType<typeof parseRoster>, adapter: PlatformAdapter, vlog?: VerboseLogger): Promise<PRBoardState> {
  const timestamp = new Date().toLocaleTimeString();
  const prs = await listWatchPullRequests(adapter, { state: 'open', limit: 20 });
  const squadPRs = prs.filter(pr =>
    pr.labels.some(l => l.name.startsWith('squad')) || pr.headRefName.startsWith('squad/'),
  );

  vlog?.log(`PRs found: ${prs.length} total`);
  for (const pr of squadPRs) {
    vlog?.log(`  PR #${pr.number}: "${pr.title}" draft=${pr.isDraft} review=${pr.reviewDecision ?? 'none'}`);
  }

  if (squadPRs.length === 0) {
    return { drafts: 0, needsReview: 0, changesRequested: 0, ciFailures: 0, readyToMerge: 0, totalOpen: 0 };
  }

  const drafts = squadPRs.filter(pr => pr.isDraft);
  const changesRequested = squadPRs.filter(pr => pr.reviewDecision === 'CHANGES_REQUESTED');
  const approved = squadPRs.filter(pr => pr.reviewDecision === 'APPROVED' && !pr.isDraft);
  const ciFailures = squadPRs.filter(pr =>
    pr.statusCheckRollup?.some(check => check.state === 'FAILURE' || check.state === 'ERROR'),
  );
  const readyToMerge = approved.filter(pr =>
    !pr.statusCheckRollup?.some(c => c.state === 'FAILURE' || c.state === 'ERROR' || c.state === 'PENDING'),
  );
  const changesRequestedSet = new Set(changesRequested.map(pr => pr.number));
  const ciFailureSet = new Set(ciFailures.map(pr => pr.number));
  const readyToMergeSet = new Set(readyToMerge.map(pr => pr.number));
  const needsReview = squadPRs.filter(pr =>
    !pr.isDraft && !changesRequestedSet.has(pr.number) && !ciFailureSet.has(pr.number) && !readyToMergeSet.has(pr.number),
  );

  const memberNames = new Set(roster.map(m => m.name.toLowerCase()));

  if (drafts.length > 0) {
    console.log(`${DIM}[${timestamp}]${RESET} 🟡 ${drafts.length} draft PR(s) in progress`);
    for (const pr of drafts) console.log(`  ${DIM}PR #${pr.number}: ${pr.title} (${pr.author.login})${RESET}`);
  }
  if (changesRequested.length > 0) {
    console.log(`${YELLOW}[${timestamp}]${RESET} ⚠️ ${changesRequested.length} PR(s) need revision`);
    for (const pr of changesRequested) {
      const owner = memberNames.has(pr.author.login.toLowerCase()) ? ` — ${pr.author.login}` : '';
      console.log(`  PR #${pr.number}: ${pr.title} — changes requested${owner}`);
    }
  }
  if (ciFailures.length > 0) {
    console.log(`${RED}[${timestamp}]${RESET} ❌ ${ciFailures.length} PR(s) with CI failures`);
    for (const pr of ciFailures) {
      const failedChecks = pr.statusCheckRollup?.filter(c => c.state === 'FAILURE' || c.state === 'ERROR') || [];
      const owner = memberNames.has(pr.author.login.toLowerCase()) ? ` — ${pr.author.login}` : '';
      console.log(`  PR #${pr.number}: ${pr.title}${owner} — ${failedChecks.map(c => c.name).join(', ')}`);
    }
  }
  if (readyToMerge.length > 0) {
    console.log(`${GREEN}[${timestamp}]${RESET} 🟢 ${readyToMerge.length} PR(s) ready to merge`);
    for (const pr of readyToMerge) console.log(`  PR #${pr.number}: ${pr.title} — approved, CI green`);
  }

  return {
    drafts: drafts.length,
    needsReview: needsReview.length,
    changesRequested: changesRequestedSet.size,
    ciFailures: ciFailureSet.size,
    readyToMerge: readyToMergeSet.size,
    totalOpen: squadPRs.length,
  };
}

// ── Core triage (always runs) ────────────────────────────────────

const BLOCKED_LABELS: ReadonlySet<string> = new Set([
  'status:blocked', 'status:waiting-external', 'status:postponed',
  'status:scheduled', 'status:needs-action', 'status:needs-decision',
  'status:needs-review', 'pending-user', 'do-not-merge',
]);

async function runCheck(
  rules: ReturnType<typeof parseRoutingRules>,
  modules: ReturnType<typeof parseModuleOwnership>,
  roster: ReturnType<typeof parseRoster>,
  hasCopilot: boolean,
  autoAssign: boolean,
  capabilities: MachineCapabilities | null,
  adapter: PlatformAdapter,
  vlog?: VerboseLogger,
): Promise<RunCheckResult> {
  const timestamp = new Date().toLocaleTimeString();
  try {
    const issues = await listWatchWorkItems(adapter, { label: 'squad', state: 'open', limit: 20 });

    vlog?.log(`Issues found: ${issues.length} total`);
    for (const issue of issues) {
      const labels = issue.labels?.map((l: { name: string }) => l.name).join(', ') ?? 'none';
      const assignees = issue.assignees?.map((a: { login: string }) => a.login).join(', ') ?? 'none';
      vlog?.log(`  #${issue.number}: "${issue.title}" [${labels}] assignees=[${assignees}]`);
    }

    const { filterByCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
    const { handled: capableIssues, skipped: incapableIssues } = filterByCapabilities(issues, capabilities);

    for (const { issue, missing } of incapableIssues) {
      console.log(`${DIM}[${timestamp}] ⏭️ Skipping #${issue.number} "${issue.title}" — missing: ${missing.join(', ')}${RESET}`);
    }

    const memberLabels = roster.map(m => m.label);
    const untriaged = capableIssues.filter(issue => {
      const issueLabels = issue.labels.map(l => l.name);
      return !memberLabels.some(ml => issueLabels.includes(ml));
    });
    const assignedIssues = capableIssues.filter(issue => {
      const issueLabels = issue.labels.map(l => l.name);
      return memberLabels.some(ml => issueLabels.includes(ml));
    });

    let unassignedCopilot: WatchWorkItem[] = [];
    if (hasCopilot && autoAssign) {
      try {
        const copilotIssues = await listWatchWorkItems(adapter, { label: 'squad:copilot', state: 'open', limit: 10 });
        unassignedCopilot = copilotIssues.filter(i => !i.assignees || i.assignees.length === 0);
      } catch { /* label may not exist */ }
    }

    for (const issue of untriaged) {
      const triageInput: TriageIssue = {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: issue.labels.map(l => l.name),
      };
      const triage = triageIssue(triageInput, rules, modules, roster);
      if (triage) {
        try {
          await editWorkItem(adapter, issue.number, { addLabel: triage.agent.label });
          console.log(`${GREEN}✓${RESET} [${timestamp}] Triaged #${issue.number} "${issue.title}" → ${triage.agent.name} (${triage.reason})`);
        } catch (e) {
          console.error(`${RED}✗${RESET} [${timestamp}] Failed to label #${issue.number}: ${(e as Error).message}`);
        }
      }
    }

    for (const issue of unassignedCopilot) {
      try {
        await editWorkItem(adapter, issue.number, { addAssignee: 'copilot-swe-agent' });
        console.log(`${GREEN}✓${RESET} [${timestamp}] Assigned @copilot to #${issue.number} "${issue.title}"`);
      } catch (e) {
        console.error(`${RED}✗${RESET} [${timestamp}] Failed to assign @copilot to #${issue.number}: ${(e as Error).message}`);
      }
    }

    const prState = await checkPRs(roster, adapter, vlog);
    return { state: { untriaged: untriaged.length, assigned: assignedIssues.length, executed: 0, ...prState }, status: 'ok' };
  } catch (e) {
    const err = e as Error;
    const limited = isRateLimitError(err);
    if (limited) {
      console.log(`${YELLOW}⚠${RESET} [${timestamp}] API rate limited — board scan skipped`);
    } else {
      console.error(`${RED}✗${RESET} [${timestamp}] Check failed: ${err.message}`);
    }
    return { state: emptyBoardState(), status: limited ? 'rate-limited' : 'error' };
  }
}

// ── SubSquad Discovery ───────────────────────────────────────────

interface SubSquad { name: string; dir: string; labels: string[] }

function discoverSubSquads(teamRoot: string): SubSquad[] {
  const subsquadDir = path.join(teamRoot, '.squad', 'subsquads');
  if (!storage.existsSync(subsquadDir)) return [];
  try {
    const entries = storage.listSync?.(subsquadDir) ?? [];
    const dirs = Array.isArray(entries) ? entries : [];
    const squads: SubSquad[] = [];
    for (const entry of dirs) {
      const entryPath = path.join(subsquadDir, entry);
      const teamMdPath = path.join(entryPath, 'team.md');
      if (!storage.existsSync(teamMdPath)) continue;
      const routingPath = path.join(entryPath, 'routing.md');
      let labels: string[] = [];
      if (storage.existsSync(routingPath)) {
        try {
          const content = storage.readSync(routingPath) ?? '';
          const labelMatches = content.match(/label[s]?:\s*([^\n]+)/gi);
          if (labelMatches) {
            labels = labelMatches
              .flatMap((m: string) => m.replace(/labels?:\s*/i, '').split(','))
              .map((l: string) => l.trim())
              .filter(Boolean);
          }
        } catch { /* best-effort */ }
      }
      squads.push({ name: entry, dir: entryPath, labels });
    }
    return squads;
  } catch { return []; }
}

// ── Circuit Breaker State (#515) ─────────────────────────────────

interface CircuitBreakerState {
  status: 'closed' | 'open' | 'half-open';
  openedAt: string | null;
  cooldownMinutes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastRateLimitRemaining: number | null;
  lastRateLimitTotal: number | null;
}

function defaultCBState(): CircuitBreakerState {
  return {
    status: 'closed', openedAt: null, cooldownMinutes: 2,
    consecutiveFailures: 0, consecutiveSuccesses: 0,
    lastRateLimitRemaining: null, lastRateLimitTotal: null,
  };
}

function loadCBState(squadDir: string): CircuitBreakerState {
  const filePath = path.join(squadDir, 'ralph-circuit-breaker.json');
  try {
    const raw = storage.readSync(filePath);
    if (!raw) return defaultCBState();
    return JSON.parse(raw);
  } catch { return defaultCBState(); }
}

function saveCBState(squadDir: string, state: CircuitBreakerState): void {
  storage.writeSync(
    path.join(squadDir, 'ralph-circuit-breaker.json'),
    JSON.stringify(state, null, 2),
  );
}

// ── Capability Phase Runner ──────────────────────────────────────

async function runPhase(
  phase: WatchPhase,
  enabled: WatchCapability[],
  context: WatchContext,
  config: WatchConfig,
): Promise<Map<string, CapabilityResult>> {
  const results = new Map<string, CapabilityResult>();
  const phaseCapabilities = enabled.filter(c => c.phase === phase);
  const ts = new Date().toLocaleTimeString();

  for (const cap of phaseCapabilities) {
    try {
      const capConfig = config.capabilities[cap.name];
      const capContext: WatchContext = {
        ...context,
        config: typeof capConfig === 'object' && capConfig !== null
          ? capConfig as Record<string, unknown>
          : { enabled: !!capConfig, maxConcurrent: config.maxConcurrent, timeout: config.timeout, dispatchMode: config.dispatchMode },
      };
      const result = await cap.execute(capContext);
      results.set(cap.name, result);
      if (!result.success) {
        console.log(`${YELLOW}⚠${RESET} [${ts}] ${cap.name}: ${result.summary}`);
      }
    } catch (e) {
      const result: CapabilityResult = { success: false, summary: `${cap.name} crashed: ${(e as Error).message}` };
      results.set(cap.name, result);
      console.log(`${YELLOW}⚠${RESET} [${ts}] ${cap.name}: ${result.summary}`);
    }
  }

  return results;
}

/** Preflight all capabilities, return only those that pass. */
async function preflightCapabilities(
  registry: CapabilityRegistry,
  config: WatchConfig,
  context: WatchContext,
): Promise<WatchCapability[]> {
  const enabled: WatchCapability[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const cap of registry.all()) {
    // Check if this capability is enabled in config
    const capConfig = config.capabilities[cap.name];
    if (!capConfig) continue;

    const capContext: WatchContext = {
      ...context,
      config: typeof capConfig === 'object' && capConfig !== null
        ? capConfig as Record<string, unknown>
        : {},
    };

    try {
      const result = await cap.preflight(capContext);
      if (result.ok) {
        enabled.push(cap);
      } else {
        skipped.push({ name: cap.name, reason: result.reason ?? 'preflight failed' });
      }
    } catch (e) {
      skipped.push({ name: cap.name, reason: (e as Error).message });
    }
  }

  // Print startup banner
  if (enabled.length > 0) {
    console.log(`${GREEN}✅${RESET} Capabilities: ${enabled.map(c => c.name).join(', ')}`);
  }
  if (skipped.length > 0) {
    for (const s of skipped) {
      console.log(`${YELLOW}⚠️${RESET}  ${s.name} skipped: ${s.reason}`);
    }
  }

  return enabled;
}

// ── Backward-compatible WatchOptions type ────────────────────────

/**
 * Legacy WatchOptions type — still accepted by runWatch for backward
 * compatibility.  New code should use {@link WatchConfig} instead.
 */
export interface WatchOptions {
  intervalMinutes: number;
  execute?: boolean;
  copilotFlags?: string;
  agentCmd?: string;
  maxConcurrent?: number;
  issueTimeoutMinutes?: number;
  monitorTeams?: boolean;
  monitorEmail?: boolean;
  board?: boolean;
  boardProject?: number;
  twoPass?: boolean;
  waveDispatch?: boolean;
  retro?: boolean;
  decisionHygiene?: boolean;
  channelRouting?: boolean;
}

/** Convert legacy WatchOptions to WatchConfig. */
function legacyToConfig(options: WatchOptions): WatchConfig {
  const capabilities: Record<string, boolean | Record<string, unknown>> = {};
  if (options.execute) capabilities['execute'] = true;
  if (options.monitorTeams) capabilities['monitor-teams'] = true;
  if (options.monitorEmail) capabilities['monitor-email'] = true;
  if (options.board) capabilities['board'] = { projectNumber: options.boardProject ?? 1 };
  if (options.twoPass) capabilities['two-pass'] = true;
  if (options.waveDispatch) capabilities['wave-dispatch'] = true;
  if (options.retro) capabilities['retro'] = true;
  if (options.decisionHygiene) capabilities['decision-hygiene'] = true;

  return {
    interval: options.intervalMinutes,
    execute: options.execute ?? false,
    maxConcurrent: options.maxConcurrent ?? 1,
    timeout: options.issueTimeoutMinutes ?? 30,
    copilotFlags: options.copilotFlags,
    agentCmd: options.agentCmd,
    capabilities,
  };
}

// ── Exported helpers (backward compat) ───────────────────────────

export { findExecutableIssues, classifyIssue } from './capabilities/execute.js';

export function buildAgentCommand(
  issue: WatchWorkItem,
  teamRoot: string,
  options: WatchOptions,
): { cmd: string; args: string[] } {
  const prompt = `Work on issue #${issue.number}: ${issue.title}. Read the issue body for full details.`;
  if (options.agentCmd) {
    const parts = options.agentCmd.trim().split(/\s+/);
    return { cmd: parts[0]!, args: [...parts.slice(1), '--message', prompt] };
  }
  const args = ['copilot', '--message', prompt];
  if (options.copilotFlags) args.push(...options.copilotFlags.trim().split(/\s+/));
  return { cmd: 'gh', args };
}

export async function selfPull(teamRoot: string): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('git', ['fetch', '--quiet'], { cwd: teamRoot }, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      execFile('git', ['pull', '--ff-only', '--quiet'], { cwd: teamRoot }, (err) => (err ? reject(err) : resolve()));
    });
  } catch {
    console.log(`${DIM}⚠ selfPull: git pull skipped (not on a tracking branch or conflicts)${RESET}`);
  }
}

export async function executeIssue(
  issue: WatchWorkItem,
  teamRoot: string,
  options: WatchOptions,
  adapter: PlatformAdapter,
): Promise<{ success: boolean; error?: string }> {
  const ts = new Date().toLocaleTimeString();
  const timeoutMs = (options.issueTimeoutMinutes ?? 30) * 60_000;
  try { await editWorkItem(adapter, issue.number, { addAssignee: '@me' }); } catch { /* best-effort */ }
  try { await adapter.addComment(issue.number, '🤖 Ralph: starting autonomous work on this issue.'); } catch { /* best-effort */ }
  const { cmd, args } = buildAgentCommand(issue, teamRoot, options);
  console.log(`${GREEN}▶${RESET} [${ts}] Executing #${issue.number} "${issue.title}" → ${cmd} ${args.join(' ')}`);
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: teamRoot, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 }, (err) => {
      if (err) {
        const execErr = err as Error & { killed?: boolean };
        const msg = execErr.killed ? `Timed out after ${options.issueTimeoutMinutes ?? 30}m` : execErr.message;
        console.error(`${RED}✗${RESET} [${new Date().toLocaleTimeString()}] #${issue.number} failed: ${msg}`);
        resolve({ success: false, error: msg });
      } else {
        console.log(`${GREEN}✓${RESET} [${new Date().toLocaleTimeString()}] #${issue.number} completed`);
        resolve({ success: true });
      }
    });
  });
}

// ── Main Entry Point ─────────────────────────────────────────────

/**
 * Run watch command — Ralph's local polling process.
 *
 * Accepts either the new {@link WatchConfig} or the legacy
 * {@link WatchOptions} bag for backward compatibility.
 */
export async function runWatch(dest: string, options: WatchOptions | WatchConfig): Promise<void> {
  // Normalize to WatchConfig
  const config: WatchConfig = 'intervalMinutes' in options
    ? legacyToConfig(options as WatchOptions)
    : options as WatchConfig;

  const { interval } = config;

  if (isNaN(interval) || interval < 1) {
    fatal('--interval must be a positive number of minutes');
  }

  // Detect squad directory
  const squadDirInfo = detectSquadDir(dest);
  const teamMd = path.join(squadDirInfo.path, 'team.md');
  const routingMdPath = path.join(squadDirInfo.path, 'routing.md');
  const teamRoot = path.dirname(squadDirInfo.path);

  if (!storage.existsSync(teamMd)) {
    fatal('No squad found — run init first.');
  }

  // Create platform adapter
  let adapter: PlatformAdapter;
  try {
    adapter = createPlatformAdapter(teamRoot);
    console.log(`${DIM}Platform: ${adapter.type}${RESET}`);
  } catch (err) {
    return fatal(`Could not detect platform: ${(err as Error).message}`);
  }

  // Verbose logger
  const vlog = createVerboseLogger(config.verbose ?? false);

  vlog.section('Startup');
  vlog.table({
    repo: teamRoot,
    platform: adapter.type,
    // This table only prints when verbose mode is active, so verbose is always true here.
    verbose: config.verbose ?? false,
    interval: `${config.interval}m`,
    execute: config.execute ?? false,
    agentCmd: config.agentCmd ?? '(default: gh copilot)',
    dispatchMode: config.capabilities['wave-dispatch'] ? 'wave' : 'task',
    maxConcurrent: config.maxConcurrent ?? 1,
  });

  // Auth check (verbose only — avoid unnecessary process spawn on every startup)
  if (config.verbose && adapter.type === 'github') {
    try {
      const authOut = execFileSync('gh', ['auth', 'status'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      const activeAccount = authOut.match(/Logged in to .* account (\S+)/)?.[1];
      vlog.log(`Auth: ${activeAccount ?? 'unknown'}`);
    } catch {
      vlog.warn('gh auth status failed — API calls may fail silently');
    }
  }

  // Verify platform CLI availability
  if (adapter.type === 'github') {
    if (!(await ghAvailable())) fatal('gh CLI not found — install from https://cli.github.com');
    if (!(await ghAuthenticated())) fatal('gh CLI not authenticated — run: gh auth login');
  } else if (adapter.type === 'azure-devops') {
    try { await execFileAsync('az', ['devops', '-h']); } catch { fatal('az CLI not found'); }
    try { await execFileAsync('az', ['account', 'show']); } catch { fatal('az CLI not authenticated — run: az login'); }
  }

  // Parse team.md
  const content = storage.readSync(teamMd) ?? '';
  const roster = parseRoster(content);
  const routingContent = storage.existsSync(routingMdPath) ? (storage.readSync(routingMdPath) ?? '') : '';
  const rules = parseRoutingRules(routingContent);
  const modules = parseModuleOwnership(routingContent);

  // Load machine capabilities (#514)
  const { loadCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
  const capabilities = await loadCapabilities(teamRoot);
  if (capabilities) {
    console.log(`${DIM}📦 Machine: ${capabilities.machine} — ${capabilities.capabilities.length} capabilities loaded${RESET}`);
  }

  if (roster.length === 0) {
    fatal('No squad members found in team.md');
  }

  // Pre-create squad member labels so addTag never fails on missing labels
  if (adapter.ensureTag) {
    for (const member of roster) {
      try {
        await adapter.ensureTag(member.label, { color: 'd4c5f9', description: `Squad triage: ${member.name}` });
      } catch { /* best-effort — continue if label creation fails */ }
    }
    try {
      await adapter.ensureTag('squad:copilot', { color: 'd4c5f9', description: 'Squad triage: Copilot coding agent' });
    } catch { /* best-effort */ }
    console.log(`${DIM}Labels: ensured ${roster.length + 1} squad labels exist${RESET}`);
  }

  const hasCopilot = content.includes('🤖 Coding Agent') || content.includes('@copilot');
  const autoAssign = content.includes('<!-- copilot-auto-assign: true -->');
  const monitorSessionId = 'ralph-watch';
  const eventBus = new EventBus();
  const monitor = new RalphMonitor({
    teamRoot,
    healthCheckInterval: interval * 60 * 1000,
    staleSessionThreshold: interval * 60 * 1000 * 3,
    statePath: path.join(squadDirInfo.path, '.ralph-state.json'),
  });
  await monitor.start(eventBus);
  await eventBus.emit({
    type: 'session:created', sessionId: monitorSessionId,
    agentName: 'Ralph', payload: { interval }, timestamp: new Date(),
  });

  // ── Capability system setup ────────────────────────────────────
  const registry = createDefaultRegistry();

  // Load external capabilities from .squad/capabilities/
  const { loadExternalCapabilities } = await import('./external-loader.js');
  await loadExternalCapabilities(teamRoot, registry);

  // PID tracking for child process cleanup
  const { PidTracker } = await import('./pid-tracker.js');
  const pidTracker = new PidTracker(teamRoot);

  // Clean up orphans from previous crashed run
  const staleKilled = pidTracker.cleanupStale();
  if (staleKilled > 0) {
    console.log(`${YELLOW}⚠️ Cleaned up ${staleKilled} orphaned process(es) from previous run${RESET}`);
  }

  // Register exit handlers for graceful cleanup
  pidTracker.registerExitHandlers();

  const baseContext: WatchContext = {
    teamRoot,
    adapter,
    round: 0,
    roster: roster.map(r => ({ name: r.name, label: r.label, expertise: [] as string[] })),
    config: {},
    agentCmd: config.agentCmd,
    copilotFlags: config.copilotFlags,
    verbose: config.verbose,
    pidTracker,
  };

  const enabledCapabilities = await preflightCapabilities(registry, config, baseContext);

  // Print startup banner
  const modeTag = config.execute ? ` ${BOLD}(Execute)${RESET}` : '';
  const platformTag = ` [${adapter.type}]`;
  console.log(`\n${BOLD}🔄 Ralph — Watch Mode${RESET}${modeTag}${platformTag}`);
  console.log(`${DIM}Polling every ${interval} minute(s) for squad work. Ctrl+C to stop.${RESET}`);
  if (config.execute && config.copilotFlags) {
    console.log(`${DIM}Copilot flags: ${config.copilotFlags}${RESET}`);
  }
  if (config.execute) {
    console.log(`${DIM}Max concurrent: ${config.maxConcurrent} | Timeout: ${config.timeout}m${RESET}`);
  }
  // Warn when fleet dispatch mode is set but the fleet-dispatch capability is not enabled
  if ((config.dispatchMode === 'fleet' || config.dispatchMode === 'hybrid') &&
      !enabledCapabilities.some(c => c.name === 'fleet-dispatch')) {
    console.warn(`${YELLOW}⚠${RESET}  dispatchMode="${config.dispatchMode}" but fleet-dispatch capability is not enabled. Read-heavy issues will not be batched.`);
  }
  console.log();

  // Fix 2: Set up log-file tee (after banner so the banner itself is captured too)
  let logStream: fs.WriteStream | undefined;
  if (config.logFile) {
    const resolvedLogFile = path.resolve(config.logFile);
    logStream = fs.createWriteStream(resolvedLogFile, { flags: 'a' });
    const origLog = console.log.bind(console);
    console.log = (...args: unknown[]) => {
      origLog(...args);
      const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const line = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
      // Strip ANSI escape codes for the file
      const plain = line.replace(/\x1b\[[0-9;]*m/g, '');
      logStream!.write(`[${timestamp}] ${plain}\n`);
    };
    console.log(`${DIM}Log file: ${resolvedLogFile}${RESET}`);
  }

  // Fix 3: Immediate visual feedback after banner
  console.log(`Running first check now...`);

  // Initialize circuit breaker (#515)
  const circuitBreaker = new PredictiveCircuitBreaker();
  let cbState = loadCBState(squadDirInfo.path);
  let round = 0;
  let roundInProgress = false;

  async function executeRound(): Promise<void> {
    const ts = new Date().toLocaleTimeString();
    const roundStart = Date.now();

    // Circuit breaker gate
    if (cbState.status === 'open') {
      const elapsed = Date.now() - new Date(cbState.openedAt!).getTime();
      if (elapsed < cbState.cooldownMinutes * 60_000) {
        const left = Math.ceil((cbState.cooldownMinutes * 60_000 - elapsed) / 1000);
        console.log(`${YELLOW}⏸${RESET}  [${ts}] Circuit open — cooling down (${left}s left)`);
        return;
      }
      cbState.status = 'half-open';
      console.log(`${DIM}[${ts}] Circuit half-open — probing...${RESET}`);
      saveCBState(squadDirInfo.path, cbState);
    }

    // Rate limit check (GitHub only)
    if (adapter.type === 'github') {
      try {
        const rl = await ghRateLimitCheck();
        if (rl) {
          cbState.lastRateLimitRemaining = rl.remaining;
          cbState.lastRateLimitTotal = rl.limit;
          circuitBreaker.addSample(rl.remaining, rl.limit);
          const light = getTrafficLight(rl.remaining, rl.limit);
          if (light === 'red' || circuitBreaker.shouldOpen()) {
            cbState.status = 'open';
            cbState.openedAt = new Date().toISOString();
            cbState.consecutiveFailures++;
            cbState.consecutiveSuccesses = 0;
            cbState.cooldownMinutes = Math.min(cbState.cooldownMinutes * 2, 30);
            saveCBState(squadDirInfo.path, cbState);
            console.log(`${RED}🛑${RESET} [${ts}] Circuit opened — quota ${light === 'red' ? 'critical' : 'predicted low'} (${rl.remaining}/${rl.limit})`);
            return;
          }
          if (light === 'amber') {
            console.log(`${YELLOW}⚠️${RESET}  [${ts}] Quota amber (${rl.remaining}/${rl.limit}) — proceeding cautiously`);
          }
        }
      } catch { /* proceed anyway */ }
    }

    round++;
    const roundContext: WatchContext = { ...baseContext, round };

    // Fix 1: Print round start marker
    console.log(`\n${DIM}Starting round ${round}...${RESET}`);
    vlog.section(`Round ${round}`);

    // Phase 1: pre-scan (self-pull, subsquad discovery)
    await runPhase('pre-scan', enabledCapabilities, roundContext, config);

    // SubSquad discovery (informational, not a capability)
    const subSquads = discoverSubSquads(teamRoot);
    if (subSquads.length > 0 && round === 1) {
      console.log(`${DIM}📂 Discovered ${subSquads.length} subsquad(s): ${subSquads.map(s => s.name).join(', ')}${RESET}`);
    }

    // Core: triage (always runs — not a capability)
    const checkResult = await runCheck(rules, modules, roster, hasCopilot, autoAssign, capabilities, adapter, vlog);
    const roundState = checkResult.state;

    // Short-circuit remaining phases when the scan failed or was rate-limited
    if (checkResult.status !== 'ok') {
      reportBoard(roundState, round, { scanStatus: checkResult.status });
      const nextPollTime = new Date(Date.now() + interval * 60 * 1000);
      console.log(`${DIM}Next poll at ${nextPollTime.toLocaleTimeString()}${RESET}`);
      // Do NOT count a failed scan as a circuit-breaker success
      if (cbState.status === 'half-open') {
        cbState.consecutiveSuccesses = 0;
      }
      saveCBState(squadDirInfo.path, cbState);
      return;
    }

    // Phase 2: post-triage (two-pass hydration)
    await runPhase('post-triage', enabledCapabilities, roundContext, config);

    // Phase 3: post-execute (execute issues, wave dispatch, board updates)
    const execResults = await runPhase('post-execute', enabledCapabilities, roundContext, config);

    // Update executed count from execute capability
    const execResult = execResults.get('execute');
    if (execResult?.data?.['executed']) {
      roundState.executed = execResult.data['executed'] as number;
    }

    // Phase 4: housekeeping (monitoring, retro, decision hygiene)
    await runPhase('housekeeping', enabledCapabilities, roundContext, config);

    await eventBus.emit({
      type: 'agent:milestone', sessionId: monitorSessionId,
      agentName: 'Ralph',
      payload: { milestone: `Completed watch round ${round}`, task: 'watch cycle' },
      timestamp: new Date(),
    });
    await monitor.healthCheck();

    // Verbose board counters
    vlog.table({
      untriaged: roundState.untriaged,
      assigned: roundState.assigned,
      drafts: roundState.drafts,
      needsReview: roundState.needsReview,
      changesRequested: roundState.changesRequested,
      ciFailures: roundState.ciFailures,
      readyToMerge: roundState.readyToMerge,
      executed: roundState.executed,
    });

    reportBoard(roundState, round);

    // Fix 1: Print next poll time
    const nextPollTime = new Date(Date.now() + interval * 60 * 1000);
    console.log(`${DIM}Next poll at ${nextPollTime.toLocaleTimeString()}${RESET}`);

    // Post-round: update circuit breaker on success
    if (cbState.status === 'half-open') {
      cbState.consecutiveSuccesses++;
      if (cbState.consecutiveSuccesses >= 2) {
        cbState.status = 'closed';
        cbState.cooldownMinutes = 2;
        cbState.consecutiveFailures = 0;
        console.log(`${GREEN}✓${RESET} [${new Date().toLocaleTimeString()}] Circuit closed — quota recovered`);
      }
    } else {
      cbState.consecutiveSuccesses = 0;
      cbState.consecutiveFailures = 0;
    }
    saveCBState(squadDirInfo.path, cbState);

    const roundEnd = Date.now();
    const elapsed = ((roundEnd - roundStart) / 1000).toFixed(1);
    vlog.log(`Round ${round} complete (${elapsed}s)`);
  }

  // Run immediately, then on interval
  await executeRound();

  return new Promise<void>((resolve) => {
    const intervalId = setInterval(
      async () => {
        if (roundInProgress) return;
        roundInProgress = true;
        try {
          await executeRound();
        } catch (e) {
          const err = e as Error;
          if (adapter.type === 'github' && isRateLimitError(err)) {
            cbState.status = 'open';
            cbState.openedAt = new Date().toISOString();
            cbState.consecutiveFailures++;
            cbState.consecutiveSuccesses = 0;
            cbState.cooldownMinutes = Math.min(cbState.cooldownMinutes * 2, 30);
            saveCBState(squadDirInfo.path, cbState);
            console.log(`${RED}🛑${RESET} Rate limited — circuit opened, cooldown ${cbState.cooldownMinutes}m`);
          } else {
            console.error(`${RED}✗${RESET} Round error: ${err.message}`);
          }
        } finally {
          roundInProgress = false;
        }
      },
      interval * 60 * 1000,
    );

    // Graceful shutdown
    let isShuttingDown = false;
    const shutdown = async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      clearInterval(intervalId);
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      await eventBus.emit({
        type: 'session:destroyed', sessionId: monitorSessionId,
        agentName: 'Ralph', payload: null, timestamp: new Date(),
      });
      await monitor.stop();
      saveCBState(squadDirInfo.path, cbState);
      console.log(`\n${DIM}🔄 Ralph — Watch stopped${RESET}`);
      logStream?.end();
      resolve();
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
