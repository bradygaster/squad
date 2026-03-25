/**
 * Machine Capability Discovery & Label-Based Routing
 *
 * Enables Ralph to filter issues by machine capabilities.
 * Issues with `needs:*` labels are only processed if the
 * local machine has those capabilities.
 *
 * @see https://github.com/bradygaster/squad/issues/514
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Machine capability manifest */
export interface MachineCapabilities {
  machine: string;
  capabilities: string[];
  missing: string[];
  lastUpdated: string;
}

/** Well-known capability identifiers */
export const KNOWN_CAPABILITIES = [
  'browser',        // Playwright/browser automation
  'gpu',            // NVIDIA GPU available
  'personal-gh',    // Personal GitHub account
  'emu-gh',         // Enterprise Managed User account
  'azure-cli',      // Azure CLI authenticated
  'docker',         // Docker daemon running
  'onedrive',       // OneDrive sync available
  'teams-mcp',      // Teams MCP tools
] as const;

export type KnownCapability = typeof KNOWN_CAPABILITIES[number];

/** Prefix for capability requirement labels */
const NEEDS_PREFIX = 'needs:';

/**
 * Load machine capabilities from the standard location.
 * Checks (in order):
 *   1. `.squad/machine-capabilities.json` in the team root
 *   2. `~/.squad/machine-capabilities.json` in the user home
 *
 * Returns null if no capabilities file exists (all issues pass through).
 */
export async function loadCapabilities(
  teamRoot?: string
): Promise<MachineCapabilities | null> {
  const candidates: string[] = [];

  if (teamRoot) {
    candidates.push(path.join(teamRoot, '.squad', 'machine-capabilities.json'));
  }
  candidates.push(path.join(os.homedir(), '.squad', 'machine-capabilities.json'));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const raw = await readFile(candidate, 'utf8');
        return JSON.parse(raw) as MachineCapabilities;
      } catch {
        // Malformed file — skip
      }
    }
  }

  return null;
}

/**
 * Extract `needs:*` requirements from issue labels.
 *
 * @example
 *   extractNeeds(['bug', 'needs:gpu', 'needs:browser', 'squad:picard'])
 *   // → ['gpu', 'browser']
 */
export function extractNeeds(labels: string[]): string[] {
  return labels
    .filter(l => l.startsWith(NEEDS_PREFIX))
    .map(l => l.slice(NEEDS_PREFIX.length));
}

/**
 * Check if the machine can handle an issue based on `needs:*` labels.
 *
 * Returns `{ canHandle: true }` if:
 *   - The issue has no `needs:*` labels (any machine can handle it)
 *   - All `needs:*` requirements are in the machine's capabilities
 *
 * Returns `{ canHandle: false, missing: [...] }` if any are missing.
 */
export function canHandleIssue(
  issueLabels: string[],
  capabilities: MachineCapabilities | null
): { canHandle: true } | { canHandle: false; missing: string[] } {
  const needs = extractNeeds(issueLabels);

  // No requirements — any machine can handle
  if (needs.length === 0) {
    return { canHandle: true };
  }

  // No capabilities file — pass through (opt-in system)
  if (!capabilities) {
    return { canHandle: true };
  }

  const capSet = new Set(capabilities.capabilities);
  const missing = needs.filter(n => !capSet.has(n));

  if (missing.length === 0) {
    return { canHandle: true };
  }

  return { canHandle: false, missing };
}

/**
 * Filter issues to only those this machine can handle.
 * Issues without `needs:*` labels always pass through.
 */
export function filterByCapabilities<T extends { labels: { name: string }[] }>(
  issues: T[],
  capabilities: MachineCapabilities | null
): { handled: T[]; skipped: { issue: T; missing: string[] }[] } {
  const handled: T[] = [];
  const skipped: { issue: T; missing: string[] }[] = [];

  for (const issue of issues) {
    const labelNames = issue.labels.map(l => l.name);
    const result = canHandleIssue(labelNames, capabilities);

    if (result.canHandle) {
      handled.push(issue);
    } else {
      skipped.push({ issue, missing: result.missing });
    }
  }

  return { handled, skipped };
}