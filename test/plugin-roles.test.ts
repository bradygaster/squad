import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listRoles,
  getRoleById,
  searchRoles,
  getCategories,
  useRole,
  registerPluginRoles,
  clearPluginRoles,
  getPluginRoles,
  getPluginRoleRegistrations,
  getAllRoles,
  loadPluginRolesFromDir,
} from '../packages/squad-sdk/src/roles/index.js';
import { BASE_ROLES } from '../packages/squad-sdk/src/roles/catalog.js';
import type { BaseRole } from '../packages/squad-sdk/src/roles/types.js';

function sampleRole(overrides: Partial<BaseRole> = {}): BaseRole {
  return {
    id: '@acme/react-frontend',
    title: 'React Frontend (Acme)',
    category: 'engineering',
    emoji: '⚛️',
    vibe: 'Acme-flavored React specialist.',
    expertise: ['React', 'Testing Library', 'State management'],
    style: 'Direct. Tested.',
    ownership: ['Acme UI layer'],
    approach: ['Measure-first'],
    boundaries: { handles: 'React UI', doesNotHandle: 'Backend APIs' },
    voice: 'Crisp and opinionated.',
    routingPatterns: ['react', 'frontend', 'acme'],
    attribution: 'Contributed by the @acme marketplace plugin.',
    ...overrides,
  };
}

describe('plugin role registry', () => {
  beforeEach(() => {
    clearPluginRoles();
  });
  afterEach(() => {
    clearPluginRoles();
  });

  it('registerPluginRoles adds roles that getRoleById/listRoles/searchRoles can find', () => {
    const role = sampleRole();
    const result = registerPluginRoles('@acme/frontend-roles', [role]);
    expect(result.registered).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    expect(getRoleById(role.id)).toEqual(role);
    expect(listRoles().some(r => r.id === role.id)).toBe(true);
    expect(listRoles('engineering').some(r => r.id === role.id)).toBe(true);
    expect(searchRoles('acme').some(r => r.id === role.id)).toBe(true);
  });

  it('throws when a plugin role id collides with a built-in base role', () => {
    expect(() =>
      registerPluginRoles('@evil/overrider', [sampleRole({ id: 'backend' })]),
    ).toThrowError(/cannot register role 'backend'/);
    // Built-in backend is untouched.
    expect(getRoleById('backend')?.id).toBe('backend');
    expect(getPluginRoles()).toHaveLength(0);
  });

  it('skips (does not throw) when two plugins try the same id', () => {
    registerPluginRoles('@acme/one', [sampleRole()]);
    const result = registerPluginRoles('@acme/two', [sampleRole()]);
    expect(result.registered).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.id).toBe('@acme/react-frontend');
    expect(result.skipped[0]?.reason).toMatch(/already registered/);
  });

  it('getPluginRoleRegistrations records the plugin source', () => {
    registerPluginRoles('@acme/frontend-roles', [sampleRole()]);
    const regs = getPluginRoleRegistrations();
    expect(regs).toHaveLength(1);
    expect(regs[0]?.plugin).toBe('@acme/frontend-roles');
    expect(regs[0]?.role.id).toBe('@acme/react-frontend');
  });

  it('getCategories includes categories contributed by plugin roles', () => {
    registerPluginRoles('@acme/compliance', [
      sampleRole({ id: '@acme/auditor', category: 'compliance' }),
    ]);
    expect(getCategories()).toContain('compliance');
  });

  it('useRole resolves plugin role ids identically to built-ins', () => {
    registerPluginRoles('@acme/frontend-roles', [sampleRole()]);
    const agent = useRole('@acme/react-frontend', { name: 'ada' });
    expect(agent.role).toBe('React Frontend (Acme)');
    expect(agent.charter).toContain('Contributed by the @acme marketplace plugin');
    expect(agent.charter).toContain('## Identity');
  });

  it('useRole error lists plugin roles among available ids', () => {
    registerPluginRoles('@acme/frontend-roles', [sampleRole()]);
    try {
      useRole('nonexistent', { name: 'ghost' });
      throw new Error('should have thrown');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('@acme/react-frontend');
      expect(msg).toContain('backend');
    }
  });

  it('getAllRoles returns BASE_ROLES first then plugin roles', () => {
    registerPluginRoles('@acme/frontend-roles', [sampleRole()]);
    const all = getAllRoles();
    expect(all.slice(0, BASE_ROLES.length)).toEqual(BASE_ROLES);
    expect(all[all.length - 1]?.id).toBe('@acme/react-frontend');
  });

  it('clearPluginRoles removes all registrations', () => {
    registerPluginRoles('@acme/frontend-roles', [sampleRole()]);
    clearPluginRoles();
    expect(getPluginRoles()).toHaveLength(0);
    expect(getRoleById('@acme/react-frontend')).toBeUndefined();
  });
});

describe('loadPluginRolesFromDir', () => {
  let tmp: string;

  beforeEach(() => {
    clearPluginRoles();
    tmp = mkdtempSync(join(tmpdir(), 'squad-plugin-roles-'));
  });
  afterEach(() => {
    clearPluginRoles();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns an empty summary when the pluginsDir does not exist', () => {
    const summaries = loadPluginRolesFromDir(join(tmp, 'does-not-exist'));
    expect(summaries).toEqual([]);
  });

  it('loads JSON role files and registers them', () => {
    const pluginDir = join(tmp, 'plugins', '@acme-plugin', 'roles');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'frontend.json'), JSON.stringify(sampleRole()), 'utf-8');

    const summaries = loadPluginRolesFromDir(join(tmp, 'plugins'));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.plugin).toBe('@acme-plugin');
    expect(summaries[0]?.result.registered).toHaveLength(1);
    expect(getRoleById('@acme/react-frontend')).toBeDefined();
  });

  it('accepts a JSON array of roles in a single file', () => {
    const pluginDir = join(tmp, 'plugins', 'multi', 'roles');
    mkdirSync(pluginDir, { recursive: true });
    const roles = [
      sampleRole({ id: '@multi/a', title: 'A' }),
      sampleRole({ id: '@multi/b', title: 'B' }),
    ];
    writeFileSync(join(pluginDir, 'bundle.json'), JSON.stringify(roles), 'utf-8');

    const summaries = loadPluginRolesFromDir(join(tmp, 'plugins'));
    expect(summaries[0]?.result.registered).toHaveLength(2);
    expect(getRoleById('@multi/a')).toBeDefined();
    expect(getRoleById('@multi/b')).toBeDefined();
  });

  it('reports invalid JSON without throwing', () => {
    const pluginDir = join(tmp, 'plugins', 'bad', 'roles');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'broken.json'), '{ not valid', 'utf-8');

    const summaries = loadPluginRolesFromDir(join(tmp, 'plugins'));
    expect(summaries[0]?.error).toMatch(/invalid JSON/);
    expect(summaries[0]?.result.registered).toHaveLength(0);
  });

  it('reports collisions with built-in role ids without aborting the scan', () => {
    const pluginDir = join(tmp, 'plugins', 'shadow', 'roles');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(
      join(pluginDir, 'override.json'),
      JSON.stringify(sampleRole({ id: 'backend' })),
      'utf-8',
    );
    writeFileSync(
      join(pluginDir, 'ok.json'),
      JSON.stringify(sampleRole({ id: '@shadow/fine' })),
      'utf-8',
    );

    const summaries = loadPluginRolesFromDir(join(tmp, 'plugins'));
    const override = summaries.find(s => s.source.endsWith('override.json'));
    const ok = summaries.find(s => s.source.endsWith('ok.json'));
    expect(override?.error).toMatch(/cannot register role 'backend'/);
    expect(ok?.result.registered).toHaveLength(1);
    expect(getRoleById('@shadow/fine')).toBeDefined();
    // Built-in backend is unchanged.
    expect(getRoleById('backend')?.title).toBe('Backend Developer');
  });

  it('ignores non-directory entries and non-JSON files', () => {
    const pluginsDir = join(tmp, 'plugins');
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(join(pluginsDir, 'README.md'), '# not a plugin', 'utf-8');
    const pluginDir = join(pluginsDir, 'real', 'roles');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'note.txt'), 'ignored', 'utf-8');
    writeFileSync(join(pluginDir, 'role.json'), JSON.stringify(sampleRole()), 'utf-8');

    const summaries = loadPluginRolesFromDir(pluginsDir);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.plugin).toBe('real');
  });
});
