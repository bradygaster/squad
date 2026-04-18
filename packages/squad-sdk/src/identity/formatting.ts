/**
 * Identity Module — Comment attribution formatting
 *
 * Formats agent comments and commit messages with identity attribution.
 *
 * @module identity/formatting
 */

import type { CommentInput, CommitMessageInput } from './types.js';
import { resolveRoleSlug } from './role-slugs.js';

/** Default emoji mapping from canonical role slugs. */
const ROLE_EMOJI: Record<string, string> = {
  lead: '🏗️',
  frontend: '🎨',
  backend: '⚙️',
  tester: '🧪',
  devops: '🚀',
  docs: '📝',
  security: '🔒',
  data: '📊',
};

/**
 * Format a comment with agent identity attribution.
 *
 * Output:
 * ```
 * 🏗️ **Flight** (Lead)
 *
 * Architecture review complete. Approved.
 * ```
 */
export function formatComment(input: CommentInput): string {
  const slug = resolveRoleSlug(input.role);
  const emoji = ROLE_EMOJI[slug] ?? '🤖';
  return `${emoji} **${input.agentName}** (${input.role})\n\n${input.body}`;
}

/**
 * Format a commit message with agent name prefix.
 *
 * Output: `[Flight] refactor: extract auth module`
 */
export function formatCommitMessage(input: CommitMessageInput): string {
  return `[${input.agentName}] ${input.message}`;
}
