/**
 * Platform-specific Ralph commands for triage and work management.
 *
 * @module platform/ralph-commands
 */

import type { PlatformType } from './types.js';

export interface RalphCommands {
  listUntriaged: string;
  listAssigned: string;
  listOpenPRs: string;
  listDraftPRs: string;
  createBranch: string;
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
    createPR:
      'az repos pr create --title "{title}" --description "{description}" --source-branch {sourceBranch} --target-branch {targetBranch}',
    mergePR:
      'az repos pr update --id {id} --status completed',
    createWorkItem:
      'az boards work-item create --type "{workItemType}" --title "{title}" --description "{description}" --fields "System.Tags={tags}"',
  };
}
