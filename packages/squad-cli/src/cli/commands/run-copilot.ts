/**
 * `squad run-copilot <args>` — drop-in wrapper for the bare `copilot` CLI
 * that ensures the project's `.copilot/mcp-config.json` is loaded.
 *
 * Why this exists
 * ===============
 * Copilot CLI 1.0.58 silently ignores project-level `.copilot/mcp-config.json`
 * and only auto-loads `~/.copilot/mcp-config.json`. As a result, the canonical
 * end-user invocation
 *
 *     copilot --yolo --autopilot --agent squad -p "..."
 *
 * leaves the `squad_state` MCP server unwired and the runtime state bridge
 * unavailable. Iter-4 wrapped 10 squad-internal spawn sites with
 * `--additional-mcp-config @<path>` but those wraps don't help when the user
 * starts copilot directly. Iter-5 surfaces this wrapper subcommand so the
 * documented canonical command becomes:
 *
 *     squad run-copilot --yolo --autopilot --agent squad -p "..."
 *
 * Naming note: `squad copilot` is already taken by the team-roster management
 * command (squad copilot [--off] [--auto-assign]). We picked `run-copilot`
 * per the iter-5 directive's failure-mode guidance.
 *
 * Iter-6 Windows-quoting fix
 * --------------------------
 * The iter-5 implementation used `spawn(..., { shell: process.platform === 'win32' })`.
 * On Node ≥20 this emits DEP0190 ("passing args to spawn with shell:true is
 * unsafe") AND — worse for us — collapses inner quotes when forwarding a
 * multi-word `-p "<prompt>"` to `copilot.cmd`. The wrapper became invokable
 * only via a `cmd /c '"squad run-copilot ..."'` outer-shell workaround.
 *
 * Iter-6 switches to `shell: false` and resolves `copilot` explicitly:
 *   - On Unix-like platforms we spawn the resolved binary directly with the
 *     argv array — no shell involvement, no quoting surprises.
 *   - On Windows, `copilot` is shipped as a `copilot.cmd` shim which spawn()
 *     cannot exec directly without a shell. We invoke `cmd.exe /d /s /c <line>`
 *     with `windowsVerbatimArguments: true` and build the command line
 *     ourselves, MSVCRT-escaping each arg so multi-word values reach the
 *     child's `process.argv` as single elements.
 *
 * See `.squad/files/validation/ALIAS-EXPERIMENT-VERDICT.md` for the proof
 * that `--additional-mcp-config` is necessary and sufficient, and smoke
 * data-27 / data-28 for the iter-5 regression that motivated this rewrite.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface RunCopilotOptions {
  /**
   * Injection seam for tests — replaces `child_process.spawn`.
   * Defaults to the real `spawn` from `node:child_process`.
   */
  spawnImpl?: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
  /** Override the binary name (default: `copilot`). Tests use this. */
  copilotBin?: string;
  /**
   * Override how the copilot binary path is resolved on disk. Tests inject
   * this to simulate "copilot is a .cmd shim on Windows" without depending
   * on the host's PATH.
   */
  copilotResolver?: (binName: string) => string;
  /**
   * Override `process.platform` for tests so the Windows .cmd-shim branch
   * is reachable on a non-Windows CI box.
   */
  platformOverride?: NodeJS.Platform;
}

/**
 * Build the augmented argv: when the project `.copilot/mcp-config.json` exists,
 * prepend `--additional-mcp-config @<absolute-path>` to the user's args. When
 * it doesn't (e.g. the user is in a non-squadified project), pass args through
 * untouched so the wrapper is transparent.
 */
export function buildRunCopilotArgs(teamRoot: string, userArgs: string[]): string[] {
  const configPath = path.join(teamRoot, '.copilot', 'mcp-config.json');
  let configExists = false;
  try {
    configExists = existsSync(configPath);
  } catch {
    configExists = false;
  }
  if (!configExists) return [...userArgs];
  return ['--additional-mcp-config', `@${configPath}`, ...userArgs];
}

/**
 * MSVCRT-style escape for a single Windows command-line argument.
 *
 * Rules (per Microsoft's C runtime argv parser, which Node's `process.argv`
 * also follows on Windows):
 *  - If the arg contains no whitespace AND no `"`, it can be passed bare.
 *  - Otherwise wrap in `"..."`, with two extra rules inside:
 *      a) Any run of N backslashes that immediately precedes a `"` must
 *         become 2N backslashes plus `\"`.
 *      b) A trailing run of N backslashes (at the end of the arg, just
 *         before the closing `"`) must become 2N backslashes.
 *
 * This is the same algorithm cross-spawn and Node's own `child_process`
 * use internally — replicated here because we set
 * `windowsVerbatimArguments: true` and therefore must escape ourselves.
 */
export function quoteWindowsArg(arg: string): string {
  if (arg.length > 0 && !/[\s"]/.test(arg)) {
    return arg;
  }
  let escaped = arg.replace(
    /(\\*)"/g,
    (_m, slashes: string) => `${slashes}${slashes}\\"`,
  );
  escaped = escaped.replace(
    /(\\+)$/,
    (_m, slashes: string) => `${slashes}${slashes}`,
  );
  return `"${escaped}"`;
}

/**
 * Default copilot path resolver: walk PATH looking for `<binName>` and on
 * Windows also `<binName>.cmd` / `.exe` / `.bat`. Returns the bare bin name
 * if no on-disk hit — letting `spawn` fall through to its own ENOENT.
 */
export function defaultCopilotResolver(
  binName: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const PATH = process.env['PATH'] ?? process.env['Path'] ?? '';
  const sep = platform === 'win32' ? ';' : ':';
  const exts = platform === 'win32'
    ? ['.cmd', '.exe', '.bat', '.ps1', '']
    : [''];
  for (const rawDir of PATH.split(sep)) {
    const dir = rawDir.replace(/^"|"$/g, '');
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, binName + ext);
      try {
        if (existsSync(candidate)) return candidate;
      } catch {
        // ignore
      }
    }
  }
  return binName;
}

/**
 * Pure builder for the (command, argv, spawn-options) tuple we hand to
 * `child_process.spawn`. Exported separately from `runRunCopilot` so the
 * Windows-quoting regression can be unit-tested without actually spawning
 * a child process.
 */
export function buildSpawnInvocation(
  teamRoot: string,
  userArgs: string[],
  options: RunCopilotOptions = {},
): { cmd: string; args: string[]; opts: SpawnOptions } {
  const platform = options.platformOverride ?? process.platform;
  const binName = options.copilotBin ?? 'copilot';
  const resolver = options.copilotResolver ?? ((b: string) => defaultCopilotResolver(b, platform));
  const resolved = resolver(binName);
  const wrappedArgs = buildRunCopilotArgs(teamRoot, userArgs);

  const opts: SpawnOptions & { windowsVerbatimArguments?: boolean } = {
    stdio: 'inherit',
    shell: false,
  };

  if (platform === 'win32' && /\.(cmd|bat)$/i.test(resolved)) {
    // .cmd / .bat shims can't be exec'd directly without a shell, so we
    // invoke cmd.exe ourselves with verbatim args. This lets us control
    // the command-line quoting end-to-end and bypass Node's shell:true
    // path that drops inner quotes (DEP0190).
    const line = [resolved, ...wrappedArgs].map(quoteWindowsArg).join(' ');
    opts.windowsVerbatimArguments = true;
    return {
      cmd: process.env['ComSpec'] || 'cmd.exe',
      args: ['/d', '/s', '/c', line],
      opts,
    };
  }

  return { cmd: resolved, args: wrappedArgs, opts };
}

/**
 * Run `copilot` with the project mcp-config injected. Resolves to the child
 * process's exit code (0 on success, non-zero on failure). Stdio is inherited
 * so the user sees the normal copilot UX (TTY, prompts, streaming output).
 */
export async function runRunCopilot(
  teamRoot: string,
  userArgs: string[],
  options: RunCopilotOptions = {},
): Promise<number> {
  const { cmd, args, opts } = buildSpawnInvocation(teamRoot, userArgs, options);
  const spawnFn = options.spawnImpl ?? spawn;

  return await new Promise<number>((resolve, reject) => {
    const child = spawnFn(cmd, args, opts);
    child.on('error', (err) => {
      reject(err);
    });
    child.on('exit', (code, signal) => {
      if (typeof code === 'number') {
        resolve(code);
      } else if (signal) {
        // Mirror common shell convention: 128 + signal number.
        // For unknown signal numbers, just use 1.
        resolve(1);
      } else {
        resolve(0);
      }
    });
  });
}
