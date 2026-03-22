/**
 * User-friendly error message templates with recovery guidance.
 * All messages are conversational and action-oriented.
 *
 * @module cli/shell/error-messages
 */

export interface ErrorGuidance {
  message: string;
  recovery: string[];
}

/** SDK disconnect / connection errors */
export function sdkDisconnectGuidance(detail?: string): ErrorGuidance {
  return {
    message: detail ? `SDK disconnected: ${detail}` : 'SDK disconnected.',
    recovery: [
      "Run 'squad doctor' to check your setup",
      'Check your internet connection',
      'Restart the shell to reconnect',
    ],
  };
}

/** team.md missing or invalid */
export function teamConfigGuidance(issue: string): ErrorGuidance {
  return {
    message: `Team configuration issue: ${issue}`,
    recovery: [
      "Run 'squad doctor' to diagnose",
      "Run 'squad init' to regenerate team.md",
      'Check .squad/team.md exists and has valid YAML',
    ],
  };
}

/** Agent session failure */
export function agentSessionGuidance(agentName: string, detail?: string): ErrorGuidance {
  return {
    message: `${agentName} session failed${detail ? `: ${detail}` : ''}.`,
    recovery: [
      'Try your message again (session will auto-reconnect)',
      "Run 'squad doctor' to check setup",
      `Use @${agentName} to retry directly`,
    ],
  };
}

/** Format seconds into a human-readable duration string */
function formatDuration(seconds: number): string {
  const hours = Math.ceil(seconds / 3600);
  const minutes = Math.ceil(seconds / 60);
  if (seconds >= 3600) return `${hours} hour${hours === 1 ? '' : 's'}`;
  if (seconds >= 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/**
 * Extract retry-after duration (in seconds) from an error message string.
 * Handles patterns like "retry after 120 seconds", "try again in 2 hours", etc.
 */
export function extractRetryAfter(message: string): number | undefined {
  const secMatch = message.match(/retry.{0,15}after\s+(\d+)\s*second/i);
  if (secMatch) return parseInt(secMatch[1]!, 10);
  const hrMatch = message.match(/(?:try again|retry).{0,20}in\s+(\d+)\s*hour/i);
  if (hrMatch) return parseInt(hrMatch[1]!, 10) * 3600;
  const minMatch = message.match(/(?:try again|retry).{0,20}in\s+(\d+)\s*minute/i);
  if (minMatch) return parseInt(minMatch[1]!, 10) * 60;
  return undefined;
}

/** Rate limit hit — model or endpoint temporarily throttled */
export function rateLimitGuidance(opts?: { retryAfter?: number; model?: string }): ErrorGuidance {
  const modelStr = opts?.model ? ` for ${opts.model}` : '';
  const retryStr = opts?.retryAfter
    ? `Try again in ${formatDuration(opts.retryAfter)}`
    : 'Try again later when the limit resets';
  return {
    message: `Rate limit reached${modelStr}. Copilot has temporarily throttled your requests.`,
    recovery: [
      retryStr,
      'Enable economy mode to switch to cheaper models: `squad economy on`',
      'Or set a different model: add `"defaultModel": "gpt-4.1"` to .squad/config.json',
    ],
  };
}

/** Generic error with context */
export function genericGuidance(detail: string): ErrorGuidance {
  return {
    message: detail,
    recovery: [
      'Try your message again',
      "Run 'squad doctor' for diagnostics",
      'Check your internet connection',
    ],
  };
}

/** Request timeout */
export function timeoutGuidance(agentName?: string): ErrorGuidance {
  const who = agentName ? `${agentName} timed out` : 'Request timed out';
  return {
    message: `${who}. The model may be under load.`,
    recovery: [
      'Try again — the issue is often transient',
      'Set SQUAD_REPL_TIMEOUT=120 for a longer timeout (seconds)',
      "Run 'squad doctor' to verify connectivity",
    ],
  };
}

/** Unknown slash command */
export function unknownCommandGuidance(command: string): ErrorGuidance {
  return {
    message: `Unknown command: /${command}`,
    recovery: [
      'Type /help to see available commands',
      'Check for typos in the command name',
    ],
  };
}

/** Format an ErrorGuidance into a user-facing string */
export function formatGuidance(g: ErrorGuidance): string {
  const lines = [`❌ ${g.message}`];
  if (g.recovery.length > 0) {
    lines.push('   Try:');
    for (const r of g.recovery) {
      lines.push(`   • ${r}`);
    }
  }
  return lines.join('\n');
}
