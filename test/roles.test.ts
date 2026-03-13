import { describe, it, expect } from 'vitest';
import {
  listRoles,
  getRoleById,
  searchRoles,
  getCategories,
  useRole,
  generateCharterFromRole,
} from '../packages/squad-sdk/src/roles/index.js';
import { BASE_ROLES } from '../packages/squad-sdk/src/roles/catalog.js';
import { CATEGORY_ROLES } from '../packages/squad-sdk/src/roles/catalog-categories.js';
import type { BaseRole } from '../packages/squad-sdk/src/roles/types.js';

describe('Base Roles Catalog', () => {
  describe('catalog integrity', () => {
    it('BASE_ROLES has exactly 20 entries', () => {
      expect(BASE_ROLES).toHaveLength(20);
    });

    const requiredFields: (keyof BaseRole)[] = [
      'id',
      'title',
      'category',
      'emoji',
      'vibe',
      'expertise',
      'style',
      'ownership',
      'approach',
      'boundaries',
      'voice',
      'routingPatterns',
      'attribution',
    ];

    it.each(BASE_ROLES)('role $id has all required fields', role => {
      for (const field of requiredFields) {
        expect(role[field]).toBeDefined();
      }
    });

    it.each(BASE_ROLES)('role $id has no empty fields', role => {
      for (const field of requiredFields) {
        const value = role[field];
        if (typeof value === 'string') {
          expect(value.trim()).not.toBe('');
        } else {
          expect(value).not.toBeNull();
          expect(value).not.toBeUndefined();
        }
      }
    });

    it.each(BASE_ROLES)('role $id has at least 3 expertise items', role => {
      expect(role.expertise.length).toBeGreaterThanOrEqual(3);
      expect(role.expertise.every(item => item.trim().length > 0)).toBe(true);
    });

    it.each(BASE_ROLES)('role $id has at least 3 routing patterns', role => {
      expect(role.routingPatterns.length).toBeGreaterThanOrEqual(3);
      expect(role.routingPatterns.every(item => item.trim().length > 0)).toBe(true);
    });

    it.each(BASE_ROLES)('role $id has non-empty boundaries', role => {
      expect(role.boundaries.handles.trim()).not.toBe('');
      expect(role.boundaries.doesNotHandle.trim()).not.toBe('');
    });

    it.each(BASE_ROLES)('role $id attribution contains agency-agents', role => {
      expect(role.attribution).toContain('agency-agents');
    });

    it('all role IDs are unique', () => {
      const ids = BASE_ROLES.map(role => role.id);
      expect(new Set(ids).size).toBe(BASE_ROLES.length);
    });

    it('all 12 engineering role IDs are present', () => {
      const expectedEngineeringIds = [
        'lead',
        'frontend',
        'backend',
        'fullstack',
        'reviewer',
        'tester',
        'devops',
        'security',
        'data',
        'docs',
        'ai',
        'designer',
      ];

      const ids = BASE_ROLES.map(role => role.id);
      for (const id of expectedEngineeringIds) {
        expect(ids).toContain(id);
      }
    });

    it('all category role IDs from CATEGORY_ROLES are present', () => {
      const ids = BASE_ROLES.map(role => role.id);
      expect(CATEGORY_ROLES).toHaveLength(8);

      for (const role of CATEGORY_ROLES) {
        expect(ids).toContain(role.id);
      }
    });
  });

  describe('listRoles', () => {
    it('returns all 20 roles when no category is specified', () => {
      expect(listRoles()).toHaveLength(20);
    });

    it('filters correctly by category engineering', () => {
      const roles = listRoles('engineering');
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.every(role => role.category === 'engineering')).toBe(true);
    });

    it('filters correctly by category quality', () => {
      const roles = listRoles('quality');
      expect(roles.length).toBeGreaterThan(0);
      expect(roles.every(role => role.category === 'quality')).toBe(true);
    });

    it('returns empty array for unknown category', () => {
      expect(listRoles('not-a-category' as any)).toEqual([]);
    });
  });

  describe('getRoleById', () => {
    it('finds backend role', () => {
      const role = getRoleById('backend');
      expect(role).toBeDefined();
      expect(role?.id).toBe('backend');
    });

    it('finds marketing-strategist role', () => {
      const role = getRoleById('marketing-strategist');
      expect(role).toBeDefined();
      expect(role?.id).toBe('marketing-strategist');
    });

    it('returns undefined for nonexistent role', () => {
      expect(getRoleById('nonexistent')).toBeUndefined();
    });
  });

  describe('searchRoles', () => {
    it('finds roles by title match', () => {
      const results = searchRoles('Backend');
      expect(results.some(role => role.id === 'backend')).toBe(true);
    });

    it('finds roles by vibe match', () => {
      const results = searchRoles('pixel');
      expect(results.some(role => role.id === 'designer' || role.id === 'frontend')).toBe(true);
    });

    it('finds roles by expertise match', () => {
      const results = searchRoles('API');
      expect(results.length).toBeGreaterThan(0);
    });

    it('finds roles by routing pattern match', () => {
      const results = searchRoles('database');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for nonsense query', () => {
      expect(searchRoles('zzzzzz-unlikely-query')).toEqual([]);
    });

    it('is case insensitive', () => {
      const lower = searchRoles('backend').map(role => role.id);
      const upper = searchRoles('BACKEND').map(role => role.id);
      expect(upper).toEqual(lower);
    });
  });

  describe('getCategories', () => {
    it('returns array of unique categories', () => {
      const categories = getCategories();
      expect(new Set(categories).size).toBe(categories.length);
    });

    it('includes expected core categories', () => {
      const categories = getCategories();
      expect(categories).toEqual(
        expect.arrayContaining(['engineering', 'quality', 'operations']),
      );
    });
  });

  describe('useRole', () => {
    it('returns AgentDefinition with correct name and role title', () => {
      const agent = useRole('backend', { name: 'kane' });
      expect(agent.name).toBe('kane');
      expect(agent.role).toBe('Backend Developer');
    });

    it('includes charter content sections and attribution comment', () => {
      const agent = useRole('backend', { name: 'kane' });
      expect(agent.charter).toBeDefined();
      expect(agent.charter).toContain('<!--');
      expect(agent.charter).toContain('agency-agents');
      expect(agent.charter).toContain('## Identity');
      expect(agent.charter).toContain('## What I Own');
      expect(agent.charter).toContain('## How I Work');
      expect(agent.charter).toContain('## Boundaries');
      expect(agent.charter).toContain('## Model');
      expect(agent.charter).toContain('## Collaboration');
      expect(agent.charter).toContain('## Voice');
    });

    it('replaces {my-name} placeholder with agent name in charter', () => {
      const agent = useRole('backend', { name: 'Kane' });
      expect(agent.charter).toContain('inbox/kane-');
      expect(agent.charter).not.toContain('{my-name}');
    });

    it('overrides expertise when provided', () => {
      const agent = useRole('backend', {
        name: 'kane',
        expertise: ['Node.js', 'PostgreSQL', 'Caching'],
      });

      expect(agent.charter).toContain('**Expertise:** Node.js, PostgreSQL, Caching');
    });

    it('appends extraOwnership', () => {
      const agent = useRole('backend', {
        name: 'kane',
        extraOwnership: ['Database observability'],
      });

      expect(agent.charter).toContain('- Database observability');
    });

    it('throws for unknown role with helpful available roles message', () => {
      expect(() => useRole('nonexistent', { name: 'ghost' })).toThrowError(
        /Unknown base role 'nonexistent'\. Available roles:/,
      );
      expect(() => useRole('nonexistent', { name: 'ghost' })).toThrowError(/backend/);
      expect(() => useRole('nonexistent', { name: 'ghost' })).toThrowError(/marketing-strategist/);
    });
  });

  describe('generateCharterFromRole', () => {
    it('returns formatted charter string for valid role', () => {
      const charter = generateCharterFromRole('backend', 'Kane');
      expect(charter).toBeTypeOf('string');
      expect(charter).toContain('# Kane — Backend Developer');
    });

    it('includes vibe as blockquote and all charter sections', () => {
      const charter = generateCharterFromRole('backend', 'Kane');
      expect(charter).not.toBeNull();

      expect(charter).toContain('> Designs the systems that hold everything up');
      expect(charter).toContain('## Identity');
      expect(charter).toContain('## What I Own');
      expect(charter).toContain('## How I Work');
      expect(charter).toContain('## Boundaries');
      expect(charter).toContain('## Model');
      expect(charter).toContain('## Collaboration');
      expect(charter).toContain('## Voice');
    });

    it('returns null for unknown role', () => {
      expect(generateCharterFromRole('nonexistent', 'Ghost')).toBeNull();
    });
  });
});