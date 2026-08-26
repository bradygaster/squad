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
import { withAdditionalMcpConfig } from '../../core/copilot-invocation.js';

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

export function buildCustomAgentCommand(
  agentCmd: string,
  prompt: string,
): { cmd: string; args: string[] } {
  const [cmd, ...args] = agentCmd.trim().split(/\s+/);
  const promptIndex = args.indexOf('{prompt}');

  if (promptIndex !== -1 && args.indexOf('{prompt}', promptIndex + 1) !== -1) {
    throw new Error('agentCmd may contain at most one standalone {prompt} token');
  }

  if (promptIndex === -1) {
    args.push('-p', prompt);
  } else {
    args[promptIndex] = prompt;
  }

  return { cmd: cmd!, args };
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
    return buildCustomAgentCommand(context.agentCmd, prompt);
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
 * Build the command + args array for a Copilot session, with the
 * `--additional-mcp-config`/`--yolo` workaround injected so `squad_state_*`
 * MCP tools register (see {@link withAdditionalMcpConfig}).
 *
 * Unlike {@link buildAgentCommand}, this always defaults to the bare
 * `copilot` binary rather than probing for a `gh copilot` fallback — used
 * by capabilities that spawn a full agent session against the repo
 * (execute, wave-dispatch).
 */
export function buildCopilotCommand(
  prompt: string,
  context: WatchContext,
): { cmd: string; args: string[] } {
  if (context.agentCmd) {
    return buildCustomAgentCommand(context.agentCmd, prompt);
  }
  const args = ['-p', prompt];
  if (context.copilotFlags) args.push(...context.copilotFlags.trim().split(/\s+/));
  return { cmd: 'copilot', args: withAdditionalMcpConfig('copilot', args, context.teamRoot) };
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
 *
 * Pass `pidTracking` when the caller wants the child process registered
 * with a {@link WatchContext.pidTracker} for cleanup on exit/crash (e.g.
 * the `execute` capability, which spawns long-running sessions).
 */
export function spawnAgent(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  pidTracking?: { tracker: NonNullable<WatchContext['pidTracker']>; label: string },
): Promise<{ success: boolean; error?: string }> {
  const safeArgs = escapeArgs(args);
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const cp = execFile(
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

    if (pidTracking && cp.pid) {
      pidTracking.tracker.track(cp.pid, pidTracking.label);
      cp.on('exit', () => pidTracking.tracker.untrack(cp.pid!));
    }
  });
}
