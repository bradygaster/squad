/**
 * Watch command — Ralph's standalone polling process
 */

import path from 'node:path';
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

export interface BoardState {
  untriaged: number;
  assigned: number;
  drafts: number;
  needsReview: number;
  changesRequested: number;
  ciFailures: number;
  readyToMerge: number;
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
      ...prState,
    };
  } catch (e) {
    const err = e as Error;
    console.error(`${RED}✗${RESET} [${timestamp}] Check failed: ${err.message}`);
    return emptyBoardState();
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
 * Run watch command — Ralph's local polling process
 */
export async function runWatch(dest: string, intervalMinutes: number): Promise<void> {
  // Validate interval
  if (isNaN(intervalMinutes) || intervalMinutes < 1) {
    fatal('--interval must be a positive number of minutes');
  }
  
  // Detect squad directory
  const squadDirInfo = detectSquadDir(dest);
  const teamMd = path.join(squadDirInfo.path, 'team.md');
  const routingMdPath = path.join(squadDirInfo.path, 'routing.md');
  
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
  const capabilities = await loadCapabilities(path.dirname(squadDirInfo.path));
  
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
    teamRoot: path.dirname(squadDirInfo.path),
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
  console.log(`\n${BOLD}🔄 Ralph — Watch Mode${RESET}`);
  console.log(`${DIM}Polling every ${intervalMinutes} minute(s) for squad work. Ctrl+C to stop.${RESET}\n`);
  
  // Initialize circuit breaker (#515)
  const circuitBreaker = new PredictiveCircuitBreaker();
  let cbState = loadCBState(squadDirInfo.path);
  let round = 0;
  let roundInProgress = false;

  /**
   * Gate a round through the circuit breaker, then delegate to the
   * existing runCheck + reportBoard flow. This wrapper is the ONLY
   * new control flow — everything inside is unchanged.
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

    // ── Delegate to existing check cycle (untouched) ────────────
    round++;
    const roundState = await runCheck(rules, modules, roster, hasCopilot, autoAssign, capabilities);
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
