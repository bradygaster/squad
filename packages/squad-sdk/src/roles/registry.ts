/**
 * Plugin Role Registry — runtime-extensible role catalog.
 *
 * Lets marketplace plugins contribute additional role definitions
 * that `useRole()`, `listRoles()`, `searchRoles()`, and `getCategories()`
 * will discover alongside the built-in {@link BASE_ROLES}.
 *
 * Plugin roles are **additive only** — a plugin may not register a role
 * whose `id` matches a built-in base role. Registering a duplicate id
 * throws so that misconfiguration surfaces loudly at install time rather
 * than silently replacing a built-in charter.
 *
 * @module roles/registry
 */

import type { BaseRole } from './types.js';
import { BASE_ROLES } from './catalog.js';

/**
 * A plugin role registration record — the role plus the plugin that
 * registered it. Useful for diagnostics (`squad roles --debug`) and for
 * surfacing the source of a role in tooling.
 */
export interface PluginRoleRegistration {
  /** Plugin name (e.g., `@acme/frontend-roles`). */
  readonly plugin: string;
  /** The role definition contributed by the plugin. */
  readonly role: BaseRole;
}

/** Outcome of a `registerPluginRoles` call. */
export interface RegisterPluginRolesResult {
  /** Roles that were successfully registered on this call. */
  readonly registered: readonly BaseRole[];
  /** Roles that were skipped, with a human-readable reason. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

const pluginRoles = new Map<string, PluginRoleRegistration>();

function baseRoleIds(): Set<string> {
  return new Set(BASE_ROLES.map(r => r.id));
}

/**
 * Register a batch of plugin-contributed roles.
 *
 * Collision rules:
 * - If `role.id` matches a built-in `BASE_ROLES` id, the call throws.
 *   Built-in roles are load-bearing for existing configs and must never
 *   be shadowed; surface the problem to the plugin author.
 * - If `role.id` is already registered by another plugin, the role is
 *   skipped and reported via the `skipped` list (no throw, so one bad
 *   role in a plugin bundle does not block the rest).
 *
 * @param plugin - Name of the plugin registering the roles (for diagnostics).
 * @param roles - Role definitions to register.
 * @throws If any role id collides with a built-in base role.
 */
export function registerPluginRoles(
  plugin: string,
  roles: readonly BaseRole[],
): RegisterPluginRolesResult {
  const builtins = baseRoleIds();
  const registered: BaseRole[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const role of roles) {
    if (!role || typeof role.id !== 'string' || role.id.length === 0) {
      skipped.push({ id: String((role as BaseRole | undefined)?.id ?? 'unknown'), reason: 'missing id' });
      continue;
    }
    if (builtins.has(role.id)) {
      throw new Error(
        `Plugin '${plugin}' cannot register role '${role.id}' — it collides with a built-in base role. ` +
          `Use a namespaced id such as '@${plugin}/${role.id}'.`,
      );
    }
    const existing = pluginRoles.get(role.id);
    if (existing) {
      skipped.push({
        id: role.id,
        reason: `already registered by plugin '${existing.plugin}'`,
      });
      continue;
    }
    pluginRoles.set(role.id, { plugin, role });
    registered.push(role);
  }

  return { registered, skipped };
}

/** Remove a single plugin role. Returns true if the id was registered. */
export function unregisterPluginRole(id: string): boolean {
  return pluginRoles.delete(id);
}

/** Remove every plugin role. Intended for tests and hot-reload paths. */
export function clearPluginRoles(): void {
  pluginRoles.clear();
}

/** All plugin-registered roles, in registration order. */
export function getPluginRoles(): readonly BaseRole[] {
  return [...pluginRoles.values()].map(r => r.role);
}

/** Full registration records (plugin + role), in registration order. */
export function getPluginRoleRegistrations(): readonly PluginRoleRegistration[] {
  return [...pluginRoles.values()];
}

/**
 * Merged view: built-in roles first, then plugin roles in registration
 * order. Built-ins always precede plugin roles so that lookups and
 * iteration remain deterministic.
 */
export function getAllRoles(): readonly BaseRole[] {
  return [...BASE_ROLES, ...getPluginRoles()];
}
