/**
 * Base Role Catalog — combines engineering and category roles
 *
 * This is the main catalog entry point that merges all base role sets.
 *
 * Attribution: Role content adapted from agency-agents by AgentLand
 * Contributors (MIT License) — https://github.com/msitarzewski/agency-agents
 *
 * @module roles/catalog
 */

import type { BaseRole } from './types.js';
import { ENGINEERING_ROLES } from './catalog-engineering.js';
import { CATEGORY_ROLES } from './catalog-categories.js';

/**
 * The complete base role catalog — all 20 built-in roles.
 */
export const BASE_ROLES: readonly BaseRole[] = [
  ...ENGINEERING_ROLES,
  ...CATEGORY_ROLES,
] as const;

/**
 * Role IDs for the software development core roles.
 */
export const ENGINEERING_ROLE_IDS = ENGINEERING_ROLES.map(r => r.id);

/**
 * Role IDs for the category generalist roles.
 */
export const CATEGORY_ROLE_IDS = CATEGORY_ROLES.map(r => r.id);
