/**
 * Impact analysis CLI command — `squad impact`.
 *
 * Thin wrapper around the SDK's impact analysis engine.
 * Retrieves diff via `gh` or `git`, delegates analysis to SDK.
 *
 * Usage:
 *   squad impact <PR#>              — analyze a PR by number
 *   squad impact --branch <name>    — analyze current branch vs base
 *   squad impact                    — analyze current branch vs dev
 *
 * Options:
 *   --json       Output as JSON
 *   --markdown   Output as Markdown (for PR comments)
 *   --base <b>   Base branch for comparison (default: dev)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
// NOTE: The /impact subpath export requires the co-released SDK version (lockstep with CLI).
import { analyzeImpact, formatReport, type OutputFormat } from '@bradygaster/squad-sdk/impact';
import { fatal } from '../core/errors.js';

interface ImpactArgs {
  prNumber?: number;
  branch?: string;
  base: string;
  format: OutputFormat;
}

function parseArgs(args: string[]): ImpactArgs {
  let prNumber: number | undefined;
  let branch: string | undefined;
  let base = 'dev';
  let format: OutputFormat = 'terminal';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--json') {
      format = 'json';
      continue;
    }
    if (arg === '--markdown') {
      format = 'markdown';
      continue;
    }
    if (arg === '--base') {
      base = args[i + 1] ?? 'dev';
      if (base.startsWith('--')) {
        fatal(`--base requires a branch name (got flag-like value: ${base})`);
      }
      i++;
      continue;
    }
    if (arg === '--branch') {
      branch = args[i + 1];
      if (!branch) fatal('--branch requires a branch name');
      i++;
      continue;
    }

    // Positional: PR number
    const num = parseInt(arg, 10);
    if (!Number.isNaN(num) && num > 0) {
      prNumber = num;
      continue;
    }
  }

  return { prNumber, branch, base, format };
}

function execGit(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fatal(`git command failed: git ${args.join(' ')}\n${message}`);
  }
}

function execGh(args: string[], cwd: string): string {
  try {
    return execFileSync('gh', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fatal(`gh command failed: gh ${args.join(' ')}\n${message}`);
  }
}

/**
 * Extract name-status entries from a unified diff produced by `gh pr diff`.
 * Parses `diff --git` headers and mode lines to determine file statuses.
 */
export function parseUnifiedDiffHeaders(unifiedDiff: string): string {
  const lines = unifiedDiff.split('\n');
  const entries: string[] = [];
  let currentFile = '';
  let currentStatus = 'M';
  let oldPath = '';

  function flush(): void {
    if (!currentFile) return;
    if (currentStatus === 'R') {
      entries.push(`R100\t${oldPath}\t${currentFile}`);
    } else {
      entries.push(`${currentStatus}\t${currentFile}`);
    }
  }

  for (const line of lines) {
    const diffMatch = line.match(/^diff --git a\/(.*) b\/(.*)$/);
    if (diffMatch) {
      flush();
      oldPath = diffMatch[1]!;
      currentFile = diffMatch[2]!;
      currentStatus = 'M';
      continue;
    }
    if (line.startsWith('new file mode')) {
      currentStatus = 'A';
    } else if (line.startsWith('deleted file mode')) {
      currentStatus = 'D';
    } else if (line.startsWith('rename from ')) {
      oldPath = line.slice('rename from '.length);
      currentStatus = 'R';
    } else if (line.startsWith('rename to ')) {
      currentFile = line.slice('rename to '.length);
    } else if (line.startsWith('copy from ')) {
      oldPath = line.slice('copy from '.length);
      currentStatus = 'C';
    } else if (line.startsWith('copy to ')) {
      currentFile = line.slice('copy to '.length);
    }
  }

  flush();
  return entries.join('\n');
}

function getDiffForPR(prNumber: number, cwd: string): { nameStatus: string; source: string } {
  // Use gh pr diff directly — works for both same-repo and fork PRs.
  // The previous approach (fetch + git diff origin/...) broke for fork PRs
  // because the head branch isn't on origin.
  const unifiedDiff = execGh(['pr', 'diff', String(prNumber)], cwd);
  const nameStatus = parseUnifiedDiffHeaders(unifiedDiff);
  return { nameStatus, source: `PR #${prNumber}` };
}

function getDiffForBranch(base: string, cwd: string, branch?: string): { nameStatus: string; source: string } {
  // Fetch base to ensure it's up to date
  try {
    execGit(['fetch', 'origin', base, '--quiet'], cwd);
  } catch {
    // Non-fatal
  }

  const ref = branch ?? 'HEAD';
  const nameStatus = execGit(['diff', '--name-status', `origin/${base}...${ref}`], cwd);
  const branchName = branch ?? execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return { nameStatus, source: `branch ${branchName}` };
}

function tryReadFile(filePath: string): string | undefined {
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf8');
    }
  } catch {
    // Graceful — not all projects have these files
  }
  return undefined;
}

export async function runImpact(args: string[], cwd: string): Promise<void> {
  const parsed = parseArgs(args);

  // Get diff output
  const { nameStatus, source } = parsed.prNumber
    ? getDiffForPR(parsed.prNumber, cwd)
    : getDiffForBranch(parsed.base, cwd, parsed.branch);

  if (!nameStatus.trim()) {
    console.log('No changes detected.');
    return;
  }

  // Read optional context files
  const routingContent = tryReadFile(join(cwd, '.squad', 'routing.md'));
  const packageJsonContent = tryReadFile(join(cwd, 'package.json'));

  // Run analysis
  const report = analyzeImpact({
    nameStatusOutput: nameStatus,
    routingContent,
    packageJsonContent,
    source,
    format: parsed.format,
  });

  // Format and print
  const output = formatReport(report, parsed.format);
  console.log(output);
}
