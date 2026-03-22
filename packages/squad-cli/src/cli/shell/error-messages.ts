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
