/**
 * Shared test helpers for Docker-related skip guards and environment detection.
 *
 * Provides reusable functions for detecting Docker availability
 * and determining whether Docker-dependent test suites should run.
 */

import { execSync } from 'node:child_process';

/**
 * Check if Docker is usable on this machine.
 * Returns true if `docker info` succeeds within 5 seconds.
 */
export function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine skip reason for Docker-dependent tests.
 * Returns null if tests should run, or a string reason to skip.
 */
export function dockerSkipReason(): string | null {
  if (process.env['SKIP_DOCKER_TESTS'] === '1') {
    return 'SKIP_DOCKER_TESTS=1';
  }
  if (!isDockerAvailable()) {
    return 'Docker not available';
  }
  return null;
}
