/**
 * Shared agent spawn utilities for watch capabilities.
 *
 * Centralises `buildAgentCommand()` and `spawnWithTimeout()` so every
 * capability uses the same logic, respects `agentCmd` from config,
 * and works on Windows (shell: true when win32).
 *
 * @see https://github.com/bradygaster/squad/issues/920
 * @see https://github.com/bradygaster/squad/issues/923
 */

import { execFile, execFileSync } from 'node:child_process';
import type { WatchContext } from './types.js';

/** True when running on Windows — used to gate `shell: true`. */
export const IS_WINDOWS = process.platform === 'win32';

/**
 * Escape an argument for safe use with cmd.exe when `shell: true`.
 *
 * Node's `execFile` with `shell: true` on Windows concatenates args with
 * spaces but does NOT quote them (Node DEP0190). This means multi-word
 * prompts get split by cmd.exe and the child process receives garbage argv.
 *
 * This function wraps any arg containing spaces, quotes, or cmd.exe
 * metacharacters in double quotes with internal double quotes escaped.
 *
 * On non-Windows (shell: false path), args are passed directly to execvp
 * without shell interpretation, so no escaping is needed.
 */
export function escapeForCmd(arg: string): string {
  // Characters that require quoting in cmd.exe
  if (!/[\s"&|<>^%!()]/.test(arg)) return arg;
  // Escape internal double quotes by doubling them (cmd.exe convention)
  const escaped = arg.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Escape an array of args for cmd.exe shell invocation.
 * Only applies on Windows — returns args unchanged on other platforms.
 */
export function escapeArgs(args: string[]): string[] {
  if (!IS_WINDOWS) return args;
  return args.map(escapeForCmd);
}

/**
 * Cached result of copilot CLI detection.
 * `null` means we haven't checked yet.
 */
let _copilotResolved: { cmd: string; cmdPrefix: string[] } | null = null;

/**
 * Detect which copilot CLI is available at runtime.
 *
 * Tries standalone `copilot` first (modern default).  If that fails,
 * falls back to `gh copilot` (legacy).  The result is cached for the
 * lifetime of the process so we only shell-out once.
 *
 * @returns `{ cmd, cmdPrefix }` — e.g. `{ cmd: 'copilot', cmdPrefix: [] }`
 *          or `{ cmd: 'gh', cmdPrefix: ['copilot'] }`.
 */
export function resolveCopilotCmd(): { cmd: string; cmdPrefix: string[] } {
  if (_copilotResolved) return _copilotResolved;

  try {
    execFileSync('copilot', ['--version'], {
      stdio: 'ignore',
      timeout: 5_000,
      shell: IS_WINDOWS,
    });
    _copilotResolved = { cmd: 'copilot', cmdPrefix: [] };
  } catch {
    // Standalone copilot not found — fall back to gh copilot
    _copilotResolved = { cmd: 'gh', cmdPrefix: ['copilot'] };
  }

  return _copilotResolved;
}

/**
 * Reset the cached copilot detection.  Exported for testing only.
 * @internal
 */
export function _resetCopilotDetection(): void {
  _copilotResolved = null;
}

/**
 * Build the command + args array for an agent invocation.
 *
 * Resolution order:
 *   1. `context.agentCmd` (explicit override from config / CLI)
 *   2. Runtime detection via `resolveCopilotCmd()`:
 *      - standalone `copilot` if available on PATH
 *      - `gh copilot` as fallback
 */
export function buildAgentCommand(
  prompt: string,
  context: WatchContext,
): { cmd: string; args: string[] } {
  if (context.agentCmd) {
    const parts = context.agentCmd.trim().split(/\s+/);
    const cmd = parts[0]!;
    const args = [...parts.slice(1), '-p', prompt];
    return { cmd, args };
  }

  // Default: detect available copilot CLI at runtime (cached)
  const { cmd, cmdPrefix } = resolveCopilotCmd();
  const args = [...cmdPrefix, '-p', prompt];
  if (context.copilotFlags) {
    args.push(...context.copilotFlags.trim().split(/\s+/));
  }
  return { cmd, args };
}

/**
 * Spawn an agent command with a timeout.
 *
 * Uses `shell: true` on Windows so that `.cmd`/`.bat` wrappers and
 * PATH resolution work correctly.  Args are escaped via `escapeArgs()`
 * to prevent Node DEP0190 and cmd.exe metacharacter injection.
 */
export function spawnWithTimeout(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<void> {
  const safeArgs = escapeArgs(args);
  return new Promise<void>((resolve, reject) => {
    execFile(cmd, safeArgs, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      shell: IS_WINDOWS,
    }, (err) => {
      if (err) {
        const execErr = err as Error & { killed?: boolean };
        reject(new Error(
          execErr.killed
            ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
            : execErr.message,
        ));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Spawn an agent command with a timeout, resolving with success/error
 * instead of rejecting.  Used by execute and wave-dispatch where the
 * caller wants to handle failure without try/catch.
 */
export function spawnAgent(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ success: boolean; error?: string }> {
  const safeArgs = escapeArgs(args);
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    execFile(
      cmd,
      safeArgs,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024,
        shell: IS_WINDOWS,
      },
      (err) => {
        if (err) {
          const execErr = err as Error & { killed?: boolean };
          const msg = execErr.killed ? 'Timed out' : execErr.message;
          resolve({ success: false, error: msg });
        } else {
          resolve({ success: true });
        }
      },
    );
  });
}
