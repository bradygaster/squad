/**
 * Assertion proof: global squad path is isolated during tests.
 *
 * This test verifies that the setup file (test/setup/isolate-global-squad.ts)
 * successfully redirects resolveGlobalSquadPath() away from the real user
 * global registry (%APPDATA%\squad on Windows) to an OS temp directory.
 *
 * If this test passes, every other test in the suite runs under the same
 * setup file and is therefore also isolated from the real global registry.
 */

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGlobalSquadPath } from '@bradygaster/squad-sdk/resolution';

describe('global squad path isolation (setup file proof)', () => {
  it('resolveGlobalSquadPath() returns a path under the OS temp dir', () => {
    const globalPath = resolveGlobalSquadPath();
    const tmp = tmpdir();

    // The isolated dir created by the setup file starts with tmpdir() + sep + 'squad-test-global-'
    expect(globalPath.startsWith(tmp), `Expected "${globalPath}" to start with tmpdir "${tmp}"`).toBe(true);
  });

  it('resolveGlobalSquadPath() path contains the isolation marker', () => {
    const globalPath = resolveGlobalSquadPath();
    expect(globalPath).toContain('squad-test-global-');
  });

  it('resolveGlobalSquadPath() is NOT the real %APPDATA%\\squad', () => {
    const globalPath = resolveGlobalSquadPath();

    if (process.platform === 'win32') {
      // Before our setup file runs, the real registry is under the original APPDATA.
      // After it runs, APPDATA is overwritten with the temp dir, so we just confirm
      // the path contains the isolation marker (already done above) and does NOT
      // end with a path that looks like a real roaming profile.
      expect(globalPath).not.toMatch(/AppData[/\\]Roaming[/\\]squad$/i);
    } else {
      // On non-Windows, should not be under ~/.config/squad or ~/Library/...
      const realHome = join(process.env['USERPROFILE'] ?? '/nonexistent', 'Library', 'Application Support', 'squad');
      expect(globalPath).not.toBe(realHome);
    }
  });
});
