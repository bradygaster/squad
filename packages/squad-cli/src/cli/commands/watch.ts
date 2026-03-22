/**
 * Watch command — Ralph's standalone polling process
 */

import fs from 'node:fs';
import path from 'node:path';
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
import { ghAvailable, ghAuthenticated, ghIssueList, ghIssueEdit, ghPrList, type GhIssue, type GhPullRequest } from '../core/gh-cli.js';
import type { MachineCapabilities } from '@bradygaster/squad-sdk/ralph/capabilities';

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
  
  if (!fs.existsSync(teamMd)) {
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
  const content = fs.readFileSync(teamMd, 'utf8');
  const roster = parseRoster(content);
  const routingContent = fs.existsSync(routingMdPath) ? fs.readFileSync(routingMdPath, 'utf8') : '';
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
  
  let round = 0;
  
  // Run immediately, then on interval
  round++;
  const state = await runCheck(rules, modules, roster, hasCopilot, autoAssign, capabilities);
  await eventBus.emit({
    type: 'agent:milestone',
    sessionId: monitorSessionId,
    agentName: 'Ralph',
    payload: { milestone: `Completed watch round ${round}`, task: 'watch cycle' },
    timestamp: new Date(),
  });
  await monitor.healthCheck();
  reportBoard(state, round);
  
  return new Promise<void>((resolve) => {
    const intervalId = setInterval(
      async () => {
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
      console.log(`\n${DIM}🔄 Ralph — Watch stopped${RESET}`);
      resolve();
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
