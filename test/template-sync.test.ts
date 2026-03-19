/**
 * Template Sync & Casting Parity Tests (Issue #459)
 *
 * Prevents the casting universe mismatch from recurring by verifying:
 * - Universe count in squad.agent.md matches casting-policy.json
 * - All 3 copies of squad.agent.md agree on universe count
 * - Referenced casting-reference.md files exist
 * - casting-policy.json is identical across template dirs
 * - Every allowlisted universe has a capacity entry and vice versa
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const SQUAD_TEMPLATES = join(ROOT, '.squad-templates');
const TEMPLATES = join(ROOT, 'templates');
const GITHUB_AGENTS = join(ROOT, '.github', 'agents');

/** Extract the "N universes available" number from a squad.agent.md file. */
function extractUniverseCount(filePath: string): number {
  const content = readFileSync(filePath, 'utf-8');
  const match = content.match(/(\d+)\s+universes?\s+available/i);
  if (!match) throw new Error(`No "N universes available" found in ${filePath}`);
  return parseInt(match[1], 10);
}

describe('Template sync & casting parity (issue #459)', () => {
  // --- Test 1: Universe count in squad.agent.md matches casting-policy.json ---

  describe('universe count matches casting-policy.json', () => {
    const policy = JSON.parse(readFileSync(join(SQUAD_TEMPLATES, 'casting-policy.json'), 'utf-8'));
    const policyCount = policy.allowlist_universes.length;

    it('.squad-templates/squad.agent.md matches policy', () => {
      const claimed = extractUniverseCount(join(SQUAD_TEMPLATES, 'squad.agent.md'));
      expect(claimed).toBe(policyCount);
    });

    it('templates/squad.agent.md matches policy', () => {
      const claimed = extractUniverseCount(join(TEMPLATES, 'squad.agent.md'));
      expect(claimed).toBe(policyCount);
    });

    it('.github/agents/squad.agent.md matches policy', () => {
      const claimed = extractUniverseCount(join(GITHUB_AGENTS, 'squad.agent.md'));
      expect(claimed).toBe(policyCount);
    });
  });

  // --- Test 2: All 3 copies agree on universe count ---

  it('all 3 squad.agent.md copies claim the same universe count', () => {
    const counts = [
      extractUniverseCount(join(SQUAD_TEMPLATES, 'squad.agent.md')),
      extractUniverseCount(join(TEMPLATES, 'squad.agent.md')),
      extractUniverseCount(join(GITHUB_AGENTS, 'squad.agent.md')),
    ];
    expect(counts[0]).toBe(counts[1]);
    expect(counts[1]).toBe(counts[2]);
  });

  // --- Test 3: casting-reference.md exists where referenced ---

  describe('casting-reference.md exists in template dirs', () => {
    it('.squad-templates/casting-reference.md exists', () => {
      expect(existsSync(join(SQUAD_TEMPLATES, 'casting-reference.md'))).toBe(true);
    });

    it('templates/casting-reference.md exists', () => {
      expect(existsSync(join(TEMPLATES, 'casting-reference.md'))).toBe(true);
    });
  });

  // --- Test 4: casting-policy.json is identical across template dirs ---

  it('casting-policy.json is identical in .squad-templates and templates', () => {
    const a = JSON.parse(readFileSync(join(SQUAD_TEMPLATES, 'casting-policy.json'), 'utf-8'));
    const b = JSON.parse(readFileSync(join(TEMPLATES, 'casting-policy.json'), 'utf-8'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  // --- Test 5: Every allowlisted universe has a capacity entry and vice versa ---

  it('allowlist_universes and universe_capacity are in sync', () => {
    const policy = JSON.parse(readFileSync(join(SQUAD_TEMPLATES, 'casting-policy.json'), 'utf-8'));
    const allowlist: string[] = policy.allowlist_universes;
    const capacityKeys = Object.keys(policy.universe_capacity);

    // Every allowlisted universe has a capacity entry
    for (const universe of allowlist) {
      expect(capacityKeys).toContain(universe);
    }
    // No orphaned capacity entries
    for (const key of capacityKeys) {
      expect(allowlist).toContain(key);
    }
  });
});
