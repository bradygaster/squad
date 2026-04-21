/**
 * Identity Module — Role slug mapping
 *
 * Maps role titles/patterns to the 8 canonical identity slugs.
 * Used to resolve which GitHub App identity an agent should use.
 *
 * @module identity/role-slugs
 */

import type { RoleSlug } from './types.js';

/**
 * Pattern-to-slug mapping table.
 * Each entry is [lowercased substring, canonical slug].
 * Order matters — first match wins.
 */
const ROLE_PATTERNS: ReadonlyArray<readonly [string, RoleSlug]> = [
  // Lead / Architect
  ['lead', 'lead'],
  ['architect', 'lead'],
  ['tech lead', 'lead'],

  // Frontend / UI
  ['frontend', 'frontend'],
  ['front-end', 'frontend'],
  ['ui/', 'frontend'],
  ['ui ', 'frontend'],
  ['design', 'frontend'],

  // Backend / Core
  ['backend', 'backend'],
  ['back-end', 'backend'],
  ['api', 'backend'],
  ['server', 'backend'],
  ['core dev', 'backend'],

  // Tester / QA
  ['tester', 'tester'],
  ['qa', 'tester'],
  ['quality', 'tester'],

  // DevOps / Infra
  ['devops', 'devops'],
  ['infra', 'devops'],
  ['platform', 'devops'],
  ['ci/cd', 'devops'],
  ['ci-cd', 'devops'],

  // Docs / DevRel
  ['devrel', 'docs'],
  ['writer', 'docs'],
  ['documentation', 'docs'],
  ['docs', 'docs'],

  // Security
  ['security', 'security'],
  ['auth', 'security'],
  ['compliance', 'security'],

  // Data
  ['data', 'data'],
  ['database', 'data'],
  ['analytics', 'data'],
];

/** The default slug when no pattern matches. */
const DEFAULT_SLUG: RoleSlug = 'backend';

/**
 * Resolve a role title to a canonical identity slug.
 *
 * @param roleTitle - Human-readable role title (e.g., "Core Dev", "Tech Lead")
 * @returns The matching canonical slug, or `'backend'` as fallback
 */
export function resolveRoleSlug(roleTitle: string): RoleSlug {
  const lower = roleTitle.toLowerCase();
  for (const [pattern, slug] of ROLE_PATTERNS) {
    if (lower.includes(pattern)) return slug;
  }
  return DEFAULT_SLUG;
}
