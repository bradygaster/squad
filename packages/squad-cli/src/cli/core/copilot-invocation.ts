/**
 * Helpers for spawning the Copilot CLI from squad-managed code paths.
 *
 * Background — iter-9 finding: Copilot CLI 1.0.59 does NOT auto-load the
 * workspace `.mcp.json` in non-interactive (`-p`) mode due to a folder-trust
 * security gate (`FH.isFolderTrusted()`). The gate cannot be satisfied without
 * a UI prompt, so the `squad_state` MCP entry written by `squad init` /
 * `squad upgrade` to the repo-root `.mcp.json` is silently ignored every time
 * squad spawns `copilot -p` — leaving `squad_state_*` tools unwired.
 *
 * Mitigation: every squad-internal `copilot` spawn prepends two flags:
 *   1. `--yolo`  — suppresses the per-tool-call consent prompt that would
 *      otherwise block non-interactive (`-p`) automation.
 *   2. `--additional-mcp-config @<abs-path>`  — explicitly loads the project's
 *      `.mcp.json` so `squad_state_*` tools register for that session.
 *
 * We only inject when:
 *  - the command being spawned is the bare `copilot` binary (i.e. the user
 *    did not override via `--agent-cmd`)
 *  - a `.mcp.json` file actually exists at `teamRoot`
 *
 * Empirical test matrix (Copilot CLI 1.0.59):
 *   copilot -p "..."                                      → ❌ workspace MCP NOT loaded
 *   copilot --yolo -p "..."                               → ❌ workspace MCP NOT loaded
 *   copilot --yolo --autopilot -p "..."                   → ❌ workspace MCP NOT loaded
 *   copilot --additional-mcp-config @.mcp.json --yolo -p  → ✅ PROVEN WORKAROUND
 *   interactive copilot → "Trust folder?" → Yes           → ✅ loads (not automatable)
 *
 * See `.squad/files/validation/COMBINED-FIX-BRANCH-MANIFEST.md` (iter-9) for
 * the full empirical proof that this exact flag combination is required.
 */

import path from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Build the extra CLI args needed to make the Copilot CLI load this project's
 * `.mcp.json` for a non-interactive (`-p`) spawned session.
 *
 * Returns `['--yolo', '--additional-mcp-config', '@<abs-path>']` when
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
  return ['--yolo', '--additional-mcp-config', `@${configPath}`];
}

/**
 * Prepend the MCP-config + yolo args to `args`. Returns the full argv list to
 * pass to spawn/execFile for the given cmd. The injection slots these flags
 * BEFORE other args so positional `-p <prompt>` still works correctly.
 *
 * If `--yolo` is already present in `args` (e.g. user supplied it via
 * `copilotFlags`), the duplicate is stripped from `args` before prepending to
 * avoid passing `--yolo` twice.
 */
export function withAdditionalMcpConfig(
  cmd: string,
  args: string[],
  teamRoot: string | undefined,
): string[] {
  const extra = buildAdditionalMcpConfigArgs(cmd, teamRoot);
  if (extra.length === 0) return args;
  // Strip any user-supplied --yolo to avoid passing it twice.
  const cleanArgs = args.filter(a => a !== '--yolo');
  return [...extra, ...cleanArgs];
}
