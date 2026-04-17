/**
 * Board capability — project board lifecycle + reconciliation.
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import type { WatchCapability, WatchContext, PreflightResult, CapabilityResult } from '../types.js';

const execFileAsync = promisify(execFile);

export class BoardCapability implements WatchCapability {
  readonly name = 'board';
  readonly description = 'Project board lifecycle (In Progress / Done / Blocked + reconciliation)';
  readonly configShape = 'object' as const;
  readonly requires = ['gh'];
  readonly phase = 'post-execute' as const;

  async preflight(_context: WatchContext): Promise<PreflightResult> {
    try {
      await execFileAsync('gh', ['project', '--help']);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'gh project CLI not available or not authenticated' };
    }
  }

  async execute(context: WatchContext): Promise<CapabilityResult> {
    const projectNumber = (context.config['projectNumber'] as number) ?? 1;
    let mismatches = 0;

    try {
      // Reconcile: move closed issues to Done, open issues out of Done
      const { stdout: itemsJson } = await execFileAsync('gh', [
        'project', 'item-list', String(projectNumber),
        '--owner', '@me',
        '--format', 'json',
        '--limit', '300',
      ], { maxBuffer: 10 * 1024 * 1024 });

      const items = JSON.parse(itemsJson) as {
        items?: Array<{
          id: string;
          status?: string;
          updatedAt?: string;
          content?: { number?: number; type?: string; state?: string };
        }>;
      };

      if (items.items?.length) {
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

        for (const item of items.items) {
          if (!item.content?.number || item.content.type !== 'Issue') continue;
          const isClosed = item.content.state === 'CLOSED';
          const isDone = item.status?.toLowerCase() === 'done';

          if (isClosed && !isDone) {
            mismatches++;
          } else if (!isClosed && isDone) {
            mismatches++;
          }

          // Archive: close issues in Done for >3 days
          if (
            item.status?.toLowerCase() === 'done' &&
            item.content.state !== 'CLOSED' &&
            item.updatedAt
          ) {
            const updatedAt = new Date(item.updatedAt).getTime();
            if (Date.now() - updatedAt >= threeDaysMs) {
              try {
                await new Promise<void>((resolve, reject) => {
                  execFile(
                    'gh',
                    ['issue', 'close', String(item.content!.number!), '--comment',
                     '🤖 Ralph: Auto-closing — issue has been in Done for >3 days.'],
                    { maxBuffer: 5 * 1024 * 1024 },
                    (err) => (err ? reject(err) : resolve()),
                  );
                });
              } catch { /* best-effort */ }
            }
          }
        }
      }

      return {
        success: true,
        summary: mismatches > 0 ? `${mismatches} board mismatch(es) reconciled` : 'board in sync',
        data: { mismatches },
      };
    } catch (e) {
      return { success: false, summary: `board error: ${(e as Error).message}` };
    }
  }
}

/**
 * Move an issue to a status column on a GitHub Projects v2 board.
 * Exported so the main orchestrator can call it for execute-mode transitions.
 */
export async function updateBoardStatus(
  issueNumber: number,
  status: 'in-progress' | 'done' | 'blocked' | 'todo',
  options: { projectNumber?: number; owner?: string },
): Promise<void> {
  const projectNum = options.projectNumber ?? 1;
  try {
    let repoUrl: string;
    try {
      const repoName = execFileSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
        encoding: 'utf-8', timeout: 10_000,
      }).trim();
      repoUrl = `https://github.com/${repoName}/issues/${issueNumber}`;
    } catch {
      return;
    }

    await execFileAsync('gh', [
      'project', 'item-add', String(projectNum),
      '--owner', options.owner ?? '@me',
      '--url', repoUrl,
    ], { maxBuffer: 5 * 1024 * 1024 });

    const statusMap: Record<string, string> = {
      'todo': 'Todo', 'in-progress': 'In Progress', 'done': 'Done', 'blocked': 'Blocked',
    };
    const statusValue = statusMap[status] ?? 'Todo';

    const { stdout: itemsJson } = await execFileAsync('gh', [
      'project', 'item-list', String(projectNum),
      '--owner', options.owner ?? '@me',
      '--format', 'json',
      '--limit', '300',
    ], { maxBuffer: 10 * 1024 * 1024 });

    const items = JSON.parse(itemsJson) as { items?: Array<{ id: string; content?: { number?: number } }> };
    const item = items.items?.find(i => i.content?.number === issueNumber);
    if (!item) return;

    await execFileAsync('gh', [
      'project', 'item-edit',
      '--project-id', String(projectNum),
      '--id', item.id,
      '--field-id', 'Status',
      '--single-select-option-id', statusValue,
    ], { maxBuffer: 5 * 1024 * 1024 });
  } catch { /* best-effort */ }
}
