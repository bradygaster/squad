/**
 * YAML frontmatter renderer for the coordinator agent file.
 */

import type { CoordinatorMeta } from './types.js';

/**
 * Quote a YAML scalar value safely. Always double-quotes to handle
 * special characters like :, #, leading/trailing whitespace, and newlines.
 */
function quoteYamlScalar(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/**
 * Render YAML frontmatter for the coordinator agent.
 * Produces minimal, valid, deterministic, surface-safe YAML.
 * All scalar values are quoted to prevent YAML injection.
 */
export function renderFrontmatter(coordinator: CoordinatorMeta): string {
  const lines: string[] = ['---'];

  lines.push(`name: ${quoteYamlScalar(coordinator.displayName)}`);
  lines.push(`description: ${quoteYamlScalar(coordinator.description)}`);

  if (coordinator.tools === '*') {
    lines.push(`tools: "*"`);
  } else {
    lines.push(`tools:`);
    for (const tool of coordinator.tools) {
      lines.push(`  - ${quoteYamlScalar(tool)}`);
    }
  }

  if (coordinator.model) {
    lines.push(`model: ${quoteYamlScalar(coordinator.model)}`);
  }

  if (coordinator.skills.length > 0) {
    lines.push(`skills:`);
    for (const skill of coordinator.skills) {
      lines.push(`  - ${quoteYamlScalar(skill)}`);
    }
  }

  lines.push(`user-invocable: true`);
  lines.push(`deferred-tool-loading: true`);
  lines.push('---');

  return lines.join('\n');
}
