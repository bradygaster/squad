/**
 * Tests for the viability gate — v008 quality-first philosophy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkViability } from '../../packages/squad-sdk/src/repo-native/viability-check.js';
import type { SquadExportContext, SquadMemberSummary } from '../../packages/squad-sdk/src/repo-native/types.js';

function makeMember(slug: string): SquadMemberSummary {
  return {
    slug,
    displayName: slug.charAt(0).toUpperCase() + slug.slice(1),
    role: 'Specialist',
    charterPath: `.squad/agents/${slug}/charter.md`,
    charterSummary: 'Does things.',
    inlineMode: 'full-summary',
  };
}

function makeContext(memberCount: number, ruleCount: number): SquadExportContext {
  const members = Array.from({ length: memberCount }, (_, i) => makeMember(`agent-${i}`));
  const rules = Array.from({ length: ruleCount }, (_, i) => ({
    workType: `work-type-${i}`,
    routeTo: members[i % memberCount]!.slug,
  }));

  return {
    repoRoot: '/tmp/test',
    squadRoot: '/tmp/test/.squad',
    outputPath: '.github/agents/squad.md',
    generatedAt: new Date().toISOString(),
    coordinator: {
      displayName: 'Squad',
      description: 'Test coordinator',
      tools: '*',
      skills: [],
    },
    team: {
      name: 'Test Squad',
      mission: 'Test mission',
      members,
    },
    routing: {
      rules,
      principles: [],
    },
    ceremonies: [],
    memoryBootstrap: { steps: [] },
    dispatch: { protocol: ['Step 1', 'Step 2'] },
    sourceFiles: [],
  };
}

describe('viability gate', () => {
  it('passes for small squads', () => {
    const ctx = makeContext(5, 10);
    const result = checkViability(ctx);
    assert.equal(result.viable, true);
    assert.equal(result.issues.length, 0);
  });

  it('warns for large squads (>25 agents)', () => {
    const ctx = makeContext(30, 30);
    const result = checkViability(ctx);
    assert.equal(result.viable, true);
    const warns = result.issues.filter(i => i.severity === 'warn');
    assert.ok(warns.length > 0);
    assert.ok(warns.some(w => w.code === 'AGENTS_LARGE'));
  });

  it('errors for very large squads (>50 agents)', () => {
    const ctx = makeContext(55, 55);
    const result = checkViability(ctx);
    assert.equal(result.viable, false);
    const errors = result.issues.filter(i => i.severity === 'error');
    assert.ok(errors.some(e => e.code === 'AGENTS_TOO_MANY'));
    assert.ok(result.summary.includes('--force'));
  });

  it('passes with --force even when viability fails', () => {
    const ctx = makeContext(55, 110);
    const result = checkViability(ctx, { force: true });
    assert.equal(result.viable, true);
    // Still reports the issues
    assert.ok(result.issues.length > 0);
  });

  it('errors for excessive routing rules (>100)', () => {
    const ctx = makeContext(10, 110);
    const result = checkViability(ctx);
    const errors = result.issues.filter(i => i.severity === 'error');
    assert.ok(errors.some(e => e.code === 'RULES_TOO_MANY'));
  });

  it('respects configurable charLimit', () => {
    // At 60K limit, thresholds double — 55 agents should only warn, not error
    const ctx = makeContext(55, 55);
    const result = checkViability(ctx, { charLimit: 60_000 });
    const errors = result.issues.filter(i => i.severity === 'error');
    assert.ok(!errors.some(e => e.code === 'AGENTS_TOO_MANY'));
  });

  it('includes complexity score', () => {
    const ctx = makeContext(5, 5);
    const result = checkViability(ctx);
    assert.ok(typeof result.complexityScore === 'number');
    assert.ok(result.complexityScore >= 0 && result.complexityScore <= 100);
  });
});
