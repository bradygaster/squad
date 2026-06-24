/**
 * Acceptance test runner for Squad CLI.
 * Runs Gherkin feature files using vitest.
 */

import { afterEach } from 'vitest';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { createRegistry, runFeature } from './support/runner.js';
import { registerCLISteps } from './steps/cli-steps.js';
import { TerminalHarness } from './harness.js';

// Create step definition registry
const registry = createRegistry();
registerCLISteps(registry);

// Cleanup harnesses and temp dirs after each test
afterEach(async (context) => {
  const harness = (context as Record<string, unknown>).harness as TerminalHarness | undefined;
  if (harness) {
    await harness.close();
  }
});

// Run all feature files
const featuresDir = join(__dirname, 'features');

// Original scenarios (7 tests)
runFeature(join(featuresDir, 'version.feature'), registry);
runFeature(join(featuresDir, 'help.feature'), registry);
runFeature(join(featuresDir, 'status.feature'), registry);
runFeature(join(featuresDir, 'error-handling.feature'), registry);
runFeature(join(featuresDir, 'doctor.feature'), registry);

// New expanded scenarios (13 tests)
runFeature(join(featuresDir, 'init-command.feature'), registry);
runFeature(join(featuresDir, 'status-extended.feature'), registry);
runFeature(join(featuresDir, 'doctor-extended.feature'), registry);
runFeature(join(featuresDir, 'help-comprehensive.feature'), registry);
runFeature(join(featuresDir, 'error-paths.feature'), registry);
runFeature(join(featuresDir, 'exit-codes.feature'), registry);

// Consult and extract command tests
runFeature(join(featuresDir, 'consult-command.feature'), registry);
runFeature(join(featuresDir, 'extract-command.feature'), registry);
runFeature(join(featuresDir, 'execution-config.feature'), registry);

// Subcommand --help intercept (#1201)
runFeature(join(featuresDir, 'subcommand-help.feature'), registry);
