/**
 * Health-check capability — pre-round watchdog.
 *
 * Ported from ralph-watch.ps1 `Invoke-RalphHealthCheck`.
 * Runs in the `pre-scan` phase and verifies:
 *   1. gh CLI authenticated
 *   2. Circuit breaker state file is valid
 *   3. Disk space above threshold (configurable, default 500 MB)
 *   4. Git branch matches expected (optional)
 *
 * Config (via squad.config.ts → watch.capabilities["health-check"]):
 *   diskThresholdMB   – minimum free disk in MB (default: 500)
 *   expectedBranch    – warn if not on this branch (optional)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

const execFileAsync = promisify(execFile);

export interface HealthCheckResult {
  healed: string[];
  warnings: string[];
}

export class HealthCheckCapability implements WatchCapability {
  readonly name = 'health-check';
  readonly description = 'Pre-round watchdog: verify auth, disk space, branch, CB state';
  readonly configShape = 'object' as const;
  readonly requires = ['gh'];
  readonly phase = 'pre-scan' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    return { ok: true };
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const healed: string[] = [];
    const warnings: string[] = [];
    const config = context.config as Record<string, unknown>;
    const diskThresholdMB = (config['diskThresholdMB'] as number) ?? 500;
    const expectedBranch = config['expectedBranch'] as string | undefined;

    // 1. Verify gh auth
    try {
      await execFileAsync('gh', ['auth', 'status'], { timeout: 10_000 });
    } catch {
      // Try extracting auth info from git remote (P3 auth fallback)
      const patFromRemote = await extractPatFromRemote(context.teamRoot);
      if (patFromRemote) {
        healed.push('Detected PAT in git remote URL — gh auth may need refresh');
      } else {
        warnings.push('gh auth: not authenticated — run "gh auth login"');
      }
    }

    // 2. Validate circuit breaker state file
    const cbPath = path.join(context.teamRoot, '.squad', 'ralph-circuit-breaker.json');
    try {
      if (fs.existsSync(cbPath)) {
        const rawContent = fs.readFileSync(cbPath, 'utf-8');
        const parsed = JSON.parse(rawContent);
        // Check for nested schema (legacy)
        if (!parsed.preferredModel && parsed.model_fallback) {
          healed.push('CB schema: would convert nested→flat on next use');
        }
        // Check for empty model
        if (parsed.currentModel === '' || parsed.currentModel === null) {
          warnings.push('CB state has empty currentModel — circuit-breaker will auto-reset');
        }
      }
    } catch {
      // No CB file is fine — will be created on demand
    }

    // 3. Disk space check
    try {
      const freeBytes = await getFreeDiskSpace(context.teamRoot);
      const freeMB = Math.floor(freeBytes / (1024 * 1024));
      if (freeMB < diskThresholdMB) {
        warnings.push(`Low disk space: ${freeMB} MB free (threshold: ${diskThresholdMB} MB)`);
      }
    } catch {
      // Disk check failed — non-blocking
    }

    // 4. Branch drift check
    if (expectedBranch) {
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: context.teamRoot,
          timeout: 5_000,
        });
        const current = stdout.trim();
        if (current && current !== expectedBranch) {
          warnings.push(`Branch drift: on "${current}" (expected "${expectedBranch}")`);
        }
      } catch { /* not a git repo or other error */ }
    }

    const summary = healed.length > 0 || warnings.length > 0
      ? `healed: ${healed.length}, warnings: ${warnings.length}`
      : 'all checks passed';

    return {
      success: warnings.length === 0,
      summary,
      data: { healed, warnings },
    };
  }
}

/** Try extracting a PAT from git remote URL (https://<pat>@github.com/...) */
async function extractPatFromRemote(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {
      cwd,
      timeout: 5_000,
    });
    const url = stdout.trim();
    // Pattern: https://<token>@github.com/...
    const match = url.match(/https:\/\/([^@]+)@github\.com/);
    if (match && match[1] && match[1] !== 'oauth2') {
      return match[1];
    }
  } catch { /* not available */ }
  return null;
}

/** Get free disk space in bytes for the drive containing the given path. */
async function getFreeDiskSpace(dirPath: string): Promise<number> {
  const platform = process.platform;
  if (platform === 'win32') {
    const drive = path.parse(path.resolve(dirPath)).root;
    const { stdout } = await execFileAsync('wmic', [
      'logicaldisk', 'where', `DeviceID='${drive.replace('\\', '')}'`,
      'get', 'FreeSpace', '/value',
    ], { timeout: 5_000 });
    const match = stdout.match(/FreeSpace=(\d+)/);
    return match ? parseInt(match[1]!, 10) : Infinity;
  }
  // Unix: use df
  const { stdout } = await execFileAsync('df', ['--output=avail', '-B1', dirPath], {
    timeout: 5_000,
  });
  const lines = stdout.trim().split('\n');
  return parseInt(lines[lines.length - 1]!.trim(), 10) || Infinity;
}
