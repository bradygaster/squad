/**
 * Watch command — Ralph's standalone polling process
 */

import path from 'node:path';
import { execFile, type ChildProcess } from 'node:child_process';
import { FSStorageProvider } from '@bradygaster/squad-sdk';

const storage = new FSStorageProvider();
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
import { ghAvailable, ghAuthenticated, ghIssueList, ghIssueEdit, ghPrList, ghRateLimitCheck, isRateLimitError, type GhIssue, type GhPullRequest } from '../core/gh-cli.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';
import {
  PredictiveCircuitBreaker,
  getTrafficLight,
} from '@bradygaster/squad-sdk/ralph/rate-limiting';

/**
 * Options controlling the watch/triage loop.
 * When `execute` is false (default) the loop only triages — identical to
 * the original behaviour.
 */
export interface WatchOptions {
  intervalMinutes: number;
  execute?: boolean;
  copilotFlags?: string;
  /** Hidden — fully override the agent command (not shown in help). */
  agentCmd?: string;
  maxConcurrent?: number;
  issueTimeoutMinutes?: number;
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

async function checkPRs(roster: ReturnType<typeof parseRoster>): Promise<PRBoardState> {
  const timestamp = new Date().toLocaleTimeString();
  const prs = await ghPrList({ state: 'open', limit: 20 });
  
  // Filter to squad-related PRs (has squad label or branch starts with squad/)
  const squadPRs: GhPullRequest[] = prs.filter(pr =>
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
  capabilities: MachineCapabilities | null = null
): Promise<BoardState> {
  const timestamp = new Date().toLocaleTimeString();
  
  try {
    // Fetch open issues with squad label
    const issues = await ghIssueList({ label: 'squad', state: 'open', limit: 20 });
    
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
    let unassignedCopilot: GhIssue[] = [];
    if (hasCopilot && autoAssign) {
      try {
        const copilotIssues = await ghIssueList({ label: 'squad:copilot', state: 'open', limit: 10 });
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
          await ghIssueEdit(issue.number, { addLabel: triage.agent.label });
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
        await ghIssueEdit(issue.number, { addAssignee: 'copilot-swe-agent' });
        console.log(`${GREEN}✓${RESET} [${timestamp}] Assigned @copilot to #${issue.number} "${issue.title}"`);
      } catch (e) {
        const err = e as Error;
        console.error(`${RED}✗${RESET} [${timestamp}] Failed to assign @copilot to #${issue.number}: ${err.message}`);
      }
    }
    
    const prState = await checkPRs(roster);
    
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
  issue: GhIssue,
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
  issue: GhIssue,
  teamRoot: string,
  options: WatchOptions,
): Promise<ExecuteResult> {
  const ts = new Date().toLocaleTimeString();
  const timeoutMs = (options.issueTimeoutMinutes ?? 30) * 60_000;

  // Claim the issue
  try {
    await ghIssueEdit(issue.number, { addAssignee: '@me' });
  } catch {
    // best-effort — don't block execution
  }

  // Post "starting work" comment via gh CLI
  try {
    await new Promise<void>((resolve, reject) => {
      const cp: ChildProcess = execFile(
        'gh',
        ['issue', 'comment', String(issue.number), '--body', `🤖 Ralph: starting autonomous work on this issue.`],
        { maxBuffer: 5 * 1024 * 1024 },
        (err) => (err ? reject(err) : resolve()),
      );
    });
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
          const msg = (err as NodeJS.ErrnoException).killed
            ? `Timed out after ${options.issueTimeoutMinutes ?? 30}m`
            : (err as Error).message;
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
  issues: GhIssue[],
): GhIssue[] {
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
  
  // Verify gh CLI
  if (!(await ghAvailable())) {
    fatal('gh CLI not found — install from https://cli.github.com');
  }
  
  if (!(await ghAuthenticated())) {
    console.error(`${YELLOW}⚠️${RESET} gh CLI not authenticated`);
    console.error(`   Run: ${BOLD}gh auth login${RESET}\n`);
    fatal('gh authentication required');
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
  console.log(`\n${BOLD}🔄 Ralph — Watch Mode${RESET}${modeTag}`);
  console.log(`${DIM}Polling every ${intervalMinutes} minute(s) for squad work. Ctrl+C to stop.${RESET}`);
  if (options.execute && options.copilotFlags) {
    console.log(`${DIM}Copilot flags: ${options.copilotFlags}${RESET}`);
  }
  if (options.execute) {
    console.log(`${DIM}Max concurrent: ${options.maxConcurrent ?? 1} | Timeout: ${options.issueTimeoutMinutes ?? 30}m${RESET}`);
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
      const rl = await ghRateLimitCheck();
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
    } catch {
      // Rate limit check failed — proceed anyway, runCheck has its own catch
    }

    // ── Execute mode: keep work-tree up-to-date ────────────────
    if (options.execute) {
      await selfPull(teamRoot);
    }

    // ── Delegate to existing check cycle (untouched) ────────────
    round++;
    const roundState = await runCheck(rules, modules, roster, hasCopilot, autoAssign, capabilities);

    // ── Execute mode: find and work on eligible issues ──────────
    if (options.execute) {
      const allIssues = await ghIssueList({ label: 'squad', state: 'open', limit: 50 });
      const executable = findExecutableIssues(roster, capabilities, allIssues);
      const batch = executable.slice(0, options.maxConcurrent ?? 1);

      const results = await Promise.all(
        batch.map(issue => executeIssue(issue, teamRoot, options)),
      );
      roundState.executed = results.filter(r => r.success).length;
    }

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
          if (isRateLimitError(err)) {
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
