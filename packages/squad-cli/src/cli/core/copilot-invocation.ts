/**
 * Helpers for spawning the Copilot CLI from squad-managed code paths.
 *
 * Background — workspace MCP auto-discovery can be disabled by the folder-trust
 * gate in non-interactive (`-p`) sessions, leaving the `squad_state` MCP entry
 * written by `squad init` / `squad upgrade` unwired.
 *
 * Mitigation: every squad-internal `copilot` spawn prepends
 * `--additional-mcp-config @<abs-path>` to explicitly load the project's
 * `.mcp.json` so `squad_state_*` tools register for that session. Tool
 * authorization remains controlled by the caller; loading MCP config must not
 * add or remove `--yolo`.
 *
 * We only inject when:
 *  - the command being spawned is the bare `copilot` binary (i.e. the user
 *    did not override via `--agent-cmd`)
 *  - a `.mcp.json` file actually exists at `teamRoot`
 *
 * See issue #2139: coupling MCP loading to `--yolo` overrides caller-supplied
 * tool restrictions.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Build the extra CLI args needed to make the Copilot CLI load this project's
 * `.mcp.json` for a non-interactive (`-p`) spawned session.
 *
 * Returns `['--additional-mcp-config', '@<abs-path>']` when
 * injection is applicable, or an empty array when:
 *  - a custom agent command was specified (not the bare `copilot` binary), or
 *  - `teamRoot` is falsy, or
 *  - `.mcp.json` does not exist under `teamRoot` (squad init not run, repo
 *    downgraded, etc.) — a console warning is emitted in that case.
 *
 * The `@<path>` form is used (rather than inline JSON) to avoid argv quoting
 * issues with multi-line JSON on Windows.
 */
export function buildAdditionalMcpConfigArgs(cmd: string, teamRoot: string | undefined): string[] {
  if (cmd !== 'copilot') return [];
  if (!teamRoot) return [];
  const configPath = path.join(teamRoot, '.mcp.json');
  try {
    if (!existsSync(configPath)) {
      console.warn(
        `[squad] ⚠  .mcp.json not found at ${configPath}. ` +
          `Run \`squad init\` or \`squad upgrade\` to create it. ` +
          `squad_state_* tools will NOT be available in this session.`,
      );
      return [];
    }
  } catch {
    return [];
  }
  return ['--additional-mcp-config', `@${configPath}`];
}

/**
 * Prepend the MCP-config args to `args`. Returns the full argv list to
 * pass to spawn/execFile for the given cmd. The injection slots these flags
 * BEFORE other args so positional `-p <prompt>` still works correctly.
 * Caller-supplied arguments, including permission flags, are preserved as-is.
 */
export function withAdditionalMcpConfig(
  cmd: string,
  args: string[],
  teamRoot: string | undefined,
): string[] {
  const extra = buildAdditionalMcpConfigArgs(cmd, teamRoot);
  if (extra.length === 0) return args;
  return [...extra, ...args];
}
