/**
 * Identity Module — Token-scoped execution
 *
 * Wraps shell commands or async functions so they run with a
 * GitHub App installation token in `GH_TOKEN`. Restores the
 * original value (or deletes it) when done, even on failure.
 *
 * Uses only node:child_process and node:util — zero external dependencies.
 *
 * @module identity/exec
 */

import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveTokenWithDiagnostics } from './tokens.js';

const execAsync = promisify(execCb);

/** Result returned from `execWithRoleToken` when running a shell command. */
export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Execute a shell command with the role's GitHub App installation token
 * set as `GH_TOKEN`. If no identity is configured (or token resolution
 * fails), the command still runs — it just uses whatever `GH_TOKEN` was
 * already in the environment (graceful fallback).
 *
 * The original `GH_TOKEN` is always restored after execution, even if
 * the command throws.
 *
 * @param teamRoot - Project root directory (parent of `.squad/`)
 * @param roleSlug - Canonical role slug (e.g., `'backend'`, `'lead'`)
 * @param command  - Shell command string to execute
 * @returns Promise resolving to `{ stdout, stderr }`
 */
export async function execWithRoleToken(
  teamRoot: string,
  roleSlug: string,
  command: string,
): Promise<ExecResult> {
  const previousToken = process.env['GH_TOKEN'];

  // resolveTokenWithDiagnostics never throws — always returns a result
  const result = await resolveTokenWithDiagnostics(teamRoot, roleSlug);
  if (result.token) {
    process.env['GH_TOKEN'] = result.token;
  } else if (result.error) {
    // Surface identity failures that would otherwise go completely unnoticed
    process.stderr.write(
      `[identity] Token resolution failed for role "${roleSlug}": ${result.error.message}\n`,
    );
  }

  try {
    const { stdout, stderr } = await execAsync(command);
    return { stdout, stderr };
  } finally {
    // Restore original GH_TOKEN
    if (previousToken !== undefined) {
      process.env['GH_TOKEN'] = previousToken;
    } else {
      delete process.env['GH_TOKEN'];
    }
  }
}

/**
 * Run an async function with the role's GitHub App installation token
 * set as `GH_TOKEN`. Same semantics as `execWithRoleToken` but accepts
 * an arbitrary async callback instead of a shell command.
 *
 * @param teamRoot - Project root directory (parent of `.squad/`)
 * @param roleSlug - Canonical role slug (e.g., `'backend'`, `'lead'`)
 * @param fn       - Async function to execute under the bot token
 * @returns Whatever `fn` returns
 */
export async function withRoleToken<T>(
  teamRoot: string,
  roleSlug: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previousToken = process.env['GH_TOKEN'];

  // resolveTokenWithDiagnostics never throws — always returns a result
  const result = await resolveTokenWithDiagnostics(teamRoot, roleSlug);
  if (result.token) {
    process.env['GH_TOKEN'] = result.token;
  } else if (result.error) {
    process.stderr.write(
      `[identity] Token resolution failed for role "${roleSlug}": ${result.error.message}\n`,
    );
  }

  try {
    return await fn();
  } finally {
    if (previousToken !== undefined) {
      process.env['GH_TOKEN'] = previousToken;
    } else {
      delete process.env['GH_TOKEN'];
    }
  }
}
