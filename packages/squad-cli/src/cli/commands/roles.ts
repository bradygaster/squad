import {
  listRoles,
  searchRoles,
  getCategories,
  getPluginRoleRegistrations,
  BASE_ROLES,
} from '@bradygaster/squad-sdk';

type RoleRecord = ReturnType<typeof listRoles>[number];

const SOFTWARE_DEVELOPMENT_CATEGORIES = new Set(['engineering', 'quality']);

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

function printRoleRows(roles: readonly RoleRecord[], indent = '    '): void {
  if (roles.length === 0) return;

  const idWidth = Math.max(...roles.map(r => r.id.length), 2);
  const titleWidth = Math.max(...roles.map(r => r.title.length), 5);

  for (const role of roles) {
    console.log(
      `${indent}${role.emoji.padEnd(3)} ${role.id.padEnd(idWidth)}  ${role.title.padEnd(titleWidth)}  "${role.vibe}"`
    );
  }
}

export async function runRoles(args: string[]): Promise<void> {
  const category = getFlagValue(args, '--category');
  const search = getFlagValue(args, '--search');

  const categories = getCategories();
  if (category && !categories.includes(category as (typeof categories)[number])) {
    console.log(`Unknown category: ${category}`);
    console.log(`Available categories: ${categories.join(', ')}`);
    return;
  }

  let roles = search
    ? [...searchRoles(search)]
    : [...listRoles(category as (typeof categories)[number] | undefined)];

  if (search && category) {
    roles = roles.filter(r => r.category === category);
  }

  if (roles.length === 0) {
    console.log('No roles found.');
    return;
  }

  if (search) {
    printRoleRows(roles, '  ');
    return;
  }

  const builtinIds = new Set(BASE_ROLES.map(r => r.id));
  const builtinRoles = roles.filter(r => builtinIds.has(r.id));
  const pluginRoles = roles.filter(r => !builtinIds.has(r.id));

  const softwareRoles = builtinRoles.filter(r => SOFTWARE_DEVELOPMENT_CATEGORIES.has(r.category));
  const businessRoles = builtinRoles.filter(r => !SOFTWARE_DEVELOPMENT_CATEGORIES.has(r.category));

  console.log(`\n📦 Built-in Roles (${BASE_ROLES.length} base roles)`);
  console.log('   Adapted from agency-agents by AgentLand Contributors (MIT)\n');

  if (softwareRoles.length > 0) {
    console.log('  Software Development:');
    printRoleRows(softwareRoles);
    console.log();
  }

  if (businessRoles.length > 0) {
    console.log('  Business & Operations:');
    printRoleRows(businessRoles);
    console.log();
  }

  if (pluginRoles.length > 0) {
    const registrations = getPluginRoleRegistrations();
    const byPlugin = new Map<string, typeof pluginRoles>();
    for (const reg of registrations) {
      if (!pluginRoles.some(r => r.id === reg.role.id)) continue;
      const bucket = byPlugin.get(reg.plugin) ?? [];
      bucket.push(reg.role);
      byPlugin.set(reg.plugin, bucket);
    }

    console.log(`🔌 Plugin Roles (${pluginRoles.length} from ${byPlugin.size} plugin${byPlugin.size === 1 ? '' : 's'})\n`);
    for (const [plugin, pluginRoleList] of byPlugin) {
      console.log(`  ${plugin}:`);
      printRoleRows(pluginRoleList);
      console.log();
    }
  }
}
