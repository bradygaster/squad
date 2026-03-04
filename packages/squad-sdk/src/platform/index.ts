/**
 * Platform module — factory + barrel exports.
 *
 * @module platform
 */

export type { PlatformType, WorkItem, PullRequest, PlatformAdapter, WorkItemSource, HybridPlatformConfig } from './types.js';
export type { GitHubRemoteInfo, AzureDevOpsRemoteInfo } from './detect.js';
export { detectPlatform, detectPlatformFromUrl, detectWorkItemSource, parseGitHubRemote, parseAzureDevOpsRemote, getRemoteUrl } from './detect.js';
export { GitHubAdapter } from './github.js';
export { AzureDevOpsAdapter } from './azure-devops.js';
export { PlannerAdapter, mapPlannerTaskToWorkItem } from './planner.js';
export { getRalphScanCommands } from './ralph-commands.js';
export type { RalphCommands } from './ralph-commands.js';

import type { PlatformAdapter } from './types.js';
import { detectPlatform, getRemoteUrl, parseGitHubRemote, parseAzureDevOpsRemote } from './detect.js';
import { GitHubAdapter } from './github.js';
import { AzureDevOpsAdapter } from './azure-devops.js';

/**
 * Create a platform adapter by auto-detecting the platform from the repo's git remote.
 * Throws if required remote info cannot be parsed.
 */
export function createPlatformAdapter(repoRoot: string): PlatformAdapter {
  const platform = detectPlatform(repoRoot);
  const remoteUrl = getRemoteUrl(repoRoot);

  if (!remoteUrl) {
    throw new Error('No git remote "origin" found. Cannot create platform adapter.');
  }

  if (platform === 'azure-devops') {
    const info = parseAzureDevOpsRemote(remoteUrl);
    if (!info) {
      throw new Error(`Could not parse Azure DevOps remote URL: ${remoteUrl}`);
    }
    return new AzureDevOpsAdapter(info.org, info.project, info.repo);
  }

  const info = parseGitHubRemote(remoteUrl);
  if (!info) {
    throw new Error(`Could not parse GitHub remote URL: ${remoteUrl}`);
  }
  return new GitHubAdapter(info.owner, info.repo);
}
