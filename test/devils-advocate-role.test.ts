import { describe, it, expect } from 'vitest';
import { getRoleById, listRoles } from '@bradygaster/squad-sdk/roles';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe("devils-advocate role", () => {
  it('is present in the role catalog', () => {
    const role = getRoleById('devils-advocate');
    expect(role).toBeDefined();
    expect(role!.title).toBe("Devil's Advocate");
    expect(role!.emoji).toBe('😈');
    expect(role!.category).toBe('quality');
  });

  it('has routing patterns for design-challenge tasks', () => {
    const role = getRoleById('devils-advocate');
    expect(role!.routingPatterns).toContain("devil's advocate");
    expect(role!.routingPatterns).toContain('devils advocate');
    expect(role!.routingPatterns).toContain('pre-mortem');
    expect(role!.routingPatterns).toContain('steelman');
    expect(role!.routingPatterns).toContain('counter-argument');
  });

  it('has design-challenge expertise (distinct from Fact Checker)', () => {
    const role = getRoleById('devils-advocate');
    const expertise = role!.expertise.join(' ').toLowerCase();
    expect(expertise).toContain('counter-argument');
    expect(expertise).toContain('pre-mortem');
    expect(expertise).toContain('assumption');
    // Should NOT claim factual-verification scope — that is Fact Checker
    expect(expertise).not.toContain('claim verification');
  });

  it('appears in listRoles()', () => {
    const all = listRoles();
    const ids = all.map(r => r.id);
    expect(ids).toContain('devils-advocate');
  });

  it('has boundaries that exclude factual verification (delegates to Fact Checker)', () => {
    const role = getRoleById('devils-advocate');
    expect(role!.boundaries.handles).toContain('Counter-argument');
    expect(role!.boundaries.doesNotHandle).toContain('Factual verification');
    expect(role!.boundaries.doesNotHandle).toContain('Fact Checker');
  });
});

describe("devils-advocate charter template", () => {
  const templatePath = path.join(
    process.cwd(),
    'packages',
    'squad-cli',
    'templates',
    'devils-advocate-charter.md',
  );

  it('template file exists', () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  it('explains how it differs from Fact Checker', () => {
    const content = readFileSync(templatePath, 'utf-8');
    expect(content).toContain('How I Differ From Fact Checker');
    expect(content).toContain('Fact Checker verifies');
    expect(content).toContain("Devil's Advocate challenges");
  });

  it('defines methodology (steelman, pre-mortem, alternatives)', () => {
    const content = readFileSync(templatePath, 'utf-8');
    expect(content).toContain('Steelman');
    expect(content).toContain('Pre-mortem');
    expect(content).toContain('Alternatives');
  });
});
