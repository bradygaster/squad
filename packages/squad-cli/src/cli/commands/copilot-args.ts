/**
 * Centralized Copilot CLI argument builder.
 *
 * Every call site that spawns `gh copilot` should go through this helper
 * so the prompt flag (`-p`) lives in exactly one place.  When the upstream
 * CLI surface changes again we fix it here and nowhere else.
 */

export interface CopilotSpawnOptions {
  /** Fully override the agent command (e.g., `custom-agent --flag`). */
  agentCmd?: string;
  /** Extra flags appended after the prompt (e.g., `--model gpt-4`). Ignored when agentCmd is set. */
  copilotFlags?: string;
}

/**
 * Build the `{ cmd, args }` tuple used by `child_process.execFile` to
 * invoke the GitHub Copilot CLI with the given prompt.
 *
 * Default: `gh copilot -p <prompt> [copilotFlags…]`
 * Override: `<agentCmd…> -p <prompt>`
 */
export function buildCopilotArgs(
  prompt: string,
  options?: CopilotSpawnOptions,
): { cmd: string; args: string[] } {
  const agentCmd = options?.agentCmd?.trim();
  if (agentCmd) {
    const parts = agentCmd.split(/\s+/);
    return { cmd: parts[0]!, args: [...parts.slice(1), '-p', prompt] };
  }

  const args = ['copilot', '-p', prompt];

  const flags = options?.copilotFlags?.trim();
  if (flags) {
    args.push(...flags.split(/\s+/));
  }

  return { cmd: 'gh', args };
}
