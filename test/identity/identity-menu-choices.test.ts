/**
 * Regression test: identity menu only handles valid choices.
 *
 * The create flow's interactive menu presents 2 options:
 *   (1) Create new app
 *   (2) Reuse from another repo
 * Any other non-empty input is treated as a custom app name.
 *
 * A previous version had an unreachable `choice === '3'` handler.
 * This test ensures no phantom menu option re-appears.
 *
 * @see packages/squad-cli/src/cli/commands/identity.ts — createOrReuseApp menu
 * @module test/identity/identity-menu-choices
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('identity menu choice validation', () => {
  const identityTsPath = join(
    process.cwd(),
    'packages',
    'squad-cli',
    'src',
    'cli',
    'commands',
    'identity.ts',
  );
  const content = readFileSync(identityTsPath, 'utf-8');

  it('does not contain a choice === "3" handler', () => {
    // There are only 2 menu options — a third choice handler is unreachable
    expect(content).not.toMatch(/choice\s*===\s*['"]3['"]/);
  });

  it('does not contain a choice === "4" or higher handler', () => {
    // Guard against future unreachable handlers being added
    expect(content).not.toMatch(/choice\s*===\s*['"][4-9]['"]/);
  });

  it('handles choice "1" (create new app — default)', () => {
    // The default path should check for choice '1' or empty
    expect(content).toMatch(/choice\s*!==\s*['"]1['"]/);
  });

  it('handles choice "2" (reuse from another repo)', () => {
    // Should have explicit handling for choice '2'
    expect(content).toMatch(/choice\s*===\s*['"]2['"]/);
  });

  it('menu only shows options (1) and (2)', () => {
    // Verify the menu text only offers 2 numbered options
    expect(content).toMatch(/\(1\)/);
    expect(content).toMatch(/\(2\)/);
    // No third numbered option in the menu display
    expect(content).not.toMatch(/\(3\).*(?:app|create|reuse|import)/i);
  });
});
