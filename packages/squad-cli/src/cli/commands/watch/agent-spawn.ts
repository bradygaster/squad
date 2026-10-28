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

import { execFile, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { WatchContext } from './types.js';
import { withAdditionalMcpConfig } from '../../core/copilot-invocation.js';

/** True when running on Windows — used to gate `shell: true`. */
export const IS_WINDOWS = process.platform === 'win32';

/** Maximum single-arg length before spilling to a temp prompt file on Windows (cmd.exe limit is 8,191 chars). */
export const WINDOWS_MAX_INLINE_ARG_LENGTH = 4_000;

export interface CopilotUsageOutput {
  currentModel: string;
  lastCallInputTokens: number;
  lastCallOutputTokens: number;
}

export interface AgentSpawnResult {
  success: boolean;
  error?: string;
  usage?: CopilotUsageOutput;
  usageError?: string;
  /** True when the caller aborted the run (for example, a fenced work claim). */
  cancelled?: boolean;
  /** True when the run was killed for exceeding its timeout. */
  timedOut?: boolean;
  /** Signal that terminated the child, when any. */
  signal?: string;
}

export interface CopilotUsageCapture {
  args: string[];
  filePath: string;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Add Copilot's per-invocation usage output flag under the effective state directory. */
export function withCopilotUsageOutput(
  args: string[],
  stateRoot: string,
): CopilotUsageCapture {
  const logDir = path.join(stateRoot, 'log');
  mkdirSync(logDir, { recursive: true });
  const filePath = path.join(logDir, `context-usage-${randomUUID()}.json`);
  return {
    args: [...args, '--usage-output-file', filePath],
    filePath,
  };
}

/** Strictly parse the subset of Copilot usage output needed for context estimation. */
export function parseCopilotUsageOutput(value: unknown): CopilotUsageOutput | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record['currentModel'] !== 'string'
    || record['currentModel'].trim() === ''
    || !isNonNegativeInteger(record['lastCallInputTokens'])
    || !isNonNegativeInteger(record['lastCallOutputTokens'])
  ) {
    return undefined;
  }
  return {
    currentModel: record['currentModel'],
    lastCallInputTokens: record['lastCallInputTokens'],
    lastCallOutputTokens: record['lastCallOutputTokens'],
  };
}

function readCopilotUsageOutput(filePath: string): {
  usage?: CopilotUsageOutput;
  error?: string;
} {
  if (!existsSync(filePath)) {
    return { error: 'Copilot usage output was not created' };
  }
  try {
    const usage = parseCopilotUsageOutput(JSON.parse(readFileSync(filePath, 'utf8')));
    return usage ? { usage } : { error: 'Copilot usage output has an invalid shape' };
  } catch (error) {
    return { error: `Could not read Copilot usage output: ${(error as Error).message}` };
  }
}

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

export interface PreparedWindowsArgs {
  args: string[];
  tempFiles: string[];
  cleanup: () => void;
}

/**
 * Spill a multiline or oversized prompt argument to a temporary `.md` file
 * so `cmd.exe /d /s /c` does not truncate at the first newline or hit the
 * 8,191-character command-line limit (#2070).
 */
export function spillPromptArgForCmd(
  arg: string,
  tempFiles?: string[],
): string {
  if (
    typeof arg !== 'string' ||
    (!/[\r\n]/.test(arg) && arg.length <= WINDOWS_MAX_INLINE_ARG_LENGTH)
  ) {
    return arg;
  }

  try {
    const dir = path.join(os.tmpdir(), 'squad-prompts');
    mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `prompt-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.md`,
    );
    writeFileSync(file, arg, 'utf8');
    tempFiles?.push(file);
    return `Your complete instructions are in the file ${file} - read that whole file first and follow it exactly as if it were this prompt.`;
  } catch {
    // If temp-file creation fails (e.g. read-only tmpdir), collapse newlines so cmd.exe does not truncate at line 1.
    return arg.replace(/\r?\n+/g, ' ');
  }
}

/**
 * Prepare and escape an array of args for cmd.exe shell invocation, tracking
 * any temporary prompt files so the caller can clean them up when the process exits.
 */
export function prepareArgsForSpawn(
  args: string[],
  isWindows: boolean = IS_WINDOWS,
): PreparedWindowsArgs {
  if (!isWindows) {
    return { args, tempFiles: [], cleanup: () => {} };
  }
  const tempFiles: string[] = [];
  const prepared = args
    .map(arg => spillPromptArgForCmd(arg, tempFiles))
    .map(escapeForCmd);
  const cleanup = (): void => {
    for (const file of tempFiles) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {
        // Best-effort cleanup of temp prompt files
      }
    }
  };
  return { args: prepared, tempFiles, cleanup };
}

/**
 * Escape an array of args for cmd.exe shell invocation.
 * Only applies on Windows — returns args unchanged on other platforms.
 */
export function escapeArgs(args: string[], isWindows: boolean = IS_WINDOWS): string[] {
  if (!isWindows) return args;
  return args.map(arg => spillPromptArgForCmd(arg)).map(escapeForCmd);
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
 * `--additional-mcp-config` injected so `squad_state_*` MCP tools register
 * without changing the caller's tool permissions (see {@link withAdditionalMcpConfig}).
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
  const { args: safeArgs, cleanup } = prepareArgsForSpawn(args);
  return runProcessTreeCommand(cmd, safeArgs, {
    cwd,
    timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    shell: IS_WINDOWS,
  }).then((run) => {
    cleanup();
    if (run.error) {
      const timedOut = run.timedOut || (!run.cancelled && run.error.killed === true);
      throw new Error(
        timedOut
          ? `Timed out after ${Math.round(timeoutMs / 1000)}s`
          : run.error.message,
      );
    }
  }, (error) => {
    cleanup();
    throw error;
  });
}

export interface ProcessTreeCommandResult {
  error?: Error & { killed?: boolean; signal?: NodeJS.Signals | null };
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
}

export interface ProcessTreeCommandOptions {
  cwd: string;
  timeoutMs: number;
  maxBuffer?: number;
  shell?: boolean;
  signal?: AbortSignal;
  onSpawn?: (child: ChildProcess) => void;
}

/**
 * Run a command under an explicit timeout. Timeout and abort both terminate
 * the whole process tree, and the promise does not resolve until that
 * termination has completed.
 */
export function runProcessTreeCommand(
  cmd: string,
  args: string[],
  options: ProcessTreeCommandOptions,
): Promise<ProcessTreeCommandResult> {
  return new Promise<ProcessTreeCommandResult>((resolve) => {
    let child: ChildProcess | undefined;
    let callbackFinished = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let termination: Promise<void> | undefined;
    let timedOut = false;
    let cancelled = false;

    const beginTermination = (reason: 'timeout' | 'abort'): void => {
      if (!child || callbackFinished || termination) return;
      timedOut = reason === 'timeout';
      cancelled = reason === 'abort';
      termination = terminateProcessTree(child);
    };

    const onAbort = (): void => beginTermination('abort');
    const group = agentProcessGroupOptions();
    child = execFile(cmd, args, {
      cwd: options.cwd,
      maxBuffer: options.maxBuffer ?? 50 * 1024 * 1024,
      shell: options.shell ?? false,
      encoding: 'utf-8',
      ...group,
    }, async (err, stdout, stderr) => {
      callbackFinished = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      if (termination) await termination;
      resolve({
        ...(err ? { error: err as ProcessTreeCommandResult['error'] } : {}),
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
        timedOut,
        cancelled,
      });
    });

    if (group.detached) trackAgentProcessGroup(child);
    options.onSpawn?.(child);

    if (!callbackFinished) {
      timeout = setTimeout(() => beginTermination('timeout'), options.timeoutMs);
      timeout.unref?.();
      if (options.signal) {
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }
  });
}

interface PosixProcess {
  pid: number;
  ppid: number;
  pgid: number;
  state: string;
}

function readPosixProcesses(): PosixProcess[] {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat='], {
    encoding: 'utf-8',
    timeout: 2_000,
  });
  return rows.split(/\r?\n/).flatMap((row) => {
    const match = row.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/);
    return match
      ? [{
          pid: Number(match[1]),
          ppid: Number(match[2]),
          pgid: Number(match[3]),
          state: match[4]!,
        }]
      : [];
  });
}

function posixDescendants(rootPid: number): number[] {
  try {
    const processes = readPosixProcesses();
    const children = new Map<number, number[]>();
    for (const process of processes) {
      const siblings = children.get(process.ppid) ?? [];
      siblings.push(process.pid);
      children.set(process.ppid, siblings);
    }
    const descendants: number[] = [];
    const pending = [...(children.get(rootPid) ?? [])];
    while (pending.length > 0) {
      const pid = pending.pop()!;
      descendants.push(pid);
      pending.push(...(children.get(pid) ?? []));
    }
    return descendants;
  } catch {
    return [];
  }
}

function posixProcessTreeCanExecute(rootPid: number, descendants: ReadonlySet<number>): boolean {
  try {
    return readPosixProcesses().some(process =>
      (process.pgid === rootPid || descendants.has(process.pid))
      && !process.state.startsWith('Z'));
  } catch {
    try {
      process.kill(-rootPid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      throw error;
    }
  }
}

async function waitForPosixProcessTreeExit(rootPid: number, descendants: ReadonlySet<number>): Promise<void> {
  while (true) {
    if (!posixProcessTreeCanExecute(rootPid, descendants)) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/**
 * Kill a child process tree and wait until it can no longer execute. Windows
 * `taskkill /T /F` is synchronous; POSIX waits until the detached process
 * group contains no process that can still execute (zombies are inert).
 */
export async function terminateProcessTree(
  child: KillableChild,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const pid = child.pid;
  const descendants = platform !== 'win32' && pid
    ? new Set(posixDescendants(pid))
    : new Set<number>();
  killProcessTree(child, platform);
  if (platform !== 'win32' && pid && child.exitCode == null && child.signalCode == null) {
    for (const descendant of descendants) {
      try { process.kill(descendant, 'SIGKILL'); } catch { /* already exited */ }
    }
    await waitForPosixProcessTreeExit(pid, descendants);
  }
}

/**
 * Spawn options that make a POSIX agent the leader of its own process group
 * (`detached: true`), so {@link killProcessTree} can kill the whole tree with
 * `process.kill(-pid)`. Windows uses `taskkill /T` instead and is unchanged.
 */
export function agentProcessGroupOptions(platform: NodeJS.Platform = process.platform): { detached: boolean } {
  return { detached: platform !== 'win32' };
}

const liveAgentGroups = new Set<number>();
let agentGroupExitHookInstalled = false;

/**
 * Remember a detached POSIX agent until it exits so its process group is
 * killed when watch exits: a detached group is outside the terminal's
 * foreground group and no longer receives Ctrl+C.
 */
export function trackAgentProcessGroup(child: ChildProcess, platform: NodeJS.Platform = process.platform): void {
  // Only real child processes (which report their exit) are tracked.
  if (platform === 'win32' || !child.pid || typeof child.once !== 'function') return;
  const pid = child.pid;
  liveAgentGroups.add(pid);
  child.once('exit', () => liveAgentGroups.delete(pid));
  if (!agentGroupExitHookInstalled) {
    agentGroupExitHookInstalled = true;
    process.on('exit', () => {
      for (const group of liveAgentGroups) {
        try { process.kill(-group, 'SIGKILL'); } catch { /* group already gone */ }
      }
    });
  }
}

export interface KillableChild {
  pid?: number;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | string | null;
  kill(signal?: NodeJS.Signals): boolean;
}

/**
 * Kill a child and its whole process tree: `taskkill /T` on Windows (agents
 * run through `cmd.exe` there), the child's process group on POSIX (agents
 * are spawned detached, see {@link agentProcessGroupOptions}). Does nothing
 * once the child has exited, because its PID may already be reused.
 */
export function killProcessTree(child: KillableChild, platform: NodeJS.Platform = process.platform): void {
  if (child.exitCode != null || child.signalCode != null) return;
  if (platform === 'win32' && child.pid) {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5_000 });
      return;
    } catch {
      // Fall through to a direct kill
    }
  } else if (platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // ESRCH: not a group leader (spawned without detached) — kill the child directly
    }
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // Already exited
  }
}

/**
 * Spawn an agent command with a timeout, resolving with success/error
 * instead of rejecting.  Used by execute and wave-dispatch where the
 * caller wants to handle failure without try/catch.
 *
 * Pass `pidTracking` when the caller wants the child process registered
 * with a {@link WatchContext.pidTracker} for cleanup on exit/crash (e.g.
 * the `execute` capability, which spawns long-running sessions).
 *
 * Pass `signal` to kill the child and its process tree on abort — used
 * when a work claim is fenced while the agent runs.
 */
export function spawnAgent(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  pidTracking?: { tracker: NonNullable<WatchContext['pidTracker']>; label: string },
  usageOutputFile?: string,
  signal?: AbortSignal,
): Promise<AgentSpawnResult> {
  const { args: safeArgs, cleanup } = prepareArgsForSpawn(args);
  return runProcessTreeCommand(cmd, safeArgs, {
    cwd,
    timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    shell: IS_WINDOWS,
    signal,
    onSpawn: (cp) => {
      if (pidTracking && cp.pid) {
        pidTracking.tracker.track(cp.pid, pidTracking.label);
        cp.on('exit', () => pidTracking.tracker.untrack(cp.pid!));
      }
    },
  }).then((run) => {
    cleanup();
    const usageResult = usageOutputFile
      ? readCopilotUsageOutput(usageOutputFile)
      : {};
    if (usageOutputFile && existsSync(usageOutputFile)) {
      try {
        unlinkSync(usageOutputFile);
      } catch (cleanupError) {
        usageResult.error ??= `Could not remove Copilot usage output: ${(cleanupError as Error).message}`;
      }
    }
    const reason = signal?.reason instanceof Error ? signal.reason.message : String(signal?.reason ?? 'aborted');
    const timedOut = run.timedOut || (!run.cancelled && run.error?.killed === true);
    if (run.error || run.cancelled || timedOut) {
      const msg = run.cancelled ? `Cancelled: ${reason}` : timedOut ? 'Timed out' : run.error!.message;
      return {
        success: false,
        error: msg,
        usage: usageResult.usage,
        usageError: usageResult.error,
        ...(run.cancelled ? { cancelled: true } : {}),
        ...(timedOut ? { timedOut: true } : {}),
        ...(run.error?.signal ? { signal: run.error.signal } : {}),
      };
    }
    return {
      success: true,
      usage: usageResult.usage,
      usageError: usageResult.error,
    };
  });
}
