/**
 * Integration tests for CastingEngine wiring into CLI init flow (Issue #342)
 */

import { describe, it, expect } from 'vitest';
import { augmentWithCastingEngine } from '../packages/squad-cli/src/cli/core/cast.js';
import type { CastProposal } from '../packages/squad-cli/src/cli/core/cast.js';

describe('augmentWithCastingEngine', () => {
  it('should augment proposal when universe is "The Usual Suspects"', () => {
    const proposal: CastProposal = {
      members: [
        { name: 'SomeArbitraryName1', role: 'Lead', scope: 'Architecture, decisions', emoji: '🏗️' },
        { name: 'SomeArbitraryName2', role: 'Developer', scope: 'Backend, APIs', emoji: '🔧' },
        { name: 'SomeArbitraryName3', role: 'Tester', scope: 'QA, testing', emoji: '🧪' },
      ],
      universe: 'The Usual Suspects',
      projectDescription: 'A test project',
    };

    const augmented = augmentWithCastingEngine(proposal);

    // Names should be replaced with curated names from the engine
    expect(augmented.members[0].name).not.toBe('SomeArbitraryName1');
    expect(augmented.members[1].name).not.toBe('SomeArbitraryName2');
    expect(augmented.members[2].name).not.toBe('SomeArbitraryName3');

    // Names should come from usual-suspects pool
    const names = augmented.members.map(m => m.name);
    const usualSuspectsNames = ['Keyser', 'McManus', 'Fenster', 'Verbal', 'Hockney', 'Redfoot', 'Edie', 'Kobayashi'];
    for (const name of names) {
      expect(usualSuspectsNames).toContain(name);
    }

    // Should preserve original roles and scopes
    expect(augmented.members[0].role).toBe('Lead');
    expect(augmented.members[1].role).toBe('Developer');
    expect(augmented.members[2].role).toBe('Tester');

    // Should have engine personality and backstory attached
    const member0 = augmented.members[0] as any;
    expect(member0._personality).toBeTruthy();
    expect(member0._backstory).toBeTruthy();
  });

  it('should augment proposal when universe is "Ocean\'s Eleven"', () => {
    const proposal: CastProposal = {
      members: [
        { name: 'ArbitraryLead', role: 'Lead', scope: 'Architecture', emoji: '🏗️' },
        { name: 'ArbitraryDev', role: 'Developer', scope: 'Coding', emoji: '🔧' },
      ],
      universe: "Ocean's Eleven",
      projectDescription: 'A heist project',
    };

    const augmented = augmentWithCastingEngine(proposal);

    const names = augmented.members.map(m => m.name);
    const oceansNames = ['Danny', 'Rusty', 'Linus', 'Basher', 'Livingston', 'Saul', 'Yen', 'Virgil', 'Turk', 'Reuben'];
    for (const name of names) {
      expect(oceansNames).toContain(name);
    }
  });

  it('should NOT augment when universe is unrecognized', () => {
    const proposal: CastProposal = {
      members: [
        { name: 'Neo', role: 'Lead', scope: 'Architecture', emoji: '🏗️' },
        { name: 'Trinity', role: 'Developer', scope: 'Coding', emoji: '🔧' },
      ],
      universe: 'The Matrix',
      projectDescription: 'A matrix project',
    };

    const augmented = augmentWithCastingEngine(proposal);

    // Should preserve LLM names when universe not recognized
    expect(augmented.members[0].name).toBe('Neo');
    expect(augmented.members[1].name).toBe('Trinity');
  });

  it('should handle case-insensitive universe matching', () => {
    const proposal: CastProposal = {
      members: [
        { name: 'X', role: 'Lead', scope: 'Arch', emoji: '🏗️' },
      ],
      universe: 'the usual suspects', // lowercase
      projectDescription: 'Test',
    };

    const augmented = augmentWithCastingEngine(proposal);

    expect(augmented.members[0].name).not.toBe('X');
  });

  it('should gracefully handle casting failures', () => {
    const proposal: CastProposal = {
      members: [
        { name: 'A', role: 'Lead', scope: 'X', emoji: '🏗️' },
        { name: 'B', role: 'Developer', scope: 'Y', emoji: '🔧' },
        { name: 'C', role: 'Tester', scope: 'Z', emoji: '🧪' },
        { name: 'D', role: 'Security', scope: 'W', emoji: '🔒' },
        { name: 'E', role: 'DevOps', scope: 'V', emoji: '⚙️' },
        { name: 'F', role: 'Designer', scope: 'U', emoji: '⚛️' },
        { name: 'G', role: 'Reviewer', scope: 'T', emoji: '👤' },
        { name: 'H', role: 'Prompt Engineer', scope: 'S', emoji: '👤' },
        { name: 'I', role: 'Scribe', scope: 'R', emoji: '📝' },
        { name: 'J', role: 'Extra1', scope: 'Q', emoji: '👤' },
        { name: 'K', role: 'Extra2', scope: 'P', emoji: '👤' },
      ],
      universe: 'The Usual Suspects', // only has 8 characters
      projectDescription: 'Too many roles',
    };

    // Should fall back to LLM names if engine can't cast
    const augmented = augmentWithCastingEngine(proposal);
    expect(augmented.members.length).toBe(11);
    // If it fails, it should preserve original names
  });
});
