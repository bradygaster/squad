import { execFileSync } from 'node:child_process';

export interface TrackedWorktreeSnapshot {
  head: string;
  diff: Buffer;
  files: string[];
}

function git(cwd: string, args: string[]): Buffer {
  return execFileSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 });
}

export function snapshotTrackedWorktree(cwd: string): TrackedWorktreeSnapshot {
  return {
    head: git(cwd, ['rev-parse', 'HEAD']).toString('utf8').trim(),
    diff: git(cwd, ['diff', '--no-ext-diff', '--binary', '--ignore-cr-at-eol', 'HEAD', '--']),
    files: git(cwd, ['diff', '--no-ext-diff', '--name-only', '-z', '--ignore-cr-at-eol', 'HEAD', '--'])
      .toString('utf8')
      .split('\0')
      .filter(Boolean),
  };
}

function repositoryRoot(cwd: string): string | undefined {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  } catch (error) {
    const failure = error as { status?: number; stderr?: Buffer };
    if (failure.status === 128 && failure.stderr?.toString('utf8').includes('not a git repository')) {
      return undefined;
    }
    throw error;
  }
}

export function assertTrackedWorktreeUnchanged(cwd: string, before: TrackedWorktreeSnapshot): void {
  const after = snapshotTrackedWorktree(cwd);
  if (before.head === after.head && before.diff.equals(after.diff)) return;

  const files = [...new Set([...before.files, ...after.files])].sort();
  const headChanged = before.head !== after.head ? '\n  HEAD changed during the test run.' : '';
  throw new Error(
    `Tests changed tracked files in the working tree:${headChanged}\n${files.map(file => `  ${file}`).join('\n')}`,
  );
}

export function createTrackedWorktreeGuard(cwd: string): (() => void) | undefined {
  const root = repositoryRoot(cwd);
  if (!root) return;

  const before = snapshotTrackedWorktree(root);
  return () => assertTrackedWorktreeUnchanged(root, before);
}

export function setup(): (() => void) | undefined {
  return createTrackedWorktreeGuard(process.cwd());
}
