/**
 * Platform module — factory + barrel exports.
 *
 * @module platform
 */

export type { PlatformType, WorkItem, PullRequest, PlatformAdapter, WorkItemSource, HybridPlatformConfig, CommunicationChannel, CommunicationReply, CommunicationConfig, CommunicationAdapter } from './types.js';
export type { GitHubRemoteInfo, AzureDevOpsRemoteInfo, NormalizedRemote } from './detect.js';
export { detectPlatform, detectPlatformFromUrl, detectWorkItemSource, parseGitHubRemote, parseAzureDevOpsRemote, getRemoteUrl, normalizeRemoteUrl } from './detect.js';
export { GitHubAdapter } from './github.js';
export { AzureDevOpsAdapter } from './azure-devops.js';
export type { AdoWorkItemConfig, WorkItemTypeInfo } from './azure-devops.js';
export { getAvailableWorkItemTypes, validateWorkItemType } from './azure-devops.js';
export { PlannerAdapter, mapPlannerTaskToWorkItem } from './planner.js';
export { getRalphScanCommands } from './ralph-commands.js';
export type { RalphCommands } from './ralph-commands.js';
export { FileLogCommunicationAdapter } from './comms-file-log.js';
export { GitHubDiscussionsCommunicationAdapter } from './comms-github-discussions.js';
export { ADODiscussionCommunicationAdapter } from './comms-ado-discussions.js';
export { createCommunicationAdapter } from './comms.js';

import { join } from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { PlatformAdapter } from './types.js';
import { detectPlatform, getRemoteUrl, parseGitHubRemote, parseAzureDevOpsRemote } from './detect.js';
import { GitHubAdapter } from './github.js';
import { AzureDevOpsAdapter } from './azure-devops.js';
import type { AdoWorkItemConfig } from './azure-devops.js';

const storage = new FSStorageProvider();

/**
 * Read ADO work item config from .squad/config.json if present.
 */
function readAdoConfig(repoRoot: string): AdoWorkItemConfig | undefined {
  const configPath = join(repoRoot, '.squad', 'config.json');
  if (!storage.existsSync(configPath)) return undefined;
  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.ado && typeof parsed.ado === 'object') {
      return parsed.ado as AdoWorkItemConfig;
    }
  } catch { /* ignore parse errors */ }
  return undefined;
}

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
    const adoConfig = readAdoConfig(repoRoot);
    return new AzureDevOpsAdapter(info.org, info.project, info.repo, adoConfig);
  }

  const info = parseGitHubRemote(remoteUrl);
  if (!info) {
    throw new Error(`Could not parse GitHub remote URL: ${remoteUrl}`);
  }
  return new GitHubAdapter(info.owner, info.repo);
}
