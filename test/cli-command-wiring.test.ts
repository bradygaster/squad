/**
 * CLI Command Wiring Regression Test
 *
 * Ensures every command file in packages/squad-cli/src/cli/commands/
 * has a corresponding import in cli-entry.ts. Prevents the class of bug
 * where commands are fully implemented but never wired into the CLI router.
 *
 * See: #224 (upstream), #236 (watch), #237 (6 more unwired commands)
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const CLI_PKG = join(__dirname, '..', 'packages', 'squad-cli', 'src');
const COMMANDS_DIR = join(CLI_PKG, 'cli', 'commands');
const ENTRY_FILE = join(CLI_PKG, 'cli-entry.ts');

// Known-unwired commands tracked under issue #237.
// These are helper modules (not direct CLI commands) or have no implementation file.
// Remove entries from this set as they get wired — the test will start
// failing for them, which is intentional (regression guard).
const KNOWN_UNWIRED = new Set([
  'copilot-bridge', // helper class used by rc.ts, not a direct CLI command
  'init-remote',    // helper function used by link.ts, not a direct CLI command
  'rc-tunnel',      // helper module used by rc.ts, not a direct CLI command
]);

describe('CLI command wiring', () => {
  it('every command file in commands/ is imported by cli-entry.ts (excluding known-unwired #237)', () => {
    const commandFiles = readdirSync(COMMANDS_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.startsWith('_'))
      .map((f) => f.replace(/\.ts$/, ''));

    const entrySource = readFileSync(ENTRY_FILE, 'utf-8');

    const unwired: string[] = [];
    for (const cmd of commandFiles) {
      if (KNOWN_UNWIRED.has(cmd)) continue; // tracked separately in #237
      const importPattern = `cli/commands/${cmd}.js`;
      if (!entrySource.includes(importPattern)) {
        unwired.push(cmd);
      }
    }

    expect(unwired, `NEW commands implemented but not wired in cli-entry.ts: ${unwired.join(', ')}`).toEqual([]);
  });

  it('no new placeholder "pending" routing blocks (loop and hire are known #237)', () => {
    const entrySource = readFileSync(ENTRY_FILE, 'utf-8');

    const placeholderLines = entrySource
      .split('\n')
      .filter((line) => /implementation pending/i.test(line))
      .map((line) => line.trim());

    // loop and hire are known placeholders (tracked in #237)
    const knownPlaceholders = ['loop', 'hire'];
    const newPlaceholders = placeholderLines.filter(
      (line) => !knownPlaceholders.some((cmd) => line.toLowerCase().includes(cmd)),
    );

    expect(
      newPlaceholders,
      `NEW placeholder routing blocks found:\n${newPlaceholders.join('\n')}`,
    ).toEqual([]);
  });

  it('known-unwired set only contains commands that are actually unwired', () => {
    // If someone wires a command from KNOWN_UNWIRED, this test fails to
    // remind them to remove it from the set (shrinks the allowlist over time).
    const entrySource = readFileSync(ENTRY_FILE, 'utf-8');

    const nowWired: string[] = [];
    for (const cmd of KNOWN_UNWIRED) {
      if (entrySource.includes(`cli/commands/${cmd}.js`)) {
        nowWired.push(cmd);
      }
    }

    expect(
      nowWired,
      `Commands in KNOWN_UNWIRED that are now wired — remove from allowlist: ${nowWired.join(', ')}`,
    ).toEqual([]);
  });
});
