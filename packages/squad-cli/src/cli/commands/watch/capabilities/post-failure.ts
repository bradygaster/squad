/**
 * Post-failure remediation — tiered self-healing response.
 *
 * Ported from ralph-watch.ps1 `Invoke-PostFailureRemediation`.
 * Tiered response based on consecutive failure count:
 *   Tier 1 (≥3):  Reset circuit breaker state
 *   Tier 2 (≥6):  Re-verify auth
 *   Tier 3 (≥9):  Git pull to get latest fixes
 *   Tier 4 (≥15): Extended pause + webhook alert
 *
 * This is a utility module — called from the main watch loop on errors.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ModelCircuitBreaker } from './circuit-breaker.js';

const execFileAsync = promisify(execFile);

export interface RemediationResult {
  actions: string[];
  pauseSeconds: number;
}

export async function runPostFailureRemediation(
  consecutiveFailures: number,
  round: number,
  teamRoot: string,
  circuitBreaker?: ModelCircuitBreaker,
): Promise<RemediationResult> {
  const actions: string[] = [];
  let pauseSeconds = 0;

  if (consecutiveFailures >= 3 && consecutiveFailures < 6) {
    // Tier 1: Reset circuit breaker
    if (circuitBreaker) {
      circuitBreaker.reset();
      actions.push('Tier1: Reset circuit breaker to defaults');
    }
  }

  if (consecutiveFailures >= 6 && consecutiveFailures < 9) {
    // Tier 2: Re-verify gh auth
    try {
      const { stdout } = await execFileAsync('gh', ['api', 'user', '--jq', '.login'], {
        timeout: 10_000,
      });
      actions.push(`Tier2: GH auth verified (${stdout.trim()})`);
    } catch {
      actions.push('Tier2: GH auth still failing');
    }
  }

  if (consecutiveFailures >= 9 && consecutiveFailures < 15) {
    // Tier 3: Git pull latest
    try {
      await execFileAsync('git', ['pull', '--rebase', '--quiet'], {
        cwd: teamRoot,
        timeout: 30_000,
      });
      actions.push('Tier3: Git pull --rebase succeeded');
    } catch {
      actions.push('Tier3: Git pull failed');
    }
  }

  if (consecutiveFailures >= 15) {
    // Tier 4: Extended pause
    pauseSeconds = 30 * 60; // 30 minutes
    actions.push(`Tier4: ${consecutiveFailures} failures — pausing ${pauseSeconds / 60} minutes`);
  }

  return { actions, pauseSeconds };
}
