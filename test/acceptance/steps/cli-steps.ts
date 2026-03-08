import { expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TerminalHarness } from '../harness.js';
import { StepDefinitions, registerStep } from '../support/runner.js';

/**
 * CLI step definitions for Gherkin acceptance tests.
 */
export function registerCLISteps(registry: StepDefinitions): void {
  // --- Given steps ---

  registerStep(
    'Given',
    /the current directory has a "(.+)" directory/,
    async (stepText, context) => {
      const match = stepText.match(/the current directory has a "(.+)" directory/);
      if (!match) throw new Error('Pattern match failed');

      const dirName = match[1];
      const dirPath = join(process.cwd(), dirName);

      if (!existsSync(dirPath)) {
        throw new Error(`Directory ${dirPath} does not exist`);
      }

      context.squadDirExists = true;
    },
    registry
  );

  registerStep(
    'Given',
    /a directory without a "\.squad" directory/,
    async (_stepText, context) => {
      const tempDir = mkdtempSync(join(tmpdir(), 'squad-e2e-'));
      context.tempDir = tempDir;
    },
    registry
  );

  // --- When steps ---

  registerStep(
    'When',
    /I run "(.+)" in the temp directory/,
    async (stepText, context) => {
      const match = stepText.match(/I run "(.+)" in the temp directory/);
      if (!match) throw new Error('Pattern match failed');

      const command = match[1];
      const args = command.replace(/^squad\s*/, '').split(/\s+/).filter(Boolean);
      const cwd = context.tempDir as string;

      const harness = await TerminalHarness.spawnWithArgs(args, { cwd });

      try {
        await harness.waitForExit(15000);
      } catch {
        // Timeout is okay
      }

      context.harness = harness;
      context.output = harness.getOutput();
      context.exitCode = harness.getExitCode();
    },
    registry
  );

  registerStep(
    'When',
    /I run "(.+)"/,
    async (stepText, context) => {
      const match = stepText.match(/I run "(.+)"/);
      if (!match) throw new Error('Pattern match failed');

      const command = match[1];
      const args = command.replace(/^squad\s*/, '').split(/\s+/).filter(Boolean);

      const harness = await TerminalHarness.spawnWithArgs(args);

      try {
        await harness.waitForExit(15000);
      } catch {
        // Timeout is okay
      }

      context.harness = harness;
      context.output = harness.getOutput();
      context.exitCode = harness.getExitCode();
    },
    registry
  );

  // --- Then steps ---

  registerStep(
    'Then',
    /the output does not contain "(.+)"/,
    async (stepText, context) => {
      const match = stepText.match(/the output does not contain "(.+)"/);
      if (!match) throw new Error('Pattern match failed');

      const unexpectedText = match[1];
      const output = context.output as string;

      expect(output).not.toContain(unexpectedText);
    },
    registry
  );

  registerStep(
    'Then',
    /the output contains "(.+)"/,
    async (stepText, context) => {
      const match = stepText.match(/the output contains "(.+)"/);
      if (!match) throw new Error('Pattern match failed');

      const expectedText = match[1];
      const output = context.output as string;

      expect(output).toContain(expectedText);
    },
    registry
  );

  registerStep(
    'Then',
    /the output matches pattern "(.+)"/,
    async (stepText, context) => {
      const match = stepText.match(/the output matches pattern "(.+)"/);
      if (!match) throw new Error('Pattern match failed');

      const pattern = match[1];
      const output = context.output as string;

      expect(output).toMatch(new RegExp(pattern));
    },
    registry
  );

  registerStep(
    'Then',
    /the exit code is (\d+)/,
    async (stepText, context) => {
      const match = stepText.match(/the exit code is (\d+)/);
      if (!match) throw new Error('Pattern match failed');

      const expectedCode = parseInt(match[1], 10);
      const exitCode = context.exitCode as number | null;

      expect(exitCode).toBe(expectedCode);
    },
    registry
  );
}
