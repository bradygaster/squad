/**
 * Communication adapter factory — creates the right adapter based on config.
 *
 * Reads `.squad/config.json` for the `communications` section.
 * Falls back to FileLog (always available) if nothing is configured.
 *
 * @module platform/comms
 */

import { join } from 'node:path';
import { FSStorageProvider } from '../storage/fs-storage-provider.js';
import type { CommunicationAdapter, CommunicationChannel, CommunicationConfig } from './types.js';
import { FileLogCommunicationAdapter } from './comms-file-log.js';
import { GitHubDiscussionsCommunicationAdapter } from './comms-github-discussions.js';
import { ADODiscussionCommunicationAdapter } from './comms-ado-discussions.js';
import { TeamsCommunicationAdapter } from './comms-teams.js';
import { detectPlatform, getRemoteUrl, parseGitHubRemote, parseAzureDevOpsRemote } from './detect.js';

const storage = new FSStorageProvider();

/**
 * Read communication config from `.squad/config.json`.
 */
function readCommsConfig(repoRoot: string): CommunicationConfig | undefined {
  const configPath = join(repoRoot, '.squad', 'config.json');
  if (!storage.existsSync(configPath)) return undefined;
  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.communications && typeof parsed.communications === 'object') {
      return parsed.communications as CommunicationConfig;
    }
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Create a communication adapter based on config or auto-detection.
 *
 * Priority:
 * 1. Explicit config in `.squad/config.json` → `communications.channel`
 * 2. Auto-detect from platform: GitHub → GitHubDiscussions, ADO → ADOWorkItemDiscussions
 * 3. Fallback: FileLog (always works)
 */
export function createCommunicationAdapter(repoRoot: string): CommunicationAdapter {
  const config = readCommsConfig(repoRoot);

  // Explicit config wins
  if (config?.channel) {
    return createAdapterByChannel(config.channel, repoRoot, config);
  }

  // Auto-detect from platform
  const platform = detectPlatform(repoRoot);
  const remoteUrl = getRemoteUrl(repoRoot);

  if (platform === 'github' && remoteUrl) {
    const info = parseGitHubRemote(remoteUrl);
    if (info) {
      return new GitHubDiscussionsCommunicationAdapter(info.owner, info.repo);
    }
  }

  if (platform === 'azure-devops' && remoteUrl) {
    const info = parseAzureDevOpsRemote(remoteUrl);
    if (info) {
      // Read ADO config for org/project override
      const configPath = join(repoRoot, '.squad', 'config.json');
      let adoOrg = info.org;
      let adoProject = info.project;
      if (storage.existsSync(configPath)) {
        try {
          const raw = storage.readSync(configPath) ?? '';
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const ado = parsed.ado as Record<string, unknown> | undefined;
          if (ado?.org && typeof ado.org === 'string') adoOrg = ado.org;
          if (ado?.project && typeof ado.project === 'string') adoProject = ado.project;
        } catch { /* ignore */ }
      }
      return new ADODiscussionCommunicationAdapter(adoOrg, adoProject);
    }
  }

  // Fallback: file-based logging (always available)
  return new FileLogCommunicationAdapter(repoRoot);
}

function createAdapterByChannel(
  channel: CommunicationChannel,
  repoRoot: string,
  config?: CommunicationConfig,
): CommunicationAdapter {
  const remoteUrl = getRemoteUrl(repoRoot);

  switch (channel) {
    case 'github-discussions': {
      if (!remoteUrl) throw new Error('No git remote — cannot create GitHub Discussions adapter');
      const info = parseGitHubRemote(remoteUrl);
      if (!info) throw new Error(`Cannot parse GitHub remote: ${remoteUrl}`);
      return new GitHubDiscussionsCommunicationAdapter(info.owner, info.repo);
    }
    case 'ado-work-items': {
      if (!remoteUrl) throw new Error('No git remote — cannot create ADO Discussions adapter');
      const info = parseAzureDevOpsRemote(remoteUrl);
      if (!info) throw new Error(`Cannot parse ADO remote: ${remoteUrl}`);
      return new ADODiscussionCommunicationAdapter(info.org, info.project);
    }
    case 'teams-webhook': {
      const teamsConfig = config?.teams ?? readTeamsConfig(repoRoot) ?? {};
      return new TeamsCommunicationAdapter(teamsConfig);
    }
    case 'file-log':
      return new FileLogCommunicationAdapter(repoRoot);
    default:
      return new FileLogCommunicationAdapter(repoRoot);
  }
}

/**
 * Read Teams-specific config from `.squad/config.json`.
 */
function readTeamsConfig(repoRoot: string): CommunicationConfig['teams'] | undefined {
  const configPath = join(repoRoot, '.squad', 'config.json');
  if (!storage.existsSync(configPath)) return undefined;
  try {
    const raw = storage.readSync(configPath) ?? '';
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const comms = parsed.communications as Record<string, unknown> | undefined;
    if (comms?.teams && typeof comms.teams === 'object') {
      return comms.teams as CommunicationConfig['teams'];
    }
  } catch { /* ignore */ }
  return undefined;
}
