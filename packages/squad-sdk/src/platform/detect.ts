/**
 * Auto-detect platform from git remote URL.
 *
 * @module platform/detect
 */

import { execSync } from 'node:child_process';
import type { PlatformType, WorkItemSource } from './types.js';

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

/** Normalized remote info for repo-keyed discovery */
export interface NormalizedRemote {
  provider: 'github' | 'azure-devops' | 'unknown';
  org: string;
  project?: string;
  repo: string;
  key: string;
  normalizedUrl: string;
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
 * Defaults to 'github' if detection fails.
 */
export function detectPlatform(repoRoot: string): PlatformType {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return detectPlatformFromUrl(remoteUrl);
  } catch {
    return 'github';
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

/**
 * Strip a trailing `.git` suffix from a string.
 */
function stripDotGit(s: string): string {
  return s.endsWith('.git') ? s.slice(0, -4) : s;
}

/**
 * Normalize a git remote URL into a canonical repo identity.
 *
 * Pure function — no I/O. Handles GitHub HTTPS/SSH, Azure DevOps HTTPS
 * (modern + legacy visualstudio.com), and Azure DevOps SSH. All keys are
 * lowercased. `DefaultCollection/` is stripped from legacy ADO URLs.
 *
 * Returns a `NormalizedRemote` with `key` suitable for repo-keyed discovery
 * and `normalizedUrl` for pattern matching.
 */
export function normalizeRemoteUrl(url: string): NormalizedRemote {
  const trimmed = url.trim();

  // ─── GitHub HTTPS: https://github.com/owner/repo[.git] ──────────────
  const ghHttps = trimmed.match(
    /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (ghHttps) {
    const org = ghHttps[1]!.toLowerCase();
    const repo = ghHttps[2]!.toLowerCase();
    return {
      provider: 'github',
      org,
      repo,
      key: `${org}/${repo}`,
      normalizedUrl: `github.com/${org}/${repo}`,
    };
  }

  // ─── GitHub SSH (ssh:// form): ssh://[user@]github.com/owner/repo[.git]
  const ghSshUrl = trimmed.match(
    /^ssh:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (ghSshUrl) {
    const org = ghSshUrl[1]!.toLowerCase();
    const repo = ghSshUrl[2]!.toLowerCase();
    return {
      provider: 'github',
      org,
      repo,
      key: `${org}/${repo}`,
      normalizedUrl: `github.com/${org}/${repo}`,
    };
  }

  // ─── GitHub SSH: git@github.com:owner/repo[.git] ────────────────────
  const ghSsh = trimmed.match(
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (ghSsh) {
    const org = ghSsh[1]!.toLowerCase();
    const repo = ghSsh[2]!.toLowerCase();
    return {
      provider: 'github',
      org,
      repo,
      key: `${org}/${repo}`,
      normalizedUrl: `github.com/${org}/${repo}`,
    };
  }

  // ─── ADO HTTPS modern: https://[user@]dev.azure.com/org/project/_git/repo[.git] ─
  const adoHttps = trimmed.match(
    /^https?:\/\/(?:[^@]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (adoHttps) {
    const org = adoHttps[1]!.toLowerCase();
    const project = adoHttps[2]!.toLowerCase();
    const repo = stripDotGit(adoHttps[3]!).toLowerCase();
    return {
      provider: 'azure-devops',
      org,
      project,
      repo,
      key: `${org}/${project}/${repo}`,
      normalizedUrl: `dev.azure.com/${org}/${project}/_git/${repo}`,
    };
  }

  // ─── ADO SSH (ssh:// form): ssh://[user@]ssh.dev.azure.com/v3/org/project/repo[.git]
  const adoSshUrl = trimmed.match(
    /^ssh:\/\/(?:[^@]+@)?ssh\.dev\.azure\.com\/v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (adoSshUrl) {
    const org = adoSshUrl[1]!.toLowerCase();
    const project = adoSshUrl[2]!.toLowerCase();
    const repo = stripDotGit(adoSshUrl[3]!).toLowerCase();
    return {
      provider: 'azure-devops',
      org,
      project,
      repo,
      key: `${org}/${project}/${repo}`,
      normalizedUrl: `ssh.dev.azure.com/${org}/${project}/${repo}`,
    };
  }

  // ─── ADO SSH: git@ssh.dev.azure.com:v3/org/project/repo[.git] ──────
  const adoSsh = trimmed.match(
    /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (adoSsh) {
    const org = adoSsh[1]!.toLowerCase();
    const project = adoSsh[2]!.toLowerCase();
    const repo = stripDotGit(adoSsh[3]!).toLowerCase();
    return {
      provider: 'azure-devops',
      org,
      project,
      repo,
      key: `${org}/${project}/${repo}`,
      normalizedUrl: `ssh.dev.azure.com/${org}/${project}/${repo}`,
    };
  }

  // ─── ADO Legacy: https://org.visualstudio.com/[DefaultCollection/]project/_git/repo[.git]
  const adoLegacy = trimmed.match(
    /^https?:\/\/(?:[^@]+@)?([^/.]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/]+?)(?:\.git)?\/?$/i,
  );
  if (adoLegacy) {
    const org = adoLegacy[1]!.toLowerCase();
    const project = adoLegacy[2]!.toLowerCase();
    const repo = stripDotGit(adoLegacy[3]!).toLowerCase();
    return {
      provider: 'azure-devops',
      org,
      project,
      repo,
      key: `${org}/${project}/${repo}`,
      normalizedUrl: `${org}.visualstudio.com/${project}/_git/${repo}`,
    };
  }

  // ─── Unknown provider — best-effort normalization ───────────────────
  let normalized = trimmed;
  // Strip protocol
  normalized = normalized.replace(/^(?:https?:\/\/|git@|ssh:\/\/)/, '');
  // Normalize SSH colon syntax
  normalized = normalized.replace(/^([^/:]+):(.+)$/, '$1/$2');
  // Strip auth components
  normalized = normalized.replace(/^[^@]+@/, '');
  // Strip trailing .git and slashes
  normalized = stripDotGit(normalized).replace(/\/+$/, '');
  normalized = normalized.toLowerCase();

  // Extract last path segment as repo name
  const segments = normalized.split('/').filter(Boolean);
  const repo = segments.length > 0 ? segments[segments.length - 1]! : '';

  return {
    provider: 'unknown',
    org: '',
    repo,
    key: normalized,
    normalizedUrl: normalized,
  };
}
