/**
 * Pure parsing functions for coordinator responses.
 * Extracted from the CLI shell coordinator module.
 *
 * Zero dependencies on shell infrastructure or SDK services.
 *
 * @module runtime/coordinator-parser
 */

/** Minimal message interface for formatting conversation context. */
export interface MessageLike {
  role: string;
  content: string;
  agentName?: string;
}

/**
 * Parsed routing decision from coordinator LLM output.
 */
export interface RoutingDecision {
  type: 'direct' | 'route' | 'multi';
  directAnswer?: string;
  routes?: Array<{ agent: string; task: string; context?: string }>;
}

/**
 * Parse coordinator response to extract routing decisions.
 */
export function parseCoordinatorResponse(response: string): RoutingDecision {
  const trimmed = response.trim();

  // Direct answer
  if (trimmed.startsWith('DIRECT:')) {
    return {
      type: 'direct',
      directAnswer: trimmed.slice('DIRECT:'.length).trim(),
    };
  }

  // Multi-agent routing
  if (trimmed.startsWith('MULTI:')) {
    const lines = trimmed.split('\n').slice(1);
    const routes = lines
      .filter(l => l.trim().startsWith('-'))
      .map(l => {
        const match = l.match(/^-\s*(\w+):\s*(.+)$/);
        if (match) {
          return { agent: match[1], task: match[2] };
        }
        return null;
      })
      .filter((r): r is { agent: string; task: string } => r !== null);
    return { type: 'multi', routes };
  }

  // Single agent routing
  if (trimmed.startsWith('ROUTE:')) {
    const agentMatch = trimmed.match(/ROUTE:\s*(\w+)/);
    const taskMatch = trimmed.match(/TASK:\s*(.+)/);
    const contextMatch = trimmed.match(/CONTEXT:\s*(.+)/);
    if (agentMatch) {
      return {
        type: 'route',
        routes: [{
          agent: agentMatch[1]!,
          task: taskMatch?.[1] ?? '',
          context: contextMatch?.[1],
        }],
      };
    }
  }

  // Fallback — treat as direct answer
  return { type: 'direct', directAnswer: trimmed };
}

/**
 * Check if team.md has actual roster entries in the ## Members section.
 * Returns true if there is at least one table data row.
 */
export function hasRosterEntries(teamContent: string): boolean {
  const membersMatch = teamContent.match(/## Members\s*\n([\s\S]*?)(?=\n## |\n*$)/);
  if (!membersMatch) return false;
  const membersSection = membersMatch[1] ?? '';
  const rows = membersSection.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed.startsWith('|') &&
           !trimmed.match(/^\|\s*Name\s*\|/) &&
           !trimmed.match(/^\|\s*-+\s*\|/);
  });
  return rows.length > 0;
}

/**
 * Format conversation history for the coordinator context window.
 * Keeps recent messages, summarizes older ones.
 */
export function formatConversationContext(
  messages: MessageLike[],
  maxMessages: number = 20,
): string {
  const recent = messages.slice(-maxMessages);
  return recent
    .map(m => {
      const prefix = m.agentName ? `[${m.agentName}]` : `[${m.role}]`;
      return `${prefix}: ${m.content}`;
    })
    .join('\n');
}
