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

// ============================================================================
// Compound and edge-case roles — adversarial coverage
//
// These tests target the class of bug where compound role strings (e.g.
// "Code Reviewer & Watchdog") fell through to 'backend' because neither
// 'code reviewer' nor 'watchdog' had entries in ROLE_PATTERNS.
//
// Array order in ROLE_PATTERNS (relevant positions, as of EECOM's fix):
//   0: 'code review' → lead
//   1: 'lead'        → lead
//   2: 'architect'   → lead
//   3: 'tech lead'   → lead
//   4: 'reviewer'    → lead
//   5: 'watchdog'    → lead
//   6: 'frontend'    → frontend
//  11: 'backend'     → backend
//
// First-match-wins: any role string containing 'reviewer' or 'watchdog'
// resolves to 'lead' regardless of other tokens in the string.
// ============================================================================
describe('compound and edge-case roles', () => {
  // --- Core regression: the exact production bug ---
  it('"Code Reviewer & Watchdog" → lead (production regression)', () => {
    // "code review" pattern (pos 0) matches substring of "code reviewer"
    expect(resolveRoleSlug('Code Reviewer & Watchdog')).toBe('lead');
  });

  // --- Multi-keyword compound roles ---
  it('"Lead, Architect" → lead', () => {
    // "lead" pattern (pos 1) matches
    expect(resolveRoleSlug('Lead, Architect')).toBe('lead');
  });

  it('"Security Architect" → lead (architect pattern wins over security)', () => {
    // "architect" (pos 2) precedes "security" in ROLE_PATTERNS
    expect(resolveRoleSlug('Security Architect')).toBe('lead');
  });

  // --- Each new pattern in isolation ---
  it('"Code Reviewer" (alone) → lead', () => {
    // "code review" (pos 0) matches substring
    expect(resolveRoleSlug('Code Reviewer')).toBe('lead');
  });

  it('"Reviewer" (alone) → lead', () => {
    expect(resolveRoleSlug('Reviewer')).toBe('lead');
  });

  it('"Watchdog" (alone) → lead', () => {
    expect(resolveRoleSlug('Watchdog')).toBe('lead');
  });

  it('"Senior Code Review Engineer" → lead', () => {
    // "code review" (pos 0) matches substring of "code review engineer"
    expect(resolveRoleSlug('Senior Code Review Engineer')).toBe('lead');
  });

  // --- Ambiguous / ordering-dependent cases ---
  // "Backend & Reviewer": 'reviewer' is at pos 4, 'backend' is at pos 11.
  // First-match-wins → 'reviewer' hits first → 'lead'.
  // This may be semantically correct (reviewers are lead-tier) but is surprising
  // for agents whose primary identity is backend. Flagged below for Flight.
  it('"Backend & Reviewer" → lead (reviewer pattern pos 4 beats backend pos 11)', () => {
    expect(resolveRoleSlug('Backend & Reviewer')).toBe('lead');
  });
  it.todo(
    'ordering concern: "Backend & Reviewer" resolves to lead (reviewer wins) — ' +
    'if the intent is that the "backend" token should dominate when it is the ' +
    'primary role and "reviewer" is secondary, ROLE_PATTERNS ordering needs a ' +
    'principled tie-break strategy. Needs Flight ruling before changing.',
  );

  // "Frontend Reviewer": 'reviewer' is at pos 4, 'frontend' is at pos 6.
  // First-match-wins → 'reviewer' hits first → 'lead' (not 'frontend').
  // Flagged below for Flight.
  it('"Frontend Reviewer" → lead (reviewer pos 4 beats frontend pos 6)', () => {
    expect(resolveRoleSlug('Frontend Reviewer')).toBe('lead');
  });
  it.todo(
    'ordering concern: "Frontend Reviewer" resolves to lead (reviewer wins) — ' +
    'a "Frontend Reviewer" agent may be intended as frontend-tier, not lead-tier. ' +
    'Consider whether qualifier+primary patterns need compound matching. ' +
    'Needs Flight ruling before changing.',
  );

  // --- Case sensitivity ---
  it('"CODE REVIEWER" (all caps) → lead', () => {
    expect(resolveRoleSlug('CODE REVIEWER')).toBe('lead');
  });

  it('"code reviewer" (all lower) → lead', () => {
    expect(resolveRoleSlug('code reviewer')).toBe('lead');
  });

  it('"Code Reviewer" (title case) → lead', () => {
    expect(resolveRoleSlug('Code Reviewer')).toBe('lead');
  });

  // --- Whitespace ---
  it('"  Code Reviewer  " (leading/trailing spaces) → lead', () => {
    // resolveRoleSlug does not trim, but String#includes still finds the
    // substring within the padded string — no trimming required.
    expect(resolveRoleSlug('  Code Reviewer  ')).toBe('lead');
  });

  // --- Fallback boundary ---
  it('empty string → backend (DEFAULT_SLUG)', () => {
    expect(resolveRoleSlug('')).toBe('backend');
  });

  it('"Quantum Bard" (completely unknown) → backend (DEFAULT_SLUG)', () => {
    expect(resolveRoleSlug('Quantum Bard')).toBe('backend');
  });
});
