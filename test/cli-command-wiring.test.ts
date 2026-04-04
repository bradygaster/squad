/**
 * CLI Command Wiring Regression Test
 *
 * Verifies that every .ts command file in packages/squad-cli/src/cli/commands/
 * has a corresponding import in cli-entry.ts. Prevents the recurring
 * "unwired command" bug class (issues #224, #236, #237).
 *
 * Pattern adopted from PR #238 quality assessment.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const COMMANDS_DIR = join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli', 'commands');
const CLI_ENTRY = join(process.cwd(), 'packages', 'squad-cli', 'src', 'cli-entry.ts');

// All commands should now be wired — no known-unwired commands remaining.
const KNOWN_UNWIRED = new Set<string>([]);

describe('CLI command wiring regression (issues #224, #236, #237)', () => {
  const commandFiles = readdirSync(COMMANDS_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith('.test.ts'));

  // Also discover subdirectory commands (e.g., watch/index.ts)
  const commandDirs = readdirSync(COMMANDS_DIR)
    .filter(f => statSync(join(COMMANDS_DIR, f)).isDirectory() && existsSync(join(COMMANDS_DIR, f, 'index.ts')));

  const entrySource = readFileSync(CLI_ENTRY, 'utf-8');

  it('commands directory has files to check', () => {
    expect(commandFiles.length).toBeGreaterThan(0);
  });

  for (const file of commandFiles) {
    const stem = basename(file, '.ts');

    if (KNOWN_UNWIRED.has(stem)) {
      it(`commands/${stem}.ts is known-unwired (tracked)`, () => {
        // Document that this command exists but is not yet wired.
        // When the command IS wired, this test will still pass —
        // remove from KNOWN_UNWIRED at that point.
        expect(true).toBe(true);
      });
      continue;
    }

    it(`commands/${stem}.ts is imported in cli-entry.ts`, () => {
      const importPattern = new RegExp(
        `['"]\\./cli/commands/${stem}\\.js['"]`,
      );
      expect(
        entrySource,
        `Command file "${stem}.ts" exists but is never imported in cli-entry.ts. ` +
        `This is the "unwired command" bug — the command code exists but users can't reach it.`,
      ).toMatch(importPattern);
    });
  }

  // Check subdirectory commands (e.g., watch/index.ts) are wired too
  for (const dir of commandDirs) {
    const stem = `${dir}/index`;
    it(`commands/${stem}.ts is imported in cli-entry.ts`, () => {
      const importPattern = new RegExp(
        `['"]\\./cli/commands/${dir}/index\\.js['"]`,
      );
      expect(
        entrySource,
        `Command directory "${dir}/" has index.ts but is never imported in cli-entry.ts.`,
      ).toMatch(importPattern);
    });
  }

  it('all command imports in cli-entry.ts point to existing files', () => {
    const importRegex = /import\(['"]\.\/cli\/commands\/([^'"]+)\.js['"]\)/g;
    let match;
    const importedModules: string[] = [];

    while ((match = importRegex.exec(entrySource)) !== null) {
      importedModules.push(match[1]!);
    }

    expect(importedModules.length).toBeGreaterThan(0);

    const existingFiles = new Set([
      ...commandFiles.map(f => basename(f, '.ts')),
      ...commandDirs.map(d => `${d}/index`),
      // Also include non-index .ts files inside subdirectories (e.g., watch/health.ts)
      ...commandDirs.flatMap(d => {
        try {
          return readdirSync(join(COMMANDS_DIR, d))
            .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts') && !f.endsWith('.test.ts') && f !== 'index.ts')
            .map(f => `${d}/${basename(f, '.ts')}`);
        } catch { return []; }
      }),
    ]);
    for (const mod of importedModules) {
      expect(
        existingFiles.has(mod),
        `cli-entry.ts imports "./cli/commands/${mod}.js" but no matching source file exists in commands/`,
      ).toBe(true);
    }
  });

  it('KNOWN_UNWIRED list does not contain commands that are actually wired', () => {
    for (const stem of KNOWN_UNWIRED) {
      const importPattern = new RegExp(
        `['"]\\./cli/commands/${stem}\\.js['"]`,
      );
      // If this fails, the command was wired — remove it from KNOWN_UNWIRED
      if (importPattern.test(entrySource)) {
        expect.fail(
          `"${stem}" is in KNOWN_UNWIRED but IS imported in cli-entry.ts. Remove it from KNOWN_UNWIRED.`,
        );
      }
    }
  });
});
