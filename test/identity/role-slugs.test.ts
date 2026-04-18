/**
 * Tests for resolveRoleSlug() — maps agent role names to canonical role slugs.
 *
 * The identity module maps free-form role strings (from team.md) to a bounded
 * set of ~8 canonical slugs used to select the correct GitHub App identity.
 *
 * @see docs/proposals/agent-github-identity.md — "Standard Role Slugs" table
 * @module test/identity/role-slugs
 */

import { describe, it, expect } from 'vitest';
import { resolveRoleSlug } from '@bradygaster/squad-sdk/identity';

// ============================================================================
// Standard role mappings (from the proposal's role slug table)
// ============================================================================
describe('resolveRoleSlug — standard mappings', () => {
  it('maps "Lead" → lead', () => {
    expect(resolveRoleSlug('Lead')).toBe('lead');
  });

  it('maps "Backend Developer" → backend', () => {
    expect(resolveRoleSlug('Backend Developer')).toBe('backend');
  });

  it('maps "Frontend Dev" → frontend', () => {
    expect(resolveRoleSlug('Frontend Dev')).toBe('frontend');
  });

  it('maps "Tester" → tester', () => {
    expect(resolveRoleSlug('Tester')).toBe('tester');
  });

  it('maps "QA Engineer" → tester', () => {
    expect(resolveRoleSlug('QA Engineer')).toBe('tester');
  });

  it('maps "DevOps" → devops', () => {
    expect(resolveRoleSlug('DevOps')).toBe('devops');
  });

  it('maps "Security Engineer" → security', () => {
    expect(resolveRoleSlug('Security Engineer')).toBe('security');
  });

  it('maps "DevRel" → docs', () => {
    expect(resolveRoleSlug('DevRel')).toBe('docs');
  });

  it('maps "Data Engineer" → data', () => {
    expect(resolveRoleSlug('Data Engineer')).toBe('data');
  });
});

// ============================================================================
// Common aliases — non-standard role names that should resolve correctly
// ============================================================================
describe('resolveRoleSlug — common aliases', () => {
  it('maps "Core Dev" → backend (common alias)', () => {
    expect(resolveRoleSlug('Core Dev')).toBe('backend');
  });

  it('maps "UI Designer" → frontend', () => {
    expect(resolveRoleSlug('UI Designer')).toBe('frontend');
  });

  it('maps "Platform Engineer" → devops', () => {
    expect(resolveRoleSlug('Platform Engineer')).toBe('devops');
  });
});

// ============================================================================
// Case insensitivity
// ============================================================================
describe('resolveRoleSlug — case insensitive', () => {
  it('matches "lead" (lowercase)', () => {
    expect(resolveRoleSlug('lead')).toBe('lead');
  });

  it('matches "BACKEND DEVELOPER" (uppercase)', () => {
    expect(resolveRoleSlug('BACKEND DEVELOPER')).toBe('backend');
  });

  it('matches "devOps" (mixed case)', () => {
    expect(resolveRoleSlug('devOps')).toBe('devops');
  });

  it('matches "tester" (lowercase)', () => {
    expect(resolveRoleSlug('tester')).toBe('tester');
  });

  it('matches "SECURITY ENGINEER" (uppercase)', () => {
    expect(resolveRoleSlug('SECURITY ENGINEER')).toBe('security');
  });
});

// ============================================================================
// Unknown / unmapped roles — should return fallback
// ============================================================================
describe('resolveRoleSlug — fallback for unknown roles', () => {
  it('returns fallback for completely unknown role', () => {
    expect(resolveRoleSlug('Underwater Basket Weaver')).toBe('backend');
  });

  it('returns fallback for empty string', () => {
    expect(resolveRoleSlug('')).toBe('backend');
  });

  it('returns fallback for a role with no keyword match', () => {
    expect(resolveRoleSlug('Chief Happiness Officer')).toBe('backend');
  });
});
