/**
 * Auto-detect platform from git remote URL.
 *
 * @module platform/detect
 */

import { execSync } from 'node:child_process';
import type { PlatformType, WorkItemSource } from './types.js';

const PLATFORM_REMEDIATION = 'Could not detect platform — set SQUAD_PLATFORM to "github" or "azure-devops", or check `git remote get-url origin`.';

function getPlatformOverride(): PlatformType | undefined {
  const value = process.env['SQUAD_PLATFORM']?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === 'github' || value === 'azure-devops') return value;
  throw new Error(`${PLATFORM_REMEDIATION} Invalid SQUAD_PLATFORM value: ${value}`);
}

/** Parsed GitHub remote info */
export interface GitHubRemoteInfo {
  owner: string;
  repo: string;
}

/** Parsed Azure DevOps remote info */
export interface AzureDevOpsRemoteInfo {
  org: string;
  project: string;
  repo: string;
}

/**
 * Parse a GitHub remote URL into owner/repo.
 * Supports HTTPS and SSH formats:
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 */
export function parseGitHubRemote(url: string): GitHubRemoteInfo | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1]!, repo: httpsMatch[2]! };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1]!, repo: sshMatch[2]! };
  }

  return null;
}

/**
 * Parse an Azure DevOps remote URL into org/project/repo.
 * Supports multiple formats:
 *   https://dev.azure.com/org/project/_git/repo
 *   https://org@dev.azure.com/org/project/_git/repo
 *   git@ssh.dev.azure.com:v3/org/project/repo
 *   https://org.visualstudio.com/project/_git/repo
 */
export function parseAzureDevOpsRemote(url: string): AzureDevOpsRemoteInfo | null {
  // HTTPS dev.azure.com: https://dev.azure.com/org/project/_git/repo
  // Also handles: https://org@dev.azure.com/org/project/_git/repo
  const devAzureHttps = url.match(
    /dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/.]+?)(?:\.git)?$/i,
  );
  if (devAzureHttps) {
    return { org: devAzureHttps[1]!, project: devAzureHttps[2]!, repo: devAzureHttps[3]! };
  }

  // SSH dev.azure.com: git@ssh.dev.azure.com:v3/org/project/repo
  const devAzureSsh = url.match(
    /ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/.]+?)(?:\.git)?$/i,
  );
  if (devAzureSsh) {
    return { org: devAzureSsh[1]!, project: devAzureSsh[2]!, repo: devAzureSsh[3]! };
  }

  // Legacy visualstudio.com: https://org.visualstudio.com/project/_git/repo
  const vsMatch = url.match(
    /([^/.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/.]+?)(?:\.git)?$/i,
  );
  if (vsMatch) {
    return { org: vsMatch[1]!, project: vsMatch[2]!, repo: vsMatch[3]! };
  }

  return null;
}

/**
 * Detect platform type from git remote URL string.
 * Returns 'github' for github.com remotes, 'azure-devops' for ADO remotes.
 * Defaults to 'github' if unrecognized.
 */
export function detectPlatformFromUrl(url: string): PlatformType {
  if (/github\.com/i.test(url)) return 'github';
  if (/dev\.azure\.com/i.test(url) || /\.visualstudio\.com/i.test(url) || /ssh\.dev\.azure\.com/i.test(url)) {
    return 'azure-devops';
  }
  return 'github';
}

/**
 * Detect platform from a repository root by reading the git remote.
 * Reads 'origin' remote URL and determines whether it's GitHub or Azure DevOps.
 * Throws with remediation if detection fails.
 */
export function detectPlatform(repoRoot: string): PlatformType {
  const override = getPlatformOverride();
  if (override) return override;

  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return detectPlatformFromUrl(remoteUrl);
  } catch (err) {
    const detail = (err as Error).message;
    throw new Error(detail ? `${PLATFORM_REMEDIATION} ${detail}` : PLATFORM_REMEDIATION);
  }
}

/**
 * Detect work-item source for hybrid setups.
 * When a squad config specifies `workItems: 'planner'`, work items come from
 * Planner even though the repo is on GitHub or Azure DevOps.
 */
export function detectWorkItemSource(
  repoRoot: string,
  configWorkItems?: string,
): WorkItemSource {
  if (configWorkItems === 'planner') return 'planner';
  return detectPlatform(repoRoot);
}

/**
 * Get the origin remote URL for a repo, or null if unavailable.
 */
export function getRemoteUrl(repoRoot: string): string | null {
  try {
    return execSync('git remote get-url origin', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}
