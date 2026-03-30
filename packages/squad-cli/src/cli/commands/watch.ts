/**
 * Watch command — Ralph's standalone polling process
 */

import path from 'node:path';
import { execFile, execFileSync, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
const execFileAsync = promisify(execFile);
import { detectSquadDir } from '../core/detect-squad-dir.js';
import { fatal } from '../core/errors.js';
import { GREEN, RED, DIM, BOLD, RESET, YELLOW } from '../core/output.js';
import {
  parseRoutingRules,
  parseModuleOwnership,
  parseRoster,
  triageIssue,
  type TriageIssue,
} from '@bradygaster/squad-sdk/ralph/triage';
import { RalphMonitor } from '@bradygaster/squad-sdk/ralph';
import { EventBus } from '@bradygaster/squad-sdk/runtime/event-bus';
import { ghAvailable, ghAuthenticated, ghIssueList, ghIssueEdit, ghPrList, ghRateLimitCheck, isRateLimitError } from '../core/gh-cli.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';
import {
  PredictiveCircuitBreaker,
  getTrafficLight,
} from '@bradygaster/squad-sdk/ralph/rate-limiting';
import {
  detectPlatformFromUrl,
  getRemoteUrl,
  AzureDevOpsAdapter,
  parseAzureDevOpsRemote,
} from '@bradygaster/squad-sdk/platform';
import type { AdoWorkItemConfig } from '@bradygaster/squad-sdk/platform';

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

/** Platform bridge interface for watch operations. */
export interface WatchPlatform {
  listWorkItems(options: { label?: string; state?: string; limit?: number }): Promise<WatchWorkItem[]>;
  editWorkItem(id: number, options: { addLabel?: string; removeLabel?: string; addAssignee?: string; removeAssignee?: string }): Promise<void>;
  listPullRequests(options: { state?: string; limit?: number }): Promise<WatchPullRequest[]>;
  commentOnWorkItem(id: number, body: string): Promise<void>;
  /** Check if the underlying CLI is available. */
  checkAvailable(): Promise<boolean>;
  /** Check if the underlying CLI is authenticated. */
  checkAuthenticated(): Promise<boolean>;
  /** Check rate limit (returns null if unsupported). */
  checkRateLimit(): Promise<{ remaining: number; limit: number; resetAt: string } | null>;
  /** Detect if an error is a rate limit error. */
  isRateLimitError(err: unknown): boolean;
}

// ── GitHub Watch Platform ────────────────────────────────────────

/** WatchPlatform backed by gh CLI — preserves existing behavior exactly. */
class GitHubWatchPlatform implements WatchPlatform {
  async listWorkItems(options: { label?: string; state?: string; limit?: number }): Promise<WatchWorkItem[]> {
    return ghIssueList({
      label: options.label,
      state: options.state as 'open' | 'closed' | 'all' | undefined,
      limit: options.limit,
    });
  }

  async editWorkItem(id: number, options: { addLabel?: string; removeLabel?: string; addAssignee?: string; removeAssignee?: string }): Promise<void> {
    return ghIssueEdit(id, options);
  }

  async listPullRequests(options: { state?: string; limit?: number }): Promise<WatchPullRequest[]> {
    return ghPrList({
      state: options.state as 'open' | 'closed' | 'merged' | 'all' | undefined,
      limit: options.limit,
    });
  }

  async commentOnWorkItem(id: number, body: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'gh',
        ['issue', 'comment', String(id), '--body', body],
        { maxBuffer: 5 * 1024 * 1024 },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async checkAvailable(): Promise<boolean> {
    return ghAvailable();
  }

  async checkAuthenticated(): Promise<boolean> {
    return ghAuthenticated();
  }

  async checkRateLimit(): Promise<{ remaining: number; limit: number; resetAt: string }> {
    return ghRateLimitCheck();
  }

  isRateLimitError(err: unknown): boolean {
    return isRateLimitError(err);
  }
}

// ── Azure DevOps Watch Platform ──────────────────────────────────

/** Check whether the az CLI with devops extension is available. */
async function azAvailable(): Promise<boolean> {
  try {
    await execFileAsync('az', ['devops', '-h']);
    return true;
  } catch {
    return false;
  }
}

/** Check whether az CLI is authenticated. */
async function azAuthenticated(): Promise<boolean> {
  try {
    await execFileAsync('az', ['account', 'show']);
    return true;
  } catch {
    return false;
  }
}

/** WatchPlatform backed by AzureDevOpsAdapter from the SDK. */
class AdoWatchPlatform implements WatchPlatform {
  private adapter: AzureDevOpsAdapter;

  constructor(org: string, project: string, repo: string, workItemConfig?: AdoWorkItemConfig) {
    this.adapter = new AzureDevOpsAdapter(org, project, repo, workItemConfig);
  }

  async listWorkItems(options: { label?: string; state?: string; limit?: number }): Promise<WatchWorkItem[]> {
    const tags = options.label ? [options.label] : undefined;
    // Map GitHub-style state to ADO state
    let adoState: string | undefined;
    if (options.state === 'open') adoState = 'Active';
    else if (options.state === 'closed') adoState = 'Closed';

    const items = await this.adapter.listWorkItems({
      tags,
      state: adoState,
      limit: options.limit,
    });

    return items.map(wi => ({
      number: wi.id,
      title: wi.title,
      labels: wi.tags.map(t => ({ name: t })),
      assignees: wi.assignedTo ? [{ login: wi.assignedTo }] : [],
    }));
  }

  async editWorkItem(id: number, options: { addLabel?: string; removeLabel?: string; addAssignee?: string; removeAssignee?: string }): Promise<void> {
    // ADO uses tags instead of labels
    if (options.addLabel) {
      await this.adapter.addTag(id, options.addLabel);
    }
    if (options.removeLabel) {
      await this.adapter.removeTag(id, options.removeLabel);
    }
    // Assignee updates via az boards work-item update
    if (options.addAssignee) {
      const assignee = options.addAssignee === '@me' ? '' : options.addAssignee;
      if (assignee) {
        try {
          execFileSync('az', [
            'boards', 'work-item', 'update',
            '--id', String(id),
            '--fields', `System.AssignedTo=${assignee}`,
            '--output', 'json',
          ], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
        } catch {
          // best-effort
        }
      }
    }
  }

  async listPullRequests(options: { state?: string; limit?: number }): Promise<WatchPullRequest[]> {
    // Map GitHub-style state to ADO status
    let adoStatus: string | undefined;
    if (options.state === 'open') adoStatus = 'active';
    else if (options.state === 'closed') adoStatus = 'abandoned';
    else if (options.state === 'merged') adoStatus = 'completed';

    const prs = await this.adapter.listPullRequests({
      status: adoStatus,
      limit: options.limit,
    });

    return prs.map(pr => ({
      number: pr.id,
      title: pr.title,
      author: { login: pr.author },
      labels: [], // ADO PRs don't have labels in the same way
      isDraft: pr.status === 'draft',
      reviewDecision: mapAdoReviewToGhDecision(pr.reviewStatus),
      state: mapAdoStatusToGhState(pr.status),
      headRefName: pr.sourceBranch,
      statusCheckRollup: [], // ADO check runs are queried differently
    }));
  }

  async commentOnWorkItem(id: number, body: string): Promise<void> {
    await this.adapter.addComment(id, body);
  }

  async checkAvailable(): Promise<boolean> {
    return azAvailable();
  }

  async checkAuthenticated(): Promise<boolean> {
    return azAuthenticated();
  }

  async checkRateLimit(): Promise<null> {
    // ADO doesn't expose rate limits the same way — skip
    return null;
  }

  isRateLimitError(err: unknown): boolean {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes('429') || msg.includes('too many requests');
    }
    return false;
  }
}

/** Map ADO review status to GitHub review decision strings. */
function mapAdoReviewToGhDecision(status?: 'approved' | 'changes-requested' | 'pending'): string {
  switch (status) {
    case 'approved': return 'APPROVED';
    case 'changes-requested': return 'CHANGES_REQUESTED';
    case 'pending': return 'REVIEW_REQUIRED';
    default: return '';
  }
}

/** Map ADO PR status to GitHub-style state strings. */
function mapAdoStatusToGhState(status: 'active' | 'completed' | 'abandoned' | 'draft'): string {
  switch (status) {
    case 'active': return 'OPEN';
    case 'completed': return 'MERGED';
    case 'abandoned': return 'CLOSED';
    case 'draft': return 'OPEN';
    default: return 'OPEN';
  }
}

// ── Watch Platform Factory ───────────────────────────────────────

/**
 * Create the appropriate WatchPlatform based on options and environment.
 * - Explicit `options.platform` takes precedence.
 * - Falls back to auto-detection: checks .squad/config.json, then git remote URL.
 * - Default: GitHubWatchPlatform.
 */
export function createWatchPlatform(options: WatchOptions, teamRoot: string): WatchPlatform {
  const explicit = options.platform;

  if (explicit === 'ado') {
    return buildAdoWatchPlatform(teamRoot);
  }

  if (explicit === 'github') {
    return new GitHubWatchPlatform();
  }

  // Auto-detect from .squad/config.json
  const configPath = path.join(teamRoot, '.squad', 'config.json');
  if (storage.existsSync(configPath)) {
    try {
      const raw = storage.readSync(configPath) ?? '';
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.platform === 'ado' || parsed.platform === 'azure-devops') {
        return buildAdoWatchPlatform(teamRoot);
      }
    } catch { /* ignore parse errors */ }
  }

  // Auto-detect from git remote
  const remoteUrl = getRemoteUrl(teamRoot);
  if (remoteUrl) {
    const detected = detectPlatformFromUrl(remoteUrl);
    if (detected === 'azure-devops') {
      return buildAdoWatchPlatform(teamRoot);
    }
  }

  return new GitHubWatchPlatform();
}

/** Build an AdoWatchPlatform from config + git remote. */
function buildAdoWatchPlatform(teamRoot: string): AdoWatchPlatform {
  // Read ADO config from .squad/config.json
  const configPath = path.join(teamRoot, '.squad', 'config.json');
  let adoConfig: AdoWorkItemConfig | undefined;
  let org = '';
  let project = '';
  let repo = '';

  if (storage.existsSync(configPath)) {
    try {
      const raw = storage.readSync(configPath) ?? '';
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.ado && typeof parsed.ado === 'object') {
        const adoSection = parsed.ado as Record<string, unknown>;
        org = (adoSection.org as string) ?? '';
        project = (adoSection.project as string) ?? '';
        repo = (adoSection.repo as string) ?? '';
        adoConfig = parsed.ado as AdoWorkItemConfig;
      }
    } catch { /* ignore */ }
  }

  // Fall back to git remote parsing
  if (!org || !project) {
    const remoteUrl = getRemoteUrl(teamRoot);
    if (remoteUrl) {
      const info = parseAzureDevOpsRemote(remoteUrl);
      if (info) {
        org = org || info.org;
        project = project || info.project;
        repo = repo || info.repo;
      }
    }
  }

  if (!org || !project) {
    throw new Error(
      'Azure DevOps configuration incomplete. Set org/project in .squad/config.json:\n' +
      '  { "platform": "ado", "ado": { "org": "YOUR_ORG", "project": "YOUR_PROJECT" } }',
    );
  }

  return new AdoWatchPlatform(org, project, repo, adoConfig);
}

/**
 * Options controlling the watch/triage loop.
 * When `execute` is false (default) the loop only triages — identical to
 * the original behaviour.  All new opt-in features are disabled by default.
 */
export interface WatchOptions {
  intervalMinutes: number;
  execute?: boolean;
  copilotFlags?: string;
  /** Hidden — fully override the agent command (not shown in help). */
  agentCmd?: string;
  maxConcurrent?: number;
  issueTimeoutMinutes?: number;

  // ── Platform selection ────────────────────────────────────────
  /** Target platform: 'github' or 'ado'. Auto-detected if omitted. */
  platform?: 'github' | 'ado';

  // ── Opt-in feature flags (#708) ──────────────────────────────
  /** Scan Teams for actionable messages each round (requires WorkIQ MCP). */
  monitorTeams?: boolean;
  /** Scan email for actionable items each round (requires WorkIQ MCP). */
  monitorEmail?: boolean;
  /** Enable project board lifecycle (In Progress / Done / Blocked + reconciliation). */
  board?: boolean;
  /** Project board number (default: 1). */
  boardProject?: number;
  /** Use two-pass scanning (lightweight list → hydrate actionable only). */
  twoPass?: boolean;
  /** Enable wave-based parallel sub-task dispatch within issues. */
  waveDispatch?: boolean;
  /** Enforce retrospective checks (on Fridays or when missed). */
  retro?: boolean;
  /** Auto-merge decision inbox when >5 files. */
  decisionHygiene?: boolean;
  /** Route notifications to specific Teams channels (requires .squad/teams-channels.json). */
  channelRouting?: boolean;
}

/** Labels that indicate an issue is NOT ready for autonomous execution. */
const BLOCKED_LABELS: ReadonlySet<string> = new Set([
  'status:blocked',
  'status:waiting-external',
  'status:postponed',
  'status:scheduled',
  'status:needs-action',
  'status:needs-decision',
  'status:needs-review',
  'pending-user',
  'do-not-merge',
]);

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

export function reportBoard(state: BoardState, round: number): void {
  const total = Object.values(state).reduce((a, b) => a + b, 0);
  
  if (total === 0) {
    console.log(`${DIM}📋 Board is clear — Ralph is idling${RESET}`);
    return;
  }
  
  console.log(`\n${BOLD}🔄 Ralph — Round ${round}${RESET}`);
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
  return {
    untriaged: 0,
    assigned: 0,
    drafts: 0,
    needsReview: 0,
    changesRequested: 0,
    ciFailures: 0,
    readyToMerge: 0,
    executed: 0,
  };
}

type PRBoardState = Pick<BoardState, 'drafts' | 'needsReview' | 'changesRequested' | 'ciFailures' | 'readyToMerge'> & {
  totalOpen: number;
};

async function checkPRs(roster: ReturnType<typeof parseRoster>, platform: WatchPlatform): Promise<PRBoardState> {
  const timestamp = new Date().toLocaleTimeString();
  const prs = await platform.listPullRequests({ state: 'open', limit: 20 });
  
  // Filter to squad-related PRs (has squad label or branch starts with squad/)
  const squadPRs: WatchPullRequest[] = prs.filter(pr =>
    pr.labels.some(l => l.name.startsWith('squad')) ||
    pr.headRefName.startsWith('squad/')
  );
  
  if (squadPRs.length === 0) {
    return {
      drafts: 0,
      needsReview: 0,
      changesRequested: 0,
      ciFailures: 0,
      readyToMerge: 0,
      totalOpen: 0,
    };
  }
  
  const drafts = squadPRs.filter(pr => pr.isDraft);
  const changesRequested = squadPRs.filter(pr => pr.reviewDecision === 'CHANGES_REQUESTED');
  const approved = squadPRs.filter(pr => pr.reviewDecision === 'APPROVED' && !pr.isDraft);
  const ciFailures = squadPRs.filter(pr =>
    pr.statusCheckRollup?.some(check => check.state === 'FAILURE' || check.state === 'ERROR')
  );
  const readyToMerge = approved.filter(pr =>
    !pr.statusCheckRollup?.some(c => c.state === 'FAILURE' || c.state === 'ERROR' || c.state === 'PENDING')
  );
  const changesRequestedSet = new Set(changesRequested.map(pr => pr.number));
  const ciFailureSet = new Set(ciFailures.map(pr => pr.number));
  const readyToMergeSet = new Set(readyToMerge.map(pr => pr.number));
  const needsReview = squadPRs.filter(pr =>
    !pr.isDraft &&
    !changesRequestedSet.has(pr.number) &&
    !ciFailureSet.has(pr.number) &&
    !readyToMergeSet.has(pr.number)
  );
  
  const memberNames = new Set(roster.map(m => m.name.toLowerCase()));
  
  // Report each category
  if (drafts.length > 0) {
    console.log(`${DIM}[${timestamp}]${RESET} 🟡 ${drafts.length} draft PR(s) in progress`);
    for (const pr of drafts) {
      console.log(`  ${DIM}PR #${pr.number}: ${pr.title} (${pr.author.login})${RESET}`);
    }
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
  if (approved.length > 0) {
    if (readyToMerge.length > 0) {
      console.log(`${GREEN}[${timestamp}]${RESET} 🟢 ${readyToMerge.length} PR(s) ready to merge`);
      for (const pr of readyToMerge) {
        console.log(`  PR #${pr.number}: ${pr.title} — approved, CI green`);
      }
    }
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

/**
 * Run a single check cycle
 */
async function runCheck(
  rules: ReturnType<typeof parseRoutingRules>,
  modules: ReturnType<typeof parseModuleOwnership>,
  roster: ReturnType<typeof parseRoster>,
  hasCopilot: boolean,
  autoAssign: boolean,
  capabilities: MachineCapabilities | null = null,
  platform: WatchPlatform = new GitHubWatchPlatform(),
): Promise<BoardState> {
  const timestamp = new Date().toLocaleTimeString();
  
  try {
    // Fetch open issues with squad label
    const issues = await platform.listWorkItems({ label: 'squad', state: 'open', limit: 20 });
    
    // Filter by machine capabilities (#514)
    const { filterByCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
    const { handled: capableIssues, skipped: incapableIssues } = filterByCapabilities(issues, capabilities);
    
    for (const { issue, missing } of incapableIssues) {
      console.log(`${DIM}[${timestamp}] ⏭️ Skipping #${issue.number} "${issue.title}" — missing: ${missing.join(', ')}${RESET}`);
    }
    
    // Find untriaged issues (no squad:{member} label)
    const memberLabels = roster.map(m => m.label);
    const untriaged = capableIssues.filter(issue => {
      const issueLabels = issue.labels.map(l => l.name);
      return !memberLabels.some(ml => issueLabels.includes(ml));
    });
    const assignedIssues = capableIssues.filter(issue => {
      const issueLabels = issue.labels.map(l => l.name);
      return memberLabels.some(ml => issueLabels.includes(ml));
    });
    
    // Find unassigned squad:copilot issues
    let unassignedCopilot: WatchWorkItem[] = [];
    if (hasCopilot && autoAssign) {
      try {
        const copilotIssues = await platform.listWorkItems({ label: 'squad:copilot', state: 'open', limit: 10 });
        unassignedCopilot = copilotIssues.filter(i => !i.assignees || i.assignees.length === 0);
      } catch {
        // Label may not exist yet
      }
    }
    
    // Triage untriaged issues
    for (const issue of untriaged) {
      const triageInput: TriageIssue = {
        number: issue.number,
        title: issue.title,
        body: issue.body,
        labels: issue.labels.map((l) => l.name),
      };
      const triage = triageIssue(triageInput, rules, modules, roster);
      
      if (triage) {
        try {
          await platform.editWorkItem(issue.number, { addLabel: triage.agent.label });
          console.log(
            `${GREEN}✓${RESET} [${timestamp}] Triaged #${issue.number} "${issue.title}" → ${triage.agent.name} (${triage.reason})`
          );
        } catch (e) {
          const err = e as Error;
          console.error(`${RED}✗${RESET} [${timestamp}] Failed to label #${issue.number}: ${err.message}`);
        }
      }
    }
    
    // Assign @copilot to unassigned copilot issues
    for (const issue of unassignedCopilot) {
      try {
        await platform.editWorkItem(issue.number, { addAssignee: 'copilot-swe-agent' });
        console.log(`${GREEN}✓${RESET} [${timestamp}] Assigned @copilot to #${issue.number} "${issue.title}"`);
      } catch (e) {
        const err = e as Error;
        console.error(`${RED}✗${RESET} [${timestamp}] Failed to assign @copilot to #${issue.number}: ${err.message}`);
      }
    }
    
    const prState = await checkPRs(roster, platform);
    
    return {
      untriaged: untriaged.length,
      assigned: assignedIssues.length,
      executed: 0,
      ...prState,
    };
  } catch (e) {
    const err = e as Error;
    console.error(`${RED}✗${RESET} [${timestamp}] Check failed: ${err.message}`);
    return emptyBoardState();
  }
}

// ── Execute-mode helpers (#708) ──────────────────────────────────

/**
 * Build the command + arguments array for the agent subprocess.
 * - Default: `gh copilot --message "<prompt>" [copilotFlags]`
 * - With `--agent-cmd`: splits the custom command by whitespace.
 */
export function buildAgentCommand(
  issue: WatchWorkItem,
  teamRoot: string,
  options: WatchOptions,
): { cmd: string; args: string[] } {
  const prompt = `Work on issue #${issue.number}: ${issue.title}. Read the issue body for full details.`;

  if (options.agentCmd) {
    const parts = options.agentCmd.trim().split(/\s+/);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), '--message', prompt];
    return { cmd, args };
  }

  const args = ['copilot', '--message', prompt];
  if (options.copilotFlags) {
    args.push(...options.copilotFlags.trim().split(/\s+/));
  }
  return { cmd: 'gh', args };
}

/**
 * Result of a single issue execution attempt.
 */
interface ExecuteResult {
  success: boolean;
  error?: string;
}

/**
 * Spawn the agent process to work on a single issue.
 * Claims the issue first (addAssignee @me), posts a "starting work"
 * comment, then runs the agent command with a timeout.
 */
export async function executeIssue(
  issue: WatchWorkItem,
  teamRoot: string,
  options: WatchOptions,
  platform: WatchPlatform = new GitHubWatchPlatform(),
): Promise<ExecuteResult> {
  const ts = new Date().toLocaleTimeString();
  const timeoutMs = (options.issueTimeoutMinutes ?? 30) * 60_000;

  // Claim the issue
  try {
    await platform.editWorkItem(issue.number, { addAssignee: '@me' });
  } catch {
    // best-effort — don't block execution
  }

  // Post "starting work" comment
  try {
    await platform.commentOnWorkItem(issue.number, `🤖 Ralph: starting autonomous work on this issue.`);
  } catch {
    // best-effort comment
  }

  const { cmd, args } = buildAgentCommand(issue, teamRoot, options);
  console.log(`${GREEN}▶${RESET} [${ts}] Executing #${issue.number} "${issue.title}" → ${cmd} ${args.join(' ')}`);

  return new Promise<ExecuteResult>((resolve) => {
    const cp: ChildProcess = execFile(
      cmd,
      args,
      {
        cwd: teamRoot,
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024, // 50 MB — agent output can be large
      },
      (err, _stdout, stderr) => {
        if (err) {
          const execErr = err as Error & { killed?: boolean };
          const msg = execErr.killed
            ? `Timed out after ${options.issueTimeoutMinutes ?? 30}m`
            : execErr.message;
          console.error(`${RED}✗${RESET} [${new Date().toLocaleTimeString()}] #${issue.number} failed: ${msg}`);
          resolve({ success: false, error: msg });
        } else {
          console.log(`${GREEN}✓${RESET} [${new Date().toLocaleTimeString()}] #${issue.number} completed`);
          resolve({ success: true });
        }
      },
    );
  });
}

/**
 * Return issues from the board that are eligible for autonomous
 * execution: labelled for a squad member, not assigned to a human,
 * and not in a blocked/waiting state.
 */
export function findExecutableIssues(
  roster: ReturnType<typeof parseRoster>,
  capabilities: MachineCapabilities | null,
  issues: WatchWorkItem[],
): WatchWorkItem[] {
  const memberLabels = new Set(roster.map(m => m.label));

  return issues.filter(issue => {
    const labels = issue.labels.map(l => l.name);

    // Must have a squad:{member} assignment label
    if (!labels.some(l => memberLabels.has(l))) return false;

    // Must not be assigned to a human already
    if (issue.assignees && issue.assignees.length > 0) return false;

    // Must not carry any blocked/waiting label
    if (labels.some(l => BLOCKED_LABELS.has(l))) return false;

    return true;
  });
}

/**
 * Best-effort `git fetch && git pull --ff-only` so the work-tree
 * stays reasonably up-to-date between rounds.  Never throws — a
 * failed pull must never block a triage/execute cycle.
 */
export async function selfPull(teamRoot: string): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('git', ['fetch', '--quiet'], { cwd: teamRoot }, (err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      execFile('git', ['pull', '--ff-only', '--quiet'], { cwd: teamRoot }, (err) => (err ? reject(err) : resolve()));
    });
  } catch {
    // best-effort — log at debug level but never block
    console.log(`${DIM}⚠ selfPull: git pull skipped (not on a tracking branch or conflicts)${RESET}`);
  }
}

// ── Teams & Email Monitoring (#708) ──────────────────────────────

/**
 * Spawn a lightweight Copilot session to scan Teams messages via WorkIQ.
 * Best-effort: logs a warning if WorkIQ is unavailable or the agent fails.
 * @param teamRoot - Root directory of the squad project.
 * @param options  - Watch options (used for --agent-cmd override).
 */
async function monitorTeams(teamRoot: string, options: WatchOptions): Promise<void> {
  const ts = new Date().toLocaleTimeString();
  try {
    const prompt =
      'Check Teams for actionable messages from the last 30 minutes. ' +
      'Use workiq-ask_work_iq to query: "Teams messages in last 30 min mentioning action items, reviews, urgent requests". ' +
      'For each actionable item found, create a GitHub issue with the label "teams-bridge". ' +
      'First check existing open issues with label "teams-bridge" to avoid duplicates. ' +
      'If WorkIQ is not available, just report that and exit.';

    const { cmd, args } = buildAgentCommandFromPrompt(prompt, teamRoot, options);
    await spawnWithTimeout(cmd, args, teamRoot, 60_000);
    console.log(`${GREEN}✓${RESET} [${ts}] Teams monitor scan complete`);
  } catch (e) {
    const err = e as Error;
    console.log(`${YELLOW}⚠${RESET} [${ts}] Teams monitor: ${err.message}`);
  }
}

/**
 * Spawn a lightweight Copilot session to scan email via WorkIQ.
 * Includes GitHub alert email dedup (CI failures, Dependabot, security vulns).
 * Best-effort: logs a warning if WorkIQ is unavailable.
 * @param teamRoot - Root directory of the squad project.
 * @param options  - Watch options (used for --agent-cmd override).
 */
async function monitorEmail(teamRoot: string, options: WatchOptions): Promise<void> {
  const ts = new Date().toLocaleTimeString();
  try {
    const prompt =
      'Check email for actionable items. Use workiq-ask_work_iq to query: ' +
      '"Recent emails about CI failures, Dependabot alerts, security vulnerabilities, or review requests". ' +
      'For CI failures: check if a GitHub issue with label "ci-alert" already exists for the same workflow in the last 24 hours — if so, skip. ' +
      'For new alerts: create a GitHub issue with label "email-bridge". ' +
      'If a failed workflow can be re-run, attempt: gh run rerun <run-id> --failed. ' +
      'If WorkIQ is not available, just report that and exit.';

    const { cmd, args } = buildAgentCommandFromPrompt(prompt, teamRoot, options);
    await spawnWithTimeout(cmd, args, teamRoot, 60_000);
    console.log(`${GREEN}✓${RESET} [${ts}] Email monitor scan complete`);
  } catch (e) {
    const err = e as Error;
    console.log(`${YELLOW}⚠${RESET} [${ts}] Email monitor: ${err.message}`);
  }
}

// ── Board Lifecycle (#708) ───────────────────────────────────────

/**
 * Move an issue to a status column on a GitHub Projects v2 board.
 * Uses `gh project item-add` and `gh project item-edit` CLI commands.
 * Best-effort — failures are logged, never thrown.
 * @param issueNumber - The GitHub issue number.
 * @param status      - Target status column.
 * @param options     - Project number and owner overrides.
 */
async function updateBoard(
  issueNumber: number,
  status: 'in-progress' | 'done' | 'blocked' | 'todo',
  options: { projectNumber?: number; owner?: string },
): Promise<void> {
  const ts = new Date().toLocaleTimeString();
  const projectNum = options.projectNumber ?? 1;
  try {
    // Resolve repo URL first (execFile doesn't expand shell substitutions)
    let repoUrl: string;
    try {
      const repoName = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
        encoding: 'utf-8', timeout: 10_000,
      }).trim();
      repoUrl = `https://github.com/${repoName}/issues/${issueNumber}`;
    } catch {
      console.warn(`${YELLOW}⚠️${RESET} Could not resolve repo URL for board update`);
      return;
    }

    // Ensure the issue is on the project board
    await execFileAsync('gh', [
      'project', 'item-add', String(projectNum),
      '--owner', options.owner ?? '@me',
      '--url', repoUrl,
    ], { maxBuffer: 5 * 1024 * 1024 });

    // Map status to a field value — these are conventional defaults
    const statusMap: Record<string, string> = {
      'todo': 'Todo',
      'in-progress': 'In Progress',
      'done': 'Done',
      'blocked': 'Blocked',
    };
    const statusValue = statusMap[status] ?? 'Todo';

    // Get the item ID so we can edit it
    const { stdout: itemsJson } = await execFileAsync('gh', [
      'project', 'item-list', String(projectNum),
      '--owner', options.owner ?? '@me',
      '--format', 'json',
      '--limit', '300',
    ], { maxBuffer: 10 * 1024 * 1024 });

    const items = JSON.parse(itemsJson) as { items?: Array<{ id: string; content?: { number?: number } }> };
    const item = items.items?.find(i => i.content?.number === issueNumber);
    if (!item) {
      console.log(`${DIM}[${ts}] Board: issue #${issueNumber} not found on project ${projectNum}${RESET}`);
      return;
    }

    await execFileAsync('gh', [
      'project', 'item-edit',
      '--project-id', String(projectNum),
      '--id', item.id,
      '--field-id', 'Status',
      '--single-select-option-id', statusValue,
    ], { maxBuffer: 5 * 1024 * 1024 });

    console.log(`${DIM}[${ts}] Board: #${issueNumber} → ${statusValue}${RESET}`);
  } catch (e) {
    const err = e as Error;
    console.log(`${YELLOW}⚠${RESET} [${ts}] Board update #${issueNumber}: ${err.message}`);
  }
}

/**
 * Reconcile the project board: move closed issues to Done, open issues out of Done.
 * Runs every round when --board is enabled. Best-effort.
 * @param options - Project number override.
 */
async function reconcileBoard(
  options: { projectNumber?: number },
): Promise<void> {
  const ts = new Date().toLocaleTimeString();
  const projectNum = options.projectNumber ?? 1;
  try {
    const { stdout: itemsJson } = await execFileAsync('gh', [
      'project', 'item-list', String(projectNum),
      '--owner', '@me',
      '--format', 'json',
      '--limit', '300',
    ], { maxBuffer: 10 * 1024 * 1024 });

    const items = JSON.parse(itemsJson) as {
      items?: Array<{
        id: string;
        status?: string;
        content?: { number?: number; type?: string; state?: string };
      }>;
    };
    if (!items.items?.length) return;

    let mismatches = 0;
    for (const item of items.items) {
      if (!item.content?.number || item.content.type !== 'Issue') continue;
      const isClosed = item.content.state === 'CLOSED';
      const isDone = item.status?.toLowerCase() === 'done';

      if (isClosed && !isDone) {
        // Closed issue not in Done → move to Done
        mismatches++;
        console.log(`${DIM}[${ts}] Reconcile: #${item.content.number} closed but not Done — moving${RESET}`);
      } else if (!isClosed && isDone) {
        // Open issue in Done → move to Todo
        mismatches++;
        console.log(`${DIM}[${ts}] Reconcile: #${item.content.number} open but in Done — moving to Todo${RESET}`);
      }
    }

    if (mismatches > 0) {
      console.log(`${DIM}[${ts}] Board reconciliation: ${mismatches} mismatch(es) detected${RESET}`);
    }
  } catch (e) {
    const err = e as Error;
    console.log(`${YELLOW}⚠${RESET} [${ts}] Board reconciliation: ${err.message}`);
  }
}

/**
 * Archive issues that have been in Done for >3 days by closing them
 * with a summary comment.  Best-effort.
 * @param options - Project number override.
 */
async function archiveDoneItems(
  options: { projectNumber?: number },
): Promise<void> {
  const ts = new Date().toLocaleTimeString();
  const projectNum = options.projectNumber ?? 1;
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  try {
    const { stdout: itemsJson } = await execFileAsync('gh', [
      'project', 'item-list', String(projectNum),
      '--owner', '@me',
      '--format', 'json',
      '--limit', '300',
    ], { maxBuffer: 10 * 1024 * 1024 });

    const items = JSON.parse(itemsJson) as {
      items?: Array<{
        id: string;
        status?: string;
        updatedAt?: string;
        content?: { number?: number; type?: string; state?: string };
      }>;
    };
    if (!items.items?.length) return;

    for (const item of items.items) {
      if (!item.content?.number || item.content.type !== 'Issue') continue;
      if (item.status?.toLowerCase() !== 'done') continue;
      if (item.content.state === 'CLOSED') continue;

      const updatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now();
      if (Date.now() - updatedAt < threeDaysMs) continue;

      // Close with summary comment
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(
            'gh',
            ['issue', 'close', String(item.content!.number!), '--comment', '🤖 Ralph: Auto-closing — issue has been in Done for >3 days.'],
            { maxBuffer: 5 * 1024 * 1024 },
            (err) => (err ? reject(err) : resolve()),
          );
        });
        console.log(`${DIM}[${ts}] Archived: #${item.content.number} (Done >3 days)${RESET}`);
      } catch {
        // best-effort
      }
    }
  } catch (e) {
    const err = e as Error;
    console.log(`${YELLOW}⚠${RESET} [${ts}] Archive done items: ${err.message}`);
  }
}

// ── Two-Pass Scanning (#708) ─────────────────────────────────────

/**
 * Two-pass issue scanning: lightweight list first, then hydrate only
 * actionable issues.  Returns hydrated issues plus scan statistics.
 * @param roster       - Parsed team roster.
 * @param capabilities - Machine capabilities for filtering.
 * @returns Actionable issues and scan stats.
 */
async function twoPassScan(
  roster: ReturnType<typeof parseRoster>,
  capabilities: MachineCapabilities | null,
  platform: WatchPlatform = new GitHubWatchPlatform(),
): Promise<{ issues: WatchWorkItem[]; stats: { total: number; actionable: number } }> {
  const ts = new Date().toLocaleTimeString();
  const memberLabels = new Set(roster.map(m => m.label));

  // Pass 1: lightweight list using platform adapter
  const allIssues = await platform.listWorkItems({ label: 'squad', state: 'open', limit: 200 });
  const total = allIssues.length;

  // Filter to actionable: has squad member label, unassigned, not blocked
  const actionableShallow = allIssues.filter(issue => {
    const labels = issue.labels.map(l => l.name);
    if (!labels.some(l => memberLabels.has(l))) return false;
    if (issue.assignees && issue.assignees.length > 0) return false;
    if (labels.some(l => BLOCKED_LABELS.has(l))) return false;
    return true;
  });

  // Filter by capabilities if available
  let toHydrate = actionableShallow;
  if (capabilities) {
    const { filterByCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
    const { handled } = filterByCapabilities(actionableShallow, capabilities);
    toHydrate = handled;
  }

  // Pass 2: hydrate actionable issues (fetch body + comments)
  // For GitHub, use gh CLI directly; for other platforms, use the shallow version
  const hydrated: WatchWorkItem[] = [];
  for (const issue of toHydrate) {
    try {
      const { stdout: detailJson } = await execFileAsync('gh', [
        'issue', 'view', String(issue.number),
        '--json', 'number,title,body,labels,assignees',
      ], { maxBuffer: 5 * 1024 * 1024 });
      hydrated.push(JSON.parse(detailJson));
    } catch {
      // If hydration fails, use the shallow version
      hydrated.push(issue);
    }
  }

  console.log(`${DIM}[${ts}] Two-pass: ${total} total → ${hydrated.length} actionable (hydrated)${RESET}`);
  return { issues: hydrated, stats: { total, actionable: hydrated.length } };
}

// ── Wave Dispatch (#708) ─────────────────────────────────────────

/** Parsed sub-task with optional dependency annotation. */
interface SubTask {
  description: string;
  dependsOn: string[];
}

/**
 * Parse sub-tasks from an issue body. Looks for task-list items with
 * optional `depends_on:` annotations in parentheses.
 * @param body - Issue body markdown.
 * @returns Array of parsed sub-tasks.
 */
function parseSubTasks(body: string | undefined): SubTask[] {
  if (!body) return [];
  const lines = body.split('\n');
  const tasks: SubTask[] = [];

  for (const line of lines) {
    const match = line.match(/^[-*]\s+\[[ x]?\]\s+(.+)/i);
    if (!match) continue;

    let description = match[1]!.trim();
    let dependsOn: string[] = [];

    // Check for depends_on annotation: (depends_on: task1, task2)
    const depMatch = description.match(/\(depends_on:\s*([^)]+)\)/i);
    if (depMatch) {
      dependsOn = depMatch[1]!.split(',').map(d => d.trim()).filter(Boolean);
      description = description.replace(depMatch[0], '').trim();
    }

    tasks.push({ description, dependsOn });
  }

  return tasks;
}

/**
 * Execute issues using wave-based parallel dispatch.  Sub-tasks within
 * an issue body are grouped by dependency and run in waves (Wave 1 in
 * parallel, then Wave 2, etc.).  Falls back to regular sequential
 * execution if no sub-tasks are found.
 * @param issues   - Issues to execute.
 * @param teamRoot - Root directory of the squad project.
 * @param options  - Watch options.
 * @returns Execution results.
 */
async function waveDispatch(
  issues: WatchWorkItem[],
  teamRoot: string,
  options: WatchOptions,
  platform: WatchPlatform = new GitHubWatchPlatform(),
): Promise<{ executed: number; failed: number }> {
  const ts = new Date().toLocaleTimeString();
  let executed = 0;
  let failed = 0;

  for (const issue of issues) {
    const subTasks = parseSubTasks(issue.body);

    if (subTasks.length === 0) {
      // No sub-tasks — fallback to normal execution
      const result = await executeIssue(issue, teamRoot, options, platform);
      if (result.success) executed++;
      else failed++;
      continue;
    }

    // Build dependency waves
    const completed = new Set<string>();
    const remaining = new Map(subTasks.map((t, i) => [`task-${i}`, t]));
    let waveNum = 0;

    while (remaining.size > 0) {
      waveNum++;
      const wave: Array<[string, SubTask]> = [];

      for (const [id, task] of remaining) {
        const depsReady = task.dependsOn.every(dep => completed.has(dep));
        if (depsReady) wave.push([id, task]);
      }

      if (wave.length === 0) {
        // Circular dependency or unresolvable — execute remaining sequentially
        console.log(`${YELLOW}⚠${RESET} [${ts}] #${issue.number}: unresolvable deps, falling back to sequential`);
        for (const [id] of remaining) {
          completed.add(id);
        }
        const result = await executeIssue(issue, teamRoot, options, platform);
        if (result.success) executed++;
        else failed++;
        break;
      }

      console.log(`${DIM}[${ts}] #${issue.number} Wave ${waveNum}: ${wave.length} task(s)${RESET}`);

      // Execute wave in parallel (bounded by maxConcurrent)
      const maxParallel = options.maxConcurrent ?? 1;
      for (let i = 0; i < wave.length; i += maxParallel) {
        const batch = wave.slice(i, i + maxParallel);
        const results = await Promise.all(
          batch.map(([, task]) => {
            // Create a synthetic issue per sub-task for dispatch
            const syntheticIssue: WatchWorkItem = {
              ...issue,
              title: `${issue.title} — ${task.description}`,
            };
            return executeIssue(syntheticIssue, teamRoot, options, platform);
          }),
        );
        for (const r of results) {
          if (r.success) executed++;
          else failed++;
        }
      }

      for (const [id] of wave) {
        completed.add(id);
        remaining.delete(id);
      }
    }
  }

  console.log(`${DIM}[${ts}] Wave dispatch: ${executed} succeeded, ${failed} failed${RESET}`);
  return { executed, failed };
}

// ── Retrospective & Housekeeping (#708) ──────────────────────────

/**
 * Check if a retrospective is due (Fridays after 14:00 UTC or if the
 * last retro was >7 days ago).  Spawns a Copilot session to run it.
 * Best-effort: never blocks the round.
 * @param teamRoot - Root directory of the squad project.
 * @param options  - Watch options (used for --agent-cmd override).
 */
async function checkRetro(teamRoot: string, options: WatchOptions): Promise<void> {
  const ts = new Date().toLocaleTimeString();
  try {
    const now = new Date();
    const isFriday = now.getUTCDay() === 5;
    const isAfternoon = now.getUTCHours() >= 14;

    // Check last retro timestamp
    const logDir = path.join(teamRoot, '.squad', 'log');
    let lastRetroAge = Infinity;
    try {
      const files = storage.listSync?.(logDir) ?? [];
      const retroFiles = (Array.isArray(files) ? files : [])
        .filter((f: string) => f.includes('retrospective'));
      if (retroFiles.length > 0) {
        // Sort descending to find newest
        retroFiles.sort().reverse();
        const newest = retroFiles[0]!;
        // Extract timestamp from filename pattern: YYYY-MM-DD-...-retrospective.md
        const dateMatch = newest.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const retroDate = new Date(dateMatch[1]!);
          lastRetroAge = now.getTime() - retroDate.getTime();
        }
      }
    } catch {
      // No log dir or files — treat as never done
    }

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const isDue = (isFriday && isAfternoon) || lastRetroAge > sevenDaysMs;

    if (!isDue) return;

    const dateSlug = now.toISOString().slice(0, 10);
    const prompt =
      `Run a sprint retrospective for the squad. ` +
      `Review recent GitHub activity (issues closed, PRs merged, CI status). ` +
      `Summarize: what went well, what didn't, action items. ` +
      `Write the output to .squad/log/${dateSlug}-retrospective.md`;

    const { cmd, args } = buildAgentCommandFromPrompt(prompt, teamRoot, options);
    await spawnWithTimeout(cmd, args, teamRoot, 120_000);
    console.log(`${GREEN}✓${RESET} [${ts}] Retrospective completed`);
  } catch (e) {
    const err = e as Error;
    console.log(`${YELLOW}⚠${RESET} [${ts}] Retrospective: ${err.message}`);
  }
}

/**
 * Merge decision inbox files when >5 accumulate.  Spawns Scribe to
 * consolidate into decisions.md.  Best-effort.
 * @param teamRoot - Root directory of the squad project.
 * @param options  - Watch options (used for --agent-cmd override).
 */
async function cleanDecisionInbox(teamRoot: string, options: WatchOptions): Promise<void> {
  const ts = new Date().toLocaleTimeString();
  try {
    const inboxDir = path.join(teamRoot, '.squad', 'decisions', 'inbox');
    if (!storage.existsSync(inboxDir)) return;

    let fileCount = 0;
    try {
      const files = storage.listSync?.(inboxDir) ?? [];
      fileCount = Array.isArray(files) ? files.filter((f: string) => f.endsWith('.md')).length : 0;
    } catch {
      return;
    }

    if (fileCount <= 5) return;

    console.log(`${DIM}[${ts}] Decision inbox has ${fileCount} files — merging${RESET}`);
    const prompt =
      `Merge the decision inbox files in .squad/decisions/inbox/ into .squad/decisions.md. ` +
      `Append each decision as a new section. After merging, delete the inbox files.`;

    const { cmd, args } = buildAgentCommandFromPrompt(prompt, teamRoot, options);
    await spawnWithTimeout(cmd, args, teamRoot, 60_000);
    console.log(`${GREEN}✓${RESET} [${ts}] Decision inbox merged`);
  } catch (e) {
    const err = e as Error;
    console.log(`${YELLOW}⚠${RESET} [${ts}] Decision hygiene: ${err.message}`);
  }
}

// ── SubSquad Discovery (#708) ────────────────────────────────────

/** Discovered subsquad metadata. */
interface SubSquad {
  name: string;
  dir: string;
  labels: string[];
}

/**
 * Discover subsquads under .squad/subsquads/.  Returns an empty array
 * if no subsquads exist — never throws.
 * @param teamRoot - Root directory of the squad project.
 * @returns Array of discovered subsquads.
 */
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

      // Extract scope labels from routing.md if present
      const routingPath = path.join(entryPath, 'routing.md');
      let labels: string[] = [];
      if (storage.existsSync(routingPath)) {
        try {
          const content = storage.readSync(routingPath) ?? '';
          // Look for labels in a "Scope" section or label references
          const labelMatches = content.match(/label[s]?:\s*([^\n]+)/gi);
          if (labelMatches) {
            labels = labelMatches
              .flatMap((m: string) => m.replace(/labels?:\s*/i, '').split(','))
              .map((l: string) => l.trim())
              .filter(Boolean);
          }
        } catch {
          // best-effort
        }
      }

      squads.push({ name: entry, dir: entryPath, labels });
    }

    return squads;
  } catch {
    return [];
  }
}

// ── Shared Helpers (#708) ────────────────────────────────────────

/**
 * Build agent command from an arbitrary prompt string (for monitoring,
 * retro, and other spawned sessions).  Respects --agent-cmd.
 */
function buildAgentCommandFromPrompt(
  prompt: string,
  _teamRoot: string,
  options: WatchOptions,
): { cmd: string; args: string[] } {
  if (options.agentCmd) {
    const parts = options.agentCmd.trim().split(/\s+/);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), '--message', prompt];
    return { cmd, args };
  }

  const args = ['copilot', '--message', prompt];
  if (options.copilotFlags) {
    args.push(...options.copilotFlags.trim().split(/\s+/));
  }
  return { cmd: 'gh', args };
}

/**
 * Spawn a child process with a timeout.  Returns a promise that
 * resolves on success or rejects on failure/timeout.
 */
function spawnWithTimeout(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 },
      (err) => {
        if (err) {
          const execErr = err as Error & { killed?: boolean };
          const msg = execErr.killed
            ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
            : execErr.message;
          reject(new Error(msg));
        } else {
          resolve();
        }
      },
    );
  });
}

// ── Circuit Breaker State (#515) ─────────────────────────────────
// Persisted to .squad/ralph-circuit-breaker.json across restarts.

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
    status: 'closed',
    openedAt: null,
    cooldownMinutes: 2,
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    lastRateLimitRemaining: null,
    lastRateLimitTotal: null,
  };
}

function loadCBState(squadDir: string): CircuitBreakerState {
  const filePath = path.join(squadDir, 'ralph-circuit-breaker.json');
  try {
    const raw = storage.readSync(filePath);
    if (!raw) return defaultCBState();
    return JSON.parse(raw);
  } catch {
    return defaultCBState();
  }
}

function saveCBState(squadDir: string, state: CircuitBreakerState): void {
  storage.writeSync(
    path.join(squadDir, 'ralph-circuit-breaker.json'),
    JSON.stringify(state, null, 2),
  );
}

/**
 * Run watch command — Ralph's local polling process.
 *
 * Accepts the new {@link WatchOptions} bag. When `options.execute` is
 * false (the default) the behaviour is identical to the original
 * triage-only loop.
 */
export async function runWatch(dest: string, options: WatchOptions): Promise<void> {
  const { intervalMinutes } = options;

  // Validate interval
  if (isNaN(intervalMinutes) || intervalMinutes < 1) {
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
  const platform = createWatchPlatform(options, path.dirname(squadDirInfo.path));

  // Verify platform CLI availability
  if (!(await platform.checkAvailable())) {
    const cliName = options.platform === 'ado' ? 'az' : 'gh';
    const installUrl = options.platform === 'ado'
      ? 'https://aka.ms/install-az-cli'
      : 'https://cli.github.com';
    fatal(`${cliName} CLI not found — install from ${installUrl}`);
  }
  
  if (!(await platform.checkAuthenticated())) {
    const cliName = options.platform === 'ado' ? 'az' : 'gh';
    const authCmd = options.platform === 'ado' ? 'az login' : 'gh auth login';
    console.error(`${YELLOW}⚠️${RESET} ${cliName} CLI not authenticated`);
    console.error(`   Run: ${BOLD}${authCmd}${RESET}\n`);
    fatal(`${cliName} authentication required`);
  }
  
  // Parse team.md
  const content = storage.readSync(teamMd) ?? '';
  const roster = parseRoster(content);
  const routingContent = storage.existsSync(routingMdPath) ? (storage.readSync(routingMdPath) ?? '') : '';
  const rules = parseRoutingRules(routingContent);
  const modules = parseModuleOwnership(routingContent);
  
  // Load machine capabilities for needs:* label filtering (#514)
  const { loadCapabilities } = await import('@bradygaster/squad-sdk/ralph/capabilities');
  const capabilities = await loadCapabilities(teamRoot);
  
  if (capabilities) {
    console.log(`${DIM}📦 Machine: ${capabilities.machine} — ${capabilities.capabilities.length} capabilities loaded${RESET}`);
  }
  
  if (roster.length === 0) {
    fatal('No squad members found in team.md');
  }
  
  const hasCopilot = content.includes('🤖 Coding Agent') || content.includes('@copilot');
  const autoAssign = content.includes('<!-- copilot-auto-assign: true -->');
  const monitorSessionId = 'ralph-watch';
  const eventBus = new EventBus();
  const monitor = new RalphMonitor({
    teamRoot,
    healthCheckInterval: intervalMinutes * 60 * 1000,
    staleSessionThreshold: intervalMinutes * 60 * 1000 * 3,
    statePath: path.join(squadDirInfo.path, '.ralph-state.json'),
  });
  await monitor.start(eventBus);
  await eventBus.emit({
    type: 'session:created',
    sessionId: monitorSessionId,
    agentName: 'Ralph',
    payload: { intervalMinutes },
    timestamp: new Date(),
  });
  
  // Print startup banner
  const modeTag = options.execute ? ` ${BOLD}(Execute)${RESET}` : '';
  const platformTag = options.platform ? ` [${options.platform}]` : '';
  console.log(`\n${BOLD}🔄 Ralph — Watch Mode${RESET}${modeTag}${platformTag}`);
  console.log(`${DIM}Polling every ${intervalMinutes} minute(s) for squad work. Ctrl+C to stop.${RESET}`);
  if (options.execute && options.copilotFlags) {
    console.log(`${DIM}Copilot flags: ${options.copilotFlags}${RESET}`);
  }
  if (options.execute) {
    console.log(`${DIM}Max concurrent: ${options.maxConcurrent ?? 1} | Timeout: ${options.issueTimeoutMinutes ?? 30}m${RESET}`);
  }
  // Print active opt-in features
  const activeFeatures: string[] = [];
  if (options.monitorTeams) activeFeatures.push('Teams');
  if (options.monitorEmail) activeFeatures.push('Email');
  if (options.board) activeFeatures.push(`Board(#${options.boardProject ?? 1})`);
  if (options.twoPass) activeFeatures.push('TwoPass');
  if (options.waveDispatch) activeFeatures.push('WaveDispatch');
  if (options.retro) activeFeatures.push('Retro');
  if (options.decisionHygiene) activeFeatures.push('DecisionHygiene');
  if (options.channelRouting) activeFeatures.push('ChannelRouting');
  if (activeFeatures.length > 0) {
    console.log(`${DIM}Opt-in: ${activeFeatures.join(', ')}${RESET}`);
  }
  console.log();
  
  // Initialize circuit breaker (#515)
  const circuitBreaker = new PredictiveCircuitBreaker();
  let cbState = loadCBState(squadDirInfo.path);
  let round = 0;
  let roundInProgress = false;

  /**
   * Gate a round through the circuit breaker, then delegate to the
   * existing runCheck + reportBoard flow. When execute mode is on,
   * also run selfPull and spawn agent processes for eligible issues.
   */
  async function executeRound(): Promise<void> {
    const ts = new Date().toLocaleTimeString();

    // Check if circuit is open and cooldown hasn't elapsed
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

    // Pre-flight: sample rate limit headers
    try {
      const rl = await platform.checkRateLimit();
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
    } catch {
      // Rate limit check failed — proceed anyway, runCheck has its own catch
    }

    // ── Execute mode: keep work-tree up-to-date ────────────────
    if (options.execute) {
      await selfPull(teamRoot);
    }

    // ── SubSquad discovery (best-effort, informational) ──────────
    const subSquads = discoverSubSquads(teamRoot);
    if (subSquads.length > 0 && round === 1) {
      console.log(`${DIM}📂 Discovered ${subSquads.length} subsquad(s): ${subSquads.map(s => s.name).join(', ')}${RESET}`);
    }

    // ── Scanning ─────────────────────────────────────────────────
    round++;
    let roundState: BoardState;

    if (options.twoPass) {
      const { issues, stats } = await twoPassScan(roster, capabilities, platform);
      console.log(`${DIM}[two-pass] ${stats.total} total, ${stats.actionable} actionable${RESET}`);
      // Run the standard check for triage (labels, PRs), then overlay execution
      roundState = await runCheck(rules, modules, roster, hasCopilot, autoAssign, capabilities, platform);

      // Execute mode with two-pass results
      if (options.execute && issues.length > 0) {
        const executable = findExecutableIssues(roster, capabilities, issues);
        const batch = executable.slice(0, options.maxConcurrent ?? 1);

        if (options.waveDispatch) {
          const results = await waveDispatch(batch, teamRoot, options, platform);
          roundState.executed = results.executed;
        } else {
          const results = await Promise.all(
            batch.map(issue => executeIssue(issue, teamRoot, options, platform)),
          );
          roundState.executed = results.filter(r => r.success).length;
        }
      }
    } else {
      // ── Delegate to existing check cycle (untouched) ──────────
      roundState = await runCheck(rules, modules, roster, hasCopilot, autoAssign, capabilities, platform);

      // ── Execute mode: find and work on eligible issues ────────
      if (options.execute) {
        const allIssues = await platform.listWorkItems({ label: 'squad', state: 'open', limit: 50 });
        const executable = findExecutableIssues(roster, capabilities, allIssues);
        const batch = executable.slice(0, options.maxConcurrent ?? 1);

        if (options.waveDispatch) {
          const results = await waveDispatch(batch, teamRoot, options, platform);
          roundState.executed = results.executed;
        } else {
          const results = await Promise.all(
            batch.map(issue => executeIssue(issue, teamRoot, options, platform)),
          );
          roundState.executed = results.filter(r => r.success).length;
        }
      }
    }

    // ── Board lifecycle (opt-in) ─────────────────────────────────
    if (options.board) {
      await reconcileBoard({ projectNumber: options.boardProject });
      await archiveDoneItems({ projectNumber: options.boardProject });
    }

    // ── Monitoring (opt-in) ──────────────────────────────────────
    if (options.monitorTeams) await monitorTeams(teamRoot, options);
    if (options.monitorEmail) await monitorEmail(teamRoot, options);

    // ── Housekeeping (opt-in) ────────────────────────────────────
    if (options.retro) await checkRetro(teamRoot, options);
    if (options.decisionHygiene) await cleanDecisionInbox(teamRoot, options);

    await eventBus.emit({
      type: 'agent:milestone',
      sessionId: monitorSessionId,
      agentName: 'Ralph',
      payload: { milestone: `Completed watch round ${round}`, task: 'watch cycle' },
      timestamp: new Date(),
    });
    await monitor.healthCheck();
    reportBoard(roundState, round);

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
  }
  
  // Run immediately, then on interval
  await executeRound();
  
  return new Promise<void>((resolve) => {
    const intervalId = setInterval(
      async () => {
        // Prevent overlapping rounds when a previous one is still running
        if (roundInProgress) return;
        roundInProgress = true;
        try {
          await executeRound();
        } catch (e) {
          const err = e as Error;
          if (platform.isRateLimitError(err)) {
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
      intervalMinutes * 60 * 1000
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
        type: 'session:destroyed',
        sessionId: monitorSessionId,
        agentName: 'Ralph',
        payload: null,
        timestamp: new Date(),
      });
      await monitor.stop();
      saveCBState(squadDirInfo.path, cbState);
      console.log(`\n${DIM}🔄 Ralph — Watch stopped${RESET}`);
      resolve();
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
