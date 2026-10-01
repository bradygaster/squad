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
    // 5s was too tight: under full-parallelism CI load (~10k tests running
    // concurrently), `docker info`'s round-trip to the daemon can occasionally
    // exceed 5s purely from CPU contention, causing this check to time out
    // and silently SKIP the whole Docker-dependent suite instead of running
    // it — a false "pass" that masks real failures (see Aspire dashboard CI
    // investigation, #2123/#2132). 20s gives enough headroom to reliably
    // detect a genuinely-available daemon under the same load.
    execSync('docker info', { stdio: 'ignore', timeout: 20_000 });
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
