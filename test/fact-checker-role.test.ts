import { describe, it, expect } from 'vitest';
import { getRoleById, listRoles } from '@bradygaster/squad-sdk/roles';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('fact-checker role', () => {
  it('is present in the role catalog', () => {
    const role = getRoleById('fact-checker');
    expect(role).toBeDefined();
    expect(role!.title).toBe('Fact Checker');
    expect(role!.emoji).toBe('🔍');
    expect(role!.category).toBe('quality');
  });

  it('has routing patterns for fact-checking tasks', () => {
    const role = getRoleById('fact-checker');
    expect(role!.routingPatterns).toContain('fact-check');
    expect(role!.routingPatterns).toContain('verify');
    expect(role!.routingPatterns).toContain('hallucination');
    expect(role!.routingPatterns).toContain("devil's advocate");
  });

  it('has verification-focused expertise', () => {
    const role = getRoleById('fact-checker');
    const expertise = role!.expertise.join(' ').toLowerCase();
    expect(expertise).toContain('verification');
    expect(expertise).toContain('hallucination');
    expect(expertise).toContain('counter-hypothesis');
  });

  it('appears in listRoles()', () => {
    const all = listRoles();
    const ids = all.map(r => r.id);
    expect(ids).toContain('fact-checker');
  });

  it('has appropriate boundaries (reviews, does not implement)', () => {
    const role = getRoleById('fact-checker');
    expect(role!.boundaries.handles).toContain('verification');
    expect(role!.boundaries.doesNotHandle).toContain('Implementation');
  });
});

describe('fact-checker charter template', () => {
  const templatePath = path.join(
    process.cwd(),
    'packages',
    'squad-cli',
    'templates',
    'fact-checker-charter.md',
  );

  it('template file exists', () => {
    expect(existsSync(templatePath)).toBe(true);
  });

  it('contains verification methodology section', () => {
    const content = readFileSync(templatePath, 'utf-8');
    expect(content).toContain('## Verification Methodology');
    expect(content).toContain('## Confidence Ratings');
    expect(content).toContain('✅ Verified');
    expect(content).toContain('⚠️ Unverified');
    expect(content).toContain('❌ Contradicted');
  });

  it('defines when the agent is triggered', () => {
    const content = readFileSync(templatePath, 'utf-8');
    expect(content).toContain('## When I\'m Triggered');
    expect(content).toContain('fact-check');
  });
});
