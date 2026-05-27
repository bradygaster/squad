/**
 * YAML frontmatter renderer for the coordinator agent file.
 */

import type { CoordinatorMeta } from './types.js';

/**
 * Render YAML frontmatter for the coordinator agent.
 * Produces minimal, valid, deterministic, surface-safe YAML.
 */
export function renderFrontmatter(coordinator: CoordinatorMeta): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${coordinator.displayName}`);
  lines.push(`description: "${escapeYamlString(coordinator.description)}"`);

  if (coordinator.tools === '*') {
    lines.push(`tools: "*"`);
  } else {
    lines.push(`tools:`);
    for (const tool of coordinator.tools) {
      lines.push(`  - ${tool}`);
    }
  }

  if (coordinator.model) {
    lines.push(`model: ${coordinator.model}`);
  }

  if (coordinator.skills.length > 0) {
    lines.push(`skills:`);
    for (const skill of coordinator.skills) {
      lines.push(`  - ${skill}`);
    }
  }

  lines.push(`user-invocable: true`);
  lines.push(`deferred-tool-loading: true`);
  lines.push('---');

  return lines.join('\n');
}

function escapeYamlString(value: string): string {
  return value.replace(/"/g, '\\"');
}
