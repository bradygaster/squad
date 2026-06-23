/**
 * Repo Sync — export/import Squad configuration to/from a GitHub repository.
 *
 * Uses the GitHub Contents API via `gh api` for authentication and transport.
 * The bundle is stored at a configurable path (default: `.squad/squad-export.json`)
 * in the target repository.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────

export interface RepoSpec {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
}

export interface RepoSyncResult {
  success: boolean;
  message: string;
  sha?: string;
}

/**
 * Abstracted GitHub operations for repo-sync — enables test injection.
 */
export interface RepoSyncOperations {
  /** Get file content and metadata from a repo. Returns null if not found. */
  getFile(owner: string, repo: string, path: string, branch?: string): Promise<{ content: string; sha: string } | null>;
  /** Create or update a file in a repo. Requires sha for updates. */
  putFile(owner: string, repo: string, path: string, content: string, message: string, sha?: string, branch?: string): Promise<{ sha: string }>;
  /** Get the default branch of a repo. */
  getDefaultBranch(owner: string, repo: string): Promise<string>;
}

// ── Validation ─────────────────────────────────────────────────────

/**
 * Parse an "owner/repo" string into components.
 */
export function parseRepoString(repoStr: string): { owner: string; repo: string } {
  // Strip optional github.com URL prefix
  const cleaned = repoStr
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  const parts = cleaned.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repo format "${repoStr}": expected "owner/repo"`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Validate a repo file path is safe (relative, no traversal).
 */
export function validateRepoPath(filePath: string): void {
  if (!filePath || filePath.startsWith('/') || filePath.includes('..')) {
    throw new Error(`Invalid repo path "${filePath}": must be relative with no ".." segments`);
  }
}

// ── Default Operations (gh CLI) ────────────────────────────────────

const DEFAULT_BUNDLE_PATH = '.squad/squad-export.json';

/**
 * Create default operations using `gh api` CLI.
 */
export function createGhOperations(): RepoSyncOperations {
  return {
    async getFile(owner, repo, path, branch) {
      const endpoint = `/repos/${owner}/${repo}/contents/${path}${branch ? `?ref=${branch}` : ''}`;
      try {
        const { stdout } = await execFileAsync('gh', [
          'api', endpoint, '--jq', '{ content: .content, sha: .sha }',
        ]);
        const data = JSON.parse(stdout);
        // GitHub returns base64 content, possibly line-wrapped
        const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
        return { content: decoded, sha: data.sha };
      } catch (err) {
        const msg = (err as Error).message || '';
        if (msg.includes('404') || msg.includes('Not Found')) {
          return null;
        }
        throw err;
      }
    },

    async putFile(owner, repo, path, content, message, sha, branch) {
      const endpoint = `/repos/${owner}/${repo}/contents/${path}`;
      const encoded = Buffer.from(content).toString('base64');
      const body: Record<string, string> = {
        message,
        content: encoded,
      };
      if (sha) body.sha = sha;
      if (branch) body.branch = branch;

      const stdout = await new Promise<string>((resolve, reject) => {
        const proc = spawn('gh', [
          'api', endpoint,
          '-X', 'PUT',
          '--input', '-',
        ], { stdio: ['pipe', 'pipe', 'pipe'] });

        let out = '';
        let err = '';
        proc.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
        proc.stderr.on('data', (chunk: Buffer) => { err += chunk.toString(); });
        proc.on('close', (code) => {
          if (code === 0) resolve(out);
          else reject(new Error(err || `gh api exited with code ${code}`));
        });
        proc.on('error', reject);
        proc.stdin.write(JSON.stringify(body));
        proc.stdin.end();
      });

      const data = JSON.parse(stdout);
      return { sha: data.content?.sha || '' };
    },

    async getDefaultBranch(owner, repo) {
      const { stdout } = await execFileAsync('gh', [
        'api', `/repos/${owner}/${repo}`, '--jq', '.default_branch',
      ]);
      return stdout.trim();
    },
  };
}

// ── Export to Repo ─────────────────────────────────────────────────

export interface ExportToRepoOptions {
  /** Commit message for the push. */
  message?: string;
  /** Branch to push to. If omitted, uses repo default branch. */
  branch?: string;
  /** Path in the repo for the bundle file. */
  path?: string;
  /** Operations interface (injectable for testing). */
  ops?: RepoSyncOperations;
}

/**
 * Export a local Squad bundle JSON string to a GitHub repository.
 */
export async function exportToRepo(
  bundleJson: string,
  repoSpec: RepoSpec,
  options?: ExportToRepoOptions,
): Promise<RepoSyncResult> {
  const ops = options?.ops ?? createGhOperations();
  const filePath = repoSpec.path ?? options?.path ?? DEFAULT_BUNDLE_PATH;
  validateRepoPath(filePath);

  const branch = repoSpec.branch ?? options?.branch;
  const message = options?.message ?? 'chore: update Squad configuration export';

  // Check if file already exists (need SHA for update)
  const existing = await ops.getFile(repoSpec.owner, repoSpec.repo, filePath, branch);
  const sha = existing?.sha;

  // Push the file
  const result = await ops.putFile(
    repoSpec.owner,
    repoSpec.repo,
    filePath,
    bundleJson,
    message,
    sha,
    branch,
  );

  return {
    success: true,
    message: `Exported to ${repoSpec.owner}/${repoSpec.repo}/${filePath}${branch ? ` (branch: ${branch})` : ''}`,
    sha: result.sha,
  };
}

// ── Import from Repo ───────────────────────────────────────────────

export interface ImportFromRepoOptions {
  /** Branch to import from. If omitted, uses repo default branch. */
  branch?: string;
  /** Path in the repo for the bundle file. */
  path?: string;
  /** Operations interface (injectable for testing). */
  ops?: RepoSyncOperations;
}

/**
 * Import a Squad bundle JSON string from a GitHub repository.
 * Returns the raw JSON content for the caller to apply.
 */
export async function importFromRepo(
  repoSpec: RepoSpec,
  options?: ImportFromRepoOptions,
): Promise<{ content: string; sha: string }> {
  const ops = options?.ops ?? createGhOperations();
  const filePath = repoSpec.path ?? options?.path ?? DEFAULT_BUNDLE_PATH;
  validateRepoPath(filePath);

  const branch = repoSpec.branch ?? options?.branch;

  const result = await ops.getFile(repoSpec.owner, repoSpec.repo, filePath, branch);
  if (!result) {
    throw new Error(
      `No Squad export found at ${repoSpec.owner}/${repoSpec.repo}/${filePath}${branch ? ` (branch: ${branch})` : ''}`,
    );
  }

  return result;
}
