/**
 * Platform-specific Ralph commands for triage and work management.
 *
 * @module platform/ralph-commands
 */

import * as path from 'node:path';
import type { PlatformType } from './types.js';

/**
 * Check if worktree mode is enabled.
 * Precedence: SQUAD_WORKTREES env > config > default false
 */
export function isWorktreeEnabled(config?: { worktrees?: boolean }): boolean {
  const envVal = process.env.SQUAD_WORKTREES;
  if (envVal === '1' || envVal === 'true') return true;
  if (envVal === '0' || envVal === 'false') return false;
  return config?.worktrees ?? false;
}

/**
 * Resolve the worktree path for an issue.
 * Convention: {repo-parent}/{repo-name}-{issue-number}
 */
export function resolveWorktreePath(
  repoRoot: string,
  issueNumber: string | number,
): string {
  const repoName = path.basename(repoRoot);
  const parentDir = path.dirname(repoRoot);
  return path.join(parentDir, `${repoName}-${issueNumber}`);
}

/**
 * Create a git worktree for an issue branch.
 * Returns the worktree path and command.
 */
export function createWorktreeCommand(
  repoRoot: string,
  branch: string,
  baseBranch: string,
  issueNumber: string | number,
): { command: string; worktreePath: string } {
  const worktreePath = resolveWorktreePath(repoRoot, issueNumber);
  const command = `git worktree add "${worktreePath}" -b ${branch} ${baseBranch}`;
  return { command, worktreePath };
}

/**
 * Remove a git worktree and optionally delete the merged branch.
 */
export function removeWorktreeCommand(
  worktreePath: string,
  branch?: string,
): string[] {
  const commands = [`git worktree remove "${worktreePath}"`];
  if (branch) {
    commands.push(`git branch -d ${branch}`);
  }
  return commands;
}

/**
 * Setup dependency management in a worktree (junction/symlink for node_modules).
 * Returns the command to run.
 */
export function setupWorktreeDepsCommand(
  mainRepoRoot: string,
  worktreePath: string,
): string {
  const mainNodeModules = path.join(mainRepoRoot, 'node_modules');
  const wtNodeModules = path.join(worktreePath, 'node_modules');

  if (process.platform === 'win32') {
    return `cmd /c mklink /J "${wtNodeModules}" "${mainNodeModules}"`;
  }
  return `ln -s "${mainNodeModules}" "${wtNodeModules}"`;
}

/**
 * Generate worktree variant for RalphCommands.
 * This is a helper used by all platform adapters.
 */
export function generateWorktreeVariant(
  repoRoot: string,
  branchName: string,
  baseBranch: string,
  issueNumber: string | number,
): {
  create: string;
  path: string;
  setupDeps: string;
  cleanup: string[];
} {
  const { command, worktreePath } = createWorktreeCommand(
    repoRoot,
    branchName,
    baseBranch,
    issueNumber,
  );
  const setupDeps = setupWorktreeDepsCommand(repoRoot, worktreePath);
  const cleanup = removeWorktreeCommand(worktreePath, branchName);

  return {
    create: command,
    path: worktreePath,
    setupDeps,
    cleanup,
  };
}


export interface RalphCommands {
  listUntriaged: string;
  listAssigned: string;
  listOpenPRs: string;
  listDraftPRs: string;
  /** Git branch creation command (checkout variant) */
  createBranch: string;
  /** Optional worktree variant for branch creation */
  createBranchWorktree?: {
    /** git worktree add command */
    create: string;
    /** Path to the created worktree */
    path: string;
    /** Command to setup dependency symlink/junction */
    setupDeps: string;
    /** Commands to cleanup the worktree */
    cleanup: string[];
  };
  createPR: string;
  mergePR: string;
  createWorkItem: string;
}

/**
 * Get Ralph scan/triage commands for a given platform.
 * GitHub → gh CLI commands
 * Azure DevOps → az CLI commands
 */
export function getRalphScanCommands(platform: PlatformType): RalphCommands {
  switch (platform) {
    case 'github':
      return getGitHubRalphCommands();
    case 'azure-devops':
      return getAzureDevOpsRalphCommands();
    case 'planner':
      return getPlannerRalphCommands();
    default:
      return getGitHubRalphCommands();
  }
}

/** Ralph commands for Planner via Graph API (az CLI token) */
export function getPlannerRalphCommands(): RalphCommands {
  return {
    listUntriaged:
      `curl -s -H "Authorization: Bearer $(az account get-access-token --resource-type ms-graph --query accessToken -o tsv)" "https://graph.microsoft.com/v1.0/planner/plans/{planId}/tasks?$filter=bucketId eq '{untriagedBucketId}'"`,
    listAssigned:
      `curl -s -H "Authorization: Bearer $(az account get-access-token --resource-type ms-graph --query accessToken -o tsv)" "https://graph.microsoft.com/v1.0/planner/plans/{planId}/tasks?$filter=bucketId eq '{memberBucketId}'"`,
    listOpenPRs:
      'echo "Planner does not manage PRs — use the repo adapter (GitHub or Azure DevOps)"',
    listDraftPRs:
      'echo "Planner does not manage PRs — use the repo adapter (GitHub or Azure DevOps)"',
    createBranch:
      'git checkout main && git pull && git checkout -b {branchName}',
    createBranchWorktree: {
      create: 'git worktree add "{worktreePath}" -b {branchName} {baseBranch}',
      path: '{worktreePath}',
      setupDeps: process.platform === 'win32'
        ? 'cmd /c mklink /J "{worktreePath}\\node_modules" "{repoRoot}\\node_modules"'
        : 'ln -s "{repoRoot}/node_modules" "{worktreePath}/node_modules"',
      cleanup: [
        'git worktree remove "{worktreePath}"',
        'git branch -d {branchName}',
      ],
    },
    createPR:
      'echo "Planner does not manage PRs — use the repo adapter (GitHub or Azure DevOps)"',
    mergePR:
      'echo "Planner does not manage PRs — use the repo adapter (GitHub or Azure DevOps)"',
    createWorkItem:
      `curl -s -X POST -H "Authorization: Bearer $(az account get-access-token --resource-type ms-graph --query accessToken -o tsv)" -H "Content-Type: application/json" -d '{"planId":"{planId}","title":"{title}","bucketId":"{bucketId}"}' "https://graph.microsoft.com/v1.0/planner/tasks"`,
  };
}

function getGitHubRalphCommands(): RalphCommands {
  return {
    listUntriaged:
      'gh issue list --label "squad:untriaged" --json number,title,labels,assignees --limit 20',
    listAssigned:
      'gh issue list --label "squad:{member}" --state open --json number,title,labels,assignees --limit 20',
    listOpenPRs:
      'gh pr list --state open --json number,title,headRefName,baseRefName,state,isDraft,reviewDecision,author --limit 20',
    listDraftPRs:
      'gh pr list --state open --draft --json number,title,headRefName,baseRefName,state,isDraft,reviewDecision,author --limit 20',
    createBranch:
      'git checkout main && git pull && git checkout -b {branchName}',
    createBranchWorktree: {
      create: 'git worktree add "{worktreePath}" -b {branchName} {baseBranch}',
      path: '{worktreePath}',
      setupDeps: process.platform === 'win32'
        ? 'cmd /c mklink /J "{worktreePath}\\node_modules" "{repoRoot}\\node_modules"'
        : 'ln -s "{repoRoot}/node_modules" "{worktreePath}/node_modules"',
      cleanup: [
        'git worktree remove "{worktreePath}"',
        'git branch -d {branchName}',
      ],
    },
    createPR:
      'gh pr create --title "{title}" --body "{description}" --head {sourceBranch} --base {targetBranch}',
    mergePR:
      'gh pr merge {id} --merge',
    createWorkItem:
      'gh issue create --title "{title}" --body "{description}" --label "{tags}"',
  };
}

function getAzureDevOpsRalphCommands(): RalphCommands {
  return {
    listUntriaged:
      `az boards query --wiql "SELECT [System.Id],[System.Title],[System.State],[System.Tags] FROM WorkItems WHERE [System.Tags] Contains 'squad:untriaged' ORDER BY [System.CreatedDate] DESC" --output table`,
    listAssigned:
      `az boards query --wiql "SELECT [System.Id],[System.Title],[System.State],[System.Tags] FROM WorkItems WHERE [System.Tags] Contains 'squad:{member}' AND [System.State] <> 'Closed' ORDER BY [System.CreatedDate] DESC" --output table`,
    listOpenPRs:
      'az repos pr list --status active --output table',
    listDraftPRs:
      'az repos pr list --status active --query "[?isDraft==`true`]" --output table',
    createBranch:
      'git checkout main && git pull && git checkout -b {branchName}',
    createBranchWorktree: {
      create: 'git worktree add "{worktreePath}" -b {branchName} {baseBranch}',
      path: '{worktreePath}',
      setupDeps: process.platform === 'win32'
        ? 'cmd /c mklink /J "{worktreePath}\\node_modules" "{repoRoot}\\node_modules"'
        : 'ln -s "{repoRoot}/node_modules" "{worktreePath}/node_modules"',
      cleanup: [
        'git worktree remove "{worktreePath}"',
        'git branch -d {branchName}',
      ],
    },
    createPR:
      'az repos pr create --title "{title}" --description "{description}" --source-branch {sourceBranch} --target-branch {targetBranch}',
    mergePR:
      'az repos pr update --id {id} --status completed',
    createWorkItem:
      'az boards work-item create --type "{workItemType}" --title "{title}" --description "{description}" --fields "System.Tags={tags}"',
  };
}
