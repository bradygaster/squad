/**
 * Machine capability checking — match issue needs:* labels to local machine.
 *
 * Ported from ralph-watch.ps1 `Test-MachineCapability`.
 * Reads `needs:*` labels from issues and compares against a local
 * capabilities list provided via:
 *   1. CLI flag: --capabilities gpu,browser,docker
 *   2. Config: watch.capabilities["machine-capabilities"].list
 *   3. Auto-detect: probe for common tools (nvidia-smi, playwright, docker)
 *
 * This is a utility module — not a WatchCapability.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface MachineCapabilityResult {
  canHandle: boolean;
  reason: string;
  missing?: string[];
}

export interface MachineCapabilityConfig {
  /** Explicit list of capabilities this machine has. */
  list?: string[];
  /** Whether to auto-detect capabilities (default: true). */
  autoDetect?: boolean;
}

/** Probes for common capabilities on the local machine. */
const CAPABILITY_PROBES: Record<string, () => Promise<boolean>> = {
  gpu: async () => {
    try {
      await execFileAsync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { timeout: 5_000 });
      return true;
    } catch { return false; }
  },
  browser: async () => {
    try {
      await execFileAsync('playwright', ['--version'], { timeout: 10_000 });
      return true;
    } catch { return false; }
  },
  docker: async () => {
    try {
      await execFileAsync('docker', ['info'], { timeout: 5_000 });
      return true;
    } catch { return false; }
  },
  node: async () => {
    try {
      await execFileAsync('node', ['--version'], { timeout: 5_000 });
      return true;
    } catch { return false; }
  },
  python: async () => {
    try {
      await execFileAsync('python3', ['--version'], { timeout: 5_000 });
      return true;
    } catch {
      try {
        await execFileAsync('python', ['--version'], { timeout: 5_000 });
        return true;
      } catch { return false; }
    }
  },
};

/** Detect capabilities available on this machine. */
export async function detectCapabilities(config?: MachineCapabilityConfig): Promise<string[]> {
  const caps = new Set<string>(config?.list ?? []);

  if (config?.autoDetect !== false) {
    const probes = Object.entries(CAPABILITY_PROBES).map(async ([name, probe]) => {
      if (await probe()) caps.add(name);
    });
    await Promise.all(probes);
  }

  return [...caps];
}

/**
 * Check if this machine can handle an issue based on its needs:* labels.
 */
export function checkMachineCapability(
  issueLabels: string[],
  machineCaps: string[],
): MachineCapabilityResult {
  const needsLabels = issueLabels
    .filter(l => l.startsWith('needs:'))
    .map(l => l.replace(/^needs:/, ''));

  if (needsLabels.length === 0) {
    return { canHandle: true, reason: 'No needs:* labels on issue' };
  }

  const capSet = new Set(machineCaps.map(c => c.toLowerCase()));
  const missing = needsLabels.filter(need => !capSet.has(need.toLowerCase()));

  if (missing.length === 0) {
    return { canHandle: true, reason: 'All required capabilities present' };
  }

  return {
    canHandle: false,
    reason: `Missing capabilities: ${missing.join(', ')}`,
    missing,
  };
}
